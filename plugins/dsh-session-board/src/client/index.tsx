/**
 * The browser half.
 *
 * Responsibilities, in order: publish the dictionaries, install the
 * stylesheet, subscribe to the host feed, register the two slot contributions
 * (the fullscreen board and the header toggle), and mount the docked column
 * through the DOM adapter.
 *
 * Design notes worth keeping in view:
 *  - the dock is NOT a slot contribution. The shell's three grid tracks are
 *    computed inside `AppFrame` and every column seat is a `single` slot that
 *    is already occupied, so adding a sibling column means placing an element
 *    by DOM contract. When that contract is not recognised the dock declines
 *    to mount and nothing else changes.
 *  - the board IS a slot contribution (`shell.overlay`, an additive `list`
 *    seat), so a renamed or removed slot simply never runs its callback.
 *  - both forms render the same component tree, so grouping, ordering and the
 *    state rules cannot drift apart.
 */
import type { Context } from '@deepseek-ai/cordis'
import { useCallback, useMemo, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { archiveCompletedSessions } from './native-archive.ts'
import { completedArchiveMarks, isArchived, isArchivedInClient, reviveArchiveMarks, type ArchiveMarks } from './archive-marks.ts'
import type { GroupingMode } from './workspace-tree.ts'
import { BoardFilterBar } from './BoardFilterBar.tsx'
import { DEFAULT_FILTERS, filterGroups, type BoardFilters } from './filters.ts'
import { BoardDock, clampDockWidth } from './BoardDock.tsx'
import { attachDock } from './dock-adapter.ts'
import { BoardOverlay } from './BoardOverlay.tsx'
import { STYLESHEET, STYLE_ID } from './css.ts'
import { BoardFeedClient } from './feed.ts'
import { BatchController } from './batch.ts'
import { BatchToolbar } from './BatchToolbar.tsx'
import { currentSessionId } from './source.ts'
import { BoardModel } from './model.ts'
import { CleanupStack } from './lifecycle.ts'
import { createStore, type ReadonlyStore, type Store } from './store.ts'
import { en, NS, zh } from './locales.ts'
import { useSnapshot, type Translate } from './hooks.ts'
import { createSynthesisSettings, type SynthesisSettingsFace } from './synthesis-settings.ts'
import { SessionBoardSettingsPage } from './SettingsPage.tsx'
import type {
  JobsService,
  SessionListState,
  SessionStatusSnapshot,
  SubagentAddress,
  UiWorkspaceService,
  WorkspacesService,
} from './dsh.ts'

/** Plugin name, shared by both halves. */
export const name = 'dsh-session-board'

/**
 * Services required before the browser half runs at all. The nested
 * {@link CORE_SERVICES} injection below adds the session, navigation and job
 * services the panel reads before it registers anything.
 */
export const inject = ['slots', 'locale']

/**
 * Services the panel is useless without; activation waits for these.
 *
 * They are injected rather than read through `ctx.get` because a `get` made
 * while the client is still composing captures `undefined` forever: navigation
 * (`uiWorkspace`) is what opens a card's session, and `workspaces` is what
 * tells the board which sessions the DSH client itself archived.
 */
const CORE_SERVICES = ['sessions', 'uiSession', 'uiWorkspace', 'jobs', 'workspaces']

/** Default dock width, in pixels, before the user drags it. */
const DOCK_DEFAULT_WIDTH = 340

/**
 * The slice of the slot registry this plugin uses.
 *
 * Declared structurally rather than importing each owning package's
 * declaration-merged `SlotMap`: the panel targets two specific seats and
 * should not pull in the type surface of every package that declares them.
 * If a seat is renamed upstream the callback below simply never runs.
 */
interface SlotRegistry {
  inject(key: string, callback: () => (() => void)): () => void
  register(options: {
    name: string
    id?: string
    key?: string
    order?: number
    /** Registrant-localized nav label; `settings.section` reads it. */
    label?: () => string
    locale?: string
    inject?: () => Record<string, unknown>
  }, component: unknown): () => void
}

/** The locale service slice this plugin uses. */
interface LocaleService {
  getSnapshot(): { revision: number; active: string }
  subscribe(listener: () => void): () => void
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): Translate
}

/** Persisted view state. */
interface ViewState {
  dock: { collapsed: boolean; width: number }
  board: { open: boolean }
  archiveMarks: ArchiveMarks
  grouping: GroupingMode
  filters: BoardFilters
  density: 'compact' | 'full'
  collapsedGroups: Record<string, boolean>
}

/** The initial view state. */
function initialView(): ViewState {
  return {
    dock: { collapsed: false, width: DOCK_DEFAULT_WIDTH },
    board: { open: false },
    archiveMarks: {},
    grouping: 'status',
    filters: { ...DEFAULT_FILTERS },
    density: 'compact',
    collapsedGroups: {},
  }
}

/** Everything the React tree needs, handed through slot inject faces. */
export interface BoardFace {
  feed: BoardFeedClient
  view: Store<ViewState>
  t: Translate
  locale: LocaleService
  sessions: {
    list: ReadonlyStore<SessionListState>
    subagentAddress?: (sessionId: string) => SubagentAddress | undefined
  } | null
  uiSession: { sessionStatus: ReadonlyStore<SessionStatusSnapshot> } | null
  jobs: JobsService | null
  workspaces: WorkspacesService | null
  openSession: (id: string) => void
  ack: (id: string) => void
  batch: BatchController
  model: BoardModel
}

/** A store that never changes, used when an optional service is missing. */
function emptyStore<T>(value: T): ReadonlyStore<T> {
  return { getSnapshot: () => value, subscribe: () => () => {} }
}

const EMPTY_LIST: SessionListState = { ids: [], byId: {} }
const EMPTY_STATUS: SessionStatusSnapshot = new Map()
const EMPTY_LIST_SOURCE = emptyStore(EMPTY_LIST)
const EMPTY_STATUS_SOURCE = emptyStore(EMPTY_STATUS)

/** The shared view-state actions. */
function useViewActions(face: BoardFace): {
  view: ViewState
  toggleCollapse: () => void
  setWidth: (width: number) => void
  toggleDensity: () => void
  setBoardOpen: (open: boolean) => void
  toggleGroup: (group: string) => void
} {
  const view = useSnapshot(face.view, (value) => value)
  const toggleCollapse = useCallback(() => {
    face.view.set((current) => ({ ...current, dock: { ...current.dock, collapsed: !current.dock.collapsed } }))
  }, [face])
  const setWidth = useCallback((width: number) => {
    face.view.set((current) => ({ ...current, dock: { ...current.dock, width: clampDockWidth(width) } }))
  }, [face])
  const toggleDensity = useCallback(() => {
    face.view.set((current) => ({ ...current, density: current.density === 'compact' ? 'full' : 'compact' }))
  }, [face])
  const setBoardOpen = useCallback((open: boolean) => {
    face.view.set((current) => ({ ...current, board: { open } }))
  }, [face])
  const toggleGroup = useCallback((group: string) => {
    face.view.set((current) => ({
      ...current,
      collapsedGroups: { ...current.collapsedGroups, [group]: current.collapsedGroups[group] !== true },
    }))
  }, [face])
  return { view, toggleCollapse, setWidth, toggleDensity, setBoardOpen, toggleGroup }
}

function useTranslation(face: BoardFace): Translate {
  const revision = useSnapshot(face.locale, value => value.revision)
  return useMemo(() => (key, params) => face.t(key, params), [face, revision])
}

function useSelection(face: BoardFace): { selected: ReadonlySet<string>; toggle: (id: string) => void; busy: boolean } {
  const state = useSnapshot(face.batch, value => value)
  const selected = useMemo(() => new Set(state.selected), [state.selected])
  return { selected, toggle: face.batch.toggle, busy: state.phase === 'previewing' || state.phase === 'archiving' }
}

function useFilters(face: BoardFace, groups: ReturnType<BoardModel['getSnapshot']>['groups']) {
  const filters = useSnapshot(face.view, value => value.filters)
  const marks = useSnapshot(face.view, value => value.archiveMarks)
  const annotated = useMemo(() => groups.map(group => ({ ...group, entries: group.entries.map(entry => {
    if (isArchivedInClient(entry)) return entry
    return isArchived(entry, marks) ? { ...entry, archivedAt: marks[entry.id]!.archivedAt } : entry
  }) })), [groups, marks])
  const filtered = useMemo(() => filterGroups(annotated, filters), [annotated, filters])
  const change = useCallback((next: BoardFilters) => {
    face.view.set(current => ({ ...current, filters: next }))
  }, [face])
  return { filters, filtered, change, shown: filtered.reduce((sum, group) => sum + group.entries.length, 0) }
}

/** The docked column's React root. */
function DockRoot({ face }: { face: BoardFace }): ReactElement {
  const { groups } = useSnapshot(face.model, value => value)
  const { view, toggleCollapse, setWidth, toggleDensity, setBoardOpen, toggleGroup } = useViewActions(face)
  const feedState = useSnapshot(face.feed, (value) => value)
  const selection = useSelection(face)
  const filtering = useFilters(face, groups)
  const t = useTranslation(face)
  return (
    <BoardDock
      grouping={view.grouping}
      groups={filtering.filtered}
      emptyKey={groups.some(group => group.entries.length > 0) ? "empty.noMatches" : "empty.noSessions"}
      t={t}
      collapsed={view.dock.collapsed}
      width={view.dock.width}
      density={view.density}
      online={feedState.online}
      onToggleCollapse={toggleCollapse}
      onWidth={setWidth}
      onToggleDensity={toggleDensity}
      onOpenBoard={() => setBoardOpen(true)}
      onOpen={face.openSession}
      onAck={face.ack}
      selected={selection.selected}
      onToggleSelect={selection.toggle}
      interactionDisabled={selection.busy}
      toolbar={<><BoardFilterBar groups={groups} filters={filtering.filters} onChange={filtering.change} shown={filtering.shown} t={t} grouping={view.grouping} onGrouping={grouping => face.view.set(current => ({ ...current, grouping }))} /><BatchToolbar controller={face.batch} groups={groups} visibleGroups={filtering.filtered} t={t} /></>}
      collapsedGroups={view.collapsedGroups}
      onToggleGroup={toggleGroup}
    />
  )
}

/** The fullscreen board content; mounted only while the overlay is open. */
function OpenOverlayContent({ face }: { face: BoardFace }): ReactElement {
  const { groups } = useSnapshot(face.model, value => value)
  const { view, toggleDensity, setBoardOpen, toggleGroup } = useViewActions(face)
  const feedState = useSnapshot(face.feed, (value) => value)
  const selection = useSelection(face)
  const filtering = useFilters(face, groups)
  const t = useTranslation(face)
  const close = useCallback(() => setBoardOpen(false), [setBoardOpen])
  const open = useCallback((id: string) => { face.openSession(id); setBoardOpen(false) }, [face, setBoardOpen])
  return (
    <BoardOverlay
      open
      grouping={view.grouping}
      groups={filtering.filtered}
      emptyKey={groups.some(group => group.entries.length > 0) ? "empty.noMatches" : "empty.noSessions"}
      t={t}
      density={view.density}
      online={feedState.online}
      onClose={close}
      onToggleDensity={toggleDensity}
      onOpen={open}
      onAck={face.ack}
      selected={selection.selected}
      onToggleSelect={selection.toggle}
      interactionDisabled={selection.busy}
      toolbar={<><BoardFilterBar groups={groups} filters={filtering.filters} onChange={filtering.change} shown={filtering.shown} t={t} grouping={view.grouping} onGrouping={grouping => face.view.set(current => ({ ...current, grouping }))} /><BatchToolbar controller={face.batch} groups={groups} visibleGroups={filtering.filtered} t={t} /></>}
      collapsedGroups={view.collapsedGroups}
      onToggleGroup={toggleGroup}
    />
  )
}

/** The fullscreen board's slot component. */
function BoardOverlaySlot({ face }: { face: BoardFace }): ReactElement | null {
  const { view } = useViewActions(face)
  return view.board.open ? <OpenOverlayContent face={face} /> : null
}

/** The session-header toggle. */
function HeaderToggle({ face }: { face: BoardFace }): ReactElement {
  const { view, setBoardOpen } = useViewActions(face)
  const label = view.board.open ? face.t('action.closeBoard') : face.t('action.openBoard')
  return (
    <button
      type="button"
      className="sb-btn"
      aria-label={label}
      title={label}
      aria-pressed={view.board.open}
      data-session-board-toggle=""
      onClick={() => setBoardOpen(!view.board.open)}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2 2.5h4.2v4.2H2zM7.8 2.5H12v4.2H7.8zM2 7.8h4.2V12H2zM7.8 7.8H12V12H7.8z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  )
}

/** Install the stylesheet, returning its remover. */
function installStylesheet(doc: Document | undefined): () => void {
  if (doc === undefined || doc === null) return () => {}
  doc.getElementById(STYLE_ID)?.remove()
  const element = doc.createElement('style')
  element.id = STYLE_ID
  element.textContent = STYLESHEET
  doc.head.append(element)
  return () => { element.remove() }
}

/**
 * Mount the docked column once the shell exists.
 *
 * The browser half activates before the application mounts, so the seat is
 * normally absent when this runs. One body observer waits for the shell to
 * appear, then attaches once and disconnects. If the shell never matches, the
 * panel simply has no dock: no error, and no change to the official UI.
 */
function mountDock(host: HTMLElement, render: (host: HTMLElement) => () => void, warn: (reason: string) => void): () => void {
  const doc = globalThis.document
  if (doc === undefined || doc === null) return () => {}

  let disposeRender: (() => void) | null = null
  let disposeAttachment: (() => void) | null = null
  let observer: MutationObserver | null = null
  let timeout: ReturnType<typeof globalThis.setTimeout> | null = null
  let cancelled = false

  const attempt = (): void => {
    if (cancelled || disposeRender !== null) return
    const attachment = attachDock(host, { document: doc, onWarn: warn })
    if (attachment === null) return
    disposeAttachment = () => attachment.dispose()
    try { disposeRender = render(host) } catch (error) { attachment.dispose(); throw error }
    observer?.disconnect()
    observer = null
    if (timeout !== null) {
      globalThis.clearTimeout(timeout)
      timeout = null
    }
  }

  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(() => { attempt() })
    observer.observe(doc.body, { childList: true, subtree: true })
  }
  attempt()
  // Give up quietly rather than observing the document forever.
  timeout = globalThis.setTimeout(() => {
    timeout = null
    if (disposeRender !== null) return
    cancelled = true
    observer?.disconnect()
    observer = null
    warn('dock-seat-unresolved')
  }, 30_000)

  return () => {
    cancelled = true
    if (timeout !== null) globalThis.clearTimeout(timeout)
    observer?.disconnect()
    observer = null
    disposeRender?.()
    disposeAttachment?.()
    host.remove()
  }
}

/**
 * Activate the browser half.
 * @param ctx - client root context.
 */
export function apply(ctx: Context): void {
  const locale = ctx.get('locale') as LocaleService | undefined
  const slots = ctx.get('slots') as SlotRegistry | undefined
  if (locale === undefined || slots === undefined) return

  ctx.effect(() => locale.register(NS, { zh: zh as unknown as Record<string, string>, en: en as unknown as Record<string, string> }), 'dsh-session-board: dictionaries')
  ctx.effect(() => installStylesheet(globalThis.document), 'dsh-session-board: stylesheet')

  const doc = globalThis.document
  if (doc === undefined || doc === null) return

  const t = locale.bind(NS)

  // Settings page: one group over the client's own model catalog. Registered
  // outside the core-service injection so the page still appears in a
  // composition without the session services.
  const synthesis = createSynthesisSettings()
  ctx.effect(() => () => synthesis.dispose(), 'dsh-session-board: settings controller')
  ctx.effect(() => slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'session-board',
    order: 60,
    label: () => t('settings.nav'),
    locale: NS,
    inject: (): { settings: SynthesisSettingsFace } => ({ settings: synthesis }),
  }, SessionBoardSettingsPage)), 'dsh-session-board: settings page')

  const warned = new Set<string>()
  const warn = (reason: string): void => {
    if (warned.has(reason)) return
    warned.add(reason)
    ctx.logger?.warn?.(`dsh-session-board: ${reason}`)
  }

  ctx.inject(CORE_SERVICES, (scoped: Context) => {
    const sessions = (scoped.get('sessions') ?? null) as BoardFace['sessions']
    const uiSession = (scoped.get('uiSession') ?? null) as BoardFace['uiSession']
    const jobs = (scoped.get('jobs') ?? null) as JobsService | null
    const workspaces = (scoped.get('workspaces') ?? null) as WorkspacesService | null
    const scopedSlots = scoped.get('slots') as SlotRegistry | undefined
    const navigation = scoped.get('uiWorkspace') as UiWorkspaceService | undefined
    /**
     * The navigation service, resolved again after this plugin settles.
     *
     * The injection above already waits for it, but resolving lazily keeps a
     * click working if the service instance is replaced (or was not visible
     * yet when this closure was built).
     */
    const navigationOf = (): UiWorkspaceService | undefined =>
      navigation ?? (scoped.get('uiWorkspace') as UiWorkspaceService | undefined)
    if (scopedSlots === undefined) return

    const cleanup = new CleanupStack()
    try {
    const feed = new BoardFeedClient()
    cleanup.add(() => feed.dispose())
    const model = new BoardModel({
      sessions: sessions ?? { list: EMPTY_LIST_SOURCE },
      uiSession: uiSession ?? { sessionStatus: EMPTY_STATUS_SOURCE },
      feed, jobs, workspaces, document: doc,
    })
    cleanup.add(() => model.dispose())
    model.start()
    const view = createStore<ViewState>(initialView(), {
      persist: 'dsh.session-board.v1',
      revive: (stored, initial) => {
        const source = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<ViewState>
        const groups = source.collapsedGroups
        return {
          dock: {
            collapsed: source.dock?.collapsed === true,
            width: clampDockWidth(Number(source.dock?.width ?? initial.dock.width)),
          },
          board: { open: false },
          archiveMarks: reviveArchiveMarks(source.archiveMarks),
          grouping: source.grouping === 'workspace' || source.grouping === 'tree' ? source.grouping : 'status',
          filters: { ...DEFAULT_FILTERS, archive: ['all', 'active', 'archived'].includes(source.filters?.archive ?? '') ? source.filters!.archive! : 'active' },
          density: source.density === 'full' ? 'full' : 'compact',
          collapsedGroups: typeof groups === 'object' && groups !== null ? { ...groups } : {},
        }
      },
    })

    let archiveDisposed = false
    cleanup.add(() => { archiveDisposed = true })
    const batch = new BatchController({
      preview: ids => feed.previewArchive(ids),
      commit: async token => {
        const captured = model.getSnapshot().groups.flatMap(group => group.entries)
        const result = await feed.commitArchive(token)
        const nativeArchive = await archiveCompletedSessions(result, {
          captured,
          current: () => model.getSnapshot().groups.flatMap(group => group.entries),
          archivedIds: () => workspaces?.list.getSnapshot().archivedSessionIds ?? [],
          archive: id => {
            if (!navigation?.archiveSession) return Promise.reject(new Error('NATIVE_ARCHIVE_UNAVAILABLE'))
            return navigation.archiveSession(id)
          },
          disposed: () => archiveDisposed,
        })
        result.nativeArchive = nativeArchive
        const completed = completedArchiveMarks(result, captured, Date.now())
        view.set(current => ({ ...current, archiveMarks: { ...current.archiveMarks, ...completed } }))
        return result
      },
    })
    cleanup.add(() => batch.dispose())

    feed.start()
    const resumePush = (): void => {
      if (doc.visibilityState === 'visible') feed.resume()
    }
    doc.addEventListener('visibilitychange', resumePush)
    cleanup.add(() => doc.removeEventListener('visibilitychange', resumePush))
    window.addEventListener('pageshow', resumePush)
    cleanup.add(() => window.removeEventListener('pageshow', resumePush))

    const face: BoardFace = {
      feed,
      view,
      t,
      locale,
      sessions,
      uiSession,
      jobs,
      workspaces,
      openSession: (id) => {
        const nav = navigationOf()
        if (nav === undefined || typeof nav.openSession !== 'function') {
          warn('navigation-unavailable')
          return
        }
        /** Open a child Session through the address the client records for it. */
        const openSubagent = (): boolean => {
          let address: SubagentAddress | undefined
          try {
            address = sessions?.subagentAddress?.(id)
          } catch {
            address = undefined
          }
          if (address === undefined || address === null) return false
          try {
            nav.openSession(address)
            return true
          } catch (error: unknown) {
            warn(`open-session-failed: ${String(error)}`)
            return true
          }
        }
        try {
          nav.openSession(id)
        } catch (error: unknown) {
          if (openSubagent()) return
          // A Session archived in the client — often by this board's own batch
          // archive — stays addressable but cannot be revealed; restore it and
          // open it again instead of leaving the click without any effect.
          const archived = workspaces?.list.getSnapshot().archivedSessionIds ?? []
          if (!archived.includes(id) || typeof nav.unarchiveSession !== 'function') {
            warn(`open-session-failed: ${String(error)}`)
            return
          }
          void nav.unarchiveSession(id).then(
            () => {
              try {
                nav.openSession(id)
              } catch (retryError: unknown) {
                warn(`open-session-failed: ${String(retryError)}`)
              }
            },
            (unarchiveError: unknown) => { warn(`open-session-failed: ${String(unarchiveError)}`) },
          )
        }
      },
      ack: (id) => { void feed.ack(id) },
      batch,
      model,
    }

    let lastViewed = ''
    const ackMain = (): void => {
      if (sessions === null) return
      const list = sessions.list.getSnapshot()
      const id = currentSessionId(list)
      if (id === null) { lastViewed = ''; return }
      const facts = feed.getSnapshot().feed.acks[id]
      const key = `${id}:${facts?.lastTurnEnd ?? ''}`
      if (key === lastViewed || list.byId[id]?.running === true) return
      lastViewed = key
      void feed.ack(id)
    }
    const releaseMain = sessions?.list.subscribe(ackMain) ?? (() => {})
    cleanup.add(releaseMain)
    const releaseFacts = feed.subscribe(ackMain)
    cleanup.add(releaseFacts)
    ackMain()

    // The board rides an additive list seat: if the seat is gone upstream the
    // callback never runs and nothing is registered.
    const disposeBoard = scopedSlots.inject('shell.overlay', () => scopedSlots.register({
      name: 'shell.overlay',
      id: 'session-board.overlay',
      order: 40,
      locale: NS,
      inject: () => ({ face }),
    }, BoardOverlaySlot))

    cleanup.add(disposeBoard)
    const disposeToggle = scopedSlots.inject('conversation.session.header.actions', () => scopedSlots.register({
      name: 'conversation.session.header.actions',
      id: 'session-board.toggle',
      order: 30,
      locale: NS,
      inject: () => ({ face }),
    }, HeaderToggle))

    cleanup.add(disposeToggle)
    // The dock is an additive frame grid item; official conversation nodes
    // remain untouched. The adapter restores the native template on disposal.
    const host = doc.createElement('div')
    host.setAttribute('data-dsh-session-board-host', '')
    const disposeDock = mountDock(host, (element) => {
      const root = createRoot(element)
      root.render(<DockRoot face={face} />)
      return () => { root.unmount() }
    }, warn)

    cleanup.add(disposeDock)
    return () => cleanup.dispose()
    } catch (error) {
      cleanup.dispose()
      warn(`client-activation-failed: ${String(error)}`)
      return () => {}
    }
  })
}
