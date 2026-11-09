/* ============================================================================
 * ui.js — paper-and-brass overlay: controls, explanatory labels with leader
 * lines, model dossier, keyboard shortcuts, postcard download, perf panel.
 * Owned by the Lead.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  const K = P.kit;
  const THREE = window.THREE;
  const ui = (P.ui = {});

  const state = {
    labelsOn: false,
    labelEntries: [],
    labelPrev: [],
    perfEl: null,
    toastTimer: null,
    ready: false,
  };
  ui.state = state;

  const dom = {};
  const tmpV = new THREE.Vector3();

  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  ui.init = function ({ camera, scene, renderer, post }) {
    dom.camera = camera;
    dom.renderer = renderer;
    dom.post = post;
    dom.svg = $('#label-lines');
    dom.cards = $('#label-cards');
    dom.labels = $('#labels');
    dom.toast = $('#toast');
    dom.btnOrbit = $('#btn-orbit');
    dom.btnLabels = $('#btn-labels');
    dom.btnNight = $('#btn-night');
    dom.btnPostcard = $('#btn-postcard');

    const initialNight = !!P.getNight();
    ui.syncNight(initialNight);
    ui.syncOrbit(!!P.getAutoRotate());

    if (dom.btnOrbit) {
      dom.btnOrbit.addEventListener('click', () => {
        P.setAutoRotate(!P.getAutoRotate());
        markInteracted();
      });
    }
    if (dom.btnLabels) {
      dom.btnLabels.disabled = !(P.labels && P.labels.length);
      dom.btnLabels.addEventListener('click', () => setLabels(!state.labelsOn));
    }
    if (dom.btnNight) {
      dom.btnNight.addEventListener('click', () => {
        P.setNight(!P.getNight());
        markInteracted();
      });
    }
    if (dom.btnPostcard) {
      dom.btnPostcard.addEventListener('click', async () => {
        if (dom.btnPostcard.classList.contains('busy')) return;
        dom.btnPostcard.classList.add('busy');
        showToast('正在冲洗明信片…');
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        try {
          const url = P.makePostcard();
          const a = document.createElement('a');
          a.href = url;
          a.download = 'aurora-harbour-postcard.png';
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast('明信片已保存 · POSTCARD SAVED');
        } catch (err) {
          console.error(err);
          showToast('明信片生成失败');
        }
        dom.btnPostcard.classList.remove('busy');
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === ' ') { e.preventDefault(); P.setAutoRotate(!P.getAutoRotate()); }
      else if (key === 'l') setLabels(!state.labelsOn);
      else if (key === 'n') P.setNight(!P.getNight());
      else if (key === 'r') { P.resetView(); markInteracted(); }
      else if (key === 'p') dom.btnPostcard && dom.btnPostcard.click();
    });

    document.body.classList.toggle('labels-on', false);
    setupLabels();
    if (P.config && P.config.labels) setLabels(true);
    if (P.config && P.config.debug) setupPerf();
    state.ready = true;
    refreshStats();
  };

  function markInteracted() {
    document.body.classList.add('interacted');
  }

  ui.syncNight = function (on) {
    if (dom.btnNight) dom.btnNight.setAttribute('aria-pressed', on ? 'true' : 'false');
    document.body.classList.toggle('night', !!on);
  };
  ui.syncOrbit = function (on) {
    if (dom.btnOrbit) dom.btnOrbit.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  ui.onNightMix = function () { /* reserved for softer overlay transitions */ };

  ui.setLabels = setLabels;
  function setLabels(on) {
    state.labelsOn = !!on;
    P.state.labels = state.labelsOn;
    document.body.classList.toggle('labels-on', state.labelsOn);
    if (dom.btnLabels) dom.btnLabels.setAttribute('aria-pressed', state.labelsOn ? 'true' : 'false');
    if (state.labelsOn) markInteracted();
  }

  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2600);
  }
  ui.toast = showToast;

  function refreshStats() {
    const stats = P.stats || {};
    const map = {
      parts: stats.parts,
      containers: stats.containers,
      cranes: stats.cranes,
      vessels: stats.vessels,
      buildings: stats.buildings,
      people: stats.people,
    };
    for (const el of $$('[data-stat]')) {
      const key = el.getAttribute('data-stat');
      let v = map[key];
      if (v == null) { el.textContent = '—'; continue; }
      if (typeof v === 'number') {
        if (key === 'parts') el.textContent = v.toLocaleString('en-US');
        else el.textContent = String(v);
      } else el.textContent = String(v);
      el.classList.add('pop');
    }
  }
  ui.refreshStats = refreshStats;

  /* ------------------------------------------------------------------ labels */
  function normalizeLabel(l, index) {
    let pos;
    if (l.pos) pos = Array.isArray(l.pos) ? new THREE.Vector3(l.pos[0], l.pos[1], l.pos[2]) : l.pos.clone();
    else pos = new THREE.Vector3(l.x || 0, l.y || 0, l.z || 0);
    return {
      pos,
      title: l.title || '未命名',
      sub: l.sub || l.note || '',
      priority: l.priority == null ? 5 : l.priority,
      side: l.side || 0,
      index,
    };
  }

  function setupLabels() {
    if (!dom.svg || !dom.cards) return;
    while (dom.svg.firstChild) dom.svg.removeChild(dom.svg.firstChild);
    while (dom.cards.firstChild) dom.cards.removeChild(dom.cards.firstChild);
    const labels = (P.labels || []).map(normalizeLabel);
    labels.sort((a, b) => (b.priority - a.priority) || (a.index - b.index));
    const maxLabels = P.isMobile ? 6 : 12;
    state.labelEntries = labels.slice(0, maxLabels);
    state.labelPrev = state.labelEntries.map(() => ({ visible: false, x: 0, y: 0, w: 0, h: 0 }));

    state.labelEntries.forEach((label, i) => {
      const ns = 'http://www.w3.org/2000/svg';
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('data-i', String(i));
      g.style.display = 'none';
      const line = document.createElementNS(ns, 'polyline');
      line.setAttribute('class', 'leader');
      line.setAttribute('points', '0,0 0,0 0,0');
      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('class', 'leader-ring');
      ring.setAttribute('r', '4.6');
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('class', 'leader-dot');
      dot.setAttribute('r', '1.8');
      g.appendChild(line);
      g.appendChild(ring);
      g.appendChild(dot);
      dom.svg.appendChild(g);

      const card = document.createElement('div');
      card.className = 'label-card';
      card.style.setProperty('--i', String(i));
      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(i + 1).padStart(2, '0');
      const txt = document.createElement('span');
      txt.className = 'txt';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = label.title;
      const s = document.createElement('span');
      s.className = 's';
      s.textContent = label.sub;
      txt.appendChild(t);
      if (label.sub) txt.appendChild(s);
      card.appendChild(idx);
      card.appendChild(txt);
      dom.cards.appendChild(card);
      label._card = card;
      label._g = g;
      label._line = line;
      label._ring = ring;
      label._dot = dot;
      label._measured = null;
    });
  }

  function measureCard(card) {
    if (!card._w) {
      card._w = card.offsetWidth || 150;
      card._h = card.offsetHeight || 34;
    }
    return card;
  }

  function updateLabels() {
    if (!dom.camera || !state.labelEntries.length) return;
    const enabled = state.labelsOn;
    dom.labels && dom.labels.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    if (!enabled) {
      for (const label of state.labelEntries) {
        if (label._g) label._g.style.display = 'none';
        if (label._card) label._card.style.opacity = '0';
      }
      return;
    }
    const w = innerWidth, h = innerHeight;
    const camera = dom.camera;
    const placed = [];
    const marginX = P.isMobile ? 16 : 26;
    const marginTop = P.isMobile ? 120 : 118;
    const marginBottom = P.isMobile ? 140 : 92;

    state.labelEntries.forEach((label, i) => {
      tmpV.copy(label.pos).project(camera);
      const behind = tmpV.z > 1 || tmpV.z < -1;
      if (behind) {
        label._g.style.display = 'none';
        label._card.style.opacity = '0';
        return;
      }
      const sx = (tmpV.x * 0.5 + 0.5) * w;
      const sy = (-tmpV.y * 0.5 + 0.5) * h;
      if (sx < -40 || sx > w + 40 || sy < -40 || sy > h + 40) {
        label._g.style.display = 'none';
        label._card.style.opacity = '0';
        return;
      }
      measureCard(label._card);
      const cw = label._card._w, ch = label._card._h;
      let side = label.side;
      if (!side) side = sx < w * 0.52 ? -1 : 1;
      const offsetX = Math.min(P.isMobile ? 118 : 148, w * 0.24) + cw * 0.5;
      let cx = sx + side * offsetX;
      let cy = sy + ((i % 3) - 1) * 26;
      cx = K.clamp(cx, marginX + cw / 2, w - marginX - cw / 2);
      cy = K.clamp(cy, marginTop + ch / 2, h - marginBottom - ch / 2);

      // resolve collisions by nudging vertically
      for (let attempt = 0; attempt < 24; attempt++) {
        let hit = false;
        for (const p of placed) {
          if (Math.abs(cx - p.x) < (cw + p.w) / 2 - 4 && Math.abs(cy - p.y) < (ch + p.h) / 2 + 5) {
            hit = true;
            break;
          }
        }
        if (!hit) break;
        cy += ch + 10;
        if (cy > h - marginBottom - ch / 2) {
          cy = marginTop + ch / 2 + ((attempt * 17) % Math.max(40, h * 0.35));
          cx += side * 26;
          cx = K.clamp(cx, marginX + cw / 2, w - marginX - cw / 2);
        }
      }
      placed.push({ x: cx, y: cy, w: cw, h: ch });

      label._card.style.left = cx + 'px';
      label._card.style.top = cy + 'px';
      label._card.style.opacity = '1';
      label._g.style.display = '';

      const dotX = sx, dotY = sy;
      const elbowX = sx + side * 26;
      const cardEdgeX = cx - side * (cw / 2 + 5);
      const points = [
        [dotX, dotY],
        [elbowX, dotY],
        [cardEdgeX, cy],
        [cx - side * (cw / 2), cy],
      ];
      label._line.setAttribute('points', points.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
      label._ring.setAttribute('cx', dotX.toFixed(1));
      label._ring.setAttribute('cy', dotY.toFixed(1));
      label._dot.setAttribute('cx', dotX.toFixed(1));
      label._dot.setAttribute('cy', dotY.toFixed(1));
    });
  }

  ui.update = function ({ dt, camera }) {
    if (!state.ready) return;
    if (state.labelsOn) updateLabels();
  };

  /* --------------------------------------------------------------- perf panel */
  function setupPerf() {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:16px;top:16px;z-index:40;font:11px/1.5 "DM Mono",monospace;' +
      'color:#efe4d2;background:rgba(24,20,17,0.72);padding:8px 10px;border-radius:3px;pointer-events:none;white-space:pre;';
    el.textContent = 'fps …';
    document.body.appendChild(el);
    state.perfEl = el;
  }
  ui.perf = function ({ fps, renderer }) {
    if (!state.perfEl) return;
    state.perfEl.textContent =
      'fps ' + Math.round(fps) +
      '\ncalls ' + renderer.info.render.calls +
      '\ntris ' + (renderer.info.render.triangles / 1000).toFixed(0) + 'k' +
      '\nparts ' + ((P.stats && P.stats.parts) || 0).toLocaleString('en-US');
  };
})();
