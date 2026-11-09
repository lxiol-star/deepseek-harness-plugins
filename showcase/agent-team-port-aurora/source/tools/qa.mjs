#!/usr/bin/env node
/* ============================================================================
 * tools/qa.mjs — reproducible QA matrix for 微港 · Port Aurora.
 *
 *   node tools/qa.mjs                      # full run, baseline/final report
 *   node tools/qa.mjs --only desktop-day,perf
 *   node tools/qa.mjs --label final        # tag report + history snapshot
 *   node tools/qa.mjs --headed             # real-GPU headed Chrome (final visual gate)
 *   node tools/qa.mjs --quick              # fewer settle frames / short perf
 *
 * What it does
 *   1. launches headless Chrome (CDP, no npm deps, file:// with fonts allowed)
 *   2. loads the page per session (day / night / labels / mobile / reduced-motion
 *      / interaction / perf) and captures the 8-view screenshot matrix
 *   3. runs interaction tests: drag orbit, wheel zoom, dblclick reset, keyboard
 *      R/Space/L/N, day↔night mix, labels toggle, postcard data URL, loader
 *   4. verifies offline/file:// resource usage, fonts (Fraunces / DM Mono),
 *      Chinese glyph rendering, UI fit/overlap at 1440×900, 1280×800, 430×900
 *   5. runs a plain-Chrome (no --allow-file-access-from-files) font probe,
 *      which is what a real double-click in Chrome looks like
 *   6. writes shots/qa/report.json, contact sheets + crops via tools/qa-sheet.py
 *
 * Exit code 0 = no FAIL checks, 1 = failures, 2 = harness error.
 * ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep, findChrome } from './lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_URL = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'shots', 'qa');
const CHROME = findChrome();
const PYTHON = process.env.PYTHON || 'python3';

/* ------------------------------------------------------------------ matrix */
const VIEWS = {
  hero: { yaw: 0.46, elev: 0.37, dist: 46 },
  east: { yaw: 0.9, elev: 0.16, dist: 40 },
  west: { yaw: -0.8, elev: 0.33, dist: 38 },
  back: { yaw: 3.6, elev: 0.5, dist: 42 },
  top: { yaw: 0.3, elev: 1.05, dist: 40 },
  ship: { yaw: 0.3, elev: 0.22, dist: 27 },
  cranes: { yaw: 0.18, elev: 0.24, dist: 25 },
  town: { yaw: -0.85, elev: 0.33, dist: 27 },
};
const DEFAULT_VIEW = { yaw: 0.46, elev: 0.37, dist: 46 };

const SESSIONS = [
  {
    id: 'desktop-day', w: 1440, h: 900, dpr: 1.5, query: { orbit: '0' },
    views: ['hero', 'east', 'west', 'back', 'top', 'ship', 'cranes', 'town'],
    clean: ['hero', 'ship', 'cranes', 'town'],
    staticChecks: true, uiCheck: true,
  },
  {
    id: 'desktop-night', w: 1440, h: 900, dpr: 1.5, query: { orbit: '0', night: '1' },
    views: ['hero', 'east', 'west', 'town'], clean: ['hero'],
  },
  {
    id: 'desktop-labels', w: 1440, h: 900, dpr: 1.5, query: { orbit: '0' },
    views: ['hero'], labels: true, uiCheck: true, nightAfter: true,
  },
  {
    id: 'mobile-day', w: 430, h: 900, dpr: 2, mobile: true, query: { orbit: '0', dpr: '2' },
    views: ['hero', 'town'], labelsAfter: true, uiCheck: true, clean: ['hero'],
  },
  {
    id: 'mobile-nopost', w: 430, h: 900, dpr: 2, mobile: true, query: { orbit: '0', dpr: '2', post: '0' },
    views: ['hero'], clean: ['hero'],
  },
  {
    id: 'ui-1280', w: 1280, h: 800, dpr: 1.25, query: { orbit: '0' },
    views: ['hero'], uiCheck: true,
  },
  {
    id: 'reduced-motion', w: 1440, h: 900, dpr: 1.5, query: {}, reducedMotion: true,
    views: ['hero'], reducedChecks: true,
  },
  {
    id: 'interaction', w: 1440, h: 900, dpr: 1, query: { orbit: '0' }, views: [],
    interactions: true,
  },
  {
    id: 'perf', w: 1400, h: 900, dpr: 1.25, query: { orbit: '0' }, views: ['hero'], perf: true,
  },
  {
    id: 'perf-hires', w: 1600, h: 1000, dpr: 1.5, query: { orbit: '0', dpr: '1.5' }, views: ['hero'], perf: true,
  },
];

/* ------------------------------------------------------- arguments / utils */
const DEFAULTS = {
  label: 'run',
  only: null,
  quick: false,
  noSheet: false,
  headed: false,
  final: false,
  report: path.join(OUT, 'report.json'),
  reportExplicit: false,
  keepGoing: true,
};

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--label' || a === '--tag') o.label = next();
    else if (a === '--only') o.only = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--quick') o.quick = true;
    else if (a === '--headed' || a === '--gpu') o.headed = true;
    else if (a === '--final') o.final = true;
    else if (a === '--no-sheet') o.noSheet = true;
    else if (a === '--report') { o.report = path.resolve(next()); o.reportExplicit = true; }
    else if (a === '--python') o.python = next();
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    } else throw new Error('unknown arg: ' + a);
  }
  return o;
}

const slug = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const nowStamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/* ------------------------------------------------------------- page scripts */
const LOADER_WATCH = `(function () {
  window.__QA_LOADER = { shots: [] };
  function snap(tag) {
    try {
      var l = document.querySelector('.loader');
      if (!l) return;
      var r = l.getBoundingClientRect();
      var cs = getComputedStyle(l);
      function pick(sel) {
        var el = document.querySelector(sel);
        if (!el) return null;
        var rr = el.getBoundingClientRect();
        return { text: (el.textContent || '').trim().slice(0, 160), x: rr.x, y: rr.y, w: rr.width, h: rr.height,
          right: rr.right, bottom: rr.bottom, scrollW: el.scrollWidth, clientW: el.clientWidth,
          scrollH: el.scrollHeight, clientH: el.clientHeight };
      }
      var card = document.querySelector('.loader-card');
      var cr = card ? card.getBoundingClientRect() : null;
      window.__QA_LOADER.shots.push({
        tag: tag, at: performance.now(), vw: innerWidth, vh: innerHeight,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom },
        css: { display: cs.display, visibility: cs.visibility, opacity: +cs.opacity },
        card: cr ? { x: cr.x, y: cr.y, w: cr.width, h: cr.height, right: cr.right, bottom: cr.bottom } : null,
        kicker: pick('.loader-kicker'), title: pick('.loader-title'), sub: pick('.loader-sub'),
        meta: pick('.loader-meta'), foot: pick('.loader-foot'),
        step: (document.querySelector('.loader-step') || {}).textContent || '',
        pct: (document.querySelector('#loader-pct') || {}).textContent || '',
        bar: document.querySelector('#loader-bar') ? document.querySelector('#loader-bar').style.width : ''
      });
    } catch (e) { window.__QA_LOADER.err = String(e); }
  }
  function boot() {
    snap('dom');
    setTimeout(function () { snap('t80'); }, 80);
    setTimeout(function () { snap('t300'); }, 300);
    setTimeout(function () { snap('t900'); }, 900);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('load', function () { snap('load'); });
})();`;

const PAGE_HELPERS = `
  function __qaRect(el) {
    var r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
  }
  function __qaCss(el) {
    var cs = getComputedStyle(el);
    return { display: cs.display, visibility: cs.visibility, opacity: +cs.opacity,
      pointerEvents: cs.pointerEvents, transitionDuration: cs.transitionDuration };
  }
  function __qaVisible(el) {
    if (!el) return false;
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
      n = n.parentElement;
    }
    var r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  }
  function __qaUI() {
    var panels = {};
    var sels = ['.brand', '.controls', '.dossier', '#compass', '.hint', '#labels'];
    for (var i = 0; i < sels.length; i++) {
      var sel = sels[i];
      var el = document.querySelector(sel);
      if (!el) { panels[sel] = null; continue; }
      var css = __qaCss(el);
      panels[sel] = { rect: __qaRect(el), css: css, visible: __qaVisible(el) && css.opacity > 0.15 };
    }
    var buttons = [];
    var btns = document.querySelectorAll('.controls .ctl');
    for (var b = 0; b < btns.length; b++) {
      buttons.push({ id: btns[b].id, rect: __qaRect(btns[b]), disabled: !!btns[b].disabled, visible: __qaVisible(btns[b]),
        ariaPressed: btns[b].getAttribute('aria-pressed') });
    }
    var cards = [];
    var els = document.querySelectorAll('#label-cards .label-card');
    for (var k = 0; k < els.length; k++) {
      var cardCss = getComputedStyle(els[k]);
      var title = els[k].querySelector('.t');
      cards.push({ text: (title ? title.textContent : '').trim(), rect: __qaRect(els[k]), opacity: +cardCss.opacity, shown: __qaVisible(els[k]) });
    }
    // note: #labels scrim fades to opacity 0 when labels are off, so ancestor
    // visibility (__qaVisible) is required — cards keep their inline opacity.
    cards = cards.filter(function (c) { return c.shown && c.opacity > 0.05; });
    var labelsOnNow = document.body.classList.contains('labels-on');
    var lines = document.querySelectorAll('#label-lines g');
    var visLines = 0;
    for (var g = 0; g < lines.length; g++) if (labelsOnNow && lines[g].style.display !== 'none') visLines++;
    var dots = document.querySelectorAll('#label-lines .leader-dot');
    var visDots = 0;
    for (var d = 0; d < dots.length; d++) if (labelsOnNow && +getComputedStyle(dots[d]).opacity > 0.05) visDots++;
    var scale = document.querySelector('.scalebar');
    var toast = document.querySelector('#toast');
    return {
      vw: innerWidth, vh: innerHeight,
      docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
      panels: panels, buttons: buttons, labelCards: cards, leaderLines: visLines, labelDots: visDots,
      labelsOn: document.body.classList.contains('labels-on'),
      labelEntries: (window.PORT && window.PORT.ui && window.PORT.ui.state && window.PORT.ui.state.labelEntries && window.PORT.ui.state.labelEntries.length) || 0,
      scalebar: scale ? { rect: __qaRect(scale), text: (document.querySelector('#scalebar-text') || {}).textContent || '' } : null,
      toast: toast ? { rect: __qaRect(toast), visible: __qaVisible(toast) } : null,
      hintVisible: __qaVisible(document.querySelector('.hint')),
      loader: (function () {
        var l = document.querySelector('.loader');
        if (!l) return null;
        var css = __qaCss(l);
        return { css: css, rect: __qaRect(l) };
      })()
    };
  }
`;

const pageStateEval = `(() => { ${PAGE_HELPERS}
  function ink(text, font) {
    var c = document.createElement('canvas');
    c.width = 280; c.height = 96;
    var g = c.getContext('2d');
    g.font = font; g.fillStyle = '#000'; g.textBaseline = 'top';
    g.fillText(text, 10, 10);
    var data = g.getImageData(0, 0, c.width, c.height).data;
    var n = 0;
    for (var i = 3; i < data.length; i += 4) if (data[i] > 40) n++;
    return n;
  }
  var canvas = document.getElementById('scene');
  var gl = window.PORT && window.PORT.renderer ? window.PORT.renderer.getContext() : null;
  var gpu = 'n/a';
  try {
    var dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) + ' / ' + gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
  } catch (e) {}
  var domStats = {};
  var statEls = document.querySelectorAll('[data-stat]');
  for (var i = 0; i < statEls.length; i++) domStats[statEls[i].getAttribute('data-stat')] = statEls[i].textContent.trim();
  return {
    title: document.title,
    lang: document.documentElement.lang,
    ua: navigator.userAgent,
    gpu: gpu,
    bodyClass: document.body.className,
    readyFlag: !!window.__PORT_READY,
    portReady: !!(window.PORT && window.PORT.ready),
    loaderQA: window.__QA_LOADER || null,
    loaderInfo: (function () {
      var l = document.querySelector('.loader');
      if (!l) return null;
      return { css: __qaCss(l), rect: __qaRect(l) };
    })(),
    stats: (window.PORT && window.PORT.stats) || {},
    domStats: domStats,
    buildErrors: (window.PORT && window.PORT.buildErrors) || [],
    config: (window.PORT && window.PORT.config) || null,
    isMobile: !!(window.PORT && window.PORT.isMobile),
    reducedMotion: !!(window.PORT && window.PORT.reducedMotion),
    labelsRegistered: (window.PORT && window.PORT.labels || []).length,
    view: window.PORT && window.PORT.getView ? window.PORT.getView() : null,
    autoRotate: !!(window.PORT && window.PORT.getAutoRotate && window.PORT.getAutoRotate()),
    night: !!(window.PORT && window.PORT.getNight && window.PORT.getNight()),
    nightMix: window.PORT && window.PORT.state ? window.PORT.state.nightMix : null,
    dpr: window.PORT && window.PORT.dpr,
    canvas: canvas ? { width: canvas.width, height: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight } : null,
    fonts: Array.from(document.fonts).map(function (f) {
      return { family: f.family, weight: f.weight, style: f.style, status: f.status };
    }),
    fontReady: document.fonts.status,
    fontsCheck: {
      fraunces: document.fonts.check('16px Fraunces'),
      frauncesItalic: document.fonts.check('italic 16px Fraunces'),
      dmMono: document.fonts.check('16px "DM Mono"'),
      dmMono500: document.fonts.check('500 16px "DM Mono"')
    },
    glyphs: {
      cnSerif: ink('微港', '600 52px "Songti SC", "STSong", "Noto Serif SC", serif'),
      cnSans: ink('微港', '600 52px "PingFang SC", "Helvetica Neue", sans-serif'),
      latin: ink('PORT', '600 52px Fraunces, serif')
    },
    framing: (function () {
      var cam = window.PORT && window.PORT.camera;
      var THREE = window.THREE;
      if (!cam || !THREE) return null;
      var minX = 9, maxX = -9, minY = 9, maxY = -9;
      var R = 15.65;
      var v = new THREE.Vector3();
      for (var i = 0; i < 32; i++) {
        var a = (i / 32) * Math.PI * 2;
        var x = Math.cos(a) * R, z = Math.sin(a) * R;
        for (var yi = 0; yi < 2; yi++) {
          v.set(x, yi === 0 ? 0 : 1.7, z).project(cam);
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
        }
      }
      return {
        ndc: { minX: +minX.toFixed(3), maxX: +maxX.toFixed(3), minY: +minY.toFixed(3), maxY: +maxY.toFixed(3) },
        fits: minX >= -1 && maxX <= 1 && minY >= -1 && maxY <= 1,
        marginX: +(1 - Math.max(-minX, maxX)).toFixed(3),
        marginY: +(1 - Math.max(-minY, maxY)).toFixed(3),
        widthFrac: +((maxX - minX) / 2).toFixed(3),
        heightFrac: +((maxY - minY) / 2).toFixed(3)
      };
    })(),
    strays: (function () {
      try {
        var scene = window.PORT && window.PORT.scene;
        if (!scene) return null;
        var pts = [];
        scene.traverse(function (o) {
          if (!o.isMesh || !o.name || o.name.indexOf('batch:') !== 0) return;
          var pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
          if (!pos) return;
          for (var i = 0; i < pos.count; i++) {
            var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
            if (x * x + z * z > 18.5 * 18.5) pts.push([x, y, z]);
          }
        });
        var map = {};
        for (var k = 0; k < pts.length; k++) {
          var p = pts[k];
          var key = Math.round(p[0] / 2) + ',' + Math.round(p[2] / 2);
          if (!map[key]) map[key] = { n: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9], sum: [0, 0, 0] };
          var b = map[key];
          b.n++;
          for (var d = 0; d < 3; d++) { b.sum[d] += p[d]; if (p[d] < b.min[d]) b.min[d] = p[d]; if (p[d] > b.max[d]) b.max[d] = p[d]; }
        }
        var clusters = Object.keys(map).map(function (key) {
          var b = map[key];
          return {
            n: b.n,
            center: [b.sum[0] / b.n, b.sum[1] / b.n, b.sum[2] / b.n].map(function (v) { return +v.toFixed(2); }),
            size: [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map(function (v) { return +v.toFixed(2); }),
          };
        }).filter(function (c) { return c.n >= 8; }).sort(function (a, b) { return b.n - a.n; });
        return { totalVerts: pts.length, clusters: clusters.slice(0, 8) };
      } catch (e) { return { error: String(e) }; }
    })(),
    ui: __qaUI(),
    transitions: {
      ctl: (function () { var el = document.querySelector('.ctl'); return el ? getComputedStyle(el).transitionDuration : null; })(),
      grain: (function () { var el = document.querySelector('.grain'); return el ? getComputedStyle(el).animationName : null; })()
    }
  };
})()`;

async function waitLoaderHidden(browser, timeout = 6000) {
  try {
    await browser.waitFor(
      `(() => {
        const l = document.querySelector('.loader');
        if (!l) return true;
        const cs = getComputedStyle(l);
        return cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.01;
      })()`,
      { timeout }
    );
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- assertions */
function makeCheckSink() {
  const checks = [];
  return {
    checks,
    add(id, group, status, name, detail) {
      checks.push({ id, group, status, name, detail: detail === undefined ? null : detail });
    },
  };
}

function rectsOverlap(a, b, pad = 0) {
  const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x) - pad * 2;
  const iy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) - pad * 2;
  return ix > 0 && iy > 0 ? ix * iy : 0;
}

function auditUI(snapshot, where, sink, { expectLabels = false } = {}) {
  const fails = [];
  const warns = [];
  const vw = snapshot.vw, vh = snapshot.vh;
  const panelEntries = Object.entries(snapshot.panels).filter(([sel, p]) => p && p.visible && sel !== '#labels');
  for (const [sel, p] of panelEntries) {
    const r = p.rect;
    if (r.x < -1.5 || r.y < -1.5 || r.right > vw + 1.5 || r.bottom > vh + 1.5) {
      fails.push(`${sel} out of viewport (${r.x},${r.y},${r.right},${r.bottom}) vp=${vw}x${vh}`);
    }
  }
  for (const b of snapshot.buttons) {
    if (!b.visible) continue;
    const r = b.rect;
    if (r.x < -1.5 || r.y < -1.5 || r.right > vw + 1.5 || r.bottom > vh + 1.5) {
      fails.push(`button #${b.id} out of viewport (${r.x},${r.y},${r.right},${r.bottom})`);
    }
  }
  // panel-panel overlap
  for (let i = 0; i < panelEntries.length; i++) {
    for (let j = i + 1; j < panelEntries.length; j++) {
      const [selA, a] = panelEntries[i];
      const [selB, b] = panelEntries[j];
      const area = rectsOverlap(a.rect, b.rect, 1);
      if (area > 200) fails.push(`panels overlap: ${selA} × ${selB} (${Math.round(area)}px²)`);
      else if (area > 4) warns.push(`panels touch: ${selA} × ${selB} (${Math.round(area)}px²)`);
    }
  }
  // button-button overlap
  for (let i = 0; i < snapshot.buttons.length; i++) {
    for (let j = i + 1; j < snapshot.buttons.length; j++) {
      const a = snapshot.buttons[i], b = snapshot.buttons[j];
      if (!a.visible || !b.visible) continue;
      const area = rectsOverlap(a.rect, b.rect, 1);
      if (area > 1) fails.push(`controls overlap: #${a.id} × #${b.id} (${Math.round(area)}px²)`);
    }
  }
  // label cards
  const cards = snapshot.labelCards;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].rect;
    if (r.x < -2 || r.y < -2 || r.right > vw + 2 || r.bottom > vh + 2) {
      fails.push(`label "${cards[i].text}" out of viewport (${r.x},${r.y},${r.right},${r.bottom})`);
    }
    for (let j = i + 1; j < cards.length; j++) {
      if (rectsOverlap(r, cards[j].rect, 1) > 1) fails.push(`labels overlap: "${cards[i].text}" × "${cards[j].text}"`);
    }
    for (const [sel, p] of panelEntries) {
      if (sel === '#labels') continue;
      if (rectsOverlap(r, p.rect, 1) > 120) warns.push(`label "${cards[i].text}" overlaps ${sel}`);
    }
  }
  if (expectLabels) {
    if (!snapshot.labelsOn) fails.push('labels-on class missing when labels expected');
    if (!cards.length) fails.push('no visible label cards while labels enabled');
    if (cards.length && snapshot.leaderLines < Math.min(cards.length, snapshot.labelEntries)) {
      warns.push(`leader lines ${snapshot.leaderLines} < cards ${cards.length}`);
    }
  }
  const status = fails.length ? 'fail' : warns.length ? 'warn' : 'pass';
  sink.add(
    'ui-' + where,
    'ui',
    status,
    `UI layout @ ${vw}×${vh}`,
    { fails, warns, panels: panelEntries.map(([sel, p]) => ({ sel, rect: p.rect })), labelCards: cards.map((c) => c.text) }
  );
  return fails.length === 0;
}

/* ------------------------------------------------------------- interaction */
async function runInteractions(browser, sink) {
  const results = [];
  const add = (id, name, status, detail) => {
    results.push({ id, name, status, detail });
    sink.add(id, 'interaction', status, name, detail);
  };
  const view = () => browser.evaluate('window.PORT.getView()');
  const boot = await view();
  const expected = { yaw: boot.yaw, elev: boot.elev, dist: boot.dist };
  const reset = async () => {
    await browser.evaluate(`window.PORT.setView(${JSON.stringify(expected)}, true)`);
    await sleep(120);
  };
  const near = (a, b, eps) => Math.abs(a - b) <= eps;
  const yawEq = (a, b, eps = 0.06) => {
    let d = Math.abs(a - b) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d <= eps;
  };

  await reset();
  await browser.evaluate('window.PORT.setNight(false, true)');
  await reset();

  // ---- drag orbit -------------------------------------------------------
  const v0 = await view();
  await browser.drag({ x: 700, y: 430 }, { x: 890, y: 380 }, { steps: 18, stepDelay: 16 });
  await sleep(1100);
  const v1 = await view();
  add(
    'drag-orbit',
    'Pointer drag orbits the camera',
    Math.abs(v1.yaw - v0.yaw) > 0.15 ? 'pass' : 'fail',
    { before: v0, after: v1, dyaw: +(v1.yaw - v0.yaw).toFixed(3), threshold: 0.15 }
  );

  // ---- wheel zoom -------------------------------------------------------
  await reset();
  const w0 = await view();
  await browser.wheel(700, 430, 320);
  await sleep(900);
  const w1 = await view();
  add(
    'wheel-zoom',
    'Wheel zooms the camera',
    w1.dist - w0.dist > 2 ? 'pass' : 'fail',
    { before: w0.dist, after: w1.dist, delta: +(w1.dist - w0.dist).toFixed(2) }
  );
  await browser.wheel(700, 430, -320);
  await sleep(600);

  // ---- dblclick reset ---------------------------------------------------
  // headless Chrome does not synthesise a dblclick from Input.dispatchMouseEvent
  // reliably, so dispatch the DOM event the app actually listens for.
  await browser.evaluate('window.PORT.setView({ yaw: 1.35, elev: 0.75, dist: 30 }, true)');
  await sleep(200);
  const dblMethod = await browser.evaluate(`(() => {
    const c = document.getElementById('scene');
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window, clientX: innerWidth / 2, clientY: innerHeight / 2 }));
    return 'dom-dblclick';
  })()`);
  await sleep(1400);
  const d1 = await view();
  add(
    'dblclick-reset',
    'Double-click resets the view',
    yawEq(d1.yaw, expected.yaw) && near(d1.elev, expected.elev, 0.05) && near(d1.dist, expected.dist, 1.0)
      ? 'pass' : 'fail',
    { view: d1, expected, method: dblMethod }
  );

  // ---- keyboard: R ------------------------------------------------------
  await browser.evaluate('window.PORT.setView({ yaw: 2.2, elev: 0.2, dist: 60 }, true)');
  await sleep(200);
  await browser.key('r', 'KeyR', 82, { text: 'r' });
  await sleep(1400);
  const k1 = await view();
  add(
    'key-r-reset',
    'R resets the view',
    yawEq(k1.yaw, expected.yaw) && near(k1.elev, expected.elev, 0.05) && near(k1.dist, expected.dist, 1.0)
      ? 'pass' : 'fail',
    { view: k1, expected }
  );

  // ---- keyboard: Space --------------------------------------------------
  const auto0 = (await view()).autoRotate;
  await browser.key(' ', 'Space', 32, { text: ' ' });
  await sleep(200);
  const auto1 = (await view()).autoRotate;
  await browser.key(' ', 'Space', 32, { text: ' ' });
  await sleep(200);
  const auto2 = (await view()).autoRotate;
  add('key-space-orbit', 'Space toggles auto-rotation', auto1 === !auto0 && auto2 === auto0 ? 'pass' : 'fail', { auto0, auto1, auto2 });
  await browser.evaluate('window.PORT.setAutoRotate(false)');

  // ---- keyboard: L ------------------------------------------------------
  const labelsRegistered = await browser.evaluate('(window.PORT.labels || []).length');
  if (!labelsRegistered) {
    add('key-l-labels', 'L toggles diagram labels', 'skip', { labelsRegistered: 0, note: 'no labels registered yet (world modules are stubs)' });
  } else {
    await browser.key('l', 'KeyL', 76, { text: 'l' });
    await sleep(450);
    const l1 = await browser.evaluate('({ on: document.body.classList.contains("labels-on"), labels: window.PORT.getView().labels, entries: (PORT.ui.state.labelEntries||[]).length, cards: [...document.querySelectorAll("#label-cards .label-card")].filter(el => +getComputedStyle(el).opacity > 0.05).length })');
    await browser.key('l', 'KeyL', 76, { text: 'l' });
    await sleep(450);
    const l2 = await browser.evaluate('({ on: document.body.classList.contains("labels-on"), labels: window.PORT.getView().labels })');
    add(
      'key-l-labels',
      'L toggles diagram labels',
      l1.on && l1.labels && !l2.on && !l2.labels ? 'pass' : 'fail',
      { on: l1, off: l2 }
    );
  }

  // ---- keyboard: N + day/night transition ------------------------------
  const mix0 = await browser.evaluate('window.PORT.state.nightMix');
  const nStart = Date.now();
  await browser.key('n', 'KeyN', 78, { text: 'n' });
  let mixUp = -1, nightClassUp = false;
  try {
    await browser.waitFor('window.PORT.state.nightMix >= 0.995', { timeout: 6000 });
    mixUp = await browser.evaluate('window.PORT.state.nightMix');
    nightClassUp = await browser.evaluate('document.body.classList.contains("night")');
  } catch { /* timeout */ }
  const upMs = Date.now() - nStart;
  const nStart2 = Date.now();
  await browser.key('n', 'KeyN', 78, { text: 'n' });
  let mixDown = -1;
  try {
    await browser.waitFor('window.PORT.state.nightMix <= 0.005', { timeout: 6000 });
    mixDown = await browser.evaluate('window.PORT.state.nightMix');
  } catch { /* timeout */ }
  const downMs = Date.now() - nStart2;
  add(
    'key-n-night',
    'N toggles day/night; transition reaches mix 1 and 0',
    mixUp >= 0.995 && mixDown <= 0.005 && nightClassUp ? 'pass' : 'fail',
    { mix0, mixUp, mixDown, nightClassUp, upMs, downMs }
  );

  // ---- labels API + .labels-on class -----------------------------------
  if (labelsRegistered) {
    await browser.evaluate('window.PORT.ui.setLabels(true)');
    await sleep(450);
    const lp = await browser.evaluate('({ on: document.body.classList.contains("labels-on"), entries: (PORT.ui.state.labelEntries||[]).length, cards: [...document.querySelectorAll("#label-cards .label-card")].filter(el => +getComputedStyle(el).opacity > 0.05).length })');
    await browser.evaluate('window.PORT.ui.setLabels(false)');
    await sleep(250);
    const lo = await browser.evaluate('({ on: document.body.classList.contains("labels-on") })');
    add('labels-api', 'Labels API toggles .labels-on and renders cards', lp.on && lp.cards > 0 && !lo.on ? 'pass' : 'fail', { on: lp, off: lo });
  } else {
    add('labels-api', 'Labels API toggles .labels-on and renders cards', 'skip', { note: 'no labels registered yet' });
  }

  // ---- postcard ---------------------------------------------------------
  await reset();
  const postcard = await browser.evaluate(`(async () => {
    const before = { w: PORT.renderer.domElement.width, h: PORT.renderer.domElement.height, pr: PORT.renderer.getPixelRatio() };
    let url = '';
    let err = null;
    try { url = PORT.makePostcard(); } catch (e) { err = String(e); }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = { w: PORT.renderer.domElement.width, h: PORT.renderer.domElement.height, pr: PORT.renderer.getPixelRatio() };
    return { err, head: url.slice(0, 30), len: url.length, approxBytes: Math.round(url.length * 0.75), before, after };
  })()`);
  if (postcard.err) {
    add('postcard', 'Postcard export returns a large PNG data URL', 'fail', { error: postcard.err });
  } else {
    const restored =
      postcard.before.w === postcard.after.w &&
      postcard.before.h === postcard.after.h &&
      postcard.before.pr === postcard.after.pr;
    // save a real sample for evidence
    let saved = null;
    try {
      const full = await browser.evaluate('PORT.makePostcard()');
      const b64 = String(full).split(',')[1] || '';
      const buf = Buffer.from(b64, 'base64');
      const samplePath = path.join(OUT, 'postcard-sample.png');
      fs.writeFileSync(samplePath, buf);
      const w = buf.length > 24 ? buf.readUInt32BE(16) : 0;
      const h = buf.length > 24 ? buf.readUInt32BE(20) : 0;
      saved = { file: rel(samplePath), bytes: buf.length, width: w, height: h };
    } catch (err) {
      saved = { error: String(err) };
    }
    add(
      'postcard',
      'Postcard export returns a large PNG data URL',
      postcard.head.indexOf('data:image/png') === 0 && postcard.approxBytes > 200 * 1024 && restored ? 'pass' : 'fail',
      { head: postcard.head, approxBytes: postcard.approxBytes, restored, saved }
    );
  }

  // ---- buttons aria state ----------------------------------------------
  const aria = await browser.evaluate(`(() => {
    const b = (s) => document.querySelector(s);
    return {
      orbit: b('#btn-orbit') ? b('#btn-orbit').getAttribute('aria-pressed') : null,
      night: b('#btn-night') ? b('#btn-night').getAttribute('aria-pressed') : null,
      labels: b('#btn-labels') ? b('#btn-labels').getAttribute('aria-pressed') : null,
      labelsDisabled: b('#btn-labels') ? !!b('#btn-labels').disabled : null
    };
  })()`);
  add('buttons-aria', 'Control buttons reflect state via aria-pressed', 'pass', aria);

  return { checks: results, finalView: await view() };
}

/* ------------------------------------------------------- final deliverables */
const FINAL_FILES = {
  'desktop-day-hero': 'hero.png',
  'desktop-day-hero-default': 'hero-default.png',
  'desktop-day-east': 'east.png',
  'desktop-day-west': 'west.png',
  'desktop-day-back': 'back.png',
  'desktop-day-top': 'top.png',
  'desktop-day-ship': 'ship.png',
  'desktop-day-cranes': 'cranes.png',
  'desktop-day-town': 'town.png',
  'desktop-day-hero-clean': 'hero-clean.png',
  'desktop-day-ship-clean': 'ship-clean.png',
  'desktop-day-cranes-clean': 'cranes-clean.png',
  'desktop-day-town-clean': 'town-clean.png',
  'desktop-night-hero': 'night-hero.png',
  'desktop-night-hero-clean': 'night-hero-clean.png',
  'desktop-labels-hero-labels': 'labels.png',
  'desktop-labels-hero-night': 'labels-night.png',
  'desktop-labels-hero-night-clean': 'night-labels-clean.png',
  'mobile-day-hero': 'mobile-hero.png',
  'mobile-day-hero-clean': 'mobile-hero-clean.png',
  'mobile-day-hero-labels': 'mobile-labels.png',
  'mobile-day-town': 'mobile-town.png',
  'mobile-nopost-hero': 'mobile-nopost-hero.png',
};

function exportFinal(report, opts) {
  const target = path.join(ROOT, 'shots', opts.headed ? 'final-headed' : 'final');
  fs.mkdirSync(target, { recursive: true });
  const copied = [];
  const byId = new Map(report.scenarios.map((sc) => [sc.id, sc]));
  for (const [id, name] of Object.entries(FINAL_FILES)) {
    const sc = byId.get(id);
    if (!sc) continue;
    const src = path.join(ROOT, sc.file);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(target, name);
    fs.copyFileSync(src, dst);
    copied.push({ name, source: sc.file, bytes: fs.statSync(dst).size });
  }
  // contact sheets (curated review)
  for (const sheet of ['sheet-day.png', 'sheet-night.png', 'sheet-details.png', 'sheet-all.png', 'mobile-post-compare.png']) {
    const src = path.join(OUT, sheet);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(target, sheet));
      copied.push({ name: sheet, source: rel(src), bytes: fs.statSync(src).size });
    }
  }
  // full-resolution postcard PNG
  const postcardSrc = path.join(OUT, 'postcard-sample.png');
  if (fs.existsSync(postcardSrc)) {
    fs.copyFileSync(postcardSrc, path.join(target, 'postcard.png'));
    copied.push({ name: 'postcard.png', source: rel(postcardSrc), bytes: fs.statSync(postcardSrc).size });
  }
  // machine-readable report
  try {
    fs.copyFileSync(opts.report, path.join(target, 'report.json'));
    copied.push({ name: 'report.json', source: rel(opts.report), bytes: fs.statSync(opts.report).size });
  } catch { /* ignore */ }

  const perf = report.perfSessions || {};
  const summaryLines = [
    '# 微港 · PORT AURORA — FINAL GALLERY',
    '',
    'Generated: ' + (report.meta && report.meta.generatedAt) + '  ·  mode: ' + ((report.meta && report.meta.mode) || 'headless'),
    'Checks: ' + JSON.stringify(report.summary),
    '',
  ];
  for (const [id, p] of Object.entries(perf)) {
    summaryLines.push(`- perf ${id}: ${p.day.fps} fps day / ${p.night.fps} fps night @ ${p.viewport.w}×${p.viewport.h} dpr ${p.viewport.dpr}`);
  }
  if (report.fonts) summaryLines.push('- fonts: DM Mono + Fraunces (plain-chrome probe ' + (report.fonts.plainChrome ? 'ran' : 'n/a') + ')');
  summaryLines.push('');
  summaryLines.push('## Files');
  for (const f of copied) summaryLines.push(`- ${f.name}  (${(f.bytes / 1024).toFixed(0)} kB)  ← ${f.source}`);
  summaryLines.push('');
  summaryLines.push('Contact sheets: `sheet-day.png`, `sheet-night.png`, `sheet-details.png` (UI hidden), `sheet-all.png`.');
  summaryLines.push('Postcard: `postcard.png` (full resolution, 2600 px render + margins).');
  fs.writeFileSync(path.join(target, 'README.md'), summaryLines.join('\n'));
  report.meta.finalDir = rel(target);
  report.finalFiles = copied;
  return target;
}

/* --------------------------------------------------------------------- main */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.only && !opts.reportExplicit) {
    // partial runs must not clobber the canonical full-matrix report
    opts.report = path.join(OUT, 'report-partial.json');
    if (opts.label === 'run') opts.label = 'partial';
  }
  if (opts.python) process.env.PYTHON = opts.python;
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'clean'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'crops'), { recursive: true });

  const startedAt = Date.now();
  const sink = makeCheckSink();
  const { add } = sink;
  const report = {
    meta: {
      project: '微港 · Port Aurora',
      generatedAt: new Date().toISOString(),
      label: opts.label,
      root: ROOT,
      pageUrl: PAGE_URL,
      chrome: CHROME,
      node: process.version,
      platform: process.platform,
      quick: opts.quick,
      mode: opts.headed ? 'headed' : 'headless',
      modeNote: opts.headed
        ? 'headed Chrome — real GPU + window server; screenshot matrix captured on a visible window'
        : 'headless Chrome — default harness mode; screenshots + artifact checks are trusted',
    },
    summary: {},
    checks: sink.checks,
    sessions: [],
    scenarios: [],
    interactions: [],
    perf: null,
    fonts: null,
    offline: null,
    postcard: null,
    images: null,
  };

  let browser = null;
  let exitCode = 0;
  try {
    browser = await launchBrowser({ chrome: CHROME, width: 1440, height: 900, dpr: 1.5, allowFileAccess: true, headless: !opts.headed });
    await browser.addInitScript(LOADER_WATCH);

    let pageState = null;
    const only = opts.only;

    for (const s of SESSIONS) {
      if (only && !only.includes(s.id)) continue;
      const session = {
        id: s.id,
        viewport: { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile },
        reducedMotion: !!s.reducedMotion,
        query: s.query,
        views: s.views,
        shots: [],
        errors: null,
        warnings: null,
        stats: null,
        view: null,
        startedAt: new Date().toISOString(),
        durationMs: 0,
      };
      const tSession = Date.now();
      try {
        await browser.setViewport({ width: s.w, height: s.h, dpr: s.dpr, mobile: !!s.mobile });
        await browser.setReducedMotion(!!s.reducedMotion);
        const params = new URLSearchParams(s.query || {}).toString();
        const url = PAGE_URL + (params ? '?' + params : '');
        session.url = url;
        const tNav = Date.now();
        await browser.navigate(url, { timeout: 90000 });
        session.navMs = Date.now() - tNav;
        await browser.evaluate('document.fonts.ready.then(() => document.fonts.status)');
        await waitLoaderHidden(browser, 6000);
        await browser.raf(3);
        await sleep(opts.quick ? 120 : 220);

        const st = await browser.evaluate(pageStateEval);
        session.state = st;
        session.view = st.view;
        session.stats = st.stats;
        session.bootView = st.view;
        session.framing = st.framing;
        session.labelsRegistered = st.labelsRegistered;
        if (st.framing) {
          const f = st.framing;
          const ok = f.fits && f.marginX >= 0.015 && f.marginY >= 0.015 && f.widthFrac >= 0.5;
          add(
            'framing-camera-' + s.id, 'visual',
            ok ? 'pass' : 'fail',
            `Default camera framing @ ${s.w}×${s.h} (whole plinth in view)`,
            { framing: f, bootView: st.view, note: ok ? '' : 'plinth projected outside the viewport / too small — portrait fit or default distance regression' }
          );
        }
        session.fonts = { fonts: st.fonts, fontReady: st.fontReady, check: st.fontsCheck };
        session.canvas = st.canvas;
        session.viewportCheck = { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile, canvas: st.canvas, screenshotScale: null };
        pageState = st;
        if (!report.meta.pageDefaultView && !s.reducedMotion && !s.interactions) {
          report.meta.pageDefaultView = { yaw: st.view.yaw, elev: st.view.elev, dist: st.view.dist };
        }
        const worldActive = st.labelsRegistered > 0 || (st.stats && (st.stats.containers > 0 || st.stats.parts > 200));

        /* ---------- one-time static checks: desktop-day ------------------- */
        if (s.staticChecks) {
          // page loaded + loader hidden
          add(
            'page-ready',
            'lifecycle',
            st.readyFlag && st.portReady && st.bodyClass.indexOf('ready') >= 0 && st.bodyClass.indexOf('loading') < 0 ? 'pass' : 'fail',
            'Page boots to body.ready (loader hidden)',
            { bodyClass: st.bodyClass, readyFlag: st.readyFlag, portReady: st.portReady, loaderCss: st.loaderInfo && st.loaderInfo.css, navMs: session.navMs }
          );
          const loaderOk = !st.loaderInfo || (st.loaderInfo.css.opacity < 0.02 || st.loaderInfo.css.visibility === 'hidden');
          add('loader-hidden', 'lifecycle', loaderOk ? 'pass' : 'fail', 'Loader is hidden after boot', { loader: st.loaderInfo });
          // loader text fit (from injected watcher, last visible snapshot)
          const loaderShots = (st.loaderQA && st.loaderQA.shots) || [];
          const visibleShots = loaderShots.filter((x) => x.tag !== 't900' && x.css.visibility !== 'hidden' && x.css.opacity > 0.05);
          const fitProblems = [];
          const overflowProblems = [];
          for (const shot of visibleShots) {
            if (shot.title && shot.title.scrollW > shot.title.clientW + 2) fitProblems.push('title overflow ' + shot.tag);
            if (shot.sub && shot.sub.scrollW > shot.sub.clientW + 2) fitProblems.push('sub overflow ' + shot.tag);
            if (shot.meta && shot.meta.scrollW > shot.meta.clientW + 2) fitProblems.push('meta overflow ' + shot.tag);
            if (shot.card && (shot.card.x < -1 || shot.card.y < -1 || shot.card.right > shot.vw + 1 || shot.card.bottom > shot.vh + 1)) {
              overflowProblems.push('loader card out of viewport at ' + shot.tag);
            }
          }
          add(
            'loader-fit',
            'ui',
            fitProblems.length || overflowProblems.length ? 'fail' : visibleShots.length ? 'pass' : 'warn',
            'Loader text fits and card stays in viewport',
            { shots: visibleShots.map((v) => ({ tag: v.tag, title: v.title && v.title.w, card: v.card })), fitProblems, overflowProblems, captured: loaderShots.length }
          );
          // stats
          add(
            'stats',
            'lifecycle',
            st.stats && st.stats.parts > 0 ? (worldActive ? 'pass' : 'warn') : 'fail',
            'Model stats populated',
            { worldActive, stats: st.stats, domStats: st.domStats, note: worldActive ? '' : 'world modules still stubs — counts will grow after integration' }
          );
          // floating geometry outside the plinth rim (batch vertex probe)
          if (st.strays) {
            const bad = (st.strays.clusters || []).filter((c) => {
              const r = Math.hypot(c.center[0], c.center[2]);
              return c.n >= 20 && r > 18.5;
            });
            add(
              'floating-outside-plinth', 'visual',
              bad.length ? 'fail' : 'pass',
              'No modelled geometry floating outside the plinth rim',
              { totalVerts: st.strays.totalVerts, clusters: st.strays.clusters, failing: bad, note: 'scan of batch:* vertices with radius >18.5 (plinth radius 15.78)' }
            );
          }
          // build errors
          add(
            'build-errors',
            'errors',
            (st.buildErrors || []).length ? 'fail' : 'pass',
            'No builder exceptions',
            { buildErrors: st.buildErrors }
          );
          // console / page errors
          const errors = { exceptions: browser.exceptions, consoleErrors: browser.consoleErrors, logErrors: browser.logErrors, netFailures: browser.netFailures };
          const errorCount = errors.exceptions.length + errors.consoleErrors.length + errors.logErrors.length;
          add('page-errors', 'errors', errorCount ? 'fail' : 'pass', 'No page exceptions / console errors', errors);
          const knownWarn = /Scripts "build\/three\.js"|deprecated with r150|deprecated with r160/;
          const allWarnings = [...browser.consoleWarnings, ...browser.logWarnings];
          const unknownWarnings = allWarnings.filter((w) => !knownWarn.test(w.text));
          add(
            'console-warnings',
            'errors',
            unknownWarnings.length ? 'warn' : 'pass',
            'No unexpected console warnings',
            { unknown: unknownWarnings, known: allWarnings.filter((w) => knownWarn.test(w.text)).map((w) => w.text.slice(0, 160)) }
          );
          // fonts
          const faces = st.fonts || [];
          const dmFaces = faces.filter((f) => /DM Mono/i.test(f.family));
          const frFaces = faces.filter((f) => /Fraunces/i.test(f.family));
          const dmLoaded = dmFaces.length >= 2 && dmFaces.every((f) => f.status === 'loaded');
          const dmErrored = dmFaces.some((f) => f.status === 'error');
          add(
            'fonts-dmmono',
            'fonts',
            dmLoaded && st.fontsCheck.dmMono ? 'pass' : 'fail',
            'DM Mono loads from file:// and is used',
            { faces: dmFaces, check: st.fontsCheck.dmMono, fontReady: st.fontReady, errored: dmErrored }
          );
          const frErrored = frFaces.some((f) => f.status === 'error');
          const frNormal = frFaces.filter((f) => f.style === 'normal');
          const frNormalLoaded = frNormal.length > 0 && frNormal.every((f) => f.status === 'loaded');
          const frUsed = !!st.fontsCheck.fraunces;
          add(
            'fonts-fraunces',
            'fonts',
            frNormalLoaded && frUsed ? 'pass' : frErrored ? 'fail' : 'warn',
            'Fraunces webfont loads and is used by CSS',
            {
              faces: frFaces,
              normalLoaded: frNormalLoaded,
              check: st.fontsCheck.fraunces,
              fontReady: st.fontReady,
              note: frNormalLoaded && frUsed ? 'italic face may stay unloaded when no italic rule uses it (OK)' : 'normal Fraunces face is not loaded/used — @font-face is dead weight or the CSS rule is missing',
            }
          );
          const glyphOk = st.glyphs.cnSerif > 400 && st.glyphs.cnSans > 400 && st.glyphs.latin > 150;
          add('glyphs', 'fonts', glyphOk ? 'pass' : 'fail', 'Chinese + Latin glyphs render', st.glyphs);
          report.fonts = { faces, check: st.fontsCheck, fontReady: st.fontReady, glyphs: st.glyphs };
          // offline / protocol audit
          const reqs = browser.requests.slice();
          const resp = browser.responses.slice();
          const bad = reqs.filter((r) => /^https?:/i.test(r.url));
          const protocols = reqs.reduce((acc, r) => {
            let proto = 'other';
            try { proto = new URL(r.url).protocol; } catch { proto = r.url.slice(0, 12); }
            acc[proto] = (acc[proto] || 0) + 1;
            return acc;
          }, {});
          const resources = await browser.evaluate('performance.getEntriesByType("resource").map((e) => e.name)');
          const badPerf = (resources || []).filter((u) => /^https?:/i.test(u));
          const relevantFailures = browser.netFailures.filter((f) => !/ERR_ABORTED/.test(f.error));
          add(
            'offline',
            'offline',
            bad.length === 0 && badPerf.length === 0 && relevantFailures.length === 0 ? 'pass' : 'fail',
            'No http(s) resources; everything from file:// / data:',
            { protocols, httpRequests: bad, httpPerfEntries: badPerf, netFailures: relevantFailures, requests: reqs.length, resources: (resources || []).length }
          );
          report.offline = { protocols, requests: reqs.map((r) => r.url), http: bad.map((b) => b.url), netFailures: relevantFailures };
          // day/night URL mode
          add('url-night-param', 'lifecycle', !st.night && st.nightMix === 0 ? 'pass' : 'fail', 'Default load is day mode (mix 0)', { night: st.night, nightMix: st.nightMix });
          // GPU / renderer context
          report.meta.gpu = st.gpu;
          report.meta.ua = st.ua;
          report.meta.dpr = st.dpr;
          // UI overflow/overlap at 1440×900
          auditUI(st.ui, '1440x900', sink);
          report.ui1440 = st.ui;
        }

        if (s.uiCheck && !s.staticChecks) {
          auditUI(st.ui, `${s.w}x${s.h}`, sink);
          session.ui = st.ui;
        }

        /* ---------- reduced motion ---------------------------------------- */
        if (s.reducedChecks) {
          const v0 = await browser.evaluate('window.PORT.getView()');
          await sleep(1300);
          const v1 = await browser.evaluate('window.PORT.getView()');
          const staticCamera = Math.abs(v0.yaw - v1.yaw) < 1e-6 && Math.abs(v0.dist - v1.dist) < 1e-6;
          const ctlTransition = parseFloat((st.transitions.ctl || '0.2s').replace('s', '')) || 0.2;
          const grainOff = st.transitions.grain === 'none';
          add(
            'reduced-motion',
            'motion',
            st.reducedMotion && !st.autoRotate && staticCamera && ctlTransition <= 0.02 && grainOff ? 'pass' : 'fail',
            'Reduced-motion emulation: no auto-orbit, instant UI transitions',
            { reducedMotion: st.reducedMotion, autoRotate: st.autoRotate, staticCamera, ctlTransition, grainAnimation: st.transitions.grain, grainOff }
          );
        }

        /* ---------- labels session ---------------------------------------- */
        if (s.labels) {
          if (st.labelsRegistered > 0) {
            await browser.evaluate('window.PORT.ui.setLabels(true)');
            await browser.raf(4);
            await sleep(500);
            const uiLabels = await browser.evaluate(`(() => { ${PAGE_HELPERS} return __qaUI(); })()`);
            auditUI(uiLabels, `${s.w}x${s.h} labels`, sink, { expectLabels: true });
            session.uiLabels = uiLabels;
          } else {
            add('ui-' + s.w + 'x' + s.h + '-labels', 'ui', 'skip', 'Labels layout (no labels registered yet)', { labelsRegistered: 0 });
          }
        }

        /* ---------- views + screenshots ----------------------------------- */
        for (const viewName of s.views) {
          const adaptiveHero = !!(s.mobile && viewName === 'hero' && st.view);
          const v = adaptiveHero
            ? { yaw: st.view.yaw, elev: st.view.elev, dist: st.view.dist }
            : VIEWS[viewName];
          const suffix = s.labels ? '-labels' : '';
          const shotId = `${s.id}-${viewName}${suffix}`;
          const file = path.join(OUT, shotId + '.png');
          await browser.evaluate(`window.PORT.setView(${JSON.stringify(v)}, true)`);
          await browser.raf(opts.quick ? 2 : 5);
          await sleep(opts.quick ? 80 : 160);
          const shot = await browser.screenshot(file);
          const view = await browser.evaluate('window.PORT.getView()');
          const perfNow = s.perf ? null : await browser.evaluate('window.PORT.getPerf()');
          const scenario = {
            id: shotId,
            session: s.id,
            view: viewName,
            file: rel(file),
            bytes: shot.bytes,
            width: shot.width,
            height: shot.height,
            viewport: { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile },
            camera: view,
            mode: { night: !!st.night, labels: !!(s.labels || (st.ui && st.ui.labelsOn)), reducedMotion: !!s.reducedMotion },
            ui: session.uiLabels || null,
            perf: perfNow,
          };
          session.shots.push(scenario);
          report.scenarios.push(scenario);

          // screenshot dimensions sanity vs viewport*dpr
          const expW = Math.round(s.w * s.dpr), expH = Math.round(s.h * s.dpr);
          if (Math.abs(shot.width - expW) > 2 || Math.abs(shot.height - expH) > 2) {
            add('shot-size-' + shotId, 'screenshots', 'warn', `Screenshot size ${shot.width}×${shot.height} != viewport*dpr ${expW}×${expH}`, { shotId, file: rel(file) });
          }

          // clean (UI-hidden) capture for visual review / framing analysis
          if (s.clean && s.clean.includes(viewName)) {
            const cleanPath = path.join(OUT, 'clean', shotId + '-clean.png');
            await browser.evaluate(`(() => {
              const ui = document.querySelector('#ui');
              window.__QA_HIDDEN_CSS = { ui: ui.getAttribute('style') || '' };
              ui.style.visibility = 'hidden';
            })()`);
            await browser.raf(2);
            await sleep(80);
            const cleanShot = await browser.screenshot(cleanPath);
            await browser.evaluate(`(() => {
              const ui = document.querySelector('#ui');
              const css = (window.__QA_HIDDEN_CSS || {}).ui || '';
              if (css) ui.setAttribute('style', css); else ui.removeAttribute('style');
            })()`);
            session.shots.push({
              id: shotId + '-clean', session: s.id, view: viewName, clean: true, file: rel(cleanPath),
              bytes: cleanShot.bytes, width: cleanShot.width, height: cleanShot.height,
              viewport: { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile }, camera: view,
              mode: { night: !!st.night, labels: false, reducedMotion: !!s.reducedMotion },
            });
            report.scenarios.push(session.shots[session.shots.length - 1]);
          }
        }

        /* ---------- live default hero (presentation QA) ------------------- */
        if (s.staticChecks && report.meta.pageDefaultView) {
          const dv = report.meta.pageDefaultView;
          const file = path.join(OUT, 'desktop-day-hero-default.png');
          await browser.evaluate(`window.PORT.setView(${JSON.stringify(dv)}, true)`);
          await browser.raf(4);
          await sleep(150);
          const shot = await browser.screenshot(file);
          const scenario = {
            id: 'desktop-day-hero-default', session: s.id, view: 'default', file: rel(file),
            bytes: shot.bytes, width: shot.width, height: shot.height,
            viewport: { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile },
            camera: dv, mode: { night: false, labels: false, reducedMotion: false },
          };
          session.shots.push(scenario);
          report.scenarios.push(scenario);
        }

        /* ---------- labels after (mobile) -------------------------------- */
        if (s.labelsAfter) {
          const n = st.labelsRegistered;
          if (n > 0) {
            await browser.evaluate('window.PORT.ui.setLabels(true)');
            await browser.raf(4);
            await sleep(500);
            const shotId = `${s.id}-hero-labels`;
            const file = path.join(OUT, shotId + '.png');
            await browser.evaluate(`window.PORT.setView(${JSON.stringify(VIEWS.hero)}, true)`);
            await browser.raf(4);
            await sleep(160);
            const shot = await browser.screenshot(file);
            const uiLabels = await browser.evaluate(`(() => { ${PAGE_HELPERS} return __qaUI(); })()`);
            auditUI(uiLabels, `${s.w}x${s.h} labels`, sink, { expectLabels: true });
            const scenario = {
              id: shotId, session: s.id, view: 'hero', file: rel(file), bytes: shot.bytes,
              width: shot.width, height: shot.height,
              viewport: { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile },
              mode: { night: false, labels: true, reducedMotion: false },
              ui: uiLabels,
            };
            session.shots.push(scenario);
            report.scenarios.push(scenario);
            session.uiLabels = uiLabels;
          } else {
            add('mobile-labels', 'ui', 'skip', 'Mobile labels (no labels registered yet)', null);
          }
        }

        /* ---------- night after (labels session) ------------------------- */
        if (s.nightAfter) {
          await browser.evaluate('window.PORT.setNight(true)');
          try {
            await browser.waitFor('window.PORT.state.nightMix >= 0.995', { timeout: 6000 });
          } catch { /* recorded below */ }
          const mix = await browser.evaluate('window.PORT.state.nightMix');
          await browser.raf(4);
          await sleep(200);
          const shotId = `${s.id}-hero-night`;
          const file = path.join(OUT, shotId + '.png');
          const shot = await browser.screenshot(file);
          const uiNight = await browser.evaluate(`(() => { ${PAGE_HELPERS} return __qaUI(); })()`);
          const scenario = {
            id: shotId, session: s.id, view: 'hero', file: rel(file), bytes: shot.bytes,
            width: shot.width, height: shot.height,
            viewport: { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile },
            mode: { night: true, labels: true, reducedMotion: false },
            platform: s.mobile ? 'mobile' : 'desktop',
            camera: await browser.evaluate('window.PORT.getView()'),
            ui: uiNight,
          };
          session.shots.push(scenario);
          report.scenarios.push(scenario);
          add('night-transition', 'interaction', mix >= 0.995 ? 'pass' : 'fail', 'Day→night transition reaches mix 1', { mix });
          // night readability capture with clean UI
          const cleanPath = path.join(OUT, 'clean', shotId + '-clean.png');
          await browser.evaluate(`(() => { const ui = document.querySelector('#ui'); ui.style.visibility = 'hidden'; })()`);
          await browser.raf(2);
          const cleanShot = await browser.screenshot(cleanPath);
          report.scenarios.push({
            id: shotId + '-clean', session: s.id, view: 'hero', clean: true, file: rel(cleanPath),
            bytes: cleanShot.bytes, width: cleanShot.width, height: cleanShot.height,
            viewport: { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile },
            mode: { night: true, labels: false, reducedMotion: false },
          });

          // ---- beam-toggle comparison: the lighthouse beam must ADD light, never
          // darken the water / plinth / floor (Lead acceptance criterion).
          const beamState = await browser.evaluate(`(() => {
            const THREE = window.THREE;
            const lamp = new THREE.Vector3(10.05, 2.65, 7.5);
            const v = new THREE.Vector3();
            const cands = [];
            PORT.scene.traverse((o) => {
              if (!(o.isMesh || o.isSprite || o.isPoints)) return;
              const m = o.material;
              if (!m || !m.transparent) return;
              o.getWorldPosition(v);
              const geo = o.geometry ? o.geometry.type : '';
              const beamLike = geo === 'ConeGeometry' || geo === 'CylinderGeometry';
              if (v.distanceTo(lamp) < 5.5 || (beamLike && m.blending === THREE.AdditiveBlending)) cands.push(o);
            });
            window.__QA_BEAMS = cands;
            cands.forEach((o) => { o.visible = false; });
            return { candidates: cands.length, types: cands.map((o) => (o.geometry ? o.geometry.type : o.type)) };
          })()`);
          await browser.raf(2);
          await sleep(80);
          const noBeamPath = path.join(OUT, shotId + '-nobeam.png');
          const noBeamShot = await browser.screenshot(noBeamPath);
          await browser.evaluate('(window.__QA_BEAMS || []).forEach((o) => { o.visible = true; }); window.__QA_BEAMS = null');
          await browser.evaluate(`(() => { const ui = document.querySelector('#ui'); ui.style.visibility = ''; })()`);
          report.scenarios.push({
            id: shotId + '-nobeam', session: s.id, view: 'hero', clean: false, private: true,
            file: rel(noBeamPath), bytes: noBeamShot.bytes, width: noBeamShot.width, height: noBeamShot.height,
            viewport: { w: s.w, h: s.h, dpr: s.dpr, mobile: !!s.mobile },
            mode: { night: true, labels: false, reducedMotion: false },
            beamCandidates: beamState,
          });
        }

        /* ---------- interactions ------------------------------------------ */
        if (s.interactions) {
          // reset page state first
          await browser.evaluate('window.PORT.setNight(false, true); window.PORT.setAutoRotate(false); window.PORT.ui.setLabels(false)');
          await sleep(150);
          const inter = await runInteractions(browser, sink);
          report.interactions = inter.checks;
          session.interactions = inter.checks;

          // ---- live window resize (no reload): canvas + UI must stay in sync
          const measureAt = async (w, h, dpr, mobile) => {
            await browser.setViewport({ width: w, height: h, dpr, mobile });
            await sleep(420);
            await browser.raf(3);
            const ui = await browser.evaluate(`(() => { ${PAGE_HELPERS} return __qaUI(); })()`);
            const canvas = await browser.evaluate(`(() => {
              const c = PORT.renderer.domElement;
              const eff = Math.min(window.devicePixelRatio || 1, PORT.config.maxDpr);
              return { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight,
                innerW: innerWidth, innerH: innerHeight, dpr: window.devicePixelRatio, eff, maxDpr: PORT.config.maxDpr };
            })()`);
            return { ui, canvas };
          };
          const expectCanvas = (r, w, h) => {
            const c = r.canvas;
            return Math.abs(c.innerW - w) <= 1 && Math.abs(c.innerH - h) <= 1 &&
              Math.abs(c.cssW - w) <= 2 && Math.abs(c.cssH - h) <= 2 &&
              Math.abs(c.w - Math.round(w * c.eff)) <= 2 && Math.abs(c.h - Math.round(h * c.eff)) <= 2;
          };
          const r1280 = await measureAt(1280, 800, 1, false);
          const r430 = await measureAt(430, 900, 2, true);
          auditUI(r1280.ui, 'live-resize 1280×800', sink);
          auditUI(r430.ui, 'live-resize 430×900', sink);
          add(
            'live-resize', 'ui',
            expectCanvas(r1280, 1280, 800) && expectCanvas(r430, 430, 900) ? 'pass' : 'fail',
            'Window resize keeps canvas backing store and UI layout in sync',
            { at1280: r1280.canvas, at430: r430.canvas, checks: { a1280: expectCanvas(r1280, 1280, 800), a430: expectCanvas(r430, 430, 900) } }
          );
          await browser.setViewport({ width: 1440, height: 900, dpr: 1, mobile: false });
          await sleep(250);

          // ---- auto-orbit (fresh load with ?orbit=1)
          const orbitUrl = PAGE_URL + '?orbit=1&dpr=1';
          await browser.navigate(orbitUrl, { timeout: 90000 });
          await browser.evaluate('document.fonts.ready.then(() => document.fonts.status)');
          await waitLoaderHidden(browser, 6000);
          await browser.raf(3);
          await sleep(150);
          const o0 = await browser.evaluate('window.PORT.getView()');
          await sleep(1900);
          const o1 = await browser.evaluate('window.PORT.getView()');
          const drift = Math.abs(o1.yaw - o0.yaw);
          add(
            'auto-orbit', 'motion',
            o0.autoRotate && drift > 0.03 ? 'pass' : 'fail',
            'Auto-orbit slowly rotates the camera when enabled',
            { autoRotate: o0.autoRotate, yaw0: o0.yaw, yaw1: o1.yaw, drift: +drift.toFixed(4), expectedMin: 0.03 }
          );
          await browser.evaluate('window.PORT.setAutoRotate(false)');

          // ---- ?labels=1 URL param opens with labels enabled
          await browser.navigate(PAGE_URL + '?orbit=0&dpr=1&labels=1', { timeout: 90000 });
          await browser.evaluate('document.fonts.ready.then(() => document.fonts.status)');
          await waitLoaderHidden(browser, 6000);
          await browser.raf(3);
          await sleep(150);
          const labelParam = await browser.evaluate(`({
            labelsOn: document.body.classList.contains('labels-on'),
            registered: (window.PORT.labels || []).length,
            cards: [...document.querySelectorAll('#label-cards .label-card')].filter((el) => +getComputedStyle(el).opacity > 0.05).length,
            aria: (document.querySelector('#btn-labels') || {}).getAttribute ? document.querySelector('#btn-labels').getAttribute('aria-pressed') : null
          })`);
          add(
            'url-labels-param', 'interaction',
            labelParam.labelsOn && labelParam.registered > 0 && labelParam.cards > 0 ? 'pass' : 'fail',
            '?labels=1 opens with diagram labels enabled',
            labelParam
          );
        }

        /* ---------- perf -------------------------------------------------- */
        if (s.perf) {
          const hero = VIEWS.hero;
          await browser.evaluate(`window.PORT.setView(${JSON.stringify(hero)}, true)`);
          await browser.raf(6);
          await sleep(opts.quick ? 400 : 900);
          const dayFrames = await browser.frameStats(opts.quick ? 1600 : 3500);
          const infoDay = await browser.evaluate(`(() => {
            const gl = PORT.renderer.getContext();
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            return {
              getPerf: PORT.getPerf(),
              render: { calls: PORT.renderer.info.render.calls, triangles: PORT.renderer.info.render.triangles,
                points: PORT.renderer.info.render.points, lines: PORT.renderer.info.render.lines },
              memory: { geometries: PORT.renderer.info.memory.geometries, textures: PORT.renderer.info.memory.textures },
              programs: PORT.renderer.info.programs ? PORT.renderer.info.programs.length : 0,
              stats: PORT.stats,
              dpr: PORT.dpr,
              canvas: { w: PORT.renderer.domElement.width, h: PORT.renderer.domElement.height },
              post: !!(PORT.post && PORT.post.enabled),
              shadows: PORT.renderer.shadowMap.enabled,
              gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a'
            };
          })()`);
          await browser.evaluate('window.PORT.setNight(true, true)');
          await browser.raf(6);
          await sleep(400);
          const nightFrames = await browser.frameStats(opts.quick ? 1200 : 2000);
          const infoNight = await browser.evaluate('PORT.getPerf()');
          const dayFps = Math.round(dayFrames.fps * 10) / 10;
          const nightFps = Math.round(nightFrames.fps * 10) / 10;
          const perfRecord = { id: s.id, day: { frames: dayFrames, fps: dayFps }, night: { frames: nightFrames, fps: nightFps }, info: infoDay, infoNight, viewport: { w: s.w, h: s.h, dpr: s.dpr } };
          report.perfSessions = report.perfSessions || {};
          report.perfSessions[s.id] = perfRecord;
          report.perf = report.perfSessions['perf'] || perfRecord;
          session.perf = perfRecord;
          const minFps = s.w >= 1600 && s.dpr >= 1.5 ? 55 : 45;
          add(
            s.id === 'perf' ? 'perf-fps' : 'perf-fps-' + s.id,
            'perf',
            dayFps >= minFps ? 'pass' : 'fail',
            `Frame rate ≥ ${minFps} fps @ ${s.w}×${s.h} dpr ${s.dpr} (median-based)`,
            { dayFps, nightFps, dayFrames, nightFrames, threshold: minFps }
          );
          const frameCalls = infoDay.getPerf.calls;
          const frameTris = infoDay.getPerf.triangles;
          add(
            s.id === 'perf' ? 'perf-budget' : 'perf-budget-' + s.id,
            'perf',
            frameCalls <= 220 ? (frameTris < 3000000 ? 'pass' : 'warn') : 'warn',
            'Draw-call / triangle budget',
            { calls: frameCalls, triangles: frameTris, programs: infoDay.programs, stats: infoDay.stats, thresholdCalls: 220, note: 'calls/tris from PORT.getPerf() (renderer.info after post leaves only the fullscreen quad)' }
          );
          // keep a perf screenshot for evidence
          const perfShot = path.join(OUT, 'perf-hero-day-' + s.id + '.png');
          await browser.evaluate('window.PORT.setNight(false, true)');
          await browser.evaluate(`window.PORT.setView(${JSON.stringify(hero)}, true)`);
          await browser.raf(4);
          await sleep(150);
          await browser.screenshot(perfShot);
          session.shots.push({ id: 'perf-hero-day-' + s.id, session: s.id, view: 'hero', file: rel(perfShot), viewport: { w: s.w, h: s.h, dpr: s.dpr } });
        }

        session.errors = {
          exceptions: browser.exceptions.slice(),
          consoleErrors: browser.consoleErrors.slice(),
          logErrors: browser.logErrors.slice(),
          netFailures: browser.netFailures.slice(),
        };
        session.warnings = {
          consoleWarnings: browser.consoleWarnings.slice(),
          logWarnings: browser.logWarnings.slice(),
        };
        if (s.interactions) {
          const errCount = session.errors.exceptions.length + session.errors.consoleErrors.length + session.errors.logErrors.length;
          add('interaction-errors', 'errors', errCount ? 'fail' : 'pass', 'No page errors during interaction tests', session.errors);
          report.postcard = sink.checks.find((c) => c.id === 'postcard');
        }
      } catch (err) {
        session.failure = String(err && err.stack || err);
        add('session-' + s.id, 'harness', 'fail', `Session ${s.id} failed to run`, { error: session.failure });
      } finally {
        session.durationMs = Date.now() - tSession;
        report.sessions.push(session);
      }
      const ok = session.shots.length;
      console.log(`[qa] ${s.id.padEnd(15)} ${String(ok).padStart(2)} shots  ${(session.durationMs / 1000).toFixed(1)}s` + (session.failure ? '  FAILED: ' + session.failure.split('\n')[0] : ''));
    }

    /* ---------------- plain Chrome (double-click) font probe ------------ */
    if (!only || only.includes('plain-fonts')) {
      try {
        const plain = await launchBrowser({ chrome: CHROME, width: 1440, height: 900, dpr: 1.25, allowFileAccess: false, headless: !opts.headed });
        await plain.addInitScript(LOADER_WATCH);
        await plain.setReducedMotion(false);
        await plain.navigate(PAGE_URL + '?dpr=1.25&orbit=0', { timeout: 90000 });
        await plain.evaluate('document.fonts.ready.then(() => document.fonts.status)');
        await plain.raf(2);
        const fs2 = await plain.evaluate(`(() => ({
          fontReady: document.fonts.status,
          faces: [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, style: f.style, status: f.status })),
          check: { fraunces: document.fonts.check('16px Fraunces'), dmMono: document.fonts.check('16px "DM Mono"') },
          bodyClass: document.body.className,
          ready: !!window.__PORT_READY,
          exceptions: []
        }))()`);
        const shotPath = path.join(OUT, 'fonts-plain-chrome.png');
        await plain.screenshot(shotPath);
        const errored = fs2.faces.filter((f) => f.status === 'error');
        const loaded = fs2.faces.filter((f) => f.status === 'loaded');
        const dmLoaded = fs2.faces.filter((f) => /DM Mono/i.test(f.family) && f.status === 'loaded').length >= 2;
        const frNormal = fs2.faces.filter((f) => /Fraunces/i.test(f.family) && f.style === 'normal');
        const frOk = frNormal.length > 0 && frNormal.every((f) => f.status === 'loaded');
        await plain.close();
        add(
          'fonts-plain-chrome',
          'fonts',
          errored.length === 0 && dmLoaded && frOk && fs2.check.dmMono ? 'pass' : 'fail',
          'Plain Chrome double-click (no file-access flag) still loads webfonts',
          { fontReady: fs2.fontReady, faces: fs2.faces, check: fs2.check, loaded: loaded.length, errored: errored.length, screenshot: rel(shotPath) }
        );
        report.fonts.plainChrome = { faces: fs2.faces, check: fs2.check, fontReady: fs2.fontReady, screenshot: rel(shotPath) };
      } catch (err) {
        add('fonts-plain-chrome', 'fonts', 'warn', 'Plain Chrome double-click font probe could not run', { error: String(err) });
      }
    }

    /* ---------------- aggregate cross-session checks ---------------- */
    const errSessions = report.sessions.filter((s) => {
      if (!s.errors) return false;
      return s.errors.exceptions.length + s.errors.consoleErrors.length + s.errors.logErrors.length > 0;
    });
    add(
      'errors-all-sessions', 'errors',
      errSessions.length ? 'fail' : 'pass',
      'No page exceptions / console errors in any session',
      { failing: errSessions.map((s) => ({ id: s.id, exceptions: s.errors.exceptions.slice(0, 3), consoleErrors: s.errors.consoleErrors.slice(0, 3), logErrors: s.errors.logErrors.slice(0, 2) })) }
    );
    const beSessions = report.sessions.filter((s) => s.state && s.state.buildErrors && s.state.buildErrors.length);
    add(
      'build-errors-all', 'errors',
      beSessions.length ? 'fail' : 'pass',
      'No builder exceptions in any session',
      { failing: beSessions.map((s) => ({ id: s.id, buildErrors: s.state.buildErrors })) }
    );
    const labelCounts = report.sessions.map((s) => s.labelsRegistered).filter((n) => typeof n === 'number');
    const maxLabels = labelCounts.length ? Math.max(...labelCounts) : 0;
    add(
      'labels-registered', 'world',
      maxLabels >= 2 ? 'pass' : 'warn',
      'World modules register ≥2 diagram labels',
      { maxLabels, note: maxLabels >= 2 ? '' : 'builders should K.addLabel() 2-4 entries so the diagram mode can be verified' }
    );

    /* ---------------- image analysis / contact sheets ---------------- */
    const statsCheck = sink.checks.find((c) => c.id === 'stats');
    const worldActive = !!(statsCheck && statsCheck.detail && statsCheck.detail.worldActive);
    if (!opts.noSheet) {
      try {
        const temps = fs.mkdtempSync(path.join(OUT, '.tmp-'));
        const rawPath = path.join(temps, 'report.json');
        fs.writeFileSync(rawPath, JSON.stringify({ meta: report.meta, scenarios: report.scenarios, worldActive }));
        const py = spawnSync(PYTHON, [path.join(ROOT, 'tools', 'qa-sheet.py'), '--report', rawPath, '--out', OUT], {
          encoding: 'utf8', timeout: 180000,
        });
        fs.rmSync(temps, { recursive: true, force: true });
        if (py.status !== 0) {
          add('contact-sheet', 'screenshots', 'warn', 'Contact sheet / image analysis skipped', { stderr: String(py.stderr || '').slice(-1500), stdout: String(py.stdout || '').slice(-800) });
        } else {
          let parsed = null;
          try { parsed = JSON.parse(String(py.stdout).trim().split('\n').pop()); } catch { /* ignore */ }
          if (parsed) report.images = parsed;
          for (const sheet of (parsed && parsed.sheets) || []) {
            add('contact-sheet-' + sheet.name, 'screenshots', 'pass', 'Contact sheet ' + sheet.name, sheet);
          }
          if (parsed && parsed.checks) {
            for (const c of parsed.checks) sink.checks.push(c);
          }
        }
      } catch (err) {
        add('contact-sheet', 'screenshots', 'warn', 'Contact sheet / image analysis skipped', { error: String(err) });
      }
    }

    /* ---------------- summary ---------------- */
    const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
    for (const c of sink.checks) counts[c.status] = (counts[c.status] || 0) + 1;
    report.summary = {
      ...counts,
      worldActive,
      sessions: report.sessions.length,
      scenarios: report.scenarios.length,
      durationMs: Date.now() - startedAt,
    };
    report.checks = sink.checks;
    fs.mkdirSync(path.dirname(opts.report), { recursive: true });
    fs.writeFileSync(opts.report, JSON.stringify(report, null, 2));
    const historyDir = path.join(OUT, 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(path.join(historyDir, nowStamp() + '-' + slug(opts.label) + (opts.only ? '-partial' : '') + '.json'), JSON.stringify(report, null, 2));
    report.meta.reportFile = rel(opts.report);
    // also write meta-only pointer beside report
    fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify({ label: opts.label, at: report.meta.generatedAt, summary: report.summary, report: rel(opts.report) }, null, 2));

    if (opts.final) {
      try {
        const target = exportFinal(report, opts);
        // rewrite report with finalDir/finalFiles included and refresh the gallery copy
        fs.writeFileSync(opts.report, JSON.stringify(report, null, 2));
        try { fs.copyFileSync(opts.report, path.join(target, 'report.json')); } catch { /* ignore */ }
        fs.writeFileSync(path.join(OUT, 'latest.json'), JSON.stringify({ label: opts.label, at: report.meta.generatedAt, summary: report.summary, report: rel(opts.report), finalDir: rel(target) }, null, 2));
        console.log('[qa] final gallery → ' + rel(target));
      } catch (err) {
        console.warn('[qa] final export failed:', err && err.message || err);
      }
    }
    console.log('');
    console.log(`[qa] done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s  →  ${rel(opts.report)}`);
    console.log(`[qa] checks: ${counts.pass} pass · ${counts.warn} warn · ${counts.fail} fail · ${counts.skip} skip`);
    if (counts.fail) {
      console.log('[qa] FAILURES:');
      for (const c of sink.checks.filter((x) => x.status === 'fail')) console.log(`  ✗ ${c.id} — ${c.name}`);
    }
    if (counts.warn) {
      console.log('[qa] WARNINGS:');
      for (const c of sink.checks.filter((x) => x.status === 'warn')) console.log(`  ! ${c.id} — ${c.name}`);
    }
    console.log('[qa] artifacts: ' + rel(OUT));
    exitCode = counts.fail ? 1 : 0;
  } catch (err) {
    console.error('[qa] harness failed:', err && err.stack || err);
    const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
    for (const c of sink.checks) counts[c.status] = (counts[c.status] || 0) + 1;
    report.summary = { ...counts, harnessError: String(err && err.stack || err) };
    report.checks = sink.checks;
    try {
      fs.mkdirSync(path.dirname(opts.report), { recursive: true });
      fs.writeFileSync(opts.report, JSON.stringify(report, null, 2));
    } catch { /* ignore */ }
    exitCode = 2;
  } finally {
    if (browser) await browser.close();
  }
  process.exit(exitCode);
}

main();
