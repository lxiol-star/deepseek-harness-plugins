/**
 * Wake policy for the manager panel.
 *
 * The mux stays a passive event store; this scheduler decides *when* a bundle
 * of pending edges becomes one manager prompt. Compared with the old
 * "check on the next event, at most once per minute" rule it adds:
 *
 *  - a real timer, so an edge queued during the cooldown is delivered when the
 *    cooldown ends instead of waiting for an unrelated event;
 *  - severity classes: errors wake after a short debounce, waiting sessions
 *    after a medium one, completions batch for longer, progress never wakes;
 *  - hourly budgets per class, so an incident storm cannot turn into an
 *    unbounded stream of model turns;
 *  - delivery acknowledgement: the manager prompt must succeed before the
 *    edges are consumed, and a failure keeps them for one backoff retry.
 *
 * All timing and capacity numbers are injectable so tests can drive a fake
 * clock without waiting on wall time.
 */
import type { MuxEdge } from './mux.ts'

/** Tunables of {@link WakeScheduler}. */
export interface WakeTimings {
  /** Debounce before an error digest. */
  urgentDelayMs: number
  /** Debounce before a "waiting for input" digest. */
  attentionDelayMs: number
  /** Batch window for completed turns. */
  completedDelayMs: number
  /** Minimum gap between any two automatic wakes. */
  minGapMs: number
  /** Urgent + attention wakes allowed in a rolling hour. */
  urgentBudgetPerHour: number
  /** Completion wakes allowed in a rolling hour. */
  batchBudgetPerHour: number
  /** First retry delay after a failed delivery. */
  retryBackoffMs: number
  /** Cap of the exponential delivery backoff. */
  maxRetryBackoffMs: number
}

/** Default cadence: fast for failures, calm for completions. */
export const DEFAULT_WAKE_TIMINGS: WakeTimings = {
  urgentDelayMs: 3_000,
  attentionDelayMs: 12_000,
  completedDelayMs: 45_000,
  minGapMs: 3_000,
  urgentBudgetPerHour: 20,
  batchBudgetPerHour: 6,
  retryBackoffMs: 15_000,
  maxRetryBackoffMs: 120_000,
}

/** One rolling-hour window. */
const HOUR_MS = 3_600_000
/** Retry delay when the manager Agent is running or not provisioned yet. */
const BUSY_RETRY_MS = 5_000

/** The severity class of one pending bundle. */
export type WakeClass = 'urgent' | 'attention' | 'completed'

/** Wire/UI view of the scheduler. */
export interface WakeStatus {
  enabled: boolean
  /** Pending edges that would wake the manager (progress edges excluded). */
  pending: number
  /** Pending edges that would wake the manager. */
  urgent: number
  attention: number
  completed: number
  lastWakeAt?: number
  nextAt?: number
  /** Automatic wakes in the current rolling hour. */
  wakesThisHour: number
  /** Times the hourly budget suppressed a wake since the last delivery. */
  suppressed: number
  /** Last delivery failure, if any. */
  error?: string
}

/** Collaborators of {@link WakeScheduler}; every side effect is injected. */
export interface WakeSchedulerDeps {
  /** Injectable clock. */
  now(): number
  /** One-shot timer; returns an opaque handle for {@link cancel}. */
  schedule(callback: () => void, delayMs: number): unknown
  /** Cancel a handle returned by {@link schedule}. */
  cancel(handle: unknown): void
  /** Whether the user opted in. */
  isEnabled(): boolean
  /** Whether a manager session has been provisioned at all. */
  hasManager?(): boolean
  /** Whether a manager digest can be injected right now (session exists, agent not running). */
  canDeliver(): boolean
  /** Pending edges plus drops since the last successful delivery. */
  pending(): { edges: MuxEdge[]; dropped: number }
  /**
   * Inject one digest.
   * @param edges - edges to describe (already bounded).
   * @param dropped - dropped-edge count to mention.
   * @returns true only when the prompt was accepted.
   */
  deliver(edges: readonly MuxEdge[], dropped: number): Promise<boolean>
  /** Called after a successful delivery, before the next reconcile. */
  onDelivered?(at: number, edges: readonly MuxEdge[]): void
  /** Contained delivery diagnostics. */
  onError?(message: string): void
  /** Overrides for tests/deployments. */
  timings?: Partial<WakeTimings>
  /** Persisted throttle state from the previous host run. */
  initial?: { lastWakeAt?: number; urgentTimes?: readonly number[]; batchTimes?: readonly number[] }
}

/** Class of one pending edge bundle; null when nothing should wake. */
function classOf(edges: readonly MuxEdge[]): WakeClass | null {
  if (edges.some(edge => edge.priority === 'error')) return 'urgent'
  if (edges.some(edge => edge.priority === 'needs-input')) return 'attention'
  if (edges.some(edge => edge.priority === 'completed')) return 'completed'
  return null
}

/** Class of one delivered bundle (its highest severity). */
function deliveredClass(edges: readonly MuxEdge[]): WakeClass {
  return classOf(edges) ?? 'completed'
}

/** Count edges per wake class. */
function countByClass(edges: readonly MuxEdge[]): { urgent: number; attention: number; completed: number } {
  let urgent = 0
  let attention = 0
  let completed = 0
  for (const edge of edges) {
    if (edge.priority === 'error') urgent += 1
    else if (edge.priority === 'needs-input') attention += 1
    else if (edge.priority === 'completed') completed += 1
  }
  return { urgent, attention, completed }
}

/**
 * Schedule manager wakeups over the mux's pending edges.
 *
 * One instance per manager service. It owns at most one timer; every
 * notification recomputes the earliest allowed delivery and re-arms the timer,
 * so the service never needs another unrelated event to make progress.
 */
export class WakeScheduler {
  private readonly timings: WakeTimings
  private timer: unknown = null
  private lastWakeAt = 0
  private nextAt: number | undefined
  private urgentTimes: number[]
  private batchTimes: number[]
  private failures = 0
  private suppressed = 0
  private lastSuppressedResetAt = 0
  private error: string | undefined
  private disposed = false
  private delivering = false
  /** Force the next delivery as soon as possible (manual "now"). */
  private manual = false

  /** @param deps - injected clock, timers and delivery collaborators. */
  constructor(private readonly deps: WakeSchedulerDeps) {
    this.timings = { ...DEFAULT_WAKE_TIMINGS, ...deps.timings }
    this.lastWakeAt = deps.initial?.lastWakeAt ?? 0
    this.urgentTimes = [...(deps.initial?.urgentTimes ?? [])].filter(at => Number.isFinite(at)).slice(-64)
    this.batchTimes = [...(deps.initial?.batchTimes ?? [])].filter(at => Number.isFinite(at)).slice(-64)
  }

  /**
   * Recompute the next delivery after new edges (or time) arrived.
   * @param now - injectable clock.
   */
  notify(now = this.deps.now()): void {
    this.reconcile(now, false)
  }

  /**
   * Deliver as soon as the manager is idle, bypassing debounce and budget.
   * Used by the panel's "立即汇总" button; a running manager defers the wake.
   */
  requestNow(now = this.deps.now()): void {
    if (this.disposed || !this.deps.isEnabled()) return
    this.reconcile(now, true)
  }

  /**
   * Turn automatic wakeups on or off. Disabling cancels the pending timer.
   * @param enabled - new opt-in value.
   */
  setEnabled(enabled: boolean): void {
    if (this.disposed) return
    if (!enabled) {
      this.clearTimer()
      this.nextAt = undefined
      this.error = undefined
      return
    }
    this.reconcile(this.deps.now(), false)
  }

  /** Snapshot for the state view. */
  status(now = this.deps.now()): WakeStatus {
    const { edges } = this.deps.pending()
    const counts = countByClass(edges)
    this.trim(now)
    return {
      enabled: this.deps.isEnabled(),
      pending: counts.urgent + counts.attention + counts.completed,
      ...counts,
      wakesThisHour: this.urgentTimes.length + this.batchTimes.length,
      suppressed: this.suppressed,
      ...(this.lastWakeAt > 0 ? { lastWakeAt: this.lastWakeAt } : {}),
      ...(this.nextAt === undefined ? {} : { nextAt: this.nextAt }),
      ...(this.error === undefined ? {} : { error: this.error }),
    }
  }

  /** Persisted throttle state (hydrated again through `initial`). */
  exportState(): { lastWakeAt?: number; urgentTimes: number[]; batchTimes: number[] } {
    return {
      ...(this.lastWakeAt > 0 ? { lastWakeAt: this.lastWakeAt } : {}),
      urgentTimes: [...this.urgentTimes],
      batchTimes: [...this.batchTimes],
    }
  }

  /** Cancel the timer; the plugin unload path. */
  dispose(): void {
    this.disposed = true
    this.clearTimer()
  }

  /** Drop wake timestamps older than one hour. */
  private trim(now: number): void {
    const cutoff = now - HOUR_MS
    while (this.urgentTimes.length > 0 && (this.urgentTimes[0] as number) <= cutoff) this.urgentTimes.shift()
    while (this.batchTimes.length > 0 && (this.batchTimes[0] as number) <= cutoff) this.batchTimes.shift()
  }

  /** Wakes used by one budget class in the rolling hour. */
  private used(kind: WakeClass, now: number): number {
    this.trim(now)
    return kind === 'completed' ? this.batchTimes.length : this.urgentTimes.length
  }

  /** Budget of one class in the rolling hour. */
  private budget(kind: WakeClass): number {
    return kind === 'completed' ? this.timings.batchBudgetPerHour : this.timings.urgentBudgetPerHour
  }

  /** Present classes, highest severity first. */
  private presentClasses(edges: readonly MuxEdge[]): WakeClass[] {
    const classes: WakeClass[] = []
    if (edges.some(edge => edge.priority === 'error')) classes.push('urgent')
    if (edges.some(edge => edge.priority === 'needs-input')) classes.push('attention')
    if (edges.some(edge => edge.priority === 'completed')) classes.push('completed')
    return classes
  }

  /** First present class with remaining budget, or null when everything is capped. */
  private classWithBudget(edges: readonly MuxEdge[], now: number): WakeClass | null {
    for (const kind of this.presentClasses(edges)) {
      if (this.used(kind, now) < this.budget(kind)) return kind
    }
    return null
  }

  /** Delay before one class is delivered. */
  private delayFor(kind: WakeClass): number {
    if (kind === 'urgent') return this.timings.urgentDelayMs
    if (kind === 'attention') return this.timings.attentionDelayMs
    return this.timings.completedDelayMs
  }

  /**
   * Compute the next allowed delivery and arm the timer. Delivery runs inline
   * when the computed time is already due.
   * @param now - injectable clock.
   * @param force - manual request: bypass debounce and budget.
   */
  private reconcile(now: number, force: boolean): void {
    this.clearTimer()
    this.manual = force
    if (this.disposed || !this.deps.isEnabled()) {
      this.nextAt = undefined
      return
    }
    const { edges } = this.deps.pending()
    if (classOf(edges) === null) {
      this.nextAt = undefined
      this.manual = false
      return
    }
    if (this.delivering) {
      this.nextAt = now + BUSY_RETRY_MS
      this.arm(BUSY_RETRY_MS)
      return
    }
    if (this.deps.hasManager !== undefined && !this.deps.hasManager()) {
      // Nothing to wake yet; `ensure()` notifies again once the session exists.
      this.nextAt = undefined
      return
    }
    if (!this.deps.canDeliver()) {
      this.nextAt = now + BUSY_RETRY_MS
      this.arm(BUSY_RETRY_MS)
      return
    }
    const kind = force ? (classOf(edges) as WakeClass) : this.classWithBudget(edges, now)
    if (kind === null) {
      // Every present class is over budget: wait for an old wake to age out.
      const oldest = [...this.urgentTimes, ...this.batchTimes].reduce<number | undefined>(
        (min, at) => (min === undefined || at < min ? at : min), undefined)
      const resetAt = (oldest === undefined ? now + HOUR_MS : oldest + HOUR_MS) + 1
      if (this.lastSuppressedResetAt !== resetAt) {
        this.lastSuppressedResetAt = resetAt
        this.suppressed += 1
      }
      this.nextAt = resetAt
      this.arm(Math.max(1, resetAt - now))
      return
    }
    const at = force
      ? now
      : Math.max(now + this.delayFor(kind), this.lastWakeAt > 0 ? this.lastWakeAt + this.timings.minGapMs : 0)
    this.nextAt = at
    if (at <= now) {
      this.nextAt = undefined
      void this.fire(now, force)
      return
    }
    this.arm(at - now)
  }

  /** Arm the one timer, replacing any previous one. */
  private arm(delayMs: number): void {
    this.timer = this.deps.schedule(() => {
      this.timer = null
      const fireAt = this.deps.now()
      void this.fire(fireAt, this.manual)
    }, Math.max(1, delayMs))
  }

  /** Cancel the one timer. */
  private clearTimer(): void {
    if (this.timer !== null) {
      this.deps.cancel(this.timer)
      this.timer = null
    }
  }

  /**
   * Deliver the pending bundle and acknowledge it only on success. The mux is
   * acknowledged by the caller through {@link WakeSchedulerDeps.deliver}; a
   * false result keeps the edges queued for the backoff retry.
   * @param now - delivery time.
   * @param force - manual request.
   */
  private async fire(now: number, force: boolean): Promise<void> {
    if (this.disposed || this.delivering) return
    if (!this.deps.isEnabled()) return
    if (this.deps.hasManager !== undefined && !this.deps.hasManager()) {
      this.nextAt = undefined
      return
    }
    if (!this.deps.canDeliver()) {
      this.nextAt = now + BUSY_RETRY_MS
      this.arm(BUSY_RETRY_MS)
      return
    }
    const pending = this.deps.pending()
    if (classOf(pending.edges) === null) {
      this.nextAt = undefined
      return
    }
    if (!force && this.classWithBudget(pending.edges, now) === null) {
      this.reconcile(now, false)
      return
    }
    this.delivering = true
    this.manual = false
    let delivered = false
    try {
      delivered = await this.deps.deliver(pending.edges, pending.dropped)
      if (this.disposed) return
      if (delivered) {
        this.lastWakeAt = now
        const kind = deliveredClass(pending.edges)
        if (kind === 'completed') this.batchTimes.push(now)
        else this.urgentTimes.push(now)
        this.trim(now)
        this.failures = 0
        this.error = undefined
        this.suppressed = 0
        this.lastSuppressedResetAt = 0
        this.deps.onDelivered?.(now, pending.edges)
      } else {
        this.failures += 1
        this.error = 'DELIVERY_FAILED'
        const backoff = Math.min(this.timings.maxRetryBackoffMs, this.timings.retryBackoffMs * 2 ** (this.failures - 1))
        this.deps.onError?.(`manager digest delivery failed (attempt ${this.failures})`)
        this.nextAt = now + backoff
        this.arm(backoff)
      }
    } finally {
      this.delivering = false
    }
    // A failed delivery keeps its own backoff timer; reconciling would replace
    // it with the normal debounce and retry too eagerly.
    if (!this.disposed && delivered) this.reconcile(this.deps.now(), false)
  }
}
