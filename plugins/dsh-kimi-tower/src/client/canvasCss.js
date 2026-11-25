/**
 * Styles of the tower canvas.
 *
 * Every colour is a `var(--dsw-*)` theme token with a fallback, so the canvas
 * follows the shell's light and dark theme; the palette below only maps tokens
 * to roles. Text is always the theme's own colour — nothing here sets a
 * `color` to a literal — so both themes stay readable.
 *
 * The sizes the layout measures (see `src/canvas/layout.js`) are repeated
 * here and marked "layout": a summary group, the header rows of a detail
 * group, the rows of its two cards, and the three heights of an agent card.
 * Keep the two in step.
 */

export const STYLE_ID = 'dsh-kimi-tower-canvas-style'

export const CSS = `
/* ------------------------------------------------------------ palette --- */
.dkt-canvas{
  --dkc-bg:var(--dsw-alias-bg-base,#ffffff);
  --dkc-surface:var(--dsw-alias-bg-layer-1,#ffffff);
  --dkc-surface-2:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.06));
  --dkc-surface-3:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.12));
  --dkc-raised:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#ffffff));
  --dkc-text:var(--dsw-alias-label-primary,#0f1115);
  --dkc-text-2:var(--dsw-alias-label-secondary,#61666b);
  --dkc-text-3:var(--dsw-alias-label-tertiary,#8a9099);
  --dkc-line:var(--dsw-alias-border-l2,rgba(127,127,127,.22));
  --dkc-line-soft:var(--dsw-alias-border-l1,rgba(127,127,127,.14));
  --dkc-line-strong:var(--dsw-alias-border-l3,rgba(127,127,127,.36));
  --dkc-on-accent:var(--dsw-alias-label-primary-inverted,#ffffff);
  --dkc-hover:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.09));
  --dkc-accent:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#4f7cff));
  --dkc-accent-soft:color-mix(in srgb,var(--dkc-accent) 12%,transparent);
  --dkc-accent-line:color-mix(in srgb,var(--dkc-accent) 45%,var(--dkc-line));
  --dkc-ok:var(--dsw-alias-state-success-primary,#22c55e);
  --dkc-ok-soft:color-mix(in srgb,var(--dkc-ok) 13%,transparent);
  --dkc-warn:var(--dsw-alias-state-warn-primary,#e08a00);
  --dkc-warn-soft:color-mix(in srgb,var(--dkc-warn) 14%,transparent);
  --dkc-danger:var(--dsw-alias-state-error-primary,#ef4444);
  --dkc-danger-soft:color-mix(in srgb,var(--dkc-danger) 12%,transparent);
  --dkc-idle:var(--dsw-alias-state-idle-primary,#9aa1ab);
  --dkc-dot:var(--dsw-alias-border-l3,rgba(127,127,127,.36));
  --dkc-shadow:0 1px 2px rgba(0,0,0,.05),0 4px 14px rgba(0,0,0,.06);
  --dkc-shadow-2:0 8px 28px rgba(0,0,0,.16);
  --dkc-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
}
/* ------------------------------------------------------------ surface --- */
.dkt-canvas{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;overflow:hidden;background:var(--dkc-bg);color:var(--dkc-text);font-size:12px;line-height:1.35;font-family:inherit;outline:none}
/* The portal spans the window; cards and controls opt back in below. */
.dkt-canvas,.dkc-stage,.dkc-label,.dkc-card{-webkit-app-region:no-drag}
.dkt-canvas *{box-sizing:border-box}
.dkt-canvas button{font:inherit;color:inherit}
.dkt-canvas ::selection{background:var(--dkc-accent-soft)}
.dkt-canvas button:focus-visible,.dkt-canvas [role="button"]:focus-visible,.dkt-canvas [role="tab"]:focus-visible,.dkt-canvas [tabindex]:focus-visible{outline:2px solid var(--dkc-accent);outline-offset:1px}
.dkt-canvas [tabindex="-1"]:focus{outline:none}
.dkt-canvas code{font-family:var(--dkc-mono);font-size:11px}
/* ------------------------------------------------------------- header --- */
.dkc-head{position:relative;display:flex;align-items:center;gap:10px;flex:none;min-height:50px;padding:8px 12px 8px 16px;border-bottom:1px solid var(--dkc-line-soft);background:var(--dkc-surface);user-select:none;-webkit-user-select:none;z-index:6}
.dkc-head button,.dkc-head [role="group"],.dkc-base{-webkit-app-region:no-drag}
html[data-platform='darwin'] .dkc-head{-webkit-app-region:drag;min-height:52px}
.dkc-dragspace{display:none}
html[data-platform='darwin'] .dkc-dragspace{display:block;flex:none;width:66px}
.dkc-brand{display:inline-flex;align-items:center;gap:8px;min-width:0}
.dkc-brand-mark{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;background:var(--dkc-accent);color:var(--dkc-on-accent);font-size:10px;font-weight:700}
.dkc-title{font-size:14px;font-weight:600;letter-spacing:-.01em;white-space:nowrap}
.dkc-base{display:inline-flex;align-items:center;max-width:30vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dkc-text-3);font-size:11px;font-family:var(--dkc-mono)}
.dkc-base b{font-weight:500;color:var(--dkc-text-2)}
.dkc-spacer{flex:1 1 auto;min-width:8px}
.dkc-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dkc-line-soft);border-radius:9px;background:var(--dkc-surface-2);flex:none}
.dkc-seg-label{padding:0 4px 0 6px;color:var(--dkc-text-3);font-size:11px;white-space:nowrap}
.dkc-seg button{appearance:none;border:0;background:transparent;padding:3px 10px;border-radius:7px;color:var(--dkc-text-2);font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.dkc-seg button:hover{background:var(--dkc-hover);color:var(--dkc-text)}
.dkc-seg button[aria-pressed="true"]{background:var(--dkc-accent);color:var(--dkc-on-accent);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.14)}
.dkc-count{display:inline-flex;align-items:center;gap:5px;color:var(--dkc-text-2);font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}
.dkc-count b{font-weight:600;color:var(--dkc-text)}
.dkc-count i{display:inline-block;width:6px;height:6px;border-radius:50%;flex:none}
.dkc-count i[data-on="running"]{background:var(--dkc-ok)}
.dkc-count i[data-on="blocked"]{background:var(--dkc-danger)}
.dkc-count i[data-on="unread"]{background:var(--dkc-accent)}
.dkc-iconbtn{appearance:none;display:inline-grid;place-items:center;flex:none;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dkc-text-2);cursor:pointer}
.dkc-iconbtn:hover{background:var(--dkc-hover);color:var(--dkc-text)}
.dkc-iconbtn[disabled]{opacity:.35;cursor:default}
.dkc-iconbtn[disabled]:hover{background:transparent}
.dkc-iconbtn svg{width:15px;height:15px;display:block}
/* --------------------------------------------------------------- body --- */
.dkc-body{position:relative;display:flex;flex:1 1 auto;min-height:0}
.dkc-stage{position:relative;flex:1 1 auto;min-width:0;overflow:hidden;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.dkc-stage[data-dragging="1"]{cursor:grabbing}
.dkc-dots{position:absolute;inset:0;background-image:radial-gradient(var(--dkc-dot) 1px,transparent 1.2px);background-size:18px 18px;pointer-events:none}
/* The world is one layer, moved by a transform so panning and zooming never reflow it. */
.dkc-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.dkc-labels{position:absolute;inset:0;pointer-events:none}
.dkc-notice{position:absolute;transform:translateX(-50%);max-width:440px;padding:10px 14px;border:1.5px dashed var(--dkc-line-strong);border-radius:12px;background:var(--dkc-bg);color:var(--dkc-text-2);font-size:12px;line-height:18px;text-align:center;white-space:nowrap}
/* --------------------------------------------------------------- cards --- */
.dkc-card{position:absolute}
.dkc-open{cursor:pointer}
.dkc-card.dkc-selected{z-index:3}
.dkc-tower{display:flex;flex-direction:column;justify-content:center;gap:10px;padding:16px 18px;border:1px solid var(--dkc-accent-line);border-radius:16px;background:linear-gradient(180deg,var(--dkc-accent-soft),transparent 72%),var(--dkc-surface);box-shadow:var(--dkc-shadow)}
.dkc-tower.dkc-selected{border-color:var(--dkc-accent);box-shadow:0 0 0 3px var(--dkc-accent-soft),var(--dkc-shadow)}
.dkc-tower .dkc-brand{gap:8px}
.dkc-tower-mark{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--dkc-accent);color:var(--dkc-on-accent);font-size:12px;font-weight:700}
.dkc-tower-name{font-size:15px;font-weight:600;letter-spacing:-.01em}
.dkc-tower-meta{display:flex;flex-direction:column;gap:1px;color:var(--dkc-text-2);font-size:11.5px;line-height:16px}
.dkc-tower-meta b{font-weight:600;color:var(--dkc-text);font-variant-numeric:tabular-nums}
.dkc-tower-base{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dkc-text-3);font-family:var(--dkc-mono);font-size:11px}
/* A mission group: a dashed frame with a title tab. */
.dkc-group{border:1.5px dashed var(--dkc-line-strong);border-radius:14px;cursor:pointer}
.dkc-group:hover{background:color-mix(in srgb,var(--dkc-text) 2.5%,transparent)}
.dkc-group[data-tone="running"]{border-color:color-mix(in srgb,var(--dkc-ok) 55%,var(--dkc-line-strong))}
.dkc-group[data-tone="blocked"]{border-color:color-mix(in srgb,var(--dkc-danger) 60%,var(--dkc-line))}
.dkc-group[data-tone="paused"],.dkc-group[data-tone="stale"]{border-color:color-mix(in srgb,var(--dkc-warn) 60%,var(--dkc-line))}
.dkc-group[data-tone="done"]{border-color:var(--dkc-line)}
.dkc-group[data-tone="plain"]{border-color:var(--dkc-line)}
.dkc-group.dkc-selected{border-style:solid;border-color:var(--dkc-accent);box-shadow:0 0 0 3px var(--dkc-accent-soft)}
.dkc-group-head{position:absolute;left:0;right:0;top:0;padding:14px 16px 0 16px}
.dkc-group-title{display:flex;align-items:flex-start;gap:8px}
.dkc-group-id{flex:none;margin-top:1px;padding:0 5px;border-radius:5px;background:var(--dkc-surface-3);color:var(--dkc-text-2);font-size:10px;line-height:16px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.02em}
.dkc-group-name{flex:1 1 auto;min-width:0;font-size:13px;font-weight:600;line-height:20px;letter-spacing:-.005em}
.dkc-group-name span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkc-group-meta{margin-top:4px;padding-right:4px;color:var(--dkc-text-2);font-size:11.5px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkc-group-flags{margin-top:4px;color:var(--dkc-text-3);font-size:11px;line-height:16px}
.dkc-group-flags span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkc-group-badges{position:absolute;right:12px;top:10px;display:inline-flex;gap:4px;align-items:center}
/* 摘要 density: the frame is the card. */
.dkc-group[data-density="summary"]{padding:12px 14px;background:var(--dkc-surface);box-shadow:var(--dkc-shadow)}
.dkc-group[data-density="summary"].dkc-selected{box-shadow:0 0 0 3px var(--dkc-accent-soft),var(--dkc-shadow)}
.dkc-group[data-density="summary"] .dkc-group-head{position:static;padding:0}
.dkc-group[data-density="summary"] .dkc-group-badges{right:10px;top:9px}
.dkc-group[data-density="summary"] .dkc-group-name{font-size:12.5px}
.dkc-tag{display:inline-flex;align-items:center;gap:4px;padding:0 6px;border-radius:5px;font-size:10px;line-height:16px;font-weight:500;white-space:nowrap;border:1px solid transparent}
.dkc-tag i{display:inline-block;width:5px;height:5px;border-radius:50%;background:currentColor;flex:none}
.dkc-tag[data-tone="running"]{background:var(--dkc-ok-soft);color:var(--dkc-ok);border-color:color-mix(in srgb,var(--dkc-ok) 32%,transparent)}
.dkc-tag[data-tone="blocked"]{background:var(--dkc-danger-soft);color:var(--dkc-danger);border-color:color-mix(in srgb,var(--dkc-danger) 32%,transparent)}
.dkc-tag[data-tone="paused"],.dkc-tag[data-tone="stale"]{background:var(--dkc-warn-soft);color:var(--dkc-warn);border-color:color-mix(in srgb,var(--dkc-warn) 32%,transparent)}
.dkc-tag[data-tone="done"]{background:var(--dkc-ok);color:var(--dkc-on-accent)}
.dkc-tag[data-tone="accent"]{background:var(--dkc-accent);color:var(--dkc-on-accent)}
.dkc-tag[data-tone="danger"]{background:var(--dkc-danger);color:var(--dkc-on-accent)}
.dkc-tag[data-tone="warn"]{background:var(--dkc-warn-soft);color:var(--dkc-warn)}
.dkc-tag[data-tone="info"]{background:var(--dkc-accent-soft);color:var(--dkc-accent);border-color:var(--dkc-accent-line)}
.dkc-tag[data-tone="waiting"],.dkc-tag[data-tone="plain"]{background:var(--dkc-surface-3);color:var(--dkc-text-2);border-color:var(--dkc-line-soft)}
/* The task-list and scope cards inside a detail group. */
.dkc-subcard{padding:10px;border:1px solid var(--dkc-line-soft);border-radius:10px;background:var(--dkc-surface);overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.dkc-subcard:hover{border-color:var(--dkc-line)}
.dkc-subhead{display:flex;align-items:center;gap:6px;margin:0 0 8px 0;color:var(--dkc-text-2);font-size:11px;font-weight:600;line-height:18px}
.dkc-subhead b{color:var(--dkc-text);font-weight:600}
.dkc-progress{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-weight:500;color:var(--dkc-text-3);font-variant-numeric:tabular-nums;white-space:nowrap}
.dkc-bar{display:inline-block;width:46px;height:4px;border-radius:999px;background:var(--dkc-surface-3);overflow:hidden;flex:none}
.dkc-bar i{display:block;height:100%;border-radius:999px;background:var(--dkc-ok)}
.dkc-task{display:flex;align-items:flex-start;gap:7px;padding-bottom:4px;font-size:12px;line-height:18px}
.dkc-task[data-last="1"]{padding-bottom:0}
.dkc-box{flex:none;width:13px;height:13px;margin-top:2.5px;border:1.5px solid var(--dkc-line-strong);border-radius:4px;background:var(--dkc-surface);color:var(--dkc-on-accent)}
.dkc-box[data-done="1"]{background:var(--dkc-ok);border-color:var(--dkc-ok)}
.dkc-box[data-done="1"]::after{content:"";display:block;width:7px;height:4px;margin:2.5px 0 0 2px;border-left:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg)}
.dkc-task[data-done="1"] .dkc-task-text,.dkc-task[data-dropped="1"] .dkc-task-text{color:var(--dkc-text-3)}
.dkc-task[data-dropped="1"] .dkc-task-text span{text-decoration:line-through}
.dkc-task-text{flex:1 1 auto;min-width:0}
.dkc-task-text span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkc-more{margin-top:6px;padding-top:5px;border-top:1px dashed var(--dkc-line-soft);color:var(--dkc-text-3);font-size:11px;line-height:16px}
.dkc-empty{color:var(--dkc-text-3);font-size:11px;line-height:18px}
.dkc-glob{display:block;font-family:var(--dkc-mono);font-size:11px;line-height:20px;color:var(--dkc-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* An agent card. */
.dkc-agent{display:flex;flex-direction:column;align-items:stretch;padding:10px 12px;border:1px solid var(--dkc-line);border-radius:12px;background:var(--dkc-surface);box-shadow:var(--dkc-shadow)}
.dkc-agent:hover{border-color:var(--dkc-accent-line)}
.dkc-agent.dkc-selected{border-color:var(--dkc-accent);box-shadow:0 0 0 3px var(--dkc-accent-soft),var(--dkc-shadow)}
.dkc-agent[data-live="0"]{background:var(--dkc-surface-2);border-style:dashed}
.dkc-agent-top{display:flex;align-items:center;gap:7px;min-width:0;height:22px;margin-bottom:6px}
.dkc-avatar{display:inline-grid;place-items:center;flex:none;width:22px;height:22px;border-radius:50%;background:var(--dkc-accent-soft);color:var(--dkc-accent);font-size:11px;font-weight:700}
.dkc-agent[data-role="reviewer"] .dkc-avatar{background:var(--dkc-warn-soft);color:var(--dkc-warn)}
.dkc-agent-name{flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkc-live{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dkc-idle)}
.dkc-live[data-live="1"]{background:var(--dkc-ok);box-shadow:0 0 0 3px var(--dkc-ok-soft)}
.dkc-agent-meta{display:flex;align-items:center;gap:8px;min-width:0;height:16px;margin-bottom:6px;color:var(--dkc-text-2);font-size:11px;line-height:16px}
.dkc-agent-meta > span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkc-agent-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;height:16px;color:var(--dkc-text-3);font-size:11px;line-height:16px}
.dkc-agent-foot > span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkc-agent-dead{margin-top:4px;padding-top:2px;border-top:1px dashed var(--dkc-line);color:var(--dkc-danger);font-size:11px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkc-agent-open{appearance:none;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:2px;height:16px;padding:0 6px;border:1px solid var(--dkc-line);border-radius:5px;background:var(--dkc-surface);color:var(--dkc-text-2);font-size:10.5px;line-height:14px;white-space:nowrap;cursor:pointer}
.dkc-agent-open:hover{border-color:var(--dkc-accent-line);color:var(--dkc-accent);background:var(--dkc-accent-soft)}
.dkc-agent-open[disabled]{opacity:.45;cursor:default}
.dkc-agent-open svg{width:11px;height:11px;display:block}
/* 摘要 density: 58px tall (layout). */
.dkt-canvas[data-density="summary"] .dkc-agent{padding:9px 11px}
.dkt-canvas[data-density="summary"] .dkc-agent-top{height:20px;margin-bottom:4px}
.dkt-canvas[data-density="summary"] .dkc-avatar{width:18px;height:18px;font-size:10px}
.dkt-canvas[data-density="summary"] .dkc-agent-meta{height:16px;margin-bottom:0}
/* -------------------------------------------------------------- wires --- */
.dkc-wires{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none}
.dkc-wire-g{transition:opacity .15s ease}
.dkc-wire-g[data-dim="1"]{opacity:.2}
.dkc-wire,.dkc-wire-head{vector-effect:non-scaling-stroke}
.dkc-wire{fill:none;stroke:var(--dkc-idle);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;transition:stroke-width .12s ease}
.dkc-wire-head{fill:var(--dkc-idle);stroke:var(--dkc-idle);stroke-width:1;stroke-linejoin:round}
.dkc-wire-hit{fill:none;stroke:transparent;stroke-width:12;pointer-events:stroke;cursor:pointer}
.dkc-wire-hit:hover + .dkc-wire{stroke-width:3}
/* By family: what kind of relation a wire is. */
.dkc-wire-g[data-type="own"] .dkc-wire,.dkc-wire-g[data-type="former"] .dkc-wire,.dkc-wire-g[data-type="review"] .dkc-wire{stroke-width:2.2}
.dkc-wire-g[data-type="former"] .dkc-wire{stroke-dasharray:1 4}
.dkc-wire-g[data-type="message"] .dkc-wire{stroke:var(--dkc-text-3);stroke-width:1.4;stroke-dasharray:6 4}
.dkc-wire-g[data-type="message"] .dkc-wire-head{fill:var(--dkc-text-3);stroke:var(--dkc-text-3)}
.dkc-wire-g[data-type="message"][data-unread="1"] .dkc-wire{stroke:var(--dkc-accent);stroke-width:1.8;stroke-dasharray:1.5 4}
.dkc-wire-g[data-type="message"][data-unread="1"] .dkc-wire-head{fill:var(--dkc-accent);stroke:var(--dkc-accent)}
/* By state: the colour of the mission the wire is about. */
.dkc-wire-g[data-tone="running"] .dkc-wire{stroke:var(--dkc-ok)}
.dkc-wire-g[data-tone="running"] .dkc-wire-head{fill:var(--dkc-ok);stroke:var(--dkc-ok)}
.dkc-wire-g[data-tone="blocked"] .dkc-wire{stroke:var(--dkc-danger)}
.dkc-wire-g[data-tone="blocked"] .dkc-wire-head{fill:var(--dkc-danger);stroke:var(--dkc-danger)}
.dkc-wire-g[data-tone="paused"] .dkc-wire,.dkc-wire-g[data-tone="stale"] .dkc-wire{stroke:var(--dkc-warn)}
.dkc-wire-g[data-tone="paused"] .dkc-wire-head,.dkc-wire-g[data-tone="stale"] .dkc-wire-head{fill:var(--dkc-warn);stroke:var(--dkc-warn)}
.dkc-wire-g[data-tone="done"] .dkc-wire{stroke:var(--dkc-idle);stroke-dasharray:2 5}
.dkc-wire-g[data-tone="waiting"] .dkc-wire{stroke:var(--dkc-idle);stroke-dasharray:7 5}
.dkc-wire-g[data-type="dep"] .dkc-wire{stroke:var(--dkc-accent);stroke-width:1.6}
.dkc-wire-g[data-type="dep"][data-tone="done"] .dkc-wire,.dkc-wire-g[data-type="dep"][data-tone="blocked"] .dkc-wire{stroke:var(--dkc-idle)}
/* The chips, in screen space: legible at any zoom. */
.dkc-label{position:absolute;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:3px;height:16px;padding:0 5px;border:1px solid var(--dkc-line-soft);border-radius:5px;background:var(--dkc-surface);color:var(--dkc-text-2);font-size:10.5px;line-height:14px;font-weight:500;white-space:nowrap;cursor:pointer;pointer-events:auto;user-select:none;-webkit-user-select:none;box-shadow:0 1px 1px rgba(0,0,0,.04)}
.dkc-label:hover,.dkc-label[data-selected="true"]{border-color:var(--dkc-accent-line);color:var(--dkc-accent)}
.dkc-label[data-selected="true"]{background:color-mix(in srgb,var(--dkc-accent) 10%,var(--dkc-surface))}
.dkc-label[data-type="message"]{color:var(--dkc-text-3);border-style:dashed}
.dkc-label[data-type="message"][data-unread="1"]{color:var(--dkc-accent);border-style:solid;border-color:var(--dkc-accent-line)}
.dkc-label[data-unread="1"]::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--dkc-accent)}
.dkc-label[data-tone="running"]{color:color-mix(in srgb,var(--dkc-ok) 78%,var(--dkc-text))}
.dkc-label[data-tone="blocked"]{color:var(--dkc-danger)}
.dkc-label[data-tone="paused"],.dkc-label[data-tone="stale"]{color:var(--dkc-warn)}
/* ------------------------------------------------------- floating UI --- */
.dkc-float{position:absolute;z-index:4}
.dkc-legend{left:16px;top:12px;width:236px;padding:10px 12px;border:1px solid var(--dkc-line-soft);border-radius:12px;background:var(--dkc-raised);box-shadow:var(--dkc-shadow);cursor:default;user-select:none;-webkit-user-select:none}
.dkc-legend-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-size:11px;font-weight:600}
.dkc-legend-title .dkc-iconbtn{width:22px;height:22px;border-radius:6px}
.dkc-legend-title .dkc-iconbtn svg{width:13px;height:13px}
.dkc-legend dl{display:grid;grid-template-columns:52px 1fr;gap:5px 8px;margin:0;align-items:center}
.dkc-legend dt{height:12px;display:flex;align-items:center}
.dkc-legend dd{margin:0;color:var(--dkc-text-2);font-size:11px;white-space:nowrap}
.dkc-swatch{display:block;width:44px;height:0;border-top:2px solid var(--dkc-text-3)}
.dkc-swatch[data-kind="own"]{border-top-width:2.4}
.dkc-swatch[data-kind="dep"]{border-top-color:var(--dkc-accent)}
.dkc-swatch[data-kind="message"]{border-top:1.5px dashed var(--dkc-text-3)}
.dkc-swatch[data-kind="state-running"]{border-top-color:var(--dkc-ok)}
.dkc-swatch[data-kind="state-blocked"]{border-top-color:var(--dkc-danger)}
.dkc-swatch[data-kind="state-paused"]{border-top-color:var(--dkc-warn)}
.dkc-swatch[data-kind="state-done"]{border-top:2px dotted var(--dkc-idle)}
.dkc-legend-hint{margin-top:8px;padding-top:7px;border-top:1px solid var(--dkc-line-soft);color:var(--dkc-text-3);font-size:10.5px;line-height:18px}
.dkc-legend-hint kbd{display:inline-block;min-width:15px;padding:0 3px;border:1px solid var(--dkc-line);border-bottom-width:2px;border-radius:4px;background:var(--dkc-surface-2);font:inherit;font-size:10px;text-align:center;color:var(--dkc-text-2)}
.dkc-legend-toggle{left:16px;top:12px;border:1px solid var(--dkc-line-soft);background:var(--dkc-raised);box-shadow:var(--dkc-shadow)}
.dkc-zoombar{left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--dkc-line-soft);border-radius:11px;background:var(--dkc-raised);box-shadow:var(--dkc-shadow-2)}
.dkc-zoombar .dkc-iconbtn{width:26px;height:26px}
.dkc-zoom{min-width:48px;height:26px;padding:0 4px;border:0;border-radius:6px;background:transparent;text-align:center;color:var(--dkc-text-2);font-size:11px;font-variant-numeric:tabular-nums;cursor:pointer}
.dkc-zoom:hover{background:var(--dkc-hover);color:var(--dkc-text)}
.dkc-zoom-sep{width:1px;height:14px;margin:0 3px;background:var(--dkc-line-soft)}
.dkc-minimap{right:16px;bottom:16px;padding:5px;border:1px solid var(--dkc-line-soft);border-radius:10px;background:var(--dkc-raised);box-shadow:var(--dkc-shadow);overflow:hidden;cursor:pointer;touch-action:none;display:block}
.dkc-minimap-bg{fill:var(--dkc-surface-2);stroke:var(--dkc-line-soft)}
.dkc-minimap-rect{fill:var(--dkc-idle);opacity:.5}
.dkc-minimap-rect[data-tone="running"]{fill:var(--dkc-ok);opacity:.9}
.dkc-minimap-rect[data-tone="blocked"]{fill:var(--dkc-danger);opacity:.85}
.dkc-minimap-rect[data-kind="tower"]{fill:var(--dkc-accent);opacity:1}
.dkc-minimap-view{fill:var(--dkc-accent);fill-opacity:.12;stroke:var(--dkc-accent);stroke-width:1}
.dkc-toast{position:absolute;left:50%;bottom:58px;z-index:7;transform:translateX(-50%);display:flex;align-items:center;gap:6px;max-width:min(560px,70vw);padding:4px 4px 4px 12px;border:1px solid color-mix(in srgb,var(--dkc-danger) 40%,transparent);border-radius:10px;background:var(--dkc-raised);box-shadow:var(--dkc-shadow-2);color:var(--dkc-danger);font-size:12px}
.dkc-toast span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* ------------------------------------------------------------- panel ---- */
.dkc-panel{flex:none;display:flex;flex-direction:column;width:340px;min-width:0;min-height:0;border-left:1px solid var(--dkc-line-soft);background:var(--dkc-surface)}
.dkc-panel-tabs{display:flex;gap:2px;padding:8px 10px 0 10px;border-bottom:1px solid var(--dkc-line-soft);flex:none}
.dkc-panel-tabs button{appearance:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;padding:4px 9px 8px 9px;background:transparent;color:var(--dkc-text-2);font-size:12px;line-height:18px;cursor:pointer;white-space:nowrap}
.dkc-panel-tabs button:hover{color:var(--dkc-text)}
.dkc-panel-tabs button[aria-selected="true"]{color:var(--dkc-text);font-weight:600;border-bottom-color:var(--dkc-accent)}
.dkc-tab-count{margin-left:4px;color:var(--dkc-text-3);font-size:10.5px;font-variant-numeric:tabular-nums}
.dkc-panel-tabs button[aria-selected="true"] .dkc-tab-count{color:var(--dkc-accent)}
.dkc-panel-body{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 14px 24px 14px}
.dkc-detail{display:flex;flex-direction:column;gap:10px}
.dkc-detail h4{margin:0;font-size:14px;line-height:20px;font-weight:600;letter-spacing:-.005em;overflow-wrap:anywhere}
.dkc-detail-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:-4px}
.dkc-kv{display:grid;grid-template-columns:60px 1fr;gap:5px 10px;margin:0;font-size:12px;line-height:17px}
.dkc-kv dt{color:var(--dkc-text-3);white-space:nowrap}
.dkc-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.dkc-code{font-family:var(--dkc-mono);font-size:11px;color:var(--dkc-text-2)}
.dkc-link{appearance:none;border:0;padding:0;background:transparent;color:var(--dkc-accent);font:inherit;font-weight:600;cursor:pointer;text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--dkc-accent) 35%,transparent);text-underline-offset:2px}
.dkc-link:hover{text-decoration-color:var(--dkc-accent)}
.dkc-progress-line{display:flex;align-items:center;gap:8px}
.dkc-progress-line .dkc-bar{width:auto;height:6px;flex:1 1 auto}
.dkc-hint{margin:0;color:var(--dkc-text-3);font-size:11.5px;line-height:17px}
.dkc-section h5{display:flex;align-items:baseline;gap:8px;margin:4px 0 6px 0;color:var(--dkc-text-3);font-size:11px;font-weight:600}
.dkc-section h5 > span{flex:1 1 auto}
.dkc-section h5 aside{font-weight:400}
.dkc-list{margin:0;padding:0;list-style:none}
.dkc-list li{display:flex;align-items:flex-start;gap:7px;padding:5px 0;border-bottom:1px dashed var(--dkc-line-soft);font-size:12px;line-height:18px;border-radius:6px}
.dkc-list li:last-child{border-bottom:0}
.dkc-list li[data-href]{margin:0 -6px;padding-left:6px;padding-right:6px;cursor:pointer}
.dkc-list li[data-href]:hover{background:var(--dkc-hover)}
.dkc-list li[data-unread="0"] .dkc-main > span:last-child{color:var(--dkc-text-2)}
.dkc-time{flex:none;width:84px;color:var(--dkc-text-3);font-size:11px;line-height:18px;font-variant-numeric:tabular-nums}
.dkc-main{flex:1 1 auto;min-width:0}
.dkc-main > span{display:block;overflow-wrap:anywhere}
.dkc-sub{color:var(--dkc-text-3);font-size:11px}
.dkc-wrap{white-space:normal}
.dkc-list-tag{flex:none;margin-top:1px}
.dkc-dot{flex:none;width:6px;height:6px;margin-top:6px;border-radius:50%;background:var(--dkc-line-strong)}
.dkc-dot[data-unread="1"]{background:var(--dkc-accent)}
.dkc-checklist li[data-done="1"]{color:var(--dkc-text-3)}
.dkc-checklist .dkc-box{margin-top:2.5px}
.dkc-plain{margin:0;padding:0;list-style:none}
.dkc-plain li{padding:2px 0 2px 12px;font-size:12px;line-height:18px;position:relative;overflow-wrap:anywhere}
.dkc-plain li::before{content:"";position:absolute;left:1px;top:9px;width:4px;height:4px;border-radius:50%;background:var(--dkc-text-3)}
.dkc-globs li{font-family:var(--dkc-mono);font-size:11px;color:var(--dkc-text-2)}
.dkc-callout{padding:8px 10px;border:1px solid var(--dkc-line-soft);border-radius:9px;background:var(--dkc-surface-2);color:var(--dkc-text-2);font-size:11.5px;line-height:17px;overflow-wrap:anywhere}
.dkc-callout[data-tone="danger"]{border-color:color-mix(in srgb,var(--dkc-danger) 35%,transparent);background:var(--dkc-danger-soft);color:var(--dkc-danger)}
.dkc-callout .dkc-plain li::before{background:currentColor}
.dkc-quote{margin:0;padding:8px 10px;border-left:3px solid var(--dkc-accent);border-radius:0 8px 8px 0;background:var(--dkc-accent-soft);color:var(--dkc-text);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere}
.dkc-actions{display:flex;gap:8px;margin-top:2px}
.dkc-open-session{appearance:none;height:24px;padding:0 10px;border:1px solid var(--dkc-line);border-radius:7px;background:var(--dkc-surface);color:var(--dkc-text);font-size:11.5px;white-space:nowrap;cursor:pointer;flex:none}
.dkc-open-session:hover{border-color:var(--dkc-accent-line);color:var(--dkc-accent)}
.dkc-open-session[disabled]{opacity:.5;cursor:default}
.dkc-open-session-primary{background:var(--dkc-accent);border-color:var(--dkc-accent);color:var(--dkc-on-accent);font-weight:600;height:28px;padding:0 14px}
.dkc-open-session-primary:hover{color:var(--dkc-on-accent);filter:brightness(1.06)}
.dkc-list-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:20px;color:var(--dkc-text-3);font-size:11px}
.dkc-chip{appearance:none;display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 6px 0 8px;border:1px solid var(--dkc-accent-line);border-radius:999px;background:var(--dkc-accent-soft);color:var(--dkc-accent);font-size:10.5px;white-space:nowrap;cursor:pointer;max-width:200px;overflow:hidden;text-overflow:ellipsis}
.dkc-activity{margin:0;padding:0;list-style:none;font-family:var(--dkc-mono);font-size:11px;line-height:17px;color:var(--dkc-text-2)}
.dkc-activity li{display:flex;gap:8px;padding:2px 0;border-bottom:1px dashed var(--dkc-line-soft);overflow-wrap:anywhere}
.dkc-activity li:last-child{border-bottom:0}
.dkc-idx{flex:none;width:22px;color:var(--dkc-text-3);text-align:right;font-variant-numeric:tabular-nums}
.dkc-empty-panel{display:flex;flex-direction:column;gap:4px;padding:26px 8px;color:var(--dkc-text-3);font-size:12px;line-height:18px;text-align:center}
.dkc-empty-panel b{font-size:13px;font-weight:600;color:var(--dkc-text-2)}
/* ------------------------------------------------------------ states --- */
.dkc-state{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;color:var(--dkc-text-2);pointer-events:none}
.dkc-state-mark{display:grid;place-items:center;width:46px;height:46px;border:1.5px dashed var(--dkc-line-strong);border-radius:14px;color:var(--dkc-text-3);font-size:18px;font-weight:700;background:var(--dkc-surface)}
.dkc-state b{font-size:14px;font-weight:600;color:var(--dkc-text)}
.dkc-state p{margin:0;max-width:440px;font-size:12px;line-height:18px}
.dkc-open-action{pointer-events:auto;appearance:none;margin-top:4px;height:26px;padding:0 12px;border:1px solid var(--dkc-line);border-radius:7px;background:var(--dkc-surface);color:var(--dkc-text);font-size:12px;cursor:pointer}
.dkc-open-action:hover{background:var(--dkc-hover)}
@media (max-width:1180px){.dkc-panel{width:300px}.dkc-count{display:none}.dkc-seg-label{display:none}}
@media (max-width:980px){.dkc-legend{display:none}.dkc-base{display:none}.dkc-panel{width:260px}}
@media (prefers-reduced-motion:reduce){.dkt-canvas *{transition:none !important}}
`
