import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MANAGER_LAYOUT,
  MANAGER_LAYOUT_KEY,
  MANAGER_MAX_NAV_WIDTH,
  MANAGER_MAX_WIDTH,
  MANAGER_MIN_CHAT_WIDTH,
  MANAGER_MIN_NAV_WIDTH,
  MANAGER_MIN_WIDTH,
  clampDrawerWidth,
  clampNavWidth,
  defaultDrawerWidth,
  dragDrawerWidth,
  dragNavWidth,
  nudgeDrawerWidth,
  nudgeNavWidth,
  parseManagerLayout,
  readManagerLayout,
  resolveDrawerWidth,
  resolveNavWidth,
  serializeManagerLayout,
  writeManagerLayout,
  type ManagerLayout,
  type ManagerLayoutStorage,
} from '../src/client/manager/layout.ts'

/** In-memory storage double for the persistence tests. */
function memoryStorage(seed: Record<string, string> = {}): ManagerLayoutStorage & { data: Record<string, string> } {
  const data: Record<string, string> = { ...seed }
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value },
  }
}

describe('manager drawer width math', () => {
  it('keeps the floating drawer above the minimum and below the viewport', () => {
    expect(clampDrawerWidth(100, 1280)).toBe(MANAGER_MIN_WIDTH)
    expect(clampDrawerWidth(5000, 1280)).toBe(MANAGER_MAX_WIDTH)
    expect(clampDrawerWidth(900, 1280)).toBe(900)
    expect(clampDrawerWidth(900, 700)).toBe(688)
  })

  it('shrinks below the preferred minimum when the window is narrower', () => {
    expect(clampDrawerWidth(900, 400)).toBe(388)
    expect(clampDrawerWidth(900, 200)).toBe(320)
  })

  it('rounds to whole pixels', () => {
    expect(clampDrawerWidth(800.6, 1280)).toBe(801)
  })

  it('opens at a width that leaves the chat usable', () => {
    expect(defaultDrawerWidth(1280)).toBe(819)
    expect(defaultDrawerWidth(1440)).toBe(922)
    expect(defaultDrawerWidth(1000)).toBe(640)
    const narrow = defaultDrawerWidth(1000)
    expect(narrow - resolveNavWidth(DEFAULT_MANAGER_LAYOUT, narrow)).toBeGreaterThanOrEqual(MANAGER_MIN_CHAT_WIDTH)
  })

  it('resolves a persisted width through the current viewport', () => {
    expect(resolveDrawerWidth(DEFAULT_MANAGER_LAYOUT, 1280)).toBe(819)
    expect(resolveDrawerWidth({ ...DEFAULT_MANAGER_LAYOUT, width: 1000 }, 1280)).toBe(1000)
    expect(resolveDrawerWidth({ ...DEFAULT_MANAGER_LAYOUT, width: 1000 }, 700)).toBe(688)
  })
})

describe('manager navigator width math', () => {
  it('keeps the chat usable next to a wide navigator', () => {
    expect(clampNavWidth(300, 1116)).toBe(300)
    expect(clampNavWidth(900, 1116)).toBe(Math.min(MANAGER_MAX_NAV_WIDTH, 1116 - MANAGER_MIN_CHAT_WIDTH))
    expect(clampNavWidth(10, 1116)).toBe(MANAGER_MIN_NAV_WIDTH)
  })

  it('collapses the navigator range in a narrow drawer', () => {
    const narrow = 520
    expect(clampNavWidth(500, narrow)).toBe(MANAGER_MIN_NAV_WIDTH)
  })

  it('resolves the default navigator width', () => {
    expect(resolveNavWidth(DEFAULT_MANAGER_LAYOUT, 1116)).toBe(300)
    expect(resolveNavWidth({ ...DEFAULT_MANAGER_LAYOUT, navWidth: 420 }, 1116)).toBe(420)
    expect(resolveNavWidth({ ...DEFAULT_MANAGER_LAYOUT, navWidth: 900 }, 1116)).toBe(560)
  })
})

describe('manager drag math', () => {
  it('grows the drawer when the pointer moves left', () => {
    expect(dragDrawerWidth(800, 500, 400, 1280)).toBe(900)
    expect(dragDrawerWidth(800, 500, 600, 1280)).toBe(700)
    expect(dragDrawerWidth(800, 500, -2000, 1280)).toBe(MANAGER_MAX_WIDTH)
    expect(dragDrawerWidth(800, 500, 2000, 1280)).toBe(MANAGER_MIN_WIDTH)
  })

  it('grows the navigator when the pointer moves right', () => {
    expect(dragNavWidth(300, 700, 780, 1116)).toBe(380)
    expect(dragNavWidth(300, 700, 620, 1116)).toBe(MANAGER_MIN_NAV_WIDTH)
    expect(dragNavWidth(300, 700, 4000, 1116)).toBe(560)
  })

  it('nudges by one keyboard step and clamps', () => {
    expect(nudgeDrawerWidth(800, 1, 1280)).toBe(824)
    expect(nudgeDrawerWidth(800, -1, 1280)).toBe(776)
    expect(nudgeDrawerWidth(MANAGER_MAX_WIDTH, 1, 1280)).toBe(MANAGER_MAX_WIDTH)
    expect(nudgeNavWidth(300, 1, 1116)).toBe(324)
    expect(nudgeNavWidth(300, -1, 1116)).toBe(276)
  })
})

describe('manager layout persistence', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(parseManagerLayout(null)).toEqual(DEFAULT_MANAGER_LAYOUT)
  })

  it('treats corrupted storage as defaults', () => {
    expect(parseManagerLayout('{not json')).toEqual(DEFAULT_MANAGER_LAYOUT)
    expect(parseManagerLayout('null')).toEqual(DEFAULT_MANAGER_LAYOUT)
    expect(parseManagerLayout('"text"')).toEqual(DEFAULT_MANAGER_LAYOUT)
  })

  it('drops implausible dimensions instead of trusting them', () => {
    const parsed = parseManagerLayout(JSON.stringify({ width: -10, navWidth: 99999, navCollapsed: 'yes', maximized: 1, showPaths: true }))
    expect(parsed.width).toBeNull()
    expect(parsed.navWidth).toBeNull()
    expect(parsed.navCollapsed).toBe(false)
    expect(parsed.maximized).toBe(false)
    expect(parsed.showPaths).toBe(true)
  })

  it('round-trips the layout', () => {
    const layout: ManagerLayout = {
      width: 960,
      navWidth: 330,
      navCollapsed: true,
      maximized: false,
      showPaths: true,
    }
    expect(parseManagerLayout(serializeManagerLayout(layout))).toEqual(layout)
  })

  it('reads and writes through the injected storage', () => {
    const storage = memoryStorage()
    writeManagerLayout({ ...DEFAULT_MANAGER_LAYOUT, width: 900, navCollapsed: true }, storage)
    expect(storage.data[MANAGER_LAYOUT_KEY]).toBeTypeOf('string')
    expect(readManagerLayout(storage)).toEqual({ ...DEFAULT_MANAGER_LAYOUT, width: 900, navCollapsed: true })
  })

  it('survives throwing storage in both directions', () => {
    const broken: ManagerLayoutStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(readManagerLayout(broken)).toEqual(DEFAULT_MANAGER_LAYOUT)
    expect(() => writeManagerLayout({ ...DEFAULT_MANAGER_LAYOUT, width: 900 }, broken)).not.toThrow()
    expect(readManagerLayout(null)).toEqual(DEFAULT_MANAGER_LAYOUT)
    expect(() => writeManagerLayout(DEFAULT_MANAGER_LAYOUT, null)).not.toThrow()
  })
})
