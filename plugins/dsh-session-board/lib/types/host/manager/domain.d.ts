/**
 * Durable manager facts: the one manager identity/selection record and the
 * task board. A separate domain from the board fact stores so a broken task
 * store can never take acknowledgements down with it.
 *
 * Records are normalized instead of thrown away: these are derived facts, and a
 * corrupt row should cost one panel row, not the domain's availability.
 */
import type { ManagerSelection, ManagerTaskView } from '../../shared/manager.ts';
import type { DomainSpec, RecordSchema } from '../domain.ts';
/** Domain holding the manager identity record and the task board. */
export declare const MANAGER_DOMAIN_NAME = "dsh_session_board_manager";
/** Single-row table holding {@link ManagerStateRecord} under {@link MANAGER_STATE_KEY}. */
export declare const MANAGER_STATE_TABLE = "manager_state";
/** Task table keyed by task id. */
export declare const MANAGER_TASK_TABLE = "manager_tasks";
/** Key of the single manager state record. */
export declare const MANAGER_STATE_KEY = "state";
/** Durable manager identity, selection mirror and wake preference. */
export interface ManagerStateRecord {
    readonly managerSessionId?: string;
    readonly managerWorkspaceId?: string;
    readonly selection: ManagerSelection;
    readonly wakeEnabled: boolean;
    /** Monotone revision bumped by every accepted mutation. */
    readonly revision: number;
    /** Latest free-form progress line (report_progress without a task). */
    readonly lastProgress?: string;
    /** Epoch ms of the last delivered automatic digest. */
    readonly lastWakeAt?: number;
    /** Urgent/attention wake timestamps in the rolling hour. */
    readonly wakeUrgentTimes?: readonly number[];
    /** Completion wake timestamps in the rolling hour. */
    readonly wakeBatchTimes?: readonly number[];
}
/** Durable task row (same fields the wire view exposes). */
export type ManagerTaskRecord = ManagerTaskView;
/** Empty manager state used before the first mutation. */
export declare function emptyManagerState(): ManagerStateRecord;
/** Normalize one stored manager record. */
export declare const managerStateSchema: RecordSchema<ManagerStateRecord>;
/** Normalize one stored task row. */
export declare const managerTaskSchema: RecordSchema<ManagerTaskRecord>;
/** Domain holding project coordinator session mappings. */
export declare const PROJECT_DOMAIN_NAME = "dsh_session_board_projects";
/** Table mapping a project key to its coordinator session. */
export declare const PROJECT_COORDINATOR_TABLE = "coordinators";
/** One persisted project coordinator. */
export interface ManagerCoordinatorRecord {
    readonly projectKey: string;
    readonly label: string;
    readonly sessionId: string;
    readonly workspaceId: string;
    readonly createdAt: number;
    readonly remote?: string;
}
/** Project coordinator domain. */
export declare const projectDomainSpec: DomainSpec;
/** Manager domain: one identity/selection record plus the task board. */
export declare const managerDomainSpec: DomainSpec;
