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
export type Skin = 'holo' | 'chrome' | 'fluid'

/** Every supported skin, in the order the skin picker renders them. */
export const SKINS: readonly Skin[] = ['holo', 'chrome', 'fluid']

/** Skin used before a preference has been read, and after an invalid one. */
export const DEFAULT_SKIN: Skin = 'fluid'

/**
 * English fallback labels, carried over from the upstream plugin.
 *
 * Product copy lives in `locales.ts`; this table keeps the exported
 * {@link skinLabel} contract readable for callers that have no locale yet.
 */
const SKIN_LABELS: Readonly<Record<Skin, string>> = {
  holo: 'Hologram',
  chrome: 'Liquid metal',
  fluid: 'Fluid',
}

/**
 * Default display name for one skin.
 * @param skin - a supported skin.
 * @returns the upstream english label, or the raw value for an unknown name.
 */
export function skinLabel(skin: Skin): string {
  return Object.prototype.hasOwnProperty.call(SKIN_LABELS, skin) ? SKIN_LABELS[skin] : String(skin)
}
