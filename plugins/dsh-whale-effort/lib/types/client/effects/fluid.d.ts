/**
 * Canvas fluid-particle renderer ported from `dsh-effort-slider` (the `fluid`
 * skin's `FLUID_STOPS` / `FLUID_PRESET` / `mountFluid`).
 *
 * The port keeps the upstream tuning constants, the multi-scale curl noise,
 * the random vortices, the `destination-out` fade, the per-pixel particle
 * density and the top-tier star stream. It adapts the plugin environment in
 * five places:
 *
 * - progress arrives through {@link FluidHandle.setProgress} instead of being
 *   read from computed style, so React rendering and the animation frame are
 *   decoupled;
 * - the lit region follows the host thumb's `clamp(inset, pct, 100% - inset)`
 *   positions instead of the upstream rail's inner inset, so the fluid edge
 *   sits under the thumb; the inset itself comes from the `--we-inset` custom
 *   property the effect CSS uses;
 * - only the `fluid` skin animates, and reduced motion freezes a still frame;
 * - the star layer is a `.we-stars` canvas sibling, drawn separately so the
 *   fluid's smear does not blur it;
 * - the star palette follows the document theme marker, because the upstream
 *   star colours were white-only and this host also runs a light theme.
 *
 * The renderer never throws to its caller: a missing window, context, canvas
 * or frame hook degrades to an inert handle, and a failed frame stops the
 * animation without affecting the slider.
 *
 * @module dsh-whale-effort/client/effects/fluid
 */
import type { Skin } from './skins.js';
/** Colour band of the fluid source: blue → indigo → violet → pink. */
export declare const FLUID_STOPS: readonly (readonly [number, readonly [number, number, number]])[];
/** Tuning constants of the upstream `fluid=a` preset. */
export interface FluidPreset {
    /** Per-frame `destination-out` fade of the accumulated canvas. */
    readonly fade: number;
    /** Base flow speed in px/frame. */
    readonly vel: number;
    /** Per-particle speed multiplier range. */
    readonly speed: readonly [number, number];
    /** Spatial scale of the curl noise (larger = larger clumps). */
    readonly curlScale: number;
    /** Particle lifetime used for the soft age fade. */
    readonly life: number;
    /** Particle radius range in CSS pixels. */
    readonly r: readonly [number, number];
    /** Base spawn alpha. */
    readonly alpha: number;
    /** Composite mode of the particle pass. */
    readonly blend: 'source-over';
    /** Vertical jitter in px/frame. */
    readonly jitter: number;
    /** Flow-speed multiplier while the top tier is active. */
    readonly topSpeedMul: number;
    /** Number of star streaks at the top tier. */
    readonly starCount: number;
    /** Star streak speed range in px/frame. */
    readonly starSpeed: readonly [number, number];
    /** Ramp-up time after entering the top tier, in ms. */
    readonly starRampMs: number;
    /** Fraction of full star speed at the moment the top tier starts. */
    readonly starRampStart: number;
    /** How strongly the local flow field dominates the forward direction. */
    readonly swirl: number;
    /** Particles per CSS pixel of lit width. */
    readonly density: number;
    /** Minimum particle count (must not exceed `density` × the smallest lit width). */
    readonly countMin: number;
    /** Maximum particle count. */
    readonly countMax: number;
    /** Round-trip period of the source colour, in ms. */
    readonly hueCycle: number;
}
/** Immutable upstream tuning preset. */
export declare const FLUID_PRESET: FluidPreset;
/** Upstream rail inset: the 30px `es-knob` sits 17px inside either end. */
export declare const FLUID_INSET = 17;
/**
 * Inset used by the merged layout when the host does not set `--we-inset`.
 *
 * The host thumb clamps its centre 10px (chibi sprite) or 14px (28px ball)
 * inside the rail; 12px is the middle of those two clamps, so the fluid edge is
 * at most 2px away from the thumb centre at the two extreme levels.
 */
export declare const DEFAULT_EFFECT_INSET = 12;
/**
 * Clamp a device pixel ratio the way the upstream engine does.
 * @param value - `window.devicePixelRatio`, or anything the environment exposes.
 * @returns the ratio capped at 2, with unusable values treated as 1.
 */
export declare function clampDevicePixelRatio(value: number): number;
/**
 * Read the host's theme marker.
 *
 * DSH stamps `data-ds-dark-theme` on the document body; the effects use that
 * marker instead of a media query because the GUI theme is a product setting,
 * not the operating-system preference.
 * @returns `dark` when the marker is present (also when there is no document,
 *   matching the upstream dark-only palette), else `light`.
 */
export declare function readDocumentTheme(): 'dark' | 'light';
/**
 * Whether the platform asks for reduced motion.
 * @returns `false` when `matchMedia` is unavailable.
 */
export declare function prefersReducedMotion(): boolean;
/**
 * Whether the top-tier flow and star stream apply.
 *
 * The upstream engine applies them to the model's real maximum level and to the
 * appended Ultra tier alike, so both flags select the same physics.
 * @param ultra - the appended Ultra tier is selected.
 * @param top - the thumb is at the model's real maximum level.
 * @returns `true` when either flag is set.
 */
export declare function topTierActive(ultra: boolean, top: boolean): boolean;
/**
 * Sample the source colour band.
 * @param progress - position on the band, 0..1.
 * @returns the rounded `[r, g, b]` colour at that position.
 */
export declare function fluidColorAt(progress: number): readonly [number, number, number];
/** Imperative surface the slider drives; all methods are safe before layout. */
export interface FluidHandle {
    /** Set the lit fraction, 0..1. */
    setProgress(progress: number): void;
    /** Switch the energy skin; only `fluid` animates. */
    setSkin(skin: Skin): void;
    /** Toggle top-tier physics (×2 flow speed and the star stream). */
    setUltra(on: boolean): void;
    /** Record the lightning state; its visuals are CSS-owned, not canvas-owned. */
    setLightning(on: boolean): void;
    /** Record the normalized 0..1 rate glow; its visuals are CSS-owned. */
    setRate(normalized: number): void;
    /** Stop the animation frame, observers and listeners, then clear the canvases. */
    dispose(): void;
}
/**
 * Mount the fluid engine on a canvas.
 *
 * The canvas must be absolutely positioned to fill the effect layer; the engine
 * sizes it from its own bounding box and finds the `.we-stars` sibling itself.
 * @param canvas - the `.we-fluid` canvas the effect layer renders.
 * @param options - initial skin; the engine only animates for `fluid`.
 * @returns the imperative handle; an inert one when the environment cannot paint.
 */
export declare function createFluidRenderer(canvas: HTMLCanvasElement, options: {
    skin: Skin;
}): FluidHandle;
