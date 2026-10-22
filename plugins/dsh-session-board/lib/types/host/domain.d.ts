import { type WikiConfig } from '../shared/wiki.ts';
/**
 * The slice of a schema object the storage layer actually uses.
 *
 * `parse` receives a raw stored record and returns the value callers see;
 * throwing is what marks a record invalid. The implementations below normalize
 * instead of throwing, because these records are derived facts: a corrupt
 * record costs one card's badge, never the domain's availability.
 */
export interface RecordSchema<T> {
    parse(value: unknown): T;
}
/** One table declaration, matching `DomainTableSpec` structurally. */
export interface DomainTableSpec<V> {
    readonly valueSchema: RecordSchema<V>;
}
/** One domain declaration, matching `DomainSpec` structurally. */
export interface DomainSpec {
    readonly name: string;
    readonly version: number;
    readonly invalidRecords: 'backup-and-skip';
    readonly tables: Record<string, DomainTableSpec<unknown>>;
}
/** Declare one table. */
export declare function domainTable<V>(schema: RecordSchema<V>): DomainTableSpec<V>;
/**
 * Validate a domain declaration at module load, mirroring the checks the host's
 * own `defineDomain` performs, so a misconfiguration fails loudly here rather
 * than as an `invalid-record` or `version-mismatch` later at `open()`.
 * @param spec - the declaration.
 * @returns the same declaration.
 */
export declare function defineDomain<S extends DomainSpec>(spec: S): S;
/** Domain holding per-session turn-end facts and the acknowledged cursor. */
export declare const ACK_DOMAIN_NAME = "dsh_session_board";
/** Domain holding per-session busy accounting. */
export declare const TURN_DOMAIN_NAME = "dsh_session_board_turns";
/** Domain holding board-wide preferences (independent from the session fact stores). */
export declare const PREFS_DOMAIN_NAME = "dsh_session_board_prefs";
/** Table of {@link ACK_DOMAIN_NAME}: session id → turn-end facts + ack cursor. */
export declare const ACK_TABLE_NAME = "acks";
/** Table of {@link TURN_DOMAIN_NAME}: session id → busy accounting. */
export declare const TURN_TABLE_NAME = "turn_stats";
/** Table of {@link PREFS_DOMAIN_NAME}: preference key → stored value. */
export declare const PREFS_TABLE_NAME = "prefs";
/** Domain holding the saved Wiki configuration (one record). */
export declare const WIKI_DOMAIN_NAME = "dsh_session_board_wiki";
/** Table of {@link WIKI_DOMAIN_NAME}: the single wiki config record. */
export declare const WIKI_TABLE_NAME = "config";
/**
 * Truncation budget for a stored error note, counted in Unicode code points.
 * A provider error can be thousands of characters of stack-adjacent prose; the
 * card shows one line, and the durable record must stay proportional to that.
 */
export declare const ERROR_NOTE_MAX = 160;
/**
 * Collapse one error message into a single-line note of at most `max` code
 * points, appending `…` when anything was dropped.
 *
 * Whitespace runs collapse because the note renders on one card line, and the
 * cut walks code points (not UTF-16 units) so it can never split a surrogate
 * pair — which is also why the ellipsis is appended outside the budget.
 * @param text - Raw error text as it appeared on the event.
 * @param max - Code-point budget; defaults to {@link ERROR_NOTE_MAX}.
 * @returns The collapsed, bounded note.
 */
export declare function truncateErrorNote(text: string, max?: number): string;
/**
 * Stored turn-end record shape.
 *
 * Every field is written on every write and read back through `?? null`, so the
 * shape handed to the client is always complete. Structurally compatible with
 * the shared `BoardAckRecord` (whose fields are optional on the wire).
 */
export interface StoredAckRecord {
    lastTurnEnd: number | null;
    lastTurnEndKind: string | null;
    lastTurnEndError: string | null;
    ackedAt: number | null;
}
/**
 * Stored busy-accounting shape; see the shared `BoardTurnStats` for semantics.
 *
 * `openWaitKeys` and `lastEventAt` were added after the first release. A record
 * written before they existed parses with both as null, and the ledger treats
 * that as "no known open set" / "no known activity bound" rather than as an
 * error, so the domain never needs a version bump for the extension.
 */
export interface StoredTurnRecord {
    busyMs: number | null;
    openTurnStart: number | null;
    waitedMs: number | null;
    openWaitStart: number | null;
    openWaitKind: string | null;
    openWaitId: string | null;
    openWaitKeys: string[] | null;
    lastEventAt: number | null;
}
/**
 * Stored synthesis preference.
 *
 * Both fields are either a route part or null together; a half-filled or
 * malformed record normalizes to the null/null fallback instead of failing the
 * domain open. This is a preference, not a durable fact: losing it costs one
 * re-selection, never a card.
 */
export interface StoredSynthesisPrefRecord {
    model: string | null;
    provider: string | null;
    /** Saved reasoning effort of the route; absent in 0.3.2 records parses as null. */
    reasoningEffort: string | null;
}
/**
 * Authoritative facts: small, written on every turn boundary.
 *
 * `backup-and-skip` is the right policy for records whose loss costs one card's
 * badge rather than the domain's availability; the normalizing validators above
 * mean it should rarely be reached at all.
 */
export declare const ackDomainSpec: {
    name: string;
    version: number;
    invalidRecords: "backup-and-skip";
    tables: {
        acks: DomainTableSpec<StoredAckRecord>;
    };
};
/**
 * Busy accounting lives in its own domain so a future shape change (extra
 * timers, `per-record` layout) never touches the authoritative acks medium.
 */
export declare const turnDomainSpec: {
    name: string;
    version: number;
    invalidRecords: "backup-and-skip";
    tables: {
        turn_stats: DomainTableSpec<StoredTurnRecord>;
    };
};
/**
 * Preferences live in their own domain so a future preference shape (or a
 * write-heavy table) never touches the authoritative session fact stores.
 */
export declare const prefsDomainSpec: {
    name: string;
    version: number;
    invalidRecords: "backup-and-skip";
    tables: {
        prefs: DomainTableSpec<StoredSynthesisPrefRecord>;
    };
};
/** Durable home of the saved Wiki configuration. */
export declare const wikiDomainSpec: {
    name: string;
    version: number;
    invalidRecords: "backup-and-skip";
    tables: {
        config: DomainTableSpec<WikiConfig>;
    };
};
/** One table handle as the storage layer exposes it (only the members used here). */
export interface KvTableLike<V> {
    get(key: string): V | undefined;
    entries(): IterableIterator<[string, V]>;
    put(key: string, value: V): Promise<void>;
    delete(key: string): Promise<boolean>;
}
/** Handle on the `acks` table; keys are session ids. */
export type BoardAckTable = KvTableLike<StoredAckRecord>;
/** Handle on the `turn_stats` table; keys are session ids. */
export type BoardTurnTable = KvTableLike<StoredTurnRecord>;
/** Handle on the `prefs` table; keys are preference names. */
export type BoardPrefsTable = KvTableLike<StoredSynthesisPrefRecord>;
/** Handle on the `config` table; one {@link WikiConfig} record. */
export type BoardWikiTable = KvTableLike<WikiConfig>;
