/**
 * Client cache of Workspace git metadata for the project tree.
 *
 * The host route probes registered Workspace paths; this module keeps one
 * in-memory map so switching between board groupings does not re-probe git,
 * and exposes a tiny store for React.
 */
import type { ReadonlyStore } from './store.ts'
import { createStore } from './store.ts'
import { parseWorkspaceMetaResponse, WORKSPACE_META_PATH, type WorkspaceGitInfo } from '../shared/workspace-meta.ts'

/** What the board observes. */
export interface WorkspaceMetaState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** workspace id → git facts */
  byId: Readonly<Record<string, WorkspaceGitInfo>>
  /** Last successful load time. */
  at: number
}

/** Surface handed to the board roots. */
export interface WorkspaceMetaFace {
  readonly store: ReadonlyStore<WorkspaceMetaState>
  /**
   * Refresh the metadata map.
   * @param force - ignore the cache lifetime.
   */
  load(force?: boolean): Promise<void>
}

/** Default cache lifetime; git branches rarely change between two board opens. */
const TTL_MS = 120_000

/**
 * Create the Workspace metadata cache.
 * @returns the face the board consumes.
 */
export function createWorkspaceMeta(): WorkspaceMetaFace {
  const state = createStore<WorkspaceMetaState>({ status: 'idle', byId: {}, at: 0 })
  let inflight: Promise<void> | null = null

  const load = async (force = false): Promise<void> => {
    const current = state.getSnapshot()
    if (inflight !== null) return await inflight
    if (!force && current.at > 0 && Date.now() - current.at < TTL_MS) return
    if (current.status === 'loading') return
    state.set({ ...current, status: 'loading' })
    inflight = (async (): Promise<void> => {
      try {
        const response = await globalThis.fetch(WORKSPACE_META_PATH)
        const payload: unknown = await response.json().catch(() => null)
        const parsed = response.ok ? parseWorkspaceMetaResponse(payload) : null
        if (parsed === null) throw new Error('WORKSPACE_META_UNAVAILABLE')
        const byId: Record<string, WorkspaceGitInfo> = {}
        for (const workspace of parsed.workspaces) byId[workspace.workspaceId] = workspace
        state.set({ status: 'ready', byId, at: parsed.generatedAt })
      } catch {
        // Keep an older map: the path-only tree still renders correctly.
        state.set({ ...state.getSnapshot(), status: 'error' })
      } finally {
        inflight = null
      }
    })()
    return await inflight
  }

  return { store: state, load }
}
