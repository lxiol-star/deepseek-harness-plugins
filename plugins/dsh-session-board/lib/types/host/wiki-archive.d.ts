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
/** Explicit IDs only; never a selector fragment or a shell command. */
export declare function validateWikiIds(raw: unknown): string[];
/** Preview is read-only. A short-lived, single-use token authorizes a fixed set. */
export declare function createWikiArchiver(options?: WikiArchiverOptions): WikiArchiver;
