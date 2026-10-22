import type { BoardEntry, BoardGroup } from '../shared/types.ts';
import type { WorkspaceGitInfo } from '../shared/workspace-meta.ts';
export type GroupingMode = 'status' | 'workspace' | 'tree';
/** One node of the rendered workspace tree. */
export interface WorkspaceNode {
    key: string;
    title: string;
    path: string;
    entries: BoardEntry[];
    children: WorkspaceNode[];
    count: number;
    /** Branch (workspace leaf) or remote (project node); rendered as muted text. */
    subtitle?: string;
    kind?: 'project' | 'workspace' | 'path';
    /** Normalized git origin key, present on project roots only. */
    projectKey?: string;
}
export declare function workspaceKey(entry: BoardEntry): string;
/**
 * Build the workspace view nodes.
 * @param groups - board groups.
 * @param tree - whether to build a hierarchy.
 * @param meta - workspace id → git facts; the project tree uses it when
 * present and falls back to the path tree for entries without git metadata.
 * @returns root nodes.
 */
export declare function buildWorkspaceNodes(groups: readonly BoardGroup[], tree: boolean, meta?: Readonly<Record<string, WorkspaceGitInfo>>): WorkspaceNode[];
