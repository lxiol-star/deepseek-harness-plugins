/**
 * The host feed subscription.
 *
 * The host half is the only writer of durable acknowledgement and turn facts,
 * and it pushes one full snapshot per change. This file keeps that snapshot,
 * tracks whether the push channel is live, and degrades silently when SSE is
 * unavailable: the panel then falls back to the client's own
 * `completionUnread` signal, which needs no host at all.
 */
import { type BoardFeed } from '../shared/types.ts';
import type { ReadonlyStore } from './store.ts';
import { type ArchivePreview, type ArchiveSummary } from '../shared/archive.ts';
/** Where the host half serves the stream. */
export declare const STREAM_PATH = "/dsh-session-board/stream";
/** Where the host half accepts an acknowledgement. */
export declare const ACK_PATH = "/api/session-board/ack";
export { WIKI_ARCHIVE_PATH } from '../shared/archive.ts';
/** What the panel observes about the host feed. */
export interface BoardFeedState {
    feed: BoardFeed;
    /** Whether the push channel is currently open. */
    online: boolean;
    /** Epoch ms of the last applied snapshot, 0 before the first one. */
    receivedAt: number;
}
/**
 * Parse one wire snapshot. Anything unrecognised is dropped rather than
 * partially applied, so a malformed frame can never corrupt the panel state.
 */
export declare function parseFeed(raw: unknown): BoardFeed | null;
/** The live feed subscription. */
export declare class BoardFeedClient implements ReadonlyStore<BoardFeedState> {
    private state;
    private readonly listeners;
    private source;
    private retryTimer;
    private retryDelay;
    private disposed;
    /** Bound for React. */
    readonly getSnapshot: () => BoardFeedState;
    /** Bound for React. */
    readonly subscribe: (listener: () => void) => (() => void);
    private publish;
    /** Apply a parsed snapshot. */
    apply(feed: BoardFeed): void;
    /** Open the push channel. Reconnects on its own until disposed. */
    start(): void;
    /** Tear the channel down and retry after the current backoff. */
    private reconnect;
    /** Reconnect immediately (used when the page becomes visible again). */
    resume(): void;
    /**
     * Acknowledge one session. The durable write is the host's; locally we move
     * the cursor straight away so the card settles without waiting for a round
     * trip, and the next pushed snapshot is authoritative either way.
     */
    private archiveRequest;
    /**
     * Refuse to start a workflow the running host half does not implement: a
     * browser bundle can be newer than the host it talks to after an upgrade.
     */
    private requireWorkflow;
    previewArchive(sessionIds: readonly string[]): Promise<ArchivePreview>;
    commitArchive(token: string): Promise<ArchiveSummary>;
    ack(sessionId: string): Promise<void>;
    /** Close the channel and stop reconnecting. */
    dispose(): void;
}
