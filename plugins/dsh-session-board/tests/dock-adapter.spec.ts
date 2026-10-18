// @vitest-environment jsdom
/**
 * Dock adapter and layout grammar.
 *
 * The DOM is real (jsdom) so `MutationObserver`, inline styles, custom
 * properties, child order and `getBoundingClientRect` behave as in a browser;
 * the frame is built to the shell's exact shape — three auto-placed columns
 * plus the non-column children (spanned bottom row, absolute overlay and drag
 * handle) the adapter must skip. No network, no deps install, no timers beyond
 * one macrotask to flush the observer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOCK_ATTR, attachDock, resolveCentreColumn, resolveFrame } from '../src/client/dock-adapter.ts'
import {
  CHAT_MIN_PX,
  DOCK_MIN_PX,
  DOCK_RAIL_PX,
  EFFECTIVE_TRACK,
  EFFECTIVE_TRACK_VAR,
  MY_TRACK,
  countOriginalTracks,
  fitDockTrack,
  hasDockTrack,
  isDockTrack,
  parseDockTrackValue,
  parseTrackExtent,
  resolveNativeColumns,
  splitTrackTokens,
  trackSizes,
} from '../src/client/dock-layout.ts'

/** The template `AppFrame` renders: `sidebar | centre | rightbar`. */
const APP_TEMPLATE = '280px minmax(400px, 1fr) minmax(0px, 320px)'

/** Wait one macrotask so a queued MutationObserver callback has run. */
const flush = async (): Promise<void> => { await new Promise<void>(resolve => { setTimeout(resolve, 0) }) }

interface Shell {
  frame: HTMLDivElement
  sidebar: HTMLDivElement
  centre: HTMLDivElement
  rightbar: HTMLDivElement
  overlay: HTMLDivElement
}

interface ShellOptions {
  template?: string
  /** Position of the conversation column: 1 (middle) by default. */
  centreAt?: 0 | 1 | 2
  /** Whether the conversation slot wrapper is mounted. */
  slot?: boolean
}

/** Build the shell frame with all the non-column children the adapter skips. */
function shell(options: ShellOptions = {}): Shell {
  const frame = document.createElement('div')
  frame.style.gridTemplateColumns = options.template ?? APP_TEMPLATE
  const sidebar = document.createElement('div')
  const centre = document.createElement('div')
  if (options.slot !== false) {
    const slot = document.createElement('div')
    slot.setAttribute('data-slot', 'conversation.session.body')
    centre.append(slot)
  }
  const rightbar = document.createElement('div')
  // Explicitly placed, like the shell's bottom row (`grid-column: 1 / -1`).
  const bottom = document.createElement('div')
  bottom.style.gridColumnStart = '1'
  bottom.style.gridColumnEnd = '-1'
  const overlay = document.createElement('div')
  overlay.setAttribute('data-shell-overlay', '')
  overlay.style.position = 'absolute'
  const handle = document.createElement('div')
  handle.style.position = 'absolute'
  const at = options.centreAt ?? 1
  const order = at === 0
    ? [centre, sidebar, rightbar]
    : at === 2 ? [sidebar, rightbar, centre] : [sidebar, centre, rightbar]
  frame.append(...order, bottom, overlay, handle)
  document.body.append(frame)
  return { frame, sidebar, centre, rightbar, overlay }
}

/** The layout-neutral host the client half creates. */
function makeHost(): HTMLDivElement {
  const element = document.createElement('div')
  element.setAttribute('data-dsh-session-board-host', '')
  const dock = document.createElement('aside')
  dock.setAttribute(DOCK_ATTR, '')
  element.append(dock)
  return element
}

/** jsdom always measures 0; give the frame the width under test. */
function setFrameWidth(frame: HTMLElement, width: number): void {
  frame.getBoundingClientRect = () => ({
    width, height: 768, top: 0, left: 0, right: width, bottom: 768, x: 0, y: 0,
    toJSON: () => ({}),
  }) as DOMRect
}

function clearBody(): void {
  document.body.innerHTML = ''
}

/** A ResizeObserver stand-in whose callback the test can fire by hand. */
class FakeResizeObserver {
  static all: FakeResizeObserver[] = []
  private readonly callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
    FakeResizeObserver.all.push(this)
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  fire(): void { this.callback() }
}

function installResizeObserver(): void {
  FakeResizeObserver.all = []
  ;(globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver
}

interface RafHost {
  requestAnimationFrame?: unknown
  cancelAnimationFrame?: unknown
}

/** Make `schedule()` fall through to a synchronous `place()`. */
function disableRaf(): void {
  const host = window as unknown as RafHost
  host.requestAnimationFrame = undefined
  host.cancelAnimationFrame = undefined
}

/** A rAF that never runs, so a pending handle can be observed being cancelled. */
function installFakeRaf(): { scheduled: number[]; cancelled: number[] } {
  const scheduled: number[] = []
  const cancelled: number[] = []
  const host = window as unknown as RafHost
  host.requestAnimationFrame = (): number => { scheduled.push(1); return 99 }
  host.cancelAnimationFrame = (handle: unknown): void => { cancelled.push(Number(handle)) }
  return { scheduled, cancelled }
}

let savedRaf: unknown
let savedCaf: unknown

beforeEach(() => {
  const host = window as unknown as RafHost
  savedRaf = host.requestAnimationFrame
  savedCaf = host.cancelAnimationFrame
  clearBody()
  document.documentElement.removeAttribute('style')
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver
})

afterEach(() => {
  const host = window as unknown as RafHost
  host.requestAnimationFrame = savedRaf
  host.cancelAnimationFrame = savedCaf
  delete (globalThis as unknown as { ResizeObserver?: unknown }).ResizeObserver
  clearBody()
})

describe('grid template grammar', () => {
  it('splits on top-level whitespace only', () => {
    expect(splitTrackTokens('minmax(0px, 1fr)')).toEqual(['minmax(0px, 1fr)'])
    expect(splitTrackTokens('[full-start] 1fr [full-end]')).toEqual(['[full-start]', '1fr', '[full-end]'])
    expect(splitTrackTokens('  280px   minmax(400px, 1fr)  ')).toEqual(['280px', 'minmax(400px, 1fr)'])
    expect(splitTrackTokens('minmax(0px, min(400px, 20%))')).toEqual(['minmax(0px, min(400px, 20%))'])
  })

  it('counts size tokens, drops line names and expands fixed repeats', () => {
    expect(trackSizes(APP_TEMPLATE)).toHaveLength(3)
    expect(trackSizes('[full-start] 1fr [full-end]')).toEqual(['1fr'])
    expect(trackSizes('repeat(3, 1fr)')).toEqual(['1fr', '1fr', '1fr'])
    expect(trackSizes('repeat(2, minmax(0px, 1fr))')).toHaveLength(2)
    // An unresolvable repeat cannot be expanded, so it stays one token.
    expect(trackSizes('repeat(auto-fill, minmax(120px, 1fr))')).toHaveLength(1)
  })

  it('recognises both injected tracks by their marker', () => {
    expect(isDockTrack(MY_TRACK)).toBe(true)
    expect(isDockTrack(EFFECTIVE_TRACK)).toBe(true)
    expect(isDockTrack('280px')).toBe(false)
    expect(hasDockTrack(APP_TEMPLATE)).toBe(false)
    expect(hasDockTrack(`${APP_TEMPLATE} ${EFFECTIVE_TRACK}`)).toBe(true)
  })

  it('counts the shell tracks even with the dock track present', () => {
    expect(countOriginalTracks(APP_TEMPLATE)).toBe(3)
    expect(countOriginalTracks(`280px ${EFFECTIVE_TRACK} minmax(400px, 1fr) minmax(0px, 320px)`)).toBe(3)
    expect(countOriginalTracks(`280px minmax(400px, 1fr)`)).toBe(2)
  })

  it('resolves px extents and refuses anything else', () => {
    expect(parseTrackExtent('341px')).toEqual({ min: 341, max: 341 })
    expect(parseTrackExtent('minmax(0px, 320px)')).toEqual({ min: 0, max: 320 })
    expect(parseTrackExtent('0')).toEqual({ min: 0, max: 0 })
    expect(parseTrackExtent('min(300px, 500px)')).toEqual({ min: 300, max: 300 })
    expect(parseTrackExtent('max(300px, 500px)')).toEqual({ min: 500, max: 500 })
    expect(parseTrackExtent('clamp(264px, 280px, 420px)')).toEqual({ min: 264, max: 420 })
    expect(parseTrackExtent('minmax(400px, 1fr)')).toBeNull()
    expect(parseTrackExtent('auto')).toBeNull()
    expect(parseTrackExtent('20%')).toBeNull()
    expect(parseTrackExtent('calc(100% - 20px)')).toBeNull()
  })

  it('resolves the native sidebar and rightbar reserves', () => {
    expect(resolveNativeColumns(APP_TEMPLATE)).toEqual({ sidebar: 280, rightbar: 320 })
    expect(resolveNativeColumns(`280px ${EFFECTIVE_TRACK} minmax(400px, 1fr) minmax(0px, 320px)`))
      .toEqual({ sidebar: 280, rightbar: 320 })
    expect(resolveNativeColumns('280px minmax(400px, 1fr)')).toBeNull()
    expect(resolveNativeColumns(`${APP_TEMPLATE} 100px`)).toBeNull()
    expect(resolveNativeColumns('var(--sidebar) minmax(400px, 1fr) minmax(0px, 320px)')).toBeNull()
  })

  it('reads dock widths from custom-property values', () => {
    expect(parseDockTrackValue('341px')).toBe(341)
    expect(parseDockTrackValue(' 41px ')).toBe(41)
    expect(parseDockTrackValue('341')).toBe(341)
    expect(parseDockTrackValue('')).toBeNull()
    expect(parseDockTrackValue('auto')).toBeNull()
    expect(parseDockTrackValue('0px')).toBeNull()
  })

  it('keeps the legacy track verbatim inside the responsive one', () => {
    expect(MY_TRACK).toBe('var(--sb-dock-track, 341px)')
    expect(EFFECTIVE_TRACK).toBe('var(--sb-dock-track-effective, var(--sb-dock-track, 341px))')
  })
})

describe('dock budget', () => {
  const base = { frameWidth: 1440, sidebar: 280, rightbar: 320, desired: 341 }

  it('keeps the desired width while the conversation keeps its minimum', () => {
    expect(fitDockTrack(base)).toEqual({ mode: 'full', width: 341 })
    // Exactly the protected minimum is still a fit.
    expect(fitDockTrack({ ...base, frameWidth: 1341 })).toEqual({ mode: 'full', width: 341 })
  })

  it('shrinks into whatever is left before it rails', () => {
    expect(fitDockTrack({ ...base, frameWidth: 1300 })).toEqual({ mode: 'shrunk', width: 300 })
    expect(fitDockTrack({ ...base, frameWidth: 1260 })).toEqual({ mode: 'shrunk', width: DOCK_MIN_PX })
  })

  it('falls back to the collapsed rail when only that fits', () => {
    expect(fitDockTrack({ ...base, frameWidth: 1100 })).toEqual({ mode: 'rail', width: DOCK_RAIL_PX })
    expect(fitDockTrack({ ...base, frameWidth: 1040 })).toEqual({ mode: 'rail', width: DOCK_RAIL_PX })
  })

  it('declines when even the rail would eat the conversation', () => {
    expect(fitDockTrack({ ...base, frameWidth: 1000 })).toEqual({ mode: 'declined', width: 0 })
    expect(fitDockTrack({ ...base, frameWidth: 0 })).toEqual({ mode: 'unknown', width: 341 })
  })

  it('leaves the user width alone when the frame is unmeasurable', () => {
    expect(fitDockTrack({ ...base, frameWidth: 0, sidebar: null })).toEqual({ mode: 'unknown', width: base.desired })
    expect(fitDockTrack({ ...base, frameWidth: 1440, rightbar: null })).toEqual({ mode: 'unknown', width: 341 })
    expect(fitDockTrack({ ...base, frameWidth: Number.NaN })).toEqual({ mode: 'unknown', width: 341 })
  })

  it('honours a collapsed rail as the desired width', () => {
    expect(fitDockTrack({ ...base, frameWidth: 1040, desired: DOCK_RAIL_PX })).toEqual({ mode: 'full', width: DOCK_RAIL_PX })
    expect(fitDockTrack({ ...base, frameWidth: 1040, desired: DOCK_RAIL_PX }).width).toBeLessThan(CHAT_MIN_PX + 1)
  })

  it('uses the shell constants by default', () => {
    expect(CHAT_MIN_PX).toBe(400)
    expect(DOCK_MIN_PX).toBe(260)
    expect(DOCK_RAIL_PX).toBe(40)
  })
})

describe('resolveFrame recognition', () => {
  it('accepts the shell grid and ignores non-column children', () => {
    const built = shell()
    expect(resolveFrame(document)).toBe(built.frame)
    expect(resolveCentreColumn(built.frame)).toBe(built.centre)
    // Only the three columns auto-place; the spanned row, overlay and handle do not.
    expect(built.frame.children).toHaveLength(6)
  })

  it('declines templates that are not exactly three tracks', () => {
    shell({ template: '280px minmax(400px, 1fr)' })
    expect(resolveFrame(document)).toBeNull()
    clearBody()
    shell({ template: `${APP_TEMPLATE} 100px` })
    expect(resolveFrame(document)).toBeNull()
    clearBody()
    shell({ template: '' })
    expect(resolveFrame(document)).toBeNull()
  })

  it('declines when the conversation is not the middle column', () => {
    shell({ centreAt: 2 })
    expect(resolveFrame(document)).toBeNull()
    clearBody()
    shell({ centreAt: 0 })
    expect(resolveFrame(document)).toBeNull()
  })

  it('declines when there is no shell at all', () => {
    expect(resolveFrame(document)).toBeNull()
  })
})

describe('attachDock placement', () => {
  it('inserts the host before the centre and injects exactly one track', () => {
    const built = shell()
    setFrameWidth(built.frame, 1440)
    const host = makeHost()
    const attachment = attachDock(host, { document })
    expect(attachment).not.toBeNull()

    expect(host.parentElement).toBe(built.frame)
    expect(host.nextElementSibling).toBe(built.centre)
    // The conversation itself is never moved or restyled.
    expect(built.centre.parentElement).toBe(built.frame)
    expect(built.centre.previousElementSibling).toBe(host)
    expect(built.centre.getAttribute('style')).toBeNull()

    const template = built.frame.style.gridTemplateColumns
    expect(trackSizes(template)).toHaveLength(4)
    expect(countOriginalTracks(template)).toBe(3)
    expect(trackSizes(template)[1]).toBe(EFFECTIVE_TRACK)
    expect(template).toBe(`280px ${EFFECTIVE_TRACK} minmax(400px, 1fr) minmax(0px, 320px)`)
    expect(attachment?.isAttached()).toBe(true)

    attachment?.dispose()
    expect(host.parentElement).toBeNull()
    expect(built.frame.style.gridTemplateColumns).toBe(APP_TEMPLATE)
    expect(attachment?.isAttached()).toBe(false)
  })

  it('declines an unrecognisable shell without touching a style', () => {
    const built = shell({ template: '280px minmax(400px, 1fr)' })
    const host = makeHost()
    const warned: string[] = []
    const attachment = attachDock(host, { document, onWarn: reason => warned.push(reason) })
    expect(attachment).toBeNull()
    expect(warned).toEqual(['dock-seat-unresolved'])
    expect(built.frame.style.gridTemplateColumns).toBe('280px minmax(400px, 1fr)')
    expect(host.parentElement).toBeNull()
  })

  it('waits for the conversation to mount, then places the dock', async () => {
    const built = shell({ slot: false })
    setFrameWidth(built.frame, 1440)
    const host = makeHost()
    const attachment = attachDock(host, { document })
    expect(attachment).not.toBeNull()
    expect(attachment?.isAttached()).toBe(false)
    expect(host.parentElement).toBeNull()

    const slot = document.createElement('div')
    slot.setAttribute('data-slot', 'conversation.session.body')
    built.centre.append(slot)
    await flush()

    expect(host.parentElement).toBe(built.frame)
    expect(host.nextElementSibling).toBe(built.centre)
    expect(attachment?.isAttached()).toBe(true)
    attachment?.dispose()
  })

  it('corrects the template synchronously after an app rewrite', async () => {
    const built = shell()
    setFrameWidth(built.frame, 1440)
    const host = makeHost()
    const attachment = attachDock(host, { document })
    // The app rewrites the inline template exactly as React would.
    built.frame.style.gridTemplateColumns = APP_TEMPLATE
    await flush()

    const template = built.frame.style.gridTemplateColumns
    expect(hasDockTrack(template)).toBe(true)
    expect(trackSizes(template).filter(isDockTrack)).toHaveLength(1)
    expect(template).toBe(`280px ${EFFECTIVE_TRACK} minmax(400px, 1fr) minmax(0px, 320px)`)
    // Still the same centre node, still immediately after our host.
    expect(built.centre.parentElement).toBe(built.frame)
    expect(host.nextElementSibling).toBe(built.centre)
    attachment?.dispose()
  })

  it('moves to a remounted frame and restores the one it actually wrote to', async () => {
    const built = shell()
    setFrameWidth(built.frame, 1440)
    const host = makeHost()
    const attachment = attachDock(host, { document })
    const oldFrame = built.frame

    clearBody()
    const next = shell()
    setFrameWidth(next.frame, 1440)
    await flush()

    expect(oldFrame.style.gridTemplateColumns).toBe(APP_TEMPLATE)
    expect(hasDockTrack(next.frame.style.gridTemplateColumns)).toBe(true)
    expect(host.parentElement).toBe(next.frame)
    expect(host.nextElementSibling).toBe(next.centre)

    attachment?.dispose()
    expect(host.parentElement).toBeNull()
    expect(next.frame.style.gridTemplateColumns).toBe(APP_TEMPLATE)
  })

  it('cancels a pending rAF and restores on dispose, idempotently', async () => {
    const { scheduled, cancelled } = installFakeRaf()
    const built = shell()
    setFrameWidth(built.frame, 1440)
    const host = makeHost()
    const attachment = attachDock(host, { document })

    // A native track change with the marker present defers to the next frame.
    built.frame.style.gridTemplateColumns = built.frame.style.gridTemplateColumns.replace('280px', '300px')
    await flush()
    expect(scheduled).toHaveLength(1)

    attachment?.dispose()
    expect(cancelled).toContain(99)
    expect(host.parentElement).toBeNull()
    expect(hasDockTrack(built.frame.style.gridTemplateColumns)).toBe(false)
    expect(built.frame.style.getPropertyValue(EFFECTIVE_TRACK_VAR)).toBe('')
    attachment?.dispose()
    expect(attachment?.isAttached()).toBe(false)
  })

  it('dedupes the diagnostic when the shell stops being recognisable', async () => {
    disableRaf()
    const built = shell()
    setFrameWidth(built.frame, 1440)
    const host = makeHost()
    const warned: string[] = []
    const attachment = attachDock(host, { document, onWarn: reason => warned.push(reason) })

    const extra = document.createElement('div')
    built.frame.insertBefore(extra, built.overlay)
    await flush()
    expect(warned).toEqual(['dock-seat-unresolved'])
    expect(host.parentElement).toBeNull()
    expect(hasDockTrack(built.frame.style.gridTemplateColumns)).toBe(false)

    const extra2 = document.createElement('div')
    built.frame.insertBefore(extra2, built.overlay)
    await flush()
    expect(warned).toHaveLength(1)
    attachment?.dispose()
  })
})

describe('attachDock responsive budget', () => {
  it('shrinks and rails with the frame, then restores the user width', () => {
    installResizeObserver()
    disableRaf()
    const built = shell()
    setFrameWidth(built.frame, 1440)
    const host = makeHost()
    const attachment = attachDock(host, { document })
    expect(built.frame.style.getPropertyValue(EFFECTIVE_TRACK_VAR)).toBe('')

    const resize = FakeResizeObserver.all[0]
    expect(resize).toBeDefined()

    setFrameWidth(built.frame, 1300)
    resize?.fire()
    expect(built.frame.style.getPropertyValue(EFFECTIVE_TRACK_VAR)).toBe('300px')

    setFrameWidth(built.frame, 1100)
    resize?.fire()
    expect(built.frame.style.getPropertyValue(EFFECTIVE_TRACK_VAR)).toBe('40px')

    setFrameWidth(built.frame, 1440)
    resize?.fire()
    expect(built.frame.style.getPropertyValue(EFFECTIVE_TRACK_VAR)).toBe('')
    expect(built.frame.style.gridTemplateColumns).toBe(`280px ${EFFECTIVE_TRACK} minmax(400px, 1fr) minmax(0px, 320px)`)
    attachment?.dispose()
  })

  it('declines silently when there is no room and re-attaches when there is', () => {
    installResizeObserver()
    disableRaf()
    const built = shell()
    setFrameWidth(built.frame, 1440)
    const host = makeHost()
    const warned: string[] = []
    const attachment = attachDock(host, { document, onWarn: reason => warned.push(reason) })
    const resize = FakeResizeObserver.all[0]

    setFrameWidth(built.frame, 900)
    resize?.fire()
    expect(host.parentElement).toBeNull()
    expect(hasDockTrack(built.frame.style.gridTemplateColumns)).toBe(false)
    expect(attachment?.isAttached()).toBe(false)

    setFrameWidth(built.frame, 1500)
    resize?.fire()
    expect(host.parentElement).toBe(built.frame)
    expect(attachment?.isAttached()).toBe(true)
    // A narrow frame is normal responsive behaviour, not a warning.
    expect(warned).toEqual([])
    attachment?.dispose()
  })

  it('respects an explicitly desired width below the default', () => {
    installResizeObserver()
    disableRaf()
    const built = shell()
    setFrameWidth(built.frame, 1440)
    built.frame.style.setProperty('--sb-dock-track', '120px')
    const host = makeHost()
    const attachment = attachDock(host, { document })
    // 1440 - 280 - 320 - 400 = 440 >= 120, so nothing is capped.
    expect(built.frame.style.getPropertyValue(EFFECTIVE_TRACK_VAR)).toBe('')
    attachment?.dispose()
  })
})

describe('requested width reactivity', () => {
  it('observes html width changes after responsive cap applied', async () => {
    disableRaf()
    const built = shell()
    setFrameWidth(built.frame, 1300)
    const read = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      const base = read(element)
      if (element !== built.frame) return base
      return new Proxy(base, { get(target, key) {
        if (key === 'getPropertyValue') return (name: string) => name === '--sb-dock-track' ? document.documentElement.style.getPropertyValue(name) : target.getPropertyValue(name)
        const value = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      } })
    })
    document.documentElement.style.setProperty('--sb-dock-track', '340px')
    const attachment = attachDock(makeHost(), { document })
    expect(built.frame.style.getPropertyValue(EFFECTIVE_TRACK_VAR)).toBe('300px')
    document.documentElement.style.setProperty('--sb-dock-track', '40px')
    await flush()
    expect(built.frame.style.getPropertyValue(EFFECTIVE_TRACK_VAR)).toBe('')
    attachment?.dispose()
    document.documentElement.style.removeProperty('--sb-dock-track')
  })
})
