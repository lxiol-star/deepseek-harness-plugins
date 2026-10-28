import { describe, it, expect, vi } from 'vitest'
import { BatchController } from '../src/client/batch.ts'
import type { ArchiveSummary, ArchivePreview } from '../src/shared/archive.ts'

const summary = (rows: ArchiveSummary['results'], dry_run = false): ArchiveSummary => ({
  archived: rows.filter(row => ['archived', 'would-archive'].includes(row.action)).length,
  skipped: rows.filter(row => row.action === 'skipped').length,
  empty: rows.filter(row => row.action === 'empty').length,
  failed: rows.filter(row => row.action === 'failed').length,
  selected: rows.length, dry_run, results: rows,
})
const plan: ArchivePreview = { token: 'token', expiresAt: Date.now() + 30_000, mode: 'full', summary: summary([{ session: 'a', source: 'a', action: 'would-archive' }, { session: 'b', source: 'b', action: 'would-archive' }], true) }

describe('batch archive state machine', () => {
  it('preview never commits and confirmation commits exactly once', async () => {
    const commit = vi.fn(async () => summary([{ session: 'a', source: 'a', action: 'archived' }]))
    const controller = new BatchController({ preview: async () => plan, commit })
    controller.toggle('a')
    await controller.preview()
    expect(controller.getSnapshot().phase).toBe('confirming')
    expect(commit).not.toHaveBeenCalled()
    await Promise.all([controller.confirm(), controller.confirm()])
    expect(commit).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().selected).toEqual([])
  })
  it('keeps failed and empty rows selected, clears only success', async () => {
    const controller = new BatchController({ preview: async () => plan, commit: async () => summary([
      { session: 'a', source: 'a', action: 'archived' }, { session: 'b', source: 'b', action: 'failed' }, { session: 'c', source: 'c', action: 'empty' },
    ]) })
    controller.selectAll(['a', 'b', 'c'])
    await controller.preview(); await controller.confirm()
    expect(controller.getSnapshot().selected).toEqual(['b', 'c'])
    expect(controller.getSnapshot().result?.failed).toBe(1)
  })
  it('retains selection after network failure with no unhandled rejection', async () => {
    const controller = new BatchController({ preview: async () => { throw new Error('REQUEST_FAILED') }, commit: vi.fn() })
    controller.toggle('a'); await controller.preview()
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', selected: ['a'], error: 'REQUEST_FAILED' })
  })
  it('keeps the host diagnostic next to the localized error code', async () => {
    const failure = Object.assign(new Error('SCOPE_FAILED'), { detail: 'ValueError: SELECTION_MISMATCH' })
    const controller = new BatchController({ preview: async () => { throw failure }, commit: vi.fn() })
    controller.toggle('a'); await controller.preview()
    expect(controller.getSnapshot()).toMatchObject({ error: 'SCOPE_FAILED', errorDetail: 'ValueError: SELECTION_MISMATCH' })
    controller.dismissResult()
    expect(controller.getSnapshot()).toMatchObject({ error: null, errorDetail: null })
  })
  it('cancel invalidates preview; changing selection requires a new preview', async () => {
    const commit = vi.fn()
    const controller = new BatchController({ preview: async () => plan, commit })
    controller.toggle('a'); await controller.preview(); controller.toggle('b'); await controller.confirm()
    expect(controller.getSnapshot().phase).toBe('idle')
    expect(commit).not.toHaveBeenCalled()
  })
  it('runs an archive-only preview and commit without a synthesis workflow', async () => {
    const preview = vi.fn(async (_ids: readonly string[], _mode?: string) => ({ ...plan, mode: 'archive' as const }))
    const commit = vi.fn(async () => summary([{ session: 'a', source: 'a', action: 'archived' }]))
    const controller = new BatchController({ preview, commit })
    controller.toggle('a')
    await controller.preview('archive')
    expect(preview).toHaveBeenCalledWith(['a'], 'archive')
    expect(controller.getSnapshot()).toMatchObject({ phase: 'confirming', mode: 'archive' })
    await controller.confirm()
    expect(commit).toHaveBeenCalledWith('token', 'archive')
    expect(controller.getSnapshot()).toMatchObject({ phase: 'idle', mode: 'archive', error: null })
    expect(controller.getSnapshot().result?.workflow).toBeUndefined()
  })
  it('caps and deduplicates select-all', () => {
    const controller = new BatchController({ preview: vi.fn(), commit: vi.fn() })
    controller.selectAll(Array.from({ length: 100 }, (_, i) => String(i)))
    expect(controller.getSnapshot().selected).toHaveLength(50)
  })
  it('dismisses a finished result and a request error', async () => {
    const controller = new BatchController({
      preview: async () => plan,
      commit: async () => summary([{ session: 'a', source: 'a', action: 'archived' }]),
    })
    controller.toggle('a')
    await controller.preview(); await controller.confirm()
    expect(controller.getSnapshot().result).not.toBeNull()
    controller.dismissResult()
    expect(controller.getSnapshot()).toMatchObject({ result: null, error: null })

    const failing = new BatchController({ preview: async () => { throw new Error('REQUEST_FAILED') }, commit: vi.fn() })
    failing.toggle('a'); await failing.preview()
    expect(failing.getSnapshot().error).toBe('REQUEST_FAILED')
    failing.dismissResult()
    expect(failing.getSnapshot().error).toBeNull()
  })
  it('does not dismiss while a batch is running', async () => {
    let resolve!: (value: ArchiveSummary) => void
    const controller = new BatchController({ preview: async () => plan, commit: () => new Promise(r => { resolve = r }) })
    controller.toggle('a'); await controller.preview()
    const pending = controller.confirm()
    controller.dismissResult()
    expect(controller.getSnapshot().phase).toBe('archiving')
    resolve(summary([{ session: 'a', source: 'a', action: 'archived' }]))
    await pending
    expect(controller.getSnapshot().result).not.toBeNull()
  })
  it('disposal ignores late network response', async () => {
    let resolve!: (value: ArchivePreview) => void
    const controller = new BatchController({ preview: () => new Promise(r => { resolve = r }), commit: vi.fn() })
    controller.toggle('a'); const pending = controller.preview(); controller.dispose(); resolve(plan); await pending
    expect(controller.getSnapshot().preview).toBeNull()
  })
})
