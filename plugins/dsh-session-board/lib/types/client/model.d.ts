import type { BoardGroup } from '../shared/types.ts';
import type { JobsSnapshot, SessionListState, SessionStatusSnapshot, Source, WorkspaceSnapshot } from './dsh.ts';
import type { BoardFeedState } from './feed.ts';
import type { ReadonlyStore } from './store.ts';
/** The derived state every view renders from. */
export interface BoardModelState {
    /** The three groups, in presentation order, fully derived and sorted. */
    groups: BoardGroup[];
    /** Whether any session is running; the only condition that starts the clock. */
    anyRunning: boolean;
}
/** The sessions service face the model reads. */
export interface BoardModelSessions {
    list: Source<SessionListState>;
}
/** The uiSession service face the model reads. */
export interface BoardModelUiSession {
    sessionStatus: Source<SessionStatusSnapshot>;
}
/** The jobs service face the model reads; `watchRows` is optional. */
export interface BoardModelJobs {
    state: Source<JobsSnapshot>;
    /** Open the roster for one session, returning its release. Optional. */
    watchRows?: ((sessionId: string) => () => void) | undefined;
}
/** The workspaces service face the model reads. */
export interface BoardModelWorkspaces {
    list: Source<WorkspaceSnapshot>;
}
/** Minimal interval scheduler; injectable so the model needs no globals in tests. */
export interface BoardTimers {
    setInterval(handler: () => void, ms: number): unknown;
    clearInterval(handle: unknown): void;
}
/**
 * Minimal document-visibility face. `globalThis.document` structurally
 * satisfies it; tests pass a two-line fake.
 */
export interface BoardVisibility {
    readonly hidden: boolean;
    addEventListener(type: 'visibilitychange', listener: () => void): void;
    removeEventListener(type: 'visibilitychange', listener: () => void): void;
}
/** Everything one model needs. Only the sessions, status and feed sources are required. */
export interface BoardModelOptions {
    sessions: BoardModelSessions;
    uiSession: BoardModelUiSession;
    /**
     * The durable host feed. A `BoardFeedClient` satisfies this, as does any
     * read-only `Source<BoardFeedState>`.
     */
    feed: Source<BoardFeedState>;
    /** The jobs service; absent means no job counts and no roster watching. */
    jobs?: BoardModelJobs | null | undefined;
    /** The workspaces service; absent means no workspace labels. */
    workspaces?: BoardModelWorkspaces | null | undefined;
    /** Wall clock. Defaults to `Date.now`. */
    now?: (() => number) | undefined;
    /** Interval scheduler. Defaults to `globalThis.setInterval`/`clearInterval`. */
    timers?: BoardTimers | undefined;
    /** Visibility source. Defaults to `globalThis.document` when present; `null` disables gating. */
    document?: BoardVisibility | null | undefined;
    /** Tick period in milliseconds. Defaults to 1000. */
    intervalMs?: number | undefined;
}
/** Default tick period: one second, the resolution of every elapsed figure. */
export declare const DEFAULT_INTERVAL_MS = 1000;
/**
 * The board's single external store.
 *
 * Not a hook: one instance is shared by every mounted view, so the derived
 * groups, the first-seen clock, the jobs watchers and the ticker all exist
 * once per plugin, not once per view.
 */
export declare class BoardModel implements ReadonlyStore<BoardModelState> {
    private state;
    private readonly listeners;
    /** Wrapped source releases and other teardown, each callable at most once. */
    private readonly disposers;
    private readonly watchers;
    private readonly seen;
    private readonly options;
    private readonly now;
    private readonly timers;
    private readonly visibility;
    private readonly intervalMs;
    /** Wrapper object so a legal handle of `0`/`null` is still distinguishable from "no timer". */
    private timer;
    private started;
    private disposed;
    private computing;
    private rerun;
    constructor(options: BoardModelOptions);
    /** Bound snapshot reader for `useSyncExternalStore`. */
    readonly getSnapshot: () => BoardModelState;
    /** Bound subscriber for `useSyncExternalStore`. Never fires after `dispose()`. */
    readonly subscribe: (listener: () => void) => (() => void);
    /**
     * Open every source subscription, the visibility listener and the initial
     * derivation. Idempotent; a no-op after `dispose()`.
     */
    start(): void;
    /**
     * Release everything. Terminal and idempotent: a second call, or any late
     * source push, does nothing.
     */
    dispose(): void;
    /** A source changed: re-derive, but never after disposal. */
    private readonly onSourceChange;
    /** The page was shown or hidden: resume or pause the clock. */
    private readonly onVisibilityChange;
    /** The 1s tick; only ever scheduled while something runs and the page is visible. */
    private readonly tick;
    /**
     * Subscribe to one source, preserving its `this` (the method is called on the
     * source, never detached) and wrapping its release for at-most-once disposal.
     */
    private trackSource;
    /** Register a teardown that runs at most once, even across repeated disposes. */
    private track;
    /**
     * Re-derive the whole board from the current source snapshots.
     *
     * `now` is the real wall clock at observation time, not the last tick's
     * value: a first-seen stamp must record when the condition was actually
     * observed, and elapsed figures must be right on a source push too.
     */
    private recompute;
    private recomputeNow;
    /**
     * Keep the jobs roster open for exactly the sessions on screen: running ones
     * and the session currently displayed. The roster is reference-counted
     * host-side, so every watcher that is no longer wanted is released here.
     */
    private syncWatchers;
    /** Release one watcher exactly once. */
    private releaseWatcher;
    /** Start, keep or stop the one-second tick according to run state and visibility. */
    private syncTimer;
    /** Clear the tick if one exists. */
    private stopTimer;
    /** Whether the injected document is currently hidden. */
    private isHidden;
    /** Swap in a new snapshot and wake every listener. */
    private publish;
}
