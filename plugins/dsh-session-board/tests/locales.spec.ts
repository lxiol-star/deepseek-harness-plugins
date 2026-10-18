import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en, NS, zh } from '../src/client/locales.ts'

/** Matches the `{name}` placeholders the locale runtime interpolates. */
const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g
/** A literal locale key at a call site: `t('batch.label')`, `t('card.turn', …)`. */
const CALL_RE = /\bt\(\s*'([^']+)'/g
/** The directory holding the two dictionaries this suite guards. */
const CLIENT_DIR = join(import.meta.dirname, '..', 'src', 'client')

/** Every `{placeholder}` in one string, as a sorted list. */
function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map(match => match[1] ?? '').sort()
}

/** Every `.ts`/`.tsx` file under the client directory. */
function clientSources(dir = CLIENT_DIR): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return clientSources(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

/** Literal keys the components pass to `t(...)`, keyed by source file. */
function literalCallKeys(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const file of clientSources()) {
    const keys = [...readFileSync(file, 'utf8').matchAll(CALL_RE)].map(match => match[1] ?? '')
    if (keys.length > 0) found.set(file, keys)
  }
  return found
}

const enKeys = Object.keys(en).sort()
const enValues = en as Record<string, string>
const zhValues = zh as Record<string, string>

describe('session-board dictionaries', () => {
  it('keeps English and Chinese on exactly the same key set', () => {
    expect(Object.keys(zh).sort()).toEqual(enKeys)
    expect(Object.keys(en)).toHaveLength(new Set(Object.keys(en)).size)
    expect(Object.keys(zh)).toHaveLength(new Set(Object.keys(zh)).size)
  })

  it('never ships an empty string', () => {
    for (const key of enKeys) {
      expect(enValues[key]?.trim(), `en ${key}`).not.toBe('')
      expect(zhValues[key]?.trim(), `zh ${key}`).not.toBe('')
    }
  })

  it('uses the same placeholders in both languages for every shared key', () => {
    for (const key of enKeys) {
      expect(placeholders(zhValues[key] ?? ''), `zh placeholders for ${key}`)
        .toEqual(placeholders(enValues[key] ?? ''))
    }
  })

  it('defines every key a component passes to t()', () => {
    const missing = new Map<string, string[]>()
    for (const [file, keys] of literalCallKeys()) {
      const absent = keys.filter(key => !(key in en) || !(key in zh))
      if (absent.length > 0) missing.set(file, [...new Set(absent)])
    }
    expect([...missing]).toEqual([])
  })

  it('keeps the placeholders each component actually uses', () => {
    // Tied to real call sites so a copy edit that drops or renames an
    // interpolation cannot silently ship a literal `{value}`.
    const expectations: ReadonlyArray<readonly [keyof typeof en, readonly string[]]> = [
      ['panel.count', ['count']],
      ['card.turnStep', ['m', 'n']],
      ['card.tokens', ['input', 'output']],
      ['card.rate', ['value']],
      ['card.cache', ['value']],
      ['card.elapsed', ['value']],
      ['batch.selected', ['count']],
      ['batch.planCounts', ['count', 'skipped']],
      ['batch.result', ['archived', 'empty', 'failed', 'skipped']],
      ['a11y.card', ['title']],
      ['a11y.groupCount', ['count', 'group']],
    ]
    for (const [key, expected] of expectations) {
      expect(placeholders(enValues[key] ?? ''), `en ${key}`).toEqual([...expected].sort())
      expect(placeholders(zhValues[key] ?? ''), `zh ${key}`).toEqual([...expected].sort())
    }
  })

  it('keeps the dictionary namespace stable', () => {
    expect(NS).toBe('session-board')
  })
})
