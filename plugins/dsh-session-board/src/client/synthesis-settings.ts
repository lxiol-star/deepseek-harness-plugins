/**
 * Settings-page controller for the synthesis-model preference.
 *
 * Two collaborators: the preference route and the model catalog, both served
 * by this plugin's own host half. The catalog is read from there rather than
 * from another plugin's browser-side remote namespace, which is not reachable
 * from every host build. The page renders this snapshot and calls `save`.
 *
 * A browser bundle can be newer than the running host, so a 404 on the read is
 * reported as `HOST_OUTDATED` rather than as a network failure.
 */
import type { ReadonlyStore } from './store.ts'
import {
  SYNTHESIS_MODEL_PATH,
  parseCatalogGroups,
  parseSynthesisModelResponse,
  selectionFromOptionValue,
  selectionOf,
  synthesisModelOptions,
  type SynthesisModelOption,
  type SynthesisModelSelection,
} from '../shared/synthesis.ts'

/** What the settings page observes. */
export interface SynthesisSettingsState {
  /** Read phase of the saved preference. */
  status: 'loading' | 'ready' | 'error'
  /** Currently saved route, or null for the Wiki-provider fallback. */
  selection: SynthesisModelSelection | null
  /** Picker rows from the client catalog, sorted and deduplicated. */
  options: readonly SynthesisModelOption[]
  /** Client model-catalog load phase. */
  catalogStatus: 'idle' | 'loading' | 'ready' | 'unavailable'
  /** A write is in flight. */
  saving: boolean
  /** The last write succeeded; cleared when the next save starts. */
  saved: boolean
  /** Stable error code for the page's copy, or null. */
  error: string | null
}

/** Surface the page receives through slot injection. */
export interface SynthesisSettingsFace {
  readonly store: ReadonlyStore<SynthesisSettingsState>
  /** Load the saved preference and the model catalog once. */
  start(): void
  /**
   * Persist one picker row.
   * @param value - row value; '' selects the Wiki-provider fallback.
   */
  save(value: string): Promise<void>
  /** Reload the client model catalog after it failed to load. */
  reloadCatalog(): Promise<void>
  /** Detach subscribers; the plugin unload path. */
  dispose(): void
}

/** Raw model-catalog groups as any client catalog shape exposes them. */
export type SynthesisCatalogSource = () => Promise<unknown>

/** Collaborators of {@link createSynthesisSettings}. */
export interface SynthesisSettingsOptions {
  /** Reads raw provider groups; defaults to this plugin's own host route. */
  catalog?: SynthesisCatalogSource
}

/**
 * The JSON body of one write request.
 * @param value - picker row value; '' is the fallback row.
 * @returns the request body, or null when the value is not a row value.
 */
function writeBody(value: string): Record<string, unknown> | null {
  if (value === '') return { action: 'write', model: null, provider: null }
  const selection = selectionFromOptionValue(value)
  if (selection === null) return null
  return { action: 'write', model: selection.model, provider: selection.provider }
}

/**
 * POST one preference-route request.
 * @param body - decoded request body.
 * @returns the route response body.
 * @throws Error with the stable code the page displays.
 */
async function postSynthesisModel(body: Record<string, unknown>): Promise<unknown> {
  let response: Response
  try {
    response = await globalThis.fetch(SYNTHESIS_MODEL_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('REQUEST_FAILED')
  }
  const payload: unknown = await response.json().catch(() => null)
  if (response.status === 404) throw new Error('HOST_OUTDATED')
  if (!response.ok) {
    const code = typeof payload === 'object' && payload !== null && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error
      : 'REQUEST_FAILED'
    throw new Error(code)
  }
  return payload
}

/**
 * Load the advertised model routes from this plugin's own host half.
 * @returns the raw `groups` array; shape checking happens in the controller.
 * @throws Error with the stable code the page displays.
 */
export async function requestHostCatalog(): Promise<unknown> {
  const payload = await postSynthesisModel({ action: 'catalog' })
  if (typeof payload !== 'object' || payload === null) throw new Error('REQUEST_FAILED')
  const groups = (payload as { groups?: unknown }).groups
  if (!Array.isArray(groups)) throw new Error('REQUEST_FAILED')
  return groups
}

/**
 * Create the settings controller.
 * @param options - optional client model-catalog reader.
 * @returns the page-facing surface.
 */
export function createSynthesisSettings(options: SynthesisSettingsOptions = {}): SynthesisSettingsFace {
  let state: SynthesisSettingsState = {
    status: 'loading',
    selection: null,
    options: [],
    catalogStatus: 'idle',
    saving: false,
    saved: false,
    error: null,
  }
  const listeners = new Set<() => void>()
  let started = false
  let disposed = false

  const publish = (next: Partial<SynthesisSettingsState>): void => {
    if (disposed) return
    state = { ...state, ...next }
    for (const listener of [...listeners]) listener()
  }

  const loadCatalog = async (): Promise<void> => {
    const source = options.catalog ?? requestHostCatalog
    publish({ catalogStatus: 'loading' })
    try {
      const groups = parseCatalogGroups(await source())
      if (disposed) return
      publish({ options: synthesisModelOptions(groups), catalogStatus: 'ready' })
    } catch {
      if (disposed) return
      publish({ options: [], catalogStatus: 'unavailable' })
    }
  }

  return {
    store: {
      getSnapshot: () => state,
      subscribe(listener: () => void): () => void {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    start(): void {
      if (started || disposed) return
      started = true
      void (async (): Promise<void> => {
        try {
          const payload = await postSynthesisModel({ action: 'read' })
          const pref = parseSynthesisModelResponse(payload)
          if (pref === null) throw new Error('REQUEST_FAILED')
          publish({ status: 'ready', selection: selectionOf(pref) })
        } catch (error) {
          publish({ status: 'error', error: error instanceof Error ? error.message : 'REQUEST_FAILED' })
        }
        await loadCatalog()
      })()
    },
    async save(value: string): Promise<void> {
      if (disposed) return
      const body = writeBody(value)
      if (body === null) {
        publish({ saving: false, saved: false, error: 'INVALID_SELECTION' })
        return
      }
      publish({ saving: true, saved: false, error: null })
      try {
        const payload = await postSynthesisModel(body)
        const pref = parseSynthesisModelResponse(payload)
        if (pref === null) throw new Error('REQUEST_FAILED')
        publish({ saving: false, saved: true, selection: selectionOf(pref), status: 'ready' })
      } catch (error) {
        publish({ saving: false, error: error instanceof Error ? error.message : 'REQUEST_FAILED' })
      }
    },
    async reloadCatalog(): Promise<void> {
      if (disposed) return
      await loadCatalog()
    },
    dispose(): void {
      disposed = true
      listeners.clear()
    },
  }
}

/**
 * The fallback row's identity, shared by controller and page.
 */
export const FALLBACK_OPTION_VALUE = ''
