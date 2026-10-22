/**
 * Durable plugin state: one JSON document under the harness home.
 *
 * The document carries the global energy-skin preference and the per-session
 * Ultra / lightning toggles:
 *
 * ```json
 * { "version": 1, "skin": "fluid", "sessions": { "<sessionId>": { "lightning": false, "ultra": true } } }
 * ```
 *
 * Reading is normalize-not-throw: a missing file, unreadable file, malformed
 * JSON, or wrong field types degrade to the default state, because a broken
 * preference file must never disable the slider itself. Writing is a
 * read-modify-write serialized in-process and committed through a unique temp
 * file plus rename, so a concurrent reader never observes a truncated
 * document and a skin change never erases the session toggles.
 *
 * @module dsh-whale-effort/host/state
 */
/** Energy-skin identifiers; the Host is authoritative for the persisted value. */
export type Skin = 'holo' | 'chrome' | 'fluid';
/** Supported skins in picker order. */
export declare const SKINS: readonly Skin[];
/** Skin used when nothing valid is persisted. */
export declare const DEFAULT_SKIN: Skin;
/** Current on-disk schema version. */
export declare const STATE_VERSION = 1;
/** File name of the plugin's state document inside `<home>/storages/`. */
export declare const STATE_FILE_NAME = "dsh-whale-effort.json";
/** Directory name inside the harness home that holds plugin documents. */
export declare const STORAGES_DIR_NAME = "storages";
/** Default harness home directory name under the OS home. */
export declare const DSH_HOME_DIR_NAME = ".dsh";
/** Environment variable that overrides the default harness home. */
export declare const DSH_HOME_ENV = "DSH_HOME";
/** Upper bound on retained session toggles (most recently touched win). */
export declare const MAX_TRACKED_SESSIONS = 40;
/** One session's Ultra / lightning toggles. */
export interface SessionFlags {
    /** Whether Lightning orchestration mode is on for the session. */
    readonly lightning: boolean;
    /** Whether Ultra mode is on for the session. */
    readonly ultra: boolean;
}
/** The complete persisted document. */
export interface WhaleState {
    /** Schema version written on every commit. */
    readonly version: typeof STATE_VERSION;
    /** Global skin preference. */
    readonly skin: Skin;
    /** Session toggles, in most-recently-touched order. */
    readonly sessions: Readonly<Record<string, SessionFlags>>;
}
/** Render one caught value for a log line. */
export declare function describeError(error: unknown): string;
/** Narrow one persisted skin value to a supported skin. */
export declare function normalizeSkin(value: unknown): Skin;
/** Whether one value can key the session map. */
export declare function isSessionId(value: unknown): value is string;
/** @returns the default state document. */
export declare function emptyState(): WhaleState;
/**
 * Keep at most {@link MAX_TRACKED_SESSIONS} entries, dropping the ones touched
 * longest ago (object insertion order is touch order).
 * @param sessions - candidate session map.
 * @returns the bounded session map.
 */
export declare function boundSessions(sessions: Readonly<Record<string, SessionFlags>>): Record<string, SessionFlags>;
/**
 * Coerce one parsed document into a usable state value.
 *
 * Malformed members are dropped rather than thrown: an unusable skin falls
 * back to {@link DEFAULT_SKIN}, non-record session values and unusable ids are
 * skipped, and the retained order is capped. The version field is advisory on
 * read; every write stamps the current one.
 * @param raw - parsed JSON value of any shape.
 * @returns the normalized state document.
 */
export declare function normalizeState(raw: unknown): WhaleState;
/** Expand a leading `~` or `~/` against the OS home. */
export declare function expandHomePath(value: string): string;
/**
 * Resolve the harness home for plugin storage.
 *
 * Precedence, highest first: an explicitly configured directory (the plugin
 * config's `statePath`), a non-blank `$DSH_HOME`, then `~/.dsh` — the same
 * precedence the harness itself uses for user data.
 * @param configured - explicit harness-home directory from plugin configuration.
 * @param env - environment mapping to read `DSH_HOME` from.
 * @returns the normalized absolute harness home.
 */
export declare function resolveDshHome(configured?: unknown, env?: Record<string, string | undefined>): string;
/**
 * Resolve the absolute state-document path.
 * @param configured - explicit override: a JSON file path, or a harness-home directory.
 * @param env - environment mapping used for `$DSH_HOME`.
 * @returns the normalized absolute state-file path.
 */
export declare function resolveStatePath(configured?: unknown, env?: Record<string, string | undefined>): string;
/** Sink for degraded-read/write diagnostics (never throws). */
export type StateLog = (message: string) => void;
/** The plugin's durable state document operations. */
export interface StateFile {
    /** Absolute document path. */
    readonly path: string;
    /** Read and normalize the document; never throws. */
    read(): WhaleState;
    /** Persist the global skin, preserving the session map. @returns whether the commit reached disk. */
    writeSkin(skin: Skin): Promise<boolean>;
    /** Persist one session's toggles as the most recently touched entry. @returns whether the commit reached disk. */
    writeSession(session: string, flags: SessionFlags): Promise<boolean>;
}
/** Options accepted by {@link createStateFile}. */
export interface StateFileOptions {
    /** Absolute state-document path. */
    readonly path: string;
    /** Optional diagnostic sink for degraded reads and writes. */
    readonly log?: StateLog;
}
/**
 * Open the state document.
 *
 * Commits are serialized in-process: each one reads the current document,
 * applies its mutation, and atomically replaces the file. A failed commit is
 * logged and reported as `false`; it never throws.
 * @param options - document path and optional diagnostic sink.
 * @returns the state-file operations.
 */
export declare function createStateFile(options: StateFileOptions): StateFile;
