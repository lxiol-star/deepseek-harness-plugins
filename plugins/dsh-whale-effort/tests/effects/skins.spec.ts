import { describe, expect, it } from 'vitest'
import { DEFAULT_SKIN, SKINS, skinLabel, type Skin } from '../../src/client/effects/skins.js'

describe('energy skins', () => {
  it('lists the skins in skin-picker order', () => {
    expect([...SKINS]).toEqual(['holo', 'chrome', 'fluid'])
    expect(SKINS).toHaveLength(3)
  })

  it('defaults to the fluid skin', () => {
    expect(DEFAULT_SKIN).toBe('fluid')
    expect(SKINS).toContain(DEFAULT_SKIN)
  })

  it('keeps one stable label per skin', () => {
    expect(SKINS.map((skin) => skinLabel(skin))).toEqual(['Hologram', 'Liquid metal', 'Fluid'])
  })

  it('falls back to the raw value for an unknown skin', () => {
    expect(skinLabel('nebula' as Skin)).toBe('nebula')
  })
})
