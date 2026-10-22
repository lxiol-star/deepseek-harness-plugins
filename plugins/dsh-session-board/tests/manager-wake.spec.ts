import { describe, expect, it } from 'vitest'
import { EventMux, type MuxEdge, type MuxPriority } from '../src/host/manager/mux.ts'
import { DEFAULT_WAKE_TIMINGS, WakeScheduler, type WakeTimings } from '../src/host/manager/wake.ts'

/** One timer entry of the fake clock. */
interface FakeTimer {
  at: number
  fn: () => void
}

/** Deterministic clock + timer queue for the scheduler. */
class FakeClock {
  now = 0
  private nextId = 1
  readonly timers = new Map<number, FakeTimer>()

  readonly schedule = (fn: () => void, delayMs: number): unknown => {
    const id = this.nextId++
    this.timers.set(id, { at: this.now + delayMs, fn })
    return id
  }

  readonly cancel = (handle: unknown): void => {
    this.timers.delete(handle as number)
  }

  /** Run every timer due up to `now + ms`, flushing microtasks between them. */
  async advance(ms: number): Promise<void> {
    this.now += ms
    for (;;) {
      let due: [number, FakeTimer] | undefined
      for (const entry of this.timers) {
        if (entry[1].at <= this.now && (due === undefined || entry[1].at < due[1].at)) due = entry
      }
      if (due === undefined) return
      this.timers.delete(due[0])
      due[1].fn()
      await flush()
    }
  }
}

/** Let the async delivery path settle. */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 6; turn += 1) await Promise.resolve()
}

/** One synthetic edge. */
function edge(priority: MuxPriority, key: string): MuxEdge {
  return { key, sourceId: key.split(':')[0] ?? 's1', kind: 'turn-end', priority, at: 0, summary: key }
}

/** Scheduler wired to a fake clock with controllable delivery. */
function harness(options: {
  enabled?: boolean
  canDeliver?: boolean
  deliver?: (attempt: number) => Promise<boolean>
  timings?: Partial<WakeTimings>
  initial?: { lastWakeAt?: number; urgentTimes?: readonly number[]; batchTimes?: readonly number[] }
} = {}) {
  const clock = new FakeClock()
  let enabled = options.enabled ?? true
  let canDeliver = options.canDeliver ?? true
  let pending: MuxEdge[] = []
  const delivered: MuxEdge[][] = []
  const deliveredAt: number[] = []
  const deliveredDropped: number[] = []
  let attempt = 0
  const scheduler = new WakeScheduler({
    now: () => clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    isEnabled: () => enabled,
    canDeliver: () => canDeliver,
    ...(options.timings === undefined ? {} : { timings: options.timings }),
    ...(options.initial === undefined ? {} : { initial: options.initial }),
    pending: () => ({ edges: [...pending], dropped: 0 }),
    deliver: async (edges, dropped) => {
      attempt += 1
      const ok = options.deliver === undefined ? true : await options.deliver(attempt)
      if (ok) {
        delivered.push([...edges])
        deliveredAt.push(clock.now)
        deliveredDropped.push(dropped)
        const sent = new Set(edges.map(item => item.key))
        pending = pending.filter(item => !sent.has(item.key))
      }
      return ok
    },
  })
  return {
    clock,
    scheduler,
    delivered,
    deliveredAt,
    deliveredDropped,
    setEnabled: (value: boolean) => { enabled = value },
    setCanDeliver: (value: boolean) => { canDeliver = value },
    push: (...edges: MuxEdge[]) => { pending.push(...edges) },
    pending: () => pending,
    attempts: () => attempt,
  }
}

describe('WakeScheduler cadence', () => {
  it('does nothing while wakeups are disabled', async () => {
    const h = harness({ enabled: false })
    h.push(edge('error', 's1:turn-end:1'))
    h.scheduler.notify()
    await h.clock.advance(3_600_000)
    expect(h.delivered).toHaveLength(0)
  })

  it('delivers an urgent edge after its debounce without another event', async () => {
    const h = harness()
    h.push(edge('error', 's1:turn-end:1'))
    h.scheduler.notify()
    await h.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs - 1)
    expect(h.delivered).toHaveLength(0)
    await h.clock.advance(1)
    expect(h.delivered).toHaveLength(1)
    expect(h.delivered[0]?.map(item => item.key)).toEqual(['s1:turn-end:1'])
    expect(h.deliveredAt).toEqual([DEFAULT_WAKE_TIMINGS.urgentDelayMs])
    expect(h.pending()).toEqual([])
  })

  it('coalesces a burst into one digest', async () => {
    const h = harness()
    h.push(edge('error', 's1:turn-end:1'), edge('error', 's2:turn-end:1'), edge('completed', 's3:turn-end:1'))
    h.scheduler.notify()
    await h.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs)
    expect(h.delivered).toHaveLength(1)
    expect(h.delivered[0]).toHaveLength(3)
  })

  it('uses the waiting and completion delays for their classes', async () => {
    const attention = harness()
    attention.push(edge('needs-input', 's1:turn-end:1'))
    attention.scheduler.notify()
    await attention.clock.advance(DEFAULT_WAKE_TIMINGS.attentionDelayMs)
    expect(attention.delivered).toHaveLength(1)

    const completed = harness()
    completed.push(edge('completed', 's1:turn-end:1'))
    completed.scheduler.notify()
    await completed.clock.advance(DEFAULT_WAKE_TIMINGS.completedDelayMs - 1)
    expect(completed.delivered).toHaveLength(0)
    await completed.clock.advance(1)
    expect(completed.delivered).toHaveLength(1)
  })

  it('enforces the minimum gap between wakes', async () => {
    const h = harness({ timings: { minGapMs: 10_000 } })
    h.push(edge('error', 's1:turn-end:1'))
    h.scheduler.notify()
    await h.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs)
    expect(h.delivered).toHaveLength(1)
    h.push(edge('error', 's2:turn-end:1'))
    h.scheduler.notify()
    // 3s debounce is shorter than the 10s gap after the first wake.
    await h.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs)
    expect(h.delivered).toHaveLength(1)
    await h.clock.advance(7_000)
    expect(h.delivered).toHaveLength(2)
  })
})

describe('WakeScheduler budgets and retries', () => {
  it('stops at the hourly budget and resumes when the window rolls over', async () => {
    const h = harness({ timings: { urgentBudgetPerHour: 2 } })
    for (let index = 0; index < 2; index += 1) {
      h.push(edge('error', `s${index}:turn-end:1`))
      h.scheduler.notify()
      await h.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs)
    }
    expect(h.delivered).toHaveLength(2)

    h.push(edge('error', 's9:turn-end:1'))
    h.scheduler.notify()
    await h.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs)
    expect(h.delivered).toHaveLength(2)
    expect(h.scheduler.status().suppressed).toBeGreaterThan(0)

    await h.clock.advance(3_600_000)
    expect(h.delivered).toHaveLength(3)
  })

  it('keeps edges queued and retries with backoff after a failed delivery', async () => {
    const h = harness({ deliver: async attempt => attempt >= 2 })
    h.push(edge('error', 's1:turn-end:1'))
    h.scheduler.notify()
    await h.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs)
    expect(h.delivered).toHaveLength(0)
    expect(h.pending()).toHaveLength(1)
    expect(h.scheduler.status().error).toBe('DELIVERY_FAILED')

    await h.clock.advance(DEFAULT_WAKE_TIMINGS.retryBackoffMs)
    expect(h.delivered).toHaveLength(1)
    expect(h.pending()).toEqual([])
    expect(h.scheduler.status().error).toBeUndefined()
  })

  it('waits for the manager to become idle instead of dropping the digest', async () => {
    const h = harness({ canDeliver: false })
    h.push(edge('error', 's1:turn-end:1'))
    h.scheduler.notify()
    await h.clock.advance(5_000)
    expect(h.delivered).toHaveLength(0)
    h.setCanDeliver(true)
    await h.clock.advance(5_000)
    expect(h.delivered).toHaveLength(1)
  })

  it('delivers immediately on a manual request, bypassing delay and budget', async () => {
    const h = harness({ timings: { batchBudgetPerHour: 0 } })
    h.push(edge('completed', 's1:turn-end:1'))
    h.scheduler.requestNow()
    await flush()
    expect(h.delivered).toHaveLength(1)
  })

  it('reports pending counts by class', () => {
    const h = harness({ enabled: false })
    h.push(
      edge('error', 's1:turn-end:1'),
      edge('needs-input', 's2:turn-end:1'),
      edge('completed', 's3:turn-end:1'),
      edge('progress', 's4:turn-start:1'),
    )
    const status = h.scheduler.status()
    expect(status.pending).toBe(3)
    expect(status.urgent).toBe(1)
    expect(status.attention).toBe(1)
    expect(status.completed).toBe(1)
    expect(status.enabled).toBe(false)
  })

  it('hydrates and exports throttle state across host restarts', async () => {
    const first = harness()
    first.push(edge('error', 's1:turn-end:1'))
    first.scheduler.notify()
    await first.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs)
    const exported = first.scheduler.exportState()
    expect(exported.urgentTimes).toHaveLength(1)

    const second = harness({ initial: exported })
    second.push(edge('error', 's2:turn-end:1'))
    second.scheduler.notify()
    // The clock restarts at zero, so the persisted lastWakeAt (3s from the
    // previous run) pushes the next allowed wake to lastWakeAt + minGap.
    await second.clock.advance(DEFAULT_WAKE_TIMINGS.urgentDelayMs + DEFAULT_WAKE_TIMINGS.minGapMs)
    expect(second.delivered).toHaveLength(1)
  })
})

describe('EventMux ignored sources', () => {
  it('never feeds the manager session back into the queue', () => {
    const mux = new EventMux()
    mux.ignore('manager')
    mux.record('manager', { type: 'turn/start', data: { turn: 1 } } as never, 1_000)
    mux.agentStatus('manager', 'idle', 1_000)
    expect(mux.snapshot().edges).toEqual([])
    expect(mux.snapshot().sources).toEqual({})
  })
})
