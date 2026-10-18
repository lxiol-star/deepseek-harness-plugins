/**
 * Bounded text previews.
 *
 * Cards show a summary of the latest instruction and the latest produced text,
 * never a transcript, so every preview is compacted to one bounded line here.
 * Truncation is by Unicode code point so a threshold can never split a
 * surrogate pair.
 */

/** Collapse whitespace and trim; returns '' for anything unusable. */
export function flattenText(text: unknown): string {
  if (typeof text !== 'string') return ''
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * One bounded preview line.
 * @param text - raw source text.
 * @param max - maximum code points in the result, ellipsis included.
 * @returns the compacted single line, possibly empty.
 */
export function compactPreview(text: unknown, max: number): string {
  const flat = flattenText(text)
  if (flat === '') return ''
  const limit = Math.max(1, Math.floor(max))
  const points = Array.from(flat)
  if (points.length <= limit) return flat
  // A one-code-point budget cannot hold both a character and the elision
  // marker, so the marker is the whole preview.
  if (limit === 1) return '…'
  return `${points.slice(0, limit - 1).join('').trimEnd()}…`
}

/** Elision marker appended to a truncated error note. */
const ELLIPSIS = '…'

/**
 * Truncate an error note to a code-point budget. The ellipsis is a truncation
 * signal and is not counted against the budget, so a note at exactly the
 * budget is returned unchanged.
 */
export function truncateErrorNote(text: unknown, max: number): string {
  const flat = flattenText(text)
  if (flat === '') return ''
  const limit = Math.max(1, Math.floor(max))
  const points = Array.from(flat)
  if (points.length <= limit) return flat
  return points.slice(0, limit).join('') + ELLIPSIS
}

/** Pick the last non-blank entry of a preview list, searching backwards. */
export function lastNonBlank<T>(items: readonly T[] | null | undefined, read: (item: T) => unknown): string {
  if (!Array.isArray(items)) return ''
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const value = flattenText(read(items[index] as T))
    if (value !== '') return value
  }
  return ''
}
