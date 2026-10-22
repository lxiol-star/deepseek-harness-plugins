/**
 * Manager wiring: opens the manager domain, subscribes the event sources the
 * mux folds, installs the routes, and attaches manager tools to the resident
 * Agent on creation AND cold resume.
 *
 * This module is registered through a nested `ctx.inject([...])` in the plugin
 * entry, so a profile without the session/workspace/agent services simply
 * never runs it — the board half keeps working.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: brings the `session/event` and `agent/*` Events declarations into
// the listener types below. Erased at build time.
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type { BoardFetchRoute } from '../routes.ts'
import type { DomainSpec, DomainTableSpec } from '../domain.ts'
import { MANAGER_STATE_TABLE, MANAGER_TASK_TABLE, managerDomainSpec } from './domain.ts'
import type { ManagerStateRecord, ManagerTaskRecord } from './domain.ts'
import { EventMux } from './mux.ts'
import { ManagerService, defaultManagerDir } from './service.ts'
import type { ManagerTable } from './service.ts'
import { createManagerRoutes } from './routes.ts'

/** Table value type recovered from a domain spec declaration. */
type TableValueOf<S, N extends keyof S & string> =
  S[N] extends DomainTableSpec<infer V> ? V : never

/** Structural slice of the host `storageDomain` service. */
export interface ManagerStorageDomain {
  open<S extends DomainSpec>(spec: S): Promise<{
    table<N extends keyof S['tables'] & string>(name: N): ManagerTable<TableValueOf<S['tables'], N>>
    close(): Promise<void>
  }>
}

/** Structural slice of the host `connection` service. */
export interface ManagerConnection {
  readonly fetch: { register(route: BoardFetchRoute): () => Promise<void> | void }
}

/** Options for {@link startManager}. */
export interface ManagerWiringOptions {
  /** Nested context that already carries the host services in `inject`. */
  readonly ctx: Context
  readonly storageDomain: ManagerStorageDomain
  readonly connection: ManagerConnection
  readonly warn: (message: string) => void
  /** Test seam: override the manager workspace directory. */
  readonly managerDir?: string
}

/**
 * Start the manager subsystem once the host services are present.
 * @param options - nested context plus the two carrier services.
 */
export function startManager(options: ManagerWiringOptions): void {
  const { ctx, storageDomain, connection, warn } = options
  const mux = new EventMux()

  void (async (): Promise<void> => {
    let service: ManagerService
    try {
      const domain = await storageDomain.open(managerDomainSpec)
      ctx.effect(() => () => domain.close(), 'dsh-session-board: manager domain')
      const stateTable = domain.table(MANAGER_STATE_TABLE)
      const taskTable = domain.table(MANAGER_TASK_TABLE)
      service = new ManagerService({
        ctx,
        state: stateTable as unknown as ManagerTable<ManagerStateRecord>,
        tasks: taskTable as unknown as ManagerTable<ManagerTaskRecord>,
        mux,
        managerDir: options.managerDir ?? defaultManagerDir(),
        warn,
      })
      ctx.effect(() => () => service.dispose(), 'dsh-session-board: manager service')
    } catch (error) {
      warn(`dsh-session-board: manager store unavailable, manager panel disabled: ${describe(error)}`)
      return
    }

    // Routes first: state/selection/task are the panel's only Host surface.
    const routes = createManagerRoutes({
      state: async () => {
        try {
          await service.ensure()
        } catch {
          // `view()` carries the contained error; the panel shows it and retries.
        }
        return service.view()
      },
      selection: async raw => await service.writeSelection(raw),
      task: async raw => await service.task(readTaskRequest(raw)),
      wake: async raw => ({ wake: await service.wake(raw) }),
      warn,
    })
    for (const route of routes) {
      ctx.effect(() => connection.fetch.register(route), `dsh-session-board: ${route.path}`)
    }

    // Readiness sources. `session/event` is post-commit, so folding it here is
    // exactly the durable truth; agent status is the best live hint for
    // 'running' between turn events.
    ctx.on('session/event', (session, event) => {
      mux.record(session.id, event)
      service.noteEdges()
    })
    ctx.on('agent/status', ({ agent, status }) => {
      mux.agentStatus(agent.id, status)
      // The manager becoming idle is what releases a deferred digest.
      service.noteAgentStatus(agent.id, status)
    })
    ctx.on('agent/created', ({ agent }) => {
      service.installAgent(agent)
    })
    ctx.on('agent/disposed', ({ agent }) => {
      service.disposeAgent(agent.id)
      mux.remove(agent.id)
    })
  })()
}

/** Validate the untrusted `/manager/task` body at the wire boundary. */
function readTaskRequest(raw: unknown): {
  readonly action: 'create' | 'update'
  readonly task: {
    readonly id?: string
    readonly title?: string
    readonly status?: 'pending' | 'assigned' | 'running' | 'blocked' | 'done' | 'failed' | 'orphaned'
    readonly workspaceId?: string
    readonly sessionId?: string
    readonly note?: string
  }
} {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('task body must be an object')
  const body = raw as Record<string, unknown>
  const action = body.action
  if (action !== 'create' && action !== 'update') throw new Error('task.action must be create or update')
  const task = body.task
  if (typeof task !== 'object' || task === null || Array.isArray(task)) throw new Error('task.task must be an object')
  const fields = task as Record<string, unknown>
  const string = (name: string): string | undefined => {
    const value = fields[name]
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value === '') throw new Error(`task.${name} must be a non-empty string`)
    return value
  }
  const status = fields.status
  if (status !== undefined) {
    const allowed = ['pending', 'assigned', 'running', 'blocked', 'done', 'failed', 'orphaned']
    if (typeof status !== 'string' || !allowed.includes(status)) throw new Error('task.status is invalid')
  }
  const id = string('id')
  const title = string('title')
  const workspaceId = string('workspaceId')
  const sessionId = string('sessionId')
  const note = string('note')
  return {
    action,
    task: {
      ...(id === undefined ? {} : { id }),
      ...(title === undefined ? {} : { title }),
      ...(status === undefined ? {} : { status: status as 'pending' | 'assigned' | 'running' | 'blocked' | 'done' | 'failed' | 'orphaned' }),
      ...(workspaceId === undefined ? {} : { workspaceId }),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(note === undefined ? {} : { note }),
    },
  }
}

/** Error-to-line helper (contained warnings only; never rethrown). */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
