/* ============================================================================
 * town.js — the old town on the west hill, the fishing village and market on
 * the quay, the church + clock tower, the plaza fountain, the cafe, the pilot
 * station, the back-row warehouses behind the rail, plus people, trees,
 * vehicles and street furniture.  Everything static is baked into the shared
 * Batcher; only a handful of things are animated (fountain, clock, bunting,
 * walkers, one van, umbrellas).  Owned by teammate `town`.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  P.builders = P.builders || {};

  /* ---------------------------------------------------------------- palette */
  // A warm, faded Mediterranean / northern-harbour mix: cream and sand plaster,
  // terracotta and weathered slate roofs, deep green and dusty blue shutters.
  const PL = {
    plasters: [0xe3d6be, 0xdac9ac, 0xd3bd9f, 0xe8dcc6, 0xcfc0a8, 0xd9c6b4, 0xbfc6bf, 0xb9c3c6, 0xc8b49c, 0xe0cfb4],
    plastersWarm: [0xd9bf9e, 0xd0b18c, 0xc9a882, 0xdcc4a3],
    plastersCool: [0xbfc9c6, 0xb4c2c3, 0xc6cec6, 0xaebdbf],
    roofs: [0xa65f47, 0x9d5a43, 0xb0684c, 0x8f533f, 0xa5624a, 0x8a4f3b],
    roofsSlate: [0x5a6570, 0x515c66, 0x606a72, 0x4a555f],
    roofsGreen: [0x4f6a5d, 0x56705f],
    shutters: [0x3f5a4a, 0x46604f, 0x4a6470, 0x556b78, 0x6d4032, 0x5c4a3a, 0x2f4a45, 0x7d5a3c],
    doors: [0x5c4130, 0x6b4a33, 0x3f5a4a, 0x4a6470, 0x7a5238, 0x46332a],
    trim: [0xdccfba, 0xd3c4ac, 0xe4d7c0, 0xcfc0a6],
    stone: [0xc9b99f, 0xbfae93, 0xd2c3a9, 0xb6a68c, 0xcbbba0],
    stoneDark: [0x9b8a72, 0x8f7f68, 0xa5947c],
    wood: [0x5c4130, 0x6a4b36, 0x4a3527, 0x7b5a40],
    awnings: [[0xa8674f, 0xe8dcc4], [0x6f8578, 0xe6dcc6], [0xb2874f, 0xefe3cc], [0x8a5a52, 0xe2d5bd]],
    cloth: [0xe4d8c2, 0xc9b7a2, 0xa8b7b4, 0xc3a48f, 0x93a3a5, 0xd5c3a6, 0xb98f7e],
    foliage: [0x6d7f57, 0x7e8a5f, 0x5d7350, 0x87936b, 0x9aa06d, 0x6b7c50],
    foliageDark: [0x4d6247, 0x556b4a, 0x49603f],
    cypress: [0x3f5540, 0x47603f, 0x3a4f3b],
    flower: [0xc98c74, 0xd7c08f, 0xd4a3a0, 0xc9a9b8, 0xe0b98e],
    water: 0xbcd8d2,
    lamp: 0xffd9a0,
    metal: 0x5b5f5c,
    metalDark: 0x3d403d,
    glass: 0x2f4c55,
    glassLit: 0xf6d9a4,
    rust: 0x8f533f,
    navy: 0x2f4048,
    teal: 0x3c6b63,
    sage: 0x7c8a6f,
    cream: 0xe8dfcd,
    cargo: [0x7c8a6f, 0x9c6049, 0xb2874f, 0x5d6f6b, 0xd9cdb3, 0x8a5a52],
  };

  /* ------------------------------------------------------------------ utils */
  function qyxz(ry, rx, rz) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ'));
  }

  P.builders.town = function town(ctx) {
    const K = ctx.kit;
    const L = ctx.layout;
    const THREE = ctx.THREE;
    const B = P.batch;
    const W = L.W;
    const H = (x, z) => L.heightAt(x, z);
    const rnd = K.rng(0x70a1d3);
    const dbg = /(?:^|[?&])debugTown=1/.test(location.search);
    const reduced = !!P.reducedMotion;
    const MATH = Math;

    const pick = (a) => a[(rnd() * a.length) | 0];
    const vary = (c, dl, ds, dh) => K.vary(c, rnd, { l: dl == null ? 0.05 : dl, s: ds == null ? 0.06 : ds, h: dh == null ? 0.012 : dh });
    const range = (a, b) => a + (b - a) * rnd();
    const chance = (p) => rnd() < p;

    /* ------------------------------------------------------- slot transforms */
    // Every object is built in its own local frame (x = across, z = depth, the
    // local +z face is the "front"), then rotated into the world by ry.
    function lp(s, lx, lz) {
      const c = MATH.cos(s.ry), sn = MATH.sin(s.ry);
      return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    }
    function BX(s, lx, y, lz, w, h, d, color, o) {
      const p = lp(s, lx, lz);
      B.add(K.geoBox(), color, {
        pos: [p[0], y, p[1]], scale: [w, h, d],
        quat: qyxz(s.ry + ((o && o.yaw) || 0), (o && o.rx) || 0, (o && o.rz) || 0),
        bucket: o && o.bucket,
      });
    }
    function CY(s, lx, y, lz, r, h, color, o) {
      o = o || {};
      const p = lp(s, lx, lz);
      B.add(K.geoCyl(o.seg || 8), color, {
        pos: [p[0], y, p[1]], scale: [r, h, r],
        quat: qyxz(s.ry + (o.yaw || 0), o.rx || 0, o.rz || 0),
        bucket: o.bucket,
      });
    }
    function SP(s, lx, y, lz, r, color, o) {
      o = o || {};
      const p = lp(s, lx, lz);
      B.add(K.geoSphere(o.ws || 8, o.hs || 6), color, {
        pos: [p[0], y, p[1]], scale: [r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1)],
        quat: qyxz(s.ry, 0, 0), bucket: o.bucket,
      });
    }
    function CO(s, lx, y, lz, r, h, color, o) {
      o = o || {};
      const p = lp(s, lx, lz);
      B.add(K.geoCone(o.seg || 8), color, {
        pos: [p[0], y, p[1]], scale: [r, h, r],
        quat: qyxz(s.ry + (o.yaw || 0), o.rx || 0, o.rz || 0), bucket: o.bucket,
      });
    }
    // Triangle (double sided) with local coords [lx, y, lz].
    function TRI(s, a, b, c, color, o) {
      o = o || {};
      const pts = [];
      const push = (v) => { const p = lp(s, v[0], v[2]); pts.push(p[0], v[1], p[1]); };
      push(a); push(b); push(c);
      push(a); push(c); push(b);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.computeVertexNormals();
      B.add(g, color, { bucket: o.bucket });
    }

    /* --------------------------------------------------------- ground probe */
    function probeSlot(s) {
      let mn = Infinity, mx = -Infinity, water = false;
      const n = 3;
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
        const wx = s.x + (-s.w / 2 + (s.w * i) / n) * MATH.cos(s.ry) + (-s.d / 2 + (s.d * j) / n) * MATH.sin(s.ry);
        const wz = s.z - (-s.w / 2 + (s.w * i) / n) * MATH.sin(s.ry) + (-s.d / 2 + (s.d * j) / n) * MATH.cos(s.ry);
        if (!L.pointInLand(wx, wz)) water = true;
        const h = H(wx, wz);
        if (h < mn) mn = h;
        if (h > mx) mx = h;
      }
      s.hMin = mn; s.hMax = mx; s.water = water;
      s.floor = mx + 0.02;
      s.base = mn - 0.12;
      return s;
    }
    // Terrain-civils owns the peninsula hardscape; keep props/trees off it.
    const CIVILS = {
      walls: [{ x: -10.76, z0: -4.22, z1: -0.86, halfW: 0.17 }],
      stairs: [{ ax: -10.58, az: -1.02, bx: -11.2, bz: -2.42, halfW: 0.36 }],
      plazas: [{ x: -11.05, z: -3.3, r: 0.47 }, { x: -11.95, z: -8.45, r: 0.66 }, { x: -10.55, z: -1.9, r: 0.58 }],
      beacon: { x: -10.55, z: 4.35, r: 0.36 },
      path: { ax: -11.32, az: 2.62, bx: -10.62, bz: 4.1, halfW: 0.3 },
      pontoon: { x0: -10.12, x1: -8.15, z0: 1.35, z1: 2.55 },
    };
    function segDist(px, pz, ax, az, bx, bz) {
      const vx = bx - ax, vz = bz - az;
      const L2 = vx * vx + vz * vz;
      let t = L2 > 0 ? ((px - ax) * vx + (pz - az) * vz) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - (ax + t * vx), dz = pz - (az + t * vz);
      return MATH.sqrt(dx * dx + dz * dz);
    }
    function civilsClear(x, z, pad, withPlazas) {
      pad = pad || 0;
      for (let i = 0; i < CIVILS.walls.length; i++) {
        const w = CIVILS.walls[i];
        if (z > w.z0 - pad && z < w.z1 + pad && MATH.abs(x - w.x) < w.halfW + pad) return false;
      }
      for (let i = 0; i < CIVILS.stairs.length; i++) {
        const t = CIVILS.stairs[i];
        if (segDist(x, z, t.ax, t.az, t.bx, t.bz) < t.halfW + pad) return false;
      }
      if (MATH.hypot(x - CIVILS.beacon.x, z - CIVILS.beacon.z) < CIVILS.beacon.r + pad) return false;
      if (segDist(x, z, CIVILS.path.ax, CIVILS.path.az, CIVILS.path.bx, CIVILS.path.bz) < CIVILS.path.halfW + pad) return false;
      if (withPlazas !== false) {
        for (let i = 0; i < CIVILS.plazas.length; i++) {
          const q = CIVILS.plazas[i];
          if (MATH.hypot(x - q.x, z - q.z) < q.r + pad) return false;
        }
      }
      return true;
    }
    function roadDist(x, z) {
      let best = Infinity;
      for (let r = 0; r < L.roads.length; r++) {
        const rd = L.roads[r], pts = rd.points;
        for (let i = 0; i < pts.length - 1; i++) {
          const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
          const vx = bx - ax, vz = bz - az;
          const L2 = vx * vx + vz * vz;
          let t = L2 > 0 ? ((x - ax) * vx + (z - az) * vz) / L2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x - (ax + t * vx), dz = z - (az + t * vz);
          const d = MATH.sqrt(dx * dx + dz * dz) - rd.width / 2;
          if (d < best) best = d;
        }
      }
      return best;
    }

    /* --------------------------------------------------------- occupancy */
    const occupied = [];
    function obbCorners(s) {
      const out = [];
      const c = MATH.cos(s.ry), sn = MATH.sin(s.ry);
      const hw = s.w / 2, hd = s.d / 2;
      out.push([-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]);
      return out.map(function (q) { return [s.x + q[0] * c + q[1] * sn, s.z - q[0] * sn + q[1] * c]; });
    }
    function overlaps(a, b, pad) {
      pad = pad == null ? 0.02 : pad;
      const A = obbCorners(a), Bb = obbCorners(b);
      const axes = [];
      for (let w = 0; w < 2; w++) {
        const poly = w ? Bb : A;
        for (let i = 0; i < 2; i++) {
          const dx = poly[i + 1][0] - poly[i][0], dz = poly[i + 1][1] - poly[i][1];
          const len = MATH.hypot(dx, dz) || 1;
          axes.push([-dz / len, dx / len]);
        }
      }
      for (let a2 = 0; a2 < axes.length; a2++) {
        const ax = axes[a2];
        let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
        for (let i = 0; i < 4; i++) {
          const d = A[i][0] * ax[0] + A[i][1] * ax[1];
          if (d < amin) amin = d; if (d > amax) amax = d;
          const e = Bb[i][0] * ax[0] + Bb[i][1] * ax[1];
          if (e < bmin) bmin = e; if (e > bmax) bmax = e;
        }
        if (amax + pad < bmin || bmax + pad < amin) return false;
      }
      return true;
    }
    function claim(s, tag) {
      occupied.push({ x: s.x, z: s.z, w: s.w, d: s.d, ry: s.ry, tag: tag || s.n || 'x' });
    }
    function freeAt(s, pad) {
      for (let i = 0; i < occupied.length; i++) if (overlaps(s, occupied[i], pad == null ? 0.015 : pad)) return false;
      return true;
    }
    function checkSlot(s, roadClear) {
      const p = probeSlot(s);
      const issues = [];
      if (p.water) issues.push('water');
      if (roadDist(s.x, s.z) < (roadClear == null ? 0.3 : roadClear)) issues.push('road ' + roadDist(s.x, s.z).toFixed(2));
      if (!freeAt(s)) issues.push('overlap');
      if (p.hMax - p.hMin > 1.1) issues.push('slope ' + (p.hMax - p.hMin).toFixed(2));
      if (dbg && issues.length) console.warn('[town] ' + (s.n || 'slot') + ': ' + issues.join(', '));
      return p;
    }

    /* ------------------------------------------------------------- textures */
    const texCache = {};
    function clockTexture(size) {
      if (texCache.clock) return texCache.clock;
      const c = K.canvas(256, 256, function (g, w, h) {
        g.clearRect(0, 0, w, h);
        const cx = w / 2, cy = h / 2;
        g.beginPath(); g.arc(cx, cy, w * 0.46, 0, MATH.PI * 2);
        g.fillStyle = '#f4ead6'; g.fill();
        g.lineWidth = w * 0.035; g.strokeStyle = '#4a4238'; g.stroke();
        g.beginPath(); g.arc(cx, cy, w * 0.40, 0, MATH.PI * 2);
        g.lineWidth = w * 0.012; g.strokeStyle = '#8a7a63'; g.stroke();
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * MATH.PI * 2;
          const r0 = w * (i % 5 === 0 ? 0.33 : 0.36), r1 = w * 0.395;
          g.beginPath();
          g.moveTo(cx + MATH.sin(a) * r0, cy - MATH.cos(a) * r0);
          g.lineTo(cx + MATH.sin(a) * r1, cy - MATH.cos(a) * r1);
          g.lineWidth = i % 5 === 0 ? w * 0.018 : w * 0.007;
          g.strokeStyle = '#4a4238'; g.stroke();
        }
        g.fillStyle = '#3f3930';
        g.font = '700 ' + w * 0.13 + 'px Georgia, serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('XII', cx, cy - w * 0.27);
        g.fillText('VI', cx, cy + w * 0.28);
        g.font = '600 ' + w * 0.075 + 'px Georgia, serif';
        g.fillText('AURORA', cx, cy + w * 0.16);
        g.fillText('1907', cx, cy - w * 0.15);
      });
      texCache.clock = K.texture(c, { anisotropy: 8 });
      return texCache.clock;
    }

    /* ====================================================================== */
    /*  SLOT TABLE — every building / landmark, hand-tuned against heightAt    */
    /* ====================================================================== */
    const E = MATH.PI / 2, S = 0;      // front faces east / south
    const SLOTS = [
      /* --- hill crest: church, campanile, plaza ---------------------------- */
      { n: 'church', kind: 'church', x: -11.12, z: -3.30, w: 0.42, d: 0.92, ry: S },
      { n: 'plaza', kind: 'plaza', x: -11.24, z: -2.46, w: 0.46, d: 0.40, ry: S },
      { n: 'up1', kind: 'house', x: -11.07, z: -3.99, w: 0.40, d: 0.34, ry: E, floors: 3 },
      /* --- terraced row above the harbour street --------------------------- */
      { n: 'g1', kind: 'garden', x: -11.86, z: -1.20, w: 0.34, d: 0.30, ry: S },
      { n: 'g2', kind: 'garden', x: -11.96, z: -0.50, w: 0.30, d: 0.32, ry: S },
      { n: 'g3', kind: 'garden', x: -11.82, z: -2.10, w: 0.30, d: 0.28, ry: S },
      { n: 'tower', kind: 'tower', x: -11.70, z: -3.22, w: 0.20, d: 0.20, ry: S },
      { n: 'k1', kind: 'house', x: -11.44, z: -0.42, w: 0.44, d: 0.46, ry: E, floors: 3 },
      { n: 'k2', kind: 'house', x: -11.48, z: 0.04, w: 0.40, d: 0.46, ry: E, floors: 2 },
      { n: 'k3', kind: 'house', x: -11.54, z: 0.48, w: 0.40, d: 0.44, ry: E, floors: 2 },
      { n: 'k4', kind: 'house', x: -11.60, z: 0.92, w: 0.38, d: 0.40, ry: E, floors: 3 },
      { n: 'k5', kind: 'house', x: -11.68, z: 1.30, w: 0.34, d: 0.34, ry: E, floors: 2 },
      /* --- north spur above the fishing corner ---------------------------- */
      { n: 'n1', kind: 'house', x: -10.85, z: -4.83, w: 0.46, d: 0.34, ry: E, floors: 3 },
      { n: 'n4', kind: 'house', x: -10.58, z: -5.08, w: 0.34, d: 0.28, ry: E, floors: 2 },
      { n: 'n2', kind: 'house', x: -10.30, z: -6.10, w: 0.42, d: 0.30, ry: E, floors: 2 },
      { n: 'n3', kind: 'house', x: -10.30, z: -6.55, w: 0.38, d: 0.28, ry: E, floors: 2 },
      { n: 'n5', kind: 'shed', x: -9.90, z: -5.95, w: 0.40, d: 0.30, ry: E },
      { n: 'n6', kind: 'shed', x: -9.92, z: -5.36, w: 0.30, d: 0.26, ry: E },
      { n: 'ice', kind: 'ice', x: -10.70, z: -5.35, w: 0.32, d: 0.30, ry: E },
      /* --- shoreline hamlet (net stores / boathouses) --------------------- */
      { n: 'h1', kind: 'shed', x: -9.92, z: -6.60, w: 0.34, d: 0.34, ry: E },
      { n: 'h2', kind: 'shed', x: -9.80, z: -6.98, w: 0.30, d: 0.30, ry: E },
      { n: 'h3', kind: 'shed', x: -9.95, z: -7.40, w: 0.28, d: 0.28, ry: E },
      { n: 'bs1', kind: 'shed', x: -10.02, z: -7.86, w: 0.30, d: 0.30, ry: E },
      { n: 'bs2', kind: 'shed', x: -9.74, z: -8.44, w: 0.26, d: 0.26, ry: E },
      /* --- harbour corner -------------------------------------------------- */
      { n: 'pilot', kind: 'pilot', x: -10.28, z: -4.26, w: 0.48, d: 0.44, ry: S, floors: 2 },
      { n: 'office', kind: 'office', x: -9.95, z: -4.70, w: 0.32, d: 0.40, ry: E, floors: 2 },
      /* --- quay: cafe, fish market ---------------------------------------- */
      { n: 'cafe', kind: 'cafe', x: -10.02, z: 0.94, w: 0.44, d: 0.42, ry: E, floors: 2 },
      { n: 'market', kind: 'market', x: -10.26, z: 1.95, w: 1.00, d: 0.28, ry: E },
      { n: 'fishshop', kind: 'fishop', x: -10.22, z: 2.82, w: 0.38, d: 0.36, ry: E },
      /* --- back row behind the rail --------------------------------------- */
      { n: 'w1', kind: 'customs', x: -3.45, z: -12.11, w: 0.80, d: 0.30, ry: S },
      { n: 'w2', kind: 'warehouse', x: -2.40, z: -12.13, w: 1.00, d: 0.36, ry: S },
      { n: 'w3', kind: 'warehouse', x: -1.32, z: -12.15, w: 1.00, d: 0.40, ry: S },
      { n: 'w4', kind: 'warehouse', x: -0.24, z: -12.15, w: 1.00, d: 0.40, ry: S },
      { n: 'w5', kind: 'warehouse', x: 0.84, z: -12.15, w: 1.00, d: 0.40, ry: S },
      { n: 'w6', kind: 'warehouse', x: 1.92, z: -12.15, w: 1.00, d: 0.40, ry: S },
      { n: 'w7', kind: 'warehouse', x: 2.94, z: -12.13, w: 0.90, d: 0.36, ry: S },
      { n: 'w8', kind: 'warehouse', x: 3.66, z: -12.06, w: 0.46, d: 0.20, ry: S },
    ];

    /* ====================================================================== */
    /*  small builders                                                        */
    /* ====================================================================== */

    // Pitched roof. ridge 'x' → ridge runs along local x; 'z' → along local z.
    function roof(s, o) {
      const w = o.w, d = o.d, top = o.top, rise = o.rise, over = o.over == null ? 0.035 : o.over;
      const col = o.color, ridgeCol = o.ridgeCol || K.shade(o.color, -0.05, 0.04, 0);
      const along = o.ridgeAxis || 'x';
      const span = along === 'x' ? d / 2 + over : w / 2 + over;
      const len = (along === 'x' ? w : d) + over * 2;
      const ang = MATH.atan2(rise, span);
      const slope = MATH.hypot(span, rise);
      const cy = top + rise / 2 - (o.thick || 0.026) * 0.35;
      const t = o.thick || 0.026;
      for (let sg = -1; sg <= 1; sg += 2) {
        if (along === 'x') {
          BX(s, o.lx || 0, cy, (o.lz || 0) + (sg * span) / 2, len, t, slope, col,
            { rx: -sg * ang, bucket: 'matte' });
        } else {
          BX(s, (o.lx || 0) + (sg * span) / 2, cy, o.lz || 0, slope, t, len, col,
            { rz: sg * ang, bucket: 'matte' });
        }
      }
      // ridge tiles
      if (along === 'x') {
        CY(s, o.lx || 0, top + rise + 0.012, o.lz || 0, 0.019, len + 0.02, ridgeCol, { rz: MATH.PI / 2, seg: 6 });
      } else {
        CY(s, o.lx || 0, top + rise + 0.012, o.lz || 0, 0.019, len + 0.02, ridgeCol, { rx: MATH.PI / 2, seg: 6 });
      }
      // eave fascia boards
      if (along === 'x') {
        BX(s, o.lx || 0, top - 0.008, (o.lz || 0) + d / 2 + over - 0.012, len, 0.03, 0.022, o.fascia || K.shade(col, -0.05, 0, 0));
        BX(s, o.lx || 0, top - 0.008, (o.lz || 0) - d / 2 - over + 0.012, len, 0.03, 0.022, o.fascia || K.shade(col, -0.05, 0, 0));
      } else {
        BX(s, (o.lx || 0) + w / 2 + over - 0.012, top - 0.008, o.lz || 0, 0.022, 0.03, len, o.fascia || K.shade(col, -0.05, 0, 0));
        BX(s, (o.lx || 0) - w / 2 - over + 0.012, top - 0.008, o.lz || 0, 0.022, 0.03, len, o.fascia || K.shade(col, -0.05, 0, 0));
      }
      return top + rise;
    }

    // Gable end triangles (fill the wall under the roof).
    function gables(s, o) {
      const w = o.w, d = o.d, top = o.top, rise = o.rise;
      const col = o.color;
      const along = o.ridgeAxis || 'x';
      if (along === 'x') {
        for (let sg = -1; sg <= 1; sg += 2) {
          TRI(s, [sg * w / 2, top, -d / 2], [sg * w / 2, top, d / 2], [sg * w / 2, top + rise, 0], col);
        }
      } else {
        for (let sg = -1; sg <= 1; sg += 2) {
          TRI(s, [-w / 2, top, sg * d / 2], [w / 2, top, sg * d / 2], [0, top + rise, sg * d / 2], col);
        }
      }
    }

    // Window on a wall face.  side: 'front'|'back'|'left'|'right'
    function faceLocal(s, side, along, off) {
      const hw = s.w / 2, hd = s.d / 2;
      if (side === 'front') return [along, hd + off];
      if (side === 'back') return [along, -hd - off];
      if (side === 'right') return [hw + off, along];
      return [-hw - off, along];
    }
    function faceDims(side, w, h, dep) {
      return side === 'front' || side === 'back' ? [w, h, dep] : [dep, h, w];
    }
    function windowUnit(s, o) {
      const side = o.side || 'front';
      const w = o.w || 0.115, h = o.h || 0.135;
      const fy = o.y, along = o.along;
      const trim = o.trim || PL.trim[0];
      const shut = o.shutter;
      const lit = !!o.lit;
      // recess shadow (slightly larger, darker) then the stone frame
      const g0 = faceLocal(s, side, along, 0.0015);
      const d0 = faceDims(side, w * 1.22, h * 1.18, 0.01);
      BX(s, g0[0], fy, g0[1], d0[0], d0[1], d0[2], K.shade(o.frame || trim, -0.16, 0.02, 0), { bucket: 'matte' });
      const g = faceLocal(s, side, along, 0.006);
      const dims = faceDims(side, w, h, 0.016);
      BX(s, g[0], fy, g[1], dims[0], dims[1], dims[2], o.frame || trim, { bucket: 'matte' });
      const gl = faceLocal(s, side, along, 0.012);
      const gd = faceDims(side, w * 0.76, h * 0.78, 0.009);
      BX(s, gl[0], fy, gl[1], gd[0], gd[1], gd[2], lit ? PL.glassLit : PL.glass, { bucket: lit ? 'lamp' : 'glass' });
      // mullion + transom
      const mu = faceDims(side, 0.011, h * 0.8, 0.006);
      const m1 = faceLocal(s, side, along, 0.018);
      BX(s, m1[0], fy, m1[1], mu[0], mu[1], mu[2], o.frame || trim);
      // sill
      if (o.sill !== false) {
        const sl = faceLocal(s, side, along, 0.016);
        const sd = faceDims(side, w * 1.16, 0.016, 0.03);
        BX(s, sl[0], fy - h / 2 - 0.012, sl[1], sd[0], sd[1], sd[2], o.sillCol || K.shade(trim, -0.05, 0.02, 0));
      }
      if (shut) {
        for (let sg = -1; sg <= 1; sg += 2) {
          const sh = faceLocal(s, side, along + sg * (w * 0.5 + w * 0.26), 0.012);
          const shd = faceDims(side, w * 0.42, h * 0.96, 0.012);
          BX(s, sh[0], fy, sh[1], shd[0], shd[1], shd[2], shut);
          // small louvre shading: two thin bars
          for (let k2 = -1; k2 <= 1; k2 += 2) {
            const lv = faceLocal(s, side, along + sg * (w * 0.5 + w * 0.26), 0.019);
            const lvd = faceDims(side, w * 0.36, 0.006, 0.006);
            BX(s, lv[0], fy + k2 * h * 0.24, lv[1], lvd[0], lvd[1], lvd[2], K.shade(shut, -0.05, 0, 0));
          }
        }
      }
      if (o.flowerBox) {
        const fb = faceLocal(s, side, along, 0.03);
        const fbd = faceDims(side, w * 1.1, 0.03, 0.035);
        BX(s, fb[0], fy - h / 2 - 0.03, fb[1], fbd[0], fbd[1], fbd[2], 0x7a5238);
        for (let f = 0; f < 3; f++) {
          const fp = faceLocal(s, side, along + (f - 1) * w * 0.3, 0.036);
          SP(s, fp[0], fy - h / 2 - 0.012, fp[1], 0.019, pick(PL.flower), { ws: 6, hs: 4, sy: 0.8 });
          SP(s, fp[0], fy - h / 2 - 0.022, fp[1], 0.016, pick(PL.foliageDark), { ws: 6, hs: 4, sy: 0.7 });
        }
      }
    }

    function doorUnit(s, o) {
      const side = o.side || 'front';
      const w = o.w || 0.115, h = o.h || 0.2;
      const fy = o.y, along = o.along || 0;
      const frame = o.frame || PL.trim[0];
      const dcol = o.color || pick(PL.doors);
      const f = faceLocal(s, side, along, 0.005);
      const fd = faceDims(side, w * 1.24, h * 1.16, 0.014);
      BX(s, f[0], fy + h / 2 - h * 0.08, f[1], fd[0], fd[1], fd[2], frame);
      const dl = faceLocal(s, side, along, 0.011);
      const dd = faceDims(side, w, h, 0.012);
      BX(s, dl[0], fy + h / 2 - h * 0.08, dl[1], dd[0], dd[1], dd[2], dcol);
      // handle + panel lines
      const hd = faceLocal(s, side, along + w * 0.28, 0.018);
      BX(s, hd[0], fy + h * 0.42, hd[1], 0.012, 0.012, 0.014, PL.metal);
      const st = faceLocal(s, side, along, 0.022);
      const std = faceDims(side, w * 1.5, 0.022, 0.06);
      BX(s, st[0], fy - h * 0.08, st[1], std[0], std[1], std[2], K.shade(frame, -0.08, 0, 0));
      if (o.canopy) {
        const cn = faceLocal(s, side, along, 0.07);
        const cnd = faceDims(side, w * 1.7, 0.018, 0.12);
        BX(s, cn[0], fy + h * 1.02, cn[1], cnd[0], cnd[1], cnd[2], o.canopy, { rx: (side === 'front' || side === 'back') ? -0.16 : 0, rz: (side === 'front' || side === 'back') ? 0 : 0.16 });
      }
    }

    // Striped shop awning over the front wall.
    function awning(s, o) {
      const w = o.w, y = o.y, lz = s.d / 2 + 0.055;
      const stripes = o.stripes || pick(PL.awnings);
      const n = MATH.max(3, MATH.round(w / 0.055) | 0);
      const sw = w / n;
      for (let i = 0; i < n; i++) {
        BX(s, o.lx + (i + 0.5) * sw - w / 2, y - 0.018, lz, sw * 0.96, 0.014, 0.11, i % 2 ? stripes[1] : stripes[0], { rx: 0.22 });
      }
      // front scalloped valance
      BX(s, o.lx, y - 0.062, lz + 0.048, w, 0.03, 0.008, stripes[0], { rx: 0.22 });
      // support arms
      BX(s, o.lx - w / 2 + 0.02, y - 0.02, lz - 0.02, 0.012, 0.012, 0.11, PL.metalDark);
      BX(s, o.lx + w / 2 - 0.02, y - 0.02, lz - 0.02, 0.012, 0.012, 0.11, PL.metalDark);
    }

    // Small balcony with railing + door + plants.
    function balcony(s, o) {
      const w = o.w, y = o.y, lz = s.d / 2 + 0.075;
      const col = o.color || PL.stone[0];
      BX(s, o.lx, y, lz, w, 0.022, 0.15, col);
      BX(s, o.lx, y - 0.02, lz - 0.055, w, 0.02, 0.02, K.shade(col, -0.07, 0, 0));
      // railing
      const rail = o.rail || PL.metalDark;
      BX(s, o.lx, y + 0.085, lz + 0.065, w, 0.012, 0.012, rail);
      const nb = MATH.max(3, Math.round(w / 0.05) | 0);
      for (let i = 0; i < nb; i++) {
        BX(s, o.lx - w / 2 + (i + 0.5) * (w / nb), y + 0.045, lz + 0.065, 0.008, 0.085, 0.008, rail);
      }
      // side rails
      BX(s, o.lx - w / 2, y + 0.045, lz + 0.01, 0.008, 0.09, 0.09, rail);
      BX(s, o.lx + w / 2, y + 0.045, lz + 0.01, 0.008, 0.09, 0.09, rail);
      // washing hung over the rail
      if (chance(0.55)) {
        for (let i = 0; i < 2 + ((rnd() * 2) | 0); i++) {
          const cx = o.lx - w * 0.32 + i * w * 0.3;
          BX(s, cx, y + 0.055, lz + 0.07, w * 0.22, 0.055, 0.006, pick(PL.cloth), { rx: 0.06 });
          BX(s, cx, y + 0.086, lz + 0.07, w * 0.22, 0.006, 0.008, 0x6b6155);
        }
      }
      // plant pots
      if (o.plants !== false) {
        for (let i = 0; i < 2; i++) {
          const px = o.lx + (i ? 0.7 : -0.7) * (w / 2 - 0.03);
          CY(s, px, y + 0.026, lz + 0.03, 0.019, 0.032, 0x9c6049, { seg: 6 });
          SP(s, px, y + 0.055, lz + 0.03, 0.026, pick(PL.foliage), { ws: 6, hs: 4, sy: 0.8 });
        }
      }
    }

    function chimney(s, o) {
      const x = o.x, z = o.z, y = o.y;
      const w = o.w || 0.055, h = o.h || 0.16;
      const col = o.color || PL.stone[1];
      BX(s, x, y + h / 2, z, w, h, w * 0.9, col);
      BX(s, x, y + h + 0.008, z, w * 1.35, 0.014, w * 1.2, K.shade(col, -0.06, 0.02, 0));
      CY(s, x, y + h * 0.55, z + w * 0.52, w * 0.16, h * 0.5, PL.rust, { seg: 6 });
      if (o.pots !== false) {
        for (let i = 0; i < 2; i++) {
          CY(s, x + (i ? 0.017 : -0.017), y + h + 0.03, z, 0.014, 0.038, 0x8f533f, { seg: 6 });
        }
      }
    }

    // Wall lantern; uses the emissive lamp bucket so it switches on at night.
    function wallLamp(s, side, along, y) {
      const f = faceLocal(s, side, along, 0.014);
      BX(s, f[0], y, f[1], 0.012, 0.012, 0.05, PL.metalDark, {});
      const l = faceLocal(s, side, along, 0.045);
      BX(s, l[0], y - 0.03, l[1], 0.028, 0.045, 0.028, PL.lamp, { bucket: 'lamp' });
      BX(s, l[0], y - 0.008, l[1], 0.036, 0.01, 0.036, PL.metalDark);
      BX(s, l[0], y - 0.056, l[1], 0.032, 0.008, 0.032, PL.metalDark);
    }

    // Narrow drainpipe down the front corner.
    function downpipe(s, side, along, top, bottom) {
      const f = faceLocal(s, side, along, 0.012);
      CY(s, f[0], (top + bottom) / 2, f[1], 0.009, top - bottom, 0x6b6257, { seg: 5 });
      CY(s, f[0], top, f[1], 0.013, 0.014, 0x6b6257, { seg: 5 });
    }

    // Damp stain near the base.
    function stain(s, side, along, y, w, h) {
      const f = faceLocal(s, side, along, 0.002);
      BX(s, f[0], y, f[1], ...faceDims(side, w, h, 0.004), K.shade(pick(PL.stoneDark), -0.05, -0.02, 0));
    }

    function pottedPlant(s, lx, y, lz, scale) {
      const k2 = scale || 1;
      CY(s, lx, y + 0.026 * k2, lz, 0.024 * k2, 0.05 * k2, 0x9c6049, { seg: 6 });
      SP(s, lx, y + 0.075 * k2, lz, 0.04 * k2, pick(PL.foliage), { ws: 6, hs: 4, sy: 0.9 });
      if (chance(0.5)) SP(s, lx + 0.012 * k2, y + 0.06 * k2, lz, 0.022 * k2, pick(PL.flower), { ws: 5, hs: 3, sy: 0.7 });
    }

    function laundryLine(s, a, b, y, sag) {
      const pa = lp(s, a[0], a[1]), pb = lp(s, b[0], b[1]);
      K.rope([pa[0], y, pa[1]], [pb[0], y, pb[1]], sag, 0.0035, 0xd8cbb4, { segments: 8, radial: 3 });
      const n = 4 + ((rnd() * 3) | 0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.7) / (n + 0.6);
        const x = pa[0] + (pb[0] - pa[0]) * t, z = pa[1] + (pb[1] - pa[1]) * t;
        const yy = y - sag * 4 * t * (1 - t) * 0.9;
        B.add(K.geoPlane(), pick(PL.cloth), {
          pos: [x, yy - 0.045, z], scale: [0.055, 0.085, 1],
          quat: qyxz(s.ry + 0.02 * (i - 1)), bucket: 'matte',
        });
      }
    }

    function crates(s, lx, y, lz, n, col) {
      for (let i = 0; i < n; i++) {
        const ox = (i % 3) * 0.05 - 0.05, oz = ((i / 3) | 0) * 0.05 - 0.025;
        const c = col || (chance(0.35) ? 0x8f533f : (chance(0.5) ? 0x7c8a6f : 0xd9cdb3));
        BX(s, lx + ox, y + 0.028 + ((i / 3) | 0) * 0.001, lz + oz, 0.044, 0.05, 0.038, c, { yaw: 0.15 * (i % 2 ? 1 : -1) });
      }
    }

    function barrel(s, lx, y, lz, r) {
      const rr = r || 0.03;
      CY(s, lx, y + 0.032, lz, rr, 0.062, 0x5c4130, { seg: 8 });
      CY(s, lx, y + 0.008, lz, rr * 1.04, 0.012, 0x3f2c21, { seg: 8 });
      CY(s, lx, y + 0.054, lz, rr * 1.04, 0.012, 0x3f2c21, { seg: 8 });
    }

    function flowerBed(s, lx, y, lz, w, d) {
      BX(s, lx, y + 0.018, lz, w, 0.036, d, PL.stone[3]);
      BX(s, lx, y + 0.03, lz, w * 0.92, 0.014, d * 0.9, 0x5c4a34);
      const n = MATH.max(3, (w * d * 900) | 0);
      for (let i = 0; i < n; i++) {
        const px = lx + (rnd() - 0.5) * (w * 0.8), pz = lz + (rnd() - 0.5) * (d * 0.8);
        SP(s, px, y + 0.045, pz, 0.016, pick(PL.flower), { ws: 5, hs: 3, sy: 0.7 });
        if (chance(0.6)) SP(s, px + 0.008, y + 0.04, pz, 0.012, pick(PL.foliageLight || PL.foliage), { ws: 5, hs: 3, sy: 0.6 });
      }
    }

    /* ====================================================================== */
    /*  house generator                                                       */
    /* ====================================================================== */
    const FH = 0.255;          // storey height

    function plasterPick() {
      const r = rnd();
      if (r < 0.34) return pick([0xe3d6be, 0xe8dcc6, 0xdac9ac, 0xdfd3bb, 0xe6dbc4]);
      if (r < 0.56) return pick([0xd3bd9f, 0xd9bf9e, 0xcfc0a8, 0xc9a882, 0xd7c6a8]);
      if (r < 0.74) return pick([0xbfc9c6, 0xb4c2c3, 0xc6cec6, 0xaebdbf, 0xbcc7c4]);
      if (r < 0.88) return pick([0xdcc4a3, 0xd0b18c, 0xc8b49c, 0xd4b695]);
      return pick([0xb6bfae, 0xa9b8ac, 0xbfc4b2]);
    }
    function roofPick() {
      const r = rnd();
      if (r < 0.62) return pick(PL.roofs);
      if (r < 0.86) return pick(PL.roofsSlate);
      return pick(PL.roofsGreen);
    }
    function styleFor(s) {
      const st = {
        plaster: plasterPick(),
        roof: roofPick(),
        shutter: pick(PL.shutters),
        trim: pick(PL.trim),
        door: pick(PL.doors),
        ridgeAxis: chance(0.34) ? 'z' : 'x',
        shop: false, awning: false, balcony: 0, laundry: false,
        lantern: chance(0.5), sign: null, dormer: chance(0.28),
        flowerBox: chance(0.55), pots: chance(0.6), stains: chance(0.7),
        weather: chance(0.3),
      };
      switch (s.n) {
        case 'k1': st.plaster = 0xd9c6b4; st.roof = 0xa65f47; st.shutter = 0x3f5a4a; st.shop = 'taverna'; st.awning = true; st.balcony = 1; st.laundry = true; st.sign = 'TAVERNA'; st.floors = 3; break;
        case 'k2': st.plaster = 0xe3d6be; st.roof = 0x9d5a43; st.shutter = 0x4a6470; st.balcony = 1; st.flowerBox = true; break;
        case 'k3': st.plaster = 0xcfc0a8; st.roof = 0x5a6570; st.shutter = 0x6d4032; st.shop = 'panificio'; st.awning = true; st.sign = 'PANIFICIO'; st.lantern = true; break;
        case 'k4': st.plaster = 0xdcc4a3; st.roof = 0xa5624a; st.shutter = 0x3f5a4a; st.balcony = 1; st.laundry = true; st.weather = true; break;
        case 'k5': st.plaster = 0xc8b49c; st.roof = 0x8f533f; st.shutter = 0x556b78; st.lantern = true; break;
        case 'up1': st.plaster = 0xd3bd9f; st.roof = 0xa65f47; st.shutter = 0x3f5a4a; st.balcony = 1; st.laundry = true; break;
        case 'n1': st.plaster = 0xd0b18c; st.roof = 0x8f533f; st.shutter = 0x3f5a4a; st.awning = false; break;
        case 'n2': st.plaster = 0xc9a882; st.roof = 0x9d5a43; st.shutter = 0x6d4032; break;
        case 'n3': st.plaster = 0xe0cfb4; st.roof = 0x5a6570; st.shutter = 0x4a6470; break;
        case 'n4': st.plaster = 0xd9bf9e; st.roof = 0xa65f47; st.shutter = 0x3f5a4a; break;
        case 'cafe': st.plaster = 0xe8dcc6; st.roof = 0xa5624a; st.shutter = 0x3f5a4a; st.shop = 'cafe'; st.awning = true; st.sign = 'CAFFÈ AURORA'; st.balcony = 1; break;
        case 'fishshop': st.plaster = 0xb4c2c3; st.roof = 0x5a6570; st.shutter = 0x4a6470; st.shop = 'fish'; st.awning = true; break;
        case 'pilot': st.plaster = 0xe4d7c0; st.roof = 0x5a6570; st.shutter = 0x46604f; st.sign = 'PILOT'; break;
        case 'office': st.plaster = 0xc6cec6; st.roof = 0x565f68; st.shutter = 0x4a6470; st.sign = 'HARBOUR'; break;
        case 'hotel': st.plaster = 0xd9c6b4; st.roof = 0x9d5a43; st.shutter = 0x3f5a4a; break;
        case 'w1': st.plaster = 0xcfc0a8; st.roof = 0x5a6570; break;
        default: break;
      }
      return st;
    }

    function buildHouse(s, st) {
      const p = probeSlot(s);
      st = st || styleFor(s);
      const floors = s.floors || st.floors || 2;
      const bodyH = 0.05 + floors * FH;
      const roofRise = 0.09 + s.w * 0.12 + range(0, 0.02);
      const R = { color: st.roof, ridgeAxis: st.ridgeAxis, over: 0.032, thick: 0.026 };
      const plaster = st.plaster;
      const trim = st.trim;

      /* plinth & steps ---------------------------------------------------- */
      const pH = s.floor - s.base;
      BX(s, 0, (s.floor + s.base) / 2, 0, s.w + 0.045, pH, s.d + 0.045, K.vary(PL.stone[1], rnd, { l: 0.05 }));
      BX(s, 0, s.floor + 0.012, 0, s.w + 0.072, 0.026, s.d + 0.072, K.vary(PL.stone[2], rnd, { l: 0.04 }));
      // base course (darker) + a couple of stone blocks
      const bcH = MATH.min(0.1, pH * 0.45);
      if (bcH > 0.03) {
        BX(s, 0, s.base + bcH / 2 + 0.02, 0, s.w + 0.058, bcH, s.d + 0.058, K.vary(PL.stoneDark[0], rnd, { l: 0.04 }));
      }
      if (pH > 0.24) {
        // stepped apron on the downhill (front) side -> reads as a stone terrace
        const stepY = s.floor - 0.075;
        BX(s, 0, stepY, s.d / 2 + 0.055, s.w + 0.02, 0.05, 0.075, K.vary(PL.stone[0], rnd));
        // masonry courses so the tall foundation reads as stone, not a blank box
        const nCo = MATH.max(2, Math.round(pH / 0.095));
        const fz2 = s.d / 2 + 0.024, sx2 = s.w / 2 + 0.024;
        for (let i = 0; i < nCo; i++) {
          const yy = s.base + 0.06 + i * 0.095;
          BX(s, 0, yy, fz2, s.w + 0.046, 0.009, 0.007, K.shade(PL.stoneDark[1], 0.02, 0, 0));
          BX(s, sx2, yy, 0, 0.007, 0.009, s.d + 0.046, K.shade(PL.stoneDark[1], 0.02, 0, 0));
          BX(s, -sx2, yy, 0, 0.007, 0.009, s.d + 0.046, K.shade(PL.stoneDark[1], 0.02, 0, 0));
        }
        // a small arched cellar door in some of the tall foundations
        if (pH > 0.42 && chance(0.45)) {
          const ax = (chance(0.5) ? 1 : -1) * (s.w / 2 - 0.11);
          BX(s, ax, s.base + pH * 0.42, fz2 + 0.004, 0.085, pH * 0.62, 0.012, 0x3a3630);
          CY(s, ax, s.base + pH * 0.73, fz2 + 0.004, 0.0425, 0.012, 0x3a3630, { rx: MATH.PI / 2, seg: 8 });
          BX(s, ax, s.base + pH * 0.05, fz2 + 0.006, 0.11, 0.02, 0.02, PL.stone[2]);
        }
      }

      /* body -------------------------------------------------------------- */
      BX(s, 0, s.floor + bodyH / 2, 0, s.w, bodyH, s.d, plaster);
      // top cornice + a shadow reveal under the eaves
      BX(s, 0, s.floor + bodyH - 0.012, 0, s.w + 0.022, 0.022, s.d + 0.022, K.shade(trim, 0.0, 0.02, 0));
      BX(s, 0, s.floor + bodyH - 0.03, 0, s.w + 0.006, 0.016, s.d + 0.006, K.shade(plaster, -0.07, 0, 0));
      // quoins on the two front corners
      if (chance(0.55)) {
        for (let sg = -1; sg <= 1; sg += 2) {
          BX(s, sg * (s.w / 2 - 0.012), s.floor + bodyH * 0.5, s.d / 2 - 0.012, 0.026, bodyH * 0.92, 0.026, K.shade(trim, -0.02, 0.02, 0));
        }
      }

      /* roof -------------------------------------------------------------- */
      const topY = s.floor + bodyH;
      gables(s, { w: s.w, d: s.d, top: topY, rise: roofRise, color: K.shade(plaster, -0.04, 0, 0), ridgeAxis: st.ridgeAxis });
      const ridgeY = roof(s, Object.assign({ w: s.w, d: s.d, top: topY, rise: roofRise }, R));

      /* chimney ----------------------------------------------------------- */
      const chX = (chance(0.5) ? 1 : -1) * s.w * 0.22;
      const chZ = st.ridgeAxis === 'x' ? range(-0.06, 0.06) : (chance(0.5) ? 1 : -1) * s.d * 0.2;
      const chY = st.ridgeAxis === 'x' ? ridgeY - 0.01 : topY + roofRise * 0.45;
      chimney(s, { x: chX, z: chZ, y: chY, h: 0.11 + range(0, 0.05), w: 0.05 + range(0, 0.012) });

      // dormer on the front roof slope
      if (st.dormer && st.ridgeAxis === 'x') {
        const dz = s.d * 0.22, dy = topY + roofRise * 0.45;
        BX(s, 0, dy + 0.03, dz, 0.1, 0.075, 0.08, K.shade(plaster, 0.02, 0, 0));
        BX(s, 0, dy + 0.006, dz + 0.042, 0.11, 0.02, 0.06, st.roof, { rx: 0.45 });
        BX(s, 0, dy + 0.026, dz + 0.043, 0.052, 0.045, 0.012, PL.glass, { bucket: 'glass' });
        BX(s, 0, dy + 0.026, dz + 0.05, 0.062, 0.055, 0.008, trim);
      }

      /* front facade ------------------------------------------------------ */
      const fz = s.d / 2;
      const nF = MATH.max(1, MATH.min(3, MATH.round((s.w - 0.02) / 0.145)));
      const winW = 0.108, winH = 0.128;
      const doorSlot = s.w > 0.34 ? 0 : 0; // door centred under the middle window
      for (let fl = 0; fl < floors; fl++) {
        const wy = s.floor + 0.055 + fl * FH + FH * 0.46;
        for (let i = 0; i < nF; i++) {
          const along = -s.w / 2 + ((i + 0.5) * s.w) / nF;
          const isDoor = fl === 0 && (i === (nF >> 1) || (s.w < 0.3 && i === 0));
          if (isDoor) continue;
          const lit = chance(0.44);
          windowUnit(s, {
            side: 'front', along: along, y: wy, w: winW, h: winH,
            shutter: chance(0.78) ? st.shutter : null, trim: trim, lit: lit,
            flowerBox: st.flowerBox && fl > 0 && chance(0.5),
          });
        }
      }
      // door
      const doorAlong = -s.w / 2 + ((((nF >> 1) + 0.5) * s.w) / nF);
      doorUnit(s, {
        side: 'front', along: doorAlong, y: s.floor, w: 0.11, h: 0.19,
        frame: trim, color: st.door,
      });
      // a second small door (cellar / side entrance) sometimes
      if (chance(0.35) && s.w > 0.36) {
        doorUnit(s, { side: 'front', along: s.w / 2 - 0.06, y: s.floor, w: 0.07, h: 0.14, frame: trim, color: K.shade(st.door, 0.05, 0, 0) });
      }

      // side windows (both cheeks) — fewer, smaller
      const nS = s.d > 0.3 ? 2 : 1;
      for (let side = 0; side < 2; side++) {
        const sn = side ? 'right' : 'left';
        for (let fl = 1; fl < floors; fl++) {
          for (let i = 0; i < nS; i++) {
            const along = -s.d / 2 + ((i + 0.5) * s.d) / nS;
            windowUnit(s, { side: sn, along: along, y: s.floor + 0.055 + fl * FH + FH * 0.46, w: 0.095, h: 0.115, shutter: chance(0.4) ? st.shutter : null, trim: trim, lit: chance(0.34) });
          }
        }
      }
      // back: one or two small openings
      for (let i = 0; i < 2; i++) {
        if (!chance(0.7)) continue;
        const along = -s.w / 2 + ((i + 0.5) * s.w) / 2;
        windowUnit(s, { side: 'back', along: along, y: s.floor + 0.055 + FH * 1.46, w: 0.085, h: 0.1, shutter: null, trim: trim, lit: chance(0.2), sill: false });
      }

      /* shop / awning / sign ---------------------------------------------- */
      if (st.shop) {
        const ay = s.floor + 0.055 + FH * 1.0;
        awning(s, { lx: 0, y: ay, w: s.w * 0.94 });
        // shop window (wide) + door
        windowUnit(s, { side: 'front', along: 0, y: s.floor + 0.16, w: 0.19, h: 0.15, shutter: null, trim: trim, lit: true, sill: false });
        if (st.sign) {
          signPlate(s, st.sign, 0, s.floor + 0.32, s.d / 2 + 0.028, s.w * 0.9, 0.085, { bg: '#33302a', fg: '#f0e4cc', border: '#c6a169' });
        }
        // hanging bracket sign
        if (chance(0.5)) {
          const bx = -s.w / 2 + 0.035;
          BX(s, bx, s.floor + 0.36, s.d / 2 + 0.045, 0.008, 0.008, 0.09, PL.metalDark);
          BX(s, bx, s.floor + 0.30, s.d / 2 + 0.075, 0.008, 0.12, 0.008, PL.metalDark);
          signPlate(s, null, bx, s.floor + 0.3, s.d / 2 + 0.082, 0.075, 0.06, { bg: '#8f533f', fg: '#f0e4cc', border: '#3f2c21', text: '§' });
        }
      } else if (chance(0.3)) {
        // a small shop just on the ground floor with a plain painted board
        BX(s, 0, s.floor + 0.3, s.d / 2 + 0.012, s.w * 0.7, 0.05, 0.012, K.shade(plaster, -0.18, 0.04, 0));
        BX(s, 0, s.floor + 0.3, s.d / 2 + 0.02, s.w * 0.62, 0.022, 0.008, 0xd8cbb4);
      }

      if (st.balcony) {
        const by = s.floor + 0.055 + FH * 1.0;
        balcony(s, { lx: 0, y: by, w: MATH.min(0.2, s.w * 0.5) });
        doorUnit(s, { side: 'front', along: 0, y: by + 0.005, w: 0.085, h: 0.15, frame: trim, color: st.door });
      }

      // wall niche with a small lamp (a bit of lived-in charm)
      if (chance(0.3) && floors >= 2) {
        const nx = (chance(0.5) ? 1 : -1) * (s.w / 2 - 0.075);
        const ny = s.floor + 0.055 + FH * 1.02;
        BX(s, nx, ny, s.d / 2 + 0.006, 0.075, 0.1, 0.012, K.shade(trim, -0.1, 0.02, 0));
        BX(s, nx, ny, s.d / 2 + 0.013, 0.055, 0.075, 0.008, 0x4a4238);
        BX(s, nx, ny - 0.01, s.d / 2 + 0.017, 0.03, 0.045, 0.006, PL.lamp, { bucket: 'lamp' });
        BX(s, nx, ny - 0.038, s.d / 2 + 0.018, 0.055, 0.008, 0.018, PL.stone[2]);
      }
      if (st.lantern) wallLamp(s, 'front', s.w / 2 - 0.05, s.floor + 0.055 + FH * 0.9);
      // downpipe at one front corner
      if (chance(0.6)) downpipe(s, 'front', (chance(0.5) ? 1 : -1) * (s.w / 2 - 0.022), s.floor + bodyH - 0.02, s.floor + 0.02);
      // stains
      if (st.stains) {
        for (let i = 0; i < 2; i++) {
          stain(s, 'front', range(-s.w * 0.35, s.w * 0.35), s.floor + 0.09, 0.06 + range(0, 0.05), 0.14 + range(0, 0.1));
        }
      }
      // wall-anchored pots / flower boxes
      if (st.pots) {
        pottedPlant(s, -s.w / 2 + 0.05, s.floor + 0.01, s.d / 2 + 0.05, 0.9);
        if (chance(0.5)) pottedPlant(s, s.w / 2 - 0.05, s.floor + 0.01, s.d / 2 + 0.05, 0.8);
      }
      // roof-top detail: a small weathervane or tv aerial
      if (st.weather) {
        CY(s, 0, ridgeY + 0.14, 0, 0.004, 0.22, PL.metalDark, { seg: 4 });
        BX(s, 0, ridgeY + 0.24, 0, 0.05, 0.006, 0.006, PL.metalDark);
      }
      K.count('buildings', 1);
      claim(s);
      s.topY = ridgeY;
      return s;
    }

    // A textured sign board (batched when purely graphic, K.sign when it has text).
    function signPlate(s, text, lx, y, lz, w, h, o) {
      o = o || {};
      const p = lp(s, lx, lz);
      if (text) {
        K.sign({
          x: p[0], y: y, z: p[1], ry: s.ry, w: w, h: h,
          text: text, bg: o.bg || '#2f2c26', fg: o.fg || '#efe3cd', border: o.border || '#b9935a',
          night: true, font: K.fonts.serif, letterSpacing: 1,
        });
      } else {
        // painted board, no text (cheap): frame + face
        BX(s, lx, y, lz - 0.004, w, h, 0.012, o.border || 0x8f533f);
        BX(s, lx, y, lz + 0.002, w * 0.88, h * 0.72, 0.01, o.bgNum || 0xd8cbb4);
      }
    }

    /* ====================================================================== */
    /*  church + campanile + clock                                            */
    /* ====================================================================== */
    const LM = { clocks: [], fountain: null, flags: [], umbrellas: [] };

    function buildChurch(s) {
      probeSlot(s);
      const floor = s.floor, w = s.w, d = s.d;
      const wallH = 0.30, rise = 0.13;
      const plaster = 0xe7ddc8, trim = 0xe9e0cc, roofCol = 0xa65f47;
      const stone = PL.stone[1];

      /* podium ----------------------------------------------------------- */
      const pH = floor - s.base;
      BX(s, 0, (floor + s.base) / 2, 0, w + 0.12, pH, d + 0.12, K.vary(stone, rnd, { l: 0.05 }));
      BX(s, 0, floor + 0.014, 0, w + 0.15, 0.028, d + 0.15, PL.stone[2]);
      // front steps (south)
      for (let i = 0; i < 2; i++) {
        BX(s, 0, floor - 0.02 - i * 0.036, d / 2 + 0.10 + i * 0.045, w * 0.55, 0.034, 0.05 + i * 0.02, PL.stone[2]);
      }

      /* nave ------------------------------------------------------------- */
      BX(s, 0, floor + wallH / 2, 0, w, wallH, d, plaster);
      // pilasters on the long walls
      for (let sg = -1; sg <= 1; sg += 2) {
        for (let i = -1; i <= 1; i++) {
          BX(s, sg * (w / 2 - 0.008), floor + wallH * 0.5, i * d * 0.3, 0.03, wallH * 0.94, 0.04, K.shade(trim, -0.02, 0, 0));
        }
      }
      // cornice
      BX(s, 0, floor + wallH - 0.012, 0, w + 0.03, 0.025, d + 0.03, trim);
      // roof
      const ridgeY = roof(s, { w: w, d: d, top: floor + wallH, rise: rise, color: roofCol, ridgeAxis: 'z', over: 0.045, thick: 0.028 });
      gables(s, { w: w, d: d, top: floor + wallH, rise: rise, color: K.shade(plaster, -0.03, 0, 0), ridgeAxis: 'z' });

      /* apse (north end) -------------------------------------------------- */
      CY(s, 0, floor + rideA(wallH), -d / 2 - 0.02, w * 0.34, wallH, plaster, { seg: 10 });
      CO(s, 0, floor + wallH + rise * 0.55 + 0.05, -d / 2 - 0.02, w * 0.36, 0.12, roofCol, { seg: 10 });
      BX(s, 0, floor - pH * 0.5 + 0.02, -d / 2 - 0.02, w * 0.62, pH, 0.06, stone);

      /* side windows (tall, arched) --------------------------------------- */
      for (let sg = -1; sg <= 1; sg += 2) {
        for (let i = -1; i <= 1; i++) {
          const z = i * d * 0.3;
          windowUnit(s, { side: sg < 0 ? 'left' : 'right', along: z, y: floor + wallH * 0.55, w: 0.045, h: 0.15, shutter: null, trim: trim, lit: chance(0.75), sill: false });
          // arch head
          CY(s, sg * (w / 2 + 0.002), floor + wallH * 0.55 + 0.083, z, 0.026, 0.014, trim, { rx: MATH.PI / 2, seg: 8 });
        }
      }

      /* west facade: door, rose window, gable cross ----------------------- */
      doorUnit(s, { side: 'front', along: 0, y: floor, w: 0.15, h: 0.24, frame: PL.stone[2], color: 0x5c4130, canopy: null });
      // arch over the door
      CY(s, 0, floor + 0.25, d / 2 + 0.008, 0.085, 0.02, PL.stone[2], { rx: MATH.PI / 2, seg: 12 });
      CY(s, 0, floor + 0.25, d / 2 + 0.014, 0.058, 0.015, 0x4a3527, { rx: MATH.PI / 2, seg: 12 });
      // rose window
      CY(s, 0, floor + wallH * 0.72, d / 2 + 0.006, 0.062, 0.012, PL.stone[2], { rx: MATH.PI / 2, seg: 12 });
      CY(s, 0, floor + wallH * 0.72, d / 2 + 0.013, 0.046, 0.01, 0x3f5a5e, { rx: MATH.PI / 2, seg: 12, bucket: 'glass' });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * MATH.PI;
        BX(s, 0, floor + wallH * 0.72, d / 2 + 0.019, 0.09 * MATH.cos(a - Math.PI / 2), 0.006, 0.006, 0xd8cbb4, { rz: a });
        BX(s, 0, floor + wallH * 0.72, d / 2 + 0.019, 0.006, 0.09 * MATH.sin(a - Math.PI / 2), 0.006, 0xd8cbb4);
      }
      // gable cross
      CY(s, 0, floor + wallH + rise + 0.1, d / 2 - 0.05, 0.008, 0.18, PL.stone[2], { seg: 4 });
      BX(s, 0, floor + wallH + rise + 0.145, d / 2 - 0.05, 0.075, 0.008, 0.008, PL.stone[2]);

      /* campanile (SW corner) --------------------------------------------- */
      const tx = -w / 2 + 0.10, tz = d / 2 - 0.10;
      const shaftH = 1.12;
      BX(s, tx, floor + 0.06, tz, 0.225, 0.12, 0.225, PL.stone[1]);          // base
      BX(s, tx, floor + 0.16 + shaftH / 2, tz, 0.19, shaftH, 0.19, K.shade(plaster, 0.01, 0, 0));
      // string courses
      for (let i = 0; i < 3; i++) {
        BX(s, tx, floor + 0.30 + i * shaftH * 0.32, tz, 0.205, 0.018, 0.205, trim);
      }
      // corner quoins
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * MATH.PI * 2 + Math.PI / 4;
        BX(s, tx + Math.cos(a) * 0.115, floor + 0.16 + shaftH / 2, tz + Math.sin(a) * 0.115, 0.028, shaftH * 0.96, 0.028, K.shade(trim, -0.03, 0.03, 0));
      }
      const belfryY = floor + 0.16 + shaftH + 0.13;
      BX(s, tx, belfryY, tz, 0.215, 0.26, 0.215, K.shade(plaster, 0.02, 0, 0));
      // belfry openings on the four sides (dark + louvres)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * MATH.PI * 2;
        const nx = Math.cos(a), nz = Math.sin(a);
        BX(s, tx + nx * 0.108, belfryY + 0.03, tz + nz * 0.108, Math.abs(nz) > 0.5 ? 0.11 : 0.014, 0.15, Math.abs(nz) > 0.5 ? 0.014 : 0.11, 0x2b2a26);
        for (let k = -1; k <= 1; k++) {
          BX(s, tx + nx * 0.112, belfryY + 0.03 + k * 0.042, tz + nz * 0.112, Math.abs(nz) > 0.5 ? 0.115 : 0.012, 0.012, Math.abs(nz) > 0.5 ? 0.012 : 0.115, 0xd8cbb4);
        }
      }
      // cornice + pyramid roof + cross
      BX(s, tx, belfryY + 0.14, tz, 0.245, 0.022, 0.245, trim);
      CO(s, tx, belfryY + 0.26, tz, 0.175, 0.19, roofCol, { seg: 4, yaw: Math.PI / 4 });
      CY(s, tx, belfryY + 0.37, tz, 0.008, 0.1, PL.stone[2], { seg: 4 });
      BX(s, tx, belfryY + 0.41, tz, 0.05, 0.007, 0.007, PL.stone[2]);

      /* clock faces (south + east) ---------------------------------------- */
      const faceY = floor + 0.2 + shaftH * 0.52;
      const faces = [
        { lx: tx, lz: tz + 0.112, ry: s.ry },
        { lx: tx + 0.112, lz: tz, ry: s.ry + MATH.PI / 2 },
      ];
      for (let i = 0; i < faces.length; i++) {
        const f = faces[i];
        CY(s, f.lx, faceY, f.lz, 0.077, 0.012, PL.stone[2], { rx: MATH.PI / 2, yaw: i ? MATH.PI / 2 : 0, seg: 14 });
        const wp = lp(s, f.lx, f.lz);
        // face normal offset
        const nx = i ? 1 : 0, nz = i ? 0 : 1;
        const c = MATH.cos(s.ry), sn = MATH.sin(s.ry);
        const ox = nx * c + nz * sn, oz = -nx * sn + nz * c;
        LM.clocks.push({ x: wp[0] + ox * 0.008, y: faceY, z: wp[1] + oz * 0.008, ry: f.ry });
      }

      /* bells / small details --------------------------------------------- */
      BX(s, tx, floor + 0.16 + shaftH * 0.4, tz + 0.1, 0.13, 0.02, 0.02, trim); // a small corbel
      K.count('buildings', 1);
      claim(s);
      s.topY = belfryY + 0.4;
      return s;
    }
    function rideA(h) { return h / 2; }

    /* ====================================================================== */
    /*  plaza, fountain, benches                                              */
    /* ====================================================================== */
    function buildPlaza(s) {
      probeSlot(s);
      const top = s.hMax + 0.03;
      const base = s.hMin - 0.25;
      const w = s.w, d = s.d;
      const stone = PL.stone[1];
      // terrace body (stone) + paving
      BX(s, 0, (top + base) / 2, 0, w, top - base, d, stone);
      // masonry courses on the visible retaining faces
      const nC = MATH.max(1, Math.floor((top - base) / 0.095));
      for (let i = 0; i < nC; i++) {
        const yy = base + 0.06 + i * 0.095;
        BX(s, 0, yy, d / 2 + 0.003, w + 0.006, 0.009, 0.009, PL.stoneDark[1]);
        BX(s, w / 2 + 0.003, yy, 0, 0.009, 0.009, d + 0.006, PL.stoneDark[1]);
        BX(s, -w / 2 - 0.003, yy, 0, 0.009, 0.009, d + 0.006, PL.stoneDark[1]);
      }
      BX(s, 0, top - 0.008, 0, w - 0.005, 0.024, d - 0.005, PL.stone[2]);
      // paving pattern: darker band cross + border
      BX(s, 0, top + 0.006, 0, w * 0.62, 0.008, 0.035, K.shade(PL.stoneDark[0], 0.02, 0, 0));
      BX(s, 0, top + 0.006, 0, 0.035, 0.008, d * 0.62, K.shade(PL.stoneDark[0], 0.02, 0, 0));
      // parapet on the east (belvedere) edge
      BX(s, w / 2 - 0.02, top + 0.045, 0, 0.04, 0.09, d - 0.02, PL.stone[2]);
      BX(s, w / 2 - 0.02, top + 0.1, 0, 0.055, 0.02, d, PL.stone[3]);
      // parapet on the north edge
      BX(s, 0, top + 0.045, -d / 2 + 0.02, w - 0.06, 0.09, 0.04, PL.stone[2]);
      // steps down on the south side
      for (let i = 0; i < 4; i++) {
        BX(s, 0, top - 0.035 - i * 0.062, d / 2 + 0.02 + i * 0.05, w * 0.7, 0.062, 0.05 + i * 0.005, PL.stone[2]);
      }
      // fountain
      const fy = top + 0.012;
      const fr = 0.105;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * MATH.PI * 2 + Math.PI / 8;
        BX(s, Math.cos(a) * (fr - 0.012), fy + 0.026, Math.sin(a) * (fr - 0.012), 0.032, 0.052, 0.02, PL.stone[2], { yaw: -a });
      }
      CY(s, 0, fy + 0.026, 0, fr, 0.052, K.shade(PL.stone[2], 0, 0, 0), { seg: 8, yaw: Math.PI / 8 });
      CY(s, 0, fy + 0.05, 0, fr * 0.93, 0.012, PL.stone[3], { seg: 8, yaw: Math.PI / 8 });
      // water surface
      CY(s, 0, fy + 0.038, 0, fr * 0.86, 0.008, 0x8fbdb8, { seg: 12, bucket: 'glass' });
      // pedestal + bowl + finial
      CY(s, 0, fy + 0.084, 0, 0.03, 0.064, PL.stone[2], { seg: 8 });
      CY(s, 0, fy + 0.122, 0, 0.072, 0.02, PL.stone[3], { seg: 12 });
      CY(s, 0, fy + 0.14, 0, 0.014, 0.04, PL.stone[2], { seg: 8 });
      SP(s, 0, fy + 0.17, 0, 0.019, PL.stone[3], { ws: 8, hs: 5 });
      LM.fountain = { x: lp(s, 0, 0)[0], y: fy + 0.09, z: lp(s, 0, 0)[1] };
      // two benches
      benchAt(s, -w * 0.22, fy - 0.012, -d / 2 + 0.075, s.ry);
      benchAt(s, 0, fy - 0.012, -d / 2 + 0.075, s.ry);
      // cypresses + pots
      cypress(s, w * 0.34, s.hMax, -d * 0.34, 0.16);
      cypress(s, w * 0.34, s.hMax, d * 0.34, 0.13);
      pottedPlant(s, -w * 0.36, fy - 0.01, d * 0.3, 1.2);
      pottedPlant(s, -w * 0.36, fy - 0.01, -d * 0.3, 1.2);
      // lamp post on the belvedere
      lampPost(s, w / 2 - 0.06, fy, -d * 0.3, 0.36);
      K.count('buildings', 0);
      claim(s);
      return s;
    }

    function benchAt(s, lx, y, lz, ry) {
      const seat = lx, zz = lz;
      BX(s, seat, y + 0.045, zz, 0.19, 0.014, 0.05, PLA.wood || 0x7b5a40);
      BX(s, seat, y + 0.075, zz + 0.035, 0.19, 0.055, 0.012, 0x7b5a40);
      BX(s, seat - 0.07, y + 0.022, zz, 0.014, 0.045, 0.045, 0x3d403d);
      BX(s, seat + 0.07, y + 0.022, zz, 0.014, 0.045, 0.045, 0x3d403d);
    }
    const PLA = { wood: 0x7b5a40 };

    function lampPost(s, lx, y, lz, h) {
      CY(s, lx, y + h / 2, lz, 0.011, h, 0x3d403d, { seg: 6 });
      CY(s, lx, y + h * 0.94, lz, 0.02, 0.02, 0x3d403d, { seg: 6 });
      BX(s, lx, y + h + 0.045, lz, 0.042, 0.055, 0.042, PL.lamp, { bucket: 'lamp' });
      BX(s, lx, y + h + 0.082, lz, 0.06, 0.014, 0.06, 0x3d403d);
      SP(s, lx, y + h + 0.092, lz, 0.012, 0x3d403d, { ws: 6, hs: 4 });
    }

    function cypress(s, lx, y, lz, h) {
      const hh = h || 0.24;
      CY(s, lx, y + hh * 0.12, lz, 0.012, hh * 0.24, 0x4a3527, { seg: 5 });
      CO(s, lx, y + hh * 0.55, lz, hh * 0.16, hh * 0.95, pick(PL.cypress), { seg: 7 });
      CO(s, lx, y + hh * 0.78, lz, hh * 0.11, hh * 0.5, pick(PL.cypress), { seg: 7 });
    }

    /* ====================================================================== */
    /*  fish market                                                           */
    /* ====================================================================== */
    function buildMarket(s) {
      probeSlot(s);
      const floor = s.floor, w = s.w, d = s.d;
      const postH = 0.26;
      // stone plinth / floor slab
      BX(s, 0, (floor + s.base) / 2, 0, w + 0.01, floor - s.base, d + 0.01, PL.stone[1]);
      BX(s, 0, floor + 0.012, 0, w, 0.028, d, PL.stone[2]);
      // floor tiles (checker-ish)
      for (let i = 0; i < 4; i++) {
        BX(s, -w / 2 + (i + 0.5) * (w / 4), floor + 0.028, 0, w / 4 - 0.012, 0.006, d * 0.9, i % 2 ? 0xd3c8b4 : 0xc6bba6);
      }
      // posts
      const px = w / 2 - 0.045, pz = d / 2 - 0.045;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          if (!j && i !== 0) continue;
          BX(s, i * px, floor + 0.03 + postH / 2, j * pz, 0.032, postH, 0.032, 0x5c4130);
          BX(s, i * px, floor + 0.03 + postH, j * pz, 0.05, 0.014, 0.05, 0x4a3527);
        }
      }
      // beams
      BX(s, 0, floor + 0.03 + postH + 0.012, pz, w, 0.022, 0.03, 0x4a3527);
      BX(s, 0, floor + 0.03 + postH + 0.012, -pz, w, 0.022, 0.03, 0x4a3527);
      BX(s, 0, floor + 0.03 + postH + 0.028, 0, w, 0.024, 0.038, 0x4a3527);
      // low back wall (west) + end walls (already A-frame style)
      BX(s, 0, floor + 0.09, -d / 2 + 0.02, w, 0.14, 0.04, 0xc6bba6);
      // roof: shallow gable
      const top = floor + 0.03 + postH + 0.04;
      roof(s, { w: w, d: d + 0.12, lz: d * 0.28, top: top, rise: 0.12, color: 0x7c4936, ridgeAxis: 'x', over: 0.05, thick: 0.024, fascia: 0x5c4130 });
      gables(s, { w: w, d: d, top: top, rise: 0.11, color: 0xc6bba6, ridgeAxis: 'x' });
      // open truss ends
      BX(s, w / 2 + 0.02, top - 0.05, 0, 0.02, 0.1, 0.02, 0x4a3527);
      BX(s, -w / 2 - 0.02, top - 0.05, 0, 0.02, 0.1, 0.02, 0x4a3527);
      // stalls inside
      const sD = MATH.min(0.23, d * 0.72);      // stall depth (x)
      const sW = MATH.min(0.125, d * 0.34);     // stall width (z)
      for (let i = 0; i < 3; i++) {
        const sz = -d * 0.32 + i * (d * 0.32);
        BX(s, -w * 0.02, floor + 0.12, sz, sD, 0.028, sW, 0xdcd3c0);           // table top
        BX(s, -w * 0.02, floor + 0.055, sz, sD * 0.9, 0.11, sW * 0.78, 0xb6ad9d); // table body
        BX(s, -w * 0.02, floor + 0.135, sz, sD * 1.05, 0.008, sW * 1.06, 0xa8b0a6); // zinc top
        // fish on the slab
        for (let f = 0; f < 3; f++) {
          SP(s, -w * 0.02 + (f - 1) * sD * 0.3, floor + 0.146, sz + sW * 0.18, 0.017, f % 2 ? 0x9fb2b8 : 0xb1bfc2, { ws: 6, hs: 4, sy: 0.42, sz: 1.5 });
        }
        // awning over the stall
        BX(s, -w * 0.02, floor + 0.252, sz, sD * 1.3, 0.012, sW * 1.5, i % 2 ? 0xd9cbb4 : 0x6f8578, { rx: 0.2 });
        // hanging scale
        BX(s, w * 0.30, floor + 0.25, sz, 0.008, 0.07, 0.008, 0x6b6155);
        CY(s, w * 0.30, floor + 0.2, sz, 0.02, 0.028, 0x6b6155, { seg: 6 });
        BX(s, w * 0.30, floor + 0.186, sz, 0.028, 0.01, 0.028, 0x4a4238);
      }
      // crates & boxes along the open side
      crates(s, w * 0.28, floor + 0.028, -d * 0.1, 5);
      crates(s, -w * 0.34, floor + 0.028, d * 0.28, 3, 0x7c8a6f);
      for (let i = 0; i < 3; i++) {
        BX(s, w * 0.36, floor + 0.045 + i * 0.014, d * 0.3, 0.1, 0.028, 0.07, i === 2 ? 0xe4e0d2 : 0xd8d4c4); // ice blocks
      }
      barrel(s, -w * 0.4, floor + 0.028, -d * 0.32, 0.032);
      barrel(s, -w * 0.34, floor + 0.028, -d * 0.1, 0.028);
      // hanging nets
      for (let i = 0; i < 2; i++) {
        BX(s, -w / 2 + 0.06, floor + 0.2, -d * 0.2 + i * 0.18, 0.05, 0.14, 0.02, 0x8a7f68);
        BX(s, -w / 2 + 0.06, floor + 0.13, -d * 0.2 + i * 0.18, 0.06, 0.012, 0.03, 0x6b6155);
      }
      // hanging lamp
      BX(s, 0, top + 0.02, 0, 0.008, 0.03, 0.008, 0x3d403d);
      CY(s, 0, top - 0.01, 0, 0.026, 0.03, PL.lamp, { seg: 6, bucket: 'lamp' });
      // fishing smocks drying on a line under the roof
      laundryLine(s, [-w * 0.34, d * 0.24], [w * 0.34, d * 0.24], floor + 0.03 + postH - 0.01, 0.018);
      // sign over the open side
      signPlate(s, 'PESCHERIA · 鲜鱼', w * 0.28, top + 0.06, d / 2 - 0.02, 0.34, 0.075, { bg: '#2f2c26', fg: '#efe3cd', border: '#c6a169' });
      K.count('buildings', 1);
      claim(s);
      s.topY = top + 0.11;
      LM.market = { x: lp(s, 0, 0)[0], y: top + 0.13, z: lp(s, 0, 0)[1] };
      return s;
    }

    /* ====================================================================== */
    /*  cafe with a roof terrace                                              */
    /* ====================================================================== */
    function buildCafe(s) {
      probeSlot(s);
      const floors = 2, FH2 = FH;
      const bodyH = 0.05 + floors * FH2;
      const plaster = 0xe8dcc6, trim = 0xe4d7c0, roofCol = 0xa5624a;
      const floor = s.floor;
      // plinth
      BX(s, 0, (floor + s.base) / 2, 0, s.w + 0.05, floor - s.base, s.d + 0.05, PL.stone[1]);
      BX(s, 0, floor + 0.012, 0, s.w + 0.072, 0.026, s.d + 0.072, PL.stone[2]);
      // body
      BX(s, 0, floor + bodyH / 2, 0, s.w, bodyH, s.d, plaster);
      BX(s, 0, floor + bodyH - 0.014, 0, s.w + 0.026, 0.026, s.d + 0.026, trim);
      // flat roof + parapet
      const top = floor + bodyH;
      BX(s, 0, top + 0.02, 0, s.w + 0.03, 0.03, s.d + 0.03, K.shade(PL.stone[1], -0.02, 0, 0));
      BX(s, 0, top + 0.055, 0, s.w + 0.03, 0.06, 0.026, plaster);
      BX(s, 0, top + 0.055, s.d / 2, s.w + 0.03, 0.06, 0.026, plaster);
      BX(s, -s.w / 2, top + 0.055, 0, 0.026, 0.06, s.d, plaster);
      BX(s, 0, top + 0.088, 0, s.w + 0.05, 0.014, s.d + 0.05, PL.stone[2]);
      // roof terrace furniture: two tables, umbrellas, pots
      const ty = top + 0.045;
      for (let i = 0; i < 2; i++) {
        const lz = -s.d * 0.22 + i * s.d * 0.44;
        CY(s, 0, ty + 0.1, lz, 0.026, 0.012, 0xe8dfcd, { seg: 8 });      // table top
        CY(s, 0, ty + 0.055, lz, 0.005, 0.09, 0x4a4238, { seg: 5 });     // table leg
        BX(s, -0.055, ty + 0.03, lz, 0.05, 0.06, 0.05, 0x7b5a40);        // chair
        BX(s, 0.055, ty + 0.03, lz, 0.05, 0.06, 0.05, 0x7b5a40);
        pottedPlant(s, s.w * 0.34, ty, lz + 0.08, 1.1);
      }
      // front facade: awning, bar window, door, sign, lamps
      const ay = floor + 0.055 + FH2 * 1.0;
      awning(s, { lx: 0, y: ay, w: s.w * 0.96 });
      windowUnit(s, { side: 'front', along: -0.03, y: floor + 0.17, w: 0.2, h: 0.15, shutter: null, trim: trim, lit: true, sill: false });
      doorUnit(s, { side: 'front', along: s.w * 0.3, y: floor, w: 0.1, h: 0.18, frame: trim, color: 0x3f5a4a });
      // upper floor: two shuttered windows + a small balcony
      windowUnit(s, { side: 'front', along: -s.w * 0.22, y: floor + 0.055 + FH2 * 1.46, w: 0.1, h: 0.12, shutter: 0x3f5a4a, trim: trim, lit: true, flowerBox: true });
      windowUnit(s, { side: 'front', along: s.w * 0.22, y: floor + 0.055 + FH2 * 1.46, w: 0.1, h: 0.12, shutter: 0x3f5a4a, trim: trim, lit: true });
      balcony(s, { lx: 0, y: floor + 0.055 + FH2 * 1.0, w: 0.19 });
      signPlate(s, 'CAFFÈ AURORA', 0, floor + 0.36, s.d / 2 + 0.03, s.w * 0.86, 0.08, { bg: '#2f2c26', fg: '#f2e7cf', border: '#c6a169' });
      wallLamp(s, 'front', -s.w / 2 + 0.04, floor + 0.42);
      wallLamp(s, 'front', s.w / 2 - 0.04, floor + 0.42);
      // side + back windows
      for (let i = 0; i < 2; i++) {
        windowUnit(s, { side: 'right', along: -s.d * 0.22 + i * s.d * 0.44, y: floor + 0.055 + FH2 * 1.46, w: 0.085, h: 0.11, shutter: null, trim: trim, lit: chance(0.4) });
        windowUnit(s, { side: 'left', along: -s.d * 0.22 + i * s.d * 0.44, y: floor + 0.055 + FH2 * 1.46, w: 0.085, h: 0.11, shutter: null, trim: trim, lit: chance(0.4) });
      }
      // umbrellas on the roof (animated)
      for (let i = 0; i < 2; i++) {
        const wp = lp(s, 0.0, -s.d * 0.22 + i * s.d * 0.44);
        LM.umbrellas.push({ x: wp[0], y: ty + 0.01, z: wp[1], phase: i * 1.7 });
      }
      // railing round the roof terrace
      for (let i = 0; i < 4; i++) {
        const sg = i < 2 ? -1 : 1;
        BX(s, sg * (s.w / 2 - 0.03), top + 0.12, (i % 2 ? -1 : 1) * (s.d * 0.28), 0.01, 0.075, 0.01, 0x3d403d);
      }
      K.count('buildings', 1);
      claim(s);
      s.topY = top + 0.09;
      return s;
    }

    /* ====================================================================== */
    /*  pilot station                                                         */
    /* ====================================================================== */
    function buildPilot(s) {
      probeSlot(s);
      const floors = 2;
      const bodyH = 0.05 + floors * FH;
      const floor = s.floor;
      const plaster = 0xe4d7c0, trim = 0xe8dfcd;
      BX(s, 0, (floor + s.base) / 2, 0, s.w + 0.05, floor - s.base, s.d + 0.05, PL.stone[1]);
      BX(s, 0, floor + 0.012, 0, s.w + 0.072, 0.026, s.d + 0.072, PL.stone[2]);
      BX(s, 0, floor + bodyH / 2, 0, s.w, bodyH, s.d, plaster);
      BX(s, 0, floor + bodyH - 0.014, 0, s.w + 0.026, 0.026, s.d + 0.026, trim);
      const top = floor + bodyH;
      // roof
      roof(s, { w: s.w, d: s.d, top: top, rise: 0.1, color: 0x5a6570, ridgeAxis: 'x', over: 0.035, thick: 0.024 });
      gables(s, { w: s.w, d: s.d, top: top, rise: 0.1, color: K.shade(plaster, -0.03, 0, 0), ridgeAxis: 'x' });
      // lookout lantern on the roof
      const ly = top + 0.05;
      BX(s, 0, ly + 0.07, 0, 0.16, 0.14, 0.16, K.shade(plaster, 0.02, 0, 0));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * MATH.PI * 2;
        BX(s, Math.cos(a) * 0.081, ly + 0.07, Math.sin(a) * 0.081, Math.abs(Math.sin(a)) > 0.5 ? 0.1 : 0.012, 0.075, Math.abs(Math.sin(a)) > 0.5 ? 0.012 : 0.1, PL.glass, { bucket: 'glass' });
      }
      BX(s, 0, ly + 0.145, 0, 0.19, 0.016, 0.19, 0x3d403d);
      SP(s, 0, ly + 0.16, 0, 0.02, 0xd8b87c, { ws: 8, hs: 5 });     // brass beacon
      // mast + semaphore + vane
      CY(s, s.w * 0.36, top + 0.34, -s.d * 0.3, 0.008, 0.62, 0x6b6155, { seg: 5 });
      BX(s, s.w * 0.36 + 0.09, top + 0.55, -s.d * 0.3, 0.16, 0.012, 0.012, 0x8f533f);
      BX(s, s.w * 0.36, top + 0.62, -s.d * 0.3, 0.05, 0.006, 0.006, 0x3d403d);
      // windows + door + sign
      for (let fl = 0; fl < floors; fl++) {
        for (let i = 0; i < 2; i++) {
          windowUnit(s, { side: 'front', along: (i - 0.5) * s.w * 0.5, y: floor + 0.055 + fl * FH + FH * 0.46, w: 0.1, h: 0.12, shutter: 0x46604f, trim: trim, lit: chance(0.5) });
        }
      }
      doorUnit(s, { side: 'front', along: 0, y: floor, w: 0.11, h: 0.19, frame: trim, color: 0x4a6470, canopy: 0x5a6570 });
      signPlate(s, 'PILOT · 引航', 0, top - 0.08, s.d / 2 + 0.03, 0.22, 0.06, { bg: '#2f4048', fg: '#efe3cd', border: '#c6a169' });
      wallLamp(s, 'front', s.w / 2 - 0.04, floor + 0.36);
      // life ring + bench outside
      BX(s, -s.w / 2 - 0.005, floor + 0.24, s.d * 0.2, 0.012, 0.055, 0.055, 0xc98c74);
      benchAt(s, -s.w * 0.1, floor, s.d / 2 + 0.1, s.ry);
      K.count('buildings', 1);
      claim(s);
      s.topY = top + 0.16;
      return s;
    }

    /* ====================================================================== */
    /*  harbour office                                                        */
    /* ====================================================================== */
    function buildOffice(s) {
      probeSlot(s);
      const floors = 2, bodyH = 0.05 + floors * FH;
      const floor = s.floor, plaster = 0xc6cec6, trim = 0xd9d6c6;
      BX(s, 0, (floor + s.base) / 2, 0, s.w + 0.05, floor - s.base, s.d + 0.05, PL.stone[1]);
      BX(s, 0, floor + 0.012, 0, s.w + 0.072, 0.026, s.d + 0.072, PL.stone[2]);
      BX(s, 0, floor + bodyH / 2, 0, s.w, bodyH, s.d, plaster);
      BX(s, 0, floor + bodyH - 0.012, 0, s.w + 0.024, 0.024, s.d + 0.024, trim);
      const top = floor + bodyH;
      // flat roof with parapet + a small pediment over the door
      BX(s, 0, top + 0.02, 0, s.w + 0.02, 0.03, s.d + 0.02, K.shade(PL.stone[1], -0.02, 0, 0));
      BX(s, 0, top + 0.06, s.d / 2 - 0.02, s.w + 0.02, 0.07, 0.03, plaster);
      BX(s, 0, top + 0.06, -s.d / 2 + 0.02, s.w + 0.02, 0.07, 0.03, plaster);
      for (let fl = 0; fl < floors; fl++) {
        for (let i = 0; i < 2; i++) {
          windowUnit(s, { side: 'front', along: (i - 0.5) * s.w * 0.48, y: floor + 0.055 + fl * FH + FH * 0.46, w: 0.09, h: 0.11, shutter: null, trim: trim, lit: chance(0.45) });
        }
      }
      doorUnit(s, { side: 'front', along: 0, y: floor, w: 0.1, h: 0.18, frame: trim, color: 0x3f5a4a, canopy: trim });
      signPlate(s, 'HARBOUR OFFICE', 0, floor + 0.3, s.d / 2 + 0.028, 0.28, 0.05, { bg: '#2f4048', fg: '#efe3cd', border: '#c6a169' });
      wallLamp(s, 'front', 0, floor + 0.44);
      // flag pole
      CY(s, s.w * 0.42, top + 0.28, -s.d * 0.36, 0.007, 0.5, 0xd9d2c2, { seg: 5 });
      BX(s, s.w * 0.42 + 0.05, top + 0.46, -s.d * 0.36, 0.1, 0.06, 0.004, 0x8d4b3f);
      K.count('buildings', 1);
      claim(s);
      s.topY = top + 0.1;
      return s;
    }

    /* ====================================================================== */
    /*  ice house                                                             */
    /* ====================================================================== */
    function buildIce(s) {
      probeSlot(s);
      const floor = s.floor, base = s.base;
      const h = 0.26;
      BX(s, 0, (floor + base) / 2, 0, s.w + 0.06, floor - base, s.d + 0.06, PL.stoneDark[1]);
      BX(s, 0, floor + 0.012, 0, s.w + 0.05, 0.026, s.d + 0.05, PL.stone[1]);
      BX(s, 0, floor + h / 2, 0, s.w, h, s.d, 0xbfb49f);       // thick stone walls
      BX(s, 0, floor + h - 0.012, 0, s.w + 0.03, 0.024, s.d + 0.03, PL.stone[1]);
      // hipped-ish roof (low gable)
      roof(s, { w: s.w, d: s.d, top: floor + h, rise: 0.08, color: 0x5a6570, ridgeAxis: 'x', over: 0.035, thick: 0.024 });
      gables(s, { w: s.w, d: s.d, top: floor + h, rise: 0.08, color: 0xb6a68c, ridgeAxis: 'x' });
      // insulated door (small, metal)
      BX(s, 0, floor + 0.1, s.d / 2 + 0.012, 0.09, 0.17, 0.026, 0x8a8f86);
      BX(s, 0, floor + 0.1, s.d / 2 + 0.026, 0.07, 0.15, 0.008, 0x6f756c);
      BX(s, 0.03, floor + 0.1, s.d / 2 + 0.032, 0.008, 0.03, 0.008, 0x3d403d);
      // vents
      CY(s, 0.05, floor + h + 0.03, -s.d * 0.25, 0.016, 0.06, 0x6f756c, { seg: 6 });
      CY(s, -0.06, floor + h + 0.03, -s.d * 0.1, 0.014, 0.05, 0x6f756c, { seg: 6 });
      // frost stains
      stain(s, 'front', -s.w * 0.28, floor + 0.05, 0.05, 0.12);
      signPlate(s, 'ICE', 0, floor + 0.24, s.d / 2 + 0.02, 0.12, 0.045, { bg: '#2f4048', fg: '#cfe3dc', border: '#8a938c' });
      K.count('buildings', 1);
      claim(s);
      s.topY = floor + h + 0.08;
      return s;
    }

    /* ====================================================================== */
    /*  small shed / boathouse                                                */
    /* ====================================================================== */
    function buildShed(s) {
      probeSlot(s);
      const floor = Math.max(s.floor, s.hMin + 0.06);
      const base = s.base;
      const w = s.w, d = s.d;
      const h = 0.2 + w * 0.12;
      // stone footing
      BX(s, 0, (floor + base) / 2, 0, w + 0.02, MATH.max(0.04, floor - base), d + 0.02, PL.stone[1]);
      // plank walls
      BX(s, 0, floor + h / 2, 0, w, h, d, K.vary(0x7a6047, rnd, { l: 0.06 }));
      for (let i = 0; i < 3; i++) {
        BX(s, 0, floor + 0.03 + i * h * 0.32, d / 2 + 0.004, w, 0.012, 0.01, 0x5c4130);
      }
      BX(s, 0, floor + h - 0.008, 0, w + 0.02, 0.016, d + 0.02, 0x5c4130);
      // mono-pitch roof
      BX(s, 0, floor + h + 0.045, 0.01, w + 0.05, 0.022, d + 0.09, 0x6b5a4a, { rx: -0.16 });
      BX(s, 0, floor + h + 0.085, -d / 2 - 0.02, w + 0.05, 0.02, 0.03, 0x5c4130);
      // door
      BX(s, -w * 0.2, floor + 0.1, d / 2 + 0.008, 0.08, 0.16, 0.014, 0x4a3527);
      // window
      BX(s, w * 0.26, floor + h * 0.6, d / 2 + 0.006, 0.07, 0.06, 0.012, 0x2a4650, { bucket: 'glass' });
      // hanging gear: buoys, nets
      for (let i = 0; i < 3; i++) {
        SP(s, -w * 0.4 + i * 0.03, floor + h * 0.7, d / 2 + 0.03, 0.018, i % 2 ? 0xc98c74 : 0x9fb2b8, { ws: 6, hs: 4, sy: 1.2 });
      }
      crates(s, w * 0.34, floor, d * 0.34, 2, 0x7c8a6f);
      K.count('buildings', 1);
      claim(s);
      s.topY = floor + h + 0.08;
      return s;
    }

    /* ====================================================================== */
    /*  fish shop                                                             */
    /* ====================================================================== */
    function buildFishShop(s) {
      probeSlot(s);
      const st = {
        plaster: 0xb4c2c3, roof: 0x5a6570, shutter: 0x4a6470, trim: 0xdfe4dc,
        door: 0x3f5a4a, ridgeAxis: 'x', shop: true, awning: true, balcony: 0,
        laundry: false, lantern: true, dormer: false, flowerBox: false, pots: true,
        stains: true, weather: false, sign: 'PESCE',
      };
      s.floors = 2;
      buildHouse(s, st);
      // extra: fish crates + an ice box outside
      const p = lp(s, s.w / 2 - 0.06, s.d / 2 + 0.16);
      crates(s, s.w / 2 - 0.1, s.floor + 0.01, s.d / 2 + 0.14, 4, 0x9fb2b8);
      barrel(s, -s.w / 2 + 0.06, s.floor + 0.01, s.d / 2 + 0.12, 0.026);
      BX(s, -s.w * 0.3, s.floor + 0.045, s.d / 2 + 0.12, 0.13, 0.09, 0.1, 0xd8d4c4);
      return s;
    }

    /* ====================================================================== */
    /*  warehouse (back row)                                                  */
    /* ====================================================================== */
    const WH_STYLE = {
      w1: { plaster: 0xd8cfba, roof: 0x5a6570, door: 0x51696a, name: '海关 CUSTOMS', h: 0.62, saw: false, tank: true, signKind: 'customs' },
      w2: { plaster: 0xcfc4ad, roof: 0x8f533f, door: 0x6f5050, name: 'AURORA COLD STORE', h: 0.54, saw: true, tank: true },
      w3: { plaster: 0xd2c9b2, roof: 0x7a6a52, door: 0x3f5a4a, name: '露港仓库 Nº3', h: 0.46, saw: false, tank: false },
      w4: { plaster: 0xc9bda3, roof: 0x8f533f, door: 0x5a5f5c, name: 'NORTH QUAY SUPPLY', h: 0.58, saw: true, tank: true },
      w5: { plaster: 0xd9d0bb, roof: 0x6b6a5a, door: 0x7a5238, name: 'HARBOUR CO-OP', h: 0.44, saw: false, tank: false },
      w6: { plaster: 0xcec2a8, roof: 0x8a5a52, door: 0x3f5a4a, name: 'BAIT & ICE', h: 0.5, saw: true, tank: true },
      w7: { plaster: 0xd4cab2, roof: 0x5a6570, door: 0x51696a, name: 'QUAY Nº7', h: 0.42, saw: false, tank: false },
      w8: { plaster: 0xc7bda6, roof: 0x6b6055, door: 0x5a5f5c, name: 'SIGNAL', h: 0.3, saw: false, tank: false },
    };
    function buildWarehouse(s) {
      probeSlot(s);
      const stl = WH_STYLE[s.n] || {};
      const floor = Math.max(1.14, s.floor);
      const base = s.base;
      const w = s.w, d = s.d;
      const h = stl.h || 0.45;
      // heavy stone quay foundation (the shore side drops away)
      BX(s, 0, (floor + base) / 2 - 0.02, 0, w + 0.02, floor - base + 0.04, d + 0.02, K.vary(PL.stone[0], rnd, { l: 0.05 }));
      // foundation courses
      const nc = MATH.max(1, Math.floor((floor - base) / 0.09));
      for (let i = 0; i < nc; i++) {
        BX(s, 0, base + 0.05 + i * 0.09, 0, w + 0.04, 0.012, d + 0.04, K.shade(PL.stoneDark[0], -0.02 + 0.01 * i, 0, 0));
      }
      // body
      BX(s, 0, floor + h / 2, 0, w, h, d, stl.plaster);
      // brick pilasters on the facade
      for (let i = -1; i <= 1; i += 2) {
        BX(s, i * (w / 2 - 0.03), floor + h / 2, d / 2 - 0.012, 0.055, h * 0.98, 0.03, K.shade(stl.plaster, -0.06, 0.03, 0));
      }
      // parapet band
      BX(s, 0, floor + h - 0.014, 0, w + 0.02, 0.028, d + 0.02, K.shade(stl.plaster, -0.09, 0.02, 0));
      /* roof ------------------------------------------------------------- */
      const top = floor + h;
      if (stl.saw) {
        // sawtooth: three north-light teeth along x
        const n = 3, tw = (w - 0.04) / n;
        for (let i = 0; i < n; i++) {
          const cx = -w / 2 + tw * (i + 0.5);
          BX(s, cx, top + 0.05, 0, tw * 0.98, 0.02, d + 0.02, stl.roof, { rx: 0.34 });
          BX(s, cx, top + 0.045, -d / 2 + 0.02, tw * 0.98, 0.11, 0.03, K.shade(stl.plaster, 0.02, 0, 0));
          BX(s, cx, top + 0.055, d / 2 - 0.02, tw * 0.98, 0.13, 0.03, 0x3a4640);
        }
        BX(s, 0, top + 0.005, 0, w, 0.02, d + 0.02, K.shade(stl.plaster, -0.05, 0, 0));
      } else {
        roof(s, { w: w, d: d, top: top, rise: 0.07 + w * 0.03, color: stl.roof, ridgeAxis: 'x', over: 0.03, thick: 0.024 });
        gables(s, { w: w, d: d, top: top, rise: 0.07 + w * 0.03, color: K.shade(stl.plaster, -0.04, 0, 0), ridgeAxis: 'x' });
      }
      /* loading dock + roller door --------------------------------------- */
      const fz = d / 2;
      BX(s, 0, floor - 0.035, fz + 0.06, w * 0.96, 0.07, 0.13, K.shade(PL.stone[1], -0.05, 0, 0)); // dock platform
      for (let i = 0; i < 2; i++) {
        BX(s, -w * 0.18 + i * w * 0.36, floor + 0.12, fz + 0.012, 0.34, 0.24, 0.024, 0x6f756c);
        // roller slats
        for (let k = 0; k < 7; k++) {
          BX(s, -w * 0.18 + i * w * 0.36, floor + 0.03 + k * 0.033, fz + 0.026, 0.33, 0.024, 0.006, k % 2 ? 0x8a8f86 : 0x757b73);
        }
        BX(s, -w * 0.18 + i * w * 0.36, floor + 0.25, fz + 0.02, 0.37, 0.02, 0.03, 0x4a4238);
      }
      // personnel door + small windows
      BX(s, w * 0.4, floor + 0.1, fz + 0.01, 0.07, 0.2, 0.02, stl.door);
      BX(s, -w * 0.42, floor + h * 0.72, fz + 0.012, 0.08, 0.06, 0.014, PL.glass, { bucket: 'glass' });
      BX(s, -w * 0.42, floor + h * 0.72, fz + 0.02, 0.09, 0.075, 0.008, 0xd8cfba);
      // lamp light over the door (lit at night)
      BX(s, w * 0.4, floor + 0.26, fz + 0.03, 0.03, 0.03, 0.02, PL.lamp, { bucket: 'lamp' });
      BX(s, w * 0.4, floor + 0.28, fz + 0.02, 0.05, 0.01, 0.03, 0x3d403d);
      /* roof clutter ------------------------------------------------------ */
      if (stl.tank) {
        const tx = w * 0.28, tz = -d * 0.22;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * MATH.PI * 2 + Math.PI / 4;
          BX(s, tx + Math.cos(a) * 0.055, top + 0.11, tz + Math.sin(a) * 0.055, 0.012, 0.12, 0.012, 0x5a5f5c);
        }
        CY(s, tx, top + 0.2, tz, 0.062, 0.11, 0x8a8f86, { seg: 10 });
        CY(s, tx, top + 0.26, tz, 0.064, 0.02, 0x6f756c, { seg: 10 });
      }
      // HVAC boxes + vent stacks
      BX(s, -w * 0.24, top + 0.05, -d * 0.2, 0.16, 0.08, 0.13, 0xb0b4ab);
      BX(s, -w * 0.24, top + 0.09, -d * 0.2, 0.15, 0.01, 0.12, 0x8a8f86);
      CY(s, w * 0.06, top + 0.13, -d * 0.28, 0.018, 0.26, 0x9a9e94, { seg: 6 });
      CY(s, w * 0.06, top + 0.27, -d * 0.28, 0.028, 0.02, 0x5a5f5c, { seg: 6 });
      // ladder on the facade
      for (let i = 0; i < 2; i++) {
        BX(s, w * 0.36 + i * 0.028, floor + h * 0.5, fz + 0.03, 0.006, h, 0.006, 0x5a5f5c);
      }
      for (let i = 0; i < 4; i++) {
        BX(s, w * 0.36 + 0.014, floor + 0.06 + i * (h * 0.24), fz + 0.03, 0.04, 0.005, 0.005, 0x5a5f5c);
      }
      // downpipe
      BX(s, -w / 2 + 0.02, floor + h * 0.5, fz + 0.02, 0.016, h, 0.016, 0x6b6155);
      /* painted sign board ------------------------------------------------ */
      if (stl.name) {
        signPlate(s, stl.name, 0, top - 0.13, fz + 0.03, Math.min(0.82, w * 0.82), 0.085,
          { bg: stl.signKind === 'customs' ? '#2f4048' : '#33302a', fg: '#f0e4cc', border: '#b9935a' });
        BX(s, 0, top - 0.13, fz + 0.012, Math.min(0.88, w * 0.86), 0.1, 0.016, K.shade(stl.plaster, -0.14, 0.02, 0));
      }
      // stains & weathering
      for (let i = 0; i < 2; i++) stain(s, 'front', range(-w * 0.45, w * 0.45), floor + 0.06, 0.05 + range(0, 0.04), 0.1 + range(0, 0.06));
      K.count('buildings', 1);
      claim(s);
      s.topY = top + 0.2;
      return s;
    }

    /* ====================================================================== */
    /*  terrace gardens + ruined watchtower + terrace walls                   */
    /* ====================================================================== */
    function buildGarden(s) {
      probeSlot(s);
      const top = s.hMax + 0.03;
      const base = s.hMin - 0.12;
      const w = s.w, d = s.d;
      // stone terrace body (retaining wall on the downhill side)
      BX(s, 0, (top + base) / 2, 0, w, top - base, d, K.vary(PL.stone[0], rnd, { l: 0.05 }));
      BX(s, 0, top - 0.006, 0, w + 0.012, 0.02, d + 0.012, PL.stone[2]);
      // dry-stone courses on the visible (south/west) faces
      const nc = MATH.max(1, Math.floor((top - base) / 0.085));
      for (let i = 0; i < nc; i++) {
        BX(s, 0, base + 0.045 + i * 0.085, d / 2 + 0.002, w + 0.006, 0.008, 0.008, K.shade(PL.stoneDark[0], -0.02, 0, 0));
        BX(s, -w / 2 - 0.002, base + 0.045 + i * 0.085, 0, 0.008, 0.008, d + 0.006, K.shade(PL.stoneDark[0], -0.02, 0, 0));
        BX(s, w / 2 + 0.002, base + 0.045 + i * 0.085, 0, 0.008, 0.008, d + 0.006, K.shade(PL.stoneDark[0], -0.02, 0, 0));
      }
      // soil + planting
      BX(s, 0, top + 0.022, 0, w * 0.9, 0.03, d * 0.9, 0x55432f);
      const n = 4 + ((rnd() * 4) | 0);
      for (let i = 0; i < n; i++) {
        const lx = (rnd() - 0.5) * w * 0.72, lz = (rnd() - 0.5) * d * 0.72;
        const p2 = lp(s, lx, lz);
        if (chance(0.45)) cypress(s, lx, top + 0.03, lz, 0.19 + rnd() * 0.12);
        else {
          GS(p2[0], top + 0.06, p2[1], 0.038 + rnd() * 0.02, K.vary(pick(PL.foliage), rnd), { ws: 7, hs: 5, sy: 0.8 });
        }
      }
      // a couple of flowers
      for (let i = 0; i < 5; i++) {
        const lx = (rnd() - 0.5) * w * 0.8, lz = (rnd() - 0.5) * d * 0.8;
        const p2 = lp(s, lx, lz);
        SP(s, lx, top + 0.05, lz, 0.014, pick(PL.flower), { ws: 5, hs: 3, sy: 0.65 });
      }
      // low parapet
      BX(s, 0, top + 0.045, -d / 2 + 0.015, w, 0.05, 0.03, PL.stone[2]);
      K.count('buildings', 0);
      claim(s);
      s.topY = top + 0.06;
      return s;
    }

    function buildTower(s) {
      probeSlot(s);
      const floor = s.floor, base = s.base;
      const r = 0.088;
      // ruined round watchtower
      BX(s, 0, (floor + base) / 2, 0, r * 2.5, floor - base + 0.04, r * 2.5, K.vary(PL.stone[1], rnd, { l: 0.05 }));
      CY(s, 0, floor + 0.24, 0, r, 0.48, K.vary(0xb6a68c, rnd, { l: 0.05 }), { seg: 12 });
      // stone courses
      for (let i = 0; i < 6; i++) CY(s, 0, floor + 0.04 + i * 0.085, 0, r + 0.004, 0.012, PL.stoneDark[0], { seg: 12 });
      // broken crenellations: uneven stubs round the top
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * MATH.PI * 2 + 0.15;
        const hh2 = chance(0.35) ? 0.02 : (chance(0.5) ? 0.05 : 0.085);
        BX(s, MATH.cos(a) * (r - 0.014), floor + 0.48 + hh2 / 2, Math.sin(a) * (r - 0.014), 0.038, hh2, 0.038, K.vary(PL.stone[1], rnd, { l: 0.05 }));
      }
      // doorway
      BX(s, 0, floor + 0.09, r - 0.008, 0.06, 0.16, 0.02, 0x3a3630);
      BX(s, 0, floor + 0.18, r + 0.002, 0.07, 0.02, 0.03, PL.stone[2]);
      // arrow slit
      BX(s, 0, floor + 0.26, r - 0.005, 0.014, 0.08, 0.02, 0x2b2722);
      // flag pole + pennant
      CY(s, 0, floor + 0.72, 0, 0.006, 0.5, 0xd9d2c2, { seg: 5 });
      BX(s, r * 0.5, floor + 0.86, 0, 0.11, 0.055, 0.004, 0x8d4b3f, { ry: 0.2 });
      // a little rubble at the foot
      for (let i = 0; i < 5; i++) {
        const a = rnd() * MATH.PI * 2, rr = r + 0.03 + rnd() * 0.06;
        GB(lp(s, Math.cos(a) * rr, Math.sin(a) * rr)[0], H(lp(s, Math.cos(a) * rr, Math.sin(a) * rr)[0], lp(s, Math.cos(a) * rr, Math.sin(a) * rr)[1]) + 0.015, lp(s, Math.cos(a) * rr, Math.sin(a) * rr)[1], 0.03 + rnd() * 0.03, 0.025, 0.03, PL.stone[1]);
      }
      K.count('buildings', 1);
      claim(s);
      s.topY = floor + 0.95;
      return s;
    }

    // A stone retaining wall that follows the ground along a polyline.
    function terraceWall(pts, o) {
      o = o || {};
      const thick = o.thick || 0.045;
      const top0 = o.top || 0.07;
      const col = o.color == null ? PL.stone[1] : o.color;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
        const len = MATH.hypot(bx - ax, bz - az);
        const n = MATH.max(1, Math.round(len / 0.22));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
          const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          const h0 = H(x0, z0), h1 = H(x1, z1);
          const topY = MATH.max(h0, h1) + (o.rise || 0.045);
          const botY = MATH.min(h0, h1) - (o.deep || 0.22);
          const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
          const ang = -MATH.atan2(z1 - z0, x1 - x0);
          const sl = MATH.hypot(x1 - x0, z1 - z0) * 1.02;
          GB(cx, (topY + botY) / 2, cz, sl, topY - botY, thick, K.vary(col, rnd, { l: 0.05 }), { ry: ang });
          // coping
          if (o.coping !== false) GB(cx, topY + 0.008, cz, sl, 0.018, thick * 1.3, PL.stone[2], { ry: ang });
        }
      }
    }

    /* ====================================================================== */
    /*  build the town                                                        */
    /* ====================================================================== */
    function buildAll() {
      for (let i = 0; i < SLOTS.length; i++) {
        const s = SLOTS[i];
        try {
          switch (s.kind) {
            case 'church': buildChurch(s); break;
            case 'plaza': buildPlaza(s); break;
            case 'market': buildMarket(s); break;
            case 'cafe': buildCafe(s); break;
            case 'pilot': buildPilot(s); break;
            case 'office': buildOffice(s); break;
            case 'ice': buildIce(s); break;
            case 'shed': buildShed(s); break;
            case 'fishop': buildFishShop(s); break;
            case 'warehouse': buildWarehouse(s); break;
            case 'customs': buildCustoms(s); break;
            case 'garden': buildGarden(s); break;
            case 'tower': buildTower(s); break;
            default: buildHouse(s); break;
          }
        } catch (err) {
          console.warn('[town] slot failed: ' + s.n, err && err.message);
        }
      }
    }

    function buildCustoms(s) {
      probeSlot(s);
      const floor = Math.max(1.14, s.floor), base = s.base;
      const w = s.w, d = s.d, h = 0.5;
      BX(s, 0, (floor + base) / 2 - 0.02, 0, w + 0.02, floor - base + 0.04, d + 0.02, K.vary(PL.stone[0], rnd, { l: 0.05 }));
      BX(s, 0, floor + h / 2, 0, w, h, d, 0xd8cfba);
      BX(s, 0, floor + h - 0.014, 0, w + 0.02, 0.028, d + 0.02, 0xbfb49f);
      roof(s, { w: w, d: d, top: floor + h, rise: 0.08, color: 0x5a6570, ridgeAxis: 'x', over: 0.04, thick: 0.024 });
      gables(s, { w: w, d: d, top: floor + h, rise: 0.08, color: 0xcfc4ad, ridgeAxis: 'x' });
      // facade: portico + steps + windows + flag
      BX(s, 0, floor - 0.02, d / 2 + 0.09, w * 0.7, 0.06, 0.14, PL.stone[1]);
      for (let i = -1; i <= 1; i += 2) {
        CY(s, i * w * 0.22, floor + 0.12, d / 2 + 0.12, 0.018, 0.24, 0xe8dfcd, { seg: 8 });
        BX(s, i * w * 0.22, floor + 0.25, d / 2 + 0.12, 0.05, 0.02, 0.05, 0xd8cfba);
      }
      BX(s, 0, floor + 0.263, d / 2 + 0.12, w * 0.62, 0.026, 0.19, 0xd8cfba);
      BX(s, 0, floor + 0.29, d / 2 + 0.12, w * 0.5, 0.03, 0.16, K.shade(0xd8cfba, 0, 0, 0));
      doorUnit(s, { side: 'front', along: 0, y: floor, w: 0.12, h: 0.2, frame: 0xe8dfcd, color: 0x3f4a45 });
      for (let i = 0; i < 2; i++) {
        windowUnit(s, { side: 'front', along: (i - 0.5) * w * 0.5, y: floor + 0.38, w: 0.09, h: 0.11, shutter: null, trim: 0xe8dfcd, lit: chance(0.5) });
      }
      // flagpole + flag
      CY(s, w * 0.4, floor + h + 0.16, d / 2 + 0.06, 0.006, 0.4, 0xd9d2c2, { seg: 5 });
      BX(s, w * 0.4 + 0.04, floor + h + 0.3, d / 2 + 0.06, 0.08, 0.05, 0.004, 0x8d4b3f);
      signPlate(s, '海关 CUSTOMS', 0, floor + h - 0.08, d / 2 + 0.03, w * 0.8, 0.075, { bg: '#2f4048', fg: '#efe3cd', border: '#b9935a' });
      wallLamp(s, 'front', -w * 0.3, floor + 0.32);
      K.count('buildings', 1);
      claim(s);
      s.topY = floor + h + 0.16;
      return s;
    }

    /* ====================================================================== */
    /*  absolute-space helpers (trees, people, props, vehicles)               */
    /* ====================================================================== */
    function GB(x, y, z, w, h, d, color, o) {
      o = o || {};
      B.add(K.geoBox(), color, { pos: [x, y, z], scale: [w, h, d], quat: qyxz(o.ry || 0, o.rx || 0, o.rz || 0), bucket: o.bucket });
    }
    function GC(x, y, z, r, h, color, o) {
      o = o || {};
      B.add(K.geoCyl(o.seg || 8), color, { pos: [x, y, z], scale: [r, h, r], quat: qyxz(o.ry || 0, o.rx || 0, o.rz || 0), bucket: o.bucket });
    }
    function GS(x, y, z, r, color, o) {
      o = o || {};
      B.add(K.geoSphere(o.ws || 8, o.hs || 6), color, { pos: [x, y, z], scale: [r * (o.sx || 1), r * (o.sy || 1), r * (o.sz || 1)], quat: qyxz(o.ry || 0, 0, 0), bucket: o.bucket });
    }
    function pointInOcc(x, z, pad) {
      for (let i = 0; i < occupied.length; i++) {
        const o = occupied[i];
        const dx = x - o.x, dz = z - o.z;
        const c = MATH.cos(o.ry), sn = MATH.sin(o.ry);
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (MATH.abs(lx) < o.w / 2 + (pad || 0) && MATH.abs(lz) < o.d / 2 + (pad || 0)) return true;
      }
      return false;
    }
    function okGround(x, z, o) {
      o = o || {};
      if (!L.pointInLand(x, z)) return false;
      if (L.distToCoast(x, z) < (o.coast == null ? 0.16 : o.coast)) return false;
      const h = H(x, z);
      if (h < (o.minH == null ? 0.95 : o.minH)) return false;
      if (roadDist(x, z) < (o.road == null ? 0.06 : o.road)) return false;
      if (!civilsClear(x, z, o.civPad == null ? 0.04 : o.civPad, o.civPlazas)) return false;
      if (pointInOcc(x, z, o.pad == null ? 0.05 : o.pad)) return false;
      return true;
    }

    /* ====================================================================== */
    /*  trees, hedges, planters                                               */
    /* ====================================================================== */
    function broadleaf(x, z, scale) {
      const y = H(x, z), k2 = scale || 1;
      const hh = range(0.16, 0.26) * k2;
      GC(x, y + hh * 0.5, z, 0.016 * k2, hh, K.vary(0x5c4130, rnd, { l: 0.05 }), { seg: 5 });
      // two or three overlapping blobs
      const n = 2 + ((rnd() * 2) | 0);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * MATH.PI * 2 + rnd();
        const rr = 0.07 * k2 + range(-0.015, 0.02);
        GS(x + Math.cos(a) * 0.045 * k2, y + hh + 0.03 * k2 + range(-0.01, 0.02), z + Math.sin(a) * 0.045 * k2, rr, K.vary(pick(PL.foliage), rnd, { l: 0.06 }), { ws: 8, hs: 6, sy: 0.85 });
      }
      // branches
      GC(x, y + hh * 0.7, z, 0.008 * k2, 0.05 * k2, 0x4a3527, { seg: 4, rz: 0.5 });
      K.count('trees', 1);
    }
    function cypressTree(x, z, hh) {
      const y = H(x, z);
      const h2 = hh || range(0.3, 0.5);
      GC(x, y + h2 * 0.1, z, 0.012, h2 * 0.2, 0x4a3527, { seg: 5 });
      CO2(x, y + h2 * 0.52, z, h2 * 0.12, h2 * 0.92, K.vary(pick(PL.cypress), rnd, { l: 0.04 }), 7);
      K.count('trees', 1);
    }
    function CO2(x, y, z, r, h, color, seg) {
      B.add(K.geoCone(seg || 8), color, { pos: [x, y, z], scale: [r, h, r], quat: qyxz(0, 0, 0) });
    }
    function palm(x, z, scale) {
      const y = H(x, z), k2 = scale || 1;
      const hh = range(0.3, 0.38) * k2;
      const bend = range(-0.03, 0.03);
      GC(x, y + hh * 0.5, z, 0.016 * k2, hh, 0x8a7355, { seg: 6, rz: bend });
      const tx = x - Math.sin(bend) * hh, tz = z;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * MATH.PI * 2 + 0.3;
        const len = 0.1 * k2 + range(-0.012, 0.02);
        GB(tx + Math.cos(a) * len * 0.5, y + hh + 0.012, tz + Math.sin(a) * len * 0.5, len, 0.008, 0.024, K.vary(0x6d7f57, rnd, { l: 0.05 }), { ry: -a, rz: 0.32 });
      }
      GS(tx, y + hh + 0.015, tz, 0.028 * k2, 0x5d7350, { ws: 6, hs: 4 });
      K.count('trees', 1);
    }
    function shrub(x, z, r) {
      const y = H(x, z), rr = r || 0.05;
      GS(x, y + rr * 0.55, z, rr, K.vary(pick(PL.foliageDark), rnd, { l: 0.06 }), { ws: 7, hs: 5, sy: 0.7 });
      if (chance(0.3)) GS(x + rr * 0.3, y + rr * 0.4, z + rr * 0.2, rr * 0.6, K.vary(pick(PL.flower), rnd, { l: 0.04 }), { ws: 6, hs: 4, sy: 0.6 });
    }

    function plantGreenery() {
      // curated hero trees
      const hero = [
        ['bp', -11.05, -1.62, 1.15], ['bp', -11.20, 0.30, 1.05], ['bp', -11.05, 2.35, 0.95],
        ['cy', -11.55, -0.05, 0.42], ['cy', -11.62, 0.42, 0.36], ['cy', -11.50, 1.85, 0.34],
        ['bp', -10.05, -5.30, 0.8], ['bp', -10.15, -6.30, 0.75], ['bp', -10.20, -7.60, 0.7],
        ['pa', -9.85, 0.40, 1.0], ['pa', -9.80, 2.55, 1.1],
        ['bp', -4.30, -11.95, 0.8], ['cy', 3.60, -11.95, 0.5],
      ];
      for (let i = 0; i < hero.length; i++) {
        const t = hero[i];
        if (!okGround(t[1], t[2], { pad: 0.0, coast: 0.16, minH: 0.8, road: 0.02 })) continue;
        if (t[0] === 'bp') broadleaf(t[1], t[2], t[3]);
        else if (t[0] === 'cy') cypressTree(t[1], t[2], t[3]);
        else palm(t[1], t[2], t[3]);
      }
      // scattered vegetation: peninsula slope + shore + back row
      let placed = 0, guard = 0;
      while (placed < 56 && guard++ < 1400) {
        const onPen = rnd() < 0.76;
        const west = onPen && rnd() < 0.45;
        const x = onPen ? (west ? range(-12.2, -11.6) : range(-12.15, -9.66)) : range(-4.6, 4.3);
        const z = onPen ? range(-9.2, 3.1) : range(-12.5, -11.85);
        if (!okGround(x, z, west ? { pad: 0.05, coast: 0.16, minH: 0.86, road: 0.05 } : { pad: 0.075, coast: 0.2, minH: 0.9, road: 0.14 })) continue;
        if (H(x, z) < 0.95 && chance(0.7)) { shrub(x, z, range(0.045, 0.07)); placed++; continue; }
        // leave the main street corridor and the plaza clear
        if (Math.hypot(x + 11.24, z + 2.46) < 0.55) continue;
        const r = rnd();
        if (r < 0.42) broadleaf(x, z, range(0.72, 1.0));
        else if (r < 0.72) cypressTree(x, z, range(0.24, 0.44));
        else shrub(x, z, range(0.04, 0.07));
        placed++;
      }
      // hedges & flower beds along the terraces and the quay
      const beds = [
        [-11.42, 2.15, 0.06, 0.34], [-11.05, -1.05, 0.24, 0.05],
        [-10.30, 0.55, 0.05, 0.24], [-10.42, 2.42, 0.05, 0.28],
        [-10.62, -4.52, 0.22, 0.05], [-11.52, -2.85, 0.05, 0.3],
        [-4.05, -11.92, 0.24, 0.05], [2.30, -11.92, 0.24, 0.05],
      ];
      for (let i = 0; i < beds.length; i++) {
        const b = beds[i];
        if (!okGround(b[0], b[1], { pad: 0.02, coast: 0.1, minH: 0.7, road: 0.03 })) continue;
        plantBedBox(b[0], H(b[0], b[1]), b[1], b[2], b[3]);
      }
      // a few big terrace planters
      flowerPotAt(-11.35, -0.85, 1.2);
      flowerPotAt(-10.55, 2.70, 1.0);
      flowerPotAt(-10.10, -4.35, 1.0);
      K.count('trees', 0);
    }
    function plantBedBox(x, y, z, w, d) {
      GB(x, y + 0.02, z, w, 0.04, d, PL.stone[3]);
      GB(x, y + 0.045, z, w * 0.86, 0.02, d * 0.86, 0x55432f);
      const n = MATH.max(3, (w * d * 2600) | 0);
      for (let i = 0; i < n; i++) {
        GS(x + (rnd() - 0.5) * w * 0.8, y + 0.062, z + (rnd() - 0.5) * d * 0.8, range(0.012, 0.02), pick(PL.flower), { ws: 5, hs: 3, sy: 0.65 });
      }
    }
    function flowerPotAt(x, z, s) {
      const y = H(x, z), k2 = s || 1;
      GC(x, y + 0.026 * k2, z, 0.03 * k2, 0.05 * k2, 0x9c6049, { seg: 6 });
      GS(x, y + 0.08 * k2, z, 0.045 * k2, K.vary(pick(PL.foliage), rnd), { ws: 6, hs: 4, sy: 0.9 });
      GS(x + 0.015, y + 0.095 * k2, z + 0.01, 0.022 * k2, pick(PL.flower), { ws: 5, hs: 3, sy: 0.7 });
    }

    /* ====================================================================== */
    /*  people                                                                */
    /* ====================================================================== */
    const PERSON = { skin: [0xd7b391, 0xc79a76, 0xe0c3a4, 0xb98b66], hair: [0x3a2d24, 0x6b5340, 0x8a7355, 0x2b2620] };
    function personAt(x, z, yaw, o) {
      o = o || {};
      const y = H(x, z);
      const scl = o.s || range(0.94, 1.06);
      const top = o.top || pick([0x6f7f86, 0x8d5a4a, 0x7c8a6f, 0x4b5a66, 0xb8a184, 0x5c6e6b, 0x9a7f6a, 0x3f4f56]);
      const bottom = o.bottom || pick([0x3c4148, 0x4a4238, 0x2f3b42, 0x5c4a3a, 0x6b6a5a]);
      const c = MATH.cos(yaw), sn = MATH.sin(yaw);
      const P2 = function (lx, lz) { return [x + lx * c + lz * sn, z - lx * sn + lz * c]; };
      const dy = 0.006;
      // legs
      for (let i = -1; i <= 1; i += 2) {
        const p = P2(i * 0.012 * scl, 0);
        GB(p[0], y + dy + 0.032 * scl, p[1], 0.017 * scl, 0.064 * scl, 0.019 * scl, bottom, { ry: yaw });
        GB(p[0], y + dy + 0.003, p[1], 0.02 * scl, 0.014 * scl, 0.028 * scl, 0x2a2723, { ry: yaw });
      }
      // torso
      const pt = P2(0, 0);
      GB(pt[0], y + dy + 0.098 * scl, pt[1], 0.042 * scl, 0.072 * scl, 0.026 * scl, top, { ry: yaw });
      // shoulders / coat
      GB(pt[0], y + dy + 0.128 * scl, pt[1], 0.048 * scl, 0.016 * scl, 0.03 * scl, top, { ry: yaw });
      // arms
      for (let i = -1; i <= 1; i += 2) {
        const p = P2(i * 0.028 * scl, 0);
        GB(p[0], y + dy + 0.1 * scl, p[1], 0.012 * scl, 0.06 * scl, 0.014 * scl, top, { ry: yaw, rz: i * 0.12 });
      }
      // head
      GS(pt[0], y + dy + 0.155 * scl, pt[1], 0.017 * scl, pick(PERSON.skin), { ws: 7, hs: 5 });
      // hair / cap
      if (chance(0.4)) GB(pt[0], y + dy + 0.169 * scl, pt[1], 0.03 * scl, 0.012 * scl, 0.03 * scl, pick([0xb2874f, 0x3c4148, 0x8d5a4a]), { ry: yaw });
      else GS(pt[0], y + dy + 0.166 * scl, pt[1], 0.016 * scl, pick(PERSON.hair), { ws: 6, hs: 4, sy: 0.7 });
      if (o.bag) {
        const p = P2(0.026 * scl, 0.012);
        GB(p[0], y + dy + 0.075 * scl, p[1], 0.02 * scl, 0.034 * scl, 0.016 * scl, pick([0x8a7355, 0x6b5340, 0x4a5560]), { ry: yaw });
      }
      K.count('people', 1);
    }
    function scatterPeople() {
      const clusters = [
        { x: -10.16, z: 1.85, n: 9, r: 0.42 },   // fish market
        { x: -11.16, z: -2.55, n: 7, r: 0.34 },  // plaza / church
        { x: -10.20, z: -4.22, n: 5, r: 0.3 },   // pilot station corner
        { x: -10.05, z: 0.55, n: 4, r: 0.26 },   // cafe
        { x: -2.00, z: -11.86, n: 6, r: 1.5 },   // back street
        { x: -10.60, z: -5.90, n: 4, r: 0.35 },  // shore sheds
        { x: -11.10, z: 0.10, n: 5, r: 0.5 },    // town street
      ];
      for (let ci = 0; ci < clusters.length; ci++) {
        const cl = clusters[ci];
        let done = 0, guard = 0;
        while (done < cl.n && guard++ < 120) {
          const a = rnd() * MATH.PI * 2, r = MATH.sqrt(rnd()) * cl.r;
          const x = cl.x + MATH.cos(a) * r, z = cl.z + Math.sin(a) * r;
          if (!okGround(x, z, { pad: 0.035, coast: 0.1, minH: 0.9, road: 0.0, civPad: 0.02, civPlazas: false })) continue;
          if (roadDist(x, z) < -0.05) continue;
          personAt(x, z, rnd() * Math.PI * 2, { bag: chance(0.35) });
          done++;
        }
      }
    }

    /* ====================================================================== */
    /*  vehicles                                                              */
    /* ====================================================================== */
    function vehicle(x, z, yaw, kind, color) {
      const y = H(x, z);
      const c = MATH.cos(yaw), sn = MATH.sin(yaw);
      const P2 = function (lx, lz) { return [x + lx * c + lz * sn, z - lx * sn + lz * c]; };
      const body = color || pick([0x8d9598, 0xb8b2a2, 0x7a8a86, 0x9c8c7a, 0x5f6a72, 0xc4b49a, 0x8a5a52, 0x4a5a62]);
      const glass = 0x2f4048;
      if (kind === 'bike' || kind === 'scooter') {
        const wb = kind === 'bike' ? 0.1 : 0.12;
        for (let i = -1; i <= 1; i += 2) {
          const p = P2(i * wb * 0.5, 0);
          GC(p[0], y + 0.026, p[1], 0.026, 0.008, 0x2a2723, { seg: 10, rz: MATH.PI / 2, ry: yaw });
          GC(p[0], y + 0.026, p[1], 0.012, 0.012, 0xb0b4ab, { seg: 8, rz: MATH.PI / 2, ry: yaw });
        }
        if (kind === 'scooter') {
          const p = P2(0, 0);
          GB(p[0], y + 0.055, p[1], 0.1, 0.03, 0.032, body, { ry: yaw });
          GB(p[0], y + 0.075, p[1], 0.035, 0.03, 0.03, body, { ry: yaw });
          const q = P2(-0.05, 0);
          GB(q[0], y + 0.1, q[1], 0.005, 0.07, 0.005, 0x5a5f5c, { ry: yaw });
          GB(q[0], y + 0.13, q[1], 0.02, 0.008, 0.006, 0x2a2723, { ry: yaw });
        } else {
          const p = P2(0, 0);
          GB(p[0], y + 0.062, p[1], 0.084, 0.006, 0.006, body, { ry: yaw });
          GB(p[0], y + 0.078, p[1], 0.006, 0.03, 0.006, body, { ry: yaw });
          const q = P2(-0.042, 0);
          GB(q[0], y + 0.084, q[1], 0.03, 0.004, 0.004, 0x2a2723, { ry: yaw });
          const r = P2(0.03, 0);
          GB(r[0], y + 0.096, r[1], 0.022, 0.008, 0.03, 0x3c4148, { ry: yaw });   // saddle
        }
        K.count('vehicles', 1);
        return;
      }
      let L = 0.34, W = 0.15, Hh = 0.09;
      if (kind === 'car') { L = 0.33; W = 0.145; Hh = 0.085; }
      else if (kind === 'van') { L = 0.38; W = 0.16; Hh = 0.13; }
      else if (kind === 'truck') { L = 0.42; W = 0.17; Hh = 0.12; }
      else if (kind === 'bus') { L = 0.62; W = 0.18; Hh = 0.16; }
      // wheels
      const wr = kind === 'bus' ? 0.03 : 0.026;
      for (let i = -1; i <= 1; i += 2) {
        for (let j = -1; j <= 1; j += 2) {
          const p = P2(i * L * 0.31, j * W * 0.46);
          GC(p[0], y + wr, p[1], wr, 0.022, 0x24262a, { seg: 10, rz: MATH.PI / 2, ry: yaw });
          GC(p[0], y + wr, p[1], wr * 0.45, 0.024, 0xb0b4ab, { seg: 8, rz: MATH.PI / 2, ry: yaw });
        }
      }
      // chassis + body
      const p = P2(0, 0);
      GB(p[0], y + wr + 0.018, p[1], L, 0.026, W * 0.9, 0x2f3237, { ry: yaw });
      if (kind === 'bus') {
        GB(p[0], y + wr + 0.09, p[1], L, Hh, W, body, { ry: yaw });
        GB(p[0], y + wr + 0.115, p[1], L * 0.94, 0.05, W * 1.005, glass, { ry: yaw, bucket: 'glass' });
        GB(p[0], y + wr + 0.09, p[1], L * 0.99, 0.012, W * 1.01, 0xe8dfcd, { ry: yaw });
        for (let i = -1; i <= 1; i += 2) {
          const q = P2(i * L * 0.49, 0);
          GB(q[0], y + wr + 0.06, q[1], 0.006, 0.03, W * 0.8, 0xd9d2c2, { ry: yaw, bucket: 'lamp' });
        }
      } else if (kind === 'truck') {
        // cab + flat bed
        const cab = P2(L * 0.28, 0);
        GB(cab[0], y + wr + 0.075, cab[1], L * 0.34, Hh, W, body, { ry: yaw });
        GB(cab[0], y + wr + 0.1, cab[1], L * 0.3, 0.045, W * 1.005, glass, { ry: yaw, bucket: 'glass' });
        const bed = P2(-L * 0.22, 0);
        GB(bed[0], y + wr + 0.045, bed[1], L * 0.56, 0.028, W * 0.96, 0x6b6155, { ry: yaw });
        for (let i = -1; i <= 1; i += 2) {
          const q = P2(-L * 0.22 + i * L * 0.22, W * 0.44);
          GB(q[0], y + wr + 0.075, q[1], L * 0.12, 0.06, 0.012, 0x9c8c7a, { ry: yaw });
        }
        cratesAt(cab[0] - L * 0.1, y + wr + 0.06, cab[1], 2);
      } else if (kind === 'van') {
        GB(p[0], y + wr + 0.062, p[1], L, Hh, W, body, { ry: yaw });
        const cab = P2(L * 0.36, 0);
        GB(cab[0], y + wr + 0.085, cab[1], L * 0.16, 0.045, W * 1.004, glass, { ry: yaw, bucket: 'glass' });
        const side = P2(-L * 0.1, W * 0.5);
        GB(side[0], y + wr + 0.075, side[1], L * 0.36, 0.045, 0.004, glass, { ry: yaw, bucket: 'glass' });
        GB(p[0], y + wr + 0.115, p[1], L * 0.98, 0.012, W * 0.9, 0xe8dfcd, { ry: yaw });
      } else {
        GB(p[0], y + wr + 0.05, p[1], L, 0.05, W, body, { ry: yaw });
        const cab = P2(-L * 0.04, 0);
        GB(cab[0], y + wr + 0.09, cab[1], L * 0.5, 0.045, W * 0.88, body, { ry: yaw });
        GB(cab[0], y + wr + 0.092, cab[1], L * 0.46, 0.036, W * 0.9, glass, { ry: yaw, bucket: 'glass' });
        GB(p[0], y + wr + 0.043, p[1], L * 0.99, 0.008, W * 1.005, 0x2f3237, { ry: yaw });
      }
      // lights
      for (let i = -1; i <= 1; i += 2) {
        const q = P2(L * 0.495, i * W * 0.3);
        GB(q[0], y + wr + (kind === 'bus' ? 0.06 : 0.05), q[1], 0.006, 0.014, 0.022, 0xffe9c0, { ry: yaw, bucket: 'lamp' });
        const r = P2(-L * 0.495, i * W * 0.3);
        GB(r[0], y + wr + (kind === 'bus' ? 0.06 : 0.05), r[1], 0.006, 0.012, 0.018, 0x8d4b3f, { ry: yaw });
      }
      K.count('vehicles', 1);
    }
    function cratesAt(x, y, z, n) {
      for (let i = 0; i < n; i++) {
        GB(x + (i % 2) * 0.05 - 0.025, y + 0.026, z + ((i / 2) | 0) * 0.04, 0.045, 0.05, 0.04, pick(PL.cargo));
      }
    }

    /* ====================================================================== */
    /*  street furniture                                                      */
    /* ====================================================================== */
    function streetFurniture() {
      // lamp posts along the harbour street + back street
      const lamps = [[-10.62, -0.10], [-11.12, 1.75], [-10.05, -3.55], [-9.90, 2.62], [-2.60, -11.90], [2.20, -11.90]];
      for (let i = 0; i < lamps.length; i++) {
        const x = lamps[i][0], z = lamps[i][1];
        if (!okGround(x, z, { pad: 0.0, coast: 0.12, minH: 0.85, road: 0.02 })) continue;
        const y = H(x, z);
        // standalone lamp post (absolute)
        GC(x, y + 0.19, z, 0.011, 0.38, 0x3d403d, { seg: 6 });
        GC(x, y + 0.36, z, 0.02, 0.02, 0x3d403d, { seg: 6 });
        GB(x, y + 0.415, z, 0.042, 0.055, 0.042, PL.lamp, { bucket: 'lamp' });
        GB(x, y + 0.452, z, 0.06, 0.014, 0.06, 0x3d403d);
        GS(x, y + 0.462, z, 0.012, 0x3d403d, { ws: 6, hs: 4 });
      }
      // benches
      const benches = [[-10.30, 0.15, 1.5708], [-11.05, 2.45, 0.2], [-10.42, -4.05, 0.0], [-2.05, -11.90, 0.0], [1.20, -11.90, 0.0]];
      for (let i = 0; i < benches.length; i++) {
        const b = benches[i];
        if (!okGround(b[0], b[1], { pad: 0.0, coast: 0.1, minH: 0.9, road: 0.02 })) continue;
        benchAbs(b[0], H(b[0], b[1]), b[1], b[2]);
      }
      // bins
      const bins = [[-10.55, -3.35], [-11.20, 1.30], [-10.05, 1.15], [-3.10, -11.90]];
      for (let i = 0; i < bins.length; i++) {
        const x = bins[i][0], z = bins[i][1];
        if (!okGround(x, z, { pad: 0.0, coast: 0.1, minH: 0.9, road: 0.0 })) continue;
        const y = H(x, z);
        GC(x, y + 0.055, z, 0.024, 0.11, 0x4a5560, { seg: 8 });
        GC(x, y + 0.113, z, 0.027, 0.012, 0x3a434c, { seg: 8 });
        GB(x, y + 0.13, z, 0.03, 0.008, 0.03, 0x3a434c);
      }
      // notice board near the market
      if (okGround(-10.55, 1.62, { pad: 0.0, coast: 0.12, minH: 0.95, road: 0.0 })) {
        const x = -10.55, z = 1.62, y = H(x, z);
        GC(x - 0.05, y + 0.14, z, 0.008, 0.28, 0x5c4130, { seg: 5 });
        GC(x + 0.05, y + 0.14, z, 0.008, 0.28, 0x5c4130, { seg: 5 });
        GB(x, y + 0.19, z, 0.14, 0.11, 0.014, 0x4a3527);
        GB(x, y + 0.19, z + 0.012, 0.12, 0.09, 0.006, 0xd8cbb4);
        GB(x, y + 0.21, z + 0.017, 0.1, 0.006, 0.004, 0x8c8578);
        GB(x, y + 0.19, z + 0.017, 0.08, 0.006, 0.004, 0x8c8578);
        GB(x, y + 0.17, z + 0.017, 0.09, 0.006, 0.004, 0x8c8578);
      }
      // harbour notice: bus stop on the back street
      busStop(-3.60, -11.86);
      // road signs along the street
      roadSign(-9.98, -3.92, 0.2, 'stop');
      roadSign(-11.16, 2.20, 1.2, 'parking');
      roadSign(-10.34, 0.72, 1.4, 'quay');
      roadSign(1.10, -11.86, 0.0, 'bus');
      // traffic light at the harbour corner
      trafficLight(-9.72, -3.42);
      // crosswalk stripes on the back street
      for (let i = 0; i < 5; i++) {
        GB(-1.30 + i * 0.07, 1.126, -11.55, 0.035, 0.006, 0.42, 0xd9d2c2, { ry: 0 });
      }
      // bicycles
      vehicle(-11.18, 0.30, 1.35, 'bike');
      vehicle(-10.48, 2.30, 2.1, 'bike');
      vehicle(-3.70, -11.90, 0.4, 'bike');
      // bollards on the corner + the market
      for (let i = 0; i < 4; i++) {
        const x = -10.30 + i * 0.09, z = -4.52;
        if (!okGround(x, z, { pad: 0.0, coast: 0.08, minH: 0.9, road: 0.0 })) continue;
        const y = H(x, z);
        GC(x, y + 0.05, z, 0.014, 0.1, 0x3d403d, { seg: 6 });
        GS(x, y + 0.105, z, 0.014, 0x3d403d, { ws: 6, hs: 4, sy: 0.6 });
      }
    }
    function benchAbs(x, y, z, ry) {
      const c = MATH.cos(ry), sn = MATH.sin(ry);
      const P2 = function (lx, lz) { return [x + lx * c + lz * sn, z - lx * sn + lz * c]; };
      const a = P2(0, 0);
      GB(a[0], y + 0.045, a[1], 0.19, 0.014, 0.05, PLA.wood, { ry: ry });
      GB(a[0], y + 0.078, a[1] - 0.042, 0.19, 0.055, 0.012, 0x7b5a40, { ry: ry, rx: -0.12 });
      for (let i = -1; i <= 1; i += 2) {
        const p = P2(i * 0.075, 0);
        GB(p[0], y + 0.022, p[1], 0.014, 0.045, 0.05, 0x3d403d, { ry: ry });
      }
    }
    function busStop(x, z) {
      if (!okGround(x, z, { pad: 0.0, coast: 0.1, minH: 0.95, road: 0.0 })) return;
      const y = H(x, z);
      // shelter
      for (let i = -1; i <= 1; i += 2) {
        GC(x + i * 0.16, y + 0.14, z + 0.01, 0.012, 0.28, 0x3d403d, { seg: 6 });
      }
      GB(x, y + 0.29, z + 0.01, 0.36, 0.018, 0.14, 0x51696a, { rx: -0.08 });
      GB(x, y + 0.14, z - 0.05, 0.32, 0.24, 0.012, 0x9fb2ae, { bucket: 'glass' });
      GB(x, y + 0.055, z + 0.0, 0.28, 0.03, 0.07, 0x7b5a40);
      // sign
      GC(x + 0.26, y + 0.2, z, 0.008, 0.4, 0x8a8f86, { seg: 5 });
      GB(x + 0.26, y + 0.36, z, 0.09, 0.06, 0.008, 0x4a6a5c, { ry: 0 });
      GB(x + 0.26, y + 0.36, z + 0.006, 0.07, 0.04, 0.004, 0xe8dfcd);
    }
    function roadSign(x, z, ry, kind) {
      if (!okGround(x, z, { pad: 0.0, coast: 0.1, minH: 0.9, road: 0.0 })) return;
      const y = H(x, z);
      GC(x, y + 0.1, z, 0.006, 0.2, 0x8a8f86, { seg: 5 });
      if (kind === 'stop') {
        GC(x, y + 0.22, z, 0.033, 0.008, 0xa8453b, { seg: 8, rx: Math.PI / 2, ry: ry });
        GB(x, y + 0.22, z + 0.006, 0.05, 0.008, 0.004, 0xf0e4cc, { ry: ry });
        GB(x, y + 0.22, z + 0.006, 0.008, 0.04, 0.004, 0xf0e4cc, { ry: ry });
      } else if (kind === 'parking') {
        GB(x, y + 0.22, z, 0.07, 0.07, 0.006, 0x3f5a7a, { ry: ry });
        GB(x, y + 0.22, z + 0.005, 0.05, 0.05, 0.004, 0xe8dfcd, { ry: ry });
        GB(x, y + 0.22, z + 0.008, 0.014, 0.03, 0.003, 0x3f5a7a, { ry: ry });
      } else if (kind === 'quay') {
        GB(x, y + 0.22, z, 0.075, 0.05, 0.006, 0x3f5a7a, { ry: ry });
        GB(x, y + 0.225, z + 0.005, 0.055, 0.012, 0.004, 0xe8dfcd, { ry: ry });
        GB(x, y + 0.205, z + 0.005, 0.04, 0.01, 0.004, 0xe8dfcd, { ry: ry });
      } else {
        GB(x, y + 0.22, z, 0.08, 0.055, 0.006, 0x4a6a5c, { ry: ry });
        GB(x, y + 0.225, z + 0.005, 0.06, 0.02, 0.004, 0xf0e4cc, { ry: ry });
      }
    }
    function trafficLight(x, z) {
      if (!okGround(x, z, { pad: 0.0, coast: 0.1, minH: 1.0, road: -0.1 })) return;
      const y = H(x, z);
      GC(x, y + 0.16, z, 0.009, 0.32, 0x3a434c, { seg: 6 });
      GB(x, y + 0.34, z, 0.05, 0.11, 0.05, 0x2f3237);
      GB(x, y + 0.375, z + 0.026, 0.022, 0.022, 0.008, 0xa8453b, { bucket: 'lamp' });
      GB(x, y + 0.34, z + 0.026, 0.022, 0.022, 0.008, 0xb2874f);
      GB(x, y + 0.305, z + 0.026, 0.022, 0.022, 0.008, 0x5b8a63);
    }

    /* ====================================================================== */
    /*  fishing-village props + silos                                         */
    /* ====================================================================== */
    function fishingProps() {
      // net-drying racks on the shore
      const racks = [[-10.02, -8.10, 0.4], [-10.10, -7.55, 1.9]];
      for (let i = 0; i < racks.length; i++) {
        const x = racks[i][0], z = racks[i][1], a = racks[i][2];
        if (!okGround(x, z, { pad: 0.0, coast: 0.08, minH: 0.6, road: 0.0 })) continue;
        const y = H(x, z);
        const c = MATH.cos(a), sn = MATH.sin(a);
        const P2 = function (lx, lz) { return [x + lx * c + lz * sn, z - lx * sn + lz * c]; };
        for (let j = -1; j <= 1; j += 2) {
          const p = P2(j * 0.16, 0);
          GC(p[0], y + 0.16, p[1], 0.01, 0.32, 0x5c4130, { seg: 5 });
        }
        const q = P2(0, 0);
        GB(q[0], y + 0.31, q[1], 0.34, 0.012, 0.012, 0x6b5340, { ry: a });
        // hanging nets
        for (let k = 0; k < 3; k++) {
          const p = P2(-0.1 + k * 0.1, 0);
          GB(p[0], y + 0.23, p[1], 0.075, 0.14, 0.006, k % 2 ? 0x8a7f68 : 0x6f7568, { ry: a });
          GB(p[0], y + 0.29, p[1], 0.08, 0.008, 0.01, 0x4a3527, { ry: a });
          GB(p[0], y + 0.16, p[1], 0.05, 0.008, 0.008, 0x9fb2b8, { ry: a });
        }
      }
      // coil of rope, buoys, crates, barrels, baskets around the shore sheds
      const props = [
        [-9.86, -6.42], [-9.74, -6.85], [-9.98, -7.15], [-9.88, -7.62], [-10.10, -6.75],
        [-10.20, -5.55], [-9.86, -5.62], [-10.12, -6.15], [-10.35, -7.30], [-10.05, -8.35],
      ];
      for (let i = 0; i < props.length; i++) {
        const x = props[i][0], z = props[i][1];
        if (!okGround(x, z, { pad: 0.0, coast: 0.05, minH: 0.5, road: 0.0 })) continue;
        const y = H(x, z);
        const r = i % 4;
        if (r === 0) {        // rope coil
          GC(x, y + 0.018, z, 0.038, 0.03, 0x8a7355, { seg: 10 });
          GC(x, y + 0.032, z, 0.028, 0.02, 0x9c8564, { seg: 10 });
        } else if (r === 1) { // buoys
          GS(x, y + 0.026, z, 0.028, pick([0xc98c74, 0x9fb2b8, 0xd7c08f]), { ws: 7, hs: 5, sy: 1.1 });
          GS(x + 0.03, y + 0.022, z + 0.02, 0.022, pick([0x9fb2b8, 0xc98c74]), { ws: 6, hs: 4 });
        } else if (r === 2) { // crates
          cratesAt(x, y, z, 3);
        } else {              // barrels + baskets
          GC(x, y + 0.03, z, 0.03, 0.06, 0x5c4130, { seg: 8 });
          GC(x, y + 0.006, z, 0.032, 0.012, 0x3f2c21, { seg: 8 });
          GC(x + 0.06, y + 0.022, z + 0.02, 0.026, 0.044, 0x8a7355, { seg: 8 });
        }
      }
      // a beached dinghy on the shore
      if (okGround(-10.10, -8.62, { pad: 0.0, coast: 0.04, minH: 0.35, road: 0.0 })) {
        const x = -10.10, z = -8.62, y = H(x, z);
        GB(x, y + 0.028, z, 0.2, 0.035, 0.075, 0x7a5a44, { ry: 0.5 });
        GB(x, y + 0.05, z, 0.17, 0.02, 0.06, 0x8a6a50, { ry: 0.5 });
        GB(x + 0.04, y + 0.058, z + 0.02, 0.05, 0.012, 0.05, 0x9c8564, { ry: 0.5 });
      }
      // a hand winch on the quay corner
      if (okGround(-9.80, -4.60, { pad: 0.0, coast: 0.08, minH: 0.95, road: 0.0 })) {
        const x = -9.80, z = -4.60, y = H(x, z);
        GB(x, y + 0.04, z, 0.07, 0.08, 0.06, 0x5a5f5c);
        GC(x, y + 0.09, z, 0.028, 0.06, 0x8a8f86, { seg: 8, rz: Math.PI / 2 });
        GB(x, y + 0.09, z + 0.045, 0.008, 0.008, 0.09, 0x3d403d);
      }
    }

    function buildSilos() {
      const base = { x: 0.62, z: -12.50 };
      const gy = 1.14;
      // two silos
      const siloCol = 0xc9c3b0;
      for (let i = 0; i < 2; i++) {
        const x = base.x + i * 0.26, z = base.z - i * 0.06;
        GC(x, gy + 0.36, z, 0.095, 0.72, K.vary(siloCol, rnd, { l: 0.03 }), { seg: 12 });
        GC(x, gy + 0.72, z, 0.098, 0.03, 0x9a958a, { seg: 12 });
        CO2(x, gy + 0.79, z, 0.098, 0.1, 0x8a8f86, 12);
        // hoops
        for (let k = 0; k < 4; k++) GC(x, gy + 0.1 + k * 0.18, z, 0.098, 0.008, 0x8a8f86, { seg: 12 });
        // ladder
        for (let k = 0; k < 2; k++) GB(x + (k ? 0.02 : -0.02), gy + 0.36, z + 0.1, 0.006, 0.72, 0.006, 0x6f756c);
      }
      // head house + conveyor
      GB(base.x + 0.13, gy + 0.4, base.z - 0.14, 0.2, 0.16, 0.16, 0xb6ad9d);
      GB(base.x + 0.13, gy + 0.49, base.z - 0.14, 0.22, 0.02, 0.18, 0x8a8f86);
      const a = [base.x + 0.1, gy + 0.46, base.z - 0.1];
      const b = [base.x + 0.46, gy + 0.3, base.z - 0.22];
      K.strut(a, b, 0.022, 0x9a958a, { seg: 6 });
      // a few sacks at the base
      cratesAt(base.x + 0.34, gy, base.z - 0.02, 3);
      K.count('parts', 0);
    }

    /* ====================================================================== */
    /*  animation                                                             */
    /* ====================================================================== */
    const waterMat = K.std(0xcfe6e0, { roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.72 });
    const handMat = K.std(0x2b2722, { roughness: 0.6, metalness: 0.1 });
    const matteMat = K.materials.matte;

    function mergedGeo(parts) {
      const pos = [], norm = [], col = [];
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const v = new THREE.Vector3(), nm = new THREE.Matrix3(), vv = new THREE.Vector3();
      for (let pi = 0; pi < parts.length; pi++) {
        const part = parts[pi];
        const g0 = part.geo;
        const g = g0.index ? g0.toNonIndexed() : g0;
        const Pattr = g.attributes.position, Nattr = g.attributes.normal;
        if (!Pattr || !Nattr) continue;
        const p = part.pos || [0, 0, 0], sc = part.scale || [1, 1, 1], rot = part.rot || [0, 0, 0];
        e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0, 'YXZ');
        q.setFromEuler(e);
        m.compose(v.set(p[0], p[1], p[2]), q, vv.set(sc[0], sc[1], sc[2]));
        nm.getNormalMatrix(m);
        const c = K.color(part.color);
        for (let i = 0; i < Pattr.count; i++) {
          v.fromBufferAttribute(Pattr, i).applyMatrix4(m);
          pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(Nattr, i).applyMatrix3(nm).normalize();
          norm.push(v.x, v.y, v.z);
          col.push(c.r, c.g, c.b);
        }
        if (g !== g0) g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      out.computeBoundingSphere();
      return out;
    }

    function setupFountain() {
      if (!LM.fountain) return;
      const f = LM.fountain;
      const g = new THREE.Group();
      g.position.set(f.x, f.y, f.z);
      // main jet
      const jetGeo = new THREE.ConeGeometry(0.013, 0.085, 8, 1, true);
      const jet = new THREE.Mesh(jetGeo, waterMat);
      jet.position.y = 0.045;
      g.add(jet);
      // side streams
      const streams = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const geo = new THREE.ConeGeometry(0.006, 0.06, 5, 1, true);
        const m = new THREE.Mesh(geo, waterMat);
        m.position.set(Math.cos(a) * 0.022, 0.05, Math.sin(a) * 0.022);
        m.rotation.z = -Math.cos(a) * 0.45;
        m.rotation.x = Math.sin(a) * 0.45;
        streams.add(m);
      }
      g.add(streams);
      // splash ring
      const ringGeo = new THREE.RingGeometry(0.012, 0.03, 14);
      const ring = new THREE.Mesh(ringGeo, waterMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.006;
      g.add(ring);
      K.addObject(g);
      K.addTick(function (dt, t) {
        if (reduced) { jet.scale.y = 1; streams.scale.setScalar(1); return; }
        const s = 0.86 + 0.14 * Math.sin(t * 3.4) + 0.03 * Math.sin(t * 11.7);
        jet.scale.y = s;
        streams.scale.y = 0.9 + 0.1 * Math.sin(t * 4.1 + 1.3);
        ring.scale.setScalar(0.94 + 0.1 * Math.sin(t * 5.2));
      });
    }

    function setupClocks() {
      const tex = clockTexture(0);
      const faceMat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.66, metalness: 0.02, transparent: true, alphaTest: 0.35,
        emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.06,
      });
      if (P.nightSigns) P.nightSigns.push(faceMat);
      for (let i = 0; i < LM.clocks.length; i++) {
        const c = LM.clocks[i];
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.145), faceMat);
        face.position.set(c.x, c.y, c.z);
        face.rotation.y = c.ry;
        face.castShadow = false; face.receiveShadow = false;
        K.addObject(face);
        // hands
        const hourGeo = new THREE.BoxGeometry(0.007, 0.042, 0.003);
        hourGeo.translate(0, 0.021, 0);
        const minGeo = new THREE.BoxGeometry(0.005, 0.058, 0.003);
        minGeo.translate(0, 0.029, 0);
        const hour = new THREE.Mesh(hourGeo, handMat);
        const min = new THREE.Mesh(minGeo, handMat);
        const gp = new THREE.Group();
        gp.position.set(c.x, c.y, c.z);
        gp.rotation.y = c.ry;
        gp.position.x += Math.sin(c.ry) * 0.004;
        gp.position.z += Math.cos(c.ry) * 0.004;
        hour.position.z = 0.003;
        min.position.z = 0.005;
        gp.add(hour); gp.add(min);
        K.addObject(gp);
        LM.clockHands = LM.clockHands || [];
        LM.clockHands.push({ hour: hour, min: min, phase: i * 0.3 });
      }
      K.addTick(function (dt, t) {
        const hands = LM.clockHands || [];
        const baseMin = reduced ? 10 : 10 + (t * 0.12) % 60;
        const hh = reduced ? 10 : 10;
        for (let i = 0; i < hands.length; i++) {
          const m = baseMin + i * 0.6;
          const ho = (hh + m / 60) % 12;
          hands[i].min.rotation.z = -(m / 60) * Math.PI * 2;
          hands[i].hour.rotation.z = -(ho / 12) * Math.PI * 2;
        }
      });
    }

    function setupUmbrellas() {
      const col = [0xd8cbb4, 0x8a5a52, 0x6f8578];
      LM.umbrellaGroups = [];
      for (let i = 0; i < LM.umbrellas.length; i++) {
        const u = LM.umbrellas[i];
        const parts = [
          { geo: K.geoCyl(6), color: 0x8a8f86, pos: [0, 0.05, 0], scale: [0.006, 0.1, 0.006] },
          { geo: K.geoCone(8), color: col[i % col.length], pos: [0, 0.115, 0], scale: [0.062, 0.05, 0.062] },
          { geo: K.geoCyl(6), color: 0xd9d2c2, pos: [0, 0.146, 0], scale: [0.006, 0.018, 0.006] },
        ];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          parts.push({ geo: K.geoCyl(4), color: 0xb0a48c, pos: [Math.cos(a) * 0.055, 0.112, Math.sin(a) * 0.055], scale: [0.003, 0.03, 0.003], rot: [0, 0, 0] });
        }
        const mesh = new THREE.Mesh(mergedGeo(parts), matteMat);
        mesh.position.set(u.x, u.y, u.z);
        mesh.castShadow = true;
        K.addObject(mesh);
        LM.umbrellaGroups.push({ mesh: mesh, phase: u.phase });
        // a small table under it
      }
      K.addTick(function (dt, t) {
        if (reduced) return;
        for (let i = 0; i < LM.umbrellaGroups.length; i++) {
          const u = LM.umbrellaGroups[i];
          u.mesh.rotation.z = Math.sin(t * 0.7 + u.phase) * 0.022;
          u.mesh.rotation.x = Math.cos(t * 0.55 + u.phase) * 0.016;
        }
      });
    }

    /* ---- bunting ---------------------------------------------------------- */
    function buntingString(ax, az, bx, bz, y, sag, nFlags) {
      const parts = [];
      // rope as a tube
      const start = new THREE.Vector3(ax, y, az);
      const end = new THREE.Vector3(bx, y, bz);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.y -= sag;
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const tube = new THREE.TubeGeometry(curve, 12, 0.0035, 3, false);
      parts.push({ geo: tube, color: 0x6b5340, pos: [0, 0, 0], scale: [1, 1, 1] });
      const flags = [];
      for (let i = 0; i < nFlags; i++) {
        const tt = (i + 0.5) / nFlags;
        const p = curve.getPoint(tt);
        const col = [0xa8674f, 0xe8dcc4, 0x6f8578, 0xd7c08f, 0x9c6049, 0xb4c2c3][i % 6];
        const tri = new THREE.BufferGeometry();
        const s2 = 0.018;
        const ax0 = p.x - s2, ay0 = p.y - 0.004, az0 = p.z;
        const bx0 = p.x + s2, by0 = p.y - 0.004, bz0 = p.z;
        const cx0 = p.x, cy0 = p.y - 0.042, cz0 = p.z;
        tri.setAttribute('position', new THREE.Float32BufferAttribute([
          ax0, ay0, az0, bx0, by0, bz0, cx0, cy0, cz0,
          ax0, ay0, az0, cx0, cy0, cz0, bx0, by0, bz0,
        ], 3));
        tri.computeVertexNormals();
        flags.push({ geo: tri, color: col, pos: [0, 0, 0], scale: [1, 1, 1], double: true });
      }
      return { parts: parts.concat(flags), center: [(ax + bx) / 2, y - sag * 0.6, (az + bz) / 2] };
    }
    function setupBunting() {
      const defs = [
        { a: [-11.38, 0.94], b: [-10.25, 0.94], y: 1.63 },
        { a: [-11.52, 1.86], b: [-10.55, 1.86], y: 1.56 },
      ];
      LM.bunting = [];
      for (let i = 0; i < defs.length; i++) {
        const d = defs[i];
        const inner = buntingString(d.a[0], d.a[1], d.b[0], d.b[1], d.y, 0.03, 9);
        const parts = inner.parts;
        // local space around the centre so rotation looks like sway
        const cx = inner.center[0], cy = inner.center[1], cz = inner.center[2];
        for (let k = 0; k < parts.length; k++) {
          const p = parts[k];
          // shift geometry into centre-local space by adjusting positions in the merged geo later
          if (p.geo.attributes && p.geo.attributes.position) {
            p.geo = p.geo.clone();
            p.geo.translate(-cx, -cy, -cz);
          }
        }
        const mesh = new THREE.Mesh(mergedGeo(parts), matteMat);
        mesh.position.set(cx, cy, cz);
        K.addObject(mesh);
        LM.bunting.push({ mesh: mesh, phase: i * 1.9 });
      }
      // anchors for the effects teammate
      K.anchor('buntingA', { pos: [defs[0].a[0], defs[0].y, defs[0].a[1]] });
      K.anchor('buntingB', { pos: [defs[0].b[0], defs[0].y, defs[0].b[1]] });
      K.addTick(function (dt, t) {
        if (reduced) return;
        for (let i = 0; i < LM.bunting.length; i++) {
          const b = LM.bunting[i];
          b.mesh.rotation.y = Math.sin(t * 0.6 + b.phase) * 0.02;
          b.mesh.rotation.x = Math.cos(t * 0.45 + b.phase) * 0.012;
        }
      });
    }

    /* ---- walkers + moving van -------------------------------------------- */
    function makeWalker(path, o) {
      o = o || {};
      const scl = o.s || 1;
      const top = o.top || pick([0x6f7f86, 0x8d5a4a, 0x7c8a6f, 0x4b5a66, 0xb8a184]);
      const bottom = o.bottom || pick([0x3c4148, 0x4a4238, 0x2f3b42, 0x5c4a3a]);
      const bodyParts = [
        { geo: K.geoCyl(6), color: bottom, pos: [0, 0.09, 0], scale: [0.019, 0.075, 0.019] },
        { geo: K.geoBox(), color: top, pos: [0, 0.128, 0], scale: [0.044, 0.07, 0.026] },
        { geo: K.geoBox(), color: top, pos: [0, 0.158, 0], scale: [0.05, 0.016, 0.03] },
        { geo: K.geoSphere(7, 5), color: pick(PERSON.skin), pos: [0, 0.185, 0], scale: [0.017, 0.018, 0.017] },
        { geo: K.geoSphere(6, 4), color: pick(PERSON.hair), pos: [0, 0.196, 0], scale: [0.016, 0.011, 0.016] },
      ];
      const legGeo = K.geoCyl(5);
      const leg = { geo: legGeo, color: bottom, pos: [0, 0.033, 0], scale: [0.008, 0.066, 0.008] };
      const body = new THREE.Mesh(mergedGeo(bodyParts), matteMat);
      body.castShadow = true;
      const g = new THREE.Group();
      g.add(body);
      const legs = [];
      for (let i = -1; i <= 1; i += 2) {
        const lm = new THREE.Mesh(mergedGeo([{ geo: legGeo, color: bottom, pos: [0, 0, 0], scale: [0.008, 0.066, 0.008] }]), matteMat);
        lm.castShadow = true;
        lm.position.set(i * 0.011, 0.066, 0);
        lm.geometry.translate(0, -0.033, 0);
        g.add(lm);
        legs.push(lm);
      }
      g.scale.setScalar(scl);
      K.addObject(g);
      K.count('people', 1);
      return { g: g, legs: legs, path: path, phase: o.phase || 0, speed: o.speed || 0.035, bob: o.bob == null ? 1 : o.bob };
    }
    function pathWalk(path, dist) {
      // path: [[x,z],...]; dist in world units from the start (ping-pong)
      let total = 0;
      for (let i = 0; i < path.length - 1; i++) total += MATH.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      let d = dist % (total * 2);
      let dir = 1;
      if (d > total) { d = total * 2 - d; dir = -1; }
      for (let i = 0; i < path.length - 1; i++) {
        const seg = MATH.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
        if (d <= seg) {
          const tt = seg > 0 ? d / seg : 0;
          const x = path[i][0] + (path[i + 1][0] - path[i][0]) * tt;
          const z = path[i][1] + (path[i + 1][1] - path[i][1]) * tt;
          let dx = (path[i + 1][0] - path[i][0]) * dir, dz = (path[i + 1][1] - path[i][1]) * dir;
          const l2 = MATH.hypot(dx, dz) || 1;
          return { x: x, z: z, yaw: MATH.atan2(-dz / l2, dx / l2), done: false };
        }
        d -= seg;
      }
      return { x: path[0][0], z: path[0][1], yaw: 0 };
    }
    function setupWalkers() {
      const paths = [
        [[-9.92, -3.85], [-10.24, -1.9], [-10.62, 0.2], [-10.99, 1.5], [-11.20, 2.30]],
        [[-9.92, -3.85], [-10.24, -1.9], [-10.62, 0.2], [-10.99, 1.5], [-11.20, 2.30]],
        [[-10.10, -3.55], [-10.14, -0.30], [-10.12, 1.20], [-10.20, 2.55]],
        [[-10.15, 1.20], [-10.16, 2.30], [-10.22, 2.72]],
        [[-11.30, -2.42], [-11.02, -2.10], [-11.10, -1.70]],
        [[-4.00, -11.62], [-1.00, -11.62], [2.00, -11.62], [3.40, -11.62]],
        [[-9.86, -6.30], [-9.92, -7.20], [-9.80, -7.80]],
        [[-10.55, -4.20], [-10.10, -3.80], [-9.95, -3.55]],
      ];
      LM.walkers = [];
      for (let i = 0; i < paths.length; i++) {
        const w = makeWalker(paths[i], {
          phase: rnd() * 40, speed: 0.03 + rnd() * 0.025, s: 0.96 + rnd() * 0.09,
        });
        LM.walkers.push(w);
      }
      K.addTick(function (dt, t) {
        for (let i = 0; i < LM.walkers.length; i++) {
          const w = LM.walkers[i];
          if (reduced) {
            const p = pathWalk(w.path, w.phase);
            w.g.position.set(p.x, H(p.x, p.z) + 0.004, p.z);
            w.g.rotation.y = p.yaw;
            continue;
          }
          const p = pathWalk(w.path, w.phase + t * w.speed);
          const h = H(p.x, p.z);
          w.g.position.set(p.x, h + 0.004 + Math.sin(t * 9 + i) * 0.0035 * w.bob, p.z);
          w.g.rotation.y = p.yaw;
          w.g.rotation.z = Math.sin(t * 9 + i) * 0.02;
          const sw = Math.sin(t * 9 + i) * 0.55;
          if (w.legs[0]) w.legs[0].rotation.x = sw;
          if (w.legs[1]) w.legs[1].rotation.x = -sw;
        }
      });
    }

    function setupMovingVan() {
      const path = [[-9.95, -3.78], [-10.26, -1.90], [-10.64, 0.20], [-11.02, 1.55], [-11.24, 2.32]];
      const bodyCol = 0xc4b49a;
      const parts = [
        { geo: K.geoBox(), color: bodyCol, pos: [0, 0.085, 0], scale: [0.36, 0.11, 0.155] },
        { geo: K.geoBox(), color: 0x2f4048, pos: [0.10, 0.105, 0], scale: [0.14, 0.05, 0.157] },
        { geo: K.geoBox(), color: 0x2f3237, pos: [0, 0.032, 0], scale: [0.34, 0.02, 0.14] },
        { geo: K.geoBox(), color: 0xe8dfcd, pos: [0, 0.142, 0], scale: [0.34, 0.014, 0.14] },
      ];
      for (let i = -1; i <= 1; i += 2) {
        for (let j = -1; j <= 1; j += 2) {
          parts.push({ geo: K.geoCyl(8), color: 0x24262a, pos: [i * 0.12, 0.026, j * 0.072], scale: [0.026, 0.022, 0.026], rot: [Math.PI / 2, 0, 0] });
        }
      }
      parts.push({ geo: K.geoBox(), color: 0xffe9c0, pos: [0.178, 0.07, 0.05], scale: [0.006, 0.016, 0.024] });
      parts.push({ geo: K.geoBox(), color: 0xffe9c0, pos: [0.178, 0.07, -0.05], scale: [0.006, 0.016, 0.024] });
      const mesh = new THREE.Mesh(mergedGeo(parts), matteMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      K.addObject(mesh);
      const speed = 0.05;
      K.addTick(function (dt, t) {
        const d = reduced ? 3.2 : 1.2 + (t * speed) % 9.6;
        const p = pathWalk(path, d);
        const p2 = pathWalk(path, d + 0.06);
        const h = H(p.x, p.z);
        mesh.position.set(p.x, h + 0.004, p.z);
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = p.yaw;
        const ds = 0.12;
        const dh = H(p2.x, p2.z) - h;
        mesh.rotation.z = MATH.atan2(dh, ds) * 0.8;
      });
    }

    /* ====================================================================== */
    /*  vehicle parking                                                       */
    /* ====================================================================== */
    function parkVehicles() {
      const list = [
        // west end of the cargo quay
        { x: -9.02, z: -5.30, ry: 0.02, k: 'car', c: 0x8d9598 },
        { x: -8.74, z: -5.28, ry: -0.02, k: 'van', c: 0xc4b49a },
        // back street in front of the warehouses
        { x: -3.90, z: -11.60, ry: 0.02, k: 'van', c: 0xb8b2a2 },
        { x: -2.55, z: -11.58, ry: 0.0, k: 'car', c: 0x7a8a86 },
        { x: 0.28, z: -11.58, ry: 0.0, k: 'truck', c: 0x9c8c7a },
        { x: 1.55, z: -11.60, ry: 0.03, k: 'car', c: 0x8a5a52 },
        { x: 2.70, z: -11.58, ry: 0.0, k: 'car', c: 0x5f6a72 },
        { x: 3.86, z: -11.58, ry: -0.02, k: 'bus', c: 0x6f8578 },
        // harbour corner
        { x: -10.14, z: -4.08, ry: 0.55, k: 'car', c: 0xb8b2a2 },
        // two-wheelers
        { x: -10.30, z: 0.42, ry: 1.5, k: 'scooter', c: 0x8d5a4a },
        { x: -10.24, z: 2.62, ry: 1.5, k: 'scooter', c: 0x6f7f86 },
        { x: -11.22, z: 1.16, ry: 0.15, k: 'bike' },
        { x: -10.58, z: -0.32, ry: 1.4, k: 'bike' },
        { x: -9.92, z: -3.86, ry: 0.2, k: 'bike' },
        { x: -10.46, z: 1.14, ry: 1.5, k: 'bike' },
      ];
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (!L.pointInLand(v.x, v.z)) continue;
        vehicle(v.x, v.z, v.ry, v.k, v.c);
      }
    }

    /* ====================================================================== */
    /*  run                                                                   */
    /* ====================================================================== */
    buildAll();
    buildSilos();
    // dry-stone retaining walls that tie the town into the hillside
    terraceWall([[-11.86, -4.05], [-11.62, -4.42], [-11.30, -4.56]], { thick: 0.045, rise: 0.05, deep: 0.4 });
    terraceWall([[-11.78, -3.86], [-11.94, -3.28], [-12.02, -2.62]], { thick: 0.045, rise: 0.05, deep: 0.45 });
    terraceWall([[-12.04, -2.30], [-12.08, -1.52], [-12.00, -0.72]], { thick: 0.042, rise: 0.05, deep: 0.4 });
    terraceWall([[-11.96, 0.72], [-11.86, 1.55], [-11.70, 2.18]], { thick: 0.042, rise: 0.05, deep: 0.4 });
    plantGreenery();
    scatterPeople();
    parkVehicles();
    streetFurniture();
    fishingProps();
    setupFountain();
    setupClocks();
    setupUmbrellas();
    setupBunting();
    setupWalkers();
    setupMovingVan();

    // anchor for the effects teammate (bakery chimney smoke)
    const bakery = SLOTS.filter(function (q) { return q.n === 'k3'; })[0];
    if (bakery && bakery.topY) K.anchor('bakeryChimney', [bakery.x + 0.02, bakery.topY + 0.12, bakery.z]);
    // anchors effects may use for chimney smoke on the hill town
    K.anchor('townChimneys', [
      [-11.44, 1.55, -0.42], [-11.48, 1.75, 0.04], [-11.60, 1.4, 0.92],
    ]);

    /* --------------------------------------------------------------- labels */
    K.addLabel({ pos: [-11.20, 5.35, -3.05], title: '教堂钟楼', sub: 'CHURCH TOWER · 1907', priority: 7, side: -1 });
    K.addLabel({ pos: [-11.30, 2.55, -1.55], title: '老城', sub: 'OLD TOWN', priority: 8, side: -1 });
    K.addLabel({ pos: [-10.16, 2.10, 1.95], title: '鱼市', sub: 'FISH MARKET', priority: 8, side: 1 });
    K.addLabel({ pos: [-10.72, 1.55, 0.85], title: '港口街', sub: 'HARBOUR STREET', priority: 5, side: 1 });

    // part / budget diagnostics
    if (dbg) {
      console.warn('[town] slots=' + SLOTS.length + ' occupied=' + occupied.length + ' parts=' + (B.parts | 0));
    }
  };
})();
