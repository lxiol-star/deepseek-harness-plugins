import { describe, expect, it } from 'vitest'
import { cardKey, sameCard, type CardKeyProps } from '../src/client/card-key.ts'
import type { BoardEntry } from '../src/shared/types.ts'

/**
 * A baseline entry that exercises none of the optional branches: running, no
 * attention kind, no selection, an elapsed second and no other figures.
 */
function base(): BoardEntry {
  return {
    id: 's1',
    title: 'Session one',
    workspaceTitle: 'repo',
    isSubagent: false,
    state: 'running',
    group: 'running',
    attentionKind: null,
    waitSince: null,
    runSince: 1_000,
    lastActivityAt: 1_000,
    isCurrent: false,
    preview: { instruction: '', activity: '' },
    progress: { turnN: null, stepM: null, ratio: null },
    metrics: {
      elapsedMs: 12_500,
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
  }
}

/** A fresh baseline with one field changed, so tests never share an object. */
function mutate(change: (draft: BoardEntry) => void): BoardEntry {
  const draft = base()
  change(draft)
  return draft
}

/** A fresh baseline with metric fields overridden. */
function metrics(change: Partial<BoardEntry['metrics']>): BoardEntry {
  return mutate((draft) => { Object.assign(draft.metrics, change) })
}

describe('cardKey — content signature', () => {
  it('is stable for structurally equal entries', () => {
    expect(cardKey(base())).toBe(cardKey(base()))
  })

  it('is stable for the same entry read twice', () => {
    const entry = base()
    expect(cardKey(entry)).toBe(cardKey(entry))
  })

  it('changes for every field the card paints', () => {
    const cases: ReadonlyArray<readonly [string, (draft: BoardEntry) => void]> = [
      ['id', draft => { draft.id = 's2' }],
      ['state', draft => { draft.state = 'done' }],
      ['group', draft => { draft.group = 'done' }],
      ['attentionKind', draft => { draft.attentionKind = 'blocked' }],
      ['isSubagent', draft => { draft.isSubagent = true }],
      ['title', draft => { draft.title = 'Session two' }],
      ['workspaceTitle', draft => { draft.workspaceTitle = 'other' }],
      ['isCurrent', draft => { draft.isCurrent = true }],
      ['waitSince', draft => { draft.waitSince = 1 }],
      ['preview.instruction', draft => { draft.preview.instruction = 'do the thing' }],
      ['preview.activity', draft => { draft.preview.activity = 'did the thing' }],
      ['errorNote', draft => { draft.errorNote = 'boom' }],
      ['noteKey', draft => { draft.noteKey = 'note.error' }],
      ['pendingKey', draft => { draft.pendingKey = 'pending.question' }],
      ['progress.turnN', draft => { draft.progress.turnN = 3 }],
      ['progress.stepM', draft => { draft.progress.stepM = 4 }],
      ['progress.ratio', draft => { draft.progress.ratio = 0.5 }],
      ['metrics.elapsedMs', draft => { draft.metrics.elapsedMs = 13_500 }],
      ['metrics.totalBusyMs', draft => { draft.metrics.totalBusyMs = 900 }],
      ['metrics.outputTokens', draft => { draft.metrics.outputTokens = 120 }],
      ['metrics.inputTokens', draft => { draft.metrics.inputTokens = 340 }],
      ['metrics.rateTokS', draft => { draft.metrics.rateTokS = 42 }],
      ['metrics.cacheHitPct', draft => { draft.metrics.cacheHitPct = '90' }],
      ['metrics.liveJobs', draft => { draft.metrics.liveJobs = 2 }],
      ['metrics.runningSubagents', draft => { draft.metrics.runningSubagents = 1 }],
    ]
    const baseline = cardKey(base())
    for (const [field, change] of cases) {
      expect(cardKey(mutate(change)), `${field} must change the key`).not.toBe(baseline)
    }
  })

  it('ignores the fields that only feed ordering', () => {
    const baseline = cardKey(base())
    expect(cardKey(mutate(draft => { draft.runSince = 9_999 }))).toBe(baseline)
    expect(cardKey(mutate(draft => { draft.lastActivityAt = 9_999 }))).toBe(baseline)
  })

  it('cannot be fooled by a value that collides with another field', () => {
    // Both signatures carry the same text, placed in different fields.
    const asTitle = cardKey(mutate(draft => { draft.title = 'moved' }))
    const asWorkspace = cardKey(mutate(draft => { draft.workspaceTitle = 'moved' }))
    expect(asTitle).not.toBe(asWorkspace)
  })
})

describe('cardKey — selection and the clock boundary', () => {
  it('treats the selection flag as visual', () => {
    expect(cardKey(base(), true)).not.toBe(cardKey(base(), false))
    expect(cardKey(base(), false)).toBe(cardKey(base()))
  })

  it('treats a disabled selection as visual', () => {
    expect(cardKey(base(), false, true)).not.toBe(cardKey(base(), false, false))
  })

  it('quantizes elapsed figures to whole seconds', () => {
    expect(cardKey(metrics({ elapsedMs: 12_001 }))).toBe(cardKey(base()))
    expect(cardKey(metrics({ elapsedMs: 12_999 }))).toBe(cardKey(base()))
    expect(cardKey(metrics({ elapsedMs: 13_000 }))).not.toBe(cardKey(base()))
  })

  it('quantizes cumulative busy time to whole seconds too', () => {
    const at = metrics({ totalBusyMs: 2_000 })
    expect(cardKey(metrics({ totalBusyMs: 2_400 }))).toBe(cardKey(at))
    expect(cardKey(metrics({ totalBusyMs: 3_000 }))).not.toBe(cardKey(at))
  })

  it('rounds the token rate instead of keying every fraction', () => {
    expect(cardKey(metrics({ rateTokS: 40.2 }))).toBe(cardKey(metrics({ rateTokS: 40.4 })))
    expect(cardKey(metrics({ rateTokS: 41.4 }))).not.toBe(cardKey(metrics({ rateTokS: 40.4 })))
  })

  it('fixed-points the progress ratio at three decimals', () => {
    const ratio = (value: number): string =>
      cardKey(mutate(draft => { draft.progress.ratio = value }))
    expect(ratio(0.50003)).toBe(ratio(0.50004))
    expect(ratio(0.5004)).not.toBe(ratio(0.5006))
  })
})

describe('sameCard — the memo decision', () => {
  const stableToggle = (): void => {}

  function props(overrides: Partial<CardKeyProps> = {}): CardKeyProps {
    return { entry: base(), ...overrides }
  }

  it('accepts two equal prop sets', () => {
    expect(sameCard(props({ onToggleSelect: stableToggle }), props({ onToggleSelect: stableToggle }))).toBe(true)
  })

  it('accepts entries that differ only in non-visual fields', () => {
    const previous = props()
    const next = props({ entry: mutate(draft => { draft.runSince = 7_777 }) })
    expect(sameCard(previous, next)).toBe(true)
  })

  it('rejects any visual entry change', () => {
    expect(sameCard(props(), props({ entry: mutate(draft => { draft.isSubagent = true }) }))).toBe(false)
    expect(sameCard(props(), props({ entry: mutate(draft => { draft.attentionKind = 'error' }) }))).toBe(false)
    expect(sameCard(props(), props({ entry: mutate(draft => { draft.title = 'other' }) }))).toBe(false)
    expect(sameCard(props(), props({ entry: mutate(draft => { draft.metrics.elapsedMs = 13_000 }) }))).toBe(false)
  })

  it('rejects a selection change', () => {
    expect(sameCard(props({ selected: false }), props({ selected: true }))).toBe(false)
    expect(sameCard(props({ selected: true }), props({ selected: true }))).toBe(true)
  })

  it('rejects a change to the disabled selection state', () => {
    expect(sameCard(props({ selectionDisabled: false }), props({ selectionDisabled: true }))).toBe(false)
  })

  it('rejects a changed or newly added toggle callback', () => {
    expect(sameCard(props({ onToggleSelect: stableToggle }), props({ onToggleSelect: () => {} }))).toBe(false)
    expect(sameCard(props(), props({ onToggleSelect: stableToggle }))).toBe(false)
    expect(sameCard(props(), props())).toBe(true)
  })

  it('keeps the memo boundary at the second', () => {
    const previous = props({ entry: metrics({ elapsedMs: 12_100 }) })
    const next = props({ entry: metrics({ elapsedMs: 12_900 }) })
    expect(sameCard(previous, next)).toBe(true)
  })
})
