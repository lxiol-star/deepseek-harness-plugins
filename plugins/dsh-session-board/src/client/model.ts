/**
 * The shared board model.
 *
 * The docked column and the fullscreen board render the same cards, so both
 * must read the same derived state. Building that state inside a React hook
 * meant each mounted view opened its own subscriptions, its own jobs watchers
 * and its own one-second ticker — two views, twice the wakeups, and two
 * independent first-seen clocks that could disagree about how long a card had
 * been waiting.
 *
 * This module does that work once: a plain observable store (no React and no
 * imported DSH runtime) that subscribes to the client snapshots, assembles the
 * session inputs, derives the groups, watches the job rosters, and owns the
 * single first-seen clock and the single gated ticker. React binds to it with
 * `useSyncExternalStore(model.subscribe, model.getSnapshot)`.
 *
 * Lifecycle is explicit: construct, `start()`, `dispose()`. `dispose()` is
 * terminal. Every source subscription and every jobs watcher is released
 * exactly once, later callbacks are ignored, and no listener runs after
 * disposal.
 */
import { buildBoard } from '../shared/board.ts'
import { groupEntries } from '../shared/order.ts'
import type { BoardGroup } from '../shared/types.ts'
import { assembleInputs } from './source.ts'
import type {
  JobView,
  JobsSnapshot,
  SessionListState,
  SessionStatusSnapshot,
  Source,
  WorkspaceSnapshot,
} from './dsh.ts'
import type { BoardFeedState } from './feed.ts'
import type { ReadonlyStore } from './store.ts'

/** The derived state every view renders from. */
export interface BoardModelState {
  /** The three groups, in presentation order, fully derived and sorted. */
  groups: BoardGroup[]
  /** Whether any session is running; the only condition that starts the clock. */
  anyRunning: boolean
}

/** The sessions service face the model reads. */
export interface BoardModelSessions {
  list: Source<SessionListState>
}

/** The uiSession service face the model reads. */
export interface BoardModelUiSession {
  sessionStatus: Source<SessionStatusSnapshot>
}

/** The jobs service face the model reads; `watchRows` is optional. */
export interface BoardModelJobs {
  state: Source<JobsSnapshot>
  /** Open the roster for one session, returning its release. Optional. */
  watchRows?: ((sessionId: string) => () => void) | undefined
}

/** The workspaces service face the model reads. */
export interface BoardModelWorkspaces {
  list: Source<WorkspaceSnapshot>
}

/** Minimal interval scheduler; injectable so the model needs no globals in tests. */
export interface BoardTimers {
  setInterval(handler: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

/**
 * Minimal document-visibility face. `globalThis.document` structurally
 * satisfies it; tests pass a two-line fake.
 */
export interface BoardVisibility {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

/** Everything one model needs. Only the sessions, status and feed sources are required. */
export interface BoardModelOptions {
  sessions: BoardModelSessions
  uiSession: BoardModelUiSession
  /**
   * The durable host feed. A `BoardFeedClient` satisfies this, as does any
   * read-only `Source<BoardFeedState>`.
   */
  feed: Source<BoardFeedState>
  /** The jobs service; absent means no job counts and no roster watching. */
  jobs?: BoardModelJobs | null | undefined
  /** The workspaces service; absent means no workspace labels. */
  workspaces?: BoardModelWorkspaces | null | undefined
  /** Wall clock. Defaults to `Date.now`. */
  now?: (() => number) | undefined
  /** Interval scheduler. Defaults to `globalThis.setInterval`/`clearInterval`. */
  timers?: BoardTimers | undefined
  /** Visibility source. Defaults to `globalThis.document` when present; `null` disables gating. */
  document?: BoardVisibility | null | undefined
  /** Tick period in milliseconds. Defaults to 1000. */
  intervalMs?: number | undefined
}

/** Default tick period: one second, the resolution of every elapsed figure. */
export const DEFAULT_INTERVAL_MS = 1_000

/** Empty job rows, used when no jobs service is configured. */
const EMPTY_JOB_ROWS: Readonly<Record<string, readonly JobView[]>> = {}

/** The real scheduler, typed through the model's narrow interface. */
function defaultTimers(): BoardTimers {
  return {
    setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
    clearInterval: (handle) => {
      globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>)
    },
  }
}

/** Adapt `globalThis.document` to the visibility face, or null when absent. */
function defaultVisibility(): BoardVisibility | null {
  const doc = globalThis.document
  if (doc === undefined || doc === null) return null
  return {
    get hidden(): boolean { return doc.hidden },
    addEventListener: (type, listener) => { doc.addEventListener(type, listener) },
    removeEventListener: (type, listener) => { doc.removeEventListener(type, listener) },
  }
}

/**
 * First-seen timestamps for the two client-local signals.
 *
 * Only the host-less fallback needs these: when the durable cursor exists it
 * supplies a real event time, which is a far better sort key than "when this
 * page happened to notice". Stamps are dropped as soon as the condition
 * clears, so a later occurrence starts a fresh clock. One instance lives in
 * the model, so the dock and the board always agree on how long a card waited.
 */
class FirstSeenClock {
  private readonly seen = new Map<string, number>()

  /** Stamp newly-active keys and forget inactive ones. */
  sync(active: ReadonlySet<string>, now: number): void {
    for (const key of active) {
      if (!this.seen.has(key)) this.seen.set(key, now)
    }
    for (const key of [...this.seen.keys()]) {
      if (!active.has(key)) this.seen.delete(key)
    }
  }

  /** The stamp for a key, or null. */
  get(key: string): number | null {
    return this.seen.get(key) ?? null
  }
}

/** Whether any session is running, per either the status map or the list rows. */
function anySessionRunning(list: SessionListState, statuses: SessionStatusSnapshot): boolean {
  for (const status of statuses.values()) {
    if (status.running === true) return true
  }
  for (const row of Object.values(list.byId)) {
    if (row.running === true) return true
  }
  return false
}

/**
 * The board's single external store.
 *
 * Not a hook: one instance is shared by every mounted view, so the derived
 * groups, the first-seen clock, the jobs watchers and the ticker all exist
 * once per plugin, not once per view.
 */
export class BoardModel implements ReadonlyStore<BoardModelState> {
  private state: BoardModelState = { groups: groupEntries([]), anyRunning: false }
  private readonly listeners = new Set<() => void>()
  /** Wrapped source releases and other teardown, each callable at most once. */
  private readonly disposers = new Set<() => void>()
  private readonly watchers = new Map<string, () => void>()
  private readonly seen = new FirstSeenClock()
  private readonly options: BoardModelOptions
  private readonly now: () => number
  private readonly timers: BoardTimers
  private readonly visibility: BoardVisibility | null
  private readonly intervalMs: number
  /** Wrapper object so a legal handle of `0`/`null` is still distinguishable from "no timer". */
  private timer: { readonly handle: unknown } | null = null
  private started = false
  private disposed = false
  private computing = false
  private rerun = false

  constructor(options: BoardModelOptions) {
    this.options = options
    this.now = options.now ?? (() => Date.now())
    this.timers = options.timers ?? defaultTimers()
    this.visibility = options.document === undefined ? defaultVisibility() : options.document
    this.intervalMs = typeof options.intervalMs === 'number' && Number.isFinite(options.intervalMs) && options.intervalMs > 0
      ? options.intervalMs
      : DEFAULT_INTERVAL_MS
    // Derive once without subscribing, so a view that reads before `start()`
    // still sees real data (and the clock begins at construction, not first render).
    this.recompute()
  }

  /** Bound snapshot reader for `useSyncExternalStore`. */
  readonly getSnapshot = (): BoardModelState => this.state

  /** Bound subscriber for `useSyncExternalStore`. Never fires after `dispose()`. */
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Open every source subscription, the visibility listener and the initial
   * derivation. Idempotent; a no-op after `dispose()`.
   */
  start(): void {
    if (this.disposed || this.started) return
    this.started = true
    try {
    this.trackSource(this.options.sessions.list)
    this.trackSource(this.options.uiSession.sessionStatus)
    this.trackSource(this.options.feed)
    this.trackSource(this.options.jobs?.state)
    this.trackSource(this.options.workspaces?.list)
    if (this.visibility !== null) {
      try {
        this.visibility.addEventListener('visibilitychange', this.onVisibilityChange)
      } catch {
        // A document that refuses the listener simply means no visibility gating.
      }
    }
    this.recompute()
    } catch (error) { this.dispose(); throw error }
  }

  /**
   * Release everything. Terminal and idempotent: a second call, or any late
   * source push, does nothing.
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.started = false
    if (this.visibility !== null) {
      try {
        this.visibility.removeEventListener('visibilitychange', this.onVisibilityChange)
      } catch {
        // Already gone.
      }
    }
    this.stopTimer()
    for (const id of [...this.watchers.keys()]) this.releaseWatcher(id)
    for (const dispose of [...this.disposers]) dispose()
    this.disposers.clear()
    this.listeners.clear()
  }

  /** A source changed: re-derive, but never after disposal. */
  private readonly onSourceChange = (): void => {
    if (this.disposed || !this.started) return
    this.recompute()
  }

  /** The page was shown or hidden: resume or pause the clock. */
  private readonly onVisibilityChange = (): void => {
    if (this.disposed || !this.started) return
    if (this.isHidden()) {
      this.stopTimer()
      return
    }
    // Recompute on the way back so elapsed figures catch up immediately, and
    // so the interval is recreated if anything is still running.
    this.recompute()
  }

  /** The 1s tick; only ever scheduled while something runs and the page is visible. */
  private readonly tick = (): void => {
    if (this.disposed || !this.started) return
    if (this.isHidden()) {
      this.stopTimer()
      return
    }
    this.recompute()
  }

  /**
   * Subscribe to one source, preserving its `this` (the method is called on the
   * source, never detached) and wrapping its release for at-most-once disposal.
   */
  private trackSource<T>(source: Source<T> | null | undefined): void {
    if (source === null || source === undefined) return
    try {
      const release = source.subscribe(this.onSourceChange)
      this.track(typeof release === 'function' ? (release as () => void) : () => {})
    } catch {
      // A source that refuses to subscribe simply never pushes.
    }
  }

  /** Register a teardown that runs at most once, even across repeated disposes. */
  private track(release: () => void): void {
    let done = false
    const wrapped = (): void => {
      if (done) return
      done = true
      this.disposers.delete(wrapped)
      try {
        release()
      } catch {
        // One bad release must not strand the rest.
      }
    }
    this.disposers.add(wrapped)
  }

  /**
   * Re-derive the whole board from the current source snapshots.
   *
   * `now` is the real wall clock at observation time, not the last tick's
   * value: a first-seen stamp must record when the condition was actually
   * observed, and elapsed figures must be right on a source push too.
   */
  private recompute(): void {
    if (this.disposed) return
    // watchRows may publish synchronously. Never recursively derive while the
    // current pass is still registering its watchers.
    if (this.computing) {
      if (!this.rerun) {
        this.rerun = true
        queueMicrotask(() => { this.rerun = false; if (!this.disposed) this.recompute() })
      }
      return
    }
    this.computing = true
    try { this.recomputeNow() } finally { this.computing = false }
  }

  private recomputeNow(): void {
    const list = this.options.sessions.list.getSnapshot()
    const statuses = this.options.uiSession.sessionStatus.getSnapshot()
    const jobRows = this.options.jobs?.state?.getSnapshot?.()?.rows ?? EMPTY_JOB_ROWS
    const workspaces = this.options.workspaces?.list?.getSnapshot?.() ?? null
    const feed = this.options.feed.getSnapshot().feed
    const now = this.now()

    const inputs = assembleInputs({ list, statuses, jobRows, workspaces })

    // Stamp the client-local fallbacks as soon as they are observed.
    const active = new Set<string>()
    for (const input of inputs) {
      if (input.completionUnread) active.add(`${input.id}:unread`)
      if (input.pendingInteraction !== null) active.add(`${input.id}:pending`)
    }
    this.seen.sync(active, now)

    const entries = buildBoard(inputs, {
      now,
      feed,
      // Keep useful detail for the fixed-height internal scroller. This is a
      // bounded source preview, not an invented AI-generated summary.
      instructionMax: 2000, activityMax: 3000, errorMax: 1000,
      unreadSinceOf: (id) => this.seen.get(`${id}:unread`),
      pendingSinceOf: (id) => this.seen.get(`${id}:pending`),
    })

    const anyRunning = anySessionRunning(list, statuses)

    if (this.started) {
      this.syncWatchers(list, statuses)
      this.syncTimer(anyRunning)
    }

    this.publish({ groups: groupEntries(entries), anyRunning })
  }

  /**
   * Keep the jobs roster open for exactly the sessions on screen: running ones
   * and the session currently displayed. The roster is reference-counted
   * host-side, so every watcher that is no longer wanted is released here.
   */
  private syncWatchers(list: SessionListState, statuses: SessionStatusSnapshot): void {
    const jobs = this.options.jobs
    if (jobs === null || jobs === undefined || typeof jobs.watchRows !== 'function') return

    const wanted = new Set<string>()
    for (const id of list.ids ?? []) {
      const row = list.byId[id]
      if (row === undefined) continue
      if (row.running === true || statuses.get(id)?.running === true || (row.retainedBy?.mainView ?? 0) > 0) {
        wanted.add(id)
      }
    }

    for (const id of [...this.watchers.keys()]) {
      if (!wanted.has(id)) this.releaseWatcher(id)
    }
    for (const id of wanted) {
      if (this.watchers.has(id)) continue
      try {
        this.watchers.set(id, () => {})
        const release = jobs.watchRows(id)
        this.watchers.set(id, typeof release === 'function' ? (release as () => void) : () => {})
      } catch {
        this.watchers.delete(id)
        // A roster that refuses to open simply shows no job count.
      }
    }
  }

  /** Release one watcher exactly once. */
  private releaseWatcher(id: string): void {
    const release = this.watchers.get(id)
    if (release === undefined) return
    this.watchers.delete(id)
    try {
      release()
    } catch {
      // Keep releasing the others.
    }
  }

  /** Start, keep or stop the one-second tick according to run state and visibility. */
  private syncTimer(anyRunning: boolean): void {
    if (!this.started || !anyRunning || this.isHidden()) {
      this.stopTimer()
      return
    }
    if (this.timer !== null) return
    try {
      this.timer = { handle: this.timers.setInterval(this.tick, this.intervalMs) }
    } catch {
      this.timer = null
    }
  }

  /** Clear the tick if one exists. */
  private stopTimer(): void {
    const timer = this.timer
    if (timer === null) return
    this.timer = null
    try {
      this.timers.clearInterval(timer.handle)
    } catch {
      // Already cleared.
    }
  }

  /** Whether the injected document is currently hidden. */
  private isHidden(): boolean {
    return this.visibility !== null && this.visibility.hidden === true
  }

  /** Swap in a new snapshot and wake every listener. */
  private publish(next: BoardModelState): void {
    if (this.disposed) return
    this.state = next
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // One misbehaving consumer must not stop the board.
      }
    }
  }
}
