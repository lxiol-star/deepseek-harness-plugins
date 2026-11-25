/**
 * Styles of the dock above the composer, of the two canvas entries on it, and of
 * the canvas toggle in the session header.
 *
 * Every colour is a `var(--dsw-*)` theme token with a fallback, so the dock
 * follows the shell's light and dark theme.
 */

export const STYLE_ID = 'dsh-kimi-tower-dock-style'

export const CSS = `
.dkt-dock{display:flex;flex-direction:column;gap:8px;margin:0 0 8px;padding:10px 12px;border:1px solid var(--dsw-border-subtle,rgba(127,127,127,.2));border-radius:12px;background:var(--dsw-surface-raised,rgba(127,127,127,.06));font-size:12px;color:inherit}
.dkt-head{display:flex;align-items:center;gap:8px;min-height:18px;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;width:100%}
.dkt-chev{margin-left:4px;color:var(--dsw-text-faint,rgba(127,127,127,.7));font-size:12px;line-height:1}
/* The collapsed pill is a group: the expand button on the left, the canvas entry on the right. */
.dkt-pill{display:inline-flex;align-items:center;justify-content:center;gap:2px;margin:0 0 8px;padding:3px 4px 3px 11px;border:1px solid var(--dsw-border-subtle,rgba(127,127,127,.2));border-radius:999px;background:var(--dsw-surface-raised,rgba(127,127,127,.06));color:inherit;font:inherit;font-size:12px}
.dkt-pill-main{display:inline-flex;align-items:center;gap:7px;padding:4px 0;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.dkt-pill-sep{align-self:stretch;width:1px;margin:6px 2px;background:var(--dsw-border-subtle,rgba(127,127,127,.2))}
.dkt-canvas-btn{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer}
.dkt-canvas-btn:hover{background:var(--dsw-surface-hover,rgba(127,127,127,.15))}
.dkt-canvas-btn-compact{padding:1px 8px;font-size:11px;border-radius:7px}
.dkt-canvas-btn svg,.dkt-canvas-toggle svg{flex:none;display:block}
.dkt-toprow{display:flex;align-items:center;gap:6px;min-width:0}
.dkt-toprow .dkt-head{flex:1 1 auto;width:auto;min-width:0}
/* The canvas toggle in the session header, sized like the header's other icon buttons. */
.dkt-canvas-toggle{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 6px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-text-muted,rgba(127,127,127,.9));cursor:pointer}
.dkt-canvas-toggle:hover{background:var(--dsw-surface-hover,rgba(127,127,127,.15));color:inherit}
.dkt-canvas-toggle[aria-pressed="true"]{background:var(--dsw-surface-hover,rgba(127,127,127,.15));border-color:var(--dsw-border-subtle,rgba(127,127,127,.2))}
.dkt-canvas-toggle:focus-visible{outline:2px solid var(--dsw-accent,#4f7cff);outline-offset:1px}
.dkt-pill-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-success,#22c55e)}
.dkt-pill-count{min-width:16px;height:16px;padding:0 5px;border-radius:999px;background:var(--dsw-accent,#4f7cff);color:#fff;font-size:10px;line-height:16px;text-align:center;font-variant-numeric:tabular-nums}
.dkt-mark{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:5px;background:var(--dsw-accent,#4f7cff);color:#fff;font-size:10px;font-weight:700;letter-spacing:0}
.dkt-title{font-weight:600}
.dkt-count{color:var(--dsw-text-muted,rgba(127,127,127,.9))}
.dkt-base{margin-left:auto;color:var(--dsw-text-faint,rgba(127,127,127,.7));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38%}
.dkt-error{color:var(--dsw-danger,#ef4444);font-size:11px;padding:2px 0 0}
.dkt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.dkt-card{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;padding:9px 10px;border:0;border-radius:10px;background:var(--dsw-surface,rgba(127,127,127,.09));color:inherit;text-align:left;font:inherit;cursor:default}
.dkt-card[data-open="1"]{cursor:pointer}
.dkt-card[data-open="1"]:hover{background:var(--dsw-surface-hover,rgba(127,127,127,.15))}
.dkt-card[data-state="running"]{box-shadow:inset 2px 0 0 var(--dsw-success,#22c55e)}
.dkt-card[data-state="blocked"]{box-shadow:inset 2px 0 0 var(--dsw-danger,#ef4444)}
.dkt-card[data-state="done"]{opacity:.72}
.dkt-top{display:flex;align-items:center;gap:8px;min-width:0;padding-right:18px}
.dkt-stop{flex:none;appearance:none;border:0;background:transparent;padding:0;display:inline-grid;place-items:center;width:16px;height:16px;border-radius:4px;color:var(--dsw-text-muted,rgba(127,127,127,.7));font-size:9px;line-height:1;cursor:pointer}
.dkt-stop:hover{background:var(--dsw-surface-hover,rgba(127,127,127,.15));color:var(--dsw-danger,#ef4444)}
.dkt-stop[data-stopping="1"]{opacity:.5;cursor:progress}
.dkt-card[data-fading="1"]{opacity:.35;transition:opacity .35s ease}
.dkt-num{flex:none;color:var(--dsw-text-faint,rgba(127,127,127,.7));font-variant-numeric:tabular-nums}
.dkt-id{flex:none;padding:0 4px;border-radius:4px;background:var(--dsw-surface-hover,rgba(127,127,127,.12));color:var(--dsw-text-muted,rgba(127,127,127,.85));font-size:10px;line-height:16px;font-variant-numeric:tabular-nums}
.dkt-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dkt-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-text-muted,rgba(127,127,127,.85))}
.dkt-model{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-text-muted,rgba(127,127,127,.85));font-size:11px}
.dkt-foot{display:flex;align-items:center;gap:8px;justify-content:space-between;color:var(--dsw-text-muted,rgba(127,127,127,.85))}
.dkt-kind{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkt-status{display:inline-flex;align-items:center;gap:4px;flex:none}
.dkt-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-text-faint,#999)}
.dkt-card[data-state="running"] .dkt-dot{background:var(--dsw-success,#22c55e);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-success,#22c55e) 18%,transparent)}
.dkt-card[data-state="blocked"] .dkt-dot{background:var(--dsw-danger,#ef4444)}
.dkt-card[data-state="done"] .dkt-dot{background:var(--dsw-success,#22c55e)}
.dkt-time{font-variant-numeric:tabular-nums;color:var(--dsw-text-faint,rgba(127,127,127,.75))}
.dkt-empty{display:none}

`
