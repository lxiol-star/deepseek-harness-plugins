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
export type WikiScriptsMode = 'bundled' | 'local';
/** The persisted, user-editable Wiki configuration; empty paths mean "default". */
export interface WikiConfig {
    /** Absolute Wiki data root; '' means `~/wiki`. */
    wikiRoot: string;
    /** Absolute `SCHEMA.md` path; '' means `<wikiRoot>/SCHEMA.md`. */
    schemaPath: string;
    /** Engine source: the plugin's own copy, or a local wiki scripts directory. */
    scriptsMode: WikiScriptsMode;
    /** Absolute scripts directory used in `local` mode; '' means `<wikiRoot>/scripts`. */
    scriptsDir: string;
    /** Python interpreter; '' means `/usr/bin/python3`. */
    python: string;
    /** Archive state file; '' means `<wikiRoot>/scripts/.archive-state.json`. */
    stateFile: string;
    /**
     * Whole-operation timeout in seconds. 0 keeps the host default
     * ({@link WIKI_DEFAULT_TIMEOUT_SECONDS}). Scope scans `dshHome`, so a large
     * history legitimately needs more than the old fixed 120s.
     */
    timeoutSeconds: number;
    /** Provider passed to `wiki-synthesize.py`; '' keeps the local default. */
    provider: string;
    /** `--config` file for `wiki-synthesize.py`; '' keeps the script default. */
    synthConfig: string;
}
/** Timeout applied when {@link WikiConfig.timeoutSeconds} is 0. */
export declare const WIKI_DEFAULT_TIMEOUT_SECONDS = 300;
/** One config record in the `prefs` storage domain. */
export declare const WIKI_CONFIG_PREFS_KEY = "wiki";
/** Authenticated route reading, writing and probing the Wiki configuration. */
export declare const WIKI_CONFIG_PATH = "/api/session-board/wiki-config";
/**
 * Host capability advertising the Wiki config route and the `detail` field in
 * archive errors. The browser bundle may be newer than the running host after
 * an upgrade, so the settings page probes this before offering to save.
 */
export declare const WIKI_CONFIG_CAPABILITY = 1;
/** Top-level defaults, before any user value. */
export declare const DEFAULT_WIKI_CONFIG: WikiConfig;
/** Concrete paths implied by an empty path field. */
export interface WikiDefaults {
    /** `~/wiki`, the default data root. */
    wikiRoot: string;
    /** `<wikiRoot>/SCHEMA.md`, the default rules file. */
    schemaPath: string;
    /** Engine directory used in `local` mode: `<wikiRoot>/scripts`. */
    scriptsDir: string;
    /** `<wikiRoot>/scripts/.archive-state.json`, shared with the old CLI flow. */
    stateFile: string;
    /** `/usr/bin/python3`. */
    python: string;
    /** The provider the Wiki fallback synthesis path uses. */
    provider: string;
    /** `~/.wikibar/config.json`, the synthesizer's own provider config. */
    synthConfig: string;
    /** {@link WIKI_DEFAULT_TIMEOUT_SECONDS}. */
    timeoutSeconds: number;
}
/** One engine script as reported by a probe. */
export interface WikiScriptInfo {
    name: string;
    path: string;
    exists: boolean;
    bytes: number;
}
/** A read-only environment report produced by the bridge's `status` operation. */
export interface WikiEnvironmentStatus {
    ok: boolean;
    issues: readonly string[];
    python: string;
    pythonExecutable: string;
    engine: {
        dir: string;
        scripts: readonly WikiScriptInfo[];
    };
    schema: {
        path: string;
        bytes: number;
    };
    wikiRoot: {
        path: string;
        exists: boolean;
    };
    state: {
        path: string;
    };
    operations: readonly string[];
}
/** One `wiki-config` route payload. */
export interface WikiConfigResponse {
    config: WikiConfig;
    defaults: WikiDefaults;
    status: WikiEnvironmentStatus | null;
    /** Validation codes from the last write, if it failed. */
    errors?: readonly string[];
}
/** Concrete paths the host actually runs with. */
export interface WikiResolvedPaths {
    wikiRoot: string;
    schemaPath: string;
    scriptsDir: string;
    stateFile: string;
    python: string;
    timeoutSeconds: number;
    provider: string;
    synthConfig: string;
}
/**
 * Default paths for one user home.
 * @param home - resolved user home directory.
 * @returns every default the settings page displays as a placeholder.
 */
export declare function wikiDefaults(home: string): WikiDefaults;
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
export declare function resolveWikiPaths(config: WikiConfig, home: string, storedProvider?: string): WikiResolvedPaths;
/**
 * Validate one write from the settings page.
 *
 * Empty strings are valid and mean "use the default". Path fields must be
 * absolute; the route never guesses a relative path from the process cwd.
 * @param raw - untrusted request value.
 * @returns the normalized config, or stable error codes for the page.
 */
export declare function validateWikiConfig(raw: unknown): {
    config: WikiConfig | null;
    errors: string[];
};
/**
 * Parse a config value stored in the prefs table or received from an older
 * client. Unknown fields are dropped; invalid values fall back to defaults so
 * a corrupted record cannot stop the board from starting.
 * @param raw - stored or received value.
 * @returns the normalized config.
 */
export declare function parseWikiConfig(raw: unknown): WikiConfig;
/**
 * Parse one `wiki-config` response.
 * @param raw - untrusted response payload.
 * @returns the typed response, or null when the payload is not usable.
 */
export declare function parseWikiConfigResponse(raw: unknown): WikiConfigResponse | null;
/**
 * Parse the bridge's environment report.
 * @param raw - untrusted probe payload.
 * @returns the typed report, or null when the payload is not usable.
 */
export declare function parseEnvironmentStatus(raw: unknown): WikiEnvironmentStatus | null;
