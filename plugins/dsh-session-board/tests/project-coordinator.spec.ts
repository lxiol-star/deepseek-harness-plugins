import { describe, expect, it, vi } from 'vitest'
import { ProjectCoordinators } from '../src/host/manager/projects.ts'
import type { ManagerCoordinatorRecord, ManagerTaskRecord } from '../src/host/manager/domain.ts'
import { EventMux } from '../src/host/manager/mux.ts'
import type { GitFacts } from '../src/host/workspace-meta.ts'

/** One fake Workspace row. */
interface FakeWorkspace {
  id: string
  title: string
  path: string
  sessionIds: string[]
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

/**
 * Build the coordinator service over a fake host.
 * @returns the service and the observable host state.
 */
function harness() {
  const workspaces: FakeWorkspace[] = [
    { id: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', sessionIds: ['worker-a'] },
    { id: 'wb', title: 'i-ai-gw-tpm', path: '/repo/i-ai-gw-tpm', sessionIds: ['worker-b'] },
    { id: 'wc', title: 'other', path: '/repo/other', sessionIds: [] },
  ]
  const probe = vi.fn(async (path: string): Promise<GitFacts> => {
    if (path.endsWith('/other')) return { root: path, branch: 'main', remote: 'git@github.com:me/other.git' }
    return { root: path, branch: path.endsWith('-tpm') ? 'feat/tpm' : 'feat/main', remote: 'git@github.com:me/i-ai-gw.git' }
  })
  const coordinators = new Map<string, ManagerCoordinatorRecord>()
  const tasks = new Map<string, ManagerTaskRecord>()
  const prompts: Array<{ sessionId: string; text: string }> = []
  const renames: Array<{ sessionId: string; title: string }> = []
  let created = 0
  const ctx = {
    workspaceRegistry: {
      list: () => workspaces,
      get: (id: string) => workspaces.find(workspace => workspace.id === id),
    },
    sessionController: {
      create: async (input: { sessionId?: string; workspaceId: string }) => ({ sessionId: input.sessionId ?? `session-${++created}` }),
      rename: async (input: { sessionId: string; title: string }) => { renames.push(input) },
      prompt: async (request: { sessionId: string; content: { text: string }[] }) => {
        prompts.push({ sessionId: request.sessionId, text: request.content.map(part => part.text).join('') })
      },
      list: async () => ({ items: [] }),
    },
    agents: { get: () => undefined },
  } as never
  const service = new ProjectCoordinators({
    ctx,
    coordinators: table(coordinators),
    tasks: table(tasks),
    mux: new EventMux(),
    warn: () => {},
    probe,
  })
  return { service, workspaces, probe, coordinators, tasks, prompts, renames, createAgent }
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

  it('rejects an unknown project key', async () => {
    const h = harness()
    await expect(h.service.ensure('github.com/me/missing')).rejects.toThrow('unknown project')
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

  it('messages only sessions that belong to the project', async () => {
    const { h, tool } = await boot()
    await tool('project_message_session').execute({ sessionId: 'worker-b', text: 'status?' }, {})
    expect(h.prompts[0]).toMatchObject({ sessionId: 'worker-b', text: 'status?' })
    await expect(tool('project_message_session').execute({ sessionId: 'out-of-project', text: 'hi' }, {})).rejects.toThrow('not part of project')
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
})
