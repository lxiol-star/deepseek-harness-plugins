import { describe, expect, it, vi } from 'vitest'
import { BOARD_WIKI_CONFIG_PATH, createBoardRoutes } from '../src/host/routes.ts'
import { WikiConfigError, type WikiSettingsFace } from '../src/host/wiki-config.ts'
import { DEFAULT_WIKI_CONFIG, WIKI_CONFIG_PATH, wikiDefaults, type WikiConfigResponse } from '../src/shared/wiki.ts'
import { EMPTY_FEED } from '../src/shared/types.ts'
import type { WikiArchiver } from '../src/host/wiki-archive.ts'

const archiver: WikiArchiver = { preview: vi.fn(), commit: vi.fn(), close: vi.fn() }
const sample = (): WikiConfigResponse => ({ config: { ...DEFAULT_WIKI_CONFIG }, defaults: wikiDefaults('/home/user'), status: null })

/**
 * Build routes with one Wiki settings face, then find the config route.
 * @param face - Wiki settings face under test.
 * @returns the route entry point.
 */
function routesWith(face?: WikiSettingsFace) {
  const routes = createBoardRoutes({
    snapshot: () => EMPTY_FEED,
    ack: async () => true,
    wikiArchive: archiver,
    ...(face === undefined ? {} : { wikiSettings: face }),
    requestRejection: () => undefined,
    warn: () => {},
  })
  return { routes, route: routes.fetchRoutes.find(candidate => candidate.path === BOARD_WIKI_CONFIG_PATH) }
}

/**
 * Invoke one route with a JSON body.
 * @param route - route under test.
 * @param body - request body.
 * @returns status and parsed payload.
 */
async function post(route: NonNullable<ReturnType<typeof routesWith>['route']>, body: unknown): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await route.fetch(new Request(`http://board${route.path}`, { method: 'POST', body: JSON.stringify(body) }))
  return { status: response.status, payload: (await response.json()) as Record<string, unknown> }
}

describe('wiki config route', () => {
  it('answers 503 when the running host predates the route', async () => {
    const { route } = routesWith()
    expect(route).toBeDefined()
    const answer = await post(route!, { action: 'read' })
    expect(answer.status).toBe(503)
    expect(answer.payload.error).toBe('HOST_OUTDATED')
  })

  it('reads, writes, resets and probes through the settings face', async () => {
    const read = vi.fn(async () => sample())
    const write = vi.fn(async () => sample())
    const reset = vi.fn(async () => sample())
    const probe = vi.fn(async () => ({ ok: true, issues: [], python: '3.9.6', pythonExecutable: '/usr/bin/python3', engine: { dir: '/e', scripts: [] }, schema: { path: '/w/SCHEMA.md', bytes: 1 }, wikiRoot: { path: '/w', exists: true }, state: { path: '/w/state' }, operations: [] }))
    const { route } = routesWith({ read, write, reset, probe })
    expect((await post(route!, { action: 'read' })).status).toBe(200)
    expect(read).toHaveBeenCalledTimes(1)
    expect((await post(route!, { action: 'write', config: DEFAULT_WIKI_CONFIG })).status).toBe(200)
    expect(write).toHaveBeenCalledWith(DEFAULT_WIKI_CONFIG)
    expect((await post(route!, { action: 'reset' })).status).toBe(200)
    expect(reset).toHaveBeenCalledTimes(1)
    const probed = await post(route!, { action: 'probe' })
    expect(probingStatus(probed.payload)).toBe(true)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('turns a rejected write into 400 with field codes', async () => {
    const write = vi.fn(async () => { throw new WikiConfigError(['INVALID_WIKI_ROOT']) })
    const { route } = routesWith({ read: vi.fn(async () => sample()), write, reset: vi.fn(async () => sample()), probe: vi.fn(async () => { throw new Error('unused') }) })
    const answer = await post(route!, { action: 'write', config: { ...DEFAULT_WIKI_CONFIG, wikiRoot: 'relative' } })
    expect(answer.status).toBe(400)
    expect(answer.payload).toMatchObject({ ok: false, error: 'INVALID_CONFIG', errors: ['INVALID_WIKI_ROOT'] })
  })

  it('exposes the route constant the client uses', () => {
    expect(BOARD_WIKI_CONFIG_PATH).toBe(WIKI_CONFIG_PATH)
  })
})

/**
 * Whether a probe payload carries a status object.
 * @param payload - parsed response.
 * @returns true when `status` is an object.
 */
function probingStatus(payload: Record<string, unknown>): boolean {
  return typeof payload.status === 'object' && payload.status !== null
}
