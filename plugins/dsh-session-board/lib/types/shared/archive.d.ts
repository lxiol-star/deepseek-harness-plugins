export interface ArchiveRow {
    session: string;
    action: 'would-archive' | 'archived' | 'skipped' | 'empty' | 'failed';
    source: string;
    page?: string;
}
export interface ScopeEntry {
    session: string;
    source: string;
    parent: string | null;
    role: 'main' | 'child';
    evidence: string;
    snapshot: boolean;
}
export interface ArchiveScope {
    entries: ScopeEntry[];
    missing: {
        session: string;
        parent: string;
    }[];
}
export interface SynthesisResult {
    session: string;
    page: string;
    status: 'synthesized' | 'skipped' | 'failed' | 'sensitive';
    pages: string[];
    error?: string;
}
export interface WikiWorkflowResult {
    synthesis: SynthesisResult[];
    index: 'updated' | 'not-needed' | 'failed';
}
export interface ArchiveSummary {
    archived: number;
    skipped: number;
    empty: number;
    failed: number;
    selected: number;
    dry_run: boolean;
    results: ArchiveRow[];
    nativeArchive?: {
        session: string;
        status: 'archived' | 'already-archived' | 'empty-archived' | 'active' | 'changed' | 'unavailable' | 'wiki-failed' | 'failed';
    }[];
    scope?: ArchiveScope;
    workflow?: WikiWorkflowResult;
}
/**
 * What a batch does after copying the selected Sessions into the raw layer.
 *
 * `full` follows with synthesis and the index update (the original flow);
 * `archive` stops after the raw archive and DSH's native archive action, so a
 * batch can be preserved without spending model calls.
 */
export type ArchiveMode = 'full' | 'archive';
export interface ArchivePreview {
    token: string;
    expiresAt: number;
    summary: ArchiveSummary;
    /** Which follow-up the confirmation will run. */
    mode: ArchiveMode;
}
export declare const MAX_ARCHIVE_SELECTION = 50;
/**
 * Capability level the browser half requires from the running host half.
 *
 * 2 adds the configurable self-contained Wiki engine, the `wiki-config` route
 * and the diagnostic `detail` field on archive errors.
 */
export declare const WIKI_WORKFLOW_CAPABILITY = 2;
export declare const WIKI_ARCHIVE_PATH = "/api/session-board/wiki-archive";
/** Do not trust a subprocess or HTTP response to satisfy a TypeScript cast. */
export declare function parseArchiveSummary(raw: unknown): ArchiveSummary;
export declare function parseArchiveScope(raw: unknown): ArchiveScope;
export declare function parseWikiWorkflow(raw: unknown): WikiWorkflowResult;
