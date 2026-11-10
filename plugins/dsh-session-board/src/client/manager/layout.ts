/**
 * Layout preferences for the manager drawer.
 *
 * The drawer owns window geometry — width, navigator width, collapsed and
 * maximized flags, path visibility — and persists it per browser profile. None
 * of it is host state: two windows on the same profile keep independent
 * geometry, and a failed storage write must never disturb the manager mirror.
 *
 * The clamp math lives here as pure functions so the pointer drag, the keyboard
 * nudges, the viewport reflow and the unit tests all share one definition.
 */

/** Persisted manager drawer layout. */
export interface ManagerLayout {
  /** Drawer width in CSS pixels; `null` uses the responsive default. */
  width: number | null
  /** Navigator width in CSS pixels; `null` uses the default. */
  navWidth: number | null
  /** Navigator hidden, giving the chat the whole drawer. */
  navCollapsed: boolean
  /** Drawer fills the viewport instead of floating over it. */
  maximized: boolean
  /** Show each workspace's path under its name. */
  showPaths: boolean
}

/** localStorage key holding the layout preferences. */
export const MANAGER_LAYOUT_KEY = 'dsh.sessionBoard.managerLayout.v1'

/** Narrowest usable drawer: navigator plus a readable chat column. */
export const MANAGER_MIN_WIDTH = 480
/** Widest the drawer grows while floating, before the viewport cap. */
export const MANAGER_MAX_WIDTH = 1200
/** Share of the viewport the floating drawer aims for on first open. */
export const MANAGER_DEFAULT_WIDTH_RATIO = 0.64
/** Fallback width when the viewport is unknown. */
export const MANAGER_DEFAULT_WIDTH = 832
/** Narrowest navigator. */
export const MANAGER_MIN_NAV_WIDTH = 244
/** Widest navigator, independent of the drawer. */
export const MANAGER_MAX_NAV_WIDTH = 560
/** Chat column kept usable no matter how wide the navigator gets. */
export const MANAGER_MIN_CHAT_WIDTH = 380
/** Navigator width on first open. */
export const MANAGER_DEFAULT_NAV_WIDTH = 300
/** One keyboard resize step. */
export const MANAGER_RESIZE_STEP = 24

/** Defaults used before the user has ever resized the drawer. */
export const DEFAULT_MANAGER_LAYOUT: ManagerLayout = Object.freeze({
  width: null,
  navWidth: null,
  navCollapsed: false,
  maximized: false,
  showPaths: false,
})

/** Minimal `localStorage` face, so tests can inject one. */
export interface ManagerLayoutStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Clamp one arbitrary number into `[min, max]`; `NaN` falls back to `min`. */
function clamp(value: number, min: number, max: number): number {
  const bounded = Number.isFinite(value) ? value : min
  return Math.round(Math.min(Math.max(bounded, min), max))
}

/**
 * Clamp a drawer width to the floating bounds and the current viewport.
 * @param width - requested width in CSS pixels.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the usable width.
 */
export function clampDrawerWidth(width: number, viewportWidth: number): number {
  // On windows narrower than the preferred minimum the drawer still has to
  // fit, so the viewport cap can drop below MANAGER_MIN_WIDTH.
  const upper = Math.min(MANAGER_MAX_WIDTH, Math.max(320, viewportWidth - 12))
  const lower = Math.min(MANAGER_MIN_WIDTH, upper)
  return clamp(width, lower, upper)
}

/**
 * The responsive first-open width.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the default drawer width.
 */
export function defaultDrawerWidth(viewportWidth: number): number {
  return clampDrawerWidth(Math.round(viewportWidth * MANAGER_DEFAULT_WIDTH_RATIO), viewportWidth)
}

/**
 * Resolve the drawer width from persisted state.
 * @param layout - persisted layout.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the drawer width to render.
 */
export function resolveDrawerWidth(layout: ManagerLayout, viewportWidth: number): number {
  return layout.width === null ? defaultDrawerWidth(viewportWidth) : clampDrawerWidth(layout.width, viewportWidth)
}

/**
 * Clamp a navigator width so the chat keeps its minimum share of the drawer.
 * @param width - requested navigator width in CSS pixels.
 * @param drawerWidth - current drawer width in CSS pixels.
 * @returns the usable navigator width.
 */
export function clampNavWidth(width: number, drawerWidth: number): number {
  const lowerCap = Math.max(160, Math.floor(drawerWidth * 0.5))
  const lower = Math.min(MANAGER_MIN_NAV_WIDTH, lowerCap)
  const upperCap = Math.max(lower, drawerWidth - MANAGER_MIN_CHAT_WIDTH)
  const upper = Math.min(MANAGER_MAX_NAV_WIDTH, upperCap)
  return clamp(width, lower, upper)
}

/**
 * Resolve the navigator width from persisted state.
 * @param layout - persisted layout.
 * @param drawerWidth - current drawer width in CSS pixels.
 * @returns the navigator width to render.
 */
export function resolveNavWidth(layout: ManagerLayout, drawerWidth: number): number {
  return layout.navWidth === null
    ? clampNavWidth(Math.min(MANAGER_DEFAULT_NAV_WIDTH, Math.max(MANAGER_MIN_NAV_WIDTH, drawerWidth - MANAGER_MIN_CHAT_WIDTH)), drawerWidth)
    : clampNavWidth(layout.navWidth, drawerWidth)
}

/**
 * Width after dragging the drawer's outer edge.
 * @param startWidth - width when the drag started.
 * @param startX - pointer X when the drag started.
 * @param currentX - pointer X now.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the clamped width.
 */
export function dragDrawerWidth(startWidth: number, startX: number, currentX: number, viewportWidth: number): number {
  return clampDrawerWidth(startWidth + (startX - currentX), viewportWidth)
}

/**
 * Width after dragging the navigator divider.
 * @param startWidth - navigator width when the drag started.
 * @param startX - pointer X when the drag started.
 * @param currentX - pointer X now.
 * @param drawerWidth - current drawer width in CSS pixels.
 * @returns the clamped navigator width.
 */
export function dragNavWidth(startWidth: number, startX: number, currentX: number, drawerWidth: number): number {
  return clampNavWidth(startWidth + (currentX - startX), drawerWidth)
}

/**
 * Width after a keyboard arrow nudge.
 * @param width - current width.
 * @param direction - `1` grows, `-1` shrinks.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the clamped drawer width.
 */
export function nudgeDrawerWidth(width: number, direction: number, viewportWidth: number): number {
  return clampDrawerWidth(width + direction * MANAGER_RESIZE_STEP, viewportWidth)
}

/**
 * Navigator width after a keyboard arrow nudge.
 * @param width - current navigator width.
 * @param direction - `1` grows, `-1` shrinks.
 * @param drawerWidth - current drawer width in CSS pixels.
 * @returns the clamped navigator width.
 */
export function nudgeNavWidth(width: number, direction: number, drawerWidth: number): number {
  return clampNavWidth(width + direction * MANAGER_RESIZE_STEP, drawerWidth)
}

/** Read one persisted dimension, ignoring anything outside a plausible range. */
function readDimension(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null
}

/**
 * Parse a serialized layout, falling back to the defaults per field.
 * @param raw - serialized layout, or null when nothing was stored yet.
 * @returns the layout to use.
 */
export function parseManagerLayout(raw: string | null): ManagerLayout {
  if (raw === null) return { ...DEFAULT_MANAGER_LAYOUT }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    // Corrupted storage is not actionable; the defaults are always safe.
    void error
    return { ...DEFAULT_MANAGER_LAYOUT }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_MANAGER_LAYOUT }
  const record = parsed as Record<string, unknown>
  return {
    width: readDimension(record['width'], 240, 4000),
    navWidth: readDimension(record['navWidth'], 160, 1200),
    navCollapsed: record['navCollapsed'] === true,
    maximized: record['maximized'] === true,
    showPaths: record['showPaths'] === true,
  }
}

/**
 * Serialize the persisted fields.
 * @param layout - current layout.
 * @returns the JSON to store.
 */
export function serializeManagerLayout(layout: ManagerLayout): string {
  return JSON.stringify({
    width: layout.width,
    navWidth: layout.navWidth,
    navCollapsed: layout.navCollapsed,
    maximized: layout.maximized,
    showPaths: layout.showPaths,
  })
}

/** The browser storage when available, else null. */
function browserStorage(): ManagerLayoutStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch (error) {
    // Access can throw when the embedding page blocks storage for the origin.
    void error
    return null
  }
}

/**
 * Read the persisted layout.
 * @param storage - storage override for tests; defaults to `localStorage`.
 * @returns the layout, or the defaults when nothing is stored.
 */
export function readManagerLayout(storage: ManagerLayoutStorage | null = browserStorage()): ManagerLayout {
  if (storage === null) return { ...DEFAULT_MANAGER_LAYOUT }
  try {
    return parseManagerLayout(storage.getItem(MANAGER_LAYOUT_KEY))
  } catch (error) {
    // A throwing read means storage is unavailable for this page.
    void error
    return { ...DEFAULT_MANAGER_LAYOUT }
  }
}

/**
 * Persist the layout, ignoring storage failures.
 * @param layout - layout to persist.
 * @param storage - storage override for tests; defaults to `localStorage`.
 */
export function writeManagerLayout(layout: ManagerLayout, storage: ManagerLayoutStorage | null = browserStorage()): void {
  if (storage === null) return
  try {
    storage.setItem(MANAGER_LAYOUT_KEY, serializeManagerLayout(layout))
  } catch (error) {
    // The panel keeps working with in-memory geometry when the write fails.
    void error
  }
}
