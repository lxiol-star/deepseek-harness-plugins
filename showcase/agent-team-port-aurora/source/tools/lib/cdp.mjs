/* ============================================================================
 * tools/lib/cdp.mjs — minimal Chrome DevTools Protocol driver for QA.
 *
 * No npm dependencies. Node 22+ (global fetch + WebSocket). macOS/Linux/Windows.
 *
 *   import { launchBrowser, sleep } from './lib/cdp.mjs';
 *   const b = await launchBrowser({ width: 1440, height: 900, dpr: 1.5 });
 *   await b.setViewport({ width: 1440, height: 900, dpr: 1.5 });
 *   await b.navigate('file:///.../index.html?dpr=1.5');
 *   const info = await b.evaluate('navigator.userAgent');
 *   await b.screenshot('/tmp/a.png');
 *   await b.close();
 * ========================================================================= */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return candidates[0];
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function httpJson(url, method = 'GET') {
  const res = await fetch(url, { method });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return res.json();
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.closed = false;
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
        return;
      }
      if (msg.method) {
        const list = this.handlers.get(msg.method);
        if (list) for (const fn of list) { try { fn(msg.params); } catch { /* ignore */ } }
        const any = this.handlers.get('*');
        if (any) for (const fn of any) { try { fn(msg.method, msg.params); } catch { /* ignore */ } }
      }
    });
    this.ws.addEventListener('close', () => {
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error('CDP socket closed'));
      this.pending.clear();
    });
  }

  static async connect(wsUrl, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let lastErr;
    while (Date.now() < deadline) {
      try {
        const ws = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
          ws.addEventListener('open', resolve, { once: true });
          ws.addEventListener('error', () => reject(new Error('ws error')), { once: true });
        });
        return new CDP(ws);
      } catch (err) {
        lastErr = err;
        await sleep(120);
      }
    }
    throw lastErr || new Error('CDP connect timeout');
  }

  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }

  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('CDP closed'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  close() {
    try { this.ws.close(); } catch { /* noop */ }
  }
}

export class Browser {
  constructor(opts = {}) {
    this.opts = {
      chrome: findChrome(opts.chrome),
      width: opts.width || 1440,
      height: opts.height || 900,
      dpr: opts.dpr || 1,
      extraArgs: opts.extraArgs || [],
      allowFileAccess: opts.allowFileAccess !== false,
      headless: opts.headless !== false,
    };
    this.proc = null;
    this.profile = null;
    this.port = null;
    this.cdp = null;
    this.targetId = null;
    this.startedAt = 0;
  }

  async open() {
    this.port = await freePort();
    this.profile = path.join(
      os.tmpdir(),
      'mh-qa-' + process.pid + '-' + Math.floor(Math.random() * 1e9)
    );
    fs.rmSync(this.profile, { recursive: true, force: true });
    const args = [
      ...(this.opts.headless ? ['--headless=new'] : ['--window-position=40,40']),
      '--remote-debugging-port=' + this.port,
      '--remote-debugging-address=127.0.0.1',
      '--user-data-dir=' + this.profile,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--disable-extensions',
      '--disable-default-apps',
      '--metrics-recording-only',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
      '--window-size=' + this.opts.width + ',' + this.opts.height,
      ...(this.opts.allowFileAccess ? ['--allow-file-access-from-files'] : []),
      ...this.opts.extraArgs,
      'about:blank',
    ];
    this.proc = spawn(this.opts.chrome, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
    });
    this.proc.on('error', () => { /* surfaced by /json/list timeout */ });
    this.proc.stderr.on('data', () => { /* keep quiet */ });
    this.startedAt = Date.now();

    let target = null;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      try {
        const list = await httpJson(`http://127.0.0.1:${this.port}/json/list`);
        target = (list || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (target) break;
      } catch { /* not up yet */ }
      await sleep(120);
    }
    if (!target) throw new Error('Chrome remote debugging did not start (' + this.opts.chrome + ')');

    this.targetId = target.id;
    this.cdp = await CDP.connect(target.webSocketDebuggerUrl);
    this.cdp.on('*', () => { /* keep handler map alive */ });
    await Promise.all([
      this.cdp.send('Page.enable'),
      this.cdp.send('Runtime.enable'),
      this.cdp.send('Log.enable'),
      this.cdp.send('Network.enable'),
      this.cdp.send('Performance.enable'),
    ]);
    return this;
  }

  /* --------------------------------------------------------------- capture */
  resetCapture() {
    this.events = [];
    this.exceptions = [];
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.logErrors = [];
    this.logWarnings = [];
    this.requests = [];
    this.responses = [];
    this.netFailures = [];
    if (!this._hooked) {
      this._hooked = true;
      this.cdp.on('Runtime.exceptionThrown', (p) => {
        const d = p.exceptionDetails || {};
        const text = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'exception';
        this.exceptions.push({ text: String(text).slice(0, 900), url: d.url || '', line: d.lineNumber });
      });
      this.cdp.on('Runtime.consoleAPICalled', (p) => {
        const type = p.type;
        const text = (p.args || []).map((a) => {
          if (a.value != null) return typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
          return a.description || a.type || '';
        }).join(' ');
        const rec = { type, text: String(text).slice(0, 900), url: (p.stackTrace && p.stackTrace.callFrames && p.stackTrace.callFrames[0] && p.stackTrace.callFrames[0].url) || '' };
        if (type === 'error' || type === 'assert') this.consoleErrors.push(rec);
        else if (type === 'warning') this.consoleWarnings.push(rec);
      });
      this.cdp.on('Log.entryAdded', (p) => {
        const e = p.entry || {};
        const rec = { source: e.source, level: e.level, text: String(e.text || '').slice(0, 900), url: e.url || '' };
        if (e.level === 'error') this.logErrors.push(rec);
        else if (e.level === 'warning') this.logWarnings.push(rec);
      });
      this.cdp.on('Network.requestWillBeSent', (p) => {
        this.requests.push({ url: p.request.url, type: p.type, method: p.request.method });
      });
      this.cdp.on('Network.responseReceived', (p) => {
        this.responses.push({ url: p.response.url, status: p.response.status, mime: p.response.mimeType, type: p.type });
      });
      this.cdp.on('Network.loadingFailed', (p) => {
        this.netFailures.push({ error: p.errorText, type: p.type, blocked: !!p.blockedReason });
      });
    }
  }

  /* ------------------------------------------------------------------ setup */
  async setViewport({ width, height, dpr = 1, mobile = false }) {
    this.viewport = { width, height, dpr, mobile };
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      mobile: !!mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await this.cdp.send('Emulation.setTouchEmulationEnabled', {
      enabled: !!mobile,
      maxTouchPoints: mobile ? 5 : 1,
    });
  }

  async setReducedMotion(on) {
    await this.cdp.send('Emulation.setEmulatedMedia', {
      media: '',
      features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }],
    });
  }

  async setColorScheme(scheme) {
    try {
      await this.cdp.send('Emulation.setEmulatedMedia', {
        media: '',
        features: [{ name: 'prefers-color-scheme', value: scheme }],
      });
    } catch { /* optional */ }
  }

  async addInitScript(source) {
    await this.cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  /* ------------------------------------------------------------- navigation */
  async navigate(url, { timeout = 90000 } = {}) {
    this.resetCapture();
    this.lastNavigateAt = Date.now();
    this.loadedAt = 0;
    this.readyAt = 0;
    let loadResolve;
    this._loadPromise = new Promise((r) => { loadResolve = r; });
    const onLoad = () => { this.loadedAt = Date.now(); loadResolve(); };
    this.cdp.on('Page.loadEventFired', onLoad);
    try {
      const r = await this.cdp.send('Page.navigate', { url });
      if (r.errorText) throw new Error('navigation failed: ' + r.errorText);
      await Promise.race([this._loadPromise, sleep(20000)]);
    } finally {
      // handler list stays; harmless duplicates are avoided by only using last timestamp
    }
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const st = await this.evaluate(`(() => ({
          ready: !!window.__PORT_READY,
          port: !!window.PORT,
          body: document.body ? document.body.className : '',
          bootErr: (window.PORT && window.PORT.buildErrors) || [],
          loaderSub: (document.querySelector('.loader-sub') || {}).textContent || ''
        }))()`);
        if (st && st.ready) {
          this.readyAt = Date.now();
          return st;
        }
        if (st && st.loaderSub.indexOf('组装时遇到问题') >= 0) {
          throw new Error('boot failed: ' + st.loaderSub);
        }
      } catch (err) {
        if (String(err.message || err).startsWith('boot failed')) throw err;
      }
      await sleep(100);
    }
    throw new Error('PORT_READY timeout after ' + timeout + 'ms: ' + url);
  }

  async evaluate(expression, opts = {}) {
    const r = await this.cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
      ...opts,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      const text = (d.exception && (d.exception.description || d.exception.value)) || d.text || 'evaluate error';
      throw new Error(String(text).split('\n')[0]);
    }
    return r.result ? r.result.value : undefined;
  }

  async waitFor(expression, { timeout = 15000, interval = 100 } = {}) {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeout) {
      try {
        last = await this.evaluate(expression);
        if (last) return last;
      } catch { /* retry */ }
      await sleep(interval);
    }
    throw new Error('waitFor timeout: ' + expression.slice(0, 120));
  }

  async raf(count = 3) {
    await this.evaluate(`new Promise((r) => { let n = ${count}; const f = () => (--n <= 0 ? r(true) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
  }

  /* ------------------------------------------------------------- screenshot */
  async screenshot(filePath) {
    const { data } = await this.cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const buf = Buffer.from(data, 'base64');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, buf);
    // PNG IHDR — width/height
    let width = 0, height = 0;
    if (buf.length > 24 && buf.toString('ascii', 12, 16) === 'IHDR') {
      width = buf.readUInt32BE(16);
      height = buf.readUInt32BE(20);
    }
    return { path: filePath, bytes: buf.length, width, height };
  }

  /* ------------------------------------------------------------------ input */
  async mouse(type, x, y, extra = {}) {
    await this.cdp.send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: extra.button || 'none',
      buttons: extra.buttons != null ? extra.buttons : 0,
      clickCount: extra.clickCount || 0,
      ...(extra.deltaX != null ? { deltaX: extra.deltaX } : {}),
      ...(extra.deltaY != null ? { deltaY: extra.deltaY } : {}),
    });
  }

  async drag(from, to, { steps = 14, stepDelay = 24, modifiers = 0 } = {}) {
    await this.mouse('mouseMoved', from.x, from.y, { buttons: 0 });
    await this.mouse('mousePressed', from.x, from.y, { button: 'left', buttons: 1, clickCount: 1, modifiers });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      await this.mouse('mouseMoved', Math.round(x), Math.round(y), { buttons: 1, modifiers });
      if (stepDelay) await sleep(stepDelay);
    }
    await this.mouse('mouseReleased', to.x, to.y, { button: 'left', buttons: 0, clickCount: 1, modifiers });
  }

  async wheel(x, y, deltaY, deltaX = 0) {
    await this.mouse('mouseWheel', x, y, { deltaY, deltaX });
  }

  async doubleClick(x, y) {
    await this.mouse('mouseMoved', x, y, {});
    await this.mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 1 });
    await this.mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 1 });
    await this.mouse('mousePressed', x, y, { button: 'left', buttons: 1, clickCount: 2 });
    await this.mouse('mouseReleased', x, y, { button: 'left', buttons: 0, clickCount: 2 });
  }

  async key(key, code, keyCode, { text } = {}) {
    const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    await this.cdp.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      ...base,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  /* ------------------------------------------------------------------- perf */
  async frameStats(durationMs = 3500) {
    return this.evaluate(`new Promise((resolve) => {
      const deltas = [];
      const t0 = performance.now();
      let last = t0;
      function tick(t) {
        deltas.push(t - last);
        last = t;
        if (t - t0 >= ${Math.max(600, durationMs)}) {
          const sorted = deltas.slice(1).sort((a, b) => a - b);
          const pick = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
          const total = sorted.reduce((a, b) => a + b, 0);
          resolve({
            frames: sorted.length,
            elapsed: t - t0,
            mean: total / Math.max(1, sorted.length),
            median: pick(0.5),
            p95: pick(0.95),
            max: sorted.length ? sorted[sorted.length - 1] : 0,
            fps: total > 0 ? (sorted.length / (total / 1000)) : 0,
          });
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    })`);
  }

  /* ------------------------------------------------------------------ close */
  async close() {
    try { if (this.cdp) this.cdp.close(); } catch { /* noop */ }
    try {
      if (this.proc) process.kill(-this.proc.pid, 'SIGKILL');
    } catch {
      try { if (this.proc) this.proc.kill('SIGKILL'); } catch { /* noop */ }
    }
    await sleep(100);
    try { if (this.profile) fs.rmSync(this.profile, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

export async function launchBrowser(opts = {}) {
  const browser = new Browser(opts);
  await browser.open();
  if (opts.width || opts.height || opts.dpr) {
    await browser.setViewport({
      width: opts.width || 1440,
      height: opts.height || 900,
      dpr: opts.dpr || 1,
      mobile: !!opts.mobile,
    });
  }
  return browser;
}
