/**
 * Wiki runtime configuration and environment probing.
 *
 * The plugin separates three layers:
 *
 * 1. **The engine** — `wiki-archive.py`, `wiki-synthesize.py` and
 *    `wiki-index.py` ship inside the package (`lib/wiki`). An explicit
 *    `scriptsMode: 'local'` points at a user-maintained scripts directory
 *    instead (the old behaviour).
 * 2. **The data** — pages, `SCHEMA.md`, state files and locks stay under the
 *    configured wiki root, so a reinstall or update never touches them.
 * 3. **The defaults** — `~/wiki` and `<wikiRoot>/SCHEMA.md`, i.e. the local
 *    Wiki checkout, unless the settings page overrides them.
 *
 * This module owns the merge (saved config > deployment config > defaults),
 * the path resolution both the archiver and the settings route use, and the
 * read-only probe that tells the settings page which engine and schema are
 * actually reachable.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DEFAULT_WIKI_CONFIG, parseEnvironmentStatus, resolveWikiPaths, validateWikiConfig, wikiDefaults, type WikiConfig, type WikiConfigResponse, type WikiEnvironmentStatus, type WikiResolvedPaths } from '../shared/wiki.ts'

const exec = promisify(execFile)

/** One rejected config write; carries the field-level codes the page renders. */
export class WikiConfigError extends Error {
  /**
   * @param errors - stable codes such as `INVALID_WIKI_ROOT`.
   */
  constructor(readonly errors: readonly string[]) {
    super(errors[0] ?? 'INVALID_CONFIG')
  }
}

/** Files the bridge loads from `scriptsDir`, in probe order. */
const ENGINE_SCRIPTS = ['wiki-archive.py', 'wiki-synthesize.py', 'wiki-index.py']

/** Everything one archive/synthesis run needs, resolved once per operation. */
export interface WikiRuntime {
  /** User home directory. */
  home: string
  /** DSH home whose session transcripts are archived (null when unset). */
  dshHome: string | null
  /** Concrete paths resolved from the configuration. */
  paths: WikiResolvedPaths
  /** Directory the bridge loads the engine from. */
  engineDir: string
  /** Absolute path of the bridge script. */
  bridgePath: string
  /** Append-only diagnostic log for failed runs. */
  logPath: string
}

/** Inputs that produce one {@link WikiRuntime}. */
export interface WikiRuntimeInput {
  /** User home; `homedir()` by default. */
  home?: string
  /** DSH home whose transcripts are archived. */
  dshHome?: string | null
  /** Deployment config (cordis.patch.yml); already validated. */
  pluginConfig?: WikiConfig
  /** Saved config from the settings page, if any. */
  stored?: WikiConfig | null
  /** Directory that holds the packaged engine scripts. */
  engineDir: string
  /** Absolute bridge script path. */
  bridgePath: string
  /** Diagnostic log path; `<home>/.dsh-session-board/wiki.log` by default. */
  logPath?: string
  /** Provider from `~/.dsh-session-board.json`, used when config names none. */
  storedProvider?: string
}

/** One dependency the settings route needs from the host half. */
export interface WikiSettingsFace {
  /** Read the saved config, its defaults and a fresh probe. */
  read(): Promise<WikiConfigResponse>
  /** Validate and persist one config write, then return the new state. */
  write(raw: unknown): Promise<WikiConfigResponse>
  /** Drop the saved config (back to deployment defaults / ~/wiki). */
  reset(): Promise<WikiConfigResponse>
  /** Probe the current environment without changing the config. */
  probe(): Promise<WikiEnvironmentStatus>
}

/**
 * Merge the saved config over the deployment config.
 *
 * The saved record is a whole configuration, so once the user saves anything
 * it wins wholesale; deployment config only seeds a profile that never used
 * the settings page.
 * @param pluginConfig - validated `cordis.patch.yml` config.
 * @param stored - saved config, or null when the user never saved one.
 * @returns the effective raw config (empty values still mean "default").
 */
export function mergeWikiConfig(pluginConfig: WikiConfig, stored: WikiConfig | null): WikiConfig {
  return stored === null ? { ...pluginConfig } : { ...stored }
}

/**
 * Resolve the runtime paths for one configuration.
 * @param input - home, dsh home, configs and packaged script locations.
 * @returns the concrete runtime.
 */
export function buildWikiRuntime(input: WikiRuntimeInput): WikiRuntime {
  const home = input.home ?? ''
  const pluginConfig = input.pluginConfig ?? DEFAULT_WIKI_CONFIG
  const config = mergeWikiConfig(pluginConfig, input.stored ?? null)
  const paths = resolveWikiPaths(config, home, input.storedProvider)
  const engineDir = config.scriptsMode === 'local' ? paths.scriptsDir : input.engineDir
  return {
    home,
    dshHome: input.dshHome ?? null,
    paths,
    engineDir,
    bridgePath: input.bridgePath,
    logPath: input.logPath ?? `${home}/.dsh-session-board/wiki.log`,
  }
}

/**
 * Build the settings payload for one config.
 * @param config - effective raw config.
 * @param home - user home for the defaults block.
 * @param status - probe result, or null when the probe was skipped.
 * @param provider - effective fallback provider from the user's home file.
 * @returns the route response.
 */
export function wikiConfigResponse(config: WikiConfig, home: string, status: WikiEnvironmentStatus | null, provider?: string): WikiConfigResponse {
  const defaults = wikiDefaults(home)
  return { config: { ...config }, defaults: provider === undefined ? defaults : { ...defaults, provider }, status }
}

/**
 * Append one diagnostic line to the runtime log.
 * @param runtime - resolved runtime.
 * @param message - single-line summary of the failure.
 */
export async function appendWikiLog(runtime: WikiRuntime, message: string): Promise<void> {
  try {
    const { appendFile, mkdir, stat, writeFile } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(runtime.logPath), { recursive: true })
    // Keep the diagnostic log bounded: archive failures are rare, but a retry
    // loop must not fill the home directory.
    const LOG_LIMIT = 2 * 1024 * 1024
    const info = await stat(runtime.logPath).catch(() => null)
    if (info !== null && info.size > LOG_LIMIT) await writeFile(runtime.logPath, '', 'utf8')
    await appendFile(runtime.logPath, `${new Date().toISOString()}\t${message.replace(/\n+/g, ' ⏎ ').slice(0, 6000)}\n`, 'utf8')
  } catch {
    // The log is best-effort; the error itself is still returned to the UI.
  }
}

/**
 * Build an environment report for a probe that never ran.
 *
 * A missing interpreter, an unreadable bridge or a killed process must still
 * produce a report the settings page can render, not an exception.
 * @param runtime - resolved runtime.
 * @param issues - what went wrong.
 * @returns a failed report with the resolved paths it tried.
 */
function failedStatus(runtime: WikiRuntime, issues: readonly string[]): WikiEnvironmentStatus {
  return {
    ok: false,
    issues,
    python: '',
    pythonExecutable: runtime.paths.python,
    engine: { dir: runtime.engineDir, scripts: ENGINE_SCRIPTS.map(name => ({ name, path: `${runtime.engineDir}/${name}`, exists: false, bytes: 0 })) },
    schema: { path: runtime.paths.schemaPath, bytes: 0 },
    wikiRoot: { path: runtime.paths.wikiRoot, exists: false },
    state: { path: runtime.paths.stateFile },
    operations: [],
  }
}

/**
 * Run the bridge's `status` operation and parse its report.
 *
 * The probe is read-only: it imports the engine modules, checks the SCHEMA
 * rules and reports the paths, but never scans sessions or writes the Wiki.
 * @param runtime - resolved runtime.
 * @returns the environment report; failures become an `ok: false` report.
 */
export async function probeWikiEnvironment(runtime: WikiRuntime): Promise<WikiEnvironmentStatus> {
  const script = runtime.engineDir === '' ? '' : `${runtime.engineDir}/wiki-archive.py`
  if (script === '' || runtime.dshHome === null) {
    return failedStatus(runtime, ['Wiki scripts directory is not configured', ...(runtime.dshHome === null ? ['DSH_HOME is unknown'] : [])])
  }
  try {
    const result = await exec(runtime.paths.python, [
      runtime.bridgePath,
      'status',
      '--wiki-root', runtime.paths.wikiRoot,
      '--dsh-home', runtime.dshHome,
      '--scripts-dir', runtime.engineDir,
      '--schema', runtime.paths.schemaPath,
      '--python', runtime.paths.python,
      '--log', runtime.logPath,
    ], { timeout: 30_000, maxBuffer: 1024 * 1024 })
    const parsed = parseEnvironmentStatus(JSON.parse(result.stdout) as unknown)
    return parsed ?? failedStatus(runtime, ['Wiki bridge returned an unreadable status report'])
  } catch (error) {
    const stdout = (error as { stdout?: unknown }).stdout
    if (typeof stdout === 'string') {
      try {
        const parsed = parseEnvironmentStatus(JSON.parse(stdout) as unknown)
        if (parsed !== null) return parsed
      } catch {
        // Fall through to the message below.
      }
    }
    const detail = error instanceof Error ? error.message : String(error)
    void appendWikiLog(runtime, `probe failed: ${detail}`)
    return failedStatus(runtime, [`Wiki bridge probe failed: ${detail.slice(0, 400)}`])
  }
}

/**
 * Validate one config write and report field-level error codes.
 * @param raw - untrusted request payload.
 * @returns the validated config or its error codes.
 */
export function validateWikiWrite(raw: unknown): { config: WikiConfig | null; errors: string[] } {
  return validateWikiConfig(raw)
}
