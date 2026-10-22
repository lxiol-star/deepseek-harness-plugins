import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ManagerCoordinatorRecord, ManagerTaskRecord } from './domain.ts';
import type { EventMux } from './mux.ts';
import type { ManagerTable } from './service.ts';
import { type GitFacts } from '../workspace-meta.ts';
/** One Workspace of a project as the coordinator sees it. */
export interface ProjectWorkspaceView {
    readonly workspaceId: string;
    readonly title: string;
    readonly path: string;
    readonly branch?: string;
}
/** One git project. */
export interface ProjectView {
    readonly key: string;
    readonly label: string;
    readonly remote?: string;
    readonly workspaces: readonly ProjectWorkspaceView[];
}
/** Result of opening a project's coordinator session. */
export interface ProjectCoordinatorResult {
    readonly projectKey: string;
    readonly label: string;
    readonly sessionId: string;
    readonly workspaceId: string;
    readonly created: boolean;
}
/** Collaborators of {@link ProjectCoordinators}. */
export interface ProjectCoordinatorDeps {
    readonly ctx: Context;
    readonly coordinators: ManagerTable<ManagerCoordinatorRecord>;
    readonly tasks: ManagerTable<ManagerTaskRecord>;
    readonly mux: EventMux;
    readonly warn: (message: string) => void;
    readonly now?: () => number;
    readonly probe?: (path: string) => Promise<GitFacts>;
}
/**
 * Project discovery and coordinator lifecycle.
 */
export declare class ProjectCoordinators {
    private readonly deps;
    private cached;
    private inflightProjects;
    private readonly installed;
    private readonly inflight;
    private disposed;
    /** @param deps - nested host context plus the durable tables. */
    constructor(deps: ProjectCoordinatorDeps);
    /**
     * Probe every registered Workspace and group them by git origin.
     *
     * Concurrent callers share one probe pass: Agent creation instantiates the
     * report tool for every session, and without the shared pass a burst would
     * spawn one git probe storm per session.
     * @param force - ignore the cache.
     * @returns projects, sorted by label.
     */
    projects(force?: boolean): Promise<ProjectView[]>;
    /**
     * One probe pass over the registry. Failures are per Workspace: a broken
     * checkout costs its own project row only.
     * @param at - cache timestamp taken before the probes start.
     * @returns projects, sorted by label.
     */
    private probeProjects;
    /**
     * Look one project up by key.
     * @param projectKey - normalized origin key.
     * @returns the project, or null.
     */
    view(projectKey: string): Promise<ProjectView | null>;
    /**
     * Open (creating on first use) one project's coordinator session.
     * @param projectKey - normalized origin key from the project tree.
     * @returns the coordinator identity.
     */
    ensure(projectKey: string): Promise<ProjectCoordinatorResult>;
    /**
     * Resolve or provision one coordinator. A persisted record whose session no
     * longer exists (a crash between the record write and session creation, or a
     * user-deleted session) is dropped and reprovisioned instead of handing the
     * client a dead id.
     * @param projectKey - validated normalized origin key.
     * @returns the coordinator identity.
     */
    private open;
    /**
     * Install the report tool on every live Agent of one project's sessions.
     * @param project - project whose coordinator just became available.
     */
    private installProjectWorkers;
    /**
     * Whether a persisted coordinator id still names a Session.
     *
     * The header listing is the primary check: it reads headers, not event logs,
     * so verifying a coordinator that already exists stays cheap. `inspect` is
     * only the fallback for a failed listing (it reads the full log). `unknown` is
     * deliberate too: a failed check must not trigger a second coordinator, so
     * only a successful listing that omits the id counts as proof the Session is
     * gone.
     * @param sessionId - persisted coordinator session id.
     * @returns `live`, `missing`, or `unknown` when existence cannot be checked.
     */
    private coordinatorSessionState;
    /**
     * Install project tools on one Agent: coordinator tools for a coordinator
     * session, report tool for a worker whose project already has a coordinator.
     * @param agent - every published Agent.
     */
    installAgent(agent: Agent): void;
    /** Drop one Agent's tool registrations. */
    disposeAgent(agentId: string): void;
    /** Release every registration; unload path. */
    dispose(): void;
    /** Run one slot's disposers once; also cancels a still-pending install. */
    private disposeSlot;
    /** Register coordinator tools and prompt sections on one Agent. */
    private installCoordinator;
    /**
     * Worker tool: report to the project coordinator if this session belongs to
     * a project. Runs detached; the slot bounds the damage of a late completion.
     * @param agent - published Agent whose session may be a project worker.
     * @param slot - slot already owned by this Agent in {@link installed}.
     */
    private installWorker;
    /** Remove an Agent's slot when no tool was registered for it. */
    private dropSlot;
    /** One project view with live session/task counts. */
    overviewLines(projectKey: string): Promise<string[]>;
    /** Tasks whose workspace belongs to one project. */
    private taskViews;
    /**
     * Resolve one project session and assert project membership.
     *
     * Membership is read from a TTL-refreshed project view, never the raw cache
     * field: the cache is only refreshed by project listings, so a long-lived
     * plugin would otherwise authorize against a snapshot of unknown age.
     * @param projectKey - coordinator project key.
     * @param sessionId - untrusted session id from a tool call.
     * @returns the owning workspace id when the session belongs to the project.
     */
    private projectSession;
    /** Queue one text prompt into an existing session. */
    private prompt;
    /**
     * Create a task session in one branch workspace of a project.
     * @param projectKey - project key.
     * @param input - task title, brief and target workspace id.
     * @returns the created task and session.
     */
    assignTask(projectKey: string, input: {
        title: string;
        brief: string;
        workspaceId: string;
    }): Promise<ManagerTaskRecord>;
    /**
     * Queue one message into an existing project session.
     * @param projectKey - project key.
     * @param sessionId - target project session.
     * @param text - message text.
     */
    messageSession(projectKey: string, sessionId: string, text: string): Promise<void>;
    /**
     * Status lines for one project session.
     * @param projectKey - project key.
     * @param sessionId - target session.
     * @returns human-readable lines.
     */
    sessionStatus(projectKey: string, sessionId: string): Promise<string[]>;
    /**
     * Receive one worker report and relay it to the coordinator session.
     *
     * `taskId` comes from the model and is therefore untrusted: only a task whose
     * Workspace (or session) belongs to this project may be annotated, so a
     * worker cannot overwrite another project's task note by passing its id.
     * @param projectKey - project key.
     * @param senderSessionId - worker session.
     * @param text - report text.
     * @param taskId - optional task this report belongs to.
     */
    report(projectKey: string, senderSessionId: string, text: string, taskId?: string): Promise<void>;
    /**
     * Whether a task row belongs to one project.
     * @param projectKey - coordinator project key.
     * @param task - stored task row.
     * @returns true when the task's workspace or session is a project member.
     */
    private taskInProject;
    private now;
}
