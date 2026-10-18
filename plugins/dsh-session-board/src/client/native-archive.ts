import type { ArchiveSummary } from '../shared/archive.ts'
import type { BoardEntry } from '../shared/types.ts'
import { archiveRevision } from './archive-marks.ts'

export type NativeArchiveOutcome = 'archived' | 'already-archived' | 'empty-archived' | 'active' | 'changed' | 'unavailable' | 'wiki-failed' | 'failed'
export interface NativeArchiveResult { session: string; status: NativeArchiveOutcome }
export interface NativeArchiveOptions {
  captured: readonly BoardEntry[]
  current: () => readonly BoardEntry[]
  archivedIds: () => readonly string[]
  archive: (id: string) => Promise<void>
  disposed: () => boolean
}

/** DSH owns its archive set. Never stop active work or archive newer messages. */
export async function archiveCompletedSessions(summary: ArchiveSummary, options: NativeArchiveOptions): Promise<NativeArchiveResult[]> {
  const result: NativeArchiveResult[] = []
  for (const row of summary.results) {
    const finish = (status: NativeArchiveOutcome): void => { result.push({ session: row.session, status }) }
    if (options.disposed()) { finish('unavailable'); continue }
    const synthesis = summary.workflow?.synthesis.find(item => item.session === row.session)
    const empty = row.action === 'empty'
    if (!empty && (!['archived', 'skipped'].includes(row.action) || !synthesis || !['synthesized', 'skipped'].includes(synthesis.status) || summary.workflow?.index === 'failed')) {
      finish('wiki-failed'); continue
    }
    if (options.archivedIds().includes(row.session)) { finish('already-archived'); continue }
    const before = options.captured.find(entry => entry.id === row.session)
    const current = options.current().find(entry => entry.id === row.session)
    if (!before || !current) { finish('unavailable'); continue }
    if ([before, current].some(entry => entry.state === 'running' || entry.state === 'blocked' || entry.metrics.liveJobs > 0 || entry.metrics.runningSubagents > 0)) {
      finish('active'); continue
    }
    if (archiveRevision(before) !== archiveRevision(current)) { finish('changed'); continue }
    try {
      // No stopActivity option: the native host performs the final activity check atomically.
      await options.archive(row.session)
      finish(empty ? 'empty-archived' : 'archived')
    } catch { finish('failed') }
  }
  return result
}
