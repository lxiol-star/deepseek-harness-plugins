import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { ManagerSelection, ManagerTaskStatus, ManagerTaskView } from '../src/shared/manager.ts'
import { managerToolDefinitions } from '../src/host/manager/tools.ts'
import type { ManagerToolContext } from '../src/host/manager/tools.ts'

// --- Fake context -----------------------------------------------------------
// No DSH runtime: every capability the tools use is one method on
// `ManagerToolContext`, so a plain object plus vi.fn spies is the whole seam.

/** Every manager tool name, in the order the service registers them. */
const EXPECTED_NAMES = [
  'workspace_overview',
  'workspace_sessions',
  'session_status',
  'read_selection',
  'assign_task',
  'list_tasks',
  'update_task',
  'report_progress',
  'set_auto_wake',
]

/** A tool call context the manager tool bodies never read. */
function exec(): ToolRunContext {
  return {} as ToolRunContext
}

function sampleTask(overrides: Partial<ManagerTaskView> = {}): ManagerTaskView {
  return { id: 't1', title: 'Task one', status: 'pending', createdAt: 1_000, updatedAt: 2_000, ...overrides }
}

function fakeContext(overrides: Partial<ManagerToolContext> = {}): ManagerToolContext {
  return {
    selection: () => ({ workspaceIds: [], sessionIds: [] }),
    tasks: () => [],
    overview: async () => [],
    workspaceSessions: async () => [],
    sessionStatus: async () => [],
    assignTask: async input => ({
      task: sampleTask({ id: 't1', title: input.title, status: 'assigned', workspaceId: input.workspaceId }),
      sessionId: 'session-1',
    }),
    updateTask: async input => sampleTask({
      id: input.id,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.note === undefined ? {} : { note: input.note }),
    }),
    reportProgress: async () => undefined,
    setAutoWake: async enabled => enabled,
    ...overrides,
  }
}

function tool(definitions: readonly ToolDefinition[], name: string): ToolDefinition {
  const found = definitions.find(candidate => candidate.name === name)
  if (found === undefined) throw new Error(`missing tool: ${name}`)
  return found
}

/** Run one tool and read its canonical line output. */
async function execute(definition: ToolDefinition, args: unknown): Promise<readonly string[]> {
  return await definition.execute(args, exec()) as readonly string[]
}

/** Project canonical line output through the declared model-facing renderer. */
function render(definition: ToolDefinition, value: readonly string[]): unknown {
  return definition.output.render({}, [...value])
}

describe('managerToolDefinitions inventory', () => {
  it('declares each manager capability exactly once', () => {
    const definitions = managerToolDefinitions(fakeContext())
    expect(definitions.map(definition => definition.name).sort()).toEqual([...EXPECTED_NAMES].sort())
    expect(new Set(definitions.map(definition => definition.name)).size).toBe(definitions.length)
  })

  it('describes, parameterizes and renders every tool', () => {
    for (const definition of managerToolDefinitions(fakeContext())) {
      expect(definition.description.length).toBeGreaterThan(0)
      expect(definition.parameters).toMatchObject({ type: 'object' })
      expect(definition.output.schema).toEqual({ type: 'array', items: { type: 'string' } })
      expect(typeof definition.output.render).toBe('function')
      expect(typeof definition.execute).toBe('function')
    }
  })

  it('renders the canonical line array as text blocks', () => {
    const definition = tool(managerToolDefinitions(fakeContext()), 'read_selection')
    expect(render(definition, ['- a', '- b'])).toEqual([
      { type: 'text', text: '- a' },
      { type: 'text', text: '- b' },
    ])
    expect(definition.output.render({}, [1, true])).toEqual([
      { type: 'text', text: '1' },
      { type: 'text', text: 'true' },
    ])
    expect(definition.output.render({}, 'not-an-array')).toEqual([])
  })
})

describe('manager read tools', () => {
  it('workspace_overview returns the context overview lines', async () => {
    const overview = vi.fn(async () => ['- ws1 "Repo" /repo sessions=2 tasks=1'])
    const definitions = managerToolDefinitions(fakeContext({ overview }))

    expect(await execute(tool(definitions, 'workspace_overview'), {})).toEqual([
      '- ws1 "Repo" /repo sessions=2 tasks=1',
    ])
    expect(overview).toHaveBeenCalledTimes(1)
  })

  it('workspace_sessions trims the workspace id before the lookup', async () => {
    const workspaceSessions = vi.fn(async (workspaceId: string) => [`- session for ${workspaceId}`])
    const definitions = managerToolDefinitions(fakeContext({ workspaceSessions }))

    expect(await execute(tool(definitions, 'workspace_sessions'), { workspaceId: '  ws1  ' }))
      .toEqual(['- session for ws1'])
    expect(workspaceSessions).toHaveBeenCalledWith('ws1')
  })

  it('session_status forwards the session id', async () => {
    const sessionStatus = vi.fn(async (sessionId: string) => [`- session ${sessionId}`])
    const definitions = managerToolDefinitions(fakeContext({ sessionStatus }))

    expect(await execute(tool(definitions, 'session_status'), { sessionId: ' s1 ' })).toEqual(['- session s1'])
    expect(sessionStatus).toHaveBeenCalledWith('s1')
  })

  it('read_selection reports an empty panel selection', async () => {
    const definitions = managerToolDefinitions(fakeContext())
    expect(await execute(tool(definitions, 'read_selection'), {})).toEqual(['- (panel selection is empty)'])
  })

  it('read_selection lists workspaces before sessions', async () => {
    const selection = (): ManagerSelection => ({ workspaceIds: ['w1', 'w2'], sessionIds: ['s1'] })
    const definitions = managerToolDefinitions(fakeContext({ selection }))

    expect(await execute(tool(definitions, 'read_selection'), {})).toEqual([
      '- workspace w1',
      '- workspace w2',
      '- session s1',
    ])
  })

  it('list_tasks reports an empty task board', async () => {
    const definitions = managerToolDefinitions(fakeContext())
    expect(await execute(tool(definitions, 'list_tasks'), {})).toEqual(['- (task board is empty)'])
  })

  it('list_tasks renders status, links and the note', async () => {
    const tasks = (): readonly ManagerTaskView[] => [
      sampleTask({
        id: 't1',
        title: 'Fix bug',
        status: 'assigned',
        workspaceId: 'w1',
        sessionId: 's1',
        note: 'waiting on CI',
      }),
      sampleTask({ id: 't2', title: 'Review', status: 'done' }),
    ]
    const definitions = managerToolDefinitions(fakeContext({ tasks }))

    expect(await execute(tool(definitions, 'list_tasks'), {})).toEqual([
      '- t1 [assigned] Fix bug (workspace=w1 session=s1) — waiting on CI',
      '- t2 [done] Review',
    ])
  })

  it('list_tasks bounds a long note preview', async () => {
    const tasks = (): readonly ManagerTaskView[] => [sampleTask({ note: 'n'.repeat(200) })]
    const definitions = managerToolDefinitions(fakeContext({ tasks }))

    expect(await execute(tool(definitions, 'list_tasks'), {})).toEqual([
      `- t1 [pending] Task one — ${'n'.repeat(119)}…`,
    ])
  })

  it('renders executed read-tool lines as text blocks', async () => {
    const overview = async () => ['- ws1 "Repo" /repo']
    const selection = (): ManagerSelection => ({ workspaceIds: ['w1'], sessionIds: [] })
    const tasks = (): readonly ManagerTaskView[] => [sampleTask({ id: 't1', title: 'Fix bug', status: 'assigned' })]
    const definitions = managerToolDefinitions(fakeContext({ overview, selection, tasks }))

    for (const name of ['workspace_overview', 'read_selection', 'list_tasks']) {
      const definition = tool(definitions, name)
      const lines = await execute(definition, {})
      expect(render(definition, lines)).toEqual(lines.map(text => ({ type: 'text', text })))
    }
  })
})

describe('manager task tools', () => {
  it('assign_task trims inputs and reports the created task and session', async () => {
    const assignTask = vi.fn(async (input: { readonly title: string; readonly brief: string; readonly workspaceId: string }) => ({
      task: sampleTask({ id: 't1', title: input.title, status: 'assigned', workspaceId: input.workspaceId }),
      sessionId: 'session-1',
    }))
    const definitions = managerToolDefinitions(fakeContext({ assignTask }))

    expect(await execute(tool(definitions, 'assign_task'), {
      title: '  Fix it  ',
      brief: '\n do it \n',
      workspaceId: ' w1 ',
    })).toEqual([
      '- task t1 [assigned] Fix it',
      '- session session-1',
    ])
    expect(assignTask).toHaveBeenCalledWith({ title: 'Fix it', brief: 'do it', workspaceId: 'w1' })
  })

  it('assign_task reports a recorded task whose session could not be created', async () => {
    const assignTask = vi.fn(async (_input: {
      readonly title: string
      readonly brief: string
      readonly workspaceId: string
    }) => ({ task: sampleTask({ id: 't2', title: 'Lost', status: 'failed' }) }))
    const definitions = managerToolDefinitions(fakeContext({ assignTask }))

    expect(await execute(tool(definitions, 'assign_task'), { title: 'Lost', brief: 'b', workspaceId: 'w1' }))
      .toEqual([
        '- task t2 [failed] Lost',
        '- session: (creation failed; task recorded only)',
      ])
  })

  it('update_task forwards the id, status and trimmed note', async () => {
    const updateTask = vi.fn(async (input: {
      readonly id: string
      readonly status?: ManagerTaskStatus
      readonly note?: string
    }) => sampleTask({
      id: input.id,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.note === undefined ? {} : { note: input.note }),
    }))
    const definitions = managerToolDefinitions(fakeContext({ updateTask }))

    expect(await execute(tool(definitions, 'update_task'), { id: ' t1 ', status: 'done', note: '  shipped  ' }))
      .toEqual(['- t1 [done] Task one — shipped'])
    expect(updateTask).toHaveBeenCalledWith({ id: 't1', status: 'done', note: 'shipped' })
  })

  it('update_task omits absent optional arguments', async () => {
    const updateTask = vi.fn(async (input: {
      readonly id: string
      readonly status?: ManagerTaskStatus
      readonly note?: string
    }) => sampleTask({ id: input.id }))
    const definitions = managerToolDefinitions(fakeContext({ updateTask }))

    expect(await execute(tool(definitions, 'update_task'), { id: 't1' })).toEqual(['- t1 [pending] Task one'])
    expect(updateTask).toHaveBeenCalledWith({ id: 't1' })
  })
})

describe('manager progress and wake tools', () => {
  it('report_progress forwards trimmed text and an optional task id', async () => {
    const reportProgress = vi.fn(async (_input: { readonly text: string; readonly taskId?: string }): Promise<void> => {})
    const definitions = managerToolDefinitions(fakeContext({ reportProgress }))

    expect(await execute(tool(definitions, 'report_progress'), { text: '  half way  ', taskId: ' t1 ' }))
      .toEqual(['- progress recorded'])
    expect(reportProgress).toHaveBeenCalledWith({ text: 'half way', taskId: 't1' })
  })

  it('report_progress omits an absent task id', async () => {
    const reportProgress = vi.fn(async (_input: { readonly text: string; readonly taskId?: string }): Promise<void> => {})
    const definitions = managerToolDefinitions(fakeContext({ reportProgress }))

    await execute(tool(definitions, 'report_progress'), { text: 'note' })
    expect(reportProgress).toHaveBeenCalledWith({ text: 'note' })
  })

  it('set_auto_wake forwards the flag and reports the resulting state', async () => {
    const setAutoWake = vi.fn(async (enabled: boolean) => enabled)
    const definitions = managerToolDefinitions(fakeContext({ setAutoWake }))

    expect(await execute(tool(definitions, 'set_auto_wake'), { enabled: true })).toEqual(['- auto wake enabled'])
    expect(setAutoWake).toHaveBeenLastCalledWith(true)
    expect(await execute(tool(definitions, 'set_auto_wake'), { enabled: false })).toEqual(['- auto wake disabled'])
    expect(setAutoWake).toHaveBeenLastCalledWith(false)
  })
})

describe('manager tool argument validation', () => {
  it('rejects non-object arguments with the failing tool name', async () => {
    for (const definition of managerToolDefinitions(fakeContext())) {
      await expect(execute(definition, null)).rejects.toThrow(`${definition.name}: arguments must be an object`)
      await expect(execute(definition, [])).rejects.toThrow(`${definition.name}: arguments must be an object`)
      await expect(execute(definition, 'nope')).rejects.toThrow(`${definition.name}: arguments must be an object`)
    }
  })

  it('rejects missing, blank or mistyped required strings', async () => {
    const definitions = managerToolDefinitions(fakeContext())
    const workspaceSessions = tool(definitions, 'workspace_sessions')
    const assignTask = tool(definitions, 'assign_task')

    await expect(execute(workspaceSessions, {})).rejects.toThrow('workspace_sessions: "workspaceId" must be a non-empty string')
    await expect(execute(workspaceSessions, { workspaceId: '   ' })).rejects.toThrow('workspace_sessions: "workspaceId"')
    await expect(execute(workspaceSessions, { workspaceId: 42 })).rejects.toThrow('workspace_sessions: "workspaceId"')

    await expect(execute(assignTask, { brief: 'b', workspaceId: 'w' })).rejects.toThrow('assign_task: "title" must be a non-empty string')
    await expect(execute(assignTask, { title: 't', brief: '   ', workspaceId: 'w' })).rejects.toThrow('assign_task: "brief"')
    await expect(execute(assignTask, { title: 't', brief: 'b' })).rejects.toThrow('assign_task: "workspaceId"')

    await expect(execute(tool(definitions, 'session_status'), {})).rejects.toThrow('session_status: "sessionId"')
    await expect(execute(tool(definitions, 'update_task'), {})).rejects.toThrow('update_task: "id"')
    await expect(execute(tool(definitions, 'report_progress'), {})).rejects.toThrow('report_progress: "text"')
  })

  it('rejects a blank optional argument when one is present', async () => {
    const definitions = managerToolDefinitions(fakeContext())

    await expect(execute(tool(definitions, 'update_task'), { id: 't1', note: '   ' }))
      .rejects.toThrow('update_task: "note" must be a non-empty string when present')
    await expect(execute(tool(definitions, 'report_progress'), { text: 'progress', taskId: '   ' }))
      .rejects.toThrow('report_progress: "taskId" must be a non-empty string when present')
  })

  it('rejects an unknown or mistyped task status with the tool name', async () => {
    const definitions = managerToolDefinitions(fakeContext())
    const updateTask = tool(definitions, 'update_task')
    const expected = 'update_task: "status" must be one of pending, assigned, running, blocked, done, failed, orphaned'

    await expect(execute(updateTask, { id: 't1', status: 'bogus' })).rejects.toThrow(expected)
    await expect(execute(updateTask, { id: 't1', status: 3 })).rejects.toThrow(expected)
  })

  it('rejects a non-boolean set_auto_wake flag', async () => {
    const definitions = managerToolDefinitions(fakeContext())
    const setAutoWake = tool(definitions, 'set_auto_wake')

    await expect(execute(setAutoWake, {})).rejects.toThrow('set_auto_wake: "enabled" must be a boolean')
    await expect(execute(setAutoWake, { enabled: 'yes' })).rejects.toThrow('set_auto_wake: "enabled" must be a boolean')
    await expect(execute(setAutoWake, { enabled: 1 })).rejects.toThrow('set_auto_wake: "enabled" must be a boolean')
  })
})
