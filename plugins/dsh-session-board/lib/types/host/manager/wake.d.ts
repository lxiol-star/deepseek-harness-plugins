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
import type { MuxEdge } from './mux.ts';
/** Tunables of {@link WakeScheduler}. */
export interface WakeTimings {
    /** Debounce before an error digest. */
    urgentDelayMs: number;
    /** Debounce before a "waiting for input" digest. */
    attentionDelayMs: number;
    /** Batch window for completed turns. */
    completedDelayMs: number;
    /** Minimum gap between any two automatic wakes. */
    minGapMs: number;
    /** Urgent + attention wakes allowed in a rolling hour. */
    urgentBudgetPerHour: number;
    /** Completion wakes allowed in a rolling hour. */
    batchBudgetPerHour: number;
    /** First retry delay after a failed delivery. */
    retryBackoffMs: number;
    /** Cap of the exponential delivery backoff. */
    maxRetryBackoffMs: number;
}
/** Default cadence: fast for failures, calm for completions. */
export declare const DEFAULT_WAKE_TIMINGS: WakeTimings;
/** The severity class of one pending bundle. */
export type WakeClass = 'urgent' | 'attention' | 'completed';
/** Wire/UI view of the scheduler. */
export interface WakeStatus {
    enabled: boolean;
    /** Pending edges that would wake the manager (progress edges excluded). */
    pending: number;
    /** Pending edges that would wake the manager. */
    urgent: number;
    attention: number;
    completed: number;
    lastWakeAt?: number;
    nextAt?: number;
    /** Automatic wakes in the current rolling hour. */
    wakesThisHour: number;
    /** Times the hourly budget suppressed a wake since the last delivery. */
    suppressed: number;
    /** Last delivery failure, if any. */
    error?: string;
}
/** Collaborators of {@link WakeScheduler}; every side effect is injected. */
export interface WakeSchedulerDeps {
    /** Injectable clock. */
    now(): number;
    /** One-shot timer; returns an opaque handle for {@link cancel}. */
    schedule(callback: () => void, delayMs: number): unknown;
    /** Cancel a handle returned by {@link schedule}. */
    cancel(handle: unknown): void;
    /** Whether the user opted in. */
    isEnabled(): boolean;
    /** Whether a manager session has been provisioned at all. */
    hasManager?(): boolean;
    /** Whether a manager digest can be injected right now (session exists, agent not running). */
    canDeliver(): boolean;
    /** Pending edges plus drops since the last successful delivery. */
    pending(): {
        edges: MuxEdge[];
        dropped: number;
    };
    /**
     * Inject one digest.
     * @param edges - edges to describe (already bounded).
     * @param dropped - dropped-edge count to mention.
     * @returns true only when the prompt was accepted.
     */
    deliver(edges: readonly MuxEdge[], dropped: number): Promise<boolean>;
    /** Called after a successful delivery, before the next reconcile. */
    onDelivered?(at: number, edges: readonly MuxEdge[]): void;
    /** Contained delivery diagnostics. */
    onError?(message: string): void;
    /** Overrides for tests/deployments. */
    timings?: Partial<WakeTimings>;
    /** Persisted throttle state from the previous host run. */
    initial?: {
        lastWakeAt?: number;
        urgentTimes?: readonly number[];
        batchTimes?: readonly number[];
    };
}
/**
 * Schedule manager wakeups over the mux's pending edges.
 *
 * One instance per manager service. It owns at most one timer; every
 * notification recomputes the earliest allowed delivery and re-arms the timer,
 * so the service never needs another unrelated event to make progress.
 */
export declare class WakeScheduler {
    private readonly deps;
    private readonly timings;
    private timer;
    private lastWakeAt;
    private nextAt;
    private urgentTimes;
    private batchTimes;
    private failures;
    private suppressed;
    private lastSuppressedResetAt;
    private error;
    private disposed;
    private delivering;
    /** Force the next delivery as soon as possible (manual "now"). */
    private manual;
    /** @param deps - injected clock, timers and delivery collaborators. */
    constructor(deps: WakeSchedulerDeps);
    /**
     * Recompute the next delivery after new edges (or time) arrived.
     * @param now - injectable clock.
     */
    notify(now?: number): void;
    /**
     * Deliver as soon as the manager is idle, bypassing debounce and budget.
     * Used by the panel's "立即汇总" button; a running manager defers the wake.
     */
    requestNow(now?: number): void;
    /**
     * Turn automatic wakeups on or off. Disabling cancels the pending timer.
     * @param enabled - new opt-in value.
     */
    setEnabled(enabled: boolean): void;
    /** Snapshot for the state view. */
    status(now?: number): WakeStatus;
    /** Persisted throttle state (hydrated again through `initial`). */
    exportState(): {
        lastWakeAt?: number;
        urgentTimes: number[];
        batchTimes: number[];
    };
    /** Cancel the timer; the plugin unload path. */
    dispose(): void;
    /** Drop wake timestamps older than one hour. */
    private trim;
    /** Wakes used by one budget class in the rolling hour. */
    private used;
    /** Budget of one class in the rolling hour. */
    private budget;
    /** Present classes, highest severity first. */
    private presentClasses;
    /** First present class with remaining budget, or null when everything is capped. */
    private classWithBudget;
    /** Delay before one class is delivered. */
    private delayFor;
    /**
     * Compute the next allowed delivery and arm the timer. Delivery runs inline
     * when the computed time is already due.
     * @param now - injectable clock.
     * @param force - manual request: bypass debounce and budget.
     */
    private reconcile;
    /** Arm the one timer, replacing any previous one. */
    private arm;
    /** Cancel the one timer. */
    private clearTimer;
    /**
     * Deliver the pending bundle and acknowledge it only on success. The mux is
     * acknowledged by the caller through {@link WakeSchedulerDeps.deliver}; a
     * false result keeps the edges queued for the backoff retry.
     * @param now - delivery time.
     * @param force - manual request.
     */
    private fire;
}
