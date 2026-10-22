import { useEffect, type ReactElement } from 'react'
import { en } from './locales.ts'
import type { BoardGroup } from '../shared/types.ts'
import type { BatchController } from './batch.ts'
import { useSnapshot, type Translate } from './hooks.ts'

export function BatchToolbar({ controller, groups, visibleGroups = groups, t }: { controller: BatchController; groups: readonly BoardGroup[]; visibleGroups?: readonly BoardGroup[]; t: Translate }): ReactElement {
  const state = useSnapshot(controller, value => value)
  const busy = state.phase === 'previewing' || state.phase === 'archiving'
  const entries = groups.flatMap(group => group.entries)
  const visibleIds = visibleGroups.flatMap(group => group.entries.map(entry => entry.id))
  const hiddenSelected = state.selected.filter(id => !visibleIds.includes(id)).length
  const titles = new Map(entries.map(entry => [entry.id, entry.title]))
  useEffect(() => { controller.reconcile(entries.map(entry => entry.id)) }, [controller, groups])
  return (
    <section className="sb-batch" aria-label={t('batch.label')}>
      <div className="sb-batchbar">
        <span className="sb-batchbar__count">{t('batch.selected', { count: state.selected.length })}</span>
        <button className="sb-btn" type="button" disabled={busy || visibleIds.length === 0} onClick={() => controller.selectAll(visibleIds)}>{t('batch.all')}</button>
        <button className="sb-btn" type="button" disabled={busy || state.selected.length === 0} onClick={controller.clear}>{t('batch.clear')}</button>
        <button className="sb-batchbar__action" type="button" disabled={busy || state.selected.length === 0} onClick={() => { void controller.preview() }}>{t(busy ? 'batch.working' : 'batch.preview')}</button>
      </div>
      {hiddenSelected > 0 ? <div className="sb-batch-status">{t('batch.hiddenSelected', { count: hiddenSelected })}</div> : null}
      {state.preview !== null && state.phase === 'confirming' ? (
        <div className="sb-batch-preview" role="region" aria-label={t('batch.confirmTitle')}>
          <strong>{t('batch.confirmTitle')}</strong>
          <p>{t('batch.destination')}</p>
          <ul>{state.preview.summary.results.map(row => <li key={row.session}>{titles.get(row.session) || row.session}<small className="sb-batch-source">{row.source}</small>{state.preview?.summary.scope?.entries.filter(entry => entry.session === row.session).map(entry => <small key={entry.session} className="sb-batch-source">{t(entry.role === 'child' ? 'batch.scopeChild' : 'batch.scopeMain', { parent: entry.parent ?? '' })}{entry.snapshot ? ` · ${t('batch.snapshot')}` : ''}</small>)}</li>)}</ul>
          {state.preview.summary.scope?.missing.map(row => <p key={`${row.parent}:${row.session}`}>{t('batch.missing', row)}</p>)}
          <p>{t('batch.planCounts', { count: state.preview.summary.archived, skipped: state.preview.summary.skipped })}</p>
          <button className="sb-batchbar__action" type="button" onClick={() => { void controller.confirm() }}>{t('batch.confirm')}</button>
          <button className="sb-btn" type="button" onClick={controller.cancel}>{t('batch.cancel')}</button>
        </div>
      ) : null}
      <div role="status" aria-live="polite" className="sb-batch-status">
        {busy ? t('batch.working') : null}
      </div>
      {state.result !== null ? (
        <div className="sb-batch-result">
          <div className="sb-batch-result-head">
            <span className="sb-batch-result-count">
              {t('batch.result', { archived: state.result.archived, skipped: state.result.skipped, empty: state.result.empty, failed: state.result.failed })}
            </span>
            <button
              type="button"
              className="sb-btn sb-batch-dismiss"
              aria-label={t('batch.dismissResult')}
              title={t('batch.dismissResult')}
              onClick={controller.dismissResult}
            >×</button>
          </div>
          {state.result.workflow ? <div className="sb-batch-preview">
            <ul>{state.result.workflow.synthesis.map(row => <li key={row.session}>{titles.get(row.session) ?? row.session}: {t(`batch.synthesis.${row.status}`)}{row.error ? ` (${row.error})` : ''}<small className="sb-batch-source">{row.page}</small>{row.pages.map(page => <small key={page} className="sb-batch-source">{page}</small>)}</li>)}</ul>
            <p>{t(`batch.index.${state.result.workflow.index}`)}</p>
          </div> : null}
          {state.result.nativeArchive ? <div className="sb-batch-preview" aria-label={t('batch.nativeTitle')}>
            <strong>{t('batch.nativeTitle')}</strong>
            <ul>{state.result.nativeArchive.map(row => <li key={row.session}>{titles.get(row.session) ?? row.session}: {t(`batch.native.${row.status}`)}</li>)}</ul>
          </div> : null}
        </div>
      ) : null}
      {state.error ? (
        <div role="alert" className="sb-batch-error">
          {t('batch.error')} <span>{t((`batch.error.${state.error}` in en) ? `batch.error.${state.error}` : 'batch.error.UNKNOWN')}</span>
          {state.errorDetail ? <small className="sb-batch-detail">{state.errorDetail}</small> : null}
        </div>
      ) : null}
    </section>
  )
}
