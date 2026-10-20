import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { ManagerSelection, ManagerTaskStatus, ManagerTaskView } from '../../shared/manager.ts';
/** What one manager session can see and do; implemented by the host service. */
export interface ManagerToolContext {
    selection(): ManagerSelection;
    tasks(): readonly ManagerTaskView[];
    overview(): Promise<readonly string[]>;
    workspaceSessions(workspaceId: string): Promise<readonly string[]>;
    sessionStatus(sessionId: string): Promise<readonly string[]>;
    assignTask(input: {
        readonly title: string;
        readonly brief: string;
        readonly workspaceId: string;
    }): Promise<{
        readonly task: ManagerTaskView;
        readonly sessionId?: string;
    }>;
    updateTask(input: {
        readonly id: string;
        readonly status?: ManagerTaskStatus;
        readonly note?: string;
    }): Promise<ManagerTaskView>;
    reportProgress(input: {
        readonly text: string;
        readonly taskId?: string;
    }): Promise<void>;
    setAutoWake(enabled: boolean): Promise<boolean>;
}
/** Build the complete manager tool set over one context. */
export declare function managerToolDefinitions(context: ManagerToolContext): readonly ToolDefinition[];
