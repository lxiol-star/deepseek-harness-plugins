/* ============================================================================
 * terminal.js — the container terminal of Port Aurora.
 * Owned by teammate `terminal-yard`.  Only this file is edited here.
 *
 * Contents
 *   1.  shared helpers, container texture / geometry / materials
 *   2.  yard slab + 8 rows x 21 bays of stacks (instanced), reefers, markers
 *   3.  four detailed STS gantry cranes, three of them on a calm load cycle
 *   4.  two travelling RTGs cycling their trolleys
 *   5.  straddle carriers, terminal tractors, reach stacker, forklift, handler
 *   6.  support zone: ops tower, workshop, gatehouse, fuel farm, substation …
 *   7.  rail spur: loaded flats, buffer stops, signals, shunting locomotive
 *   8.  quay apron: markings, end stops, floodlights, CCTV, signs, props
 *   9.  labels / counters / anchors / per-frame ticks
 *
 * No external assets; every surface is procedural.  Static geometry goes
 * through the shared vert-colour Batcher, containers through one InstancedMesh,
 * animated assemblies are small vertex-coloured sub-batches inside Groups.
 * ========================================================================= */
(function () {
  'use strict';

  const P = (window.PORT = window.PORT || {});
  const K = P.kit;
  const THREE = K.THREE;
  P.builders = P.builders || {};

  /* ---------------------------------------------------------------- helpers */
  const TAU = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _uv = [0, 0, 0];

  const mix = K.mix;
  const pal = K.palette;
  const clamp = K.clamp;
  const rndPick = K.pick;

  // Vertex-colour batch primitives.  `b` is either PORT.batch or a local
  // Batcher that will be finished into a moving Group.
  function box(b, w, h, d, x, y, z, color, o) {
    b.add(K.geoBox(), color, Object.assign({}, o, { scale: [w, h, d], pos: [x, y, z] }));
  }
  function cyl(b, r, h, x, y, z, color, o) {
    b.add(K.geoCyl((o && o.seg) || 10), color, Object.assign({}, o, { scale: [r, h, r], pos: [x, y, z] }));
  }
  function cylX(b, r, h, x, y, z, color, o) {
    b.add(K.geoCyl((o && o.seg) || 10), color,
      Object.assign({}, o, { scale: [r, h, r], pos: [x, y, z], rot: [0, 0, Math.PI / 2] }));
  }
  function cylZ(b, r, h, x, y, z, color, o) {
    b.add(K.geoCyl((o && o.seg) || 10), color,
      Object.assign({}, o, { scale: [r, h, r], pos: [x, y, z], rot: [Math.PI / 2, 0, 0] }));
  }
  function sph(b, r, x, y, z, color, o) {
    b.add(K.geoSphere(o && o.ws || 8, o && o.hs || 6), color,
      Object.assign({}, o, { scale: [r, r, r], pos: [x, y, z] }));
  }
  // Round strut between two points (lattice work, railings, cables).
  function strut(b, a, c, r, color, o) {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    _dir.set(dx / len, dy / len, dz / len);
    _quat.setFromUnitVectors(UP, _dir);
    b.add(K.geoCyl((o && o.seg) || 6), color, Object.assign({}, o, {
      quat: _quat, scale: [r, len, r],
      pos: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2],
    }));
  }
  // Square-section member between two points.
  function bar(b, a, c, w, color, o) {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    _dir.set(dx / len, dy / len, dz / len);
    _quat.setFromUnitVectors(UP, _dir);
    b.add(K.geoBox(), color, Object.assign({}, o, {
      quat: _quat, scale: [w, len, (o && o.depth) || w],
      pos: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2],
    }));
  }
  function disc(b, r, x, y, z, color, o) {
    b.add(K.geoCircle((o && o.seg) || 20), color,
      Object.assign({}, o, { rot: [-Math.PI / 2, 0, 0], scale: [r, r, 1], pos: [x, y, z] }));
  }
  function plateY(b, w, d, x, y, z, color, o) { // thin horizontal plate
    box(b, w, 0.006, d, x, y, z, color, o);
  }

  function keyed(t, keys) {
    // keys: [[time, value], ...] with time ascending 0..1; smooth between.
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i];
        const span = b[0] - a[0] || 1e-6;
        const u = K.smoothstep(0, 1, (t - a[0]) / span);
        return a[1] + (b[1] - a[1]) * u;
      }
    }
    return keys[keys.length - 1][1];
  }

  // ping-pong with dwell at both ends; s runs -1..1, dir is the travel sign.
  function shuttle(t, period, dwellFrac) {
    const p = (((t % period) + period) % period) / period; // 0..1
    const d = clamp(dwellFrac, 0.001, 0.45);
    const move = 1 - 2 * d;
    if (p < d) return { s: -1, dir: 1, still: true };
    if (p < d + move / 2) {
      const u = (p - d) / (move / 2);
      return { s: -1 + 2 * u, dir: 1, still: false };
    }
    if (p < d + move) {
      const u = (p - d - move / 2) / (move / 2);
      return { s: 1 - 2 * u, dir: -1, still: false };
    }
    return { s: 1, dir: -1, still: true };
  }

  /* =========================================================================
   * 1. CONTAINERS — texture atlas, geometry, materials
   * ====================================================================== */
  const C_LEN = 0.61;   // 20 ft at 1:1000
  const C_H = 0.26;
  const C_W = 0.26;

  function containerTexture() {
    const rr = K.rng(0x0c0a77);
    return K.texture(K.canvas(1024, 512, (ctx, w, h) => {
      /* ---------------------------------------------------------- side band */
      const sx = 0, sy = 240, sw = 640, sh = 272;
      ctx.save();
      ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
      ctx.fillStyle = '#ccc6b9'; ctx.fillRect(sx, sy, sw, sh);
      let g = ctx.createLinearGradient(0, sy, 0, sy + sh);
      g.addColorStop(0, 'rgba(255,250,238,0.10)');
      g.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(58,47,32,0.22)');
      ctx.fillStyle = g; ctx.fillRect(sx, sy, sw, sh);

      // corrugated side: 21 ribs
      const ribs = 21, pad = 26, pitch = (sw - pad * 2) / ribs;
      for (let i = 0; i < ribs; i++) {
        const x = sx + pad + i * pitch;
        const rg = ctx.createLinearGradient(x, 0, x + pitch, 0);
        rg.addColorStop(0, 'rgba(58,50,40,0.36)');
        rg.addColorStop(0.18, 'rgba(255,250,238,0.30)');
        rg.addColorStop(0.46, 'rgba(255,255,255,0.03)');
        rg.addColorStop(0.78, 'rgba(58,50,40,0.20)');
        rg.addColorStop(1, 'rgba(42,36,29,0.33)');
        ctx.fillStyle = rg;
        ctx.fillRect(x, sy + 12, pitch, sh - 26);
      }
      // top and bottom rails
      ctx.fillStyle = 'rgba(66,58,46,0.55)'; ctx.fillRect(sx, sy, sw, 9);
      ctx.fillStyle = 'rgba(255,248,235,0.22)'; ctx.fillRect(sx, sy + 9, sw, 3);
      ctx.fillStyle = 'rgba(52,45,36,0.55)'; ctx.fillRect(sx, sy + sh - 13, sw, 13);
      ctx.fillStyle = 'rgba(255,248,235,0.16)'; ctx.fillRect(sx, sy + sh - 16, sw, 3);
      // corner castings
      for (const cx of [sx + 2, sx + sw - 30]) {
        for (const cy of [sy + 1, sy + sh - 27]) {
          ctx.fillStyle = 'rgba(46,42,36,0.85)'; ctx.fillRect(cx, cy, 28, 26);
          ctx.fillStyle = 'rgba(210,202,186,0.5)';
          ctx.fillRect(cx + 5, cy + 5, 18, 3); ctx.fillRect(cx + 5, cy + 18, 18, 3);
        }
      }
      // stencilled reporting marks + data plate
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(48,46,40,0.88)';
      ctx.font = `700 25px ${K.fonts.mono}`;
      ctx.fillText('AURU 208 431 7', sx + 96, sy + 62);
      ctx.font = `700 15px ${K.fonts.mono}`;
      ctx.fillText('22G1', sx + 96, sy + 84);
      ctx.font = `500 10px ${K.fonts.mono}`;
      ctx.fillStyle = 'rgba(48,46,40,0.66)';
      ctx.fillText('MAX GR 30 480 KG', sx + 96, sy + 101);
      ctx.fillText('TARE  2 240 KG', sx + 96, sy + 114);
      ctx.fillText('NET  28 240 KG', sx + 96, sy + 127);
      ctx.fillText('CU CAP. 33.2 M3', sx + 96, sy + 140);
      // fictional line mark
      ctx.strokeStyle = 'rgba(44,52,50,0.72)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx + 536, sy + 74, 27, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(44,52,50,0.72)';
      ctx.font = `700 24px ${K.fonts.serif}`; ctx.textAlign = 'center';
      ctx.fillText('AL', sx + 536, sy + 82);
      ctx.font = `700 11px ${K.fonts.sans}`;
      ctx.fillText('A U R O R A', sx + 536, sy + 114);
      ctx.font = `500 8px ${K.fonts.sans}`;
      ctx.fillText('LINES · 极光航运', sx + 536, sy + 126);
      // CSC safety plate
      ctx.fillStyle = 'rgba(60,56,48,0.30)';
      ctx.fillRect(sx + 474, sy + 168, 66, 38);
      ctx.strokeStyle = 'rgba(40,38,34,0.5)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 474, sy + 168, 66, 38);
      ctx.fillStyle = 'rgba(40,38,34,0.55)';
      for (let i = 0; i < 4; i++) ctx.fillRect(sx + 480, sy + 174 + i * 8, 54, 1.5);
      ctx.textAlign = 'left';
      ctx.font = `700 9px ${K.fonts.mono}`;
      ctx.fillStyle = 'rgba(48,46,40,0.55)';
      ctx.fillText('CSC SAFETY APPROVAL', sx + 474, sy + 162);
      // grime + rust streaks
      for (let i = 0; i < 46; i++) {
        const x = sx + 10 + rr() * (sw - 20);
        const len = 8 + rr() * 60;
        const alpha = 0.03 + rr() * 0.10;
        ctx.strokeStyle = `rgba(110,72,44,${alpha})`;
        ctx.lineWidth = 1 + rr() * 2.4;
        ctx.beginPath(); ctx.moveTo(x, sy + sh - 16 - rr() * 20); ctx.lineTo(x, sy + sh - 16 - len); ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const x = sx + 8 + rr() * (sw - 16);
        ctx.fillStyle = `rgba(96,64,40,${0.05 + rr() * 0.07})`;
        ctx.fillRect(x, sy + sh - 26 - rr() * 22, 2 + rr() * 8, 10 + rr() * 16);
      }
      const dirt = ctx.createLinearGradient(0, sy + sh - 46, 0, sy + sh);
      dirt.addColorStop(0, 'rgba(74,58,40,0)');
      dirt.addColorStop(1, 'rgba(74,58,40,0.26)');
      ctx.fillStyle = dirt; ctx.fillRect(sx, sy + sh - 46, sw, 46);
      const scuff = ctx.createLinearGradient(0, sy + 140, 0, sy + 200);
      scuff.addColorStop(0, 'rgba(255,255,255,0)');
      scuff.addColorStop(0.5, 'rgba(255,255,255,0.07)');
      scuff.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = scuff; ctx.fillRect(sx, sy + 140, sw, 60);
      ctx.restore();

      /* ---------------------------------------------------------- door band */
      const dx = 655, dy = 240, dw = 245, dh = 272;
      ctx.save();
      ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
      ctx.fillStyle = '#c7c1b4'; ctx.fillRect(dx, dy, dw, dh);
      const dg = ctx.createLinearGradient(0, dy, 0, dy + dh);
      dg.addColorStop(0, 'rgba(255,250,238,0.10)');
      dg.addColorStop(1, 'rgba(58,47,32,0.20)');
      ctx.fillStyle = dg; ctx.fillRect(dx, dy, dw, dh);
      // top/bottom rails
      ctx.fillStyle = 'rgba(60,54,44,0.62)'; ctx.fillRect(dx, dy, dw, 10);
      ctx.fillStyle = 'rgba(60,54,44,0.62)'; ctx.fillRect(dx, dy + dh - 12, dw, 12);
      // centre seam
      ctx.fillStyle = 'rgba(48,44,36,0.5)'; ctx.fillRect(dx + dw / 2 - 1.5, dy + 10, 3, dh - 22);
      // door leaves: subtle vertical panel + 4 lock rods
      for (const lx of [dx + dw * 0.25, dx + dw * 0.75]) {
        ctx.fillStyle = 'rgba(255,250,238,0.06)';
        ctx.fillRect(lx - 40, dy + 12, 80, dh - 26);
      }
      const rods = [dx + 34, dx + 92, dx + 150, dx + 208];
      for (const rx of rods) {
        ctx.fillStyle = 'rgba(52,48,40,0.78)'; ctx.fillRect(rx - 2.5, dy + 14, 5, dh - 30);
        ctx.fillStyle = 'rgba(226,218,200,0.34)'; ctx.fillRect(rx - 4.5, dy + 16, 2, dh - 34);
        // handle
        ctx.fillStyle = 'rgba(46,44,38,0.85)';
        ctx.fillRect(rx - 6, dy + dh * 0.55, 12, 9);
        ctx.fillRect(rx - 3, dy + dh * 0.55 - 22, 6, 24);
      }
      // hinges
      ctx.fillStyle = 'rgba(44,42,36,0.7)';
      for (const hy of [dy + 30, dy + dh * 0.5, dy + dh - 44]) {
        ctx.fillRect(dx + 6, hy, 10, 14);
        ctx.fillRect(dx + dw - 16, hy, 10, 14);
      }
      // numbers / placard
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(48,46,40,0.8)';
      ctx.font = `700 17px ${K.fonts.mono}`;
      ctx.fillText('AURU 208 431 7', dx + 30, dy + 34);
      ctx.font = `700 11px ${K.fonts.mono}`;
      ctx.fillText('22G1', dx + 30, dy + 50);
      ctx.fillStyle = 'rgba(238,230,212,0.55)';
      ctx.fillRect(dx + 34, dy + 96, 44, 34);
      ctx.strokeStyle = 'rgba(48,44,38,0.6)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(dx + 34, dy + 96, 44, 34);
      ctx.fillStyle = 'rgba(48,44,38,0.65)';
      ctx.font = `700 9px ${K.fonts.mono}`;
      ctx.fillText('CSC', dx + 49, dy + 108);
      ctx.fillText('SAFE', dx + 47, dy + 119);
      // small hazard label
      ctx.fillStyle = 'rgba(196,186,160,0.55)';
      ctx.fillRect(dx + 168, dy + 96, 40, 30);
      ctx.fillStyle = 'rgba(70,62,46,0.55)';
      ctx.beginPath(); ctx.moveTo(dx + 188, dy + 102); ctx.lineTo(dx + 200, dy + 120);
      ctx.lineTo(dx + 176, dy + 120); ctx.closePath(); ctx.fill();
      // dirt
      const dd = ctx.createLinearGradient(0, dy + dh - 56, 0, dy + dh);
      dd.addColorStop(0, 'rgba(70,56,38,0)'); dd.addColorStop(1, 'rgba(70,56,38,0.24)');
      ctx.fillStyle = dd; ctx.fillRect(dx, dy + dh - 56, dw, 56);
      for (let i = 0; i < 12; i++) {
        const x = dx + 8 + rr() * (dw - 16);
        ctx.strokeStyle = `rgba(108,72,44,${0.04 + rr() * 0.08})`;
        ctx.lineWidth = 1 + rr() * 2;
        ctx.beginPath(); ctx.moveTo(x, dy + dh - 14); ctx.lineTo(x, dy + dh - 14 - rr() * 44); ctx.stroke();
      }
      ctx.restore();

      /* ---------------------------------------------------------- roof band */
      const rx0 = 0, ry0 = 0, rw = 640, rh = 230;
      ctx.save();
      ctx.beginPath(); ctx.rect(rx0, ry0, rw, rh); ctx.clip();
      ctx.fillStyle = '#a39d91'; ctx.fillRect(rx0, ry0, rw, rh);
      // lengthwise ribs (2 per pitch)
      for (let y = ry0 + 6; y < ry0 + rh; y += 11) {
        ctx.fillStyle = 'rgba(64,58,48,0.20)'; ctx.fillRect(rx0, y, rw, 3);
        ctx.fillStyle = 'rgba(236,228,212,0.20)'; ctx.fillRect(rx0, y + 3, rw, 2);
      }
      // end caps / corner casting shadow
      ctx.fillStyle = 'rgba(56,50,42,0.4)'; ctx.fillRect(rx0, ry0, rw, 4);
      ctx.fillRect(rx0, ry0 + rh - 4, rw, 4);
      // roof vents + patches
      for (let i = 0; i < 3; i++) {
        const x = rx0 + 90 + rr() * (rw - 180);
        ctx.fillStyle = 'rgba(60,58,52,0.5)'; ctx.fillRect(x, ry0 + 60 + rr() * 70, 22, 15);
        ctx.fillStyle = 'rgba(190,184,168,0.35)'; ctx.fillRect(x + 2, ry0 + 62 + rr() * 4, 18, 3);
      }
      for (let i = 0; i < 30; i++) {
        const x = rx0 + rr() * rw, y = ry0 + rr() * rh;
        ctx.fillStyle = `rgba(108,76,48,${0.03 + rr() * 0.08})`;
        ctx.fillRect(x, y, 4 + rr() * 22, 2 + rr() * 6);
      }
      ctx.restore();

      /* ---------------------------------------- spare band: hazards / plates */
      const hx = 655, hy = 0, hw = 369, hh = 230;
      ctx.save();
      ctx.beginPath(); ctx.rect(hx, hy, hw, hh); ctx.clip();
      ctx.fillStyle = '#b6b0a3'; ctx.fillRect(hx, hy, hw, hh);
      // hazard chevrons (used for warning decals on doors / cranes)
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(52,48,40,0.75)' : 'rgba(226,204,150,0.85)';
        ctx.save();
        ctx.translate(hx + (i % 4) * 92, hy + 8 + Math.floor(i / 4) * 54);
        ctx.rotate(-0.5);
        ctx.fillRect(0, 0, 60, 18);
        ctx.restore();
      }
      ctx.restore();
    }), { anisotropy: 8 });
  }

  function containerGeometry() {
    const hx = C_LEN / 2, hy = C_H / 2, hz = C_W / 2;
    const pos = [], nor = [], uv = [];
    const SIDE = [0.004, 0.620, 0.002, 0.529];
    const DOOR = [0.640, 0.874, 0.002, 0.529];
    const ROOF = [0.004, 0.620, 0.552, 0.994];
    function quad(c, n, reg, mirror) {
      const u0 = reg[0], u1 = reg[1], v0 = reg[2], v1 = reg[3];
      const us = mirror ? [u1, u0, u0, u1] : [u0, u1, u1, u0];
      const vs = [v0, v0, v1, v1];
      const idx = [0, 1, 2, 0, 2, 3];
      for (let i = 0; i < 6; i++) {
        const k = idx[i];
        pos.push(c[k][0], c[k][1], c[k][2]);
        nor.push(n[0], n[1], n[2]);
        uv.push(us[k], vs[k]);
      }
    }
    quad([[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], [0, 0, 1], SIDE, false);
    quad([[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], [0, 0, -1], SIDE, true);
    quad([[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], [1, 0, 0], DOOR, false);
    quad([[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], [-1, 0, 0], DOOR, true);
    quad([[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], [0, 1, 0], ROOF, false);
    quad([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], [0, -1, 0], ROOF, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }

  /* =========================================================================
   * 2. THE BUILDER
   * ====================================================================== */
  P.builders.terminal = function terminal(ctx) {
    const L = (ctx && ctx.layout) || P.layout;
    const scene = (ctx && ctx.scene) || P.scene;
    const Z = L.zones.terminal;
    const B = P.batch;
    const DECK = L.W.deckY;              // 1.10
    const rnd = K.rng(0x51a7e0);
    const rndY = K.rng(0x2b7d19);        // yard
    const rndD = K.rng(0x77c1e3);        // details

    /* -------------------------------------------------- container materials */
    const cTex = containerTexture();
    const cGeo = containerGeometry();
    const cMat = new THREE.MeshStandardMaterial({
      map: cTex, roughness: 0.80, metalness: 0.05, envMapIntensity: 0.55,
    });
    const movingMatCache = new Map();
    function movingContainerMaterial(tint) {
      const key = tint.getHexString();
      let m = movingMatCache.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color: tint.clone(), map: cTex, roughness: 0.80, metalness: 0.05,
          envMapIntensity: 0.55,
        });
        movingMatCache.set(key, m);
      }
      return m;
    }
    function movingContainer(tint) {
      const mesh = new THREE.Mesh(cGeo, movingContainerMaterial(tint));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    const CONTAINER_COLORS = [
      0x9a6a50, // rust
      0x557d77, // faded teal
      0x7e937f, // sage
      0xbb9f63, // mustard
      0xd2c7b0, // cream
      0x875954, // maroon
      0x687780, // slate
      0x6f8fa0, // faded blue
      0x8b8676, // sand grey
      0x5f7566, // deep green
    ];
    function containerTint(r) {
      return K.vary(rndPick(r, CONTAINER_COLORS), r, { l: 0.055, s: 0.05, h: 0.008 });
    }
    const WHITE_REEFER = 0xd8d3c6;

    // All static containers in the world go through one instancer.  Each item
    // is {x,y,z,rotY,color} — rail flats, parked trailers and reefer racks
    // share the same mesh, keeping the whole terminal at one container draw.
    const containerItems = [];
    let containerCount = 0;
    function addStaticContainer(x, y, z, tint, rotY) {
      containerItems.push({ x, y, z, rotY: rotY || 0, color: tint });
      containerCount++;
    }

    /* ------------------------------------------------------- yard geometry */
    // 8 rows (4 + central haul aisle + 4), 21 bays in three blocks with two
    // equipment aisles.  Everything is measured off L.zones.terminal.yard.
    const yard = Z.yard;
    const YARD_SLAB_TOP = DECK + 0.008;
    const rowZ = [-6.68, -6.96, -7.24, -7.52, -8.53, -8.81, -9.09, -9.37];
    const bayX = [];
    (function makeBays() {
      const blocks = [8, 6, 7];
      const pitch = 0.655, aisle = 0.62;
      let cursor = yard.x0 + 0.35; // left edge of first bay
      for (let bi = 0; bi < blocks.length; bi++) {
        for (let i = 0; i < blocks[bi]; i++) {
          bayX.push(cursor + 0.305);
          cursor += pitch;
        }
        cursor -= 0.045;
        if (bi < blocks.length - 1) cursor += aisle;
      }
    })();
    // central haul aisle for straddle carriers, z = -8.025
    const HAUL_Z = -8.025;

    const slots = [];
    for (let r = 0; r < rowZ.length; r++) {
      for (let b = 0; b < bayX.length; b++) {
        const bx = bayX[b];
        // a designed tier profile: taller through the middle, shorter at ends,
        // with the odd deliberate hole so the block reads as "working".
        const wave = Math.sin((b + 1.4) * 0.62 + r * 0.9) * 0.65
          + Math.sin(r * 1.7 + b * 0.22) * 0.45;
        const centreBias = 1 - Math.abs((b - 10) / 13);
        let tiers = Math.round(1.5 + centreBias * 1.25 + wave * 0.9);
        tiers = clamp(tiers, 1, 4);
        if (rndY() < 0.075) tiers = 0;               // empty slot
        if ((b === 0 || b === 20) && rndY() < 0.35) tiers = Math.min(tiers, 1);
        if ((b === 10 || b === 11) && rndY() < 0.2) tiers = Math.min(tiers, 2);
        slots.push({ x: bx, z: rowZ[r], row: r, bay: b, tiers });
      }
    }
    // guarantee a dense yard (320+); lift a few chosen stacks until we hit it.
    (function densify() {
      let total = 0;
      for (const s of slots) total += s.tiers;
      let guard = 0;
      while (total < 344 && guard < 4000) {
        const s = slots[(rndY() * slots.length) | 0];
        if (s.tiers < 4) { s.tiers++; total++; }
        guard++;
      }
    })();

    // reefers: a few deliberate white stacks with gensets, near the support
    // side and along the back row (where plug cabinets would be).
    const reeferSlots = [];
    (function pickReefers() {
      const wanted = [
        [1, 16], [1, 18], [2, 17], [3, 15], [5, 3], [6, 2], [6, 4], [7, 1],
        [4, 12], [4, 14], [6, 18], [3, 5],
      ];
      for (const [r, b] of wanted) {
        const s = slots.find((q) => q.row === r && q.bay === b);
        if (!s) continue;
        s.tiers = Math.max(s.tiers, 2);
        s.reefer = true;
        reeferSlots.push(s);
      }
    })();

    // fill instances
    const baseY = YARD_SLAB_TOP + 0.002 + C_H / 2;
    for (const s of slots) {
      if (!s.tiers) continue;
      const tint = s.reefer ? K.vary(WHITE_REEFER, rndY, { l: 0.03, s: 0.02, h: 0.003 })
        : containerTint(rndY);
      for (let k = 0; k < s.tiers; k++) {
        addStaticContainer(s.x, baseY + k * C_H, s.z, tint);
      }
      if (s.reefer) {
        // genset clipped on the container end + a little cable coil
        for (let k = 0; k < s.tiers; k++) {
          const y = baseY + k * C_H;
          box(B, 0.026, 0.15, 0.17, s.x - C_LEN / 2 - 0.014, y, s.z, 0x6d6b62, { bucket: 'paint' });
          box(B, 0.006, 0.09, 0.12, s.x - C_LEN / 2 - 0.028, y - 0.01, s.z, 0x413f39, { bucket: 'metal' });
          cylX(B, 0.028, 0.028, s.x - C_LEN / 2 - 0.016, y - 0.065, s.z, 0x8c8677, { seg: 6, bucket: 'metal' });
          box(B, 0.012, 0.012, 0.012, s.x - C_LEN / 2 - 0.02, y - 0.10, s.z, pal.lampWarm, { bucket: 'lamp' });
        }
      }
    }
    containerCount = 0;
    for (const it of containerItems) containerCount++;

    /* ------------------------------------------------------ yard hardscape */
    // paved slab (above the terrain pad so it never z-fights)
    box(B, yard.x1 - yard.x0, 0.008, yard.z1 - yard.z0,
      (yard.x0 + yard.x1) / 2, DECK + 0.004, (yard.z0 + yard.z1) / 2,
      K.mixHex(pal.concrete, pal.asphalt, 0.42), { bucket: 'matte' });
    // expansion joints
    for (let x = yard.x0 + 2.2; x < yard.x1; x += 2.65) {
      box(B, 0.012, 0.002, yard.z1 - yard.z0 - 0.08, x, YARD_SLAB_TOP + 0.0008,
        (yard.z0 + yard.z1) / 2, K.mixHex(pal.asphalt, pal.ink, 0.25), { bucket: 'matte' });
    }
    box(B, yard.x1 - yard.x0 - 0.08, 0.002, 0.012,
      (yard.x0 + yard.x1) / 2, YARD_SLAB_TOP + 0.0008, HAUL_Z + 0.29,
      K.mixHex(pal.asphalt, pal.ink, 0.2), { bucket: 'matte' });
    // aisle safety lines (yellow) and haul-lane edge lines (white)
    function dashedX(z, x0, x1, color, w, len, gap) {
      for (let x = x0; x <= x1 - len; x += len + gap) {
        box(B, len, 0.0025, w, x + len / 2, YARD_SLAB_TOP + 0.0012, z, color, { bucket: 'matte' });
      }
    }
    dashedX(HAUL_Z + 0.27, yard.x0 + 0.15, yard.x1 - 0.15, pal.lineWhite, 0.018, 0.24, 0.16);
    dashedX(HAUL_Z - 0.27, yard.x0 + 0.15, yard.x1 - 0.15, pal.lineWhite, 0.018, 0.24, 0.16);
    // equipment-aisle lines (yellow) marking the two forklift lanes
    for (const ax of [-2.345, 2.16]) {
      for (let z = -9.6; z < -6.15; z += 0.42) {
        box(B, 0.016, 0.0025, 0.24, ax - 0.24, YARD_SLAB_TOP + 0.0012, z + 0.12, pal.lineYellow, { bucket: 'matte' });
        box(B, 0.016, 0.0025, 0.24, ax + 0.24, YARD_SLAB_TOP + 0.0012, z + 0.12, pal.lineYellow, { bucket: 'matte' });
      }
    }
    // stop bars at both ends of the haul lane
    for (const sx of [yard.x0 + 0.34, yard.x1 - 0.34]) {
      box(B, 0.018, 0.0025, 0.62, sx, YARD_SLAB_TOP + 0.0012, HAUL_Z, pal.lineWhite, { bucket: 'matte' });
    }

    /* ------------------------------------------------------- yard furniture */
    // stack markers at block corners: white plates on stubby posts
    const blockEdges = [yard.x0 + 0.16, -2.655, -2.035, 1.85, 2.47, yard.x1 - 0.16];
    for (const z of [-6.08, -9.78]) {
      for (let i = 0; i < blockEdges.length; i += 2) {
        const x = blockEdges[i];
        cyl(B, 0.012, 0.20, x, DECK + 0.10, z, 0x8e8779, { seg: 6, bucket: 'metal' });
        box(B, 0.11, 0.075, 0.012, x, DECK + 0.24, z + 0.001, pal.paper, { bucket: 'paint' });
        box(B, 0.09, 0.005, 0.013, x, DECK + 0.245, z + 0.008, pal.inkSoft, { bucket: 'paint' });
        box(B, 0.055, 0.004, 0.013, x, DECK + 0.228, z + 0.008, pal.inkSoft, { bucket: 'paint' });
      }
    }
    // wheel stops (orange rubber) at the outer ends of each row
    const stopX = [-7.98, -2.58, 1.92, 6.92];
    for (const sx of stopX) {
      for (let r = 0; r < rowZ.length; r++) {
        if (r === 3 || r === 4) continue; // keep the haul aisle clear
        box(B, 0.05, 0.045, 0.16, sx, YARD_SLAB_TOP + 0.024, rowZ[r], 0x9a6446,
          { bucket: 'matte', rot: [0, 0, 0] });
        box(B, 0.02, 0.007, 0.16, sx, YARD_SLAB_TOP + 0.05, rowZ[r], 0x403a32, { bucket: 'matte' });
      }
    }
    // lashing rods on the taller stacks
    for (const s of slots) {
      if (s.tiers < 2) continue;
      if (rndD() > 0.22) continue;
      const x0 = s.x - 0.28, x1 = s.x + 0.28;
      const top = baseY + (s.tiers - 1) * C_H + C_H / 2;
      strut(B, [x0, baseY - 0.02, s.z + 0.142], [x0 + 0.05, top - 0.04, s.z + 0.150], 0.004, 0x4a4640, { bucket: 'metal' });
      strut(B, [x1, baseY - 0.02, s.z - 0.142], [x1 - 0.05, top - 0.04, s.z - 0.150], 0.004, 0x4a4640, { bucket: 'metal' });
      box(B, 0.016, 0.012, 0.016, x0 + 0.05, top - 0.035, s.z + 0.150, 0x6a6458, { bucket: 'metal' });
      box(B, 0.016, 0.012, 0.016, x1 - 0.05, top - 0.035, s.z - 0.150, 0x6a6458, { bucket: 'metal' });
    }
    // a few ground-level extras: spare containers, cable reels, cones
    addStaticContainer(6.95, baseY, -6.28, containerTint(rndY), 0.13);
    addStaticContainer(-7.9, baseY, -9.1, containerTint(rndY), -0.08);
    // damaged / empty slots marked with cones
    const coneAt = [[-2.34, -6.32], [-2.34, -9.62], [2.16, -6.36], [2.16, -9.66], [7.1, -9.7]];
    for (const [x, z] of coneAt) {
      cyl(B, 0.035, 0.012, x, YARD_SLAB_TOP + 0.006, z, 0x3f3a32, { seg: 8, bucket: 'matte' });
      cyl(B, 0.028, 0.10, x, YARD_SLAB_TOP + 0.055, z, 0xb3673f, { seg: 8, bucket: 'matte' });
      cyl(B, 0.012, 0.10, x, YARD_SLAB_TOP + 0.16, z, 0xb3673f, { seg: 8, bucket: 'matte' });
      cyl(B, 0.017, 0.017, x, YARD_SLAB_TOP + 0.105, z, pal.paperWarm, { seg: 8, bucket: 'matte' });
    }
    // cable reels and pallets between the blocks
    function cableReel(x, z, r, y) {
      const yy = y == null ? YARD_SLAB_TOP : y;
      cylX(B, r, 0.08, x, yy + r, z, 0x5c4a38, { seg: 12, bucket: 'matte' });
      cylX(B, r * 0.62, 0.085, x, yy + r, z, 0x8a7a63, { seg: 10, bucket: 'matte' });
      cylX(B, r * 0.22, 0.09, x, yy + r, z, 0x3d362d, { seg: 8, bucket: 'metal' });
      box(B, 0.10, 0.03, 0.14, x, yy + 0.012, z, 0x4a4034, { bucket: 'matte' });
    }
    cableReel(-2.34, -7.75, 0.11);
    cableReel(2.16, -7.4, 0.09);
    cableReel(10.34, -6.72, 0.10);
    for (let i = 0; i < 3; i++) {
      box(B, 0.24, 0.045, 0.20, 2.16 + (i % 2) * 0.06, YARD_SLAB_TOP + 0.024, -7.0 + i * 0.26,
        K.mixHex(pal.wood, pal.woodLight, 0.35), { bucket: 'matte' });
    }
    /* =====================================================================
     * 3. STS CRANES
     * ================================================================== */
    const CRANE_RAIL_F = -4.75;
    const CRANE_RAIL_B = -5.95;
    const RAIL_TOP = 1.168;   // top of the crane rail head built by terrain
    const CRANE_Z = Z.craneZ;              // -5.35
    const BOOM_Y = 4.18;
    const BOOM_Z0 = -5.14;
    const BOOM_Z1 = -1.21;
    const craneTips = [];
    const craneApex = [];
    const craneAnims = [];

    // ---- shared little helpers (static batch) -----------------------------
    function railRun(a, c, h, color, o, batch) {
      o = o || {};
      const b = batch || B;
      const dx = c[0] - a[0], dz = c[2] - a[2];
      const y = a[1];
      const len = Math.hypot(dx, dz);
      const n = Math.max(1, Math.round(len / (o.gap || 0.5)));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = a[0] + dx * t, z = a[2] + dz * t;
        strut(b, [x, y, z], [x, y + h, z], o.post || 0.0065, color, { seg: 4, bucket: 'paint' });
      }
      strut(b, [a[0], y + h * 0.52, a[2]], [c[0], y + h * 0.52, c[2]], o.rail || 0.0045, color, { seg: 4, bucket: 'paint' });
      strut(b, [a[0], y + h * 0.97, a[2]], [c[0], y + h * 0.97, c[2]], o.rail || 0.0045, color, { seg: 4, bucket: 'paint' });
    }
    function ladderRun(x, z, y0, y1, color, o, batch) {
      o = o || {};
      const b = batch || B;
      const alongX = o.along !== 'z';
      const w = 0.035;
      const p1 = alongX ? [x - w, y0, z] : [x, y0, z - w];
      const p2 = alongX ? [x + w, y0, z] : [x, y0, z + w];
      strut(b, p1, [p1[0], y1, p1[2]], 0.0055, color, { seg: 4, bucket: 'metal' });
      strut(b, p2, [p2[0], y1, p2[2]], 0.0055, color, { seg: 4, bucket: 'metal' });
      const n = Math.max(2, Math.floor((y1 - y0) / 0.055));
      for (let i = 1; i < n; i++) {
        const y = y0 + (y1 - y0) * (i / n);
        strut(b, [p1[0], y, p1[2]], [p2[0], y, p2[2]], 0.0035, color, { seg: 4, bucket: 'metal' });
      }
      // safety hoops
      if (o.hoops) {
        for (let i = 1; i <= 2; i++) {
          const y = y0 + (y1 - y0) * (i / 3);
          strut(b, [p1[0], y, p1[2]], [p1[0] - 0.07, y, p1[2]], 0.004, color, { seg: 4, bucket: 'metal' });
          strut(b, [p2[0], y, p2[2]], [p2[0] + 0.07, y, p2[2]], 0.004, color, { seg: 4, bucket: 'metal' });
        }
      }
    }
    function hazardBand(b, w, h, d, x, y, z) {
      box(b, w, h, d, x, y, z, pal.lineYellow, { bucket: 'paint' });
      box(b, w * 1.01, h * 0.22, d * 1.01, x, y, z, 0x3a352c, { bucket: 'paint' });
    }

    // ---- one static crane --------------------------------------------------
    function buildCraneStatic(cx, idx, rc) {
      const paint = K.vary(pal.craneLight, rc, { l: 0.035, s: 0.025, h: 0.01 });
      const paintDeep = K.vary(pal.craneDark, rc, { l: 0.02, s: 0.02, h: 0.008 });
      const trim = K.vary(pal.craneTrim, rc, { l: 0.02, s: 0.015, h: 0.004 });
      const steel = K.vary(0x6f6a5e, rc, { l: 0.03 });
      const rustC = K.vary(pal.rust, rc, { l: 0.05 });
      const dark = 0x3c3830;
      const xL = cx - 0.72, xR = cx + 0.72;

      /* --- bogies + wheels ------------------------------------------------- */
      for (const sx of [-1, 1]) {
        for (const rz of [CRANE_RAIL_F, CRANE_RAIL_B]) {
          const bx = cx + sx * 0.62;
          const wy = RAIL_TOP + 0.048;
          for (const ox of [-0.13, 0.13]) {
            cylZ(B, 0.048, 0.032, bx + ox, wy, rz, 0x4b4740, { seg: 10, bucket: 'metal' });
            cylZ(B, 0.028, 0.036, bx + ox, wy, rz, paintDeep, { seg: 8, bucket: 'paint' });
            cylZ(B, 0.012, 0.038, bx + ox, wy, rz, 0x8f887a, { seg: 6, bucket: 'metal' });
          }
          box(B, 0.42, 0.075, 0.13, bx, RAIL_TOP + 0.105, rz, paint, { bucket: 'paint' });
          box(B, 0.46, 0.018, 0.15, bx, RAIL_TOP + 0.145, rz, paintDeep, { bucket: 'paint' });
          for (const ox of [-0.13, 0.13]) {
            for (const oz of [-0.045, 0.045]) {
              cyl(B, 0.016, 0.05, bx + ox, RAIL_TOP + 0.135, rz + oz, steel, { seg: 6, bucket: 'metal' });
            }
          }
          // rail sweeper + jacking pad + rust at the wheel line
          box(B, 0.24, 0.016, 0.055, bx, RAIL_TOP + 0.008, rz + 0.085, dark, { bucket: 'paint' });
          box(B, 0.09, 0.006, 0.07, bx + 0.18, RAIL_TOP + 0.002, rz, rustC, { bucket: 'matte' });
          box(B, 0.05, 0.05, 0.05, bx - 0.19, RAIL_TOP + 0.155, rz - 0.04, rustC, { bucket: 'matte' });
        }
      }

      /* --- portal legs + bracing ------------------------------------------ */
      for (const sx of [-1, 1]) {
        for (const rz of [CRANE_RAIL_F, CRANE_RAIL_B]) {
          const bx = cx + sx * 0.62;
          const tx = cx + sx * 0.72;
          bar(B, [bx, RAIL_TOP + 0.16, rz], [tx, 2.17, rz], 0.118, paint, { bucket: 'paint' });
          // column flanges / bolt plate
          box(B, 0.14, 0.055, 0.15, bx, RAIL_TOP + 0.21, rz, paintDeep, { bucket: 'paint' });
          box(B, 0.035, 1.02, 0.035, bx + 0.045, 1.72, rz + 0.052, paintDeep, { bucket: 'paint' });
          box(B, 0.035, 1.02, 0.035, bx - 0.045, 1.72, rz + 0.052, paintDeep, { bucket: 'paint' });
          // hazard band at the base
          hazardBand(B, 0.115, 0.2, 0.115, bx, RAIL_TOP + 0.27, rz);
          // bolt heads
          for (let k = 0; k < 4; k++) {
            box(B, 0.014, 0.014, 0.014, bx - 0.03 + (k % 2) * 0.06, RAIL_TOP + 0.19,
              rz - 0.03 + Math.floor(k / 2) * 0.06, steel, { bucket: 'metal' });
          }
          // ladder up the front / rear outer legs
          if (rz === CRANE_RAIL_F && sx === 1) ladderRun(cx + 0.62, CRANE_RAIL_F + 0.115, RAIL_TOP + 0.25, 2.12, steel, { hoops: true });
          if (rz === CRANE_RAIL_B && sx === -1) ladderRun(cx - 0.62, CRANE_RAIL_B - 0.115, RAIL_TOP + 0.25, 2.12, steel, {});
          // rust streaks at the foot
          for (let k = 0; k < 3; k++) {
            box(B, 0.008, 0.12 + rc() * 0.2, 0.02,
              bx + sx * 0.049 + (rc() - 0.5) * 0.03, RAIL_TOP + 0.36 + rc() * 0.3,
              rz + 0.048 + (rc() - 0.5) * 0.04, rustC, { bucket: 'matte' });
          }
        }
      }
      // front-plane X bracing
      bar(B, [cx - 0.62, RAIL_TOP + 0.2, CRANE_RAIL_F], [cx + 0.67, 2.10, CRANE_RAIL_F], 0.05, paint, { bucket: 'paint' });
      bar(B, [cx + 0.62, RAIL_TOP + 0.2, CRANE_RAIL_F], [cx - 0.67, 2.10, CRANE_RAIL_F], 0.05, paint, { bucket: 'paint' });
      bar(B, [cx - 0.62, RAIL_TOP + 0.2, CRANE_RAIL_B], [cx + 0.67, 2.10, CRANE_RAIL_B], 0.05, paint, { bucket: 'paint' });
      bar(B, [cx + 0.62, RAIL_TOP + 0.2, CRANE_RAIL_B], [cx - 0.67, 2.10, CRANE_RAIL_B], 0.05, paint, { bucket: 'paint' });
      // side-plane X bracing
      for (const sx of [-1, 1]) {
        const x = cx + sx * 0.655;
        bar(B, [x, RAIL_TOP + 0.22, CRANE_RAIL_F], [x + sx * 0.06, 2.08, CRANE_RAIL_B], 0.045, paint, { bucket: 'paint' });
        bar(B, [x, RAIL_TOP + 0.22, CRANE_RAIL_B], [x + sx * 0.06, 2.08, CRANE_RAIL_F], 0.045, paint, { bucket: 'paint' });
      }
      // horizontal central ties
      bar(B, [cx - 0.66, 1.62, CRANE_RAIL_F], [cx + 0.66, 1.62, CRANE_RAIL_F], 0.035, paintDeep, { bucket: 'paint' });
      bar(B, [cx - 0.66, 1.62, CRANE_RAIL_B], [cx + 0.66, 1.62, CRANE_RAIL_B], 0.035, paintDeep, { bucket: 'paint' });
      for (const sx of [-1, 1]) {
        bar(B, [cx + sx * 0.66, 1.62, CRANE_RAIL_F], [cx + sx * 0.66, 1.62, CRANE_RAIL_B], 0.035, paintDeep, { bucket: 'paint' });
      }

      /* --- sill beams / portal deck --------------------------------------- */
      box(B, 1.54, 0.13, 0.16, cx, 2.215, CRANE_RAIL_F, paint, { bucket: 'paint' });
      box(B, 1.54, 0.13, 0.16, cx, 2.215, CRANE_RAIL_B, paint, { bucket: 'paint' });
      box(B, 1.56, 0.03, 0.18, cx, 2.286, CRANE_RAIL_F, trim, { bucket: 'paint' });
      box(B, 1.56, 0.03, 0.18, cx, 2.286, CRANE_RAIL_B, trim, { bucket: 'paint' });
      for (const sx of [-1, 1]) {
        box(B, 0.16, 0.13, 1.44, cx + sx * 0.72, 2.215, CRANE_Z, paint, { bucket: 'paint' });
        box(B, 0.18, 0.03, 1.46, cx + sx * 0.72, 2.286, CRANE_Z, trim, { bucket: 'paint' });
        box(B, 0.165, 0.035, 0.165, cx + sx * 0.72, 2.285, CRANE_RAIL_F, trim, { bucket: 'paint' });
        box(B, 0.165, 0.035, 0.165, cx + sx * 0.72, 2.285, CRANE_RAIL_B, trim, { bucket: 'paint' });
        // bolt pattern on the sill
        for (let k = 0; k < 6; k++) {
          sph(B, 0.009, cx - 0.6 + k * 0.24, 2.28, CRANE_RAIL_F + sx * 0.0, steel, { bucket: 'metal', ws: 5, hs: 4 });
        }
      }
      // machinery-house deck
      box(B, 1.46, 0.012, 0.62, cx, 2.283, -5.78, K.mixHex(pal.concreteDark, pal.asphalt, 0.35), { bucket: 'matte' });
      // rear walkway rail
      railRun([cx - 0.7, 2.29, CRANE_RAIL_B - 0.06], [cx + 0.7, 2.29, CRANE_RAIL_B - 0.06], 0.34, trim, { gap: 0.35 });
      // small platform on the water side, with a control cabinet
      box(B, 0.42, 0.012, 0.22, cx - 0.4, 2.29, CRANE_RAIL_F + 0.12, 0x7d786c, { bucket: 'matte' });
      box(B, 0.16, 0.20, 0.12, cx - 0.4, 2.40, CRANE_RAIL_F + 0.12, K.mixHex(pal.paperDeep, pal.concrete, 0.4), { bucket: 'paint' });
      box(B, 0.13, 0.015, 0.09, cx - 0.4, 2.51, CRANE_RAIL_F + 0.12, paintDeep, { bucket: 'paint' });
      // cable reels on the portal frame
      for (const sx of [-1, 1]) {
        cylX(B, 0.11, 0.10, cx + sx * 0.47, 2.36, CRANE_RAIL_B + 0.10, 0x4f4438, { seg: 12, bucket: 'matte' });
        cylX(B, 0.07, 0.105, cx + sx * 0.47, 2.36, CRANE_RAIL_B + 0.10, 0x8b7a5f, { seg: 10, bucket: 'matte' });
      }

      /* --- front boom supports -------------------------------------------- */
      for (const sx of [-1, 1]) {
        const xb = cx + sx * 0.72;
        bar(B, [xb, 2.26, CRANE_RAIL_F + 0.02], [cx + sx * 0.33, BOOM_Y - 0.21, BOOM_Z0 + 0.07], 0.10, paint, { bucket: 'paint' });
        bar(B, [xb, 2.26, CRANE_RAIL_F + 0.02], [cx + sx * 0.33, BOOM_Y - 0.21, BOOM_Z0 - 0.34], 0.06, paintDeep, { bucket: 'paint' });
        box(B, 0.15, 0.22, 0.16, cx + sx * 0.33, BOOM_Y - 0.23, BOOM_Z0 + 0.02, paintDeep, { bucket: 'paint' });
        box(B, 0.09, 0.09, 0.22, cx + sx * 0.33, BOOM_Y - 0.26, BOOM_Z0 + 0.12, steel, { bucket: 'metal' });
        // knee brace to the portal deck
        bar(B, [xb, 2.30, CRANE_RAIL_F + 0.22], [cx + sx * 0.42, 3.55, BOOM_Z0 + 0.16], 0.04, paintDeep, { bucket: 'paint' });
      }

      /* --- A-frame + apex -------------------------------------------------- */
      for (const sx of [-1, 1]) {
        const xb = cx + sx * 0.72;
        bar(B, [xb, 2.26, CRANE_RAIL_B - 0.14], [cx + sx * 0.50, 5.26, -5.55], 0.095, paint, { bucket: 'paint' });
        bar(B, [xb, 2.26, CRANE_RAIL_B + 0.13], [cx + sx * 0.50, 5.26, -5.55], 0.065, paintDeep, { bucket: 'paint' });
        // gusset at the sill
        box(B, 0.16, 0.16, 0.1, xb, 2.33, CRANE_RAIL_B, paintDeep, { bucket: 'paint' });
      }
      // apex cross tube + cap plates
      strut(B, [cx - 0.56, 5.28, -5.55], [cx + 0.56, 5.28, -5.55], 0.05, trim, { seg: 8, bucket: 'paint' });
      box(B, 0.14, 0.14, 0.18, cx - 0.56, 5.28, -5.55, paintDeep, { bucket: 'paint' });
      box(B, 0.14, 0.14, 0.18, cx + 0.56, 5.28, -5.55, paintDeep, { bucket: 'paint' });
      // apex shear plates + sheave yoke under the head
      box(B, 0.10, 0.34, 0.24, cx, 5.06, -5.52, paintDeep, { bucket: 'paint' });
      box(B, 0.34, 0.09, 0.30, cx, 5.19, -5.52, paint, { bucket: 'paint' });
      cylX(B, 0.04, 0.34, cx, 4.98, -5.48, steel, { seg: 8, bucket: 'metal' });
      // apex bracing back to the rear sill
      bar(B, [cx - 0.53, 5.24, -5.6], [cx - 0.4, 3.34, CRANE_RAIL_B - 0.1], 0.045, paintDeep, { bucket: 'paint' });
      bar(B, [cx + 0.53, 5.24, -5.6], [cx + 0.4, 3.34, CRANE_RAIL_B - 0.1], 0.045, paintDeep, { bucket: 'paint' });
      // cross bracing between A-frame legs
      bar(B, [cx - 0.63, 3.32, -5.80], [cx + 0.63, 3.32, -5.80], 0.034, paint, { bucket: 'paint' });
      bar(B, [cx - 0.63, 3.05, -5.84], [cx + 0.63, 3.6, -5.76], 0.022, paintDeep, { bucket: 'paint' });
      bar(B, [cx + 0.63, 3.05, -5.84], [cx - 0.63, 3.6, -5.76], 0.022, paintDeep, { bucket: 'paint' });
      bar(B, [cx - 0.60, 4.10, -5.72], [cx + 0.60, 4.10, -5.72], 0.028, paint, { bucket: 'paint' });
      bar(B, [cx - 0.58, 4.34, -5.67], [cx + 0.58, 4.34, -5.67], 0.022, paintDeep, { bucket: 'paint' });
      // apex ladder up the starboard leg
      ladderRun(cx + 0.5, -5.62, 3.0, 5.16, steel, { hoops: true });

      // anemometer + lightning rod
      cyl(B, 0.008, 0.2, cx, 5.38, -5.55, steel, { seg: 5, bucket: 'metal' });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.4;
        const ex = cx + Math.cos(a) * 0.075, ez = -5.55 + Math.sin(a) * 0.075;
        strut(B, [cx, 5.47, -5.55], [ex, 5.49, ez], 0.004, steel, { seg: 4, bucket: 'metal' });
        sph(B, 0.016, ex, 5.50, ez, trim, { bucket: 'paint', ws: 6, hs: 4 });
      }
      cyl(B, 0.006, 0.16, cx, 5.53, -5.55, steel, { seg: 5, bucket: 'metal' });
      sph(B, 0.014, cx, 5.61, -5.55, pal.lampWarm, { bucket: 'lamp', ws: 6, hs: 4 });
      craneApex.push([cx, 5.60, -5.55]);

      // hinge cross beam under the boom
      box(B, 0.94, 0.09, 0.12, cx, BOOM_Y - 0.24, BOOM_Z0 + 0.02, paintDeep, { bucket: 'paint' });
      cylX(B, 0.055, 0.98, cx, BOOM_Y, BOOM_Z0, steel, { seg: 8, bucket: 'metal' });
      for (const sx of [-1, 1]) cylX(B, 0.075, 0.12, cx + sx * 0.42, BOOM_Y, BOOM_Z0, paintDeep, { seg: 10, bucket: 'paint' });

      /* --- boom lattice ---------------------------------------------------- */
      const panel = 17;
      const zg = (i) => BOOM_Z0 + (BOOM_Z1 - BOOM_Z0) * (i / panel);
      for (const sx of [-1, 1]) {
        const gx = cx + sx * 0.33;
        strut(B, [gx, BOOM_Y - 0.18, BOOM_Z0], [gx, BOOM_Y - 0.18, BOOM_Z1], 0.032, paint, { seg: 6, bucket: 'paint' });
        strut(B, [gx, BOOM_Y + 0.18, BOOM_Z0], [gx, BOOM_Y + 0.18, BOOM_Z1], 0.029, paint, { seg: 6, bucket: 'paint' });
        // crane rail on the top chord
        box(B, 0.045, 0.018, BOOM_Z1 - BOOM_Z0, gx, BOOM_Y + 0.208, (BOOM_Z0 + BOOM_Z1) / 2, steel, { bucket: 'metal' });
        for (let i = 0; i <= panel; i++) {
          const z = zg(i);
          strut(B, [gx, BOOM_Y - 0.18, z], [gx, BOOM_Y + 0.18, z], 0.014, paintDeep, { seg: 4, bucket: 'paint' });
          if (i < panel) {
            const z2 = zg(i + 1);
            if (i % 2 === 0) strut(B, [gx, BOOM_Y - 0.18, z], [gx, BOOM_Y + 0.18, z2], 0.013, paintDeep, { seg: 4, bucket: 'paint' });
            else strut(B, [gx, BOOM_Y + 0.18, z], [gx, BOOM_Y - 0.18, z2], 0.013, paintDeep, { seg: 4, bucket: 'paint' });
          }
        }
      }
      for (let i = 0; i <= panel; i++) {
        const z = zg(i);
        strut(B, [cx - 0.33, BOOM_Y + 0.18, z], [cx + 0.33, BOOM_Y + 0.18, z], 0.014, paintDeep, { seg: 4, bucket: 'paint' });
        if (i % 2 === 0) strut(B, [cx - 0.33, BOOM_Y - 0.18, z], [cx + 0.33, BOOM_Y - 0.18, z], 0.013, paintDeep, { seg: 4, bucket: 'paint' });
        if (i < panel && i % 2 === 0) {
          const z2 = zg(i + 1);
          strut(B, [cx - 0.33, BOOM_Y + 0.19, z], [cx + 0.33, BOOM_Y + 0.19, z2], 0.012, paintDeep, { seg: 4, bucket: 'paint' });
        }
      }
      // boom walkway (starboard) + handrail
      const walkX = cx + 0.51;
      box(B, 0.11, 0.012, BOOM_Z1 - BOOM_Z0 - 0.06, walkX, BOOM_Y - 0.2, (BOOM_Z0 + BOOM_Z1) / 2, K.mixHex(pal.concreteDark, pal.concrete, 0.45), { bucket: 'matte' });
      box(B, 0.012, 0.05, BOOM_Z1 - BOOM_Z0 - 0.06, walkX + 0.08, BOOM_Y - 0.18, (BOOM_Z0 + BOOM_Z1) / 2, trim, { bucket: 'paint' });
      railRun([walkX + 0.055, BOOM_Y - 0.2, BOOM_Z0 + 0.1], [walkX + 0.055, BOOM_Y - 0.2, BOOM_Z1 - 0.1], 0.30, 0xb8ab90, { gap: 0.55, post: 0.0045, rail: 0.003 });
      // cable tray on the port side + festoon
      box(B, 0.075, 0.02, BOOM_Z1 - BOOM_Z0 - 0.1, cx - 0.45, BOOM_Y + 0.18, (BOOM_Z0 + BOOM_Z1) / 2, steel, { bucket: 'metal' });
      for (let i = 0; i < 5; i++) {
        const z = BOOM_Z0 + 0.15 + i * 0.78;
        box(B, 0.06, 0.05, 0.02, cx - 0.45, BOOM_Y + 0.18, z, dark, { bucket: 'paint' });
      }
      // festoon cable sagging along the port side
      for (let i = 0; i < 6; i++) {
        const z0 = BOOM_Z0 + 0.2 + i * 0.65, z1 = Math.min(BOOM_Z1 - 0.05, z0 + 0.65);
        if (z1 <= z0) break;
        K.rope([cx - 0.47, BOOM_Y + 0.17, z0], [cx - 0.47, BOOM_Y + 0.17, z1], 0.028,
          0.0035, 0x2c2822, { segments: 6, radial: 4 });
      }

      /* --- boom tip -------------------------------------------------------- */
      const tipZ = BOOM_Z1;
      box(B, 0.80, 0.42, 0.05, cx, BOOM_Y, tipZ - 0.01, paint, { bucket: 'paint' });
      box(B, 0.80, 0.055, 0.06, cx, BOOM_Y + 0.20, tipZ - 0.01, trim, { bucket: 'paint' });
      // sheaves
      for (const sx of [-1, 1]) {
        cylX(B, 0.055, 0.09, cx + sx * 0.13, BOOM_Y - 0.06, tipZ + 0.03, steel, { seg: 12, bucket: 'metal' });
        cylX(B, 0.025, 0.095, cx + sx * 0.13, BOOM_Y - 0.06, tipZ + 0.03, paintDeep, { seg: 8, bucket: 'paint' });
        // rope guard
        box(B, 0.02, 0.11, 0.09, cx + sx * 0.075, BOOM_Y - 0.07, tipZ + 0.03, paintDeep, { bucket: 'paint' });
      }
      // hazard stripes on the tip face
      for (let i = 0; i < 6; i++) {
        box(B, 0.09, 0.10, 0.006, cx - 0.30 + i * 0.12, BOOM_Y - 0.02, tipZ + 0.016,
          i % 2 ? 0x352f28 : pal.lineYellow, { bucket: 'paint' });
      }
      // tip inspection basket
      box(B, 0.5, 0.012, 0.16, cx, BOOM_Y - 0.19, tipZ + 0.14, 0x8a8476, { bucket: 'matte' });
      railRun([cx - 0.24, BOOM_Y - 0.19, tipZ + 0.21], [cx + 0.24, BOOM_Y - 0.19, tipZ + 0.21], 0.26, trim, { gap: 0.24 });
      // tip lights + camera
      box(B, 0.06, 0.05, 0.05, cx + 0.3, BOOM_Y + 0.20, tipZ + 0.02, dark, { bucket: 'paint' });
      box(B, 0.035, 0.035, 0.008, cx + 0.3, BOOM_Y + 0.20, tipZ + 0.05, pal.lampWarm, { bucket: 'lamp' });
      sph(B, 0.024, cx, BOOM_Y + 0.27, tipZ, pal.lampWarm, { bucket: 'lamp', ws: 7, hs: 5 });
      strut(B, [cx, BOOM_Y + 0.21, tipZ], [cx, BOOM_Y + 0.25, tipZ], 0.006, steel, { seg: 4, bucket: 'metal' });
      craneTips.push([cx, BOOM_Y + 0.30, tipZ + 0.02]);

      /* --- tie rods + backstays -------------------------------------------- */
      for (const sx of [-1, 1]) {
        const ax = cx + sx * 0.52, ay = 5.24, az = -5.55;
        for (const tz of [-4.52, -3.18, -2.0]) {
          const bx2 = cx + sx * 0.46, by2 = BOOM_Y + 0.17, bz2 = tz;
          strut(B, [ax, ay, az], [bx2, by2, bz2], 0.026, steel, { seg: 6, bucket: 'metal' });
          box(B, 0.06, 0.10, 0.04, bx2, by2 - 0.02, bz2, paintDeep, { bucket: 'paint' });
          box(B, 0.06, 0.08, 0.035, ax, ay - 0.03, az, paintDeep, { bucket: 'paint' });
          // turnbuckle at mid-span
          const mx = (ax + bx2) / 2, my = (ay + by2) / 2, mz = (az + bz2) / 2;
          box(B, 0.045, 0.09, 0.045, mx, my, mz, steel, { bucket: 'metal', quat: (function () { const d = new THREE.Vector3(bx2 - ax, by2 - ay, bz2 - az).normalize(); return new THREE.Quaternion().setFromUnitVectors(UP, d); })() });
        }
        // backstay to the backreach tip
        strut(B, [ax, ay, az], [cx + sx * 0.33, BOOM_Y + 0.18, -6.45], 0.02, steel, { seg: 5, bucket: 'metal' });
      }

      /* --- backreach ------------------------------------------------------- */
      const bz0 = BOOM_Z0, bz1 = -6.58;
      for (const sx of [-1, 1]) {
        const gx = cx + sx * 0.33;
        strut(B, [gx, BOOM_Y - 0.18, bz0], [gx, BOOM_Y - 0.18, bz1], 0.026, paint, { seg: 6, bucket: 'paint' });
        strut(B, [gx, BOOM_Y + 0.18, bz0], [gx, BOOM_Y + 0.18, bz1], 0.023, paint, { seg: 6, bucket: 'paint' });
        for (let i = 0; i <= 5; i++) {
          const z = bz0 + (bz1 - bz0) * (i / 5);
          strut(B, [gx, BOOM_Y - 0.18, z], [gx, BOOM_Y + 0.18, z], 0.012, paintDeep, { seg: 4, bucket: 'paint' });
          if (i < 5) strut(B, [gx, BOOM_Y + 0.18, z], [gx, BOOM_Y - 0.18, z + (bz1 - bz0) / 5], 0.010, paintDeep, { seg: 4, bucket: 'paint' });
        }
      }
      box(B, 0.62, 0.012, bz0 - bz1 - 0.12, cx, BOOM_Y - 0.20, (bz0 + bz1) / 2, 0x8a8476, { bucket: 'matte' });
      railRun([cx - 0.28, BOOM_Y - 0.2, bz1 + 0.06], [cx + 0.28, BOOM_Y - 0.2, bz1 + 0.06], 0.3, trim, { gap: 0.28 });
      // counterweight block
      box(B, 0.92, 0.42, 0.30, cx, BOOM_Y - 0.45, -6.34, paintDeep, { bucket: 'paint' });
      box(B, 0.94, 0.05, 0.32, cx, BOOM_Y - 0.23, -6.34, trim, { bucket: 'paint' });
      for (let i = 0; i < 4; i++) {
        box(B, 0.06, 0.07, 0.01, cx - 0.33 + i * 0.22, BOOM_Y - 0.45, -6.19, i % 2 ? 0x352f28 : pal.lineYellow, { bucket: 'paint' });
      }
      // trolley park buffer + limit switch
      box(B, 0.3, 0.08, 0.06, cx, BOOM_Y - 0.02, -6.5, dark, { bucket: 'paint' });
      box(B, 0.06, 0.04, 0.04, cx + 0.36, BOOM_Y - 0.12, -6.5, rustC, { bucket: 'matte' });

      /* --- machinery house ------------------------------------------------- */
      const hz = -5.55;
      const HX = 0.61;            // body half width
      const HZ = 0.44;            // body half depth
      box(B, 1.28, 0.05, 0.95, cx, 2.315, hz, pal.stoneDark, { bucket: 'paint' });
      box(B, HX * 2, 0.90, HZ * 2, cx, 2.79, hz, paint, { bucket: 'paint' });
      // corner posts + horizontal bands
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(B, 0.075, 0.92, 0.075, cx + sx * HX, 2.79, hz + sz * HZ, trim, { bucket: 'paint' });
        }
      }
      box(B, HX * 2 + 0.04, 0.06, HZ * 2 + 0.04, cx, 2.395, hz, trim, { bucket: 'paint' });
      box(B, HX * 2 + 0.06, 0.07, HZ * 2 + 0.06, cx, 3.20, hz, trim, { bucket: 'paint' });
      // shallow wall ribs on the four elevations
      for (let i = 0; i < 12; i++) {
        const x = cx - 0.52 + i * 0.095;
        box(B, 0.022, 0.78, 0.015, x, 2.80, hz + HZ + 0.008, paintDeep, { bucket: 'paint' });
        box(B, 0.022, 0.78, 0.015, x, 2.80, hz - HZ - 0.008, paintDeep, { bucket: 'paint' });
      }
      for (let i = 0; i < 8; i++) {
        const z = hz - 0.36 + i * 0.095;
        box(B, 0.015, 0.78, 0.022, cx + HX + 0.008, 2.80, z, paintDeep, { bucket: 'paint' });
        box(B, 0.015, 0.78, 0.022, cx - HX - 0.008, 2.80, z, paintDeep, { bucket: 'paint' });
      }
      // big louvre banks on the landside elevation
      for (let i = 0; i < 2; i++) {
        const bx = cx - 0.27 + i * 0.54;
        box(B, 0.42, 0.40, 0.02, bx, 2.78, hz - HZ - 0.012, paintDeep, { bucket: 'paint' });
        for (let k = 0; k < 6; k++) {
          box(B, 0.38, 0.018, 0.03, bx, 2.63 + k * 0.055, hz - HZ - 0.028, 0x3f4a45, { bucket: 'paint' });
        }
        box(B, 0.44, 0.03, 0.025, bx, 2.995, hz - HZ - 0.016, trim, { bucket: 'paint' });
      }
      // side louvres
      for (const sx of [-1, 1]) {
        box(B, 0.02, 0.34, 0.46, cx + sx * (HX + 0.012), 2.80, hz + 0.10, paintDeep, { bucket: 'paint' });
        for (let k = 0; k < 5; k++) {
          box(B, 0.03, 0.016, 0.42, cx + sx * (HX + 0.028), 2.67 + k * 0.065, hz + 0.10, 0x3f4a45, { bucket: 'paint' });
        }
      }
      // waterside door, lit window, small window, plate
      box(B, 0.30, 0.62, 0.02, cx - 0.30, 2.66, hz + HZ + 0.012, paintDeep, { bucket: 'paint' });
      box(B, 0.24, 0.56, 0.012, cx - 0.30, 2.66, hz + HZ + 0.024, 0x8a7c66, { bucket: 'paint' });
      for (let k = 0; k < 5; k++) box(B, 0.22, 0.008, 0.008, cx - 0.30, 2.44 + k * 0.11, hz + HZ + 0.031, 0x6c6354, { bucket: 'metal' });
      box(B, 0.14, 0.16, 0.02, cx + 0.13, 2.88, hz + HZ + 0.012, 0x35494b, { bucket: 'glass' });
      box(B, 0.16, 0.18, 0.014, cx + 0.13, 2.88, hz + HZ + 0.004, trim, { bucket: 'paint' });
      box(B, 0.10, 0.06, 0.018, cx + 0.13, 2.88, hz + HZ + 0.026, pal.lampWarm, { bucket: 'lamp' });
      box(B, 0.16, 0.13, 0.02, cx + 0.40, 2.67, hz + HZ + 0.012, 0x35494b, { bucket: 'glass' });
      box(B, 0.18, 0.15, 0.014, cx + 0.40, 2.67, hz + HZ + 0.004, trim, { bucket: 'paint' });
      box(B, 0.20, 0.055, 0.012, cx - 0.30, 3.05, hz + HZ + 0.030, pal.lineYellow, { bucket: 'paint' });
      box(B, 0.20, 0.012, 0.014, cx - 0.30, 3.05, hz + HZ + 0.040, 0x3a352c, { bucket: 'paint' });
      // cable trunking + electrical cabinet on the east flank
      box(B, 0.16, 0.36, 0.24, cx + 0.66, 2.60, hz + 0.20, 0x8d887a, { bucket: 'paint' });
      box(B, 0.17, 0.012, 0.25, cx + 0.66, 2.79, hz + 0.20, dark, { bucket: 'paint' });
      for (const sz of [-1, 1]) {
        cyl(B, 0.02, 0.55, cx + 0.60, 2.62, hz + sz * 0.24, steel, { seg: 6, bucket: 'metal' });
      }
      cyl(B, 0.026, 0.62, cx - 0.52, 2.58, hz - 0.34, steel, { seg: 6, bucket: 'metal' });
      box(B, 0.22, 0.14, 0.16, cx - 0.52, 2.34, hz - 0.28, 0x6f6a5e, { bucket: 'metal' });
      // roof deck + plant
      box(B, 1.30, 0.045, 0.96, cx, 3.245, hz, paintDeep, { bucket: 'paint' });
      box(B, 1.32, 0.02, 0.98, cx, 3.272, hz, trim, { bucket: 'paint' });
      box(B, 0.38, 0.18, 0.30, cx + 0.22, 3.37, hz - 0.16, 0x9b968a, { bucket: 'paint' });
      disc(B, 0.085, cx + 0.22, 3.465, hz - 0.16, dark);
      box(B, 0.30, 0.02, 0.24, cx + 0.22, 3.465, hz - 0.16, dark, { bucket: 'paint' });
      cyl(B, 0.036, 0.28, cx - 0.42, 3.40, hz - 0.26, 0x6f6a5e, { seg: 8, bucket: 'metal' });
      cyl(B, 0.05, 0.03, cx - 0.42, 3.55, hz - 0.26, 0x3a352c, { seg: 8, bucket: 'paint' });
      cyl(B, 0.03, 0.20, cx - 0.26, 3.36, hz - 0.30, steel, { seg: 8, bucket: 'metal' });
      cylX(B, 0.09, 0.12, cx + 0.06, 3.36, hz + 0.18, 0x4f4438, { seg: 10, bucket: 'matte' });
      cylX(B, 0.055, 0.13, cx + 0.06, 3.36, hz + 0.18, 0x8b7a5f, { seg: 8, bucket: 'matte' });
      cyl(B, 0.008, 0.34, cx + 0.52, 3.44, hz + 0.34, steel, { seg: 4, bucket: 'metal' });
      sph(B, 0.016, cx + 0.52, 3.63, hz + 0.34, pal.lampWarm, { bucket: 'lamp', ws: 6, hs: 4 });
      // roof handrails
      railRun([cx - 0.61, 3.28, hz - 0.47], [cx + 0.61, 3.28, hz - 0.47], 0.24, trim, { gap: 0.29, post: 0.005, rail: 0.0035 });
      railRun([cx - 0.61, 3.28, hz + 0.47], [cx + 0.61, 3.28, hz + 0.47], 0.24, trim, { gap: 0.29, post: 0.005, rail: 0.0035 });
      railRun([cx - 0.61, 3.28, hz - 0.47], [cx - 0.61, 3.28, hz + 0.47], 0.24, trim, { gap: 0.29, post: 0.005, rail: 0.0035 });
      railRun([cx + 0.61, 3.28, hz - 0.47], [cx + 0.61, 3.28, hz + 0.47], 0.24, trim, { gap: 0.29, post: 0.005, rail: 0.0035 });
      // access ladder + landing
      ladderRun(cx + 0.66, hz - 0.30, 2.36, 3.24, steel, { along: 'z', hoops: true });
      box(B, 0.20, 0.012, 0.34, cx + 0.70, 2.36, hz - 0.30, 0x8a8476, { bucket: 'matte' });
      // roof floodlights aimed at the ship
      for (const sx of [-1, 1]) {
        box(B, 0.10, 0.08, 0.07, cx + sx * 0.46, 3.33, hz + 0.26, dark, { bucket: 'paint' });
        box(B, 0.075, 0.055, 0.012, cx + sx * 0.46, 3.33, hz + 0.30, pal.lampWarm, { bucket: 'lamp' });
        strut(B, [cx + sx * 0.46, 3.28, hz + 0.22], [cx + sx * 0.46, 3.33, hz + 0.26], 0.007, steel, { seg: 4, bucket: 'metal' });
      }
      // under-house maintenance deck brackets
      for (const sx of [-1, 1]) {
        bar(B, [cx + sx * 0.55, 2.28, hz - 0.36], [cx + sx * 0.36, 2.33, hz + 0.10], 0.03, paintDeep, { bucket: 'paint' });
      }
      // rust streaks under the house roof
      for (let i = 0; i < 8; i++) {
        box(B, 0.006, 0.10 + rc() * 0.30, 0.02,
          cx - 0.52 + rc() * 1.04, 3.02 - rc() * 0.42, hz + HZ + 0.036, rustC, { bucket: 'matte' });
      }

      /* --- deck furniture -------------------------------------------------- */
      // fire box + toolbox on the portal
      box(B, 0.13, 0.18, 0.10, cx + 0.52, 2.40, -5.95, 0x8c4d3f, { bucket: 'paint' });
      box(B, 0.10, 0.012, 0.11, cx + 0.52, 2.492, -5.95, dark, { bucket: 'paint' });
      box(B, 0.24, 0.14, 0.16, cx - 0.52, 2.36, -5.88, 0x6d6a5c, { bucket: 'paint' });
      // junction boxes + conduits
      box(B, 0.08, 0.11, 0.06, cx - 0.72, 2.42, -5.4, 0x8e8879, { bucket: 'paint' });
      cyl(B, 0.012, 1.3, cx - 0.72, 1.8, -5.3, steel, { seg: 5, bucket: 'metal' });
      // small floodlight under the portal (lights the truck lane)
      for (const sx of [-1, 1]) {
        box(B, 0.08, 0.06, 0.07, cx + sx * 0.48, 2.18, CRANE_RAIL_F + 0.18, dark, { bucket: 'paint' });
        box(B, 0.06, 0.04, 0.012, cx + sx * 0.48, 2.17, CRANE_RAIL_F + 0.215, pal.lampWarm, { bucket: 'lamp' });
      }
      // crane number painted on the machinery house is a textured sign added later
      return { paint, paintDeep, trim };
    }

    // number plates for the four cranes (tiny textured signs, night-labelled)
    function craneSign(cx, idx) {
      const num = String(idx + 1).padStart(2, '0');
      K.sign({
        x: cx - 0.02, y: 2.955, z: -5.100,
        w: 0.30, aspect: 1.9,
        bg: '#e6d7b8', fg: '#2c453f', border: '#2c453f',
        lines: [
          { text: num, size: 78, font: K.fonts.mono, weight: 700, color: '#2c453f' },
          { text: 'STS', size: 22, font: K.fonts.sans, weight: 600, color: '#2c453f' },
        ],
        night: true,
      });
    }

    // ---- rigid trolley / spreader / cable animation ------------------------
    // NB: this geometry is rebuilt in place every frame and has no normals —
    // keep it on an unlit basic material (a lit material rasterised black slabs).
    const cableMat = new THREE.MeshBasicMaterial({ color: 0x2b2721, side: THREE.DoubleSide });
    function makeCableRig(count) {
      const verts = count * 12 * 3;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      const mesh = new THREE.Mesh(geo, cableMat);
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      return { mesh, geo, attr: geo.attributes.position, count };
    }
    const _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _cdir = new THREE.Vector3();
    const _ce1 = new THREE.Vector3(), _ce2 = new THREE.Vector3();
    function updateCableRig(rig, pairs) {
      const arr = rig.attr.array;
      let o = 0;
      const w = 0.0095;
      for (let i = 0; i < rig.count; i++) {
        const A = pairs[i][0], Bp = pairs[i][1];
        _ca.set(A[0], A[1], A[2]);
        _cb.set(Bp[0], Bp[1], Bp[2]);
        _cdir.subVectors(_cb, _ca);
        _cdir.normalize();
        // two perpendicular half-width vectors
        _ce1.crossVectors(_cdir, UP);
        if (_ce1.lengthSq() < 1e-6) _ce1.set(1, 0, 0);
        _ce1.normalize().multiplyScalar(w);
        _ce2.crossVectors(_cdir, _ce1).normalize().multiplyScalar(w);
        // quad 1 (offset e1)
        const q = [
          [_ca.x - _ce1.x, _ca.y - _ce1.y, _ca.z - _ce1.z],
          [_ca.x + _ce1.x, _ca.y + _ce1.y, _ca.z + _ce1.z],
          [_cb.x + _ce1.x, _cb.y + _ce1.y, _cb.z + _ce1.z],
          [_ca.x - _ce1.x, _ca.y - _ce1.y, _ca.z - _ce1.z],
          [_cb.x + _ce1.x, _cb.y + _ce1.y, _cb.z + _ce1.z],
          [_cb.x - _ce1.x, _cb.y - _ce1.y, _cb.z - _ce1.z],
        ];
        for (const v of q) { arr[o++] = v[0]; arr[o++] = v[1]; arr[o++] = v[2]; }
        const p = [
          [_ca.x - _ce2.x, _ca.y - _ce2.y, _ca.z - _ce2.z],
          [_ca.x + _ce2.x, _ca.y + _ce2.y, _ca.z + _ce2.z],
          [_cb.x + _ce2.x, _cb.y + _ce2.y, _cb.z + _ce2.z],
          [_ca.x - _ce2.x, _ca.y - _ce2.y, _ca.z - _ce2.z],
          [_cb.x + _ce2.x, _cb.y + _ce2.y, _cb.z + _ce2.z],
          [_cb.x - _ce2.x, _cb.y - _ce2.y, _cb.z - _ce2.z],
        ];
        for (const v of p) { arr[o++] = v[0]; arr[o++] = v[1]; arr[o++] = v[2]; }
      }
      rig.attr.needsUpdate = true;
      rig.geo.computeBoundingSphere();
    }

    function buildMovingCrane(cx, cfg) {
      const { paint, paintDeep, trim } = cfg.colors;
      const steel = 0x6f6a5e;

      /* trolley */
      const trolley = new THREE.Group();
      trolley.position.set(cx, BOOM_Y + 0.31, -6.0);
      const tb = new K.Batcher();
      // frame
      box(tb, 0.84, 0.10, 0.36, 0, 0, 0, paintDeep, { bucket: 'paint' });
      box(tb, 0.88, 0.028, 0.40, 0, 0.065, 0, trim, { bucket: 'paint' });
      box(tb, 0.90, 0.03, 0.06, 0, 0.02, 0.16, paint, { bucket: 'paint' });
      box(tb, 0.90, 0.03, 0.06, 0, 0.02, -0.16, paint, { bucket: 'paint' });
      // wheels
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          cylX(tb, 0.045, 0.045, sx * 0.36, -0.06, sz * 0.13, 0x47433b, { seg: 10, bucket: 'metal' });
          cylX(tb, 0.02, 0.05, sx * 0.36, -0.06, sz * 0.13, paint, { seg: 8, bucket: 'paint' });
        }
        // side frame plates
        box(tb, 0.03, 0.14, 0.34, sx * 0.42, -0.02, 0, paint, { bucket: 'paint' });
      }
      // hoist drum + housing
      box(tb, 0.30, 0.18, 0.26, 0, -0.14, 0.02, paintDeep, { bucket: 'paint' });
      cylX(tb, 0.075, 0.26, 0, -0.14, 0.1, steel, { seg: 12, bucket: 'metal' });
      cylX(tb, 0.03, 0.28, 0, -0.14, 0.1, 0x3c3830, { seg: 8, bucket: 'paint' });
      // machine platform railing
      railRun([-0.42, 0.075, 0.19], [0.42, 0.075, 0.19], 0.17, trim, { gap: 0.24, post: 0.0045, rail: 0.003 });
      // operator cab - hangs on the waterside of the trolley
      const cabZ = 0.30, cabY = -0.40;
      box(tb, 0.30, 0.045, 0.28, 0, cabY + 0.145, cabZ, paintDeep, { bucket: 'paint' });      // roof
      box(tb, 0.30, 0.03, 0.28, 0, cabY - 0.155, cabZ, paintDeep, { bucket: 'paint' });       // floor
      box(tb, 0.05, 0.27, 0.26, -0.13, cabY, cabZ, paint, { bucket: 'paint' });               // frame sides
      box(tb, 0.05, 0.27, 0.26, 0.13, cabY, cabZ, paint, { bucket: 'paint' });
      box(tb, 0.21, 0.24, 0.02, 0, cabY, cabZ + 0.14, paint, { bucket: 'paint' });            // back post plate
      box(tb, 0.26, 0.02, 0.26, 0, cabY + 0.12, cabZ, trim, { bucket: 'paint' });
      box(tb, 0.26, 0.02, 0.26, 0, cabY - 0.12, cabZ, trim, { bucket: 'paint' });
      // glass all round
      box(tb, 0.22, 0.22, 0.012, 0, cabY, cabZ + 0.145, 0x33474a, { bucket: 'glass' });
      box(tb, 0.22, 0.22, 0.012, 0, cabY, cabZ - 0.145, 0x33474a, { bucket: 'glass' });
      box(tb, 0.012, 0.22, 0.235, -0.145, cabY, cabZ, 0x33474a, { bucket: 'glass' });
      box(tb, 0.012, 0.22, 0.235, 0.145, cabY, cabZ, 0x33474a, { bucket: 'glass' });
      // mullions
      for (const sx of [-1, 1]) {
        box(tb, 0.014, 0.26, 0.014, sx * 0.11, cabY, cabZ + 0.15, paintDeep, { bucket: 'paint' });
      }
      box(tb, 0.35, 0.03, 0.34, 0, cabY + 0.17, cabZ, trim, { bucket: 'paint' }); // rain hood
      box(tb, 0.05, 0.04, 0.05, 0.10, cabY + 0.20, cabZ + 0.12, steel, { bucket: 'metal' }); // wiper motor
      // cab underframe truss
      for (const sx of [-1, 1]) {
        bar(tb, [sx * 0.13, -0.24, 0.16], [sx * 0.13, cabY + 0.14, cabZ - 0.02], 0.022, paintDeep, { bucket: 'paint' });
        bar(tb, [sx * 0.30, 0.02, -0.10], [sx * 0.16, cabY + 0.13, cabZ + 0.06], 0.016, paintDeep, { bucket: 'paint' });
      }
      // cab roof railing + extra work lamps
      railRun([-0.13, cabY + 0.19, cabZ + 0.11], [0.13, cabY + 0.19, cabZ + 0.11], 0.12, trim, { gap: 0.13, post: 0.0035, rail: 0.0028 }, tb);
      box(tb, 0.05, 0.05, 0.04, 0.15, cabY - 0.08, cabZ + 0.16, pal.lineYellow, { bucket: 'paint' });
      // a couple of work lights + warning beacon
      box(tb, 0.05, 0.045, 0.05, 0.38, 0.09, 0.15, 0x3c3830, { bucket: 'paint' });
      box(tb, 0.035, 0.032, 0.01, 0.38, 0.09, 0.177, pal.lampWarm, { bucket: 'lamp' });
      box(tb, 0.04, 0.05, 0.04, -0.38, 0.115, -0.14, pal.lineYellow, { bucket: 'paint' });
      // festoon arm
      bar(tb, [0.36, 0.06, -0.1], [0.52, 0.2, -0.12], 0.014, steel, { bucket: 'metal' });
      tb.finish(trolley);
      K.addObject(trolley);

      /* spreader */
      const spreader = new THREE.Group();
      spreader.position.set(cx, 2.6, -6.0);
      const sb = new K.Batcher();
      box(sb, 0.60, 0.075, 0.21, 0, 0.035, 0, 0xb99a52, { bucket: 'paint' });
      box(sb, 0.64, 0.018, 0.215, 0, 0.078, 0, trim, { bucket: 'paint' });
      box(sb, 0.30, 0.028, 0.02, 0, 0.05, 0.108, 0x2f2c27, { bucket: 'paint' });
      for (const sx of [-1, 1]) {
        box(sb, 0.14, 0.055, 0.19, sx * 0.33, 0.035, 0, 0xb99a52, { bucket: 'paint' });
        box(sb, 0.02, 0.12, 0.17, sx * 0.40, -0.02, 0, paintDeep, { bucket: 'paint' });
      }
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          // twistlock housing + pin
          box(sb, 0.055, 0.05, 0.06, sx * 0.285, -0.02, sz * 0.085, 0x4a453b, { bucket: 'metal' });
          cyl(sb, 0.012, 0.06, sx * 0.285, -0.06, sz * 0.085, 0x8f887a, { seg: 6, bucket: 'metal' });
          // cable lug
          box(sb, 0.03, 0.05, 0.03, sx * 0.27, 0.09, sz * 0.09, steel, { bucket: 'metal' });
          // guide flipper
          box(sb, 0.10, 0.015, 0.06, sx * 0.33, -0.055, sz * 0.12, paint, { bucket: 'paint', rot: [0.4 * sz, 0, 0] });
        }
      }
      // warning stripes + sensor + work lamp
      for (let i = 0; i < 5; i++) {
        box(sb, 0.045, 0.075, 0.006, -0.2 + i * 0.1, 0.045, 0.108, i % 2 ? 0x352f28 : pal.lineYellow, { bucket: 'paint' });
      }
      cyl(sb, 0.006, 0.20, 0.24, 0.15, 0.06, steel, { seg: 4, bucket: 'metal' });
      sph(sb, 0.014, 0.24, 0.255, 0.06, pal.lampWarm, { bucket: 'lamp', ws: 6, hs: 4 });
      box(sb, 0.06, 0.04, 0.03, -0.22, 0.10, 0.03, 0x3c3830, { bucket: 'paint' });
      sb.finish(spreader);
      K.addObject(spreader);

      const container = movingContainer(cfg.tint);
      container.position.set(0, -0.155, 0);
      spreader.add(container);

      const rig = makeCableRig(4);
      K.addObject(rig.mesh);

      const anim = {
        idx: cfg.idx, cx, cfg, trolley, spreader, container, rig,
        hasContainer: cfg.hasContainer, phase: cfg.phase, speed: cfg.speed,
        zPick: cfg.zPick, zShip: cfg.zShip, height: 2.6,
      };
      // initial placement so the first frame looks right
      updateCranePose(anim, 0);
      craneAnims.push(anim);
    }

    const Z_TRACK = [
      [0.00, 0], [0.17, 0], [0.40, 1], [0.585, 1], [0.81, 0], [1.00, 0],
    ];
    const H_TRACK = [
      [0.00, 2.90], [0.035, 1.62], [0.11, 1.62], [0.15, 2.94],
      [0.40, 3.26], [0.46, 3.26], [0.50, 2.76], [0.56, 3.16],
      [0.84, 3.16], [0.94, 2.90], [1.00, 2.90],
    ];
    function updateCranePose(a, t) {
      const tt = ((t * a.speed + a.phase) % 1 + 1) % 1;
      const u = keyed(tt, Z_TRACK);
      const z = mix(a.zPick, a.zShip, u);
      const h = keyed(tt, H_TRACK);
      const sway = 0.022 * Math.sin(t * 0.9 + a.phase * 6.0) * (u > 0.02 && u < 0.98 ? 1 : 0.2);
      const zsway = 0.014 * Math.sin(t * 0.55 + a.phase * 4.0);
      a.trolley.position.set(a.cx, BOOM_Y + 0.31, z);
      a.spreader.position.set(a.cx + sway, h, z + zsway);
      a.container.visible = a.hasContainer && tt > 0.072 && tt < 0.500;
      const tY = BOOM_Y + 0.31;
      const pairs = [];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          pairs.push([
            [a.cx + sx * 0.30, tY - 0.17, z + sz * 0.13],
            [a.cx + sway + sx * 0.27, h + 0.09, z + zsway + sz * 0.09],
          ]);
        }
      }
      updateCableRig(a.rig, pairs);
      a.height = h;
    }

    // ---- build the four cranes ---------------------------------------------
    const craneXs = Z.cranes;
    const craneCfgs = [
      { hasContainer: true, phase: 0.06, speed: 1 / 30, tint: K.vary(0x557d77, rnd, { l: 0.05 }) },
      { hasContainer: false, phase: 0.42, speed: 1 / 34, tint: K.vary(0x9a6a50, rnd, { l: 0.05 }) },
      { hasContainer: true, phase: 0.68, speed: 1 / 27, tint: K.vary(0xd2c7b0, rnd, { l: 0.03 }) },
      { hasContainer: false, phase: 0.25, speed: 1 / 31, tint: K.vary(0x6f8fa0, rnd, { l: 0.05 }) },
    ];
    const cranePalettes = [];
    for (let i = 0; i < craneXs.length; i++) {
      const cx = craneXs[i];
      const cols = buildCraneStatic(cx, i, K.rng(0x1000 + i * 77));
      cranePalettes.push(cols);
      craneSign(cx, i);
      // static flatbed trailer waiting beneath cranes 0-2 (picks there)
      if (i <= 2) buildParkedTruck(cx, CRANE_Z);
    }
    // note: parked trucks are built by the vehicle section below (function decl)

    /* =====================================================================
     * 4. MOVING CRANES — trolley / spreader / cable rigs
     * ================================================================== */
    for (let i = 0; i < craneXs.length; i++) {
      buildMovingCrane(craneXs[i], {
        idx: i,
        colors: cranePalettes[i],
        hasContainer: craneCfgs[i].hasContainer,
        phase: craneCfgs[i].phase,
        speed: craneCfgs[i].speed,
        tint: craneCfgs[i].tint,
        zPick: CRANE_Z,
        zShip: -2.55,
      });
    }
    K.addTick(function craneTick(dt, time) {
      for (let i = 0; i < craneAnims.length; i++) updateCranePose(craneAnims[i], time);
    });

    /* =====================================================================
     * 5. RTGs — rubber-tyred gantries travelling over the yard
     * ================================================================== */
    function buildRTG(cfg) {
      const gz = -7.93;
      const g = new THREE.Group();
      g.position.set((cfg.x0 + cfg.x1) / 2, 1.108, gz);
      const body = K.vary(0xd3c7ab, rndD, { l: 0.03, s: 0.02, h: 0.004 });
      const legCol = K.vary(0x4f6b66, rndD, { l: 0.03 });
      const trim = K.vary(0xdfd2b5, rndD, { l: 0.02 });
      const dark = 0x3d3a33;
      const sb = new K.Batcher();

      // legs, tyres, housings
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const wx = sx * 0.56, wz = sz * 1.73;
          for (const ox of [-0.14, 0.14]) {
            cylZ(sb, 0.085, 0.078, wx + ox, 0.085, wz, 0x413d36, { seg: 12, bucket: 'metal' });
            cylZ(sb, 0.05, 0.082, wx + ox, 0.085, wz, legCol, { seg: 10, bucket: 'paint' });
            cylZ(sb, 0.022, 0.086, wx + ox, 0.085, wz, 0x8b8475, { seg: 6, bucket: 'metal' });
            // tread blocks
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * TAU;
              box(sb, 0.02, 0.012, 0.06, wx + ox + Math.cos(a) * 0.078, 0.085 + Math.sin(a) * 0.078,
                wz + (k % 2 ? 0.03 : -0.03), 0x2f2c27, { bucket: 'paint', rot: [0, 0, a] });
            }
          }
          box(sb, 0.46, 0.17, 0.18, wx, 0.21, wz, legCol, { bucket: 'paint' });
          box(sb, 0.48, 0.03, 0.20, wx, 0.30, wz, trim, { bucket: 'paint' });
          // leg column
          bar(sb, [wx, 0.29, wz], [sx * 0.56, 1.635, wz], 0.095, legCol, { bucket: 'paint' });
          // knee braces
          bar(sb, [wx, 0.35, wz], [sx * 0.56, 0.95, wz], 0.05, legCol, { bucket: 'paint' });
          bar(sb, [wx, 0.42, wz], [sx * 0.56, 1.30, wz], 0.035, body, { bucket: 'paint' });
          // hazard stripes + numbers
          hazardBand(sb, 0.115, 0.18, 0.115, wx, 0.42, wz);
          box(sb, 0.13, 0.09, 0.012, wx, 1.20, wz + (sz > 0 ? 0.05 : -0.05), body, { bucket: 'paint' });
          // bolt heads
          for (let k = 0; k < 3; k++) {
            box(sb, 0.012, 0.012, 0.012, wx + (k - 1) * 0.06, 0.285, wz + 0.085, 0x9a9282, { bucket: 'metal' });
          }
        }
      }
      // top frame beams (span along z)
      for (const sx of [-1, 1]) {
        box(sb, 0.13, 0.14, 3.54, sx * 0.56, 1.70, 0, legCol, { bucket: 'paint' });
        box(sb, 0.15, 0.028, 3.56, sx * 0.56, 1.78, 0, trim, { bucket: 'paint' });
        // rail on the beam
        box(sb, 0.05, 0.022, 3.5, sx * 0.56, 1.79, 0, 0x6f6a5e, { bucket: 'metal' });
      }
      for (const sz of [-1, 1]) box(sb, 1.25, 0.13, 0.13, 0, 1.70, sz * 1.72, legCol, { bucket: 'paint' });
      box(sb, 1.25, 0.10, 0.10, 0, 1.70, 0, legCol, { bucket: 'paint' });
      // diagonal web between beams
      for (const sx of [-1, 1]) {
        for (let i = -1; i <= 1; i += 2) {
          strut(sb, [sx * 0.56, 1.70, i * 0.85], [sx * 0.56, 1.70, i * 1.7], 0.016, legCol, { seg: 4, bucket: 'paint' });
        }
      }
      // south walkway + railing
      box(sb, 0.26, 0.014, 3.4, 0.0, 1.795, 1.83, 0x8a8476, { bucket: 'matte' });
      railRun([-0.12, 1.80, 1.86], [0.12, 1.80, 1.86], 0.28, trim, { gap: 0.5, post: 0.005 }, sb);
      // machinery house, on top of the north beam
      box(sb, 0.64, 0.32, 0.56, 0, 1.93, -0.95, body, { bucket: 'paint' });
      box(sb, 0.68, 0.035, 0.60, 0, 2.10, -0.95, trim, { bucket: 'paint' });
      // teal banding + maintenance platform on the machinery house
      box(sb, 0.66, 0.05, 0.58, 0, 2.155, -0.95, legCol, { bucket: 'paint' });
      railRun([-0.30, 2.16, -0.67], [0.30, 2.16, -0.67], 0.16, trim, { gap: 0.18, post: 0.0035, rail: 0.0025 }, sb);
      for (let i = 0; i < 4; i++) {
        box(sb, 0.56, 0.012, 0.02, 0, 1.86 + i * 0.04, -1.235, legCol, { bucket: 'paint' });
      }
      box(sb, 0.16, 0.19, 0.012, 0.18, 1.94, -1.238, dark, { bucket: 'paint' });
      // exhaust + air intake + cable reel + antenna
      cyl(sb, 0.028, 0.24, -0.22, 2.22, -1.05, 0x57524a, { seg: 8, bucket: 'metal' });
      cyl(sb, 0.038, 0.03, -0.22, 2.35, -1.05, 0x2f2c27, { seg: 8, bucket: 'paint' });
      cyl(sb, 0.038, 0.13, 0.24, 2.17, -0.82, legCol, { seg: 10, bucket: 'paint' });
      cylX(sb, 0.075, 0.09, 0.20, 2.18, -0.72, 0x4f4438, { seg: 10, bucket: 'matte' });
      cyl(sb, 0.004, 0.30, -0.28, 2.27, -0.78, 0x6f6a5e, { seg: 4, bucket: 'metal' });
      sph(sb, 0.012, -0.28, 2.43, -0.78, pal.lampWarm, { bucket: 'lamp', ws: 6, hs: 4 });
      // roof floodlights
      for (const sx of [-1, 1]) {
        box(sb, 0.07, 0.06, 0.05, sx * 0.22, 2.12, -0.68, dark, { bucket: 'paint' });
        box(sb, 0.05, 0.04, 0.01, sx * 0.22, 2.12, -0.652, pal.lampWarm, { bucket: 'lamp' });
      }
      // operator cab under the north beam
      const cab = { x: 0.55, y: 1.46, z: -1.45 };
      box(sb, 0.26, 0.28, 0.26, cab.x, cab.y, cab.z, body, { bucket: 'paint' });
      box(sb, 0.28, 0.025, 0.28, cab.x, cab.y + 0.145, cab.z, trim, { bucket: 'paint' });
      box(sb, 0.21, 0.18, 0.012, cab.x, cab.y + 0.02, cab.z + 0.135, 0x33474a, { bucket: 'glass' });
      box(sb, 0.012, 0.18, 0.20, cab.x + 0.135, cab.y + 0.02, cab.z, 0x33474a, { bucket: 'glass' });
      box(sb, 0.012, 0.18, 0.20, cab.x - 0.135, cab.y + 0.02, cab.z, 0x33474a, { bucket: 'glass' });
      box(sb, 0.30, 0.02, 0.32, cab.x, cab.y - 0.15, cab.z, legCol, { bucket: 'paint' });
      box(sb, 0.05, 0.05, 0.05, cab.x, cab.y + 0.19, cab.z - 0.06, pal.lineYellow, { bucket: 'paint' });
      // support post from beam to cab
      bar(sb, [cab.x, 1.79, cab.z], [cab.x, cab.y + 0.15, cab.z], 0.04, legCol, { bucket: 'paint' });
      // access ladder + handrails
      ladderRun(-0.56, 0.55, 0.35, 1.62, trim, { along: 'z' }, sb);
      // small signs / rust
      box(sb, 0.12, 0.055, 0.008, 0, 1.98, 1.845, pal.paperDeep, { bucket: 'paint' });
      box(sb, 0.09, 0.012, 0.01, 0, 1.99, 1.85, pal.rust, { bucket: 'matte' });
      for (let i = 0; i < 5; i++) {
        box(sb, 0.008, 0.08 + rndD() * 0.16, 0.02, 0.50 + (rndD() - 0.5) * 0.1,
          1.55 - rndD() * 0.5, -0.95 + (rndD() - 0.5) * 0.4, pal.rust, { bucket: 'matte' });
      }
      sb.finish(g);
      // trolley
      const trolley = new THREE.Group();
      g.add(trolley);
      const tb = new K.Batcher();
      box(tb, 0.94, 0.10, 0.30, 0, 1.60, 0, legCol, { bucket: 'paint' });
      box(tb, 0.90, 0.03, 0.34, 0, 1.66, 0, trim, { bucket: 'paint' });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          cylX(tb, 0.04, 0.04, sx * 0.40, 1.665, sz * 0.11, 0x45413a, { seg: 8, bucket: 'metal' });
        }
      }
      box(tb, 0.24, 0.16, 0.24, 0, 1.53, 0, body, { bucket: 'paint' });
      cylX(tb, 0.06, 0.2, 0, 1.52, 0.04, 0x6f6a5e, { seg: 10, bucket: 'metal' });
      tb.finish(trolley);

      const spreader = new THREE.Group();
      spreader.position.set(0, 1.50, 0);
      trolley.add(spreader);
      const spb = new K.Batcher();
      box(spb, 0.60, 0.07, 0.21, 0, 0.03, 0, legCol, { bucket: 'paint' });
      box(spb, 0.64, 0.012, 0.215, 0, 0.07, 0, trim, { bucket: 'paint' });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(spb, 0.05, 0.05, 0.055, sx * 0.285, -0.004, sz * 0.085, 0x4a453b, { bucket: 'metal' });
        }
      }
      for (let i = 0; i < 4; i++) {
        box(spb, 0.045, 0.05, 0.006, -0.15 + i * 0.1, 0.035, 0.108, i % 2 ? 0x352f28 : pal.lineYellow, { bucket: 'paint' });
      }
      spb.finish(spreader);
      const cMesh = movingContainer(K.vary(cfg.tint, rndD, { l: 0.04 }));
      cMesh.position.set(0, -0.155, 0);
      spreader.add(cMesh);
      containerCount++;

      const rig = makeCableRig(4);
      g.add(rig.mesh);
      K.addObject(g);

      const anim = {
        g, trolley, spreader, rig, cfg, tz: 0, bob: 0,
        x0: cfg.x0, x1: cfg.x1, period: cfg.period, phase: cfg.phase,
        tPeriod: cfg.tPeriod, tPhase: cfg.tPhase,
      };
      updateRTG(anim, 0);
      return anim;
    }
    const rtgAnims = [];
    const _rtgPairs = [];
    function updateRTG(a, t) {
      const sh = shuttle(t, a.period, 0.17);
      const s = (sh.s + 1) / 2;
      a.g.position.x = a.x0 + (a.x1 - a.x0) * s;
      const tz = 1.40 * Math.sin((t * TAU) / a.tPeriod + a.tPhase);
      a.tz = tz;
      a.trolley.position.z = tz;
      a.bob = 0.014 * Math.sin(t * 0.9 + a.phase * 5);
      a.spreader.position.y = 1.50 + a.bob;
      const pairs = [];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          pairs.push([
            [sx * 0.30, 1.575, tz + sz * 0.10],
            [sx * 0.27, 1.50 + a.bob + 0.075, tz + sz * 0.09],
          ]);
        }
      }
      updateCableRig(a.rig, pairs);
    }
    rtgAnims.push(buildRTG({
      x0: -7.25, x1: -1.35, period: 54, phase: 0.10,
      tPeriod: 27, tPhase: 0.0, tint: 0x9a6a50, tag: 'RTG 1',
    }));
    rtgAnims.push(buildRTG({
      x0: 0.85, x1: 6.35, period: 63, phase: 0.62,
      tPeriod: 31, tPhase: 2.2, tint: 0x6f8fa0, tag: 'RTG 2',
    }));
    K.addTick(function rtgTick(dt, time) {
      for (let i = 0; i < rtgAnims.length; i++) updateRTG(rtgAnims[i], time);
    });

    /* =====================================================================
     * 6. ROAD VEHICLES — tractors, straddles, reach stacker, forklift
     * ================================================================== */

    // A batch shim that offsets every part by (dx,dy,dz): lets the same local
    // vehicle geometry be baked straight into the world batch.
    function offsetBatch(batch, dx, dy, dz) {
      return {
        add(geo, color, opts) {
          const o = Object.assign({}, opts);
          if (o.pos) o.pos = [o.pos[0] + dx, o.pos[1] + dy, o.pos[2] + dz];
          else o.pos = [dx, dy, dz];
          return batch.add(geo, color, o);
        },
      };
    }

    // Build a terminal tractor + trailer in local coordinates (heading +x,
    // y measured from the deck).  Returns container mount points.
    function tractorGeometry(batch, cabColor) {
      const chassis = 0x44413a;
      const tyre = 0x33302b;
      const trim = K.vary(pal.paperDeep, rndD, { l: 0.02 });
      const cab = K.vary(cabColor, rndD, { l: 0.03, s: 0.03 });
      // tractor chassis + cab
      box(batch, 0.30, 0.06, 0.22, 0.32, 0.13, 0, chassis, { bucket: 'paint' });
      box(batch, 0.26, 0.05, 0.26, 0.30, 0.155, 0, chassis, { bucket: 'paint' });
      box(batch, 0.25, 0.27, 0.25, 0.44, 0.315, 0, cab, { bucket: 'paint' });
      box(batch, 0.27, 0.03, 0.27, 0.44, 0.465, 0, trim, { bucket: 'paint' });
      box(batch, 0.20, 0.20, 0.012, 0.44, 0.33, 0.13, 0x33474a, { bucket: 'glass' });
      box(batch, 0.20, 0.20, 0.012, 0.44, 0.33, -0.13, 0x33474a, { bucket: 'glass' });
      box(batch, 0.012, 0.20, 0.22, 0.315, 0.33, 0, 0x33474a, { bucket: 'glass' });
      box(batch, 0.012, 0.20, 0.22, 0.565, 0.33, 0, 0x33474a, { bucket: 'glass' });
      // roof fairing + horn
      box(batch, 0.20, 0.06, 0.20, 0.42, 0.49, 0, trim, { bucket: 'paint' });
      box(batch, 0.03, 0.03, 0.09, 0.47, 0.52, 0.05, 0x2f2c27, { bucket: 'paint' });
      // exhaust + air cleaner + fuel tank
      cyl(batch, 0.022, 0.30, 0.30, 0.33, 0.135, 0x6f6a5e, { seg: 8, bucket: 'metal' });
      cyl(batch, 0.035, 0.09, 0.30, 0.50, 0.135, 0x2f2c27, { seg: 8, bucket: 'paint' });
      cylX(batch, 0.045, 0.16, 0.22, 0.16, -0.14, 0x8a8475, { seg: 8, bucket: 'metal' });
      // front bumper + headlights + mirrors
      box(batch, 0.028, 0.07, 0.24, 0.585, 0.19, 0, chassis, { bucket: 'paint' });
      for (const sz of [-1, 1]) {
        box(batch, 0.015, 0.035, 0.05, 0.592, 0.21, sz * 0.085, pal.lampWarm, { bucket: 'lamp' });
        strut(batch, [0.53, 0.36, sz * 0.15], [0.58, 0.40, sz * 0.17], 0.006, 0x3d3a33, { seg: 4, bucket: 'metal' });
        box(batch, 0.012, 0.055, 0.05, 0.58, 0.40, sz * 0.17, 0x3d3a33, { bucket: 'paint' });
      }
      // wheels: front axle + tractor rear axle
      for (const [ax, nz] of [[0.44, 0.13], [0.12, 0.13]]) {
        for (const sz of [-1, 1]) {
          cylZ(batch, 0.062, 0.05, ax, 0.062, sz * nz, tyre, { seg: 10, bucket: 'metal' });
          cylZ(batch, 0.03, 0.052, ax, 0.062, sz * nz, 0x8b8475, { seg: 6, bucket: 'metal' });
        }
      }
      // fifth wheel + deck plate
      box(batch, 0.20, 0.03, 0.22, 0.04, 0.185, 0, 0x6e6a5c, { bucket: 'metal' });
      // trailer: deck, rails, kingpin, landing gear
      box(batch, 1.24, 0.045, 0.24, -0.62, 0.165, 0, K.mixHex(pal.concreteDark, pal.asphalt, 0.4), { bucket: 'paint' });
      for (const sz of [-1, 1]) {
        box(batch, 1.24, 0.035, 0.02, -0.62, 0.185, sz * 0.115, trim, { bucket: 'paint' });
      }
      box(batch, 1.20, 0.02, 0.20, -0.62, 0.195, 0, 0x6f6a5e, { bucket: 'metal' });
      // twistlocks along the deck
      for (const cx2 of [-0.31, -0.93]) {
        for (const sz of [-1, 1]) {
          box(batch, 0.03, 0.03, 0.03, cx2, 0.212, sz * 0.10, 0x4a453b, { bucket: 'metal' });
        }
      }
      // landing gear
      for (const sz of [-1, 1]) {
        cyl(batch, 0.012, 0.14, -0.50, 0.09, sz * 0.075, 0x5a5750, { seg: 6, bucket: 'metal' });
        box(batch, 0.05, 0.02, 0.05, -0.50, 0.012, sz * 0.075, 0x3a3731, { bucket: 'paint' });
      }
      // rear axles + wheels
      for (const ax of [-0.94, -1.10]) {
        for (const sz of [-1, 1]) {
          cylZ(batch, 0.058, 0.045, ax, 0.058, sz * 0.115, tyre, { seg: 10, bucket: 'metal' });
        }
        for (const sz of [-1, 1]) {
          box(batch, 0.26, 0.02, 0.045, ax, 0.135, sz * 0.135, 0x5d5a50, { bucket: 'paint' });
        }
      }
      // rear under-run bar + lights
      box(batch, 0.04, 0.06, 0.22, -1.255, 0.09, 0, chassis, { bucket: 'paint' });
      for (const sz of [-1, 1]) {
        box(batch, 0.015, 0.03, 0.04, -1.277, 0.14, sz * 0.085, 0x7a3c32, { bucket: 'paint' });
      }
      // mudflaps
      for (const sz of [-1, 1]) {
        box(batch, 0.03, 0.09, 0.03, -1.18, 0.04, sz * 0.13, 0x2f2c27, { bucket: 'paint' });
      }
      return { containers: [[-0.30, 0.325], [-0.93, 0.325]] };
    }

    function buildParkedTruck(x, z) {
      // An empty flatbed waits under the animated cranes; the spreader drops
      // onto its deck exactly at the pick point.
      const ROAD_Y = 1.125;   // terrain quay-road surface
      const shim = offsetBatch(B, x, ROAD_Y, z);
      const cabColor = rndPick(rndD, [0x8d4b3f, 0x3f5f5c, 0xc0b393, 0x5b6663]);
      tractorGeometry(shim, cabColor);
      // chocks + a waiting driver's cones
      box(B, 0.05, 0.05, 0.07, x - 1.18, 1.152, z + 0.155, 0x3f3a32, { bucket: 'matte' });
      box(B, 0.05, 0.05, 0.07, x - 1.18, 1.152, z - 0.155, 0x3f3a32, { bucket: 'matte' });
    }

    // ---- moving tractors on the quay road (east half) ----------------------
    const movingTrucks = [];
    function buildMovingTruck(cfg) {
      const group = new THREE.Group();
      group.position.set(cfg.x0, 1.125, cfg.z);
      group.rotation.y = 0;
      const sb = new K.Batcher();
      const info = tractorGeometry(sb, cfg.cabColor);
      sb.finish(group);
      // two 20 ft boxes on the trailer
      info.containers.forEach((mount, i) => {
        const c = movingContainer(K.vary(cfg.tints[i % cfg.tints.length], rndD, { l: 0.04 }));
        c.position.set(mount[0], mount[1], 0);
        group.add(c);
        containerCount++;
      });
      K.addObject(group);
      const anim = {
        group, x0: cfg.x0, x1: cfg.x1, z: cfg.z,
        period: cfg.period, phase: cfg.phase, reversed: cfg.dir < 0,
        heading: cfg.dir < 0 ? Math.PI : 0, targetHeading: 0,
      };
      movingTrucks.push(anim);
      updateMovingTruck(anim, 0.016, 0);
      return anim;
    }
    function updateMovingTruck(a, dt, t) {
      const sh = shuttle(t + a.phase * a.period, a.period, 0.2);
      const s = (sh.s + 1) / 2;
      a.group.position.x = a.x0 + (a.x1 - a.x0) * (a.reversed ? 1 - s : s);
      const travel = a.reversed ? -sh.dir : sh.dir;
      a.targetHeading = travel > 0 ? 0 : Math.PI;
      a.heading = K.damp(a.heading, a.targetHeading, sh.still ? 2.6 : 16, dt);
      a.group.rotation.y = a.heading;
    }
    buildMovingTruck({
      x0: 4.9, x1: 11.55, z: -5.19, dir: 1, period: 42, phase: 0.0,
      cabColor: 0x8d4b3f, tints: [0x557d77, 0x9a6a50],
    });
    buildMovingTruck({
      x0: 4.9, x1: 11.55, z: -5.51, dir: -1, period: 46, phase: 0.35,
      cabColor: 0x3f5f5c, tints: [0xbb9f63, 0x6f8fa0],
    });
    K.addTick(function truckTick(dt, time) {
      for (let i = 0; i < movingTrucks.length; i++) updateMovingTruck(movingTrucks[i], dt, time);
    });

    // ---- straddle carriers ------------------------------------------------
    const straddles = [];
    function buildStraddle(cfg) {
      const group = new THREE.Group();
      group.position.set(cfg.base, 1.108, HAUL_Z);
      const body = K.vary(cfg.color, rndD, { l: 0.03, s: 0.03, h: 0.006 });
      const dark = 0x3f3b34;
      const trim = K.vary(pal.paperDeep, rndD, { l: 0.02 });
      const sb = new K.Batcher();
      // wheels (8) + corner posts
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const wx = sx * 0.22, wz = sz * 0.20;
          for (const ox of [-0.10, 0.10]) {
            cylZ(sb, 0.058, 0.045, wx + ox, 0.058, wz, 0x33302b, { seg: 10, bucket: 'metal' });
            cylZ(sb, 0.028, 0.05, wx + ox, 0.058, wz, 0x8b8475, { seg: 6, bucket: 'metal' });
          }
          box(sb, 0.26, 0.07, 0.10, wx, 0.10, wz, dark, { bucket: 'paint' });
          // leg column, slightly leaning in
          bar(sb, [wx, 0.14, wz], [sx * 0.205, 0.98, sz * 0.185], 0.07, body, { bucket: 'paint' });
          // bracing
          bar(sb, [wx, 0.20, wz], [sx * 0.205, 0.58, sz * 0.185], 0.035, body, { bucket: 'paint' });
          // hazard band + bolt plate
          hazardBand(sb, 0.085, 0.12, 0.085, wx, 0.22, wz);
          box(sb, 0.09, 0.05, 0.09, wx, 0.15, wz, dark, { bucket: 'paint' });
        }
      }
      // top frame
      for (const sz of [-1, 1]) {
        box(sb, 0.64, 0.09, 0.09, 0, 1.00, sz * 0.19, body, { bucket: 'paint' });
        box(sb, 0.66, 0.02, 0.11, 0, 1.055, sz * 0.19, trim, { bucket: 'paint' });
      }
      for (const sx of [-1, 1]) box(sb, 0.09, 0.08, 0.46, sx * 0.24, 1.00, 0, body, { bucket: 'paint' });
      box(sb, 0.09, 0.08, 0.46, 0, 1.00, 0, body, { bucket: 'paint' });
      // diagonal web in the side planes
      for (const sz of [-1, 1]) {
        bar(sb, [-0.22, 0.18, sz * 0.19], [0.20, 0.96, sz * 0.19], 0.03, body, { bucket: 'paint' });
        bar(sb, [0.22, 0.18, sz * 0.19], [-0.20, 0.96, sz * 0.19], 0.03, body, { bucket: 'paint' });
      }
      // lifting frame + chains
      box(sb, 0.52, 0.04, 0.24, 0, 0.70, 0, dark, { bucket: 'metal' });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          strut(sb, [sx * 0.22, 1.00, sz * 0.18], [sx * 0.24, 0.72, sz * 0.10], 0.004, 0x4a4640, { seg: 4, bucket: 'metal' });
        }
      }
      // operator cab at the +x end
      const cabX = 0.36, cabY = 0.60;
      box(sb, 0.26, 0.30, 0.32, cabX, cabY, 0, body, { bucket: 'paint' });
      box(sb, 0.28, 0.025, 0.34, cabX, cabY + 0.16, 0, trim, { bucket: 'paint' });
      box(sb, 0.20, 0.20, 0.012, cabX, cabY + 0.03, 0.162, 0x33474a, { bucket: 'glass' });
      box(sb, 0.20, 0.20, 0.012, cabX, cabY + 0.03, -0.162, 0x33474a, { bucket: 'glass' });
      box(sb, 0.012, 0.20, 0.24, cabX + 0.135, cabY + 0.03, 0, 0x33474a, { bucket: 'glass' });
      box(sb, 0.012, 0.20, 0.24, cabX - 0.135, cabY + 0.03, 0, 0x33474a, { bucket: 'glass' });
      // steps + handrail + beacon + plate
      for (let i = 0; i < 3; i++) box(sb, 0.06, 0.012, 0.14, cabX - 0.20, 0.35 + i * 0.1, 0.10, dark, { bucket: 'paint' });
      railRun([cabX - 0.15, 0.44, 0.165], [cabX + 0.15, 0.44, 0.165], 0.2, trim, { gap: 0.15, post: 0.0035, rail: 0.0028 }, sb);
      box(sb, 0.045, 0.04, 0.045, cabX, cabY + 0.20, 0, pal.lineYellow, { bucket: 'paint' });
      box(sb, 0.10, 0.055, 0.008, cabX, cabY + 0.10, 0.166, pal.paperDeep, { bucket: 'paint' });
      box(sb, 0.07, 0.012, 0.009, cabX, cabY + 0.10, 0.171, pal.inkSoft, { bucket: 'paint' });
      box(sb, 0.09, 0.09, 0.06, 0.0, 1.10, 0.0, dark, { bucket: 'paint' });
      sb.finish(group);
      // carried container
      const cMesh = movingContainer(K.vary(cfg.tint, rndD, { l: 0.04 }));
      cMesh.position.set(0, 0.57, 0);
      group.add(cMesh);
      containerCount++;
      K.addObject(group);
      const anim = { group, base: cfg.base, amp: cfg.amplitude, period: cfg.period, phase: cfg.phase };
      straddles.push(anim);
      return anim;
    }
    function updateStraddle(a, t) {
      a.group.position.x = a.base + a.amp * Math.sin(t * TAU / a.period + a.phase);
    }
    buildStraddle({ base: -2.20, amplitude: 3.55, period: 38, phase: 0.0, color: 0xb08a4a, tint: 0x557d77 });
    buildStraddle({ base: 2.40, amplitude: 3.55, period: 38, phase: 0.0, color: 0xb08a4a, tint: 0xbb9f63 });
    buildStraddle({ base: 7.02, amplitude: 0.0, period: 38, phase: 0.0, color: 0xa07f44, tint: 0x6f8fa0 });
    K.addTick(function straddleTick(dt, time) {
      for (let i = 0; i < straddles.length; i++) updateStraddle(straddles[i], time);
    });

    // ---- reach stacker (west equipment aisle) -----------------------------
    const reachStacker = (function () {
      const group = new THREE.Group();
      group.position.set(-2.345, 1.108, -7.9);
      group.rotation.y = -Math.PI / 2; // local +x -> world +z
      const body = K.vary(0x8d5a44, rndD, { l: 0.03, s: 0.02 });
      const dark = 0x3f3b34;
      const sb = new K.Batcher();
      // chassis
      box(sb, 0.52, 0.15, 0.26, 0, 0.17, 0, dark, { bucket: 'paint' });
      box(sb, 0.36, 0.12, 0.24, 0.10, 0.25, 0, body, { bucket: 'paint' });
      box(sb, 0.20, 0.16, 0.24, -0.24, 0.24, 0, dark, { bucket: 'paint' });
      // wheels 4
      for (const ax of [0.17, -0.20]) {
        for (const sz of [-1, 1]) {
          cylZ(sb, 0.058, 0.055, ax, 0.058, sz * 0.135, 0x33302b, { seg: 10, bucket: 'metal' });
          cylZ(sb, 0.03, 0.06, ax, 0.058, sz * 0.135, 0x8b8475, { seg: 6, bucket: 'metal' });
        }
      }
      // cab
      box(sb, 0.22, 0.30, 0.24, 0.06, 0.40, 0, body, { bucket: 'paint' });
      box(sb, 0.24, 0.025, 0.26, 0.06, 0.56, 0, pal.paperDeep, { bucket: 'paint' });
      box(sb, 0.18, 0.17, 0.012, 0.06, 0.44, 0.123, 0x33474a, { bucket: 'glass' });
      box(sb, 0.012, 0.17, 0.18, 0.175, 0.44, 0, 0x33474a, { bucket: 'glass' });
      box(sb, 0.012, 0.17, 0.18, -0.055, 0.44, 0, 0x33474a, { bucket: 'glass' });
      // boom + handler
      bar(sb, [-0.34, 0.52, 0.0], [0.36, 0.36, 0.0], 0.09, body, { bucket: 'paint' });
      bar(sb, [-0.30, 0.56, 0.0], [0.30, 0.40, 0.0], 0.055, dark, { bucket: 'paint' });
      box(sb, 0.10, 0.34, 0.20, 0.44, 0.30, 0, dark, { bucket: 'paint' });
      box(sb, 0.04, 0.10, 0.34, 0.50, 0.16, 0, 0x4a453b, { bucket: 'metal' });
      for (const sz of [-1, 1]) {
        strut(sb, [0.44, 0.40, sz * 0.10], [0.36, 0.20, sz * 0.16], 0.005, 0x4a4640, { seg: 4, bucket: 'metal' });
      }
      // counterweight + beacon + mirrors
      box(sb, 0.14, 0.20, 0.24, -0.36, 0.30, 0, dark, { bucket: 'paint' });
      box(sb, 0.045, 0.045, 0.045, 0.06, 0.60, 0, pal.lineYellow, { bucket: 'paint' });
      for (const sz of [-1, 1]) {
        strut(sb, [0.16, 0.48, sz * 0.13], [0.19, 0.52, sz * 0.16], 0.006, dark, { seg: 4, bucket: 'metal' });
        box(sb, 0.012, 0.05, 0.04, 0.19, 0.52, sz * 0.16, dark, { bucket: 'paint' });
      }
      // exhaust + handrails
      cyl(sb, 0.02, 0.25, -0.10, 0.42, 0.15, 0x6f6a5e, { seg: 6, bucket: 'metal' });
      railRun([-0.28, 0.32, 0.145], [0.12, 0.32, 0.145], 0.22, pal.inkSoft, { gap: 0.15, post: 0.0035, rail: 0.0028 });
      sb.finish(group);
      const cMesh = movingContainer(K.vary(0x9a6a50, rndD, { l: 0.04 }));
      cMesh.position.set(0.57, 0.30, 0);
      group.add(cMesh);
      containerCount++;
      K.addObject(group);
      return { group, period: 44, phase: 0.2, z0: -7.55, z1: -6.78 };
    })();
    K.addTick(function reachTick(dt, time) {
      const rs = reachStacker;
      const sh = shuttle(time, rs.period, 0.22);
      const s = (sh.s + 1) / 2;
      rs.group.position.z = rs.z0 + (rs.z1 - rs.z0) * s;
    });

    // ---- forklift in the support forecourt ---------------------------------
    const forklift = (function () {
      const group = new THREE.Group();
      group.position.set(8.6, 1.108, -6.22);
      const body = K.vary(0xc4a15a, rndD, { l: 0.03, s: 0.02 });
      const dark = 0x3f3b34;
      const sb = new K.Batcher();
      box(sb, 0.24, 0.10, 0.14, 0, 0.09, 0, body, { bucket: 'paint' });
      box(sb, 0.14, 0.13, 0.13, -0.02, 0.19, 0, body, { bucket: 'paint' });
      box(sb, 0.10, 0.13, 0.12, 0.08, 0.19, 0, body, { bucket: 'paint' });
      box(sb, 0.10, 0.08, 0.12, -0.05, 0.30, 0, body, { bucket: 'paint' });
      // mast
      for (const sz of [-1, 1]) {
        box(sb, 0.02, 0.30, 0.02, 0.135, 0.22, sz * 0.055, 0x55514a, { bucket: 'metal' });
      }
      box(sb, 0.10, 0.015, 0.115, 0.135, 0.09, 0, 0x55514a, { bucket: 'metal' });
      box(sb, 0.10, 0.015, 0.115, 0.135, 0.065, 0, 0x55514a, { bucket: 'metal' });
      // pallet + boxes
      box(sb, 0.16, 0.012, 0.14, 0.165, 0.078, 0, pal.wood, { bucket: 'paint' });
      box(sb, 0.13, 0.075, 0.11, 0.17, 0.12, 0, K.mixHex(pal.woodLight, pal.paperDeep, 0.4), { bucket: 'matte' });
      box(sb, 0.10, 0.02, 0.09, 0.17, 0.165, 0, 0x8a7c62, { bucket: 'paint' });
      // wheels
      for (const ax of [0.09, -0.08]) {
        for (const sz of [-1, 1]) {
          cylZ(sb, 0.035, 0.03, ax, 0.035, sz * 0.075, 0x33302b, { seg: 8, bucket: 'metal' });
        }
      }
      // cage + seat + beacon
      box(sb, 0.02, 0.12, 0.02, -0.11, 0.26, 0.06, dark, { bucket: 'paint' });
      box(sb, 0.02, 0.12, 0.02, -0.11, 0.26, -0.06, dark, { bucket: 'paint' });
      box(sb, 0.24, 0.02, 0.14, -0.03, 0.34, 0, dark, { bucket: 'paint' });
      box(sb, 0.10, 0.10, 0.018, -0.02, 0.24, -0.062, 0x33474a, { bucket: 'glass' });
      box(sb, 0.02, 0.02, 0.02, 0.10, 0.36, 0, pal.lineYellow, { bucket: 'paint' });
      sb.finish(group);
      K.addObject(group);
      return { group, period: 26, phase: 0.4, x0: 8.35, x1: 10.55 };
    })();
    K.addTick(function forkTick(dt, time) {
      const f = forklift;
      const p = (time / f.period + f.phase) % 1;
      const tri = p < 0.5 ? p * 2 : (1 - p) * 2;
      f.group.position.x = f.x0 + (f.x1 - f.x0) * K.smoothstep(0.06, 0.94, tri);
      f.group.position.y = 1.108 + 0.004 * Math.abs(Math.sin(time * 4));
    });

    // ---- empty container handler (middle equipment aisle) -----------------
    const emptyHandler = (function () {
      const group = new THREE.Group();
      group.position.set(2.16, 1.108, -8.0);
      group.rotation.y = -Math.PI / 2;
      const body = K.vary(0x5a6f72, rndD, { l: 0.03, s: 0.02 });
      const dark = 0x3f3b34;
      const sb = new K.Batcher();
      box(sb, 0.46, 0.16, 0.28, 0, 0.18, 0, dark, { bucket: 'paint' });
      box(sb, 0.24, 0.24, 0.24, 0.10, 0.36, 0, body, { bucket: 'paint' });
      box(sb, 0.20, 0.16, 0.012, 0.10, 0.40, 0.123, 0x33474a, { bucket: 'glass' });
      box(sb, 0.012, 0.16, 0.20, 0.223, 0.40, 0, 0x33474a, { bucket: 'glass' });
      box(sb, 0.012, 0.16, 0.20, -0.023, 0.40, 0, 0x33474a, { bucket: 'glass' });
      box(sb, 0.26, 0.02, 0.26, 0.10, 0.49, 0, pal.paperDeep, { bucket: 'paint' });
      // wheels
      for (const ax of [0.15, -0.16]) {
        for (const sz of [-1, 1]) {
          cylZ(sb, 0.062, 0.05, ax, 0.062, sz * 0.14, 0x33302b, { seg: 10, bucket: 'metal' });
          cylZ(sb, 0.03, 0.055, ax, 0.062, sz * 0.14, 0x8b8475, { seg: 6, bucket: 'metal' });
        }
      }
      // top-pick frame over the load
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(sb, 0.05, 0.62, 0.05, sx * 0.30, 0.62, sz * 0.15, body, { bucket: 'paint' });
          strut(sb, [sx * 0.30, 1.05, sz * 0.15], [sx * 0.226, 1.32, sz * 0.11], 0.02, body, { seg: 4, bucket: 'paint' });
        }
      }
      box(sb, 0.64, 0.05, 0.36, 0, 1.05, 0, body, { bucket: 'paint' });
      box(sb, 0.30, 0.06, 0.28, 0, 1.36, 0, dark, { bucket: 'paint' });
      // spreader + twistlocks under the frame
      box(sb, 0.60, 0.04, 0.22, 0, 0.66, 0, dark, { bucket: 'metal' });
      for (const sz of [-1, 1]) box(sb, 0.05, 0.04, 0.05, 0.28, 0.64, sz * 0.10, 0x4a453b, { bucket: 'metal' });
      box(sb, 0.12, 0.035, 0.05, 0.0, 1.40, 0.0, pal.lineYellow, { bucket: 'paint' });
      sb.finish(group);
      const cMesh = movingContainer(K.vary(0x7e937f, rndD, { l: 0.04 }));
      cMesh.position.set(0, 0.81, 0);
      group.add(cMesh);
      containerCount++;
      K.addObject(group);
      return { group, period: 50, phase: 0.15, z0: -9.25, z1: -8.45 };
    })();
    K.addTick(function handlerTick(dt, time) {
      const h = emptyHandler;
      h.group.position.z = mix(h.z0, h.z1, (Math.sin(time * TAU / h.period + 0.8) + 1) / 2);
    });

    /* =====================================================================
     * 7. SUPPORT ZONE — operations tower, workshop, gate, fuel farm, etc.
     * ================================================================== */
    const SUP = Z.support;
    const SBASE = DECK + 0.008;         // support apron slab top
    const FX0 = 8.30, FX1 = 11.45;
    let buildingCount = 0;

    // The NE coastline cuts the nominal support rectangle, so the apron is
    // clipped to the land polygon and finished with a proper quay wall.
    const SUPPORT_Z1 = -9.90;
    function landEdgeX(z, inset) {
      const pad = inset == null ? 0.15 : inset;
      for (let x = SUP.x1 + 0.4; x > SUP.x0; x -= 0.02) {
        if (L.pointInLand(x - pad, z)) return Math.min(SUP.x1, x - pad);
      }
      return SUP.x0 + 0.2;
    }
    const edgeSamples = [];
    for (let z = SUP.z0; z >= SUPPORT_Z1; z -= 0.10) {
      edgeSamples.push([landEdgeX(z), z]);
    }
    (function supportPlatform() {
      const poly = [];
      poly.push([SUP.x0, SUP.z1]);
      poly.push([SUP.x0, SUPPORT_Z1]);
      for (let i = edgeSamples.length - 1; i >= 0; i--) poly.push([edgeSamples[i][0], edgeSamples[i][1]]);
      // slab (thin extruded polygon)
      bPrism(poly, 0.008, SBASE, K.mixHex(pal.concrete, pal.concreteDark, 0.30));
      // expansion joints, clipped to the platform
      for (let x = SUP.x0 + 0.8; x < SUP.x1; x += 0.85) {
        let z0 = null;
        for (let z = SUP.z1; z >= SUPPORT_Z1 - 0.001; z -= 0.12) {
          const inside = x < landEdgeX(z, 0.20);
          if (inside && z0 === null) z0 = z;
          if ((!inside || z <= SUPPORT_Z1 + 0.001) && z0 !== null) {
            const zEnd = Math.max(z, SUPPORT_Z1);
            box(B, 0.012, 0.002, Math.abs(z0 - zEnd), x, SBASE + 0.0008, (z0 + zEnd) / 2, 0x7e786a, { bucket: 'matte' });
            z0 = null;
          }
        }
      }
      for (let z = SUP.z1 - 0.9; z > SUPPORT_Z1; z -= 0.95) {
        const xe = landEdgeX(z, 0.22);
        if (xe > SUP.x0 + 0.2) box(B, xe - SUP.x0 - 0.06, 0.002, 0.012, (SUP.x0 + xe) / 2, SBASE + 0.0008, z, 0x7e786a, { bucket: 'matte' });
      }
      // forecourt lane marking
      for (let x = SUP.x0 + 0.15; x < 11.2; x += 0.48) {
        box(B, 0.26, 0.0025, 0.02, x + 0.13, SBASE + 0.0012, -6.30, pal.lineYellow, { bucket: 'matte' });
      }
      // quay wall along the seaward edge + coping, rust, ladders, bollards
      const wallPts = edgeSamples.slice();
      wallPts.push([SUP.x0, SUPPORT_Z1]);
      for (let i = 0; i < wallPts.length - 1; i++) {
        const a = wallPts[i], c = wallPts[i + 1];
        const dx = c[0] - a[0], dz = c[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.001) continue;
        const ang = Math.atan2(dx, dz);
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        box(B, 0.13, 1.55, len + 0.02, mx, SBASE - 0.74, mz,
          K.mixHex(pal.concrete, pal.stoneDark, 0.42), { bucket: 'matte', rot: [0, ang, 0] });
        box(B, 0.17, 0.055, len + 0.03, mx, SBASE + 0.03, mz, pal.stoneLight, { bucket: 'paint', rot: [0, ang, 0] });
        box(B, 0.145, 0.10, len + 0.02, mx, SBASE - 0.20, mz, K.mixHex(pal.concreteDark, pal.asphalt, 0.3), { bucket: 'matte', rot: [0, ang, 0] });
        if (i % 3 === 0) {
          cyl(B, 0.018, 0.16, a[0] + 0.02, SBASE + 0.08, a[1], 0x8d887b, { seg: 6, bucket: 'metal' });
          box(B, 0.03, 0.20, 0.30, a[0] + 0.04, SBASE - 0.18, a[1], 0x55514a, { bucket: 'metal', rot: [0, ang, 0] });
        }
      }
      for (let i = 3; i < Math.min(wallPts.length - 1, 12); i += 4) {
        const p = wallPts[i];
        box(B, 0.10, 0.03, 0.10, p[0], SBASE + 0.10, p[1], 0xb08b4a, { bucket: 'paint' });
      }
      // a couple of ladders down to the water
      for (const i of [2, 7]) {
        if (i >= wallPts.length - 1) continue;
        const p = wallPts[i];
        ladderRun(p[0] + 0.10, p[1], 0.55, 1.86, 0x8d887b, { along: 'z' });
      }
    })();

    function bPrism(points, height, baseY, color) {
      const geo = K.prismGeo(points, height);
      B.add(geo, color, { pos: [0, baseY, 0], bucket: 'matte' });
    }
    function winZ(x, y, z, w, h, lit, frameC) {
      const fc = frameC || pal.craneTrim;
      box(B, w + 0.028, h + 0.028, 0.012, x, y, z - 0.008, fc, { bucket: 'paint' });
      box(B, w, h, 0.012, x, y, z + 0.002, lit ? pal.lampWarm : 0x33474a,
        { bucket: lit ? 'lamp' : 'glass' });
      box(B, 0.012, h, 0.02, x - w / 2, y, z, fc, { bucket: 'paint' });
      box(B, 0.012, h, 0.02, x + w / 2, y, z, fc, { bucket: 'paint' });
      box(B, w, 0.012, 0.02, x, y + h / 2, z, fc, { bucket: 'paint' });
      box(B, w, 0.012, 0.02, x, y - h / 2, z, fc, { bucket: 'paint' });
    }
    function winX(x, y, z, w, h, lit, frameC) {
      const fc = frameC || pal.craneTrim;
      box(B, 0.012, h + 0.028, w + 0.028, x - 0.008, y, z, fc, { bucket: 'paint' });
      box(B, 0.012, h, w, x + 0.002, y, z, lit ? pal.lampWarm : 0x33474a,
        { bucket: lit ? 'lamp' : 'glass' });
      box(B, 0.02, h, 0.012, x, y, z - w / 2, fc, { bucket: 'paint' });
      box(B, 0.02, h, 0.012, x, y, z + w / 2, fc, { bucket: 'paint' });
      box(B, 0.02, 0.012, w, x, y + h / 2, z, fc, { bucket: 'paint' });
      box(B, 0.02, 0.012, w, x, y - h / 2, z, fc, { bucket: 'paint' });
    }
    function downpipe(x, z, y0, y1) {
      cyl(B, 0.012, y1 - y0, x, (y0 + y1) / 2, z, 0x6b6558, { seg: 6, bucket: 'metal' });
      box(B, 0.038, 0.03, 0.038, x, y1, z, 0x5e584d, { bucket: 'metal' });
    }
    function bollard(x, z) {
      cyl(B, 0.02, 0.17, x, SBASE + 0.085, z, pal.lineYellow, { seg: 8, bucket: 'paint' });
      cyl(B, 0.026, 0.02, x, SBASE + 0.18, z, 0x3a352c, { seg: 8, bucket: 'paint' });
    }
    function standPipe(x, z, y0, y1, r) {
      cyl(B, r || 0.015, y1 - y0, x, (y0 + y1) / 2, z, 0x777165, { seg: 6, bucket: 'metal' });
    }

    /* -------------------------------------------------- operations tower */
    (function opsTower() {
      const tx = 10.10, tz = -7.85;
      buildingCount++;
      box(B, 1.02, 0.06, 1.02, tx, SBASE + 0.03, tz, pal.stoneDark, { bucket: 'matte' });
      // concrete shaft
      box(B, 0.90, 0.92, 0.90, tx, SBASE + 0.52, tz, K.mixHex(pal.concrete, pal.stone, 0.35), { bucket: 'matte' });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(B, 0.07, 0.92, 0.07, tx + sx * 0.42, SBASE + 0.52, tz + sz * 0.42, pal.stoneLight, { bucket: 'paint' });
        }
      }
      box(B, 0.94, 0.05, 0.94, tx, SBASE + 0.975, tz, pal.craneTrim, { bucket: 'paint' });
      // ground-floor lobby: door, canopy, steps, lit windows
      box(B, 0.26, 0.44, 0.03, tx - 0.16, SBASE + 0.30, tz + 0.452, 0x3f4a46, { bucket: 'paint' });
      box(B, 0.22, 0.40, 0.012, tx - 0.16, SBASE + 0.30, tz + 0.466, 0x33474a, { bucket: 'glass' });
      box(B, 0.05, 0.40, 0.02, tx - 0.16, SBASE + 0.30, tz + 0.474, pal.craneTrim, { bucket: 'paint' });
      box(B, 0.36, 0.03, 0.16, tx - 0.16, SBASE + 0.56, tz + 0.50, pal.craneTrim, { bucket: 'paint' });
      for (let i = 0; i < 3; i++) {
        box(B, 0.30, 0.035, 0.06, tx - 0.16, SBASE + 0.02 + i * 0.035, tz + 0.48 + i * 0.045, pal.stoneLight, { bucket: 'matte' });
      }
      for (const sx of [-1, 1]) {
        winZ(tx + sx * 0.26, SBASE + 0.36, tz + 0.452, 0.16, 0.20, sx > 0);
        box(B, 0.055, 0.03, 0.09, tx - 0.16, SBASE + 0.55, tz + 0.47, pal.lampWarm, { bucket: 'lamp' });
      }
      // glass control cab
      box(B, 1.06, 0.05, 1.06, tx, SBASE + 1.005, tz, pal.craneTrim, { bucket: 'paint' });
      box(B, 0.98, 0.40, 0.98, tx, SBASE + 1.235, tz, 0x33474a, { bucket: 'glass' });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(B, 0.055, 0.42, 0.055, tx + sx * 0.465, SBASE + 1.235, tz + sz * 0.465, pal.craneTrim, { bucket: 'paint' });
        }
        box(B, 0.035, 0.42, 0.035, tx + sx * 0.49, SBASE + 1.235, tz, pal.craneTrim, { bucket: 'paint' });
        box(B, 0.035, 0.42, 0.035, tx, SBASE + 1.235, tz + sx * 0.49, pal.craneTrim, { bucket: 'paint' });
        // mullions on the four faces
        for (const k of [-0.28, 0, 0.28]) {
          box(B, 0.022, 0.40, 0.022, tx + k, SBASE + 1.235, tz + 0.49, pal.craneTrim, { bucket: 'paint' });
          box(B, 0.022, 0.40, 0.022, tx + k, SBASE + 1.235, tz - 0.49, pal.craneTrim, { bucket: 'paint' });
          box(B, 0.022, 0.40, 0.022, tx + 0.49, SBASE + 1.235, tz + k, pal.craneTrim, { bucket: 'paint' });
          box(B, 0.022, 0.40, 0.022, tx - 0.49, SBASE + 1.235, tz + k, pal.craneTrim, { bucket: 'paint' });
        }
      }
      // warm interior panels glowing through the glass at night
      for (const sx of [-1, 1]) {
        box(B, 0.22, 0.20, 0.02, tx + sx * 0.18, SBASE + 1.22, tz + 0.50, pal.lampWarm, { bucket: 'lamp' });
        box(B, 0.02, 0.20, 0.22, tx + 0.50, SBASE + 1.22, tz + sx * 0.16, pal.lampWarm, { bucket: 'lamp' });
      }
      // fascia + roof
      box(B, 1.08, 0.09, 1.08, tx, SBASE + 1.48, tz, pal.craneTrim, { bucket: 'paint' });
      box(B, 1.12, 0.05, 1.12, tx, SBASE + 1.55, tz, pal.stoneDark, { bucket: 'paint' });
      box(B, 1.12, 0.035, 1.12, tx, SBASE + 1.587, tz, pal.stone, { bucket: 'paint' });
      // roof plant
      box(B, 0.30, 0.13, 0.24, tx - 0.18, SBASE + 1.655, tz - 0.18, 0x9b968a, { bucket: 'paint' });
      disc(B, 0.075, tx - 0.18, SBASE + 1.73, tz - 0.18, 0x4a463e);
      box(B, 0.16, 0.10, 0.14, tx + 0.22, SBASE + 1.64, tz + 0.16, 0x8d887b, { bucket: 'paint' });
      cyl(B, 0.032, 0.18, tx + 0.34, SBASE + 1.69, tz - 0.30, 0x6f6a5e, { seg: 6, bucket: 'metal' });
      // antenna mast + beacon + dish
      cyl(B, 0.012, 0.44, tx + 0.20, SBASE + 1.80, tz + 0.26, 0x6f6a5e, { seg: 5, bucket: 'metal' });
      sph(B, 0.017, tx + 0.20, SBASE + 2.03, tz + 0.26, pal.lampWarm, { bucket: 'lamp', ws: 6, hs: 4 });
      cylX(B, 0.07, 0.02, tx + 0.05, SBASE + 1.78, tz + 0.26, 0xb8b1a2, { seg: 12, bucket: 'metal', rot: [0.5, 0, 0] });
      // roof railing
      railRun([tx - 0.5, SBASE + 1.60, tz + 0.51], [tx + 0.5, SBASE + 1.60, tz + 0.51], 0.24, pal.craneTrim, { gap: 0.32, post: 0.005, rail: 0.0035 });
      railRun([tx - 0.5, SBASE + 1.60, tz - 0.51], [tx - 0.5, SBASE + 1.60, tz + 0.51], 0.24, pal.craneTrim, { gap: 0.32, post: 0.005, rail: 0.0035 });
      // external ladder + hoops
      ladderRun(tx - 0.46, tz - 0.28, SBASE + 0.10, SBASE + 1.46, 0x6f6a5e, { along: 'z', hoops: true });
      // downpipes, base bollards, rust
      downpipe(tx + 0.44, tz + 0.44, SBASE + 0.05, SBASE + 0.92);
      downpipe(tx - 0.44, tz - 0.44, SBASE + 0.05, SBASE + 0.92);
      for (const [bx, bz] of [[-0.56, -0.56], [0.56, -0.56], [-0.56, 0.56], [0.56, 0.56]]) {
        bollard(tx + bx, tz + bz);
      }
      for (let i = 0; i < 6; i++) {
        box(B, 0.008, 0.06 + rndD() * 0.14, 0.02, tx - 0.42 + rndD() * 0.84,
          SBASE + 0.10 + rndD() * 0.16, tz + 0.452, pal.rust, { bucket: 'matte' });
      }
      // main sign
      K.sign({
        x: tx, y: SBASE + 0.62, z: tz + 0.458,
        w: 0.70, aspect: 3.6,
        bg: '#ece0c8', fg: '#2c453f', border: '#2c453f',
        lines: [
          { text: 'AURORA TERMINAL', size: 44, font: K.fonts.sans, weight: 700, color: '#2c453f' },
          { text: '极光码头 · 调度中心 OPS', size: 22, font: K.fonts.song, weight: 500, color: '#2c453f' },
        ],
        night: true,
      });
      // small side sign for the east elevation
      K.sign({
        x: tx + 0.462, y: SBASE + 0.80, z: tz + 0.02,
        w: 0.36, aspect: 2.8, ry: Math.PI / 2,
        bg: '#2c453f', fg: '#ece0c8',
        lines: [{ text: 'OPS 调度', size: 46, font: K.fonts.song, weight: 600, color: '#ece0c8' }],
        night: true,
      });
      K.anchor('opsTowerBeacon', { pos: [tx + 0.20, SBASE + 2.06, tz + 0.26] });
    })();

    /* ------------------------------------------------------------ workshop */
    (function workshop() {
      const wx0 = 8.30, wx1 = 9.30, wz0 = -9.55, wz1 = -8.35;
      const cx = (wx0 + wx1) / 2, cz = (wz0 + wz1) / 2;
      const W = wx1 - wx0, D = wz0 - wz1;
      buildingCount++;
      box(B, W + 0.05, 0.06, D + 0.05, cx, SBASE + 0.03, cz, pal.stoneDark, { bucket: 'matte' });
      box(B, W, 0.58, D, cx, SBASE + 0.35, cz, K.mixHex(pal.plasterBlue, pal.concrete, 0.42), { bucket: 'matte' });
      // corrugated wall ribs
      for (let x = wx0 + 0.05; x < wx1; x += 0.11) {
        box(B, 0.036, 0.50, 0.012, x, SBASE + 0.35, wz1 + 0.006, K.mixHex(pal.plasterBlue, pal.stoneDark, 0.42), { bucket: 'matte' });
      }
      for (let z = wz0 + 0.05; z < wz1; z += 0.11) {
        box(B, 0.012, 0.50, 0.036, wx0 - 0.006, SBASE + 0.35, z, K.mixHex(pal.plasterBlue, pal.stoneDark, 0.42), { bucket: 'matte' });
      }
      // corner pilasters + top band
      for (const [px, pz] of [[wx0, wz0], [wx1, wz0], [wx0, wz1], [wx1, wz1]]) {
        box(B, 0.075, 0.60, 0.075, px, SBASE + 0.35, pz, pal.craneTrim, { bucket: 'paint' });
      }
      box(B, W + 0.02, 0.05, D + 0.02, cx, SBASE + 0.665, cz, pal.craneTrim, { bucket: 'paint' });
      // sawtooth roof: 3 teeth
      const teeth = 3, tw = W / teeth;
      for (let i = 0; i < teeth; i++) {
        const x = wx0 + tw * (i + 0.5);
        // slope rising to the north
        box(B, tw - 0.02, 0.02, 0.58, x, SBASE + 0.79, wz1 - 0.27,
          K.mixHex(pal.roofSlate, pal.stoneDark, 0.25), { bucket: 'matte', rot: [0.5, 0, 0] });
        // vertical north-facing skylight
        box(B, tw - 0.03, 0.17, 0.02, x, SBASE + 0.93, wz1 - 0.545, 0x35494b, { bucket: 'glass' });
        box(B, tw - 0.03, 0.02, 0.025, x, SBASE + 0.845, wz1 - 0.552, pal.craneTrim, { bucket: 'paint' });
        box(B, tw - 0.03, 0.02, 0.025, x, SBASE + 1.015, wz1 - 0.552, pal.craneTrim, { bucket: 'paint' });
        // short flat roof to the back wall
        box(B, tw - 0.02, 0.018, 0.62, x, SBASE + 1.02, wz1 - 0.87,
          K.mixHex(pal.roofSlate, pal.stoneDark, 0.35), { bucket: 'matte' });
        // ridge cap / gutter
        box(B, 0.03, 0.025, D - 0.03, wx0 + tw * i + 0.015, SBASE + 1.03, cz - 0.03, 0x6f6a5e, { bucket: 'metal' });
      }
      // gable end caps
      for (const x of [wx0, wx1]) {
        box(B, 0.03, 0.38, D - 0.05, x, SBASE + 0.86, cz, K.mixHex(pal.plasterBlue, pal.stoneDark, 0.3), { bucket: 'matte' });
      }
      // roller doors on the south elevation
      const doorXs = [8.52, 8.80, 9.08];
      for (let di = 0; di < doorXs.length; di++) {
        const dx = doorXs[di];
        box(B, 0.36, 0.06, 0.07, dx, SBASE + 0.63, wz1 + 0.02, pal.craneTrim, { bucket: 'paint' });
        box(B, 0.34, 0.045, 0.09, dx, SBASE + 0.60, wz1 + 0.05, pal.craneTrim, { bucket: 'paint' });
        box(B, 0.31, 0.42, 0.02, dx, SBASE + 0.30, wz1 + 0.016, 0x8d887b, { bucket: 'paint' });
        for (let k = 0; k < 7; k++) {
          box(B, 0.30, 0.008, 0.008, dx, SBASE + 0.12 + k * 0.052, wz1 + 0.028, 0x6f6a5e, { bucket: 'metal' });
        }
        for (const sx of [-1, 1]) {
          box(B, 0.045, 0.44, 0.04, dx + sx * 0.19, SBASE + 0.30, wz1 + 0.02, 0x3f4a46, { bucket: 'paint' });
          hazardBand(B, 0.04, 0.16, 0.03, dx + sx * 0.19, SBASE + 0.12, wz1 + 0.045);
        }
        // small lit lamp over each outer door
        if (di !== 1) {
          box(B, 0.05, 0.024, 0.06, dx, SBASE + 0.62, wz1 + 0.075, pal.lampWarm, { bucket: 'lamp' });
          box(B, 0.03, 0.02, 0.02, dx, SBASE + 0.66, wz1 + 0.07, 0x3d3a33, { bucket: 'paint' });
        }
        winZ(dx, SBASE + 0.48, wz1 + 0.012, 0.22, 0.10, di === 1);
      }
      // personnel door + window
      box(B, 0.15, 0.40, 0.02, 9.22, SBASE + 0.27, wz1 + 0.016, 0x4a534d, { bucket: 'paint' });
      box(B, 0.09, 0.10, 0.012, 9.22, SBASE + 0.40, wz1 + 0.03, 0x33474a, { bucket: 'glass' });
      // high strip of windows on the west elevation
      for (let i = 0; i < 3; i++) winX(wx0 - 0.012, SBASE + 0.44, wz0 + 0.32 + i * 0.40, 0.24, 0.14, i === 1);
      // workshop sign
      K.sign({
        x: 8.80, y: SBASE + 0.60, z: wz1 + 0.055,
        w: 0.44, aspect: 3.6,
        bg: '#e6dcc6', fg: '#3c4a44', border: '#3c4a44',
        lines: [
          { text: 'WORKSHOP', size: 56, font: K.fonts.sans, weight: 700, color: '#3c4a44' },
          { text: '维修工场', size: 34, font: K.fonts.song, weight: 600, color: '#3c4a44' },
        ],
        night: true,
      });
      // roof vents, conduit, weather vane
      for (const x of [8.6, 9.5]) {
        cyl(B, 0.05, 0.16, x, SBASE + 1.09, wz1 - 0.9, 0x6f6a5e, { seg: 8, bucket: 'metal' });
        cyl(B, 0.065, 0.02, x, SBASE + 1.18, wz1 - 0.9, 0x3d3a33, { seg: 8, bucket: 'paint' });
      }
      box(B, 0.02, 0.02, D - 0.2, wx1 - 0.10, SBASE + 0.68, cz, 0x6f6a5e, { bucket: 'metal' });
      // downpipes
      downpipe(wx1 - 0.10, wz1 - 0.04, SBASE + 0.05, SBASE + 0.64);
      downpipe(wx0 + 0.10, wz1 - 0.04, SBASE + 0.05, SBASE + 0.64);
      // outside clutter (east side, under the lean-to)
      box(B, 0.16, 0.14, 0.14, 9.45, SBASE + 0.07, -8.72, 0x6a6558, { bucket: 'paint' });
      for (let i = 0; i < 3; i++) {
        cyl(B, 0.042, 0.075, 9.42 + (i % 2) * 0.10, SBASE + 0.045 + i * 0.02, -8.55, 0x4a3d30, { seg: 10, bucket: 'matte' });
        cyl(B, 0.05, 0.03, 9.42 + (i % 2) * 0.10, SBASE + 0.09 + i * 0.02, -8.55, 0x3a3026, { seg: 10, bucket: 'matte' });
      }
      box(B, 0.20, 0.045, 0.24, 9.44, SBASE + 0.024, -8.42, K.mixHex(pal.wood, pal.woodLight, 0.4), { bucket: 'matte' });
      for (let k = 0; k < 4; k++) cyl(B, 0.026, 0.10, 9.52, SBASE + 0.06 + k * 0.02, -8.85 + k * 0.045, 0x6b6155, { seg: 8, bucket: 'metal' });
      // rust streaks
      for (let i = 0; i < 8; i++) {
        box(B, 0.007, 0.05 + rndD() * 0.12, 0.02, wx0 + rndD() * W,
          SBASE + 0.08 + rndD() * 0.2, wz1 + 0.026, pal.rust, { bucket: 'matte' });
      }
    })();

    /* --------------------------------------- small lean-to / spares store */
    (function sparesShed() {
      const x0 = 9.34, x1 = 9.62, z0 = -8.98, z1 = -8.50;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      buildingCount++;
      box(B, x1 - x0, 0.04, z1 - z0, cx, SBASE + 0.02, cz, pal.concreteDark, { bucket: 'matte' });
      for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
        box(B, 0.04, 0.44, 0.04, px, SBASE + 0.22, pz, 0x6f6a5e, { bucket: 'paint' });
      }
      box(B, x1 - x0 + 0.08, 0.03, z1 - z0 + 0.08, cx, SBASE + 0.45, cz, K.mixHex(pal.roofGreen, pal.roofSlate, 0.4), { bucket: 'matte' });
      // back wall + side panels only (open front)
      box(B, x1 - x0, 0.40, 0.02, cx, SBASE + 0.24, z0 + 0.01, pal.plasterBlue, { bucket: 'matte' });
      for (const px of [x0, x1]) box(B, 0.02, 0.40, z1 - z0, px, SBASE + 0.24, cz, 0x8d887b, { bucket: 'matte' });
      // tire stacks & cable reels inside
      for (let i = 0; i < 4; i++) {
        cyl(B, 0.055, 0.028, 9.47, SBASE + 0.05 + i * 0.032, -8.88, 0x3a3630, { seg: 10, bucket: 'matte' });
      }
      cylX(B, 0.07, 0.05, 9.50, SBASE + 0.09, -8.66, 0x5a4a38, { seg: 10, bucket: 'matte' });
      box(B, 0.14, 0.10, 0.10, 9.48, SBASE + 0.07, -8.58, 0x6d6a5e, { bucket: 'paint' });
      box(B, 0.10, 0.06, 0.012, cx, SBASE + 0.40, z1 + 0.025, pal.paperDeep, { bucket: 'paint' });
    })();

    /* ------------------------------------------------------------ gatehouse */
    (function gatehouse() {
      const gx = 11.06, gz = -7.20;
      buildingCount++;
      box(B, 0.52, 0.06, 0.52, gx, SBASE + 0.03, gz, pal.stoneDark, { bucket: 'matte' });
      box(B, 0.44, 0.42, 0.44, gx, SBASE + 0.27, gz, pal.plasterPale, { bucket: 'matte' });
      box(B, 0.50, 0.03, 0.50, gx, SBASE + 0.50, gz, pal.craneTrim, { bucket: 'paint' });
      box(B, 0.54, 0.035, 0.54, gx, SBASE + 0.52, gz, K.mixHex(pal.roofSlate, pal.stoneDark, 0.2), { bucket: 'matte' });
      // guard windows on three faces
      winZ(gx - 0.12, SBASE + 0.30, gz + 0.225, 0.20, 0.20, true);
      winX(gx + 0.225, SBASE + 0.30, gz - 0.06, 0.18, 0.18, false);
      winZ(gx + 0.10, SBASE + 0.30, gz - 0.225, 0.16, 0.16, false);
      // door
      box(B, 0.12, 0.32, 0.02, gx + 0.12, SBASE + 0.20, gz + 0.228, 0x44514a, { bucket: 'paint' });
      // roof lamp + vent
      box(B, 0.05, 0.03, 0.05, gx - 0.14, SBASE + 0.56, gz + 0.16, pal.lampWarm, { bucket: 'lamp' });
      cyl(B, 0.02, 0.12, gx + 0.14, SBASE + 0.58, gz - 0.12, 0x6f6a5e, { seg: 6, bucket: 'metal' });
      // gateposts + animated boom barrier
      box(B, 0.09, 0.05, 0.09, 11.34, SBASE + 0.025, -6.98, pal.stoneDark, { bucket: 'matte' });
      cyl(B, 0.035, 0.95, 11.34, SBASE + 0.50, -6.98, 0x8f887a, { seg: 10, bucket: 'paint' });
      box(B, 0.11, 0.12, 0.11, 11.34, SBASE + 0.92, -6.98, 0x3d3a33, { bucket: 'paint' });
      box(B, 0.05, 0.05, 0.05, 11.34, SBASE + 1.02, -6.92, pal.lampWarm, { bucket: 'lamp' });
      const arm = new THREE.Group();
      arm.position.set(11.34, SBASE + 0.92, -6.98);
      const ab = new K.Batcher();
      box(ab, 0.055, 0.055, 0.14, 0, 0, -0.06, 0x3d3a33, { bucket: 'paint' });
      for (let i = 0; i < 7; i++) {
        box(ab, 0.045, 0.045, 0.105, 0, 0, 0.02 + i * 0.105,
          i % 2 ? 0x9d4b3f : pal.paperDeep, { bucket: 'paint' });
      }
      box(ab, 0.10, 0.10, 0.06, 0, -0.05, 0.02, 0x3d3a33, { bucket: 'paint' });
      ab.finish(arm);
      K.addObject(arm);
      const gateAnim = { arm, period: 34, phase: 0.12 };
      K.addTick(function gateTick(dt, time) {
        const p = ((time / gateAnim.period + gateAnim.phase) % 1 + 1) % 1;
        // closed -> open -> closed with long dwells
        let a = 0;
        if (p > 0.18 && p < 0.30) a = K.easeInOutCubic((p - 0.18) / 0.12);
        else if (p >= 0.30 && p < 0.72) a = 1;
        else if (p >= 0.72 && p < 0.84) a = 1 - K.easeInOutCubic((p - 0.72) / 0.12);
        gateAnim.arm.rotation.x = -a * 1.15;
      });
      K.sign({
        x: 11.20, y: SBASE + 0.455, z: gz + 0.232,
        w: 0.28, aspect: 2.6,
        bg: '#2f453f', fg: '#efe2c8',
        lines: [{ text: 'GATE 2', size: 64, font: K.fonts.sans, weight: 700, color: '#efe2c8' }],
        night: true,
      });
    })();

    /* ------------------------------------------------------ customs office */
    (function customs() {
      const cx = 8.66, cz = -7.36;
      const W = 0.70, D = 0.55;
      buildingCount++;
      box(B, W + 0.04, 0.05, D + 0.04, cx, SBASE + 0.025, cz, pal.stoneDark, { bucket: 'matte' });
      box(B, W, 0.44, D, cx, SBASE + 0.27, cz, pal.plasterWarm, { bucket: 'matte' });
      for (const [px, pz] of [[cx - W / 2, cz - D / 2], [cx + W / 2, cz - D / 2], [cx - W / 2, cz + D / 2], [cx + W / 2, cz + D / 2]]) {
        box(B, 0.045, 0.44, 0.045, px, SBASE + 0.27, pz, pal.plasterPale, { bucket: 'paint' });
      }
      box(B, W + 0.03, 0.035, D + 0.03, cx, SBASE + 0.50, cz, pal.craneTrim, { bucket: 'paint' });
      box(B, W + 0.08, 0.03, D + 0.08, cx, SBASE + 0.53, cz, K.mixHex(pal.roofSlate, pal.stoneDark, 0.25), { bucket: 'matte' });
      // windows + door on the south face
      winZ(cx - 0.20, SBASE + 0.30, cz + D / 2 + 0.005, 0.17, 0.17, true);
      winZ(cx - 0.01, SBASE + 0.30, cz + D / 2 + 0.005, 0.11, 0.17, false);
      box(B, 0.16, 0.34, 0.02, cx + 0.19, SBASE + 0.21, cz + D / 2 + 0.008, 0x4c5a52, { bucket: 'paint' });
      box(B, 0.20, 0.025, 0.12, cx + 0.19, SBASE + 0.38, cz + D / 2 + 0.06, pal.craneTrim, { bucket: 'paint' });
      box(B, 0.055, 0.03, 0.05, cx + 0.19, SBASE + 0.42, cz + D / 2 + 0.03, pal.lampWarm, { bucket: 'lamp' });
      // east elevation window
      winX(cx + W / 2 + 0.008, SBASE + 0.30, cz - 0.10, 0.15, 0.15, true);
      // AC unit + roof plant
      box(B, 0.16, 0.11, 0.09, cx - 0.18, SBASE + 0.38, cz - D / 2 - 0.06, 0x9b968a, { bucket: 'paint' });
      box(B, 0.18, 0.02, 0.10, cx - 0.18, SBASE + 0.44, cz - D / 2 - 0.06, 0x4a463e, { bucket: 'paint' });
      box(B, 0.14, 0.09, 0.12, cx + 0.14, SBASE + 0.58, cz - 0.08, 0x8d887b, { bucket: 'paint' });
      cyl(B, 0.014, 0.20, cx - 0.20, SBASE + 0.62, cz + 0.12, 0x6f6a5e, { seg: 5, bucket: 'metal' });
      for (const k of [-0.26, 0.26]) box(B, 0.03, 0.02, 0.03, cx + k, SBASE + 0.585, cz + 0.18, pal.lampWarm, { bucket: 'lamp' });
      downpipe(cx + W / 2 - 0.03, cz + D / 2 - 0.03, SBASE + 0.05, SBASE + 0.5);
      for (const k of [-1, 1]) bollard(cx + k * 0.36, cz + D / 2 + 0.12);
      K.sign({
        x: cx - 0.04, y: SBASE + 0.465, z: cz + D / 2 + 0.012,
        w: 0.26, aspect: 2.6,
        bg: '#e7dcc4', fg: '#3b4a43', border: '#3b4a43',
        lines: [{ text: 'CUSTOMS 海关', size: 44, font: K.fonts.song, weight: 600, color: '#3b4a43' }],
        night: true,
      });
      // parked terminal tractor with two boxes, waiting in the forecourt
      tractorGeometry(offsetBatch(B, 9.55, 1.108, -6.55), 0x3f5f5c);
      addStaticContainer(9.25, 1.433, -6.55, K.vary(0x7e937f, rndD, { l: 0.04 }));
      addStaticContainer(8.62, 1.433, -6.55, K.vary(0xbb9f63, rndD, { l: 0.04 }));
    })();

    /* ---------------------------------------------------------- fuel farm */
    (function fuelFarm() {
      const cx = 10.35, cz = -7.00;
      buildingCount++;
      // bund
      box(B, 0.94, 0.02, 0.66, cx, SBASE + 0.01, cz, pal.concreteDark, { bucket: 'matte' });
      for (const [w, d, x, z] of [[0.94, 0.05, cx, cz - 0.33], [0.94, 0.05, cx, cz + 0.33],
        [0.05, 0.66, cx - 0.47, cz], [0.05, 0.66, cx + 0.47, cz]]) {
        box(B, w, 0.22, d, x, SBASE + 0.12, z, pal.concrete, { bucket: 'matte' });
        box(B, w + 0.03, 0.03, d + 0.03, x, SBASE + 0.235, z, pal.craneTrim, { bucket: 'paint' });
      }
      // vertical tank
      cyl(B, 0.22, 0.40, cx - 0.12, SBASE + 0.34, cz - 0.04, pal.paperDeep, { seg: 16, bucket: 'paint' });
      sph(B, 0.22, cx - 0.12, SBASE + 0.55, cz - 0.04, pal.paperDeep, { bucket: 'paint', ws: 12, hs: 6 });
      K.torus(0.223, 0.008, cx - 0.12, SBASE + 0.42, cz - 0.04, 0xb8935a, { bucket: 'metal', rot: [Math.PI / 2, 0, 0] });
      K.torus(0.223, 0.008, cx - 0.12, SBASE + 0.24, cz - 0.04, 0x6f6a5e, { bucket: 'metal', rot: [Math.PI / 2, 0, 0] });
      for (const a of [0.4, 2.5, 4.6]) {
        cyl(B, 0.012, 0.16, cx - 0.12 + Math.cos(a) * 0.15, SBASE + 0.14, cz - 0.04 + Math.sin(a) * 0.15,
          0x5d594f, { seg: 5, bucket: 'metal' });
      }
      ladderRun(cx + 0.10, cz - 0.04, SBASE + 0.08, SBASE + 0.55, 0x6f6a5e, { along: 'z' });
      cyl(B, 0.012, 0.10, cx - 0.12, SBASE + 0.65, cz - 0.04, 0x5d594f, { seg: 5, bucket: 'metal' });
      // horizontal tank
      cylX(B, 0.095, 0.34, cx + 0.24, SBASE + 0.19, cz + 0.10, K.mixHex(pal.plasterBlue, pal.concrete, 0.4), { seg: 12, bucket: 'paint' });
      cylX(B, 0.02, 0.36, cx + 0.24, SBASE + 0.19, cz + 0.10, 0x9d988a, { seg: 8, bucket: 'metal' });
      for (const s of [-1, 1]) box(B, 0.05, 0.14, 0.16, cx + 0.24 + s * 0.10, SBASE + 0.07, cz + 0.10, pal.concreteDark, { bucket: 'matte' });
      // pump cabinet + pipework
      box(B, 0.14, 0.22, 0.12, cx + 0.36, SBASE + 0.16, cz - 0.18, 0x8d887b, { bucket: 'paint' });
      box(B, 0.15, 0.02, 0.13, cx + 0.36, SBASE + 0.275, cz - 0.18, 0x3d3a33, { bucket: 'paint' });
      strut(B, [cx - 0.12, SBASE + 0.30, cz - 0.04], [cx + 0.24, SBASE + 0.30, cz + 0.10], 0.016, 0x8a8475, { seg: 6, bucket: 'metal' });
      strut(B, [cx + 0.24, SBASE + 0.30, cz + 0.10], [cx + 0.36, SBASE + 0.26, cz - 0.12], 0.014, 0x8a8475, { seg: 6, bucket: 'metal' });
      K.torus(0.035, 0.006, cx + 0.05, SBASE + 0.30, cz + 0.015, 0x9d4b3f, { bucket: 'metal', rot: [0, 0, 0.4] });
      // hazard plate + drip tray
      box(B, 0.16, 0.10, 0.01, cx - 0.20, SBASE + 0.13, cz + 0.34, pal.lineYellow, { bucket: 'paint' });
      box(B, 0.10, 0.06, 0.012, cx - 0.20, SBASE + 0.13, cz + 0.345, 0x3a352c, { bucket: 'paint' });
      box(B, 0.20, 0.01, 0.14, cx + 0.15, SBASE + 0.015, cz - 0.22, 0x55514a, { bucket: 'matte' });
      // foam extinguisher
      cyl(B, 0.022, 0.10, cx - 0.42, SBASE + 0.06, cz + 0.22, 0x8d3f31, { seg: 8, bucket: 'paint' });
    })();

    /* ----------------------------------------------------------- substation */
    (function substation() {
      const cx = 9.38, cz = -7.42;
      buildingCount++;
      box(B, 0.72, 0.012, 0.60, cx, SBASE + 0.006, cz, 0xb3a992, { bucket: 'matte' });
      // fence
      for (let i = 0; i <= 6; i++) {
        const x = cx - 0.34 + (i / 6) * 0.68;
        for (const z of [cz - 0.28, cz + 0.28]) cyl(B, 0.008, 0.22, x, SBASE + 0.11, z, 0x8d887b, { seg: 5, bucket: 'metal' });
      }
      for (let i = 0; i <= 3; i++) {
        const z = cz - 0.28 + (i / 3) * 0.56;
        cyl(B, 0.008, 0.22, cx - 0.34, SBASE + 0.11, z, 0x8d887b, { seg: 5, bucket: 'metal' });
        cyl(B, 0.008, 0.22, cx + 0.34, SBASE + 0.11, z, 0x8d887b, { seg: 5, bucket: 'metal' });
      }
      for (const y of [SBASE + 0.08, SBASE + 0.15, SBASE + 0.22]) {
        strut(B, [cx - 0.34, y, cz - 0.28], [cx - 0.34, y, cz + 0.28], 0.003, 0x8d887b, { seg: 4, bucket: 'metal' });
        strut(B, [cx + 0.34, y, cz - 0.28], [cx + 0.34, y, cz + 0.28], 0.003, 0x8d887b, { seg: 4, bucket: 'metal' });
        strut(B, [cx - 0.34, y, cz - 0.28], [cx + 0.34, y, cz - 0.28], 0.003, 0x8d887b, { seg: 4, bucket: 'metal' });
        strut(B, [cx - 0.34, y, cz + 0.28], [cx + 0.34, y, cz + 0.28], 0.003, 0x8d887b, { seg: 4, bucket: 'metal' });
      }
      // two transformer bays
      for (const [ox, oz] of [[-0.15, -0.05], [0.14, 0.07]]) {
        const x = cx + ox, z = cz + oz;
        box(B, 0.24, 0.035, 0.20, x, SBASE + 0.018, z, pal.concreteDark, { bucket: 'matte' });
        box(B, 0.20, 0.20, 0.15, x, SBASE + 0.135, z, 0x6b6a60, { bucket: 'paint' });
        for (let k = 0; k < 5; k++) {
          box(B, 0.008, 0.16, 0.13, x - 0.11 + k * 0.055, SBASE + 0.13, z, 0x55534b, { bucket: 'metal' });
        }
        for (const s of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            cyl(B, 0.011, 0.05, x, SBASE + 0.26, z + s * 0.045 + (k - 1) * 0.038, 0xd7ccb4, { seg: 6, bucket: 'paint' });
            cyl(B, 0.016, 0.008, x, SBASE + 0.285, z + s * 0.045 + (k - 1) * 0.038, 0x8d887b, { seg: 6, bucket: 'metal' });
          }
        }
        box(B, 0.03, 0.06, 0.02, x + 0.13, SBASE + 0.10, z + 0.02, pal.lineYellow, { bucket: 'paint' });
      }
      // control cabinet + pole + cables
      box(B, 0.13, 0.22, 0.09, cx + 0.28, SBASE + 0.11, cz - 0.18, 0x8d887b, { bucket: 'paint' });
      box(B, 0.14, 0.02, 0.10, cx + 0.28, SBASE + 0.23, cz - 0.18, 0x3d3a33, { bucket: 'paint' });
      cyl(B, 0.012, 0.45, cx + 0.32, SBASE + 0.225, cz + 0.24, 0x6f6a5e, { seg: 5, bucket: 'metal' });
      K.rope([cx - 0.15, SBASE + 0.27, cz - 0.05], [cx + 0.32, SBASE + 0.42, cz + 0.24], 0.02, 0.004, 0x2c2822, { segments: 6 });
      K.rope([cx + 0.14, SBASE + 0.27, cz + 0.07], [cx + 0.32, SBASE + 0.42, cz + 0.24], 0.02, 0.004, 0x2c2822, { segments: 6 });
    })();

    /* ------------------------------------------------------- fire water tank */
    (function fireTank() {
      const x = 9.30, z = -8.05;
      buildingCount++;
      disc(B, 0.34, x, SBASE + 0.008, z, pal.concreteDark, { seg: 20, bucket: 'matte' });
      for (const a of [0.7, 2.3, 4.4]) {
        cyl(B, 0.018, 0.12, x + Math.cos(a) * 0.20, SBASE + 0.06, z + Math.sin(a) * 0.20, 0x6f6a5e, { seg: 5, bucket: 'metal' });
      }
      cyl(B, 0.27, 0.66, x, SBASE + 0.45, z, K.mixHex(0xa5644e, pal.rust, 0.35), { seg: 20, bucket: 'paint' });
      K.torus(0.273, 0.012, x, SBASE + 0.30, z, 0xd9cdb3, { bucket: 'paint', rot: [Math.PI / 2, 0, 0] });
      K.torus(0.273, 0.012, x, SBASE + 0.60, z, 0xd9cdb3, { bucket: 'paint', rot: [Math.PI / 2, 0, 0] });
      cyl(B, 0.26, 0.05, x, SBASE + 0.80, z, K.mixHex(0xa5644e, pal.rust, 0.35), { seg: 20, bucket: 'paint' });
      cyl(B, 0.10, 0.05, x, SBASE + 0.845, z, 0x6f6a5e, { seg: 12, bucket: 'metal' });
      // ladder + hoops
      ladderRun(x + 0.28, z, SBASE + 0.10, SBASE + 0.80, 0x6f6a5e, { along: 'z', hoops: true });
      // foam pipework
      strut(B, [x - 0.24, SBASE + 0.35, z - 0.12], [x - 0.34, SBASE + 0.10, z - 0.28], 0.02, 0x8a8475, { seg: 6, bucket: 'metal' });
      K.torus(0.045, 0.008, x - 0.33, SBASE + 0.17, z - 0.27, 0x9d4b3f, { bucket: 'metal', rot: [0.5, 0, 0] });
      box(B, 0.20, 0.09, 0.012, x, SBASE + 0.50, z + 0.278, pal.paperDeep, { bucket: 'paint' });
      box(B, 0.02, 0.02, 0.02, x - 0.26, SBASE + 0.33, z - 0.18, pal.lineYellow, { bucket: 'paint' });
    })();

    /* ------------------------------------------------------ reefer plug rack */
    (function reeferRack() {
      const cx = 8.62, cz = -8.16;
      buildingCount++;
      for (const [px, pz] of [[8.26, -8.32], [8.98, -8.32], [8.26, -8.00], [8.98, -8.00]]) {
        box(B, 0.035, 0.62, 0.035, px, SBASE + 0.31, pz, 0x6f6a5e, { bucket: 'metal' });
      }
      for (const y of [SBASE + 0.03, SBASE + 0.30, SBASE + 0.58]) {
        box(B, 0.80, 0.035, 0.06, cx, y, -8.32, 0x6f6a5e, { bucket: 'metal' });
        box(B, 0.80, 0.035, 0.06, cx, y, -8.00, 0x6f6a5e, { bucket: 'metal' });
      }
      // plug cabinet + cable trays
      box(B, 0.10, 0.24, 0.08, 8.94, SBASE + 0.18, -8.16, 0x8d887b, { bucket: 'paint' });
      for (let k = 0; k < 4; k++) {
        box(B, 0.02, 0.03, 0.012, 8.89, SBASE + 0.10 + k * 0.045, -8.12, 0x3d3a33, { bucket: 'paint' });
      }
      cyl(B, 0.014, 0.55, 8.34, SBASE + 0.30, -8.36, 0x6f6a5e, { seg: 5, bucket: 'metal' });
      // two white reefers (instanced) + gensets
      addStaticContainer(cx, SBASE + 0.132, cz, K.vary(WHITE_REEFER, rndD, { l: 0.02 }), 0);
      addStaticContainer(cx, SBASE + 0.392, cz, K.vary(WHITE_REEFER, rndD, { l: 0.02 }), 0);
      for (const y of [SBASE + 0.132, SBASE + 0.392]) {
        box(B, 0.075, 0.14, 0.17, cx - C_LEN / 2 - 0.04, y, cz, 0x6d6b62, { bucket: 'paint' });
        box(B, 0.012, 0.09, 0.12, cx - C_LEN / 2 - 0.079, y, cz, 0x413f39, { bucket: 'metal' });
      }
      K.rope([cx - C_LEN / 2 - 0.08, SBASE + 0.13, cz + 0.06], [9.02, SBASE + 0.12, -8.14], 0.03, 0.004, 0x2c2822, { segments: 8 });
      // drip tray + hazard
      box(B, 0.74, 0.012, 0.46, cx, SBASE + 0.012, cz, 0x8a8475, { bucket: 'matte' });
      box(B, 0.14, 0.10, 0.01, 8.98, SBASE + 0.38, -8.42, pal.lineYellow, { bucket: 'paint' });
    })();

    /* -------------------------------------------------- support floodlights */
    function floodMast(x, z, h, heads) {
      cyl(B, 0.045, h, x, SBASE + h / 2, z, 0x7a7465, { seg: 100 / 10, bucket: 'paint' });
      cyl(B, 0.09, 0.10, x, SBASE + 0.05, z, pal.concreteDark, { seg: 10, bucket: 'matte' });
      box(B, 0.10, 0.16, 0.08, x + 0.13, SBASE + 0.10, z + 0.10, 0x8d887b, { bucket: 'paint' });
      for (let i = 0; i < heads; i++) {
        const a = (i / heads) * TAU + 0.7;
        const hx = x + Math.cos(a) * 0.10, hz = z + Math.sin(a) * 0.10;
        box(B, 0.09, 0.06, 0.09, hx, SBASE + h + 0.03, hz, 0x3d3a33, { bucket: 'paint' });
        box(B, 0.065, 0.045, 0.012, hx, SBASE + h + 0.025, hz + 0.05, pal.lampWarm, { bucket: 'lamp', rot: [0, -a + Math.PI / 2, 0] });
      }
      cyl(B, 0.02, 0.20, x, SBASE + h + 0.14, z, 0x6f6a5e, { seg: 6, bucket: 'metal' });
      sph(B, 0.018, x, SBASE + h + 0.25, z, pal.lampWarm, { bucket: 'lamp', ws: 6, hs: 4 });
      // climbing rungs
      for (let i = 0; i < 7; i++) {
        box(B, 0.10, 0.008, 0.008, x + 0.05, SBASE + 0.30 + i * 0.24, z, 0x6f6a5e, { bucket: 'metal' });
      }
    }
    floodMast(8.22, -8.98, 2.05, 4);
    floodMast(10.62, -6.30, 2.0, 3);
    floodMast(-8.05, -4.62, 2.25, 4);
    floodMast(12.28, -4.62, 2.25, 4);

    /* ------------------------------------------------------- CCTV + fences */
    function cctvPole(x, z, h) {
      cyl(B, 0.028, h, x, DECK + h / 2, z, 0x7a7465, { seg: 8, bucket: 'paint' });
      cyl(B, 0.06, 0.06, x, DECK + 0.03, z, pal.concreteDark, { seg: 8, bucket: 'matte' });
      box(B, 0.07, 0.10, 0.06, x, DECK + h + 0.02, z, 0x3d3a33, { bucket: 'paint' });
      box(B, 0.05, 0.045, 0.09, x, DECK + h + 0.02, z + 0.06, 0x55514a, { bucket: 'metal' });
      sph(B, 0.012, x, DECK + h + 0.02, z + 0.11, 0x33474a, { bucket: 'glass', ws: 6, hs: 4 });
    }
    cctvPole(11.44, -6.16, 0.52);
    cctvPole(-8.42, -4.70, 0.52);

    function fenceRun(ax, az, bx, bz, h, gapEvery) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 0.46));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        cyl(B, 0.014, h, x, SBASE + h / 2, z, 0x777165, { seg: 5, bucket: 'metal' });
        if (gapEvery && i % gapEvery === 0) box(B, 0.03, 0.03, 0.03, x, SBASE + h, z, 0x5e584d, { bucket: 'metal' });
      }
      for (const y of [0.35, 0.68, 0.98]) {
        if (h * y > h) continue;
        strut(B, [ax, SBASE + h * y, az], [bx, SBASE + h * y, bz], 0.003, 0x8d887b, { seg: 4, bucket: 'metal' });
      }
    }
    // yard / support boundary, with a sliding gate left open
    fenceRun(8.15, -9.86, 8.15, -6.70, 0.25, 0);
    fenceRun(8.15, -6.22, 8.15, -6.12, 0.25, 0);
    box(B, 0.035, 0.30, 0.035, 8.15, SBASE + 0.15, -6.70, 0x777165, { bucket: 'metal' });
    box(B, 0.035, 0.30, 0.035, 8.15, SBASE + 0.15, -6.22, 0x777165, { bucket: 'metal' });
    // sliding gate leaf parked open along the fence
    box(B, 0.028, 0.24, 0.44, 8.15, SBASE + 0.14, -6.50, 0x777165, { bucket: 'metal' });
    for (let i = 0; i < 4; i++) {
      box(B, 0.02, 0.016, 0.42, 8.15, SBASE + 0.05 + i * 0.065, -6.50, 0x8d887b, { bucket: 'metal' });
    }
    // (the east boundary is the new quay wall above)
    // signage posts for the gate
    box(B, 0.03, 0.55, 0.03, 11.52, SBASE + 0.275, -6.72, 0x777165, { bucket: 'metal' });
    box(B, 0.22, 0.10, 0.012, 11.52, SBASE + 0.52, -6.70, pal.paper, { bucket: 'paint' });
    box(B, 0.16, 0.012, 0.014, 11.52, SBASE + 0.52, -6.692, pal.inkSoft, { bucket: 'paint' });

    /* =====================================================================
     * 8. RAIL SPUR — loaded flats, buffer stops, signals, shunting loco
     * ================================================================== */
    const RAIL_Z = L.rail.track.z;      // -10.35
    const RAIL_LEVEL = 1.2405;          // main-line rail head built by terrain
    const RW = 0.045;                   // wagon wheel radius

    function flatWagon(x, load) {
      const y0 = RAIL_LEVEL + RW;       // axle height
      // bogies
      for (const bx of [-0.42, 0.42]) {
        box(B, 0.22, 0.055, 0.20, x + bx, y0 + 0.03, RAIL_Z, 0x46423a, { bucket: 'paint' });
        for (const ax of [-0.07, 0.07]) {
          for (const sz of [-1, 1]) {
            cylZ(B, RW, 0.028, x + bx + ax, y0, RAIL_Z + sz * 0.135, 0x3a3731, { seg: 10, bucket: 'metal' });
            cylZ(B, 0.02, 0.032, x + bx + ax, y0, RAIL_Z + sz * 0.135, 0x8b8475, { seg: 6, bucket: 'metal' });
          }
          cylZ(B, 0.012, 0.28, x + bx + ax, y0, RAIL_Z, 0x6f6a5e, { seg: 5, bucket: 'metal' });
        }
        box(B, 0.05, 0.06, 0.16, x + bx, y0 + 0.07, RAIL_Z, 0x46423a, { bucket: 'paint' });
      }
      // deck + sills + end platforms
      const deckTop = RAIL_LEVEL + 0.15;
      box(B, 1.24, 0.05, 0.235, x, deckTop - 0.025, RAIL_Z, 0x6e695c, { bucket: 'paint' });
      for (const sz of [-1, 1]) {
        box(B, 1.24, 0.045, 0.025, x, deckTop - 0.02, RAIL_Z + sz * 0.118, 0x55514a, { bucket: 'paint' });
        // stake pockets / lashing rings
        for (let i = 0; i < 6; i++) {
          box(B, 0.04, 0.06, 0.012, x - 0.55 + i * 0.22, deckTop - 0.02, RAIL_Z + sz * 0.132, 0x3d3a33, { bucket: 'metal' });
        }
      }
      for (const sx of [-1, 1]) {
        box(B, 0.055, 0.10, 0.20, x + sx * 0.63, deckTop - 0.01, RAIL_Z, 0x55514a, { bucket: 'paint' });
        // coupler + buffers
        box(B, 0.05, 0.045, 0.05, x + sx * 0.685, deckTop - 0.075, RAIL_Z, 0x3a3731, { bucket: 'metal' });
        for (const sz of [-1, 1]) {
          cylX(B, 0.027, 0.045, x + sx * 0.66, deckTop - 0.02, RAIL_Z + sz * 0.075, 0x55514a, { seg: 8, bucket: 'metal' });
        }
        // steps
        box(B, 0.04, 0.02, 0.10, x + sx * 0.60, deckTop - 0.12, RAIL_Z + 0.14, 0x55514a, { bucket: 'paint' });
      }
      // handbrake wheel + brake rods
      cylZ(B, 0.045, 0.012, x - 0.52, deckTop + 0.02, RAIL_Z + 0.145, 0x8d4b3f, { seg: 12, bucket: 'metal' });
      strut(B, [x - 0.52, deckTop + 0.02, RAIL_Z + 0.145], [x - 0.58, deckTop - 0.06, RAIL_Z + 0.10], 0.008, 0x55514a, { seg: 4, bucket: 'metal' });
      box(B, 0.10, 0.05, 0.03, x + 0.45, deckTop - 0.06, RAIL_Z + 0.14, 0x6f6a5e, { bucket: 'metal' });
      // container twistlocks
      for (const cx2 of [-0.31, 0.31]) {
        for (const sz of [-1, 1]) {
          box(B, 0.03, 0.03, 0.03, x + cx2, deckTop + 0.015, RAIL_Z + sz * 0.10, 0x4a453b, { bucket: 'metal' });
        }
      }
      if (load) {
        const c1 = containerTint(rndD), c2 = containerTint(rndD);
        addStaticContainer(x - 0.305, deckTop + 0.13, RAIL_Z, c1);
        addStaticContainer(x + 0.305, deckTop + 0.13, RAIL_Z, c2);
      } else {
        // empty flat with a couple of timber dunnage baulks
        box(B, 1.0, 0.03, 0.08, x, deckTop + 0.015, RAIL_Z - 0.05, K.mixHex(pal.wood, pal.woodLight, 0.35), { bucket: 'matte' });
        box(B, 1.0, 0.03, 0.08, x, deckTop + 0.015, RAIL_Z + 0.05, K.mixHex(pal.wood, pal.woodLight, 0.35), { bucket: 'matte' });
      }
    }

    // rake of five flats on the main track
    const WAGON_X = [-7.62, -6.33, -5.04, -3.75, -2.46];
    for (let i = 0; i < WAGON_X.length; i++) flatWagon(WAGON_X[i], i !== 3);

    // ---- shunting locomotive ----------------------------------------------
    const loco = (function () {
      const group = new THREE.Group();
      const x0 = 4.85, x1 = 7.35;
      group.position.set((x0 + x1) / 2, DECK + 0.1205, RAIL_Z);
      const bodyC = K.vary(pal.hullRed, rndD, { l: 0.03, s: 0.04 });
      const trim = K.vary(pal.craneTrim, rndD, { l: 0.02 });
      const dark = 0x3a3731;
      const sb = new K.Batcher();
      const wy = RAIL_LEVEL + RW - DECK; // wheel centre local y (0.065)
      // frame + buffer beams
      box(sb, 0.62, 0.035, 0.20, 0, 0.145, 0, dark, { bucket: 'paint' });
      for (const sx of [-1, 1]) {
        box(sb, 0.035, 0.09, 0.22, sx * 0.315, 0.135, 0, 0x46423a, { bucket: 'paint' });
        for (const sz of [-1, 1]) {
          cylX(sb, 0.028, 0.035, sx * 0.345, 0.12, sz * 0.075, 0x6f6a5e, { seg: 8, bucket: 'metal' });
        }
        box(sb, 0.045, 0.04, 0.045, sx * 0.365, 0.11, 0, 0x3a3731, { bucket: 'metal' });
        // pilot / snowplough
        box(sb, 0.06, 0.02, 0.20, sx * 0.30, 0.055, 0, 0x46423a, { bucket: 'paint', rot: [0, 0, sx * 0.4] });
      }
      // bogies
      for (const bx of [-0.16, 0.16]) {
        box(sb, 0.16, 0.045, 0.17, bx, wy + 0.04, 0, 0x46423a, { bucket: 'paint' });
        for (const ax of [-0.055, 0.055]) {
          for (const sz of [-1, 1]) {
            cylZ(sb, RW, 0.026, bx + ax, wy, sz * 0.135, 0x3a3731, { seg: 10, bucket: 'metal' });
            cylZ(sb, 0.018, 0.03, bx + ax, wy, sz * 0.135, 0x8b8475, { seg: 6, bucket: 'metal' });
          }
          cylZ(sb, 0.011, 0.26, bx + ax, wy, 0, 0x6f6a5e, { seg: 5, bucket: 'metal' });
        }
        box(sb, 0.10, 0.05, 0.16, bx, wy + 0.08, 0, 0x55514a, { bucket: 'paint' });
      }
      // long hood
      box(sb, 0.30, 0.16, 0.175, -0.12, 0.315, 0, bodyC, { bucket: 'paint' });
      box(sb, 0.31, 0.025, 0.185, -0.12, 0.40, 0, trim, { bucket: 'paint' });
      for (let i = 0; i < 5; i++) {
        box(sb, 0.03, 0.09, 0.015, -0.24 + i * 0.055, 0.31, 0.086, 0x4a4036, { bucket: 'paint' });
        box(sb, 0.03, 0.09, 0.015, -0.24 + i * 0.055, 0.31, -0.086, 0x4a4036, { bucket: 'paint' });
      }
      // cab
      const cabX = 0.18;
      box(sb, 0.17, 0.24, 0.205, cabX, 0.34, 0, bodyC, { bucket: 'paint' });
      box(sb, 0.19, 0.03, 0.225, cabX, 0.475, 0, trim, { bucket: 'paint' });
      box(sb, 0.15, 0.03, 0.225, cabX, 0.19, 0, trim, { bucket: 'paint' });
      box(sb, 0.012, 0.13, 0.16, cabX + 0.086, 0.375, 0, 0x33474a, { bucket: 'glass' });
      box(sb, 0.13, 0.13, 0.012, cabX, 0.375, 0.104, 0x33474a, { bucket: 'glass' });
      box(sb, 0.13, 0.13, 0.012, cabX, 0.375, -0.104, 0x33474a, { bucket: 'glass' });
      for (const sz of [-1, 1]) box(sb, 0.014, 0.16, 0.014, cabX + 0.075, 0.375, sz * 0.10, trim, { bucket: 'paint' });
      // chimney + exhaust
      cyl(sb, 0.022, 0.10, -0.02, 0.44, 0, 0x33302b, { seg: 8, bucket: 'metal' });
      cyl(sb, 0.032, 0.018, -0.02, 0.495, 0, 0x2a2723, { seg: 8, bucket: 'paint' });
      box(sb, 0.02, 0.06, 0.02, -0.02, 0.42, 0.10, 0x33302b, { bucket: 'metal' });
      // air filters, bell, horn, handrails
      for (const sz of [-1, 1]) {
        cylX(sb, 0.025, 0.10, -0.16, 0.33, sz * 0.105, 0x6f6a5e, { seg: 8, bucket: 'metal' });
      }
      box(sb, 0.035, 0.03, 0.035, 0.08, 0.50, 0.05, 0xb9935a, { bucket: 'metal' });
      cylX(sb, 0.012, 0.06, 0.09, 0.50, -0.04, 0x6f6a5e, { seg: 6, bucket: 'metal' });
      for (const sz of [-1, 1]) {
        strut(sb, [-0.28, 0.42, sz * 0.10], [0.10, 0.42, sz * 0.10], 0.005, 0x8d887b, { seg: 4, bucket: 'metal' });
        for (const px of [-0.26, -0.12, 0.02]) {
          strut(sb, [px, 0.34, sz * 0.10], [px, 0.42, sz * 0.10], 0.004, 0x8d887b, { seg: 4, bucket: 'metal' });
        }
      }
      // fuel tank under the frame + steps
      box(sb, 0.20, 0.075, 0.15, 0.0, 0.10, 0, 0x55514a, { bucket: 'paint' });
      for (const sx of [-1, 1]) {
        box(sb, 0.04, 0.02, 0.07, sx * 0.25, 0.09, 0.14, 0x55514a, { bucket: 'paint' });
        box(sb, 0.04, 0.02, 0.07, sx * 0.25, 0.13, 0.14, 0x55514a, { bucket: 'paint' });
      }
      // headlights, marker lamps, beacon
      for (const sx of [-1, 1]) {
        box(sb, 0.016, 0.035, 0.045, sx * 0.30, 0.36, 0, pal.lampWarm, { bucket: 'lamp' });
      }
      box(sb, 0.05, 0.035, 0.05, cabX, 0.505, 0, pal.lampWarm, { bucket: 'lamp' });
      box(sb, 0.06, 0.02, 0.06, cabX, 0.49, 0, 0x33302b, { bucket: 'paint' });
      // number plate + warning stripes on the pilots
      box(sb, 0.11, 0.035, 0.008, 0.0, 0.30, 0.087, pal.paperDeep, { bucket: 'paint' });
      box(sb, 0.08, 0.012, 0.009, 0.0, 0.30, 0.093, pal.inkSoft, { bucket: 'paint' });
      for (let i = 0; i < 3; i++) {
        box(sb, 0.02, 0.022, 0.006, -0.22 + i * 0.025, 0.115, 0.104, i % 2 ? 0x2f2c27 : pal.lineYellow, { bucket: 'paint' });
      }
      sb.finish(group);
      K.addObject(group);
      K.anchor('locoStack', { pos: [6.1 - 0.02, DECK + 0.6305, RAIL_Z] });
      return { group, x0, x1, period: 30, phase: 0.05 };
    })();
    function updateLoco(a, t) {
      const sh = shuttle(t, a.period, 0.24);
      const s = (sh.s + 1) / 2;
      const x = a.x0 + (a.x1 - a.x0) * s;
      a.group.position.x = x;
      const anc = P.anchors && P.anchors.locoStack;
      if (anc && anc.pos) { anc.pos[0] = x - 0.02; anc.pos[1] = DECK + 0.6305; anc.pos[2] = RAIL_Z; }
    }
    updateLoco(loco, 0);
    K.addTick(function locoTick(dt, time) { updateLoco(loco, time); });

    // buffer stops at both ends of the spur
    function bufferStop(x, dir) {
      box(B, 0.24, 0.06, 0.42, x, 1.125, RAIL_Z, pal.concreteDark, { bucket: 'matte' });
      for (const sz of [-1, 1]) {
        bar(B, [x, 1.155, RAIL_Z + sz * 0.13], [x - dir * 0.10, 1.40, RAIL_Z + sz * 0.13], 0.05, 0x55514a, { bucket: 'paint' });
      }
      box(B, 0.07, 0.10, 0.36, x - dir * 0.10, 1.38, RAIL_Z, 0x6f6a5e, { bucket: 'metal' });
      for (let i = 0; i < 4; i++) {
        box(B, 0.075, 0.095, 0.08, x - dir * 0.10, 1.38, RAIL_Z - 0.13 + i * 0.087,
          i % 2 ? 0x8d4b3f : pal.paperDeep, { bucket: 'paint' });
      }
      box(B, 0.04, 0.22, 0.04, x - dir * 0.20, 1.21, RAIL_Z + 0.16, 0x55514a, { bucket: 'paint' });
      sph(B, 0.03, x - dir * 0.20, 1.34, RAIL_Z + 0.16, 0x8d4b3f, { bucket: 'paint', ws: 8, hs: 5 });
    }
    // (buffer stops are built by terrain at the land-clipped track ends)

    // signals + rail furniture
    function signal(x, z) {
      box(B, 0.10, 0.06, 0.10, x, 1.135, z, pal.concreteDark, { bucket: 'matte' });
      cyl(B, 0.018, 0.62, x, 1.445, z, 0x6f6a5e, { seg: 8, bucket: 'metal' });
      box(B, 0.10, 0.24, 0.075, x, 1.805, z, 0x33302b, { bucket: 'paint' });
      // three aspects
      for (let i = 0; i < 3; i++) {
        const yy = 1.725 + i * 0.065;
        box(B, 0.06, 0.05, 0.012, x, yy, z + 0.043, 0x2a2723, { bucket: 'paint' });
        sph(B, 0.018, x, yy, z + 0.052, i === 0 ? pal.lampWarm : (i === 1 ? 0x8c7a3a : 0x3a6a52),
          { bucket: i === 0 ? 'lamp' : 'paint', ws: 8, hs: 5 });
        // hood
        box(B, 0.075, 0.01, 0.03, x, yy + 0.03, z + 0.058, 0x2a2723, { bucket: 'paint' });
      }
      cyl(B, 0.012, 0.16, x, 1.985, z, 0x6f6a5e, { seg: 5, bucket: 'metal' });
      box(B, 0.11, 0.16, 0.09, x + 0.16, 1.205, z + 0.05, 0x8d887b, { bucket: 'paint' });
      ladderRun(x - 0.09, z, 1.205, 1.765, 0x6f6a5e, { along: 'z' });
    }
    // (signals are built by terrain on the clipped spur)

    // concrete cable troughs + junction boxes
    for (const tz of [RAIL_Z + 0.40, RAIL_Z - 0.78]) {
      for (let x = -8.0; x < 7.45; x += 0.52) {
        box(B, 0.46, 0.06, 0.08, x + 0.23, 1.168, tz, 0x9d9789, { bucket: 'matte' });
        box(B, 0.47, 0.012, 0.09, x + 0.23, 1.202, tz, 0x878173, { bucket: 'matte' });
      }
      for (let x = -7.6; x < 7.3; x += 2.5) {
        box(B, 0.12, 0.12, 0.12, x, 1.222, tz, 0x8d887b, { bucket: 'paint' });
        box(B, 0.13, 0.015, 0.13, x, 1.289, tz, 0x55514a, { bucket: 'paint' });
      }
    }
    // yellow safety line on the yard side of the track
    for (let x = -7.9; x < 7.45; x += 0.46) {
      box(B, 0.26, 0.0025, 0.02, x, 1.114, -9.86, pal.lineYellow, { bucket: 'matte' });
    }
    // walkway planks + rail-side lamps
    for (let x = -8.0; x < -0.5; x += 0.9) {
      box(B, 0.8, 0.012, 0.36, x, 1.167, RAIL_Z + 0.42, 0x6d6557, { bucket: 'matte' });
    }
    function yardLamp(x, z, h) {
      cyl(B, 0.022, h, x, DECK + h / 2, z, 0x7a7465, { seg: 6, bucket: 'paint' });
      box(B, 0.08, 0.05, 0.08, x, DECK + h + 0.02, z, 0x3d3a33, { bucket: 'paint' });
      box(B, 0.06, 0.035, 0.012, x, DECK + h + 0.015, z + 0.045, pal.lampWarm, { bucket: 'lamp' });
      box(B, 0.10, 0.06, 0.10, x, DECK + 0.04, z, pal.concreteDark, { bucket: 'matte' });
    }
    yardLamp(-5.0, -10.85, 1.15);
    yardLamp(5.8, -10.85, 1.15);
    // rail spur sign
    K.sign({
      x: 2.9, y: DECK + 0.52, z: -9.90,
      w: 0.68, aspect: 4.2,
      bg: '#2f453f', fg: '#efe2c8', border: '#efe2c8',
      lines: [
        { text: 'RAIL SPUR 07', size: 52, font: K.fonts.mono, weight: 700, color: '#efe2c8' },
        { text: '集装箱铁路 · 极光码头', size: 24, font: K.fonts.song, weight: 500, color: '#efe2c8' },
      ],
      night: true,
    });
    for (const sx of [-0.34, 0.34]) {
      box(B, 0.025, 0.44, 0.025, 2.9 + sx, DECK + 0.22, -9.92, 0x777165, { bucket: 'metal' });
    }

    /* =====================================================================
     * 9. QUAY APRON — markings, end stops, signage, props
     * ================================================================== */
    // painted bollard-free / no-parking hatch along the quay edge
    for (let x = -8.15; x < 12.15; x += 0.78) {
      box(B, 0.34, 0.0025, 0.055, x, 1.1445, -4.50, pal.lineYellow,
        { bucket: 'matte', rot: [0, Math.PI / 4, 0] });
    }
    box(B, 20.3, 0.0025, 0.02, 2.0, 1.1445, -4.44, pal.lineWhite, { bucket: 'matte' });
    box(B, 20.3, 0.0025, 0.02, 2.0, 1.1445, -4.60, pal.lineWhite, { bucket: 'matte' });
    // crane portal keep-clear boxes
    for (const cx of craneXs) {
      const y = 1.1275;
      box(B, 1.90, 0.0025, 0.022, cx, 1.1105, -4.66, pal.lineYellow, { bucket: 'matte' });
      box(B, 1.90, 0.0025, 0.022, cx, 1.1105, -6.04, pal.lineYellow, { bucket: 'matte' });
      box(B, 0.022, 0.0025, 1.40, cx - 0.94, y, -5.35, pal.lineYellow, { bucket: 'matte' });
      box(B, 0.022, 0.0025, 1.40, cx + 0.94, y, -5.35, pal.lineYellow, { bucket: 'matte' });
    }
    // lane arrows along the quay road (east section, following the trucks)
    function laneArrow(x, z, dir) {
      const y = 1.1275;
      box(B, 0.24, 0.0025, 0.05, x, y, z, pal.lineWhite, { bucket: 'matte' });
      box(B, 0.11, 0.0025, 0.04, x + dir * 0.16, y, z - 0.055, pal.lineWhite, { bucket: 'matte', rot: [0, dir * 0.65, 0] });
      box(B, 0.11, 0.0025, 0.04, x + dir * 0.16, y, z + 0.055, pal.lineWhite, { bucket: 'matte', rot: [0, -dir * 0.65, 0] });
    }
    for (const x of [5.4, 8.0, 10.6]) laneArrow(x - 0.2, -5.19, 1);
    for (const x of [10.5, 7.9, 5.3]) laneArrow(x + 0.2, -5.51, -1);
    // stop line at the east gate end of the apron
    box(B, 0.02, 0.0025, 0.5, 11.66, 1.1275, -5.35, pal.lineWhite, { bucket: 'matte' });
    // (crane rail end stops are built by terrain-civils on the same rails)
    // spare spreader stored on trestles
    (function spareSpreader() {
      const x = 9.05, z = -4.74;
      const AY = 1.118;
      box(B, 0.66, 0.012, 0.24, x, AY + 0.20, z, 0x7d786c, { bucket: 'matte' });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(B, 0.03, 0.20, 0.03, x + sx * 0.28, AY + 0.10, z + sz * 0.08, 0x55514a, { bucket: 'metal' });
        }
      }
      box(B, 0.60, 0.07, 0.21, x, AY + 0.24, z, K.vary(pal.craneDark, rndD, { l: 0.04 }), { bucket: 'paint' });
      box(B, 0.62, 0.015, 0.215, x, AY + 0.28, z, pal.craneTrim, { bucket: 'paint' });
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          box(B, 0.05, 0.05, 0.06, x + sx * 0.28, AY + 0.195, z + sz * 0.085, 0x4a453b, { bucket: 'metal' });
        }
      }
      for (let i = 0; i < 5; i++) {
        box(B, 0.045, 0.05, 0.006, x - 0.2 + i * 0.1, AY + 0.24, z + 0.108,
          i % 2 ? 0x352f28 : pal.lineYellow, { bucket: 'paint' });
      }
    })();
    // traffic cones + reels + drums on the apron
    const hatchCones = [[-7.9, -4.55], [-4.3, -4.55], [1.2, -4.55], [6.1, -4.55], [11.4, -4.55]];
    for (const [x, z] of hatchCones) {
      cyl(B, 0.033, 0.012, x, 1.147, z, 0x3f3a32, { seg: 8, bucket: 'matte' });
      cyl(B, 0.026, 0.095, x, 1.191, z, 0xb3673f, { seg: 8, bucket: 'matte' });
      cyl(B, 0.011, 0.095, x, 1.289, z, 0xb3673f, { seg: 8, bucket: 'matte' });
      cyl(B, 0.016, 0.016, x, 1.241, z, pal.paperWarm, { seg: 8, bucket: 'matte' });
    }
    cableReel(-7.90, -5.82, 0.12, 1.118);
    cableReel(10.95, -5.86, 0.10, 1.118);
    for (let i = 0; i < 3; i++) {
      cyl(B, 0.055, 0.11, 7.80 + (i % 2) * 0.13, 1.173, -5.82, i % 2 ? 0x8a6a3f : 0x5d6e6a, { seg: 10, bucket: 'matte' });
    }
    // a small tool station + lashing bars by crane 1
    box(B, 0.30, 0.18, 0.20, -5.15, 1.198, -6.02, 0x7d786c, { bucket: 'paint' });
    box(B, 0.31, 0.02, 0.21, -5.15, 1.288, -6.02, 0x55514a, { bucket: 'paint' });
    for (let i = 0; i < 4; i++) {
      strut(B, [-4.95 + i * 0.08, 1.124, -5.95], [-4.80 + i * 0.08, 1.634, -5.99], 0.008, 0x8a8475, { seg: 4, bucket: 'metal' });
    }
    // freestanding terminal sign near the east apron
    K.sign({
      x: 10.35, y: 1.565, z: -5.95,
      w: 1.10, aspect: 4.4,
      bg: '#e8dcc4', fg: '#2c453f', border: '#2c453f',
      lines: [
        { text: 'AURORA CONTAINER TERMINAL', size: 40, font: K.fonts.sans, weight: 700, color: '#2c453f' },
        { text: '极光集装箱码头 · 1 号泊位', size: 24, font: K.fonts.song, weight: 500, color: '#2c453f' },
      ],
      night: true,
    });
    for (const sx of [-0.52, 0.52]) {
      box(B, 0.035, 0.30, 0.035, 10.35 + sx, 1.255, -5.97, 0x777165, { bucket: 'metal' });
      box(B, 0.09, 0.03, 0.09, 10.35 + sx, 1.122, -5.97, pal.concreteDark, { bucket: 'matte' });
    }
    // quay sign for the west end
    K.sign({
      x: -7.55, y: 1.48, z: -5.98,
      w: 0.64, aspect: 4.0,
      bg: '#2f453f', fg: '#efe2c8',
      lines: [{ text: 'QUAY 1 · 1号泊位', size: 48, font: K.fonts.song, weight: 600, color: '#efe2c8' }],
      night: true,
    });
    for (const sx of [-0.28, 0.28]) {
      box(B, 0.025, 0.28, 0.025, -7.55 + sx, 1.26, -6.00, 0x777165, { bucket: 'metal' });
    }
    // painted crane numbers on the apron (museum-model readable from above)
    (function craneNumbers() {
      const nums = ['01', '02', '03', '04'];
      const texs = [];
      for (let i = 0; i < 4; i++) {
        const tex = K.texture(K.canvas(256, 256, (ctx) => {
          ctx.clearRect(0, 0, 256, 256);
          ctx.strokeStyle = 'rgba(214,197,160,0.92)';
          ctx.lineWidth = 7;
          ctx.strokeRect(10, 10, 236, 236);
          ctx.fillStyle = 'rgba(214,197,160,0.95)';
          ctx.font = '700 132px ' + K.fonts.mono;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(nums[i], 128, 116);
          ctx.font = '600 30px ' + K.fonts.sans;
          ctx.fillText('STS · 岸桥', 128, 204);
          ctx.strokeStyle = 'rgba(214,197,160,0.55)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(40, 172); ctx.lineTo(216, 172); ctx.stroke();
        }), { anisotropy: 4 });
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.82), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(craneXs[i], 1.1295, -5.35);
        mesh.renderOrder = 2;
        K.addObject(mesh);
        texs.push(tex);
      }
    })();
    // tyre smears on the quay road + oil stains on the yard slab
    for (let i = 0; i < 14; i++) {
      const x = -8.0 + rndD() * 19.4;
      const z = -5.35 + (rndD() - 0.5) * 0.34;
      box(B, 0.5 + rndD() * 1.4, 0.0016, 0.012 + rndD() * 0.02, x, 1.1268, z,
        K.mixHex(pal.asphalt, pal.ink, 0.55), { bucket: 'matte', rot: [0, (rndD() - 0.5) * 0.2, 0] });
    }
    for (let i = 0; i < 10; i++) {
      const x = -7.8 + rndD() * 14.6;
      const z = -6.2 - rndD() * 3.2;
      disc(B, 0.10 + rndD() * 0.22, x, YARD_SLAB_TOP + 0.0011, z,
        K.mixHex(pal.asphalt, pal.ink, 0.4), { seg: 12, bucket: 'matte' });
    }
    // small apron clutter: lashing bars, fire cabinet, spare twistlocks
    box(B, 0.22, 0.30, 0.14, -7.10, 1.15 + 0.15, -6.00, 0x9a3f34, { bucket: 'paint' });
    box(B, 0.24, 0.02, 0.16, -7.10, 1.47, -6.00, 0x3a352c, { bucket: 'paint' });
    box(B, 0.16, 0.10, 0.02, -7.10, 1.26, -5.93, pal.paperDeep, { bucket: 'paint' });
    box(B, 0.30, 0.20, 0.20, 3.1, 1.21, -6.02, 0x6f6a5e, { bucket: 'paint' });
    box(B, 0.32, 0.02, 0.22, 3.1, 1.32, -6.02, 0x3a352c, { bucket: 'paint' });
    for (let i = 0; i < 3; i++) {
      box(B, 0.20, 0.09, 0.10, -5.95 + i * 0.24, 1.15, -4.78, 0x6f6a5e, { bucket: 'metal' });
      box(B, 0.06, 0.05, 0.05, -5.95 + i * 0.24, 1.20, -4.78, 0x4a453b, { bucket: 'metal' });
    }
    // painter’s cones at the workshop forecourt + a hose reel
    for (const [cx2, cz2] of [[8.9, -7.06], [9.4, -7.03], [10.6, -7.02]]) {
      cyl(B, 0.028, 0.012, cx2, 1.114, cz2, 0x3f3a32, { seg: 8, bucket: 'matte' });
      cyl(B, 0.022, 0.085, cx2, 1.158, cz2, 0xb3673f, { seg: 8, bucket: 'matte' });
      cyl(B, 0.010, 0.085, cx2, 1.245, cz2, 0xb3673f, { seg: 8, bucket: 'matte' });
    }
    cylX(B, 0.09, 0.10, 8.42, 1.20, -6.30, 0x5c4a38, { seg: 10, bucket: 'matte' });
    cylX(B, 0.05, 0.11, 8.42, 1.20, -6.30, 0x8a7a63, { seg: 8, bucket: 'matte' });

    // a cluster of empty chassis by the support gate
    box(B, 0.32, 0.04, 0.22, 7.92, 1.24, -5.9, 0x6e695c, { bucket: 'paint' });
    for (const sz of [-1, 1]) {
      box(B, 1.06, 0.03, 0.03, 7.45, 1.25, -5.9 + sz * 0.11, 0x55514a, { bucket: 'paint' });
    }
    for (const ax of [7.90, 7.10]) {
      for (const sz of [-1, 1]) cylZ(B, 0.05, 0.04, ax, 1.17, -5.9 + sz * 0.12, 0x33302b, { seg: 8, bucket: 'metal' });
    }

    /* ------------------------------- night light pools (additive, 1 draw) */
    const nightPools = (function () {
      const glow = K.glowTexture();
      const mat = new THREE.MeshBasicMaterial({
        map: glow, color: 0xffc47e, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const pts = [
        [-8.05, 1.116, -4.62, 3.2], [12.28, 1.116, -4.62, 3.2],
        [8.22, 1.132, -8.98, 2.6], [10.62, 1.132, -6.30, 2.6],
        [-6.4, 1.138, -5.35, 2.4], [-2.0, 1.138, -5.35, 2.4],
        [2.4, 1.138, -5.35, 2.4], [6.8, 1.138, -5.35, 2.4],
        [-2.4, 1.128, -7.9, 3.4], [4.4, 1.128, -7.9, 3.0],
        [2.0, 1.172, -10.35, 2.8], [10.2, 1.122, -6.7, 2.0],
      ];
      const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, pts.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
      const sc = new THREE.Vector3();
      const pos = new THREE.Vector3();
      for (let i = 0; i < pts.length; i++) {
        pos.set(pts[i][0], pts[i][1], pts[i][2]);
        sc.set(pts[i][3], pts[i][3], 1);
        m.compose(pos, q, sc);
        inst.setMatrixAt(i, m);
      }
      inst.instanceMatrix.needsUpdate = true;
      inst.renderOrder = 3;
      inst.castShadow = false;
      inst.receiveShadow = false;
      K.addObject(inst);
      K.addTick(function poolTick() {
        const mix = (P.env && P.env.mix) || 0;
        mat.opacity = 0.30 * mix;
        inst.visible = mix > 0.01;
      });
      return inst;
    })();

    // small forecourt props in front of customs/workshop
    for (let i = 0; i < 3; i++) {
      box(B, 0.23, 0.028, 0.17, 8.52, 1.122 + i * 0.03, -6.85,
        K.mixHex(pal.wood, pal.woodLight, 0.35), { bucket: 'matte' });
      box(B, 0.20, 0.03, 0.14, 8.52, 1.138 + i * 0.03, -6.85,
        K.mixHex(pal.woodLight, pal.paperDeep, 0.35), { bucket: 'matte' });
    }
    for (let i = 0; i < 3; i++) {
      const cxx = 9.00 + i * 0.10;
      cyl(B, 0.055, 0.11, cxx, 1.163, -6.88, i % 2 ? 0x5d6e6a : 0x8a6a3f, { seg: 10, bucket: 'matte' });
      cyl(B, 0.04, 0.012, cxx, 1.224, -6.88, 0x3a332a, { seg: 8, bucket: 'matte' });
    }
    (function forecourtVan() {
      const x = 9.36, z = -6.87;
      box(B, 0.30, 0.09, 0.16, x, 1.158, z, 0xc6b99c, { bucket: 'paint' });
      box(B, 0.22, 0.11, 0.15, x - 0.03, 1.235, z, 0xd3c7ab, { bucket: 'paint' });
      box(B, 0.12, 0.07, 0.012, x + 0.08, 1.24, z + 0.078, 0x33474a, { bucket: 'glass' });
      box(B, 0.12, 0.07, 0.012, x + 0.08, 1.24, z - 0.078, 0x33474a, { bucket: 'glass' });
      box(B, 0.10, 0.02, 0.14, x - 0.01, 1.29, z, 0xb9ad94, { bucket: 'paint' });
      for (const ax of [x - 0.09, x + 0.09]) {
        for (const sz of [-1, 1]) {
          cylZ(B, 0.032, 0.022, ax, 1.135, z + sz * 0.075, 0x33302b, { seg: 8, bucket: 'metal' });
        }
      }
      box(B, 0.055, 0.024, 0.13, x - 0.03, 1.135, z, 0x3f3a32, { bucket: 'matte' });
    })();
    cableReel(8.30, -6.02, 0.09, 1.116);
    cyl(B, 0.05, 0.14, 10.60, 1.178, -6.72, 0x9a4a3a, { seg: 8, bucket: 'paint' });

    /* =====================================================================
     * 10. CONTAINER INSTANCER — one draw call for every static box
     * ================================================================== */
    (function buildContainerInstances() {
      const inst = K.instancer(cGeo, cMat, { name: 'terminal-containers' });
      for (let i = 0; i < containerItems.length; i++) {
        const it = containerItems[i];
        inst.add({ pos: [it.x, it.y, it.z], rot: [0, it.rotY || 0, 0], color: it.color });
      }
      inst.finish(scene);
    })();

    /* =====================================================================
     * 11. LABELS / COUNTERS / ANCHORS
     * ================================================================== */
    K.count('cranes', craneXs.length);
    K.count('containers', containerCount);
    K.count('buildings', buildingCount);

    K.anchor('floodLights', {
      positions: [
        [-8.05, 2.42, -4.62], [12.28, 2.42, -4.62],
        [8.22, 2.22, -8.98], [10.62, 2.18, -6.30],
        [-6.4, 3.42, -5.25], [-2.0, 3.42, -5.25], [2.4, 3.42, -5.25], [6.8, 3.42, -5.25],
        [-5.0, 2.72, -10.85], [5.8, 2.72, -10.85],
        [8.6, 1.30, -6.4],
      ],
    });
    K.anchor('craneTips', { positions: craneTips });
    K.anchor('craneApex', { positions: craneApex });

    K.addLabel({
      title: '岸桥', sub: 'SHIP-TO-SHORE CRANE · STS 01–04', priority: 10,
      pos: [-2.0, 5.15, -5.35],
    });
    K.addLabel({
      title: '集装箱堆场', sub: 'CONTAINER YARD · 8 ROWS × 21 BAYS', priority: 8,
      pos: [-0.4, 3.35, -7.9],
    });
    K.addLabel({
      title: '场桥', sub: 'RTG · RUBBER-TYRED GANTRY', priority: 7,
      pos: [4.6, 3.95, -7.9],
    });
    K.addLabel({
      title: '港口铁路', sub: 'RAIL SPUR · 集装箱铁路', priority: 6,
      pos: [2.6, 2.15, -10.35],
    });
  };
})();
