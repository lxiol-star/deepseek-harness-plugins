import { describe, expect, it } from 'vitest'
import { createManagerRoutes } from '../src/host/manager/routes.ts'
import { PROJECT_COORDINATOR_PATH, ProjectCoordinatorError } from '../src/shared/manager.ts'
import type { ProjectCoordinatorResponse } from '../src/shared/manager.ts'

/**
 * Build manager routes whose coordinator handler records the request.
 * @param handler - project coordinator handler under test.
 * @returns the route entry and the handler mock.
 */
function setup(handler?: (body: unknown) => Promise<ProjectCoordinatorResponse>) {
  const calls: unknown[] = []
  const routes = createManagerRoutes({
    state: async () => { throw new Error('unused') },
    selection: async () => { throw new Error('unused') },
    task: async () => { throw new Error('unused') },
    wake: async () => { throw new Error('unused') },
    projectCoordinator: async (body) => {
      calls.push(body)
      return handler === undefined
        ? { projectKey: 'github.com/me/i-ai-gw', label: 'i-ai-gw', sessionId: 'session-1', workspaceId: 'wa', created: true }
        : await handler(body)
    },
    warn: () => {},
  })
  return { route: routes.find(candidate => candidate.path === PROJECT_COORDINATOR_PATH), calls }
}

describe('project coordinator route', () => {
  it('forwards the project key and returns the coordinator identity', async () => {
    const { route, calls } = setup()
    if (route === undefined) throw new Error('missing route')
    const response = await route.fetch(new Request(`http://board${PROJECT_COORDINATOR_PATH}`, {
      method: 'POST', body: JSON.stringify({ projectKey: 'github.com/me/i-ai-gw' }),
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, label: 'i-ai-gw', sessionId: 'session-1', created: true })
    expect(calls[0]).toEqual({ projectKey: 'github.com/me/i-ai-gw' })
  })

  it('contains a handler failure as a 400', async () => {
    const { route } = setup(async () => { throw new Error('unknown project') })
    if (route === undefined) throw new Error('missing route')
    const response = await route.fetch(new Request(`http://board${PROJECT_COORDINATOR_PATH}`, {
      method: 'POST', body: JSON.stringify({ projectKey: 'github.com/me/nope' }),
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, error: 'PROJECT_COORDINATOR_FAILED' })
  })

  it('keeps a classified bad request a 400 with its stable code', async () => {
    const { route } = setup(async () => {
      throw new ProjectCoordinatorError(400, 'PROJECT_INVALID', 'projectKey is unusable')
    })
    if (route === undefined) throw new Error('missing route')
    const response = await route.fetch(new Request(`http://board${PROJECT_COORDINATOR_PATH}`, {
      method: 'POST', body: JSON.stringify({ projectKey: '' }),
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, error: 'PROJECT_INVALID' })
  })

  it('reports a server-side provisioning failure as a 500', async () => {
    const { route } = setup(async () => {
      throw new ProjectCoordinatorError(500, 'COORDINATOR_UNAVAILABLE', 'session controller failed')
    })
    if (route === undefined) throw new Error('missing route')
    const response = await route.fetch(new Request(`http://board${PROJECT_COORDINATOR_PATH}`, {
      method: 'POST', body: JSON.stringify({ projectKey: 'github.com/me/i-ai-gw' }),
    }))
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ ok: false, error: 'COORDINATOR_UNAVAILABLE' })
  })
})
