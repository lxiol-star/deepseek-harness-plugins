/**
 * Workspace metadata for the project tree.
 *
 * The board groups Sessions by Workspace path today, which cannot tell that
 * `i-ai-gw` and its seven `i-ai-gw-*` checkouts are the same repository on
 * different branches. The host probes each registered Workspace's git state
 * (`remote.origin.url`, current branch, repository root) and returns one flat
 * record per Workspace; the client builds the project → branch tree from it.
 *
 * Both halves share this module so the wire value is parsed once and the
 * project key normalization is identical on both sides of the route.
 */
/** Authenticated route returning {@link WorkspaceMetaResponse}. */
export declare const WORKSPACE_META_PATH = "/api/session-board/workspace-meta";
/** Git facts for one registered Workspace. */
export interface WorkspaceGitInfo {
    readonly workspaceId: string;
    readonly title: string;
    readonly path: string;
    /** Current branch (`HEAD` when detached). Absent for non-git directories. */
    readonly branch?: string;
    /** Normalized `origin` project key, such as `github.com/lxiol-star/i-ai-gw`. */
    readonly projectKey?: string;
    /** Display name of the project, usually the repository name. */
    readonly projectLabel?: string;
    /** Raw remote URL as configured, with embedded credentials removed (kept for tooltips). */
    readonly remote?: string;
    /** Absolute repository root, when the Workspace is inside one. */
    readonly root?: string;
}
/** `/workspace-meta` response. */
export interface WorkspaceMetaResponse {
    readonly ok: true;
    readonly generatedAt: number;
    readonly workspaces: readonly WorkspaceGitInfo[];
}
/**
 * Normalize a git remote URL to `host/owner/repo`.
 *
 * Handles scp-like (`git@host:owner/repo.git`), ssh (`ssh://git@host:2222/o/r`),
 * https and plain paths; credentials, ports and the trailing `.git` are
 * dropped so all clones of one repository share a project key.
 * @param raw - configured remote URL.
 * @returns the normalized key, or '' when the URL is not usable.
 */
export declare function normalizeRemote(raw: string): string;
/**
 * Remove credentials embedded in one git remote URL.
 *
 * A remote may be configured as `https://x-access-token:<token>@host/owner/repo`,
 * and the board shows the remote in the UI and stores it in the coordinator
 * record, so the token must never leave the host. Only the URL userinfo is
 * dropped; scp-like `user@host:path` remotes carry no secret and are kept as
 * configured. Malformed URLs fall back to a textual userinfo strip.
 * @param raw - configured remote URL.
 * @returns the URL without userinfo, or '' for an empty value.
 */
export declare function redactRemoteCredentials(raw: string): string;
/**
 * Derive the project identity from a normalized remote key.
 * @param key - value returned by {@link normalizeRemote}.
 * @returns the display label, or null for an empty key.
 */
export declare function projectLabel(key: string): string | null;
/**
 * Parse the route payload defensively.
 * @param raw - untrusted response value.
 * @returns the typed response, or null when unusable.
 */
export declare function parseWorkspaceMetaResponse(raw: unknown): WorkspaceMetaResponse | null;
