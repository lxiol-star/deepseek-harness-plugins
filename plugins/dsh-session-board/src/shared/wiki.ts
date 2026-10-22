/**
 * Wiki configuration shared by both halves of the session board.
 *
 * The Wiki engine (archive, synthesis, index) ships inside the plugin. The
 * Wiki *data* stays user-owned: a data root, the SCHEMA rules file and the
 * state files all live outside the installed package, and may be pointed at a
 * local `~/wiki` checkout (the default) or anywhere else.
 *
 * Nothing on the wire is trusted: the client parses the host's config response
 * through {@link parseWikiConfigResponse}, the host validates every write
 * through {@link validateWikiConfig}, and both halves resolve the same
 * defaults through {@link wikiDefaults}.
 */

/** Where the engine scripts come from. */
export type WikiScriptsMode = 'bundled' | 'local'

/** The persisted, user-editable Wiki configuration; empty paths mean "default". */
export interface WikiConfig {
  /** Absolute Wiki data root; '' means `~/wiki`. */
  wikiRoot: string
  /** Absolute `SCHEMA.md` path; '' means `<wikiRoot>/SCHEMA.md`. */
  schemaPath: string
  /** Engine source: the plugin's own copy, or a local wiki scripts directory. */
  scriptsMode: WikiScriptsMode
  /** Absolute scripts directory used in `local` mode; '' means `<wikiRoot>/scripts`. */
  scriptsDir: string
  /** Python interpreter; '' means `/usr/bin/python3`. */
  python: string
  /** Archive state file; '' means `<wikiRoot>/scripts/.archive-state.json`. */
  stateFile: string
  /**
   * Whole-operation timeout in seconds. 0 keeps the host default
   * ({@link WIKI_DEFAULT_TIMEOUT_SECONDS}). Scope scans `dshHome`, so a large
   * history legitimately needs more than the old fixed 120s.
   */
  timeoutSeconds: number
  /** Provider passed to `wiki-synthesize.py`; '' keeps the local default. */
  provider: string
  /** `--config` file for `wiki-synthesize.py`; '' keeps the script default. */
  synthConfig: string
}

/** Timeout applied when {@link WikiConfig.timeoutSeconds} is 0. */
export const WIKI_DEFAULT_TIMEOUT_SECONDS = 300

/** One config record in the `prefs` storage domain. */
export const WIKI_CONFIG_PREFS_KEY = 'wiki'

/** Authenticated route reading, writing and probing the Wiki configuration. */
export const WIKI_CONFIG_PATH = '/api/session-board/wiki-config'

/**
 * Host capability advertising the Wiki config route and the `detail` field in
 * archive errors. The browser bundle may be newer than the running host after
 * an upgrade, so the settings page probes this before offering to save.
 */
export const WIKI_CONFIG_CAPABILITY = 1

/** Top-level defaults, before any user value. */
export const DEFAULT_WIKI_CONFIG: WikiConfig = {
  wikiRoot: '',
  schemaPath: '',
  scriptsMode: 'bundled',
  scriptsDir: '',
  python: '',
  stateFile: '',
  timeoutSeconds: 0,
  provider: '',
  synthConfig: '',
}

/** Concrete paths implied by an empty path field. */
export interface WikiDefaults {
  /** `~/wiki`, the default data root. */
  wikiRoot: string
  /** `<wikiRoot>/SCHEMA.md`, the default rules file. */
  schemaPath: string
  /** Engine directory used in `local` mode: `<wikiRoot>/scripts`. */
  scriptsDir: string
  /** `<wikiRoot>/scripts/.archive-state.json`, shared with the old CLI flow. */
  stateFile: string
  /** `/usr/bin/python3`. */
  python: string
  /** The provider the Wiki fallback synthesis path uses. */
  provider: string
  /** `~/.wikibar/config.json`, the synthesizer's own provider config. */
  synthConfig: string
  /** {@link WIKI_DEFAULT_TIMEOUT_SECONDS}. */
  timeoutSeconds: number
}

/** One engine script as reported by a probe. */
export interface WikiScriptInfo {
  name: string
  path: string
  exists: boolean
  bytes: number
}

/** A read-only environment report produced by the bridge's `status` operation. */
export interface WikiEnvironmentStatus {
  ok: boolean
  issues: readonly string[]
  python: string
  pythonExecutable: string
  engine: { dir: string; scripts: readonly WikiScriptInfo[] }
  schema: { path: string; bytes: number }
  wikiRoot: { path: string; exists: boolean }
  state: { path: string }
  operations: readonly string[]
}

/** One `wiki-config` route payload. */
export interface WikiConfigResponse {
  config: WikiConfig
  defaults: WikiDefaults
  status: WikiEnvironmentStatus | null
  /** Validation codes from the last write, if it failed. */
  errors?: readonly string[]
}

/** Concrete paths the host actually runs with. */
export interface WikiResolvedPaths {
  wikiRoot: string
  schemaPath: string
  scriptsDir: string
  stateFile: string
  python: string
  timeoutSeconds: number
  provider: string
  synthConfig: string
}

/** Longest path or interpreter accepted from the settings page. */
const PATH_MAX = 4096
/** Provider ids are process argv values and are kept to one safe token. */
const PROVIDER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/**
 * Default paths for one user home.
 * @param home - resolved user home directory.
 * @returns every default the settings page displays as a placeholder.
 */
export function wikiDefaults(home: string): WikiDefaults {
  return {
    wikiRoot: `${home}/wiki`,
    schemaPath: `${home}/wiki/SCHEMA.md`,
    scriptsDir: `${home}/wiki/scripts`,
    stateFile: `${home}/wiki/scripts/.archive-state.json`,
    python: '/usr/bin/python3',
    provider: 'stepx-terra',
    synthConfig: `${home}/.wikibar/config.json`,
    timeoutSeconds: WIKI_DEFAULT_TIMEOUT_SECONDS,
  }
}

/**
 * Merge an empty default field with the concrete path it stands for.
 * @param value - user value; empty means default.
 * @param fallback - concrete default.
 * @returns the concrete value.
 */
function orDefault(value: string, fallback: string): string {
  return value === '' ? fallback : value
}

/**
 * Resolve the paths the host and bridge run with.
 *
 * The synthesis provider keeps its historical resolution: the saved config
 * wins, then the user's `~/.dsh-session-board.json`, then the defaults.
 * @param config - validated user configuration.
 * @param home - user home directory.
 * @param storedProvider - provider from the user's home file, if any.
 * @returns concrete absolute paths and values.
 */
export function resolveWikiPaths(config: WikiConfig, home: string, storedProvider?: string): WikiResolvedPaths {
  const defaults = wikiDefaults(home)
  const wikiRoot = orDefault(config.wikiRoot, defaults.wikiRoot)
  const schemaPath = orDefault(config.schemaPath, `${wikiRoot}/SCHEMA.md`)
  const scriptsDir = config.scriptsMode === 'local' ? orDefault(config.scriptsDir, `${wikiRoot}/scripts`) : ''
  return {
    wikiRoot,
    schemaPath,
    scriptsDir,
    stateFile: orDefault(config.stateFile, `${wikiRoot}/scripts/.archive-state.json`),
    python: orDefault(config.python, defaults.python),
    timeoutSeconds: config.timeoutSeconds > 0 ? config.timeoutSeconds : defaults.timeoutSeconds,
    provider: orDefault(config.provider, storedProvider ?? defaults.provider),
    synthConfig: orDefault(config.synthConfig, defaults.synthConfig),
  }
}

/**
 * Whether one value is an absolute path without NUL bytes.
 * @param value - raw field.
 * @returns true for an absolute, bounded path.
 */
function isAbsolutePath(value: string): boolean {
  return value.length <= PATH_MAX && value.startsWith('/') && !value.includes('\u0000')
}

/**
 * Validate one write from the settings page.
 *
 * Empty strings are valid and mean "use the default". Path fields must be
 * absolute; the route never guesses a relative path from the process cwd.
 * @param raw - untrusted request value.
 * @returns the normalized config, or stable error codes for the page.
 */
export function validateWikiConfig(raw: unknown): { config: WikiConfig | null; errors: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { config: null, errors: ['INVALID_CONFIG'] }
  }
  const value = raw as Record<string, unknown>
  const errors: string[] = []
  const path = (key: string, label: string): string => {
    const entry = value[key]
    if (entry === undefined) return ''
    if (typeof entry !== 'string' || (entry !== '' && !isAbsolutePath(entry))) {
      errors.push(`INVALID_${label}`)
      return ''
    }
    return entry
  }
  const wikiRoot = path('wikiRoot', 'WIKI_ROOT')
  const schemaPath = path('schemaPath', 'SCHEMA_PATH')
  const scriptsDir = path('scriptsDir', 'SCRIPTS_DIR')
  const python = path('python', 'PYTHON')
  const stateFile = path('stateFile', 'STATE_FILE')
  const synthConfig = path('synthConfig', 'SYNTH_CONFIG')
  const scriptsMode = value.scriptsMode === undefined ? 'bundled' : value.scriptsMode
  if (scriptsMode !== 'bundled' && scriptsMode !== 'local') errors.push('INVALID_SCRIPTS_MODE')
  const timeout = value.timeoutSeconds === undefined ? 0 : value.timeoutSeconds
  if (typeof timeout !== 'number' || !Number.isInteger(timeout) || timeout < 0 || timeout > 86_400) errors.push('INVALID_TIMEOUT')
  const provider = value.provider === undefined ? '' : value.provider
  if (typeof provider !== 'string' || (provider !== '' && !PROVIDER_RE.test(provider))) errors.push('INVALID_PROVIDER')
  if (errors.length > 0) return { config: null, errors }
  return {
    config: {
      wikiRoot,
      schemaPath,
      scriptsMode: scriptsMode as WikiScriptsMode,
      scriptsDir,
      python,
      stateFile,
      timeoutSeconds: timeout as number,
      provider: provider as string,
      synthConfig,
    },
    errors,
  }
}

/**
 * Parse a config value stored in the prefs table or received from an older
 * client. Unknown fields are dropped; invalid values fall back to defaults so
 * a corrupted record cannot stop the board from starting.
 * @param raw - stored or received value.
 * @returns the normalized config.
 */
export function parseWikiConfig(raw: unknown): WikiConfig {
  const parsed = validateWikiConfig(raw)
  return parsed.config ?? { ...DEFAULT_WIKI_CONFIG }
}

/**
 * Parse one `wiki-config` response.
 * @param raw - untrusted response payload.
 * @returns the typed response, or null when the payload is not usable.
 */
export function parseWikiConfigResponse(raw: unknown): WikiConfigResponse | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (value.config === undefined || value.defaults === undefined) return null
  const config = parseWikiConfig(value.config)
  const defaults = value.defaults as Record<string, unknown>
  if (typeof defaults.wikiRoot !== 'string' || typeof defaults.schemaPath !== 'string' || typeof defaults.scriptsDir !== 'string'
    || typeof defaults.stateFile !== 'string' || typeof defaults.python !== 'string' || typeof defaults.provider !== 'string'
    || typeof defaults.synthConfig !== 'string' || typeof defaults.timeoutSeconds !== 'number') return null
  const status = parseEnvironmentStatus(value.status)
  const errors = Array.isArray(value.errors) ? value.errors.filter((entry): entry is string => typeof entry === 'string') : []
  return {
    config,
    defaults: {
      wikiRoot: defaults.wikiRoot,
      schemaPath: defaults.schemaPath,
      scriptsDir: defaults.scriptsDir,
      stateFile: defaults.stateFile,
      python: defaults.python,
      provider: defaults.provider,
      synthConfig: defaults.synthConfig,
      timeoutSeconds: defaults.timeoutSeconds,
    },
    status,
    errors,
  }
}

/**
 * Parse the bridge's environment report.
 * @param raw - untrusted probe payload.
 * @returns the typed report, or null when the payload is not usable.
 */
export function parseEnvironmentStatus(raw: unknown): WikiEnvironmentStatus | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (typeof value.ok !== 'boolean' || typeof value.python !== 'string' || typeof value.pythonExecutable !== 'string') return null
  const engine = value.engine as Record<string, unknown> | null
  const schema = value.schema as Record<string, unknown> | null
  const wikiRoot = value.wikiRoot as Record<string, unknown> | null
  const state = value.state as Record<string, unknown> | null
  if (engine === null || typeof engine !== 'object' || schema === null || typeof schema !== 'object'
    || wikiRoot === null || typeof wikiRoot !== 'object' || state === null || typeof state !== 'object') return null
  const scripts = Array.isArray(engine.scripts)
    ? engine.scripts.filter((entry): entry is WikiScriptInfo => {
      if (typeof entry !== 'object' || entry === null) return false
      const script = entry as Record<string, unknown>
      return typeof script.name === 'string' && typeof script.path === 'string'
        && typeof script.exists === 'boolean' && typeof script.bytes === 'number'
    })
    : []
  return {
    ok: value.ok,
    issues: Array.isArray(value.issues) ? value.issues.filter((entry): entry is string => typeof entry === 'string') : [],
    python: value.python,
    pythonExecutable: value.pythonExecutable,
    engine: { dir: typeof engine.dir === 'string' ? engine.dir : '', scripts },
    schema: { path: typeof schema.path === 'string' ? schema.path : '', bytes: typeof schema.bytes === 'number' ? schema.bytes : 0 },
    wikiRoot: { path: typeof wikiRoot.path === 'string' ? wikiRoot.path : '', exists: wikiRoot.exists === true },
    state: { path: typeof state.path === 'string' ? state.path : '' },
    operations: Array.isArray(value.operations) ? value.operations.filter((entry): entry is string => typeof entry === 'string') : [],
  }
}
