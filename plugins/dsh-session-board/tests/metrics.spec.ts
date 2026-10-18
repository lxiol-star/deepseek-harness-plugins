import { describe, expect, it } from 'vitest'
import {
  billedInputTokens,
  cacheHitPercent,
  formatElapsed,
  formatTokensPerSecond,
  inputTokens,
  openRunElapsedMs,
  progressRatio,
  tokensPerSecond,
  totalBusyMs,
} from '../src/shared/metrics.ts'

describe('tokensPerSecond', () => {
  it('mirrors the shell formula: decodeTokens over decode seconds', () => {
    expect(tokensPerSecond(100, 1_000)).toBe(100)
    expect(tokensPerSecond(50, 2_000)).toBe(25)
  })

  it('refuses to divide by zero or a missing measurement', () => {
    expect(tokensPerSecond(100, 0)).toBeNull()
    expect(tokensPerSecond(undefined, 1_000)).toBeNull()
    expect(tokensPerSecond(100, undefined)).toBeNull()
    expect(tokensPerSecond(Number.NaN, 1_000)).toBeNull()
  })
})

describe('billedInputTokens', () => {
  it('sums the three disjoint prompt-side buckets', () => {
    expect(billedInputTokens({ uncachedInputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 30 })).toBe(60)
  })

  it('treats a missing usage as nothing billed', () => {
    expect(billedInputTokens(null)).toBe(0)
    expect(inputTokens(null)).toBeNull()
  })
})

describe('cacheHitPercent', () => {
  it('is the cache-read share of billed input', () => {
    expect(cacheHitPercent({ uncachedInputTokens: 50, cacheReadTokens: 50, cacheWriteTokens: 0 })).toBe('50')
  })

  it('shows a genuine full hit as 100', () => {
    expect(cacheHitPercent({ uncachedInputTokens: 0, cacheReadTokens: 100, cacheWriteTokens: 0 })).toBe('100')
  })

  it('adds precision rather than rounding a near-full hit up to 100', () => {
    expect(cacheHitPercent({ uncachedInputTokens: 1, cacheReadTokens: 9_999, cacheWriteTokens: 0 })).toBe('99.99')
  })

  it('returns null when nothing was billed', () => {
    expect(cacheHitPercent({})).toBeNull()
    expect(cacheHitPercent(null)).toBeNull()
  })
})

describe('formatTokensPerSecond', () => {
  it('rounds from ten up and keeps one decimal below', () => {
    expect(formatTokensPerSecond(42.6)).toBe('43')
    expect(formatTokensPerSecond(10)).toBe('10')
    expect(formatTokensPerSecond(5.24)).toBe('5.2')
  })

  it('is null for a missing or non-positive rate', () => {
    expect(formatTokensPerSecond(null)).toBeNull()
    expect(formatTokensPerSecond(0)).toBe('0')
  })
})

describe('formatElapsed', () => {
  it('formats seconds, minutes and hours compactly', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(42_000)).toBe('42s')
    expect(formatElapsed(187_000)).toBe('3m07s')
    expect(formatElapsed(3_840_000)).toBe('1h04m')
  })

  it('is null without a measurement', () => {
    expect(formatElapsed(null)).toBeNull()
    expect(formatElapsed(-1)).toBeNull()
  })
})

describe('progressRatio', () => {
  it('rises monotonically and never reaches one', () => {
    let previous = -1
    for (const seconds of [0, 5, 30, 120, 600, 3_600]) {
      const value = progressRatio(seconds * 1_000, 40)
      expect(value).toBeGreaterThanOrEqual(previous)
      expect(value).toBeLessThan(1)
      previous = value
    }
  })

  it('is one half at the relaxation constant', () => {
    // With a 40 tok/s rate the constant is 25 seconds, so t = k is 0.5.
    expect(progressRatio(25_000, 40)).toBeCloseTo(0.5, 5)
  })

  it('advances faster for a faster measured rate', () => {
    expect(progressRatio(10_000, 200)).toBeGreaterThan(progressRatio(10_000, 5))
  })
})

describe('openRunElapsedMs', () => {
  it('is null when no turn is open', () => {
    expect(openRunElapsedMs(null, 1_000)).toBeNull()
    expect(openRunElapsedMs({ busyMs: 5 }, 1_000)).toBeNull()
  })

  it('measures from the open turn start', () => {
    expect(openRunElapsedMs({ openTurnStart: 1_000 }, 4_000)).toBe(3_000)
  })

  it('subtracts settled and still-open waiting time', () => {
    expect(openRunElapsedMs({ openTurnStart: 1_000, waitedMs: 1_000 }, 4_000)).toBe(2_000)
    expect(openRunElapsedMs({ openTurnStart: 1_000, waitedMs: 500, openWaitStart: 3_000 }, 4_000)).toBe(1_500)
  })

  it('never goes negative', () => {
    expect(openRunElapsedMs({ openTurnStart: 1_000, waitedMs: 99_999 }, 2_000)).toBe(0)
  })
})

describe('totalBusyMs', () => {
  it('adds closed busy time to the open turn', () => {
    expect(totalBusyMs({ busyMs: 1_000, openTurnStart: 5_000 }, 6_000)).toBe(2_000)
  })

  it('reports closed time alone once the turn settles', () => {
    expect(totalBusyMs({ busyMs: 1_000, openTurnStart: null }, 6_000)).toBe(1_000)
  })

  it('is null without any accounting at all', () => {
    expect(totalBusyMs(null, 6_000)).toBeNull()
    expect(totalBusyMs({}, 6_000)).toBeNull()
  })
})

it('keeps zero cache hit and whole low rates consistent with DSH', () => {
  expect(cacheHitPercent({ uncachedInputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe('0')
  expect(formatTokensPerSecond(5)).toBe('5')
  expect(tokensPerSecond(0, 1000)).toBe(0)
})
