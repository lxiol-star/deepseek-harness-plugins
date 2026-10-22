import { describe, expect, it, vi } from 'vitest'
import { createManagerRoutes } from '../src/host/manager/routes.ts'
import { MANAGER_WAKE_PATH } from '../src/shared/manager.ts'
import type { ManagerWakeResponse, ManagerWakeStatus } from '../src/shared/manager.ts'

const wake: ManagerWakeStatus = {
  enabled: true, pending: 2, urgent: 1, attention: 0, completed: 1,
  wakesThisHour: 1, suppressed: 0,
}

/**
 * Build the manager routes with one wake handler; the other routes are unused.
 * @param wakeHandler - wake handler under test.
 * @returns the wake route entry.
 */
function wakeRoute(wakeHandler: (body: unknown) => Promise<ManagerWakeResponse>) {
  const routes = createManagerRoutes({
    state: async () => { throw new Error('unused') },
    selection: async () => { throw new Error('unused') },
    task: async () => { throw new Error('unused') },
    wake: wakeHandler,
    warn: () => {},
  })
  return routes.find(route => route.path === MANAGER_WAKE_PATH)
}

/**
 * POST one JSON body to the wake route.
 * @param body - request body (serialized unless a string is passed).
 * @returns status and parsed payload.
 */
async function post(body: unknown): Promise<{ status: number; payload: Record<string, unknown> }> {
  const route = wakeRoute(async (raw) => {
    const action = typeof raw === 'object' && raw !== null ? (raw as { action?: unknown }).action : undefined
    if (action !== 'enable' && action !== 'disable' && action !== 'now') throw new Error('wake.action invalid')
    return { wake }
  })
  if (route === undefined) throw new Error('missing wake route')
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const response = await route.fetch(new Request(`http://board${MANAGER_WAKE_PATH}`, { method: 'POST', body: text }))
  return { status: response.status, payload: (await response.json()) as Record<string, unknown> }
}

describe('manager wake route', () => {
  it('forwards the action and returns the resulting wake status', async () => {
    const answer = await post({ action: 'now' })
    expect(answer.status).toBe(200)
    expect(answer.payload).toMatchObject({ ok: true, wake: { enabled: true, pending: 2 } })
  })

  it('rejects an unknown or missing action with the contained error code', async () => {
    for (const body of [{ action: 'explode' }, {}, 'not-json']) {
      const answer = await post(body)
      expect(answer.status).toBe(400)
      expect(answer.payload).toMatchObject({ ok: false, error: 'WAKE_INVALID' })
    }
  })

  it('reports the invalid action through the contained warning sink', async () => {
    const warn = vi.fn()
    const routes = createManagerRoutes({
      state: async () => { throw new Error('unused') },
      selection: async () => { throw new Error('unused') },
      task: async () => { throw new Error('unused') },
      wake: async () => { throw new Error('bad action') },
      warn,
    })
    const route = routes.find(candidate => candidate.path === MANAGER_WAKE_PATH)
    if (route === undefined) throw new Error('missing wake route')
    const response = await route.fetch(new Request(`http://board${MANAGER_WAKE_PATH}`, { method: 'POST', body: '{"action":"now"}' }))
    expect(response.status).toBe(400)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
