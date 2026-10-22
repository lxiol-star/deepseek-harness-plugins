/**
 * Display-scale behaviour: the model's real effort levels plus the appended
 * Ultra tier. Ultra never reaches the model directory as an effort id — it
 * always commits the model's highest real level.
 */
import { describe, expect, it } from 'vitest'
import {
  clampIndex,
  displayIndexFor,
  displayLevels,
  effortIdForDisplay,
  effortIndex,
  hasUltra,
  isUltraIndex,
  sliderLevels,
  type EffortLevel,
} from '../src/client/effort-selection.js'

const LEVELS: readonly EffortLevel[] = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
]

/** A model directory state shape carrying the effort metadata under test. */
function stateWith(efforts: readonly EffortLevel[]) {
  return {
    current: { provider: 'p', model: 'm', reasoningEffort: 'high' },
    groups: [{ id: 'p', name: 'P', models: [{ id: 'm', name: 'M', reasoning: { efforts } }] }],
  } as unknown as Parameters<typeof sliderLevels>[0]
}

describe('sliderLevels', () => {
  it('returns the model efforts only when at least two exist', () => {
    expect(sliderLevels(stateWith(LEVELS)).map((level) => level.id)).toEqual(['low', 'medium', 'high'])
    expect(sliderLevels(stateWith([{ id: 'low', name: 'Low' }]))).toEqual([])
    expect(sliderLevels({ current: null, groups: [] } as unknown as Parameters<typeof sliderLevels>[0])).toEqual([])
  })
})

describe('displayLevels', () => {
  it('appends exactly one Ultra tier for models with real levels', () => {
    const display = displayLevels(LEVELS)
    expect(display.map((level) => level.id)).toEqual(['low', 'medium', 'high', 'ultra'])
    expect(display.at(-1)?.ultra).toBe(true)
    expect(display.slice(0, -1).every((level) => !level.ultra)).toBe(true)
  })

  it('adds no Ultra tier to a model without a usable scale', () => {
    expect(displayLevels([])).toEqual([])
    expect(displayLevels([{ id: 'only', name: 'Only' }])).toEqual([{ id: 'only', name: 'Only', ultra: false }])
    expect(hasUltra([])).toBe(false)
    expect(hasUltra(LEVELS)).toBe(true)
  })
})

describe('commit target mapping', () => {
  it('maps the Ultra display index to the real top effort id', () => {
    expect(effortIdForDisplay(LEVELS, 3)).toBe('high')
    expect(effortIdForDisplay(LEVELS, 0)).toBe('low')
    expect(effortIdForDisplay(LEVELS, 99)).toBeUndefined()
  })

  it('never invents an effort id when the scale is empty', () => {
    expect(effortIdForDisplay([], 0)).toBeUndefined()
  })
})

describe('restoring a session selection', () => {
  it('maps a real effort id to its display index', () => {
    expect(displayIndexFor(LEVELS, 'medium', false)).toBe(1)
    expect(effortIndex(LEVELS, 'medium')).toBe(1)
    expect(displayIndexFor(LEVELS, 'medium', true)).toBe(1)
  })

  it('maps the real top effort to the Ultra index when the session is in Ultra', () => {
    expect(displayIndexFor(LEVELS, 'high', true)).toBe(3)
    expect(isUltraIndex(LEVELS, 3)).toBe(true)
    expect(isUltraIndex(LEVELS, 2)).toBe(false)
  })

  it('reports an unknown effort id as absent', () => {
    expect(displayIndexFor(LEVELS, 'xhigh', false)).toBe(-1)
    expect(displayIndexFor(LEVELS, undefined, false)).toBe(-1)
  })

  it('clamps pointer values into the display range', () => {
    expect(clampIndex(-4, 4)).toBe(0)
    expect(clampIndex(9, 4)).toBe(3)
    expect(clampIndex(2.4, 4)).toBe(2)
  })
})
