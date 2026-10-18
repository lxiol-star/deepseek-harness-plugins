import type { BoardEntry, BoardGroup, BoardGroupId } from './types.ts';
/** Group presentation order, fixed. */
export declare const GROUP_ORDER: readonly BoardGroupId[];
/** Order two entries that already share a group. Falls back to id for stability. */
export declare function compareWithinGroup(a: BoardEntry, b: BoardEntry): number;
/** Sort every entry into its final display order. */
export declare function sortEntries(entries: readonly BoardEntry[]): BoardEntry[];
/** Group entries for rendering. Empty groups are still returned, in order. */
export declare function groupEntries(entries: readonly BoardEntry[]): BoardGroup[];
