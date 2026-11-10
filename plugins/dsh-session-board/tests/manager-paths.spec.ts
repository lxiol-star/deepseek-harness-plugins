import { describe, expect, it } from 'vitest'
import { PATH_MAX_LENGTH, shortenPath } from '../src/client/manager/paths.ts'

describe('shortenPath', () => {
  it('returns short paths unchanged', () => {
    expect(shortenPath('/tmp/ws')).toBe('/tmp/ws')
    expect(shortenPath('')).toBe('')
  })

  it('keeps the tail and starts on a segment boundary', () => {
    const long = '/Users/lxiol/Documents/deepseek-harness/default-workspace'
    const shortened = shortenPath(long)
    expect(shortened.startsWith('…/')).toBe(true)
    expect(long.endsWith(shortened.slice(1))).toBe(true)
    expect(shortened.length).toBeLessThanOrEqual(PATH_MAX_LENGTH)
  })

  it('never starts the fragment mid-segment when a boundary exists', () => {
    const shortened = shortenPath('/a/bb/cc/dd/ee/ff/gg/hh/ii/jj/kk/ll/mm/nn/oo/pp/qq/rr/ss')
    expect(shortened).toMatch(/^…\//)
  })

  it('honours a custom budget', () => {
    expect(shortenPath('/one/two/three/four', 12).length).toBeLessThanOrEqual(12)
  })

  it('falls back to the raw tail when the path has no separator in range', () => {
    expect(shortenPath(`/${'x'.repeat(80)}`, 20)).toMatch(/^…x/)
  })
})
