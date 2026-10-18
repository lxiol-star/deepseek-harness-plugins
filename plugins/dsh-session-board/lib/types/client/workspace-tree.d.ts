import type { BoardEntry, BoardGroup } from '../shared/types.ts';
export type GroupingMode = 'status' | 'workspace' | 'tree';
export interface WorkspaceNode {
    key: string;
    title: string;
    path: string;
    entries: BoardEntry[];
    children: WorkspaceNode[];
    count: number;
}
export declare function workspaceKey(entry: BoardEntry): string;
/** A flat workspace view keeps distinct workspaces with the same display name separate. */
export declare function buildWorkspaceNodes(groups: readonly BoardGroup[], tree: boolean): WorkspaceNode[];
