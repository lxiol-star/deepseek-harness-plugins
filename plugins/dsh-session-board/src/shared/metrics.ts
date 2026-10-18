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
import type { BoardTurnStats, TokenUsageInput } from './types.ts'

/** Whether a value is a usable finite number. */
function num(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Output tokens per second, or null while no decode has been measured. */
export function tokensPerSecond(decodeTokens: unknown, decodeMs: unknown): number | null {
  if (!num(decodeTokens) || !num(decodeMs) || decodeMs <= 0) return null
  const rate = decodeTokens / (decodeMs / 1000)
  return Number.isFinite(rate) && rate >= 0 ? rate : null
}

/** The three disjoint prompt-side billing buckets, summed. */
export function billedInputTokens(usage: TokenUsageInput | null): number {
  if (usage === null) return 0
  return (num(usage.uncachedInputTokens) ? usage.uncachedInputTokens : 0)
    + (num(usage.cacheReadTokens) ? usage.cacheReadTokens : 0)
    + (num(usage.cacheWriteTokens) ? usage.cacheWriteTokens : 0)
}

/** Total input tokens presented to the model, cached or not. */
export function inputTokens(usage: TokenUsageInput | null): number | null {
  const billed = billedInputTokens(usage)
  return billed > 0 ? billed : null
}

/**
 * Cache-hit share of prompt-side input, preformatted.
 *
 * Rounds to an integer while that still reads below 100, then adds the minimum
 * precision that keeps a not-quite-full hit from displaying as a perfect one.
 * A genuine full hit reads `100`; no billed input reads null.
 */
export function cacheHitPercent(usage: TokenUsageInput | null): string | null {
  const billed = billedInputTokens(usage)
  if (billed <= 0 || usage === null || !num(usage.cacheReadTokens)) return null
  const share = (usage.cacheReadTokens / billed) * 100
  if (!Number.isFinite(share) || share < 0) return null
  if (share >= 100) return '100'
  if (Math.round(share) < 100) return String(Math.round(share))
  for (let digits = 1; digits <= 2; digits += 1) {
    const rounded = Number(share.toFixed(digits))
    if (rounded < 100) return rounded.toFixed(digits)
  }
  return '99.9'
}

/** Rate text: whole numbers from 10 up, one decimal below, matching the shell. */
export function formatTokensPerSecond(rate: number | null): string | null {
  if (rate === null || !Number.isFinite(rate) || rate < 0) return null
  return rate >= 10 ? String(Math.round(rate)) : String(Math.round(rate * 10) / 10)
}

/** Compact elapsed time: `42s`, `3m07s`, `1h04m`. */
export function formatElapsed(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null
  const total = Math.floor(ms / 1000)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes}m${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}m`
}

/** Relaxation constant of the progress curve, shortened by a faster measured rate. */
export function progressHalfLifeSec(rateTokS: number | null): number {
  const base = 25
  const reference = 40
  const min = 8
  const max = 180
  if (rateTokS === null || !Number.isFinite(rateTokS) || rateTokS <= 0) return reference
  const raw = Math.round((base * reference) / rateTokS)
  return Math.min(max, Math.max(min, raw))
}

/**
 * Estimated completion of an open turn, 0..1.
 *
 * `t / (t + k)` is monotonic in `t`, stays under 1 forever, and widens with a
 * slower measured rate. It is an estimate of progress, not a known total, and
 * the UI presents it as such.
 */
export function progressRatio(elapsedMs: number, rateTokS: number | null): number {
  const seconds = Math.max(0, elapsedMs) / 1000
  const halfLife = progressHalfLifeSec(rateTokS)
  return seconds / (seconds + halfLife)
}

/**
 * Wall time of the currently open turn, with blocking-wait intervals removed.
 *
 * While the session is blocked on the human the figure stops advancing, which
 * is the honest reading: the agent is not working. Returns null when no turn
 * is open.
 */
export function openRunElapsedMs(stats: BoardTurnStats | null | undefined, now: number): number | null {
  const start = stats?.openTurnStart
  if (!num(start)) return null
  let waiting = num(stats?.waitedMs) ? stats.waitedMs : 0
  if (num(stats?.openWaitStart)) waiting += Math.max(0, now - stats.openWaitStart)
  return Math.max(0, now - start - waiting)
}

/** Cumulative busy time across the session, including the open turn. */
export function totalBusyMs(stats: BoardTurnStats | null | undefined, now: number): number | null {
  if (stats === null || stats === undefined) return null
  const closed = num(stats.busyMs) ? stats.busyMs : 0
  const open = openRunElapsedMs(stats, now) ?? 0
  const total = closed + open
  return total > 0 ? total : null
}
