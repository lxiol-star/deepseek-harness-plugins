/**
 * Settings-page controller for the self-contained Wiki engine.
 *
 * The page edits one configuration record and asks the host to persist it; the
 * host validates, stores it in its own domain and returns the effective
 * config together with a read-only environment probe (engine, schema, paths).
 *
 * A browser bundle can be newer than the running host, so a 404 on the read is
 * reported as `HOST_OUTDATED` rather than as a network failure.
 */
import type { ReadonlyStore } from './store.ts'
import { createStore } from './store.ts'
import {
  DEFAULT_WIKI_CONFIG,
  WIKI_CONFIG_PATH,
  parseEnvironmentStatus,
  parseWikiConfigResponse,
  validateWikiConfig,
  wikiDefaults,
  type WikiConfig,
  type WikiDefaults,
  type WikiEnvironmentStatus,
} from '../shared/wiki.ts'

/** What the settings page observes. */
export interface WikiSettingsState {
  /** Read phase of the saved configuration. */
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Saved configuration as the host reports it ('' fields mean "default"). */
  config: WikiConfig
  /** Concrete defaults for the placeholders. */
  defaults: WikiDefaults
  /** Last probe of the running environment, or null before the first read. */
  report: WikiEnvironmentStatus | null
  /** A write or reset is in flight. */
  saving: boolean
  /** The last write succeeded; cleared when the next write starts. */
  saved: boolean
  /** Stable error code for the page's copy, or null. */
  error: string | null
  /** Field-level validation codes from the last rejected write. */
  fieldErrors: readonly string[]
  /** A probe is in flight. */
  probing: boolean
}

/** Surface the settings page receives through slot injection. */
export interface WikiSettingsFace {
  readonly store: ReadonlyStore<WikiSettingsState>
  /** Load the saved configuration and probe the environment once. */
  start(): void
  /**
   * Persist the edited configuration.
   * @param config - draft from the settings form.
   * @returns a promise that settles after the host answered.
   */
  save(config: WikiConfig): Promise<void>
  /** Drop the saved record and return to the deployment defaults. */
  reset(): Promise<void>
  /** Re-probe the environment without changing the configuration. */
  probe(): Promise<void>
  /** Detach subscribers; the plugin unload path. */
  dispose(): void
}

/** Empty defaults for a browser that never reached the host. */
function emptyDefaults(): WikiDefaults {
  return wikiDefaults('')
}

/**
 * POST one `wiki-config` request.
 * @param body - request body (`action` plus optional `config`).
 * @returns the parsed response.
 * @throws Error with the stable code the page displays.
 */
async function postWikiConfig(body: Record<string, unknown>): Promise<unknown> {
  let response: Response
  try {
    response = await globalThis.fetch(WIKI_CONFIG_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('REQUEST_FAILED')
  }
  const payload: unknown = await response.json().catch(() => null)
  if (response.status === 404 || response.status === 503) throw new Error('HOST_OUTDATED')
  if (!response.ok) {
    const code = typeof payload === 'object' && payload !== null && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error
      : 'REQUEST_FAILED'
    throw new Error(code)
  }
  return payload
}

/**
 * POST one config request and parse the config-bearing payload.
 * @param body - request body.
 * @returns the parsed response.
 * @throws Error with the stable code the page displays.
 */
async function postParsedWikiConfig(body: Record<string, unknown>): Promise<NonNullable<ReturnType<typeof parseWikiConfigResponse>>> {
  const parsed = parseWikiConfigResponse(await postWikiConfig(body))
  if (parsed === null) throw new Error('REQUEST_FAILED')
  return parsed
}

/**
 * Create the Wiki settings controller.
 * @returns the controller face the settings page consumes.
 */
export function createWikiSettings(): WikiSettingsFace {
  const state = createStore<WikiSettingsState>({
    status: 'idle',
    config: { ...DEFAULT_WIKI_CONFIG },
    defaults: emptyDefaults(),
    report: null,
    saving: false,
    saved: false,
    error: null,
    fieldErrors: [],
    probing: false,
  })
  let disposed = false
  const publish = (patch: Partial<WikiSettingsState>): void => {
    if (disposed) return
    state.set({ ...state.getSnapshot(), ...patch })
  }

  /**
   * Apply one successful response: config, defaults, probe report.
   * @param response - parsed route payload.
   * @param saved - whether this response followed a write/reset.
   */
  const applyResponse = (response: NonNullable<ReturnType<typeof parseWikiConfigResponse>>, saved: boolean): void => {
    publish({
      status: 'ready',
      config: response.config,
      defaults: response.defaults,
      report: response.status,
      saving: false,
      saved,
      error: null,
      fieldErrors: [],
    })
  }

  return {
    store: state,
    start(): void {
      if (disposed || state.getSnapshot().status === 'loading') return
      publish({ status: 'loading', error: null })
      void (async () => {
        try {
          applyResponse(await postParsedWikiConfig({ action: 'read' }) as NonNullable<ReturnType<typeof parseWikiConfigResponse>>, false)
        } catch (error) {
          publish({ status: 'error', saving: false, saved: false, error: error instanceof Error ? error.message : 'REQUEST_FAILED' })
        }
      })()
    },
    async save(config: WikiConfig): Promise<void> {
      if (disposed) return
      const validated = validateWikiConfig(config)
      if (validated.config === null) {
        publish({ saving: false, saved: false, error: 'INVALID_CONFIG', fieldErrors: validated.errors })
        return
      }
      publish({ saving: true, saved: false, error: null, fieldErrors: [] })
      try {
        applyResponse(await postParsedWikiConfig({ action: 'write', config: validated.config }) as NonNullable<ReturnType<typeof parseWikiConfigResponse>>, true)
      } catch (error) {
        publish({ saving: false, saved: false, error: error instanceof Error ? error.message : 'REQUEST_FAILED' })
      }
    },
    async reset(): Promise<void> {
      if (disposed) return
      publish({ saving: true, saved: false, error: null, fieldErrors: [] })
      try {
        applyResponse(await postParsedWikiConfig({ action: 'reset' }) as NonNullable<ReturnType<typeof parseWikiConfigResponse>>, true)
      } catch (error) {
        publish({ saving: false, saved: false, error: error instanceof Error ? error.message : 'REQUEST_FAILED' })
      }
    },
    async probe(): Promise<void> {
      if (disposed || state.getSnapshot().probing) return
      publish({ probing: true, error: null })
      try {
        const response = await postWikiConfig({ action: 'probe' }) as { status?: unknown } | null
        const report = response !== null && typeof response === 'object' ? parseEnvironmentStatus(response.status) : null
        publish({ probing: false, report: report ?? state.getSnapshot().report })
      } catch (error) {
        publish({ probing: false, error: error instanceof Error ? error.message : 'REQUEST_FAILED' })
      }
    },
    dispose(): void {
      disposed = true
    },
  }
}
