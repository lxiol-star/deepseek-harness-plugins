/**
 * Grouping and ordering.
 *
 * The requirement this file exists for: a card that needs the human always
 * outranks a card that is merely running, and within the attention group the
 * longest wait comes first. Ordering is a pure function of the derived
 * entries, so it is stable, testable, and cheap enough to run every frame
 * without the list shuffling on unrelated ticks.
 */
import { attentionRank } from './classify.ts'
import type { BoardEntry, BoardGroup, BoardGroupId } from './types.ts'

/** Group presentation order, fixed. */
export const GROUP_ORDER: readonly BoardGroupId[] = ['attention', 'running', 'done']

const GROUP_RANK: Record<BoardGroupId, number> = { attention: 0, running: 1, done: 2 }

/**
 * Ascending comparison that always sorts "unknown" last, so a card without a
 * timestamp never jumps above one that has a real wait behind it.
 */
function ascendingNullable(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

/** Order two entries that already share a group. Falls back to id for stability. */
export function compareWithinGroup(a: BoardEntry, b: BoardEntry): number {
  switch (a.group) {
    case 'attention': {
      // Blocked on the human first, then errors, then merely-unread.
      const rank = attentionRank(a.attentionKind) - attentionRank(b.attentionKind)
      if (rank !== 0) return rank
      // Then longest wait first.
      const wait = ascendingNullable(a.waitSince, b.waitSince)
      if (wait !== 0) return wait
      break
    }
    case 'running': {
      // Longest-running first.
      const started = ascendingNullable(a.runSince, b.runSince)
      if (started !== 0) return started
      break
    }
    case 'done': {
      // Most recently finished first.
      const recent = b.lastActivityAt - a.lastActivityAt
      if (recent !== 0) return recent
      break
    }
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Sort every entry into its final display order. */
export function sortEntries(entries: readonly BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => {
    const group = GROUP_RANK[a.group] - GROUP_RANK[b.group]
    return group !== 0 ? group : compareWithinGroup(a, b)
  })
}

/** Group entries for rendering. Empty groups are still returned, in order. */
export function groupEntries(entries: readonly BoardEntry[]): BoardGroup[] {
  const groups: BoardGroup[] = GROUP_ORDER.map(id => ({ id, entries: [] }))
  const byId = new Map<BoardGroupId, BoardGroup>(groups.map(group => [group.id, group]))
  for (const entry of sortEntries(entries)) byId.get(entry.group)?.entries.push(entry)
  return groups
}
