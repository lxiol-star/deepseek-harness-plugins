/**
 * The manager drawer: workspace/session selection on the left, the embedded
 * official manager chat on the right.
 *
 * The drawer is an additive `shell.overlay` list entry, so it never competes
 * for a layout seat with the official UI and simply does not render if the
 * seat disappears upstream. It is a fixed right-hand surface over the frame
 * (the overlay layer itself ignores pointer events).
 *
 * All data is read from snapshots the plugin already maintains: the board
 * model for workspaces/sessions, the uiSession status map for the manager
 * phase, the workspaces service for titles, and the manager controller for
 * the host mirror (selection, tasks, retained chat reference).
 */
import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import {
  TASK_STATUS_KEYS, managerPhase, managerSessionVisible, managerWorkspaceVisible, type ManagerViewMode,
} from '../../shared/manager.ts'
import type { BoardEntry, BoardGroup } from '../../shared/types.ts'
import type { SessionReference, SessionStatusSnapshot, WorkspaceSnapshot } from '../dsh.ts'
import { useSnapshot, type Translate } from '../hooks.ts'
import type { ReadonlyStore } from '../store.ts'
import type { ManagerController, ManagerSnapshot } from './controller.ts'
import type { BoardFace } from '../index.tsx'

/** Session phases the header dot can show. */
const PHASE_LABEL: Readonly<Record<'idle' | 'running' | 'waiting', string>> = {
  idle: 'manager.phase.idle',
  running: 'manager.phase.running',
  waiting: 'manager.phase.waiting',
}

/** Empty workspaces snapshot used when the service is absent. */
const EMPTY_WORKSPACE_SNAPSHOT: WorkspaceSnapshot = { items: [] }
const EMPTY_WORKSPACES: ReadonlyStore<WorkspaceSnapshot> = {
  getSnapshot: () => EMPTY_WORKSPACE_SNAPSHOT,
  subscribe: () => () => {},
}

/** Empty status snapshot used when the service is absent. */
const EMPTY_STATUS_SNAPSHOT: SessionStatusSnapshot = new Map()
const EMPTY_STATUSES: ReadonlyStore<SessionStatusSnapshot> = {
  getSnapshot: () => EMPTY_STATUS_SNAPSHOT,
  subscribe: () => () => {},
}

/** Sidebar view modes the manager panel mirrors. */
const MANAGER_VIEW_MODES: readonly ManagerViewMode[] = ['active', 'archived', 'workspaces']
/** The manager panel's own persistence key. */
const MANAGER_VIEW_KEY = 'dsh.sessionBoard.managerView'
/** The hide-empty-workspaces mode key, shared so both surfaces stay in sync. */
const SIDEBAR_VIEW_KEY = 'dsh.hideEmptyWorkspaces.mode'
/** Same-page event used to mirror view changes between the sidebar and this panel. */
const SIDEBAR_VIEW_EVENT = 'dsh:sidebar-view-mode'

/** Read one persisted view, defaulting to the active list. */
function readManagerView(): ManagerViewMode {
  try {
    const value = localStorage.getItem(MANAGER_VIEW_KEY) ?? localStorage.getItem(SIDEBAR_VIEW_KEY)
    return value === 'archived' || value === 'workspaces' ? value : 'active'
  } catch {
    return 'active'
  }
}

/** One workspace row of the left pane. */
interface WorkspaceRow {
  readonly id: string
  readonly title: string
  readonly path: string
  readonly entries: BoardEntry[]
}

/** Last path segment, used when a workspace has no explicit title. */
function baseName(path: string): string {
  return path.replaceAll('\\', '/').split('/').filter(Boolean).pop() ?? path
}

/**
 * Group the board's entries into workspace rows.
 *
 * The board model already carries workspace id/title/path per session; the
 * workspaces service only fills in empty workspaces the board has no session
 * for (and is the fallback when the model has no entries yet).
 * @param groups - board groups, in presentation order.
 * @param workspaces - the workspaces list snapshot, when available.
 * @returns rows sorted by title.
 */
function workspaceRows(groups: readonly BoardGroup[], workspaces: WorkspaceSnapshot | null): WorkspaceRow[] {
  const rows = new Map<string, WorkspaceRow>()
  for (const group of groups) {
    for (const entry of group.entries) {
      const id = entry.workspaceId !== undefined && entry.workspaceId !== ''
        ? entry.workspaceId
        : (entry.workspacePath ?? '')
      if (id === '') continue
      let row = rows.get(id)
      if (row === undefined) {
        row = {
          id,
          title: entry.workspaceTitle !== '' ? entry.workspaceTitle : baseName(entry.workspacePath ?? ''),
          path: entry.workspacePath ?? '',
          entries: [],
        }
        rows.set(id, row)
      }
      row.entries.push(entry)
    }
  }
  if (rows.size === 0 && workspaces !== null) {
    for (const item of workspaces.items) {
      rows.set(item.workspaceId, {
        id: item.workspaceId,
        title: item.title ?? baseName(item.path),
        path: item.path,
        entries: [],
      })
    }
  }
  return [...rows.values()].sort((left, right) => left.title.localeCompare(right.title))
}

/** Short wall-clock label for one activity timestamp; empty when unknown. */
function activityText(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return ''
  const date = new Date(at)
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Props of one workspace row. */
interface WorkspaceRowViewProps {
  row: WorkspaceRow
  mode: ManagerViewMode
  focused: boolean
  selected: boolean
  t: Translate
  onToggle: (id: string) => void
  onFocus: (id: string) => void
}

function WorkspaceRowView({ row, mode, focused, selected, t, onToggle, onFocus }: WorkspaceRowViewProps): ReactElement {
  const visible = row.entries.filter(entry => managerSessionVisible(entry, mode))
  const running = visible.filter(entry => entry.state === 'running').length
  return (
    <li className="sb-manager-item" data-focused={focused}>
      <input
        type="checkbox"
        className="sb-manager-check"
        checked={selected}
        onChange={() => onToggle(row.id)}
        aria-label={t('manager.selectWorkspace', { title: row.title })}
      />
      <button
        type="button"
        className="sb-manager-workspace"
        aria-pressed={focused}
        title={row.path}
        onClick={() => onFocus(row.id)}
      >
        <span className="sb-manager-workspace-title">{row.title}</span>
        <span className="sb-manager-meta">{t('manager.workspaceMeta', { count: visible.length, running })}</span>
      </button>
    </li>
  )
}

/** Props of one session row. */
interface SessionRowViewProps {
  entry: BoardEntry
  selected: boolean
  t: Translate
  onToggle: (id: string) => void
}

function SessionRowView({ entry, selected, t, onToggle }: SessionRowViewProps): ReactElement {
  const statusKey = entry.pendingKey ?? entry.noteKey
  const parts: string[] = []
  if (statusKey !== null) parts.push(t(statusKey))
  const activity = activityText(entry.lastActivityAt)
  if (activity !== '') parts.push(activity)
  return (
    <li className="sb-manager-item" data-state={entry.state}>
      <input
        type="checkbox"
        className="sb-manager-check"
        checked={selected}
        onChange={() => onToggle(entry.id)}
        aria-label={t('manager.selectSession', { title: entry.title })}
      />
      <span className="sb-manager-dot" data-state={entry.state} aria-hidden="true" />
      <span className="sb-manager-session-main">
        <span className="sb-manager-session-title" title={entry.title}>{entry.title}</span>
        <span className="sb-manager-meta">{parts.join(' · ')}</span>
      </span>
    </li>
  )
}

/** Props supplied to the drawer's overlay entry. */
export interface ManagerDrawerProps {
  face: BoardFace
  manager: ManagerController
  t: Translate
  /** Session scope seat supplied for a child slot declared with session scope. */
  SessionProvider?: ((props: { session: SessionReference; children: ReactNode }) => ReactNode) | undefined
  /** Child-slot renderer supplied for the declared chat slot. */
  renderSlot?: ((key: string, owner: object) => ReactNode) | undefined
  /** Present for the declared child slot; the drawer itself does not call it. */
  renderFactorySlot?: ((name: string, props: object, options?: object) => ReactNode) | undefined
}

/**
 * The manager drawer.
 * @param props - face, controller, translator and the slot-provided render seats.
 * @returns the drawer, or null while closed.
 */
export function ManagerDrawer({ face, manager, t, SessionProvider, renderSlot }: ManagerDrawerProps): ReactElement | null {
  const snapshot: ManagerSnapshot = useSnapshot(manager, value => value)
  const board = useSnapshot(face.model, value => value)
  const workspaceSnapshot = useSnapshot(face.workspaces?.list ?? EMPTY_WORKSPACES, value => value)
  const statuses = useSnapshot(face.uiSession?.sessionStatus ?? EMPTY_STATUSES, value => value)

  const rows = useMemo(() => workspaceRows(board.groups, workspaceSnapshot), [board.groups, workspaceSnapshot])
  const [viewMode, setViewMode] = useState<ManagerViewMode>(readManagerView)
  /** Mirror view changes from the native sidebar (hide-empty-workspaces) and other panels. */
  useEffect(() => {
    const apply = (value: unknown): void => {
      if (value === 'active' || value === 'archived' || value === 'workspaces') setViewMode(value)
    }
    const onEvent = (event: Event): void => {
      if (event instanceof CustomEvent) apply(event.detail)
    }
    const onStorage = (event: StorageEvent): void => {
      if (event.key === SIDEBAR_VIEW_KEY || event.key === MANAGER_VIEW_KEY) apply(event.newValue)
    }
    window.addEventListener(SIDEBAR_VIEW_EVENT, onEvent)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SIDEBAR_VIEW_EVENT, onEvent)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  /** Switch the manager view, persist it, and mirror the native sidebar's tabs. */
  const changeViewMode = (mode: ManagerViewMode): void => {
    setViewMode(mode)
    try {
      localStorage.setItem(MANAGER_VIEW_KEY, mode)
      localStorage.setItem(SIDEBAR_VIEW_KEY, mode)
    } catch {
      // Storage unavailable: the panel still switches for this page.
    }
    window.dispatchEvent(new CustomEvent(SIDEBAR_VIEW_EVENT, { detail: mode }))
  }
  const selectedWorkspaces = useMemo(() => new Set(snapshot.selection.workspaceIds), [snapshot.selection.workspaceIds])
  const selectedSessions = useMemo(() => new Set(snapshot.selection.sessionIds), [snapshot.selection.sessionIds])
  const visibleRows = useMemo(
    () => rows.filter(row => managerWorkspaceVisible(row.entries, viewMode)),
    [rows, viewMode],
  )
  const focused = useMemo(() => {
    const row = rows.find(candidate => candidate.id === snapshot.focusedWorkspaceId) ?? null
    return row !== null && managerWorkspaceVisible(row.entries, viewMode) ? row : null
  }, [rows, snapshot.focusedWorkspaceId, viewMode])
  const focusedEntries = useMemo(
    () => focused === null ? [] : focused.entries.filter(entry => managerSessionVisible(entry, viewMode)),
    [focused, viewMode],
  )
  const selectedCount = snapshot.selection.workspaceIds.length + snapshot.selection.sessionIds.length
  const managerStatus = snapshot.managerSessionId === null
    ? undefined
    : statuses.get(snapshot.managerSessionId)
  const phase = managerPhase(managerStatus?.running, managerStatus?.pendingInteraction !== undefined)

  const toggleWorkspace = useCallback((id: string) => { manager.toggleWorkspaceId(id) }, [manager])
  const focusWorkspace = useCallback((id: string) => { manager.setFocused(id) }, [manager])
  const toggleSession = useCallback((id: string) => { manager.toggleSessionId(id) }, [manager])
  const clearSelection = useCallback(() => { manager.clearSelection() }, [manager])
  const sendSelection = useCallback(() => { void manager.sendSelection() }, [manager])
  const refresh = useCallback(() => { manager.retry() }, [manager])
  const close = useCallback(() => { manager.close() }, [manager])
  const openInMain = useCallback(() => {
    if (snapshot.managerSessionId !== null) face.openSession(snapshot.managerSessionId)
  }, [face, snapshot.managerSessionId])
  const openTask = useCallback((sessionId: string) => { face.openSession(sessionId) }, [face])
  const toggleWake = useCallback(() => { void manager.setWake(!snapshot.wake.enabled) }, [manager, snapshot.wake.enabled])
  const wakeNow = useCallback(() => { void manager.wakeNow() }, [manager])

  if (!snapshot.open) return null

  const chatReady = snapshot.reference !== null
    && typeof SessionProvider === 'function'
    && typeof renderSlot === 'function'
  const chatFailed = snapshot.phase === 'error'
    || snapshot.chat === 'error'
    || (snapshot.phase === 'ready' && snapshot.managerSessionId === null)

  return (
    <div className="sb-root sb-manager" role="complementary" aria-label={t('manager.ariaDrawer')} data-open="true">
      <header className="sb-manager-head">
        <span
          className="sb-manager-phase"
          data-phase={phase}
          role="img"
          aria-label={t(PHASE_LABEL[phase])}
          title={t(PHASE_LABEL[phase])}
        />
        <span className="sb-manager-title">{t('manager.title')}</span>
        <button
          type="button"
          className="sb-manager-btn"
          aria-label={t('manager.refresh')}
          title={t('manager.refresh')}
          onClick={refresh}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M10 6a4 4 0 1 1-1.2-2.85M10 1.6v2.6H7.4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="sb-manager-btn"
          disabled={snapshot.managerSessionId === null}
          onClick={openInMain}
        >
          {t('manager.openInMain')}
        </button>
        <button
          type="button"
          className="sb-manager-btn sb-manager-btn--icon"
          aria-label={t('manager.close')}
          title={t('manager.close')}
          onClick={close}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 2.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      <div className="sb-manager-body">
        <aside className="sb-manager-left">
          <div className="sb-manager-views" role="tablist" aria-label={t('manager.viewLabel')}>
            {MANAGER_VIEW_MODES.map(mode => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={mode === viewMode}
                className="sb-manager-view"
                data-active={mode === viewMode}
                onClick={() => changeViewMode(mode)}
              >
                {t(`manager.view.${mode}`)}
              </button>
            ))}
          </div>
          <section className="sb-manager-section sb-manager-workspaces">
            <h2 className="sb-manager-section-title">{t('manager.workspaces')}</h2>
            {rows.length === 0
              ? <p className="sb-manager-empty">{t('manager.workspaceEmpty')}</p>
              : visibleRows.length === 0
                ? <p className="sb-manager-empty">{t('manager.workspaceViewEmpty')}</p>
                : (
                  <ul className="sb-manager-list">
                    {visibleRows.map(row => (
                      <WorkspaceRowView
                        key={row.id}
                        row={row}
                        mode={viewMode}
                        focused={row.id === snapshot.focusedWorkspaceId}
                        selected={selectedWorkspaces.has(row.id)}
                        t={t}
                        onToggle={toggleWorkspace}
                        onFocus={focusWorkspace}
                      />
                    ))}
                  </ul>
                )}
          </section>
          <section className="sb-manager-section sb-manager-sessions">
            <div className="sb-manager-section-head">
              <h2 className="sb-manager-section-title">{t('manager.sessions')}</h2>
            </div>
            {focused === null
              ? <p className="sb-manager-empty">{t('manager.focusHint')}</p>
              : focusedEntries.length === 0
                ? <p className="sb-manager-empty">{t(focused.entries.length === 0 ? 'manager.sessionEmpty' : 'manager.sessionViewEmpty')}</p>
                : (
                  <ul className="sb-manager-list">
                    {focusedEntries.map(entry => (
                      <SessionRowView
                        key={entry.id}
                        entry={entry}
                        selected={selectedSessions.has(entry.id)}
                        t={t}
                        onToggle={toggleSession}
                      />
                    ))}
                  </ul>
                )}
          </section>
          <section className="sb-manager-section sb-manager-tasks">
            <h2 className="sb-manager-section-title">{t('manager.tasks')}</h2>
            {snapshot.tasks.length === 0
              ? <p className="sb-manager-empty">{t('manager.taskEmpty')}</p>
              : (
                <ul className="sb-manager-list">
                  {snapshot.tasks.map(task => (
                    <li key={task.id} className="sb-manager-item">
                      <button
                        type="button"
                        className="sb-manager-task"
                        disabled={task.sessionId === undefined}
                        title={task.sessionId === undefined ? undefined : t('manager.openTask', { title: task.title })}
                        onClick={() => { if (task.sessionId !== undefined) openTask(task.sessionId) }}
                      >
                        <span className="sb-manager-chip" data-status={task.status}>
                          {t(TASK_STATUS_KEYS[task.status])}
                        </span>
                        <span className="sb-manager-task-main">
                          <span className="sb-manager-task-title">{task.title}</span>
                          {task.note === undefined
                            ? null
                            : <span className="sb-manager-meta">{task.note}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>
          <section className="sb-manager-section sb-manager-wake">
            <h2 className="sb-manager-section-title">{t('manager.wake')}</h2>
            <div className="sb-manager-wake-actions">
              <button type="button" className="sb-manager-btn" onClick={toggleWake}>
                {t(snapshot.wake.enabled ? 'manager.wakeDisable' : 'manager.wakeEnable')}
              </button>
              <button
                type="button"
                className="sb-manager-btn"
                disabled={!snapshot.wake.enabled || snapshot.wake.pending === 0}
                onClick={wakeNow}
              >
                {t('manager.wakeNow')}
              </button>
            </div>
            <p className="sb-manager-meta">{t('manager.wakeStatus', {
              pending: snapshot.wake.pending,
              urgent: snapshot.wake.urgent,
              attention: snapshot.wake.attention,
              completed: snapshot.wake.completed,
              wakes: snapshot.wake.wakesThisHour,
            })}</p>
            {snapshot.wake.error !== undefined ? <p className="sb-manager-error">{t('manager.wakeDeliveryFailed')}</p> : null}
            <p className="sb-manager-hint">{t('manager.wakeHint')}</p>
          </section>
          <footer className="sb-manager-selection">
            <div className="sb-manager-selection-row">
              <span className="sb-manager-count">{t('manager.selectionCount', { count: selectedCount })}</span>
              <button
                type="button"
                className="sb-manager-btn"
                disabled={selectedCount === 0}
                onClick={clearSelection}
              >
                {t('manager.selectionClear')}
              </button>
              <button
                type="button"
                className="sb-manager-btn sb-manager-btn--primary"
                disabled={selectedCount === 0 || snapshot.sending || snapshot.managerSessionId === null}
                onClick={sendSelection}
              >
                {snapshot.sending ? t('manager.sending') : t('manager.selectionSend')}
              </button>
            </div>
            {snapshot.sent ? <p className="sb-manager-ok">{t('manager.selectionSent')}</p> : null}
            {snapshot.error !== null
              ? (
                <p className="sb-manager-error" title={snapshot.errorDetail ?? snapshot.stateError ?? undefined}>
                  {t(snapshot.error)}
                </p>
              )
              : null}
            <p className="sb-manager-hint">{t('manager.selectionHint')}</p>
          </footer>
        </aside>
        <section className="sb-manager-chat">
          {chatReady && snapshot.reference !== null && SessionProvider !== undefined && renderSlot !== undefined
            ? (
              <div className="sb-manager-chat-body">
                <SessionProvider session={snapshot.reference}>
                  {renderSlot('session-board.manager.chat', {})}
                </SessionProvider>
              </div>
            )
            : chatFailed
              ? (
                <div className="sb-manager-notice" role="alert">
                  <p title={snapshot.stateError ?? undefined}>
                    {snapshot.phase === 'error' ? t('manager.errorState') : t('manager.chatUnavailable')}
                  </p>
                  <button type="button" className="sb-manager-btn" onClick={refresh}>{t('manager.chatRetry')}</button>
                </div>
              )
              : <div className="sb-manager-notice" role="status">{t('manager.loading')}</div>}
        </section>
      </div>
    </div>
  )
}

/** Props of the drawer toggle, shared by the conversation header and sidebar foot. */
export interface ManagerToggleProps {
  manager: ManagerController
  t: Translate
  /**
   * Sidebar column width flag supplied by the `sidebar.footer.action` seat.
   * Absent in the conversation-header seat, which always renders the compact
   * icon button.
   */
  wide?: boolean | undefined
}

/**
 * The button that opens and closes the manager drawer.
 * @param props - controller, translator and the optional sidebar width flag.
 * @returns the toggle button with its pressed state.
 */
export function ManagerToggle({ manager, t, wide }: ManagerToggleProps): ReactElement {
  const open = useSnapshot(manager, value => value.open)
  const label = open ? t('manager.close') : t('manager.open')
  // The sidebar foot gives the entry a full row when the column is wide; the
  // conversation header keeps the bare icon button.
  const inSidebar = wide !== undefined
  return (
    <button
      type="button"
      className={inSidebar ? 'sb-manager-entry' : 'sb-btn'}
      data-rail={inSidebar && wide !== true ? 'true' : undefined}
      aria-label={label}
      title={label}
      aria-pressed={open}
      data-session-board-manager-toggle=""
      onClick={() => manager.toggle()}
    >
      <svg width={inSidebar ? 16 : 14} height={inSidebar ? 16 : 14} viewBox="0 0 14 14" aria-hidden="true">
        <path d="M4.2 2.4h5.6v9.2H4.2zM6.6 4.2h1.2M6.6 6.6h1.2M6.6 9h1.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
      {inSidebar && wide === true
        ? <span className="sb-manager-entry-label">{t('manager.entry')}</span>
        : null}
    </button>
  )
}
