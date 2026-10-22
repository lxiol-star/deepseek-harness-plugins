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
import { basename } from 'node:path'
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
import { normalizeRemote, projectLabel, redactRemoteCredentials } from '../../shared/workspace-meta.ts'
import {
  MANAGER_NOTE_MAX, MANAGER_PROMPT_MAX, MANAGER_TITLE_MAX, ProjectCoordinatorError,
  isManagerId, previewText, truncateCodePoints,
} from '../../shared/manager.ts'

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
/** Budget for the cold-Session existence check on an existing coordinator record. */
const SESSION_CHECK_TIMEOUT_MS = 5_000

/**
 * One Agent's tool registrations, plus the cancellation flag an in-flight
 * worker install reads before it registers anything.
 */
interface InstallSlot {
  disposed: boolean
  readonly disposers: Array<() => void>
}

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

/** Read one required opaque id argument, bounded like every other wire id. */
function argId(input: Record<string, unknown>, name: string, tool: string): string {
  const value = argString(input, name, tool)
  if (!isManagerId(value)) throw new Error(`${tool}: "${name}" must be a non-empty bounded id`)
  return value
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
  private inflightProjects: Promise<ProjectView[]> | null = null
  private readonly installed = new Map<string, InstallSlot>()
  private readonly inflight = new Map<string, Promise<ProjectCoordinatorResult>>()
  private disposed = false

  /** @param deps - nested host context plus the durable tables. */
  constructor(private readonly deps: ProjectCoordinatorDeps) {}

  /**
   * Probe every registered Workspace and group them by git origin.
   *
   * Concurrent callers share one probe pass: Agent creation instantiates the
   * report tool for every session, and without the shared pass a burst would
   * spawn one git probe storm per session.
   * @param force - ignore the cache.
   * @returns projects, sorted by label.
   */
  async projects(force = false): Promise<ProjectView[]> {
    const now = this.now()
    if (!force && this.cached !== null && now - this.cached.at < PROJECT_CACHE_MS) return this.cached.projects
    const running = this.inflightProjects
    if (running !== null) return await running
    const task = this.probeProjects(now)
    this.inflightProjects = task
    try {
      return await task
    } finally {
      if (this.inflightProjects === task) this.inflightProjects = null
    }
  }

  /**
   * One probe pass over the registry. Failures are per Workspace: a broken
   * checkout costs its own project row only.
   * @param at - cache timestamp taken before the probes start.
   * @returns projects, sorted by label.
   */
  private async probeProjects(at: number): Promise<ProjectView[]> {
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
        // The raw remote can embed a credential; everything user- and
        // model-visible (project view, coordinator record, overview lines)
        // reads this redacted form.
        project = { key, label, remote: redactRemoteCredentials(info.remote), workspaces: [] }
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
    this.cached = { at, projects }
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
    // The key becomes a storage key and a lookup value, so bound it before
    // anything reaches the tables or the session controller.
    if (!isManagerId(projectKey)) {
      throw new ProjectCoordinatorError(400, 'PROJECT_INVALID', 'projectKey must be a non-empty bounded string')
    }
    // Join an in-flight creation before trusting the persisted record. The
    // record is written before its session exists so the very first
    // `agent/created` can recognise the coordinator; returning it from a second
    // concurrent call would hand out a session id that is still being created.
    const running = this.inflight.get(projectKey)
    if (running !== undefined) return await running
    const task = this.open(projectKey)
    this.inflight.set(projectKey, task)
    try {
      return await task
    } finally {
      if (this.inflight.get(projectKey) === task) this.inflight.delete(projectKey)
    }
  }

  /**
   * Resolve or provision one coordinator. A persisted record whose session no
   * longer exists (a crash between the record write and session creation, or a
   * user-deleted session) is dropped and reprovisioned instead of handing the
   * client a dead id.
   * @param projectKey - validated normalized origin key.
   * @returns the coordinator identity.
   */
  private async open(projectKey: string): Promise<ProjectCoordinatorResult> {
    const existing = this.deps.coordinators.get(projectKey)
    if (existing !== undefined) {
      const state = await this.coordinatorSessionState(existing.sessionId)
      if (state !== 'missing') {
        // Records written before credential redaction may still carry a raw
        // remote; rewrite it lazily when the coordinator is opened.
        if (existing.remote !== undefined) {
          const redacted = redactRemoteCredentials(existing.remote)
          if (redacted !== existing.remote) {
            await this.deps.coordinators.put(projectKey, { ...existing, remote: redacted }).catch(
              error => this.deps.warn(`dsh-session-board: coordinator record redaction failed: ${String(error)}`),
            )
          }
        }
        return { projectKey, label: existing.label, sessionId: existing.sessionId, workspaceId: existing.workspaceId, created: false }
      }
      this.deps.warn(`dsh-session-board: coordinator record for "${projectKey}" has no session; recreating`)
      await this.deps.coordinators.delete(projectKey).catch(() => false)
    }
    const project = await this.view(projectKey)
    if (project === null) throw new ProjectCoordinatorError(400, 'PROJECT_UNKNOWN', `unknown project "${projectKey}"`)
    const workspace = pickCoordinatorWorkspace(project)
    const requestedSessionId = randomUUID() as SessionId
    let record: ManagerCoordinatorRecord = {
      projectKey,
      label: project.label,
      sessionId: requestedSessionId,
      workspaceId: workspace.workspaceId,
      createdAt: this.now(),
      ...(project.remote === undefined ? {} : { remote: project.remote }),
    }
    await this.deps.coordinators.put(projectKey, record)
    try {
      const created = await this.deps.ctx.sessionController.create({
        sessionId: requestedSessionId,
        workspaceId: workspace.workspaceId as Workspace['id'],
      })
      // `create` may ignore the requested identity (it mints a new Session when
      // the requested one is stored but no longer reusable). Everything below,
      // including the record and the response, must use the Session that
      // actually exists.
      const sessionId = created.sessionId
      if (sessionId !== requestedSessionId) {
        record = { ...record, sessionId }
        await this.deps.coordinators.put(projectKey, record)
      }
      try {
        await this.deps.ctx.sessionController.rename({ sessionId, title: `项目协调台 · ${project.label}` })
      } catch (error) {
        this.deps.warn(`dsh-session-board: coordinator rename failed: ${String(error)}`)
      }
      // Sessions that were already live when the coordinator appeared never get
      // another install event; give them the report tool now so worker → coordinator
      // reports work without restarting them.
      this.installProjectWorkers(project)
      return { projectKey, label: project.label, sessionId, workspaceId: workspace.workspaceId, created: true }
    } catch (error) {
      await this.deps.coordinators.delete(projectKey).catch(() => false)
      this.deps.warn(`dsh-session-board: coordinator create failed: ${String(error)}`)
      throw new ProjectCoordinatorError(
        500,
        'COORDINATOR_UNAVAILABLE',
        `coordinator provisioning failed for "${project.label}"`,
        { cause: error },
      )
    }
  }

  /**
   * Install the report tool on every live Agent of one project's sessions.
   * @param project - project whose coordinator just became available.
   */
  private installProjectWorkers(project: ProjectView): void {
    const registry = this.deps.ctx.workspaceRegistry
    for (const workspace of project.workspaces) {
      const listed = registry.get(workspace.workspaceId as Workspace['id'])
      for (const sessionId of listed?.sessionIds ?? []) {
        const agent = this.deps.ctx.agents.get(sessionId)
        if (agent !== undefined) this.installAgent(agent)
      }
    }
  }

  /**
   * Whether a persisted coordinator id still names a Session.
   *
   * The header listing is the primary check: it reads headers, not event logs,
   * so verifying a coordinator that already exists stays cheap. `inspect` is
   * only the fallback for a failed listing (it reads the full log). `unknown` is
   * deliberate too: a failed check must not trigger a second coordinator, so
   * only a successful listing that omits the id counts as proof the Session is
   * gone.
   * @param sessionId - persisted coordinator session id.
   * @returns `live`, `missing`, or `unknown` when existence cannot be checked.
   */
  private async coordinatorSessionState(sessionId: string): Promise<'live' | 'missing' | 'unknown'> {
    if (this.deps.ctx.agents.get(sessionId as SessionId) !== undefined) return 'live'
    const controller = this.deps.ctx.sessionController
    try {
      const listed = await controller.list({}, AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS))
      return listed.items.some(item => item.sessionId === sessionId) ? 'live' : 'missing'
    } catch {
      // A failed listing is not proof of absence; confirm through the log read.
    }
    if (typeof controller.inspect === 'function') {
      try {
        await controller.inspect(sessionId as SessionId, AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS))
        return 'live'
      } catch {
        // Both reads failed: keep the record rather than creating a duplicate.
      }
    }
    return 'unknown'
  }

  /**
   * Install project tools on one Agent: coordinator tools for a coordinator
   * session, report tool for a worker whose project already has a coordinator.
   * @param agent - every published Agent.
   */
  installAgent(agent: Agent): void {
    if (this.disposed || this.installed.has(agent.id)) return
    const coordinator = [...this.deps.coordinators.entries()].find(([, record]) => record.sessionId === agent.id)
    if (coordinator !== undefined) {
      this.installCoordinator(agent, coordinator[0])
      return
    }
    // Claim the slot synchronously: the worker lookup awaits the project probe,
    // and a duplicate event or a dispose during that await must not register
    // the tool twice or after teardown.
    const slot: InstallSlot = { disposed: false, disposers: [] }
    this.installed.set(agent.id, slot)
    void this.installWorker(agent, slot)
  }

  /** Drop one Agent's tool registrations. */
  disposeAgent(agentId: string): void {
    const slot = this.installed.get(agentId)
    if (slot === undefined) return
    this.installed.delete(agentId)
    this.disposeSlot(slot)
  }

  /** Release every registration; unload path. */
  dispose(): void {
    this.disposed = true
    for (const slot of [...this.installed.values()]) this.disposeSlot(slot)
    this.installed.clear()
  }

  /** Run one slot's disposers once; also cancels a still-pending install. */
  private disposeSlot(slot: InstallSlot): void {
    slot.disposed = true
    for (const dispose of slot.disposers.reverse()) dispose()
    slot.disposers.length = 0
  }

  /** Register coordinator tools and prompt sections on one Agent. */
  private installCoordinator(agent: Agent, projectKey: string): void {
    const slot: InstallSlot = { disposed: false, disposers: [] }
    try {
      for (const definition of coordinatorToolDefinitions(this, projectKey)) {
        slot.disposers.push(agent.ctx.tools.register(definition))
      }
      slot.disposers.push(agent.ctx.systemPrompt.section({
        name: 'session-board:project-coordinator',
        order: 900,
        text: COORDINATOR_POLICY,
      }))
      this.installed.set(agent.id, slot)
    } catch (error) {
      this.disposeSlot(slot)
      this.deps.warn(`dsh-session-board: coordinator tools failed: ${String(error)}`)
    }
  }

  /**
   * Worker tool: report to the project coordinator if this session belongs to
   * a project. Runs detached; the slot bounds the damage of a late completion.
   * @param agent - published Agent whose session may be a project worker.
   * @param slot - slot already owned by this Agent in {@link installed}.
   */
  private async installWorker(agent: Agent, slot: InstallSlot): Promise<void> {
    try {
      const projects = await this.projects()
      if (slot.disposed) return
      const workspace = this.deps.ctx.workspaceRegistry.list().find(candidate => candidate.sessionIds.includes(agent.id as SessionId))
      if (workspace === undefined) {
        this.dropSlot(agent.id, slot)
        return
      }
      for (const project of projects) {
        if (!project.workspaces.some(candidate => candidate.workspaceId === workspace.id)) continue
        const coordinator = this.deps.coordinators.get(project.key)
        if (coordinator === undefined) {
          this.dropSlot(agent.id, slot)
          return
        }
        const definition = reportToolDefinition(this, project.key, coordinator.sessionId, agent.id)
        slot.disposers.push(agent.ctx.tools.register(definition))
        return
      }
      this.dropSlot(agent.id, slot)
    } catch (error) {
      this.dropSlot(agent.id, slot)
      this.deps.warn(`dsh-session-board: worker project tool failed: ${String(error)}`)
    }
  }

  /** Remove an Agent's slot when no tool was registered for it. */
  private dropSlot(agentId: string, slot: InstallSlot): void {
    if (this.installed.get(agentId) === slot) this.installed.delete(agentId)
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

  /**
   * Resolve one project session and assert project membership.
   *
   * Membership is read from a TTL-refreshed project view, never the raw cache
   * field: the cache is only refreshed by project listings, so a long-lived
   * plugin would otherwise authorize against a snapshot of unknown age.
   * @param projectKey - coordinator project key.
   * @param sessionId - untrusted session id from a tool call.
   * @returns the owning workspace id when the session belongs to the project.
   */
  private async projectSession(projectKey: string, sessionId: string): Promise<{ workspaceId: string }> {
    const project = await this.view(projectKey)
    if (project === null) throw new Error(`unknown project "${projectKey}"`)
    const workspaceIds = new Set(project.workspaces.map(workspace => workspace.workspaceId))
    const registry = this.deps.ctx.workspaceRegistry
    for (const workspace of registry.list()) {
      if (!workspace.sessionIds.includes(sessionId as SessionId)) continue
      if (workspaceIds.has(workspace.id as string)) return { workspaceId: workspace.id as string }
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
      title: truncateCodePoints(input.title, MANAGER_TITLE_MAX),
      status: 'assigned',
      workspaceId: input.workspaceId,
      createdAt: now,
      updatedAt: now,
    }
    await this.deps.tasks.put(record.id, record)
    let sessionId: string | undefined
    try {
      const created = await this.deps.ctx.sessionController.create({ workspaceId: input.workspaceId as Workspace['id'] })
      sessionId = created.sessionId
      const withSession: ManagerTaskRecord = { ...record, sessionId, updatedAt: this.now() }
      await this.deps.tasks.put(record.id, withSession)
      // Model-authored brief: bound it before it becomes a session log entry.
      await this.prompt(created.sessionId, truncateCodePoints(input.brief, MANAGER_PROMPT_MAX))
      return withSession
    } catch (error) {
      // Keep the session link when creation already succeeded: the session
      // exists even though its brief could not be queued.
      const failed: ManagerTaskRecord = {
        ...record,
        ...(sessionId === undefined ? {} : { sessionId }),
        status: 'failed',
        note: `dispatch failed: ${String(error)}`.slice(0, MANAGER_NOTE_MAX),
        updatedAt: this.now(),
      }
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
    await this.projectSession(projectKey, sessionId)
    await this.prompt(sessionId as SessionId, truncateCodePoints(text, MANAGER_PROMPT_MAX))
  }

  /**
   * Status lines for one project session.
   * @param projectKey - project key.
   * @param sessionId - target session.
   * @returns human-readable lines.
   */
  async sessionStatus(projectKey: string, sessionId: string): Promise<string[]> {
    await this.projectSession(projectKey, sessionId)
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
   *
   * `taskId` comes from the model and is therefore untrusted: only a task whose
   * Workspace (or session) belongs to this project may be annotated, so a
   * worker cannot overwrite another project's task note by passing its id.
   * @param projectKey - project key.
   * @param senderSessionId - worker session.
   * @param text - report text.
   * @param taskId - optional task this report belongs to.
   */
  async report(projectKey: string, senderSessionId: string, text: string, taskId?: string): Promise<void> {
    const record = this.deps.coordinators.get(projectKey)
    if (record === undefined) throw new Error(`project "${projectKey}" has no coordinator`)
    const body = truncateCodePoints(text, MANAGER_PROMPT_MAX)
    let linked: ManagerTaskRecord | undefined
    if (taskId !== undefined) {
      const current = this.deps.tasks.get(taskId)
      if (current !== undefined && await this.taskInProject(projectKey, current)) linked = current
    }
    const association = linked === undefined ? '' : `\n关联任务：${linked.id}`
    await this.prompt(record.sessionId as SessionId, `[项目汇报 · ${record.label} · 来自 ${senderSessionId}] ${body}${association}`)
    if (linked !== undefined) {
      const next: ManagerTaskRecord = { ...linked, note: truncateCodePoints(text, MANAGER_NOTE_MAX), updatedAt: this.now() }
      await this.deps.tasks.put(linked.id, next)
    }
  }

  /**
   * Whether a task row belongs to one project.
   * @param projectKey - coordinator project key.
   * @param task - stored task row.
   * @returns true when the task's workspace or session is a project member.
   */
  private async taskInProject(projectKey: string, task: ManagerTaskRecord): Promise<boolean> {
    const project = await this.view(projectKey)
    if (project === null) return false
    if (task.workspaceId !== undefined) {
      return project.workspaces.some(workspace => workspace.workspaceId === task.workspaceId)
    }
    if (task.sessionId === undefined) return false
    try {
      await this.projectSession(projectKey, task.sessionId)
      return true
    } catch {
      return false
    }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}

/**
 * Pick the project's main checkout, then the first branch workspace.
 *
 * The checkout directory commonly differs in case from the normalized remote
 * key, so compare the basename case-insensitively; `basename` also handles a
 * Windows checkout path.
 */
function pickCoordinatorWorkspace(project: ProjectView): ProjectWorkspaceView {
  const label = project.label.toLowerCase()
  const main = project.workspaces.find(workspace => basename(workspace.path).toLowerCase() === label)
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
          workspaceId: argId(input, 'workspaceId', 'project_assign_task'),
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
        const sessionId = argId(input, 'sessionId', 'project_message_session')
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
        return await projects.sessionStatus(projectKey, argId(input, 'sessionId', 'project_session_status'))
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
      // An id the tool boundary does not accept cannot name a real task; treat
      // it as absent rather than letting it reach the task table.
      const taskId = isManagerId(input.taskId) ? input.taskId : undefined
      await projects.report(projectKey, senderSessionId, text, taskId)
      return [`- report sent to coordinator ${coordinatorSessionId}`]
    },
  }
}
