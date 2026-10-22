/**
 * "Wiki engine" settings section.
 *
 * The section edits the configuration the host resolves per archive run: the
 * Wiki data root, the SCHEMA rules file, where the engine scripts come from,
 * the Python interpreter and the advanced state/timeout/provider fields.
 *
 * Defaults stay visible as placeholders instead of being written into the
 * inputs, so the page can honestly say "reuse the local Wiki" while the host
 * still resolves concrete paths.
 */
import { useEffect, useState, type ReactElement } from 'react'
import type { Translate } from './hooks.ts'
import { useSnapshot } from './hooks.ts'
import type { WikiSettingsFace } from './wiki-settings.ts'
import type { WikiConfig } from '../shared/wiki.ts'

/** Props the section receives from the settings page. */
export interface WikiSettingsSectionProps {
  t: Translate
  wiki: WikiSettingsFace
}

/**
 * Map a validation code onto localized copy.
 * @param t - bound translate.
 * @param code - field-level code returned by the host.
 * @returns the localized message.
 */
function validationText(t: Translate, code: string): string {
  switch (code) {
    case 'INVALID_SCRIPTS_MODE': return t('settings.wikiInvalidMode')
    case 'INVALID_TIMEOUT': return t('settings.wikiInvalidTimeout')
    case 'INVALID_PROVIDER': return t('settings.wikiInvalidProvider')
    case 'INVALID_CONFIG': return t('settings.wikiInvalidConfig')
    case 'HOST_OUTDATED': return t('settings.errorHostOutdated')
    case 'STORE_UNAVAILABLE': return t('settings.errorStoreUnavailable')
    case 'REQUEST_FAILED': return t('settings.errorRequestFailed')
    default: return t('settings.wikiInvalidPath')
  }
}

/**
 * Render the Wiki engine settings section.
 * @param props - locale copy and the Wiki settings controller face.
 * @returns the section content.
 */
export function WikiSettingsSection({ t, wiki }: WikiSettingsSectionProps): ReactElement {
  const state = useSnapshot(wiki.store, value => value)
  const [draft, setDraft] = useState<WikiConfig>(state.config)
  useEffect(() => { wiki.start() }, [wiki])
  // A successful save / reset / read publishes a new config object; adopt it.
  useEffect(() => { setDraft(state.config) }, [state.config])
  const update = (patch: Partial<WikiConfig>): void => { setDraft(current => ({ ...current, ...patch })) }
  const busy = state.saving || state.status === 'loading'
  const error = state.error === null
    ? (state.fieldErrors.length > 0 ? validationText(t, state.fieldErrors[0] as string) : null)
    : validationText(t, state.error)
  const report = state.report
  const issues = report?.issues ?? []
  const modeLabel = draft.scriptsMode === 'local' ? t('settings.wikiScriptsLocal') : t('settings.wikiScriptsBundled')
  return (
    <section className="sb-settings" aria-label={t('settings.wikiGroup')}>
      <h3 className="sb-settings-title">{t('settings.wikiGroup')}</h3>
      <p className="sb-settings-hint">{t('settings.wikiHint')}</p>
      <div className="sb-settings-row">
        <label className="sb-settings-label" htmlFor="sb-wiki-root">{t('settings.wikiRoot')}</label>
        <input
          id="sb-wiki-root"
          className="sb-settings-input"
          value={draft.wikiRoot}
          placeholder={state.defaults.wikiRoot}
          disabled={busy}
          spellCheck={false}
          onChange={(event) => { update({ wikiRoot: event.target.value }) }}
        />
        <p className="sb-settings-hint">{t('settings.wikiRootHint')}</p>
      </div>
      <div className="sb-settings-row">
        <label className="sb-settings-label" htmlFor="sb-wiki-schema">{t('settings.wikiSchema')}</label>
        <input
          id="sb-wiki-schema"
          className="sb-settings-input"
          value={draft.schemaPath}
          placeholder={state.defaults.schemaPath}
          disabled={busy}
          spellCheck={false}
          onChange={(event) => { update({ schemaPath: event.target.value }) }}
        />
        <p className="sb-settings-hint">{t('settings.wikiSchemaHint')}</p>
      </div>
      <div className="sb-settings-row">
        <label className="sb-settings-label" htmlFor="sb-wiki-scripts">{t('settings.wikiScripts')}</label>
        <select
          id="sb-wiki-scripts"
          className="sb-settings-select"
          value={draft.scriptsMode}
          disabled={busy}
          onChange={(event) => { update({ scriptsMode: event.target.value === 'local' ? 'local' : 'bundled' }) }}
        >
          <option value="bundled">{t('settings.wikiScriptsBundled')}</option>
          <option value="local">{t('settings.wikiScriptsLocal')}</option>
        </select>
        <p className="sb-settings-hint">{t('settings.wikiScriptsHint')}</p>
      </div>
      {draft.scriptsMode === 'local'
        ? (
          <div className="sb-settings-row">
            <label className="sb-settings-label" htmlFor="sb-wiki-scripts-dir">{t('settings.wikiScriptsDir')}</label>
            <input
              id="sb-wiki-scripts-dir"
              className="sb-settings-input"
              value={draft.scriptsDir}
              placeholder={state.defaults.scriptsDir}
              disabled={busy}
              spellCheck={false}
              onChange={(event) => { update({ scriptsDir: event.target.value }) }}
            />
          </div>
        )
        : null}
      <div className="sb-settings-row">
        <label className="sb-settings-label" htmlFor="sb-wiki-python">{t('settings.wikiPython')}</label>
        <input
          id="sb-wiki-python"
          className="sb-settings-input"
          value={draft.python}
          placeholder={state.defaults.python}
          disabled={busy}
          spellCheck={false}
          onChange={(event) => { update({ python: event.target.value }) }}
        />
        <p className="sb-settings-hint">{t('settings.wikiPythonHint')}</p>
      </div>
      <details className="sb-settings-details">
        <summary>{t('settings.wikiAdvanced')}</summary>
        <div className="sb-settings-row">
          <label className="sb-settings-label" htmlFor="sb-wiki-state">{t('settings.wikiStateFile')}</label>
          <input
            id="sb-wiki-state"
            className="sb-settings-input"
            value={draft.stateFile}
            placeholder={state.defaults.stateFile}
            disabled={busy}
            spellCheck={false}
            onChange={(event) => { update({ stateFile: event.target.value }) }}
          />
          <p className="sb-settings-hint">{t('settings.wikiStateFileHint')}</p>
        </div>
        <div className="sb-settings-row">
          <label className="sb-settings-label" htmlFor="sb-wiki-timeout">{t('settings.wikiTimeout')}</label>
          <input
            id="sb-wiki-timeout"
            className="sb-settings-input"
            type="number"
            min={0}
            max={86400}
            value={draft.timeoutSeconds}
            placeholder={String(state.defaults.timeoutSeconds)}
            disabled={busy}
            onChange={(event) => { update({ timeoutSeconds: Number.isFinite(Number(event.target.value)) ? Math.max(0, Math.floor(Number(event.target.value))) : 0 }) }}
          />
          <p className="sb-settings-hint">{t('settings.wikiTimeoutHint', { value: state.defaults.timeoutSeconds })}</p>
        </div>
        <div className="sb-settings-row">
          <label className="sb-settings-label" htmlFor="sb-wiki-provider">{t('settings.wikiProvider')}</label>
          <input
            id="sb-wiki-provider"
            className="sb-settings-input"
            value={draft.provider}
            placeholder={state.defaults.provider}
            disabled={busy}
            spellCheck={false}
            onChange={(event) => { update({ provider: event.target.value }) }}
          />
          <p className="sb-settings-hint">{t('settings.wikiProviderHint')}</p>
        </div>
        <div className="sb-settings-row">
          <label className="sb-settings-label" htmlFor="sb-wiki-synth-config">{t('settings.wikiSynthConfig')}</label>
          <input
            id="sb-wiki-synth-config"
            className="sb-settings-input"
            value={draft.synthConfig}
            placeholder={state.defaults.synthConfig}
            disabled={busy}
            spellCheck={false}
            onChange={(event) => { update({ synthConfig: event.target.value }) }}
          />
        </div>
      </details>
      <div className="sb-settings-meta">
        <button type="button" className="sb-settings-action" disabled={busy} onClick={() => { void wiki.save(draft) }}>{t('settings.wikiSave')}</button>
        <button type="button" className="sb-settings-retry" disabled={busy} onClick={() => { void wiki.reset() }}>{t('settings.wikiReset')}</button>
        <button type="button" className="sb-settings-retry" disabled={state.probing} onClick={() => { void wiki.probe() }}>{t('settings.wikiProbe')}</button>
        {state.saved && error === null ? <span className="sb-settings-saved">{t('settings.wikiSaved')}</span> : null}
        {state.saving ? <span className="sb-settings-note">{t('settings.wikiSaving')}</span> : null}
        {error !== null ? <span className="sb-settings-error" role="alert">{error}</span> : null}
      </div>
      <div className="sb-settings-report">
        {report === null
          ? <span className="sb-settings-note">{state.status === 'loading' ? t('settings.wikiLoading') : t('settings.wikiNoReport')}</span>
          : (
            <>
              <div className={report.ok ? 'sb-settings-saved' : 'sb-settings-error'} role="status">
                {report.ok ? t('settings.wikiReady') : t('settings.wikiIssues')}
              </div>
              {issues.length > 0
                ? <ul className="sb-settings-issues">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
                : null}
              <div className="sb-settings-note">{t('settings.wikiReportEngine', { mode: modeLabel, dir: report.engine.dir })}</div>
              <div className="sb-settings-note">{t('settings.wikiReportPython', { value: report.python === '' ? report.pythonExecutable : report.python })}</div>
              <div className="sb-settings-note">{t('settings.wikiReportSchema', { path: report.schema.path, bytes: String(report.schema.bytes) })}</div>
              <div className="sb-settings-note">{t('settings.wikiReportState', { path: report.state.path })}</div>
            </>
          )}
      </div>
    </section>
  )
}
