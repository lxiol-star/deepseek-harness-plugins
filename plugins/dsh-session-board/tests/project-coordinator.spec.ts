import { describe, expect, it, vi } from 'vitest'
import { ProjectCoordinators } from '../src/host/manager/projects.ts'
import type { ManagerCoordinatorRecord, ManagerTaskRecord } from '../src/host/manager/domain.ts'
import { EventMux } from '../src/host/manager/mux.ts'
import type { GitFacts } from '../src/host/workspace-meta.ts'
import { MANAGER_PROMPT_MAX } from '../src/shared/manager.ts'

/** Cache lifetime of the project probe list (mirrors PROJECT_CACHE_MS). */
const PROJECT_CACHE_MS = 120_000

/** One fake Workspace row. */
interface FakeWorkspace {
  id: string
  title: string
  path: string
  sessionIds: string[]
}

/** Harness knobs for one fake host. */
interface HarnessOptions {
  /** Replace the registry contents (default: one two-checkout project + one other). */
  workspaces?: FakeWorkspace[]
  /** Session identity returned by `create` regardless of the requested one. */
  createSessionId?: string
}

/** In-memory KV table. */
function table<V>(map: Map<string, V>) {
  return {
    get: (key: string): V | undefined => map.get(key),
    entries: (): IterableIterator<[string, V]> => map.entries(),
    put: async (key: string, value: V): Promise<void> => { map.set(key, value) },
    delete: async (key: string): Promise<boolean> => map.delete(key),
  }
}

/** One captured tool definition. */
interface CapturedTool {
  name: string
  execute: (args: unknown, exec: unknown) => Promise<readonly string[]>
}

/** Fake Agent surface: tool registry plus the system-prompt sections. */
interface FakeAgent {
  id: string
  tools: CapturedTool[]
  ctx: {
    tools: { register: (definition: CapturedTool) => () => void }
    systemPrompt: { section: (options: unknown) => () => void }
  }
}

/** Default fake registry: one project with two checkouts, plus an unrelated one. */
function defaultWorkspaces(): FakeWorkspace[] {
  return [
    { id: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', sessionIds: ['worker-a'] },
    { id: 'wb', title: 'i-ai-gw-tpm', path: '/repo/i-ai-gw-tpm', sessionIds: ['worker-b'] },
    { id: 'wc', title: 'other', path: '/repo/other', sessionIds: [] },
  ]
}

/**
 * Build the coordinator service over a fake host.
 * @param options - registry/create overrides.
 * @returns the service and the observable host state.
 */
function harness(options: HarnessOptions = {}) {
  const workspaces: FakeWorkspace[] = options.workspaces ?? defaultWorkspaces()
  const probe = vi.fn(async (path: string): Promise<GitFacts> => {
    if (path.endsWith('/other')) return { root: path, branch: 'main', remote: 'git@github.com:me/other.git' }
    return { root: path, branch: path.endsWith('-tpm') ? 'feat/tpm' : 'feat/main', remote: 'git@github.com:me/i-ai-gw.git' }
  })
  const coordinators = new Map<string, ManagerCoordinatorRecord>()
  const tasks = new Map<string, ManagerTaskRecord>()
  const prompts: Array<{ sessionId: string; text: string }> = []
  const renames: Array<{ sessionId: string; title: string }> = []
  /** Sessions the fake controller knows; the existence check reads this. */
  const sessions = new Set<string>()
  const clock = { now: 1_000 }
  let created = 0
  let createCalls = 0
  let createGate: (() => Promise<void>) | null = null
  let failPrompts = false
  /** Agents currently published in the fake host. */
  const liveAgents = new Map<string, FakeAgent>()
  const ctx = {
    workspaceRegistry: {
      list: () => workspaces,
      get: (id: string) => workspaces.find(workspace => workspace.id === id),
    },
    sessionController: {
      create: async (input: { sessionId?: string; workspaceId: string }) => {
        createCalls += 1
        if (createGate !== null) await createGate()
        const sessionId = options.createSessionId ?? input.sessionId ?? `session-${++created}`
        sessions.add(sessionId)
        return { sessionId }
      },
      inspect: async (sessionId: string) => {
        if (!sessions.has(sessionId)) throw new Error(`session "${sessionId}" not found`)
        return {}
      },
      rename: async (input: { sessionId: string; title: string }) => { renames.push(input) },
      prompt: async (request: { sessionId: string; content: { text: string }[] }) => {
        if (failPrompts) throw new Error('prompt failed')
        prompts.push({ sessionId: request.sessionId, text: request.content.map(part => part.text).join('') })
      },
      list: async () => ({
        items: [...sessions].map(sessionId => ({ sessionId, projections: { values: {} } })),
      }),
    },
    agents: { get: (sessionId: string) => liveAgents.get(sessionId) },
  } as never
  const service = new ProjectCoordinators({
    ctx,
    coordinators: table(coordinators),
    tasks: table(tasks),
    mux: new EventMux(),
    warn: vi.fn(),
    probe,
    now: () => clock.now,
  })
  return {
    service, workspaces, probe, coordinators, tasks, prompts, renames, sessions, clock, liveAgents,
    get createCalls() { return createCalls },
    setCreateGate: (gate: (() => Promise<void>) | null) => { createGate = gate },
    setPromptFailure: (failed: boolean) => { failPrompts = failed },
  }
}

/** Build one fake Agent and capture its registered tools. */
function createAgent(id: string): FakeAgent {
  const tools: CapturedTool[] = []
  return {
    id,
    tools,
    ctx: {
      tools: { register: (definition) => { tools.push(definition); return () => {} } },
      systemPrompt: { section: () => () => {} },
    },
  }
}

describe('project coordinator discovery', () => {
  it('groups workspaces sharing a git origin into one project', async () => {
    const h = harness()
    const projects = await h.service.projects()
    expect(projects.map(project => project.label)).toEqual(['i-ai-gw', 'other'])
    const gateway = projects[0]
    expect(gateway?.workspaces.map(workspace => workspace.title)).toEqual(['i-ai-gw', 'i-ai-gw-tpm'])
    expect(gateway?.workspaces.map(workspace => workspace.branch)).toEqual(['feat/main', 'feat/tpm'])
    expect(await h.service.view('github.com/me/i-ai-gw')).toMatchObject({ label: 'i-ai-gw' })
  })

  it('runs one probe pass for concurrent project reads', async () => {
    const h = harness()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.probe.mockImplementation(async (path: string) => {
      await gate
      return { root: path, remote: 'git@github.com:me/i-ai-gw.git' }
    })
    const first = h.service.projects()
    const second = h.service.projects()
    await vi.waitFor(() => expect(h.probe).toHaveBeenCalledTimes(3))
    release()
    await Promise.all([first, second])
    expect(h.probe).toHaveBeenCalledTimes(3)
  })

  it('redacts credentials embedded in the project remote', async () => {
    const h = harness()
    h.probe.mockImplementation(async (path: string): Promise<GitFacts> => ({
      root: path, branch: 'main', remote: 'https://x-access-token:TOKEN@github.com/me/i-ai-gw.git',
    }))
    await h.service.projects()
    await h.service.ensure('github.com/me/i-ai-gw')
    expect([...h.coordinators.values()][0]?.remote).toBe('https://github.com/me/i-ai-gw.git')
  })
})

describe('project coordinator session', () => {
  it('creates one coordinator in the main checkout and reuses it', async () => {
    const h = harness()
    const first = await h.service.ensure('github.com/me/i-ai-gw')
    expect(first).toMatchObject({ label: 'i-ai-gw', workspaceId: 'wa', created: true })
    expect(h.coordinators.size).toBe(1)
    expect(h.renames[0]?.title).toBe('项目协调台 · i-ai-gw')
    const second = await h.service.ensure('github.com/me/i-ai-gw')
    expect(second).toMatchObject({ created: false, sessionId: first.sessionId })
    expect(h.coordinators.size).toBe(1)
  })

  it('joins an in-flight creation instead of returning the half-created record', async () => {
    const h = harness()
    let release!: () => void
    h.setCreateGate(() => new Promise<void>((resolve) => { release = resolve }))
    const first = h.service.ensure('github.com/me/i-ai-gw')
    // The record is persisted before the create call; a second click must not
    // observe it as a ready coordinator while that call is still pending.
    await vi.waitFor(() => {
      expect(h.coordinators.size).toBe(1)
      expect(h.createCalls).toBe(1)
    })
    const second = h.service.ensure('github.com/me/i-ai-gw')
    let secondSettled = false
    void second.then(() => { secondSettled = true })
    await Promise.resolve()
    expect(secondSettled).toBe(false)
    release()
    const [a, b] = await Promise.all([first, second])
    expect(a).toMatchObject({ created: true })
    expect(b).toMatchObject({ created: true })
    expect(a.sessionId).toBe(b.sessionId)
    expect(h.coordinators.size).toBe(1)
    expect(h.sessions.size).toBe(1)
  })

  it('uses the session identity the controller actually created', async () => {
    const h = harness({ createSessionId: 'controller-session' })
    const result = await h.service.ensure('github.com/me/i-ai-gw')
    expect(result.sessionId).toBe('controller-session')
    expect(h.coordinators.get('github.com/me/i-ai-gw')?.sessionId).toBe('controller-session')
    expect(h.renames[0]?.sessionId).toBe('controller-session')
  })

  it('recreates a coordinator whose persisted session no longer exists', async () => {
    const h = harness()
    h.coordinators.set('github.com/me/i-ai-gw', {
      projectKey: 'github.com/me/i-ai-gw',
      label: 'i-ai-gw',
      sessionId: 'gone-session',
      workspaceId: 'wa',
      createdAt: 1,
    })
    const result = await h.service.ensure('github.com/me/i-ai-gw')
    expect(result.created).toBe(true)
    expect(result.sessionId).not.toBe('gone-session')
    expect(h.coordinators.get('github.com/me/i-ai-gw')?.sessionId).toBe(result.sessionId)
    expect(h.sessions.has(result.sessionId)).toBe(true)
  })

  it('keeps a stored coordinator when its session cannot be checked', async () => {
    const h = harness()
    h.coordinators.set('github.com/me/i-ai-gw', {
      projectKey: 'github.com/me/i-ai-gw',
      label: 'i-ai-gw',
      sessionId: 'saved-session',
      workspaceId: 'wa',
      createdAt: 1,
    })
    h.service.dispose()
    // Recreate the service over the same tables with both existence checks failing.
    const failing = new ProjectCoordinators({
      ctx: {
        workspaceRegistry: { list: () => h.workspaces, get: () => undefined },
        sessionController: {
          inspect: async () => { throw new Error('store offline') },
          list: async () => { throw new Error('store offline') },
        },
        agents: { get: () => undefined },
      } as never,
      coordinators: table(h.coordinators),
      tasks: table(h.tasks),
      mux: new EventMux(),
      warn: () => {},
      probe: h.probe,
      now: () => h.clock.now,
    })
    const result = await failing.ensure('github.com/me/i-ai-gw')
    expect(result).toMatchObject({ created: false, sessionId: 'saved-session' })
  })

  it('redacts a legacy coordinator record remote when opened', async () => {
    const h = harness()
    const rawRemote = 'https://x-access-token:secret-token@github.com/me/i-ai-gw.git'
    h.coordinators.set('github.com/me/i-ai-gw', {
      projectKey: 'github.com/me/i-ai-gw', label: 'i-ai-gw', sessionId: 'legacy-coord',
      workspaceId: 'wa', createdAt: 1_000, remote: rawRemote,
    })
    h.sessions.add('legacy-coord')
    const result = await h.service.ensure('github.com/me/i-ai-gw')
    expect(result).toMatchObject({ created: false, sessionId: 'legacy-coord' })
    expect(h.coordinators.get('github.com/me/i-ai-gw')?.remote).toBe('https://github.com/me/i-ai-gw.git')
  })

  it('rejects an unknown project key', async () => {
    const h = harness()
    await expect(h.service.ensure('github.com/me/missing')).rejects.toThrow('unknown project')
  })

  it('rejects an unbounded project key before probing', async () => {
    const h = harness()
    await expect(h.service.ensure('x'.repeat(10_000))).rejects.toThrow('projectKey')
    expect(h.probe).not.toHaveBeenCalled()
  })

  it('prefers the main checkout even when its directory case differs', async () => {
    const h = harness({
      workspaces: [
        { id: 'wa', title: 'a-branch', path: '/repo/i-ai-gw-extra', sessionIds: [] },
        { id: 'wb', title: 'main', path: '/repo/I-AI-GW', sessionIds: [] },
      ],
    })
    const result = await h.service.ensure('github.com/me/i-ai-gw')
    expect(result.workspaceId).toBe('wb')
  })

  it('gives live project workers the report tool when a coordinator is created', async () => {
    const h = harness()
    const worker = createAgent('worker-a')
    h.liveAgents.set('worker-a', worker)
    await h.service.ensure('github.com/me/i-ai-gw')
    await vi.waitFor(() => expect(worker.tools.map(tool => tool.name)).toEqual(['report_to_coordinator']))
  })

  it('installs coordinator tools on the coordinator and a report tool on a worker', async () => {
    const h = harness()
    const coordinator = await h.service.ensure('github.com/me/i-ai-gw')
    const coordinatorAgent = createAgent(coordinator.sessionId)
    h.service.installAgent(coordinatorAgent as never)
    await Promise.resolve()
    expect(coordinatorAgent.tools.map(tool => tool.name)).toEqual([
      'project_overview', 'project_assign_task', 'project_message_session', 'project_session_status',
    ])

    const worker = createAgent('worker-a')
    h.service.installAgent(worker as never)
    await vi.waitFor(() => expect(worker.tools.map(tool => tool.name)).toEqual(['report_to_coordinator']))
  })

  it('does not register the report tool after the agent is disposed mid-lookup', async () => {
    const h = harness()
    await h.service.ensure('github.com/me/i-ai-gw')
    h.probe.mockClear()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.probe.mockImplementation(async (path: string) => {
      await gate
      return { root: path, remote: 'git@github.com:me/i-ai-gw.git' }
    })
    h.clock.now += PROJECT_CACHE_MS + 1
    const worker = createAgent('worker-a')
    h.service.installAgent(worker as never)
    await vi.waitFor(() => expect(h.probe).toHaveBeenCalledTimes(3))
    h.service.disposeAgent('worker-a')
    release()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(worker.tools).toHaveLength(0)
  })
})

describe('project coordinator tools', () => {
  /** Boot one coordinator and return its captured tools plus host state. */
  async function boot() {
    const h = harness()
    const coordinator = await h.service.ensure('github.com/me/i-ai-gw')
    const agent = createAgent(coordinator.sessionId)
    h.service.installAgent(agent as never)
    await Promise.resolve()
    const tool = (name: string): CapturedTool => {
      const found = agent.tools.find(candidate => candidate.name === name)
      if (found === undefined) throw new Error(`missing tool ${name}`)
      return found
    }
    return { h, coordinator, tool }
  }

  it('lists branches with session and task counts', async () => {
    const { tool } = await boot()
    const lines = await tool('project_overview').execute({}, {})
    expect(lines[0]).toContain('i-ai-gw')
    expect(lines.join('\n')).toContain('i-ai-gw-tpm [feat/tpm]')
  })

  it('creates a task session only inside the project', async () => {
    const { h, tool } = await boot()
    const assign = tool('project_assign_task')
    const lines = await assign.execute({ title: 'Fix gateway', brief: 'Do the thing', workspaceId: 'wb' }, {})
    expect(lines.join('\n')).toContain('task')
    expect(h.prompts).toHaveLength(1)
    expect(h.prompts[0]?.text).toBe('Do the thing')
    const stored = [...h.tasks.values()][0]
    expect(stored).toMatchObject({ title: 'Fix gateway', workspaceId: 'wb', status: 'assigned' })
    await expect(assign.execute({ title: 'x', brief: 'y', workspaceId: 'outside' }, {})).rejects.toThrow('not part of project')
  })

  it('bounds the model-authored task brief', async () => {
    const { h, tool } = await boot()
    await tool('project_assign_task').execute({ title: 't', brief: 'b'.repeat(20_000), workspaceId: 'wb' }, {})
    expect(h.prompts[0]?.text).toHaveLength(MANAGER_PROMPT_MAX)
  })

  it('keeps the created session on a task whose brief could not be queued', async () => {
    const { h } = await boot()
    h.setPromptFailure(true)
    await expect(h.service.assignTask('github.com/me/i-ai-gw', { title: 't', brief: 'b', workspaceId: 'wb' }))
      .rejects.toThrow('prompt failed')
    const task = [...h.tasks.values()][0]
    expect(task?.status).toBe('failed')
    expect(task?.sessionId).toMatch(/^session-\d+$/)
  })

  it('messages only sessions that belong to the project', async () => {
    const { h, tool } = await boot()
    await tool('project_message_session').execute({ sessionId: 'worker-b', text: 'status?' }, {})
    expect(h.prompts[0]).toMatchObject({ sessionId: 'worker-b', text: 'status?' })
    await expect(tool('project_message_session').execute({ sessionId: 'out-of-project', text: 'hi' }, {})).rejects.toThrow('not part of project')
  })

  it('rejects an oversized session id before it reaches the registry', async () => {
    const { h, tool } = await boot()
    await expect(tool('project_message_session').execute({ sessionId: 'x'.repeat(500), text: 'hi' }, {}))
      .rejects.toThrow('bounded id')
    expect(h.prompts).toHaveLength(0)
  })

  it('refreshes project membership once the cached project view expires', async () => {
    const h = harness()
    await h.service.ensure('github.com/me/i-ai-gw')
    h.workspaces.push({ id: 'wd', title: 'i-ai-gw-hotfix', path: '/repo/i-ai-gw-hotfix', sessionIds: ['worker-d'] })
    await expect(h.service.messageSession('github.com/me/i-ai-gw', 'worker-d', 'hi')).rejects.toThrow('not part of project')
    h.clock.now += PROJECT_CACHE_MS + 1
    await h.service.messageSession('github.com/me/i-ai-gw', 'worker-d', 'hi')
    expect(h.prompts.at(-1)).toMatchObject({ sessionId: 'worker-d', text: 'hi' })
  })

  it('relays a worker report to the coordinator and updates its task', async () => {
    const { h } = await boot()
    const taskId = 'task-1'
    h.tasks.set(taskId, {
      id: taskId, title: 'Fix gateway', status: 'running', workspaceId: 'wb', sessionId: 'worker-b',
      createdAt: 1, updatedAt: 1,
    })
    const record = [...h.coordinators.values()][0]
    const worker = createAgent('worker-b')
    h.service.installAgent(worker as never)
    await vi.waitFor(() => expect(worker.tools.map(tool => tool.name)).toEqual(['report_to_coordinator']))
    const report = worker.tools[0]
    if (report === undefined) throw new Error('report tool missing')
    const lines = await report.execute({ text: 'gateway tests pass', taskId }, {})
    expect(lines.join('\n')).toContain('report sent')
    expect(h.prompts.at(-1)?.sessionId).toBe(record?.sessionId)
    expect(h.prompts.at(-1)?.text).toContain('gateway tests pass')
    expect(h.tasks.get(taskId)?.note).toContain('gateway tests pass')
  })

  it('annotates only tasks that belong to the reporting project', async () => {
    const { h } = await boot()
    const foreign: ManagerTaskRecord = {
      id: 'foreign-task', title: 'other project task', status: 'running', workspaceId: 'wc', createdAt: 1, updatedAt: 1,
    }
    const own: ManagerTaskRecord = {
      id: 'own-task', title: 'ours', status: 'running', workspaceId: 'wb', createdAt: 1, updatedAt: 1,
    }
    h.tasks.set(foreign.id, foreign)
    h.tasks.set(own.id, own)
    await h.service.report('github.com/me/i-ai-gw', 'worker-b', 'foreign update', foreign.id)
    expect(h.tasks.get(foreign.id)).toBe(foreign)
    expect(h.prompts.at(-1)?.text).not.toContain('关联任务')
    await h.service.report('github.com/me/i-ai-gw', 'worker-b', 'own update', own.id)
    expect(h.tasks.get(own.id)?.note).toBe('own update')
    expect(h.prompts.at(-1)?.text).toContain('关联任务：own-task')
  })

  it('bounds a worker report before relaying it', async () => {
    const { h } = await boot()
    await h.service.report('github.com/me/i-ai-gw', 'worker-b', 'x'.repeat(20_000))
    const text = h.prompts.at(-1)?.text ?? ''
    expect(text.endsWith('…')).toBe(true)
    expect([...text]).toHaveLength(MANAGER_PROMPT_MAX + '[项目汇报 · i-ai-gw · 来自 worker-b] '.length)
  })
})
