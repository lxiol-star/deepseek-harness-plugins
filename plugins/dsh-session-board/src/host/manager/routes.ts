/**
 * Authenticated JSON routes for the manager panel.
 *
 * They are registered through `connection.fetch`, so the connection service
 * applies the Host/Origin trust fence and browser authentication exactly like
 * the board's existing routes. Every handler answers `{ ok, ... }`, maps a
 * thrown Error to a contained 4xx/5xx, and never rejects past the boundary.
 */
import type { ManagerSelectionResponse, ManagerStateView, ManagerTaskResponse, ManagerWakeResponse, ProjectCoordinatorResponse } from '../../shared/manager.ts'
import type { BoardFetchRoute } from '../routes.ts'
import { MANAGER_SELECTION_PATH, MANAGER_STATE_PATH, MANAGER_TASK_PATH, MANAGER_WAKE_PATH, PROJECT_COORDINATOR_PATH, ProjectCoordinatorError } from '../../shared/manager.ts'

/** Route handlers, implemented by the plugin wiring over the manager service. */
export interface ManagerRouteHandlers {
  /** Provision/read the manager state (may create the manager session on first call). */
  state(): Promise<ManagerStateView>
  /** Persist the panel selection mirror. */
  selection(body: unknown): Promise<ManagerSelectionResponse>
  /** Create or update one task. */
  task(body: unknown): Promise<ManagerTaskResponse>
  /** Enable/disable automatic wakeups or deliver one digest immediately. */
  wake(body: unknown): Promise<ManagerWakeResponse>
  /** Open (creating on first use) one project's coordinator session. */
  projectCoordinator(body: unknown): Promise<ProjectCoordinatorResponse>
  /** Contained warning sink. */
  warn(message: string): void
}

/** One JSON response. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** Read one JSON request body; a malformed body becomes `undefined`. */
async function readJsonBody(request: Request): Promise<unknown> {
  try {
    const text = await request.text()
    if (text.trim() === '') return undefined
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** Error-to-line helper. */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/** Build the three manager routes over the given handlers. */
export function createManagerRoutes(handlers: ManagerRouteHandlers): readonly BoardFetchRoute[] {
  const stateRoute: BoardFetchRoute = {
    path: MANAGER_STATE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      try {
        return jsonResponse(200, { ok: true, state: await handlers.state() })
      } catch (error) {
        handlers.warn(`dsh-session-board: manager state failed: ${describe(error)}`)
        return jsonResponse(500, { ok: false, error: 'MANAGER_STATE_UNAVAILABLE' })
      }
    },
  }
  const selectionRoute: BoardFetchRoute = {
    path: MANAGER_SELECTION_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const result = await handlers.selection(await readJsonBody(request))
        return jsonResponse(200, { ok: true, ...result })
      } catch (error) {
        handlers.warn(`dsh-session-board: manager selection failed: ${describe(error)}`)
        return jsonResponse(400, { ok: false, error: 'SELECTION_INVALID' })
      }
    },
  }
  const taskRoute: BoardFetchRoute = {
    path: MANAGER_TASK_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const result = await handlers.task(await readJsonBody(request))
        return jsonResponse(200, { ok: true, ...result })
      } catch (error) {
        handlers.warn(`dsh-session-board: manager task failed: ${describe(error)}`)
        return jsonResponse(400, { ok: false, error: 'TASK_INVALID' })
      }
    },
  }
  const wakeRoute: BoardFetchRoute = {
    path: MANAGER_WAKE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        return jsonResponse(200, { ok: true, ...(await handlers.wake(await readJsonBody(request))) })
      } catch (error) {
        handlers.warn(`dsh-session-board: manager wake failed: ${describe(error)}`)
        return jsonResponse(400, { ok: false, error: 'WAKE_INVALID' })
      }
    },
  }
  const coordinatorRoute: BoardFetchRoute = {
    path: PROJECT_COORDINATOR_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        return jsonResponse(200, { ok: true, ...(await handlers.projectCoordinator(await readJsonBody(request))) })
      } catch (error) {
        handlers.warn(`dsh-session-board: project coordinator failed: ${describe(error)}`)
        // A handler that classifies its failure keeps its wire status and code;
        // anything else is a contained bad request.
        if (error instanceof ProjectCoordinatorError) {
          return jsonResponse(error.status, { ok: false, error: error.code })
        }
        return jsonResponse(400, { ok: false, error: 'PROJECT_COORDINATOR_FAILED' })
      }
    },
  }
  return [stateRoute, selectionRoute, taskRoute, wakeRoute, coordinatorRoute]
}
