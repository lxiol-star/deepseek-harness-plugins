/**
 * Model-facing tools available ONLY on the manager session.
 *
 * The plugin cannot import `@deepseek-ai/dsh-tools` at runtime (the profile
 * does not install DSH packages next to the plugin), so each definition is a
 * plain object with the registry's runtime shape: `name`, `description`, a JSON
 * Schema `parameters`, an `output` declaration and `execute(args, exec)`.
 * `execute` returns the canonical value — an array of text lines here — and
 * `render` turns it into model-facing content blocks.
 *
 * Every capability the manager has is one of these tools; normal sessions never
 * see them because registration happens on the manager Agent's own context.
 */
// Type-only imports: erased at build time; the runtime bundle must never import
// a DSH package (the profile does not install them next to the plugin).
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { ManagerSelection, ManagerTaskStatus, ManagerTaskView } from '../../shared/manager.ts'
import { isManagerTaskStatus, previewText } from '../../shared/manager.ts'

/** What one manager session can see and do; implemented by the host service. */
export interface ManagerToolContext {
  selection(): ManagerSelection
  tasks(): readonly ManagerTaskView[]
  overview(): Promise<readonly string[]>
  workspaceSessions(workspaceId: string): Promise<readonly string[]>
  sessionStatus(sessionId: string): Promise<readonly string[]>
  assignTask(input: {
    readonly title: string
    readonly brief: string
    readonly workspaceId: string
  }): Promise<{ readonly task: ManagerTaskView; readonly sessionId?: string }>
  updateTask(input: {
    readonly id: string
    readonly status?: ManagerTaskStatus
    readonly note?: string
  }): Promise<ManagerTaskView>
  reportProgress(input: { readonly text: string; readonly taskId?: string }): Promise<void>
  setAutoWake(enabled: boolean): Promise<boolean>
}

/** Canonical output contract: one array of text lines. */
const LINE_OUTPUT = {
  schema: { type: 'array', items: { type: 'string' } },
  render: (_args: unknown, value: JsonValue): ContentBlock[] => {
    if (!Array.isArray(value)) return []
    return value.map(line => ({ type: 'text' as const, text: typeof line === 'string' ? line : JSON.stringify(line) }))
  },
} as const

/** Read an argument object, or fail the call with a model-readable message. */
function argObject(args: unknown, tool: string): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error(`${tool}: arguments must be an object`)
  }
  return args as Record<string, unknown>
}

/** Read one required non-empty string argument. */
function argString(args: Record<string, unknown>, name: string, tool: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${tool}: "${name}" must be a non-empty string`)
  }
  return value.trim()
}

/** Read one optional task-status argument. */
function optionalStatus(args: Record<string, unknown>, name: string, tool: string): ManagerTaskStatus | undefined {
  const value = args[name]
  if (value === undefined) return undefined
  if (!isManagerTaskStatus(value)) {
    throw new Error(`${tool}: "${name}" must be one of pending, assigned, running, blocked, done, failed, orphaned`)
  }
  return value
}

/** Read one optional non-empty string argument. */
function optionalString(args: Record<string, unknown>, name: string, tool: string): string | undefined {
  const value = args[name]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${tool}: "${name}" must be a non-empty string when present`)
  }
  return value.trim()
}

/** Render one task row for the model. */
function taskLine(task: ManagerTaskView): string {
  const links = [
    task.workspaceId === undefined ? '' : `workspace=${task.workspaceId}`,
    task.sessionId === undefined ? '' : `session=${task.sessionId}`,
  ].filter(part => part !== '').join(' ')
  return `- ${task.id} [${task.status}] ${task.title}${links === '' ? '' : ` (${links})`}`
    + (task.note === undefined ? '' : ` — ${previewText(task.note, 120)}`)
}

/** Build the complete manager tool set over one context. */
export function managerToolDefinitions(context: ManagerToolContext): readonly ToolDefinition[] {
  return [
    {
      name: 'workspace_overview',
      description: 'List every DSH workspace with its title, path, session count and task count.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        argObject(args, 'workspace_overview')
        return await context.overview()
      },
    },
    {
      name: 'workspace_sessions',
      description: 'List the sessions of one workspace with status, title and last activity time.',
      parameters: {
        type: 'object',
        properties: { workspaceId: { type: 'string', description: 'Workspace id from workspace_overview.' } },
        required: ['workspaceId'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'workspace_sessions')
        return await context.workspaceSessions(argString(input, 'workspaceId', 'workspace_sessions'))
      },
    },
    {
      name: 'session_status',
      description: 'Read one session status: running state, last turn result, last error and last assistant preview.',
      parameters: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: 'Session id.' } },
        required: ['sessionId'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'session_status')
        return await context.sessionStatus(argString(input, 'sessionId', 'session_status'))
      },
    },
    {
      name: 'read_selection',
      description: 'Read the workspaces and sessions the user currently has checked in the manager panel.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        argObject(args, 'read_selection')
        const selection = context.selection()
        if (selection.workspaceIds.length === 0 && selection.sessionIds.length === 0) {
          return ['- (panel selection is empty)']
        }
        return [
          ...selection.workspaceIds.map(id => `- workspace ${id}`),
          ...selection.sessionIds.map(id => `- session ${id}`),
        ]
      },
    },
    {
      name: 'assign_task',
      description: 'Create a task in one workspace: starts a session there with the brief and records the task. '
        + 'Use it for any concrete work item the user asks for.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title for the panel.' },
          brief: { type: 'string', description: 'The prompt sent into the new session: goal, context, acceptance.' },
          workspaceId: { type: 'string', description: 'Workspace id the task belongs to; the new session is created there.' },
        },
        required: ['title', 'brief', 'workspaceId'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'assign_task')
        const result = await context.assignTask({
          title: argString(input, 'title', 'assign_task'),
          brief: argString(input, 'brief', 'assign_task'),
          workspaceId: argString(input, 'workspaceId', 'assign_task'),
        })
        return [
          `- task ${result.task.id} [${result.task.status}] ${result.task.title}`,
          ...(result.sessionId === undefined ? ['- session: (creation failed; task recorded only)'] : [`- session ${result.sessionId}`]),
        ]
      },
    },
    {
      name: 'list_tasks',
      description: 'List the manager task board with status, links and the latest progress note.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        argObject(args, 'list_tasks')
        const tasks = context.tasks()
        return tasks.length === 0 ? ['- (task board is empty)'] : tasks.map(taskLine)
      },
    },
    {
      name: 'update_task',
      description: 'Update one task status and/or note. Valid statuses: pending, assigned, running, blocked, done, failed, orphaned.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id from list_tasks.' },
          status: {
            type: 'string',
            enum: ['pending', 'assigned', 'running', 'blocked', 'done', 'failed', 'orphaned'],
            description: 'New status.',
          },
          note: { type: 'string', description: 'Progress note shown in the panel (evidence, blocker, next step).' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'update_task')
        const status = optionalStatus(input, 'status', 'update_task')
        const note = optionalString(input, 'note', 'update_task')
        const task = await context.updateTask({
          id: argString(input, 'id', 'update_task'),
          ...(status === undefined ? {} : { status }),
          ...(note === undefined ? {} : { note }),
        })
        return [taskLine(task)]
      },
    },
    {
      name: 'report_progress',
      description: 'Write a short progress note the panel shows next to the task (does not start a model turn).',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'One or two lines of progress/evidence.' },
          taskId: { type: 'string', description: 'Optional task id this note belongs to.' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'report_progress')
        await context.reportProgress({
          text: argString(input, 'text', 'report_progress'),
          ...(optionalString(input, 'taskId', 'report_progress') === undefined
            ? {}
            : { taskId: optionalString(input, 'taskId', 'report_progress') as string }),
        })
        return ['- progress recorded']
      },
    },
    {
      name: 'set_auto_wake',
      description: 'Enable or disable event-driven wakeups. When enabled the panel may wake you with a digest '
        + 'when tracked sessions need input, fail, or finish; keep it off unless the user asks for supervision.',
      parameters: {
        type: 'object',
        properties: { enabled: { type: 'boolean', description: 'Whether automatic wakeups are allowed.' } },
        required: ['enabled'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'set_auto_wake')
        if (typeof input.enabled !== 'boolean') throw new Error('set_auto_wake: "enabled" must be a boolean')
        const enabled = await context.setAutoWake(input.enabled)
        return [`- auto wake ${enabled ? 'enabled' : 'disabled'}`]
      },
    },
  ]
}
