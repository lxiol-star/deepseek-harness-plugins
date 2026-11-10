/**
 * The manager drawer stylesheet, kept in its own module so the drawer's layout
 * and the panel stylesheet can be edited without touching the board CSS.
 *
 * Design rules (shared with the panel stylesheet):
 *  - every colour is a `--dsw-*` theme token, so the drawer follows light/dark
 *    and any future re-theme without a single literal colour;
 *  - the panel is a floating surface: margin, radius and shadow carry the
 *    hierarchy, then borders, then background layers;
 *  - motion is limited to colour, opacity and small transforms, and the
 *    reduced-motion query turns it off;
 *  - the panel is a size container, so its controls collapse by drawer width
 *    rather than by window width.
 */

/** Manager drawer CSS, interpolated into the plugin stylesheet. */
export const MANAGER_STYLESHEET = `
/* ------------------------------------------------------------- manager --- */

/* Fixed right-hand drawer. The shell overlay layer ignores pointer events for
   empty space, so the drawer restores them for itself and its descendants. */
.sb-manager {
  position: fixed;
  top: 10px;
  right: 10px;
  bottom: 10px;
  z-index: 900;
  display: flex;
  flex-direction: column;
  min-width: 0;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  container-type: inline-size;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-elevation-prominent, var(--dsw-shadow-lv3));
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 1.4;
  transition: top .2s ease, right .2s ease, bottom .2s ease, left .2s ease, width .2s ease, border-radius .2s ease;
}
.sb-manager *,
.sb-manager *::before,
.sb-manager *::after { box-sizing: border-box; }
/* Maximized: the panel becomes the workspace instead of floating over it. */
.sb-manager[data-maximized='true'] {
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  width: 100vw;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
/* No transitions while a pointer drag owns the geometry. */
.sb-manager[data-resizing] { user-select: none; }
.sb-manager[data-resizing='drawer'],
.sb-manager[data-resizing='nav'] { transition: none; }

/* The outer resize strip sits inside the rounded corner so it cannot be
   clipped at the window edge. */
.sb-manager-resize {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 4;
  width: 10px;
  cursor: col-resize;
  background: transparent;
  outline: none;
  touch-action: none;
}
.sb-manager-resize::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 4px;
  width: 2px;
  height: 40px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: var(--dsw-alias-state-business-primary);
  opacity: 0;
  transition: opacity .14s ease;
}
.sb-manager-resize:hover::after,
.sb-manager-resize:focus-visible::after { opacity: 1; }
.sb-manager-resize:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -4px; border-radius: var(--dsw-radius-sm); }

/* ---------------------------------------------------------------- head --- */

.sb-manager-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-height: 48px;
  padding: 8px 10px 8px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
/* The drawer starts at the window edge, so the macOS chrome strip is padded
   instead of being covered by the header controls. */
html[data-platform='darwin'] .sb-manager-head { padding-top: max(10px, var(--dsh-frame-chrome-top, 0px)); }
.sb-manager-phase {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-label-tertiary) 16%, transparent);
}
.sb-manager-phase[data-phase='running'] {
  background: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);
}
.sb-manager-phase[data-phase='waiting'] {
  background: var(--dsw-alias-state-warn-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent);
}
.sb-manager-title {
  flex: none;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: .01em;
  white-space: nowrap;
}
.sb-manager-status {
  flex: none;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 10.5px;
  font-weight: 500;
}
.sb-manager-status[data-phase='running'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 28%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
  color: var(--dsw-alias-state-business-primary);
}
.sb-manager-status[data-phase='waiting'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 30%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent);
  color: var(--dsw-alias-state-warn-primary);
}
.sb-manager-head-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  min-width: 0;
}

/* ------------------------------------------------------------- controls --- */

.sb-manager-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: none;
  height: 28px;
  min-width: 28px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .14s ease, color .14s ease, border-color .14s ease;
}
.sb-manager-iconbtn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.sb-manager-iconbtn[aria-pressed='true'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 26%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);
  color: var(--dsw-alias-state-business-primary);
}
.sb-manager-iconbtn[data-tone='accent'] {
  border-color: var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
}
.sb-manager-iconbtn[data-tone='accent']:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.sb-manager-iconbtn:disabled { opacity: .4; cursor: not-allowed; }
.sb-manager-iconbtn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.sb-manager-btn-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }

/* ---------------------------------------------------------------- body --- */

.sb-manager-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

/* --------------------------------------------------------- navigator ---- */

.sb-manager-nav {
  display: flex;
  flex-direction: column;
  flex: none;
  min-width: 0;
  min-height: 0;
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2));
  border-right: 1px solid var(--dsw-alias-border-l1);
}
.sb-manager-nav-resize {
  position: relative;
  flex: none;
  width: 6px;
  margin-left: -3px;
  margin-right: -3px;
  z-index: 3;
  cursor: col-resize;
  background: transparent;
  outline: none;
  touch-action: none;
}
.sb-manager-nav-resize::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 2px;
  width: 2px;
  height: 32px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: var(--dsw-alias-state-business-primary);
  opacity: 0;
  transition: opacity .14s ease;
}
.sb-manager-nav-resize:hover::after,
.sb-manager-nav-resize:focus-visible::after { opacity: 1; }
.sb-manager-nav-resize:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
  border-radius: 999px;
}

/* Segmented view switcher. */
.sb-manager-views {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 2px;
  flex: none;
  margin: 10px 10px 6px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-specific-selector, var(--dsw-alias-bg-layer-3));
}
.sb-manager-view {
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background-color .14s ease, color .14s ease;
}
.sb-manager-view:hover { color: var(--dsw-alias-label-primary); }
.sb-manager-view[data-active='true'] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
  box-shadow: var(--dsw-shadow-lv1);
}
.sb-manager-view:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -1px;
}

.sb-manager-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 2px 8px 10px;
  scrollbar-gutter: stable;
}
.sb-manager-scroll::-webkit-scrollbar { width: 8px; }
.sb-manager-scroll::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 30%, transparent);
  background-clip: content-box;
}
.sb-manager-scroll::-webkit-scrollbar-thumb:hover { background-color: color-mix(in srgb, var(--dsw-alias-label-tertiary) 50%, transparent); }

/* ------------------------------------------------------------ sections --- */

.sb-manager-section { padding: 6px 0 4px; }
.sb-manager-section + .sb-manager-section {
  border-top: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 78%, transparent);
}
.sb-manager-section-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 4px;
  margin-bottom: 3px;
}
.sb-manager-section-icon { display: inline-flex; flex: none; color: var(--dsw-alias-label-tertiary); }
.sb-manager-section-title {
  margin: 0;
  flex: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .02em;
  color: var(--dsw-alias-label-secondary);
}
.sb-manager-section-subtitle {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}
.sb-manager-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 14%, transparent);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.sb-manager-section-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  margin-left: auto;
  flex: none;
}
.sb-manager-section-actions .sb-manager-iconbtn { height: 24px; min-width: 24px; padding: 0 5px; }

/* -------------------------------------------------------------- filter --- */

.sb-manager-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin: 0 2px 6px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
}
.sb-manager-filter:focus-within {
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 55%, var(--dsw-alias-border-l1));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
}
.sb-manager-filter-icon { flex: none; color: var(--dsw-alias-label-tertiary); }
.sb-manager-filter input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 11.5px;
}
.sb-manager-filter input::placeholder { color: var(--dsw-alias-label-tertiary); }
.sb-manager-filter input::-webkit-search-cancel-button { display: none; }
.sb-manager-filter-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.sb-manager-filter-clear:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }

/* ----------------------------------------------------------- nav rows --- */

.sb-manager-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.sb-manager-item {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  border-radius: var(--dsw-radius-sm);
  transition: background-color .12s ease;
}
.sb-manager-item[data-focused='true'] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 9%, transparent);
  box-shadow: inset 2px 0 0 var(--dsw-alias-state-business-primary);
}
.sb-manager-check {
  flex: none;
  width: 13px;
  height: 13px;
  margin: 0 2px 0 5px;
  accent-color: var(--dsw-alias-button-primary-fill);
  cursor: pointer;
}
.sb-manager-check:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.sb-manager-workspace,
.sb-manager-session,
.sb-manager-task {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 6px 6px 6px 3px;
  border: 0;
  border-radius: var(--dsw-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: background-color .12s ease;
}
.sb-manager-task { padding-left: 6px; }
.sb-manager-workspace:hover,
.sb-manager-session:hover,
.sb-manager-task:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.sb-manager-workspace:focus-visible,
.sb-manager-session:focus-visible,
.sb-manager-task:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
.sb-manager-task:disabled { cursor: default; }
.sb-manager-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-tertiary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-label-tertiary) 12%, transparent);
}
.sb-manager-dot[data-state='running'] {
  background: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);
}
.sb-manager-dot[data-state='blocked'],
.sb-manager-dot[data-state='unread'] {
  background: var(--dsw-alias-state-warn-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent);
}
.sb-manager-dot[data-state='error'] {
  background: var(--dsw-alias-state-error-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-error-primary) 18%, transparent);
}
.sb-manager-dot[data-state='done'] {
  background: var(--dsw-alias-state-success-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent);
}
.sb-manager-workspace-main,
.sb-manager-session-main,
.sb-manager-task-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
}
.sb-manager-workspace-title,
.sb-manager-session-title,
.sb-manager-task-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--dsw-alias-label-primary);
}
.sb-manager-session-title { font-weight: 400; }
.sb-manager-item[data-state='blocked'] .sb-manager-session-title,
.sb-manager-item[data-state='error'] .sb-manager-session-title { font-weight: 500; }
.sb-manager-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 1.25;
}
.sb-manager-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.sb-manager-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  opacity: 0;
  transition: opacity .12s ease;
}
.sb-manager-workspace:hover .sb-manager-chevron,
.sb-manager-item[data-focused='true'] .sb-manager-chevron { opacity: 1; }
.sb-manager-chip {
  flex: none;
  padding: 2px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 12%, transparent);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}
.sb-manager-chip[data-status='running'] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
  color: var(--dsw-alias-state-business-primary);
}
.sb-manager-chip[data-status='blocked'],
.sb-manager-chip[data-status='failed'] {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
.sb-manager-chip[data-status='done'] {
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent);
  color: var(--dsw-alias-state-success-primary);
}
.sb-manager-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 4px 4px;
  padding: 6px 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  line-height: 1.4;
}
.sb-manager-empty svg { flex: none; }

/* --------------------------------------------------------------- wake --- */

.sb-manager-wake { padding-bottom: 8px; }
.sb-manager-switch,
.sb-manager-textbtn { cursor: pointer; font: inherit; }
.sb-manager-switch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  margin-left: auto;
  border: 0;
  border-radius: 999px;
  background: transparent;
}
.sb-manager-switch:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.sb-manager-switch-track {
  position: relative;
  display: block;
  width: 30px;
  height: 17px;
  border-radius: 999px;
  background: var(--dsw-alias-border-l3);
  transition: background-color .16s ease;
}
.sb-manager-switch-track > span {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--dsw-alias-switch-thumb);
  box-shadow: var(--dsw-shadow-lv1);
  transition: transform .16s ease, background-color .16s ease;
}
.sb-manager-switch[aria-checked='true'] .sb-manager-switch-track { background: var(--dsw-alias-brand-primary); }
.sb-manager-switch[aria-checked='true'] .sb-manager-switch-track > span {
  background: var(--dsw-alias-label-primary-foreground);
  transform: translateX(13px);
}
.sb-manager-wake-status {
  margin: 2px 6px 6px;
  font-size: 10.5px;
  line-height: 1.45;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
}
.sb-manager-wake-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
}
.sb-manager-textbtn {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  white-space: nowrap;
  transition: background-color .14s ease, color .14s ease;
}
.sb-manager-textbtn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.sb-manager-textbtn:disabled { opacity: .45; cursor: not-allowed; }
.sb-manager-textbtn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.sb-manager-hint {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: help;
}

/* ---------------------------------------------------------- selection --- */

.sb-manager-selection {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: none;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.sb-manager-selection-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.sb-manager-count {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.sb-manager-selection[data-empty] .sb-manager-count {
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}
.sb-manager-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: none;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color .14s ease, color .14s ease, opacity .14s ease;
}
.sb-manager-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.sb-manager-btn:disabled { opacity: .45; cursor: not-allowed; }
.sb-manager-btn:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.sb-manager-btn--primary {
  border-color: var(--dsw-alias-button-primary-fill);
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.sb-manager-btn--primary:hover:not(:disabled) {
  border-color: var(--dsw-alias-button-primary-hover);
  background: var(--dsw-alias-button-primary-hover);
  color: var(--dsw-alias-label-primary-foreground);
}
.sb-manager-selection-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 14px;
}
.sb-manager-hint-line {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
}
.sb-manager-ok { font-size: 10px; color: var(--dsw-alias-state-success-primary); }
.sb-manager-error {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10px;
  color: var(--dsw-alias-state-error-primary);
}

/* --------------------------------------------------------------- chat --- */

.sb-manager-chat {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  background: var(--dsw-alias-bg-layer-1);
}
.sb-manager-chat-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-height: 36px;
  padding: 4px 10px 4px 14px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.sb-manager-chat-title {
  flex: none;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.sb-manager-chat-head .sb-manager-status { font-size: 10px; }
.sb-manager-chat-spacer { flex: 1 1 auto; min-width: 0; }
.sb-manager-chat-body {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.sb-manager-chat-body > * { flex: 1 1 auto; min-width: 0; min-height: 0; }
.sb-manager-notice {
  margin: auto;
  padding: 20px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}
.sb-manager-notice p { margin: 0; font-size: 12px; }
.sb-manager-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 30%, transparent);
  border-top-color: var(--dsw-alias-state-business-primary);
  animation: sb-manager-spin .8s linear infinite;
}
@keyframes sb-manager-spin { to { transform: rotate(360deg); } }

/* Sidebar-foot entry point: one full-width row beside Settings while the
   sidebar is wide, a centred icon in the rail. Occupants own their geometry
   here, matching the shell's other footer actions. */
.sb-manager-entry {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: calc(100% + 4px);
  height: 42px;
  margin: 0 -2px;
  padding: 0 10px 0 8px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
}
.sb-manager-entry[data-rail='true'] {
  width: 40px;
  height: 40px;
  margin: 0;
  padding: 0;
  justify-content: center;
  border-radius: 10px;
}
.sb-manager-entry[aria-pressed='true'] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
  color: var(--dsw-alias-label-primary);
}
.sb-manager-entry:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 1px;
}
.sb-manager-entry-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Hover states are gated: touch frames never get a sticky hover. */
@media (hover: hover) {
  .sb-manager-entry:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
}

/* The drawer is a size container: collapse labels by its own width. */
@container (max-width: 760px) {
  .sb-manager-btn-label { display: none; }
  .sb-manager-iconbtn { padding: 0 6px; }
}
@container (max-width: 620px) {
  .sb-manager-status { display: none; }
  .sb-manager-head { padding-left: 12px; }
}
@container (max-width: 460px) {
  .sb-manager-title { font-size: 12px; }
  .sb-manager-section-actions { gap: 0; }
}

/* A narrow frame pins the drawer to the window edges. */
@media (max-width: 900px) {
  .sb-manager { top: 0; right: 0; bottom: 0; border-radius: 0; }
  .sb-manager-resize { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .sb-manager,
  .sb-manager-iconbtn,
  .sb-manager-view,
  .sb-manager-workspace,
  .sb-manager-session,
  .sb-manager-task,
  .sb-manager-btn,
  .sb-manager-textbtn,
  .sb-manager-switch-track,
  .sb-manager-switch-track > span,
  .sb-manager-chip,
  .sb-manager-chevron,
  .sb-manager-resize::after,
  .sb-manager-nav-resize::after { transition: none; }
  .sb-manager-spinner { animation: none; }
}
`
