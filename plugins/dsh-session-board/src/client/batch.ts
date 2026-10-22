import { createStore } from './store.ts'
import type { ArchiveMode, ArchivePreview, ArchiveSummary } from '../shared/archive.ts'
import { MAX_ARCHIVE_SELECTION } from '../shared/archive.ts'

export interface BatchState {
  selected: readonly string[]
  phase: 'idle' | 'previewing' | 'confirming' | 'archiving'
  /** Follow-up selected for the next confirmation: full synthesis or archive only. */
  mode: ArchiveMode
  preview: ArchivePreview | null
  result: ArchiveSummary | null
  /** Stable error code for the localized message. */
  error: string | null
  /** Host/bridge diagnostic behind that code, when it sent one. */
  errorDetail: string | null
}
export interface ArchiveTransport {
  preview(ids: readonly string[], mode?: ArchiveMode): Promise<ArchivePreview>
  commit(token: string): Promise<ArchiveSummary>
}

/**
 * Mode a finished batch actually ran; the summary drops `workflow` for
 * archive-only batches, so the panel does not render an empty synthesis block.
 * @param result - finished archive summary.
 * @param fallback - mode the confirmation was started with.
 * @returns the effective mode.
 */
function modeOf(result: ArchiveSummary, fallback: ArchiveMode): ArchiveMode {
  return result.workflow === undefined && fallback === 'archive' ? 'archive' : 'full'
}

/** Stable code of one transport failure. */
function codeOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : String(error)
}

/** Host/bridge diagnostic carried by a transport failure, when present. */
function detailOf(error: unknown): string | null {
  const detail = (error as { detail?: unknown } | null)?.detail
  return typeof detail === 'string' && detail.trim() !== '' ? detail : null
}

/** One shared, explicit preview/confirm/write state machine for both views. */
export class BatchController {
  private readonly state = createStore<BatchState>({ selected: [], phase: 'idle', mode: 'full', preview: null, result: null, error: null, errorDetail: null })
  private disposed = false
  constructor(private readonly transport: ArchiveTransport) {}
  readonly getSnapshot = this.state.getSnapshot
  readonly subscribe = this.state.subscribe
  readonly toggle = (id: string): void => {
    const s = this.getSnapshot()
    if (s.phase !== 'idle' && s.phase !== 'confirming') return
    const selected = s.selected.includes(id) ? s.selected.filter(x => x !== id) : [...s.selected, id].slice(0, MAX_ARCHIVE_SELECTION)
    this.state.set({ ...s, selected, phase: 'idle', preview: null, error: null, errorDetail: null, result: null })
  }
  readonly selectAll = (ids: readonly string[]): void => {
    if (this.isBusy()) return
    this.state.set({ ...this.getSnapshot(), selected: [...new Set(ids)].slice(0, MAX_ARCHIVE_SELECTION), phase: 'idle', preview: null, error: null, errorDetail: null, result: null })
  }
  readonly reconcile = (ids: readonly string[]): void => {
    if (this.isBusy()) return
    const live = new Set(ids)
    const s = this.getSnapshot()
    const selected = s.selected.filter(id => live.has(id))
    if (selected.length !== s.selected.length) this.state.set({ ...s, selected, preview: null, phase: 'idle' })
  }
  readonly clear = (): void => { if (!this.isBusy()) this.selectAll([]) }
  readonly cancel = (): void => {
    if (!this.isBusy()) this.state.set({ ...this.getSnapshot(), phase: 'idle', preview: null })
  }
  /**
   * Drop a finished batch result (counts, synthesis rows, native-archive rows)
   * and any error, so the panel stops occupying space once it has been read.
   */
  readonly dismissResult = (): void => {
    if (this.isBusy()) return
    const s = this.getSnapshot()
    if (s.result === null && s.error === null) return
    this.state.set({ ...s, result: null, error: null, errorDetail: null })
  }
  readonly preview = async (mode: ArchiveMode = 'full'): Promise<void> => {
    const s = this.getSnapshot()
    if (this.disposed || this.isBusy() || s.selected.length === 0) return
    this.state.set({ ...s, phase: 'previewing', mode, error: null, errorDetail: null, result: null })
    try {
      const preview = await this.transport.preview(s.selected, mode)
      if (!this.disposed) this.state.set({ ...this.getSnapshot(), phase: 'confirming', preview })
    } catch (error) {
      if (!this.disposed) this.state.set({ ...this.getSnapshot(), phase: 'idle', error: codeOf(error), errorDetail: detailOf(error) })
    }
  }
  readonly confirm = async (): Promise<void> => {
    const s = this.getSnapshot()
    if (this.disposed || s.phase !== 'confirming' || s.preview === null) return
    this.state.set({ ...s, phase: 'archiving', error: null, errorDetail: null })
    try {
      const result = await this.transport.commit(s.preview.token)
      if (this.disposed) return
      const incomplete = new Set(result.workflow?.synthesis.filter(row => row.status === 'failed' || row.status === 'sensitive').map(row => row.session) ?? [])
      const succeeded = new Set(result.nativeArchive
        ? result.nativeArchive.filter(row => ['archived', 'already-archived', 'empty-archived'].includes(row.status)).map(row => row.session)
        : result.results.filter(row => (row.action === 'archived' || row.action === 'skipped') && !incomplete.has(row.session)).map(row => row.session))
      this.state.set({ selected: s.selected.filter(id => !succeeded.has(id)), phase: 'idle', mode: modeOf(result, s.mode), preview: null, result, error: null, errorDetail: null })
    } catch (error) {
      if (!this.disposed) this.state.set({ ...s, phase: 'idle', preview: null, error: codeOf(error), errorDetail: detailOf(error) })
    }
  }
  isBusy(): boolean { return ['previewing', 'archiving'].includes(this.getSnapshot().phase) }
  dispose(): void { this.disposed = true }
}
