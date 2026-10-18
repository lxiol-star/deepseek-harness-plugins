/**
 * Progress and metric derivation.
 *
 * Every formula here mirrors the one the DSH client itself uses, because the
 * numbers are only useful if they agree with the built-in stats pills:
 *
 *   tokens/s      = sessionStats.decodeTokens / (sessionStats.decodeMs / 1000)
 *   cache hit     = tokenUsage.cacheReadTokens / billed input, where billed
 *                   input is the sum of the three disjoint prompt-side buckets
 *
 * Tokens/s and cache-hit rate are deliberately computed on the client: the
 * host already exposes their operands as session projections, and recomputing
 * them host-side would only add a second, drifting source of truth.
 */
import type { BoardTurnStats, TokenUsageInput } from './types.ts';
/** Output tokens per second, or null while no decode has been measured. */
export declare function tokensPerSecond(decodeTokens: unknown, decodeMs: unknown): number | null;
/** The three disjoint prompt-side billing buckets, summed. */
export declare function billedInputTokens(usage: TokenUsageInput | null): number;
/** Total input tokens presented to the model, cached or not. */
export declare function inputTokens(usage: TokenUsageInput | null): number | null;
/**
 * Cache-hit share of prompt-side input, preformatted.
 *
 * Rounds to an integer while that still reads below 100, then adds the minimum
 * precision that keeps a not-quite-full hit from displaying as a perfect one.
 * A genuine full hit reads `100`; no billed input reads null.
 */
export declare function cacheHitPercent(usage: TokenUsageInput | null): string | null;
/** Rate text: whole numbers from 10 up, one decimal below, matching the shell. */
export declare function formatTokensPerSecond(rate: number | null): string | null;
/** Compact elapsed time: `42s`, `3m07s`, `1h04m`. */
export declare function formatElapsed(ms: number | null): string | null;
/** Relaxation constant of the progress curve, shortened by a faster measured rate. */
export declare function progressHalfLifeSec(rateTokS: number | null): number;
/**
 * Estimated completion of an open turn, 0..1.
 *
 * `t / (t + k)` is monotonic in `t`, stays under 1 forever, and widens with a
 * slower measured rate. It is an estimate of progress, not a known total, and
 * the UI presents it as such.
 */
export declare function progressRatio(elapsedMs: number, rateTokS: number | null): number;
/**
 * Wall time of the currently open turn, with blocking-wait intervals removed.
 *
 * While the session is blocked on the human the figure stops advancing, which
 * is the honest reading: the agent is not working. Returns null when no turn
 * is open.
 */
export declare function openRunElapsedMs(stats: BoardTurnStats | null | undefined, now: number): number | null;
/** Cumulative busy time across the session, including the open turn. */
export declare function totalBusyMs(stats: BoardTurnStats | null | undefined, now: number): number | null;
