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
import type { AttentionKind, BoardGroupId, BoardState } from './types.ts';
/** Inputs to one classification. */
export interface ClassifyInput {
    /** `SessionStatus.running`; undefined until a baseline establishes it. */
    running: boolean | undefined;
    /** Whether a pending user interaction exists for this session. */
    pendingInteraction: boolean;
    /** `SessionStatus.completionUnread`. */
    completionUnread: boolean;
    /** Host-registered time of the last turn end, or null. */
    ackLastTurnEnd: number | null;
    /** Host-registered time the user acknowledged that turn end, or null. */
    ackAckedAt: number | null;
    /** Host-registered end reason of the last turn, or null. */
    ackLastTurnEndKind: string | null;
    /** Timestamp observed for the interaction, when the caller knows it. */
    pendingSince?: number | null;
    /** Timestamp this client first saw the unread flag; the local fallback key. */
    unreadSince?: number | null;
}
/** The classification of one session. */
export interface ClassifyResult {
    state: BoardState;
    group: BoardGroupId;
    attentionKind: AttentionKind | null;
    /** The attention sort key: how long this card has waited. */
    waitSince: number | null;
}
/** The group a visual state belongs to. */
export declare function groupOf(state: BoardState): BoardGroupId;
/** Whether a durable turn end is still unacknowledged. */
export declare function isUnacked(lastTurnEnd: number | null, ackedAt: number | null): boolean;
/** Classify one session. */
export declare function classify(input: ClassifyInput): ClassifyResult;
/** Rank of an attention kind; non-attention states sort last. */
export declare function attentionRank(kind: AttentionKind | null): number;
