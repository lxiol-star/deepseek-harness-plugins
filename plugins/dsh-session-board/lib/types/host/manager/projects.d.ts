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
    private readonly installed;
    private readonly inflight;
    /** @param deps - nested host context plus the durable tables. */
    constructor(deps: ProjectCoordinatorDeps);
    /**
     * Probe every registered Workspace and group them by git origin.
     * @param force - ignore the cache.
     * @returns projects, sorted by label.
     */
    projects(force?: boolean): Promise<ProjectView[]>;
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
     * Install project tools on one Agent: coordinator tools for a coordinator
     * session, report tool for a worker whose project already has a coordinator.
     * @param agent - every published Agent.
     */
    installAgent(agent: Agent): void;
    /** Drop one Agent's tool registrations. */
    disposeAgent(agentId: string): void;
    /** Release every registration; unload path. */
    dispose(): void;
    /** Register coordinator tools and prompt sections on one Agent. */
    private installCoordinator;
    /** Worker tool: report to the project coordinator if this session belongs to a project. */
    private installWorker;
    /** One project view with live session/task counts. */
    overviewLines(projectKey: string): Promise<string[]>;
    /** Tasks whose workspace belongs to one project. */
    private taskViews;
    /** Resolve one project session and assert project membership. */
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
     * @param projectKey - project key.
     * @param senderSessionId - worker session.
     * @param text - report text.
     * @param taskId - optional task this report belongs to.
     */
    report(projectKey: string, senderSessionId: string, text: string, taskId?: string): Promise<void>;
    private now;
}
