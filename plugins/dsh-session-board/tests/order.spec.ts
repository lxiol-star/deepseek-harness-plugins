import { describe, expect, it } from 'vitest'
import { groupEntries, sortEntries } from '../src/shared/order.ts'
import type { BoardEntry, BoardGroupId, BoardState } from '../src/shared/types.ts'

/** A minimal entry; only the ordering fields matter here. */
function entry(id: string, state: BoardState, overrides: Partial<BoardEntry> = {}): BoardEntry {
  const group: BoardGroupId = state === 'running' ? 'running' : state === 'done' ? 'done' : 'attention'
  const attentionKind = state === 'done' || state === 'running' ? null : state
  return {
    id,
    title: id,
    workspaceTitle: '',
    isSubagent: false,
    state,
    group,
    attentionKind,
    waitSince: null,
    runSince: null,
    lastActivityAt: 0,
    isCurrent: false,
    preview: { instruction: '', activity: '' },
    progress: { turnN: null, stepM: null, ratio: null },
    metrics: {
      elapsedMs: null,
      totalBusyMs: null,
      outputTokens: null,
      inputTokens: null,
      rateTokS: null,
      cacheHitPct: null,
      liveJobs: 0,
      runningSubagents: 0,
    },
    errorNote: null,
    noteKey: null,
    pendingKey: null,
    ...overrides,
  }
}

describe('sortEntries', () => {
  it('puts attention before running before done, regardless of input order', () => {
    const sorted = sortEntries([
      entry('d1', 'done'),
      entry('r1', 'running'),
      entry('a1', 'blocked'),
    ])
    expect(sorted.map(item => item.id)).toEqual(['a1', 'r1', 'd1'])
  })

  it('orders blocked before error before unread inside the attention group', () => {
    const sorted = sortEntries([
      entry('u1', 'unread', { waitSince: 1 }),
      entry('e1', 'error', { waitSince: 1 }),
      entry('b1', 'blocked', { waitSince: 9 }),
    ])
    expect(sorted.map(item => item.id)).toEqual(['b1', 'e1', 'u1'])
  })

  it('puts the longest wait first within one attention sub-class', () => {
    const sorted = sortEntries([
      entry('new', 'blocked', { waitSince: 900 }),
      entry('old', 'blocked', { waitSince: 100 }),
      entry('mid', 'blocked', { waitSince: 500 }),
    ])
    expect(sorted.map(item => item.id)).toEqual(['old', 'mid', 'new'])
  })

  it('sorts an unknown wait last rather than first', () => {
    const sorted = sortEntries([
      entry('unknown', 'blocked', { waitSince: null }),
      entry('known', 'blocked', { waitSince: 100 }),
    ])
    expect(sorted.map(item => item.id)).toEqual(['known', 'unknown'])
  })

  it('puts the longest-running session first', () => {
    const sorted = sortEntries([
      entry('late', 'running', { runSince: 900 }),
      entry('early', 'running', { runSince: 100 }),
    ])
    expect(sorted.map(item => item.id)).toEqual(['early', 'late'])
  })

  it('puts the most recently finished session first', () => {
    const sorted = sortEntries([
      entry('older', 'done', { lastActivityAt: 100 }),
      entry('newer', 'done', { lastActivityAt: 900 }),
    ])
    expect(sorted.map(item => item.id)).toEqual(['newer', 'older'])
  })

  it('falls back to id so equal keys never reorder between calls', () => {
    const a = entry('a', 'running', { runSince: 1 })
    const b = entry('b', 'running', { runSince: 1 })
    expect(sortEntries([b, a]).map(item => item.id)).toEqual(['a', 'b'])
    expect(sortEntries([a, b]).map(item => item.id)).toEqual(['a', 'b'])
  })

  it('does not mutate its input', () => {
    const source = [entry('z', 'done'), entry('a', 'blocked')]
    const copy = [...source]
    sortEntries(source)
    expect(source).toEqual(copy)
  })
})

describe('groupEntries', () => {
  it('returns all three groups in order, even when some are empty', () => {
    const groups = groupEntries([entry('r1', 'running')])
    expect(groups.map(group => group.id)).toEqual(['attention', 'running', 'done'])
    expect(groups[0]?.entries).toEqual([])
    expect(groups[1]?.entries.map(item => item.id)).toEqual(['r1'])
    expect(groups[2]?.entries).toEqual([])
  })
})
