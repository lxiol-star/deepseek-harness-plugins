import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EFFECT_INSET,
  FLUID_INSET,
  FLUID_PRESET,
  FLUID_STOPS,
  clampDevicePixelRatio,
  createFluidRenderer,
  fluidColorAt,
  prefersReducedMotion,
  readDocumentTheme,
  topTierActive,
} from '../../src/client/effects/fluid.js'

describe('fluid tuning constants', () => {
  it('keeps the upstream colour band verbatim', () => {
    expect(FLUID_STOPS).toEqual([
      [0.0, [120, 150, 255]],
      [0.32, [95, 112, 255]],
      [0.62, [168, 92, 255]],
      [0.86, [214, 106, 208]],
      [1.0, [255, 158, 214]],
    ])
  })

  it('keeps the upstream fluid=a preset verbatim', () => {
    expect(FLUID_PRESET).toEqual({
      fade: 0.018,
      vel: 0.43,
      speed: [0.35, 2.1],
      curlScale: 0.026,
      life: 9000,
      r: [5.5, 13],
      alpha: 0.03,
      blend: 'source-over',
      jitter: 1.8,
      topSpeedMul: 2,
      starCount: 20,
      starSpeed: [4, 15],
      starRampMs: 2600,
      starRampStart: 0.16,
      swirl: 0.9,
      density: 1.0,
      countMin: 16,
      countMax: 1400,
      hueCycle: 30000,
    })
  })

  it('keeps the upstream rail inset and the merged thumb inset', () => {
    expect(FLUID_INSET).toBe(17)
    expect(DEFAULT_EFFECT_INSET).toBe(12)
  })
})

describe('fluid colour sampling', () => {
  it('returns the band endpoints', () => {
    expect(fluidColorAt(0)).toEqual([120, 150, 255])
    expect(fluidColorAt(1)).toEqual([255, 158, 214])
  })

  it('interpolates between adjacent stops', () => {
    expect(fluidColorAt(0.5)).toEqual([139, 100, 255])
  })

  it('clamps out-of-range and unusable progress', () => {
    expect(fluidColorAt(-1)).toEqual([120, 150, 255])
    expect(fluidColorAt(2)).toEqual([255, 158, 214])
    expect(fluidColorAt(Number.NaN)).toEqual([120, 150, 255])
  })
})

describe('environment probes', () => {
  it('caps the backing-store ratio at 2', () => {
    expect(clampDevicePixelRatio(3)).toBe(2)
    expect(clampDevicePixelRatio(2)).toBe(2)
    expect(clampDevicePixelRatio(1.5)).toBe(1.5)
    expect(clampDevicePixelRatio(1)).toBe(1)
    expect(clampDevicePixelRatio(0)).toBe(1)
    expect(clampDevicePixelRatio(Number.NaN)).toBe(1)
  })

  it('defaults to the dark palette without a document and to no reduced motion', () => {
    expect(readDocumentTheme()).toBe('dark')
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('top-tier semantics', () => {
  it('applies to the real maximum and the appended Ultra tier alike', () => {
    expect(topTierActive(false, false)).toBe(false)
    expect(topTierActive(true, false)).toBe(true)
    expect(topTierActive(false, true)).toBe(true)
    expect(topTierActive(true, true)).toBe(true)
  })
})

describe('renderer degradation', () => {
  it('returns an inert handle when the environment cannot paint', () => {
    const fakeCanvas = { getContext: () => null } as unknown as HTMLCanvasElement
    const handle = createFluidRenderer(fakeCanvas, { skin: 'fluid' })
    expect(() => {
      handle.setProgress(0.4)
      handle.setSkin('holo')
      handle.setUltra(true)
      handle.setLightning(true)
      handle.setRate(0.8)
      handle.dispose()
      handle.dispose()
    }).not.toThrow()
  })

  it('never throws for an unusable progress value', () => {
    const fakeCanvas = { getContext: () => null } as unknown as HTMLCanvasElement
    const handle = createFluidRenderer(fakeCanvas, { skin: 'fluid' })
    expect(() => handle.setProgress(Number.NaN)).not.toThrow()
  })
})
