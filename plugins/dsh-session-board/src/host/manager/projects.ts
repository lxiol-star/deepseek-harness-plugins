/**
 * Per-project coordinator sessions.
 *
 * A project is every Workspace sharing one git `origin` (the same grouping the
 * board's project tree shows). The coordinator is a normal DSH session created
 * lazily in the project's main checkout; it owns project-scoped tools:
 *
 *  - `project_overview` — branches, sessions, running/waiting counts and tasks
 *  - `project_assign_task` — create a task session in one branch Workspace
 *  - `project_message_session` — queue a message into an existing project session
 *  - `project_session_status` — status/preview of one project session
 *
 * Sessions living in a project that already has a coordinator get one extra
 * tool, `report_to_coordinator`, so workers can push progress back without the
 * user relaying it. Coordinator → worker and worker → coordinator are both
 * ordinary `session.prompt` calls, so they stay visible in each session log.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import type { ManagerCoordinatorRecord, ManagerTaskRecord } from './domain.ts'
import type { EventMux, MuxSourceLevel } from './mux.ts'
import type { ManagerTable } from './service.ts'
import { probeWorkspaceGit, type GitFacts } from '../workspace-meta.ts'
import { normalizeRemote, projectLabel } from '../../shared/workspace-meta.ts'
import { MANAGER_TITLE_MAX, previewText } from '../../shared/manager.ts'

/** One Workspace of a project as the coordinator sees it. */
export interface ProjectWorkspaceView {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
  readonly branch?: string
}

/** One git project. */
export interface ProjectView {
  readonly key: string
  readonly label: string
  readonly remote?: string
  readonly workspaces: readonly ProjectWorkspaceView[]
}

/** Result of opening a project's coordinator session. */
export interface ProjectCoordinatorResult {
  readonly projectKey: string
  readonly label: string
  readonly sessionId: string
  readonly workspaceId: string
  readonly created: boolean
}

/** Collaborators of {@link ProjectCoordinators}. */
export interface ProjectCoordinatorDeps {
  readonly ctx: Context
  readonly coordinators: ManagerTable<ManagerCoordinatorRecord>
  readonly tasks: ManagerTable<ManagerTaskRecord>
  readonly mux: EventMux
  readonly warn: (message: string) => void
  readonly now?: () => number
  readonly probe?: (path: string) => Promise<GitFacts>
}

type PromptRequest = Parameters<Context['sessionController']['prompt']>[0]
type RequestId = PromptRequest['requestId']
const PROMPT_TIMEOUT_MS = 30_000
const PROJECT_CACHE_MS = 120_000
const PROBE_CONCURRENCY = 6

/** Canonical tool output: one array of text lines. */
const LINE_OUTPUT = {
  schema: { type: 'array', items: { type: 'string' } },
  render: (_args: unknown, value: JsonValue): ContentBlock[] => {
    if (!Array.isArray(value)) return []
    return value.map(line => ({ type: 'text' as const, text: typeof line === 'string' ? line : JSON.stringify(line) }))
  },
} as const

/** Read the argument object of one tool call. */
function argObject(args: unknown, tool: string): Record<string, unknown> {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error(`${tool}: arguments must be an object`)
  return args as Record<string, unknown>
}

/** Read one required non-empty string argument. */
function argString(input: Record<string, unknown>, name: string, tool: string): string {
  const value = input[name]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${tool}: "${name}" must be a non-empty string`)
  return value.trim()
}

/** Coordinator policy injected into the coordinator's system prompt. */
const COORDINATOR_POLICY = [
  'You are the coordinator of one git project in the DSH session board.',
  'The project contains several Workspaces: the main checkout and branches/worktrees.',
  'Use project_overview to see branches, sessions and tasks; project_assign_task to',
  'create a task session in a branch Workspace; project_message_session to queue an',
  'instruction into an existing session; project_session_status to inspect one.',
  'Workers can report to you with report_to_coordinator. Keep replies short and',
  'evidence-based. Never delete sessions, workspaces or git data; ask the user.',
].join('\n')

/**
 * Project discovery and coordinator lifecycle.
 */
export class ProjectCoordinators {
  private cached: { at: number; projects: ProjectView[] } | null = null
  private readonly installed = new Map<string, () => void>()
  private readonly inflight = new Map<string, Promise<ProjectCoordinatorResult>>()

  /** @param deps - nested host context plus the durable tables. */
  constructor(private readonly deps: ProjectCoordinatorDeps) {}

  /**
   * Probe every registered Workspace and group them by git origin.
   * @param force - ignore the cache.
   * @returns projects, sorted by label.
   */
  async projects(force = false): Promise<ProjectView[]> {
    const now = this.now()
    if (!force && this.cached !== null && now - this.cached.at < PROJECT_CACHE_MS) return this.cached.projects
    const registry = this.deps.ctx.workspaceRegistry
    const listed: Workspace[] = registry.list()
    const probe = this.deps.probe ?? probeWorkspaceGit
    const facts = new Map<string, GitFacts>()
    for (let start = 0; start < listed.length; start += PROBE_CONCURRENCY) {
      const chunk = listed.slice(start, start + PROBE_CONCURRENCY)
      const results = await Promise.all(chunk.map(async workspace => {
        try {
          return { id: workspace.id as string, facts: await probe(workspace.path) }
        } catch {
          return { id: workspace.id as string, facts: {} as GitFacts }
        }
      }))
      for (const row of results) facts.set(row.id, row.facts)
    }
    const grouped = new Map<string, { key: string; label: string; remote?: string; workspaces: ProjectWorkspaceView[] }>()
    for (const workspace of listed) {
      const info = facts.get(workspace.id as string)
      if (info?.remote === undefined) continue
      const key = normalizeRemote(info.remote)
      if (key === '') continue
      const label = projectLabel(key) ?? key
      let project = grouped.get(key)
      if (project === undefined) {
        project = { key, label, remote: info.remote, workspaces: [] }
        grouped.set(key, project)
      }
      project.workspaces.push({
        workspaceId: workspace.id as string,
        title: workspace.title,
        path: workspace.path,
        ...(info.branch === undefined ? {} : { branch: info.branch }),
      })
    }
    const projects = [...grouped.values()]
      .map(project => ({ ...project, workspaces: [...project.workspaces].sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path)) }))
      .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
    this.cached = { at: now, projects }
    return projects
  }

  /**
   * Look one project up by key.
   * @param projectKey - normalized origin key.
   * @returns the project, or null.
   */
  async view(projectKey: string): Promise<ProjectView | null> {
    return (await this.projects()).find(project => project.key === projectKey) ?? null
  }

  /**
   * Open (creating on first use) one project's coordinator session.
   * @param projectKey - normalized origin key from the project tree.
   * @returns the coordinator identity.
   */
  async ensure(projectKey: string): Promise<ProjectCoordinatorResult> {
    const existing = this.deps.coordinators.get(projectKey)
    if (existing !== undefined) {
      return { projectKey, label: existing.label, sessionId: existing.sessionId, workspaceId: existing.workspaceId, created: false }
    }
    const running = this.inflight.get(projectKey)
    if (running !== undefined) return await running
    const task = (async (): Promise<ProjectCoordinatorResult> => {
      const project = await this.view(projectKey)
      if (project === null) throw new Error(`unknown project "${projectKey}"`)
      const workspace = pickCoordinatorWorkspace(project)
      const sessionId = randomUUID() as SessionId
      const record: ManagerCoordinatorRecord = {
        projectKey,
        label: project.label,
        sessionId,
        workspaceId: workspace.workspaceId,
        createdAt: this.now(),
        ...(project.remote === undefined ? {} : { remote: project.remote }),
      }
      await this.deps.coordinators.put(projectKey, record)
      try {
        const created = await this.deps.ctx.sessionController.create({ sessionId, workspaceId: workspace.workspaceId as Workspace['id'] })
        if (created.sessionId !== sessionId) {
          const corrected: ManagerCoordinatorRecord = { ...record, sessionId: created.sessionId }
          await this.deps.coordinators.put(projectKey, corrected)
        }
        try {
          await this.deps.ctx.sessionController.rename({ sessionId, title: `项目协调台 · ${project.label}` })
        } catch (error) {
          this.deps.warn(`dsh-session-board: coordinator rename failed: ${String(error)}`)
        }
        return { projectKey, label: project.label, sessionId, workspaceId: workspace.workspaceId, created: true }
      } catch (error) {
        await this.deps.coordinators.delete(projectKey).catch(() => false)
        this.deps.warn(`dsh-session-board: coordinator create failed: ${String(error)}`)
        throw error
      }
    })()
    this.inflight.set(projectKey, task)
    try {
      return await task
    } finally {
      this.inflight.delete(projectKey)
    }
  }

  /**
   * Install project tools on one Agent: coordinator tools for a coordinator
   * session, report tool for a worker whose project already has a coordinator.
   * @param agent - every published Agent.
   */
  installAgent(agent: Agent): void {
    if (this.installed.has(agent.id)) return
    const coordinator = [...this.deps.coordinators.entries()].find(([, record]) => record.sessionId === agent.id)
    if (coordinator !== undefined) {
      this.installCoordinator(agent, coordinator[0])
      return
    }
    void this.installWorker(agent)
  }

  /** Drop one Agent's tool registrations. */
  disposeAgent(agentId: string): void {
    const dispose = this.installed.get(agentId)
    if (dispose === undefined) return
    this.installed.delete(agentId)
    dispose()
  }

  /** Release every registration; unload path. */
  dispose(): void {
    for (const dispose of [...this.installed.values()]) dispose()
    this.installed.clear()
  }

  /** Register coordinator tools and prompt sections on one Agent. */
  private installCoordinator(agent: Agent, projectKey: string): void {
    const disposers: Array<() => void> = []
    try {
      for (const definition of coordinatorToolDefinitions(this, projectKey)) {
        disposers.push(agent.ctx.tools.register(definition))
      }
      disposers.push(agent.ctx.systemPrompt.section({
        name: 'session-board:project-coordinator',
        order: 900,
        text: COORDINATOR_POLICY,
      }))
      this.installed.set(agent.id, () => { for (const dispose of disposers.reverse()) dispose() })
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose()
      this.deps.warn(`dsh-session-board: coordinator tools failed: ${String(error)}`)
    }
  }

  /** Worker tool: report to the project coordinator if this session belongs to a project. */
  private async installWorker(agent: Agent): Promise<void> {
    try {
      const projects = await this.projects()
      const workspace = this.deps.ctx.workspaceRegistry.list().find(candidate => candidate.sessionIds.includes(agent.id as SessionId))
      if (workspace === undefined) return
      for (const project of projects) {
        if (!project.workspaces.some(candidate => candidate.workspaceId === workspace.id)) continue
        const coordinator = this.deps.coordinators.get(project.key)
        if (coordinator === undefined) return
        if (this.installed.has(agent.id)) return
        const definition = reportToolDefinition(this, project.key, coordinator.sessionId, agent.id)
        const dispose = agent.ctx.tools.register(definition)
        this.installed.set(agent.id, dispose)
        return
      }
    } catch (error) {
      this.deps.warn(`dsh-session-board: worker project tool failed: ${String(error)}`)
    }
  }

  /** One project view with live session/task counts. */
  async overviewLines(projectKey: string): Promise<string[]> {
    const project = await this.view(projectKey)
    if (project === null) throw new Error(`unknown project "${projectKey}"`)
    const levels = this.deps.mux.snapshot().sources
    const registry = this.deps.ctx.workspaceRegistry
    const tasks = this.taskViews(project)
    const lines = [`- project ${project.label}${project.remote === undefined ? '' : ` (${project.remote})`}`]
    for (const workspace of project.workspaces) {
      const listed = registry.get(workspace.workspaceId as Workspace['id'])
      const sessionIds = listed?.sessionIds ?? []
      let running = 0
      let waiting = 0
      for (const id of sessionIds) {
        const level: MuxSourceLevel | undefined = levels[id]
        if (level?.status === 'running') running += 1
        if (level?.status === 'waiting' || level?.status === 'error') waiting += 1
      }
      lines.push(`- workspace ${workspace.title} [${workspace.branch ?? 'no branch'}] sessions=${sessionIds.length} running=${running} waiting=${waiting}`)
    }
    lines.push(...(tasks.length === 0
      ? ['- tasks (none)']
      : ['- tasks', ...tasks.map(task => `  - ${task.id} [${task.status}] ${task.title}${task.sessionId === undefined ? '' : ` session=${task.sessionId}`}`)]))
    return lines
  }

  /** Tasks whose workspace belongs to one project. */
  private taskViews(project: ProjectView): ManagerTaskRecord[] {
    const workspaces = new Set(project.workspaces.map(workspace => workspace.workspaceId))
    const tasks: ManagerTaskRecord[] = []
    for (const [, task] of this.deps.tasks.entries()) {
      if (task.workspaceId !== undefined && workspaces.has(task.workspaceId)) tasks.push(task)
    }
    tasks.sort((left, right) => right.updatedAt - left.updatedAt)
    return tasks
  }

  /** Resolve one project session and assert project membership. */
  private projectSession(projectKey: string, sessionId: string): { workspaceId: string } {
    const registry = this.deps.ctx.workspaceRegistry
    for (const workspace of registry.list()) {
      if (!workspace.sessionIds.includes(sessionId as SessionId)) continue
      const project = this.cached?.projects.find(candidate => candidate.workspaces.some(row => row.workspaceId === workspace.id))
      if (project?.key === projectKey) return { workspaceId: workspace.id as string }
    }
    throw new Error(`session "${sessionId}" is not part of project "${projectKey}"`)
  }

  /** Queue one text prompt into an existing session. */
  private async prompt(sessionId: SessionId, text: string): Promise<void> {
    const request: PromptRequest = {
      requestId: randomUUID() as RequestId,
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }
    await this.deps.ctx.sessionController.prompt(request, AbortSignal.timeout(PROMPT_TIMEOUT_MS))
  }

  /**
   * Create a task session in one branch workspace of a project.
   * @param projectKey - project key.
   * @param input - task title, brief and target workspace id.
   * @returns the created task and session.
   */
  async assignTask(projectKey: string, input: { title: string; brief: string; workspaceId: string }): Promise<ManagerTaskRecord> {
    const project = await this.view(projectKey)
    if (project === null) throw new Error(`unknown project "${projectKey}"`)
    if (!project.workspaces.some(workspace => workspace.workspaceId === input.workspaceId)) {
      throw new Error(`workspace "${input.workspaceId}" is not part of project "${projectKey}"`)
    }
    const now = this.now()
    const record: ManagerTaskRecord = {
      id: randomUUID(),
      title: input.title.slice(0, MANAGER_TITLE_MAX),
      status: 'assigned',
      workspaceId: input.workspaceId,
      createdAt: now,
      updatedAt: now,
    }
    await this.deps.tasks.put(record.id, record)
    try {
      const created = await this.deps.ctx.sessionController.create({ workspaceId: input.workspaceId as Workspace['id'] })
      const withSession: ManagerTaskRecord = { ...record, sessionId: created.sessionId, updatedAt: this.now() }
      await this.deps.tasks.put(record.id, withSession)
      await this.prompt(created.sessionId, input.brief)
      return withSession
    } catch (error) {
      const failed: ManagerTaskRecord = { ...record, status: 'failed', note: `dispatch failed: ${String(error)}`.slice(0, 2_000), updatedAt: this.now() }
      await this.deps.tasks.put(record.id, failed)
      throw error
    }
  }

  /**
   * Queue one message into an existing project session.
   * @param projectKey - project key.
   * @param sessionId - target project session.
   * @param text - message text.
   */
  async messageSession(projectKey: string, sessionId: string, text: string): Promise<void> {
    this.projectSession(projectKey, sessionId)
    await this.prompt(sessionId as SessionId, text)
  }

  /**
   * Status lines for one project session.
   * @param projectKey - project key.
   * @param sessionId - target session.
   * @returns human-readable lines.
   */
  async sessionStatus(projectKey: string, sessionId: string): Promise<string[]> {
    this.projectSession(projectKey, sessionId)
    const level = this.deps.mux.snapshot().sources[sessionId]
    const agent = this.deps.ctx.agents.get(sessionId as SessionId)
    let title: string | undefined
    try {
      const list = await this.deps.ctx.sessionController.list({}, AbortSignal.timeout(5_000))
      title = list.items.find(item => item.sessionId === sessionId)?.projections?.values.title ?? undefined
    } catch {
      // Listing is best-effort; the mux level is still useful.
    }
    return [
      `- session ${sessionId}`,
      `- status ${level?.status ?? agent?.status ?? 'unknown'}`,
      ...(title === undefined ? [] : [`- title ${previewText(title, 120)}`]),
      ...(level?.turn === undefined ? [] : [`- last turn ${level.turn}`]),
      ...(level?.lastKind === undefined ? [] : [`- last turn end ${level.lastKind}`]),
      ...(level?.lastError === undefined ? [] : [`- last error ${level.lastError}`]),
      ...(level?.preview === undefined ? [] : [`- last assistant ${level.preview}`]),
    ]
  }

  /**
   * Receive one worker report and relay it to the coordinator session.
   * @param projectKey - project key.
   * @param senderSessionId - worker session.
   * @param text - report text.
   * @param taskId - optional task this report belongs to.
   */
  async report(projectKey: string, senderSessionId: string, text: string, taskId?: string): Promise<void> {
    const record = this.deps.coordinators.get(projectKey)
    if (record === undefined) throw new Error(`project "${projectKey}" has no coordinator`)
    const task = taskId === undefined ? '' : `\n关联任务：${taskId}`
    await this.prompt(record.sessionId as SessionId, `[项目汇报 · ${record.label} · 来自 ${senderSessionId}] ${text}${task}`)
    if (taskId !== undefined) {
      const current = this.deps.tasks.get(taskId)
      if (current !== undefined) {
        const next: ManagerTaskRecord = { ...current, note: text.slice(0, 2_000), updatedAt: this.now() }
        await this.deps.tasks.put(taskId, next)
      }
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}

/** Pick the project's main checkout, then the first branch workspace. */
function pickCoordinatorWorkspace(project: ProjectView): ProjectWorkspaceView {
  const main = project.workspaces.find(workspace => workspace.path.split('/').filter(Boolean).pop() === project.label)
  const chosen = main ?? project.workspaces[0]
  if (chosen === undefined) throw new Error(`project "${project.label}" has no workspace`)
  return chosen
}

/** Coordinator-only tools. */
function coordinatorToolDefinitions(projects: ProjectCoordinators, projectKey: string): ToolDefinition[] {
  return [
    {
      name: 'project_overview',
      description: 'List this project\'s Workspaces/branches with session counts, running/waiting sessions and project tasks.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: LINE_OUTPUT,
      async execute(_args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        return await projects.overviewLines(projectKey)
      },
    },
    {
      name: 'project_assign_task',
      description: 'Create a task session inside one branch Workspace of this project and send the brief as its first message.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title.' },
          brief: { type: 'string', description: 'Complete task instructions for the new session.' },
          workspaceId: { type: 'string', description: 'Target Workspace id from project_overview.' },
        },
        required: ['title', 'brief', 'workspaceId'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'project_assign_task')
        const task = await projects.assignTask(projectKey, {
          title: argString(input, 'title', 'project_assign_task'),
          brief: argString(input, 'brief', 'project_assign_task'),
          workspaceId: argString(input, 'workspaceId', 'project_assign_task'),
        })
        return [`- task ${task.id} created in workspace ${task.workspaceId ?? '?'}`, ...(task.sessionId === undefined ? [] : [`- session ${task.sessionId}`])]
      },
    },
    {
      name: 'project_message_session',
      description: 'Queue a message into an existing session of this project (does not interrupt the current turn).',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Target session id (already inside this project).' },
          text: { type: 'string', description: 'Message to send.' },
        },
        required: ['sessionId', 'text'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'project_message_session')
        const sessionId = argString(input, 'sessionId', 'project_message_session')
        await projects.messageSession(projectKey, sessionId, argString(input, 'text', 'project_message_session'))
        return [`- message queued for ${sessionId}`]
      },
    },
    {
      name: 'project_session_status',
      description: 'Show status, last turn and preview of one session in this project.',
      parameters: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: 'Target session id.' } },
        required: ['sessionId'],
        additionalProperties: false,
      },
      output: LINE_OUTPUT,
      async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
        const input = argObject(args, 'project_session_status')
        return await projects.sessionStatus(projectKey, argString(input, 'sessionId', 'project_session_status'))
      },
    },
  ]
}

/** Worker-only tool: push a report back to the project coordinator. */
function reportToolDefinition(
  projects: ProjectCoordinators,
  projectKey: string,
  coordinatorSessionId: string,
  senderSessionId: string,
): ToolDefinition {
  return {
    name: 'report_to_coordinator',
    description: 'Report progress, a blocker or a result of this project to its coordinator session. Use short factual text.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to report.' },
        taskId: { type: 'string', description: 'Optional task id this report belongs to.' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: LINE_OUTPUT,
    async execute(args: unknown, _exec: ToolRunContext): Promise<readonly string[]> {
      const input = argObject(args, 'report_to_coordinator')
      const text = argString(input, 'text', 'report_to_coordinator')
      const taskId = typeof input.taskId === 'string' && input.taskId !== '' ? input.taskId : undefined
      await projects.report(projectKey, senderSessionId, text, taskId)
      return [`- report sent to coordinator ${coordinatorSessionId}`]
    },
  }
}
