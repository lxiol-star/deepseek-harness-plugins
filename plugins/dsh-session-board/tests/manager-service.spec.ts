import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagerService } from '../src/host/manager/service.ts'
import type { ManagerStateRecord, ManagerTaskRecord } from '../src/host/manager/domain.ts'
import { MANAGER_STATE_KEY, emptyManagerState } from '../src/host/manager/domain.ts'
import { EventMux } from '../src/host/manager/mux.ts'

/** In-memory table adapter with the manager service's KV subset. */
function table<V>(map: Map<string, V>) {
  return {
    get: (key: string): V | undefined => map.get(key),
    entries: (): IterableIterator<[string, V]> => map.entries(),
    put: async (key: string, value: V): Promise<void> => { map.set(key, value) },
    delete: async (key: string): Promise<boolean> => map.delete(key),
  }
}

/**
 * Build a manager service over a fake host: one workspace, one provisioned
 * session, and a prompt recorder. No real DSH service is involved.
 * @returns the service plus the recorded prompts and the shared mux.
 */
/** Seams the recovery tests need to observe or fail provisioning. */
interface HarnessOptions {
  /** Session listing result; throw to simulate an unreachable host. */
  listed?: () => Promise<{ items: { sessionId: string }[] }>
  /** Session creation; throw to simulate a failed provision. */
  create?: (input: { sessionId?: string }) => Promise<{ sessionId: string }>
  /** Durable manager state to seed before the service starts. */
  seed?: ManagerStateRecord
}

function harness(options: HarnessOptions = {}) {
  const prompts: { sessionId: string; text: string }[] = []
  const creates: string[] = []
  const agents = new Map<string, { status: 'idle' | 'running' }>()
  const state = new Map<string, ManagerStateRecord>()
  const tasks = new Map<string, ManagerTaskRecord>()
  const mux = new EventMux()
  const workspace = { id: 'ws-manager', title: 'Manager', path: '/tmp/manager', sessionIds: [] }
  if (options.seed !== undefined) state.set(MANAGER_STATE_KEY, options.seed)
  const ctx = {
    agents: { get: (id: string) => agents.get(id) },
    workspaceRegistry: {
      resolveByPath: async () => workspace,
      create: async () => workspace,
      get: () => workspace,
      list: () => [workspace],
    },
    sessionController: {
      create: async (input: { sessionId?: string }) => {
        const sessionId = input.sessionId ?? 'session-new'
        creates.push(sessionId)
        return options.create === undefined ? { sessionId } : await options.create(input)
      },
      rename: async () => {},
      list: options.listed ?? (async () => ({ items: [] })),
      prompt: async (request: { sessionId: string; content: { text: string }[] }) => {
        prompts.push({ sessionId: request.sessionId, text: request.content.map((part) => part.text).join('') })
      },
    },
    tools: { register: () => () => {} },
    systemPrompt: { section: () => () => {}, context: () => () => {} },
  } as never
  const service = new ManagerService({
    ctx,
    state: table(state),
    tasks: table(tasks),
    mux,
    managerDir: '/tmp/manager',
    warn: () => {},
  })
  return { service, prompts, agents, mux, state, creates }
}

/** A synthetic committed session event. */
const event = (type: string, data: Record<string, unknown>) => ({ type, seq: 1, data }) as never

afterEach(() => {
  vi.useRealTimers()
})

describe('ManagerService wake integration', () => {
  it('provisions the manager session, ignores it, and exposes the wake status', async () => {
    vi.useFakeTimers()
    const h = harness()
    const provisioned = await h.service.ensure()
    expect(provisioned.managerSessionId).toBe(h.service.sessionId)
    expect(h.mux.isIgnored(provisioned.managerSessionId)).toBe(true)
    expect(h.service.view().wake).toMatchObject({ enabled: false, pending: 0 })
    h.service.dispose()
  })

  it('delivers one digest for an error edge and acknowledges it', async () => {
    vi.useFakeTimers()
    const h = harness()
    await h.service.ensure()
    await h.service.wake({ action: 'enable' })
    expect(h.service.view().wake.enabled).toBe(true)

    h.mux.record('session-other', event('turn/end', { turn: 1, reason: { kind: 'error' } }))
    h.service.noteEdges()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(h.prompts).toHaveLength(1)
    expect(h.prompts[0]?.text).toContain('[自动唤醒]')
    expect(h.prompts[0]?.text).toContain('错误')
    expect(h.mux.pendingForWake().edges).toHaveLength(0)
    expect(h.service.view().wake.pending).toBe(0)
    h.service.dispose()
  })

  it('never wakes itself from the manager session events', async () => {
    vi.useFakeTimers()
    const h = harness()
    const { managerSessionId } = await h.service.ensure()
    await h.service.wake({ action: 'enable' })
    h.mux.record(managerSessionId, event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    h.service.noteEdges()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.prompts).toHaveLength(0)
    h.service.dispose()
  })

  it('delivers a manual digest immediately and stops when disabled', async () => {
    vi.useFakeTimers()
    const h = harness()
    await h.service.ensure()
    await h.service.wake({ action: 'enable' })
    h.mux.record('session-other', event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    await h.service.wake({ action: 'now' })
    await vi.advanceTimersByTimeAsync(0)
    expect(h.prompts).toHaveLength(1)

    await h.service.wake({ action: 'disable' })
    h.mux.record('session-other', event('turn/end', { turn: 2, reason: { kind: 'error' } }))
    h.service.noteEdges()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(h.prompts).toHaveLength(1)
    h.service.dispose()
  })

  it('rejects an unknown wake action', async () => {
    const h = harness()
    await expect(h.service.wake({ action: 'explode' })).rejects.toThrow('wake.action')
    h.service.dispose()
  })
})

describe('ManagerService persisted wake throttle', () => {
  it('survives a restart through the state table', async () => {
    vi.useFakeTimers()
    const h = harness()
    await h.service.ensure()
    await h.service.wake({ action: 'enable' })
    h.mux.record('session-other', event('turn/end', { turn: 1, reason: { kind: 'error' } }))
    h.service.noteEdges()
    await vi.advanceTimersByTimeAsync(3_000)
    expect(h.prompts).toHaveLength(1)
    const stored = h.service.view()
    expect(stored.wake.lastWakeAt).toBeTypeOf('number')
    expect(MANAGER_STATE_KEY).toBe('state')
    h.service.dispose()
  })
})

describe('ManagerService manager pointer recovery', () => {
  it('recreates a manager whose persisted Session disappeared', async () => {
    const seed: ManagerStateRecord = { ...emptyManagerState(), managerSessionId: 'session-gone', revision: 4 }
    const h = harness({ seed, listed: async () => ({ items: [{ sessionId: 'session-live' }] }) })
    const provisioned = await h.service.ensure()
    expect(provisioned.managerSessionId).not.toBe('session-gone')
    expect(h.creates).toHaveLength(1)
    expect(h.state.get(MANAGER_STATE_KEY)?.managerSessionId).toBe(provisioned.managerSessionId)
    h.service.dispose()
  })

  it('trusts the pointer when existence cannot be verified', async () => {
    const seed: ManagerStateRecord = { ...emptyManagerState(), managerSessionId: 'session-kept', revision: 2 }
    const h = harness({ seed, listed: async () => { throw new Error('host offline') } })
    const provisioned = await h.service.ensure()
    expect(provisioned.managerSessionId).toBe('session-kept')
    expect(h.creates).toHaveLength(0)
    h.service.dispose()
  })

  it('rolls the persisted pointer back when creation fails, then recovers', async () => {
    let attempts = 0
    const h = harness({
      create: async (input) => {
        attempts += 1
        if (attempts === 1) throw new Error('create failed')
        return { sessionId: input.sessionId ?? 'session-recovered' }
      },
    })
    await expect(h.service.ensure()).rejects.toThrow('create failed')
    expect(h.state.get(MANAGER_STATE_KEY)?.managerSessionId).toBeUndefined()
    const next = await h.service.ensure()
    expect(next.managerSessionId).toBeTypeOf('string')
    expect(h.state.get(MANAGER_STATE_KEY)?.managerSessionId).toBe(next.managerSessionId)
    h.service.dispose()
  })
})
