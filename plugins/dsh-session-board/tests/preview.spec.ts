import { describe, expect, it } from 'vitest'
import { compactPreview, flattenText, lastNonBlank, truncateErrorNote } from '../src/shared/preview.ts'

describe('flattenText', () => {
  it('collapses whitespace and trims', () => {
    expect(flattenText('  a\n\n b\t c ')).toBe('a b c')
  })

  it('returns empty for anything that is not a string', () => {
    expect(flattenText(undefined)).toBe('')
    expect(flattenText(null)).toBe('')
    expect(flattenText(42)).toBe('')
  })
})

describe('compactPreview', () => {
  it('leaves short text untouched', () => {
    expect(compactPreview('hello', 20)).toBe('hello')
  })

  it('truncates with an ellipsis inside the budget', () => {
    const result = compactPreview('abcdefghij', 5)
    expect(result).toBe('abcd…')
    expect(Array.from(result)).toHaveLength(5)
  })

  it('never splits a surrogate pair', () => {
    const emoji = '👍'.repeat(10)
    const result = compactPreview(emoji, 4)
    expect(Array.from(result)).toHaveLength(4)
    // A split surrogate would show up as a lone surrogate code unit.
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it('handles a degenerate budget without throwing', () => {
    expect(Array.from(compactPreview('abcdef', 1))).toHaveLength(1)
    expect(Array.from(compactPreview('abcdef', 0))).toHaveLength(1)
  })
})

describe('truncateErrorNote', () => {
  it('leaves a note at exactly the budget unchanged', () => {
    expect(truncateErrorNote('abcde', 5)).toBe('abcde')
  })

  it('appends an ellipsis that does not count against the budget', () => {
    const result = truncateErrorNote('abcdefghij', 4)
    expect(result).toBe('abcd…')
    expect(Array.from(result).filter(char => char !== '…')).toHaveLength(4)
  })

  it('flattens before measuring', () => {
    expect(truncateErrorNote('a\n\nb', 10)).toBe('a b')
  })
})

describe('lastNonBlank', () => {
  it('finds the last non-empty value', () => {
    const items = [{ text: 'first' }, { text: '' }, { text: 'last' }]
    expect(lastNonBlank(items, item => item.text)).toBe('last')
  })

  it('walks past trailing blanks', () => {
    const items = [{ text: 'only' }, { text: '  ' }]
    expect(lastNonBlank(items, item => item.text)).toBe('only')
  })

  it('is empty for a missing list', () => {
    expect(lastNonBlank(null, () => 'x')).toBe('')
    expect(lastNonBlank([], () => 'x')).toBe('')
  })
})
