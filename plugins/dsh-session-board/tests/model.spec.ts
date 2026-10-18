/**
 * Tests for the shared board model.
 *
 * Everything here is synthetic and injected: fake sources, a fake interval
 * scheduler, a fake wall clock and a fake document. Nothing touches a browser,
 * a real timer, or a real DSH service, so the model's whole lifecycle —
 * derivation, first-seen stamping, gated ticking, watcher release and disposal
 * — is exercised deterministically.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  BoardModel,
  DEFAULT_INTERVAL_MS,
  type BoardModelState,
  type BoardTimers,
  type BoardVisibility,
} from '../src/client/model.ts'
import type {
  JobsSnapshot,
  SessionListState,
  SessionStatus,
  SessionStatusSnapshot,
  SessionSummary,
  Source,
  WorkspaceSnapshot,
} from '../src/client/dsh.ts'
import type { BoardFeedState } from '../src/client/feed.ts'
import { EMPTY_FEED, type BoardFeed } from '../src/shared/types.ts'

/** A writable observable source with the exact `Source` shape the model reads. */
class TestSource<T> implements Source<T> {
  private value: T
  private readonly listeners = new Set<() => void>()

  constructor(initial: T) {
    this.value = initial
  }

  getSnapshot(): T {
    return this.value
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  set(next: T): void {
    this.value = next
    for (const listener of [...this.listeners]) listener()
  }

  get subscribers(): number {
    return this.listeners.size
  }
}

/** One session list row, with the required fields filled in. */
function sessionRow(id: string, overrides: Omit<Partial<SessionSummary>, 'id'> = {}): SessionSummary {
  return { id, displayTitle: id, running: false, blank: false, updatedAt: 0, ...overrides }
}

/** A list snapshot in host display order. */
function listOf(rows: readonly SessionSummary[]): SessionListState {
  const byId: Record<string, SessionSummary> = {}
  for (const row of rows) byId[row.id] = row
  return { ids: rows.map(row => row.id), byId }
}

/** One status entry. */
function statusOf(running: boolean, overrides: Omit<Partial<SessionStatus>, 'running'> = {}): SessionStatus {
  return { running, pendingInteraction: undefined, completionUnread: false, ...overrides }
}

/** A pending-interaction record. */
function pendingOf(kind: string, sessionId = 's1'): { key: string; kind: string; sessionId: string } {
  return { key: `${kind}:1`, kind, sessionId }
}

/** A jobs roster that records every open and release. */
interface JobsHarness {
  state: TestSource<JobsSnapshot>
  watchRows: (sessionId: string) => () => void
  opened: string[]
  released: string[]
  open: () => number
}

/** Build a recording jobs service. */
function createJobs(): JobsHarness {
  const state = new TestSource<JobsSnapshot>({ rows: {} })
  const open = new Map<string, () => void>()
  const opened: string[] = []
  const released: string[] = []
  const watchRows = (sessionId: string): (() => void) => {
    opened.push(sessionId)
    let done = false
    const release = (): void => {
      if (done) return
      done = true
      open.delete(sessionId)
      released.push(sessionId)
    }
    open.set(sessionId, release)
    return release
  }
  return { state, watchRows, opened, released, open: () => open.size }
}

/** Telemetry for the fake scheduler. */
interface TimerHarness {
  timers: BoardTimers
  /** Advance the shared clock, firing every interval due in the window. */
  advance: (ms: number) => void
  active: () => number
  fired: () => number
}

/** Build a fake interval scheduler driven by the same clock the model reads. */
function createTimers(clock: { now: number }): TimerHarness {
  let nextId = 1
  let ticks = 0
  const intervals = new Map<number, { handler: () => void; ms: number; due: number }>()
  const timers: BoardTimers = {
    setInterval: (handler, ms) => {
      const id = nextId
      nextId += 1
      intervals.set(id, { handler, ms, due: clock.now + ms })
      return id
    },
    clearInterval: (handle) => { intervals.delete(handle as number) },
  }
  return {
    timers,
    advance(ms) {
      const target = clock.now + ms
      for (let guard = 0; guard < 10_000; guard += 1) {
        let chosen: { handler: () => void; ms: number; due: number } | null = null
        for (const interval of intervals.values()) {
          if (interval.due > target) continue
          if (chosen === null || interval.due < chosen.due) chosen = interval
        }
        if (chosen === null) break
        clock.now = chosen.due
        chosen.due = clock.now + chosen.ms
        chosen.handler()
        ticks += 1
      }
      clock.now = target
    },
    active: () => intervals.size,
    fired: () => ticks,
  }
}

/** A fake document that can be hidden and shown. */
class TestVisibility implements BoardVisibility {
  hidden = false
  private readonly listeners = new Set<() => void>()

  addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener)
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden
    for (const listener of [...this.listeners]) listener()
  }

  get listening(): number {
    return this.listeners.size
  }
}

interface HarnessOptions {
  list?: SessionListState | undefined
  statuses?: SessionStatusSnapshot | undefined
  feed?: BoardFeed | undefined
  jobs?: boolean | undefined
  workspaces?: WorkspaceSnapshot | null | undefined
  visibility?: boolean | undefined
  now?: number | undefined
}

interface Harness {
  model: BoardModel
  clock: { now: number }
  timers: TimerHarness
  list: TestSource<SessionListState>
  statuses: TestSource<SessionStatusSnapshot>
  feed: TestSource<BoardFeedState>
  jobs: JobsHarness | null
  workspaces: TestSource<WorkspaceSnapshot> | null
  visibility: TestVisibility | null
}

/** Build a model wired entirely to synthetic sources, timers and document. */
function createHarness(options: HarnessOptions = {}): Harness {
  const clock = { now: options.now ?? 1_000 }
  const timers = createTimers(clock)
  const list = new TestSource<SessionListState>(options.list ?? listOf([]))
  const statuses = new TestSource<SessionStatusSnapshot>(options.statuses ?? new Map())
  const feed = new TestSource<BoardFeedState>({ feed: options.feed ?? EMPTY_FEED, online: true, receivedAt: 0 })
  const jobs = options.jobs === true ? createJobs() : null
  const workspaces = options.workspaces === null || options.workspaces === undefined
    ? null
    : new TestSource<WorkspaceSnapshot>(options.workspaces)
  const visibility = options.visibility === false ? null : new TestVisibility()
  const model = new BoardModel({
    sessions: { list },
    uiSession: { sessionStatus: statuses },
    feed,
    jobs,
    workspaces: workspaces === null ? null : { list: workspaces },
    document: visibility,
    now: () => clock.now,
    timers: timers.timers,
  })
  return { model, clock, timers, list, statuses, feed, jobs, workspaces, visibility }
}

/** The jobs harness, or a loud failure when a test forgot to request one. */
function requireJobs(harness: Harness): JobsHarness {
  if (harness.jobs === null) throw new Error('harness has no jobs service')
  return harness.jobs
}

/** The visibility fake, or a loud failure when a test forgot to request one. */
function requireVisibility(harness: Harness): TestVisibility {
  if (harness.visibility === null) throw new Error('harness has no visibility target')
  return harness.visibility
}

/** The running group's entries. */
function runningEntries(state: BoardModelState): BoardModelState['groups'][number]['entries'] {
  return state.groups.find(group => group.id === 'running')?.entries ?? []
}

/** The attention group's entries. */
function attentionEntries(state: BoardModelState): BoardModelState['groups'][number]['entries'] {
  return state.groups.find(group => group.id === 'attention')?.entries ?? []
}

describe('BoardModel — derived snapshot', () => {
  it('derives all three groups from the synthetic sources', () => {
    const harness = createHarness({
      list: listOf([sessionRow('blocked'), sessionRow('run'), sessionRow('idle', { updatedAt: 5 })]),
      statuses: new Map([
        ['blocked', statusOf(false, { pendingInteraction: pendingOf('approval', 'blocked') })],
        ['run', statusOf(true)],
        ['idle', statusOf(false)],
      ]),
    })
    harness.model.start()
    const state = harness.model.getSnapshot()
    expect(state.groups.map(group => group.id)).toEqual(['attention', 'running', 'done'])
    expect(attentionEntries(state).map(entry => entry.id)).toEqual(['blocked'])
    expect(runningEntries(state).map(entry => entry.id)).toEqual(['run'])
    expect(state.groups[2]?.entries.map(entry => entry.id)).toEqual(['idle'])
    expect(state.anyRunning).toBe(true)
  })

  it('derives before start() so a first render is never blank', () => {
    const harness = createHarness({ list: listOf([sessionRow('a')]) })
    const state = harness.model.getSnapshot()
    expect(state.groups.map(group => group.id)).toEqual(['attention', 'running', 'done'])
    expect(state.groups[2]?.entries.map(entry => entry.id)).toEqual(['a'])
    expect(state.anyRunning).toBe(false)
  })

  it('shares one snapshot object and notifies every subscriber once per change', () => {
    const harness = createHarness()
    harness.model.start()
    const seenA: BoardModelState[] = []
    const seenB: BoardModelState[] = []
    harness.model.subscribe(() => { seenA.push(harness.model.getSnapshot()) })
    harness.model.subscribe(() => { seenB.push(harness.model.getSnapshot()) })
    harness.list.set(listOf([sessionRow('a')]))

    expect(seenA).toHaveLength(1)
    expect(seenB).toHaveLength(1)
    expect(seenA[0]).toBe(seenB[0])
    // `getSnapshot` is a bound arrow property, so it survives being detached.
    const getSnapshot = harness.model.getSnapshot
    expect(getSnapshot()).toBe(harness.model.getSnapshot())
  })

  it('stops delivering to an unsubscribed listener', () => {
    const harness = createHarness()
    harness.model.start()
    const listener = vi.fn()
    const unsubscribe = harness.model.subscribe(listener)
    unsubscribe()
    harness.list.set(listOf([sessionRow('a')]))
    expect(listener).not.toHaveBeenCalled()
  })

  it('carries job counts and workspace labels through the optional services', () => {
    const harness = createHarness({
      jobs: true,
      list: listOf([sessionRow('s1', { running: true })]),
      statuses: new Map([['s1', statusOf(true)]]),
      workspaces: { items: [{ workspaceId: 'w1', title: 'repo', path: '/tmp/repo', sessionIds: ['s1'] }] },
    })
    const jobs = requireJobs(harness)
    jobs.state.set({ rows: { s1: [{ id: 'j1', status: 'running' }, { id: 'j2', status: 'done' }] } })
    harness.model.start()

    const entry = runningEntries(harness.model.getSnapshot())[0]
    expect(entry?.workspaceTitle).toBe('repo')
    expect(entry?.metrics.liveJobs).toBe(1)
  })
})

describe('BoardModel — first-seen clock', () => {
  it('stamps a pending wait at the real observation time, not a stale tick', () => {
    const harness = createHarness({
      list: listOf([sessionRow('s1', { running: true })]),
      statuses: new Map([['s1', statusOf(true)]]),
    })
    harness.model.start()
    // The running card keeps the ticker live; the stamp must still use the
    // real clock when the block is observed mid-window.
    expect(harness.timers.active()).toBe(1)

    harness.clock.now = 5_000
    harness.statuses.set(new Map([['s1', statusOf(false, { pendingInteraction: pendingOf('approval') })]]))
    const entry = attentionEntries(harness.model.getSnapshot())[0]
    expect(entry?.id).toBe('s1')
    expect(entry?.state).toBe('blocked')
    expect(entry?.waitSince).toBe(5_000)
  })

  it('keeps one stamp while the condition holds and restarts it after it clears', () => {
    const harness = createHarness()
    harness.model.start()
    harness.clock.now = 4_000
    harness.list.set(listOf([sessionRow('s1')]))
    harness.statuses.set(new Map([['s1', statusOf(false, { pendingInteraction: pendingOf('approval') })]]))
    expect(attentionEntries(harness.model.getSnapshot())[0]?.waitSince).toBe(4_000)

    // Same condition, new details: the original stamp stands.
    harness.clock.now = 9_000
    harness.statuses.set(new Map([['s1', statusOf(false, { pendingInteraction: pendingOf('question') })]]))
    expect(attentionEntries(harness.model.getSnapshot())[0]?.waitSince).toBe(4_000)

    // Cleared, observed idle, then raised again: a fresh clock.
    harness.statuses.set(new Map([['s1', statusOf(false)]]))
    harness.clock.now = 12_000
    harness.statuses.set(new Map([['s1', statusOf(false, { pendingInteraction: pendingOf('approval') })]]))
    expect(attentionEntries(harness.model.getSnapshot())[0]?.waitSince).toBe(12_000)
  })

  it('stamps the client-local unread fallback when the host has no cursor', () => {
    const harness = createHarness()
    harness.model.start()
    harness.clock.now = 3_000
    harness.list.set(listOf([sessionRow('s1')]))
    harness.statuses.set(new Map([['s1', statusOf(false, { completionUnread: true })]]))
    const entry = attentionEntries(harness.model.getSnapshot())[0]
    expect(entry?.noteKey).toBe('note.unread')
    expect(entry?.waitSince).toBe(3_000)
  })
})

describe('BoardModel — gated ticker', () => {
  it('creates no interval while nothing runs', () => {
    const harness = createHarness({ list: listOf([sessionRow('idle')]) })
    harness.model.start()
    expect(harness.timers.active()).toBe(0)
    harness.timers.advance(5_000)
    expect(harness.timers.fired()).toBe(0)
  })

  it('starts one tick per DEFAULT_INTERVAL_MS for a running session and stops when it idles', () => {
    const harness = createHarness({
      list: listOf([sessionRow('s1')]),
      statuses: new Map([['s1', statusOf(false)]]),
    })
    harness.model.start()
    expect(harness.timers.active()).toBe(0)

    harness.statuses.set(new Map([['s1', statusOf(true)]]))
    expect(harness.timers.active()).toBe(1)
    harness.timers.advance(DEFAULT_INTERVAL_MS - 1)
    expect(harness.timers.fired()).toBe(0)
    harness.timers.advance(1)
    expect(harness.timers.fired()).toBe(1)

    harness.statuses.set(new Map([['s1', statusOf(false)]]))
    expect(harness.timers.active()).toBe(0)
    harness.timers.advance(2_000)
    expect(harness.timers.fired()).toBe(1)
  })

  it('pauses while the document is hidden and resumes when it is visible', () => {
    const harness = createHarness({
      list: listOf([sessionRow('s1', { running: true })]),
      statuses: new Map([['s1', statusOf(true)]]),
    })
    const visibility = requireVisibility(harness)
    visibility.setHidden(true)
    harness.model.start()
    expect(harness.timers.active()).toBe(0)
    harness.timers.advance(3_000)
    expect(harness.timers.fired()).toBe(0)

    visibility.setHidden(false)
    expect(harness.timers.active()).toBe(1)
    harness.timers.advance(1_000)
    expect(harness.timers.fired()).toBe(1)

    visibility.setHidden(true)
    expect(harness.timers.active()).toBe(0)
    visibility.setHidden(false)
    expect(harness.timers.active()).toBe(1)
  })

  it('ticks elapsed figures from the real clock', () => {
    const feed: BoardFeed = { acks: {}, turns: { s1: { openTurnStart: 0 } } }
    const harness = createHarness({
      list: listOf([sessionRow('s1', { running: true })]),
      statuses: new Map([['s1', statusOf(true)]]),
      feed,
      now: 1_000,
    })
    harness.model.start()
    expect(runningEntries(harness.model.getSnapshot())[0]?.metrics.elapsedMs).toBe(1_000)
    harness.timers.advance(2_000)
    expect(runningEntries(harness.model.getSnapshot())[0]?.metrics.elapsedMs).toBe(3_000)
  })
})

describe('BoardModel — jobs watching', () => {
  it('watches only running or currently displayed sessions', () => {
    const harness = createHarness({
      jobs: true,
      list: listOf([
        sessionRow('run', { running: true }),
        sessionRow('idle'),
        sessionRow('current', { retainedBy: { mainView: 1 } }),
        sessionRow('child', { origin: 'subagent', parentId: 'run' }),
      ]),
    })
    harness.model.start()
    const jobs = requireJobs(harness)
    expect([...jobs.opened].sort()).toEqual(['current', 'run'])
    expect(jobs.open()).toBe(2)
  })

  it('releases a watcher when a session stops, and every watcher on dispose', () => {
    const harness = createHarness({ jobs: true, list: listOf([sessionRow('a', { running: true }), sessionRow('b')]) })
    harness.model.start()
    const jobs = requireJobs(harness)
    expect(jobs.opened).toEqual(['a'])

    harness.list.set(listOf([sessionRow('a'), sessionRow('b')]))
    expect(jobs.released).toEqual(['a'])
    expect(jobs.open()).toBe(0)

    harness.list.set(listOf([sessionRow('a', { running: true }), sessionRow('b', { retainedBy: { mainView: 1 } })]))
    expect(jobs.open()).toBe(2)

    // Disposal releases the reopened 'a' and the newly watched 'b'.
    harness.model.dispose()
    expect([...jobs.released].sort()).toEqual(['a', 'a', 'b'])
    expect(jobs.open()).toBe(0)

    // A second dispose must not release anything twice.
    harness.model.dispose()
    expect(jobs.released).toHaveLength(3)
  })

  it('does not double-open watchers or double-subscribe when start is called twice', () => {
    const harness = createHarness({ jobs: true, list: listOf([sessionRow('a', { running: true })]) })
    harness.model.start()
    harness.model.start()
    const jobs = requireJobs(harness)
    expect(jobs.opened).toEqual(['a'])
    expect(harness.list.subscribers).toBe(1)
    expect(harness.statuses.subscribers).toBe(1)
    expect(harness.feed.subscribers).toBe(1)
    expect(requireVisibility(harness).listening).toBe(1)
  })

  it('subscribes through the source object so a prototype method keeps its this', () => {
    // `TestSource.subscribe` reads `this.listeners`; a detached copy would throw.
    const harness = createHarness({ list: listOf([sessionRow('a')]) })
    expect(() => harness.model.start()).not.toThrow()
    expect(harness.list.subscribers).toBe(1)
  })
})

describe('BoardModel — disposal safety', () => {
  it('releases subscriptions, visibility and listeners on dispose', () => {
    const harness = createHarness({ jobs: true, list: listOf([sessionRow('a', { running: true })]) })
    harness.model.start()
    const listener = vi.fn()
    harness.model.subscribe(listener)
    harness.model.dispose()

    expect(harness.list.subscribers).toBe(0)
    expect(harness.statuses.subscribers).toBe(0)
    expect(harness.feed.subscribers).toBe(0)
    expect(requireVisibility(harness).listening).toBe(0)
    expect(requireJobs(harness).open()).toBe(0)

    // Late pushes must not reach a listener or re-derive anything.
    harness.list.set(listOf([sessionRow('a', { running: true }), sessionRow('b')]))
    harness.statuses.set(new Map())
    harness.feed.set({ feed: EMPTY_FEED, online: false, receivedAt: 1 })
    expect(listener).not.toHaveBeenCalled()

    const late = vi.fn()
    const unsubscribe = harness.model.subscribe(late)
    unsubscribe()
    harness.list.set(listOf([]))
    expect(late).not.toHaveBeenCalled()
  })

  it('starts even when a source refuses to subscribe', () => {
    const clock = { now: 1_000 }
    const timers = createTimers(clock)
    const list: Source<SessionListState> = {
      getSnapshot: () => listOf([sessionRow('a')]),
      subscribe: () => { throw new Error('refused') },
    }
    const statuses = new TestSource<SessionStatusSnapshot>(new Map())
    const feed = new TestSource<BoardFeedState>({ feed: EMPTY_FEED, online: false, receivedAt: 0 })
    const model = new BoardModel({
      sessions: { list },
      uiSession: { sessionStatus: statuses },
      feed,
      now: () => clock.now,
      timers: timers.timers,
      document: null,
    })

    expect(() => model.start()).not.toThrow()
    expect(model.getSnapshot().groups[2]?.entries.map(entry => entry.id)).toEqual(['a'])
    expect(() => model.dispose()).not.toThrow()
  })
})
