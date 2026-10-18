import { useMemo, type ReactElement } from 'react'
import type { BoardGroup } from '../shared/types.ts'
import type { GroupingMode } from './workspace-tree.ts'
import type { Translate } from './hooks.ts'
import { DEFAULT_FILTERS, workspaceChoices, type ArchiveFilter, type BoardFilters, type StatusFilter } from './filters.ts'

export function BoardFilterBar({ groups, filters, onChange, shown, t, grouping, onGrouping }: {
  groups: readonly BoardGroup[]; filters: BoardFilters; onChange: (filters: BoardFilters) => void; shown: number; t: Translate; grouping?: GroupingMode; onGrouping?: (mode: GroupingMode) => void
}): ReactElement {
  const workspaces = useMemo(() => workspaceChoices(groups), [groups])
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)
  const active = filters.query !== '' || filters.status !== 'all' || filters.workspace !== '' || (filters.archive ?? 'active') !== 'active'
  return <div className="sb-filters" role="search" aria-label={t('filter.label')}>
    <input type="search" className="sb-filter-search" aria-label={t('filter.search')} placeholder={t('filter.search')} value={filters.query} onChange={event => onChange({ ...filters, query: event.target.value })} />
    <div className="sb-filter-row">
      <select aria-label={t('filter.status')} value={filters.status} onChange={event => onChange({ ...filters, status: event.target.value as StatusFilter })}>
        <option value="all">{t('filter.all')}</option><option value="blocked">{t('filter.blocked')}</option><option value="running">{t('filter.running')}</option>
      </select>
      <select aria-label={t('filter.workspace')} value={filters.workspace} onChange={event => onChange({ ...filters, workspace: event.target.value })}>
        <option value="">{t('filter.allWorkspaces')}</option>
        {filters.workspace !== '' && !workspaces.some(option => option.value === filters.workspace) ? <option value={filters.workspace}>{filters.workspace}</option> : null}
        {workspaces.map(workspace => <option key={workspace.value} value={workspace.value}>{workspace.label}</option>)}
      </select>
      {active ? <button type="button" className="sb-btn" onClick={() => onChange({ ...DEFAULT_FILTERS })}>{t('filter.clear')}</button> : null}
    </div>
    <div className="sb-filter-row">
      <select aria-label={t('filter.archive')} value={filters.archive ?? 'active'} onChange={event => onChange({ ...filters, archive: event.target.value as ArchiveFilter })}>
        <option value="active">{t('filter.archiveActive')}</option><option value="archived">{t('filter.archiveOnly')}</option><option value="all">{t('filter.archiveAll')}</option>
      </select>
      {onGrouping ? <select aria-label={t('filter.grouping')} value={grouping ?? 'status'} onChange={event => onGrouping(event.target.value as GroupingMode)}>
        <option value="status">{t('filter.byStatus')}</option><option value="workspace">{t('filter.byWorkspace')}</option><option value="tree">{t('filter.byTree')}</option>
      </select> : null}
    </div>
    <span className="sb-filter-count" role="status">{t('filter.count', { shown, total })}</span>
  </div>
}
