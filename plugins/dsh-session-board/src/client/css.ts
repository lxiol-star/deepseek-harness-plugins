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

import { MANAGER_STYLESHEET } from './manager/manager-css.ts'

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
   well under 10% so text contrast survives in both themes, and it is mixed
   against a token-derived surface rather than a literal.
   The fallback chain keeps a card coloured if a future theme drops the token.

   --sb-glow is the halo budget: the stylesheet scales it down to a faint
   pulse, so a wall of cards reads as quiet status rather than a light show. */
.sb-card[data-state="running"]   { --sb-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-button-info-fill, var(--dsw-alias-brand-primary))); --sb-glow: .58; --sb-breathe: 2.6s; --sb-tint: 5%; --sb-aura: var(--dsw-alias-state-business-primary); }
.sb-card[data-state="blocked"]   { --sb-accent: var(--dsw-alias-state-warn-primary); --sb-glow: .74; --sb-breathe: 1.4s; --sb-tint: 7%; --sb-aura: var(--dsw-alias-state-warn-primary); }
.sb-card[data-state="error"]     { --sb-accent: var(--dsw-alias-state-error-primary); --sb-glow: .72; --sb-breathe: 1.4s; --sb-tint: 7%; --sb-aura: var(--dsw-alias-state-error-primary); }
.sb-card[data-state="unread"]    { --sb-accent: var(--dsw-alias-state-warn-primary); --sb-glow: .56; --sb-breathe: 2.4s; --sb-tint: 5%; --sb-aura: var(--dsw-alias-state-warn-primary); }
.sb-card[data-state="done"]      { --sb-accent: var(--dsw-alias-state-success-primary); --sb-glow: .30; --sb-breathe: 0s; --sb-tint: 3%; --sb-aura: var(--dsw-alias-state-success-primary); }
`

/** The full stylesheet. */
export const STYLESHEET = `
.sb-root {
  box-sizing: border-box;
  --sb-radius: 12px;
  --sb-gap: 12px;
  --sb-card-pad: 12px;
  /* One step above the base surface, derived from the theme's own ink and
     surface tokens: light and dark both get a quiet raised plane without a
     literal colour. Layer tokens alone collapse to white in the light theme,
     so the mix is what makes the hierarchy readable in both modes. */
  --sb-surface-1: color-mix(in srgb, var(--dsw-alias-label-primary) 3%, var(--dsw-alias-bg-base));
  --sb-surface-2: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, var(--dsw-alias-bg-base));
  --sb-hover: var(--dsw-alias-interactive-bg-hover, color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent));
  --sb-focus-ring: var(--dsw-alias-brand-primary);
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
  border-right: 1px solid var(--dsw-alias-border-l1);
  background: var(--sb-surface-1);
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

/* The header row is also the dock's window-drag surface: it carries the
   shell's data-window-drag mark, which ui-web base.css turns into the one
   darwin drag rule, and repeats the declaration here so the row does not rely
   on that sheet. The width gesture stays on the right edge strip below. */
.sb-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--sb-surface-2);
  flex: 0 0 auto;
  user-select: none;
}
/* macOS desktop only: make the header a native window-drag row. Controls
   subtract their own boxes so opening the board, switching density and
   collapsing the panel stay clickable. */
html[data-platform='darwin'] .sb-head { -webkit-app-region: drag; }
html[data-platform='darwin'] .sb-head :is(button, input, select, a, [role="button"]) {
  -webkit-app-region: no-drag;
}
/* The edge strip spans the column top to bottom, so its 3px overlap with the
   header row must stay a width handle instead of becoming window drag. */
html[data-platform='darwin'] .sb-resize { -webkit-app-region: no-drag; }
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
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sb-head .sb-count, .sb-overlay-head .sb-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent);
}
.sb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 26px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
}
.sb-btn:hover { background: var(--sb-hover); color: var(--dsw-alias-label-primary); }
.sb-btn:focus-visible { outline: 2px solid var(--sb-focus-ring); outline-offset: 1px; }
.sb-btn:disabled { opacity: .45; cursor: not-allowed; }
.sb-btn[aria-pressed="true"] { background: var(--sb-surface-2); border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-primary); }

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
  padding: 10px;
}
.sb-scroll::-webkit-scrollbar { width: 8px; }
.sb-scroll::-webkit-scrollbar-thumb {
  background: var(--dsw-alias-border-l2);
  border-radius: 4px;
}

.sb-top {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 4;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-overlay, var(--sb-surface-2));
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* --------------------------------------------------------------- groups --- */

.sb-group + .sb-group { margin-top: 14px; }
.sb-group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 26px;
  padding: 3px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: none;
  cursor: pointer;
  text-align: left;
  transition: background-color 120ms ease, color 120ms ease;
}
.sb-group-head:hover { background: var(--sb-hover); color: var(--dsw-alias-label-primary); }
.sb-group-head:focus-visible { outline: 2px solid var(--sb-focus-ring); outline-offset: 1px; }
.sb-group-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sb-group-accent, var(--dsw-alias-label-tertiary));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sb-group-accent, var(--dsw-alias-label-tertiary)) 22%, transparent);
  flex: 0 0 auto;
}
.sb-group[data-group="attention"] .sb-group-head { --sb-group-accent: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-label-primary); }
.sb-group[data-group="running"]   .sb-group-head { --sb-group-accent: var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary)); }
.sb-group[data-group="done"]      .sb-group-head { --sb-group-accent: var(--dsw-alias-state-success-primary); }
.sb-group-chevron { flex: 0 0 auto; opacity: .65; transition: transform 120ms ease; }
.sb-group[data-open="false"] .sb-group-chevron { transform: rotate(-90deg); }
.sb-group[data-open="false"] .sb-group-body { display: none; }
.sb-group-count {
  margin-left: auto;
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.sb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 200px;
  margin: 4px;
  padding: 28px 20px;
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: 14px;
  color: var(--dsw-alias-label-secondary);
  text-align: center;
}
.sb-empty-glyph { display: inline-flex; color: var(--dsw-alias-label-tertiary); opacity: .85; }
.sb-empty-text { font-size: 12px; line-height: 1.5; max-width: 40ch; }

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
  --sb-tint: 3%;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--sb-radius);
  background: linear-gradient(180deg,
      color-mix(in srgb, var(--sb-accent) var(--sb-tint), var(--sb-surface-1)),
      var(--sb-surface-1) 64%);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
  cursor: pointer;
  text-align: left;
  width: 100%;
  font: inherit;
  color: inherit;
  transition: background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
  contain: layout style;
}
/* A slim state rail instead of a coloured border ring: the tint and the dot
   carry the state, the card outline stays neutral in both themes. */
.sb-card::before {
  content: "";
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 2px;
  border-radius: 0 2px 2px 0;
  z-index: 2;
  pointer-events: none;
  background: color-mix(in srgb, var(--sb-accent) 62%, transparent);
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
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--sb-surface-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.sb-card-select span { width: 8px; height: 8px; border-radius: 3px; border: 1px solid var(--dsw-alias-label-tertiary); }
.sb-card-select:hover { border-color: var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-2); }
/* Selection is an interaction state, not a session state: it uses the
   business accent so an amber "waiting" card and a selected card never read
   as the same thing. */
.sb-card[data-selected="true"] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-border-l2)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 20%, transparent), 0 2px 8px color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
.sb-card[data-selected="true"] .sb-card-select { background: var(--dsw-alias-state-business-primary); border-color: var(--dsw-alias-state-business-primary); }
.sb-card[data-selected="true"] .sb-card-select span { border-color: var(--dsw-alias-label-primary-inverted); background: var(--dsw-alias-label-primary-inverted); }

.sb-card:hover {
  transform: translateY(-1px);
  border-color: var(--dsw-alias-border-l3);
  background: linear-gradient(180deg,
      color-mix(in srgb, var(--sb-accent) calc(var(--sb-tint) + 2%), var(--sb-surface-2)),
      var(--sb-surface-2) 64%);
  box-shadow:
    0 6px 16px color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.sb-card:focus-visible { outline: 2px solid var(--sb-focus-ring); outline-offset: 2px; }

/* The halo: its own compositor layer, animated on opacity/transform only. */
.sb-card__halo {
  position: absolute;
  z-index: 0;
  inset: -1px;
  padding: 1px;
  -webkit-mask: linear-gradient(var(--dsw-alias-bg-base) 0 0) content-box, linear-gradient(var(--dsw-alias-bg-base) 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  border-radius: inherit;
  pointer-events: none;
  opacity: calc(var(--sb-glow) * .32);
  will-change: opacity;
  background: var(--sb-accent);
  filter: blur(8px);
  animation: none;
}

.sb-card[data-state="running"] .sb-card__halo,
.sb-card[data-state="blocked"] .sb-card__halo,
.sb-card[data-state="error"] .sb-card__halo,
.sb-card[data-state="unread"] .sb-card__halo {
  animation: sb-breathe var(--sb-breathe) var(--ds-ease-in-out, ease-in-out) infinite;
}
.sb-card[data-state="done"] .sb-card__halo { opacity: calc(var(--sb-glow) * .18); filter: blur(6px); animation: none; }
.sb-card[data-current="true"] .sb-card__halo { opacity: calc(var(--sb-glow) * .42); }

/* Pause every animation while the user drags the divider or the page is
   hidden: the gesture owns the frame budget. */
.sb-root[data-quiet="true"] .sb-card__halo,
.sb-dock[data-dragging="true"] .sb-card__halo,
.sb-overlay[data-quiet="true"] .sb-card__halo { animation-play-state: paused; }

@keyframes sb-breathe {
  0%, 100% { opacity: calc(var(--sb-glow) * .14); }
  50%      { opacity: calc(var(--sb-glow) * .32); }
}


/* Current session: a left bar plus a slightly stronger border. */
.sb-card[data-current="true"] {
  /* The current session keeps its state tint but sits a step above the
     resting surface, with a stronger rail. */
  border-color: color-mix(in srgb, var(--sb-accent) 34%, var(--dsw-alias-border-l2));
  background: linear-gradient(180deg,
      color-mix(in srgb, var(--sb-accent) var(--sb-tint), var(--sb-surface-2)),
      var(--sb-surface-2) 64%);
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
  background: var(--sb-accent);
}

.sb-card-head { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 2px; padding: 0 28px 0 14px; min-height: 38px; }
.sb-card-head .sb-state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sb-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--sb-accent) 20%, transparent);
  flex: 0 0 auto;
}
.sb-card-title {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sb-card-where {
  flex: 0 0 auto;
  max-width: 100%;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Pills ------------------------------------------------------------------ */

.sb-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  height: 18px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  border: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
  white-space: nowrap;
}
.sb-pill--state {
  color: var(--sb-accent);
  border-color: color-mix(in srgb, var(--sb-accent) 30%, transparent);
  background: color-mix(in srgb, var(--sb-accent) 8%, transparent);
}
.sb-card[data-state="done"] .sb-pill--state { display: none; }
.sb-pill-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; position: relative; min-height: 18px; }

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
  gap: 4px 10px;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  padding-top: 6px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.sb-metric { white-space: nowrap; }
.sb-metric--strong { color: var(--dsw-alias-label-primary); font-weight: 500; }

.sb-progress {
  position: relative;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
  overflow: hidden;
}
.sb-progress-fill {
  height: 100%;
  width: 0;
  border-radius: inherit;
  background: var(--sb-accent);
  transition: width var(--ds-transition-duration, 200ms) linear;
}
.sb-card[data-state="done"] .sb-progress { display: none; }

.sb-ack {
  align-self: flex-start;
  padding: 0 8px;
  height: 22px;
  border-radius: 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.sb-ack:hover { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l3); background: var(--sb-hover); }

.sb-batchbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 36px;
  padding: 5px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--sb-surface-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.sb-batchbar__action, .sb-batchbar__clear { margin-left: auto; background: transparent; border-color: var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.sb-batchbar__action:not(:disabled) { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, var(--dsw-alias-border-l2)); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent); color: var(--dsw-alias-label-primary); }
.sb-batchbar__action:not(:disabled):hover { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent); }
.sb-batchbar__action.sb-batchbar__secondary { border-color: var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); }
.sb-batchbar__action.sb-batchbar__secondary:not(:disabled):hover { background: var(--sb-hover); color: var(--dsw-alias-label-primary); }
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
  /* Opaque by design: the board is a page-level surface, so the conversation
     behind it must never read as ghost text through the panel. The blur stays
     as a defensive layer for any future translucent token. */
  background: var(--dsw-alias-bg-base);
  backdrop-filter: blur(18px);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
}
.sb-overlay-head {
  display: flex;
  align-items: center;
  /* A portal outside #root otherwise covers the native drag region. */
  gap: 10px;
  min-height: 54px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--sb-surface-1);
  flex: 0 0 auto;
}
.sb-overlay-head button, .sb-overlay-head input { -webkit-app-region: no-drag; }
html[data-platform='darwin'] .sb-overlay-head { -webkit-app-region: drag; padding-left: 90px; min-height: 52px; }
html[data-platform='darwin'] .sb-overlay-title { font-size: 14px; font-weight: 600; letter-spacing: -.01em; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-overlay-head { padding-top: max(12px, var(--dsh-frame-chrome-top, 0px)); }
.sb-overlay-title { font-size: 14px; font-weight: 600; flex: 1 1 auto; }
.sb-overlay-body {
  display: flex;
  position: relative;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
}

/* The list is only a grouping wrapper; display:contents lets its items be
   the grid's own cells. Leaving it as a second grid would nest one column
   inside the first cell and defeat the auto-fill. */

.sb-overlay .sb-line { -webkit-line-clamp: 3; }

/* Compact density: one card line less, tighter metrics. */
.sb-root[data-density="compact"] .sb-card { height: 212px; min-height: 212px; max-height: 212px; flex-basis: 212px; padding: 9px; gap: 6px; }
.sb-root[data-density="compact"] .sb-line { -webkit-line-clamp: 1; }
.sb-root[data-density="compact"] .sb-metrics { font-size: 10px; gap: 2px 6px; }

.sb-overlay.sb-root[data-density="compact"] .sb-line { -webkit-line-clamp: 2; }


/* Stable card interaction states and accessible fixed footer. */
.sb-card-select:checked {
  background: var(--dsw-alias-state-business-primary);
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: inset 0 0 0 4px var(--sb-surface-2);
}
.sb-card-select:disabled { opacity: .45; cursor: not-allowed; }
.sb-card-select:focus-visible, .sb-ack:focus-visible, .sb-card-title:focus-visible,
.sb-card-content:focus-visible, .sb-resize:focus-visible {
  outline: 2px solid var(--sb-focus-ring);
  outline-offset: 2px;
}
.sb-card-content .sb-line { display: block; -webkit-line-clamp: unset; flex-shrink: 0; }
.sb-card-title { font-weight: 600; font-size: 13px; }
.sb-card-footer { flex-shrink: 0; display: flex; flex-direction: column; gap: 5px; }
.sb-card-footer .sb-metrics { margin: 0; }
.sb-card-footer .sb-ack { align-self: flex-end; }
.sb-batch { flex: 0 0 auto; min-width: 0; }
.sb-batchbar { flex-wrap: wrap; }
.sb-batch-preview { margin: 8px; padding: 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--sb-surface-1); }
.sb-batch-preview p { margin: 6px 0; font-size: 11px; }
.sb-batch-preview ul { margin: 6px 0; padding-left: 18px; max-height: 120px; overflow: auto; }
.sb-batch-status:not(:empty), .sb-batch-error { padding: 6px 10px; font-size: 11px; }
.sb-batch-result { margin: 0 0 8px; }
.sb-batch-result-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 0 10px; }
.sb-batch-result-count { font-size: 11px; }
.sb-batch-dismiss { flex: 0 0 auto; width: 22px; height: 22px; padding: 0; border-radius: 6px; font-size: 14px; line-height: 1; }
.sb-batch-dismiss:hover { background: var(--sb-hover); color: var(--dsw-alias-label-primary); }
.sb-batch-error { color: var(--dsw-alias-state-error-primary); }
.sb-batch-detail { display: block; margin-top: 2px; color: var(--dsw-alias-label-secondary); font-size: 10px; overflow-wrap: anywhere; }
.sb-batch button:disabled { opacity: .45; cursor: not-allowed; }
.sb-overlay > .sb-batch .sb-batch-preview { max-width: 640px; }
.sb-overlay .sb-group-body { display: block; }
.sb-overlay .sb-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: var(--sb-gap); }
.sb-list > li { min-width: 0; }

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
.sb-overlay-body > .sb-scroll { padding: 16px 20px 48px; }
.sb-batch-source { display: block; font-size: 10px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.sb-batchbar__count { margin-right: auto; color: var(--dsw-alias-label-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
.sb-job-preview { margin-bottom: 5px; }
.sb-job-row { padding: 5px 7px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l1); background: var(--sb-surface-1); font-size: 11px; overflow-wrap: anywhere; margin-top: 3px; }
/* ---------------------------------------------------------------- filters --- */

/* Search, filters, grouping and the match count. One row on a board-width
   panel; below ~1020px the controls take their own row instead of squeezing
   every select into an unreadable width. The docked column always uses the
   two-row layout because it is narrow at every window width. */
.sb-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  flex: none;
}
.sb-filter-search {
  order: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  flex: 1 1 200px;
  min-width: 150px;
  max-width: 380px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-tertiary);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.sb-filter-search:hover { border-color: var(--dsw-alias-border-l3); }
.sb-filter-search:focus-within {
  border-color: var(--dsw-alias-brand-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);
  color: var(--dsw-alias-label-secondary);
}
.sb-filter-search-icon { flex: 0 0 auto; }
.sb-filter-search input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  outline: none;
}
.sb-filter-search input::placeholder { color: var(--dsw-alias-label-tertiary); }
.sb-filter-controls {
  order: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.sb-select { position: relative; display: inline-flex; flex: 0 0 auto; }
.sb-select select {
  appearance: none;
  -webkit-appearance: none;
  height: 30px;
  max-width: 100%;
  padding: 0 26px 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease;
}
.sb-select select:hover { border-color: var(--dsw-alias-border-l3); background: var(--sb-surface-1); }
.sb-select select:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-select--workspace select { width: 200px; text-overflow: ellipsis; }
.sb-select-chevron {
  position: absolute;
  right: 10px;
  top: 50%;
  width: 6px;
  height: 6px;
  border-right: 1.5px solid var(--dsw-alias-label-tertiary);
  border-bottom: 1.5px solid var(--dsw-alias-label-tertiary);
  transform: translateY(-70%) rotate(45deg);
  pointer-events: none;
}
.sb-filter-toggle,
.sb-filter-clear {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.sb-filter-toggle:hover,
.sb-filter-clear:hover { background: var(--sb-hover); color: var(--dsw-alias-label-primary); }
.sb-filter-toggle[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, var(--dsw-alias-border-l2));
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
  color: var(--dsw-alias-label-primary);
}
.sb-filter-toggle:focus-visible,
.sb-filter-clear:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-filter-clear { order: 3; }
.sb-filter-count {
  order: 4;
  margin-left: auto;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.sb-overlay > .sb-filters { padding: 10px 20px; }
.sb-overlay > .sb-batch .sb-batchbar { padding: 6px 20px; }
@media (max-width: 1020px) {
  .sb-overlay .sb-filter-search { max-width: 420px; }
  .sb-overlay .sb-filter-controls { order: 4; flex: 1 1 100%; }
  .sb-overlay .sb-filter-clear { order: 2; }
  .sb-overlay .sb-filter-count { order: 3; }
}
.sb-dock .sb-filter-search { max-width: none; }
.sb-dock .sb-filter-controls { order: 4; flex: 1 1 100%; }
.sb-dock .sb-filter-clear { order: 2; }
.sb-dock .sb-filter-count { order: 3; }
/* A summary card has no inner scrollbar; detail remains an explicit action. */
.sb-root .sb-card[data-expanded="false"] { height: 194px; min-height: 194px; max-height: 194px; }
.sb-root[data-density="compact"] .sb-card[data-expanded="false"] { height: 176px; min-height: 176px; max-height: 176px; flex-basis: 176px; }
.sb-root .sb-card[data-expanded="false"] .sb-card-content { overflow: clip; }
.sb-root .sb-card[data-expanded="false"] .sb-card-content .sb-line { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.sb-root .sb-card[data-expanded="true"] { height: 320px; min-height: 320px; max-height: 320px; flex-basis: 320px; }
.sb-card-details { align-self: flex-start; font-size: 11px; }
.sb-workspace-node { min-width: 0; margin-bottom: 10px; }
.sb-workspace-head-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
.sb-workspace-head-row > .sb-group-head { flex: 1; min-width: 0; }
.sb-workspace-action {
  flex: none;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 10px;
  line-height: 16px;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.sb-workspace-action:hover { background: var(--sb-hover); color: var(--dsw-alias-label-primary); }
.sb-workspace-action:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-workspace-action:disabled { opacity: .55; cursor: default; }
.sb-workspace-error { margin: 2px 0 4px 18px; color: var(--dsw-alias-state-error-primary); font-size: 10px; line-height: 14px; }
.sb-workspace-subtitle { flex: 0 1 auto; max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-tertiary); font-size: 10px; line-height: 16px; }
.sb-workspace-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); }
.sb-workspace-body { padding-left: 10px; border-left: 1px solid var(--dsw-alias-border-l1); margin-left: 6px; }
.sb-workspace-body > .sb-group { margin-top: 4px; }
.sb-workspace-node > .sb-group-head { width: 100%; }
/* A branch with no sessions has nothing to disclose: no pointer affordance. */
.sb-workspace-node > .sb-group-head--static { cursor: default; }
.sb-workspace-node > .sb-group-head--static:hover { color: var(--dsw-alias-label-secondary); }
.sb-workspace-spacer { width: 10px; flex: 0 0 auto; }
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
  .sb-card,
  .sb-card:hover,
  .sb-card::before,
  .sb-card__halo,
  .sb-group-chevron,
  .sb-progress-fill,
  .sb-btn,
  .sb-filter-toggle,
  .sb-filter-clear,
  .sb-filter-search,
  .sb-select select,
  .sb-ack { transition: none; animation: none !important; }
  .sb-card:hover { transform: none; }
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
.sb-settings-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, transparent);
  color: inherit;
  font: inherit;
}
.sb-settings-input:disabled { opacity: .6; }
.sb-settings-input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-settings-action {
  padding: 3px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2, transparent);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sb-settings-action:hover { background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2, transparent)); }
.sb-settings-action:disabled { opacity: .6; cursor: default; }
.sb-settings-details { display: flex; flex-direction: column; gap: 8px; max-width: 480px; }
.sb-settings-details > summary { cursor: pointer; color: var(--dsw-alias-label-secondary); }
.sb-settings-report { display: flex; flex-direction: column; gap: 3px; max-width: 640px; overflow-wrap: anywhere; }
.sb-settings-issues { margin: 0; padding-inline-start: 18px; color: var(--dsw-alias-state-error-primary); }

${MANAGER_STYLESHEET}
`
