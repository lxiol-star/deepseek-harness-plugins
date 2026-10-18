import type { BoardEntry, BoardFeed, BoardSessionInput } from './types.ts';
/** Preview budgets, in code points. */
export declare const DEFAULT_INSTRUCTION_MAX = 120;
export declare const DEFAULT_ACTIVITY_MAX = 120;
export declare const DEFAULT_ERROR_MAX = 160;
/** Options for one board build. */
export interface BuildBoardOptions {
    /** Wall clock for this frame; elapsed figures are derived against it. */
    now: number;
    /** Durable host state. */
    feed: BoardFeed;
    /**
     * Local time this client first observed an unread stop for a session. Used
     * only for the host-less fallback, where nothing durable supplies a key.
     */
    unreadSinceOf?: ((id: string) => number | null) | undefined;
    /** Local time a pending interaction was first observed for a session. */
    pendingSinceOf?: ((id: string) => number | null) | undefined;
    instructionMax?: number | undefined;
    activityMax?: number | undefined;
    errorMax?: number | undefined;
}
/** Derive one card from one session. */
export declare function buildEntry(input: BoardSessionInput, options: BuildBoardOptions): BoardEntry;
/** Derive every card. Ordering is applied separately by the order layer. */
export declare function buildBoard(inputs: readonly BoardSessionInput[], options: BuildBoardOptions): BoardEntry[];
