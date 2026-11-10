/**
 * The manager drawer: workspace/session navigation on the left, the embedded
 * official manager chat on the right.
 *
 * The drawer is an additive `shell.overlay` list entry, so it never competes
 * for a layout seat with the official UI and simply does not render if the
 * seat disappears upstream. It floats over the frame (the overlay layer itself
 * ignores pointer events) and owns its own geometry:
 *
 *  - the outer edge drags to resize, and the panel can fill the viewport;
 *  - the navigator collapses so the chat gets the whole drawer, and the
 *    navigator divider drags independently;
 *  - "expand chat" is one click that does both, and everything persists.
 *
 * All data is read from snapshots the plugin already maintains: the board
 * model for workspaces/sessions, the uiSession status map for the manager
 * phase, the workspaces service for titles, and the manager controller for
 * the host mirror (selection, tasks, retained chat reference).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  TASK_STATUS_KEYS, managerPhase, managerSessionVisible, managerWorkspaceVisible, type ManagerViewMode,
} from '../../shared/manager.ts'
import type { BoardEntry, BoardGroup, BoardState } from '../../shared/types.ts'
import type { SessionReference, SessionStatusSnapshot, WorkspaceSnapshot } from '../dsh.ts'
import { useSnapshot, type Translate } from '../hooks.ts'
import type { ReadonlyStore } from '../store.ts'
import type { ManagerController, ManagerSnapshot } from './controller.ts'
import {
  MANAGER_MAX_NAV_WIDTH,
  MANAGER_MAX_WIDTH,
  MANAGER_MIN_WIDTH,
  MANAGER_MIN_CHAT_WIDTH,
  MANAGER_MIN_NAV_WIDTH,
  clampDrawerWidth,
  clampNavWidth,
  defaultDrawerWidth,
  dragDrawerWidth,
  dragNavWidth,
  nudgeDrawerWidth,
  nudgeNavWidth,
  readManagerLayout,
  resolveDrawerWidth,
  resolveNavWidth,
  writeManagerLayout,
  type ManagerLayout,
} from './layout.ts'
import {
  IconBell,
  IconChevronRight,
  IconClose,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconFolder,
  IconInfo,
  IconLayers,
  IconLayoutGrid,
  IconMaximize,
  IconPanelLeftClose,
  IconPanelLeftOpen,
  IconRefresh,
  IconRestore,
  IconSearch,
  IconSend,
  IconSparkle,
  IconTasks,
} from './icons.tsx'
import { shortenPath } from './paths.ts'
import type { BoardFace } from '../index.tsx'

/** Session phases the header chip and dot can show. */
const PHASE_LABEL: Readonly<Record<'idle' | 'running' | 'waiting', string>> = {
  idle: 'manager.phase.idle',
  running: 'manager.phase.running',
  waiting: 'manager.phase.waiting',
}

/** Empty status snapshot used when the service is absent. */
const EMPTY_STATUS_SNAPSHOT: SessionStatusSnapshot = new Map()
const EMPTY_STATUSES: ReadonlyStore<SessionStatusSnapshot> = {
  getSnapshot: () => EMPTY_STATUS_SNAPSHOT,
  subscribe: () => () => {},
}

/** Value behind the empty workspace store. */
const EMPTY_WORKSPACES_VALUE: WorkspaceSnapshot = { items: [] }
/** Store holding the empty workspace list when the service is absent. */
const EMPTY_WORKSPACES: ReadonlyStore<WorkspaceSnapshot> = {
  getSnapshot: () => EMPTY_WORKSPACES_VALUE,
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
/** Workspace count above which the navigator always offers its filter box. */
const WORKSPACE_FILTER_THRESHOLD = 7

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
 * workspaces service only fills in workspaces that currently hold no sessions
 * so the manager can target an empty workspace too.
 */
function workspaceRows(groups: readonly BoardGroup[], workspaces: WorkspaceSnapshot | null): WorkspaceRow[] {
  const rows = new Map<string, WorkspaceRow>()
  for (const entry of groups.flatMap(group => group.entries)) {
    const id = entry.workspaceId ?? entry.workspacePath ?? entry.workspaceTitle
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
  if (workspaces !== null) {
    for (const item of workspaces.items) {
      if (rows.has(item.workspaceId)) continue
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

/** The most urgent state among a workspace's visible sessions. */
function aggregateState(entries: readonly BoardEntry[]): BoardState {
  for (const state of ['blocked', 'error', 'unread', 'running'] as const) {
    if (entries.some(entry => entry.state === state)) return state
  }
  return 'done'
}

/** Props of one workspace row. */
interface WorkspaceRowViewProps {
  row: WorkspaceRow
  mode: ManagerViewMode
  focused: boolean
  selected: boolean
  showPaths: boolean
  t: Translate
  onToggle: (id: string) => void
  onFocus: (id: string) => void
}

function WorkspaceRowView({ row, mode, focused, selected, showPaths, t, onToggle, onFocus }: WorkspaceRowViewProps): ReactElement {
  const visible = row.entries.filter(entry => managerSessionVisible(entry, mode))
  const running = visible.filter(entry => entry.state === 'running').length
  const title = row.title !== '' ? row.title : baseName(row.path)
  return (
    <li className="sb-manager-item" data-focused={focused || undefined} data-selected={selected || undefined}>
      <input
        type="checkbox"
        className="sb-manager-check"
        checked={selected}
        onChange={() => onToggle(row.id)}
        aria-label={t('manager.selectWorkspace', { title })}
      />
      <button
        type="button"
        className="sb-manager-workspace"
        aria-pressed={focused}
        title={row.path !== '' ? row.path : undefined}
        onClick={() => onFocus(row.id)}
      >
        <span className="sb-manager-dot" data-state={aggregateState(visible)} aria-hidden="true" />
        <span className="sb-manager-workspace-main">
          <span className="sb-manager-workspace-title">{title}</span>
          {showPaths && row.path !== ''
            ? <span className="sb-manager-path" title={row.path}>{shortenPath(row.path)}</span>
            : null}
          <span className="sb-manager-meta">{t('manager.workspaceMeta', { count: visible.length, running })}</span>
        </span>
        <IconChevronRight className="sb-manager-chevron" size={14} />
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
  onOpen: (id: string) => void
}

function SessionRowView({ entry, selected, t, onToggle, onOpen }: SessionRowViewProps): ReactElement {
  const statusKey = entry.pendingKey ?? entry.noteKey
  const parts: string[] = []
  if (statusKey !== null) parts.push(t(statusKey))
  const activity = activityText(entry.lastActivityAt)
  if (activity !== '') parts.push(activity)
  return (
    <li className="sb-manager-item" data-state={entry.state} data-selected={selected || undefined}>
      <input
        type="checkbox"
        className="sb-manager-check"
        checked={selected}
        onChange={() => onToggle(entry.id)}
        aria-label={t('manager.selectSession', { title: entry.title })}
      />
      <button
        type="button"
        className="sb-manager-session"
        title={t('manager.openSession', { title: entry.title })}
        onClick={() => onOpen(entry.id)}
      >
        <span className="sb-manager-dot" data-state={entry.state} aria-hidden="true" />
        <span className="sb-manager-session-main">
          <span className="sb-manager-session-title">{entry.title}</span>
          <span className="sb-manager-meta">{parts.join(' · ')}</span>
        </span>
      </button>
    </li>
  )
}

/** Props of the shared section header. */
interface SectionHeadProps {
  icon: ReactNode
  title: string
  count?: number
  subtitle?: string
  children?: ReactNode
}

function SectionHead({ icon, title, count, subtitle, children }: SectionHeadProps): ReactElement {
  return (
    <header className="sb-manager-section-head">
      <span className="sb-manager-section-icon" aria-hidden="true">{icon}</span>
      <h2 className="sb-manager-section-title">{title}</h2>
      {count === undefined ? null : <span className="sb-manager-badge">{count}</span>}
      {subtitle === undefined ? null : <span className="sb-manager-section-subtitle" title={subtitle}>{subtitle}</span>}
      {children === undefined ? null : <div className="sb-manager-section-actions">{children}</div>}
    </header>
  )
}

/** One icon-only action button with a required accessible name. */
interface IconActionProps {
  label: string
  onClick: () => void
  children: ReactNode
  pressed?: boolean | undefined
  disabled?: boolean | undefined
  tone?: 'plain' | 'accent' | undefined
}

function IconAction({ label, onClick, children, pressed, disabled, tone = 'plain' }: IconActionProps): ReactElement {
  return (
    <button
      type="button"
      className="sb-manager-iconbtn"
      data-tone={tone}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Drag state shared by the outer edge and the navigator divider. */
interface ResizeDrag {
  kind: 'drawer' | 'nav'
  startX: number
  startWidth: number
  pointerId: number
}

/**
 * Persisted manager drawer geometry plus the viewport width it is resolved
 * against. Storage failure only costs persistence, never the panel.
 */
function useManagerLayout(): {
  layout: ManagerLayout
  update: (patch: Partial<ManagerLayout>) => void
  viewportWidth: number
  drawerWidth: number
  navWidth: number
} {
  const [layout, setLayout] = useState<ManagerLayout>(readManagerLayout)
  const [viewportWidth, setViewportWidth] = useState<number>(() => (
    typeof window === 'undefined' ? 1440 : window.innerWidth
  ))
  const persisted = useRef(false)
  useEffect(() => {
    // The first render only loads state; writing it back is redundant. The
    // delay coalesces pointer drag frames into one storage write.
    if (!persisted.current) {
      persisted.current = true
      return
    }
    const timer = setTimeout(() => writeManagerLayout(layout), 160)
    return () => clearTimeout(timer)
  }, [layout])
  useEffect(() => {
    const onResize = (): void => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const update = useCallback((patch: Partial<ManagerLayout>) => {
    setLayout(current => ({ ...current, ...patch }))
  }, [])
  const drawerWidth = resolveDrawerWidth(layout, viewportWidth)
  const navWidth = resolveNavWidth(layout, drawerWidth)
  return { layout, update, viewportWidth, drawerWidth, navWidth }
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
export function ManagerDrawer({
  face,
  manager,
  t,
  SessionProvider,
  renderSlot,
}: ManagerDrawerProps): ReactElement | null {
  const snapshot: ManagerSnapshot = useSnapshot(manager, value => value)
  const board = useSnapshot(face.model, value => value)
  const workspaceSnapshot = useSnapshot(face.workspaces?.list ?? EMPTY_WORKSPACES, value => value)
  const statuses = useSnapshot(face.uiSession?.sessionStatus ?? EMPTY_STATUSES, value => value)
  const { layout, update, viewportWidth, drawerWidth, navWidth } = useManagerLayout()
  const [viewMode, setViewMode] = useState<ManagerViewMode>(readManagerView)
  const [workspaceFilter, setWorkspaceFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const drag = useRef<ResizeDrag | null>(null)
  const dragFrame = useRef<number | null>(null)
  const dragPending = useRef<Partial<ManagerLayout> | null>(null)
  const [resizing, setResizing] = useState<ResizeDrag['kind'] | null>(null)
  const drawerWidthRef = useRef(drawerWidth)
  const navWidthRef = useRef(navWidth)
  const viewportWidthRef = useRef(viewportWidth)
  drawerWidthRef.current = drawerWidth
  navWidthRef.current = navWidth
  viewportWidthRef.current = viewportWidth

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

  const rows = useMemo(() => workspaceRows(board.groups, workspaceSnapshot), [board.groups, workspaceSnapshot])
  const selectedWorkspaces = useMemo(() => new Set(snapshot.selection.workspaceIds), [snapshot.selection.workspaceIds])
  const selectedSessions = useMemo(() => new Set(snapshot.selection.sessionIds), [snapshot.selection.sessionIds])
  const visibleRows = useMemo(
    () => rows.filter(row => managerWorkspaceVisible(row.entries, viewMode)),
    [rows, viewMode],
  )
  const filteredRows = useMemo(() => {
    const query = workspaceFilter.trim().toLocaleLowerCase()
    if (query === '') return visibleRows
    return visibleRows.filter(row => (
      row.title.toLocaleLowerCase().includes(query)
      || row.path.toLocaleLowerCase().includes(query)
    ))
  }, [visibleRows, workspaceFilter])
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
  const navCollapsed = layout.navCollapsed
  const focusedChat = navCollapsed && layout.maximized

  const toggleWorkspace = useCallback((id: string) => { manager.toggleWorkspaceId(id) }, [manager])
  const focusWorkspace = useCallback((id: string) => { manager.setFocused(id) }, [manager])
  const toggleSession = useCallback((id: string) => { manager.toggleSessionId(id) }, [manager])
  const clearSelection = useCallback(() => { manager.clearSelection() }, [manager])
  const sendSelection = useCallback(() => { void manager.sendSelection() }, [manager])
  const refresh = useCallback(() => { manager.retry() }, [manager])
  const openBoard = useCallback(() => {
    face.view.set(current => ({ ...current, board: { open: true } }))
  }, [face])
  const close = useCallback(() => { manager.close() }, [manager])
  const openInMain = useCallback(() => {
    if (snapshot.managerSessionId !== null) face.openSession(snapshot.managerSessionId)
  }, [face, snapshot.managerSessionId])
  const openTask = useCallback((sessionId: string) => { face.openSession(sessionId) }, [face])
  const openSession = useCallback((sessionId: string) => { face.openSession(sessionId) }, [face])
  const toggleWake = useCallback(() => { void manager.setWake(!snapshot.wake.enabled) }, [manager, snapshot.wake.enabled])
  const wakeNow = useCallback(() => { void manager.wakeNow() }, [manager])
  const toggleNav = useCallback(() => { update({ navCollapsed: !navCollapsed }) }, [update, navCollapsed])
  const toggleMaximized = useCallback(() => { update({ maximized: !layout.maximized }) }, [update, layout.maximized])
  const toggleFocusChat = useCallback(() => {
    if (focusedChat) update({ navCollapsed: false, maximized: false })
    else update({ navCollapsed: true, maximized: true })
  }, [focusedChat, update])
  const togglePaths = useCallback(() => { update({ showPaths: !layout.showPaths }) }, [update, layout.showPaths])

  /** Return focus to the manager entry when the panel closes. */
  useEffect(() => {
    if (!snapshot.open) return
    return () => {
      const entry = document.querySelector<HTMLElement>('[data-session-board-manager-toggle]')
      if (entry !== null && entry.isConnected) entry.focus({ preventScroll: true })
    }
  }, [snapshot.open])

  /** Escape closes the panel unless the chat or a text field owns the key. */
  useEffect(() => {
    if (!snapshot.open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], .sb-manager-chat')) return
      manager.close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [manager, snapshot.open])

  const startResize = useCallback((kind: ResizeDrag['kind']) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    drag.current = {
      kind,
      startX: event.clientX,
      startWidth: kind === 'drawer' ? drawerWidthRef.current : navWidthRef.current,
      pointerId: event.pointerId,
    }
    setResizing(kind)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch (error) {
      // Capture is an optimization: the element still receives pointer events.
      void error
    }
  }, [])

  const moveResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const current = drag.current
    if (current === null || current.pointerId !== event.pointerId) return
    // One state update per animation frame: the drawer re-renders the official
    // chat subtree, so pointer-rate updates would burn frames for no visual gain.
    dragPending.current = current.kind === 'drawer'
      ? { width: dragDrawerWidth(current.startWidth, current.startX, event.clientX, viewportWidthRef.current) }
      : { navWidth: dragNavWidth(current.startWidth, current.startX, event.clientX, drawerWidthRef.current) }
    if (dragFrame.current !== null) return
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = null
      const pending = dragPending.current
      dragPending.current = null
      if (pending !== null) update(pending)
    })
  }, [update])

  useEffect(() => () => {
    if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current)
  }, [])

  const endResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current === null) return
    drag.current = null
    setResizing(null)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch (error) {
      // The pointer may already be released; nothing to clean up then.
      void error
    }
  }, [])

  const resizeDrawerByKeyboard = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      update({ width: nudgeDrawerWidth(drawerWidthRef.current, 1, viewportWidthRef.current) })
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      update({ width: nudgeDrawerWidth(drawerWidthRef.current, -1, viewportWidthRef.current) })
    } else if (event.key === 'Home') {
      event.preventDefault()
      update({ width: defaultDrawerWidth(viewportWidthRef.current) })
    } else if (event.key === 'End') {
      event.preventDefault()
      update({ width: clampDrawerWidth(MANAGER_MAX_WIDTH, viewportWidthRef.current) })
    }
  }, [update])

  const resizeNavByKeyboard = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      update({ navWidth: nudgeNavWidth(navWidthRef.current, 1, drawerWidthRef.current) })
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      update({ navWidth: nudgeNavWidth(navWidthRef.current, -1, drawerWidthRef.current) })
    } else if (event.key === 'Home') {
      event.preventDefault()
      update({ navWidth: null })
    } else if (event.key === 'End') {
      event.preventDefault()
      update({ navWidth: clampNavWidth(MANAGER_MAX_NAV_WIDTH, drawerWidthRef.current) })
    }
  }, [update])

  const chatReady = snapshot.reference !== null
    && typeof SessionProvider === 'function'
    && typeof renderSlot === 'function'
  const chatFailed = snapshot.phase === 'error'
    || snapshot.chat === 'error'
    || (snapshot.phase === 'ready' && snapshot.managerSessionId === null)
  /** The official chat element, kept stable across layout-only re-renders. */
  const chatBody = useMemo(() => {
    if (!chatReady || snapshot.reference === null || SessionProvider === undefined || renderSlot === undefined) return null
    return (
      <SessionProvider session={snapshot.reference}>
        {renderSlot('session-board.manager.chat', {})}
      </SessionProvider>
    )
  }, [chatReady, snapshot.reference, SessionProvider, renderSlot])

  if (!snapshot.open) return null

  const showWorkspaceFilter = filterOpen || visibleRows.length >= WORKSPACE_FILTER_THRESHOLD || workspaceFilter !== ''
  const focusTitle = focused === null ? undefined : (focused.title !== '' ? focused.title : baseName(focused.path))

  return (
    <section
      className="sb-root sb-manager"
      role="complementary"
      aria-label={t('manager.ariaDrawer')}
      data-open="true"
      data-maximized={layout.maximized ? 'true' : undefined}
      data-nav-collapsed={navCollapsed ? 'true' : undefined}
      data-resizing={resizing ?? undefined}
      style={layout.maximized ? undefined : { width: `${drawerWidth}px` }}
    >
      {layout.maximized
        ? null
        : (
          <div
            className="sb-manager-resize"
            role="separator"
            aria-orientation="vertical"
            aria-label={t('manager.resizeHorizontal')}
            aria-valuemin={MANAGER_MIN_WIDTH}
            aria-valuemax={Math.min(MANAGER_MAX_WIDTH, Math.max(MANAGER_MIN_WIDTH, viewportWidth - 12))}
            aria-valuenow={drawerWidth}
            tabIndex={0}
            title={t('manager.resizeTip')}
            onPointerDown={startResize('drawer')}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onLostPointerCapture={endResize}
            onKeyDown={resizeDrawerByKeyboard}
            onDoubleClick={() => update({ width: null })}
          />
        )}
      <header className="sb-manager-head">
        <span
          className="sb-manager-phase"
          data-phase={phase}
          role="img"
          aria-label={t(PHASE_LABEL[phase])}
          title={t(PHASE_LABEL[phase])}
        />
        <span className="sb-manager-title">{t('manager.title')}</span>
        <span className="sb-manager-status" data-phase={phase}>{t(`manager.status.${phase}`)}</span>
        <div className="sb-manager-head-actions">
          <IconAction
            label={navCollapsed ? t('manager.navExpand') : t('manager.navCollapse')}
            pressed={!navCollapsed}
            onClick={toggleNav}
          >
            {navCollapsed ? <IconPanelLeftOpen size={16} /> : <IconPanelLeftClose size={16} />}
            <span className="sb-manager-btn-label">{navCollapsed ? t('manager.navExpand') : t('manager.navCollapse')}</span>
          </IconAction>
          <IconAction
            label={layout.maximized ? t('manager.restore') : t('manager.maximize')}
            pressed={layout.maximized}
            onClick={toggleMaximized}
          >
            {layout.maximized ? <IconRestore size={16} /> : <IconMaximize size={16} />}
          </IconAction>
          <IconAction label={t('action.openBoard')} onClick={openBoard}>
            <IconLayoutGrid size={16} />
          </IconAction>
          <IconAction label={t('manager.refresh')} onClick={refresh}>
            <IconRefresh size={16} />
          </IconAction>
          <IconAction label={t('manager.openInMain')} onClick={openInMain} disabled={snapshot.managerSessionId === null}>
            <IconExternal size={16} />
          </IconAction>
          <IconAction label={t('manager.close')} onClick={close}>
            <IconClose size={16} />
          </IconAction>
        </div>
      </header>
      <div className="sb-manager-body">
        {navCollapsed
          ? null
          : (
            <aside className="sb-manager-nav" style={{ width: `${navWidth}px` }}>
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
              <div className="sb-manager-scroll">
                <section className="sb-manager-section sb-manager-workspaces">
                  <SectionHead
                    icon={<IconFolder size={14} />}
                    title={t('manager.workspaces')}
                    count={filteredRows.length}
                  >
                    <IconAction
                      label={layout.showPaths ? t('manager.hidePaths') : t('manager.showPaths')}
                      pressed={layout.showPaths}
                      onClick={togglePaths}
                    >
                      {layout.showPaths ? <IconEye size={15} /> : <IconEyeOff size={15} />}
                    </IconAction>
                    <IconAction
                      label={t('manager.filterWorkspaces')}
                      pressed={showWorkspaceFilter}
                      onClick={() => setFilterOpen(open => !open)}
                    >
                      <IconSearch size={15} />
                    </IconAction>
                  </SectionHead>
                  {showWorkspaceFilter
                    ? (
                      <div className="sb-manager-filter">
                        <IconSearch size={13} className="sb-manager-filter-icon" />
                        <input
                          type="search"
                          value={workspaceFilter}
                          placeholder={t('manager.filterWorkspaces')}
                          aria-label={t('manager.filterWorkspaces')}
                          autoFocus={filterOpen}
                          onChange={event => setWorkspaceFilter(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape' && workspaceFilter !== '') {
                              event.stopPropagation()
                              setWorkspaceFilter('')
                            }
                          }}
                        />
                        {workspaceFilter !== ''
                          ? (
                            <button
                              type="button"
                              className="sb-manager-filter-clear"
                              aria-label={t('manager.clearFilter')}
                              title={t('manager.clearFilter')}
                              onClick={() => setWorkspaceFilter('')}
                            >
                              <IconClose size={12} />
                            </button>
                          )
                          : null}
                      </div>
                    )
                    : null}
                  {rows.length === 0
                    ? <p className="sb-manager-empty"><IconSparkle size={14} />{t('manager.workspaceEmpty')}</p>
                    : visibleRows.length === 0
                      ? <p className="sb-manager-empty">{t('manager.workspaceViewEmpty')}</p>
                      : filteredRows.length === 0
                        ? <p className="sb-manager-empty">{t('manager.filterEmpty')}</p>
                        : (
                          <ul className="sb-manager-list">
                            {filteredRows.map(row => (
                              <WorkspaceRowView
                                key={row.id}
                                row={row}
                                mode={viewMode}
                                focused={row.id === snapshot.focusedWorkspaceId}
                                selected={selectedWorkspaces.has(row.id)}
                                showPaths={layout.showPaths}
                                t={t}
                                onToggle={toggleWorkspace}
                                onFocus={focusWorkspace}
                              />
                            ))}
                          </ul>
                        )}
                </section>
                <section className="sb-manager-section sb-manager-sessions">
                  <SectionHead
                    icon={<IconLayers size={14} />}
                    title={t('manager.sessions')}
                    count={focusedEntries.length}
                    {...(focusTitle === undefined ? {} : { subtitle: focusTitle })}
                  />
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
                              onOpen={openSession}
                            />
                          ))}
                        </ul>
                      )}
                </section>
                <section className="sb-manager-section sb-manager-tasks">
                  <SectionHead icon={<IconTasks size={14} />} title={t('manager.tasks')} count={snapshot.tasks.length} />
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
                <section className="sb-manager-section sb-manager-wake" data-on={snapshot.wake.enabled || undefined}>
                  <SectionHead
                    icon={<IconBell size={14} />}
                    title={t('manager.wake')}
                  >
                    <button
                      type="button"
                      role="switch"
                      className="sb-manager-switch"
                      aria-checked={snapshot.wake.enabled}
                      aria-label={t(snapshot.wake.enabled ? 'manager.wakeDisable' : 'manager.wakeEnable')}
                      title={t(snapshot.wake.enabled ? 'manager.wakeDisable' : 'manager.wakeEnable')}
                      onClick={toggleWake}
                    >
                      <span className="sb-manager-switch-track" aria-hidden="true"><span /></span>
                    </button>
                  </SectionHead>
                  <p className="sb-manager-wake-status">
                    {t('manager.wakeStatus', {
                      pending: snapshot.wake.pending,
                      urgent: snapshot.wake.urgent,
                      attention: snapshot.wake.attention,
                      completed: snapshot.wake.completed,
                      wakes: snapshot.wake.wakesThisHour,
                    })}
                  </p>
                  <div className="sb-manager-wake-foot">
                    <button
                      type="button"
                      className="sb-manager-textbtn"
                      disabled={!snapshot.wake.enabled || snapshot.wake.pending === 0}
                      onClick={wakeNow}
                    >
                      {t('manager.wakeNow')}
                    </button>
                    <span className="sb-manager-hint" title={t('manager.wakeHint')} aria-label={t('manager.wakeHint')}>
                      <IconInfo size={13} />
                    </span>
                  </div>
                  {snapshot.wake.error !== undefined
                    ? <p className="sb-manager-error">{t('manager.wakeDeliveryFailed')}</p>
                    : null}
                </section>
              </div>
              <footer className="sb-manager-selection" data-empty={selectedCount === 0 || undefined}>
                <div className="sb-manager-selection-row">
                  <span className="sb-manager-count">
                    {selectedCount === 0
                      ? t('manager.selectionEmpty')
                      : t('manager.selectionCount', { count: selectedCount })}
                  </span>
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
                    <IconSend size={14} />
                    {snapshot.sending ? t('manager.sending') : t('manager.selectionSend')}
                  </button>
                </div>
                <div className="sb-manager-selection-meta">
                  {snapshot.sent
                    ? <span className="sb-manager-ok">{t('manager.selectionSent')}</span>
                    : <span className="sb-manager-hint-line">{t('manager.selectionHintShort')}</span>}
                  {snapshot.error !== null
                    ? (
                      <span className="sb-manager-error" title={snapshot.errorDetail ?? snapshot.stateError ?? undefined}>
                        {t(snapshot.error)}
                      </span>
                    )
                    : null}
                </div>
              </footer>
            </aside>
          )}
        {navCollapsed
          ? null
          : (
            <div
              className="sb-manager-nav-resize"
              role="separator"
              aria-orientation="vertical"
              aria-label={t('manager.resizeNavigator')}
              aria-valuemin={MANAGER_MIN_NAV_WIDTH}
              aria-valuemax={Math.max(MANAGER_MIN_NAV_WIDTH, drawerWidth - MANAGER_MIN_CHAT_WIDTH)}
              aria-valuenow={navWidth}
              tabIndex={0}
              title={t('manager.resizeTip')}
              onPointerDown={startResize('nav')}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              onPointerCancel={endResize}
              onLostPointerCapture={endResize}
              onKeyDown={resizeNavByKeyboard}
              onDoubleClick={() => update({ navWidth: null })}
            />
          )}
        <section className="sb-manager-chat" aria-label={t('manager.chatTitle')}>
          <header className="sb-manager-chat-head">
            <span className="sb-manager-chat-title">{t('manager.chatTitle')}</span>
            <span className="sb-manager-chat-spacer" />
            <IconAction
              label={focusedChat ? t('manager.focusChatExit') : t('manager.focusChat')}
              pressed={focusedChat}
              tone="accent"
              onClick={toggleFocusChat}
            >
              {focusedChat ? <IconRestore size={15} /> : <IconMaximize size={15} />}
              <span className="sb-manager-btn-label">{focusedChat ? t('manager.focusChatExit') : t('manager.focusChat')}</span>
            </IconAction>
          </header>
          {chatBody !== null
            ? <div className="sb-manager-chat-body">{chatBody}</div>
            : chatFailed
              ? (
                <div className="sb-manager-notice" role="alert">
                  <IconInfo size={18} />
                  <p title={snapshot.stateError ?? undefined}>
                    {snapshot.phase === 'error' ? t('manager.errorState') : t('manager.chatUnavailable')}
                  </p>
                  <button type="button" className="sb-manager-btn" onClick={refresh}>{t('manager.chatRetry')}</button>
                </div>
              )
              : (
                <div className="sb-manager-notice" role="status">
                  <span className="sb-manager-spinner" aria-hidden="true" />
                  <p>{t('manager.loading')}</p>
                </div>
              )}
        </section>
      </div>
    </section>
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
        <path d="M4.2 2.4h5.6v9.2H4.2zM6.6 4.2h1.2M6.6 6.6h1.2M6.6 9h1.2" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M11.2 2.4v9.2" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </svg>
      {inSidebar ? <span className="sb-manager-entry-label">{label}</span> : null}
    </button>
  )
}

