/**
 * Token-rate statistics for a fleet of agents.
 *
 * Pure computation: no timers, no I/O, no module-level mutable state.
 *
 * What is measured
 * - `gen`: estimated generated tokens per second over the recent window, rounded.
 * - `rate`: generated plus billable input tokens per second over the window.
 * - `total`: generated-plus-input tokens accumulated since `reset()`.
 * - `agents`: current member count.
 * - `generating`: members that produced a generated delta within the breath window.
 *
 * Why the accounting works this way (read before changing it)
 *
 * 1. Streaming chunks carry characters, not token counts, so generation rate is
 *    estimated: one CJK code point is about one token, four other characters are
 *    about one token. A `usage` frame carries exact counts but arrives once per
 *    call without a window timestamp. So rates only consume timestamped
 *    estimates, while `total` is calibrated per agent with
 *    `max(estimate, sum of usage.outputTokens)` — taking the max instead of
 *    adding prevents double counting the same tokens.
 * 2. `rate` includes billable input tokens: that is what the user pays for in a
 *    given second. Cached reads are excluded by default (`includeCacheReads`
 *    restores them); cache writes are already inside `inputTokens`.
 * 3. Only members are measured. Non-member chunks are dropped at ingest without
 *    creating state, so they never reach any counter.
 * 4. No timers: window expiry is pruned lazily during ingest and sample. Each
 *    agent keeps only windowed events (bounded by {@link MAX_EVENTS_PER_AGENT}),
 *    and departing members fold their totals into retired buckets, so memory
 *    does not grow with time and `total` still means "since reset()".
 * 5. No path returns NaN, Infinity, or a negative number: every outward count
 *    passes through the same integer coercion.
 *
 * @module dsh-whale-effort/host/metrics
 */
/**
 * Estimate the token count of one text fragment.
 *
 * CJK code points count one token each; every other character costs a quarter
 * token, rounded up per fragment. Iteration is by code point, so surrogate
 * pairs are one character.
 * @param text - model-visible fragment, of any runtime shape.
 * @returns a non-negative integer token estimate.
 */
export declare function estimateTokens(text: unknown): number;
/** One chunk's contribution to the counters. */
interface ChunkDelta {
    /** Estimated generated tokens. */
    readonly gen: number;
    /** Exact output tokens from a usage frame. */
    readonly out: number;
    /** Billable input tokens from a usage frame. */
    readonly input: number;
}
/**
 * Parse one stream chunk into its counter contribution.
 * @param chunk - chunk value from the assistant stream.
 * @param includeCacheReads - whether cached input counts toward input tokens.
 * @returns the delta, or `null` for unknown/malformed/empty frames.
 */
export declare function readChunkDelta(chunk: unknown, includeCacheReads: boolean): ChunkDelta | null;
/** One outward fleet sample. */
export interface FleetSample {
    /** Generated plus input tokens per second over the window. */
    readonly rate: number;
    /** Generated tokens per second over the window. */
    readonly gen: number;
    /** Current member count. */
    readonly agents: number;
    /** Members that generated within the breath window. */
    readonly generating: number;
    /** Accumulated tokens since the last reset. */
    readonly total: number;
}
/** Meter construction options. */
export interface FleetMeterOptions {
    /** Rate window in milliseconds. @default 1500 */
    readonly windowMs?: number;
    /** Breath-light window in milliseconds. @default 800 */
    readonly generatingMs?: number;
    /** Count cached input tokens. @default false */
    readonly includeCacheReads?: boolean;
    /** Clock injection for tests. @default Date.now */
    readonly now?: () => number;
}
/** A fleet meter; one instance owns all of its state. */
export interface FleetMeter {
    /** Replace the member set; ids may be a string, number, or iterable of either. */
    setMembers(ids: Iterable<unknown> | unknown): void;
    /** Record one stream chunk for a member agent; non-members and unknown frames are dropped. */
    ingest(agentId: unknown, chunk: unknown, atMs?: number): void;
    /** Sample the counters, pruning expired window state first. */
    sample(): FleetSample;
    /** Drop all state, including members and retired totals. */
    reset(): void;
    /** Release state; later calls are no-ops and `sample()` returns zeros. */
    dispose(): void;
}
/**
 * Create a fleet meter.
 * @param options - window lengths, cache-read inclusion, and clock injection.
 * @returns the meter.
 */
export declare function createFleetMeter(options?: FleetMeterOptions): FleetMeter;
export {};
