/**
 * The manager panel's client controller.
 *
 * One instance owns everything the drawer renders: the host state mirror
 * (manager identity, durable selection, task board), the local selection and
 * focused workspace, the debounced selection mirror write, and the retained
 * Session reference the embedded official chat consumes.
 *
 * Deliberate boundaries:
 *  - only the drawer-open flag is persisted locally; selection and tasks are
 *    host facts and are re-read on every open, so two windows agree;
 *  - sending is the official client path (`sessions.retain` →
 *    `reference.ready` → `session.prompt`), not a plugin route: the message
 *    must be logged, deduplicated and authenticated by the same path the GUI
 *    composer uses;
 *  - a failed selection mirror write never discards the user's ticks: the
 *    local selection stays authoritative on screen and the next tick re-syncs.
 */
import { type ManagerSelection, type ManagerTaskStatus, type ManagerTaskView, type ManagerWakeStatus } from '../../shared/manager.ts';
import type { RetainSession, SessionListState, SessionReference, Source, WorkspacesService } from '../dsh.ts';
/** localStorage key holding the drawer-open flag; nothing else is persisted. */
export declare const MANAGER_STORE_KEY = "dsh.session-board.manager.v1";
/** Pause between the last tick and the selection mirror write, in milliseconds. */
export declare const MANAGER_SELECTION_DEBOUNCE_MS = 450;
/**
 * Host-state poll period while the drawer is open. The manager Agent creates
 * tasks and answers turns outside this client, so the panel re-reads the host
 * mirror instead of assuming it owns the data. Selection ticks are never
 * clobbered: `applyState` keeps the local set while a mirror write is dirty.
 */
export declare const MANAGER_POLL_MS = 4000;
/** Consumer identity of the panel's retained manager Session. */
export declare const MANAGER_REFERENCE_SOURCE = "sessionBoardManager";
/** Stable error keys; the drawer renders them through the dictionary. */
export type ManagerErrorKey = 'manager.errorState' | 'manager.errorPrompt' | 'manager.errorSelection' | 'manager.errorTask' | 'manager.errorWake';
/** Read phases of the host state mirror. */
export type ManagerPhase = 'loading' | 'ready' | 'error';
/** Readiness of the retained manager Session behind the embedded chat. */
export type ManagerChatPhase = 'idle' | 'loading' | 'ready' | 'error';
/** The complete render snapshot. */
export interface ManagerSnapshot {
    /** Drawer visibility; the only persisted field. */
    readonly open: boolean;
    /** Host state read phase. */
    readonly phase: ManagerPhase;
    /** Localized error key, or null. */
    readonly error: ManagerErrorKey | null;
    /** Short diagnostic shown as the error line's tooltip, or null. */
    readonly errorDetail: string | null;
    /** Raw host diagnostic from the state view's optional `error` field. */
    readonly stateError: string | null;
    readonly managerSessionId: string | null;
    readonly managerWorkspaceId: string | null;
    readonly selection: ManagerSelection;
    readonly tasks: readonly ManagerTaskView[];
    /** Automatic wakeup state: opt-in, pending counts, throttle diagnostics. */
    readonly wake: ManagerWakeStatus;
    readonly muxRevision: number;
    /** A "send selection" round trip is in flight. */
    readonly sending: boolean;
    /** A selection mirror write is in flight. */
    readonly syncing: boolean;
    /** The last send was accepted; cleared by the next selection change or send. */
    readonly sent: boolean;
    /** Workspace whose sessions the left pane lists. */
    readonly focusedWorkspaceId: string | null;
    /** Retained manager Session for the embedded chat. */
    readonly reference: SessionReference | null;
    readonly chat: ManagerChatPhase;
    /** Diagnostic code from the last failed retention/open, or null. */
    readonly chatError: string | null;
}
/** Result of one explicit "send selection to manager" action. */
export type ManagerSendResult = {
    ok: true;
} | {
    ok: false;
    error: string;
};
/** Task creation input accepted by {@link ManagerController.createTask}. */
export interface ManagerTaskDraft {
    readonly title: string;
    readonly workspaceId?: string | undefined;
    readonly sessionId?: string | undefined;
    readonly status?: ManagerTaskStatus | undefined;
    readonly note?: string | undefined;
}
/** Task update input accepted by {@link ManagerController.updateTask}. */
export interface ManagerTaskPatch {
    readonly title?: string | undefined;
    readonly workspaceId?: string | undefined;
    readonly sessionId?: string | undefined;
    readonly status?: ManagerTaskStatus | undefined;
    readonly note?: string | undefined;
}
/** The sessions-service members the controller reads. */
export interface ManagerSessionsFace {
    readonly list: Source<SessionListState>;
    readonly retain?: RetainSession | undefined;
    /** Refresh the host session list; used before retaining a just-provisioned id. */
    readonly refresh?: (() => Promise<void>) | undefined;
}
/** Collaborators of {@link ManagerController}. */
export interface ManagerControllerOptions {
    /** The client sessions service; `retain` is what the embedded chat needs. */
    readonly sessions: ManagerSessionsFace | null;
    /** The client workspaces service, for workspace titles in the message. */
    readonly workspaces: WorkspacesService | null;
}
/**
 * The manager drawer's external store.
 *
 * Not a hook: one instance per plugin, shared by the drawer, the header toggle
 * and the embedded-chat bridge, so the retained Session and the debounced
 * mirror writes exist once.
 */
export declare class ManagerController {
    private state;
    private readonly listeners;
    private readonly persistence;
    private readonly options;
    private reference;
    private referencePromise;
    /** Id the in-flight acquisition belongs to; a different id must wait it out. */
    private referencePromiseId;
    private refreshPromise;
    private selectionTimer;
    private pollTimer;
    /** Serializes selection mirror writes so a stale write cannot land last. */
    private syncQueue;
    private selectionDirty;
    private disposed;
    constructor(options: ManagerControllerOptions);
    /** Bound snapshot reader for `useSyncExternalStore`. */
    readonly getSnapshot: () => ManagerSnapshot;
    /** Bound subscriber for `useSyncExternalStore`. Never fires after disposal. */
    readonly subscribe: (listener: () => void) => (() => void);
    /** Show the drawer and read the current host state. */
    open(): void;
    /** Hide the drawer and release the retained manager Session. */
    close(): void;
    /** Flip drawer visibility. */
    toggle(): void;
    /** Workspace whose sessions the left pane lists; null shows none. */
    setFocused(workspaceId: string | null): void;
    /** Tick or untick one workspace in the local selection. */
    toggleWorkspaceId(workspaceId: string): void;
    /** Tick or untick one session in the local selection. */
    toggleSessionId(sessionId: string): void;
    /** Empty the local selection and mirror the empty set. */
    clearSelection(): void;
    /**
     * Read the host state mirror. Concurrent calls share one request.
     * @returns completion of the read attempt; failures land in the snapshot.
     */
    refresh(): Promise<void>;
    /** Begin the open-drawer poll; idempotent and never runs after disposal. */
    private startPolling;
    /** Stop the open-drawer poll. */
    private stopPolling;
    /** Retry the failed read and the retained chat after one error. */
    retry(): void;
    /**
     * Send the current selection to the manager as one queued user message.
     * @param instruction - optional user instruction appended after the selection block.
     * @returns success, or the localized error key to display.
     */
    sendSelection(instruction?: string): Promise<ManagerSendResult>;
    /**
     * Create one task through the host task route.
     * @param draft - title plus optional workspace/session/status/note.
     * @returns whether the host accepted the write.
     */
    createTask(draft: ManagerTaskDraft): Promise<boolean>;
    /**
     * Update one task through the host task route.
     * @param taskId - task identity from the state mirror.
     * @param patch - fields to replace.
     * @returns whether the host accepted the write.
     */
    updateTask(taskId: string, patch: ManagerTaskPatch): Promise<boolean>;
    /**
     * Enable or disable automatic wakeups through the host route.
     * @param enabled - new opt-in value.
     * @returns whether the host accepted the change.
     */
    setWake(enabled: boolean): Promise<boolean>;
    /**
     * Ask the host for one digest as soon as the manager is idle.
     * @returns whether the request was accepted.
     */
    wakeNow(): Promise<boolean>;
    /** One `/manager/wake` round trip; publishes the returned status. */
    private writeWake;
    /** Release the retained Session, timers and subscribers. Terminal. */
    dispose(): void;
    /** Swap in a new snapshot and wake every listener. */
    private publish;
    /** Store a locally changed selection and schedule its durable mirror. */
    private applyLocalSelection;
    /** Debounced selection mirror write. */
    private scheduleSelectionSync;
    /** Send the pending local selection now, if any. */
    private flushSelection;
    /** Mirror the current local selection now, serialized after any in-flight write. */
    private syncSelection;
    /**
     * One selection mirror write. Runs on the serialized queue, so the payload
     * is the selection current at write time; a failed write keeps the local
     * selection and the scheduled reconciliation retries it.
     */
    private performSelectionSync;
    /** Apply one host state read to the local snapshot. */
    private applyState;
    /**
     * Retain the manager Session once and await its opening. Concurrent calls
     * share one acquisition; failures land in the snapshot for the chat pane.
     * @returns the reference (caller must not release it), or null.
     */
    private ensureReference;
    /** Release the retained manager Session and mark the chat unready. */
    private releaseReference;
    /** POST one create/update task request and merge the resulting row. */
    private writeTask;
}
