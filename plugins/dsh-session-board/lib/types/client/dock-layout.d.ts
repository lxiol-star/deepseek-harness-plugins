/**
 * Pure layout grammar for the dock adapter.
 *
 * Two decisions keep the docked column safe, and both are pure:
 *
 *  - *Recognition*: is this frame the shell's three-track grid, and may the
 *    dock be inserted between two of the columns? The template grammar below
 *    answers that from the string alone, including nested functions
 *    (`minmax(0px, min(400px, 20%))`) and bracketed line names
 *    (`[content-start] 1fr`).
 *  - *Budget*: how wide may the dock be before the conversation drops below
 *    the width the shell itself protects? The budget reserves the numeric
 *    sidebar/rightbar tracks plus `CHAT_MIN_PX` and spends only the rest.
 *
 * Nothing here touches the DOM, so both can be tested without a browser.
 * The adapter (`dock-adapter.ts`) is the only DOM half.
 */
/**
 * The dock's track, exactly as the adapter has always injected it. Kept
 * verbatim: it is the fallback inside {@link EFFECTIVE_TRACK}, so a frame left
 * over from an older build still resolves its width.
 */
export declare const MY_TRACK = "var(--sb-dock-track, 341px)";
/** Custom property the client half writes on `documentElement`. */
export declare const DOCK_TRACK_VAR = "--sb-dock-track";
/**
 * Custom property the adapter writes on the *frame* when the budget narrows
 * the dock. Scoped to the frame so no global CSS and no view store is touched.
 */
export declare const EFFECTIVE_TRACK_VAR = "--sb-dock-track-effective";
/** Marker every injected track carries, so a restore is exact. */
export declare const DOCK_TRACK_MARKER = "--sb-dock-track";
/**
 * The track injected into the frame: the responsive cap when the adapter has
 * set one, the user's width otherwise.
 */
export declare const EFFECTIVE_TRACK = "var(--sb-dock-track-effective, var(--sb-dock-track, 341px))";
/** Width the app's centre track protects (`CENTER_MIN` upstream). */
export declare const CHAT_MIN_PX = 400;
/** Narrowest usable expanded dock (mirrors `BoardDock.DOCK_MIN_WIDTH`). */
export declare const DOCK_MIN_PX = 260;
/** Collapsed rail (mirrors `BoardDock.DOCK_RAIL_WIDTH`; the dock is border-box). */
export declare const DOCK_RAIL_PX = 40;
/** Desired width assumed when the CSS variable cannot be read. */
export declare const DOCK_FALLBACK_PX = 340;
/** A track's resolved px extent: `minmax(0px, 320px)` is `{min:0,max:320}`. */
export interface TrackExtent {
    min: number;
    max: number;
}
/** The numeric widths the frame's own tracks must be reserved for. */
export interface NativeColumns {
    sidebar: number;
    rightbar: number;
}
/** How the dock fits the frame after the budget is applied. */
export type DockFitMode = 'full' | 'shrunk' | 'rail' | 'declined' | 'unknown';
/** One budget decision. */
export interface DockFit {
    mode: DockFitMode;
    width: number;
}
/** Inputs of {@link fitDockTrack}. `null` means "not px-resolvable". */
export interface DockBudgetInput {
    /** Measured frame width in px; `<= 0` when it cannot be measured. */
    frameWidth: number;
    /** Resolved sidebar track, or null when the template is not numeric. */
    sidebar: number | null;
    /** Resolved rightbar track, or null when the template is not numeric. */
    rightbar: number | null;
    /** The user's dock width in px. */
    desired: number;
    /** Conversation width the shell protects. */
    chatMin?: number;
    /** Narrowest expanded dock. */
    min?: number;
    /** Collapsed rail width. */
    rail?: number;
}
/** Split a `grid-template-columns` value into raw tokens. */
export declare function splitTrackTokens(template: string): string[];
/**
 * Track sizes only: bracketed line names are not tracks, and a fixed
 * `repeat(<n>, ...)` is expanded so it counts as `<n>` tracks. Unresolvable
 * repeats (`repeat(auto-fill, ...)`) stay one token.
 */
export declare function trackSizes(template: string): string[];
/** Whether a track token is one this adapter injected. */
export declare function isDockTrack(track: string): boolean;
/** Cheap check: does this template already carry the dock's track? */
export declare function hasDockTrack(template: string): boolean;
/** How many of the template's tracks belong to the shell itself. */
export declare function countOriginalTracks(template: string): number;
/**
 * Resolve one track token to a px extent, or null when it is not
 * px-resolvable (`1fr`, `auto`, `20%`, `calc(...)`, a bare `var(...)`). Nested
 * `minmax`/`min`/`max`/`clamp` are understood because that is the shape the
 * shell emits.
 */
export declare function parseTrackExtent(token: string): TrackExtent | null;
/**
 * The numeric widths the frame's own sidebar and rightbar tracks claim.
 *
 * Returns null unless the template is exactly the shell's three tracks and
 * both side tracks are px-resolvable: when the budget cannot be trusted, the
 * adapter keeps the user's width instead of guessing.
 */
export declare function resolveNativeColumns(template: string): NativeColumns | null;
/** Read a dock width from a CSS custom-property value, or null. */
export declare function parseDockTrackValue(raw: string): number | null;
/**
 * Fit the dock into the frame without pushing the conversation below the
 * width the shell protects.
 *
 * The ladder is deliberately conservative: the dock keeps its desired width
 * while that fits; otherwise it shrinks as far as the frame allows; then it
 * falls back to the collapsed rail; and when even the rail would eat into the
 * conversation, the dock declines entirely and the adapter takes its track
 * back out. `unknown` means the frame could not be measured or its side tracks
 * are not numeric, in which case the user's width is left alone.
 */
export declare function fitDockTrack(input: DockBudgetInput): DockFit;
