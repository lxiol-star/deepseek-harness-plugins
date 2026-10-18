/**
 * The three-state classification. This is the single place the panel decides
 * what "needs you" means; both the docked column and the fullscreen board read
 * its output, and it is covered directly by unit tests.
 *
 * The rules follow the DSH client's own model (`SessionStatus.running` /
 * `pendingInteraction` / `completionUnread`) and add the host half's durable
 * acknowledgement cursor on top:
 *
 *   1. a pending interaction always wins, even while the session is running —
 *      the agent cannot proceed, so it is the human's turn;
 *   2. otherwise a running session is in progress;
 *   3. otherwise an unacknowledged turn end is attention (an `error` end is
 *      flagged), using the durable timestamp so it survives a restart;
 *   4. otherwise the client-local `completionUnread` flag is the fallback, so
 *      the panel still works when the host half is unavailable;
 *   5. otherwise the session is done.
 */
import type { AttentionKind, BoardGroupId, BoardState } from './types.ts'

/** Inputs to one classification. */
export interface ClassifyInput {
  /** `SessionStatus.running`; undefined until a baseline establishes it. */
  running: boolean | undefined
  /** Whether a pending user interaction exists for this session. */
  pendingInteraction: boolean
  /** `SessionStatus.completionUnread`. */
  completionUnread: boolean
  /** Host-registered time of the last turn end, or null. */
  ackLastTurnEnd: number | null
  /** Host-registered time the user acknowledged that turn end, or null. */
  ackAckedAt: number | null
  /** Host-registered end reason of the last turn, or null. */
  ackLastTurnEndKind: string | null
  /** Timestamp observed for the interaction, when the caller knows it. */
  pendingSince?: number | null
  /** Timestamp this client first saw the unread flag; the local fallback key. */
  unreadSince?: number | null
}

/** The classification of one session. */
export interface ClassifyResult {
  state: BoardState
  group: BoardGroupId
  attentionKind: AttentionKind | null
  /** The attention sort key: how long this card has waited. */
  waitSince: number | null
}

/** The group a visual state belongs to. */
export function groupOf(state: BoardState): BoardGroupId {
  switch (state) {
    case 'blocked':
    case 'error':
    case 'unread':
      return 'attention'
    case 'running':
      return 'running'
    case 'done':
      return 'done'
  }
}

/** Whether a durable turn end is still unacknowledged. */
export function isUnacked(lastTurnEnd: number | null, ackedAt: number | null): boolean {
  if (lastTurnEnd === null) return false
  return ackedAt === null || lastTurnEnd > ackedAt
}

/** Classify one session. */
export function classify(input: ClassifyInput): ClassifyResult {
  // 1. A pending interaction outranks everything: the agent is blocked on the
  //    human even when the agent's own status still reads "running".
  if (input.pendingInteraction) {
    return {
      state: 'blocked',
      group: 'attention',
      attentionKind: 'blocked',
      waitSince: input.pendingSince ?? null,
    }
  }

  // 2. Running.
  if (input.running === true) {
    return { state: 'running', group: 'running', attentionKind: null, waitSince: null }
  }

  // 3. Durable, restart-surviving unacknowledged turn end.
  if (isUnacked(input.ackLastTurnEnd, input.ackAckedAt)) {
    const isError = input.ackLastTurnEndKind === 'error'
    return {
      state: isError ? 'error' : 'unread',
      group: 'attention',
      attentionKind: isError ? 'error' : 'unread',
      waitSince: input.ackLastTurnEnd,
    }
  }

  // 4. Client-local fallback: a stop observed while this session was not the
  //    main view, and the user has not looked at it since.
  const locallyAcknowledged = input.ackAckedAt !== null && input.unreadSince != null && input.ackAckedAt >= input.unreadSince
  if (input.completionUnread && input.ackLastTurnEnd === null && !locallyAcknowledged) {
    return {
      state: 'unread',
      group: 'attention',
      attentionKind: 'unread',
      waitSince: input.unreadSince ?? null,
    }
  }

  // 5. Everything else is idle or acknowledged.
  return { state: 'done', group: 'done', attentionKind: null, waitSince: null }
}

/** Attention sub-classes, most urgent first. */
const ATTENTION_RANK: Record<AttentionKind, number> = { blocked: 0, error: 1, unread: 2 }

/** Rank of an attention kind; non-attention states sort last. */
export function attentionRank(kind: AttentionKind | null): number {
  return kind === null ? 3 : ATTENTION_RANK[kind]
}
