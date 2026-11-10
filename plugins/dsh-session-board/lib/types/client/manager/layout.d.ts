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
    width: number | null;
    /** Navigator width in CSS pixels; `null` uses the default. */
    navWidth: number | null;
    /** Navigator hidden, giving the chat the whole drawer. */
    navCollapsed: boolean;
    /** Drawer fills the viewport instead of floating over it. */
    maximized: boolean;
    /** Show each workspace's path under its name. */
    showPaths: boolean;
}
/** localStorage key holding the layout preferences. */
export declare const MANAGER_LAYOUT_KEY = "dsh.sessionBoard.managerLayout.v1";
/** Narrowest usable drawer: navigator plus a readable chat column. */
export declare const MANAGER_MIN_WIDTH = 480;
/** Widest the drawer grows while floating, before the viewport cap. */
export declare const MANAGER_MAX_WIDTH = 1200;
/** Share of the viewport the floating drawer aims for on first open. */
export declare const MANAGER_DEFAULT_WIDTH_RATIO = 0.64;
/** Fallback width when the viewport is unknown. */
export declare const MANAGER_DEFAULT_WIDTH = 832;
/** Narrowest navigator. */
export declare const MANAGER_MIN_NAV_WIDTH = 244;
/** Widest navigator, independent of the drawer. */
export declare const MANAGER_MAX_NAV_WIDTH = 560;
/** Chat column kept usable no matter how wide the navigator gets. */
export declare const MANAGER_MIN_CHAT_WIDTH = 380;
/** Navigator width on first open. */
export declare const MANAGER_DEFAULT_NAV_WIDTH = 300;
/** One keyboard resize step. */
export declare const MANAGER_RESIZE_STEP = 24;
/** Defaults used before the user has ever resized the drawer. */
export declare const DEFAULT_MANAGER_LAYOUT: ManagerLayout;
/** Minimal `localStorage` face, so tests can inject one. */
export interface ManagerLayoutStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}
/**
 * Clamp a drawer width to the floating bounds and the current viewport.
 * @param width - requested width in CSS pixels.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the usable width.
 */
export declare function clampDrawerWidth(width: number, viewportWidth: number): number;
/**
 * The responsive first-open width.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the default drawer width.
 */
export declare function defaultDrawerWidth(viewportWidth: number): number;
/**
 * Resolve the drawer width from persisted state.
 * @param layout - persisted layout.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the drawer width to render.
 */
export declare function resolveDrawerWidth(layout: ManagerLayout, viewportWidth: number): number;
/**
 * Clamp a navigator width so the chat keeps its minimum share of the drawer.
 * @param width - requested navigator width in CSS pixels.
 * @param drawerWidth - current drawer width in CSS pixels.
 * @returns the usable navigator width.
 */
export declare function clampNavWidth(width: number, drawerWidth: number): number;
/**
 * Resolve the navigator width from persisted state.
 * @param layout - persisted layout.
 * @param drawerWidth - current drawer width in CSS pixels.
 * @returns the navigator width to render.
 */
export declare function resolveNavWidth(layout: ManagerLayout, drawerWidth: number): number;
/**
 * Width after dragging the drawer's outer edge.
 * @param startWidth - width when the drag started.
 * @param startX - pointer X when the drag started.
 * @param currentX - pointer X now.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the clamped width.
 */
export declare function dragDrawerWidth(startWidth: number, startX: number, currentX: number, viewportWidth: number): number;
/**
 * Width after dragging the navigator divider.
 * @param startWidth - navigator width when the drag started.
 * @param startX - pointer X when the drag started.
 * @param currentX - pointer X now.
 * @param drawerWidth - current drawer width in CSS pixels.
 * @returns the clamped navigator width.
 */
export declare function dragNavWidth(startWidth: number, startX: number, currentX: number, drawerWidth: number): number;
/**
 * Width after a keyboard arrow nudge.
 * @param width - current width.
 * @param direction - `1` grows, `-1` shrinks.
 * @param viewportWidth - window inner width in CSS pixels.
 * @returns the clamped drawer width.
 */
export declare function nudgeDrawerWidth(width: number, direction: number, viewportWidth: number): number;
/**
 * Navigator width after a keyboard arrow nudge.
 * @param width - current navigator width.
 * @param direction - `1` grows, `-1` shrinks.
 * @param drawerWidth - current drawer width in CSS pixels.
 * @returns the clamped navigator width.
 */
export declare function nudgeNavWidth(width: number, direction: number, drawerWidth: number): number;
/**
 * Parse a serialized layout, falling back to the defaults per field.
 * @param raw - serialized layout, or null when nothing was stored yet.
 * @returns the layout to use.
 */
export declare function parseManagerLayout(raw: string | null): ManagerLayout;
/**
 * Serialize the persisted fields.
 * @param layout - current layout.
 * @returns the JSON to store.
 */
export declare function serializeManagerLayout(layout: ManagerLayout): string;
/**
 * Read the persisted layout.
 * @param storage - storage override for tests; defaults to `localStorage`.
 * @returns the layout, or the defaults when nothing is stored.
 */
export declare function readManagerLayout(storage?: ManagerLayoutStorage | null): ManagerLayout;
/**
 * Persist the layout, ignoring storage failures.
 * @param layout - layout to persist.
 * @param storage - storage override for tests; defaults to `localStorage`.
 */
export declare function writeManagerLayout(layout: ManagerLayout, storage?: ManagerLayoutStorage | null): void;
