/**
 * Locale dictionaries must stay in sync: the English dictionary is typed
 * against the Chinese key set, and this spec guards the runtime symmetry the
 * settings rows, slider chrome and policy chip rely on.
 */
import { describe, expect, it } from 'vitest'
import { en, NS, zh } from '../src/client/locales.js'

describe('locale dictionaries', () => {
  it('registers under the plugin namespace', () => {
    expect(NS).toBe('whale-effort')
  })

  it('carries identical key sets in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('keeps every string non-empty', () => {
    for (const [key, value] of Object.entries(zh)) expect(value, key).not.toBe('')
    for (const [key, value] of Object.entries(en)) expect(value, key).not.toBe('')
  })

  it('keeps placeholders identical in both languages', () => {
    const placeholders = (value: string): string[] => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1] ?? '').sort()
    for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
      expect(placeholders(en[key]), key).toEqual(placeholders(zh[key]))
    }
  })

  it('names the merged feature set in both languages', () => {
    expect(en['effort.ultra']).toBe('Ultra')
    expect(zh['effort.ultra']).toBe('Ultra')
    for (const key of ['settings.skin.title', 'effort.lightning', 'effort.rate', 'effort.policy'] as const) {
      expect(en[key].length).toBeGreaterThan(0)
      expect(zh[key].length).toBeGreaterThan(0)
    }
  })
})
