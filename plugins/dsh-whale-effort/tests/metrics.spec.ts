import { describe, expect, it } from 'vitest'
import { createFleetMeter, estimateTokens, readChunkDelta } from '../src/host/metrics.js'

describe('estimateTokens', () => {
  it('counts CJK code points as one token each', () => {
    expect(estimateTokens('你好')).toBe(2)
    expect(estimateTokens('こんにちは')).toBe(5)
  })

  it('counts four non-CJK characters as one token, rounded up', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })

  it('iterates code points, so an astral character is one character', () => {
    // U+20000 is a CJK extension B code point (one token); the emoji is a
    // non-CJK astral code point and must not be counted as two UTF-16 units.
    expect(estimateTokens('\u{20000}')).toBe(1)
    expect(estimateTokens('\u{1F600}')).toBe(1)
    expect(estimateTokens('\u{1F600}\u{1F600}\u{1F600}\u{1F600}')).toBe(1)
  })

  it('returns zero for non-string input', () => {
    expect(estimateTokens(undefined)).toBe(0)
    expect(estimateTokens(null)).toBe(0)
    expect(estimateTokens(42)).toBe(0)
  })
})

describe('chunk accounting', () => {
  it('reads text and reasoning deltas as generated tokens', () => {
    expect(readChunkDelta({ type: 'text-delta', text: 'abcd' }, false)).toEqual({ gen: 1, out: 0, input: 0 })
    expect(readChunkDelta({ type: 'reasoning-delta', text: '你好' }, false)).toEqual({ gen: 2, out: 0, input: 0 })
  })

  it('reads tool-call argument deltas as generated tokens', () => {
    expect(readChunkDelta({ type: 'tool-call-delta', argumentsDelta: 'abcd' }, false)).toEqual({ gen: 1, out: 0, input: 0 })
  })

  it('excludes cached input reads by default and includes them on request', () => {
    const usage = { type: 'usage', usage: { inputTokens: 100, cacheReadTokens: 40, outputTokens: 7 } }
    expect(readChunkDelta(usage, false)).toEqual({ gen: 0, out: 7, input: 60 })
    expect(readChunkDelta(usage, true)).toEqual({ gen: 0, out: 7, input: 100 })
  })

  it('ignores empty, malformed, and unknown frames', () => {
    expect(readChunkDelta({ type: 'text-delta', text: '' }, false)).toBeNull()
    expect(readChunkDelta({ type: 'block-start', index: 0 }, false)).toBeNull()
    expect(readChunkDelta({ type: 'usage' }, false)).toBeNull()
    expect(readChunkDelta({ type: 'usage', usage: { inputTokens: 0, outputTokens: 0 } }, false)).toBeNull()
    expect(readChunkDelta(null, false)).toBeNull()
    expect(readChunkDelta('text-delta', false)).toBeNull()
  })
})

describe('fleet meter', () => {
  /** Build a meter over a controllable clock. */
  function fixture(windowMs = 1500, generatingMs = 800) {
    let now = 0
    const meter = createFleetMeter({ windowMs, generatingMs, now: () => now })
    return {
      meter,
      at(value: number) {
        now = value
      },
    }
  }

  it('counts only members', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a'])
    at(1000)
    meter.ingest('b', { type: 'text-delta', text: 'abcd' }, 1000)
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    const sample = meter.sample()
    expect(sample.agents).toBe(1)
    expect(sample.gen).toBe(1)
    expect(sample.total).toBe(1)
  })

  it('expires windowed rates lazily but keeps the accumulated total', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a'])
    at(1000)
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    at(1400)
    expect(meter.sample().gen).toBe(1)
    at(3000)
    const expired = meter.sample()
    expect(expired.gen).toBe(0)
    expect(expired.rate).toBe(0)
    expect(expired.generating).toBe(0)
    expect(expired.total).toBe(1)
  })

  it('counts input tokens in the rate but not the generation rate', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a'])
    at(1000)
    meter.ingest('a', { type: 'usage', usage: { inputTokens: 150, outputTokens: 0 } }, 1000)
    const sample = meter.sample()
    expect(sample.gen).toBe(0)
    // 150 tokens over a 1.5s window.
    expect(sample.rate).toBe(100)
    expect(sample.total).toBe(150)
  })

  it('calibrates per agent with the exact usage sum instead of double counting', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a'])
    at(1000)
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    meter.ingest('a', { type: 'usage', usage: { inputTokens: 0, outputTokens: 100 } }, 1000)
    expect(meter.sample().total).toBe(100)
  })

  it('lights the breath counter for recent generators only', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a', 'b'])
    at(1000)
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    meter.ingest('b', { type: 'text-delta', text: 'abcd' }, 500)
    at(1200)
    // Both are inside the 800ms breath window (a: 200ms ago, b: 700ms ago).
    expect(meter.sample().generating).toBe(2)
    at(1400)
    // Only the more recent generator remains inside it.
    expect(meter.sample().generating).toBe(1)
    at(2000)
    expect(meter.sample().generating).toBe(0)
  })

  it('keeps departed members in the total while dropping their window contribution', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a', 'b'])
    at(1000)
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    meter.ingest('b', { type: 'text-delta', text: 'abcd' }, 1000)
    expect(meter.sample().total).toBe(2)
    meter.setMembers(['a'])
    at(1000)
    const sample = meter.sample()
    expect(sample.agents).toBe(1)
    expect(sample.total).toBe(2)
    expect(sample.gen).toBe(1)
    // After the retired state is reclaimed the total must survive it.
    at(5000)
    expect(meter.sample().total).toBe(2)
  })

  it('handles time going backwards without dropping valid events', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a'])
    at(2000)
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 2000)
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    at(2000)
    // Window start is 500: both events are still inside it.
    expect(meter.sample().gen).toBe(Math.round(2 / 1.5))
    expect(meter.sample().total).toBe(2)
  })

  it('coerces unusable counters to finite non-negative integers', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a'])
    at(1000)
    meter.ingest('a', { type: 'usage', usage: { inputTokens: Number.NaN, outputTokens: Infinity } }, 1000)
    const sample = meter.sample()
    expect(sample).toEqual({ rate: 0, gen: 0, agents: 1, generating: 0, total: 0 })
  })

  it('resets to zero and disposes to a no-op', () => {
    const { meter, at } = fixture()
    meter.setMembers(['a'])
    at(1000)
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    meter.reset()
    at(1000)
    expect(meter.sample()).toEqual({ rate: 0, gen: 0, agents: 0, generating: 0, total: 0 })
    meter.setMembers(['a'])
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    meter.dispose()
    expect(meter.sample()).toEqual({ rate: 0, gen: 0, agents: 0, generating: 0, total: 0 })
    meter.ingest('a', { type: 'text-delta', text: 'abcd' }, 1000)
    expect(meter.sample().total).toBe(0)
  })
})
