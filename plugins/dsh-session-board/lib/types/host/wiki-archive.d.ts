import { type ArchivePreview, type ArchiveSummary } from '../shared/archive.ts';
export declare class WikiArchiveError extends Error {
    readonly code: string;
    constructor(code: string);
}
export interface WikiArchiver {
    preview(ids: readonly string[]): Promise<ArchivePreview>;
    commit(token: string): Promise<ArchiveSummary>;
    close(): void;
}
export interface WikiArchiverOptions {
    home?: string;
    dshHome?: string;
    now?: () => number;
    workflow?: (operation: 'scope' | 'synthesize' | 'index', value: string, signal: AbortSignal) => Promise<unknown>;
    execute?: (args: readonly string[], signal: AbortSignal) => Promise<{
        stdout: string;
    }>;
}
/**
 * Resolve the harness home the way DSH itself does: an explicit value (config or
 * `$DSH_HOME`) wins, otherwise `~/.dsh`. Returns null only for an unusable value.
 * @param configured - home passed by the host, if any.
 * @param fromEnv - `DSH_HOME` of the running process, if any.
 * @returns the absolute home, or null when the configured value is unusable.
 */
export declare function resolveDshHome(configured: string | undefined, fromEnv: string | undefined): string | null;
/** Explicit IDs only; never a selector fragment or a shell command. */
export declare function validateWikiIds(raw: unknown): string[];
/** Preview is read-only. A short-lived, single-use token authorizes a fixed set. */
export declare function createWikiArchiver(options?: WikiArchiverOptions): WikiArchiver;
