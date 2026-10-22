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
  /**
   * Open (creating on first use) a project's coordinator session.
   * A returned promise keeps the project's button busy until it settles.
   */
  onOpenCoordinator?: ((projectKey: string) => void | Promise<void>) | undefined
}

/** Per-project coordinator button state, keyed by normalized project key. */
type CoordinatorState = Readonly<Record<string, 'pending' | 'failed'>>

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
  // A project tree may hold branches without cards yet; the empty hint only
  // applies when there is no workspace hierarchy to show either.
  const hasProjectNodes = grouping === 'tree'
    && Object.values(workspaceMeta ?? {}).some(info => info.projectKey !== undefined)
  const [coordinator, setCoordinator] = useState<CoordinatorState>({})
  const coordinatorBusy = useRef<Set<string>>(new Set())
  if (total === 0 && !hasProjectNodes) return <div className="sb-empty">{t(emptyKey)}</div>

  // The host creates the session on first use, so a slow round trip must keep
  // the button from firing a second create. State is per project: acting on B
  // must not clear or re-enable A's pending state. Rejections from the callback
  // are the failure signal, so the button surfaces them as an inline error.
  const clearCoordinator = (projectKey: string): void => {
    setCoordinator(current => {
      if (!(projectKey in current)) return current
      const next = { ...current }
      delete next[projectKey]
      return next
    })
  }
  const failCoordinator = (projectKey: string): void => {
    coordinatorBusy.current.delete(projectKey)
    setCoordinator(current => ({ ...current, [projectKey]: 'failed' }))
  }
  const openCoordinator = (projectKey: string): void => {
    if (onOpenCoordinator === undefined || coordinatorBusy.current.has(projectKey)) return
    coordinatorBusy.current.add(projectKey)
    setCoordinator(current => ({ ...current, [projectKey]: 'pending' }))
    let result: void | Promise<void>
    try {
      result = onOpenCoordinator(projectKey)
    } catch {
      failCoordinator(projectKey)
      return
    }
    if (result === undefined) {
      coordinatorBusy.current.delete(projectKey)
      clearCoordinator(projectKey)
      return
    }
    void result.then(
      () => {
        coordinatorBusy.current.delete(projectKey)
        clearCoordinator(projectKey)
      },
      () => { failCoordinator(projectKey) },
    )
  }

  if (grouping !== 'status') {
    const renderNode = (node: WorkspaceNode): ReactElement => {
      const open = collapsed?.[node.key] !== true
      const title = node.title || t('workspace.unassigned')
      // A leaf with no cards and no children has nothing to disclose; render a
      // static heading instead of a fake expand/collapse control.
      const expandable = node.kind === 'project' || node.entries.length > 0 || node.children.length > 0
      const label = node.subtitle === undefined
        ? t('a11y.groupCount', { group: title, count: node.count })
        : t('a11y.groupBranchCount', { group: title, branch: node.subtitle, count: node.count })
      const content = <><span className="sb-workspace-name">{title}</span>{node.subtitle ? <span className="sb-workspace-subtitle">{node.subtitle}</span> : null}<span className="sb-group-count">{node.count}</span></>
      const header = expandable
        ? <button type="button" className="sb-group-head" aria-expanded={open} title={node.path} onClick={() => onToggleGroup?.(node.key)} aria-label={label}><span aria-hidden="true">{open ? '▾' : '▸'}</span>{content}</button>
        : <div className="sb-group-head sb-group-head--static" title={node.path}><span className="sb-workspace-spacer" aria-hidden="true" />{content}</div>
      const projectKey = node.projectKey
      const state = projectKey === undefined ? undefined : coordinator[projectKey]
      const pending = state === 'pending'
      const failed = state === 'failed'
      return <section className="sb-workspace-node" key={node.key} data-open={open ? 'true' : 'false'} data-kind={node.kind}>
        {node.kind === 'project' && projectKey !== undefined && onOpenCoordinator !== undefined
          ? <div className="sb-workspace-head-row">{header}<button type="button" className="sb-workspace-action" title={t('workspace.coordinatorHint')} disabled={pending} aria-busy={pending ? true : undefined} onClick={() => openCoordinator(projectKey)}>{t('workspace.coordinator')}</button></div>
          : header}
        {failed ? <p className="sb-workspace-error" role="alert">{t('workspace.coordinatorFailed')}</p> : null}
        {expandable && open ? <div className="sb-workspace-body">
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
