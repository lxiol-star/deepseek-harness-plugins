import { describe, expect, it } from 'vitest'
import { formatRateInteger, rateIsIdle } from '../../src/client/effects/format.js'

describe('rate formatting', () => {
  it('renders exact integers with grouped thousands', () => {
    expect(formatRateInteger(12840)).toBe('12,840')
    expect(formatRateInteger(999)).toBe('999')
    expect(formatRateInteger(1234567)).toBe('1,234,567')
    expect(formatRateInteger(0)).toBe('0')
  })

  it('never abbreviates to k/M', () => {
    const rendered = formatRateInteger(12840)
    expect(rendered).not.toMatch(/k|M|\./)
  })

  it('rounds non-integer samples and clamps unusable values to zero', () => {
    expect(formatRateInteger(12.6)).toBe('13')
    expect(formatRateInteger(-5)).toBe('0')
    expect(formatRateInteger(Number.NaN)).toBe('0')
  })

  it('treats missing, non-finite and non-positive values as idle', () => {
    expect(rateIsIdle(0)).toBe(true)
    expect(rateIsIdle(-1)).toBe(true)
    expect(rateIsIdle(Number.NaN)).toBe(true)
    expect(rateIsIdle(Number.POSITIVE_INFINITY)).toBe(true)
    expect(rateIsIdle(1)).toBe(false)
    expect(rateIsIdle(12840)).toBe(false)
  })
})
