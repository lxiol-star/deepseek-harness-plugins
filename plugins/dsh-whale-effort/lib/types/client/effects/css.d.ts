/**
 * All new visual CSS for the whale-girl effort slider.
 *
 * Ported from `dsh-effort-slider`'s stylesheet and re-scoped to the plugin's own
 * layer classes: every selector starts with a `.we-` class or a `[data-we-*]`
 * attribute placed on the effect layer, so the host application's styles and the
 * reasoning-effort plugin's own `.re-*` layout rules stay untouched.
 *
 * Skin switching is attribute-driven instead of variant classes:
 * `data-we-skin="holo|chrome|fluid"`, `data-we-ultra="1"`, `data-we-top="1"`,
 * `data-we-lightning="1"`, `data-we-dragging="1"` and
 * `data-we-theme="dark|light"` are all carried by the `.we-layer` element.
 *
 * Visual layers, bottom to top: energy rail tint (`.we-rail`), skinned fill
 * (`.we-fill`), fluid canvas (`.we-fluid`), star-streak canvas (`.we-stars`),
 * leading-edge glow (`.we-glow`), Ultra white-hot core (`.we-core`), and the
 * knob halo behind the host-owned thumb (`.we-knob-aura`).
 *
 * @module dsh-whale-effort/client/effects/css
 */
/** Scoped stylesheet; the client injects it once during plugin apply. */
export declare const EFFECTS_CSS: string;
