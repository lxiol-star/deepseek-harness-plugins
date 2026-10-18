/**
 * The card memo boundary, extracted so it can be tested without React.
 *
 * A session card is memoized on a content key rather than on its `BoardEntry`
 * identity: the board rebuilds its entries on every clock tick, so identity
 * changes while the rendered pixels do not. The key must therefore name every
 * field the card actually paints — plus the two props that decide whether a
 * checkbox is painted at all — and nothing else.
 *
 * Nothing here imports React or a `.tsx` module: the comparator is a pure
 * function of plain data, so it runs under the same bare vitest that covers the
 * shared derivation layer.
 */
import type { BoardEntry } from '../shared/types.ts';
/** The props a card's memo boundary compares. */
export interface CardKeyProps {
    entry: BoardEntry;
    selected?: boolean | undefined;
    onToggleSelect?: ((id: string) => void) | undefined;
    /** True while a batch write owns the selection; disables the checkbox. */
    interactionDisabled?: boolean | undefined;
}
/**
 * Everything that can change what one card renders, flattened to one string.
 *
 * The field list is the card's render surface, not the entry's: `runSince`,
 * `lastActivityAt` and `parentId` feed ordering, never paint, so they are
 * deliberately absent. `isSubagent` and `attentionKind` feed a pill and the
 * acknowledge button, so they are deliberately present.
 */
export declare function cardKey(entry: BoardEntry, selected?: boolean, interactionDisabled?: boolean): string;
/**
 * Whether two card prop sets render identically.
 *
 * Handlers are compared by identity, exactly as the memoized component did
 * before: an unstable callback means a stale closure, so a changed reference
 * must re-render even when the entry is unchanged. `selected` and the *presence*
 * of `onToggleSelect` are part of the key because both change the checkbox.
 */
export declare function sameCard(previous: CardKeyProps, next: CardKeyProps): boolean;
