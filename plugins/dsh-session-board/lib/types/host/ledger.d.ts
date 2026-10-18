/**
 * The durable fact ledger: everything the host half knows about turns, plus
 * the ack cursor, folded from `session/event` and served to the routes.
 *
 * Reads are synchronous (the domain keeps its records in memory); writes are
 * asynchronous and always contained — a failing write is logged through the
 * injected sink and never escapes an event handler.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { BoardFeed } from '../shared/types.ts';
import type { BoardAckTable, BoardTurnTable } from './domain.ts';
/** The turn-end facts one `turn/end` event contributes. */
export interface TurnEndFacts {
    /** Event time (epoch ms); the ordering key for unread/attention. */
    readonly time: number;
    /** `TurnEndReason.kind`, or null when the log carried none. */
    readonly kind: string | null;
    /** Raw error text for an `error` turn (truncated on write), else null. */
    readonly errorMessage: string | null;
}
export interface WaitFacts {
    readonly time: number;
    readonly kind: string;
    readonly id: string | null;
}
/** Collaborators of a {@link BoardLedger}. */
export interface BoardLedgerOptions {
    /** `acks` table of the `dsh_session_board` domain. */
    readonly acks: BoardAckTable;
    /** `turn_stats` table of the `dsh_session_board_turns` domain. */
    readonly turns: BoardTurnTable;
    /** Called after a durable turn/reconciliation write; not called for acks. */
    readonly onChange: () => void;
    /** Containment sink for write failures. */
    readonly warn: (message: string) => void;
    /** Clock; injectable so tests can pin "now". Defaults to `Date.now`. */
    readonly now?: () => number;
}
/**
 * Owns both tables and the ordering of their writes.
 *
 * @remarks
 * The write chain per session is the load-bearing part: `KvTable.put` resolves
 * only after the backend write lands and replaces the in-memory record only
 * then, so two unserialized read-modify-write pairs both read the pre-write
 * record and the later `put` silently reverts the earlier one's field — an ack
 * landing while a turn ends would drop the turn fact (or the ack). Serializing
 * per session removes the interleaving; distinct sessions never contend.
 */
export declare class BoardLedger {
    private readonly acks;
    private readonly turns;
    private readonly onChange;
    private readonly warn;
    private readonly now;
    /** Tail of each session's write chain; entries are dropped once settled. */
    private readonly chains;
    /** @param options - table handles, change hook, containment sink, clock. */
    constructor(options: BoardLedgerOptions);
    /**
     * Record a closed turn. Preserves an existing `ackedAt`: a new turn end must
     * move `lastTurnEnd` past the cursor (so the card reads as unacknowledged),
     * not clear the cursor itself.
     *
     * Always settles any open turn into `busyMs` and clears the wait state — a
     * turn boundary cannot leave a wait interval open, because the wait belonged
     * to the turn that just ended. A duplicate `turn/end` (no open turn) adds no
     * busy time a second time, but still clears stray wait state and advances the
     * activity bound.
     * @param sessionId - Session the event belongs to.
     * @param facts - Turn-end facts off the event.
     */
    recordTurnEnd(sessionId: string, facts: TurnEndFacts): void;
    /**
     * Open a turn's clock. `busyMs` is preserved across turns; `waitedMs` resets
     * because it accumulates only inside the current turn, and `openWaitStart` is
     * cleared because a wait interval cannot outlive the turn that opened it.
     *
     * A repeated `turn/start` while one is already open settles the turn it
     * replaces first, so the earlier interval is not silently dropped. When the
     * new event is older than the open start (a replayed log), the open record is
     * left untouched rather than moving the clock backwards.
     * @param sessionId - Session the event belongs to.
     * @param time - Event time (epoch ms).
     */
    recordTurnStart(sessionId: string, time: number): void;
    /**
     * Open one blocking wait. The union interval is anchored at the first open
     * wait and stays open until every key is released, so a second, overlapping
     * wait is recorded in `openWaitKeys` without restarting the clock.
     *
     * A wait outside an open turn is not charged to any turn; only the activity
     * bound moves, so a later restart still bounds itself by a real event.
     * @param sessionId - Session the event belongs to.
     * @param facts - Wait kind and id off the event.
     */
    recordWaitStart(sessionId: string, facts: WaitFacts): void;
    /**
     * Release one blocking wait. Only the matching key (same kind *and* id) is
     * removed; a result for another tool, a second decision, or an end whose id
     * the record never opened changes nothing but the activity bound.
     *
     * The union interval is folded into `waitedMs` only when the last open key is
     * released, which is what prevents overlapping waits from being counted
     * twice.
     * @param sessionId - Session the event belongs to.
     * @param facts - Wait kind and id off the event.
     */
    recordWaitEnd(sessionId: string, facts: WaitFacts): void;
    /**
     * Move the acknowledged cursor to now, preserving the turn facts.
     *
     * The route that calls this pushes the resulting state frame itself (the
     * caller owns the response it caused), which is why this write does not go
     * through {@link BoardLedgerOptions.onChange}.
     * @param sessionId - Session being acknowledged.
     * @returns true only once the write is durable; false when it failed.
     */
    ack(sessionId: string): Promise<boolean>;
    /**
     * Whole durable state as one wire snapshot. Synchronous and total: absent
     * fields (a record written before a field existed) read as null.
     * @returns the feed pushed to clients.
     */
    snapshot(): BoardFeed;
    /**
     * Close the turns a previous process left open.
     *
     * This process just started, so no recorded open turn can still be running.
     * The fold stops at the record's {@link StoredTurnRecord.lastEventAt} — the
     * last instant this installation is known to have observed activity — rather
     * than at `now`, so the time the process spent down is never charged as busy
     * time. A record written before `lastEventAt` existed carries no such bound;
     * see {@link restartCloseAt} for the conservative fallback.
     * @returns true when at least one record was actually rewritten.
     */
    reconcileOpenTurns(): Promise<boolean>;
    /**
     * The instant a stale open turn may be charged through on restart.
     *
     * Never `now`: the process may have been down for days. A record with a
     * recorded activity bound closes there (clamped to `now` so a skewed future
     * timestamp cannot over-charge). An older record has no bound, so the newest
     * fact that is at least the open start — the ack cursor's `lastTurnEnd` when
     * it is later, else the open start itself — is used. Both fallbacks yield a
     * non-negative interval and therefore charge zero downtime rather than
     * guessing.
     * @param sessionId - Session being reconciled.
     * @param record - Current stored record (open turn).
     * @param openTurnStart - Start of the open turn.
     * @param now - Reconciliation clock reading.
     * @returns the epoch ms to close at.
     */
    private restartCloseAt;
    /**
     * Run one durable write in this session's submission order.
     *
     * A failed predecessor is already reported by this method's own guard, so it
     * must not strand the writes queued behind it (`then(job, job)`).
     * @param sessionId - Session owning the write.
     * @param job - The durable write and its follow-up.
     * @param label - Failure label for the log line.
     * @returns a promise that never rejects, settling once the write finished.
     */
    private enqueue;
}
/**
 * Subscribe the ledger to the session log.
 *
 * Registration stays here (next to the facts it feeds) so `plugin.ts` reads as
 * wiring; `ctx.on` is already effect-scoped and must not be wrapped again.
 * @param ctx - Host plugin context carrying `session/event`.
 * @param ledgerReady - Always-settling handle on the ledger; null means the
 * durable store never opened and turn facts are dropped (the client half still
 * renders from its own projections).
 */
export declare function subscribeBoardLedger(ctx: Context, ledgerReady: Promise<BoardLedger | null>): void;
/** One-line description of a caught value for logs; never throws. */
export declare function describeError(error: unknown): string;
