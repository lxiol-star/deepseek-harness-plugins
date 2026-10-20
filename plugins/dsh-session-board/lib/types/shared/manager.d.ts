/**
 * Wire contract and pure helpers for the manager panel.
 *
 * The panel's Host half owns the durable selection/task facts and exposes them
 * over three authenticated JSON routes; the client half renders them and sends
 * user messages through the official session prompt path (not through a route).
 * This module is the single place both halves agree on shapes and derived text.
 *
 * It carries no DSH imports: the Host and Client bundles resolve only their own
 * code and Node builtins / the frozen browser platform modules.
 */
/** Manager routes, all registered on the shared authenticated `/api` channel. */
export declare const MANAGER_STATE_PATH = "/api/session-board/manager/state";
/** Read/write the durable selection mirror. */
export declare const MANAGER_SELECTION_PATH = "/api/session-board/manager/selection";
/** Create or update one manager task. */
export declare const MANAGER_TASK_PATH = "/api/session-board/manager/task";
/** Lifecycle of one tracked task. `running`/`blocked` are derived by the mux. */
export declare const MANAGER_TASK_STATUSES: readonly ["pending", "assigned", "running", "blocked", "done", "failed", "orphaned"];
/** One task status. */
export type ManagerTaskStatus = (typeof MANAGER_TASK_STATUSES)[number];
/** Durable task record as both halves see it. */
export interface ManagerTaskView {
    readonly id: string;
    readonly title: string;
    readonly status: ManagerTaskStatus;
    /** Workspace the task belongs to, when assigned to one. */
    readonly workspaceId?: string;
    /** Session created to execute the task, when assigned. */
    readonly sessionId?: string;
    /** Free-form progress note maintained by the manager (short). */
    readonly note?: string;
    readonly createdAt: number;
    readonly updatedAt: number;
}
/** The panel's current multi-selection. */
export interface ManagerSelection {
    readonly workspaceIds: readonly string[];
    readonly sessionIds: readonly string[];
}
/** Empty selection constant (fresh arrays so callers can spread safely). */
export declare const EMPTY_SELECTION: ManagerSelection;
/** `/manager/state` response. */
export interface ManagerStateView {
    /** Manager session id once provisioned; absent while the workspace is unavailable. */
    readonly managerSessionId?: string;
    /** Workspace owning the manager session. */
    readonly managerWorkspaceId?: string;
    readonly selection: ManagerSelection;
    readonly tasks: readonly ManagerTaskView[];
    /** Whether event-driven wakeups are enabled (default false). */
    readonly wakeEnabled: boolean;
    /** Monotone counter of the host-side event mux; clients may display staleness. */
    readonly muxRevision: number;
    /** Present when provisioning or a projection read failed; the panel shows it and retries. */
    readonly error?: string;
}
/** `/manager/selection` request. */
export interface ManagerSelectionRequest {
    readonly workspaceIds: readonly string[];
    readonly sessionIds: readonly string[];
}
/** `/manager/selection` response. */
export interface ManagerSelectionResponse {
    readonly selection: ManagerSelection;
    readonly revision: number;
}
/** `/manager/task` request: create needs `title`; update needs `id`. */
export interface ManagerTaskRequest {
    readonly action: 'create' | 'update';
    readonly task: {
        readonly id?: string;
        readonly title?: string;
        readonly status?: ManagerTaskStatus;
        readonly workspaceId?: string;
        readonly sessionId?: string;
        readonly note?: string;
    };
}
/** `/manager/task` response. */
export interface ManagerTaskResponse {
    readonly task: ManagerTaskView;
}
/** Whether a wire value names a known task status. */
export declare function isManagerTaskStatus(value: unknown): value is ManagerTaskStatus;
/** Longest id accepted from the wire before it becomes a storage key. */
export declare const MANAGER_ID_MAX = 200;
/** Longest task title stored. */
export declare const MANAGER_TITLE_MAX = 160;
/** Longest task note stored. */
export declare const MANAGER_NOTE_MAX = 2000;
/** Most ids accepted in one selection mirror write. */
export declare const MANAGER_SELECTION_MAX = 500;
/** Whether a wire value is a usable opaque id. */
export declare function isManagerId(value: unknown): value is string;
/** Collapse a wire selection to unique, bounded, valid ids. */
export declare function normalizeSelection(value: unknown): ManagerSelection;
/** Truncate by Unicode code points so a cut never splits a surrogate pair. */
export declare function truncateCodePoints(text: string, max: number): string;
/** Shorten one line of model/user text for a card preview. */
export declare function previewText(text: string, max?: number): string;
/** Labels the panel needs to render a selection message. */
export interface SelectionLabels {
    readonly workspaceTitles: Readonly<Record<string, string>>;
    readonly sessionTitles: Readonly<Record<string, string>>;
    readonly sessionStates?: Readonly<Record<string, string>>;
}
/**
 * Build the user message the panel sends when the user explicitly hands the
 * current selection to the manager. It is plain text because the message is an
 * ordinary logged user message: model-visible input must be reconstructable
 * from the session log.
 *
 * @param selection - current selection.
 * @param labels - display titles/states resolved from client snapshots.
 * @param instruction - user instruction appended after the selection block.
 * @returns the message text, or an empty string when there is nothing selected.
 */
export declare function buildSelectionMessage(selection: ManagerSelection, labels: SelectionLabels, instruction?: string): string;
/** Coarse phase of the manager session shown in the panel header. */
export type ManagerPhase = 'idle' | 'running' | 'waiting';
/**
 * Derive the manager header phase from client status facts.
 * @param running - `uiSession` running flag; `undefined` while unknown.
 * @param waiting - whether a pending interaction is reported for the session.
 * @returns the phase shown next to the drawer title.
 */
export declare function managerPhase(running: boolean | undefined, waiting: boolean): ManagerPhase;
/** Status keys the panel renders for one task row. */
export declare const TASK_STATUS_KEYS: Readonly<Record<ManagerTaskStatus, string>>;
