import { describe, expect, it, vi } from 'vitest'
import { archiveCompletedSessions } from '../src/client/native-archive.ts'
import { buildEntry } from '../src/shared/board.ts'
import { EMPTY_FEED, type BoardSessionInput } from '../src/shared/types.ts'
import type { ArchiveSummary } from '../src/shared/archive.ts'

const input: BoardSessionInput = { id: 'one', title: 'Wallet', workspaceTitle: 'gateway', workspaceId: 'gw', workspacePath: '/projects/gateway', isSubagent: false, parentId: null, running: false, pendingInteraction: null, completionUnread: false, retainedMainView: false, updatedAt: 1000, tokenUsage: null, sessionStats: null, turnOutline: null, runningSubagentCount: 0, liveJobCount: 0 }
const entry = (overrides: Partial<BoardSessionInput> = {}) => buildEntry({ ...input, ...overrides }, { now: 2000, feed: EMPTY_FEED })
const summary = (overrides: Partial<ArchiveSummary> = {}): ArchiveSummary => ({
  archived: 1, skipped: 0, empty: 0, failed: 0, selected: 1, dry_run: false,
  results: [{ session: 'one', action: 'archived', source: '/test/one', page: 'raw/sessions/host/dsh/one.md' }],
  workflow: { synthesis: [{ session: 'one', page: 'raw/sessions/host/dsh/one.md', status: 'skipped', pages: [] }], index: 'not-needed' },
  ...overrides,
})
const options = (archive: (id: string) => Promise<void>, overrides: Partial<Parameters<typeof archiveCompletedSessions>[1]> = {}) => ({
  captured: [entry()], current: () => [entry()], archivedIds: () => [], archive, disposed: () => false, ...overrides,
})

describe('native DSH archive after the Wiki workflow', () => {
  it('archives a successfully synthesized idle session', async () => {
    const archive = vi.fn(async () => {})
    expect(await archiveCompletedSessions(summary(), options(archive))).toEqual([{ session: 'one', status: 'archived' }])
    expect(archive).toHaveBeenCalledWith('one')
  })
  it('archives an empty session without synthesis but never pretends it was synthesized', async () => {
    const archive = vi.fn(async () => {})
    const empty = summary({ results: [{ session: 'one', action: 'empty', source: '/test/one' }], workflow: { synthesis: [], index: 'not-needed' } })
    expect(await archiveCompletedSessions(empty, options(archive))).toEqual([{ session: 'one', status: 'empty-archived' }])
    expect(archive).toHaveBeenCalledOnce()
  })
  it('never archives when synthesis failed, was sensitive, or the index failed', async () => {
    for (const overrides of [
      { workflow: { synthesis: [{ session: 'one', page: 'raw/sessions/host/dsh/one.md', status: 'failed' as const, pages: [] }], index: 'not-needed' as const } },
      { workflow: { synthesis: [{ session: 'one', page: 'raw/sessions/host/dsh/one.md', status: 'sensitive' as const, pages: [] }], index: 'not-needed' as const } },
      { workflow: { synthesis: [{ session: 'one', page: 'raw/sessions/host/dsh/one.md', status: 'skipped' as const, pages: [] }], index: 'failed' as const } },
    ]) {
      const archive = vi.fn(async () => {})
      expect(await archiveCompletedSessions(summary(overrides), options(archive))).toEqual([{ session: 'one', status: 'wiki-failed' }])
      expect(archive).not.toHaveBeenCalled()
    }
    const rawOnly = summary()
    delete rawOnly.workflow
    const archive = vi.fn(async () => {})
    expect(await archiveCompletedSessions(rawOnly, options(archive))).toEqual([{ session: 'one', status: 'wiki-failed' }])
    expect(archive).not.toHaveBeenCalled()
  })
  it('keeps sessions with newer content or active work in the workspace', async () => {
    const archive = vi.fn(async () => {})
    expect(await archiveCompletedSessions(summary(), options(archive, { current: () => [entry({ updatedAt: 5000 })] }))).toEqual([{ session: 'one', status: 'changed' }])
    expect(await archiveCompletedSessions(summary(), options(archive, { current: () => [entry({ running: true })] }))).toEqual([{ session: 'one', status: 'active' }])
    expect(await archiveCompletedSessions(summary(), options(archive, { current: () => [entry({ liveJobCount: 2 })] }))).toEqual([{ session: 'one', status: 'active' }])
    expect(await archiveCompletedSessions(summary(), options(archive, { current: () => [entry({ pendingInteraction: 'approval' })] }))).toEqual([{ session: 'one', status: 'active' }])
    expect(archive).not.toHaveBeenCalled()
  })
  it('reports already-archived, unavailable, rejected and disposed outcomes', async () => {
    const archive = vi.fn(async () => {})
    expect(await archiveCompletedSessions(summary(), options(archive, { archivedIds: () => ['one'] }))).toEqual([{ session: 'one', status: 'already-archived' }])
    expect(await archiveCompletedSessions(summary(), options(archive, { current: () => [] }))).toEqual([{ session: 'one', status: 'unavailable' }])
    expect(await archiveCompletedSessions(summary(), options(archive, { disposed: () => true }))).toEqual([{ session: 'one', status: 'unavailable' }])
    expect(await archiveCompletedSessions(summary(), options(async () => { throw new Error('rejected') }))).toEqual([{ session: 'one', status: 'failed' }])
    expect(archive).not.toHaveBeenCalled()
  })
  it('continues with the remaining sessions after one rejection', async () => {
    const archive = vi.fn(async (id: string) => { if (id === 'one') throw new Error('rejected') })
    const two = entry({ id: 'two' })
    const result = await archiveCompletedSessions(summary({
      results: [{ session: 'one', action: 'archived', source: '/test/one', page: 'raw/sessions/host/dsh/one.md' }, { session: 'two', action: 'archived', source: '/test/two', page: 'raw/sessions/host/dsh/two.md' }],
      workflow: { synthesis: [
        { session: 'one', page: 'raw/sessions/host/dsh/one.md', status: 'skipped', pages: [] },
        { session: 'two', page: 'raw/sessions/host/dsh/two.md', status: 'skipped', pages: [] },
      ], index: 'not-needed' },
    }), options(archive, { captured: [entry(), two], current: () => [entry(), two] }))
    expect(result).toEqual([{ session: 'one', status: 'failed' }, { session: 'two', status: 'archived' }])
  })
})
