/**
 * Energy-skin catalogue for the whale-girl effort slider.
 *
 * The skins are the three visual systems ported from `dsh-effort-slider`:
 * `holo` (holographic cyan), `chrome` (liquid metal) and `fluid` (the canvas
 * particle engine, which is also the default). Panel order is fixed by that
 * upstream plugin: holo, chrome, fluid.
 *
 * @module dsh-whale-effort/client/effects/skins
 */
/** One energy skin. */
export type Skin = 'holo' | 'chrome' | 'fluid';
/** Every supported skin, in the order the skin picker renders them. */
export declare const SKINS: readonly Skin[];
/** Skin used before a preference has been read, and after an invalid one. */
export declare const DEFAULT_SKIN: Skin;
/**
 * Default display name for one skin.
 * @param skin - a supported skin.
 * @returns the upstream english label, or the raw value for an unknown name.
 */
export declare function skinLabel(skin: Skin): string;
