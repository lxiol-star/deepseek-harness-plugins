import { describe, expect, it, vi } from 'vitest'
import { createSynthesisSettings } from '../src/client/synthesis-settings.ts'
import { createBoardRoutes, BOARD_SYNTHESIS_MODEL_PATH } from '../src/host/routes.ts'
import type { SynthesisModelStore } from '../src/host/routes.ts'
import type { WikiArchiver } from '../src/host/wiki-archive.ts'
import { listSynthesisCatalog } from '../src/host/model-service.ts'
import type { SynthesisModelPref } from '../src/shared/synthesis.ts'
import { EMPTY_FEED } from '../src/shared/types.ts'
import {
  formatContextWindow,
  optionByValue,
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
  {
    id: 'alpha',
    name: 'Alpha',
    models: [
      {
        id: 'pro',
        name: 'Pro',
        contextWindow: 262144,
        reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }], defaultEffort: 'high' },
      },
      { id: 'pro', name: 'Pro duplicate' },
    ],
  },
]

describe('synthesis preference wire model', () => {
  it('normalizes a half-filled or malformed stored value to the Wiki fallback', () => {
    expect(parseSynthesisPref({ model: 'm', provider: 'p' })).toEqual({ model: 'm', provider: 'p', reasoningEffort: null })
    expect(parseSynthesisPref({ model: 'm', provider: 'p', reasoningEffort: 'high' })).toEqual({ model: 'm', provider: 'p', reasoningEffort: 'high' })
    expect(parseSynthesisPref({ model: 'm', provider: 'p', reasoningEffort: 'bad\neffort' })).toEqual({ model: 'm', provider: 'p', reasoningEffort: null })
    expect(parseSynthesisPref({ model: 'm', provider: null, reasoningEffort: 'high' })).toEqual({ model: null, provider: null, reasoningEffort: null })
    expect(parseSynthesisPref({ model: null, provider: 'p' })).toEqual({ model: null, provider: null, reasoningEffort: null })
    expect(parseSynthesisPref({ model: '', provider: 'p' })).toEqual({ model: null, provider: null, reasoningEffort: null })
    expect(parseSynthesisPref({ model: 'm\nx', provider: 'p' })).toEqual({ model: null, provider: null, reasoningEffort: null })
    expect(parseSynthesisPref({ model: 'm', provider: 'p'.repeat(201) })).toEqual({ model: null, provider: null, reasoningEffort: null })
    expect(parseSynthesisPref(undefined)).toEqual({ model: null, provider: null, reasoningEffort: null })
  })

  it('projects a preference onto a concrete route only when both parts are present', () => {
    expect(selectionOf({ model: 'm', provider: 'p', reasoningEffort: null })).toEqual({ provider: 'p', model: 'm', reasoningEffort: null })
    expect(selectionOf({ model: 'm', provider: 'p', reasoningEffort: 'high' })).toEqual({ provider: 'p', model: 'm', reasoningEffort: 'high' })
    expect(selectionOf({ model: null, provider: null, reasoningEffort: null })).toBeNull()
    expect(sameSynthesisPref(
      { model: 'm', provider: 'p', reasoningEffort: 'high' },
      { model: 'm', provider: 'p', reasoningEffort: 'high' },
    )).toBe(true)
    expect(sameSynthesisPref(
      { model: 'm', provider: 'p', reasoningEffort: 'high' },
      { model: 'm', provider: 'p', reasoningEffort: null },
    )).toBe(false)
    expect(sameSynthesisPref(
      { model: 'm', provider: 'p', reasoningEffort: null },
      { model: null, provider: null, reasoningEffort: null },
    )).toBe(false)
  })

  it('accepts only a successful route response and keeps the fallback shape', () => {
    expect(parseSynthesisModelResponse({ ok: true, selection: null })).toEqual({ model: null, provider: null, reasoningEffort: null })
    expect(parseSynthesisModelResponse({ ok: true, selection: { provider: 'p', model: 'm' } })).toEqual({ model: 'm', provider: 'p', reasoningEffort: null })
    expect(parseSynthesisModelResponse({ ok: true, selection: { provider: 'p', model: 'm', reasoningEffort: 'high' } })).toEqual({ model: 'm', provider: 'p', reasoningEffort: 'high' })
    expect(parseSynthesisModelResponse({ ok: false, error: 'UNKNOWN_MODEL' })).toBeNull()
    expect(parseSynthesisModelResponse({ ok: true })).toBeNull()
    expect(parseSynthesisModelResponse('nope')).toBeNull()
  })
})

describe('model catalog → picker rows', () => {
  it('parses provider groups defensively and keeps disclosed context windows', () => {
    const groups = parseCatalogGroups(catalog)
    expect(groups.map(group => group.id)).toEqual(['zeta', 'alpha'])
    expect(groups[1]?.models[0]).toEqual({
      id: 'pro',
      name: 'Pro',
      contextWindow: 262144,
      reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }], defaultEffort: 'high' },
    })
    expect(parseCatalogGroups([{ id: '', models: [] }, 'x', { name: 'no id' }])).toEqual([])
  })

  it('drops malformed or duplicate reasoning efforts and keeps only a known default', () => {
    const groups = parseCatalogGroups([{
      id: 'alpha',
      models: [{
        id: 'pro',
        reasoning: {
          efforts: [
            { id: 'high', name: 'High' },
            { id: 'high', name: 'Duplicate' },
            { id: '', name: 'blank' },
            { id: 'bad\nid', name: 'newline' },
            { id: 'low' },
          ],
          defaultEffort: 'missing',
        },
      }],
    }])
    expect(groups[0]?.models[0]?.reasoning).toEqual({ efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'low' }] })
    expect(parseCatalogGroups([{ id: 'alpha', models: [{ id: 'm', reasoning: { efforts: [] } }] }])[0]?.models[0]).toEqual({ id: 'm', name: 'm' })
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
    expect(forward[0]?.reasoningEfforts).toEqual([{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }])
    expect(forward[0]?.defaultEffort).toBe('high')
    expect(forward[1]?.reasoningEfforts).toEqual([])
    expect(forward[1]?.defaultEffort).toBeNull()
  })

  it('finds one row by encoded value and reads its efforts', () => {
    const options = synthesisModelOptions(parseCatalogGroups(catalog))
    expect(optionByValue(options, options[0]!.value)?.model).toBe('pro')
    expect(optionByValue(options, '') ?? null).toBeNull()
    expect(optionByValue(options, 'provider\u0000missing')).toBeNull()
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

  const fixture = (initial: SynthesisModelPref = { model: null, provider: null, reasoningEffort: null }) => {
    let stored = initial
    const store = {
      read: () => stored,
      write: async (pref: SynthesisModelPref) => { stored = pref },
      validate: async (selection: { provider: string; model: string; reasoningEffort?: string | null }) => {
        if (selection.provider !== 'alpha' || selection.model !== 'pro') return 'UNKNOWN_MODEL' as const
        if (selection.reasoningEffort === undefined || selection.reasoningEffort === null) return 'ok' as const
        return selection.reasoningEffort === 'high' ? 'ok' as const : 'UNKNOWN_EFFORT' as const
      },
      catalog: async () => [{ id: 'alpha', name: 'Alpha', models: [{ id: 'pro', name: 'Pro' }] }],
    }
    return { route: route(store), stored: () => stored }
  }

  it('reads the current route with its reasoning effort', async () => {
    const { route: handler } = fixture({ model: 'pro', provider: 'alpha', reasoningEffort: 'high' })
    const response = await handler.fetch(request({ action: 'read' }))
    expect(response.status).toBe(200)
    expect((await response.json()).selection).toEqual({ provider: 'alpha', model: 'pro', reasoningEffort: 'high' })
  })

  it('writes a known route and reads the saved value back', async () => {
    const { route: handler, stored } = fixture()
    const saved = await handler.fetch(request({ action: 'write', provider: 'alpha', model: 'pro' }))
    expect(saved.status).toBe(200)
    expect((await saved.json()).selection).toEqual({ provider: 'alpha', model: 'pro', reasoningEffort: null })
    expect(stored()).toEqual({ provider: 'alpha', model: 'pro', reasoningEffort: null })
  })

  it('writes a known reasoning effort together with its route', async () => {
    const { route: handler, stored } = fixture()
    const saved = await handler.fetch(request({ action: 'write', provider: 'alpha', model: 'pro', reasoningEffort: 'high' }))
    expect(saved.status).toBe(200)
    expect((await saved.json()).selection).toEqual({ provider: 'alpha', model: 'pro', reasoningEffort: 'high' })
    expect(stored()).toEqual({ provider: 'alpha', model: 'pro', reasoningEffort: 'high' })
  })

  it('writes the null/null fallback explicitly', async () => {
    const { route: handler, stored } = fixture({ model: 'pro', provider: 'alpha', reasoningEffort: 'high' })
    const saved = await handler.fetch(request({ action: 'write', provider: null, model: null }))
    expect(saved.status).toBe(200)
    expect(stored()).toEqual({ provider: null, model: null, reasoningEffort: null })
  })

  it('rejects an unknown route or effort and leaves the stored value untouched', async () => {
    const { route: handler, stored } = fixture({ model: 'pro', provider: 'alpha', reasoningEffort: 'high' })
    const unknownModel = await handler.fetch(request({ action: 'write', provider: 'alpha', model: 'ghost' }))
    expect(unknownModel.status).toBe(400)
    expect((await unknownModel.json()).error).toBe('UNKNOWN_MODEL')
    const unknownEffort = await handler.fetch(request({ action: 'write', provider: 'alpha', model: 'pro', reasoningEffort: 'max' }))
    expect(unknownEffort.status).toBe(400)
    expect((await unknownEffort.json()).error).toBe('UNKNOWN_EFFORT')
    expect(stored()).toEqual({ provider: 'alpha', model: 'pro', reasoningEffort: 'high' })
  })

  it('rejects half-filled, malformed, and unknown-action bodies', async () => {
    const { route: handler } = fixture()
    const invalid = [
      { action: 'write', provider: 'alpha', model: null },
      { action: 'write', provider: null, model: 'pro' },
      { action: 'write', provider: 1, model: 'pro' },
      { action: 'write', provider: 'alpha', model: 'pro', reasoningEffort: 7 },
      { action: 'delete' },
      [],
    ]
    for (const body of invalid) expect((await handler.fetch(request(body))).status).toBe(400)
    expect((await handler.fetch(request({ action: 'read', extra: true }))).status).toBe(200)
  })

  it('serves the host model catalog for the settings page', async () => {
    const { route: handler } = fixture()
    const response = await handler.fetch(request({ action: 'catalog' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, groups: [{ id: 'alpha', name: 'Alpha', models: [{ id: 'pro', name: 'Pro' }] }] })
  })

  it('answers CATALOG_UNAVAILABLE when the host catalog read fails', async () => {
    const handler = route({
      read: () => ({ model: null, provider: null, reasoningEffort: null }),
      write: async () => {},
      validate: async () => 'ok',
      catalog: async () => { throw new Error('llm offline') },
    })
    const response = await handler.fetch(request({ action: 'catalog' }))
    expect(response.status).toBe(500)
    expect((await response.json()).error).toBe('CATALOG_UNAVAILABLE')
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
      read: () => ({ model: null, provider: null, reasoningEffort: null }),
      write: async () => { throw new Error('disk full') },
      validate: async () => 'ok',
      catalog: async () => [],
    })
    const response = await failing.fetch(request({ action: 'write', provider: 'alpha', model: 'pro' }))
    expect(response.status).toBe(500)
    expect((await response.json()).error).toBe('STORE_UNAVAILABLE')
  })
})

describe('host model catalog', () => {
  const llm = {
    listProviders: () => [{ id: 'alpha', name: 'Alpha' }, { id: 'ghost', name: '' }],
    listModels: async (provider: string) => {
      if (provider === 'alpha') {
        return [
          { provider: 'alpha', id: 'pro', name: 'Pro' },
          { provider: 'alpha', id: 'plain', name: '' },
          { provider: 'alpha', id: '', name: 'blank' },
        ]
      }
      throw new Error('unadvertised')
    },
    resolveModelInfo: async (provider: string, model: string) => {
      if (provider === 'alpha' && model === 'pro') {
        return { reasoning: { efforts: [{ id: 'high', name: 'High' }, { id: 'high', name: 'Duplicate' }, { id: '', name: '' }], defaultEffort: 'high' } }
      }
      throw new Error('no metadata')
    },
    stream: async function* () { /* unused */ },
  }

  it('maps advertised providers, models and reasoning efforts into picker groups', async () => {
    await expect(listSynthesisCatalog(llm)).resolves.toEqual([
      {
        id: 'alpha',
        name: 'Alpha',
        models: [
          { id: 'pro', name: 'Pro', reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' } },
          { id: 'plain', name: 'plain' },
        ],
      },
      { id: 'ghost', name: 'ghost', models: [] },
    ])
  })

  it('keeps the group when one provider listing fails', async () => {
    const partial = { ...llm, listProviders: () => [{ id: 'alpha', name: 'Alpha' }, { id: 'ghost', name: 'Ghost' }] }
    const groups = await listSynthesisCatalog(partial)
    expect(groups.map(group => [group.id, group.models.length])).toEqual([['alpha', 2], ['ghost', 0]])
  })
})

describe('settings controller', () => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const catalog = async () => catalogGroups()
  const catalogGroups = () => [{
    id: 'alpha',
    name: 'Alpha',
    models: [{ id: 'pro', name: 'Pro', reasoning: { efforts: [{ id: 'high', name: 'High' }] } }],
  }]

  it('loads the saved route and the model catalog on start', async () => {
    const fetch = vi.fn(async () => reply(200, { ok: true, selection: { provider: 'alpha', model: 'pro', reasoningEffort: 'high' } }))
    vi.stubGlobal('fetch', fetch)
    const settings = createSynthesisSettings({ catalog })
    settings.start()
    await vi.waitFor(() => expect(settings.store.getSnapshot().catalogStatus).toBe('ready'))
    const state = settings.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.selection).toEqual({ provider: 'alpha', model: 'pro', reasoningEffort: 'high' })
    expect(state.options.map(option => option.model)).toEqual(['pro'])
    expect(state.options[0]?.reasoningEfforts).toEqual([{ id: 'high', name: 'High' }])
    settings.dispose()
    vi.unstubAllGlobals()
  })

  it('saves a route, its effort, and the explicit fallback with the right request bodies', async () => {
    const bodies: unknown[] = []
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      const body = JSON.parse(String(init?.body)) as { model: string | null; reasoningEffort?: string | null }
      return reply(200, {
        ok: true,
        selection: body.model === null ? null : { provider: 'alpha', model: 'pro', reasoningEffort: body.reasoningEffort ?? null },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const settings = createSynthesisSettings({ catalog })
    await settings.save('alpha\u0000pro')
    expect(bodies[0]).toEqual({ action: 'write', provider: 'alpha', model: 'pro', reasoningEffort: null })
    expect(settings.store.getSnapshot()).toMatchObject({ saved: true, selection: { provider: 'alpha', model: 'pro', reasoningEffort: null } })
    await settings.save('alpha\u0000pro', 'high')
    expect(bodies[1]).toEqual({ action: 'write', provider: 'alpha', model: 'pro', reasoningEffort: 'high' })
    expect(settings.store.getSnapshot()).toMatchObject({ selection: { provider: 'alpha', model: 'pro', reasoningEffort: 'high' } })
    await settings.save('')
    expect(bodies[2]).toEqual({ action: 'write', provider: null, model: null, reasoningEffort: null })
    expect(settings.store.getSnapshot().selection).toBeNull()
    settings.dispose()
    vi.unstubAllGlobals()
  })

  it('surfaces unknown routes, unknown efforts, and a missing host as stable codes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(400, { ok: false, error: 'UNKNOWN_MODEL' })))
    const settings = createSynthesisSettings({ catalog })
    await settings.save('alpha\u0000pro')
    expect(settings.store.getSnapshot()).toMatchObject({ error: 'UNKNOWN_MODEL', saved: false })
    settings.dispose()

    vi.stubGlobal('fetch', vi.fn(async () => reply(400, { ok: false, error: 'UNKNOWN_EFFORT' })))
    const effort = createSynthesisSettings({ catalog })
    await effort.save('alpha\u0000pro', 'max')
    expect(effort.store.getSnapshot().error).toBe('UNKNOWN_EFFORT')
    effort.dispose()

    const outdated = createSynthesisSettings({ catalog })
    vi.stubGlobal('fetch', vi.fn(async () => reply(404, { ok: false, error: 'missing' })))
    outdated.start()
    await vi.waitFor(() => expect(outdated.store.getSnapshot().status).toBe('error'))
    expect(outdated.store.getSnapshot().error).toBe('HOST_OUTDATED')
    outdated.dispose()
    vi.unstubAllGlobals()
  })

  it('reads the catalog from the plugin host route by default', async () => {
    const bodies: unknown[] = []
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { action?: string }
      bodies.push(body)
      if (body.action === 'catalog') return reply(200, { ok: true, groups: catalogGroups() })
      return reply(200, { ok: true, selection: { provider: 'alpha', model: 'pro' } })
    })
    vi.stubGlobal('fetch', fetch)
    const settings = createSynthesisSettings()
    settings.start()
    await vi.waitFor(() => expect(settings.store.getSnapshot().catalogStatus).toBe('ready'))
    expect(settings.store.getSnapshot().options.map(option => option.model)).toEqual(['pro'])
    expect(bodies).toContainEqual({ action: 'catalog' })
    settings.dispose()
    vi.unstubAllGlobals()
  })

  it('degrades to the fallback when the model catalog is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, { ok: true, selection: null })))
    const settings = createSynthesisSettings({ catalog: async () => { throw new Error('no remote') } })
    settings.start()
    await vi.waitFor(() => expect(settings.store.getSnapshot().catalogStatus).toBe('unavailable'))
    expect(settings.store.getSnapshot().options).toEqual([])
    settings.dispose()
    vi.unstubAllGlobals()
  })
})
