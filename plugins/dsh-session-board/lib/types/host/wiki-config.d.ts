import { type WikiConfig, type WikiConfigResponse, type WikiEnvironmentStatus, type WikiResolvedPaths } from '../shared/wiki.ts';
/** One rejected config write; carries the field-level codes the page renders. */
export declare class WikiConfigError extends Error {
    readonly errors: readonly string[];
    /**
     * @param errors - stable codes such as `INVALID_WIKI_ROOT`.
     */
    constructor(errors: readonly string[]);
}
/** Everything one archive/synthesis run needs, resolved once per operation. */
export interface WikiRuntime {
    /** User home directory. */
    home: string;
    /** DSH home whose session transcripts are archived (null when unset). */
    dshHome: string | null;
    /** Concrete paths resolved from the configuration. */
    paths: WikiResolvedPaths;
    /** Directory the bridge loads the engine from. */
    engineDir: string;
    /** Absolute path of the bridge script. */
    bridgePath: string;
    /** Append-only diagnostic log for failed runs. */
    logPath: string;
}
/** Inputs that produce one {@link WikiRuntime}. */
export interface WikiRuntimeInput {
    /** User home; `homedir()` by default. */
    home?: string;
    /** DSH home whose transcripts are archived. */
    dshHome?: string | null;
    /** Deployment config (cordis.patch.yml); already validated. */
    pluginConfig?: WikiConfig;
    /** Saved config from the settings page, if any. */
    stored?: WikiConfig | null;
    /** Directory that holds the packaged engine scripts. */
    engineDir: string;
    /** Absolute bridge script path. */
    bridgePath: string;
    /** Diagnostic log path; `<home>/.dsh-session-board/wiki.log` by default. */
    logPath?: string;
    /** Provider from `~/.dsh-session-board.json`, used when config names none. */
    storedProvider?: string;
}
/** One dependency the settings route needs from the host half. */
export interface WikiSettingsFace {
    /** Read the saved config, its defaults and a fresh probe. */
    read(): Promise<WikiConfigResponse>;
    /** Validate and persist one config write, then return the new state. */
    write(raw: unknown): Promise<WikiConfigResponse>;
    /** Drop the saved config (back to deployment defaults / ~/wiki). */
    reset(): Promise<WikiConfigResponse>;
    /** Probe the current environment without changing the config. */
    probe(): Promise<WikiEnvironmentStatus>;
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
export declare function mergeWikiConfig(pluginConfig: WikiConfig, stored: WikiConfig | null): WikiConfig;
/**
 * Resolve the runtime paths for one configuration.
 * @param input - home, dsh home, configs and packaged script locations.
 * @returns the concrete runtime.
 */
export declare function buildWikiRuntime(input: WikiRuntimeInput): WikiRuntime;
/**
 * Build the settings payload for one config.
 * @param config - effective raw config.
 * @param home - user home for the defaults block.
 * @param status - probe result, or null when the probe was skipped.
 * @param provider - effective fallback provider from the user's home file.
 * @returns the route response.
 */
export declare function wikiConfigResponse(config: WikiConfig, home: string, status: WikiEnvironmentStatus | null, provider?: string): WikiConfigResponse;
/**
 * Append one diagnostic line to the runtime log.
 * @param runtime - resolved runtime.
 * @param message - single-line summary of the failure.
 */
export declare function appendWikiLog(runtime: WikiRuntime, message: string): Promise<void>;
/**
 * Run the bridge's `status` operation and parse its report.
 *
 * The probe is read-only: it imports the engine modules, checks the SCHEMA
 * rules and reports the paths, but never scans sessions or writes the Wiki.
 * @param runtime - resolved runtime.
 * @returns the environment report; failures become an `ok: false` report.
 */
export declare function probeWikiEnvironment(runtime: WikiRuntime): Promise<WikiEnvironmentStatus>;
/**
 * Validate one config write and report field-level error codes.
 * @param raw - untrusted request payload.
 * @returns the validated config or its error codes.
 */
export declare function validateWikiWrite(raw: unknown): {
    config: WikiConfig | null;
    errors: string[];
};
