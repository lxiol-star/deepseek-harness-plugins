/**
 * The manager drawer stylesheet, kept in its own module so the drawer's layout
 * and the panel stylesheet can be edited without touching the board CSS.
 *
 * Same two constraints as the panel stylesheet: every colour is a `--dsw-*`
 * theme token, and motion is limited to opacity/transform.
 */

/** Manager drawer CSS, interpolated into the plugin stylesheet. */
export const MANAGER_STYLESHEET = `/* -------------------------------------------------------------- manager --- */

/* Fixed right-hand drawer. The shell overlay layer ignores pointer events for
   empty space, so the drawer restores them for itself and its descendants. */
.sb-manager {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: clamp(420px, 46vw, 860px);
  max-width: 100vw;
  z-index: 900;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border-left: 1px solid var(--dsw-alias-border-l1);
  box-shadow: -18px 0 40px color-mix(in srgb, var(--dsw-alias-bg-base) 40%, transparent);
  contain: layout style;
}

.sb-manager-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding: 10px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
/* The drawer starts at the window edge, so the macOS chrome strip is padded
   instead of being covered by the header controls. */
html[data-platform='darwin'] .sb-manager-head { padding-top: max(10px, var(--dsh-frame-chrome-top, 0px)); }
.sb-manager-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}
.sb-manager-phase {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
}
.sb-manager-phase[data-phase='running'] { background: var(--dsw-alias-state-business-primary); }
.sb-manager-phase[data-phase='waiting'] { background: var(--dsw-alias-state-warn-primary); }

.sb-manager-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.sb-manager-btn--icon { padding: 4px; }
.sb-manager-btn--primary {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, var(--dsw-alias-border-l1));
}
.sb-manager-btn:disabled { opacity: .45; cursor: not-allowed; }
.sb-manager button:focus-visible,
.sb-manager input:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }

.sb-manager-body { display: flex; flex: 1 1 auto; min-height: 0; }
.sb-manager-left {
  display: flex;
  flex-direction: column;
  flex: 0 0 340px;
  width: 340px;
  min-height: 0;
  border-right: 1px solid var(--dsw-alias-border-l1);
}
.sb-manager-views {
  display: flex;
  gap: 2px;
  padding: 8px 10px 0;
}
.sb-manager-view {
  flex: 1 1 0;
  min-width: 0;
  padding: 5px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}
.sb-manager-view:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.sb-manager-view[data-active="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font-weight: 600; }
.sb-manager-section {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px 10px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.sb-manager-workspaces { flex: 0 1 auto; max-height: 34%; }
.sb-manager-sessions { flex: 1 1 auto; }
.sb-manager-tasks { flex: 0 1 auto; max-height: 30%; }
.sb-manager-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.sb-manager-section-head .sb-manager-section-title { margin: 0; }
.sb-manager-filter {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.sb-manager-filter input { width: 12px; height: 12px; margin: 0; }
.sb-manager-section-title {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary);
}
.sb-manager-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sb-manager-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 1px 2px;
  border-radius: 7px;
}
.sb-manager-item[data-focused='true'] {
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);
}
.sb-manager-check { flex: none; margin: 0; accent-color: var(--dsw-alias-state-business-primary); }
.sb-manager-workspace {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 4px 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.sb-manager-workspace-title {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.sb-manager-meta {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
}
.sb-manager-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
.sb-manager-dot[data-state='running'] { background: var(--dsw-alias-state-business-primary); }
.sb-manager-dot[data-state='blocked'] { background: var(--dsw-alias-state-warn-primary); }
.sb-manager-dot[data-state='error'] { background: var(--dsw-alias-state-error-primary); }
.sb-manager-dot[data-state='unread'] { background: var(--dsw-alias-state-warn-primary); }
.sb-manager-dot[data-state='done'] { background: var(--dsw-alias-state-success-primary); }
.sb-manager-session-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sb-manager-session-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-manager-empty { margin: 4px 0; color: var(--dsw-alias-label-secondary); font-size: 11px; }

.sb-manager-task {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.sb-manager-task:disabled { cursor: default; }
.sb-manager-task-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.sb-manager-task-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-manager-chip {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  font-size: 10px;
  color: var(--dsw-alias-label-secondary);
}
.sb-manager-chip[data-status='running'] {
  color: var(--dsw-alias-state-business-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, var(--dsw-alias-border-l1));
}
.sb-manager-chip[data-status='blocked'] { color: var(--dsw-alias-state-warn-primary); }
.sb-manager-chip[data-status='done'] { color: var(--dsw-alias-state-success-primary); }
.sb-manager-chip[data-status='failed'],
.sb-manager-chip[data-status='orphaned'] { color: var(--dsw-alias-state-error-primary); }

.sb-manager-wake-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.sb-manager-wake-actions .sb-manager-btn { flex: 0 0 auto; }
.sb-manager-selection {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.sb-manager-selection-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.sb-manager-count { margin-right: auto; font-variant-numeric: tabular-nums; }
.sb-manager-hint { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 10px; }
.sb-manager-error { margin: 0; color: var(--dsw-alias-state-error-primary); font-size: 11px; }
.sb-manager-ok { margin: 0; color: var(--dsw-alias-state-success-primary); font-size: 11px; }

.sb-manager-chat { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.sb-manager-chat-body { flex: 1 1 auto; width: 100%; height: 100%; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.sb-manager-chat-body > * { flex: 1 1 auto; min-height: 0; }
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
.sb-manager-notice p { margin: 0; }

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
.sb-manager-entry:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.sb-manager-entry-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Hover states are gated: touch frames never get a sticky hover. */
@media (hover: hover) {
  .sb-manager-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
  .sb-manager-btn--primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, transparent);
  }
  .sb-manager-workspace:hover,
  .sb-manager-task:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
  .sb-manager-entry:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
}

/* A narrow frame stacks the two panes; the drawer takes the whole width. */
@media (max-width: 860px) {
  .sb-manager { width: 100%; }
  .sb-manager-body { flex-direction: column; }
  .sb-manager-left {
    width: 100%;
    flex: 0 0 auto;
    max-height: 48%;
    border-right: 0;
    border-bottom: 1px solid var(--dsw-alias-border-l1);
  }
  .sb-manager-workspaces { max-height: 40%; }
  .sb-manager-chat { min-height: 240px; }
}

@media (prefers-reduced-motion: reduce) {
  .sb-manager,
  .sb-manager-btn,
  .sb-manager-workspace,
  .sb-manager-task { transition: none; animation: none; }
}

`
