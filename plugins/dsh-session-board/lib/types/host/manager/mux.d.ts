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
    /** Sources whose events never become levels or edges (the manager session). */
    private readonly ignored;
    private revision;
    private seq;
    private dropped;
    /** Drops accumulated since the last delivered digest; reported once, then reset. */
    private droppedSinceDrain;
    /**
     * Stop folding one source (its own level and queued edges are dropped).
     * Used for the manager session so a digest cannot wake the manager again.
     * @param sessionId - source session id.
     */
    ignore(sessionId: string): void;
    /** Whether one source is ignored. */
    isIgnored(sessionId: string): boolean;
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
     * Read the pending edges a wakeup would deliver, highest priority first.
     * The list is not consumed: the caller acknowledges only after a successful
     * `session.prompt`, so a failed delivery can be retried.
     * @param maxItems - upper bound of returned edges.
     * @returns up to `maxItems` pending edges plus drops since the last digest.
     */
    pendingForWake(maxItems?: number): {
        edges: MuxEdge[];
        dropped: number;
    };
    /**
     * Mark delivered edges consumed. Called only after the manager prompt
     * succeeded, so a failure leaves the queue intact for the retry.
     * @param keys - edge keys that were delivered.
     */
    acknowledge(keys: readonly string[]): void;
    /**
     * Manager digest text for one delivery (does not touch the queue).
     * @param edges - edges returned by {@link pendingForWake}.
     * @param dropped - how many edges the bounded queue dropped since the last digest.
     * @returns the digest text, or '' when there is nothing to say.
     */
    digest(edges: readonly MuxEdge[], dropped?: number): string;
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
