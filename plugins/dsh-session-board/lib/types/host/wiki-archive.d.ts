import { type ArchiveMode, type ArchivePreview, type ArchiveSummary } from '../shared/archive.ts';
import type { SynthesisModelSelection } from '../shared/synthesis.ts';
import { type WikiRuntime } from './wiki-config.ts';
export declare class WikiArchiveError extends Error {
    readonly code: string;
    readonly detail?: string | undefined;
    /**
     * @param code - stable machine code the client maps to localized copy.
     * @param detail - optional one-line diagnostic for the panel (no transcript text).
     */
    constructor(code: string, detail?: string | undefined);
}
export interface WikiArchiver {
    preview(ids: readonly string[], mode?: ArchiveMode): Promise<ArchivePreview>;
    commit(token: string): Promise<ArchiveSummary>;
    close(): void;
}
/**
 * The plugin-side synthesis path, used when the user picked a model route in
 * the settings page.
 *
 * `read` returns the stored route (null keeps the Wiki-provider path), and
 * `complete` runs exactly one model call for one raw page. The bridge's
 * `prompt`/`write` operations keep parsing, page validation, state recording,
 * SKIP handling and slug uniqueness inside `wiki-synthesize.py`'s own logic.
 */
export interface SynthesisModelBinding {
    read(): SynthesisModelSelection | null;
    complete(request: {
        provider: string;
        model: string;
        /** Saved reasoning effort, or null to keep the model's own default. */
        reasoningEffort: string | null;
        system: string;
        prompt: string;
        sessionId: string;
        signal: AbortSignal;
    }): Promise<string>;
}
/** Workflow operations the bridge must implement for the plugin-side call. */
type WorkflowOperation = 'scope' | 'synthesize' | 'prompt' | 'write' | 'index';
export interface WikiArchiverOptions {
    home?: string;
    dshHome?: string;
    /** Resolve the current Wiki runtime per operation; absent keeps ~/wiki + the packaged engine. */
    runtime?: () => WikiRuntime;
    now?: () => number;
    workflow?: (operation: WorkflowOperation, value: string, signal: AbortSignal) => Promise<unknown>;
    execute?: (args: readonly string[], signal: AbortSignal) => Promise<{
        stdout: string;
    }>;
    /** Plugin-side model call; absent keeps every synthesis on the Wiki provider. */
    models?: SynthesisModelBinding;
}
/**
 * Resolve the harness home the way DSH itself does: an explicit value (config or
 * `$DSH_HOME`) wins, otherwise `~/.dsh`. Returns null only for an unusable value.
 * @param configured - home passed by the host, if any.
 * @param fromEnv - `DSH_HOME` of the running process, if any.
 * @returns the absolute home, or null when the configured value is unusable.
 */
/**
 * Provider id used for synthesis, overridable in the user's own home file so the
 * published plugin carries no account-specific default. A malformed file falls
 * back silently: synthesis then uses the configured default provider.
 * @param home - resolved user home directory.
 * @returns the provider id to pass to the synthesizer.
 */
export declare function resolveSynthesisProvider(home: string): string;
/** Provider used when the user file names none; matches the Wiki skill's default. */
export declare const DEFAULT_SYNTHESIS_PROVIDER = "stepx-terra";
export declare function resolveDshHome(configured: string | undefined, fromEnv: string | undefined): string | null;
/**
 * Validate explicit IDs only; never a selector fragment or a shell command.
 * @param raw - untrusted id list.
 * @param max - largest accepted list; the user selection and the expanded
 * scope have different limits ({@link MAX_ARCHIVE_SELECTION} vs
 * {@link MAX_ARCHIVE_SCOPE}).
 * @returns the de-duplicated ids.
 */
export declare function validateWikiIds(raw: unknown, max?: number): string[];
/** Preview is read-only. A short-lived, single-use token authorizes a fixed set. */
export declare function createWikiArchiver(options?: WikiArchiverOptions): WikiArchiver;
export {};
