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
export const EFFECTS_CSS: string = `
/* ── effect layer ──────────────────────────────────────────────────────── */

.we-layer {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
  --we-hair: rgba(255, 255, 255, .22);
  --we-hair-strong: rgba(255, 255, 255, .42);
  --we-cool: color-mix(in srgb, currentColor 30%, #ffffff);
  --we-core-line: rgba(244, 249, 255, .75);
  --we-bolt-a: color-mix(in srgb, currentColor 55%, #ffffff);
  --we-bolt-b: color-mix(in srgb, currentColor 60%, #8fb4ff);
  transition: box-shadow .35s ease;
}

/* ── energy rail: skinned tint above the host track ────────────────────── */

.we-rail {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 1;
  transition: opacity .3s ease;
}
.we-layer[data-we-skin="holo"] .we-rail {
  background:
    linear-gradient(90deg, transparent, rgba(64, 240, 230, .10) 50%, transparent),
    linear-gradient(180deg, rgba(2, 18, 26, .78), rgba(10, 42, 52, .62)),
    linear-gradient(180deg, rgba(255, 255, 255, .09), transparent 42%, rgba(0, 0, 0, .40));
  box-shadow:
    0 0 0 1px rgba(80, 246, 236, .55) inset,
    0 0 22px rgba(30, 200, 200, .22) inset,
    0 5px 14px rgba(0, 0, 0, .70) inset;
}
.we-layer[data-we-skin="chrome"] .we-rail {
  background:
    linear-gradient(180deg, rgba(43, 48, 56, .78), rgba(13, 15, 19, .66)),
    linear-gradient(180deg, rgba(255, 255, 255, .12), transparent 44%, rgba(0, 0, 0, .42));
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, .22) inset,
    0 1px 0 rgba(255, 255, 255, .14) inset,
    0 6px 16px rgba(0, 0, 0, .75) inset;
}
.we-layer[data-we-skin="fluid"] .we-rail {
  display: none;
}
.we-layer[data-we-theme="light"] .we-rail {
  opacity: .45;
}

/* ── fill: stops at the thumb centre (same geometry as the host thumb) ──── */

.we-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  /* Thumb-centred width: the same clamp the host applies to the thumb left. */
  width: clamp(var(--we-inset, 12px), calc(var(--we-pct, 1) * 100%), calc(100% - var(--we-inset, 12px)));
  border-radius: 999px;
  pointer-events: none;
  transition: width 190ms cubic-bezier(.22, 1, .36, 1);
}
.we-layer[data-we-dragging="1"] .we-fill {
  transition: none;
}
.we-layer[data-we-skin="holo"] .we-fill {
  border-radius: 9px;
  background: linear-gradient(180deg, #a9ffff 0%, #35e6e6 32%, #12b3bf 68%, #0a6f7c 100%);
  box-shadow: 0 0 20px rgba(64, 240, 230, .85);
}
.we-layer[data-we-skin="holo"] .we-fill::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: repeating-linear-gradient(90deg, rgba(2, 32, 38, .42) 0 1px, transparent 1px 11px);
  animation: we-scan 1.1s linear infinite;
  opacity: .75;
}
.we-layer[data-we-skin="chrome"] .we-fill {
  background: linear-gradient(180deg, #ffffff 0%, #e2e8f2 26%, #aab5c6 58%, #6c7787 100%);
  box-shadow: 0 0 14px rgba(225, 238, 255, .35);
}
.we-layer[data-we-skin="fluid"] .we-fill {
  background: transparent;
  box-shadow: none;
  border: none;
}

/* ── leading-edge glow: trailing bloom in front of the fill ────────────── */

.we-glow {
  position: absolute;
  top: 50%;
  left: clamp(var(--we-inset, 12px), calc(var(--we-pct, 1) * 100%), calc(100% - var(--we-inset, 12px)));
  width: 78px;
  height: 46px;
  border-radius: 50%;
  background: radial-gradient(
    ellipse at 100% 50%,
    rgba(255, 255, 255, .96) 0 4%,
    rgba(188, 189, 255, .80) 11%,
    rgba(106, 87, 255, .50) 28%,
    rgba(105, 31, 255, .20) 49%,
    transparent 74%
  );
  filter: blur(2px) saturate(1.25);
  mix-blend-mode: screen;
  transform: translate(-100%, -50%);
  transition: left 190ms cubic-bezier(.22, 1, .36, 1), filter 140ms ease, opacity 180ms ease;
  pointer-events: none;
  opacity: calc(.55 + .45 * var(--we-rate, 0));
}
.we-glow::before,
.we-glow::after {
  content: "";
  position: absolute;
  inset: 50% auto auto 100%;
  border-radius: 999px;
  transform: translate(-50%, -50%);
}
.we-glow::before {
  width: 52px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(100, 160, 255, .42), #f1ecff, rgba(193, 82, 255, .65), transparent);
  box-shadow: 0 0 7px #9b7cff, 0 0 13px rgba(72, 132, 255, .64);
}
.we-glow::after {
  width: 1px;
  height: 20px;
  background: linear-gradient(180deg, transparent, rgba(196, 190, 255, .84), transparent);
  box-shadow: 0 0 7px #9c7cff;
}
.we-layer[data-we-skin="holo"] .we-glow {
  background: radial-gradient(
    ellipse at 100% 50%,
    rgba(255, 255, 255, .96) 0 4%,
    rgba(184, 255, 250, .85) 11%,
    rgba(64, 240, 230, .50) 28%,
    rgba(12, 179, 191, .22) 49%,
    transparent 74%
  );
}
.we-layer[data-we-skin="holo"] .we-glow::before {
  background: linear-gradient(90deg, transparent, rgba(96, 220, 255, .42), #f1fffe, rgba(64, 240, 230, .65), transparent);
  box-shadow: 0 0 7px rgba(64, 240, 230, .85), 0 0 13px rgba(30, 200, 200, .55);
}
.we-layer[data-we-skin="holo"] .we-glow::after {
  background: linear-gradient(180deg, transparent, rgba(216, 255, 251, .84), transparent);
  box-shadow: 0 0 7px rgba(64, 240, 230, .75);
}
.we-layer[data-we-skin="chrome"] .we-glow {
  background: radial-gradient(
    ellipse at 100% 50%,
    rgba(255, 255, 255, .98) 0 4%,
    rgba(236, 243, 255, .85) 11%,
    rgba(168, 182, 200, .48) 28%,
    rgba(120, 134, 152, .20) 49%,
    transparent 74%
  );
}
.we-layer[data-we-skin="chrome"] .we-glow::before {
  background: linear-gradient(90deg, transparent, rgba(198, 214, 236, .45), #ffffff, rgba(168, 182, 200, .60), transparent);
  box-shadow: 0 0 7px rgba(255, 255, 255, .75), 0 0 13px rgba(168, 182, 200, .55);
}
.we-layer[data-we-skin="chrome"] .we-glow::after {
  background: linear-gradient(180deg, transparent, rgba(240, 247, 255, .88), transparent);
  box-shadow: 0 0 7px rgba(226, 236, 250, .65);
}
.we-layer[data-we-theme="light"] .we-glow {
  background: radial-gradient(
    ellipse at 100% 50%,
    rgba(255, 255, 255, .98) 0 5%,
    rgba(204, 231, 255, .88) 13%,
    rgba(91, 162, 241, .48) 31%,
    rgba(37, 111, 207, .16) 53%,
    transparent 75%
  );
  filter: blur(2px) saturate(1.12);
}
.we-layer[data-we-theme="light"] .we-glow::before {
  background: linear-gradient(90deg, transparent, rgba(116, 177, 244, .34), #ffffff, rgba(66, 139, 225, .58), transparent);
  box-shadow: 0 0 7px rgba(58, 133, 222, .50), 0 0 13px rgba(104, 176, 255, .38);
}
.we-layer[data-we-theme="light"] .we-glow::after {
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, .94), transparent);
  box-shadow: 0 0 7px rgba(64, 137, 224, .44);
}
.we-layer[data-we-dragging="1"] .we-glow {
  filter: blur(1.5px) saturate(1.6) brightness(1.42);
  transition: none;
}
.we-layer[data-we-lightning="1"] .we-glow {
  opacity: calc(.65 + .35 * var(--we-rate, 0));
}

/* ── fluid canvas: the only renderer; hidden for the other skins ───────── */

.we-fluid {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
  display: none;
  opacity: 1;
  image-rendering: pixelated;
  mix-blend-mode: screen;
  transition: filter 140ms ease;
}
.we-layer[data-we-skin="fluid"] .we-fluid {
  display: block;
}
.we-layer[data-we-dragging="1"] .we-fluid {
  filter: saturate(1.45) brightness(1.28) contrast(1.06);
}
.we-layer[data-we-theme="light"] .we-fluid {
  opacity: .78;
  mix-blend-mode: multiply;
}

/* ── star streaks: top-tier reward, separate canvas for crisp lines ────── */

.we-stars {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
  display: none;
}
.we-layer[data-we-skin="fluid"] .we-stars {
  display: block;
}

/* ── Ultra white-hot core ──────────────────────────────────────────────── */

.we-core {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  display: none;
  mix-blend-mode: screen;
  opacity: clamp(.35, calc(.45 + .55 * var(--we-rate, 0)), 1);
}
.we-layer[data-we-ultra="1"] .we-core {
  display: block;
}
.we-core span {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
}
.we-core__glow {
  background:
    radial-gradient(52% 190% at 50% 50%, rgba(255, 255, 255, .98) 0%, rgba(255, 255, 255, .62) 26%, rgba(232, 241, 255, .30) 52%, rgba(214, 229, 255, .10) 74%, transparent 100%),
    radial-gradient(88% 220% at 50% 50%, rgba(214, 231, 255, .45) 0%, rgba(196, 219, 255, .16) 46%, transparent 76%);
  filter: blur(.4px) saturate(108%);
  animation: we-core-breathe 5.2s ease-in-out infinite;
}
.we-core__tint {
  background: radial-gradient(
    58% 210% at 50% 50%,
    color-mix(in srgb, var(--we-cool, #dce9ff) 78%, transparent) 0%,
    color-mix(in srgb, var(--we-cool, #dce9ff) 30%, transparent) 44%,
    transparent 78%
  );
  animation: we-core-cool 5.2s ease-in-out infinite;
}
.we-core__ember {
  inset: auto 0 0;
  height: 1px;
  opacity: calc(.10 + .34 * var(--we-rate, 0));
  background: linear-gradient(90deg, transparent, var(--we-core-line, rgba(244, 249, 255, .75)) 32%, var(--we-core-line, rgba(244, 249, 255, .75)) 68%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 18%, #000 82%, transparent);
}
@keyframes we-core-breathe {
  0%, 100% { opacity: .40; }
  50% { opacity: .98; }
}
@keyframes we-core-cool {
  0%, 100% { opacity: .14; }
  50% { opacity: .56; }
}
.we-layer[data-we-ultra="1"] {
  box-shadow:
    0 0 calc(12px + 26px * var(--we-rate, 0)) rgba(186, 214, 255, .42),
    0 0 12px rgba(255, 255, 255, .34) inset,
    0 0 0 1px rgba(150, 180, 255, .32) inset;
  animation: we-rail-ultra-glow 5.2s ease-in-out infinite;
}
.we-layer[data-we-ultra="1"]::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  box-shadow:
    0 0 0 1.5px rgba(255, 255, 255, .92) inset,
    0 0 0 2.5px rgba(214, 232, 255, .26) inset;
}
.we-layer[data-we-ultra="1"] .we-core::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: -46%;
  width: 46%;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .55) 42%, rgba(238, 245, 255, .30) 62%, transparent);
  filter: blur(.5px);
  opacity: .55;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 16%, #000 84%, transparent);
  animation: we-core-sweep 5.2s ease-in-out infinite;
}
@keyframes we-rail-ultra-glow {
  0%, 100% {
    box-shadow:
      0 0 calc(9px + 16px * var(--we-rate, 0)) rgba(186, 214, 255, .28),
      0 0 8px rgba(255, 255, 255, .22) inset,
      0 0 0 1px rgba(150, 180, 255, .22) inset;
  }
  50% {
    box-shadow:
      0 0 calc(16px + 34px * var(--we-rate, 0)) rgba(214, 232, 255, .56),
      0 0 16px rgba(255, 255, 255, .48) inset,
      0 0 0 1px rgba(186, 214, 255, .46) inset;
  }
}
@keyframes we-core-sweep {
  0% { left: -46%; width: 46%; opacity: 0; }
  22% { opacity: .55; }
  62% { opacity: .50; }
  100% { left: 100%; width: 46%; opacity: 0; }
}
.we-layer[data-we-theme="light"] {
  --we-core-line: rgba(7, 81, 173, .55);
}
.we-layer[data-we-theme="light"] .we-core {
  mix-blend-mode: multiply;
}
.we-layer[data-we-theme="light"] .we-core__glow {
  background:
    radial-gradient(52% 190% at 50% 50%, rgba(24, 84, 178, .52) 0%, rgba(52, 116, 210, .42) 26%, rgba(120, 168, 235, .26) 52%, rgba(160, 200, 250, .10) 74%, transparent 100%),
    radial-gradient(88% 220% at 50% 50%, rgba(126, 177, 238, .30) 0%, rgba(170, 208, 250, .14) 46%, transparent 76%);
}
.we-layer[data-we-theme="light"] .we-core__tint {
  background: radial-gradient(
    58% 210% at 50% 50%,
    rgba(7, 81, 173, .35) 0%,
    rgba(62, 128, 210, .20) 44%,
    transparent 78%
  );
}
.we-layer[data-we-theme="light"] .we-core__ember {
  background: linear-gradient(90deg, transparent, var(--we-core-line, rgba(7, 81, 173, .55)) 32%, var(--we-core-line, rgba(7, 81, 173, .55)) 68%, transparent);
}
.we-layer[data-we-theme="light"][data-we-ultra="1"] {
  box-shadow:
    0 0 calc(12px + 26px * var(--we-rate, 0)) rgba(37, 111, 207, .38),
    0 0 12px rgba(255, 255, 255, .34) inset,
    0 0 0 1px rgba(37, 111, 207, .28) inset;
}
.we-layer[data-we-theme="light"][data-we-ultra="1"]::after {
  box-shadow:
    0 0 0 1.5px rgba(7, 81, 173, .55) inset,
    0 0 0 2.5px rgba(126, 177, 238, .30) inset;
}

/* ── knob halo behind the host-owned thumb ─────────────────────────────── */

.we-knob-aura {
  position: absolute;
  top: 50%;
  left: clamp(var(--we-inset, 12px), calc(var(--we-pct, 1) * 100%), calc(100% - var(--we-inset, 12px)));
  width: var(--we-knob, 34px);
  height: var(--we-knob, 34px);
  margin: calc(-.5 * var(--we-knob, 34px)) 0 0 calc(-.5 * var(--we-knob, 34px));
  border-radius: 999px;
  pointer-events: none;
  transition: left 190ms cubic-bezier(.22, 1, .36, 1), box-shadow 180ms ease, filter 160ms ease;
}
.we-layer[data-we-dragging="1"] .we-knob-aura {
  transition: none;
}
.we-layer[data-we-skin="fluid"] .we-knob-aura {
  background: radial-gradient(circle at 36% 28%, rgba(255, 255, 255, .95) 0%, rgba(244, 247, 255, .72) 34%, rgba(200, 212, 255, .32) 62%, rgba(127, 141, 238, 0) 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, .55),
    0 0 14px rgba(255, 255, 255, .55),
    0 0 30px rgba(120, 150, 255, .65);
}
.we-layer[data-we-skin="holo"] .we-knob-aura {
  background: radial-gradient(circle at 38% 26%, rgba(255, 255, 255, .95) 0%, rgba(216, 255, 251, .72) 34%, rgba(53, 230, 230, .32) 62%, rgba(15, 154, 168, 0) 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, .55),
    0 0 20px rgba(120, 255, 248, .80),
    0 0 38px rgba(40, 220, 215, .55);
}
.we-layer[data-we-skin="chrome"] .we-knob-aura {
  background: radial-gradient(circle at 32% 24%, rgba(255, 255, 255, .98) 0%, rgba(243, 246, 251, .80) 42%, rgba(194, 204, 218, .40) 66%, rgba(125, 135, 149, 0) 100%);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, .60),
    0 2px 8px rgba(0, 0, 0, .60),
    0 9px 18px rgba(0, 0, 0, .42);
}
.we-layer[data-we-skin="chrome"] .we-knob-aura::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  background: conic-gradient(from 140deg, rgba(255, 255, 255, .90), transparent 32%, rgba(255, 255, 255, .60) 62%, transparent 82%);
  opacity: .45;
  animation: we-spin 6s linear infinite;
}
.we-layer[data-we-top="1"] .we-knob-aura {
  box-shadow:
    0 0 0 3px rgba(119, 99, 255, .18),
    0 0 22px rgba(135, 78, 255, .76),
    0 0 34px rgba(53, 121, 255, .34);
}
.we-layer[data-we-theme="light"] .we-knob-aura {
  box-shadow:
    0 0 0 1px rgba(126, 160, 197, .32),
    0 0 13px rgba(48, 118, 207, .30),
    0 3px 8px rgba(39, 77, 119, .18);
}
.we-layer[data-we-ultra="1"] .we-knob-aura {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, .92),
    0 0 0 3px rgba(226, 238, 255, .13),
    0 0 calc(6px + 14px * var(--we-rate, 0)) rgba(255, 255, 255, .62),
    0 0 calc(16px + 26px * var(--we-rate, 0)) rgba(196, 219, 255, .40),
    0 2px 8px rgba(0, 0, 0, .45);
  animation: we-knob-ultra 5.2s ease-in-out infinite;
}
.we-layer[data-we-theme="light"][data-we-ultra="1"] .we-knob-aura {
  box-shadow:
    0 0 0 1px rgba(7, 81, 173, .55),
    0 0 0 3px rgba(126, 177, 238, .20),
    0 0 calc(6px + 14px * var(--we-rate, 0)) rgba(37, 111, 207, .35),
    0 2px 8px rgba(39, 77, 119, .18);
}
@keyframes we-knob-ultra {
  0%, 100% {
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, .80),
      0 0 0 3px rgba(226, 238, 255, .09),
      0 0 5px rgba(255, 255, 255, .42),
      0 0 14px rgba(196, 219, 255, .26),
      0 2px 8px rgba(0, 0, 0, .45);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 1),
      0 0 0 3px rgba(226, 238, 255, .18),
      0 0 17px rgba(255, 255, 255, .80),
      0 0 40px rgba(196, 219, 255, .46),
      0 2px 8px rgba(0, 0, 0, .45);
  }
}
@keyframes we-spin {
  to { transform: rotate(360deg); }
}
@keyframes we-scan {
  from { background-position: 0 0; }
  to { background-position: 11px 0; }
}

/* ── lightning toggle: inline SVG bolt (Feather zap path, MIT) ─────────── */

.we-bolt {
  --we-bolt-shape: polygon(60% 0%, 16% 56%, 46% 56%, 38% 100%, 86% 40%, 53% 40%);
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  padding: 0;
  width: 19px;
  height: 19px;
  min-width: 19px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-sizing: border-box;
  border: 0;
  background: none;
  background-color: transparent;
  border-radius: 4px;
  color: inherit;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: color .22s ease, opacity .22s ease, transform .16s ease;
}
.we-bolt:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.we-bolt__svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
  pointer-events: none;
}
.we-bolt__line {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  opacity: .95;
  transition: opacity .22s ease, stroke .22s ease, stroke-width .22s ease;
}
.we-bolt[data-on="1"] .we-bolt__line {
  stroke: url(#we-bolt-flow);
  stroke-width: 1.75;
  opacity: 1;
}
.we-bolt[data-on="1"] .we-bolt__svg {
  animation: we-bolt-sweep 2.6s linear infinite;
}
@property --we-bolt-x1 {
  syntax: "<number>";
  inherits: true;
  initial-value: 0;
}
@property --we-bolt-x2 {
  syntax: "<number>";
  inherits: true;
  initial-value: 24;
}
@keyframes we-bolt-sweep {
  from { --we-bolt-x1: -24; --we-bolt-x2: 0; }
  to { --we-bolt-x1: 24; --we-bolt-x2: 48; }
}
.we-bolt[data-on="1"] {
  opacity: 1;
  filter:
    drop-shadow(0 0 calc(3px + 6px * var(--we-rate, 0)) rgba(130, 175, 255, .55))
    drop-shadow(0 0 calc(8px + 12px * var(--we-rate, 0)) rgba(90, 140, 255, .30));
  animation: we-bolt-breathe 5.2s ease-in-out infinite, we-bolt-arc .42s steps(2, jump-none) infinite;
}
.we-bolt[data-on="1"]:hover {
  transform: translateY(-1px);
}
.we-bolt[data-on="0"]:hover {
  opacity: 1;
}
.we-bolt:focus-visible {
  outline: 2px solid var(--dsw-static-blue-400, #5d83ff);
  outline-offset: 2px;
}
.we-bolt__glowline {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  opacity: 0;
  stroke-dasharray: calc(var(--we-bolt-len, 64px) * .30) calc(var(--we-bolt-len, 64px) * .70);
}
.we-bolt[data-on="1"] .we-bolt__glowline {
  opacity: .9;
  animation: we-bolt-run 1.9s linear infinite, we-bolt-run-fade 3.8s ease-in-out infinite;
}
@keyframes we-bolt-run {
  from { stroke-dashoffset: calc(var(--we-bolt-len, 64px) * 1); }
  to { stroke-dashoffset: 0; }
}
@keyframes we-bolt-run-fade {
  0%, 100% { opacity: .42; }
  50% { opacity: .95; }
}
@keyframes we-bolt-breathe {
  0%, 100% { opacity: .86; }
  50% { opacity: 1; }
}
@keyframes we-bolt-arc {
  0% { filter: brightness(1); }
  50% { filter: brightness(calc(1 + .035 * var(--we-rate, 0))); }
  100% { filter: brightness(1); }
}

/* ── fleet readout: exact integer, tabular figures, hidden without data ── */

.we-rate {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  min-width: 54px;
  min-height: 18px;
  white-space: nowrap;
  line-height: 1;
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  letter-spacing: .01em;
  color: inherit;
  transition: opacity .25s ease;
}
.we-rate__num {
  display: inline-block;
  min-width: 7.6ch;
  text-align: right;
  font-weight: 600;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 calc(3px + 7px * var(--we-rate, 0)) rgba(120, 160, 255, .35);
}
.we-rate__unit {
  font-size: 10px;
  font-weight: 600;
  opacity: .5;
  letter-spacing: .04em;
  margin-left: 1px;
}
.we-rate[data-idle="1"] {
  display: none;
}
.we-rate[data-generating="1"] .we-rate__num {
  animation: we-rate-pulse 2s ease-in-out infinite;
}
@keyframes we-rate-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .72; }
}

/* ── policy chip: collapsed ghost button, expandable read-only body ────── */

.we-policy {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  flex: 0 0 auto;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  border-radius: 999px;
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(121, 126, 145, .24));
  color: inherit;
  opacity: .66;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .05em;
  transition: opacity .2s ease, border-color .2s ease, background .2s ease, box-shadow .2s ease;
}
.we-policy__chip {
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  cursor: inherit;
  -webkit-tap-highlight-color: transparent;
}
.we-policy__chip:disabled {
  cursor: default;
}
.we-policy__chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--dsw-static-blue-400, #5d83ff);
}
.we-policy__dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: currentColor;
  opacity: .55;
}
.we-policy:not([data-open="1"]):hover {
  opacity: 1;
  border-color: var(--dsw-alias-border-l1, rgba(121, 126, 145, .36));
}
.we-policy[data-open="1"] {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  height: auto;
  padding: 0;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  opacity: 1;
  white-space: normal;
}
.we-policy[data-open="1"] .we-policy__chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(121, 126, 145, .24));
  background: transparent;
  opacity: .92;
}
.we-policy__body {
  margin: 0;
  padding: 0 10px;
  max-height: 0;
  opacity: 0;
  overflow: hidden auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  line-height: 1.62;
  letter-spacing: .005em;
  color: inherit;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--dsw-alias-fill-tertiary, rgba(120, 125, 140, .08));
  border-radius: 10px;
  transition: max-height .34s cubic-bezier(.22, 1, .36, 1), opacity .22s ease, padding .28s ease;
}
.we-policy[data-open="1"] .we-policy__body {
  max-height: 148px;
  opacity: 1;
  padding: 8px 10px;
  box-shadow: 0 0 0 1px var(--dsw-alias-border-l2, rgba(121, 126, 145, .2)) inset;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 9px, #000 calc(100% - 9px), transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0, #000 9px, #000 calc(100% - 9px), transparent 100%);
}
.we-policy__body::-webkit-scrollbar {
  width: 6px;
}
.we-policy__body::-webkit-scrollbar-thumb {
  background: rgba(120, 125, 140, .30);
  border-radius: 99px;
}
.we-policy__body::-webkit-scrollbar-track {
  background: transparent;
}

/* ── reduced motion: keep the static look, remove every animation ──────── */

@media (prefers-reduced-motion: reduce) {
  .we-fill,
  .we-fill::after,
  .we-glow,
  .we-layer,
  .we-knob-aura,
  .we-core__glow,
  .we-core__tint,
  .we-core::after,
  .we-rate,
  .we-rate__num {
    animation: none;
    transition: none;
  }
  .we-layer[data-we-dragging="1"] .we-fluid {
    filter: none;
  }
  .we-core__glow { opacity: .74; }
  .we-core__tint { opacity: .30; }
  .we-core__ember { opacity: .16; }
  .we-layer[data-we-ultra="1"] {
    animation: none;
    box-shadow:
      0 0 calc(12px + 26px * var(--we-rate, 0)) rgba(186, 214, 255, .42),
      0 0 12px rgba(255, 255, 255, .34) inset,
      0 0 0 1px rgba(150, 180, 255, .32) inset;
  }
  .we-layer[data-we-ultra="1"]::after {
    opacity: 0;
  }
  .we-layer[data-we-ultra="1"] .we-knob-aura {
    animation: none;
    filter: none;
  }
  .we-bolt[data-on="1"] {
    animation: none;
  }
  .we-bolt[data-on="1"] .we-bolt__svg {
    animation: none;
  }
  .we-bolt__glowline {
    animation: none;
    opacity: .55;
  }
  .we-layer[data-we-skin="chrome"] .we-knob-aura::before {
    animation: none;
  }
}
`
