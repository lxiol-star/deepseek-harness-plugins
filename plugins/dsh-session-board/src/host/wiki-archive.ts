import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseArchiveScope, parseWikiWorkflow, parseArchiveSummary, MAX_ARCHIVE_SELECTION, type ArchiveScope, type SynthesisResult, type ArchivePreview, type ArchiveSummary } from '../shared/archive.ts'
import type { SynthesisModelSelection } from '../shared/synthesis.ts'

const exec = promisify(execFile)
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const PREVIEW_TTL_MS = 5 * 60_000
export class WikiArchiveError extends Error {
  constructor(readonly code: string) { super(code) }
}
export interface WikiArchiver {
  preview(ids: readonly string[]): Promise<ArchivePreview>
  commit(token: string): Promise<ArchiveSummary>
  close(): void
}
/**
 * The plugin-side synthesis path, used when the user picked a model route in
 * the settings page.
 *
 * `read` returns the stored route (null keeps the Wiki-provider path), and
 * `complete` runs exactly one model call for one raw page. The bridge's
 * `prompt`/`write` operations keep parsing, page validation, state recording,
 * SKIP handling and slug uniqueness inside `wiki-synthesize.py`'s own logic.
 */
export interface SynthesisModelBinding {
  read(): SynthesisModelSelection | null
  complete(request: {
    provider: string
    model: string
    /** Saved reasoning effort, or null to keep the model's own default. */
    reasoningEffort: string | null
    system: string
    prompt: string
    sessionId: string
    signal: AbortSignal
  }): Promise<string>
}

/** Workflow operations the bridge must implement for the plugin-side call. */
type WorkflowOperation = 'scope' | 'synthesize' | 'prompt' | 'write' | 'index'

export interface WikiArchiverOptions {
  home?: string
  dshHome?: string
  now?: () => number
  workflow?: (operation: WorkflowOperation, value: string, signal: AbortSignal) => Promise<unknown>
  execute?: (args: readonly string[], signal: AbortSignal) => Promise<{ stdout: string }>
  /** Plugin-side model call; absent keeps every synthesis on the Wiki provider. */
  models?: SynthesisModelBinding
}

/**
 * Resolve the harness home the way DSH itself does: an explicit value (config or
 * `$DSH_HOME`) wins, otherwise `~/.dsh`. Returns null only for an unusable value.
 * @param configured - home passed by the host, if any.
 * @param fromEnv - `DSH_HOME` of the running process, if any.
 * @returns the absolute home, or null when the configured value is unusable.
 */
/**
 * Provider id used for synthesis, overridable in the user's own home file so the
 * published plugin carries no account-specific default. A malformed file falls
 * back silently: synthesis then uses the configured default provider.
 * @param home - resolved user home directory.
 * @returns the provider id to pass to the synthesizer.
 */
export function resolveSynthesisProvider(home: string): string {
  try {
    const raw: unknown = JSON.parse(readFileSync(join(home, '.dsh-session-board.json'), 'utf8'))
    if (typeof raw === 'object' && raw !== null && 'synthesisProvider' in raw) {
      const value = (raw as { synthesisProvider: unknown }).synthesisProvider
      if (typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) return value
    }
  } catch {
    // No user file, or unreadable: the documented default applies.
  }
  return DEFAULT_SYNTHESIS_PROVIDER
}

/** Provider used when the user file names none; matches the Wiki skill's default. */
export const DEFAULT_SYNTHESIS_PROVIDER = 'stepx-terra'

export function resolveDshHome(configured: string | undefined, fromEnv: string | undefined): string | null {
  const chosen = configured ?? (fromEnv === undefined || fromEnv.trim() === '' ? undefined : fromEnv) ?? join(homedir(), '.dsh')
  if (chosen.trim() === '') return null
  try {
    return resolve(chosen)
  } catch {
    return null
  }
}

/** Explicit IDs only; never a selector fragment or a shell command. */
export function validateWikiIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ARCHIVE_SELECTION || raw.some(id => typeof id !== 'string' || !SAFE_ID.test(id) || id === '.' || id === '..')) {
    throw new WikiArchiveError('INVALID_SELECTION')
  }
  return [...new Set(raw as string[])]
}
function validateResult(raw: string, ids: readonly string[], dryRun: boolean): ArchiveSummary {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new WikiArchiveError('INVALID_RESULT') }
  if (typeof parsed === 'object' && parsed !== null && 'exit_code' in parsed && 'error' in parsed && !('status' in parsed)) {
    const code = (parsed as { exit_code: unknown }).exit_code
    throw new WikiArchiveError(code === 3 ? 'SELECTION_MISMATCH' : code === 4 ? 'BUSY' : code === 5 ? 'STATE_UNAVAILABLE' : 'ARCHIVE_UNAVAILABLE')
  }
  let summary: ArchiveSummary
  try { summary = parseArchiveSummary(parsed) } catch { throw new WikiArchiveError('INVALID_RESULT') }
  if (typeof parsed === 'object' && parsed !== null && 'status_error' in parsed && parsed.status_error) throw new WikiArchiveError('STATE_UNAVAILABLE')
  const returned = summary.results.map(row => row.session)
  if (summary.dry_run !== dryRun || returned.length !== ids.length || new Set(returned).size !== ids.length || ids.some(id => !returned.includes(id))) {
    throw new WikiArchiveError('SELECTION_MISMATCH')
  }
  for (const row of summary.results) {
    if (row.page !== undefined && (!row.page.startsWith('raw/sessions/') || row.page.split('/').includes('..') || row.page.includes('\\'))) throw new WikiArchiveError('INVALID_RESULT')
  }
  return summary
}

/**
 * Read one prepared prompt response from the bridge.
 *
 * The response is either a `{ prompt: { system, user } }` request to send to
 * the selected model, or a terminal synthesis row (`sensitive` when the raw
 * page carries recognizable credentials, `skipped` when the page's content has
 * not changed since a final conclusion).
 * @param raw - parsed JSON returned by the bridge.
 * @param session - session id owning the page, for the terminal row.
 * @param page - raw page path the row refers to.
 * @returns the prompt to send, or a validated terminal synthesis row.
 */
function parsePreparedPrompt(
  raw: unknown,
  session: string,
  page: string,
): { prompt: { system: string; user: string } } | { terminal: SynthesisResult } {
  const value = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
  const status = value.status
  if (status === 'sensitive' || status === 'skipped') {
    const parsed = parseWikiWorkflow({
      synthesis: [{ status, pages: Array.isArray(value.pages) ? value.pages : [], ...(status === 'sensitive' ? { error: 'SENSITIVE_CONTENT' } : {}), session, page }],
      index: 'not-needed',
    })
    return { terminal: parsed.synthesis[0] as SynthesisResult }
  }
  const prompt = typeof value.prompt === 'object' && value.prompt !== null ? value.prompt as Record<string, unknown> : null
  if (prompt === null || typeof prompt.system !== 'string' || typeof prompt.user !== 'string') throw new WikiArchiveError('INVALID_RESULT')
  return { prompt: { system: prompt.system, user: prompt.user } }
}

/**
 * Read one `write` response as a synthesis row.
 * @param raw - parsed JSON returned by the bridge.
 * @param session - session id owning the page.
 * @param page - raw page path the row refers to.
 * @returns the validated synthesis row.
 */
function parseWrittenRow(raw: unknown, session: string, page: string): SynthesisResult {
  const value = typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : {}
  const parsed = parseWikiWorkflow({ synthesis: [{ ...value, session, page }], index: 'not-needed' })
  return parsed.synthesis[0] as SynthesisResult
}

/** Preview is read-only. A short-lived, single-use token authorizes a fixed set. */
export function createWikiArchiver(options: WikiArchiverOptions = {}): WikiArchiver {
  const home = resolve(options.home ?? homedir())
  // The running host's own transcripts. A GUI launch carries no DSH_HOME, so the
  // documented default (~/.dsh) is the only correct answer there; an explicit
  // DSH_HOME always wins, which keeps a Dev app pointed at its own home.
  const dshHome = resolveDshHome(options.dshHome, process.env.DSH_HOME)
  const unavailableHome = dshHome === null
  const synthesisProvider = resolveSynthesisProvider(home)
  const now = options.now ?? Date.now
  const script = join(home, 'wiki', 'scripts', 'wiki-archive.py')
  const execute = options.execute ?? (async (args, signal) => {
    try {
      return await exec('/usr/bin/python3', [script, ...args], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, signal, env: { ...process.env, WIKI_ARCHIVE_LOCK_TIMEOUT: '10' } })
    } catch (error) {
      // Script may have committed a partial batch. Return a valid summary so
      // the UI can keep failed IDs rather than claiming an all-or-nothing write.
      const stdout = (error as { stdout?: unknown }).stdout
      if (typeof stdout === 'string' && stdout.trim().startsWith('{')) return { stdout }
      throw new WikiArchiveError(signal.aborted ? 'CANCELLED' : 'ARCHIVE_UNAVAILABLE')
    }
  })
  const workflow = options.workflow ?? (async (operation, value, signal) => {
    if (unavailableHome) throw new WikiArchiveError('ARCHIVE_UNAVAILABLE')
    try {
      const providerArguments = operation === 'synthesize' ? ['--provider', synthesisProvider] : []
      const result = await exec('/usr/bin/python3', [fileURLToPath(new URL('./wiki-workflow.py', import.meta.url)), operation,
        '--wiki-root', join(home, 'wiki'), '--dsh-home', dshHome, '--value', value, ...providerArguments],
        { timeout: operation === 'synthesize' ? 1_850_000 : 120_000, maxBuffer: 4 * 1024 * 1024, signal })
      const parsed: unknown = JSON.parse(result.stdout)
      if (typeof parsed === 'object' && parsed !== null && 'error' in parsed && !('status' in parsed)) throw new WikiArchiveError(String(parsed.error))
      return parsed
    } catch (error) {
      if (error instanceof WikiArchiveError) throw error
      if (signal.aborted) throw new WikiArchiveError('CANCELLED')
      // The bridge prints a structured error even when it exits non-zero; the
      // generic exec failure must not hide that reason from the panel.
      const stdout = (error as { stdout?: unknown }).stdout
      if (typeof stdout === 'string') {
        try {
          const parsed: unknown = JSON.parse(stdout)
          if (typeof parsed === 'object' && parsed !== null && 'error' in parsed && typeof parsed.error === 'string') throw new WikiArchiveError(parsed.error)
        } catch (inner) {
          if (inner instanceof WikiArchiveError) throw inner
        }
      }
      throw new WikiArchiveError(operation === 'scope' ? 'SCOPE_FAILED' : operation === 'index' ? 'INDEX_FAILED' : 'SYNTHESIS_FAILED')
    }
  })
  const models = options.models
  const previews = new Map<string, { ids: readonly string[]; expiresAt: number; sources: readonly string[]; scope: ArchiveScope }>()
  const controller = new AbortController()
  let busy = false
  let closed = false
  const perform = async (ids: readonly string[], dryRun: boolean): Promise<ArchiveSummary> => {
    if (unavailableHome) throw new WikiArchiveError('ARCHIVE_UNAVAILABLE')
    const args = ['--wiki-root', join(home, 'wiki'), '--tool', 'dsh', '--dsh-home', dshHome, '--json',
      ...ids.flatMap(id => ['--exact-session', id]), ...(dryRun ? ['--dry-run'] : ['--full'])]
    return validateResult((await execute(args, controller.signal)).stdout, ids, dryRun)
  }
  const exclusive = async <T>(work: () => Promise<T>): Promise<T> => {
    if (closed) throw new WikiArchiveError('CANCELLED')
    if (busy) throw new WikiArchiveError('BUSY')
    busy = true
    try { return await work() } finally { busy = false }
  }
  /**
   * Synthesize one raw page through the selected route.
   *
   * With no saved route this keeps the historical `synthesize` operation
   * (the Wiki provider path). With a route, the bridge prepares the prompt
   * (`prompt`), the plugin calls the DSH model, and the bridge validates and
   * writes the output (`write`) — raw archives are never touched by either.
   */
  const synthesizeOne = async (session: string, page: string): Promise<SynthesisResult> => {
    let selected: SynthesisModelSelection | null = null
    if (models !== undefined) {
      try {
        selected = models.read()
      } catch {
        selected = null
      }
    }
    if (selected === null || models === undefined) {
      const response = await workflow('synthesize', page, controller.signal)
      const parsed = parseWikiWorkflow({ synthesis: [{ ...(typeof response === 'object' && response !== null ? response : {}), session, page }], index: 'not-needed' })
      return parsed.synthesis[0] as SynthesisResult
    }
    const prepared = parsePreparedPrompt(await workflow('prompt', page, controller.signal), session, page)
    if ('terminal' in prepared) return prepared.terminal
    const output = await models.complete({
      provider: selected.provider,
      model: selected.model,
      reasoningEffort: selected.reasoningEffort ?? null,
      system: prepared.prompt.system,
      prompt: prepared.prompt.user,
      sessionId: session,
      signal: controller.signal,
    })
    return parseWrittenRow(await workflow('write', JSON.stringify({ page, output }), controller.signal), session, page)
  }

  return {
    preview: async (raw) => exclusive(async () => {
      const requested = validateWikiIds(raw)
      const scope = parseArchiveScope(await workflow('scope', JSON.stringify(requested), controller.signal))
      const ids = validateWikiIds(scope.entries.map(entry => entry.session))
      if (requested.some(id => !ids.includes(id))) throw new WikiArchiveError('SELECTION_MISMATCH')
      for (const [key, value] of previews) if (value.expiresAt <= now()) previews.delete(key)
      // Dropped/cancelled previews must not permanently exhaust the map.
      if (previews.size >= 20) previews.delete(previews.keys().next().value as string)
      // One archiver invocation for the whole selection: every process scans
      // both session stores, so a per-session loop made a nine-session preview
      // pay for nine scans before the user saw the plan.
      const previewed = await perform(ids, true)
      if (closed) throw new WikiArchiveError('CANCELLED')
      const rows = new Map(previewed.results.map(row => [row.session, row]))
      const summary: ArchiveSummary = { ...previewed, selected: ids.length, scope }
      const token = randomUUID(), expiresAt = now() + PREVIEW_TTL_MS
      previews.set(token, { ids, expiresAt, sources: ids.map(id => rows.get(id)?.source ?? ''), scope })
      return { token, expiresAt, summary }
    }),
    commit: async (token) => exclusive(async () => {
      const plan = previews.get(token)
      if (plan === undefined || plan.expiresAt <= now()) throw new WikiArchiveError('PREVIEW_EXPIRED')
      previews.delete(token)
      const currentScope = parseArchiveScope(await workflow('scope', JSON.stringify(plan.ids), controller.signal))
      if (JSON.stringify(currentScope.entries.map(({ snapshot: _snapshot, ...entry }) => entry)) !== JSON.stringify(plan.scope.entries.map(({ snapshot: _snapshot, ...entry }) => entry))) throw new WikiArchiveError('SELECTION_MISMATCH')
      const currentRows = new Map((await perform(plan.ids, true)).results.map(row => [row.session, row]))
      if (plan.ids.some((id, index) => (currentRows.get(id)?.source ?? '') !== plan.sources[index])) throw new WikiArchiveError('SELECTION_MISMATCH')
      if (closed) throw new WikiArchiveError('CANCELLED')
      const summary: ArchiveSummary = { archived: 0, skipped: 0, empty: 0, failed: 0, selected: plan.ids.length, dry_run: false, results: [], scope: currentScope }
      const synthesis: SynthesisResult[] = []
      for (const id of plan.ids) {
        try {
          const part = await perform([id], false)
          summary.archived += part.archived; summary.skipped += part.skipped; summary.empty += part.empty; summary.failed += part.failed
          summary.results.push(...part.results)
        } catch {
          if (closed) throw new WikiArchiveError('CANCELLED')
          summary.failed++
          summary.results.push({ session: id, action: 'failed', source: plan.sources[plan.ids.indexOf(id)] ?? '' })
        }
      }
      for (const row of summary.results) {
        if (!row.page || !['archived', 'skipped'].includes(row.action)) continue
        try {
          synthesis.push(await synthesizeOne(row.session, row.page))
        } catch {
          if (closed) throw new WikiArchiveError('CANCELLED')
          synthesis.push({ session: row.session, page: row.page, status: 'failed', pages: [], error: 'SYNTHESIS_FAILED' })
        }
      }
      let index: 'updated' | 'not-needed' | 'failed' = 'not-needed'
      if (synthesis.some(row => row.pages.length > 0 || row.status === 'synthesized')) {
        try {
          const response = await workflow('index', '', controller.signal)
          index = typeof response === 'object' && response !== null && 'status' in response && response.status === 'updated' ? 'updated' : 'failed'
        } catch { index = 'failed' }
      }
      summary.workflow = { synthesis, index }
      return summary
    }),
    close: () => { closed = true; previews.clear(); controller.abort() },
  }
}
