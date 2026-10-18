/**
 * One session card.
 *
 * The card is pure: everything it shows was derived by the shared board model,
 * and it computes nothing itself except text formatting. It is memoized on the
 * content key in `card-key.ts`, so the one-second clock that advances elapsed
 * time re-renders only the running cards whose displayed second actually
 * changed — a list of fifty idle cards costs nothing per tick.
 *
 * Cards show a short summary by default. Expanded cards reveal the instruction,
 * detailed metrics and a scrollable preview while keeping header and footer fixed. Each thing a user can do
 * is a genuine control — the title is a real `<button>`, selection is a real
 * `<input type="checkbox">` — and no parent key handler intercepts their keys.
 * Clicking the card's dead space still opens the session, but only when the
 * click hit no control and selected no text.
 */
import { memo, useState, type CSSProperties, type MouseEvent, type ReactElement } from 'react'
import { formatElapsed, formatTokensPerSecond } from '../shared/metrics.ts'
import type { BoardEntry } from '../shared/types.ts'
import { formatCount, type Translate } from './hooks.ts'
import { sameCard } from './card-key.ts'

/** Props of {@link SessionCard}. */
export interface SessionCardProps {
  entry: BoardEntry
  t: Translate
  onOpen: (id: string) => void
  onAck: (id: string) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  /** True while a batch write owns the selection: the checkbox is disabled. */
  interactionDisabled?: boolean
}

/**
 * Elements that own their own activation.
 *
 * The nested controls stop propagation themselves; this guard is the second
 * line of defence so a click on any control can never also open the session.
 */
const INTERACTIVE = 'button, input, a, select, textarea, [tabindex], [role="button"], [contenteditable="true"]'

/** Whether the live selection's range begins inside `element`. */
function selectsInside(element: HTMLElement): boolean {
  const selection = globalThis.getSelection?.()
  if (selection === null || selection === undefined) return false
  if (selection.isCollapsed || selection.rangeCount === 0) return false
  return element.contains(selection.getRangeAt(0).commonAncestorContainer)
}

/*
 * The card's chrome lives in `css.ts`, which this change does not touch. These
 * resets keep the new semantic controls the same size and colour as the
 * decorated markup they replace: a `<button>` otherwise brings its UA border,
 * padding and font, and a checkbox otherwise keeps its native appearance.
 */
const TITLE_STYLE: CSSProperties = {
  background: 'none', border: 0, padding: 0, margin: 0,
  fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit',
  color: 'inherit', textAlign: 'left', cursor: 'pointer',
}
const SELECT_STYLE: CSSProperties = { appearance: 'none', WebkitAppearance: 'none', margin: 0, cursor: 'pointer' }
/** The preview is the only flexible row; header, pills and footer never shrink. */
const CONTENT_STYLE: CSSProperties = { flex: '1 1 auto', minHeight: 0 }
const FIXED_STYLE: CSSProperties = { flexShrink: 0 }
const FOOTER_STYLE: CSSProperties = {
  flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'inherit', minWidth: 0,
}
/** Inside the scroll region nothing is clamped: the reader scrolls, nothing truncates. */
const BODY_STYLE: CSSProperties = { display: 'block', WebkitLineClamp: 'unset' }

/**
 * Open the session when the click landed on the card itself.
 *
 * A click that hit a control, a second click of a multi-click selection, or a
 * click made while dragging out a text selection must not navigate.
 */
function onCardClick(event: MouseEvent<HTMLDivElement>, id: string, onOpen: (id: string) => void): void {
  const target = event.target as HTMLElement | null
  if (target !== null && target.closest(INTERACTIVE) !== null) return
  if (event.detail > 1) return
  if (selectsInside(event.currentTarget)) return
  onOpen(id)
}

/** The card body. */
function SessionCardBody({
  entry,
  t,
  onOpen,
  onAck,
  selected = false,
  onToggleSelect,
  interactionDisabled = false,
}: SessionCardProps): ReactElement {
  const [expanded, setExpanded] = useState(false)
  const { metrics, progress, preview } = entry

  const pills: ReactElement[] = []
  if (entry.clientArchived === true) pills.push(<span className="sb-pill sb-pill--archived" key="archived">{t('card.clientArchived')}</span>)
  if (entry.archivedAt !== undefined) pills.push(<span className="sb-pill sb-pill--archived" key="archived-wiki">{t('card.archived')}</span>)
  if (entry.pendingKey !== null) {
    pills.push(<span className="sb-pill" key="pending">{t(entry.pendingKey)}</span>)
  } else if (entry.noteKey !== null) {
    pills.push(<span className="sb-pill sb-pill--state" key="note">{t(entry.noteKey)}</span>)
  }
  if (entry.isSubagent) pills.push(<span className="sb-pill" key="sub">{t('card.subagentBadge')}</span>)
  if (metrics.liveJobs > 0) {
    pills.push(<span className="sb-pill" key="jobs">{t('card.jobs', { count: formatCount(metrics.liveJobs) })}</span>)
  }
  if (metrics.runningSubagents > 0) {
    pills.push(<span className="sb-pill" key="subs">{t('card.subagents', { count: formatCount(metrics.runningSubagents) })}</span>)
  }
  if (entry.isCurrent) pills.push(<span className="sb-pill" key="cur">{t('card.current')}</span>)

  const elapsed = formatElapsed(metrics.elapsedMs)
  const total = formatElapsed(metrics.totalBusyMs)
  const rate = formatTokensPerSecond(metrics.rateTokS)
  const figures: ReactElement[] = []
  if (progress.turnN !== null) {
    figures.push(
      <span className="sb-metric sb-metric--strong" key="turn">
        {progress.stepM === null
          ? t('card.turn', { n: progress.turnN })
          : t('card.turnStep', { n: progress.turnN, m: progress.stepM })}
      </span>,
    )
  }
  if (elapsed !== null) figures.push(<span className="sb-metric sb-metric--strong" key="elapsed">{t('card.elapsed', { value: elapsed })}</span>)
  else if (total !== null) figures.push(<span className="sb-metric" key="total">{t('card.elapsedTotal', { value: total })}</span>)
  if (expanded && rate !== null) figures.push(<span className="sb-metric" key="rate">{t('card.rate', { value: rate })}</span>)
  if (expanded && metrics.cacheHitPct !== null) figures.push(<span className="sb-metric" key="cache">{t('card.cache', { value: metrics.cacheHitPct })}</span>)
  if (expanded && (metrics.outputTokens !== null || metrics.inputTokens !== null)) {
    figures.push(
      <span className="sb-metric" key="tokens">
        {t('card.tokens', {
          output: formatCount(metrics.outputTokens ?? 0),
          input: formatCount(metrics.inputTokens ?? 0),
        })}
      </span>,
    )
  }

  const acknowledge = entry.group === 'attention' && entry.attentionKind !== 'blocked'

  return (
    <div
      className="sb-card"
      data-state={entry.state}
      data-expanded={expanded ? 'true' : 'false'}
      data-current={entry.isCurrent ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      aria-label={entry.title}
      role="group"
      onClick={(event) => { if (!interactionDisabled) onCardClick(event, entry.id, onOpen) }}
    >
      {onToggleSelect ? (
        <input
          type="checkbox"
          className="sb-card-select"
          checked={selected}
          disabled={interactionDisabled}
          aria-label={selected ? t('batch.deselect') : t('batch.select')}
          style={interactionDisabled ? { ...SELECT_STYLE, opacity: 0.45, cursor: 'default' } : SELECT_STYLE}
          onClick={(event) => { event.stopPropagation() }}
          onKeyDown={(event) => { event.stopPropagation() }}
          onChange={() => { onToggleSelect(entry.id) }}
        />
      ) : null}
      <span className="sb-card__halo" aria-hidden="true" />
      <div className="sb-card-head" style={FIXED_STYLE}>
        <button
          type="button"
          className="sb-card-title"
          title={entry.title}
          style={TITLE_STYLE}
          aria-label={t('a11y.card', { title: entry.title })}
          disabled={interactionDisabled}
          onClick={(event) => { event.stopPropagation(); onOpen(entry.id) }}
        >
          {entry.title}
        </button>
        {entry.workspaceTitle === '' ? null : (
          <span className="sb-card-where" title={entry.workspaceTitle}>{entry.workspaceTitle}</span>
        )}
      </div>
      {pills.length > 0 ? (
        <div className="sb-pill-row" style={FIXED_STYLE}>
          <span className="sb-state-dot" aria-hidden="true" />
          {pills}
        </div>
      ) : null}
      <div className="sb-card-content" style={CONTENT_STYLE} tabIndex={expanded ? 0 : undefined} role="group" aria-label={t('a11y.cardContent')}>
        {expanded && (preview.jobs?.length ?? 0) > 0 ? <div className="sb-job-preview"><span className="sb-line-label">{t('card.background')}</span>{preview.jobs?.map((job, index) => <div key={`${index}:${job}`} className="sb-job-row">{job}</div>)}</div> : null}
        {expanded && preview.instruction !== '' ? (
          <div className="sb-line sb-line--instruction" style={BODY_STYLE}>
            <span className="sb-line-label">{t('card.instruction')}</span>{preview.instruction}
          </div>
        ) : null}
        {entry.errorNote !== null ? (
          <div className="sb-line sb-line--error" style={BODY_STYLE}>
            <span className="sb-line-label">{t('note.error')}</span>{entry.errorNote}
          </div>
        ) : preview.activity !== '' ? (
          <div className="sb-line" style={BODY_STYLE}>
            <span className="sb-line-label">{t('card.activity')}</span>{preview.activity}
          </div>
        ) : !expanded || preview.instruction === '' ? (
          <div className="sb-line" style={BODY_STYLE}>{preview.instruction || t('card.noPreview')}</div>
        ) : null}
      </div>
      <div className="sb-card-footer" style={FOOTER_STYLE}>
          {figures.length > 0 ? <div className="sb-metrics">{figures}</div> : null}
          {expanded && progress.ratio !== null ? (
            <div className="sb-progress" title={t('card.progressEstimate')} role="progressbar" aria-label={t('card.progressEstimate')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.ratio * 100)}>
              <div className="sb-progress-fill" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
            </div>
          ) : null}
          <button type="button" className="sb-card-details sb-btn" aria-expanded={expanded} disabled={interactionDisabled}
            onClick={event => { event.stopPropagation(); setExpanded(value => !value) }}>
            {t(expanded ? 'card.hideDetails' : 'card.showDetails')}
          </button>
          {acknowledge ? (
            <button
              className="sb-ack"
              type="button"
              onClick={(event) => { event.stopPropagation(); onAck(entry.id) }}
            >
              {t('card.ack')}
            </button>
          ) : null}
      </div>
    </div>
  )
}

/**
 * Content-addressed memo boundary.
 *
 * The translator and the open/ack callbacks are compared by identity here; the
 * entry and the selection props go through `sameCard`, which is unit-tested on
 * its own.
 */
export const SessionCard = memo(SessionCardBody, (previous, next) =>
  previous.t === next.t
  && previous.onOpen === next.onOpen
  && previous.onAck === next.onAck
  && sameCard(previous, next))
