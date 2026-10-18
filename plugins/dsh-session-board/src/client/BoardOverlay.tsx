/**
 * Form B: the fullscreen board.
 *
 * Mounted through the `shell.overlay` slot (the shell's additive, frame-wide
 * seat) but *rendered into `document.body`*. The portal is deliberate: on
 * macOS the Electron window's drag region is composed from element geometry
 * inside `#root`, so a full-window surface living there would swallow the
 * title-bar drag. A body-level layer is subtracted wholesale instead.
 *
 * Accessibility is handled here rather than inherited from a host dialog
 * component: the board is a full-bleed page-like surface, so it owns focus on
 * open, traps Tab inside its own controls, makes the rest of the page inert,
 * yields Escape/Tab to any newer dialog or menu, closes on Escape only while it
 * is the foreground layer, and restores the previously focused control on close.
 *
 * The header is also the window's drag surface. It carries the shell's own
 * `data-window-drag` mark — the one declaration in ui-web `base.css` turns into
 * `-webkit-app-region: drag` on darwin — plus `data-platform`, and it opens with
 * a passive `.sb-overlay-dragspace` gutter so the stylesheet can clear the macOS
 * traffic lights. Controls are explicitly `.sb-overlay-nodrag`, because the
 * window module's blanket subtraction of `body > :not(#root)` would otherwise
 * make the whole portalled surface undraggable.
 */
import { useEffect, useMemo, useRef, type CSSProperties, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import type { GroupingMode } from './workspace-tree.ts'
import type { BoardGroup } from '../shared/types.ts'
import { BoardScroll } from './BoardList.tsx'
import { useDocumentHidden, type Translate } from './hooks.ts'
import {
  focusableIn, inertBackground, isInsideMenu, isTopmostModal, modalLayers,
  resolveRestoreTarget, trapTabTarget,
} from './modal-focus.ts'

/** Props of {@link BoardOverlay}. */
export interface BoardOverlayProps {
  open: boolean
  grouping?: GroupingMode
  groups: readonly BoardGroup[]
  t: Translate
  density: 'compact' | 'full'
  online: boolean
  onClose: () => void
  onToggleDensity: () => void
  onOpen: (id: string) => void
  onAck: (id: string) => void
  selected?: ReadonlySet<string>
  onToggleSelect?: (id: string) => void
  emptyKey?: string
  toolbar?: ReactElement
  interactionDisabled?: boolean
  collapsedGroups: Readonly<Record<string, boolean>>
  onToggleGroup: (group: string) => void
}

/**
 * The platform marker the shell sets on `<html data-platform>` (`darwin` on the
 * macOS desktop shell), echoed on the board header.
 *
 * The board is portalled outside `#root`, so echoing the marker here lets the
 * stylesheet scope the traffic-light clearance to the overlay itself instead of
 * reaching back to the document element. The value is the shell's own marker,
 * not a normalized name, so it matches every other `data-platform` rule.
 */
function boardPlatformMarker(): string | undefined {
  const marker = globalThis.document?.documentElement?.dataset?.platform
  return marker === undefined || marker === '' ? undefined : marker
}

/** The fullscreen board, or null while closed. */
export function BoardOverlay(props: BoardOverlayProps): ReactElement | null {
  const {
    open, groups, grouping, t, density, online,
    onClose, onToggleDensity, onOpen, onAck, selected, onToggleSelect, toolbar, emptyKey, interactionDisabled,
    collapsedGroups, onToggleGroup,
  } = props

  const panelRef = useRef<HTMLDivElement | null>(null)

  // The document-level effects below bind once per open and read the latest
  // callbacks through refs, so a parent re-render never re-binds (and never
  // re-runs focus capture) just because a callback identity changed.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const restoreLabelsRef = useRef<readonly string[]>([])
  restoreLabelsRef.current = [t('action.openBoard'), t('action.closeBoard')]

  const hidden = useDocumentHidden()

  // Own focus — and the rest of the page — while open, and put both back exactly.
  useEffect(() => {
    if (!open) return
    const doc = globalThis.document
    if (doc === undefined || doc === null) return
    const panel = panelRef.current
    const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
    // The release must run before focus returns: an inert ancestor swallows it.
    const release = inertBackground(doc, panel)
    panel?.focus()
    return () => {
      release()
      resolveRestoreTarget({ saved: previous, doc, labels: restoreLabelsRef.current })?.focus()
    }
  }, [open])

  // Escape and Tab belong to the board only while it is the foreground layer.
  // A newer official dialog or an open menu keeps both: the board deliberately
  // marks its own Escape handled (bubble `preventDefault`) so the shell's
  // shortcut dispatcher passes, without stealing the event from anything above.
  useEffect(() => {
    if (!open) return
    const doc = globalThis.document
    if (doc === undefined || doc === null) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return
      const panel = panelRef.current
      if (panel === null) return
      if (!isTopmostModal(panel, modalLayers(doc))) return
      if (event.key === 'Escape') {
        if (event.shiftKey) return
        event.preventDefault()
        // A held key must not re-enter the close command on every repeat.
        if (!event.repeat) closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      // A menu inside the board owns traversal while it holds focus.
      if (isInsideMenu(doc.activeElement)) return
      const target = trapTabTarget(focusableIn(panel), doc.activeElement, event.shiftKey)
      if (target === null) return
      event.preventDefault()
      target.focus()
    }
    doc.addEventListener('keydown', onKeyDown)
    return () => { doc.removeEventListener('keydown', onKeyDown) }
  }, [open])

  const total = useMemo(
    () => groups.reduce((sum, group) => sum + group.entries.length, 0),
    [groups],
  )

  if (!open) return null
  const doc = globalThis.document
  if (doc === undefined || doc === null) return null

  return createPortal(
    <div
      className="sb-overlay sb-root"
      data-session-board-version="0.3.5"
      data-density={density}
      data-quiet={hidden ? 'true' : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={t('a11y.board')}
      ref={panelRef}
      tabIndex={-1}
      style={{ outline: 'none' } as CSSProperties}
    >
      <div className="sb-overlay-head" data-window-drag data-platform={boardPlatformMarker()}>
        {/* Passive drag surface, and the macOS traffic-light gutter. */}
        <div className="sb-overlay-dragspace" aria-hidden="true" />
        <span className="sb-overlay-title">{t('panel.title')}</span>
        <span className="sb-count">{t('panel.count', { count: total })}</span>
        {online ? null : <span className="sb-offline">{t('status.hostOffline')}</span>}
        <button
          type="button"
          className="sb-btn sb-overlay-nodrag"
          aria-label={density === 'compact' ? t('action.densityFull') : t('action.densityCompact')}
          title={density === 'compact' ? t('action.densityFull') : t('action.densityCompact')}
          aria-pressed={density === 'compact'}
          onClick={onToggleDensity}
        >
          <svg width="14" height="14" viewBox="0 0 13 13" aria-hidden="true">
            <path d="M1.5 3h10M1.5 6.5h10M1.5 10h10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="sb-btn sb-overlay-nodrag"
          aria-label={t('action.closeBoard')}
          title={t('action.closeBoard')}
          onClick={onClose}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {toolbar}
      <div className="sb-overlay-body">
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
          interactionDisabled={interactionDisabled}
        />
      </div>
    </div>,
    doc.body,
  )
}
