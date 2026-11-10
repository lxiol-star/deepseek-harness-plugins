import { useMemo, type ReactElement, type ReactNode } from 'react'
import type { BoardGroup } from '../shared/types.ts'
import type { GroupingMode } from './workspace-tree.ts'
import type { Translate } from './hooks.ts'
import { DEFAULT_FILTERS, workspaceChoices, type ArchiveFilter, type BoardFilters, type StatusFilter } from './filters.ts'

/**
 * One native select in the compact filter strip.
 *
 * The real control stays a `<select>` (keyboard, type-ahead and the platform
 * menu keep working); the wrapper only paints the shared chrome and the
 * chevron, so selects and buttons read as one control family.
 */
function FilterSelect({ label, value, onChange, className, children }: {
  label: string; value: string; onChange: (value: string) => void; className?: string; children: ReactNode
}): ReactElement {
  return <span className={className === undefined ? 'sb-select' : `sb-select ${className}`}>
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{children}</select>
    <span className="sb-select-chevron" aria-hidden="true" />
  </span>
}

/**
 * Search, filters, grouping and the match count.
 *
 * Layout is one row on a board-width panel and two rows (search + count, then
 * the controls) on a narrow panel: the dock and a split window stay readable
 * instead of stretching every select to an unreadable width.
 */
export function BoardFilterBar({ groups, filters, onChange, shown, t, grouping, onGrouping }: {
  groups: readonly BoardGroup[]; filters: BoardFilters; onChange: (filters: BoardFilters) => void; shown: number; t: Translate; grouping?: GroupingMode; onGrouping?: (mode: GroupingMode) => void
}): ReactElement {
  const workspaces = useMemo(() => workspaceChoices(groups), [groups])
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)
  const active = filters.query !== '' || filters.status !== 'all' || filters.workspace !== '' || (filters.archive ?? 'active') !== 'active'
  const archivedOnly = (filters.archive ?? 'active') === 'archived'
  // A kept-but-unlisted value means its workspace left the board; it must not
  // read as a raw id or an absolute path in the menu.
  const staleWorkspace = filters.workspace !== '' && !workspaces.some(option => option.value === filters.workspace)
  return <div className="sb-filters" role="search" aria-label={t('filter.label')}>
    <div className="sb-filter-search">
      <svg className="sb-filter-search-icon" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="6.2" cy="6.2" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9.4 9.4l3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        aria-label={t('filter.search')}
        placeholder={t('filter.search')}
        value={filters.query}
        onChange={event => onChange({ ...filters, query: event.target.value })}
      />
    </div>
    {active ? <button type="button" className="sb-filter-clear" onClick={() => onChange({ ...DEFAULT_FILTERS })}>{t('filter.clear')}</button> : null}
    <div className="sb-filter-controls">
      <FilterSelect label={t('filter.status')} value={filters.status} onChange={value => onChange({ ...filters, status: value as StatusFilter })}>
        <option value="all">{t('filter.all')}</option>
        <option value="blocked">{t('filter.blocked')}</option>
        <option value="running">{t('filter.running')}</option>
      </FilterSelect>
      <FilterSelect label={t('filter.workspace')} value={filters.workspace} className="sb-select--workspace" onChange={value => onChange({ ...filters, workspace: value })}>
        <option value="">{t('filter.allWorkspaces')}</option>
        {staleWorkspace ? <option value={filters.workspace}>{t('filter.unknownWorkspace')}</option> : null}
        {workspaces.map(workspace => <option key={workspace.value} value={workspace.value}>{workspace.label}</option>)}
      </FilterSelect>
      <FilterSelect label={t('filter.archive')} value={filters.archive ?? 'active'} onChange={value => onChange({ ...filters, archive: value as ArchiveFilter })}>
        <option value="active">{t('filter.archiveActive')}</option>
        <option value="archived">{t('filter.archiveOnly')}</option>
        <option value="all">{t('filter.archiveAll')}</option>
      </FilterSelect>
      <button
        type="button"
        className="sb-filter-toggle"
        aria-pressed={archivedOnly}
        title={t('filter.onlyArchived')}
        onClick={() => onChange({ ...filters, archive: archivedOnly ? 'active' : 'archived' })}
      >{t('filter.onlyArchived')}</button>
      {onGrouping ? <FilterSelect label={t('filter.grouping')} value={grouping ?? 'status'} onChange={value => onGrouping(value as GroupingMode)}>
        <option value="status">{t('filter.byStatus')}</option>
        <option value="workspace">{t('filter.byWorkspace')}</option>
        <option value="tree">{t('filter.byTree')}</option>
      </FilterSelect> : null}
    </div>
    <span className="sb-filter-count" role="status">{t('filter.count', { shown, total })}</span>
  </div>
}
