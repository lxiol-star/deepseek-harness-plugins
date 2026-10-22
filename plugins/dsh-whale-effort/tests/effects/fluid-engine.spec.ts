import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFluidRenderer } from '../../src/client/effects/fluid.js'

/**
 * Offline renderer test: a jsdom-free window/canvas double. The engine only
 * requires the handful of members these fakes expose, so the drawing loop can be
 * driven deterministically without a browser.
 */

interface FakeCanvas extends HTMLCanvasElement {
  record: string[]
}

function fakeContext(record: string[]): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined }
  return {
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    setTransform: () => record.push('setTransform'),
    clearRect: () => record.push('clearRect'),
    save: () => record.push('save'),
    restore: () => record.push('restore'),
    beginPath: () => record.push('beginPath'),
    roundRect: () => record.push('roundRect'),
    rect: () => record.push('rect'),
    clip: () => record.push('clip'),
    fillRect: () => record.push('fillRect'),
    createLinearGradient: () => gradient,
    moveTo: () => record.push('moveTo'),
    lineTo: () => record.push('lineTo'),
    stroke: () => record.push('stroke'),
    arc: () => record.push('arc'),
    fill: () => record.push('fill'),
  } as unknown as CanvasRenderingContext2D
}

interface Harness {
  canvas: FakeCanvas
  record: string[]
  starRecord: string[]
  rafQueue: FrameRequestCallback[]
  tick(time: number): void
}

function makeHarness(options: { reducedMotion?: boolean; devicePixelRatio?: number } = {}): Harness {
  const record: string[] = []
  const starRecord: string[] = []
  const starCanvas = {
    width: 0,
    height: 0,
    getContext: () => fakeContext(starRecord),
  }
  const layer = {
    querySelector: (selector: string) => (selector === '.we-stars' ? starCanvas : null),
  }
  const canvas = {
    width: 0,
    height: 0,
    record,
    getContext: () => fakeContext(record),
    getBoundingClientRect: () => ({ width: 300, height: 30 }),
    parentElement: layer,
  } as unknown as FakeCanvas

  const rafQueue: FrameRequestCallback[] = []
  let now = 100
  class FakeObserver {
    observe(): void {
      // Nothing to observe in the double; lifecycle methods only need to exist.
    }
    disconnect(): void {
      // Nothing to disconnect in the double.
    }
  }
  const win = {
    devicePixelRatio: options.devicePixelRatio ?? 3,
    performance: { now: () => now },
    matchMedia: () => ({
      matches: options.reducedMotion === true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      rafQueue.push(callback)
      return rafQueue.length
    },
    cancelAnimationFrame: () => undefined,
    ResizeObserver: FakeObserver,
    MutationObserver: FakeObserver,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getComputedStyle: () => ({ getPropertyValue: () => '10px' }),
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', { body: { hasAttribute: () => false } })

  return {
    canvas,
    record,
    starRecord,
    rafQueue,
    tick(time: number): void {
      now = time
      const callback = rafQueue.shift()
      callback?.(time)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fluid renderer with faked window and canvas', () => {
  it('sizes its backing store with a device-pixel-ratio cap of 2', () => {
    const harness = makeHarness({ devicePixelRatio: 3 })
    createFluidRenderer(harness.canvas, { skin: 'fluid' })
    expect(harness.canvas.width).toBe(600)
    expect(harness.canvas.height).toBe(60)
  })

  it('draws particles on the fluid canvas', () => {
    const harness = makeHarness()
    createFluidRenderer(harness.canvas, { skin: 'fluid' })
    harness.tick(1000)
    expect(harness.record).toContain('arc')
    expect(harness.record).toContain('fillRect')
  })

  it('draws star streaks only for the top tier and clears them when leaving it', () => {
    const harness = makeHarness()
    const handle = createFluidRenderer(harness.canvas, { skin: 'fluid' })
    harness.tick(1000)
    expect(harness.starRecord).not.toContain('stroke')

    handle.setUltra(true)
    // Stars enter from the right edge and accelerate on the top tier, so give
    // the ramp a few dozen frames to reach the lit region.
    for (let frame = 0; frame < 90; frame += 1) harness.tick(1100 + frame * 16)
    expect(harness.starRecord).toContain('stroke')
    expect(harness.starRecord).toContain('lineTo')

    harness.starRecord.length = 0
    handle.setUltra(false)
    harness.tick(2600)
    expect(harness.starRecord).toContain('clearRect')
    expect(harness.starRecord).not.toContain('stroke')
  })

  it('freezes to a still frame under reduced motion', () => {
    const harness = makeHarness({ reducedMotion: true })
    createFluidRenderer(harness.canvas, { skin: 'fluid' })
    expect(harness.record).toContain('arc')
    expect(harness.rafQueue).toHaveLength(0)
  })

  it('stops scheduling frames and clears the canvases on dispose', () => {
    const harness = makeHarness()
    const handle = createFluidRenderer(harness.canvas, { skin: 'fluid' })
    harness.tick(1000)
    const drawnBeforeDispose = harness.record.length
    handle.dispose()
    const afterDispose = harness.record.length
    expect(afterDispose).toBeGreaterThan(drawnBeforeDispose)
    harness.tick(1100)
    expect(harness.record.length).toBe(afterDispose)
    expect(harness.rafQueue).toHaveLength(0)
  })

  it('does not animate while a non-fluid skin is selected', () => {
    const harness = makeHarness()
    const handle = createFluidRenderer(harness.canvas, { skin: 'fluid' })
    harness.tick(1000)
    handle.setSkin('holo')
    const afterSwitch = harness.record.length
    harness.tick(1100)
    expect(harness.record.length).toBe(afterSwitch)
    expect(harness.rafQueue).toHaveLength(0)

    handle.setSkin('fluid')
    expect(harness.rafQueue).toHaveLength(1)
    harness.tick(1200)
    expect(harness.record.length).toBeGreaterThan(afterSwitch)
  })
})
