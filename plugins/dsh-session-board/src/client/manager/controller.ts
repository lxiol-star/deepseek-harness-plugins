/**
 * The manager panel's client controller.
 *
 * One instance owns everything the drawer renders: the host state mirror
 * (manager identity, durable selection, task board), the local selection and
 * focused workspace, the debounced selection mirror write, and the retained
 * Session reference the embedded official chat consumes.
 *
 * Deliberate boundaries:
 *  - only the drawer-open flag is persisted locally; selection and tasks are
 *    host facts and are re-read on every open, so two windows agree;
 *  - sending is the official client path (`sessions.retain` →
 *    `reference.ready` → `session.prompt`), not a plugin route: the message
 *    must be logged, deduplicated and authenticated by the same path the GUI
 *    composer uses;
 *  - a failed selection mirror write never discards the user's ticks: the
 *    local selection stays authoritative on screen and the next tick re-syncs.
 */
import {
  EMPTY_SELECTION,
  MANAGER_SELECTION_PATH,
  MANAGER_STATE_PATH,
  MANAGER_TASK_PATH,
  MANAGER_WAKE_PATH,
  buildSelectionMessage,
  isManagerTaskStatus,
  parseManagerWakeStatus,
  normalizeSelection,
  type ManagerSelection,
  type ManagerSelectionResponse,
  type ManagerStateView,
  type ManagerTaskStatus,
  type ManagerTaskView,
  type ManagerWakeStatus,
} from '../../shared/manager.ts'
import type {
  RetainSession,
  SessionListState,
  SessionReference,
  Source,
  WorkspacesService,
} from '../dsh.ts'
import { createStore, type Store } from '../store.ts'

/** localStorage key holding the drawer-open flag; nothing else is persisted. */
export const MANAGER_STORE_KEY = 'dsh.session-board.manager.v1'

/** Pause between the last tick and the selection mirror write, in milliseconds. */
export const MANAGER_SELECTION_DEBOUNCE_MS = 450

/**
 * Host-state poll period while the drawer is open. The manager Agent creates
 * tasks and answers turns outside this client, so the panel re-reads the host
 * mirror instead of assuming it owns the data. Selection ticks are never
 * clobbered: `applyState` keeps the local set while a mirror write is dirty.
 */
export const MANAGER_POLL_MS = 4_000

/** Consumer identity of the panel's retained manager Session. */
export const MANAGER_REFERENCE_SOURCE = 'sessionBoardManager'

/** Stable error keys; the drawer renders them through the dictionary. */
export type ManagerErrorKey =
  | 'manager.errorState'
  | 'manager.errorPrompt'
  | 'manager.errorSelection'
  | 'manager.errorTask'
  | 'manager.errorWake'

/** Read phases of the host state mirror. */
export type ManagerPhase = 'loading' | 'ready' | 'error'

/** Readiness of the retained manager Session behind the embedded chat. */
export type ManagerChatPhase = 'idle' | 'loading' | 'ready' | 'error'

/** The complete render snapshot. */
export interface ManagerSnapshot {
  /** Drawer visibility; the only persisted field. */
  readonly open: boolean
  /** Host state read phase. */
  readonly phase: ManagerPhase
  /** Localized error key, or null. */
  readonly error: ManagerErrorKey | null
  /** Short diagnostic shown as the error line's tooltip, or null. */
  readonly errorDetail: string | null
  /** Raw host diagnostic from the state view's optional `error` field. */
  readonly stateError: string | null
  readonly managerSessionId: string | null
  readonly managerWorkspaceId: string | null
  readonly selection: ManagerSelection
  readonly tasks: readonly ManagerTaskView[]
  /** Automatic wakeup state: opt-in, pending counts, throttle diagnostics. */
  readonly wake: ManagerWakeStatus
  readonly muxRevision: number
  /** A "send selection" round trip is in flight. */
  readonly sending: boolean
  /** A selection mirror write is in flight. */
  readonly syncing: boolean
  /** The last send was accepted; cleared by the next selection change or send. */
  readonly sent: boolean
  /** Workspace whose sessions the left pane lists. */
  readonly focusedWorkspaceId: string | null
  /** Retained manager Session for the embedded chat. */
  readonly reference: SessionReference | null
  readonly chat: ManagerChatPhase
  /** Diagnostic code from the last failed retention/open, or null. */
  readonly chatError: string | null
}

/** Result of one explicit "send selection to manager" action. */
export type ManagerSendResult = { ok: true } | { ok: false; error: string }

/** Task creation input accepted by {@link ManagerController.createTask}. */
export interface ManagerTaskDraft {
  readonly title: string
  readonly workspaceId?: string | undefined
  readonly sessionId?: string | undefined
  readonly status?: ManagerTaskStatus | undefined
  readonly note?: string | undefined
}

/** Task update input accepted by {@link ManagerController.updateTask}. */
export interface ManagerTaskPatch {
  readonly title?: string | undefined
  readonly workspaceId?: string | undefined
  readonly sessionId?: string | undefined
  readonly status?: ManagerTaskStatus | undefined
  readonly note?: string | undefined
}

/** The sessions-service members the controller reads. */
export interface ManagerSessionsFace {
  readonly list: Source<SessionListState>
  readonly retain?: RetainSession | undefined
  /** Refresh the host session list; used before retaining a just-provisioned id. */
  readonly refresh?: (() => Promise<void>) | undefined
}

/** Collaborators of {@link ManagerController}. */
export interface ManagerControllerOptions {
  /** The client sessions service; `retain` is what the embedded chat needs. */
  readonly sessions: ManagerSessionsFace | null
  /** The client workspaces service, for workspace titles in the message. */
  readonly workspaces: WorkspacesService | null
}

/** Persisted slice: drawer visibility only. */
interface ManagerPersisted {
  open: boolean
}

/** Wake status before the first host read (and for a host that predates the route). */
function emptyWakeStatus(): ManagerWakeStatus {
  return { enabled: false, pending: 0, urgent: 0, attention: 0, completed: 0, wakesThisHour: 0, suppressed: 0 }
}

/** The initial snapshot before any host read. */
function initialState(): ManagerSnapshot {
  return {
    open: false,
    phase: 'loading',
    error: null,
    errorDetail: null,
    stateError: null,
    managerSessionId: null,
    managerWorkspaceId: null,
    selection: { workspaceIds: [...EMPTY_SELECTION.workspaceIds], sessionIds: [...EMPTY_SELECTION.sessionIds] },
    tasks: [],
    wake: emptyWakeStatus(),
    muxRevision: 0,
    sending: false,
    syncing: false,
    sent: false,
    focusedWorkspaceId: null,
    reference: null,
    chat: 'idle',
    chatError: null,
  }
}

/** Narrow an unknown wire value to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Read a non-empty string or null. */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Read a finite number or null. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** One wire failure code, for the error line's diagnostic tooltip. */
function failureCode(payload: Record<string, unknown>): string {
  return stringOrNull(payload['error']) ?? 'REQUEST_FAILED'
}

/**
 * Parse one task view. A row missing its identity, title or status is dropped
 * rather than rendered as a half-row.
 * @param value - raw wire value.
 * @returns the task view, or null when it cannot be rendered.
 */
function parseTask(value: unknown): ManagerTaskView | null {
  const record = asRecord(value)
  if (record === null) return null
  const id = stringOrNull(record['id'])
  const title = stringOrNull(record['title'])
  const status = record['status']
  if (id === null || title === null || !isManagerTaskStatus(status)) return null
  const workspaceId = stringOrNull(record['workspaceId'])
  const sessionId = stringOrNull(record['sessionId'])
  const note = stringOrNull(record['note'])
  const createdAt = numberOrNull(record['createdAt'])
  const updatedAt = numberOrNull(record['updatedAt'])
  return {
    id,
    title,
    status,
    ...(workspaceId === null ? {} : { workspaceId }),
    ...(sessionId === null ? {} : { sessionId }),
    ...(note === null ? {} : { note }),
    createdAt: createdAt ?? 0,
    updatedAt: updatedAt ?? 0,
  }
}

/**
 * Parse the `/manager/state` payload, tolerating only the documented wire
 * fields and dropping malformed rows.
 * @param value - raw wire value.
 * @returns the state view, or null when the envelope carries no state.
 */
function parseState(value: unknown): ManagerStateView | null {
  const record = asRecord(value)
  if (record === null) return null
  const tasks: ManagerTaskView[] = []
  const rawTasks = record['tasks']
  if (Array.isArray(rawTasks)) {
    for (const raw of rawTasks) {
      const task = parseTask(raw)
      if (task !== null) tasks.push(task)
    }
  }
  const managerSessionId = stringOrNull(record['managerSessionId'])
  const managerWorkspaceId = stringOrNull(record['managerWorkspaceId'])
  const stateError = stringOrNull(record['error'])
  const revision = numberOrNull(record['muxRevision'])
  const wake = parseManagerWakeStatus(record['wake'])
    ?? (record['wakeEnabled'] === true ? { ...emptyWakeStatus(), enabled: true } : emptyWakeStatus())
  return {
    ...(managerSessionId === null ? {} : { managerSessionId }),
    ...(managerWorkspaceId === null ? {} : { managerWorkspaceId }),
    ...(stateError === null ? {} : { error: stateError }),
    selection: normalizeSelection(record['selection']),
    tasks,
    wake,
    muxRevision: revision ?? 0,
  }
}

/** Parse the `/manager/selection` payload. */
function parseSelectionResponse(value: Record<string, unknown>): ManagerSelectionResponse | null {
  const record = asRecord(value['selection'])
  if (record === null) return null
  return {
    selection: normalizeSelection(record),
    revision: numberOrNull(value['revision']) ?? 0,
  }
}

/** Release a reference exactly once, containing a broken release. */
function releaseQuietly(reference: SessionReference | null): void {
  if (reference === null) return
  try {
    reference.release()
  } catch {
    // A session already gone; nothing else to own here.
  }
}

/**
 * POST/GET one JSON route and return its decoded record.
 * @param path - exact route path.
 * @param init - optional fetch init (method/body).
 * @returns the decoded response object.
 * @throws Error carrying the wire error code (or `REQUEST_FAILED`).
 */
async function requestJson(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await globalThis.fetch(path, init)
  } catch {
    throw new Error('REQUEST_FAILED')
  }
  const payload: unknown = await response.json().catch(() => null)
  const record = asRecord(payload)
  if (!response.ok) throw new Error(record === null ? `HTTP_${response.status}` : failureCode(record))
  if (record === null) throw new Error('INVALID_RESPONSE')
  return record
}

/** POST one JSON body to a manager route. */
function postJson(path: string, body: unknown): Promise<Record<string, unknown>> {
  return requestJson(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Read the two client snapshots the selection message labels need.
 * @param options - controller collaborators.
 * @returns display titles for the selected ids.
 */
function selectionLabels(options: ManagerControllerOptions): {
  workspaceTitles: Record<string, string>
  sessionTitles: Record<string, string>
  sessionStates: Record<string, string>
} {
  const workspaceTitles: Record<string, string> = {}
  const workspaceSnapshot = options.workspaces?.list.getSnapshot()
  if (workspaceSnapshot !== undefined && workspaceSnapshot !== null) {
    for (const item of workspaceSnapshot.items) {
      workspaceTitles[item.workspaceId] = item.title ?? item.path
    }
  }
  const sessionTitles: Record<string, string> = {}
  const sessionStates: Record<string, string> = {}
  const sessionSnapshot = options.sessions?.list.getSnapshot()
  if (sessionSnapshot !== undefined && sessionSnapshot !== null) {
    for (const id of sessionSnapshot.ids) {
      const row = sessionSnapshot.byId[id]
      if (row === undefined) continue
      sessionTitles[id] = row.displayTitle !== '' ? row.displayTitle : (row.title ?? id)
      if (row.running === true) sessionStates[id] = 'running'
    }
  }
  return { workspaceTitles, sessionTitles, sessionStates }
}

/**
 * The manager drawer's external store.
 *
 * Not a hook: one instance per plugin, shared by the drawer, the header toggle
 * and the embedded-chat bridge, so the retained Session and the debounced
 * mirror writes exist once.
 */
export class ManagerController {
  private state: ManagerSnapshot
  private readonly listeners = new Set<() => void>()
  private readonly persistence: Store<ManagerPersisted>
  private readonly options: ManagerControllerOptions
  private reference: SessionReference | null = null
  private referencePromise: Promise<SessionReference | null> | null = null
  /** Id the in-flight acquisition belongs to; a different id must wait it out. */
  private referencePromiseId: string | null = null
  private refreshPromise: Promise<void> | null = null
  private selectionTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private pollTimer: ReturnType<typeof globalThis.setInterval> | null = null
  /** Serializes selection mirror writes so a stale write cannot land last. */
  private syncQueue: Promise<void> = Promise.resolve()
  private selectionDirty = false
  private disposed = false

  constructor(options: ManagerControllerOptions) {
    this.options = options
    this.persistence = createStore<ManagerPersisted>({ open: false }, {
      persist: MANAGER_STORE_KEY,
      revive: (stored, _initial) => {
        const source = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<ManagerPersisted>
        return { open: source.open === true }
      },
    })
    const open = this.persistence.getSnapshot().open
    this.state = { ...initialState(), open }
    if (open) {
      queueMicrotask(() => {
        if (this.disposed || !this.state.open) return
        void this.refresh()
      })
    }
  }

  /** Bound snapshot reader for `useSyncExternalStore`. */
  readonly getSnapshot = (): ManagerSnapshot => this.state

  /** Bound subscriber for `useSyncExternalStore`. Never fires after disposal. */
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Show the drawer and read the current host state. */
  open(): void {
    if (this.disposed) return
    if (!this.state.open) {
      this.persistence.set({ open: true })
      this.publish({ open: true, sent: false })
    }
    this.startPolling()
    void this.refresh()
  }

  /** Hide the drawer and release the retained manager Session. */
  close(): void {
    if (this.disposed) return
    this.persistence.set({ open: false })
    this.stopPolling()
    this.releaseReference()
    this.publish({ open: false, chat: 'idle', chatError: null })
  }

  /** Flip drawer visibility. */
  toggle(): void {
    if (this.state.open) this.close()
    else this.open()
  }

  /** Workspace whose sessions the left pane lists; null shows none. */
  setFocused(workspaceId: string | null): void {
    if (this.disposed || this.state.focusedWorkspaceId === workspaceId) return
    this.publish({ focusedWorkspaceId: workspaceId })
  }

  /** Tick or untick one workspace in the local selection. */
  toggleWorkspaceId(workspaceId: string): void {
    if (this.disposed || workspaceId === '') return
    const current = this.state.selection.workspaceIds
    const workspaceIds = current.includes(workspaceId)
      ? current.filter(id => id !== workspaceId)
      : [...current, workspaceId]
    this.applyLocalSelection({ ...this.state.selection, workspaceIds })
  }

  /** Tick or untick one session in the local selection. */
  toggleSessionId(sessionId: string): void {
    if (this.disposed || sessionId === '') return
    const current = this.state.selection.sessionIds
    const sessionIds = current.includes(sessionId)
      ? current.filter(id => id !== sessionId)
      : [...current, sessionId]
    this.applyLocalSelection({ ...this.state.selection, sessionIds })
  }

  /** Empty the local selection and mirror the empty set. */
  clearSelection(): void {
    if (this.disposed) return
    if (this.state.selection.workspaceIds.length === 0 && this.state.selection.sessionIds.length === 0) return
    this.applyLocalSelection({ workspaceIds: [], sessionIds: [] })
  }

  /**
   * Read the host state mirror. Concurrent calls share one request.
   * @returns completion of the read attempt; failures land in the snapshot.
   */
  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.refreshPromise !== null) return this.refreshPromise
    if (this.state.phase !== 'ready') this.publish({ phase: 'loading', error: null, errorDetail: null })
    const promise = (async (): Promise<void> => {
      try {
        const payload = await requestJson(MANAGER_STATE_PATH)
        if (payload['ok'] !== true) throw new Error(failureCode(payload))
        const view = parseState(payload['state'])
        if (view === null) throw new Error('INVALID_STATE')
        if (this.disposed) return
        this.applyState(view)
        this.publish({
          phase: 'ready',
          ...(this.state.error === 'manager.errorState' ? { error: null, errorDetail: null } : {}),
        })
        if (this.state.managerSessionId !== null) void this.ensureReference()
      } catch (error) {
        if (this.disposed) return
        this.publish({
          phase: this.state.phase === 'ready' ? 'ready' : 'error',
          error: 'manager.errorState',
          errorDetail: error instanceof Error ? error.message : 'REQUEST_FAILED',
          stateError: null,
        })
      } finally {
        this.refreshPromise = null
      }
    })()
    this.refreshPromise = promise
    return promise
  }

  /** Begin the open-drawer poll; idempotent and never runs after disposal. */
  private startPolling(): void {
    if (this.disposed || this.pollTimer !== null) return
    this.pollTimer = globalThis.setInterval(() => {
      if (this.disposed || !this.state.open) {
        this.stopPolling()
        return
      }
      void this.refresh()
    }, MANAGER_POLL_MS)
  }

  /** Stop the open-drawer poll. */
  private stopPolling(): void {
    if (this.pollTimer === null) return
    globalThis.clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  /** Retry the failed read and the retained chat after one error. */
  retry(): void {
    if (this.disposed) return
    void this.refresh()
    if (this.state.managerSessionId !== null) void this.ensureReference()
  }

  /**
   * Send the current selection to the manager as one queued user message.
   * @param instruction - optional user instruction appended after the selection block.
   * @returns success, or the localized error key to display.
   */
  async sendSelection(instruction = ''): Promise<ManagerSendResult> {
    if (this.disposed || this.state.sending) return { ok: false, error: 'manager.errorPrompt' }
    const text = buildSelectionMessage(this.state.selection, selectionLabels(this.options), instruction)
    if (text === '') return { ok: false, error: 'manager.selectionEmpty' }
    this.publish({ sending: true, sent: false, error: null, errorDetail: null })
    try {
      // The host mirror is what the manager's mounted tools read; flush it
      // before the message so the context and the message agree.
      await this.flushSelection()
      const reference = await this.ensureReference()
      if (reference === null) {
        this.publish({ sending: false, error: 'manager.errorPrompt', errorDetail: this.state.chatError })
        return { ok: false, error: 'manager.errorPrompt' }
      }
      const result = await reference.binding.session.prompt([{ type: 'text', text }], 'queue')
      if (result.ok !== true) {
        this.publish({ sending: false, error: 'manager.errorPrompt', errorDetail: result.error.code ?? result.error.message ?? 'PROMPT_FAILED' })
        return { ok: false, error: 'manager.errorPrompt' }
      }
      this.publish({ sending: false, sent: true })
      return { ok: true }
    } catch (error) {
      if (!this.disposed) {
        this.publish({ sending: false, error: 'manager.errorPrompt', errorDetail: error instanceof Error ? error.message : 'PROMPT_FAILED' })
      }
      return { ok: false, error: 'manager.errorPrompt' }
    }
  }

  /**
   * Create one task through the host task route.
   * @param draft - title plus optional workspace/session/status/note.
   * @returns whether the host accepted the write.
   */
  async createTask(draft: ManagerTaskDraft): Promise<boolean> {
    if (this.disposed) return false
    const task: Record<string, unknown> = { title: draft.title }
    if (draft.workspaceId !== undefined) task['workspaceId'] = draft.workspaceId
    if (draft.sessionId !== undefined) task['sessionId'] = draft.sessionId
    if (draft.status !== undefined) task['status'] = draft.status
    if (draft.note !== undefined) task['note'] = draft.note
    return this.writeTask({ action: 'create', task })
  }

  /**
   * Update one task through the host task route.
   * @param taskId - task identity from the state mirror.
   * @param patch - fields to replace.
   * @returns whether the host accepted the write.
   */
  async updateTask(taskId: string, patch: ManagerTaskPatch): Promise<boolean> {
    if (this.disposed) return false
    const task: Record<string, unknown> = { id: taskId }
    if (patch.title !== undefined) task['title'] = patch.title
    if (patch.workspaceId !== undefined) task['workspaceId'] = patch.workspaceId
    if (patch.sessionId !== undefined) task['sessionId'] = patch.sessionId
    if (patch.status !== undefined) task['status'] = patch.status
    if (patch.note !== undefined) task['note'] = patch.note
    return this.writeTask({ action: 'update', task })
  }

  /**
   * Enable or disable automatic wakeups through the host route.
   * @param enabled - new opt-in value.
   * @returns whether the host accepted the change.
   */
  async setWake(enabled: boolean): Promise<boolean> {
    return await this.writeWake({ action: enabled ? 'enable' : 'disable' })
  }

  /**
   * Ask the host for one digest as soon as the manager is idle.
   * @returns whether the request was accepted.
   */
  async wakeNow(): Promise<boolean> {
    return await this.writeWake({ action: 'now' })
  }

  /** One `/manager/wake` round trip; publishes the returned status. */
  private async writeWake(body: Record<string, unknown>): Promise<boolean> {
    if (this.disposed) return false
    try {
      const payload = await postJson(MANAGER_WAKE_PATH, body)
      if (payload['ok'] !== true) throw new Error(failureCode(payload))
      const wake = parseManagerWakeStatus(payload['wake'])
      if (wake === null) throw new Error('INVALID_RESPONSE')
      if (!this.disposed) this.publish({ wake, ...(this.state.error === 'manager.errorWake' ? { error: null, errorDetail: null } : {}) })
      return true
    } catch (error) {
      if (!this.disposed) {
        this.publish({ error: 'manager.errorWake', errorDetail: error instanceof Error ? error.message : 'REQUEST_FAILED' })
      }
      return false
    }
  }

  /** Release the retained Session, timers and subscribers. Terminal. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopPolling()
    if (this.selectionTimer !== null) {
      globalThis.clearTimeout(this.selectionTimer)
      this.selectionTimer = null
    }
    this.releaseReference()
    this.referencePromise = null
    this.referencePromiseId = null
    this.refreshPromise = null
    this.listeners.clear()
  }

  /** Swap in a new snapshot and wake every listener. */
  private publish(next: Partial<ManagerSnapshot>): void {
    if (this.disposed) return
    this.state = { ...this.state, ...next }
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // One misbehaving consumer must not stop the drawer.
      }
    }
  }

  /** Store a locally changed selection and schedule its durable mirror. */
  private applyLocalSelection(selection: ManagerSelection): void {
    const current = this.state.selection
    if (current.workspaceIds === selection.workspaceIds && current.sessionIds === selection.sessionIds) return
    this.selectionDirty = true
    this.publish({ selection, sent: false, error: this.state.error === 'manager.errorSelection' ? null : this.state.error })
    this.scheduleSelectionSync()
  }

  /** Debounced selection mirror write. */
  private scheduleSelectionSync(): void {
    if (this.disposed) return
    if (this.selectionTimer !== null) globalThis.clearTimeout(this.selectionTimer)
    this.selectionTimer = globalThis.setTimeout(() => {
      this.selectionTimer = null
      if (this.disposed) return
      if (this.state.syncing) {
        this.scheduleSelectionSync()
        return
      }
      void this.syncSelection()
    }, MANAGER_SELECTION_DEBOUNCE_MS)
  }

  /** Send the pending local selection now, if any. */
  private async flushSelection(): Promise<void> {
    if (this.selectionTimer !== null) {
      globalThis.clearTimeout(this.selectionTimer)
      this.selectionTimer = null
    }
    if (!this.selectionDirty || this.disposed) return
    await this.syncSelection()
  }

  /** Mirror the current local selection now, serialized after any in-flight write. */
  private syncSelection(): Promise<void> {
    if (this.disposed || !this.selectionDirty) return Promise.resolve()
    const run = (): Promise<void> => this.performSelectionSync()
    this.syncQueue = this.syncQueue.then(run, run)
    return this.syncQueue
  }

  /**
   * One selection mirror write. Runs on the serialized queue, so the payload
   * is the selection current at write time; a failed write keeps the local
   * selection and the scheduled reconciliation retries it.
   */
  private async performSelectionSync(): Promise<void> {
    if (this.disposed || !this.selectionDirty) return
    const captured = this.state.selection
    this.publish({ syncing: true })
    try {
      const payload = await postJson(MANAGER_SELECTION_PATH, {
        workspaceIds: captured.workspaceIds,
        sessionIds: captured.sessionIds,
      })
      if (payload['ok'] !== true) throw new Error(failureCode(payload))
      if (parseSelectionResponse(payload) === null) throw new Error('INVALID_RESPONSE')
      if (this.disposed) return
      if (this.state.selection === captured) this.selectionDirty = false
      this.publish({
        syncing: false,
        ...(this.state.error === 'manager.errorSelection' ? { error: null, errorDetail: null } : {}),
      })
    } catch (error) {
      if (this.disposed) return
      this.publish({
        syncing: false,
        error: 'manager.errorSelection',
        errorDetail: error instanceof Error ? error.message : 'REQUEST_FAILED',
      })
    }
  }

  /** Apply one host state read to the local snapshot. */
  private applyState(view: ManagerStateView): void {
    const nextSessionId = view.managerSessionId ?? null
    if (nextSessionId !== this.state.managerSessionId) {
      this.releaseReference()
    }
    const selection = this.selectionDirty
      ? this.state.selection
      : { workspaceIds: [...view.selection.workspaceIds], sessionIds: [...view.selection.sessionIds] }
    this.publish({
      managerSessionId: nextSessionId,
      managerWorkspaceId: view.managerWorkspaceId ?? null,
      stateError: view.error ?? null,
      selection,
      tasks: [...view.tasks],
      wake: view.wake,
      muxRevision: view.muxRevision,
      ...(nextSessionId !== this.state.managerSessionId
        ? { reference: null, chat: 'idle' as const, chatError: null }
        : {}),
    })
  }

  /**
   * Retain the manager Session once and await its opening. Concurrent calls
   * share one acquisition; failures land in the snapshot for the chat pane.
   * @returns the reference (caller must not release it), or null.
   */
  private ensureReference(): Promise<SessionReference | null> {
    if (this.disposed) return Promise.resolve(null)
    const managerSessionId = this.state.managerSessionId
    if (managerSessionId === null) {
      this.publish({ chat: 'error', chatError: 'MANAGER_SESSION_UNAVAILABLE' })
      return Promise.resolve(null)
    }
    const existing = this.reference
    if (existing !== null) {
      if (existing.sessionId === managerSessionId) return Promise.resolve(existing)
      this.releaseReference()
    }
    if (this.referencePromise !== null) {
      if (this.referencePromiseId === managerSessionId) return this.referencePromise
      // A stale acquisition for an older id is still settling: re-enter after
      // it releases instead of returning a reference the state no longer names.
      return this.referencePromise.then(() => this.ensureReference())
    }
    const sessions = this.options.sessions
    const retain = sessions?.retain
    if (sessions === null || sessions === undefined || typeof retain !== 'function') {
      this.publish({ chat: 'error', chatError: 'SESSION_SERVICE_UNAVAILABLE' })
      return Promise.resolve(null)
    }
    this.publish({ chat: 'loading', chatError: null })
    const promise = (async (): Promise<SessionReference | null> => {
      let acquired: SessionReference | null = null
      try {
        // A freshly provisioned manager session may not be in the client's
        // catalog yet; retaining an unknown id throws. Refresh the
        // Host-authoritative list once instead of failing the whole chat.
        if (sessions.list.getSnapshot().byId[managerSessionId] === undefined
          && typeof sessions.refresh === 'function') {
          await sessions.refresh()
          if (this.disposed || this.state.managerSessionId !== managerSessionId) return null
        }
        acquired = retain.call(sessions, managerSessionId, { source: MANAGER_REFERENCE_SOURCE })
        await acquired.ready
        if (this.disposed || this.state.managerSessionId !== managerSessionId) {
          releaseQuietly(acquired)
          return null
        }
        this.reference = acquired
        this.publish({ reference: acquired, chat: 'ready', chatError: null })
        return acquired
      } catch (error) {
        releaseQuietly(acquired)
        if (!this.disposed) {
          this.publish({ chat: 'error', chatError: error instanceof Error ? error.message : 'REQUEST_FAILED' })
        }
        return null
      } finally {
        this.referencePromise = null
        this.referencePromiseId = null
      }
    })()
    this.referencePromise = promise
    this.referencePromiseId = managerSessionId
    return promise
  }

  /** Release the retained manager Session and mark the chat unready. */
  private releaseReference(): void {
    const reference = this.reference
    if (reference === null) return
    this.reference = null
    releaseQuietly(reference)
    this.publish({ reference: null, chat: 'idle', chatError: null })
  }

  /** POST one create/update task request and merge the resulting row. */
  private async writeTask(body: unknown): Promise<boolean> {
    try {
      const payload = await postJson(MANAGER_TASK_PATH, body)
      if (payload['ok'] !== true) throw new Error(failureCode(payload))
      const task = parseTask(payload['task'])
      if (task === null) throw new Error('INVALID_TASK')
      if (this.disposed) return false
      const tasks = this.state.tasks.some(row => row.id === task.id)
        ? this.state.tasks.map(row => (row.id === task.id ? task : row))
        : [...this.state.tasks, task]
      this.publish({
        tasks,
        ...(this.state.error === 'manager.errorTask' ? { error: null, errorDetail: null } : {}),
      })
      return true
    } catch (error) {
      if (!this.disposed) {
        this.publish({
          error: 'manager.errorTask',
          errorDetail: error instanceof Error ? error.message : 'REQUEST_FAILED',
        })
      }
      return false
    }
  }
}
