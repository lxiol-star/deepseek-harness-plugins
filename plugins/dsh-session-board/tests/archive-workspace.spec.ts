import { describe, expect, it, vi, afterEach } from 'vitest'
import { archiveRevision, completedArchiveMarks, isArchived, isArchivedInClient, reviveArchiveMarks } from '../src/client/archive-marks.ts'
import { filterGroups, DEFAULT_FILTERS, workspaceChoices } from '../src/client/filters.ts'
import { buildWorkspaceNodes } from '../src/client/workspace-tree.ts'
import { buildEntry } from '../src/shared/board.ts'
import { groupEntries } from '../src/shared/order.ts'
import { EMPTY_FEED, type BoardSessionInput } from '../src/shared/types.ts'
import type { ArchiveSummary } from '../src/shared/archive.ts'
import { createStore } from '../src/client/store.ts'

const input: BoardSessionInput = { id: 'one', title: 'Wallet', workspaceTitle: 'gateway', workspaceId: 'gw', workspacePath: '/projects/gateway', isSubagent: false, parentId: null, running: false, pendingInteraction: null, completionUnread: false, retainedMainView: false, updatedAt: 1000, tokenUsage: null, sessionStats: null, turnOutline: null, runningSubagentCount: 0, liveJobCount: 0 }
const entry = (overrides: Partial<BoardSessionInput> = {}) => buildEntry({ ...input, ...overrides }, { now: 2000, feed: EMPTY_FEED })
const summary: ArchiveSummary = { archived: 1, skipped: 0, empty: 0, failed: 0, selected: 1, dry_run: false, results: [{ session: 'one', action: 'archived', source: '/test/one', page: 'raw/sessions/host/dsh/one.md' }], workflow: { synthesis: [{ session: 'one', page: 'raw/sessions/host/dsh/one.md', status: 'skipped', pages: [] }], index: 'not-needed' } }
afterEach(() => vi.unstubAllGlobals())

describe('archived session visibility', () => {
  it('marks successful raw + synthesis SKIP, but not failed or sensitive synthesis', () => {
    const original = entry()
    const marks = completedArchiveMarks(summary, [original], 3000)
    expect(isArchived(original, marks)).toBe(true)
    for (const status of ['failed', 'sensitive'] as const) {
      const failed = { ...summary, workflow: { synthesis: [{ ...summary.workflow!.synthesis[0]!, status }], index: 'not-needed' as const } }
      expect(completedArchiveMarks(failed, [original], 3000)).toEqual({})
    }
    const { workflow: _workflow, ...rawOnly } = summary
    expect(completedArchiveMarks(rawOnly, [original], 3000)).toEqual({})
  })
  it('shows new activity, running work and background jobs again without losing the old mark', () => {
    const original = entry(), marks = completedArchiveMarks(summary, [original], 3000)
    expect(isArchived(entry({ updatedAt: 4000 }), marks)).toBe(false)
    expect(isArchived(entry({ running: true }), marks)).toBe(false)
    expect(isArchived(entry({ liveJobCount: 1 }), marks)).toBe(false)
    expect(isArchived(entry({ pendingInteraction: 'approval' }), marks)).toBe(false)
    expect(completedArchiveMarks(summary, [entry({ running: true })], 3000)).toEqual({})
    expect(isArchived({ ...original, preview: { ...original.preview, activity: 'A new reply' } }, marks)).toBe(false)
    expect(archiveRevision(original)).toBe(marks.one?.revision)
  })
  it('remembers marks after store recreation and rejects corrupt persisted entries', () => {
    const saved = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) })
    const options = { persist: 'archive-test', revive: reviveArchiveMarks }
    const store = createStore({}, options)
    store.set(completedArchiveMarks(summary, [entry()], 3000))
    expect(isArchived(entry(), createStore({}, options).getSnapshot())).toBe(true)
    expect(reviveArchiveMarks({ broken: { archivedAt: 'not-a-date' } })).toEqual({})
  })
  it('combines archive visibility with workspace/status/search', () => {
    const original = { ...entry(), archivedAt: 3000 }, other = entry({ id: 'two', running: true })
    const groups = groupEntries([original, other])
    const ids = (archive: 'all' | 'active' | 'archived') => filterGroups(groups, { ...DEFAULT_FILTERS, archive }).flatMap(group => group.entries.map(row => row.id))
    expect(ids('active')).toEqual(['two'])
    expect(ids('archived')).toEqual(['one'])
    expect(ids('all')).toHaveLength(2)
    expect(filterGroups(groups, { query: 'wallet', status: 'running', workspace: 'gw', archive: 'active' }).flatMap(group => group.entries)).toEqual([other])
  })
})

describe('workspace grouping', () => {
  const rows = [entry(), entry({ id: 'two', workspaceId: 'ui', workspaceTitle: 'web', workspacePath: '/projects/web' }), entry({ id: 'three', workspaceId: 'other-gw', workspaceTitle: 'gateway', workspacePath: '/other/gateway' })]
  it('keeps identical display names separate by workspace identity', () => {
    const groups = groupEntries(rows)
    const nodes = buildWorkspaceNodes(groups, false)
    expect(nodes).toHaveLength(3)
    expect(nodes.map(node => node.key)).toContain('workspace:gw')
    expect(workspaceChoices(groups)).toHaveLength(3)
    expect(filterGroups(groups, { ...DEFAULT_FILTERS, workspace: 'gw' }).flatMap(group => group.entries.map(row => row.id))).toEqual(['one'])
  })
  it('groups shared path prefixes, counts descendants and never duplicates sessions', () => {
    const nodes = buildWorkspaceNodes(groupEntries(rows), true)
    const walk = (list: typeof nodes): string[] => list.flatMap(node => [...node.entries.map(row => row.id), ...walk(node.children)])
    expect(walk(nodes).sort()).toEqual(['one', 'three', 'two'])
    expect(nodes.find(node => node.path === '/projects')?.count).toBe(2)
    expect(nodes.reduce((sum, node) => sum + node.count, 0)).toBe(3)
  })
  it('handles missing paths and Windows paths without inventing a parent relation', () => {
    const nodes = buildWorkspaceNodes(groupEntries([entry({ workspaceId: '', workspaceTitle: '', workspacePath: '' }), entry({ id: 'win', workspaceId: 'win', workspacePath: 'C:\\projects\\gateway' })]), true)
    expect(nodes.reduce((sum, node) => sum + node.count, 0)).toBe(2)
    expect(nodes.some(node => node.path === 'C:/projects/gateway')).toBe(true)
  })
})

describe('client archive parity', () => {
  const archivedInput = (overrides: Partial<BoardSessionInput> = {}): BoardSessionInput => ({ ...input, ...overrides })
  it('marks a session archived in DSH itself and hides it from the default view', () => {
    const row = buildEntry(archivedInput({ clientArchived: true }), { now: 2000, feed: EMPTY_FEED })
    expect(row.clientArchived).toBe(true)
    const groups = groupEntries([row, buildEntry(archivedInput({ id: 'live' }), { now: 2000, feed: EMPTY_FEED })])
    const ids = (archive: 'all' | 'active' | 'archived') => filterGroups(groups, { ...DEFAULT_FILTERS, archive }).flatMap(group => group.entries.map(entry => entry.id))
    expect(ids('active')).toEqual(['live'])
    expect(ids('archived')).toEqual(['one'])
    expect(ids('all')).toHaveLength(2)
  })
  it('treats the client archive as authoritative over the local Wiki marker', () => {
    const marked = { ...entry(), archivedAt: 3000, clientArchived: true }
    expect(isArchivedInClient(marked)).toBe(true)
    // A client-archived card never gains a second "archived" state from the local marks.
    expect(isArchived(marked, completedArchiveMarks(summary, [entry()], 3000))).toBe(false)
    expect(isArchivedInClient(entry())).toBe(false)
  })
  it('reads the archive set from the workspaces snapshot instead of its own list', async () => {
    const { assembleInputs } = await import('../src/client/source.ts')
    const rows = assembleInputs({ list: { ids: ['one', 'two'], byId: { one: { id: 'one', displayTitle: 'One', running: false, blank: false, updatedAt: 1 }, two: { id: 'two', displayTitle: 'Two', running: false, blank: false, updatedAt: 2 } } }, statuses: new Map(), jobRows: {}, workspaces: { items: [], archivedSessionIds: ['one', 'two'] } })
    expect(rows.map(row => row.clientArchived)).toEqual([true, true])
    const none = assembleInputs({ list: { ids: ['one'], byId: { one: { id: 'one', displayTitle: 'One', running: false, blank: false, updatedAt: 1 } } }, statuses: new Map(), jobRows: {}, workspaces: null })
    expect(none[0]?.clientArchived).toBeUndefined()
  })
})
