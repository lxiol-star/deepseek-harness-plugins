import type { BoardEntry, BoardGroup } from '../shared/types.ts'

export type GroupingMode = 'status' | 'workspace' | 'tree'
export interface WorkspaceNode { key: string; title: string; path: string; entries: BoardEntry[]; children: WorkspaceNode[]; count: number }
export function workspaceKey(entry: BoardEntry): string { return entry.workspaceId || entry.workspacePath || entry.workspaceTitle || 'unassigned' }

/** A flat workspace view keeps distinct workspaces with the same display name separate. */
export function buildWorkspaceNodes(groups: readonly BoardGroup[], tree: boolean): WorkspaceNode[] {
  const roots: WorkspaceNode[] = [], byKey = new Map<string, WorkspaceNode>()
  for (const entry of groups.flatMap(group => group.entries)) {
    if (!tree) {
      const key = `workspace:${workspaceKey(entry)}`
      let node = byKey.get(key)
      if (!node) { node = { key, title: entry.workspaceTitle, path: entry.workspacePath ?? '', entries: [], children: [], count: 0 }; byKey.set(key, node); roots.push(node) }
      node.entries.push(entry); node.count++
      continue
    }
    const path = (entry.workspacePath ?? '').replaceAll('\\', '/')
    const drive = /^[A-Za-z]:\//.exec(path)?.[0] ?? (path.startsWith('/') ? '/' : '')
    const parts = path.slice(drive.length).split('/').filter(Boolean)
    let parent = roots, prefix = drive
    const chain: WorkspaceNode[] = []
    for (const part of parts) {
      prefix += `${prefix.endsWith('/') || prefix === '' ? '' : '/'}${part}`
      const key = `path:${prefix}`
      let node = byKey.get(key)
      if (!node) { node = { key, title: part, path: prefix, entries: [], children: [], count: 0 }; byKey.set(key, node); parent.push(node) }
      chain.push(node); parent = node.children
    }
    // Workspace identity is explicit, even when two workspaces use the same folder.
    const key = `tree-workspace:${workspaceKey(entry)}`
    let leaf = byKey.get(key)
    if (!leaf) { leaf = { key, title: entry.workspaceTitle || path, path, entries: [], children: [], count: 0 }; byKey.set(key, leaf); parent.push(leaf) }
    leaf.entries.push(entry); leaf.count++
    for (const node of chain) node.count++
  }
  const compact = (nodes: WorkspaceNode[]): WorkspaceNode[] => nodes.map(node => {
    let value = { ...node, children: compact(node.children) }
    while (value.entries.length === 0 && value.children.length === 1) {
      const child = value.children[0]!
      value = { ...child, title: child.entries.length > 0 && value.title === child.title ? child.title : `${value.title}/${child.title}` }
    }
    return value
  }).sort((a, b) => a.path.localeCompare(b.path) || a.title.localeCompare(b.title) || a.key.localeCompare(b.key))
  return tree ? compact(roots) : roots.sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path) || a.key.localeCompare(b.key))
}
