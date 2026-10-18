/**
 * Wire and view-model types shared by the host half, the client half, and the
 * pure derivation layer. Nothing here imports a DSH package: the shared layer
 * stays dependency-free so it can be unit-tested without a harness.
 */
/** A session identity as it appears on the wire. */
export type SessionIdStr = string;
/** Where a card belongs. Attention always leads. */
export type BoardGroupId = 'attention' | 'running' | 'done';
/** The single visual state that drives a card's halo and badges. */
export type BoardState = 'blocked' | 'error' | 'unread' | 'running' | 'done';
/** Why a card sits in the attention group. */
export type AttentionKind = 'blocked' | 'error' | 'unread';
/**
 * Durable per-session turn facts registered by the host half from
 * `session/event`. `lastTurnEnd > ackedAt` means the turn is unacknowledged.
 * Every field is optional on the wire so a record written by an older build
 * can never fail its stored schema and brick the domain open.
 */
export interface BoardAckRecord {
    lastTurnEnd?: number | null;
    lastTurnEndKind?: string | null;
    lastTurnEndError?: string | null;
    ackedAt?: number | null;
}
/**
 * Durable per-session busy accounting. `openTurnStart` is the start of the
 * turn still open; `openWaitStart`/`waitedMs` let the client subtract
 * blocking-wait intervals from the elapsed figure.
 *
 * New fields are optional and read as null when a record written by an older
 * build lacks them, so extending this shape never invalidates stored state.
 */
export interface BoardTurnStats {
    busyMs?: number | null;
    openTurnStart?: number | null;
    waitedMs?: number | null;
    /**
     * Start of the current *contiguous* union of open blocking waits. Waits can
     * overlap, so this is the earliest still-open wait, not the latest one;
     * `waitedMs` is the union already closed. `now - openWaitStart` therefore
     * measures the whole open union without counting an overlap twice.
     */
    openWaitStart?: number | null;
    /**
     * @deprecated Single-wait mirror of the first entry in `openWaitKeys`, kept
     * so a client built against the pre-union wire shape still reads a value.
     * Use `openWaitKeys` for the authoritative open set.
     */
    openWaitKind?: string | null;
    /** @deprecated See {@link BoardTurnStats.openWaitKind}. */
    openWaitId?: string | null;
    /**
     * Opaque keys of the blocking waits currently open, each encoding its kind
     * and request/call id. A wait ends only when its own key is released, and
     * the union interval stays open while any key remains.
     */
    openWaitKeys?: readonly string[] | null;
    /**
     * Epoch ms of the last event this host observed for the session. Restart
     * reconciliation closes a stale open turn at this instant instead of at
     * "now", so time the process spent down is never charged as busy time.
     */
    lastEventAt?: number | null;
}
/** The host half's whole durable state, pushed as one snapshot over SSE. */
export interface BoardFeed {
    acks: Record<SessionIdStr, BoardAckRecord>;
    turns: Record<SessionIdStr, BoardTurnStats>;
}
/** An empty feed, used before the first snapshot arrives. */
export declare const EMPTY_FEED: BoardFeed;
/** Token buckets, all four disjoint. Mirrors the host `tokenUsage` projection. */
export interface TokenUsageInput {
    uncachedInputTokens?: number | undefined;
    outputTokens?: number | undefined;
    cacheReadTokens?: number | undefined;
    cacheWriteTokens?: number | undefined;
}
/** Cumulative session statistics. Mirrors the host `sessionStats` projection. */
export interface SessionStatsInput {
    turns?: number | undefined;
    steps?: number | undefined;
    llmMs?: number | undefined;
    toolMs?: number | undefined;
    decodeMs?: number | undefined;
    decodeTokens?: number | undefined;
}
/** One host-folded turn preview. Mirrors the host `turnOutline` projection. */
export interface TurnOutlineEntryInput {
    turn: number;
    seq?: number;
    prompt?: string;
    response?: string;
}
/**
 * Everything the derivation layer needs about one session, assembled by the
 * client adapter from DSH snapshots. Kept structural (no DSH imports) so the
 * rules can be tested directly.
 */
export interface BoardSessionInput {
    id: SessionIdStr;
    title: string;
    workspaceTitle: string;
    workspaceId?: string;
    workspacePath?: string;
    /** Archived in the DSH client itself (not the plugin's Wiki archive). */
    clientArchived?: boolean;
    isSubagent: boolean;
    parentId: SessionIdStr | null;
    /** `SessionStatus.running`; absent until a baseline establishes it. */
    running: boolean | undefined;
    /** `SessionStatus.pendingInteraction.kind`, or null when none. */
    pendingInteraction: string | null;
    /** `SessionStatus.completionUnread`. */
    completionUnread: boolean;
    /** Whether this session currently holds a `mainView` reference (it is open). */
    retainedMainView: boolean;
    updatedAt: number;
    tokenUsage: TokenUsageInput | null;
    sessionStats: SessionStatsInput | null;
    turnOutline: readonly TurnOutlineEntryInput[] | null;
    runningSubagentCount: number;
    liveJobCount: number;
    liveJobDetails?: readonly string[];
}
/** A card, fully derived. The renderer does no business logic. */
export interface BoardEntry {
    archivedAt?: number;
    id: SessionIdStr;
    title: string;
    workspaceTitle: string;
    workspaceId?: string;
    workspacePath?: string;
    /** Archived in the DSH client itself (not the plugin's Wiki archive). */
    clientArchived?: boolean;
    isSubagent: boolean;
    state: BoardState;
    group: BoardGroupId;
    attentionKind: AttentionKind | null;
    /** Epoch ms the card entered its waiting state; the attention sort key. */
    waitSince: number | null;
    /** Epoch ms the current run started; the running sort key. */
    runSince: number | null;
    /** Epoch ms of the last durable activity; the done sort key. */
    lastActivityAt: number;
    isCurrent: boolean;
    preview: {
        /** Latest user instruction, bounded to one card line. */
        instruction: string;
        /** What the assistant is doing or just produced, bounded. */
        activity: string;
        jobs?: readonly string[];
    };
    progress: {
        /** Current turn number, or null before the first turn. */
        turnN: number | null;
        /** Steps closed so far in the session. */
        stepM: number | null;
        /** Estimated completion of the open turn, 0..1; null when not running. */
        ratio: number | null;
    };
    metrics: {
        /** Elapsed wall time of the open run, waiting time subtracted. */
        elapsedMs: number | null;
        /** Cumulative busy time over the whole session. */
        totalBusyMs: number | null;
        outputTokens: number | null;
        inputTokens: number | null;
        rateTokS: number | null;
        /** Preformatted, because the exact rounding rule is a display decision. */
        cacheHitPct: string | null;
        liveJobs: number;
        runningSubagents: number;
    };
    /** Truncated error text for an `error`-ended turn, else null. */
    errorNote: string | null;
    /**
     * i18n key for the card's status line. Keys rather than copy, so the shared
     * layer stays locale-free and every string still routes through the
     * dictionaries.
     */
    noteKey: string | null;
    /** i18n key describing the pending interaction, or null. */
    pendingKey: string | null;
}
/** One rendered group. */
export interface BoardGroup {
    id: BoardGroupId;
    entries: BoardEntry[];
}
