/**
 * Host manager service: provisions the resident manager session, owns the
 * durable selection/task facts, installs the manager-only tools and prompt
 * context on that Agent, and turns event-mux edges into (optional) digests.
 *
 * DSH services are typed through type-only imports (erased at build). The
 * runtime bundle carries no DSH import — the profile does not install those
 * packages next to the plugin — so every call below goes through the injected
 * `Context` service instance, which the wiring hands in after nested inject.
 */
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Ambient (type-only) service declarations: no runtime imports.
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-workspace'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { Workspace } from '@deepseek-ai/dsh-workspace'
import type {
  ManagerSelection, ManagerSelectionResponse, ManagerStateView, ManagerTaskRequest, ManagerTaskResponse,
  ManagerTaskStatus, ManagerTaskView,
} from '../../shared/manager.ts'
import { MANAGER_NOTE_MAX, MANAGER_TITLE_MAX, normalizeSelection, previewText } from '../../shared/manager.ts'
import { MANAGER_STATE_KEY, emptyManagerState } from './domain.ts'
import type { ManagerStateRecord, ManagerTaskRecord } from './domain.ts'
import type { EventMux, MuxSourceLevel } from './mux.ts'
import { managerToolDefinitions } from './tools.ts'

/** KV table face used by the manager domain records. */
export interface ManagerTable<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}

/** Everything the service needs from the host composition. */
export interface ManagerServiceDeps {
  /** Nested-injected context carrying the four host services. */
  readonly ctx: Context
  readonly state: ManagerTable<ManagerStateRecord>
  readonly tasks: ManagerTable<ManagerTaskRecord>
  readonly mux: EventMux
  /** Absolute directory that becomes the manager workspace. */
  readonly managerDir: string
  /** Contained warning sink. */
  readonly warn: (message: string) => void
  /** Clock injection for tests. */
  readonly now?: () => number
}

/** Manager session display title. */
export const MANAGER_SESSION_TITLE = 'DSH 管理台'
/** Minimum interval between automatic wakeups. */
const AUTO_WAKE_MIN_INTERVAL_MS = 60_000
/** Prompt call timeout for manager-side writes. */
const MANAGER_PROMPT_TIMEOUT_MS = 30_000
/** Prompt section/context order, above ordinary runtime context. */
const MANAGER_SECTION_ORDER = 900
const MANAGER_CONTEXT_ORDER = 950

/** System prompt section describing the manager role and its tools. */
const MANAGER_POLICY = [
  'You are the DSH workspace manager. You are the only agent that can see the',
  'manager panel state, hand out tasks to workspaces, and report progress.',
  '',
  'Tools: workspace_overview, workspace_sessions, session_status, read_selection,',
  'assign_task, list_tasks, update_task, report_progress, set_auto_wake.',
  'Use assign_task only for concrete work the user asked for; create one task and',
  'one session per work item, then track it with update_task. Never archive, delete',
  'or stop sessions or jobs; ask the user to do it in the main UI.',
  'The user may hand you a selection block; the durable selection is also visible',
  'below. Keep task notes short and evidence-based.',
].join('\n')

/** Prompt request shape recovered from the host service (type-only). */
type PromptRequest = Parameters<Context['sessionController']['prompt']>[0]
/** Request-id brand recovered from the same call. */
type RequestId = PromptRequest['requestId']

/**
 * The resident manager. One instance per plugin fiber; the manager session is a
 * normal DSH session provisioned lazily, with tools re-attached on every resume.
 */
export class ManagerService {
  private state: ManagerStateRecord
  private managerSessionId: SessionId | undefined
  private provisioning: Promise<{ managerSessionId: string; managerWorkspaceId?: string }> | undefined
  private readonly installed = new Map<string, () => void>()
  private lastWakeAt = 0
  private lastError: string | undefined

  /** @param deps - nested host context plus the durable tables. */
  constructor(private readonly deps: ManagerServiceDeps) {
    this.state = deps.state.get(MANAGER_STATE_KEY) ?? emptyManagerState()
    this.managerSessionId = this.state.managerSessionId === undefined
      ? undefined
      : this.state.managerSessionId as SessionId
  }

  /** Current session id, when provisioned. */
  get sessionId(): string | undefined {
    return this.managerSessionId
  }

  /** Project the durable state into the wire view. */
  view(): ManagerStateView {
    return {
      ...(this.managerSessionId === undefined ? {} : { managerSessionId: this.managerSessionId }),
      ...(this.state.managerWorkspaceId === undefined ? {} : { managerWorkspaceId: this.state.managerWorkspaceId }),
      selection: normalizeSelection(this.state.selection),
      tasks: this.taskViews(),
      wakeEnabled: this.state.wakeEnabled,
      muxRevision: this.deps.mux.snapshot().revision,
      ...(this.lastError === undefined ? {} : { error: this.lastError }),
    }
  }

  /**
   * Provision the manager workspace/session once. Idempotent and serialized;
   * the session id is persisted before creation so an `agent/created` listener
   * can recognize the very first manager Agent.
   */
  ensure(): Promise<{ managerSessionId: string; managerWorkspaceId?: string }> {
    if (this.managerSessionId !== undefined) {
      return Promise.resolve({
        managerSessionId: this.managerSessionId,
        ...(this.state.managerWorkspaceId === undefined ? {} : { managerWorkspaceId: this.state.managerWorkspaceId }),
      })
    }
    this.provisioning ??= this.provision().finally(() => { this.provisioning = undefined })
    return this.provisioning
  }

  /**
   * Install tools/prompt context on the manager Agent, whether it was just
   * created or resumed from disk. Non-manager agents are ignored.
   * @param agent - every published Agent.
   */
  installAgent(agent: Agent): void {
    if (agent.id !== this.managerSessionId || this.installed.has(agent.id)) return
    const disposers: Array<() => void> = []
    try {
      const context = this.toolContext()
      for (const definition of managerToolDefinitions(context)) {
        disposers.push(agent.ctx.tools.register(definition))
      }
      disposers.push(agent.ctx.systemPrompt.section({
        name: 'session-board:manager-policy',
        order: MANAGER_SECTION_ORDER,
        text: MANAGER_POLICY,
      }))
      disposers.push(agent.ctx.systemPrompt.context({
        name: 'session-board:manager-context',
        order: MANAGER_CONTEXT_ORDER,
        required: true,
        text: () => this.promptContextText(),
      }))
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose()
      this.deps.warn(`dsh-session-board: manager tools failed to install: ${describe(error)}`)
      return
    }
    this.installed.set(agent.id, () => {
      for (const dispose of disposers.reverse()) dispose()
    })
  }

  /** Drop one Agent's scoped registrations when it is disposed. */
  disposeAgent(agentId: string): void {
    const dispose = this.installed.get(agentId)
    if (dispose === undefined) return
    this.installed.delete(agentId)
    dispose()
  }

  /** Release every scoped registration; called on plugin unload. */
  dispose(): void {
    for (const dispose of [...this.installed.values()]) dispose()
    this.installed.clear()
  }

  /** Current durable selection. */
  selection(): ManagerSelection {
    return normalizeSelection(this.state.selection)
  }

  /**
   * Persist one selection mirror write.
   * @param raw - untrusted wire value.
   * @returns the normalized selection and new revision.
   */
  async writeSelection(raw: unknown): Promise<ManagerSelectionResponse> {
    const selection = normalizeSelection(raw)
    const next: ManagerStateRecord = { ...this.state, selection, revision: this.state.revision + 1 }
    await this.deps.state.put(MANAGER_STATE_KEY, next)
    this.state = next
    return { selection, revision: next.revision }
  }

  /**
   * Apply one task-board mutation.
   * @param request - wire request (`create` or `update`).
   * @returns the resulting task view.
   */
  async task(request: ManagerTaskRequest): Promise<ManagerTaskResponse> {
    if (request.action === 'create') {
      const title = typeof request.task.title === 'string' ? request.task.title.trim() : ''
      if (title === '') throw new Error('task create requires a title')
      const now = this.now()
      const record: ManagerTaskRecord = {
        id: randomUUID(),
        title: title.slice(0, MANAGER_TITLE_MAX),
        status: request.task.status ?? 'pending',
        ...(typeof request.task.workspaceId === 'string' ? { workspaceId: request.task.workspaceId } : {}),
        ...(typeof request.task.sessionId === 'string' ? { sessionId: request.task.sessionId } : {}),
        ...(typeof request.task.note === 'string' ? { note: request.task.note.slice(0, MANAGER_NOTE_MAX) } : {}),
        createdAt: now,
        updatedAt: now,
      }
      await this.deps.tasks.put(record.id, record)
      return { task: this.deriveTask(record) }
    }
    const id = typeof request.task.id === 'string' ? request.task.id : ''
    const current = this.deps.tasks.get(id)
    if (current === undefined) throw new Error(`unknown task "${id}"`)
    const status = request.task.status
    const note = request.task.note
    const next: ManagerTaskRecord = {
      ...current,
      ...(status === undefined ? {} : { status }),
      ...(note === undefined ? {} : { note: note.slice(0, MANAGER_NOTE_MAX) }),
      updatedAt: this.now(),
    }
    await this.deps.tasks.put(id, next)
    return { task: this.deriveTask(next) }
  }

  /**
   * Turn newly drained mux edges into at most one manager digest. The wake
   * policy is deliberately conservative: opted-in, manager idle, one wake per
   * minute, and edges only (never one prompt per event).
   * @param now - injectable clock.
   */
  noteEdges(now = this.now()): void {
    if (!this.state.wakeEnabled) return
    const sessionId = this.managerSessionId
    if (sessionId === undefined) return
    if (this.deps.ctx.agents.get(sessionId)?.status === 'running') return
    if (now - this.lastWakeAt < AUTO_WAKE_MIN_INTERVAL_MS) return
    const digest = this.deps.mux.digest()
    if (digest === '') return
    this.lastWakeAt = now
    this.prompt(sessionId, `[系统] ${digest}\n\n请查看当前状态并用工具处理或向用户汇报。`).catch(
      error => this.deps.warn(`dsh-session-board: auto wake failed: ${describe(error)}`),
    )
  }

  /** The tool/prompt content projection installed on the manager Agent. */
  private toolContext() {
    return {
      selection: () => this.selection(),
      tasks: () => this.taskViews(),
      overview: async () => this.overview(),
      workspaceSessions: async (workspaceId: string) => this.workspaceSessions(workspaceId),
      sessionStatus: async (sessionId: string) => this.sessionStatus(sessionId),
      assignTask: async (input: { readonly title: string; readonly brief: string; readonly workspaceId: string }) =>
        await this.assignTask(input),
      updateTask: async (input: { readonly id: string; readonly status?: ManagerTaskStatus; readonly note?: string }) =>
        (await this.task({
          action: 'update',
          task: {
            id: input.id,
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.note === undefined ? {} : { note: input.note }),
          },
        })).task,
      reportProgress: async (input: { readonly text: string; readonly taskId?: string }) => { await this.reportProgress(input) },
      setAutoWake: async (enabled: boolean) => await this.setAutoWake(enabled),
    }
  }

  /** Dynamic prompt context: selection, tasks and last progress line. */
  private promptContextText(): string {
    const selection = this.selection()
    const tasks = this.taskViews()
    const lines = [
      `[manager panel] selection: workspaces=[${selection.workspaceIds.join(', ')}] sessions=[${selection.sessionIds.join(', ')}]`,
    ]
    if (this.state.lastProgress !== undefined) lines.push(`[last progress] ${this.state.lastProgress}`)
    lines.push(...(tasks.length === 0
      ? ['[tasks] (empty)']
      : ['[tasks]', ...tasks.map(task => `- ${task.id} [${task.status}] ${task.title}`
        + (task.sessionId === undefined ? '' : ` session=${task.sessionId}`))]))
    return lines.join('\n')
  }

  private async provision(): Promise<{ managerSessionId: string; managerWorkspaceId?: string }> {
    try {
      await mkdir(this.deps.managerDir, { recursive: true })
      let workspace = await this.deps.ctx.workspaceRegistry.resolveByPath(this.deps.managerDir)
      workspace ??= await this.deps.ctx.workspaceRegistry.create(this.deps.managerDir)
      const sessionId = randomUUID() as SessionId
      const pending: ManagerStateRecord = {
        ...this.state,
        managerSessionId: sessionId,
        managerWorkspaceId: workspace.id,
        revision: this.state.revision + 1,
      }
      // Persist before creation so an agent/created listener can recognize the
      // manager even during the very first creation.
      await this.deps.state.put(MANAGER_STATE_KEY, pending)
      this.state = pending
      this.managerSessionId = sessionId
      const created = await this.deps.ctx.sessionController.create({ sessionId, workspaceId: workspace.id })
      const createdId = created.sessionId
      if (createdId !== sessionId) {
        const corrected: ManagerStateRecord = {
          ...this.state,
          managerSessionId: createdId,
          revision: this.state.revision + 1,
        }
        await this.deps.state.put(MANAGER_STATE_KEY, corrected)
        this.state = corrected
        this.managerSessionId = createdId
      }
      try {
        await this.deps.ctx.sessionController.rename({ sessionId: createdId, title: MANAGER_SESSION_TITLE })
      } catch (error) {
        this.deps.warn(`dsh-session-board: manager session rename failed: ${describe(error)}`)
      }
      this.lastError = undefined
      return {
        managerSessionId: createdId,
        ...(this.state.managerWorkspaceId === undefined ? {} : { managerWorkspaceId: this.state.managerWorkspaceId }),
      }
    } catch (error) {
      this.lastError = describe(error)
      this.deps.warn(`dsh-session-board: manager provisioning failed: ${describe(error)}`)
      throw error
    }
  }

  private taskViews(): readonly ManagerTaskView[] {
    const views: ManagerTaskView[] = []
    for (const [, record] of this.deps.tasks.entries()) views.push(this.deriveTask(record))
    views.sort((left, right) => right.updatedAt - left.updatedAt)
    return views
  }

  /** Derive a task's running/blocked state from the session event mux. */
  private deriveTask(record: ManagerTaskRecord): ManagerTaskView {
    const level: MuxSourceLevel | undefined = record.sessionId === undefined
      ? undefined
      : this.deps.mux.snapshot().sources[record.sessionId]
    if (level === undefined || record.status === 'done' || record.status === 'failed' || record.status === 'orphaned') {
      return record
    }
    if (level.status === 'running' && record.status !== 'running') {
      return { ...record, status: 'running', updatedAt: Math.max(record.updatedAt, level.lastAt) }
    }
    if ((level.status === 'error' || level.status === 'waiting') && record.status !== 'blocked') {
      return { ...record, status: 'blocked', updatedAt: Math.max(record.updatedAt, level.lastAt) }
    }
    return record
  }

  private async overview(): Promise<readonly string[]> {
    const tasks = this.taskViews()
    return this.deps.ctx.workspaceRegistry.list().map(workspace => `- ${workspace.id} "${workspace.title}" ${workspace.path}`
      + ` sessions=${workspace.sessionIds.length} tasks=${tasks.filter(task => task.workspaceId === workspace.id).length}`)
  }

  private async listSessions(): Promise<readonly { sessionId: string; title?: string; running?: boolean }[]> {
    try {
      const response = await this.deps.ctx.sessionController.list({}, AbortSignal.timeout(5_000))
      return response.items.map((item) => {
        const title = item.projections?.values.title
        return {
          sessionId: item.sessionId,
          ...(typeof title === 'string' && title !== '' ? { title } : {}),
          running: item.running,
        }
      })
    } catch (error) {
      this.deps.warn(`dsh-session-board: manager session list failed: ${describe(error)}`)
      return []
    }
  }

  private async workspaceSessions(workspaceId: string): Promise<readonly string[]> {
    const workspace = this.deps.ctx.workspaceRegistry.get(workspaceId as Workspace['id'])
    if (workspace === undefined) throw new Error(`unknown workspace "${workspaceId}"`)
    const rows = await this.listSessions()
    const byId = new Map(rows.map(row => [row.sessionId, row]))
    const sources = this.deps.mux.snapshot().sources
    return workspace.sessionIds.map((sessionId) => {
      const row = byId.get(sessionId)
      const state = sources[sessionId]
      const title = row?.title ?? sessionId
      return `- ${sessionId} ${state?.status ?? (row?.running === true ? 'running' : 'idle')} "${previewText(title, 80)}"`
    })
  }

  private async sessionStatus(sessionId: string): Promise<readonly string[]> {
    const level = this.deps.mux.snapshot().sources[sessionId]
    const agent = this.deps.ctx.agents.get(sessionId as SessionId)
    const rows = await this.listSessions()
    const row = rows.find(candidate => candidate.sessionId === sessionId)
    if (level === undefined && agent === undefined && row === undefined) {
      throw new Error(`unknown session "${sessionId}"`)
    }
    return [
      `- session ${sessionId}`,
      `- status ${level?.status ?? agent?.status ?? 'unknown'}`,
      ...(row?.title === undefined ? [] : [`- title ${previewText(row.title, 120)}`]),
      ...(level?.turn === undefined ? [] : [`- last turn ${level.turn}`]),
      ...(level?.lastKind === undefined ? [] : [`- last turn end ${level.lastKind}`]),
      ...(level?.lastError === undefined ? [] : [`- last error ${level.lastError}`]),
      ...(level?.preview === undefined ? [] : [`- last assistant ${level.preview}`]),
    ]
  }

  private async assignTask(input: {
    readonly title: string
    readonly brief: string
    readonly workspaceId: string
  }): Promise<{ readonly task: ManagerTaskView; readonly sessionId?: string }> {
    const workspace = this.deps.ctx.workspaceRegistry.get(input.workspaceId as Workspace['id'])
    if (workspace === undefined) throw new Error(`unknown workspace "${input.workspaceId}"`)
    const now = this.now()
    const record: ManagerTaskRecord = {
      id: randomUUID(),
      title: input.title.slice(0, MANAGER_TITLE_MAX),
      status: 'assigned',
      workspaceId: workspace.id,
      createdAt: now,
      updatedAt: now,
    }
    await this.deps.tasks.put(record.id, record)
    try {
      const created = await this.deps.ctx.sessionController.create({ workspaceId: workspace.id })
      const withSession: ManagerTaskRecord = { ...record, sessionId: created.sessionId, updatedAt: this.now() }
      await this.deps.tasks.put(record.id, withSession)
      await this.prompt(created.sessionId, input.brief)
      return { task: this.deriveTask(withSession), sessionId: created.sessionId }
    } catch (error) {
      const failed: ManagerTaskRecord = {
        ...record,
        status: 'failed',
        note: `task dispatch failed: ${describe(error)}`.slice(0, MANAGER_NOTE_MAX),
        updatedAt: this.now(),
      }
      await this.deps.tasks.put(record.id, failed)
      this.deps.warn(`dsh-session-board: assign_task dispatch failed: ${describe(error)}`)
      return { task: this.deriveTask(failed) }
    }
  }

  private async reportProgress(input: { readonly text: string; readonly taskId?: string }): Promise<void> {
    const note = input.text.slice(0, MANAGER_NOTE_MAX)
    if (input.taskId === undefined) {
      const next: ManagerStateRecord = { ...this.state, lastProgress: note, revision: this.state.revision + 1 }
      await this.deps.state.put(MANAGER_STATE_KEY, next)
      this.state = next
      return
    }
    const current = this.deps.tasks.get(input.taskId)
    if (current === undefined) throw new Error(`unknown task "${input.taskId}"`)
    const next: ManagerTaskRecord = { ...current, note: note.slice(0, MANAGER_NOTE_MAX), updatedAt: this.now() }
    await this.deps.tasks.put(input.taskId, next)
  }

  private async setAutoWake(enabled: boolean): Promise<boolean> {
    const next: ManagerStateRecord = { ...this.state, wakeEnabled: enabled, revision: this.state.revision + 1 }
    await this.deps.state.put(MANAGER_STATE_KEY, next)
    this.state = next
    return next.wakeEnabled
  }

  private async prompt(sessionId: SessionId, text: string): Promise<void> {
    const request: PromptRequest = {
      requestId: randomUUID() as RequestId,
      sessionId,
      mode: 'queue',
      content: [{ type: 'text', text }],
    }
    await this.deps.ctx.sessionController.prompt(request, AbortSignal.timeout(MANAGER_PROMPT_TIMEOUT_MS))
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}

/** Error-to-line helper shared with the plugin wiring. */
export function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/** Default manager workspace directory (overridable through the environment). */
export function defaultManagerDir(): string {
  return process.env.DSH_SESSION_BOARD_MANAGER_DIR ?? join(homedir(), 'Documents', 'deepseek-harness', 'dsh-console')
}
