import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ManagerSelection, ManagerSelectionResponse, ManagerStateView, ManagerTaskRequest, ManagerTaskResponse } from '../../shared/manager.ts';
import type { ManagerStateRecord, ManagerTaskRecord } from './domain.ts';
import type { EventMux } from './mux.ts';
/** KV table face used by the manager domain records. */
export interface ManagerTable<V> {
    get(key: string): V | undefined;
    entries(): IterableIterator<[string, V]>;
    put(key: string, value: V): Promise<void>;
    delete(key: string): Promise<boolean>;
}
/** Everything the service needs from the host composition. */
export interface ManagerServiceDeps {
    /** Nested-injected context carrying the four host services. */
    readonly ctx: Context;
    readonly state: ManagerTable<ManagerStateRecord>;
    readonly tasks: ManagerTable<ManagerTaskRecord>;
    readonly mux: EventMux;
    /** Absolute directory that becomes the manager workspace. */
    readonly managerDir: string;
    /** Contained warning sink. */
    readonly warn: (message: string) => void;
    /** Clock injection for tests. */
    readonly now?: () => number;
}
/** Manager session display title. */
export declare const MANAGER_SESSION_TITLE = "DSH \u7BA1\u7406\u53F0";
/**
 * The resident manager. One instance per plugin fiber; the manager session is a
 * normal DSH session provisioned lazily, with tools re-attached on every resume.
 */
export declare class ManagerService {
    private readonly deps;
    private state;
    private managerSessionId;
    private provisioning;
    private readonly installed;
    private lastWakeAt;
    private lastError;
    /** @param deps - nested host context plus the durable tables. */
    constructor(deps: ManagerServiceDeps);
    /** Current session id, when provisioned. */
    get sessionId(): string | undefined;
    /** Project the durable state into the wire view. */
    view(): ManagerStateView;
    /**
     * Provision the manager workspace/session once. Idempotent and serialized;
     * the session id is persisted before creation so an `agent/created` listener
     * can recognize the very first manager Agent.
     */
    ensure(): Promise<{
        managerSessionId: string;
        managerWorkspaceId?: string;
    }>;
    /**
     * Install tools/prompt context on the manager Agent, whether it was just
     * created or resumed from disk. Non-manager agents are ignored.
     * @param agent - every published Agent.
     */
    installAgent(agent: Agent): void;
    /** Drop one Agent's scoped registrations when it is disposed. */
    disposeAgent(agentId: string): void;
    /** Release every scoped registration; called on plugin unload. */
    dispose(): void;
    /** Current durable selection. */
    selection(): ManagerSelection;
    /**
     * Persist one selection mirror write.
     * @param raw - untrusted wire value.
     * @returns the normalized selection and new revision.
     */
    writeSelection(raw: unknown): Promise<ManagerSelectionResponse>;
    /**
     * Apply one task-board mutation.
     * @param request - wire request (`create` or `update`).
     * @returns the resulting task view.
     */
    task(request: ManagerTaskRequest): Promise<ManagerTaskResponse>;
    /**
     * Turn newly drained mux edges into at most one manager digest. The wake
     * policy is deliberately conservative: opted-in, manager idle, one wake per
     * minute, and edges only (never one prompt per event).
     * @param now - injectable clock.
     */
    noteEdges(now?: number): void;
    /** The tool/prompt content projection installed on the manager Agent. */
    private toolContext;
    /** Dynamic prompt context: selection, tasks and last progress line. */
    private promptContextText;
    private provision;
    private taskViews;
    /** Derive a task's running/blocked state from the session event mux. */
    private deriveTask;
    private overview;
    private listSessions;
    private workspaceSessions;
    private sessionStatus;
    private assignTask;
    private reportProgress;
    private setAutoWake;
    private prompt;
    private now;
}
/** Error-to-line helper shared with the plugin wiring. */
export declare function describe(error: unknown): string;
/** Default manager workspace directory (overridable through the environment). */
export declare function defaultManagerDir(): string;
