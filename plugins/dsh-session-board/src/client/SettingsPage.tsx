/**
 * The "Session board" settings page: one group, "Archive synthesis".
 *
 * The page owns no state; it renders the controller's snapshot and hands the
 * chosen row back through `save`. The model list is the running client's own
 * catalog (the composer's picker source), so a provider the user can chat with
 * is exactly a provider they can synthesize with.
 */
import { useEffect, type ReactElement } from 'react'
import { useSnapshot } from './hooks.ts'
import type { Translate } from './hooks.ts'
import { FALLBACK_OPTION_VALUE } from './synthesis-settings.ts'
import type { SynthesisSettingsFace } from './synthesis-settings.ts'
import { WikiSettingsSection } from './WikiSettingsSection.tsx'
import type { WikiSettingsFace } from './wiki-settings.ts'
import {
  formatContextWindow,
  optionByValue,
  optionValueOf,
  selectionOptionValue,
  type SynthesisModelSelection,
} from '../shared/synthesis.ts'

/** Props the settings page receives from its slot registration. */
export interface SessionBoardSettingsPageProps {
  t: Translate
  settings: SynthesisSettingsFace
  wiki: WikiSettingsFace
}

/**
 * Map a stable controller error code onto localized copy.
 * @param t - bound translate.
 * @param error - controller error code.
 * @returns the localized message.
 */
function errorText(t: Translate, error: string): string {
  switch (error) {
    case 'UNKNOWN_MODEL': return t('settings.errorUnknownModel')
    case 'UNKNOWN_EFFORT': return t('settings.errorUnknownEffort')
    case 'HOST_OUTDATED': return t('settings.errorHostOutdated')
    case 'STORE_UNAVAILABLE': return t('settings.errorStoreUnavailable')
    case 'INVALID_SELECTION': return t('settings.errorInvalidSelection')
    default: return t('settings.errorRequestFailed')
  }
}

/** One row label: provider, model, and the context window when disclosed. */
function optionLabel(option: { providerName: string; modelName: string; contextWindow: number | null }, t: Translate): string {
  const base = `${option.providerName} · ${option.modelName}`
  return option.contextWindow === null ? base : `${base} (${t('settings.contextWindow', { value: formatContextWindow(option.contextWindow) })})`
}

/** Label of the "let the model decide" effort row, naming the disclosed default. */
function defaultEffortLabel(option: { reasoningEfforts: readonly { id: string; name: string }[]; defaultEffort: string | null } | null, t: Translate): string {
  const known = option === null || option.defaultEffort === null
    ? null
    : option.reasoningEfforts.find(effort => effort.id === option.defaultEffort)
  return known === null || known === undefined
    ? t('settings.synthesisEffortDefault')
    : t('settings.synthesisEffortDefaultNamed', { value: known.name })
}

/**
 * Render the settings page.
 * @param props - locale copy and the synthesis-settings controller face.
 * @returns the page content.
 */
export function SessionBoardSettingsPage({ t, settings, wiki }: SessionBoardSettingsPageProps): ReactElement {
  const state = useSnapshot(settings.store, value => value)
  useEffect(() => { settings.start() }, [settings])

  const selectedValue: SynthesisModelSelection | null = state.selection
  const knownValue = selectedValue === null ? FALLBACK_OPTION_VALUE : optionValueOf(state.options, selectedValue)
  const currentValue = knownValue ?? (selectedValue === null ? FALLBACK_OPTION_VALUE : selectionOptionValue(selectedValue))
  const disabled = state.saving || state.status === 'loading'
  const currentOption = currentValue === FALLBACK_OPTION_VALUE ? null : optionByValue(state.options, currentValue)
  const savedEffort = selectedValue?.reasoningEffort ?? null
  const efforts = currentOption?.reasoningEfforts ?? []
  const effortKnown = savedEffort !== null && efforts.some(effort => effort.id === savedEffort)
  const showEffort = knownValue !== null && (efforts.length > 0 || savedEffort !== null)
  const catalogNote = state.catalogStatus === 'loading'
    ? t('settings.synthesisLoading')
    : state.catalogStatus === 'unavailable'
      ? t('settings.synthesisCatalogUnavailable')
      : null
  return (
    <>
      <section className="sb-settings" aria-label={t('settings.nav')}>
        <h3 className="sb-settings-title">{t('settings.synthesisGroup')}</h3>
        <p className="sb-settings-hint">{t('settings.synthesisHint')}</p>
        <div className="sb-settings-row">
          <label className="sb-settings-label" htmlFor="sb-settings-synthesis-model">{t('settings.synthesisModel')}</label>
          <select
            id="sb-settings-synthesis-model"
            className="sb-settings-select"
            value={currentValue}
            disabled={disabled}
            onChange={(event) => { void settings.save(event.target.value) }}
          >
            <option value={FALLBACK_OPTION_VALUE}>{t('settings.synthesisFallback')}</option>
            {state.options.map(option => (
              <option key={option.value} value={option.value}>{optionLabel(option, t)}</option>
            ))}
            {knownValue === null && selectedValue !== null
              ? (
                <option value={selectionOptionValue(selectedValue)}>
                  {`${selectedValue.provider} · ${selectedValue.model} (${t('settings.synthesisUnavailable')})`}
                </option>
              )
              : null}
          </select>
        </div>
        {showEffort
          ? (
            <div className="sb-settings-row">
              <label className="sb-settings-label" htmlFor="sb-settings-synthesis-effort">{t('settings.synthesisEffort')}</label>
              <select
                id="sb-settings-synthesis-effort"
                className="sb-settings-select"
                value={savedEffort ?? ''}
                disabled={disabled}
                onChange={(event) => { void settings.save(currentValue, event.target.value) }}
              >
                <option value="">{defaultEffortLabel(currentOption, t)}</option>
                {efforts.map(effort => (
                  <option key={effort.id} value={effort.id}>{effort.name}</option>
                ))}
                {savedEffort !== null && !effortKnown
                  ? <option value={savedEffort}>{`${savedEffort} (${t('settings.synthesisUnavailable')})`}</option>
                  : null}
              </select>
              <p className="sb-settings-hint">{t('settings.synthesisEffortHint')}</p>
            </div>
          )
          : null}
        {catalogNote !== null && state.options.length === 0
          ? (
            <div className="sb-settings-meta">
              <span className="sb-settings-note">{catalogNote}</span>
              {state.catalogStatus === 'unavailable'
                ? <button type="button" className="sb-settings-retry" onClick={() => { void settings.reloadCatalog() }}>{t('settings.retry')}</button>
                : null}
            </div>
          )
          : null}
        <div className="sb-settings-meta" role="status" aria-live="polite">
          {state.saved && state.error === null ? <span className="sb-settings-saved">{t('settings.synthesisSaved')}</span> : null}
          {state.error !== null ? <span className="sb-settings-error">{errorText(t, state.error)}</span> : null}
          {state.saving ? <span className="sb-settings-note">{t('settings.synthesisSaving')}</span> : null}
        </div>
      </section>
      <WikiSettingsSection t={t} wiki={wiki} />
    </>
  )
}
