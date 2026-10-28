// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revealSessionRow } from '../src/client/reveal-session.ts'

/** One queued animation frame callback. */
const queued: FrameRequestCallback[] = []

beforeEach(() => {
  queued.length = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
    queued.push(callback)
    return queued.length
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  queued.length = 0
})

/** Run every frame queued by the previous flush. */
function flushFrame(): void {
  for (const callback of queued.splice(0)) callback(0)
}

describe('revealSessionRow', () => {
  it('scrolls the exact native session row into view', () => {
    const row = document.createElement('div')
    row.dataset.rowKey = 'session:s1'
    const scroll = vi.fn()
    row.scrollIntoView = scroll
    document.body.append(row)

    revealSessionRow('s1', 3)
    expect(scroll).not.toHaveBeenCalled()
    flushFrame()
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('waits a few frames for the row the navigation mounts', () => {
    const scroll = vi.fn()
    revealSessionRow('s2', 3)
    flushFrame()
    const row = document.createElement('div')
    row.dataset.rowKey = 'session:s2'
    row.scrollIntoView = scroll
    document.body.append(row)
    flushFrame()
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  it('never matches a longer id with the same prefix', () => {
    const row = document.createElement('div')
    row.dataset.rowKey = 'session:s10'
    const scroll = vi.fn()
    row.scrollIntoView = scroll
    document.body.append(row)
    revealSessionRow('s1', 2)
    flushFrame()
    flushFrame()
    expect(scroll).not.toHaveBeenCalled()
  })

  it('stops after the frame budget when the row never mounts', () => {
    revealSessionRow('missing', 2)
    flushFrame()
    expect(queued).toHaveLength(1)
    flushFrame()
    expect(queued).toHaveLength(0)
  })
})
