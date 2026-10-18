import type { ArchiveSummary } from '../shared/archive.ts';
import type { BoardEntry } from '../shared/types.ts';
export type NativeArchiveOutcome = 'archived' | 'already-archived' | 'empty-archived' | 'active' | 'changed' | 'unavailable' | 'wiki-failed' | 'failed';
export interface NativeArchiveResult {
    session: string;
    status: NativeArchiveOutcome;
}
export interface NativeArchiveOptions {
    captured: readonly BoardEntry[];
    current: () => readonly BoardEntry[];
    archivedIds: () => readonly string[];
    archive: (id: string) => Promise<void>;
    disposed: () => boolean;
}
/** DSH owns its archive set. Never stop active work or archive newer messages. */
export declare function archiveCompletedSessions(summary: ArchiveSummary, options: NativeArchiveOptions): Promise<NativeArchiveResult[]>;
