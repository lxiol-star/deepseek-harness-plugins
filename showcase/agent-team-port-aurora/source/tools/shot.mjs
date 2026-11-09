#!/usr/bin/env node
/* ============================================================================
 * tools/shot.mjs — headless-Chrome screenshot + console/error + perf harness.
 *
 *   node tools/shot.mjs --out shots/day.png
 *   node tools/shot.mjs --out shots/night.png --night --view "0.5,0.42,34"
 *   node tools/shot.mjs --out shots/labels.png --labels --night
 *   node tools/shot.mjs --w 430 --h 900 --dpr 2 --mobile --out shots/mobile.png
 *   node tools/shot.mjs --skip "town,fleet"     # isolate modules
 *
 * No npm dependencies. Uses Chrome via CDP and Node's built-in WebSocket.
 * ========================================================================= */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULTS = {
  url: 'file://' + path.join(ROOT, 'index.html'),
  out: path.join(ROOT, 'shots', 'shot.png'),
  w: 1600,
  h: 1000,
  dpr: 1.5,
  wait: 2200,
  timeout: 60000,
  chrome: process.env.CHROME ||
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
};

function parseArgs(argv) {
  const o = { ...DEFAULTS, night: false, labels: false, mobile: false, quiet: false, verbose: false };
  o.evals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--out') o.out = next();
    else if (a === '--url') o.url = next();
    else if (a === '--w') o.w = parseInt(next(), 10);
    else if (a === '--h') o.h = parseInt(next(), 10);
    else if (a === '--dpr') o.dpr = parseFloat(next());
    else if (a === '--wait') o.wait = parseInt(next(), 10);
    else if (a === '--timeout') o.timeout = parseInt(next(), 10);
    else if (a === '--view') o.view = next();
    else if (a === '--eval') o.evals.push(next());
    else if (a === '--skip') o.skip = next();
    else if (a === '--query') o.query = next();
    else if (a === '--night') o.night = true;
    else if (a === '--labels') o.labels = true;
    else if (a === '--mobile') o.mobile = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--chrome') o.chrome = next();
    else if (a === '--help' || a === '-h') { console.log('see header'); process.exit(0); }
    else throw new Error('unknown arg: ' + a);
  }
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        if (list && list.length) return list;
      }
    } catch { /* not up yet */ }
    await sleep(180);
  }
  throw new Error('Chrome remote debugging did not start');
}

function launchChrome(opts, port) {
  const profile = path.join(os.tmpdir(), `mh-shot-${process.pid}-${Math.floor(Math.random() * 1e6)}`);
  fs.rmSync(profile, { recursive: true, force: true });
  const args = [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--allow-file-access-from-files',
    '--window-size=' + opts.w + ',' + opts.h,
    'about:blank',
  ];
  const proc = spawn(opts.chrome, args, { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  proc.stderr.on('data', () => {});
  return { proc, profile };
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error('ws error: ' + (e && e.message)));
    });
    this.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, opts = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
      ...opts,
    });
    if (r.exceptionDetails) {
      const text = r.exceptionDetails.text || (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || 'eval error';
      throw new Error(text);
    }
    return r.result ? r.result.value : undefined;
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.mobile) { opts.w = Math.min(opts.w, 430); opts.h = Math.max(opts.h, 860); }
  const port = 9300 + Math.floor(Math.random() * 300);
  const { proc, profile } = launchChrome(opts, port);
  let cdp = null;
  let exitCode = 0;
  const errors = [];
  const warnings = [];

  try {
    const targets = await waitForJson(port);
    const page = targets.find((t) => t.type === 'page') || targets[0];
    cdp = new CDP(page.webSocketDebuggerUrl);
    await cdp.ready;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: opts.w,
      height: opts.h,
      deviceScaleFactor: opts.dpr,
      mobile: opts.mobile,
    });
    if (opts.mobile) {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
      await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
    }

    const url = new URL(opts.url);
    if (opts.night) url.searchParams.set('night', '1');
    if (opts.labels) url.searchParams.set('labels', '1');
    if (opts.skip) url.searchParams.set('skip', opts.skip);
    if (opts.mobile) url.searchParams.set('mobile', '1');
    if (opts.query) {
      for (const [k, v] of new URLSearchParams(opts.query)) url.searchParams.set(k, v);
    }

    await cdp.send('Page.navigate', { url: url.toString() });

    // collect console + exceptions
    cdp.events.length = 0;
    const deadline = Date.now() + opts.timeout;
    let ready = false;
    let lastError = null;
    while (Date.now() < deadline) {
      const res = await cdp.send('Runtime.evaluate', {
        expression: 'Boolean(window.__PORT_READY)',
        returnByValue: true,
      }).catch((e) => { lastError = e; return {}; });
      if (res && res.result && res.result.value) { ready = true; break; }
      await sleep(250);
    }
    if (!ready) {
      const state = await cdp.evaluate(
        'JSON.stringify({ready: !!window.__PORT_READY, hasPort: !!window.PORT, buildErrors: (window.PORT&&window.PORT.buildErrors)||[], bodyClass: document.body.className, loaderStep: (document.getElementById("loader-step")||{}).textContent, title: document.title})'
      ).catch(() => '{}');
      for (const ev of cdp.events) {
        if (ev.method === 'Runtime.exceptionThrown') {
          const d = ev.params.exceptionDetails;
          console.log('PAGE EXCEPTION:', (d.exception && d.exception.description) || d.text);
        } else if (ev.method === 'Runtime.consoleAPICalled') {
          const t = (ev.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
          console.log('PAGE ' + ev.params.type.toUpperCase() + ':', t.slice(0, 800));
        } else if (ev.method === 'Log.entryAdded') {
          console.log('PAGE LOG:', ev.params.entry.level, ev.params.entry.text.slice(0, 800));
        }
      }
      throw new Error('page never became ready. state=' + state + (lastError ? ' err=' + lastError.message : ''));
    }

    // let the loader fade and fonts settle
    await sleep(900);

    // camera/preset
    await cdp.evaluate('window.PORT && window.PORT.setAutoRotate && window.PORT.setAutoRotate(false)');
    if (opts.view) {
      const [yaw, elev, dist] = opts.view.split(',').map((n) => parseFloat(n));
      await cdp.evaluate(
        `window.PORT.setView({yaw:${yaw}, elev:${elev}, dist:${dist}}, true)`
      );
    }
    if (opts.labels) {
      await cdp.evaluate('window.PORT && window.PORT.ui && window.PORT.ui.setLabels && window.PORT.ui.setLabels(true)');
    }
    if (opts.night) {
      await cdp.evaluate('window.PORT.setNight(true, true)');
    }
    for (const expr of opts.evals) await cdp.evaluate(expr);
    await sleep(opts.wait);

    // pull errors/console after run
    for (const ev of cdp.events) {
      if (ev.method === 'Runtime.exceptionThrown') {
        const d = ev.params.exceptionDetails;
        const text = (d.exception && d.exception.description) || d.text || 'exception';
        errors.push(text);
      } else if (ev.method === 'Runtime.consoleAPICalled') {
        const type = ev.params.type;
        const text = (ev.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        if (type === 'error') errors.push('console.error: ' + text);
        else if (type === 'warning') warnings.push('console.warn: ' + text);
      } else if (ev.method === 'Log.entryAdded') {
        const e = ev.params.entry;
        if (e.level === 'error') errors.push('log: ' + e.text + (e.url ? ' @ ' + e.url : ''));
      }
    }

    const info = await cdp.evaluate(
      'JSON.stringify({perf: window.PORT.getPerf ? window.PORT.getPerf() : null, labels: (window.PORT.labels||[]).length, view: window.PORT.getView ? window.PORT.getView() : null})'
    ).catch(() => '{}');
    let parsed = {};
    try { parsed = JSON.parse(info); } catch { /* noop */ }

    const shot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const buf = Buffer.from(shot.data, 'base64');
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, buf);

    const head =
      `shot ${path.relative(ROOT, opts.out)}  ${opts.w}x${opts.h} @${opts.dpr}x  ${(buf.length / 1024).toFixed(0)}kB` +
      (parsed.perf ? `  fps=${parsed.perf.fps} calls=${parsed.perf.calls} tris=${Math.round(parsed.perf.triangles / 1000)}k parts=${parsed.perf.parts}` : '');
    if (!opts.quiet) console.log(head);
    if (!opts.quiet && parsed.labels) console.log('labels:', parsed.labels);
    if (parsed.perf && parsed.perf.buildErrors && parsed.perf.buildErrors.length) {
      console.log('BUILD ERRORS:');
      for (const e of parsed.perf.buildErrors) console.log(' -', e.id, String(e.error).split('\n')[0]);
      exitCode = 1;
    }
    if (warnings.length && !opts.quiet) {
      console.log('warnings (' + warnings.length + '):');
      for (const w of warnings.slice(0, 6)) console.log(' ! ' + w.slice(0, 300));
    }
    if (errors.length) {
      console.log('ERRORS (' + errors.length + '):');
      for (const e of errors.slice(0, 8)) console.log(' ! ' + e.slice(0, 600));
      exitCode = 1;
    } else if (!opts.quiet) {
      console.log('no page errors');
    }
  } catch (err) {
    console.error('FAILED:', err.message);
    exitCode = 2;
  } finally {
    if (cdp) cdp.close();
    try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch { /* noop */ } }
    await sleep(120);
    fs.rmSync(profile, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

main();
