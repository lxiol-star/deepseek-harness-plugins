/**
 * Host half of the project tree: probe each registered Workspace's git state.
 *
 * Only `workspaceRegistry.list()` paths are probed — the route never runs git
 * for a path supplied by the caller. Results are cached per Workspace for two
 * minutes and refreshed on demand; a directory that is not a git checkout
 * simply comes back without branch/project fields and the client falls back to
 * the path tree.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { normalizeRemote, projectLabel, WORKSPACE_META_PATH, type WorkspaceGitInfo, type WorkspaceMetaResponse } from '../shared/workspace-meta.ts'
import type { BoardFetchRoute } from './routes.ts'

const exec = promisify(execFile)
/** Workspace count cap; the UI has no use for more and probing is per path. */
const MAX_WORKSPACES = 400
/** Parallel git probes; each probe spawns at most three short-lived commands. */
const PROBE_CONCURRENCY = 6
/** Default cache lifetime of one Workspace's git facts. */
const DEFAULT_TTL_MS = 120_000

/** The registry subset this route reads. */
export interface WorkspaceRegistryView {
  list(): readonly { readonly id: string; readonly title: string; readonly path: string }[]
}

/** Raw git facts for one directory. */
export interface GitFacts {
  readonly root?: string
  readonly branch?: string
  readonly remote?: string
}

/** How a Workspace's git facts are obtained (injectable for tests). */
export type WorkspaceGitProbe = (path: string) => Promise<GitFacts>

/**
 * Run the three git queries one Workspace needs.
 * @param path - registered Workspace directory.
 * @returns facts; an absent or non-git directory yields an empty object.
 */
export async function probeWorkspaceGit(path: string): Promise<GitFacts> {
  const run = async (args: readonly string[]): Promise<string> => {
    const result = await exec('git', ['-C', path, ...args], { timeout: 2_500, maxBuffer: 64 * 1024 })
    return result.stdout.trim()
  }
  let root: string
  try {
    root = await run(['rev-parse', '--show-toplevel'])
  } catch {
    return {}
  }
  if (root === '') return {}
  let branch: string | undefined
  let remote: string | undefined
  try {
    const value = await run(['rev-parse', '--abbrev-ref', 'HEAD'])
    if (value !== '' && value !== 'HEAD') branch = value
  } catch {
    // Detached or unborn HEAD: keep branch absent.
  }
  try {
    const value = await run(['config', '--get', 'remote.origin.url'])
    if (value !== '') remote = value
  } catch {
    // No origin remote: path grouping only.
  }
  return { root, ...(branch === undefined ? {} : { branch }), ...(remote === undefined ? {} : { remote }) }
}

/** Options of {@link createWorkspaceMetaRoute}. */
export interface WorkspaceMetaOptions {
  readonly registry: WorkspaceRegistryView
  readonly warn: (message: string) => void
  /** Cache lifetime; tests pass 0 to always probe. */
  readonly ttlMs?: number
  readonly probe?: WorkspaceGitProbe
  readonly now?: () => number
}

/** One cached Workspace probe. */
interface CachedFacts {
  readonly at: number
  readonly facts: GitFacts
}

/** JSON response helper (the route owns its own `Response`). */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Build the authenticated `/workspace-meta` route.
 * @param options - registry, probe and cache settings.
 * @returns the route definition for `connection.fetch.register`.
 */
export function createWorkspaceMetaRoute(options: WorkspaceMetaOptions): BoardFetchRoute {
  const ttl = options.ttlMs ?? DEFAULT_TTL_MS
  const probe = options.probe ?? probeWorkspaceGit
  const now = options.now ?? Date.now
  const cache = new Map<string, CachedFacts>()
  const inflight = new Map<string, Promise<GitFacts>>()

  /** Probe with a per-Workspace cache and in-flight dedupe. */
  const factsFor = async (workspaceId: string, path: string): Promise<GitFacts> => {
    const cached = cache.get(workspaceId)
    if (cached !== undefined && now() - cached.at < ttl) return cached.facts
    const running = inflight.get(workspaceId)
    if (running !== undefined) return await running
    const task = (async (): Promise<GitFacts> => {
      try {
        const facts = await probe(path)
        cache.set(workspaceId, { at: now(), facts })
        return facts
      } catch (error) {
        options.warn(`dsh-session-board: workspace probe failed for ${path}: ${String(error)}`)
        return {}
      } finally {
        inflight.delete(workspaceId)
      }
    })()
    inflight.set(workspaceId, task)
    return await task
  }

  /** One wire row. */
  const rowFor = (workspace: { id: string; title: string; path: string }, facts: GitFacts): WorkspaceGitInfo => {
    const projectKey = facts.remote === undefined ? '' : normalizeRemote(facts.remote)
    const label = projectKey === '' ? null : projectLabel(projectKey)
    return {
      workspaceId: workspace.id,
      title: workspace.title,
      path: workspace.path,
      ...(facts.branch === undefined ? {} : { branch: facts.branch }),
      ...(projectKey === '' ? {} : { projectKey }),
      ...(label === null ? {} : { projectLabel: label }),
      ...(facts.remote === undefined ? {} : { remote: facts.remote }),
      ...(facts.root === undefined ? {} : { root: facts.root }),
    }
  }

  return {
    path: WORKSPACE_META_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => {
      try {
        const listed = options.registry.list().slice(0, MAX_WORKSPACES)
        const rows: WorkspaceGitInfo[] = []
        for (let start = 0; start < listed.length; start += PROBE_CONCURRENCY) {
          const chunk = listed.slice(start, start + PROBE_CONCURRENCY)
          const facts = await Promise.all(chunk.map(async workspace => await factsFor(workspace.id, workspace.path)))
          chunk.forEach((workspace, index) => { rows.push(rowFor(workspace, facts[index] ?? {})) })
        }
        const body: WorkspaceMetaResponse = { ok: true, generatedAt: now(), workspaces: rows }
        return jsonResponse(200, body)
      } catch (error) {
        options.warn(`dsh-session-board: workspace meta failed: ${String(error)}`)
        return jsonResponse(500, { ok: false, error: 'WORKSPACE_META_UNAVAILABLE' })
      }
    },
  }
}
