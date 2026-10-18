import { describe, expect, it } from 'vitest'
import { buildBoard, buildEntry } from '../src/shared/board.ts'
import { groupEntries } from '../src/shared/order.ts'
import { EMPTY_FEED, type BoardFeed, type BoardSessionInput } from '../src/shared/types.ts'

/** A baseline session input: idle, acknowledged, no previews. */
function session(overrides: Partial<BoardSessionInput> = {}): BoardSessionInput {
  return {
    id: 's1',
    title: 'Session one',
    workspaceTitle: 'repo',
    isSubagent: false,
    parentId: null,
    running: false,
    pendingInteraction: null,
    completionUnread: false,
    retainedMainView: false,
    updatedAt: 1_000,
    tokenUsage: null,
    sessionStats: null,
    turnOutline: null,
    runningSubagentCount: 0,
    liveJobCount: 0,
    ...overrides,
  }
}

/** Build one entry with a fixed clock unless the caller overrides it. */
function build(input: Partial<BoardSessionInput>, feed: BoardFeed = EMPTY_FEED, now = 10_000) {
  return buildEntry(session(input), { now, feed })
}

describe('buildEntry — state and copy keys', () => {
  it('maps a pending interaction to the blocked state and its own label key', () => {
    const entry = build({ pendingInteraction: 'approval' })
    expect(entry.state).toBe('blocked')
    expect(entry.group).toBe('attention')
    expect(entry.pendingKey).toBe('pending.approval')
  })

  it('keeps unknown pending kinds blocking without claiming to know them', () => {
    const entry = build({ pendingInteraction: 'something-new' })
    expect(entry.state).toBe('blocked')
    expect(entry.pendingKey).toBe('pending.unknown')
  })

  it('uses the plan-review label for that kind', () => {
    expect(build({ pendingInteraction: 'plan-review' }).pendingKey).toBe('pending.planReview')
    expect(build({ pendingInteraction: 'question' }).pendingKey).toBe('pending.question')
  })

  it('carries a note key for each attention flavour and none when done', () => {
    expect(build({ completionUnread: true }).noteKey).toBe('note.unread')
    expect(build({}, { acks: { s1: { lastTurnEnd: 5 } }, turns: {} }).noteKey).toBe('note.unread')
    expect(build({}, { acks: { s1: { lastTurnEnd: 5, lastTurnEndKind: 'error' } }, turns: {} }).noteKey).toBe('note.error')
    expect(build({}).noteKey).toBeNull()
  })
})

describe('buildEntry — error surfacing', () => {
  it('shows the truncated error note only for an error state', () => {
    const feed: BoardFeed = {
      acks: { s1: { lastTurnEnd: 5, lastTurnEndKind: 'error', lastTurnEndError: 'boom: bad key' } },
      turns: {},
    }
    const entry = build({}, feed)
    expect(entry.state).toBe('error')
    expect(entry.errorNote).toBe('boom: bad key')
  })

  it('suppresses the note once the turn is acknowledged', () => {
    const feed: BoardFeed = {
      acks: { s1: { lastTurnEnd: 5, lastTurnEndKind: 'error', lastTurnEndError: 'boom', ackedAt: 5 } },
      turns: {},
    }
    expect(build({}, feed).errorNote).toBeNull()
  })
})

describe('buildEntry — previews', () => {
  it('reads the latest instruction and the latest produced text', () => {
    const entry = build({
      turnOutline: [
        { turn: 1, prompt: 'first ask', response: 'first answer' },
        { turn: 2, prompt: '  second   ask ', response: '' },
      ],
    })
    expect(entry.preview.instruction).toBe('second ask')
    // The open turn has no response yet, so the last produced text stands.
    expect(entry.preview.activity).toBe('first answer')
  })

  it('bounds each preview line', () => {
    const entry = build({ turnOutline: [{ turn: 1, prompt: 'x'.repeat(500) }] })
    expect(Array.from(entry.preview.instruction).length).toBeLessThanOrEqual(120)
  })

  it('is empty rather than undefined without a timeline', () => {
    const entry = build({})
    expect(entry.preview.instruction).toBe('')
    expect(entry.preview.activity).toBe('')
  })
})

describe('buildEntry — metrics', () => {
  it('derives rate, cache share and totals from projections', () => {
    const entry = build({
      tokenUsage: { outputTokens: 500, uncachedInputTokens: 100, cacheReadTokens: 900, cacheWriteTokens: 0 },
      sessionStats: { decodeTokens: 400, decodeMs: 10_000, steps: 3, turns: 2 },
    })
    expect(entry.metrics.rateTokS).toBe(40)
    expect(entry.metrics.cacheHitPct).toBe('90')
    expect(entry.metrics.outputTokens).toBe(500)
    expect(entry.metrics.inputTokens).toBe(1_000)
  })

  it('counts turns and steps', () => {
    const entry = build({
      sessionStats: { steps: 7 },
      turnOutline: [{ turn: 1 }, { turn: 2 }, { turn: 3 }],
    })
    expect(entry.progress.turnN).toBe(3)
    expect(entry.progress.stepM).toBe(7)
  })

  it('offers a progress estimate only while running', () => {
    const running = build({ running: true }, { acks: {}, turns: { s1: { openTurnStart: 0 } } }, 30_000)
    expect(running.state).toBe('running')
    expect(running.progress.ratio).toBeGreaterThan(0)

    const idle = build({}, { acks: {}, turns: { s1: { openTurnStart: 0 } } }, 30_000)
    expect(idle.progress.ratio).toBeNull()
  })

  it('takes the running sort key from the open turn start', () => {
    const entry = build({ running: true }, { acks: {}, turns: { s1: { openTurnStart: 4_242 } } })
    expect(entry.runSince).toBe(4_242)
  })

  it('passes through job and subagent counts', () => {
    const entry = build({ liveJobCount: 2, runningSubagentCount: 3 })
    expect(entry.metrics.liveJobs).toBe(2)
    expect(entry.metrics.runningSubagents).toBe(3)
  })
})

describe('buildEntry — current session', () => {
  it('marks the session holding the main view', () => {
    expect(build({ retainedMainView: true }).isCurrent).toBe(true)
    expect(build({}).isCurrent).toBe(false)
  })
})

describe('buildBoard with ordering', () => {
  it('puts the blocked session above a running one and an acknowledged one', () => {
    const feed: BoardFeed = {
      acks: { s3: { lastTurnEnd: 2_000, ackedAt: 2_000 } },
      turns: { s2: { openTurnStart: 1_000 } },
    }
    const entries = buildBoard([
      session({ id: 's3', updatedAt: 2_000 }),
      session({ id: 's2', running: true }),
      session({ id: 's1', pendingInteraction: 'question' }),
    ], { now: 5_000, feed })

    const groups = groupEntries(entries)
    expect(groups[0]?.entries.map(entry => entry.id)).toEqual(['s1'])
    expect(groups[1]?.entries.map(entry => entry.id)).toEqual(['s2'])
    expect(groups[2]?.entries.map(entry => entry.id)).toEqual(['s3'])
  })

  it('orders two waiting sessions by how long they have waited', () => {
    const feed: BoardFeed = {
      acks: { recent: { lastTurnEnd: 9_000 }, stale: { lastTurnEnd: 1_000 } },
      turns: {},
    }
    const entries = buildBoard([
      session({ id: 'recent' }),
      session({ id: 'stale' }),
    ], { now: 10_000, feed })
    const attention = groupEntries(entries)[0]
    expect(attention?.entries.map(entry => entry.id)).toEqual(['stale', 'recent'])
  })

  it('uses the client-local stamp when the host has said nothing', () => {
    const entries = buildBoard([
      session({ id: 'b', completionUnread: true }),
      session({ id: 'a', completionUnread: true }),
    ], {
      now: 10_000,
      feed: EMPTY_FEED,
      unreadSinceOf: (id) => (id === 'b' ? 1_000 : 5_000),
    })
    const attention = groupEntries(entries)[0]
    expect(attention?.entries.map(entry => entry.id)).toEqual(['b', 'a'])
  })
})
