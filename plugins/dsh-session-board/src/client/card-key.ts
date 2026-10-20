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
import type { BoardEntry } from '../shared/types.ts'

/** The props a card's memo boundary compares. */
export interface CardKeyProps {
  entry: BoardEntry
  selected?: boolean | undefined
  onToggleSelect?: ((id: string) => void) | undefined
  /** True while a batch write owns the selection; disables only the checkbox. */
  selectionDisabled?: boolean | undefined
}

/**
 * Elapsed figures are quantized to seconds on purpose: the memo boundary is the
 * second, not the millisecond, so a smooth clock cannot thrash React.
 */
function seconds(value: number | null): string {
  return value === null ? '' : String(Math.floor(value / 1000))
}

/**
 * Everything that can change what one card renders, flattened to one string.
 *
 * The field list is the card's render surface, not the entry's: `runSince`,
 * `lastActivityAt` and `parentId` feed ordering, never paint, so they are
 * deliberately absent. `isSubagent` and `attentionKind` feed a pill and the
 * acknowledge button, so they are deliberately present.
 */
export function cardKey(
  entry: BoardEntry,
  selected = false,
  selectionDisabled = false,
): string {
  return [
    entry.id,
    entry.state,
    entry.group,
    entry.attentionKind ?? '',
    entry.isSubagent ? '1' : '0',
    entry.title,
    entry.workspaceTitle,
    entry.archivedAt ?? '',
    entry.clientArchived === true ? '1' : '0',
    entry.isCurrent ? '1' : '0',
    entry.waitSince ?? '',
    entry.preview.instruction,
    entry.preview.activity,
    entry.errorNote ?? '',
    entry.noteKey ?? '',
    entry.pendingKey ?? '',
    entry.progress.turnN ?? '',
    entry.progress.stepM ?? '',
    entry.progress.ratio === null ? '' : entry.progress.ratio.toFixed(3),
    seconds(entry.metrics.elapsedMs),
    seconds(entry.metrics.totalBusyMs),
    entry.metrics.outputTokens ?? '',
    entry.metrics.inputTokens ?? '',
    entry.metrics.rateTokS === null ? '' : Math.round(entry.metrics.rateTokS),
    entry.metrics.cacheHitPct ?? '',
    entry.metrics.liveJobs,
    entry.metrics.runningSubagents,
    selected ? '1' : '0',
    selectionDisabled ? '1' : '0',
  ].join('\u0001')
}

/**
 * Whether two card prop sets render identically.
 *
 * Handlers are compared by identity, exactly as the memoized component did
 * before: an unstable callback means a stale closure, so a changed reference
 * must re-render even when the entry is unchanged. `selected` and the *presence*
 * of `onToggleSelect` are part of the key because both change the checkbox.
 */
export function sameCard(previous: CardKeyProps, next: CardKeyProps): boolean {
  return previous.onToggleSelect === next.onToggleSelect
    && cardKey(previous.entry, previous.selected === true, previous.selectionDisabled === true)
      === cardKey(next.entry, next.selected === true, next.selectionDisabled === true)
}
