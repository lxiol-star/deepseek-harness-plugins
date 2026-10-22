import type { BoardEntry, BoardGroup } from '../shared/types.ts'
import type { WorkspaceGitInfo } from '../shared/workspace-meta.ts'

export type GroupingMode = 'status' | 'workspace' | 'tree'

/** One node of the rendered workspace tree. */
export interface WorkspaceNode {
  key: string
  title: string
  path: string
  entries: BoardEntry[]
  children: WorkspaceNode[]
  count: number
  /** Branch (workspace leaf) or remote (project node); rendered as muted text. */
  subtitle?: string
  kind?: 'project' | 'workspace' | 'path'
  /** Normalized git origin key, present on project roots only. */
  projectKey?: string
}

export function workspaceKey(entry: BoardEntry): string { return entry.workspaceId || entry.workspacePath || entry.workspaceTitle || 'unassigned' }

/** Entries grouped by workspace identity, preserving first-seen order. */
interface WorkspaceEntries {
  key: string
  title: string
  path: string
  workspaceId?: string
  entries: BoardEntry[]
}

/**
 * Split board entries into workspace buckets.
 * @param groups - board groups.
 * @returns one bucket per workspace identity.
 */
function workspaceEntries(groups: readonly BoardGroup[]): WorkspaceEntries[] {
  const byKey = new Map<string, WorkspaceEntries>()
  for (const entry of groups.flatMap(group => group.entries)) {
    const key = workspaceKey(entry)
    let bucket = byKey.get(key)
    if (bucket === undefined) {
      bucket = { key, title: entry.workspaceTitle, path: entry.workspacePath ?? '', entries: [], ...(entry.workspaceId === undefined ? {} : { workspaceId: entry.workspaceId }) }
      byKey.set(key, bucket)
    }
    bucket.entries.push(entry)
  }
  return [...byKey.values()]
}

/** Flat one-node-per-workspace list (non-tree grouping). */
function flatNodes(groups: readonly BoardGroup[]): WorkspaceNode[] {
  return workspaceEntries(groups)
    .map(bucket => ({
      key: `workspace:${bucket.key}`,
      title: bucket.title,
      path: bucket.path,
      entries: bucket.entries,
      children: [],
      count: bucket.entries.length,
      kind: 'workspace' as const,
    }))
    .sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path) || a.key.localeCompare(b.key))
}

/** Path segments of one workspace directory (drive letter aware). */
function pathParts(path: string): { drive: string; parts: string[] } {
  const normalized = path.replaceAll('\\', '/')
  const drive = /^[A-Za-z]:\//.exec(normalized)?.[0] ?? (normalized.startsWith('/') ? '/' : '')
  return { drive, parts: normalized.slice(drive.length).split('/').filter(Boolean) }
}

/**
 * Compact single-child directory chains into one node (`a/b`).
 * @param nodes - path roots.
 * @returns compacted nodes.
 */
function compact(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes.map(node => {
    let value: WorkspaceNode = { ...node, children: compact(node.children) }
    while (value.entries.length === 0 && value.children.length === 1) {
      const child = value.children[0] as WorkspaceNode
      value = { ...child, title: child.entries.length > 0 && value.title === child.title ? child.title : `${value.title}/${child.title}` }
    }
    return value
  }).sort((a, b) => a.path.localeCompare(b.path) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
}

/**
 * Build the path-only fallback tree for Workspaces without git metadata.
 * @param buckets - workspace buckets.
 * @returns root nodes, one chain per workspace location.
 */
function pathTrees(buckets: readonly WorkspaceEntries[]): WorkspaceNode[] {
  const roots: WorkspaceNode[] = []
  const byKey = new Map<string, WorkspaceNode>()
  for (const bucket of buckets) {
    const { drive, parts } = pathParts(bucket.path)
    let parent = roots
    let prefix = drive
    const chain: WorkspaceNode[] = []
    for (const part of parts) {
      prefix += `${prefix.endsWith('/') || prefix === '' ? '' : '/'}${part}`
      const key = `path:${prefix}`
      let node = byKey.get(key)
      if (node === undefined) {
        node = { key, title: part, path: prefix, entries: [], children: [], count: 0, kind: 'path' }
        byKey.set(key, node)
        parent.push(node)
      }
      chain.push(node)
      parent = node.children
    }
    // The workspace itself is a leaf, even when two Workspaces share a folder.
    const leafKey = `tree-workspace:${bucket.key}`
    let leaf = byKey.get(leafKey)
    if (leaf === undefined) {
      leaf = { key: leafKey, title: bucket.title || bucket.path, path: bucket.path.replaceAll('\\', '/'), entries: [], children: [], count: 0, kind: 'workspace' }
      byKey.set(leafKey, leaf)
      parent.push(leaf)
    }
    leaf.entries.push(...bucket.entries)
    leaf.count += bucket.entries.length
    for (const node of chain) node.count += bucket.entries.length
  }
  return compact(roots)
}

/** Project node plus one leaf per Workspace. */
interface ProjectBucket {
  key: string
  title: string
  remote: string
  leaves: Array<{ bucket: WorkspaceEntries; branch: string }>
}

/**
 * Build the project → branch tree, falling back to the path tree for
 * Workspaces that are not git checkouts (container folders, plain dirs).
 * @param groups - board groups.
 * @param meta - workspace id → git facts.
 * @returns root nodes: projects first, then path fallback.
 */
function projectNodes(groups: readonly BoardGroup[], meta: Readonly<Record<string, WorkspaceGitInfo>>): WorkspaceNode[] {
  const buckets = workspaceEntries(groups)
  const projects = new Map<string, ProjectBucket>()
  const rest: WorkspaceEntries[] = []
  for (const bucket of buckets) {
    const info = bucket.workspaceId === undefined ? undefined : meta[bucket.workspaceId]
    const projectKey = info?.projectKey
    if (info === undefined || projectKey === undefined) {
      rest.push(bucket)
      continue
    }
    let project = projects.get(projectKey)
    if (project === undefined) {
      project = { key: projectKey, title: info.projectLabel ?? projectKey.split('/').pop() ?? projectKey, remote: info.remote ?? projectKey, leaves: [] }
      projects.set(projectKey, project)
    }
    project.leaves.push({ bucket, branch: info.branch ?? '' })
  }
  const projectRoots: WorkspaceNode[] = [...projects.values()]
    .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
    .map(project => {
      const children: WorkspaceNode[] = project.leaves
        .sort((a, b) => a.bucket.title.localeCompare(b.bucket.title) || a.branch.localeCompare(b.branch))
        .map(({ bucket, branch }) => ({
          key: `tree-workspace:${bucket.key}`,
          title: bucket.title || bucket.path,
          path: bucket.path.replaceAll('\\', '/'),
          entries: bucket.entries,
          children: [],
          count: bucket.entries.length,
          kind: 'workspace' as const,
          ...(branch === '' ? {} : { subtitle: branch }),
        }))
      return {
        key: `project:${project.key}`,
        title: project.title,
        path: project.remote,
        entries: [],
        children,
        count: children.reduce((sum, child) => sum + child.count, 0),
        kind: 'project' as const,
        projectKey: project.key,
      }
    })
  return [...projectRoots, ...pathTrees(rest)]
}

/**
 * Build the workspace view nodes.
 * @param groups - board groups.
 * @param tree - whether to build a hierarchy.
 * @param meta - workspace id → git facts; the project tree uses it when
 * present and falls back to the path tree for entries without git metadata.
 * @returns root nodes.
 */
export function buildWorkspaceNodes(
  groups: readonly BoardGroup[],
  tree: boolean,
  meta: Readonly<Record<string, WorkspaceGitInfo>> = {},
): WorkspaceNode[] {
  return tree ? projectNodes(groups, meta) : flatNodes(groups)
}
