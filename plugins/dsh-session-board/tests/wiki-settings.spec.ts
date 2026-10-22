import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWikiSettings } from '../src/client/wiki-settings.ts'
import { DEFAULT_WIKI_CONFIG, WIKI_CONFIG_PATH, validateWikiConfig, wikiDefaults } from '../src/shared/wiki.ts'

/** One fetch response with a JSON body. */
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

const statusReport = {
  ok: true,
  issues: [],
  python: '3.9.6',
  pythonExecutable: '/usr/bin/python3',
  engine: { dir: '/plugin/lib/wiki', scripts: [{ name: 'wiki-archive.py', path: '/plugin/lib/wiki/wiki-archive.py', exists: true, bytes: 10 }] },
  schema: { path: '/home/user/wiki/SCHEMA.md', bytes: 20 },
  wikiRoot: { path: '/home/user/wiki', exists: true },
  state: { path: '/home/user/wiki/scripts/.archive-state.json' },
  operations: ['scope'],
}

/** One routed response: config + defaults + probe. */
function response(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    ok: true,
    config: DEFAULT_WIKI_CONFIG,
    defaults: wikiDefaults('/home/user'),
    status: statusReport,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('wiki settings controller', () => {
  it('reads the config, defaults and probe report', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(response()))
    vi.stubGlobal('fetch', fetchMock)
    const settings = createWikiSettings()
    settings.start()
    await vi.waitFor(() => expect(settings.store.getSnapshot().status).toBe('ready'))
    const state = settings.store.getSnapshot()
    expect(fetchMock).toHaveBeenCalledWith(WIKI_CONFIG_PATH, expect.objectContaining({ method: 'POST' }))
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ body: JSON.stringify({ action: 'read' }) })
    expect(state.config).toEqual(DEFAULT_WIKI_CONFIG)
    expect(state.defaults.wikiRoot).toBe('/home/user/wiki')
    expect(state.report?.ok).toBe(true)
    expect(state.saved).toBe(false)
    settings.dispose()
  })

  it('posts a valid draft and adopts the host response', async () => {
    const next = { ...DEFAULT_WIKI_CONFIG, wikiRoot: '/data/wiki' }
    const fetchMock = vi.fn(async () => jsonResponse(response({ config: next })))
    vi.stubGlobal('fetch', fetchMock)
    const settings = createWikiSettings()
    await settings.save(next)
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ body: JSON.stringify({ action: 'write', config: next }) })
    expect(settings.store.getSnapshot()).toMatchObject({ status: 'ready', saved: true, config: next, error: null })
    settings.dispose()
  })

  it('rejects an invalid draft locally without calling the host', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const settings = createWikiSettings()
    const invalid = { ...DEFAULT_WIKI_CONFIG, wikiRoot: 'relative/path' }
    expect(validateWikiConfig(invalid).errors).toEqual(['INVALID_WIKI_ROOT'])
    await settings.save(invalid)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(settings.store.getSnapshot()).toMatchObject({ saving: false, saved: false, error: 'INVALID_CONFIG', fieldErrors: ['INVALID_WIKI_ROOT'] })
    settings.dispose()
  })

  it('reports an older host instead of a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: false }, 404)))
    const settings = createWikiSettings()
    await settings.save({ ...DEFAULT_WIKI_CONFIG })
    expect(settings.store.getSnapshot().error).toBe('HOST_OUTDATED')
    settings.dispose()
  })

  it('probes without changing the configuration', async () => {
    const fetchMock = vi.fn(async (_input: unknown, init?: { body?: string }) => {
      const action = JSON.parse(init?.body ?? '{}').action
      return jsonResponse(action === 'probe' ? { ok: true, status: { ...statusReport, python: '3.11.0' } } : response())
    })
    vi.stubGlobal('fetch', fetchMock)
    const settings = createWikiSettings()
    settings.start()
    await vi.waitFor(() => expect(settings.store.getSnapshot().status).toBe('ready'))
    await settings.probe()
    expect(settings.store.getSnapshot().report?.python).toBe('3.11.0')
    expect(settings.store.getSnapshot().config).toEqual(DEFAULT_WIKI_CONFIG)
    settings.dispose()
  })

  it('resets the saved record', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(response()))
    vi.stubGlobal('fetch', fetchMock)
    const settings = createWikiSettings()
    await settings.reset()
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ body: JSON.stringify({ action: 'reset' }) })
    expect(settings.store.getSnapshot().saved).toBe(true)
    settings.dispose()
  })
})
