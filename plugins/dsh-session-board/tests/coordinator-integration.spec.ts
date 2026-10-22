/**
 * Independent integration regression for the project coordinator.
 *
 * Two cross-cutting seams are covered here that the unit specs leave open:
 *
 * 1. `startManager` wires the real routes over the real project store. The
 *    coordinator wire boundary (body validation, error classification, store
 *    fallback, provisioning retry/idempotency) is only exercised end-to-end
 *    through that wiring, not through a synthetic route handler.
 * 2. One configured git remote is rendered in three places — the
 *    `/workspace-meta` route, the coordinator record and the coordinator's
 *    `project_overview` lines. The same redacted value must reach all three,
 *    and the normalized project key must agree.
 *
 * Host-only integration: no DSH harness boots here, the context below is the
 * minimal structural slice the wiring reads.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MANAGER_STATE_TABLE, MANAGER_TASK_TABLE, PROJECT_COORDINATOR_TABLE, PROJECT_DOMAIN_NAME,
  type ManagerCoordinatorRecord,
} from '../src/host/manager/domain.ts'
import { EventMux } from '../src/host/manager/mux.ts'
import { ProjectCoordinators } from '../src/host/manager/projects.ts'
import type { ManagerTable } from '../src/host/manager/service.ts'
import { startManager } from '../src/host/manager/wiring.ts'
import { createWorkspaceMetaRoute, type GitFacts } from '../src/host/workspace-meta.ts'
import type { BoardFetchRoute } from '../src/host/routes.ts'
import { MANAGER_WAKE_PATH, PROJECT_COORDINATOR_PATH } from '../src/shared/manager.ts'
import { WORKSPACE_META_PATH } from '../src/shared/workspace-meta.ts'

/** One fake registered Workspace. */
interface FakeWorkspace {
  id: string
  title: string
  path: string
  sessionIds: string[]
}

/** In-memory KV table matching the manager table surface. */
function table<V>(map: Map<string, V>): ManagerTable<V> {
  return {
    get: (key: string): V | undefined => map.get(key),
    entries: (): IterableIterator<[string, V]> => map.entries(),
    put: async (key: string, value: V): Promise<void> => { map.set(key, value) },
    delete: async (key: string): Promise<boolean> => map.delete(key),
  }
}

/** The three durable tables the wiring opens. */
interface FakeStores {
  state: Map<string, unknown>
  tasks: Map<string, unknown>
  coordinators: Map<string, ManagerCoordinatorRecord>
}

/**
 * Build one fake host around `startManager` and wait until it registered its
 * routes. The manager domain always opens; the project domain can be made to
 * fail, which is how a broken project store degrades in production.
 * @param options - registry rows and project-store behavior.
 * @returns the registered routes and the observable host state.
 */
async function boot(options: { workspaces?: FakeWorkspace[]; failProjectStore?: boolean } = {}) {
  const workspaces = options.workspaces ?? []
  const stores: FakeStores = { state: new Map(), tasks: new Map(), coordinators: new Map() }
  const routes = new Map<string, BoardFetchRoute>()
  const warn = vi.fn<(message: string) => void>()
  const sessions = new Set<string>()
  const renames: Array<{ sessionId: string; title: string }> = []
  let failCreate = false
  const sessionController = {
    create: async (input: { sessionId?: string; workspaceId?: string }) => {
      if (failCreate) throw new Error('session create failed')
      const sessionId = input.sessionId ?? `session-${sessions.size + 1}`
      sessions.add(sessionId)
      return { sessionId }
    },
    inspect: async (sessionId: string) => {
      if (!sessions.has(sessionId)) throw new Error(`session "${sessionId}" not found`)
      return {}
    },
    list: async () => ({ items: [...sessions].map(sessionId => ({ sessionId })) }),
    rename: async (input: { sessionId: string; title: string }) => { renames.push(input) },
    prompt: async () => {},
  }
  const registry = {
    list: () => workspaces,
    get: (id: string) => workspaces.find(workspace => workspace.id === id),
  }
  const ctx = {
    effect: (factory: () => unknown) => { factory() },
    on: () => {},
    workspaceRegistry: registry,
    sessionController,
    agents: { get: () => undefined },
  }
  const storageDomain = {
    open: async (spec: { name: string }) => {
      if (spec.name === PROJECT_DOMAIN_NAME && options.failProjectStore === true) {
        throw new Error('project domain unavailable')
      }
      return {
        table: (name: string): ManagerTable<unknown> => {
          if (name === MANAGER_STATE_TABLE) return table(stores.state)
          if (name === MANAGER_TASK_TABLE) return table(stores.tasks)
          if (name === PROJECT_COORDINATOR_TABLE) {
            return table(stores.coordinators) as unknown as ManagerTable<unknown>
          }
          throw new Error(`unexpected table "${name}"`)
        },
        close: async () => {},
      }
    },
  }
  const connection = {
    fetch: {
      register: (route: BoardFetchRoute) => { routes.set(route.path, route); return () => {} },
    },
  }
  startManager({
    ctx: ctx as never,
    storageDomain: storageDomain as never,
    connection: connection as never,
    warn,
    managerDir: join(tmpdir(), 'sb-coordinator-test-manager'),
  })
  await vi.waitFor(() => {
    if (routes.size < 5) throw new Error(`only ${routes.size} manager routes registered`)
  })
  return {
    routes,
    stores,
    warn,
    sessions,
    renames,
    setFailCreate: (value: boolean) => { failCreate = value },
  }
}

/** POST one JSON body at the coordinator route and decode the wire answer. */
async function postCoordinator(
  routes: ReadonlyMap<string, BoardFetchRoute>,
  body: unknown,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const route = routes.get(PROJECT_COORDINATOR_PATH)
  if (route === undefined) throw new Error('coordinator route not registered')
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const response = await route.fetch(new Request(`http://board${PROJECT_COORDINATOR_PATH}`, { method: 'POST', body: text }))
  return { status: response.status, payload: await response.json() as Record<string, unknown> }
}

/** Temporary checkouts created by one test, removed afterwards. */
const tempDirs: string[] = []
/** Whether a real `git` binary is usable; the provisioning path probes one. */
const GIT_AVAILABLE = ((): boolean => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * Create a throwaway git checkout with one configured origin.
 * @param remote - raw `remote.origin.url` value.
 * @returns absolute checkout path.
 */
function tempGitCheckout(remote: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sb-coordinator-'))
  tempDirs.push(dir)
  execFileSync('git', ['init', '-q', dir], { stdio: 'ignore' })
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', remote], { stdio: 'ignore' })
  return dir
}

describe('manager wiring → project coordinator route', () => {
  it('contains an unusable body as PROJECT_INVALID and keeps the 200-char id boundary', async () => {
    const host = await boot()
    for (const body of ['not-json', '[]', {}, { projectKey: 42 }, { projectKey: '' }, { projectKey: 'x'.repeat(201) }]) {
      const answer = await postCoordinator(host.routes, body)
      expect(answer.status).toBe(400)
      expect(answer.payload).toMatchObject({ ok: false, error: 'PROJECT_INVALID' })
    }
    // Exactly at the id bound the request is well-formed; the project is just unknown.
    const boundary = await postCoordinator(host.routes, { projectKey: 'x'.repeat(200) })
    expect(boundary.status).toBe(400)
    expect(boundary.payload).toMatchObject({ ok: false, error: 'PROJECT_UNKNOWN' })
  })

  it('classifies an unknown project as a bad request, not a server fault', async () => {
    const host = await boot()
    const answer = await postCoordinator(host.routes, { projectKey: 'github.com/me/nope' })
    expect(answer.status).toBe(400)
    expect(answer.payload).toMatchObject({ ok: false, error: 'PROJECT_UNKNOWN' })
    expect(host.warn).toHaveBeenCalled()
  })

  it('reports a broken project store as COORDINATOR_UNAVAILABLE while manager routes stay up', async () => {
    const host = await boot({ failProjectStore: true })
    const answer = await postCoordinator(host.routes, { projectKey: 'github.com/me/i-ai-gw' })
    expect(answer.status).toBe(500)
    expect(answer.payload).toMatchObject({ ok: false, error: 'COORDINATOR_UNAVAILABLE' })
    // The manager panel must survive a failed project domain open.
    expect(host.routes.has(MANAGER_WAKE_PATH)).toBe(true)
    expect(host.warn.mock.calls.some(([message]) => message.includes('project coordinator store unavailable'))).toBe(true)
  })

  it.skipIf(!GIT_AVAILABLE)('retries cleanly after a failed create and then stays idempotent', async () => {
    const checkout = tempGitCheckout('https://x-access-token:TOKEN@github.com/me/i-ai-gw.git')
    const host = await boot({ workspaces: [{ id: 'wa', title: 'i-ai-gw', path: checkout, sessionIds: [] }] })
    const projectKey = 'github.com/me/i-ai-gw'

    // A failed session create must roll the pre-written record back, so the next
    // click provisions instead of returning a dead session id.
    host.setFailCreate(true)
    const failed = await postCoordinator(host.routes, { projectKey })
    expect(failed.status).toBe(500)
    expect(failed.payload).toMatchObject({ ok: false, error: 'COORDINATOR_UNAVAILABLE' })
    expect(host.stores.coordinators.size).toBe(0)

    host.setFailCreate(false)
    const created = await postCoordinator(host.routes, { projectKey })
    expect(created.status).toBe(200)
    expect(created.payload).toMatchObject({ ok: true, projectKey, label: 'i-ai-gw', created: true })
    const sessionId = created.payload.sessionId
    expect(typeof sessionId).toBe('string')
    expect(host.sessions.has(sessionId as string)).toBe(true)

    // A second open reads the persisted record, checks the session, and reuses it.
    const reopened = await postCoordinator(host.routes, { projectKey })
    expect(reopened.status).toBe(200)
    expect(reopened.payload).toMatchObject({ ok: true, created: false, sessionId })
    expect(host.stores.coordinators.size).toBe(1)
    expect(host.sessions.size).toBe(1)
    expect(host.renames).toHaveLength(1)
    expect(host.renames[0]?.title).toBe('项目协调台 · i-ai-gw')

    // The wire answer is deliberately narrow; the stored record keeps the
    // redacted remote only.
    expect(created.payload).not.toHaveProperty('remote')
    const record = host.stores.coordinators.get(projectKey)
    expect(record?.remote).toBe('https://github.com/me/i-ai-gw.git')
    expect(JSON.stringify([...host.stores.coordinators.values()])).not.toContain('TOKEN')
  })
})

describe('project remote redaction consistency', () => {
  /** Raw configured remote with an embedded access token. */
  const PROXIED = 'https://x-access-token:TOKEN@git.zyql.com/it-eff-lab/i-ai-gw.git'
  /** The remote after userinfo removal. */
  const REDACTED = 'https://git.zyql.com/it-eff-lab/i-ai-gw.git'
  /** Normalized project key shared by every source. */
  const PROJECT_KEY = 'git.zyql.com/it-eff-lab/i-ai-gw'

  const workspaces: FakeWorkspace[] = [
    { id: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', sessionIds: [] },
    { id: 'wb', title: 'i-ai-gw-tpm', path: '/repo/i-ai-gw-tpm', sessionIds: [] },
    { id: 'wc', title: 'other', path: '/repo/other', sessionIds: [] },
  ]
  const probe = async (path: string): Promise<GitFacts> => (path.endsWith('/other')
    ? { root: path, remote: 'git@git.zyql.com:it-eff-lab/other.git' }
    : { root: path, branch: path.endsWith('-tpm') ? 'feat/tpm' : 'feat/main', remote: PROXIED })

  /**
   * Build the injected-probe coordinator service over the same registry.
   * @returns the service plus the observable coordinator table.
   */
  function coordinatorService() {
    const coordinators = new Map<string, ManagerCoordinatorRecord>()
    const sessions = new Set<string>()
    const registry = {
      list: () => workspaces,
      get: (id: string) => workspaces.find(workspace => workspace.id === id),
    }
    const ctx = {
      workspaceRegistry: registry,
      sessionController: {
        create: async (input: { sessionId?: string }) => {
          const sessionId = input.sessionId ?? `session-${sessions.size + 1}`
          sessions.add(sessionId)
          return { sessionId }
        },
        inspect: async (sessionId: string) => {
          if (!sessions.has(sessionId)) throw new Error('not found')
          return {}
        },
        list: async () => ({ items: [...sessions].map(sessionId => ({ sessionId })) }),
        rename: async () => {},
        prompt: async () => {},
      },
      agents: { get: () => undefined },
    }
    const service = new ProjectCoordinators({
      ctx: ctx as never,
      coordinators: table(coordinators),
      tasks: table(new Map()),
      mux: new EventMux(),
      warn: () => {},
      probe,
    })
    return { service, coordinators }
  }

  it('serves the same redacted remote to the route, view, coordinator record and overview', async () => {
    const metaRoute = createWorkspaceMetaRoute({
      registry: { list: () => workspaces },
      probe,
      ttlMs: 0,
      warn: () => {},
    })
    const response = await metaRoute.fetch(new Request(`http://board${WORKSPACE_META_PATH}`))
    expect(response.status).toBe(200)
    const payload = await response.json() as { workspaces: Array<{ workspaceId: string; projectKey?: string; remote?: string }> }
    const mainRows = payload.workspaces.filter(row => row.workspaceId !== 'wc')
    expect(mainRows.map(row => row.remote)).toEqual([REDACTED, REDACTED])
    expect(mainRows.map(row => row.projectKey)).toEqual([PROJECT_KEY, PROJECT_KEY])
    // scp-like remotes carry no userinfo and stay as configured.
    expect(payload.workspaces.find(row => row.workspaceId === 'wc')?.remote).toBe('git@git.zyql.com:it-eff-lab/other.git')
    expect(JSON.stringify(payload)).not.toContain('TOKEN')

    const { service, coordinators } = coordinatorService()
    await service.ensure(PROJECT_KEY)
    const view = await service.view(PROJECT_KEY)
    const record = coordinators.get(PROJECT_KEY)
    const overview = (await service.overviewLines(PROJECT_KEY)).join('\n')

    expect(view).toMatchObject({ key: PROJECT_KEY, label: 'i-ai-gw', remote: REDACTED })
    expect(record?.remote).toBe(REDACTED)
    expect(overview).toContain(`(${REDACTED})`)
    expect(overview).not.toContain('TOKEN')
    // Every user/model-visible copy must agree, not merely be individually clean.
    expect(new Set([mainRows[0]?.remote, view?.remote, record?.remote])).toEqual(new Set([REDACTED]))
  })
})
