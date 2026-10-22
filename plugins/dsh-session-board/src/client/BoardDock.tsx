/**
 * Form A: the docked column.
 *
 * It is a real flex sibling of the conversation, so it reserves space instead
 * of covering the chat. Collapse state and width belong to the caller (they
 * are persisted), while the drag gesture owns a local width so the store is
 * written once per gesture instead of once per frame.
 */
import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement,
} from 'react'
import type { GroupingMode } from './workspace-tree.ts'
import type { BoardGroup } from '../shared/types.ts'
import { BoardScroll } from './BoardList.tsx'
import type { WorkspaceGitInfo } from '../shared/workspace-meta.ts'
import type { Translate } from './hooks.ts'
import { useDocumentHidden } from './hooks.ts'

/** Narrowest and widest the column may be dragged, in pixels. */
export const DOCK_MIN_WIDTH = 260
export const DOCK_MAX_WIDTH = 480
/** Width of the collapsed rail, in pixels. */
export const DOCK_RAIL_WIDTH = 40

/** Clamp a requested width into the allowed range. */
export function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) return DOCK_MIN_WIDTH
  return Math.min(DOCK_MAX_WIDTH, Math.max(DOCK_MIN_WIDTH, Math.round(width)))
}

/** Props of {@link BoardDock}. */
export interface BoardDockProps {
  grouping?: GroupingMode
  groups: readonly BoardGroup[]
  t: Translate
  collapsed: boolean
  width: number
  density: 'compact' | 'full'
  /** Whether the host feed is live; false shows the local-only notice. */
  online: boolean
  onToggleCollapse: () => void
  onWidth: (width: number) => void
  onToggleDensity: () => void
  onOpenBoard: () => void
  onOpen: (id: string) => void
  onAck: (id: string) => void
  selected?: ReadonlySet<string>
  onToggleSelect?: (id: string) => void
  emptyKey?: string
  toolbar?: ReactElement
  selectionDisabled?: boolean
  collapsedGroups: Readonly<Record<string, boolean>>
  onToggleGroup: (group: string) => void
  /** Workspace id → git facts, for the project tree. */
  workspaceMeta?: Readonly<Record<string, WorkspaceGitInfo>>
}

/** A small icon button. */
function IconButton({
  label, onClick, children, pressed,
}: {
  label: string
  onClick: () => void
  children: ReactElement
  pressed?: boolean
}): ReactElement {
  return (
    <button
      type="button"
      className="sb-btn"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** The docked column. */
export function BoardDock(props: BoardDockProps): ReactElement {
  const {
    groups, grouping, t, collapsed, width, density, online,
    onToggleCollapse, onWidth, onToggleDensity, onOpenBoard,
    onOpen, onAck, selected, onToggleSelect, toolbar, emptyKey, selectionDisabled, collapsedGroups, onToggleGroup, workspaceMeta,
  } = props

  const [dragging, setDragging] = useState(false)
  const [liveWidth, setLiveWidth] = useState(width)
  const dragState = useRef<{ pointerId: number; startX: number; startWidth: number; frame: number | null; latest: number } | null>(null)

  const hidden = useDocumentHidden()
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0)

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragState.current = { startX: event.clientX, startWidth: clampDockWidth(width), pointerId: event.pointerId, frame: null, latest: clampDockWidth(width) }
    setDragging(true)
  }, [width])

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current
    if (state === null || state.pointerId !== event.pointerId || event.currentTarget.hasPointerCapture(event.pointerId) === false) return
    const next = clampDockWidth(state.startWidth + (event.clientX - state.startX))
    state.latest = next
    // Throttle to one width write per frame: the gesture must not queue renders.
    state.frame ??= globalThis.requestAnimationFrame(() => {
      if (dragState.current === null) return
      dragState.current.frame = null
      setLiveWidth(dragState.current.latest)
    })
  }, [])

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const state = dragState.current
    if (state === null || state.pointerId !== event.pointerId) return
    if (state.frame !== null) globalThis.cancelAnimationFrame(state.frame)
    dragState.current = null
    setDragging(false)
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Capture already gone.
    }
    setLiveWidth(state.latest)
    onWidth(state.latest)
  }, [onWidth])

  // Keep the rendered width in step when the caller changes it externally.
  const effectiveWidth = dragging ? liveWidth : clampDockWidth(width)
  useLayoutEffect(() => {
    const root = globalThis.document?.documentElement
    root?.style.setProperty('--sb-dock-track', `${collapsed ? DOCK_RAIL_WIDTH : effectiveWidth}px`)
  }, [collapsed, effectiveWidth])
  useEffect(() => () => {
    if (dragState.current?.frame != null) globalThis.cancelAnimationFrame(dragState.current.frame)
    globalThis.document?.documentElement.style.removeProperty('--sb-dock-track')
  }, [])

  if (collapsed) {
    return (
      <aside
        className="sb-dock sb-root"
        data-session-board-version="0.7.1"
        data-dsh-session-board=""
        data-collapsed="true"
        data-density={density}
        data-quiet={dragging || hidden ? 'true' : undefined}
        style={{ '--sb-dock-width': `${DOCK_RAIL_WIDTH}px` } as CSSProperties}
        role="button"
        tabIndex={0}
        aria-label={t('action.show')}
        title={t('action.show')}
        onClick={onToggleCollapse}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onToggleCollapse()
        }}
      >
        <div className="sb-rail">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{t('panel.title')}</span>
          <span className="sb-count">{total}</span>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="sb-dock sb-root"
        data-session-board-version="0.7.1"
      data-dsh-session-board=""
      data-collapsed="false"
      data-density={density}
      data-dragging={dragging ? 'true' : undefined}
      data-quiet={dragging || hidden ? 'true' : undefined}
      style={{ '--sb-dock-width': `${effectiveWidth}px` } as CSSProperties}
      aria-label={t('a11y.dock')}
      role="complementary"
    >
      <button className="sb-auto-rail" type="button" onClick={onOpenBoard} aria-label={t('action.openBoard')}>
        <span aria-hidden="true">▦</span><span>{t('panel.title')}</span><span>{total}</span>
      </button>
      <div className="sb-dock-body">
        <div className="sb-head">
          <span className="sb-title">{t('panel.title')}</span>
          <span className="sb-count">{total}</span>
          <IconButton label={t('action.openBoard')} onClick={onOpenBoard}>
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
              <path d="M1.5 1.5h4v4h-4zM7.5 1.5h4v4h-4zM1.5 7.5h4v4h-4zM7.5 7.5h4v4h-4z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </IconButton>
          <IconButton
            label={density === 'compact' ? t('action.densityFull') : t('action.densityCompact')}
            pressed={density === 'compact'}
            onClick={onToggleDensity}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
              <path d="M1.5 3h10M1.5 6.5h10M1.5 10h10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </IconButton>
          <IconButton label={t('action.collapse')} onClick={onToggleCollapse}>
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
              <path d="M9 3L5 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
        </div>
        {online ? null : <div className="sb-offline">{t('status.hostOffline')}</div>}
        {toolbar}
        <BoardScroll
          groups={groups}
          grouping={grouping}
          t={t}
          emptyKey={emptyKey ?? "empty.noSessions"}
          collapsed={collapsedGroups}
          onToggleGroup={onToggleGroup}
          onOpen={onOpen}
          onAck={onAck}
          selected={selected}
          onToggleSelect={onToggleSelect}
          selectionDisabled={selectionDisabled}
          workspaceMeta={workspaceMeta}
        />
      </div>
      <div
        className="sb-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label={t('action.resize')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        tabIndex={0}
        aria-valuemin={DOCK_MIN_WIDTH}
        aria-valuemax={DOCK_MAX_WIDTH}
        aria-valuenow={effectiveWidth}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          onWidth(clampDockWidth(width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 64 : 16)))
        }}
      />
    </aside>
  )
}
