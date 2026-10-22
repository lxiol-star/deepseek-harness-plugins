/**
 * Pure formatting helpers for the fleet tok/s readout.
 *
 * The readout shows an exact integer with grouped thousands (`12,840`); it never
 * abbreviates to `k`/`M`. Keeping the math in this React-free module makes the
 * rule directly testable.
 *
 * @module dsh-whale-effort/client/effects/format
 */

/**
 * Format a token rate as an exact integer with grouped thousands.
 * @param value - the sampled tokens per second; non-finite or negative values
 *   are rendered as `0` instead of leaking `NaN` into the UI.
 * @returns the grouped integer, e.g. `12,840`.
 */
export function formatRateInteger(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
  return safe.toLocaleString('en-US')
}

/**
 * Whether the readout has nothing to show.
 * @param total - the numeric value the readout would render.
 * @returns `true` when the value is missing, non-finite or non-positive.
 */
export function rateIsIdle(total: number): boolean {
  return !(Number.isFinite(total) && total > 0)
}
