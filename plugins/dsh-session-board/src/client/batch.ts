import { createStore } from './store.ts'
import type { ArchivePreview, ArchiveSummary } from '../shared/archive.ts'
import { MAX_ARCHIVE_SELECTION } from '../shared/archive.ts'

export interface BatchState {
  selected: readonly string[]
  phase: 'idle' | 'previewing' | 'confirming' | 'archiving'
  preview: ArchivePreview | null
  result: ArchiveSummary | null
  error: string | null
}
export interface ArchiveTransport {
  preview(ids: readonly string[]): Promise<ArchivePreview>
  commit(token: string): Promise<ArchiveSummary>
}

/** One shared, explicit preview/confirm/write state machine for both views. */
export class BatchController {
  private readonly state = createStore<BatchState>({ selected: [], phase: 'idle', preview: null, result: null, error: null })
  private disposed = false
  constructor(private readonly transport: ArchiveTransport) {}
  readonly getSnapshot = this.state.getSnapshot
  readonly subscribe = this.state.subscribe
  readonly toggle = (id: string): void => {
    const s = this.getSnapshot()
    if (s.phase !== 'idle' && s.phase !== 'confirming') return
    const selected = s.selected.includes(id) ? s.selected.filter(x => x !== id) : [...s.selected, id].slice(0, MAX_ARCHIVE_SELECTION)
    this.state.set({ ...s, selected, phase: 'idle', preview: null, error: null, result: null })
  }
  readonly selectAll = (ids: readonly string[]): void => {
    if (this.isBusy()) return
    this.state.set({ ...this.getSnapshot(), selected: [...new Set(ids)].slice(0, MAX_ARCHIVE_SELECTION), phase: 'idle', preview: null, error: null, result: null })
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
  readonly preview = async (): Promise<void> => {
    const s = this.getSnapshot()
    if (this.disposed || this.isBusy() || s.selected.length === 0) return
    this.state.set({ ...s, phase: 'previewing', error: null, result: null })
    try {
      const preview = await this.transport.preview(s.selected)
      if (!this.disposed) this.state.set({ ...this.getSnapshot(), phase: 'confirming', preview })
    } catch (error) {
      if (!this.disposed) this.state.set({ ...this.getSnapshot(), phase: 'idle', error: error instanceof Error ? error.message : String(error) })
    }
  }
  readonly confirm = async (): Promise<void> => {
    const s = this.getSnapshot()
    if (this.disposed || s.phase !== 'confirming' || s.preview === null) return
    this.state.set({ ...s, phase: 'archiving', error: null })
    try {
      const result = await this.transport.commit(s.preview.token)
      if (this.disposed) return
      const incomplete = new Set(result.workflow?.synthesis.filter(row => row.status === 'failed' || row.status === 'sensitive').map(row => row.session) ?? [])
      const succeeded = new Set(result.results.filter(row => (row.action === 'archived' || row.action === 'skipped') && !incomplete.has(row.session)).map(row => row.session))
      this.state.set({ selected: s.selected.filter(id => !succeeded.has(id)), phase: 'idle', preview: null, result, error: null })
    } catch (error) {
      if (!this.disposed) this.state.set({ ...s, phase: 'idle', preview: null, error: error instanceof Error ? error.message : String(error) })
    }
  }
  isBusy(): boolean { return ['previewing', 'archiving'].includes(this.getSnapshot().phase) }
  dispose(): void { this.disposed = true }
}
