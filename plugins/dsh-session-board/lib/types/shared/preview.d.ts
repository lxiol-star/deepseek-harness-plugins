/**
 * Bounded text previews.
 *
 * Cards show a summary of the latest instruction and the latest produced text,
 * never a transcript, so every preview is compacted to one bounded line here.
 * Truncation is by Unicode code point so a threshold can never split a
 * surrogate pair.
 */
/** Collapse whitespace and trim; returns '' for anything unusable. */
export declare function flattenText(text: unknown): string;
/**
 * One bounded preview line.
 * @param text - raw source text.
 * @param max - maximum code points in the result, ellipsis included.
 * @returns the compacted single line, possibly empty.
 */
export declare function compactPreview(text: unknown, max: number): string;
/**
 * Truncate an error note to a code-point budget. The ellipsis is a truncation
 * signal and is not counted against the budget, so a note at exactly the
 * budget is returned unchanged.
 */
export declare function truncateErrorNote(text: unknown, max: number): string;
/** Pick the last non-blank entry of a preview list, searching backwards. */
export declare function lastNonBlank<T>(items: readonly T[] | null | undefined, read: (item: T) => unknown): string;
