import type { BoardEntry } from '../shared/types.ts';
import type { ArchiveSummary } from '../shared/archive.ts';
/** The DSH client owns this state; the board never writes it and never guesses it. */
export declare function isArchivedInClient(entry: BoardEntry): boolean;
export interface ArchiveMark {
    archivedAt: number;
    revision: string;
    page: string;
}
export type ArchiveMarks = Record<string, ArchiveMark>;
/** Ignore transient unread/read status, but require the same observed session content. */
export declare function archiveRevision(entry: BoardEntry): string;
export declare function reviveArchiveMarks(raw: unknown): ArchiveMarks;
export declare function isArchived(entry: BoardEntry, marks: ArchiveMarks): boolean;
/** Mark only the revision visible when the user confirmed, never later messages. */
export declare function completedArchiveMarks(summary: ArchiveSummary, captured: readonly BoardEntry[], now: number): ArchiveMarks;
