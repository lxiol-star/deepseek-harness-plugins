/* ============================================================================
 * main.js — stage: renderer, camera, free-orbit controls, build pipeline,
 * day/night, render loop, labels and postcard export.
 * Owned by the Lead.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  const K = P.kit;
  const THREE = window.THREE;
  const L = P.layout;
  const W = L.W;

  const params = new URLSearchParams(location.search);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const config = {
    maxDpr: params.get('dpr') ? parseFloat(params.get('dpr')) : (coarse ? 1.6 : 2),
    post: params.get('post') !== '0',
    shadows: params.get('shadows') !== '0',
    fast: params.get('fast') === '1',
    debug: params.get('debug') === '1',
    skip: (params.get('skip') || '').split(',').filter(Boolean),
    autoRotate: params.get('orbit') !== '0' && !reducedMotion,
    night: params.get('night') === '1',
    labels: params.get('labels') === '1',
  };
  P.config = config;
  P.isMobile = coarse || innerWidth < 860;
  P.reducedMotion = reducedMotion;

  const canvas = document.getElementById('scene');
  if (!canvas) return;

  /* ------------------------------------------------------------------ renderer */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    document.querySelector('.loader-sub').textContent = '抱歉，当前浏览器无法启用 WebGL。';
    console.error(err);
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = config.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = true;
  P.renderer = renderer;
  P.dpr = dpr;

  const scene = new THREE.Scene();
  scene.name = 'aurora-harbour';
  P.scene = scene;

  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.2, 400);
  P.camera = camera;
  scene.add(camera);

  const DEFAULT_VIEW = { yaw: 0.46, elev: 0.375, dist: 52 };
  const view = { ...DEFAULT_VIEW };
  const goal = { ...DEFAULT_VIEW };
  const state = {
    autoRotate: config.autoRotate,
    night: config.night,
    nightMix: config.night ? 1 : 0,
    dragging: false,
    lastInteraction: -10,
    yawVel: 0,
    elevVel: 0,
    labels: false,
    time: 0,
    userCamera: false,
    maxDist: 70,
    minDist: 23,
  };
  P.state = state;
  P.env.time = 0;

  const target = new THREE.Vector3(0, 0.28, 0);

  /* ---------------------------------------------------------------- day / night */
  function applyNight(immediate) {
    state.nightMix = immediate ? (state.night ? 1 : 0) : state.nightMix;
    P.env.mix = state.nightMix;
    document.body.classList.toggle('night', state.night);
    if (immediate) {
      P.studio.applyMix(state.nightMix);
      P.water && P.water.setMix(state.nightMix);
    }
    if (P.ui && P.ui.syncNight) P.ui.syncNight(state.night);
  }
  P.setNight = function (on, immediate = false) {
    state.night = !!on;
    P.env.nightTarget = state.night ? 1 : 0;
    applyNight(immediate);
    if (P.ui) P.ui.syncNight(state.night);
  };
  P.getNight = () => state.night;

  P.setAutoRotate = function (on) {
    state.autoRotate = !!on;
    if (P.ui && P.ui.syncOrbit) P.ui.syncOrbit(state.autoRotate);
  };
  P.getAutoRotate = () => state.autoRotate;

  /* ------------------------------------------------------------------- orbit */
  let activePointer = null;
  let lastX = 0, lastY = 0;
  const pointers = new Map();
  let pinchDist = 0;

  function markInteraction() {
    state.lastInteraction = state.time;
    document.body.classList.add('interacted');
  }

  function clampView() {
    goal.elev = K.clamp(goal.elev, 0.1, 1.18);
    view.elev = K.clamp(view.elev, 0.1, 1.18);
    goal.dist = K.clamp(goal.dist, state.minDist, state.maxDist);
    view.dist = K.clamp(view.dist, state.minDist, state.maxDist);
  }

  // Fit the whole plinth into the viewport, especially on portrait phones.
  function fitDistance(fovDeg, aspect) {
    const vf = (fovDeg * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * Math.max(0.2, aspect));
    const dW = 16.6 / Math.tan(hf / 2);
    const dH = 13.5 / Math.tan(vf / 2);
    return Math.max(26, dW, dH);
  }

  function adaptCamera(force) {
    const aspect = innerWidth / Math.max(1, innerHeight);
    const portrait = aspect < 0.95;
    const fov = portrait ? 40 : 30;
    camera.fov = fov;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const fit = fitDistance(fov, aspect);
    state.maxDist = Math.max(70, fit * 1.35);
    if (force || !state.userCamera) {
      const d = Math.max(DEFAULT_VIEW.dist, fit);
      goal.dist = d;
      view.dist = d;
      // In portrait, a higher camera turns the wide plinth into a rounder,
      // more legible composition instead of a thin band with empty space.
      goal.elev = portrait ? 0.8 : DEFAULT_VIEW.elev;
      view.elev = goal.elev;
      state.autoFit = true;
    }
    clampView();
  }

  function setGoalFromView() {
    goal.yaw = view.yaw;
    goal.elev = view.elev;
    goal.dist = view.dist;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      state.dragging = true;
      activePointer = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      state.yawVel = 0;
      state.elevVel = 0;
      state.userCamera = true;
      document.body.classList.add('dragging');
      markInteraction();
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const pts = Array.from(pointers.values());
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist > 0) {
        goal.dist *= pinchDist / Math.max(20, d);
        clampView();
      }
      pinchDist = d;
      return;
    }
    if (!state.dragging || e.pointerId !== activePointer) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    goal.yaw -= dx * 0.0048;
    goal.elev -= dy * 0.0033;
    state.yawVel = -dx * 0.0048;
    state.elevVel = -dy * 0.0033;
    clampView();
    markInteraction();
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      state.dragging = false;
      activePointer = null;
      document.body.classList.remove('dragging');
    }
    if (pointers.size < 2) pinchDist = 0;
    if (e && canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId)) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => { if (state.dragging) return; });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      goal.dist *= Math.exp(e.deltaY * 0.00105);
      state.userCamera = true;
      clampView();
      markInteraction();
    },
    { passive: false }
  );

  canvas.addEventListener('dblclick', () => {
    state.userCamera = false;
    goal.yaw = DEFAULT_VIEW.yaw + Math.round((view.yaw - DEFAULT_VIEW.yaw) / (Math.PI * 2)) * Math.PI * 2;
    goal.elev = DEFAULT_VIEW.elev;
    goal.dist = Math.max(DEFAULT_VIEW.dist, fitDistance(camera.fov, camera.aspect));
    markInteraction();
  });

  P.setView = function (opts = {}, instant = true) {
    if (opts.yaw != null) { view.yaw = opts.yaw; goal.yaw = opts.yaw; }
    if (opts.elev != null) { view.elev = opts.elev; goal.elev = opts.elev; }
    if (opts.dist != null) { view.dist = opts.dist; goal.dist = opts.dist; }
    if (opts.autoRotate != null) P.setAutoRotate(opts.autoRotate);
    clampView();
    if (instant) updateCamera(0, true);
  };
  P.resetView = () => {
    state.userCamera = false;
    goal.yaw = DEFAULT_VIEW.yaw + Math.round((view.yaw - DEFAULT_VIEW.yaw) / (Math.PI * 2)) * Math.PI * 2;
    goal.elev = DEFAULT_VIEW.elev;
    goal.dist = Math.max(DEFAULT_VIEW.dist, fitDistance(camera.fov, camera.aspect));
  };
  P.getView = () => ({
    yaw: view.yaw, elev: view.elev, dist: view.dist,
    autoRotate: state.autoRotate, night: state.night, labels: state.labels,
  });

  function updateCamera(dt, force = false) {
    if (state.autoRotate && !state.dragging && state.time > state.lastInteraction + 3.2) {
      goal.yaw += 0.042 * dt;
    }
    if (!state.dragging) {
      if (Math.abs(state.yawVel) > 0.00001) {
        goal.yaw += state.yawVel;
        state.yawVel *= Math.exp(-6 * dt);
        goal.elev += state.elevVel;
        state.elevVel *= Math.exp(-6 * dt);
        clampView();
      }
    }
    const lam = force ? 1000 : 11;
    view.yaw = K.damp(view.yaw, goal.yaw, lam, dt);
    view.elev = K.damp(view.elev, goal.elev, lam, dt);
    view.dist = K.damp(view.dist, goal.dist, force ? 1000 : 7.5, dt);
    clampView();

    const ce = Math.cos(view.elev);
    camera.position.set(
      target.x + Math.sin(view.yaw) * ce * view.dist,
      target.y + Math.sin(view.elev) * view.dist,
      target.z + Math.cos(view.yaw) * ce * view.dist
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  /* --------------------------------------------------------------- build flow */
  const loaderBar = document.getElementById('loader-bar');
  const loaderStep = document.getElementById('loader-step');
  const loaderPct = document.getElementById('loader-pct');
  let progress = 0;
  function setProgress(p, label) {
    progress = Math.max(progress, p);
    if (loaderBar) loaderBar.style.width = progress + '%';
    if (loaderPct) loaderPct.textContent = Math.round(progress) + '%';
    if (loaderStep && label) loaderStep.textContent = label;
  }
  P.loaderStep = setProgress;
  const nextFrame = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

  const builderOrder = [
    ['terrain', '塑造岛屿与岸线', 16],
    ['terminal', '架设岸桥与堆场', 34],
    ['fleet', '让船队下水', 52],
    ['town', '建造老城与街巷', 68],
    ['effects', '点亮灯塔与海鸥', 82],
  ];
  const ctx = { renderer, scene, camera, THREE, kit: K, layout: L, studio: null, water: null };
  P.ctx = ctx;

  let post = null;

  async function boot() {
    document.body.classList.add('loading');
    setProgress(3, '展开图纸');
    try {
      await Promise.race([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        new Promise((r) => setTimeout(r, 1400)),
      ]);
    } catch (err) { /* noop */ }

    setProgress(7, '打磨胡桃木底座');
    await nextFrame();

    P.batch = new K.Batcher();
    ctx.batch = P.batch;
    ctx.studio = P.studio;
    ctx.water = P.water;
    P.stats = P.stats || {};
    P.stats.parts = 0;
    P.ticks = [];
    P.labels = [];

    P.studio.build(renderer, scene);
    K.count('parts', 52);
    setProgress(12, '引入海水与倒影');
    await nextFrame();

    P.water.build(renderer, scene, camera);
    setProgress(15, '拼装码头');
    await nextFrame();

    for (const [id, label, pct] of builderOrder) {
      if (config.skip.includes(id)) continue;
      setProgress(pct - 8, label);
      await nextFrame();
      const fn = P.builders && P.builders[id];
      if (typeof fn === 'function') {
        try {
          await Promise.resolve(fn(ctx));
        } catch (err) {
          console.error('[build] ' + id + ' failed', err);
          (P.buildErrors = P.buildErrors || []).push({ id, error: String(err && err.stack || err) });
        }
      } else {
        console.warn('[build] missing builder: ' + id);
      }
      setProgress(pct, label + ' · 完成');
      await nextFrame();
    }

    // bake all static geometry into a handful of meshes
    setProgress(88, '统一材质与阴影');
    P.batch.finish(scene);
    P.stats.parts = (P.stats.parts || 0);
    setProgress(92, '调校展厅灯光');
    await nextFrame();

    // post pipeline
    if (config.post) {
      try {
        post = new P.Post(renderer);
        post.setSize(renderer);
        P.post = post;
      } catch (err) {
        console.warn('[post] disabled', err);
        post = null;
      }
    }
    if (!post) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
    }

    P.studio.applyMix(state.night ? 1 : 0);
    P.water.setMix(state.night ? 1 : 0);
    applyNight(true);

    // instantiate UI (buttons, labels, compass)
    if (P.ui && P.ui.init) {
      try { P.ui.init({ camera, scene, renderer, post }); } catch (err) { console.error('[ui] init failed', err); }
    }

    adaptCamera(true);
    updateCamera(0, true);
    setProgress(97, '最后校对');
    await nextFrame();

    // first render before revealing
    P.water.update(0.016, state.nightMix);
    P.water.updateReflection(renderer, scene, camera);
    renderFrame(0.016);

    setProgress(100, '开馆');
    state.time = 0;
    state.lastInteraction = -10;
    P.ready = true;
    window.__PORT_READY = true;
    document.body.classList.remove('loading');
    document.body.classList.add('ready');
    if (P.ui && P.ui.refreshStats) P.ui.refreshStats();
    setTimeout(() => document.body.classList.remove('ready-fade'), 0);

    last = performance.now();
    requestAnimationFrame(loop);
    updateScalebar();
  }

  const clock = { last: performance.now() };
  let last = performance.now();
  let frames = 0, fpsTime = 0, fps = 60;

  function renderFrame(dt) {
    if (post && post.enabled) {
      const mix = state.nightMix;
      const day = P.studio.colors.day, night = P.studio.colors.night;
      // The tilt-shift is a low-angle miniature effect: ease it off as the
      // camera rises towards a plan view so the top-down model stays legible.
      const elevT = K.smoothstep(0.58, 1.08, view.elev);
      const tiltBase = config.fast ? 0.35 : P.isMobile ? 0.0 : 0.82;
      post.render(scene, camera, {
        time: P.env.time,
        mix,
        exposure: K.lerp(day.exposure, night.exposure, mix),
        tilt: tiltBase * (1 - 0.78 * elevT),
        focus: K.lerp(P.isMobile ? 0.24 : 0.15, P.isMobile ? 0.3 : 0.26, elevT),
        bloom: P.isMobile ? 0.3 : 0.52,
        vignette: P.isMobile ? 0.22 : 0.3,
        grain: K.lerp(config.fast ? 0.01 : 0.02, 0.012, mix),
      });
    } else {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!P.ready) return;
    state.time += dt;
    P.env.time += dt;

    // night transition
    const targetMix = state.night ? 1 : 0;
    if (Math.abs(state.nightMix - targetMix) > 0.0015) {
      state.nightMix = K.damp(state.nightMix, targetMix, 2.4, dt);
      if (Math.abs(state.nightMix - targetMix) < 0.002) state.nightMix = targetMix;
      P.env.mix = state.nightMix;
      P.studio.applyMix(state.nightMix);
      P.water.setMix(state.nightMix);
      if (P.ui && P.ui.onNightMix) P.ui.onNightMix(state.nightMix);
    }

    updateCamera(dt);
    P.water.update(dt, state.nightMix);

    for (let i = 0; i < P.ticks.length; i++) {
      try { P.ticks[i](dt, P.env.time, P.env); } catch (err) { /* keep going */ }
    }

    if (P.ui && P.ui.update) {
      try { P.ui.update({ dt, camera, time: P.env.time, view }); } catch (err) { /* keep going */ }
    }

    P.water.updateReflection(renderer, scene, camera);
    renderFrame(dt);

    frames++;
    fpsTime += dt;
    if (fpsTime > 0.6) {
      fps = frames / fpsTime;
      frames = 0;
      fpsTime = 0;
      if (config.debug && P.ui && P.ui.perf) P.ui.perf({ fps, renderer });
      updateScalebar();
    }
  }

  /* ------------------------------------------------------------ compass / scale */
  const needle = document.querySelector('.compass-rose .needle');
  const scaleLine = document.getElementById('scalebar-line');
  const scaleText = document.getElementById('scalebar-text');
  function updateScalebar() {
    if (needle) needle.style.transform = 'rotate(' + (-view.yaw * 180) / Math.PI + 'deg)';
    if (scaleLine && scaleText) {
      const fov = (camera.fov * Math.PI) / 180;
      const pxPerUnit = innerHeight / (2 * view.dist * Math.tan(fov / 2));
      let meters = 100;
      let px = pxPerUnit * (meters / W.unitMeters);
      if (px < 42) { meters = 200; px = pxPerUnit * (meters / W.unitMeters); }
      if (px > 140) { meters = 50; px = pxPerUnit * (meters / W.unitMeters); }
      scaleLine.style.width = Math.round(K.clamp(px, 28, 150)) + 'px';
      scaleText.textContent = meters + ' m';
    }
  }

  /* -------------------------------------------------------------------- resize */
  function onResize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.maxDpr));
    renderer.setSize(w, h, false);
    adaptCamera(false);
    if (post) post.setSize(renderer);
    P.water.resize(renderer);
    updateCamera(0, true);
    renderFrame(0.016);
    updateScalebar();
  }
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 120));

  /* ------------------------------------------------------------------- postcard */
  P.makePostcard = function () {
    const prevPixelRatio = renderer.getPixelRatio();
    const prevSize = renderer.getSize(new THREE.Vector2());
    const prevAspect = camera.aspect;
    const outW = 2600;
    const outH = Math.round(outW * (innerHeight / innerWidth));

    try {
      renderer.setPixelRatio(1);
      renderer.setSize(outW, outH, false);
      camera.aspect = outW / outH;
      camera.updateProjectionMatrix();
      if (post) post.setSize(renderer);
      P.water.resize(renderer);
      updateCamera(0, true);
      P.water.update(0.016, state.nightMix);
      P.water.updateReflection(renderer, scene, camera);
      renderFrame(0.016);

      const margin = 180;
      const topPad = 170;
      const bottomPad = 150;
      const canvas2d = document.createElement('canvas');
      canvas2d.width = outW + margin * 2;
      canvas2d.height = outH + topPad + bottomPad;
      const g = canvas2d.getContext('2d');
      g.fillStyle = state.night > 0.5 ? '#191510' : '#efe4d2';
      g.fillRect(0, 0, canvas2d.width, canvas2d.height);

      g.drawImage(renderer.domElement, margin, topPad, outW, outH);

      // frame around the plate
      g.strokeStyle = state.night > 0.5 ? 'rgba(240,229,210,0.35)' : 'rgba(46,40,34,0.4)';
      g.lineWidth = 1;
      g.strokeRect(margin - 22, topPad - 22, outW + 44, outH + 44);
      // brass hairline under the header
      g.strokeStyle = 'rgba(167,130,71,0.75)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(margin, 142); g.lineTo(margin + 240, 142); g.stroke();

      const ink = state.night > 0.5 ? '#efe4d2' : '#2e2822';
      const soft = state.night > 0.5 ? 'rgba(239,228,210,0.6)' : 'rgba(46,40,34,0.6)';
      g.fillStyle = ink;
      g.font = '600 62px "Songti SC", "STSong", serif';
      g.textBaseline = 'alphabetic';
      g.fillText('微港 · PORT AURORA', margin, 96);
      g.fillStyle = soft;
      g.font = '400 22px "DM Mono", monospace';
      g.fillText('A MINIATURE HARBOUR · SCALE 1:1000 · NO. 001', margin, 134);
      g.textAlign = 'right';
      g.fillText('THE AURORA HARBOUR MUSEUM', margin + outW, 134);
      g.fillText('POSTCARD FROM THE COLLECTION', margin + outW, canvas2d.height - 54);
      g.textAlign = 'left';
      g.fillText('拖拽环视 · 滚轮缩放', margin, canvas2d.height - 54);
      return canvas2d.toDataURL('image/png');
    } catch (err) {
      console.warn('[postcard] failed', err);
      return canvas.toDataURL('image/png');
    } finally {
      renderer.setPixelRatio(prevPixelRatio);
      renderer.setSize(prevSize.x, prevSize.y, false);
      camera.aspect = prevAspect;
      camera.updateProjectionMatrix();
      if (post) post.setSize(renderer);
      P.water.resize(renderer);
      updateCamera(0, true);
      requestAnimationFrame(() => renderFrame(0.016));
    }
  };

  P.getPerf = () => {
    const sceneStats = (post && post.sceneStats) || { calls: 0, triangles: 0 };
    return {
      fps: Math.round(fps),
      calls: sceneStats.calls,
      triangles: sceneStats.triangles,
      postCalls: renderer.info.render.calls,
      parts: (P.stats && P.stats.parts) || 0,
      labels: (P.labels && P.labels.length) || 0,
      buildErrors: P.buildErrors || [],
    };
  };

  /* ------------------------------------------------------------------- expose */
  P.boot = boot;
  P.builders = P.builders || {};

  // default anchors from the layout (owners can refine them)
  if (P.layout.placements && P.layout.placements.anchors) {
    for (const [key, pos] of Object.entries(P.layout.placements.anchors)) {
      P.anchors[key] = { pos: [pos[0], pos[1], pos[2]] };
    }
  }

  // begin
  applyNight(true);
  boot().catch((err) => {
    console.error('[boot] failed', err);
    const sub = document.querySelector('.loader-sub');
    if (sub) sub.textContent = '组装时遇到问题，请查看控制台。';
  });
})();
