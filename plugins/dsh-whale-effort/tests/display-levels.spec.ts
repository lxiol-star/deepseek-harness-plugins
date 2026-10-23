/**
 * Display-scale behaviour: the model's real effort levels plus, only when the
 * model exposes a ceiling tier, the appended Ultra tier.
 *
 * Ultra never reaches the model directory as an effort id — it always commits
 * the model's highest real level — and it is not offered for models whose
 * scale tops out below `xhigh`/`max`, so the track adapts to what the model
 * actually exposes.
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
  supportsUltra,
  type EffortLevel,
} from '../src/client/effort-selection.js'

/** A model without a ceiling tier: no Ultra entry. */
const LEVELS_PLAIN: readonly EffortLevel[] = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
]

/** A model whose highest real level is `max`: Ultra applies. */
const LEVELS_MAX: readonly EffortLevel[] = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'max', name: 'Max' },
]

/** A model whose highest real level is `xhigh`: Ultra applies. */
const LEVELS_XHIGH: readonly EffortLevel[] = [
  { id: 'low', name: 'Low' },
  { id: 'xhigh', name: 'Very High' },
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
    expect(sliderLevels(stateWith(LEVELS_PLAIN)).map((level) => level.id)).toEqual(['low', 'medium', 'high'])
    expect(sliderLevels(stateWith([{ id: 'low', name: 'Low' }]))).toEqual([])
    expect(sliderLevels({ current: null, groups: [] } as unknown as Parameters<typeof sliderLevels>[0])).toEqual([])
  })
})

describe('supportsUltra', () => {
  it('requires at least two real levels', () => {
    expect(supportsUltra([])).toBe(false)
    expect(supportsUltra([{ id: 'max', name: 'Max' }])).toBe(false)
  })

  it('accepts only ceiling tiers as the highest real level', () => {
    expect(supportsUltra(LEVELS_MAX)).toBe(true)
    expect(supportsUltra(LEVELS_XHIGH)).toBe(true)
    expect(supportsUltra(LEVELS_PLAIN)).toBe(false)
    expect(supportsUltra([
      { id: 'low', name: 'Low' },
      { id: 'high', name: 'High' },
    ])).toBe(false)
  })

  it('normalizes case and surrounding whitespace', () => {
    expect(supportsUltra([
      { id: 'low', name: 'Low' },
      { id: ' MAX ', name: 'Max' },
    ])).toBe(true)
  })

  it('drives hasUltra and the appended display entry together', () => {
    expect(hasUltra(LEVELS_MAX)).toBe(true)
    expect(hasUltra(LEVELS_PLAIN)).toBe(false)
  })
})

describe('displayLevels', () => {
  it('appends exactly one Ultra tier for ceiling models', () => {
    const display = displayLevels(LEVELS_MAX)
    expect(display.map((level) => level.id)).toEqual(['low', 'medium', 'high', 'max', 'ultra'])
    expect(display.at(-1)?.ultra).toBe(true)
    expect(display.slice(0, -1).every((level) => !level.ultra)).toBe(true)
  })

  it('keeps the plain scale for models without a ceiling tier', () => {
    const display = displayLevels(LEVELS_PLAIN)
    expect(display.map((level) => level.id)).toEqual(['low', 'medium', 'high'])
    expect(display.every((level) => !level.ultra)).toBe(true)
  })

  it('adds no Ultra tier to a model without a usable scale', () => {
    expect(displayLevels([])).toEqual([])
    expect(displayLevels([{ id: 'only', name: 'Only' }])).toEqual([{ id: 'only', name: 'Only', ultra: false }])
  })
})

describe('commit target mapping', () => {
  it('maps the Ultra display index to the real top effort id', () => {
    expect(effortIdForDisplay(LEVELS_MAX, 4)).toBe('max')
    expect(effortIdForDisplay(LEVELS_MAX, 0)).toBe('low')
    expect(effortIdForDisplay(LEVELS_MAX, 99)).toBeUndefined()
  })

  it('never maps a hidden Ultra index and never invents an effort id', () => {
    expect(effortIdForDisplay(LEVELS_PLAIN, 3)).toBeUndefined()
    expect(effortIdForDisplay([], 0)).toBeUndefined()
  })
})

describe('restoring a session selection', () => {
  it('maps a real effort id to its display index', () => {
    expect(displayIndexFor(LEVELS_MAX, 'medium', false)).toBe(1)
    expect(effortIndex(LEVELS_MAX, 'medium')).toBe(1)
    expect(displayIndexFor(LEVELS_MAX, 'medium', true)).toBe(1)
  })

  it('maps the ceiling effort to the Ultra index when the model supports it', () => {
    expect(displayIndexFor(LEVELS_MAX, 'max', true)).toBe(4)
    expect(isUltraIndex(LEVELS_MAX, 4)).toBe(true)
    expect(isUltraIndex(LEVELS_MAX, 3)).toBe(false)
  })

  it('never restores Ultra for a plain model', () => {
    expect(displayIndexFor(LEVELS_PLAIN, 'high', true)).toBe(2)
    expect(isUltraIndex(LEVELS_PLAIN, 3)).toBe(false)
    expect(hasUltra(LEVELS_PLAIN)).toBe(false)
  })

  it('reports an unknown effort id as absent', () => {
    expect(displayIndexFor(LEVELS_MAX, 'xhigh', false)).toBe(-1)
    expect(displayIndexFor(LEVELS_MAX, undefined, false)).toBe(-1)
  })

  it('clamps pointer values into the display range', () => {
    expect(clampIndex(-4, 5)).toBe(0)
    expect(clampIndex(9, 5)).toBe(4)
    expect(clampIndex(2.4, 5)).toBe(2)
  })
})
