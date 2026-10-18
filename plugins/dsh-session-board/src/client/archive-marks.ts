import type { BoardEntry } from '../shared/types.ts'
import type { ArchiveSummary } from '../shared/archive.ts'

/** The DSH client owns this state; the board never writes it and never guesses it. */
export function isArchivedInClient(entry: BoardEntry): boolean {
  return entry.clientArchived === true
}
export interface ArchiveMark { archivedAt: number; revision: string; page: string }
export type ArchiveMarks = Record<string, ArchiveMark>

/** Ignore transient unread/read status, but require the same observed session content. */
export function archiveRevision(entry: BoardEntry): string {
  return JSON.stringify([entry.lastActivityAt, entry.progress.turnN, entry.progress.stepM, entry.metrics.inputTokens,
    entry.metrics.outputTokens, entry.preview.instruction, entry.preview.activity, entry.preview.jobs ?? [], entry.errorNote])
}
export function reviveArchiveMarks(raw: unknown): ArchiveMarks {
  const result: ArchiveMarks = Object.create(null) as ArchiveMarks
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) continue
    const mark = value as Record<string, unknown>
    if (typeof mark.archivedAt === 'number' && Number.isFinite(mark.archivedAt) && typeof mark.revision === 'string' && typeof mark.page === 'string') {
      result[id] = { archivedAt: mark.archivedAt, revision: mark.revision, page: mark.page }
    }
  }
  return result
}
export function isArchived(entry: BoardEntry, marks: ArchiveMarks): boolean {
  return !isArchivedInClient(entry) && entry.state !== 'running' && entry.state !== 'blocked' && entry.metrics.liveJobs === 0 && entry.metrics.runningSubagents === 0
    && Object.hasOwn(marks, entry.id) && marks[entry.id]?.revision === archiveRevision(entry)
}
/** Mark only the revision visible when the user confirmed, never later messages. */
export function completedArchiveMarks(summary: ArchiveSummary, captured: readonly BoardEntry[], now: number): ArchiveMarks {
  const result: ArchiveMarks = Object.create(null) as ArchiveMarks
  if (summary.workflow?.index === 'failed') return result
  for (const entry of captured) {
    const row = summary.results.find(item => item.session === entry.id)
    const synthesis = summary.workflow?.synthesis.find(item => item.session === entry.id)
    if (!row?.page || !['archived', 'skipped'].includes(row.action) || !synthesis || !['synthesized', 'skipped'].includes(synthesis.status)) continue
    if (entry.state === 'running' || entry.state === 'blocked' || entry.metrics.liveJobs > 0 || entry.metrics.runningSubagents > 0) continue
    result[entry.id] = { archivedAt: now, revision: archiveRevision(entry), page: row.page }
  }
  return result
}
