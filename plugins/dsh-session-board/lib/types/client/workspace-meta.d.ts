/**
 * Client cache of Workspace git metadata for the project tree.
 *
 * The host route probes registered Workspace paths; this module keeps one
 * in-memory map so switching between board groupings does not re-probe git,
 * and exposes a tiny store for React.
 */
import type { ReadonlyStore } from './store.ts';
import { type WorkspaceGitInfo } from '../shared/workspace-meta.ts';
/** What the board observes. */
export interface WorkspaceMetaState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** workspace id → git facts */
    byId: Readonly<Record<string, WorkspaceGitInfo>>;
    /** Last successful load time. */
    at: number;
}
/** Surface handed to the board roots. */
export interface WorkspaceMetaFace {
    readonly store: ReadonlyStore<WorkspaceMetaState>;
    /**
     * Refresh the metadata map.
     * @param force - ignore the cache lifetime.
     */
    load(force?: boolean): Promise<void>;
}
/**
 * Create the Workspace metadata cache.
 * @returns the face the board consumes.
 */
export declare function createWorkspaceMeta(): WorkspaceMetaFace;
