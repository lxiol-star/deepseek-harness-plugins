import type { BoardFetchRoute } from './routes.ts';
/** The registry subset this route reads. */
export interface WorkspaceRegistryView {
    list(): readonly {
        readonly id: string;
        readonly title: string;
        readonly path: string;
    }[];
}
/** Raw git facts for one directory. */
export interface GitFacts {
    readonly root?: string;
    readonly branch?: string;
    readonly remote?: string;
}
/** How a Workspace's git facts are obtained (injectable for tests). */
export type WorkspaceGitProbe = (path: string) => Promise<GitFacts>;
/**
 * Run the three git queries one Workspace needs.
 * @param path - registered Workspace directory.
 * @returns facts; an absent or non-git directory yields an empty object.
 */
export declare function probeWorkspaceGit(path: string): Promise<GitFacts>;
/** Options of {@link createWorkspaceMetaRoute}. */
export interface WorkspaceMetaOptions {
    readonly registry: WorkspaceRegistryView;
    readonly warn: (message: string) => void;
    /** Cache lifetime; tests pass 0 to always probe. */
    readonly ttlMs?: number;
    readonly probe?: WorkspaceGitProbe;
    readonly now?: () => number;
}
/**
 * Build the authenticated `/workspace-meta` route.
 * @param options - registry, probe and cache settings.
 * @returns the route definition for `connection.fetch.register`.
 */
export declare function createWorkspaceMetaRoute(options: WorkspaceMetaOptions): BoardFetchRoute;
