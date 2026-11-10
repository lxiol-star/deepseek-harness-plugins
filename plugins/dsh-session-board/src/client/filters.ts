import type { BoardGroup } from '../shared/types.ts'

export type StatusFilter = 'all' | 'blocked' | 'running'
export type ArchiveFilter = 'all' | 'active' | 'archived'
export interface BoardFilters { query: string; status: StatusFilter; workspace: string; archive?: ArchiveFilter }
export const DEFAULT_FILTERS: BoardFilters = { query: '', status: 'all', workspace: '', archive: 'active' }

/** Filter without changing the model's state classification or ordering. */
export function filterGroups(groups: readonly BoardGroup[], filters: BoardFilters): BoardGroup[] {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return groups.map(group => ({ ...group, entries: group.entries.filter(entry => {
    // The DSH archive is mirrored, and a Wiki-completed session is archived in DSH
    // too once the workflow finishes; both sources keep the same visibility rule.
    const archived = entry.clientArchived === true || entry.archivedAt !== undefined
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

/** Final directory of a workspace path; empty when the path has no segments. */
function pathTail(path: string): string {
  const parts = path.replaceAll('\\', '/').replace(/\/+$/u, '').split('/').filter(Boolean)
  return parts.at(-1) ?? ''
}

/** Whether a workspace title is a directory path rather than a name. */
function isPathTitle(title: string, path: string): boolean {
  if (title.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(title)) return true
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/u, '')
  const chain = title.replaceAll('\\', '/')
  return chain !== '' && normalized !== '' && (normalized === chain || normalized.endsWith(`/${chain}`))
}

/**
 * Visible workspace name: the title, or its final directory when the host only
 * supplied a path. The absolute path never reaches the menu.
 *
 * @param title - workspace title reported by the host, possibly empty or a path.
 * @param path - workspace directory, possibly empty.
 * @returns the label to show.
 */
function displayTitle(title: string, path: string): string {
  if (title === '') return pathTail(path)
  return isPathTitle(title, path) ? pathTail(title) : title
}

/**
 * Workspace filter choices, keyed by the filter value the model compares.
 *
 * The label is the workspace title alone: the absolute path is long, repeats
 * every project's parent directory and made the dropdown unusable. Only
 * same-titled workspaces need a hint, and then the shortest distinct tail of
 * the path is enough to tell them apart.
 *
 * @param groups - board groups holding the entries to derive choices from.
 * @returns one `{ value, label }` per distinct workspace identity, sorted by label.
 */
export function workspaceChoices(groups: readonly BoardGroup[]): { value: string; label: string }[] {
  const byValue = new Map<string, { value: string; title: string; path: string }>()
  for (const entry of groups.flatMap(group => group.entries)) {
    const value = entry.workspaceId || entry.workspacePath || entry.workspaceTitle
    if (!value || byValue.has(value)) continue
    const path = entry.workspacePath ?? ''
    byValue.set(value, { value, title: displayTitle(entry.workspaceTitle, path) || pathTail(path) || value, path })
  }
  const titles = new Map<string, number>()
  for (const option of byValue.values()) titles.set(option.title, (titles.get(option.title) ?? 0) + 1)
  const labelled = new Set<string>()
  const labelOf = new Map<string, string>()
  for (const option of byValue.values()) {
    let label = option.title
    if ((titles.get(option.title) ?? 0) > 1) {
      const parts = option.path.replaceAll('\\', '/').replace(/\/+$/u, '').split('/').filter(Boolean)
      for (let depth = 1; depth <= parts.length; depth += 1) {
        const tail = parts.slice(-depth).join('/')
        // The title already is the folder name; a hint earns its place only
        // when it adds a parent segment.
        if (depth === 1 && tail === option.title) continue
        const candidate = `${option.title} · ${tail}`
        if (!labelled.has(candidate)) { label = candidate; break }
      }
    }
    labelled.add(label)
    labelOf.set(option.value, label)
  }
  return [...byValue.values()]
    .map(option => ({ value: option.value, label: labelOf.get(option.value) ?? option.title }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
