import { describe, expect, it, vi } from 'vitest'
import { createSynthesisSettings } from '../src/client/synthesis-settings.ts'
import { createBoardRoutes, BOARD_SYNTHESIS_MODEL_PATH } from '../src/host/routes.ts'
import type { SynthesisModelStore } from '../src/host/routes.ts'
import type { WikiArchiver } from '../src/host/wiki-archive.ts'
import type { SynthesisModelPref } from '../src/shared/synthesis.ts'
import { EMPTY_FEED } from '../src/shared/types.ts'
import {
  formatContextWindow,
  optionValueOf,
  parseCatalogGroups,
  parseSynthesisModelResponse,
  parseSynthesisPref,
  sameSynthesisPref,
  selectionFromOptionValue,
  selectionOf,
  selectionOptionValue,
  synthesisModelOptions,
} from '../src/shared/synthesis.ts'

const catalog = [
  { id: 'zeta', name: 'Zeta', models: [{ id: 'large', name: 'Large' }, { id: 'small', name: 'Small' }] },
  { id: 'alpha', name: 'Alpha', models: [{ id: 'pro', name: 'Pro', contextWindow: 262144 }, { id: 'pro', name: 'Pro duplicate' }] },
]

describe('synthesis preference wire model', () => {
  it('normalizes a half-filled or malformed stored value to the Wiki fallback', () => {
    expect(parseSynthesisPref({ model: 'm', provider: 'p' })).toEqual({ model: 'm', provider: 'p' })
    expect(parseSynthesisPref({ model: 'm', provider: null })).toEqual({ model: null, provider: null })
    expect(parseSynthesisPref({ model: null, provider: 'p' })).toEqual({ model: null, provider: null })
    expect(parseSynthesisPref({ model: '', provider: 'p' })).toEqual({ model: null, provider: null })
    expect(parseSynthesisPref({ model: 'm\nx', provider: 'p' })).toEqual({ model: null, provider: null })
    expect(parseSynthesisPref({ model: 'm', provider: 'p'.repeat(201) })).toEqual({ model: null, provider: null })
    expect(parseSynthesisPref(undefined)).toEqual({ model: null, provider: null })
  })

  it('projects a preference onto a concrete route only when both parts are present', () => {
    expect(selectionOf({ model: 'm', provider: 'p' })).toEqual({ provider: 'p', model: 'm' })
    expect(selectionOf({ model: null, provider: null })).toBeNull()
    expect(sameSynthesisPref({ model: 'm', provider: 'p' }, { model: 'm', provider: 'p' })).toBe(true)
    expect(sameSynthesisPref({ model: 'm', provider: 'p' }, { model: null, provider: null })).toBe(false)
  })

  it('accepts only a successful route response and keeps the fallback shape', () => {
    expect(parseSynthesisModelResponse({ ok: true, selection: null })).toEqual({ model: null, provider: null })
    expect(parseSynthesisModelResponse({ ok: true, selection: { provider: 'p', model: 'm' } })).toEqual({ model: 'm', provider: 'p' })
    expect(parseSynthesisModelResponse({ ok: false, error: 'UNKNOWN_MODEL' })).toBeNull()
    expect(parseSynthesisModelResponse({ ok: true })).toBeNull()
    expect(parseSynthesisModelResponse('nope')).toBeNull()
  })
})

describe('client model catalog → picker rows', () => {
  it('parses provider groups defensively and keeps disclosed context windows', () => {
    const groups = parseCatalogGroups(catalog)
    expect(groups.map(group => group.id)).toEqual(['zeta', 'alpha'])
    expect(groups[1]?.models[0]).toEqual({ id: 'pro', name: 'Pro', contextWindow: 262144 })
    expect(parseCatalogGroups([{ id: '', models: [] }, 'x', { name: 'no id' }])).toEqual([])
  })

  it('deduplicates exact routes and sorts stably regardless of catalog order', () => {
    const forward = synthesisModelOptions(parseCatalogGroups(catalog))
    const reversed = synthesisModelOptions(parseCatalogGroups([...catalog].reverse()))
    expect(forward).toEqual(reversed)
    expect(forward.map(option => `${option.provider}/${option.model}`)).toEqual([
      'alpha/pro',
      'zeta/large',
      'zeta/small',
    ])
    expect(forward[0]?.contextWindow).toBe(262144)
  })

  it('encodes a route opaquely and resolves it back without parsing the label', () => {
    const options = synthesisModelOptions(parseCatalogGroups(catalog))
    expect(selectionFromOptionValue(options[1]!.value)).toEqual({ provider: 'zeta', model: 'large' })
    expect(optionValueOf(options, { provider: 'zeta', model: 'large' })).toBe(options[1]!.value)
    expect(optionValueOf(options, { provider: 'missing', model: 'x' })).toBeNull()
    expect(optionValueOf(options, null)).toBeNull()
    expect(selectionFromOptionValue(selectionOptionValue({ provider: 'p', model: 'm' }))).toEqual({ provider: 'p', model: 'm' })
    expect(selectionFromOptionValue('no-separator')).toBeNull()
  })

  it('formats context windows compactly', () => {
    expect(formatContextWindow(131072)).toBe('128K')
    expect(formatContextWindow(1_048_576)).toBe('1M')
    expect(formatContextWindow(1_572_864)).toBe('1.5M')
    expect(formatContextWindow(4096)).toBe('4K')
    expect(formatContextWindow(512)).toBe('512')
  })
})

describe('synthesis-model route', () => {
  const route = (store: SynthesisModelStore) => createBoardRoutes({
    snapshot: () => EMPTY_FEED,
    ack: async () => true,
    wikiArchive: { preview: vi.fn(), commit: vi.fn(), close: vi.fn() } as unknown as WikiArchiver,
    requestRejection: () => undefined,
    synthesisModel: store,
    warn: () => {},
  }).fetchRoutes.find(candidate => candidate.path === BOARD_SYNTHESIS_MODEL_PATH)!
  const request = (body: unknown) => new Request(`http://test${BOARD_SYNTHESIS_MODEL_PATH}`, { method: 'POST', body: JSON.stringify(body) })

  const fixture = (initial: SynthesisModelPref = { model: null, provider: null }) => {
    let stored = initial
    const store = {
      read: () => stored,
      write: async (pref: SynthesisModelPref) => { stored = pref },
      validate: async (selection: { provider: string; model: string }) => selection.provider === 'alpha' && selection.model === 'pro',
    }
    return { route: route(store), stored: () => stored }
  }

  it('reads the current value and advertises the host capability', async () => {
    const { route: handler } = fixture({ model: 'pro', provider: 'alpha' })
    const response = await handler.fetch(request({ action: 'read' }))
    expect(response.status).toBe(200)
    expect((await response.json()).selection).toEqual({ provider: 'alpha', model: 'pro' })
  })

  it('writes a known route and reads the saved value back', async () => {
    const { route: handler, stored } = fixture()
    const saved = await handler.fetch(request({ action: 'write', provider: 'alpha', model: 'pro' }))
    expect(saved.status).toBe(200)
    expect((await saved.json()).selection).toEqual({ provider: 'alpha', model: 'pro' })
    expect(stored()).toEqual({ provider: 'alpha', model: 'pro' })
  })

  it('writes the null/null fallback explicitly', async () => {
    const { route: handler, stored } = fixture({ model: 'pro', provider: 'alpha' })
    const saved = await handler.fetch(request({ action: 'write', provider: null, model: null }))
    expect(saved.status).toBe(200)
    expect(stored()).toEqual({ provider: null, model: null })
  })

  it('rejects an unknown route and leaves the stored value untouched', async () => {
    const { route: handler, stored } = fixture({ model: 'pro', provider: 'alpha' })
    const response = await handler.fetch(request({ action: 'write', provider: 'alpha', model: 'ghost' }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('UNKNOWN_MODEL')
    expect(stored()).toEqual({ provider: 'alpha', model: 'pro' })
  })

  it('rejects half-filled, malformed, and unknown-action bodies', async () => {
    const { route: handler } = fixture()
    const invalid = [
      { action: 'write', provider: 'alpha', model: null },
      { action: 'write', provider: null, model: 'pro' },
      { action: 'write', provider: 1, model: 'pro' },
      { action: 'delete' },
      [],
    ]
    for (const body of invalid) expect((await handler.fetch(request(body))).status).toBe(400)
    expect((await handler.fetch(request({ action: 'read', extra: true }))).status).toBe(200)
  })

  it('answers 503 when the preference store is not wired and 500 when the write fails', async () => {
    const unwired = createBoardRoutes({
      snapshot: () => EMPTY_FEED,
      ack: async () => true,
      wikiArchive: { preview: vi.fn(), commit: vi.fn(), close: vi.fn() } as unknown as WikiArchiver,
      requestRejection: () => undefined,
      warn: () => {},
    }).fetchRoutes.find(candidate => candidate.path === BOARD_SYNTHESIS_MODEL_PATH)!
    expect((await unwired.fetch(request({ action: 'read' }))).status).toBe(503)

    const failing = route({
      read: () => ({ model: null, provider: null }),
      write: async () => { throw new Error('disk full') },
      validate: async () => true,
    })
    const response = await failing.fetch(request({ action: 'write', provider: 'alpha', model: 'pro' }))
    expect(response.status).toBe(500)
    expect((await response.json()).error).toBe('STORE_UNAVAILABLE')
  })
})

describe('settings controller', () => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const catalog = async () => catalogGroups()
  const catalogGroups = () => [{ id: 'alpha', name: 'Alpha', models: [{ id: 'pro', name: 'Pro' }] }]

  it('loads the saved route and the client catalog on start', async () => {
    const fetch = vi.fn(async () => reply(200, { ok: true, selection: { provider: 'alpha', model: 'pro' } }))
    vi.stubGlobal('fetch', fetch)
    const settings = createSynthesisSettings({ catalog })
    settings.start()
    await vi.waitFor(() => expect(settings.store.getSnapshot().catalogStatus).toBe('ready'))
    const state = settings.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.selection).toEqual({ provider: 'alpha', model: 'pro' })
    expect(state.options.map(option => option.model)).toEqual(['pro'])
    settings.dispose()
    vi.unstubAllGlobals()
  })

  it('saves a route and the explicit fallback with the right request bodies', async () => {
    const bodies: unknown[] = []
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return reply(200, { ok: true, selection: JSON.parse(String(init?.body)).model === null ? null : { provider: 'alpha', model: 'pro' } })
    })
    vi.stubGlobal('fetch', fetch)
    const settings = createSynthesisSettings({ catalog })
    await settings.save('alpha\u0000pro')
    expect(bodies[0]).toEqual({ action: 'write', provider: 'alpha', model: 'pro' })
    expect(settings.store.getSnapshot()).toMatchObject({ saved: true, selection: { provider: 'alpha', model: 'pro' } })
    await settings.save('')
    expect(bodies[1]).toEqual({ action: 'write', provider: null, model: null })
    expect(settings.store.getSnapshot().selection).toBeNull()
    settings.dispose()
    vi.unstubAllGlobals()
  })

  it('surfaces an unknown route and a missing host as stable error codes', async () => {
    const fetch = vi.fn(async () => reply(400, { ok: false, error: 'UNKNOWN_MODEL' }))
    vi.stubGlobal('fetch', fetch)
    const settings = createSynthesisSettings({ catalog })
    await settings.save('alpha\u0000pro')
    expect(settings.store.getSnapshot()).toMatchObject({ error: 'UNKNOWN_MODEL', saved: false })
    settings.dispose()

    const outdated = createSynthesisSettings({ catalog })
    vi.stubGlobal('fetch', vi.fn(async () => reply(404, { ok: false, error: 'missing' })))
    outdated.start()
    await vi.waitFor(() => expect(outdated.store.getSnapshot().status).toBe('error'))
    expect(outdated.store.getSnapshot().error).toBe('HOST_OUTDATED')
    outdated.dispose()
    vi.unstubAllGlobals()
  })

  it('degrades to the fallback when the client catalog is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { ok: true, selection: null })))
    const settings = createSynthesisSettings({ catalog: async () => { throw new Error('no remote') } })
    settings.start()
    await vi.waitFor(() => expect(settings.store.getSnapshot().catalogStatus).toBe('unavailable'))
    expect(settings.store.getSnapshot().options).toEqual([])
    settings.dispose()
    vi.unstubAllGlobals()
  })
})
