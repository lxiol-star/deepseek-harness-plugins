/**
 * The shared grouped list.
 *
 * Both forms render through this component: the docked column stacks groups
 * vertically in a narrow scroll area, the fullscreen board lays the same cards
 * out in a grid. Only CSS differs, so grouping, collapse and ordering have a
 * single implementation.
 */
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react'
import type { BoardGroup, BoardGroupId } from '../shared/types.ts'
import { buildWorkspaceNodes, type GroupingMode, type WorkspaceNode } from './workspace-tree.ts'
import type { WorkspaceGitInfo } from '../shared/workspace-meta.ts'
import { SessionCard } from './SessionCard.tsx'
import type { Translate } from './hooks.ts'
import { useAwayFromTop } from './hooks.ts'

/** Props of {@link BoardList}. */
export interface BoardListProps {
  grouping?: GroupingMode | undefined
  groups: readonly BoardGroup[]
  t: Translate
  /** Groups the user has collapsed, keyed by group id. */
  collapsed?: Readonly<Record<string, boolean>> | undefined
  onToggleGroup?: ((group: string) => void) | undefined
  onOpen: (id: string) => void
  onAck: (id: string) => void
  selectionDisabled?: boolean | undefined
  selected?: ReadonlySet<string> | undefined
  onToggleSelect?: ((id: string) => void) | undefined
  /** i18n key for the whole-list empty state. */
  emptyKey: string
  /** Render the back-to-top affordance. */
  backToTop?: boolean
  /** Workspace id → git facts; the project tree uses it, path fallback ignores it. */
  workspaceMeta?: Readonly<Record<string, WorkspaceGitInfo>> | undefined
  /** Open (creating on first use) a project's coordinator session. */
  onOpenCoordinator?: ((projectKey: string) => void) | undefined
}

/** One group heading. */
function GroupHeader({
  group,
  t,
  open,
  onToggle,
}: {
  group: BoardGroup
  t: Translate
  open: boolean
  onToggle: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className="sb-group-head"
      aria-expanded={open}
      aria-label={t('a11y.groupCount', { group: t(`group.${group.id}`), count: group.entries.length })}
      onClick={onToggle}
    >
      <svg className="sb-group-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sb-group-dot" aria-hidden="true" />
      <span>{t(`group.${group.id}`)}</span>
      <span className="sb-group-count">{group.entries.length}</span>
    </button>
  )
}

/** The list itself, without its scroll container. */
export function BoardList({
  groups,
  t,
  collapsed,
  onToggleGroup,
  onOpen,
  onAck,
  selected,
  onToggleSelect,
  selectionDisabled,
  emptyKey,
  grouping = 'status',
  workspaceMeta,
  onOpenCoordinator,
}: BoardListProps): ReactElement {
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)
  if (total === 0) return <div className="sb-empty">{t(emptyKey)}</div>

  if (grouping !== 'status') {
    const renderNode = (node: WorkspaceNode): ReactElement => {
      const open = collapsed?.[node.key] !== true
      const title = node.title || t('workspace.unassigned')
      const header = <button type="button" className="sb-group-head" aria-expanded={open} title={node.path} onClick={() => onToggleGroup?.(node.key)} aria-label={t('a11y.groupCount', { group: title, count: node.count })}>
        <span aria-hidden="true">{open ? '▾' : '▸'}</span><span className="sb-workspace-name">{title}</span>{node.subtitle ? <span className="sb-workspace-subtitle">{node.subtitle}</span> : null}<span className="sb-group-count">{node.count}</span>
      </button>
      const projectKey = node.projectKey
      return <section className="sb-workspace-node" key={node.key} data-open={open ? 'true' : 'false'} data-kind={node.kind}>
        {node.kind === 'project' && projectKey !== undefined && onOpenCoordinator !== undefined
          ? <div className="sb-workspace-head-row">{header}<button type="button" className="sb-workspace-action" title={t('workspace.coordinatorHint')} onClick={() => onOpenCoordinator(projectKey)}>{t('workspace.coordinator')}</button></div>
          : header}
        {open ? <div className="sb-workspace-body">
          {node.entries.length > 0 ? <BoardList groups={groups.map(group => ({ ...group, entries: group.entries.filter(entry => node.entries.includes(entry)) }))} t={t} collapsed={collapsed} onToggleGroup={onToggleGroup} onOpen={onOpen} onAck={onAck} selected={selected} onToggleSelect={onToggleSelect} selectionDisabled={selectionDisabled} emptyKey={emptyKey} workspaceMeta={workspaceMeta} onOpenCoordinator={onOpenCoordinator} /> : null}
          {node.children.map(renderNode)}
        </div> : null}
      </section>
    }
    return <>{buildWorkspaceNodes(groups, grouping === 'tree', workspaceMeta ?? {}).map(renderNode)}</>
  }
  return (
    <>
      {groups.map((group) => {
        if (group.entries.length === 0) return null
        const open = collapsed?.[group.id] !== true
        return (
          <section className="sb-group" data-group={group.id} data-open={open ? 'true' : 'false'} key={group.id}>
            <GroupHeader
              group={group}
              t={t}
              open={open}
              onToggle={() => onToggleGroup?.(group.id)}
            />
            {open ? <div className="sb-group-body">
              <ul className="sb-list" aria-label={t(`group.${group.id}`)}>
                {group.entries.map((entry) => (
                  <li key={entry.id}>
                    <SessionCard entry={entry} t={t} onOpen={onOpen} onAck={onAck} selected={selected?.has(entry.id) ?? false} {...(onToggleSelect ? { onToggleSelect } : {})} selectionDisabled={selectionDisabled ?? false} />
                  </li>
                ))}
              </ul>
            </div> : null}
          </section>
        )
      })}
    </>
  )
}

/** Props of {@link BoardScroll}. */
export interface BoardScrollProps extends BoardListProps {
  /** Class applied to the scroll container. */
  className?: string | undefined
}

/**
 * The scroll container plus its back-to-top control.
 *
 * The button appears only once the list is genuinely scrolled away from the
 * top, and honours reduced motion by jumping instantly.
 */
export function BoardScroll({ className, backToTop = true, ...list }: BoardScrollProps): ReactElement {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const away = useAwayFromTop(scrollRef)
  const toTop = useCallback((): void => {
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    scrollRef.current?.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
  }, [])
  return (
    <>
      <div className={className ?? 'sb-scroll'} ref={scrollRef} role="region" aria-label={list.t('a11y.list')}>
        <BoardList {...list} />
      </div>
      {backToTop && away ? (
        <button type="button" className="sb-top" onClick={toTop} aria-label={list.t('action.backToTop')} title={list.t('action.backToTop')}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 11V3M3 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : null}
    </>
  )
}

/** Local collapse state for a list that does not persist elsewhere. */
export function useGroupCollapse(initial: Record<string, boolean> = {}): [
  Record<string, boolean>,
  (group: BoardGroupId) => void,
] {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(initial)
  const toggle = useCallback((group: BoardGroupId): void => {
    setCollapsed(current => ({ ...current, [group]: current[group] !== true }))
  }, [])
  return useMemo(() => [collapsed, toggle], [collapsed, toggle])
}
