import type { BoardGroup } from '../shared/types.ts'

export type StatusFilter = 'all' | 'blocked' | 'running'
export type ArchiveFilter = 'all' | 'active' | 'archived'
export interface BoardFilters { query: string; status: StatusFilter; workspace: string; archive?: ArchiveFilter }
export const DEFAULT_FILTERS: BoardFilters = { query: '', status: 'all', workspace: '', archive: 'active' }

/** Filter without changing the model's state classification or ordering. */
export function filterGroups(groups: readonly BoardGroup[], filters: BoardFilters): BoardGroup[] {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return groups.map(group => ({ ...group, entries: group.entries.filter(entry => {
    const archived = entry.archivedAt !== undefined || entry.clientArchived === true
    if (filters.archive === 'active' && archived) return false
    if (filters.archive === 'archived' && !archived) return false
    if (filters.status === 'blocked' && entry.attentionKind !== 'blocked') return false
    if (filters.status === 'running' && entry.state !== 'running') return false
    if (filters.workspace !== '' && (entry.workspaceId || entry.workspacePath || entry.workspaceTitle) !== filters.workspace) return false
    const text = [entry.title, entry.workspaceTitle, entry.workspacePath ?? '', entry.preview.instruction, entry.preview.activity, entry.errorNote ?? '', ...(entry.preview.jobs ?? [])].join('\n').toLocaleLowerCase()
    return terms.every(term => text.includes(term))
  }) }))
}

export function workspaceOptions(groups: readonly BoardGroup[]): string[] {
  return [...new Set(groups.flatMap(group => group.entries.map(entry => entry.workspaceTitle)).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function workspaceChoices(groups: readonly BoardGroup[]): { value: string; label: string }[] {
  const options = new Map<string, { value: string; label: string }>()
  for (const entry of groups.flatMap(group => group.entries)) {
    const value = entry.workspaceId || entry.workspacePath || entry.workspaceTitle
    if (!value || options.has(value)) continue
    options.set(value, { value, label: entry.workspaceTitle + (entry.workspacePath ? ` · ${entry.workspacePath}` : '') })
  }
  return [...options.values()].sort((a, b) => a.label.localeCompare(b.label))
}
