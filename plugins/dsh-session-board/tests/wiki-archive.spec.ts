import { describe, it, expect, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWikiArchiver, validateWikiIds, resolveDshHome, resolveSynthesisProvider } from '../src/host/wiki-archive.ts'
import { createBoardRoutes, BOARD_WIKI_ARCHIVE_PATH } from '../src/host/routes.ts'
import { EMPTY_FEED } from '../src/shared/types.ts'
import type { WikiArchiver } from '../src/host/wiki-archive.ts'
import { pythonAvailable } from './wiki-test-environment.ts'

const workflow = async (operation: string, value: string) => operation === 'scope' ? { entries: JSON.parse(value).map((session: string) => ({ session, source: `source/${session}`, parent: null, role: 'main', evidence: 'header', snapshot: false })), missing: [] } : operation === 'synthesize' ? { status: 'skipped', pages: [] } : { status: 'updated' }

function output(ids: string[], dry_run: boolean, source = 'source') {
  return JSON.stringify({ archived: ids.length, skipped: 0, empty: 0, failed: 0, selected: ids.length, dry_run,
    results: ids.map(id => ({ session: id, source: `${source}/${id}`, action: dry_run ? 'would-archive' : 'archived', ...(dry_run ? {} : { page: `raw/sessions/host/dsh/${id}.md` }) })) })
}

describe('Wiki home resolution', () => {
  it('follows DSH: explicit value, then DSH_HOME, then ~/.dsh — a GUI launch has no env', () => {
    expect(resolveDshHome('/custom/home', '/env/home')).toBe('/custom/home')
    expect(resolveDshHome(undefined, '/env/home')).toBe('/env/home')
    expect(resolveDshHome(undefined, '')).toBe(join(homedir(), '.dsh'))
    expect(resolveDshHome(undefined, undefined)).toBe(join(homedir(), '.dsh'))
  })
  it('lets the user file pick the synthesis provider and ignores malformed values', () => {
    const { mkdtempSync, writeFileSync } = require('node:fs') as typeof import('node:fs')
    const { tmpdir } = require('node:os') as typeof import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'sb-provider-'))
    expect(resolveSynthesisProvider(dir)).toBe('stepx-terra')
    writeFileSync(join(dir, '.dsh-session-board.json'), JSON.stringify({ synthesisProvider: 'gw-flash-auto' }))
    expect(resolveSynthesisProvider(dir)).toBe('gw-flash-auto')
    writeFileSync(join(dir, '.dsh-session-board.json'), JSON.stringify({ synthesisProvider: 'bad id; rm -rf' }))
    expect(resolveSynthesisProvider(dir)).toBe('stepx-terra')
    writeFileSync(join(dir, '.dsh-session-board.json'), '{not json')
    expect(resolveSynthesisProvider(dir)).toBe('stepx-terra')
  })
})

describe('Wiki archival safety', () => {
  it('accepts real non-UUID identifiers but not selector delimiters or traversal', () => {
    expect(validateWikiIds(['session-feishu-watch-lead-0930', 'session-feishu-watch-lead-0930'])).toEqual(['session-feishu-watch-lead-0930'])
    for (const id of ['a,b', 'a b', '../x', '-x', '', '.','..']) expect(() => validateWikiIds([id])).toThrow('INVALID_SELECTION')
    expect(() => validateWikiIds([])).toThrow()
    expect(() => validateWikiIds(Array(51).fill('id'))).toThrow()
  })
  it('archives against ~/.dsh when a GUI launch carries no DSH_HOME', async () => {
    const saved = process.env.DSH_HOME
    delete process.env.DSH_HOME
    try {
      const execute = vi.fn(async (args: readonly string[]) => ({ stdout: output(['id'], args.includes('--dry-run')) }))
      const service = createWikiArchiver({ workflow, home: '/test', execute })
      await service.preview(['id'])
      const args = execute.mock.calls[0]?.[0] ?? []
      expect(args[args.indexOf('--dsh-home') + 1]).toBe(join(homedir(), '.dsh'))
    } finally {
      if (saved !== undefined) process.env.DSH_HOME = saved
    }
  })
  it('does not write until explicit single-use token commit', async () => {
    const execute = vi.fn(async (args: readonly string[]) => ({ stdout: output(['id'], args.includes('--dry-run')) }))
    const service = createWikiArchiver({ workflow, dshHome: '/test/.dsh-dev', home: '/test', execute })
    const preview = await service.preview(['id'])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]?.[0]).toContain('--dry-run')
    expect(execute.mock.calls[0]?.[0]).toContain('--exact-session')
    expect(execute.mock.calls[0]?.[0]).not.toContain('--sessions')
    await service.commit(preview.token)
    expect(execute).toHaveBeenCalledTimes(3)
    expect(execute.mock.calls[2]?.[0]).not.toContain('--dry-run')
    await expect(service.commit(preview.token)).rejects.toThrow('PREVIEW_EXPIRED')
  })
  it('archives one exact ID at a time with --full, synthesizes full paths, then indexes once', async () => {
    const order: string[] = []
    const scoped = { entries: [
      { session: 'main', source: 'source/main', parent: null, role: 'main', evidence: 'header', snapshot: false },
      { session: 'child', source: 'source/child', parent: 'main', role: 'child', evidence: 'parentSession', snapshot: true },
    ], missing: [{ session: 'missing', parent: 'main' }] }
    const run = vi.fn(async (operation: string, value: string) => {
      if (operation === 'scope') return scoped
      order.push(`${operation}:${value}`)
      return operation === 'index' ? { status: 'updated' } : { status: 'synthesized', pages: ['experience/example.md'] }
    })
    const execute = vi.fn(async (args: readonly string[]) => {
      const id = args[args.indexOf('--exact-session') + 1]!
      expect(args.filter(arg => arg === '--exact-session')).toHaveLength(1)
      if (!args.includes('--dry-run')) { expect(args).toContain('--full'); order.push(`archive:${id}`) }
      return { stdout: output([id], args.includes('--dry-run')) }
    })
    const service = createWikiArchiver({ home: '/test', dshHome: '/test/dev', workflow: run, execute })
    const preview = await service.preview(['main'])
    expect(preview.summary.scope?.missing).toHaveLength(1)
    expect(order).toEqual([])
    const result = await service.commit(preview.token)
    expect(order).toEqual(['archive:main', 'archive:child', 'synthesize:raw/sessions/host/dsh/main.md', 'synthesize:raw/sessions/host/dsh/child.md', 'index:'])
    expect(result.workflow?.index).toBe('updated')
    expect(result.workflow?.synthesis).toHaveLength(2)
  })
  it('keeps raw archives and continues other sessions after synthesis fails or detects secrets', async () => {
    const run = vi.fn(async (operation: string, value: string) => {
      if (operation === 'scope') return workflow(operation, value)
      if (value.endsWith('/bad.md')) throw new Error('provider failed')
      return { status: 'sensitive', pages: [], error: 'SENSITIVE_CONTENT' }
    })
    const execute = async (args: readonly string[]) => ({ stdout: output([args[args.indexOf('--exact-session') + 1]!], args.includes('--dry-run')) })
    const service = createWikiArchiver({ dshHome: '/test/dev', workflow: run, execute })
    const result = await service.commit((await service.preview(['bad', 'sensitive'])).token)
    expect(result.archived).toBe(2)
    expect(result.workflow?.synthesis.map(row => row.status)).toEqual(['failed', 'sensitive'])
    expect(result.workflow?.index).toBe('not-needed')
    expect(run.mock.calls.some(([operation]) => operation === 'index')).toBe(false)
  })
  it('rejects source mismatch with zero archive writes', async () => {
    let calls = 0
    const execute = vi.fn(async (args: readonly string[]) => ({ stdout: output(['id'], args.includes('--dry-run'), ++calls === 1 ? 'a' : 'b') }))
    const service = createWikiArchiver({ workflow, dshHome: '/test/.dsh-dev', home: '/test', execute })
    const plan = await service.preview(['id'])
    await expect(service.commit(plan.token)).rejects.toThrow('SELECTION_MISMATCH')
    expect(execute.mock.calls.every(([args]) => args.includes('--dry-run'))).toBe(true)
  })
  it('rejects unknown rows and malformed responses', async () => {
    const service = createWikiArchiver({ workflow, dshHome: '/test/.dsh-dev', execute: async () => ({ stdout: output(['other'], true) }) })
    await expect(service.preview(['id'])).rejects.toThrow('SELECTION_MISMATCH')
    const invalid = createWikiArchiver({ workflow, dshHome: '/test/.dsh-dev', execute: async () => ({ stdout: '{"results":[]}' }) })
    await expect(invalid.preview(['id'])).rejects.toThrow('INVALID_RESULT')
  })
  it('expires preview tokens and aborts on unload', async () => {
    let now = 0
    const service = createWikiArchiver({ workflow, dshHome: '/test/.dsh-dev', now: () => now, execute: async () => ({ stdout: output(['id'], true) }) })
    const plan = await service.preview(['id']); now = plan.expiresAt + 1
    await expect(service.commit(plan.token)).rejects.toThrow('PREVIEW_EXPIRED')
    service.close(); await expect(service.preview(['id'])).rejects.toThrow('CANCELLED')
  })
  it('rejects simultaneous requests instead of creating unbounded queues', async () => {
    let finish!: () => void
    const service = createWikiArchiver({ workflow, dshHome: '/test/.dsh-dev', execute: () => new Promise(resolve => { finish = () => resolve({ stdout: output(['id'], true) }) }) })
    const first = service.preview(['id'])
    await expect(service.preview(['id'])).rejects.toThrow('BUSY')
    finish(); await first
  })
})

describe('authenticated connection route handler', () => {
  const fixture = () => {
    const wikiArchive: WikiArchiver = { preview: vi.fn(async () => ({ token: 'token', expiresAt: 1, summary: JSON.parse(output(['id'], true)) })), commit: vi.fn(async () => JSON.parse(output(['id'], false))), close: vi.fn() }
    const routes = createBoardRoutes({ snapshot: () => EMPTY_FEED, ack: async () => true, wikiArchive, requestRejection: () => 401, warn: () => {} })
    return { wikiArchive, route: routes.fetchRoutes.find(route => route.path === BOARD_WIKI_ARCHIVE_PATH)! }
  }
  const request = (body: unknown) => new Request(`http://test${BOARD_WIKI_ARCHIVE_PATH}`, { method: 'POST', body: JSON.stringify(body) })
  it('old unconfirmed POST cannot archive', async () => {
    const { route, wikiArchive } = fixture()
    expect((await route.fetch(request({ sessionIds: ['id'] }))).status).toBe(400)
    expect(wikiArchive.commit).not.toHaveBeenCalled()
  })
  it('invalid requests never invoke script service', async () => {
    const { route, wikiArchive } = fixture()
    expect((await route.fetch(request({ action: 'preview', sessionIds: ['../x'] }))).status).toBe(400)
    expect(wikiArchive.preview).not.toHaveBeenCalled()
  })
  it('starts a background operation only once and returns the final result by token', async () => {
    const { route, wikiArchive } = fixture()
    await route.fetch(request({ action: 'start', token: 'token' }))
    await route.fetch(request({ action: 'start', token: 'token' }))
    const response = await route.fetch(request({ action: 'status', token: 'token' }))
    expect(wikiArchive.commit).toHaveBeenCalledTimes(1)
    expect((await response.json()).operation).toMatchObject({ state: 'completed', result: { archived: 1 } })
    expect((await route.fetch(request({ action: 'status', token: 'unknown' }))).status).toBe(409)
  })
  it('preview and commit have separate responses', async () => {
    const { route, wikiArchive } = fixture()
    expect((await route.fetch(request({ action: 'preview', sessionIds: ['id'] }))).status).toBe(200)
    expect(wikiArchive.commit).not.toHaveBeenCalled()
    const response = await route.fetch(request({ action: 'commit', token: 'token' }))
    expect(response.status).toBe(200)
    expect((await response.json()).result.archived).toBe(1)
  })
})

describe('plugin-selected synthesis model', () => {
  const page = 'raw/sessions/host/dsh/id.md'
  const selection: { provider: string; model: string; reasoningEffort?: string | null } = { provider: 'alpha', model: 'pro' }

  /** A commit fixture whose archive rows are real `--full` results for one id. */
  const fixture = (options: {
    selection?: typeof selection | null
    run?: (operation: string, value: string) => Promise<unknown>
    complete?: () => Promise<string>
  } = {}) => {
    const calls: string[] = []
    const run = vi.fn(async (operation: string, value: string) => {
      calls.push(`${operation}:${value}`)
      if (operation === 'scope') return workflow('scope', value)
      if (options.run !== undefined) return await options.run(operation, value)
      if (operation === 'prompt') return { page, prompt: { system: 'SYSTEM PROMPT', user: 'USER PROMPT' } }
      if (operation === 'write') return { status: 'synthesized', pages: ['experience/example.md'] }
      if (operation === 'synthesize') return { status: 'synthesized', pages: ['experience/example.md'] }
      return { status: 'updated' }
    })
    const complete = vi.fn(async (request?: unknown) => {
      void request
      return options.complete === undefined ? 'PAGE BODY' : await options.complete()
    })
    const chosen = options.selection === undefined ? selection : options.selection
    const models = {
      read: () => chosen,
      complete: (request: unknown) => complete(request),
    }
    const execute = async (args: readonly string[]) => ({ stdout: output([args[args.indexOf('--exact-session') + 1]!], args.includes('--dry-run')) })
    const service = createWikiArchiver({ home: '/test', dshHome: '/test/dev', workflow: run, execute, models })
    return { service, run, complete, calls }
  }

  it('calls the selected model through the plugin and writes through the bridge', async () => {
    const f = fixture()
    const plan = await f.service.preview(['id'])
    const result = await f.service.commit(plan.token)
    expect(result.workflow?.synthesis).toEqual([{ session: 'id', page, status: 'synthesized', pages: ['experience/example.md'] }])
    expect(f.calls.some(call => call.startsWith('synthesize:'))).toBe(false)
    expect(f.calls.filter(call => call.startsWith('prompt:'))).toEqual([`prompt:${page}`])
    expect(f.complete).toHaveBeenCalledTimes(1)
    const promptCall = f.run.mock.calls.find(([operation]) => operation === 'prompt')
    expect(promptCall?.[1]).toBe(page)
    const writeCall = f.run.mock.calls.find(([operation]) => operation === 'write')
    expect(JSON.parse(writeCall?.[1] as string)).toEqual({ page, output: 'PAGE BODY' })
  })

  it('passes the saved reasoning effort to the model call', async () => {
    const f = fixture({ selection: { provider: 'alpha', model: 'pro', reasoningEffort: 'high' } })
    await f.service.commit((await f.service.preview(['id'])).token)
    expect(f.complete).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'alpha',
      model: 'pro',
      reasoningEffort: 'high',
      sessionId: 'id',
    }))

    const plain = fixture()
    await plain.service.commit((await plain.service.preview(['id'])).token)
    expect(plain.complete).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: null }))
  })

  it('keeps the Wiki-provider path when no model is selected', async () => {
    const f = fixture({ selection: null })
    const plan = await f.service.preview(['id'])
    const result = await f.service.commit(plan.token)
    expect(f.calls.some(call => call.startsWith('synthesize:'))).toBe(true)
    expect(f.calls.some(call => call.startsWith('prompt:'))).toBe(false)
    expect(f.complete).not.toHaveBeenCalled()
    expect(result.workflow?.synthesis[0]?.status).toBe('synthesized')
  })

  it('reports a model failure per session, keeps the raw archive, and continues', async () => {
    const f = fixture({ complete: async () => { throw new Error('provider exploded') } })
    const plan = await f.service.preview(['id'])
    const result = await f.service.commit(plan.token)
    expect(result.archived).toBe(1)
    expect(result.workflow?.synthesis[0]).toMatchObject({ session: 'id', page, status: 'failed', error: 'SYNTHESIS_FAILED' })
    expect(result.workflow?.index).toBe('not-needed')
    expect(f.calls.some(call => call.startsWith('write:'))).toBe(false)
  })

  it('never calls the model for a sensitive page or an unchanged conclusion', async () => {
    const sensitive = fixture({ run: async (operation) => operation === 'prompt' ? { status: 'sensitive', pages: [], error: 'SENSITIVE_CONTENT' } : {} })
    const sensitiveResult = await sensitive.service.commit((await sensitive.service.preview(['id'])).token)
    expect(sensitiveResult.workflow?.synthesis[0]).toMatchObject({ status: 'sensitive', error: 'SENSITIVE_CONTENT' })
    expect(sensitive.complete).not.toHaveBeenCalled()

    const skipped = fixture({ run: async (operation) => operation === 'prompt' ? { status: 'skipped', pages: [] } : {} })
    const skippedResult = await skipped.service.commit((await skipped.service.preview(['id'])).token)
    expect(skippedResult.workflow?.synthesis[0]).toMatchObject({ status: 'skipped', pages: [] })
    expect(skipped.complete).not.toHaveBeenCalled()
  })

  it('reports a rejected write as failed without claiming pages', async () => {
    const f = fixture({ run: async (operation) => operation === 'prompt'
      ? { page, prompt: { system: 'SYS', user: 'USER' } }
      : operation === 'write' ? { status: 'failed', pages: [], error: 'PARSE_ERROR' } : {} })
    const result = await f.service.commit((await f.service.preview(['id'])).token)
    expect(result.archived).toBe(1)
    expect(result.workflow?.synthesis[0]).toMatchObject({ status: 'failed', error: 'PARSE_ERROR' })
  })
})

describe.skipIf(!pythonAvailable)('workflow failure classification', () => {
  /** One synthetic wiki root with an optional archive stub. */
  function fixture(schema: string, archive?: string) {
    const home = mkdtempSync(join(tmpdir(), 'board-workflow-failure-'))
    const wiki = join(home, 'wiki'), scripts = join(wiki, 'scripts')
    mkdirSync(scripts, { recursive: true })
    writeFileSync(join(wiki, 'SCHEMA.md'), schema)
    if (archive !== undefined) writeFileSync(join(scripts, 'wiki-archive.py'), archive)
    return createWikiArchiver({ home, dshHome: join(home, 'dev') })
  }

  it('passes the bridge structured error through instead of a generic code', async () => {
    await expect(fixture('').preview(['id'])).rejects.toThrow('SCHEMA_UNAVAILABLE')
  })

  it('names the failed step when the bridge dies without a structured error', async () => {
    await expect(fixture('# schema', 'raise SystemExit(2)\n').preview(['id'])).rejects.toThrow('SCOPE_FAILED')
  })
})
