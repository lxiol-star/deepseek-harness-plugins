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
export interface ArchivePreview {
    token: string;
    expiresAt: number;
    summary: ArchiveSummary;
}
export declare const MAX_ARCHIVE_SELECTION = 50;
/**
 * Cap for the expanded scope: the selected Sessions plus every archived child
 * discovered through `parentSession` / subagent catalogs. Selecting 25 Sessions
 * whose trees contain 30 children stays a sane batch; the old single 50 cap
 * rejected it with a misleading "selection is invalid" message.
 */
export declare const MAX_ARCHIVE_SCOPE = 200;
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
