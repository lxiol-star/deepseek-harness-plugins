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
export const WORKSPACE_META_PATH = '/api/session-board/workspace-meta'

/** Git facts for one registered Workspace. */
export interface WorkspaceGitInfo {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
  /** Current branch (`HEAD` when detached). Absent for non-git directories. */
  readonly branch?: string
  /** Normalized `origin` project key, such as `github.com/lxiol-star/i-ai-gw`. */
  readonly projectKey?: string
  /** Display name of the project, usually the repository name. */
  readonly projectLabel?: string
  /** Raw remote URL as configured (kept for tooltips). */
  readonly remote?: string
  /** Absolute repository root, when the Workspace is inside one. */
  readonly root?: string
}

/** `/workspace-meta` response. */
export interface WorkspaceMetaResponse {
  readonly ok: true
  readonly generatedAt: number
  readonly workspaces: readonly WorkspaceGitInfo[]
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
export function normalizeRemote(raw: string): string {
  let value = raw.trim()
  if (value === '') return ''
  if (value.startsWith('git@') || /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:/.test(value)) {
    const at = value.indexOf('@')
    const colon = value.indexOf(':', at)
    if (colon !== -1) value = `${value.slice(at + 1, colon)}/${value.slice(colon + 1)}`
  } else if (value.includes('://')) {
    try {
      const url = new URL(value)
      value = `${url.hostname}${url.pathname}`
    } catch {
      return ''
    }
  }
  value = value.replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '')
  const parts = value.split('/').filter(Boolean).map(part => part.toLowerCase())
  const host = parts.shift()
  if (host === undefined || parts.length === 0) return ''
  return `${host}/${parts.join('/')}`
}

/**
 * Derive the project identity from a normalized remote key.
 * @param key - value returned by {@link normalizeRemote}.
 * @returns the display label, or null for an empty key.
 */
export function projectLabel(key: string): string | null {
  const parts = key.split('/')
  return parts.length === 0 || parts[parts.length - 1] === '' ? null : parts[parts.length - 1] as string
}

/**
 * Parse the route payload defensively.
 * @param raw - untrusted response value.
 * @returns the typed response, or null when unusable.
 */
export function parseWorkspaceMetaResponse(raw: unknown): WorkspaceMetaResponse | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (value.ok !== true || !Array.isArray(value.workspaces)) return null
  const workspaces: WorkspaceGitInfo[] = []
  for (const item of value.workspaces) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as Record<string, unknown>
    if (typeof row.workspaceId !== 'string' || typeof row.path !== 'string') continue
    workspaces.push({
      workspaceId: row.workspaceId,
      title: typeof row.title === 'string' ? row.title : row.path,
      path: row.path,
      ...(typeof row.branch === 'string' && row.branch !== '' ? { branch: row.branch } : {}),
      ...(typeof row.projectKey === 'string' && row.projectKey !== '' ? { projectKey: row.projectKey } : {}),
      ...(typeof row.projectLabel === 'string' && row.projectLabel !== '' ? { projectLabel: row.projectLabel } : {}),
      ...(typeof row.remote === 'string' && row.remote !== '' ? { remote: row.remote } : {}),
      ...(typeof row.root === 'string' && row.root !== '' ? { root: row.root } : {}),
    })
  }
  return { ok: true, generatedAt: typeof value.generatedAt === 'number' ? value.generatedAt : Date.now(), workspaces }
}
