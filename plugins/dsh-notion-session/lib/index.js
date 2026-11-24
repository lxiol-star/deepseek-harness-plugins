import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { buildContinuationPrompt, clipText, renderSession } from './render.js'

const execFileAsync = promisify(execFile)
const PACKAGE_DIR = dirname(dirname(fileURLToPath(import.meta.url)))
const SCRIPT = join(PACKAGE_DIR, 'scripts', 'notion_session.py')
const API_PATH = '/api/notion-session'
const STATES = new Set(['active', 'archived', 'hidden'])
const FILTERS = new Set(['all', ...STATES])
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/
// Legacy wiki-sessions slugs contain CJK and full-width punctuation, so slug
// validation is Unicode-aware. It is a Notion lookup key, never a file path.
const SLUG_FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\\]/

export const name = 'dsh-notion-session'
export const inject = ['sessionController', 'sessionQuery', 'connection', 'agents', 'skills']

const DEFAULTS = Object.freeze({
  databaseId: 'faa56226-d71c-4b2c-bb4a-859bf8381f4e',
  dataSourceId: 'a5af25e2-3146-49e4-9bc2-c2ae31513b36',
  python: process.platform === 'win32' ? 'python' : '/usr/bin/python3',
  ntnPath: '',
  autoSync: true,
  syncIntervalSeconds: 300,
  listLimit: 20,
})

function configIssue(path, message) { return { path: [path], message } }

/** Standard Schema config: no runtime dependency on a schema package. */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-notion-session',
    validate(input) {
      const value = input === undefined || input === null ? {} : input
      if (typeof value !== 'object' || Array.isArray(value)) return { issues: [configIssue('config', 'must be an object')] }
      const issues = []
      const output = { ...DEFAULTS }
      for (const key of ['databaseId', 'dataSourceId', 'python', 'ntnPath']) {
        if (value[key] !== undefined && typeof value[key] !== 'string') issues.push(configIssue(key, 'must be a string'))
        else if (value[key] !== undefined) output[key] = value[key].trim()
      }
      if (!output.databaseId || !output.dataSourceId || !output.python) issues.push(configIssue('databaseId', 'databaseId, dataSourceId and python must not be empty'))
      if (value.autoSync !== undefined && typeof value.autoSync !== 'boolean') issues.push(configIssue('autoSync', 'must be a boolean'))
      else if (value.autoSync !== undefined) output.autoSync = value.autoSync
      for (const [key, min, max] of [['syncIntervalSeconds', 30, 86400], ['listLimit', 1, 100]]) {
        if (value[key] !== undefined && (!Number.isInteger(value[key]) || value[key] < min || value[key] > max)) issues.push(configIssue(key, `must be an integer from ${min} to ${max}`))
        else if (value[key] !== undefined) output[key] = value[key]
      }
      return issues.length ? { issues } : { value: output }
    },
  },
}

export class NotionSessionError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'NotionSessionError'
    this.code = code
    this.details = details
  }
}

function describeError(error) {
  if (error instanceof NotionSessionError) return error
  const code = error?.code === 4 ? 'SECRET_BLOCKED' : error?.code === 3 ? 'AUTH_REQUIRED' : 'OPERATION_FAILED'
  const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
  const message = clipText(stderr || error?.message || String(error), 500)
  return new NotionSessionError(code, message || 'Notion session operation failed')
}

function requireId(value, field = 'sessionId') {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new NotionSessionError('INVALID_INPUT', `${field} is invalid`)
  return value
}

function requireSlug(value) {
  // Legacy wiki-sessions pages use `raw/sessions/...`; new DSH pages use
  // `dsh/<session-id>`. Both must stay readable and continuable.
  if (typeof value !== 'string' || value.length === 0 || value.length > 500) {
    throw new NotionSessionError('INVALID_INPUT', 'slug must be a safe Notion record slug')
  }
  const segments = value.split('/')
  const invalid = segments.length > 12 || segments.some(segment =>
    segment.length === 0 || segment.length > 200 || segment === '.' || segment === '..'
    || segment.trim() !== segment || SLUG_FORBIDDEN.test(segment))
  if (invalid) throw new NotionSessionError('INVALID_INPUT', 'slug must contain safe non-empty path segments')
  return value
}

function stableUuid(kind, slug) {
  const bytes = createHash('sha256').update(`dsh-notion-session/v1:${kind}:${slug}`).digest()
  const hex = bytes.subarray(0, 16).toString('hex').split('')
  hex[12] = '5'
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export class NotionSessionService {
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
    this.cache = null
    this.lastSync = null
    this.syncError = null
    this.syncWarnings = []
    this.syncPromise = null
    this.resumeLocks = new Map()
    this.archiveLocks = new Map()
    this.duplicates = []
    this.mutationEpoch = 0
    this.disposed = false
  }

  async cli(args, timeout = 180_000) {
    const globalArgs = ['--database-id', this.config.databaseId, '--data-source-id', this.config.dataSourceId]
    if (this.config.ntnPath) globalArgs.push('--ntn', this.config.ntnPath)
    try {
      const env = { ...process.env, PYTHONUNBUFFERED: '1' }
      // ntn keychain is the sole credential owner; ambient overrides must not
      // silently select another token, workspace or API destination.
      delete env.NOTION_API_TOKEN
      delete env.NOTION_API_BASE_URL
      delete env.NOTION_WORKSPACE_ID
      const { stdout } = await execFileAsync(this.config.python, [SCRIPT, ...globalArgs, ...args], {
        timeout,
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
        env,
      })
      return JSON.parse(stdout)
    } catch (error) {
      if (error instanceof SyntaxError) throw new NotionSessionError('INVALID_CLI_OUTPUT', 'Notion CLI returned invalid JSON')
      throw describeError(error)
    }
  }

  async dedupe(slug) {
    requireSlug(slug)
    const result = await this.cli(['dedupe', '--slug', slug, '--apply'])
    this.invalidate()
    return result
  }

  async check() { return this.cli(['check'], 60_000) }

  invalidate() {
    this.mutationEpoch += 1
    this.cache = null
  }

  async refreshRecords() {
    if (this.syncPromise) return this.syncPromise
    this.syncPromise = (async () => {
      // A pull that overlaps a mutation must not repopulate pre-mutation data.
      // Retry a bounded number of times; the last resort is a marked stale cache.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const epoch = this.mutationEpoch
        const result = await this.cli(['list', '--status', 'all', '--limit', String(this.config.listLimit)])
        if (this.disposed) return []
        if (epoch !== this.mutationEpoch) continue
        this.cache = Array.isArray(result.records) ? result.records : []
        this.lastSync = new Date().toISOString()
        this.syncError = null
        this.syncWarnings = Array.isArray(result.errors) ? result.errors.slice(0, 10) : []
        this.duplicates = Array.isArray(result.duplicates) ? result.duplicates.slice(0, 20) : []
        return this.cache
      }
      throw new NotionSessionError('REFRESH_RACED', 'Records changed during pull; retry the refresh')
    })()
    try { return await this.syncPromise }
    catch (error) {
      const normal = describeError(error)
      this.syncError = { code: normal.code, message: normal.message }
      throw normal
    } finally { this.syncPromise = null }
  }

  async list({ status = 'active', query = '', limit = 30, refresh = false } = {}) {
    if (!FILTERS.has(status)) throw new NotionSessionError('INVALID_INPUT', 'status must be active, archived, hidden or all')
    const boundedLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 30))
    let records = this.cache
    if (refresh || records === null) {
      try { records = await this.refreshRecords() }
      catch (error) {
        if (this.cache === null) throw error
        records = this.cache
      }
    }
    const needle = String(query ?? '').trim().toLocaleLowerCase()
    const filtered = records.filter(record => {
      if (status !== 'all' && record.state !== status) return false
      if (!needle) return true
      return [record.title, record.slug, record.summary, record.sourceTool, record.workspacePath]
        .some(value => String(value ?? '').toLocaleLowerCase().includes(needle))
    }).slice(0, boundedLimit)
    return {
      records: filtered,
      total: filtered.length,
      lastSync: this.lastSync,
      syncError: this.syncError,
      syncWarnings: this.syncWarnings,
      duplicates: this.duplicates,
      autoSync: this.config.autoSync,
      syncIntervalSeconds: this.config.syncIntervalSeconds,
      stale: this.cache !== null && this.syncError !== null,
    }
  }

  async archive(sessionId, state = 'active') {
    requireId(sessionId)
    if (!STATES.has(state)) throw new NotionSessionError('INVALID_INPUT', 'state must be active, archived or hidden')
    // Two clicks (or two UI paths) must not both query-then-create the same slug.
    if (this.archiveLocks.has(sessionId)) return this.archiveLocks.get(sessionId)
    const operation = this.archiveUnsafe(sessionId, state)
    this.archiveLocks.set(sessionId, operation)
    try { return await operation } finally { this.archiveLocks.delete(sessionId) }
  }

  async archiveUnsafe(sessionId, state = 'active') {
    // readSession is the installed 0.2.2-rc.3 API; renderSession selects only
    // direct dialogue and tool facts from the replay-validated raw log.
    const observation = await this.ctx.sessionQuery.readSession(sessionId)
    const agent = this.ctx.agents.get(sessionId)
    const workspacePath = agent?.project?.cwd ?? observation.session?.cwd ?? ''
    let title = ''
    try {
      const titled = await this.ctx.sessionQuery.readTitleSnapshot(sessionId, AbortSignal.timeout(15_000))
      title = titled.title?.title ?? ''
    } catch { /* The transcript remains archivable when title projection is unavailable. */ }
    const archivedAt = new Date().toISOString()
    const rendered = renderSession({ sessionId, events: observation.events, workspacePath, archivedAt, title })
    if (rendered.directUserCount === 0) throw new NotionSessionError('EMPTY_SESSION', 'The session has no direct user message to archive')
    const directory = await mkdtemp(join(tmpdir(), 'dsh-notion-session-'))
    const file = join(directory, 'session.md')
    try {
      await writeFile(file, rendered.markdown, { encoding: 'utf8', mode: 0o600 })
      const result = await this.cli([
        'push', '--file', file, '--slug', `dsh/${sessionId}`, '--session-id', sessionId,
        '--tool', 'dsh', '--workspace', workspacePath, '--summary', rendered.summary,
        '--state', state, ...(title ? ['--title', title] : []),
      ])
      this.invalidate()
      return { ...result, truncated: result.truncated === true || rendered.markdown.includes('[归档截断]') }
    } finally { await rm(directory, { recursive: true, force: true }) }
  }

  async show(slug) {
    requireSlug(slug)
    return this.cli(['show', '--slug', slug])
  }

  async setState(slug, state) {
    requireSlug(slug)
    if (!STATES.has(state)) throw new NotionSessionError('INVALID_INPUT', 'state must be active, archived or hidden')
    const result = await this.cli(['state', '--slug', slug, '--state', state])
    this.invalidate()
    return result
  }

  async resume(slug, requesterSessionId) {
    requireSlug(slug)
    if (requesterSessionId !== undefined) requireId(requesterSessionId, 'requesterSessionId')
    if (this.resumeLocks.has(slug)) return this.resumeLocks.get(slug)
    const operation = this.resumeUnsafe(slug, requesterSessionId)
    this.resumeLocks.set(slug, operation)
    try { return await operation } finally { this.resumeLocks.delete(slug) }
  }

  async resumeUnsafe(slug, requesterSessionId) {
    const { record, markdown } = await this.show(slug)
    if (record.resumedSessionId) {
      let exists = this.ctx.agents.get(record.resumedSessionId) !== undefined
      if (!exists && typeof this.ctx.sessionController.list === 'function') {
        try {
          const listed = await this.ctx.sessionController.list({}, AbortSignal.timeout(15_000))
          exists = (listed.items ?? []).some(item => (item.sessionId ?? item.id) === record.resumedSessionId)
        } catch { /* Unknown is not proof of local availability; continue with stable creation. */ }
      }
      if (exists) return { sessionId: record.resumedSessionId, record, warning: null, alreadyResumed: true }
    }
    const requester = requesterSessionId ? this.ctx.agents.get(requesterSessionId) : undefined
    const fallbackCwd = requester?.project?.cwd ?? process.cwd()
    let cwd = record.workspacePath || fallbackCwd
    let workspaceWarning
    try {
      const info = await stat(cwd)
      if (!info.isDirectory()) throw new Error('not a directory')
    } catch {
      workspaceWarning = `Original workspace is unavailable; used ${fallbackCwd}`
      cwd = fallbackCwd
    }
    // Stable identities make a retry after a crash/restart converge on the same
    // blank Session and durable prompt admission instead of creating duplicates.
    const sessionId = stableUuid('session', slug)
    let newSessionId = sessionId
    try {
      const created = await this.ctx.sessionController.create({ cwd: resolve(cwd), sessionId })
      newSessionId = created.sessionId
    } catch (error) {
      const code = error?.rpcError?.code ?? error?.code
      if (code !== 'session/conflict') throw error
      // A prior attempt may already have prompted this deterministic Session.
    }
    const prompt = buildContinuationPrompt(record, markdown)
    await this.ctx.sessionController.prompt({
      requestId: stableUuid('request', slug), sessionId: newSessionId, queue: 'queue', content: [{ type: 'text', text: prompt }],
    }, AbortSignal.timeout(60_000))
    let stateWarning
    let updatedRecord = { ...record, resumedSessionId: newSessionId }
    try {
      const marked = await this.cli(['mark-resumed', '--slug', slug, '--session-id', String(newSessionId)])
      updatedRecord = marked.record ?? marked
    } catch (error) {
      stateWarning = `Session created and prompted, but Notion resume state was not saved: ${describeError(error).message}`
    }
    this.invalidate()
    return {
      sessionId: newSessionId,
      record: updatedRecord,
      warning: [workspaceWarning, stateWarning].filter(Boolean).join(' ') || null,
    }
  }
}

function toolDefinition(service, agent) {
  const sessionId = String(agent.session?.id ?? agent.id)
  return {
    name: 'notion_session',
    description: 'Archive the current DSH session to Notion; list/read Notion session archives; or set active/archived/hidden visibility. Creating a continuation is intentionally a user-only GUI action because archived text is untrusted historical data. This never deletes or natively archives the local source session.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['archive', 'list', 'show', 'set_state', 'dedupe'], description: 'Operation to perform. Continuation creation is available only in the user GUI.' },
        state: { type: 'string', enum: ['active', 'archived', 'hidden'], description: 'For archive, desired initial state (default active); for set_state, required new state.' },
        status: { type: 'string', enum: ['active', 'archived', 'hidden', 'all'], description: 'For list, visibility filter (default active).' },
        query: { type: 'string', description: 'For list, optional case-insensitive title/slug/summary/tool/workspace filter.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'For list, maximum records (default 20).' },
        slug: { type: 'string', description: 'For show or set_state, the record slug returned by list (dsh/… or legacy raw/sessions/…).' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args) {
      const input = args && typeof args === 'object' && !Array.isArray(args) ? args : {}
      let result
      if (input.action === 'archive') result = await service.archive(sessionId, input.state ?? 'active')
      else if (input.action === 'list') result = await service.list({ status: input.status ?? 'active', query: input.query ?? '', limit: input.limit ?? 20, refresh: true })
      else if (input.action === 'show') {
        const shown = await service.show(input.slug)
        result = { record: shown.record, markdown: clipText(shown.markdown, 12_000), truncated: Array.from(shown.markdown ?? '').length > 12_000 }
      } else if (input.action === 'set_state') result = await service.setState(input.slug, input.state)
      else if (input.action === 'dedupe') result = await service.dedupe(input.slug)
      else throw new NotionSessionError('INVALID_INPUT', 'unknown action')
      return result
    },
  }
}

function parseSkill(source, fallbackName) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const frontmatter = match?.[1] ?? ''
  const field = key => frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim()
  return {
    name: field('name') ?? fallbackName,
    description: field('description') ?? fallbackName,
    content: match ? source.slice(match[0].length) : source,
  }
}

function installSkills(ctx, config) {
  const names = ['notion-session-save', 'notion-session-archive', 'notion-session-resume']
  for (const skillName of names) {
    const path = join(PACKAGE_DIR, 'skills', skillName, 'SKILL.md')
    const source = readFileSync(path, 'utf8')
    const skill = parseSkill(source, skillName)
    const content = skill.content.replaceAll('{{PLUGIN_DIR}}', PACKAGE_DIR).replaceAll('{{PYTHON}}', config.python)
    ctx.effect(() => ctx.skills.register({
      ...skill, content, source: 'runtime', provider: 'dsh-notion-session',
      invocation: { modelInvocable: true, userInvocable: true },
      resourceBase: { kind: 'opaque', description: `Packaged at ${PACKAGE_DIR}` },
    }), `dsh-notion-session: skill ${skillName}`)
  }
}

function wireAgentTools(ctx, service) {
  const disposers = new Map()
  const install = agent => {
    const id = String(agent.session?.id ?? agent.id)
    if (disposers.has(id)) return
    const dispose = agent.ctx.tools.register(toolDefinition(service, agent))
    const owned = () => {
      if (!disposers.has(id)) return
      disposers.delete(id)
      dispose()
    }
    disposers.set(id, owned)
    ctx.effect(() => owned, `dsh-notion-session: tool ${id}`)
  }
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  ctx.on('agent/disposed', ({ agent }) => {
    const id = String(agent.session?.id ?? agent.id)
    disposers.get(id)?.()
  })
  for (const agent of ctx.agents.list?.() ?? []) install(agent)
}

async function requestJson(request) {
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('object expected')
    return body
  } catch { throw new NotionSessionError('INVALID_INPUT', 'Request body must be a JSON object') }
}

function wireHttp(ctx, service) {
  const route = {
    path: API_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      try {
        if (request.method === 'GET') {
          const url = new URL(request.url)
          const result = await service.list({
            status: url.searchParams.get('status') ?? 'active',
            query: url.searchParams.get('query') ?? '',
            limit: Number(url.searchParams.get('limit') ?? 30),
            refresh: url.searchParams.get('refresh') === '1',
          })
          return jsonResponse(200, { ok: true, ...result })
        }
        if (request.method !== 'POST') return jsonResponse(405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' })
        const body = await requestJson(request)
        let result
        if (body.action === 'archive') result = await service.archive(body.sessionId, body.state ?? 'active')
        else if (body.action === 'show') {
          const shown = await service.show(body.slug)
          result = { record: shown.record, markdown: clipText(shown.markdown, 20_000), truncated: Array.from(shown.markdown ?? '').length > 20_000 }
        }
        else if (body.action === 'state') result = await service.setState(body.slug, body.state)
        else if (body.action === 'dedupe') result = await service.dedupe(body.slug)
        else if (body.action === 'resume') result = await service.resume(body.slug, body.requesterSessionId)
        else if (body.action === 'check') result = await service.check()
        else throw new NotionSessionError('INVALID_INPUT', 'Unknown action')
        return jsonResponse(200, { ok: true, ...result })
      } catch (error) {
        const normal = describeError(error)
        const status = normal.code === 'SECRET_BLOCKED' ? 422 : normal.code === 'AUTH_REQUIRED' ? 403 : normal.code.startsWith('INVALID') || normal.code === 'EMPTY_SESSION' ? 400 : 500
        return jsonResponse(status, { ok: false, code: normal.code, message: normal.message })
      }
    },
  }
  ctx.effect(() => ctx.connection.fetch.register(route), 'dsh-notion-session: authenticated API')
}

export function apply(ctx, rawConfig) {
  const validated = Config['~standard'].validate(rawConfig)
  if (validated.issues) throw new Error(`Invalid dsh-notion-session config: ${JSON.stringify(validated.issues)}`)
  const config = validated.value
  const service = new NotionSessionService(ctx, config)
  wireHttp(ctx, service)
  wireAgentTools(ctx, service)
  try { installSkills(ctx, config) }
  catch (error) { ctx.logger?.warn?.(`dsh-notion-session: skill registration failed: ${describeError(error).message}`) }

  let timer
  let starter
  if (config.autoSync) {
    starter = setTimeout(() => { void service.refreshRecords().catch(() => {}) }, 3_000)
    timer = setInterval(() => { void service.refreshRecords().catch(() => {}) }, config.syncIntervalSeconds * 1_000)
    timer.unref?.()
  }
  return () => {
    service.disposed = true
    if (starter) clearTimeout(starter)
    if (timer) clearInterval(timer)
  }
}
