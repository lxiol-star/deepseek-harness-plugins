/**
 * Host-side event multiplexer (the "epoll" of the manager panel).
 *
 * Every live place that can need attention — a session turn, an agent status
 * flip, a task-assigned session — is a source identified by a stable string.
 * The mux folds their event streams into two shapes:
 *
 *  - a *level-triggered* snapshot (`snapshot()`) that the panel and the manager
 *    tools read at any time, and
 *  - a *edge-triggered* bounded list of "worth telling the manager" items
 *    (`consumeEdges()`), which the wake policy may turn into one digest.
 *
 * The shape mirrors epoll deliberately: sources are fds, `session/event` is the
 * readiness notification, the priority class is EPOLLPRI, the bounded edge list
 * is the overflow guard, and consuming the list is EPOLLONESHOT. There is no
 * per-event wakeup: one digest per drain.
 *
 * Only durable session facts and agent status are folded here. Live-only
 * waterfalls (`approval/request`, `user-questions/request`) are never touched:
 * a listener that fails to delegate would break the approval chain.
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';
/** One source's level-triggered truth. */
export interface MuxSourceLevel {
    /** Coarse state a panel can render. */
    readonly status: 'idle' | 'running' | 'waiting' | 'error' | 'done';
    /** Last open turn number. */
    readonly turn?: number;
    /** Epoch milliseconds of the last folded event. */
    readonly lastAt: number;
    /** Last `turn/end` reason kind (`completed`, `error`, …). */
    readonly lastKind?: string;
    /** Truncated error note of the last failed turn/tool. */
    readonly lastError?: string;
    /** Truncated assistant preview of the last message. */
    readonly preview?: string;
}
/** Priority of one edge; declaration order is the rank. */
export type MuxPriority = 'needs-input' | 'error' | 'completed' | 'progress';
/** One edge worth a manager digest. */
export interface MuxEdge {
    /** Stable dedupe identity (`session:<id>:turn:<n>` …). */
    readonly key: string;
    /** Source id the edge belongs to. */
    readonly sourceId: string;
    /** Edge family, for display/tests. */
    readonly kind: 'turn-end' | 'tool-error' | 'turn-start' | 'agent-status';
    readonly priority: MuxPriority;
    /** Epoch milliseconds. */
    readonly at: number;
    /** One-line human-readable summary. */
    readonly summary: string;
}
/** Full snapshot handed to the panel/tools. */
export interface MuxSnapshot {
    readonly revision: number;
    readonly sources: Readonly<Record<string, MuxSourceLevel>>;
    readonly edges: readonly MuxEdge[];
}
/** Upper bounds; overflow drops the oldest low-priority edges first. */
export declare const MUX_LIMITS: {
    /** Edges kept per source. */
    readonly perSource: 8;
    /** Edges kept overall. */
    readonly global: 64;
    /** Longest stored error/preview text. */
    readonly textMax: 160;
};
/**
 * The event multiplexer. One instance per plugin fiber; all state is in memory
 * and rebuilt from session logs/registries after a host restart.
 */
export declare class EventMux {
    private readonly levels;
    private readonly edges;
    private revision;
    private seq;
    private dropped;
    /** Drops accumulated since the last drain; reported once, then reset. */
    private droppedSinceDrain;
    /**
     * Fold one committed session event into its source level and edges.
     * @param sessionId - source session id.
     * @param event - the committed durable event.
     * @param now - injectable clock for tests.
     */
    record(sessionId: string, event: SessionEvent, now?: number): void;
    /**
     * Fold one agent status flip. Agent status is live-only; a later session
     * event still wins because it carries the durable truth.
     * @param sessionId - source session id.
     * @param status - agent status.
     * @param now - injectable clock.
     */
    agentStatus(sessionId: string, status: 'idle' | 'running', now?: number): void;
    /** Drop one source (session disposed) together with its queued edges. */
    remove(sessionId: string): void;
    /** Read the level-triggered truth plus the current edge list. */
    snapshot(): MuxSnapshot;
    /**
     * Drain ready edges for one manager digest (EPOLLONESHOT): the caller gets
     * the highest-priority items in reverse-age order and the list is cleared.
     * @param maxItems - upper bound of returned edges.
     * @returns up to `maxItems` edges, urgent first.
     */
    consumeEdges(maxItems?: number): MuxEdge[];
    /**
     * Drain the bounded edge list (EPOLLONESHOT) and report what the queue had
     * to drop since the previous drain. The surplus beyond `maxItems` is a real
     * loss too: it is counted in `stats().dropped` instead of vanishing.
     */
    private drain;
    /** Manager digest text for the edges drained by one wakeup. */
    digest(maxItems?: number): string;
    /** Per-source edge budget: drop the oldest progress edges of that source. */
    private trimSource;
    /** Global edge budget: drop the oldest lowest-priority edges. */
    private trimGlobal;
    private removeBySeq;
    /** Append one bounded edge, deduping an identical live key. */
    private pushEdge;
    /** Observability: counts for tests, logs and the panel footer. */
    stats(): {
        sources: number;
        edges: number;
        dropped: number;
        revision: number;
    };
}
