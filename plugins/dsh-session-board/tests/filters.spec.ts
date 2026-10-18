import { describe, expect, it } from 'vitest'
import { filterGroups, DEFAULT_FILTERS, workspaceOptions } from '../src/client/filters.ts'
import { buildEntry } from '../src/shared/board.ts'
import { groupEntries } from '../src/shared/order.ts'
import { EMPTY_FEED, type BoardSessionInput } from '../src/shared/types.ts'

const input: BoardSessionInput = { id: 'one', title: 'Deploy API', workspaceTitle: 'Gateway', isSubagent: false, parentId: null, running: false, pendingInteraction: null, completionUnread: false, retainedMainView: false, updatedAt: 1000, tokenUsage: null, sessionStats: null, turnOutline: null, runningSubagentCount: 0, liveJobCount: 0 }
const build = (overrides: Partial<BoardSessionInput>) => buildEntry({ ...input, ...overrides }, { now: 10000, feed: EMPTY_FEED })
const waiting = build({ pendingInteraction: 'approval' })
waiting.preview.activity = 'Waiting to publish the wallet service'
const running = build({ id: 'two', title: 'Review UI', workspaceTitle: 'Web', running: true })
const unread = build({ id: 'three', title: 'Old report', completionUnread: true })
const groups = groupEntries([waiting, running, unread])
const ids = (value: ReturnType<typeof filterGroups>) => value.flatMap(group => group.entries.map(entry => entry.id))

describe('shared board filters', () => {
  it('keeps every entry and group order with default filters', () => {
    expect(ids(filterGroups(groups, DEFAULT_FILTERS))).toEqual(ids(groups))
    expect(filterGroups(groups, DEFAULT_FILTERS).map(group => group.id)).toEqual(groups.map(group => group.id))
  })
  it('matches case-insensitive words across title, workspace and preview', () => {
    expect(ids(filterGroups(groups, { ...DEFAULT_FILTERS, query: '  API WALLET  ' }))).toEqual(['one'])
    expect(ids(filterGroups(groups, { ...DEFAULT_FILTERS, query: 'does not exist' }))).toEqual([])
  })
  it('distinguishes real waiting from unread completion', () => {
    expect(ids(filterGroups(groups, { ...DEFAULT_FILTERS, status: 'blocked' }))).toEqual(['one'])
    expect(ids(filterGroups(groups, { ...DEFAULT_FILTERS, status: 'running' }))).toEqual(['two'])
  })
  it('combines workspace and status without modifying source groups', () => {
    expect(ids(filterGroups(groups, { query: 'review', status: 'running', workspace: 'Web' }))).toEqual(['two'])
    expect(ids(filterGroups(groups, { ...DEFAULT_FILTERS, status: 'running', workspace: 'Gateway' }))).toEqual([])
    expect(ids(groups)).toHaveLength(3)
    expect(workspaceOptions(groups)).toEqual(['Gateway', 'Web'])
  })
})
