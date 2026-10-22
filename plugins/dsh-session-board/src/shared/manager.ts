/**
 * Wire contract and pure helpers for the manager panel.
 *
 * The panel's Host half owns the durable selection/task facts and exposes them
 * over three authenticated JSON routes; the client half renders them and sends
 * user messages through the official session prompt path (not through a route).
 * This module is the single place both halves agree on shapes and derived text.
 *
 * It carries no DSH imports: the Host and Client bundles resolve only their own
 * code and Node builtins / the frozen browser platform modules.
 */

/** Manager routes, all registered on the shared authenticated `/api` channel. */
export const MANAGER_STATE_PATH = '/api/session-board/manager/state'
/** Read/write the durable selection mirror. */
export const MANAGER_SELECTION_PATH = '/api/session-board/manager/selection'
/** Create or update one manager task. */
export const MANAGER_TASK_PATH = '/api/session-board/manager/task'
/** Enable/disable automatic wakeups or request one digest immediately. */
export const MANAGER_WAKE_PATH = '/api/session-board/manager/wake'
/** Open (creating on first use) the coordinator session of one project. */
export const PROJECT_COORDINATOR_PATH = '/api/session-board/project/coordinator'

/** Lifecycle of one tracked task. `running`/`blocked` are derived by the mux. */
export const MANAGER_TASK_STATUSES = [
  'pending', 'assigned', 'running', 'blocked', 'done', 'failed', 'orphaned',
] as const

/** One task status. */
export type ManagerTaskStatus = (typeof MANAGER_TASK_STATUSES)[number]

/** Durable task record as both halves see it. */
export interface ManagerTaskView {
  readonly id: string
  readonly title: string
  readonly status: ManagerTaskStatus
  /** Workspace the task belongs to, when assigned to one. */
  readonly workspaceId?: string
  /** Session created to execute the task, when assigned. */
  readonly sessionId?: string
  /** Free-form progress note maintained by the manager (short). */
  readonly note?: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** The panel's current multi-selection. */
export interface ManagerSelection {
  readonly workspaceIds: readonly string[]
  readonly sessionIds: readonly string[]
}

/** Empty selection constant (fresh arrays so callers can spread safely). */
export const EMPTY_SELECTION: ManagerSelection = Object.freeze({ workspaceIds: [], sessionIds: [] })

/** Auto-wake status rendered by the panel. */
export interface ManagerWakeStatus {
  readonly enabled: boolean
  /** Pending notification edges (all severities). */
  readonly pending: number
  readonly urgent: number
  readonly attention: number
  readonly completed: number
  /** Epoch ms of the last delivered digest. */
  readonly lastWakeAt?: number
  /** Epoch ms of the next scheduled automatic digest. */
  readonly nextAt?: number
  /** Automatic wakes in the current rolling hour. */
  readonly wakesThisHour: number
  /** Budget suppressions since the last delivered digest. */
  readonly suppressed: number
  /** Last delivery failure, if any. */
  readonly error?: string
}

/** Wake actions accepted by `/manager/wake`. */
export type ManagerWakeAction = 'enable' | 'disable' | 'now'

/** `/project/coordinator` response. */
export interface ProjectCoordinatorResponse {
  readonly projectKey: string
  readonly label: string
  readonly sessionId: string
  readonly workspaceId: string
  /** True when this call created the session; false when it already existed. */
  readonly created: boolean
}

/** `/manager/wake` response. */
export interface ManagerWakeResponse {
  readonly wake: ManagerWakeStatus
}

/** `/manager/state` response. */
export interface ManagerStateView {
  /** Manager session id once provisioned; absent while the workspace is unavailable. */
  readonly managerSessionId?: string
  /** Workspace owning the manager session. */
  readonly managerWorkspaceId?: string
  readonly selection: ManagerSelection
  readonly tasks: readonly ManagerTaskView[]
  /** Automatic wakeup state: opt-in, pending counts, throttle diagnostics. */
  readonly wake: ManagerWakeStatus
  /** Monotone counter of the host-side event mux; clients may display staleness. */
  readonly muxRevision: number
  /** Present when provisioning or a projection read failed; the panel shows it and retries. */
  readonly error?: string
}

/** `/manager/selection` request. */
export interface ManagerSelectionRequest {
  readonly workspaceIds: readonly string[]
  readonly sessionIds: readonly string[]
}

/** `/manager/selection` response. */
export interface ManagerSelectionResponse {
  readonly selection: ManagerSelection
  readonly revision: number
}

/** `/manager/task` request: create needs `title`; update needs `id`. */
export interface ManagerTaskRequest {
  readonly action: 'create' | 'update'
  readonly task: {
    readonly id?: string
    readonly title?: string
    readonly status?: ManagerTaskStatus
    readonly workspaceId?: string
    readonly sessionId?: string
    readonly note?: string
  }
}

/** `/manager/task` response. */
export interface ManagerTaskResponse {
  readonly task: ManagerTaskView
}

/**
 * Parse one `/manager/wake` status object.
 * @param value - untrusted wire value.
 * @returns the normalized status, or null when the value is not usable.
 */
export function parseManagerWakeStatus(value: unknown): ManagerWakeStatus | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const count = (raw: unknown): number => (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0)
  if (typeof source.enabled !== 'boolean') return null
  return {
    enabled: source.enabled,
    pending: count(source.pending),
    urgent: count(source.urgent),
    attention: count(source.attention),
    completed: count(source.completed),
    wakesThisHour: count(source.wakesThisHour),
    suppressed: count(source.suppressed),
    ...(typeof source.lastWakeAt === 'number' && Number.isFinite(source.lastWakeAt) ? { lastWakeAt: source.lastWakeAt } : {}),
    ...(typeof source.nextAt === 'number' && Number.isFinite(source.nextAt) ? { nextAt: source.nextAt } : {}),
    ...(typeof source.error === 'string' && source.error !== '' ? { error: source.error } : {}),
  }
}

/** Whether a wire value names a known task status. */
export function isManagerTaskStatus(value: unknown): value is ManagerTaskStatus {
  return typeof value === 'string' && (MANAGER_TASK_STATUSES as readonly string[]).includes(value)
}

/** Longest id accepted from the wire before it becomes a storage key. */
export const MANAGER_ID_MAX = 200
/** Longest task title stored. */
export const MANAGER_TITLE_MAX = 160
/** Longest task note stored. */
export const MANAGER_NOTE_MAX = 2_000
/** Longest model-authored text forwarded as one prompt or task brief. */
export const MANAGER_PROMPT_MAX = 8_000
/** Most ids accepted in one selection mirror write. */
export const MANAGER_SELECTION_MAX = 500

/**
 * Failure a `/project/coordinator` handler may surface with a wire status.
 *
 * The coordinator route maps this to its HTTP status and error code; a plain
 * `Error` stays the generic 400. Project provisioning failures are server
 * faults, so a client retry should not look like a malformed request.
 */
export class ProjectCoordinatorError extends Error {
  /**
   * @param status - wire status: 400 for an unusable request, 500 for a server failure.
   * @param code - stable error code returned to the caller.
   * @param message - actionable description for logs and tools.
   * @param options - standard `Error` options, typically `cause`.
   */
  constructor(
    readonly status: 400 | 500,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ProjectCoordinatorError'
  }
}

/** Whether a wire value is a usable opaque id. */
export function isManagerId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MANAGER_ID_MAX
    && !value.includes('\0')
}

/** Collapse a wire selection to unique, bounded, valid ids. */
export function normalizeSelection(value: unknown): ManagerSelection {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Partial<ManagerSelectionRequest>
  const collect = (input: unknown): string[] => {
    if (!Array.isArray(input)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const entry of input) {
      if (!isManagerId(entry) || seen.has(entry)) continue
      seen.add(entry)
      out.push(entry)
      if (out.length >= MANAGER_SELECTION_MAX) break
    }
    return out
  }
  return { workspaceIds: collect(source.workspaceIds), sessionIds: collect(source.sessionIds) }
}

/** Truncate by Unicode code points so a cut never splits a surrogate pair. */
export function truncateCodePoints(text: string, max: number): string {
  const points = Array.from(text)
  return points.length <= max ? text : `${points.slice(0, Math.max(0, max - 1)).join('')}…`
}

/** Shorten one line of model/user text for a card preview. */
export function previewText(text: string, max = 120): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return truncateCodePoints(collapsed, max)
}

/** Labels the panel needs to render a selection message. */
export interface SelectionLabels {
  readonly workspaceTitles: Readonly<Record<string, string>>
  readonly sessionTitles: Readonly<Record<string, string>>
  readonly sessionStates?: Readonly<Record<string, string>>
}

/**
 * Build the user message the panel sends when the user explicitly hands the
 * current selection to the manager. It is plain text because the message is an
 * ordinary logged user message: model-visible input must be reconstructable
 * from the session log.
 *
 * @param selection - current selection.
 * @param labels - display titles/states resolved from client snapshots.
 * @param instruction - user instruction appended after the selection block.
 * @returns the message text, or an empty string when there is nothing selected.
 */
export function buildSelectionMessage(
  selection: ManagerSelection,
  labels: SelectionLabels,
  instruction = '',
): string {
  const workspaces = selection.workspaceIds.map(id =>
    `- 工作区 ${labels.workspaceTitles[id] ?? id} (${id})`)
  const sessions = selection.sessionIds.map((id) => {
    const title = labels.sessionTitles[id] ?? id
    const state = labels.sessionStates?.[id]
    return `- 会话 ${title} (${id})${state === undefined ? '' : ` · ${state}`}`
  })
  const body = [...workspaces, ...sessions]
  if (body.length === 0 && instruction.trim() === '') return ''
  const lines = ['[选区] 以下是用户在面板中勾选的对象：', ...body]
  const text = instruction.trim()
  if (text !== '') lines.push('', text)
  return lines.join('\n')
}

/** Coarse phase of the manager session shown in the panel header. */
export type ManagerPhase = 'idle' | 'running' | 'waiting'

/**
 * Derive the manager header phase from client status facts.
 * @param running - `uiSession` running flag; `undefined` while unknown.
 * @param waiting - whether a pending interaction is reported for the session.
 * @returns the phase shown next to the drawer title.
 */
export function managerPhase(running: boolean | undefined, waiting: boolean): ManagerPhase {
  if (waiting) return 'waiting'
  return running === true ? 'running' : 'idle'
}

/** Status keys the panel renders for one task row. */
export const TASK_STATUS_KEYS: Readonly<Record<ManagerTaskStatus, string>> = {
  pending: 'task.status.pending',
  assigned: 'task.status.assigned',
  running: 'task.status.running',
  blocked: 'task.status.blocked',
  done: 'task.status.done',
  failed: 'task.status.failed',
  orphaned: 'task.status.orphaned',
}
