/**
 * The panel stylesheet, as a string.
 *
 * Injected inside a `ctx.effect` so it is added on activation and removed on
 * unload, which keeps uninstalling the plugin complete.
 *
 * Two deliberate constraints:
 *  - every colour is a `--dsw-*` theme token, so the panel follows light/dark
 *    and any future re-theme without a single hard-coded value;
 *  - the glow animates only `opacity` and `transform`, so a list full of
 *    pulsing cards costs no layout and no paint.
 */

/** Style element id, also used to clean up a previous instance. */
export const STYLE_ID = 'dsh-session-board-style'

/** Accent variable sets shared by cards, rails and dots. */
const ACCENTS = `
/* The three groups own the three colours the panel is built around, taken from
   the theme's own five-token state family (business / warn / error / success /
   idle) rather than from the brand colour: DSH's brand primary is an ink tone
   (near-black in light, near-white in dark), which reads as "dark", not as a
   distinct status colour.

   Each card derives TWO surfaces from the one accent variable — a breathing
   glow and a tint of its own background — so state reads even where a glow is
   clipped by a neighbouring card.

   --sb-tint is the share of the accent mixed into the card surface; it stays
   well under 15% so text contrast survives in both themes, and it is mixed
   against the theme's own layer colour rather than a literal.
   The fallback chain keeps a card coloured if a future theme drops the token. */
.sb-card[data-state="running"]  { --sb-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-button-info-fill, var(--dsw-alias-brand-primary))); --sb-glow: .72; --sb-breathe: 2.4s; --sb-tint: 10%; --sb-aura: var(--dsw-alias-state-business-primary); }
.sb-card[data-state="blocked"]  { --sb-accent: var(--dsw-alias-state-warn-primary);   --sb-glow: .92; --sb-breathe: 1.25s; --sb-tint: 14%; --sb-aura: var(--dsw-alias-state-error-primary); }
.sb-card[data-state="error"]    { --sb-accent: var(--dsw-alias-state-error-primary);  --sb-glow: .90; --sb-breathe: 1.25s; --sb-tint: 14%; --sb-aura: var(--dsw-alias-state-warn-primary); }
.sb-card[data-state="unread"]   { --sb-accent: var(--dsw-alias-state-warn-primary);   --sb-glow: .72; --sb-breathe: 2.2s; --sb-tint: 10%; --sb-aura: var(--dsw-alias-state-success-primary); }
.sb-card[data-state="done"]     { --sb-accent: var(--dsw-alias-state-success-primary);--sb-glow: .42; --sb-breathe: 0s;   --sb-tint: 6%; --sb-aura: var(--dsw-alias-state-business-primary); }
`

/** The full stylesheet. */
export const STYLESHEET = `
.sb-root {
  box-sizing: border-box;
  --sb-radius: 14px;
  --sb-gap: 10px;
  --sb-card-pad: 11px;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.45;
}
.sb-root *, .sb-root *::before, .sb-root *::after { box-sizing: border-box; }

/* ---------------------------------------------------------------- dock --- */

/* The host is a grid item of the shell frame: its track is injected by the
   dock adapter, so the element itself only needs to pass that box down and
   never claim more room than the track gives it. */
[data-dsh-session-board-host] {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

/* The docked column is a real flex sibling of the conversation, so it takes
   space instead of covering the chat. Fixed basis: the panel never grows. */
.sb-dock {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 72%, var(--dsw-alias-state-business-primary));
  background:
    radial-gradient(120% 70% at 0% 0%, color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, transparent), transparent 65%),
    var(--dsw-alias-bg-layer-1);
  contain: layout style;
}
.sb-dock[data-collapsed="true"] {
  cursor: pointer;
}
.sb-dock[data-dragging="true"] { transition: none; }

/* Vertical label shown while collapsed. */
.sb-rail {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  height: 100%;
  writing-mode: vertical-rl;
  color: var(--dsw-alias-label-secondary);
  user-select: none;
}
.sb-dock[data-collapsed="true"] .sb-rail { display: flex; }
.sb-dock[data-collapsed="true"] .sb-dock-body { display: none; }

.sb-dock-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
}

/* The resize grab strip straddles the column's right edge. */
.sb-resize {
  position: absolute;
  top: 0;
  right: -3px;
  bottom: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 3;
}
.sb-resize::after {
  content: "";
  position: absolute;
  inset: 0 2px;
  background: transparent;
  transition: background var(--ds-transition-duration-fast, 120ms) var(--ds-ease-in-out, ease);
}
.sb-resize:hover::after, .sb-dock[data-dragging="true"] .sb-resize::after {
  background: var(--dsw-alias-brand-primary);
}

/* --------------------------------------------------------------- chrome --- */

.sb-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  flex: 0 0 auto;
}
.sb-title {
  font-weight: 600;
  font-size: 12px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-count {
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.sb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
}
.sb-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.sb-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-btn[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }

.sb-offline {
  padding: 4px 10px;
  color: var(--dsw-alias-state-warn-primary);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  font-size: 11px;
}

/* --------------------------------------------------------------- scroll --- */

.sb-scroll {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 8px;
}
.sb-scroll::-webkit-scrollbar { width: 8px; }
.sb-scroll::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2);
  border-radius: 4px;
}

.sb-top {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 4;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 2px 10px var(--dsw-alias-bg-mask-2, rgba(0,0,0,.18));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* --------------------------------------------------------------- groups --- */

.sb-group + .sb-group { margin-top: 10px; }
.sb-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 2px;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-weight: 600;
  text-transform: none;
  cursor: pointer;
  text-align: left;
}
.sb-group-head:hover { color: var(--dsw-alias-label-primary); }
.sb-group-head:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-group-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--sb-group-accent, var(--dsw-alias-border-l2));
  flex: 0 0 auto;
}
.sb-group[data-group="attention"] .sb-group-head { --sb-group-accent: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-label-primary); }
.sb-group[data-group="running"]   .sb-group-head { --sb-group-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.sb-group[data-group="done"]      .sb-group-head { --sb-group-accent: var(--dsw-alias-state-success-primary); }
.sb-group-chevron { transition: transform var(--ds-transition-duration-fast, 120ms) var(--ds-ease-in-out, ease); }
.sb-group[data-open="false"] .sb-group-chevron { transform: rotate(-90deg); }
.sb-group[data-open="false"] .sb-group-body { display: none; }
.sb-group-count { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }

.sb-empty {
  padding: 10px 4px;
  color: var(--dsw-alias-label-secondary);
}

/* ---------------------------------------------------------------- cards --- */

.sb-list { display: flex; flex-direction: column; gap: var(--sb-gap); margin: 0; padding: 0; list-style: none; }

.sb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 236px;
  min-height: 236px;
  max-height: 236px;
  flex: 0 0 236px;
  padding: var(--sb-card-pad);
  isolation: isolate;
  overflow: visible;
  /* Defaults so a card whose state attribute is absent still paints safely. */
  --sb-accent: var(--dsw-alias-state-idle-primary);
  --sb-aura: var(--dsw-alias-state-idle-primary);
  --sb-glow: .24;
  --sb-tint: 4%;
  border: 1px solid color-mix(in srgb, var(--sb-accent) 42%, var(--dsw-alias-border-l1));
  border-radius: var(--sb-radius);
  background:
    linear-gradient(145deg,
      color-mix(in srgb, var(--sb-accent) var(--sb-tint), var(--dsw-alias-bg-layer-2)),
      var(--dsw-alias-bg-layer-2) 58%,
      color-mix(in srgb, var(--sb-aura) 6%, var(--dsw-alias-bg-layer-1)));
  box-shadow:
    0 8px 20px color-mix(in srgb, var(--sb-accent) 10%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  cursor: pointer;
  text-align: left;
  width: 100%;
  font: inherit;
  color: inherit;
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
  contain: layout style;
}
.sb-card::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(90% 75% at 100% 0%, color-mix(in srgb, var(--sb-aura) 12%, transparent), transparent 70%),
    linear-gradient(110deg, transparent 35%, color-mix(in srgb, var(--sb-accent) 5%, transparent), transparent 68%);
  opacity: .9;
}
.sb-card > * { position: relative; z-index: 1; }
.sb-card-content {
  /* Let trackpad scrolling reach the list when this preview cannot scroll further. */
  overscroll-behavior-y: auto;
  scrollbar-gutter: stable;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--sb-accent) 42%, transparent) transparent;
}
.sb-card-content::-webkit-scrollbar { width: 5px; }
.sb-card-content::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--sb-accent) 48%, transparent); border-radius: 5px; }
.sb-card-select {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--sb-accent) 48%, var(--dsw-alias-border-l2));
  border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 78%, transparent);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sb-card-select span { width: 8px; height: 8px; border-radius: 3px; border: 1px solid var(--sb-accent); }
.sb-card-select:hover { background: color-mix(in srgb, var(--sb-accent) 18%, var(--dsw-alias-bg-layer-2)); }
.sb-card[data-selected="true"] { border-color: var(--sb-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--sb-accent) 28%, transparent), 0 10px 30px color-mix(in srgb, var(--sb-aura) 22%, transparent); }
.sb-card[data-selected="true"] .sb-card-select { background: var(--sb-accent); border-color: var(--sb-accent); }
.sb-card[data-selected="true"] .sb-card-select span { border-color: var(--dsw-alias-bg-layer-2); background: var(--dsw-alias-bg-layer-2); }

.sb-card:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--sb-accent) 68%, var(--dsw-alias-border-l1));
  box-shadow:
    0 12px 28px color-mix(in srgb, var(--sb-accent) 17%, transparent),
    0 0 0 1px color-mix(in srgb, var(--sb-aura) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
}
.sb-card:focus-visible { outline: 2px solid var(--sb-accent); outline-offset: 2px; }

/* The halo: its own compositor layer, animated on opacity/transform only. */
.sb-card__halo {
  position: absolute;
  z-index: 0;
  inset: -2px;
  padding: 3px;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  border-radius: inherit;
  pointer-events: none;
  opacity: var(--sb-glow);
  will-change: opacity, transform;
  background: linear-gradient(125deg, var(--sb-accent), var(--sb-aura), var(--sb-accent));
  background-size: 220% 220%;
  filter: blur(9px) saturate(1.35);
  animation: none;
}
.sb-card__halo::after {
  content: "";
  position: absolute;
  inset: 2px;
  border-radius: inherit;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--sb-accent) 72%, transparent),
    0 0 20px 3px color-mix(in srgb, var(--sb-accent) 58%, transparent),
    0 0 34px 4px color-mix(in srgb, var(--sb-aura) 28%, transparent);
}
.sb-card[data-state="running"] .sb-card__halo,
.sb-card[data-state="blocked"] .sb-card__halo,
.sb-card[data-state="error"] .sb-card__halo,
.sb-card[data-state="unread"] .sb-card__halo {
  animation: sb-breathe var(--sb-breathe) var(--ds-ease-in-out, ease-in-out) infinite;
}
.sb-card[data-state="done"] .sb-card__halo { opacity: .42; filter: blur(7px) saturate(1.1); animation: none; }
.sb-card[data-current="true"] .sb-card__halo { opacity: calc(var(--sb-glow) + .08); }

/* Pause every animation while the user drags the divider or the page is
   hidden: the gesture owns the frame budget. */
.sb-root[data-quiet="true"] .sb-card__halo,
.sb-dock[data-dragging="true"] .sb-card__halo,
.sb-overlay[data-quiet="true"] .sb-card__halo { animation-play-state: paused; }

@keyframes sb-breathe {
  0%, 100% { opacity: calc(var(--sb-glow) * .46); transform: scale(.994); }
  50%      { opacity: var(--sb-glow);            transform: scale(1.012); }
}
@keyframes sb-spectrum {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

/* Current session: a left bar plus a slightly stronger border. */
.sb-card[data-current="true"] {
  /* The current session sits on the raised layer, but it keeps its state tint:
     the tint is re-mixed onto layer-3 rather than replaced, so a highlighted
     card still shows whether it is running, waiting or done. */
  border-color: color-mix(in srgb, var(--sb-accent) 45%, var(--dsw-alias-border-l2));
  background-color: color-mix(in srgb, var(--sb-accent) var(--sb-tint), var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2)));
}
.sb-card[data-current="true"]::before {
  content: "";
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  z-index: 2;
  background: linear-gradient(180deg, var(--sb-accent), var(--sb-aura));
  box-shadow: 0 0 12px color-mix(in srgb, var(--sb-accent) 70%, transparent);
}

.sb-card-head { display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding-right: 28px; position: relative; min-height: 38px; }
.sb-card-title {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
  letter-spacing: -.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-card-where {
  flex: 0 0 auto;
  max-width: 100%;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Pills ------------------------------------------------------------------ */

.sb-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 7px;
  height: 19px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .01em;
  color: var(--sb-accent, var(--dsw-alias-label-secondary));
  border: 1px solid color-mix(in srgb, var(--sb-accent, var(--dsw-alias-border-l2)) 45%, transparent);
  background: color-mix(in srgb, var(--sb-accent, var(--dsw-alias-bg-layer-1)) 12%, transparent);
  white-space: nowrap;
}
.sb-card[data-state="done"] .sb-pill--state { display: none; }
.sb-pill-row { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; position: relative; min-height: 19px; }

/* The attention dot: a small filled circle that breathes with the halo. */
.sb-state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sb-accent);
  flex: 0 0 auto;
}

/* Text lines ------------------------------------------------------------- */

.sb-line {
  position: relative;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
}
.sb-line--instruction { color: var(--dsw-alias-label-primary); }
.sb-line-label {
  color: var(--dsw-alias-label-secondary);
  opacity: .8;
  margin-right: 3px;
}
.sb-line--error { color: var(--dsw-alias-state-error-primary); }

/* Metrics ---------------------------------------------------------------- */

.sb-metrics {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  padding-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--sb-accent) 20%, transparent);
}
.sb-metric { white-space: nowrap; }
.sb-metric--strong { color: var(--dsw-alias-label-primary); }

.sb-progress {
  position: relative;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--sb-accent) 12%, var(--dsw-alias-bg-layer-1));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sb-accent) 16%, transparent);
  overflow: hidden;
}
.sb-progress-fill {
  height: 100%;
  width: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--sb-accent), var(--sb-aura));
  box-shadow: 0 0 10px color-mix(in srgb, var(--sb-accent) 70%, transparent);
  transition: width var(--ds-transition-duration, 200ms) linear;
}
.sb-card[data-state="done"] .sb-progress { display: none; }

.sb-ack {
  align-self: flex-start;
  padding: 1px 7px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.sb-ack:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }

.sb-batchbar {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 5px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 24%, var(--dsw-alias-border-l1));
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  font-size: 11px;
}
.sb-batchbar__action, .sb-batchbar__clear {
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 42%, var(--dsw-alias-border-l1));
  border-radius: 7px;
  padding: 3px 8px;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
}
.sb-batchbar__action:hover { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent); }
.sb-batchbar__clear { margin-left: auto; background: transparent; border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }

/* -------------------------------------------------------------- overlay --- */

/* Portalled to <body> so the macOS window-drag region is subtracted wholesale
   rather than being eaten by an in-#root full-window surface. */
.sb-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  /* The portal spans the window, so explicitly restore Electron's draggable
     title-bar surface while keeping cards and controls interactive. */
  -webkit-app-region: no-drag;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 88%, transparent);
  backdrop-filter: blur(6px);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.sb-overlay-head {
  display: flex;
  align-items: center;
  /* A portal outside #root otherwise covers the native drag region. */
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  flex: 0 0 auto;
}
.sb-overlay-head button, .sb-overlay-head input { -webkit-app-region: no-drag; }
html[data-platform='darwin'] .sb-overlay-head { -webkit-app-region: drag; padding-left: 90px; min-height: 52px; }
html[data-platform='darwin'] .sb-overlay-title { -webkit-app-region: drag; }
.sb-overlay-head { padding-top: max(12px, var(--dsh-frame-chrome-top, 0px)); }
.sb-overlay-title { font-size: 14px; font-weight: 600; flex: 1 1 auto; }
.sb-overlay-body {
  display: flex;
  position: relative;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0;
  overflow: hidden;
}
.sb-overlay .sb-group-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--sb-gap);
  align-items: start;
}
/* The list is only a grouping wrapper; display:contents lets its items be
   the grid's own cells. Leaving it as a second grid would nest one column
   inside the first cell and defeat the auto-fill. */
.sb-overlay .sb-list { display: contents; }
.sb-overlay .sb-line { -webkit-line-clamp: 3; }

/* Compact density: one card line less, tighter metrics. */
.sb-root[data-density="compact"] .sb-card { height: 212px; min-height: 212px; max-height: 212px; flex-basis: 212px; padding: 9px; gap: 6px; }
.sb-root[data-density="compact"] .sb-line { -webkit-line-clamp: 1; }
.sb-root[data-density="compact"] .sb-metrics { font-size: 10px; gap: 2px 6px; }
.sb-root[data-density="compact"] .sb-card__halo::after { box-shadow: 0 0 0 1px color-mix(in srgb, var(--sb-accent) 72%, transparent), 0 0 16px 2px color-mix(in srgb, var(--sb-accent) 55%, transparent), 0 0 26px 3px color-mix(in srgb, var(--sb-aura) 26%, transparent); }
.sb-overlay.sb-root[data-density="compact"] .sb-line { -webkit-line-clamp: 2; }


/* Stable card interaction states and accessible fixed footer. */
.sb-card-select:checked {
  background: var(--sb-accent);
  border-color: var(--sb-accent);
  box-shadow: inset 0 0 0 4px var(--dsw-alias-bg-layer-2);
}
.sb-card-select:disabled { opacity: .45; cursor: not-allowed; }
.sb-card-select:focus-visible, .sb-ack:focus-visible, .sb-card-title:focus-visible,
.sb-card-content:focus-visible, .sb-resize:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px;
}
.sb-card-content .sb-line { display: block; -webkit-line-clamp: unset; flex-shrink: 0; }
.sb-card-title { font-weight: 700; font-size: 13px; }
.sb-card-footer { flex-shrink: 0; display: flex; flex-direction: column; gap: 5px; }
.sb-card-footer .sb-metrics { margin: 0; }
.sb-card-footer .sb-ack { align-self: flex-end; }
.sb-batch { flex: 0 0 auto; min-width: 0; }
.sb-batchbar { flex-wrap: wrap; }
.sb-batch-preview { margin: 8px; padding: 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); }
.sb-batch-preview p { margin: 6px 0; font-size: 11px; }
.sb-batch-preview ul { margin: 6px 0; padding-left: 18px; max-height: 120px; overflow: auto; }
.sb-batch-status:not(:empty), .sb-batch-error { padding: 6px 10px; font-size: 11px; }
.sb-batch-result { margin: 0 0 8px; }
.sb-batch-result-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 0 10px; }
.sb-batch-result-count { font-size: 11px; }
.sb-batch-dismiss { flex: 0 0 auto; width: 22px; height: 22px; padding: 0; border-radius: 6px; font-size: 14px; line-height: 1; }
.sb-batch-dismiss:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.sb-batch-error { color: var(--dsw-alias-state-error-primary); }
.sb-batch button:disabled { opacity: .45; cursor: not-allowed; }
.sb-overlay > .sb-batch .sb-batch-preview { max-width: 640px; }
.sb-overlay .sb-group-body { display: block; }
.sb-overlay .sb-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 12px; }
.sb-list > li { min-width: 0; }
@media (prefers-reduced-motion: reduce) { .sb-card { transition: none; } .sb-card:hover { transform: none; } }

/* On narrow frames retain a usable board opener instead of squeezed cards. */
.sb-auto-rail { display: none; }
[data-dock-fit="rail"] .sb-dock[data-collapsed="false"] .sb-dock-body,
[data-dock-fit="rail"] .sb-dock[data-collapsed="false"] .sb-resize { display: none; }
[data-dock-fit="rail"] .sb-auto-rail {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  width: 100%; height: 100%; padding: 14px 0; border: 0; background: transparent;
  color: var(--dsw-alias-label-secondary); writing-mode: vertical-rl; cursor: pointer;
}
.sb-overlay-dragspace { display: none; }
.sb-overlay-head .sb-overlay-nodrag { -webkit-app-region: no-drag; }
html[data-platform='darwin'] .sb-overlay-head { padding-left: 16px; }
html[data-platform='darwin'] .sb-overlay-dragspace { display: block; flex: none; width: 64px; }
.sb-overlay-body > .sb-scroll { padding: 16px 20px 40px; }
.sb-batch-source { display: block; font-size: 10px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.sb-batchbar__count { font-variant-numeric: tabular-nums; margin-right: auto; }
.sb-job-preview { margin-bottom: 5px; }
.sb-job-row { padding: 4px 6px; border-radius: 6px; background: color-mix(in srgb, var(--sb-accent) 7%, var(--dsw-alias-bg-layer-1)); font-size: 11px; overflow-wrap: anywhere; margin-top: 3px; }
/* Search and filters share the available width in either surface. */
.sb-filters { padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex: none; }
.sb-filter-search, .sb-filter-row select { font: inherit; color: inherit; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 6px 8px; min-width: 0; }
.sb-filter-search { width: 100%; }
.sb-filter-row { display: flex; gap: 6px; margin-top: 6px; }
.sb-filter-row select { flex: 1 1 0; width: 0; }
.sb-filter-count { display: block; margin-top: 5px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.sb-filters input:focus-visible, .sb-filters select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-overlay .sb-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding: 10px 20px; }
.sb-overlay .sb-filter-search { flex: 1 1 240px; max-width: 480px; }
.sb-overlay .sb-filter-row { flex: 1 1 300px; max-width: 560px; margin: 0; }
.sb-overlay .sb-filter-count { margin: 0; }
/* A summary card has no inner scrollbar; detail remains an explicit action. */
.sb-root .sb-card[data-expanded="false"] { height: 194px; min-height: 194px; max-height: 194px; }
.sb-root[data-density="compact"] .sb-card[data-expanded="false"] { height: 176px; min-height: 176px; max-height: 176px; flex-basis: 176px; }
.sb-root .sb-card[data-expanded="false"] .sb-card-content { overflow: clip; }
.sb-root .sb-card[data-expanded="false"] .sb-card-content .sb-line { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.sb-root .sb-card[data-expanded="true"] { height: 320px; min-height: 320px; max-height: 320px; flex-basis: 320px; }
.sb-card-details { align-self: flex-start; font-size: 11px; }
.sb-workspace-node { min-width: 0; margin-bottom: 8px; }
.sb-workspace-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-workspace-body { padding-left: 8px; border-left: 1px solid var(--dsw-alias-border-l1); margin-left: 4px; }
.sb-workspace-body > .sb-group { margin-top: 4px; }
.sb-workspace-node > .sb-group-head { width: 100%; }
.sb-pill--archived { color: var(--dsw-alias-state-success-primary); }
/* A session with no turns at all: placeholder, never summary typography. */
.sb-line--empty {
  display: flex; align-items: center; gap: 6px;
  color: var(--dsw-alias-label-secondary);
  font-style: italic;
  opacity: .72;
  padding: 2px 0;
}
.sb-line--empty::before {
  content: "";
  width: 6px; height: 6px; flex: none;
  border-radius: 50%;
  border: 1px dashed var(--dsw-alias-label-secondary);
}
${ACCENTS}

@media (prefers-reduced-motion: reduce) {
  .sb-card__halo { animation: none !important; }
  .sb-progress-fill { transition: none; }
  .sb-scroll { scroll-behavior: auto; }
}

/* ------------------------------------------------------------ settings --- */

/* The settings page renders in the shell's own settings content column; it
   borrows the panel's typography and theme tokens, and never paints a surface
   of its own. */
.sb-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 2px 0 8px;
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.5;
}
.sb-settings-title { margin: 0; font-size: 13px; font-weight: 600; }
.sb-settings-hint { margin: 0; color: var(--dsw-alias-label-secondary); }
.sb-settings-row { display: flex; flex-direction: column; gap: 6px; max-width: 480px; }
.sb-settings-label { font-weight: 500; }
.sb-settings-select {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: inherit;
  font: inherit;
}
.sb-settings-select:disabled { opacity: .6; }
.sb-settings-select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-settings-meta { display: flex; align-items: center; gap: 8px; min-height: 18px; }
.sb-settings-saved { color: var(--dsw-alias-state-success-primary); }
.sb-settings-error { color: var(--dsw-alias-state-error-primary); }
.sb-settings-note { color: var(--dsw-alias-label-secondary); }
.sb-settings-retry {
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sb-settings-retry:hover { background: var(--dsw-alias-bg-layer-2, transparent); }
`
