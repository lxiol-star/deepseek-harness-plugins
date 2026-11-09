/* ============================================================================
 * terrain.js — 微港 · Port Aurora / terrain & civils
 * Island landform, layered cliff skirt, coastline, quay walls, breakwater,
 * lighthouse, roads, rail, town hardscape and waterfront for the miniature.
 *
 * Owned by terrain-civils.  Everything static is baked through the shared kit
 * Batcher (a handful of merged vertex-colour meshes); the continuous land
 * surface itself is one custom vertex-colour MeshStandardMaterial mesh so the
 * coast can follow the exact polygon outline (marching-squares clip) while the
 * colouring stays painterly.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  P.builders = P.builders || {};

  P.builders.terrain = function terrain(ctx) {
    const K = ctx.kit;
    const L = ctx.layout;
    const THREE = ctx.THREE;
    const W = L.W;
    const scene = ctx.scene;
    const rand = K.rng(0x7e44a1);

    const clamp = K.clamp;
    const lerp = K.lerp;
    const smoothstep = K.smoothstep;
    const DECK = W.deckY;
    const WATER = W.waterY;
    const C = K.palette;

    /* ====================================================================== *
     * 0.  small deterministic noise + geometry helpers
     * ====================================================================== */
    function ihash(x, y) {
      let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function vnoise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = ihash(xi, yi), b = ihash(xi + 1, yi);
      const c = ihash(xi, yi + 1), d = ihash(xi + 1, yi + 1);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
    function fbm(x, y, oct) {
      let s = 0, amp = 0.5, f = 1;
      for (let i = 0; i < (oct || 3); i++) {
        s += amp * vnoise(x * f + i * 17.3, y * f - i * 9.1);
        f *= 2.03;
        amp *= 0.5;
      }
      return s;
    }
    function rectMask(x, z, x0, x1, z0, z1, f) {
      const d = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      return smoothstep(0, f || 0.1, d);
    }
    function distSeg(px, pz, ax, az, bx, bz) {
      const vx = bx - ax, vz = bz - az;
      const wl = vx * vx + vz * vz;
      let t = wl > 1e-9 ? ((px - ax) * vx + (pz - az) * vz) / wl : 0;
      t = clamp(t, 0, 1);
      const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
      return Math.sqrt(dx * dx + dz * dz);
    }
    function polyDist(x, z, pts) {
      let best = 1e9;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = distSeg(x, z, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
        if (d < best) best = d;
      }
      return best;
    }
    function groundY(x, z) { return L.heightAt(x, z); }

    // rotate a XZ offset by a heading (used for local frames)
    function rot2(x, z, a) {
      const c = Math.cos(a), s = Math.sin(a);
      return [x * c - z * s, x * s + z * c];
    }

    // batch a short straight beam that follows a local direction (2D frame)
    function beam2(x0, z0, x1, z1, y, w, h, color, o) {
      const dx = x1 - x0, dz = z1 - z0;
      const len = Math.hypot(dx, dz) || 1e-4;
      const ang = Math.atan2(dx, dz); // rotation about Y so local +z follows the beam
      K.box(w, h, len, (x0 + x1) / 2, y, (z0 + z1) / 2, color,
        Object.assign({ rot: [0, ang, 0] }, o || {}));
    }

    /* ====================================================================== *
     * 1.  ISLAND LANDFORM  (one custom vertex-colour mesh: ground + cliff)
     * ====================================================================== */
    // palette colours as linear THREE.Color objects
    const colCache = {
      grass: K.color(C.foliage),
      grassLight: K.color(C.foliageLight),
      grassDark: K.color(C.foliageDark),
      grassDry: K.color(0x9aa179),
      sand: K.color(C.sand),
      pebble: K.color(C.pebble),
      rock: K.color(C.rock),
      rockLight: K.color(C.rockLight),
      stone: K.color(C.stone),
      stoneLight: K.color(C.stoneLight),
      stoneDark: K.color(C.stoneDark),
      concrete: K.color(C.concrete),
      concreteDark: K.color(C.concreteDark),
      dirt: K.color(0x8d7a5f),
      wet: K.color(0x6f6b56),
      seaweed: K.color(0x50603f),
      clay: K.color(0x98745a),
      slate: K.color(0x5c5c56),
    };
    const _c1 = new THREE.Color();
    const _c2 = new THREE.Color();
    const _dry = K.color(0x9c9474);
    const _coast = K.color(0xb8a98d);
    const _beach = K.color(0xd9c8a6);

    // beach coves: [x, z, radius, innerWidth]
    const BEACHES = [
      { x: -11.74, z: 2.48, r: 1.02, w: 0.62 },
      { x: -9.86, z: 3.42, r: 0.62, w: 0.40 },
    ];

    const padMaskAt = (x, z) =>
      rectMask(x, z, -9.55, 12.72, -12.99, -4.46, 0.26);

    const plazaCircle = (x, z, cx, cz, r) =>
      1 - smoothstep(r * 0.62, r, Math.hypot(x - cx, z - cz));

    const townStreetPts = L.roads.find((r) => r.id === 'town-street').points;
    const townLanePts = L.roads.find((r) => r.id === 'town-lane').points;

    function beachMaskAt(x, z, h) {
      let m = 0;
      const dc = L.distToCoast(x, z);
      const hGate = 1 - smoothstep(0.32, 0.72, h == null ? 0.2 : h);
      if (hGate <= 0) return 0;
      for (const b of BEACHES) {
        const d = Math.hypot(x - b.x, z - b.z);
        let k = 1 - smoothstep(b.r * 0.35, b.r, d);
        k *= 1 - smoothstep(b.w, b.w + 0.42, dc);
        if (k > m) m = k;
      }
      return m * hGate;
    }

    function paintGround(x, z, h, slope, dc, dw) {
      const n1 = fbm(x * 0.55 + 3.1, z * 0.55 - 1.7, 3);
      const n2 = fbm(x * 2.1 - 5.0, z * 2.1 + 2.0, 2);
      const n3 = fbm(x * 5.3 + 9.0, z * 5.3 - 4.0, 2);

      // --- natural base: summer grass / scrub, drier on the hilltops
      const c = _c1.copy(colCache.grass);
      c.lerp(colCache.grassLight, clamp(n1 * 1.3 - 0.05, 0, 1) * 0.95);
      c.lerp(colCache.grassDark, clamp((1 - n2) * 0.5 - 0.08, 0, 0.4));
      c.lerp(colCache.grassDry, clamp(smoothstep(0.52, 0.96, n1) * 0.42, 0, 0.42));
      c.lerp(_dry, smoothstep(2.45, 3.3, h) * 0.24);

      // --- exposed rock on steep faces
      const rockM = smoothstep(0.4, 0.82, slope) * (0.45 + 0.55 * n2);
      if (rockM > 0.001) {
        _c2.copy(colCache.rock);
        _c2.lerp(colCache.rockLight, 0.15 + 0.4 * n2);
        _c2.lerp(colCache.stoneDark, 0.12 * n3);
        c.lerp(_c2, clamp(rockM * 0.85, 0, 0.85));
      }
      // --- patches of raw earth / worn ground
      const dirtM = smoothstep(0.6, 0.88, n3) * (1 - rockM) * 0.28;
      if (dirtM > 0.001) c.lerp(colCache.dirt, dirtM);

      // --- shoreline: pebble / sand strip only at the low waterline, rockier up
      const shoreM = 1 - smoothstep(0.03, 0.34, dc);
      const lowShore = 1 - smoothstep(0.42, 1.05, h);
      const coastM = shoreM * lowShore;
      if (coastM > 0.002) {
        _c2.copy(_coast).lerp(colCache.pebble, 0.4 + 0.45 * n2);
        c.lerp(_c2, coastM * 0.9);
      }
      const rimRock = shoreM * smoothstep(0.55, 1.3, h) * 0.5;
      if (rimRock > 0.002) {
        _c2.copy(colCache.rock).lerp(colCache.rockLight, 0.3 * n2);
        c.lerp(_c2, clamp(rimRock, 0, 0.55));
      }
      // --- wet tide band right at the waterline
      const wetM = 1 - smoothstep(0.1, 0.3, h);
      if (wetM > 0.002) c.lerp(colCache.wet, clamp(wetM * 0.8, 0, 0.8));

      // --- pebble beach coves
      const bm = beachMaskAt(x, z, h);
      if (bm > 0.003) {
        _c2.copy(_beach).lerp(colCache.pebble, 0.22 + 0.3 * n3);
        c.lerp(_c2, bm * 0.94);
      }

      // --- built hardscape ------------------------------------------------
      const pad = padMaskAt(x, z);
      const apron = rectMask(x, z, -8.65, 12.5, -6.12, -4.46, 0.1);
      const fish = rectMask(x, z, -10.68, -9.55, -4.46, 2.44, 0.1);
      let pave = Math.max(apron, fish);
      // town street & lane paving verges
      const ds = polyDist(x, z, townStreetPts), dl = polyDist(x, z, townLanePts);
      pave = Math.max(pave, 1 - smoothstep(0.25, 0.40, ds));
      pave = Math.max(pave, 1 - smoothstep(0.19, 0.32, dl));
      // plazas
      let plaza = 0;
      plaza = Math.max(plaza, plazaCircle(x, z, -11.05, -3.3, 0.42));
      plaza = Math.max(plaza, plazaCircle(x, z, -10.28, -1.9, 0.4));
      pave = Math.max(pave, plaza * 0.96);

      if (pave > 0.004) {
        _c2.copy(colCache.stone);
        _c2.lerp(colCache.concreteDark, 0.44 + 0.22 * n2);
        _c2.lerp(colCache.stoneLight, clamp(n3 * 0.3, 0, 0.3));
        c.lerp(_c2, pave * 0.96);
      }
      if (pad > 0.004) {
        _c2.copy(colCache.concrete);
        _c2.lerp(colCache.concreteDark, 0.42 + 0.4 * n2);
        c.lerp(_c2, pad * 0.97);
      }
      // --- a whisper of high-frequency variation everywhere
      c.offsetHSL((n3 - 0.5) * 0.012, (n2 - 0.5) * 0.05, (n3 - 0.5) * 0.035);
      return c;
    }

    /* ---- grid pre-pass ------------------------------------------------ */
    const STEP = 0.14;
    const GX0 = -12.82, GX1 = 12.86;
    const GZ0 = -13.42, GZ1 = 4.96;
    const GNX = Math.ceil((GX1 - GX0) / STEP) + 1;
    const GNZ = Math.ceil((GZ1 - GZ0) / STEP) + 1;
    const NN = GNX * GNZ;
    const GH = new Float32Array(NN);
    const GDC = new Float32Array(NN);
    const GDW = new Float32Array(NN);
    const GNx = new Float32Array(NN);
    const GNy = new Float32Array(NN);
    const GNz = new Float32Array(NN);
    const GCC = new Float32Array(NN * 3);
    const GS = new Float32Array(NN);
    const gx = (i) => GX0 + i * STEP;
    const gz = (j) => GZ0 + j * STEP;

    for (let j = 0; j < GNZ; j++) {
      for (let i = 0; i < GNX; i++) {
        const k = j * GNX + i;
        const x = gx(i), z = gz(j);
        const h = L.heightAt(x, z);
        const dc = L.distToCoast(x, z);
        const dw = L.distToHarbourWall(x, z);
        GH[k] = h;
        GDC[k] = dc;
        GDW[k] = dw;
        GS[k] = L.pointInLand(x, z) ? Math.max(dc, 0.001) : -Math.max(dc, 0.001);
      }
    }
    for (let j = 0; j < GNZ; j++) {
      const jm = Math.max(0, j - 1), jp = Math.min(GNZ - 1, j + 1);
      for (let i = 0; i < GNX; i++) {
        const k = j * GNX + i;
        const im = Math.max(0, i - 1), ip = Math.min(GNX - 1, i + 1);
        const hx = (GH[j * GNX + ip] - GH[j * GNX + im]) / ((ip - im) * STEP);
        const hz = (GH[jp * GNX + i] - GH[jm * GNX + i]) / ((jp - jm) * STEP);
        let nx = -hx, ny = 1, nz = -hz;
        const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        GNx[k] = nx * il; GNy[k] = ny * il; GNz[k] = nz * il;
        const slope = 1 - GNy[k];
        const c = paintGround(gx(i), gz(j), GH[k], slope, GDC[k], GDW[k]);
        GCC[k * 3] = c.r; GCC[k * 3 + 1] = c.g; GCC[k * 3 + 2] = c.b;
      }
    }

    /* ---- arbitrary ground sample (cut vertices, prop placement helpers) -- */
    function sampleGround(x, z, isCut) {
      const y = L.heightAt(x, z);
      const e = 0.035;
      const hx = (L.heightAt(x + e, z) - L.heightAt(x - e, z)) / (2 * e);
      const hz = (L.heightAt(x, z + e) - L.heightAt(x, z - e)) / (2 * e);
      let nx = -hx, ny = 1, nz = -hz;
      const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx *= il; ny *= il; nz *= il;
      const dc = L.distToCoast(x, z);
      const dw = L.distToHarbourWall(x, z);
      const c = paintGround(x, z, y, 1 - ny, dc, dw);
      return { x, z, y, nx, ny, nz, r: c.r, g: c.g, b: c.b, s: 0, cut: !!isCut };
    }

    /* ---- cells that contain an outline vertex need exact wedge clipping -- */
    const outlineCentroid = (() => {
      let sx = 0, sz = 0;
      for (const p of L.landOutline) { sx += p[0]; sz += p[1]; }
      return [sx / L.landOutline.length, sz / L.landOutline.length];
    })();
    const vertexCells = new Map();
    (function markVertexCells() {
      const outline = L.landOutline;
      for (let vi = 0; vi < outline.length; vi++) {
        const prev = outline[(vi - 1 + outline.length) % outline.length];
        const cur = outline[vi];
        const next = outline[(vi + 1) % outline.length];
        const cross =
          (cur[0] - prev[0]) * (next[1] - cur[1]) -
          (cur[1] - prev[1]) * (next[0] - cur[0]);
        if (cross > 0) continue; // reflex vertex (quay notch): masonry covers it
        const planes = [];
        for (const [A, B] of [[prev, cur], [cur, next]]) {
          const dx = B[0] - A[0], dz = B[1] - A[1];
          let nx = dz, nz = -dx;
          const nl = Math.hypot(nx, nz) || 1;
          nx /= nl; nz /= nl;
          if ((outlineCentroid[0] - A[0]) * nx + (outlineCentroid[1] - A[1]) * nz < 0) {
            nx = -nx; nz = -nz;
          }
          planes.push({ ax: A[0], az: A[1], nx, nz });
        }
        const ci = Math.floor((cur[0] - GX0) / STEP);
        const cj = Math.floor((cur[1] - GZ0) / STEP);
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const i = ci + di, j = cj + dj;
            if (i < 0 || j < 0 || i >= GNX - 1 || j >= GNZ - 1) continue;
            const x0 = gx(i), x1 = gx(i + 1), z0 = gz(j), z1 = gz(j + 1);
            const eps = 1e-4;
            if (cur[0] < x0 - eps || cur[0] > x1 + eps || cur[1] < z0 - eps || cur[1] > z1 + eps) continue;
            if (!vertexCells.has(j * GNX + i)) vertexCells.set(j * GNX + i, planes);
          }
        }
      }
    })();

    /* ---- marching-squares mesh (non indexed, analytic-ish normals) ----- */
    const pos = [], nrm = [], cols = [];
    let islandTris = 0;

    function nodeVert(i, j) {
      const k = j * GNX + i;
      return {
        x: gx(i), z: gz(j), y: GH[k],
        nx: GNx[k], ny: GNy[k], nz: GNz[k],
        r: GCC[k * 3], g: GCC[k * 3 + 1], b: GCC[k * 3 + 2],
        s: GS[k], cut: false,
      };
    }
    function cutVert(a, b) {
      const t = clamp(a.s / (a.s - b.s), 0, 1);
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      return sampleGround(x, z, true);
    }
    function pushTri(a, b, c) {
      const ax = a.x, ay = a.y, az = a.z;
      // recompute flat-ish normal only if degenerate interpolation found
      const verts = [a, b, c];
      for (let n = 0; n < 3; n++) {
        const v = verts[n];
        pos.push(v.x, v.y, v.z);
        nrm.push(v.nx, v.ny, v.nz);
        cols.push(v.r, v.g, v.b);
      }
      islandTris++;
    }
    function clipAndPush(p0, p1, p2) {
      const src = [p0, p1, p2];
      const out = [];
      for (let i = 0; i < 3; i++) {
        const a = src[i], b = src[(i + 1) % 3];
        const ain = a.s >= 0, bin = b.s >= 0;
        if (ain) out.push(a);
        if (ain !== bin) out.push(cutVert(a, b));
      }
      for (let i = 1; i + 1 < out.length; i++) pushTri(out[0], out[i], out[i + 1]);
      // cliff skirt segments: consecutive cut points in the clipped polygon
      if (out.length >= 3) {
        const cuts = out.filter((v) => v.cut);
        if (cuts.length === 2) addSkirtEdge(cuts[0], cuts[1]);
      }
    }

    /* ---- layered cliff skirt ------------------------------------------ */
    const skirtBands = [
      // [bottomY, outwardOffset, colourA, colourB]
      { y: -0.02, o: 0.012, ca: K.color(0x6c6a55), cb: K.color(0x7c7460), jit: 0.05 },
      { y: -0.30, o: 0.030, ca: K.color(0x9a8464), cb: K.color(0xa89377), jit: 0.06 },
      { y: -0.68, o: 0.006, ca: K.color(0x8a7357), cb: K.color(0x9b8060), jit: 0.07 },
      { y: -1.05, o: -0.020, ca: K.color(0x7d7a6d), cb: K.color(0x8b877a), jit: 0.05 },
      { y: -1.40, o: 0.026, ca: K.color(0x56564e), cb: K.color(0x626257), jit: 0.05 },
    ];
    const skirtPos = [], skirtNrm = [], skirtCol = [];

    function addSkirtEdge(a, b) {
      const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
      if (L.distToHarbourWall(mx, mz) < 0.07) return; // vertical quay wall covers it
      // outward XZ direction
      let ex = b.x - a.x, ez = b.z - a.z;
      const el = Math.hypot(ex, ez) || 1;
      ex /= el; ez /= el;
      let nx = ez, nz = -ex;
      if (L.pointInLand(mx + nx * 0.03, mz + nz * 0.03)) { nx = -nx; nz = -nz; }
      const top = Math.max(a.y, -0.2);
      const v = [];
      for (let r = 0; r < skirtBands.length; r++) {
        const band = skirtBands[r];
        const oy = r === 0 ? top : band.y;
        const ox = band.o, oz = band.o;
        v.push({
          ax: a.x + nx * ox, az: a.z + nz * oz, y: oy,
          bx: b.x + nx * ox, bz: b.z + nz * oz,
        });
      }
      for (let r = 0; r < skirtBands.length - 1; r++) {
        const band = skirtBands[r];
        const topRow = v[r], botRow = v[r + 1];
        const tint = rand();
        const ca = band.ca.clone().lerp(band.cb, tint);
        if (r === 0) ca.lerp(colCache.seaweed, 0.22 + 0.1 * rand());
        ca.offsetHSL((rand() - 0.5) * 0.01, 0, (rand() - 0.5) * band.jit);
        // triangles
        const quad = [
          [topRow.ax, topRow.y, topRow.az],
          [topRow.bx, topRow.y, topRow.bz],
          [botRow.bx, botRow.y, botRow.bz],
          [botRow.ax, botRow.y, botRow.az],
        ];
        // quad normal / outward check
        const ux = quad[1][0] - quad[0][0], uy = quad[1][1] - quad[0][1], uz = quad[1][2] - quad[0][2];
        const wx = quad[3][0] - quad[0][0], wy = quad[3][1] - quad[0][1], wz = quad[3][2] - quad[0][2];
        let qnx = uy * wz - uz * wy, qny = uz * wx - ux * wz, qnz = ux * wy - uy * wx;
        const ql = Math.hypot(qnx, qny, qnz) || 1;
        qnx /= ql; qny /= ql; qnz /= ql;
        if (qnx * nx + qnz * nz < 0) { qnx = -qnx; qny = -qny; qnz = -qnz; }
        for (const tri of [[0, 1, 2], [0, 2, 3]]) {
          for (const idx of tri) {
            skirtPos.push(quad[idx][0], quad[idx][1], quad[idx][2]);
            skirtNrm.push(qnx, qny, qnz);
            skirtCol.push(ca.r, ca.g, ca.b);
          }
        }
      }
    }

    // exact clip of a cell against one polygon-edge half-plane
    function clipPolyPlane(poly, pl) {
      const out = [];
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const A = poly[i], B = poly[(i + 1) % n];
        const fa = (A.x - pl.ax) * pl.nx + (A.z - pl.az) * pl.nz;
        const fb = (B.x - pl.ax) * pl.nx + (B.z - pl.az) * pl.nz;
        if (fa >= 0) out.push(A);
        if ((fa >= 0) !== (fb >= 0)) {
          const t = fa / (fa - fb);
          const x = A.x + (B.x - A.x) * t;
          const z = A.z + (B.z - A.z) * t;
          out.push(sampleGround(x, z, true));
        }
      }
      return out;
    }
    // cells that contain a sharp outline corner: clip exactly by the two local
    // edges so the model does not overshoot the coast there
    function buildVertexCell(i, j, planes) {
      const a = nodeVert(i, j), d = nodeVert(i, j + 1);
      const c = nodeVert(i + 1, j + 1), b = nodeVert(i + 1, j);
      let poly = [a, d, c, b];
      for (const pl of planes) {
        poly = clipPolyPlane(poly, pl);
        if (poly.length < 3) return;
      }
      if (poly.length < 3) return;
      for (let k = 1; k + 1 < poly.length; k++) pushTri(poly[0], poly[k], poly[k + 1]);
      const n = poly.length;
      for (let k = 0; k < n; k++) {
        const p = poly[k], q = poly[(k + 1) % n];
        if (p.cut && q.cut) addSkirtEdge(p, q);
      }
    }

    // walk the grid
    for (let j = 0; j < GNZ - 1; j++) {
      for (let i = 0; i < GNX - 1; i++) {
        const vc = vertexCells.get(j * GNX + i);
        if (vc) { buildVertexCell(i, j, vc); continue; }
        const a = nodeVert(i, j);        // (x0, z0)
        const b = nodeVert(i + 1, j);    // (x1, z0)
        const c = nodeVert(i + 1, j + 1);// (x1, z1)
        const d = nodeVert(i, j + 1);    // (x0, z1)
        const s = [a.s, b.s, c.s, d.s];
        if (s[0] < 0 && s[1] < 0 && s[2] < 0 && s[3] < 0) continue;
        if (s[0] >= 0 && s[1] >= 0 && s[2] >= 0 && s[3] >= 0) {
          pushTri(a, c, b);
          pushTri(a, d, c);
        } else {
          clipAndPush(a, c, b);
          clipAndPush(a, d, c);
        }
      }
    }

    /* ---- assemble the island mesh -------------------------------------- */
    const landPosArr = new Float32Array(pos.length + skirtPos.length);
    landPosArr.set(pos, 0);
    landPosArr.set(skirtPos, pos.length);
    const landNrmArr = new Float32Array(nrm.length + skirtNrm.length);
    landNrmArr.set(nrm, 0);
    landNrmArr.set(skirtNrm, nrm.length);
    const landColArr = new Float32Array(cols.length + skirtCol.length);
    landColArr.set(cols, 0);
    landColArr.set(skirtCol, cols.length);

    const landGeo = new THREE.BufferGeometry();
    landGeo.setAttribute('position', new THREE.BufferAttribute(landPosArr, 3));
    landGeo.setAttribute('normal', new THREE.BufferAttribute(landNrmArr, 3));
    landGeo.setAttribute('color', new THREE.BufferAttribute(landColArr, 3));
    landGeo.computeBoundingSphere();
    landGeo.computeBoundingBox();
    const landMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.5,
    });
    const landMesh = new THREE.Mesh(landGeo, landMat);
    landMesh.name = 'terrain:island';
    landMesh.castShadow = true;
    landMesh.receiveShadow = true;
    landMesh.matrixAutoUpdate = false;
    landMesh.updateMatrix();
    scene.add(landMesh);

    /* ====================================================================== *
     * 2.  COASTLINE — boulders, pebbles, wrack, driftwood
     * ====================================================================== */
    const outline = L.landOutline;
    const coastSegs = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      let nx = uz, nz = -ux;
      const mx = (a[0] + b[0]) * 0.5, mz = (a[1] + b[1]) * 0.5;
      if (L.pointInLand(mx + nx * 0.05, mz + nz * 0.05)) { nx = -nx; nz = -nz; }
      coastSegs.push({
        a, b, len, ux, uz, nx, nz,
        quay: L.distToHarbourWall(mx, mz) < 0.02,
      });
    }

    // --- instancers: boulders, cobbles, pebbles, wrack
    // NOTE: per-instance colours only reach the shader when the material has
    // vertexColors enabled and the geometry carries a `color` attribute, so we
    // stamp a white colour attribute on each instanced geometry.
    function instGeo(geo, flat) {
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      arr.fill(1);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      geo.userData.flat = flat;
      return geo;
    }
    function instMat(opt) {
      return new THREE.MeshStandardMaterial(Object.assign({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.93,
        metalness: 0.0,
        flatShading: true,
        envMapIntensity: 0.45,
      }, opt || {}));
    }
    const rockMat = instMat({ roughness: 0.96 });
    const boulderInst = K.instancer(instGeo(new THREE.IcosahedronGeometry(1, 1)), rockMat, { name: 'coast:boulders' });
    const cobbleInst = K.instancer(instGeo(new THREE.IcosahedronGeometry(1, 0)), rockMat, { name: 'coast:cobbles' });
    const wrackMat = instMat({ roughness: 0.9, flatShading: false });
    const wrackInst = K.instancer(instGeo(new THREE.SphereGeometry(1, 6, 4)), wrackMat, { name: 'coast:wrack' });
    const pebbleInst = K.instancer(instGeo(new THREE.IcosahedronGeometry(1, 0)), rockMat, { name: 'beach:pebbles' });
    const shrubInst = K.instancer(instGeo(new THREE.IcosahedronGeometry(1, 1)), instMat({ roughness: 0.9 }), { name: 'coast:shrubs' });
    const tuftInst = K.instancer(instGeo(new THREE.IcosahedronGeometry(1, 0)), instMat({ roughness: 0.95 }), { name: 'coast:tufts' });

    function rockColor(kind) {
      const base = kind === 'sand' ? 0x9d907a : kind === 'dark' ? 0x5c574c : 0x7a7161;
      return K.vary(base, rand, { l: 0.075, s: 0.05, h: 0.02 });
    }

    for (const seg of coastSegs) {
      if (seg.quay) continue;
      const n = Math.max(2, Math.round(seg.len / 0.19));
      for (let s = 0; s < n; s++) {
        const t = (s + 0.5) / n;
        const px = seg.a[0] + (seg.b[0] - seg.a[0]) * t;
        const pz = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
        const beach = beachMaskAt(px + seg.nx * 0.2, pz + seg.nz * 0.2);
        // waterline boulders
        if (rand() < 0.8 - beach * 0.55) {
          const off = 0.02 + rand() * 0.26;
          const x = px + seg.nx * off, z = pz + seg.nz * off;
          const sc = 0.045 + rand() * 0.085 + (rand() < 0.1 ? 0.09 : 0);
          const y = -0.02 + rand() * 0.075;
          boulderInst.add({
            pos: [x, y, z],
            rot: [rand() * 3, rand() * 6.28, rand() * 3],
            scale: [sc * (0.8 + rand() * 0.5), sc * (0.5 + rand() * 0.4), sc * (0.8 + rand() * 0.5)],
            color: rockColor(rand() < 0.3 ? 'dark' : 'rock'),
          });
        }
        // upper shore cobbles
        if (rand() < 0.55) {
          const off = -(0.03 + rand() * 0.42);
          const x = px + seg.nx * off, z = pz + seg.nz * off;
          const y = L.heightAt(x, z);
          const sc = 0.028 + rand() * 0.075;
          cobbleInst.add({
            pos: [x, y + sc * 0.2, z],
            rot: [rand() * 3, rand() * 6.28, rand() * 3],
            scale: [sc * (0.9 + rand() * 0.5), sc * (0.5 + rand() * 0.35), sc * (0.9 + rand() * 0.5)],
            color: rockColor(beach > 0.4 ? 'sand' : rand() < 0.4 ? 'dark' : 'rock'),
          });
        }
        // clumps of seaweed at the tide line
        if (rand() < 0.16 && beach < 0.55) {
          const x = px + seg.nx * (0.03 + rand() * 0.1);
          const z = pz + seg.nz * (0.03 + rand() * 0.1);
          wrackInst.add({
            pos: [x, 0.025 + rand() * 0.03, z],
            rot: [0, rand() * 6.28, 0],
            scale: [0.06 + rand() * 0.08, 0.016 + rand() * 0.012, 0.035 + rand() * 0.05],
            color: K.vary(0x4f5c3c, rand, { l: 0.07, s: 0.06, h: 0.02 }),
          });
        }
      }
    }

    // a few larger outcrops on the outer (north / west) coast
    const outcrops = [
      [12.05, -6.4], [11.1, -7.6], [9.2, -9.1], [6.2, -11.2], [2.0, -12.55],
      [-2.6, -12.6], [-5.6, -11.9], [-8.3, -10.1], [-10.4, -7.8],
      [-11.7, -5.6], [-12.2, -3.6], [-12.1, -0.6], [-11.9, 1.6], [-11.2, 3.2],
    ];
    for (const [ox, oz] of outcrops) {
      const d = L.distToCoast(ox, oz);
      const steps = 3 + Math.floor(rand() * 4);
      for (let s = 0; s < steps; s++) {
        const ang = rand() * Math.PI * 2;
        const rad = rand() * 0.42;
        const x = ox + Math.cos(ang) * rad, z = oz + Math.sin(ang) * rad;
        if (!L.pointInLand(x, z) && L.distToCoast(x, z) > 0.28) continue;
        const sc = 0.1 + rand() * 0.15;
        boulderInst.add({
          pos: [x, -0.03 + rand() * 0.06 + (sc * 0.22), z],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc * (0.85 + rand() * 0.6), sc * (0.55 + rand() * 0.5), sc * (0.85 + rand() * 0.6)],
          color: rockColor('rock'),
        });
      }
    }

    // --- pebble beaches + driftwood
    for (const b of BEACHES) {
      // find nearest point on the coast for each beach and sprinkle along the shore
      let bestSeg = null, bestT = 0, bestD = 1e9;
      for (const seg of coastSegs) {
        if (seg.quay) continue;
        const n = 12;
        for (let s = 0; s <= n; s++) {
          const t = s / n;
          const px = seg.a[0] + (seg.b[0] - seg.a[0]) * t;
          const pz = seg.a[1] + (seg.b[1] - seg.a[1]) * t;
          const d = Math.hypot(px - b.x, pz - b.z);
          if (d < bestD) { bestD = d; bestSeg = seg; bestT = t; }
        }
      }
      if (!bestSeg) continue;
      const cx = bestSeg.a[0] + (bestSeg.b[0] - bestSeg.a[0]) * bestT;
      const cz = bestSeg.a[1] + (bestSeg.b[1] - bestSeg.a[1]) * bestT;
      const nPeb = Math.round(110 * b.r);
      for (let p = 0; p < nPeb; p++) {
        const along = (rand() - 0.5) * b.r * 1.9;
        const inward = 0.02 + rand() * b.w * 0.95;
        const x = cx + bestSeg.ux * along - bestSeg.nx * inward * (rand() < 0.15 ? -1 : 1);
        const z = cz + bestSeg.uz * along - bestSeg.nz * inward * (rand() < 0.15 ? -1 : 1);
        const y = L.heightAt(x, z);
        const sc = 0.014 + rand() * 0.028;
        pebbleInst.add({
          pos: [x, y + sc * 0.25, z],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc, sc * 0.55, sc * 0.9],
          color: rockColor(rand() < 0.5 ? 'sand' : 'dark'),
        });
      }
      // driftwood logs
      const logs = 2 + Math.floor(rand() * 2);
      for (let l = 0; l < logs; l++) {
        const along = (rand() - 0.5) * b.r * 1.4;
        const inward = 0.05 + rand() * b.w * 0.5;
        const x = cx + bestSeg.ux * along - bestSeg.nx * inward;
        const z = cz + bestSeg.uz * along - bestSeg.nz * inward;
        const y = L.heightAt(x, z);
        const a0 = bestSeg.ux * (0.35 + rand() * 0.35);
        const a1 = bestSeg.uz * (0.35 + rand() * 0.35);
        const yaw = Math.atan2(a0, a1) + (rand() - 0.5) * 0.5;
        const L0 = 0.28 + rand() * 0.4;
        const rr = 0.022 + rand() * 0.016;
        const dx = Math.sin(yaw) * L0 * 0.5, dz = Math.cos(yaw) * L0 * 0.5;
        K.strut([x - dx, y + rr, z - dz], [x + dx, y + rr * 0.8, z + dz], rr, K.vary(C.woodLight, rand, { l: 0.08, s: 0.07 }), { seg: 7 });
        K.cyl(rr * 0.75, 0.05, x + dx, y + rr, z + dz, K.vary(C.wood, rand, { l: 0.06 }), { rot: [Math.PI / 2, yaw, 0], seg: 6 });
        P.stats.driftwood = (P.stats.driftwood || 0) + 1;
      }
      // a couple of bigger stones framing the cove
      for (let s = 0; s < 3; s++) {
        const along = (s - 1) * b.r * 0.9 + (rand() - 0.5) * 0.2;
        const inward = 0.02 + rand() * 0.1;
        const x = cx + bestSeg.ux * along - bestSeg.nx * inward;
        const z = cz + bestSeg.uz * along - bestSeg.nz * inward;
        const sc = 0.075 + rand() * 0.075;
        boulderInst.add({
          pos: [x, -0.01 + sc * 0.15, z],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc, sc * 0.55, sc * 0.8],
          color: rockColor('dark'),
        });
      }
    }


    /* ---- low scrub + dry tufts + inland outcrops (breaks up the smooth
     *      hill surfaces and gives the coast a lived-in edge) --------------- */
    (function islandScrub() {
      const onRoad = (x, z) =>
        polyDist(x, z, townStreetPts) < 0.42 ||
        polyDist(x, z, townLanePts) < 0.36 ||
        Math.abs(x - 11.95) < 0.42 ||
        Math.abs(z + 11.55) < 0.42 ||
        Math.abs(z + 10.35) < 0.55;
      function slopeAt(x, z) {
        const e = 0.12;
        const hx = (L.heightAt(x + e, z) - L.heightAt(x - e, z)) / (2 * e);
        const hz = (L.heightAt(x, z + e) - L.heightAt(x, z - e)) / (2 * e);
        return Math.hypot(hx, hz);
      }
      let placed = 0, tries = 0;
      while (placed < 170 && tries < 2600) {
        tries++;
        const x = -12.7 + rand() * 25.4;
        const z = -13.3 + rand() * 18.1;
        if (!L.pointInLand(x, z)) continue;
        const dc = L.distToCoast(x, z);
        const h = L.heightAt(x, z);
        if (dc < 0.16) continue;
        if (h < 0.3) continue;
        if (padMaskAt(x, z) > 0.04) continue;
        if (onRoad(x, z)) continue;
        if (slopeAt(x, z) > 1.15) continue;
        // thinner in the old-town core (buildings live there), but keep the
        // outer slopes and the south tip lush
        const inTown = x < -9.62 && x > -12.4 && z > -12.9 && z < 4.5;
        const townCore = inTown && x > -11.6 && z < 2.2;
        if (townCore && rand() < 0.55) continue;
        const sc = 0.075 + rand() * 0.085;
        const col = rand() < 0.3 ? C.foliageDark : rand() < 0.55 ? C.foliage : C.foliageLight;
        shrubInst.add({
          pos: [x, h + sc * 0.22, z],
          rot: [0, rand() * 6.28, (rand() - 0.5) * 0.2],
          scale: [sc * (0.9 + rand() * 0.5), sc * (0.55 + rand() * 0.35), sc * (0.9 + rand() * 0.5)],
          color: K.vary(col, rand, { l: 0.06, s: 0.06, h: 0.01 }),
        });
        placed++;
        // little cluster companion
        if (rand() < 0.45) {
          const sc2 = 0.045 + rand() * 0.05;
          shrubInst.add({
            pos: [x + (rand() - 0.5) * 0.2, h + sc2 * 0.2, z + (rand() - 0.5) * 0.2],
            rot: [0, rand() * 6.28, 0],
            scale: [sc2, sc2 * 0.6, sc2],
            color: K.vary(col, rand, { l: 0.07, s: 0.07 }),
          });
        }
      }
      // dry grass tufts on the low shore shelf
      let tufts = 0; tries = 0;
      while (tufts < 260 && tries < 2600) {
        tries++;
        const x = -12.7 + rand() * 25.4;
        const z = -13.3 + rand() * 18.1;
        if (!L.pointInLand(x, z)) continue;
        const dc = L.distToCoast(x, z);
        const h = L.heightAt(x, z);
        if (dc < 0.04 || dc > 0.6) continue;
        if (h > 0.75) continue;
        if (padMaskAt(x, z) > 0.04) continue;
        const sc = 0.03 + rand() * 0.045;
        tuftInst.add({
          pos: [x, h + sc * 0.22, z],
          rot: [0, rand() * 6.28, 0],
          scale: [sc * 1.5, sc * 0.7, sc * 1.1],
          color: K.vary(rand() < 0.5 ? 0x8c8a62 : 0x767a55, rand, { l: 0.07, s: 0.05 }),
        });
        tufts++;
      }
      // inland rock outcrops on the hill flanks
      for (const [ox, oz, n, spread] of [
        [-11.65, -2.55, 4, 0.42], [-12.05, -6.15, 3, 0.36], [-11.05, 1.35, 3, 0.3],
        [-12.15, -0.45, 3, 0.3], [-11.2, -4.75, 4, 0.38], [10.85, -7.45, 3, 0.35],
        [7.05, -12.35, 3, 0.32], [-7.85, -12.7, 3, 0.34], [-5.3, -12.45, 2, 0.3],
        [2.5, -12.85, 3, 0.34], [-9.5, -13.05, 2, 0.3],
      ]) {
        for (let i = 0; i < n; i++) {
          const a = rand() * 6.28, rr = rand() * spread;
          const x = ox + Math.cos(a) * rr, z = oz + Math.sin(a) * rr;
          if (!L.pointInLand(x, z)) continue;
          const sc = 0.1 + rand() * 0.14;
          const h = L.heightAt(x, z);
          boulderInst.add({
            pos: [x, h - sc * 0.32, z],
            rot: [rand() * 3, rand() * 6.28, rand() * 3],
            scale: [sc * (0.9 + rand() * 0.5), sc * (0.5 + rand() * 0.35), sc * (0.9 + rand() * 0.5)],
            color: rockColor(rand() < 0.35 ? 'dark' : 'rock'),
          });
        }
      }
    })();

    /* ====================================================================== *
     * 3.  QUAY WALLS, FURNITURE, CRANE RAILS, PAVING
     * ====================================================================== */
    const quayBollards = [];
    const fishingBollards = [];

    // a local frame on the quay line: u runs along the wall, v points seaward
    function makeFrame(ox, oz, ux, uz, nx, nz) {
      const ang = Math.atan2(-uz, ux);
      return {
        ox, oz, ux, uz, nx, nz, ang,
        map(u, v) { return [ox + ux * u + nx * v, oz + uz * u + nz * v]; },
        box(u0, u1, v0, v1, y0, y1, color, opts) {
          const p = this.map((u0 + u1) / 2, (v0 + v1) / 2);
          K.box(Math.abs(u1 - u0), y1 - y0, Math.abs(v1 - v0), p[0], (y0 + y1) / 2, p[1], color,
            Object.assign({ rot: [0, ang, 0] }, opts || {}));
        },
        cyl(u, v, r, h, y, color, opts) {
          const p = this.map(u, v);
          K.cyl(r, h, p[0], y, p[1], color, Object.assign({}, opts || {}));
        },
        strut(u0, v0, y0, u1, v1, y1, r, color, opts) {
          const a = this.map(u0, v0), b = this.map(u1, v1);
          K.strut([a[0], y0, a[1]], [b[0], y1, b[1]], r, color, Object.assign({}, opts || {}));
        },
      };
    }

    const QUAY_TONES = [0xa2988a, 0x9b9183, 0x8e8577];

    function quayWallBody(f, length, kind) {
      // segmented concrete core (a few subtle tone shifts read as pours)
      const SEG = kind === 'cargo' ? 2.47 : 2.26;
      const nSeg = Math.max(1, Math.round(length / SEG));
      const segLen = length / nSeg;
      for (let i = 0; i < nSeg; i++) {
        const u0 = i * segLen, u1 = u0 + segLen;
        const tone = K.vary(QUAY_TONES[i % 3], rand, { l: 0.03, s: 0.03, h: 0.008 });
        f.box(u0 + 0.009, u1 - 0.009, -0.19, 0.02, -1.05, 1.06, tone);
      }
      // vertical pour joints + rain / rust streaks
      for (let i = 0; i <= nSeg; i++) {
        const u = i * segLen;
        f.box(u - 0.006, u + 0.006, 0.021, 0.029, -0.9, 1.05, K.shade(C.concreteDark, -0.05, 0, 0));
        if (i < nSeg && i > 0) {
          const ru = u + (rand() - 0.5) * 0.14;
          const rh = 0.16 + rand() * 0.42;
          f.box(ru - 0.014, ru + 0.012, 0.0225, 0.0265, 1.03 - rh, 1.03, K.vary(0x8a5b40, rand, { l: 0.04, s: 0.03 }));
          f.box(ru - 0.006, ru + 0.008, 0.0230, 0.0268, 1.03 - rh * 0.7, 1.03, K.vary(0x74573f, rand, { l: 0.05, s: 0.03 }));
          // wider dirty wash
          f.box(ru - 0.05, ru + 0.05, 0.0215, 0.0245, 0.55, 1.02, K.vary(0x8f887a, rand, { l: 0.03, s: 0.02 }));
        }
      }
      // horizontal construction joint + tide / weed band
      f.box(0, length, 0.0205, 0.0255, 0.56, 0.575, C.concreteDark);
      f.box(0, length, 0.0205, 0.028, -0.05, 0.055, K.shade(0x4b4a3d, -0.05, 0.03, -0.01));
      f.box(0, length, 0.0205, 0.027, 0.055, 0.135, K.shade(0x565b46, -0.03, 0.04, -0.02));
      f.box(0, length, 0.0215, 0.0265, 0.135, 0.19, K.shade(0x7a7767, 0.0, 0.02, 0.0));
      // barnacle speckles along the tide line
      for (let u = 0.15; u < length; u += 0.16) {
        if (rand() < 0.55) continue;
        const y = 0.06 + rand() * 0.12;
        f.box(u - 0.012, u + 0.012, 0.0225, 0.0275, y, y + 0.016, K.vary(0xa19780, rand, { l: 0.06, s: 0.02 }));
      }
      // utility boxes with conduit running up to the deck
      for (let u = 3.9; u < length - 1.2; u += 5.6) {
        f.box(u - 0.13, u + 0.13, 0.022, 0.05, 0.66, 0.84, K.vary(0x8d8578, rand, { l: 0.03, s: 0.02 }));
        f.box(u - 0.1, u + 0.1, 0.05, 0.065, 0.7, 0.8, K.shade(0x6b665a, 0.02));
        f.box(u - 0.012, u + 0.012, 0.022, 0.032, 0.84, 1.04, K.shade(0x5a564d, 0.0));
        f.box(u - 0.04, u + 0.04, 0.022, 0.032, 1.02, 1.045, K.shade(0x3f3b33, 0.02));
      }
      // painted depth gauge at one end
      for (let i = 0; i < 6; i++) {
        const y = 0.22 + i * 0.12;
        f.box(0.12, 0.22, 0.0215, 0.0265, y, y + 0.055, i % 2 ? C.lineWhite : C.lineYellow);
      }
      // continuous rubber rubbing strip at the waterline
      f.box(0, length, 0.0205, 0.058, 0.16, 0.29, K.vary(0x3d3a33, rand, { l: 0.03, s: 0.02 }));
      f.box(0, length, 0.058, 0.066, 0.19, 0.26, K.vary(0x4a463d, rand, { l: 0.03, s: 0.02 }));
      // steel mooring rings under the coping
      for (let u = 1.4; u < length - 0.6; u += 3.3) {
        const p = f.map(u, 0.032);
        K.torus(0.036, 0.012, p[0], 0.9, p[1], K.vary(0x5f5a50, rand, { l: 0.05 }), {
          rot: [0, f.ang, 0],
          bucket: 'metal',
        });
      }
      // small drain pipes steaming the wall
      for (let u = 2.1; u < length - 0.4; u += 4.4) {
        const p = f.map(u, 0.03);
        K.cyl(0.022, 0.05, p[0], 0.28, p[1], 0x4c493f, { rot: [Math.PI / 2, -f.ang, 0], seg: 8 });
      }
    }

    function quayCoping(f, length) {
      const SL = 0.72;
      const n = Math.max(1, Math.round(length / SL));
      const real = length / n;
      for (let i = 0; i < n; i++) {
        const u0 = i * real + 0.007, u1 = (i + 1) * real - 0.007;
        const tone = K.vary(0xbfb199, rand, { l: 0.035, s: 0.03, h: 0.008 });
        f.box(u0, u1, -0.13, 0.085, 1.065, 1.14, tone);
        // chamfered seaward lip
        f.box(u0 + 0.01, u1 - 0.01, 0.085, 0.105, 1.095, 1.125, K.shade(C.stone, 0.02, -0.02, 0));
        if (i % 3 === 1) {
          f.box(u0 + 0.1, u1 - 0.1, -0.06, 0.03, 1.1405, 1.1425, K.shade(C.stone, -0.03, 0, 0));
        }
      }
      // corner stones
      f.box(-0.02, 0.34, -0.15, 0.1, 1.05, 1.15, K.vary(C.stone, rand, { l: 0.03 }));
      f.box(length - 0.34, length + 0.02, -0.15, 0.1, 1.05, 1.15, K.vary(C.stone, rand, { l: 0.03 }));
    }

    function quayFender(f, u) {
      const p = f.map(u, 0.075);
      // rubber cylinder hanging against the wall
      K.cyl(0.05, 0.32, p[0], 0.58, p[1], K.vary(0x2f2d28, rand, { l: 0.03, s: 0.02 }), { seg: 12 });
      K.cyl(0.055, 0.02, p[0], 0.75, p[1], 0x3a3730, { seg: 12 });
      // chains up to the coping
      const a = f.map(u - 0.035, 0.1), b = f.map(u - 0.035, 0.085);
      K.strut([a[0], 0.75, a[1]], [b[0], 1.09, b[1]], 0.006, 0x5c574b, { seg: 5 });
      K.strut([a[0], 0.75, a[1]], [b[0], 1.09, b[1]], 0.006, 0x5c574b, { seg: 5, rot: [0, 0.06, 0] });
      const c = f.map(u + 0.035, 0.085);
      K.strut([c[0], 0.75, c[1]], [c[0], 1.09, c[1]], 0.006, 0x5c574b, { seg: 5 });
      // bracket plates
      K.box(0.1, 0.03, 0.02, p[0], 0.72, p[1], K.vary(0x6a6353, rand, { l: 0.04 }), { rot: [0, f.ang, 0], bucket: 'metal' });
    }

    function quayLadder(f, u) {
      const y0 = -0.75, y1 = 1.16;
      for (const side of [-1, 1]) {
        const p = f.map(u + side * 0.085, 0.045);
        K.cyl(0.011, y1 - y0, p[0], (y0 + y1) / 2, p[1], K.shade(0x4f4c44, -0.03), { seg: 6, bucket: 'metal' });
        // handrail loops above deck
        K.cyl(0.012, 0.2, p[0], 1.26, p[1], K.shade(0x4f4c44, 0), { seg: 6, bucket: 'metal' });
      }
      for (let y = y0 + 0.18; y < y1 - 0.06; y += 0.155) {
        const p = f.map(u, 0.045);
        K.box(0.17, 0.013, 0.012, p[0], y, p[1], K.vary(0x565248, rand, { l: 0.04 }), { rot: [0, f.ang, 0], bucket: 'metal' });
      }
      // recess shadow
      const p = f.map(u, 0.024);
      K.box(0.22, 1.9, 0.006, p[0], 0.1, p[1], K.shade(C.concreteDark, -0.08), { rot: [0, f.ang, 0] });
    }

    function quayLifeRing(f, u) {
      const p = f.map(u, 0.05);
      // backing board
      K.box(0.2, 0.2, 0.018, p[0], 0.86, p[1], K.vary(C.lineWhite, rand, { l: 0.02, s: 0.02 }), { rot: [0, f.ang, 0] });
      K.box(0.16, 0.16, 0.022, p[0], 0.86, p[1], K.shade(C.rust, -0.02, 0.02), { rot: [0, f.ang, 0] });
      const rp = f.map(u, 0.075);
      K.torus(0.075, 0.026, rp[0], 0.86, rp[1], K.vary(C.lineWhite, rand, { l: 0.02 }), { rot: [0, f.ang, 0] });
      // red quadrants
      for (const a of [0.5, Math.PI + 0.5, Math.PI - 0.5]) {
        const dx = Math.cos(a) * 0.075, dy = Math.sin(a) * 0.075;
        K.box(0.055, 0.03, 0.028, rp[0] + f.ux * dx, 0.86 + dy, rp[1] + f.uz * dx, K.vary(0x9c4a3c, rand, { l: 0.03 }), {
          rot: [0, f.ang, -a],
        });
      }
      // little sign
      f.box(u - 0.09, u + 0.09, 0.058, 0.062, 0.68, 0.72, C.lineWhite);
    }

    // double-bitt bollard, top ≈ 1.29
    function quayBollard(f, u, v, register) {
      const p = f.map(u, v);
      const base = K.vary(0x77705f, rand, { l: 0.04, s: 0.03 });
      const iron = K.vary(0x46423a, rand, { l: 0.05, s: 0.03 });
      K.box(0.26, 0.024, 0.11, p[0], 1.116, p[1], base, { rot: [0, f.ang, 0] });
      for (const side of [-1, 1]) {
        const q = f.map(u + side * 0.058, v);
        K.cyl(0.034, 0.17, q[0], 1.213, q[1], iron, { seg: 10, bucket: 'metal' });
        K.cyl(0.042, 0.018, q[0], 1.305, q[1], K.shade(0x555046, 0.02), { seg: 10, bucket: 'metal' });
      }
      K.box(0.2, 0.026, 0.05, p[0], 1.263, p[1], K.shade(0x504b42, 0.03), { rot: [0, f.ang, 0], bucket: 'metal' });
      K.box(0.06, 0.008, 0.02, p[0], 1.312, p[1], K.shade(0x3e3a33, 0.02), { rot: [0, f.ang, 0], bucket: 'metal' });
      if (register) register.push([p[0], 1.30, p[1]]);
    }

    // stone stair down into the water, cut through the wall
    function quayStairs(f, u, dir) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const v0 = 0.02 + i * 0.14, v1 = v0 + 0.145;
        const topY = 1.03 - i * 0.155;
        f.box(u - 0.24, u + 0.24, v0, v1, topY - 0.14, topY, K.vary(C.stone, rand, { l: 0.03, s: 0.03 }));
        f.box(u - 0.24, u + 0.24, v1 - 0.02, v1, topY - 0.155, topY - 0.13, K.shade(C.stoneDark, 0.02));
        // side stringers hug the flight
        for (const s of [-1, 1]) {
          f.box(u + s * 0.245 - 0.022, u + s * 0.245 + 0.022, v0, v1, topY - 0.3, topY + 0.03,
            K.vary(C.stoneDark, rand, { l: 0.03, s: 0.02 }));
        }
      }
      // recess shadow behind the flight
      const p = f.map(u, 0.025);
      K.box(0.5, 1.6, 0.006, p[0], 0.2, p[1], K.shade(C.concreteDark, -0.08), { rot: [0, f.ang, 0] });
      // handrails on both sides
      for (const s of [-1, 1]) {
        const a = f.map(u + s * 0.245, 0.05), b = f.map(u + s * 0.245, 0.88);
        K.cyl(0.011, 0.95, a[0], 1.5, a[1], K.shade(0x53504a, 0), { seg: 6, bucket: 'metal' });
        K.cyl(0.011, 0.4, b[0], 1.05, b[1], K.shade(0x53504a, 0), { seg: 6, bucket: 'metal' });
        K.strut([a[0], 1.97, a[1]], [b[0], 1.24, b[1]], 0.012, K.shade(0x5a564e, 0), { seg: 6, bucket: 'metal' });
      }
      // wear mark on the coping
      f.box(u - 0.3, u + 0.3, 0.085, 0.11, 1.1415, 1.1435, K.shade(C.stone, -0.06, 0.02));
    }

    // paving slabs over the apron
    function paveBox(f, u0, u1, v0, v1, y, color) {
      f.box(u0 + 0.006, u1 - 0.006, v0 + 0.006, v1 - 0.006, y, y + 0.006, color);
    }

    /* ------------------------------------------------------ CARGO QUAY ---- */
    const CARGO = { len: 22.2, x0: -9.6, x1: 12.6, z: -4.4 };
    const fc = makeFrame(CARGO.x0, CARGO.z, 1, 0, 0, 1);
    quayWallBody(fc, CARGO.len, 'cargo');
    quayCoping(fc, CARGO.len);
    // fenders & ladders & life rings
    for (let u = 1.2; u < CARGO.len - 0.6; u += 2.55) quayFender(fc, u);
    for (const u of [3.4, 11.2, 19.0]) quayLadder(fc, u);
    for (const u of [5.7, 14.9]) quayLifeRing(fc, u);
    // bollards every 1.8
    for (let u = 0.55; u < CARGO.len - 0.2; u += 1.8) quayBollard(fc, u, -0.22, quayBollards);
    // stairs into the water
    quayStairs(fc, 17.9, 1);
    // painted safety line + drainage + manholes on the apron
    fc.box(0, CARGO.len, -0.165, -0.115, 1.106, 1.112, K.vary(C.lineYellow, rand, { l: 0.04, s: 0.03, h: 0.01 }));
    for (let u = 1.1; u < CARGO.len; u += 3.3) {
      const p = fc.map(u, -0.42);
      K.box(0.22, 0.008, 0.12, p[0], 1.111, p[1], 0x4a463e, { rot: [0, fc.ang, 0] });
      for (let s = 0; s < 3; s++) {
        K.box(0.17, 0.004, 0.016, p[0], 1.114, p[1] + (s - 1) * 0.032, 0x2e2b25, { rot: [0, fc.ang, 0] });
      }
    }
    for (const u of [2.6, 9.4, 16.8]) {
      const p = fc.map(u, -1.06);
      K.cyl(0.095, 0.008, p[0], 1.112, p[1], 0x5c5649, { seg: 20 });
      K.cyl(0.075, 0.008, p[0], 1.116, p[1], 0x6a6355, { seg: 20 });
      K.box(0.13, 0.006, 0.014, p[0], 1.118, p[1], 0x4c473c, { rot: [0, 0.6, 0] });
    }
    // paving grid over the apron (z -4.53 .. -6.05)
    (function paveApron() {
      const uStart = 0.02, uEnd = CARGO.len - 0.02;
      const vStart = -0.12, vEnd = -1.72;
      const DU = 0.47, DV = 0.39;
      for (let v = vStart; v > vEnd; v -= DV) {
        for (let u = uStart; u < uEnd; u += DU) {
          const u1 = Math.min(u + DU, uEnd), v1 = Math.max(v - DV, vEnd);
          if (!onLand((u + u1) / 2 - 9.6, v, 0.15)) continue;
          const tone = K.vary(0x817a6b, rand, { l: 0.06, s: 0.035, h: 0.008 });
          paveBox(fc, u, u1, v1, v, 1.101, tone);
        }
      }
    })();

    /* ----------------------------------------------------- FISHING QUAY --- */
    const FISH = { len: 6.8, x: -9.6, z0: -4.4 };
    const ff = makeFrame(FISH.x, FISH.z0, 0, 1, 1, 0);
    quayWallBody(ff, FISH.len, 'fishing');
    quayCoping(ff, FISH.len);
    for (let u = 0.9; u < FISH.len - 0.4; u += 2.2) quayFender(ff, u);
    for (const u of [2.2, 5.4]) quayLadder(ff, u);
    quayLifeRing(ff, 4.0);
    for (let u = 0.6; u < FISH.len - 0.2; u += 1.7) quayBollard(ff, u, -0.22, fishingBollards);
    quayStairs(ff, 6.1, 1);
    // painted safety line on the fishing quay
    ff.box(0, FISH.len, -0.165, -0.115, 1.106, 1.112, K.vary(C.lineYellow, rand, { l: 0.04, s: 0.03, h: 0.01 }));
    // paving on the fishing-quay strip
    (function paveFish() {
      for (let v = -0.12; v > -1.1; v -= 0.34) {
        for (let u = 0.04; u < FISH.len - 0.04; u += 0.5) {
          const tone = K.vary(0x817a6b, rand, { l: 0.06, s: 0.035, h: 0.008 });
          paveBox(ff, u, Math.min(u + 0.5, FISH.len - 0.04), v - 0.34, v, 1.101, tone);
        }
      }
    })();
    // little fish-market kerb along the strip
    for (let u = 0.3; u < FISH.len - 0.3; u += 0.9) {
      ff.box(u, u + 0.86, -1.12, -1.02, 1.1, 1.16, K.vary(C.stoneDark, rand, { l: 0.04, s: 0.03 }));
    }

    /* ------------------------------------------------------- CRANE RAILS -- */
    const RAIL_Z = [-4.75, -5.95];
    for (const rz of RAIL_Z) {
      const v = rz - CARGO.z;
      // segmented so nothing hangs over the water at the east corner
      for (let u = 0; u < CARGO.len; u += 0.55) {
        const u1 = Math.min(u + 0.55, CARGO.len);
        const [wx, wz] = fc.map((u + u1) / 2, v);
        if (!onLand(wx, wz, 0.2)) continue;
        fc.box(u, u1, v - 0.09, v + 0.09, 1.1, 1.137, K.vary(C.concreteDark, rand, { l: 0.04, s: 0.02 }));
        fc.box(u, u1, v - 0.028, v + 0.028, 1.137, 1.158, 0x5f5a4e);
        fc.box(u, u1, v - 0.016, v + 0.016, 1.158, 1.166, 0x8b8474);
        fc.box(u, u1, v - 0.007, v + 0.007, 1.166, 1.168, 0xb0a894);
      }
      // sleeper plates / clips
      for (let u = 0.25; u < CARGO.len; u += 1.1) {
        const [wx, wz] = fc.map(u, v);
        if (!onLand(wx, wz, 0.2)) continue;
        fc.box(u - 0.05, u + 0.05, v - 0.085, v + 0.085, 1.1365, 1.142, K.vary(0x6d6557, rand, { l: 0.05 }));
        fc.box(u - 0.016, u + 0.016, v - 0.055, v + 0.055, 1.141, 1.148, K.vary(0x4b463c, rand, { l: 0.04 }));
      }
      // end stops at both ends (only where the rail is on land)
      for (const u of [0.28, CARGO.len - 0.28]) {
        const [wx, wz] = fc.map(u, v);
        if (!onLand(wx, wz, 0.15)) continue;
        const dir = u < 1 ? 1 : -1;
        const p = [wx, wz];
        K.box(0.12, 0.16, 0.22, p[0], 1.21, p[1], K.vary(0x5a5346, rand, { l: 0.04, s: 0.02 }), { rot: [0, fc.ang, 0], bucket: 'metal' });
        K.box(0.05, 0.08, 0.26, p[0] + fc.ux * dir * 0.09, 1.19, p[1] + fc.uz * dir * 0.09, K.vary(C.rust, rand, { l: 0.04 }), { rot: [0, fc.ang, 0] });
        for (let s = 0; s < 3; s++) {
          K.box(0.125, 0.02, 0.223, p[0], 1.15 + s * 0.035, p[1], s % 2 ? 0xc7a76a : 0x3a3833, { rot: [0, fc.ang, 0] });
        }
      }
    }

    /* --------------- concrete slab joints + weathering on the working pad -- */
    (function padSurface() {
      // expansion joint grid over the terminal pad (segmented, land-clipped)
      for (let x = -9.2; x < 12.6; x += 2.25) {
        for (let z = -12.85; z < -4.55; z += 0.9) {
          if (!onLand(x, z + 0.45, 0.2)) continue;
          K.box(0.022, 0.004, 0.88, x, 1.1035, z + 0.45, 0x8a8275);
        }
      }
      for (let z = -12.85; z < -4.55; z += 2.1) {
        for (let x = -9.2; x < 12.6; x += 1.2) {
          if (!onLand(x + 0.6, z, 0.2)) continue;
          K.box(1.18, 0.004, 0.022, x + 0.6, 1.1035, z, 0x8a8275);
        }
      }
      // faint tyre / oil marks in the yard
      for (let i = 0; i < 26; i++) {
        const x = -8.6 + rand() * 20.4;
        const z = -12.5 + rand() * 7.4;
        if (!onLand(x, z, 0.25)) continue;
        const w = 0.18 + rand() * 0.5, d = 0.1 + rand() * 0.32;
        const dark = rand() < 0.6;
        K.box(w, 0.003, d, x, 1.1038, z,
          dark ? K.vary(0x6d685c, rand, { l: 0.03, s: 0.02 }) : K.vary(0x8a7256, rand, { l: 0.03, s: 0.03 }),
          { rot: [0, rand() * 3.14, 0] });
      }
      // a couple of concrete pour patches
      for (let i = 0; i < 6; i++) {
        const x = -7.5 + rand() * 19;
        const z = -12.2 + rand() * 6.6;
        if (!onLand(x, z, 0.3)) continue;
        K.box(1.1 + rand() * 0.9, 0.0025, 0.8 + rand() * 0.7, x, 1.1032, z,
          K.vary(0x8f887b, rand, { l: 0.02, s: 0.02 }), { rot: [0, 0, 0] });
      }
      // drain channel along the foot of the back road
      for (let x = -8.6; x < 12.4; x += 0.8) {
        if (!onLand(x + 0.4, -11.14, 0.25)) continue;
        K.box(0.78, 0.012, 0.06, x + 0.4, 1.108, -11.14, 0x4d493f);
        K.box(0.7, 0.005, 0.07, x + 0.4, 1.113, -11.14, 0x6f695b);
      }
    })();

    /* --------------- quay corner join + west end retaining cheek ---------- */
    // the cargo quay meets the fishing quay in an inside corner: masonry fill
    K.box(0.36, 2.06, 0.36, -9.58, 0.04, -4.38, K.vary(C.concreteDark, rand, { l: 0.03, s: 0.02 }));
    K.box(0.42, 0.09, 0.42, -9.58, 1.1, -4.38, K.vary(C.stone, rand, { l: 0.03 }));
    // rubble apron at the wall foot
    for (let i = 0; i < 16; i++) {
      const x = -9.2 + rand() * 21.6;
      const z = -4.31 + rand() * 0.18;
      const sc = 0.03 + rand() * 0.06;
      boulderInst.add({
        pos: [x, -0.02 + rand() * 0.05, z],
        rot: [rand() * 3, rand() * 6.28, rand() * 3],
        scale: [sc, sc * 0.6, sc],
        color: rockColor(rand() < 0.4 ? 'dark' : 'rock'),
      });
    }

    // publish bollard anchors for fleet moorings
    K.anchor('quayBollards', { positions: quayBollards });
    K.anchor('fishingBollards', { positions: fishingBollards });


    /* ====================================================================== *
     * 4.  BREAKWATER — rock mole, crown walkway, tetrapods, lamps, hut
     * ====================================================================== */
    const BW = L.breakwater;
    const bwCurve = new THREE.CatmullRomCurve3(
      BW.points.map((pt) => new THREE.Vector3(pt[0], 0, pt[1])), false, 'catmullrom', 0.5
    );
    const BW_N = 144;
    const bwS = [];
    let bwLen = 0;
    let bwPrev = null;
    for (let i = 0; i <= BW_N; i++) {
      const t = i / BW_N;
      const p = bwCurve.getPointAt(t);
      const d = bwCurve.getTangentAt(t);
      const dl = Math.hypot(d.x, d.z) || 1;
      const tx = d.x / dl, tz = d.z / dl;
      const nx = tz, nz = -tx; // seaward side of the arc
      if (bwPrev) bwLen += Math.hypot(p.x - bwPrev.x, p.z - bwPrev.z);
      bwS.push({ x: p.x, z: p.z, tx, tz, nx, nz, dist: bwLen, ang: Math.atan2(-tz, tx) });
      bwPrev = p;
    }
    function bwSampleDist(dist) {
      const d = clamp(dist, 0, bwLen);
      let lo = 0, hi = bwS.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (bwS[mid].dist < d) lo = mid + 1; else hi = mid;
      }
      return bwS[Math.min(lo, bwS.length - 1)];
    }
    function bwPoint(sample, v) {
      return [sample.x + sample.nx * v, sample.z + sample.nz * v];
    }
    const BW_WALK_Y = BW.walkY; // 0.95

    // ---------- crown walkway (segmented concrete) ----------
    const crownToneA = K.color(C.concrete), crownToneB = K.color(C.concreteDark);
    for (let i = 0; i < bwS.length - 1; i++) {
      const a = bwS[i], b = bwS[i + 1];
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const len = Math.hypot(b.x - a.x, b.z - a.z) + 0.015;
      const ang = Math.atan2(-(b.z - a.z), b.x - a.x);
      const tone = K.vary(i % 4 === 0 ? 0x857d6f : 0x9a9182, rand, { l: 0.035, s: 0.025, h: 0.006 });
      // crown slab
      K.box(len, 0.16, 0.8, mx, BW_WALK_Y - 0.08, mz, tone, { rot: [0, ang, 0] });
      // seaward parapet + coping
      const pp = [mx + a.nx * 0.47, mz + a.nz * 0.47];
      K.box(len, 0.29, 0.15, pp[0], BW_WALK_Y + 0.145, pp[1], K.vary(0x9c9384, rand, { l: 0.035, s: 0.02 }), { rot: [0, ang, 0] });
      K.box(len, 0.045, 0.21, pp[0], BW_WALK_Y + 0.31, pp[1], K.vary(0xb9ab93, rand, { l: 0.04, s: 0.03 }), { rot: [0, ang, 0] });
      // harbour-side kerb
      const kp = [mx - a.nx * 0.45, mz - a.nz * 0.45];
      K.box(len, 0.09, 0.13, kp[0], BW_WALK_Y + 0.045, kp[1], K.vary(C.stone, rand, { l: 0.04, s: 0.02 }), { rot: [0, ang, 0] });
      // expansion joint
      if (i % 14 === 6) {
        K.box(0.014, 0.006, 0.78, mx, BW_WALK_Y + 0.002, mz, K.shade(C.concreteDark, -0.05), { rot: [0, ang, 0] });
      }
    }
    // a few drainage notches in the parapet
    for (let d = 1.4; d < bwLen - 0.5; d += 2.1) {
      const s0 = bwSampleDist(d);
      const p = bwPoint(s0, 0.47);
      K.box(0.06, 0.08, 0.16, p[0], BW_WALK_Y + 0.09, p[1], 0x4b473d, { rot: [0, s0.ang, 0] });
    }

    // ---------- rock armour body (seaward + harbour side) ----------
    for (let d = 0.05; d < bwLen; d += 0.17) {
      const s0 = bwSampleDist(d);
      // seaward slope rows
      for (const [v, size] of [[0.56, 0.15], [0.76, 0.18], [0.96, 0.16], [1.12, 0.12]]) {
        if (rand() > 0.82) continue;
        const jitter = (rand() - 0.5) * 0.1;
        const p = bwPoint(s0, v + jitter);
        const ySlope = BW_WALK_Y - (v - 0.38) * 1.42;
        const sc = size * (0.65 + rand() * 0.7);
        boulderInst.add({
          pos: [p[0] + (rand() - 0.5) * 0.06, ySlope - sc * 0.15, p[1] + (rand() - 0.5) * 0.06],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc * (0.9 + rand() * 0.5), sc * (0.62 + rand() * 0.35), sc * (0.9 + rand() * 0.5)],
          color: rockColor(rand() < 0.25 ? 'dark' : 'rock'),
        });
      }
      // harbour side toe rocks
      if (rand() < 0.7) {
        const v = -(0.58 + rand() * 0.18);
        const p = bwPoint(s0, v);
        const ySlope = BW_WALK_Y - (Math.abs(v) - 0.38) * 1.5;
        const sc = 0.1 + rand() * 0.11;
        boulderInst.add({
          pos: [p[0], ySlope - sc * 0.12, p[1]],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc, sc * 0.7, sc],
          color: rockColor(rand() < 0.25 ? 'dark' : 'rock'),
        });
      }
    }

    // ---------- tetrapods on the seaward slope ----------
    const tetrapodGeo = (function makeTetrapod() {
      const parts = [];
      const tetra = [
        new THREE.Vector3(1, 1, 1).normalize(),
        new THREE.Vector3(1, -1, -1).normalize(),
        new THREE.Vector3(-1, 1, -1).normalize(),
        new THREE.Vector3(-1, -1, 1).normalize(),
      ];
      const up = new THREE.Vector3(0, 1, 0);
      for (const dir of tetra) {
        const g = new THREE.CylinderGeometry(0.045, 0.088, 0.44, 5, 1);
        g.translate(0, 0.215, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
        parts.push({ geo: g, quat: q });
      }
      parts.push({ geo: new THREE.SphereGeometry(0.105, 6, 4), quat: new THREE.Quaternion() });
      // merge to one non-indexed buffer geometry
      const posA = [], nrmA = [];
      const v = new THREE.Vector3(), nn = new THREE.Vector3();
      for (const part of parts) {
        const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
        const pa = g.attributes.position, na = g.attributes.normal;
        for (let i = 0; i < pa.count; i++) {
          v.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyQuaternion(part.quat);
          posA.push(v.x, v.y, v.z);
          nn.set(na.getX(i), na.getY(i), na.getZ(i)).applyQuaternion(part.quat);
          nrmA.push(nn.x, nn.y, nn.z);
        }
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(nrmA, 3));
      const colA = new Float32Array(posA.length);
      colA.fill(1);
      out.setAttribute('color', new THREE.BufferAttribute(colA, 3));
      out.computeBoundingSphere();
      return out;
    })();
    const tetraMat = instMat({ roughness: 0.9, metalness: 0.02 });
    const tetrapodInst = K.instancer(tetrapodGeo, tetraMat, { name: 'breakwater:tetrapods' });
    for (let d = 0.22; d < bwLen - 0.1; d += 0.21) {
      const s0 = bwSampleDist(d);
      for (const v of [0.66, 0.86]) {
        if (rand() > 0.72) continue;
        const p = bwPoint(s0, v + (rand() - 0.5) * 0.07);
        const ySlope = BW_WALK_Y - (v - 0.38) * 1.42;
        const sc = 0.11 + rand() * 0.075;
        tetrapodInst.add({
          pos: [p[0], ySlope - 0.01, p[1]],
          rot: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
          scale: [sc, sc, sc],
          color: K.vary(0x9a9384, rand, { l: 0.06, s: 0.03, h: 0.01 }),
        });
      }
    }
    // a chunky tetrapod cluster at the root shoulder
    for (let i = 0; i < 16; i++) {
      const s0 = bwSampleDist(0.15 + rand() * 0.55);
      const p = bwPoint(s0, 0.52 + rand() * 0.35);
      const sc = 0.12 + rand() * 0.08;
      tetrapodInst.add({
        pos: [p[0], 0.5 - rand() * 0.5, p[1]],
        rot: [rand() * 6.28, rand() * 6.28, rand() * 6.28],
        scale: [sc, sc, sc],
        color: K.vary(0x9a9384, rand, { l: 0.06, s: 0.03, h: 0.01 }),
      });
    }

    tetrapodInst.finish(scene);

    // ---------- railings (harbour side), lamps, bollards ----------
    (function bwFurniture() {
      const railColor = 0x4d4a42;
      const postStep = 1.02;
      const posts = [];
      for (let d = 0.55; d < bwLen - 0.3; d += postStep) {
        const s0 = bwSampleDist(d);
        const p = bwPoint(s0, -0.39);
        K.cyl(0.011, 0.42, p[0], BW_WALK_Y + 0.21, p[1], K.shade(railColor, -0.02), { seg: 6, bucket: 'metal' });
        K.cyl(0.02, 0.02, p[0], BW_WALK_Y + 0.005, p[1], K.shade(railColor, 0.04), { seg: 6, bucket: 'metal' });
        posts.push([p[0], p[1], d]);
      }
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i], b = posts[i + 1];
        K.rope([a[0], BW_WALK_Y + 0.38, a[1]], [b[0], BW_WALK_Y + 0.38, b[1]], 0.02, 0.009, 0x736850, { segments: 5, radial: 4 });
        K.rope([a[0], BW_WALK_Y + 0.18, a[1]], [b[0], BW_WALK_Y + 0.18, b[1]], 0.015, 0.008, 0x6c6250, { segments: 5, radial: 4 });
      }
      // lamps on the parapet
      for (let d = 1.1; d < bwLen - 0.6; d += 2.35) {
        const s0 = bwSampleDist(d);
        const p = bwPoint(s0, 0.47);
        const baseY = BW_WALK_Y + 0.33;
        K.cyl(0.016, 0.36, p[0], baseY + 0.18, p[1], K.shade(railColor, -0.03), { seg: 6, bucket: 'metal' });
        K.box(0.16, 0.014, 0.014, p[0] - s0.nx * 0.07, baseY + 0.35, p[1] - s0.nz * 0.07,
          K.shade(railColor, 0), { rot: [0, s0.ang, 0], bucket: 'metal' });
        const head = bwPoint(s0, 0.36);
        K.cyl(0.05, 0.02, head[0], baseY + 0.33, head[1], 0x3f3b33, { seg: 8, bucket: 'metal' });
        K.cyl(0.042, 0.065, head[0], baseY + 0.295, head[1], K.vary(C.lampWarm, rand, { l: 0.03 }), { seg: 8, bucket: 'lamp' });
        K.cyl(0.032, 0.03, head[0], baseY + 0.245, head[1], 0x3f3b33, { seg: 8, bucket: 'metal' });
      }
      // small bollards + life ring
      for (const d of [1.6, 3.4, 5.2]) {
        const s0 = bwSampleDist(d);
        const p = bwPoint(s0, 0.18);
        K.cyl(0.035, 0.15, p[0], BW_WALK_Y + 0.075, p[1], K.shade(0x46423a, -0.01), { seg: 8, bucket: 'metal' });
        K.cyl(0.014, 0.03, p[0], BW_WALK_Y + 0.16, p[1], 0x555045, { seg: 8, bucket: 'metal' });
      }
      const lr = bwSampleDist(4.15);
      const lrp = bwPoint(lr, -0.337);
      K.cyl(0.01, 0.3, lrp[0], BW_WALK_Y + 0.15, lrp[1], 0x4d4a42, { seg: 6, bucket: 'metal' });
      K.torus(0.065, 0.022, lrp[0], BW_WALK_Y + 0.3, lrp[1], K.vary(C.lineWhite, rand, { l: 0.02 }), { rot: [0, lr.ang + Math.PI / 2, 0] });
      for (const a of [0.6, Math.PI + 0.6]) {
        K.box(0.045, 0.032, 0.026, lrp[0] + Math.cos(a) * 0.062, BW_WALK_Y + 0.3 + Math.sin(a) * 0.062, lrp[1],
          K.vary(0x9c4a3c, rand, { l: 0.03 }), { rot: [0, lr.ang + Math.PI / 2, -a] });
      }
    })();

    // ---------- maintenance hut on a harbour-side platform ----------
    (function bwHut() {
      const s0 = bwSampleDist(1.15);
      const base = bwPoint(s0, -0.62);
      // supporting stone platform
      K.box(1.05, 0.14, 0.72, base[0], BW_WALK_Y - 0.07, base[1], K.vary(C.concreteDark, rand, { l: 0.04 }), { rot: [0, s0.ang, 0] });
      K.box(1.0, 0.05, 0.66, base[0], BW_WALK_Y - 0.16, base[1], K.shade(C.concreteDark, -0.03), { rot: [0, s0.ang, 0] });
      // pilings into the water
      for (const o of [-0.34, 0.34]) {
        for (const o2 of [-0.22, 0.22]) {
          const p = [base[0] + s0.tx * o + s0.nx * o2, base[1] + s0.tz * o + s0.nz * o2];
          K.cyl(0.035, 0.9, p[0], -0.35, p[1], K.vary(C.woodDark, rand, { l: 0.05, s: 0.04 }), { seg: 7 });
        }
      }
      // hut body
      const hy = BW_WALK_Y + 0.2;
      K.box(0.56, 0.4, 0.46, base[0], hy, base[1], K.vary(C.shipCream, rand, { l: 0.03, s: 0.03 }), { rot: [0, s0.ang, 0] });
      K.box(0.6, 0.03, 0.5, base[0], hy + 0.215, base[1], K.shade(C.roofGreen, 0.02, 0.02), { rot: [0, s0.ang, 0] });
      // gable roof
      const tilt = 0.5;
      for (const side of [-1, 1]) {
        const off = 0.13 * side;
        K.box(0.64, 0.03, 0.31, base[0] + s0.nx * off, hy + 0.25, base[1] + s0.nz * off,
          K.vary(C.roofGreen, rand, { l: 0.03, s: 0.02 }),
          { rot: [tilt * side, s0.ang, 0], order: 'YXZ' });
      }
      // door + window facing the walkway
      const door = [base[0] - s0.nx * 0.235, base[1] - s0.nz * 0.235];
      K.box(0.16, 0.26, 0.02, door[0], hy - 0.06, door[1], K.shade(C.wood, 0.02, 0.02), { rot: [0, s0.ang, 0] });
      K.box(0.19, 0.03, 0.03, door[0], hy + 0.075, door[1], K.shade(C.stoneLight, 0, -0.02), { rot: [0, s0.ang, 0] });
      const win = [base[0] - s0.nx * 0.235, base[1] - s0.nz * 0.235];
      K.box(0.13, 0.11, 0.02, win[0] + s0.tx * 0.17, hy + 0.08, win[1] + s0.tz * 0.17, 0x30454a, { rot: [0, s0.ang, 0] });
      K.box(0.16, 0.14, 0.015, win[0] + s0.tx * 0.17, hy + 0.08, win[1] + s0.tz * 0.17, K.shade(C.shipCream, 0.02), { rot: [0, s0.ang, 0] });
      // chimney pipe + little lamp above the door
      K.cyl(0.022, 0.2, base[0] + s0.tx * 0.18, hy + 0.36, base[1] + s0.tz * 0.18, 0x4a463e, { seg: 6, bucket: 'metal' });
      K.cyl(0.032, 0.02, base[0] + s0.tx * 0.18, hy + 0.465, base[1] + s0.tz * 0.18, 0x3c3831, { seg: 6, bucket: 'metal' });
      K.box(0.02, 0.16, 0.02, door[0] - s0.nx * 0.03, hy + 0.13, door[1] - s0.nz * 0.03, 0x4a463e, { rot: [0, s0.ang, 0], bucket: 'metal' });
      K.cyl(0.045, 0.06, door[0] - s0.nx * 0.055, hy + 0.22, door[1] - s0.nz * 0.055, K.vary(C.lampWarm, rand, { l: 0.02 }), { seg: 8, bucket: 'lamp' });
      // crate + drum on the platform
      K.box(0.16, 0.13, 0.13, base[0] + s0.tx * 0.3, BW_WALK_Y + 0.135, base[1] - s0.nz * 0.1,
        K.vary(C.woodLight, rand, { l: 0.04, s: 0.05 }), { rot: [0, s0.ang + 0.4, 0] });
      K.cyl(0.055, 0.14, base[0] + s0.tx * 0.36, BW_WALK_Y + 0.14, base[1] + s0.nz * 0.16,
        K.vary(C.rust, rand, { l: 0.04, s: 0.03 }), { seg: 10 });
    })();

    // ---------- masonry approach from the cargo quay corner ----------
    (function bwApproach() {
      const x0 = 12.05, x1 = 12.72;
      const z0 = -4.44, z1 = -5.98;
      const zs = [z0, -4.82, -5.2, -5.58, z1];
      const tops = [1.08, 1.05, 1.01, 0.97, BW_WALK_Y];
      for (let i = 0; i < zs.length - 1; i++) {
        const zA = zs[i], zB = zs[i + 1];
        const top = tops[i];
        K.box(x1 - x0, top + 0.15, zA - zB, (x0 + x1) / 2, (top - 0.15) / 2, (zA + zB) / 2,
          K.vary(C.concreteDark, rand, { l: 0.035, s: 0.02 }));
        K.box(x1 - x0 + 0.05, 0.04, zA - zB - 0.01, (x0 + x1) / 2, top - 0.02, (zA + zB) / 2,
          K.vary(C.stone, rand, { l: 0.04, s: 0.03 }));
      }
      // side cheek walls
      for (const x of [x0 - 0.04, x1 + 0.04]) {
        K.box(0.09, 1.0, 1.62, x, 0.55, (z0 + z1) / 2, K.vary(C.concreteDark, rand, { l: 0.035, s: 0.02 }));
      }
      // brass handrail
      K.strut([x1 + 0.02, 1.5, z0 - 0.1], [x1 + 0.02, 1.3, z1 + 0.12], 0.012, 0x5a5244, { seg: 6, bucket: 'metal' });
      for (const z of [z0 - 0.12, (z0 + z1) / 2, z1 + 0.1]) {
        K.cyl(0.011, 0.4, x1 + 0.02, 1.28, z, 0x5a5244, { seg: 6, bucket: 'metal' });
      }
      // rock armour down the outside of the approach
      for (let i = 0; i < 22; i++) {
        const z = z0 - 0.1 - rand() * 1.45;
        const x = 12.85 + rand() * 0.5;
        const sc = 0.07 + rand() * 0.13;
        boulderInst.add({
          pos: [x, -0.03 + rand() * 0.08, z],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc, sc * 0.65, sc],
          color: rockColor(rand() < 0.3 ? 'dark' : 'rock'),
        });
      }
      // two stone gate posts at the top
      for (const x of [x0 + 0.05, x1 - 0.05]) {
        K.box(0.11, 0.5, 0.11, x, 1.33, z0 - 0.06, K.vary(C.stone, rand, { l: 0.04, s: 0.02 }));
        K.box(0.15, 0.05, 0.15, x, 1.6, z0 - 0.06, K.vary(C.stoneLight, rand, { l: 0.03, s: 0.02 }));
      }
    })();


    /* ====================================================================== *
     * 5.  LIGHTHOUSE, KEEPER'S HUT, PENINSULA BEACON
     * ====================================================================== */
    const LH = L.placements.lighthouse; // (10.05, 7.5, baseY 0.95)
    const tip = bwS[bwS.length - 1];
    const tipBack = [-tip.tx, -tip.tz];
    const tipN = [tip.nx, tip.nz];
    const tipDoorDir = [-tip.tx, -tip.tz];
    (function lighthouse() {
      const cx = LH.x, cz = LH.z, baseY = LH.baseY; // 0.95

      // ---- rock knuckle the tower stands on
      const nK = 14;
      const ring = [];
      for (let i = 0; i < nK; i++) {
        const a = (i / nK) * Math.PI * 2;
        ring.push([Math.cos(a) * 0.52, Math.sin(a) * 0.52]);
      }
      K.prism(ring, 1.12, cx, -0.18, cz, K.vary(C.rock, rand, { l: 0.04, s: 0.03 }));
      K.prism(ring.map((p) => [p[0] * 0.82, p[1] * 0.82]), 0.06, cx, baseY - 0.04, cz,
        K.vary(C.concreteDark, rand, { l: 0.03, s: 0.02 }));
      for (let i = 0; i < 20; i++) {
        const a = rand() * Math.PI * 2;
        const rad = 0.58 + rand() * 0.2;
        const sc = 0.08 + rand() * 0.13;
        boulderInst.add({
          pos: [cx + Math.cos(a) * rad, -0.06 + rand() * 0.1, cz + Math.sin(a) * rad],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc, sc * 0.65, sc],
          color: rockColor(rand() < 0.3 ? 'dark' : 'rock'),
        });
      }

      // ---- tower base + shaft
      K.cyl(0.36, 0.22, cx, baseY + 0.11, cz, K.vary(C.stone, rand, { l: 0.03, s: 0.03 }), { seg: 16 });
      K.cyl(0.34, 0.06, cx, baseY + 0.25, cz, K.vary(C.stoneLight, rand, { l: 0.02, s: 0.02 }), { seg: 16 });
      const shaftB = baseY + 0.28, shaftT = baseY + 1.42; // 1.23 .. 2.37
      const rB = 0.30, rT = 0.212;
      K.add(K.cylGeo(rT, rB, shaftT - shaftB, 18), K.vary(C.shipCream, rand, { l: 0.015, s: 0.02 }),
        { pos: [cx, (shaftB + shaftT) / 2, cz] });
      const shaftR = (y) => rB + (rT - rB) * clamp((y - shaftB) / (shaftT - shaftB), 0, 1);
      // stone string courses
      for (const dy of [0.18, 0.66, 1.06]) {
        const y = shaftB + dy;
        K.cyl(shaftR(y) + 0.008, 0.02, cx, y, cz, K.vary(C.stoneLight, rand, { l: 0.02, s: 0.02 }), { seg: 16 });
      }
      // door facing the mole walkway
      const dYaw = Math.atan2(tipDoorDir[0], tipDoorDir[1]);
      const dr = shaftR(baseY + 0.14) + 0.004;
      const doorPos = [cx + tipDoorDir[0] * dr, cz + tipDoorDir[1] * dr];
      K.box(0.16, 0.27, 0.03, doorPos[0], baseY + 0.15, doorPos[1], K.vary(C.wood, rand, { l: 0.03, s: 0.03 }), { rot: [0, dYaw, 0] });
      K.box(0.2, 0.035, 0.05, doorPos[0], baseY + 0.305, doorPos[1], K.vary(C.stoneLight, rand, { l: 0.02 }), { rot: [0, dYaw, 0] });
      K.box(0.21, 0.02, 0.07, doorPos[0], baseY + 0.02, doorPos[1], K.vary(C.stone, rand, { l: 0.02 }), { rot: [0, dYaw, 0] });
      // windows: one to the sea, one to the harbour
      for (const [dir, wy] of [[tipN, baseY + 0.72], [[-tip.nx, -tip.nz], baseY + 0.98], [tipBack, baseY + 1.2]]) {
        const wYaw = Math.atan2(dir[0], dir[1]);
        const wr = shaftR(wy) + 0.004;
        const wp = [cx + dir[0] * wr, cz + dir[1] * wr];
        K.box(0.085, 0.13, 0.03, wp[0], wy, wp[1], K.shade(C.glassDark, 0.03, 0.02), { rot: [0, wYaw, 0] });
        K.box(0.115, 0.16, 0.02, wp[0], wy, wp[1], K.vary(C.stoneLight, rand, { l: 0.02 }), { rot: [0, wYaw, 0] });
        K.box(0.09, 0.022, 0.035, wp[0], wy - 0.085, wp[1], K.vary(C.stoneLight, rand, { l: 0.02 }), { rot: [0, wYaw, 0] });
      }

      // ---- gallery, railing
      const galY = shaftT + 0.02; // 2.39
      K.cyl(0.30, 0.05, cx, galY, cz, K.vary(C.stoneLight, rand, { l: 0.02, s: 0.02 }), { seg: 18 });
      K.cyl(0.285, 0.035, cx, galY + 0.042, cz, K.vary(C.stone, rand, { l: 0.02 }), { seg: 18 });
      // brackets
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        K.box(0.05, 0.07, 0.05, cx + Math.cos(a) * 0.28, galY - 0.03, cz + Math.sin(a) * 0.28,
          K.shade(C.stoneDark, 0.0), { rot: [0, -a, 0] });
      }
      const brass = K.vary(C.brass, rand, { l: 0.03, s: 0.03 });
      const railY = galY + 0.24;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        K.cyl(0.0065, 0.24, cx + Math.cos(a) * 0.285, galY + 0.12, cz + Math.sin(a) * 0.285, brass, { seg: 5, bucket: 'metal' });
      }
      K.torus(0.286, 0.0075, cx, railY, cz, brass, { rot: [-Math.PI / 2, 0, 0], bucket: 'metal' });
      K.torus(0.286, 0.006, cx, galY + 0.12, cz, K.shade(C.brass, -0.05), { rot: [-Math.PI / 2, 0, 0], bucket: 'metal' });

      // ---- lantern room + lamp
      const lanB = galY + 0.075; // 2.465
      K.cyl(0.20, 0.045, cx, lanB, cz, K.vary(C.roofGreen, rand, { l: 0.03, s: 0.03 }), { seg: 16 });
      const glassB = lanB + 0.02, glassT = lanB + 0.40;
      K.add(K.cylGeo(0.178, 0.178, glassT - glassB, 16, true), K.vary(C.glassBlue, rand, { l: 0.02, s: 0.02 }),
        { pos: [cx, (glassB + glassT) / 2, cz], bucket: 'glass' });
      // mullions
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        K.box(0.016, glassT - glassB, 0.016, cx + Math.cos(a) * 0.178, (glassB + glassT) / 2, cz + Math.sin(a) * 0.178,
          K.shade(C.brass, -0.02), { rot: [0, -a, 0], bucket: 'metal' });
      }
      // warm lamp inside the lantern
      K.cyl(0.035, 0.06, cx, glassB + 0.045, cz, K.shade(C.brass, 0.02), { seg: 10, bucket: 'metal' });
      K.sphere(0.072, cx, 2.62, cz, K.vary(C.lampWarm, rand, { l: 0.0, s: 0.0 }), { ws: 12, hs: 8, bucket: 'lamp' });
      K.cyl(0.03, 0.11, cx, 2.69, cz, K.shade(C.brass, 0.04), { seg: 8, bucket: 'metal' });
      K.cyl(0.19, 0.03, cx, glassT + 0.02, cz, K.shade(C.roofGreen, 0.02), { seg: 16 });
      // ---- dome roof + finial
      K.cone(0.215, 0.16, cx, glassT + 0.115, cz, K.vary(C.roofGreen, rand, { l: 0.02, s: 0.02 }), { seg: 16 });
      K.sphere(0.045, cx, glassT + 0.21, cz, K.shade(C.roofGreen, 0.04, 0.02), { ws: 10, hs: 6 });
      K.cyl(0.012, 0.13, cx, glassT + 0.3, cz, K.shade(C.brass, 0.03), { seg: 6, bucket: 'metal' });
      K.sphere(0.03, cx, glassT + 0.38, cz, K.vary(C.brassLight, rand, { l: 0.02 }), { ws: 8, hs: 6, bucket: 'metal' });
      // ventilator ball
      K.sphere(0.036, cx + 0.12, glassT + 0.06, cz + 0.1, K.shade(C.roofGreen, 0.05, 0.02), { ws: 8, hs: 6 });

      K.count('buildings', 1);
      K.addLabel({
        pos: [cx, 3.35, cz],
        title: '灯塔',
        sub: 'LIGHTHOUSE · FL(3) 12s',
        priority: 8,
        side: 1,
      });
    })();

    // ---------- keeper's hut on the tip platform ----------
    (function keepersHut() {
      const centre = [tip.x - tip.nx * 0.42 - tip.tx * 0.13, tip.z - tip.nz * 0.42 - tip.tz * 0.13];
      const ang = tip.ang;
      const grd = 0.95;
      // stone terrace, supported by rocks
      K.cyl(0.34, 0.12, centre[0], grd - 0.06, centre[1], K.vary(C.concreteDark, rand, { l: 0.03, s: 0.02 }), { seg: 12 });
      for (let i = 0; i < 7; i++) {
        const a = rand() * Math.PI * 2;
        const rad = 0.3 + rand() * 0.15;
        const sc = 0.08 + rand() * 0.1;
        boulderInst.add({
          pos: [centre[0] + Math.cos(a) * rad, -0.02 + rand() * 0.08, centre[1] + Math.sin(a) * rad],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc, sc * 0.6, sc],
          color: rockColor(rand() < 0.3 ? 'dark' : 'rock'),
        });
      }
      // hut
      const hx = centre[0], hz = centre[1];
      K.box(0.46, 0.32, 0.36, hx, grd + 0.16, hz, K.vary(C.plasterPale, rand, { l: 0.02, s: 0.02 }), { rot: [0, ang, 0] });
      K.box(0.5, 0.02, 0.4, hx, grd + 0.33, hz, K.shade(C.stoneLight, 0, -0.02), { rot: [0, ang, 0] });
      // gable roof (ridge along the hut's long axis)
      for (const side of [-1, 1]) {
        const off = 0.105 * side;
        K.box(0.54, 0.026, 0.25, hx + Math.cos(ang) * off, grd + 0.38, hz - Math.sin(ang) * off,
          K.vary(C.roofGreen, rand, { l: 0.02, s: 0.02 }), { rot: [0.46 * side, ang, 0], order: 'YXZ' });
      }
      // ridge trim
      K.box(0.56, 0.025, 0.03, hx, grd + 0.435, hz, K.shade(C.roofGreen, -0.03, -0.02), { rot: [0, ang, 0] });
      // door toward the walkway (+n side)
      const doorP = [hx + tip.nx * 0.185, hz + tip.nz * 0.185];
      const dYaw2 = Math.atan2(tip.nx, tip.nz);
      K.box(0.13, 0.22, 0.02, doorP[0], grd + 0.11, doorP[1], K.shade(C.wood, 0.02, 0.02), { rot: [0, dYaw2, 0] });
      K.box(0.16, 0.025, 0.03, doorP[0], grd + 0.23, doorP[1], K.shade(C.stoneLight, 0, -0.02), { rot: [0, dYaw2, 0] });
      // window
      const winP = [hx + Math.cos(ang) * 0.16 - tip.nx * 0.185, hz - Math.sin(ang) * 0.16 - tip.nz * 0.185];
      K.box(0.1, 0.09, 0.02, winP[0], grd + 0.17, winP[1], K.shade(C.glassDark, 0.02), { rot: [0, dYaw2, 0] });
      K.box(0.12, 0.11, 0.015, winP[0], grd + 0.17, winP[1], K.vary(C.shipCream, rand, { l: 0.02 }), { rot: [0, dYaw2, 0] });
      // chimney + lamp
      K.cyl(0.02, 0.16, hx - Math.cos(ang) * 0.14, grd + 0.44, hz + Math.sin(ang) * 0.14, 0x4a463e, { seg: 6, bucket: 'metal' });
      K.cyl(0.028, 0.015, hx - Math.cos(ang) * 0.14, grd + 0.52, hz + Math.sin(ang) * 0.14, 0x35322c, { seg: 6, bucket: 'metal' });
      // wood store
      K.box(0.14, 0.09, 0.1, hx + Math.cos(ang) * 0.34 - tip.nx * 0.02, grd + 0.045, hz - Math.sin(ang) * 0.34,
        K.vary(C.woodLight, rand, { l: 0.04, s: 0.04 }), { rot: [0, ang + 0.2, 0] });
      K.count('buildings', 1);
    })();

    // ---------- ring of boulders + railing around the tip ----------
    (function tipWorks() {
      // low railing around the lighthouse knuckle
      const railYaw = tip.ang;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const px = LH.x + Math.cos(a) * 0.47, pz = LH.z + Math.sin(a) * 0.47;
        // skip the sector toward the mole walkway
        const towardWalk = Math.cos(a) * tipBack[0] + Math.sin(a) * tipBack[1];
        if (towardWalk > 0.55) continue;
        K.cyl(0.008, 0.22, px, 1.07, pz, 0x4d4a42, { seg: 5, bucket: 'metal' });
      }
      // mooring bollard at the tip
      const b0 = bwSampleDist(bwLen - 0.5);
      const bp = bwPoint(b0, 0.16);
      K.cyl(0.032, 0.14, bp[0], 1.02, bp[1], 0x46423a, { seg: 8, bucket: 'metal' });
      K.cyl(0.012, 0.025, bp[0], 1.12, bp[1], 0x555045, { seg: 8, bucket: 'metal' });
    })();

    // ====================================================================== *
    //  PENINSULA BEACON  (-10.55, 4.35, baseY 0.95)
    // ====================================================================== *
    (function peninsulaBeacon() {
      const bx = -10.55, bz = 4.35;
      const grd = L.heightAt(bx, bz); // ~0.20
      // rubble + masonry pedestal up to 0.95
      for (let i = 0; i < 9; i++) {
        const a = rand() * Math.PI * 2;
        const rad = 0.24 + rand() * 0.2;
        const sc = 0.06 + rand() * 0.12;
        boulderInst.add({
          pos: [bx + Math.cos(a) * rad, grd - 0.01 + rand() * 0.06, bz + Math.sin(a) * rad],
          rot: [rand() * 3, rand() * 6.28, rand() * 3],
          scale: [sc, sc * 0.65, sc],
          color: rockColor(rand() < 0.35 ? 'dark' : 'rock'),
        });
      }
      const ped = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        ped.push([Math.cos(a) * 0.27, Math.sin(a) * 0.27]);
      }
      K.prism(ped, 0.78, bx, grd - 0.03, bz, K.vary(C.stone, rand, { l: 0.035, s: 0.03 }));
      K.prism(ped.map((p) => [p[0] * 1.16, p[1] * 1.16]), 0.07, bx, 0.63, bz,
        K.vary(C.stoneDark, rand, { l: 0.03, s: 0.02 }));
      // white drum + red band
      K.cyl(0.088, 0.28, bx, 1.09, bz, K.vary(C.lineWhite, rand, { l: 0.02, s: 0.02 }), { seg: 14 });
      K.cyl(0.092, 0.12, bx, 1.29, bz, K.vary(0x9c4a3c, rand, { l: 0.04, s: 0.03 }), { seg: 14 });
      K.cyl(0.09, 0.05, bx, 1.375, bz, K.vary(C.lineWhite, rand, { l: 0.02 }), { seg: 14 });
      // gallery + lamp
      K.cyl(0.115, 0.022, bx, 1.41, bz, K.shade(C.brass, -0.01), { seg: 14, bucket: 'metal' });
      K.cyl(0.072, 0.05, bx, 1.43, bz, K.shade(C.brass, -0.04), { seg: 12, bucket: 'metal' });
      K.add(new THREE.CylinderGeometry(0.068, 0.068, 0.07, 12, 1, true), K.vary(C.glassBlue, rand, { l: 0.02 }),
        { pos: [bx, 1.485, bz], bucket: 'glass' });
      K.sphere(0.045, bx, 1.45, bz, K.vary(C.lampWarm, rand, { l: 0.0, s: 0.0 }), { ws: 10, hs: 6, bucket: 'lamp' });
      K.cone(0.095, 0.08, bx, 1.56, bz, K.vary(0x9c4a3c, rand, { l: 0.02, s: 0.02 }), { seg: 12 });
      K.sphere(0.022, bx, 1.605, bz, K.shade(C.brassLight, 0.02), { ws: 8, hs: 6, bucket: 'metal' });
      // little door + hand rail
      const dy = Math.atan2(BEACHES[1].x - bx, BEACHES[1].z - bz);
      K.box(0.1, 0.18, 0.03, bx + Math.sin(dy) * 0.26, 0.86, bz + Math.cos(dy) * 0.26, K.shade(C.wood, 0.02, 0.02), { rot: [0, dy, 0] });
      for (let i = 0; i < 4; i++) {
        const a = 0.6 + i * 0.55;
        K.cyl(0.006, 0.16, bx + Math.cos(a) * 0.115, 1.5, bz + Math.sin(a) * 0.115, 0x4d4a42, { seg: 4, bucket: 'metal' });
      }
      // a couple of painted numerals
      K.box(0.034, 0.045, 0.012, bx, 1.13, bz + 0.092, K.shade(C.ink, 0.02, -0.02), { rot: [0, 0, 0] });
      K.box(0.034, 0.045, 0.012, bx, 1.19, bz + 0.092, K.shade(C.ink, 0.02, -0.02), { rot: [0, 0, 0] });
      K.count('buildings', 1);
    })();

    // stone path from the town street down to the beacon (land-clipped)
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = lerp(-11.32, -10.62, t) + (rand() - 0.5) * 0.1;
      const z = lerp(2.62, 4.1, t) + (rand() - 0.5) * 0.1;
      if (!onLand(x, z, 0.05)) continue;
      const y = L.heightAt(x, z);
      K.box(0.14 + rand() * 0.08, 0.02, 0.11 + rand() * 0.06, x, y + 0.002, z,
        K.vary(C.stone, rand, { l: 0.045, s: 0.03 }), { rot: [0, rand() * 3, 0] });
    }


    /* ====================================================================== *
     * 6.  ROADS, RAIL, LEVEL CROSSING, OLD-TOWN HARDSCAPE
     * ====================================================================== */
    const upVec = new THREE.Vector3(0, 1, 0);
    const _n3 = new THREE.Vector3();

    function normalAt(x, z) {
      const e = 0.045;
      const hx = (L.heightAt(x + e, z) - L.heightAt(x - e, z)) / (2 * e);
      const hz = (L.heightAt(x, z + e) - L.heightAt(x, z - e)) / (2 * e);
      _n3.set(-hx, 1, -hz).normalize();
      return _n3;
    }

    // walk a polyline at a given step
    function alongPolyline(pts, step, fn) {
      let dist = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-6) continue;
        const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
        const n = Math.max(1, Math.ceil(len / step));
        for (let s = 0; s < n; s++) {
          const t = (s + 0.5) / n;
          fn(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, ux, uz, dist + len * t,
            Math.atan2(-uz, ux));
        }
        dist += len;
      }
    }

    // draped ribbon mesh (roads, paths, markings)
    function addRibbon(pts, width, yOff, color, opt) {
      const o = opt || {};
      const step = o.step || 0.12;
      const S = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.ceil(len / step));
        for (let s = 0; s < n; s++) {
          const t = s / n;
          S.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      S.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
      const N = [];
      for (let i = 0; i < S.length; i++) {
        const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
        let dx = b[0] - a[0], dz = b[1] - a[1];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        N.push([-dz, dx]);
      }
      const posA = [], nrmA = [];
      const hw = width / 2;
      const yOf = (p) => L.heightAt(p[0], p[1]) + yOff;
      for (let i = 0; i < S.length - 1; i++) {
        const p0 = S[i], p1 = S[i + 1], n0 = N[i], n1 = N[i + 1];
        const l0 = [p0[0] + n0[0] * hw, p0[1] + n0[1] * hw];
        const r0 = [p0[0] - n0[0] * hw, p0[1] - n0[1] * hw];
        const l1 = [p1[0] + n1[0] * hw, p1[1] + n1[1] * hw];
        const r1 = [p1[0] - n1[0] * hw, p1[1] - n1[1] * hw];
        if (o.clip !== false && !onLand(p0[0], p0[1], 0.3) && !onLand(p1[0], p1[1], 0.3)) continue;
        const yl0 = yOf(l0), yr0 = yOf(r0), yl1 = yOf(l1), yr1 = yOf(r1);
        const nL0 = normalAt(l0[0], l0[1]), nR0 = normalAt(r0[0], r0[1]);
        const nL1 = normalAt(l1[0], l1[1]), nR1 = normalAt(r1[0], r1[1]);
        const tri = (v0, v1, v2) => {
          // ensure upward winding
          const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
          const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
          posA.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]);
          if (ax * bz - az * bx > 0) {
            nrmA.push(nL0.x, nL0.y, nL0.z, nL0.x, nL0.y, nL0.z, nL0.x, nL0.y, nL0.z);
          } else {
            nrmA.push(nL0.x, nL0.y, nL0.z, nL0.x, nL0.y, nL0.z, nL0.x, nL0.y, nL0.z);
          }
        };
        // choose order by computed plan-area sign
        const area = (r0[0] - l0[0]) * (r1[1] - l0[1]) - (r0[1] - l0[1]) * (r1[0] - l0[0]);
        const flip = area < 0;
        const quadA = [[l0[0], yl0, l0[1]], [flip ? r0 : r1 ? r0 : r0][0], 0];
        // explicit triangles
        const A = [l0[0], yl0, l0[1]], B = [r0[0], yr0, r0[1]], C = [r1[0], yr1, r1[1]], D = [l1[0], yl1, l1[1]];
        const nA = [nL0.x, nL0.y, nL0.z], nB = [nR0.x, nR0.y, nR0.z], nC = [nR1.x, nR1.y, nR1.z], nD = [nL1.x, nL1.y, nL1.z];
        const pushV = (v, n) => { posA.push(v[0], v[1], v[2]); nrmA.push(n[0], n[1], n[2]); };
        if (!flip) {
          pushV(A, nA); pushV(B, nB); pushV(C, nC);
          pushV(A, nA); pushV(C, nC); pushV(D, nD);
        } else {
          pushV(A, nA); pushV(C, nC); pushV(B, nB);
          pushV(A, nA); pushV(D, nD); pushV(C, nC);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrmA, 3));
      geo.computeBoundingSphere();
      K.add(geo, color, { bucket: o.bucket || 'matte' });
    }

    // centre / edge markings, cobble joints, kerbs
    function dashes(pts, width, yOff, color, dash, gap, w) {
      const period = dash + gap;
      let carry = 0;
      alongPolyline(pts, 0.08, (x, z, ux, uz, dist) => {
        const d = dist % period;
        if (d < dash && onLand(x, z, 0.3)) {
          const y = L.heightAt(x, z) + yOff;
          const ang = Math.atan2(-uz, ux);
          K.box(dash * 0.98, 0.004, w, x, y, z, color, { rot: [0, ang, 0] });
        }
      });
    }
    function solidLines(pts, width, yOff, color, w) {
      const hw = width / 2 + 0.045;
      for (const side of [-1, 1]) {
        const shifted = pts.map((p) => [p[0], p[1]]);
        // build a thin ribbon offset by hw: approximate with boxes along the line
        alongPolyline(pts, 0.16, (x, z, ux, uz, dist) => {
          if (!onLand(x, z, 0.3)) return;
          const nx = -uz, nz = ux;
          const px = x + nx * hw * side, pz = z + nz * hw * side;
          const y = L.heightAt(px, pz) + yOff;
          K.box(0.17, 0.004, w, px, y, pz, color, { rot: [0, Math.atan2(-uz, ux), 0] });
        });
      }
    }
    function kerbs(pts, width, yOff, color, seg) {
      const hw = width / 2 + 0.04;
      for (const side of [-1, 1]) {
        alongPolyline(pts, seg || 0.8, (x, z, ux, uz) => {
          if (!onLand(x, z, 0.3)) return;
          const nx = -uz, nz = ux;
          const px = x + nx * hw * side, pz = z + nz * hw * side;
          const y = L.heightAt(px, pz) + yOff;
          K.box((seg || 0.8) * 0.96, 0.075, 0.07, px, y + 0.028, pz, K.vary(color, rand, { l: 0.04, s: 0.03 }), { rot: [0, Math.atan2(-uz, ux), 0] });
        });
      }
    }

    const roadById = {};
    for (const r of L.roads) roadById[r.id] = r;

    // true when a point is on the island (a small overhang is tolerated for
    // structures that legitimately bridge the waterline)
    function onLand(x, z, margin) {
      if (L.pointInLand(x, z)) return true;
      return L.distToCoast(x, z) < (margin == null ? 0.3 : margin);
    }
    function landClipBox(w, h, d, x, y, z, color, opts, margin) {
      if (!onLand(x, z, margin)) return;
      K.box(w, h, d, x, y, z, color, opts);
    }

    // ---- asphalt roads at deck level
    (function asphaltRoads() {
      const quay = roadById.quay;
      addRibbon(quay.points, quay.width, 0.014, K.vary(0x4d4b46, rand, { l: 0.02, s: 0.01 }));
      dashes(quay.points, quay.width, 0.019, K.vary(C.lineWhite, rand, { l: 0.02 }), 0.30, 0.24, 0.03);
      // yellow edge lines on the quay lane
      for (const side of [-1, 1]) {
        alongPolyline(quay.points, 0.18, (x, z, ux, uz) => {
          if (!onLand(x, z, 0.3)) return;
          const nx = -uz, nz = ux;
          const px = x + nx * (quay.width / 2 - 0.055) * side;
          const pz = z + nz * (quay.width / 2 - 0.055) * side;
          K.box(0.18, 0.004, 0.028, px, L.heightAt(px, pz) + 0.019, pz, K.vary(C.lineYellow, rand, { l: 0.03, s: 0.02 }), {
            rot: [0, Math.atan2(-uz, ux), 0],
          });
        });
      }
      // subtle tyre wear
      for (const side of [-1, 1]) {
        alongPolyline(quay.points, 0.5, (x, z, ux, uz) => {
          if (!onLand(x, z, 0.3)) return;
          const nx = -uz, nz = ux;
          const px = x + nx * 0.17 * side, pz = z + nz * 0.17 * side;
          K.box(0.48, 0.003, 0.09, px, L.heightAt(px, pz) + 0.017, pz, K.shade(C.asphaltDark || 0x4a4843, 0.01), {
            rot: [0, Math.atan2(-uz, ux), 0],
          });
        });
      }

      const east = roadById.east;
      addRibbon(east.points, east.width, 0.014, K.vary(0x4d4b46, rand, { l: 0.025, s: 0.01 }));
      solidLines(east.points, east.width, 0.020, C.lineWhite, 0.032);
      kerbs(east.points, east.width, 0.014, C.stoneLight, 0.8);

      const back = roadById.back;
      addRibbon(back.points, back.width, 0.014, K.vary(0x4d4b46, rand, { l: 0.02, s: 0.01 }));
      solidLines(back.points, back.width, 0.020, C.lineWhite, 0.032);
      kerbs(back.points, back.width, 0.014, C.stoneLight, 0.9);
    })();

    // ---- cobbled town streets
    (function cobbleRoads() {
      const street = roadById['town-street'];
      addRibbon(street.points, street.width, 0.02, K.vary(0x9b907c, rand, { l: 0.02, s: 0.02 }), { step: 0.1 });
      // cobble joints across the street
      alongPolyline(street.points, 0.3, (x, z, ux, uz) => {
        if (!onLand(x, z, 0.25)) return;
        const ang = Math.atan2(-uz, ux);
        K.box(0.026, 0.004, street.width * 0.92, x, L.heightAt(x, z) + 0.024, z, K.shade(0x6f6555, 0.01), { rot: [0, ang, 0] });
      });
      kerbs(street.points, street.width, 0.02, C.stone, 0.62);
      // gutter channel
      dashes(street.points, street.width, 0.024, 0x5f5749, 0.55, 0.05, 0.03);

      const lane = roadById['town-lane'];
      // stepped lane: individual stone treads
      let idx = 0;
      alongPolyline(lane.points, 0.19, (x, z, ux, uz, dist) => {
        if (!onLand(x, z, 0.25)) return;
        const ang = Math.atan2(-uz, ux);
        const y = L.heightAt(x, z);
        K.box(0.2, 0.09, lane.width * 0.98, x, y + 0.025, z, K.vary(C.stone, rand, { l: 0.05, s: 0.035 }), { rot: [0, ang, 0] });
        K.box(0.2, 0.03, lane.width * 0.9, x, y + 0.072, z, K.vary(C.stoneLight, rand, { l: 0.05, s: 0.03 }), { rot: [0, ang, 0] });
        idx++;
      });
      kerbs(lane.points, lane.width, 0.02, C.stoneDark, 0.5);
      P.stats.steps = (P.stats.steps || 0) + idx;
    })();

    // ---- drains, manholes, gutters along the streets
    (function streetDrains() {
      for (const u of [3.2, 9.7, 16.2]) {
        const x = u - 9.6, z = -5.355;
        K.box(0.2, 0.008, 0.1, x, 1.121, z, 0x3f3b33);
        for (let i = 0; i < 4; i++) K.box(0.17, 0.004, 0.012, x, 1.124, z - 0.036 + i * 0.024, 0x25231e);
      }
      for (const [x, z] of [[-6.2, -11.55], [4.4, -11.55], [11.95, -8.4]]) {
        K.cyl(0.085, 0.008, x, L.heightAt(x, z) + 0.02, z, 0x585246, { seg: 18 });
        K.cyl(0.066, 0.008, x, L.heightAt(x, z) + 0.024, z, 0x6a6355, { seg: 18 });
        K.box(0.11, 0.004, 0.012, x, L.heightAt(x, z) + 0.026, z, 0x46423a, { rot: [0, 0.5, 0] });
      }
      // fishing-quay gutter against the wall
      ff.box(0, FISH.len, -0.16, -0.125, 1.106, 1.108, 0x4b473d);
    })();

    /* ------------------------------------------------------------- RAILWAY -- */
    const RAIL = L.rail;
    const railZ = RAIL.track.z; // -10.35
    const railX0 = RAIL.track.x0, railX1 = RAIL.track.x1;
    const CROSS = { x0: 11.62, x1: 12.28 }; // level crossing gap
    const railLen = railX1 - railX0;
    (function railway() {
      // where the track actually reaches land (the NE coast cuts the layout's
      // nominal x-range, so clip instead of hanging the rail over water)
      let trackStart = railX0, trackEnd = railX1;
      for (let x = railX0; x <= railX1; x += 0.05) {
        if (onLand(x, railZ, 0.18)) { trackStart = x; break; }
      }
      for (let x = railX1; x >= railX0; x -= 0.05) {
        if (onLand(x, railZ, 0.18)) { trackEnd = x; break; }
      }
      const trackLen = Math.max(0, trackEnd - trackStart);
      // ballast (segmented, land-clipped)
      for (let x = trackStart; x < trackEnd; x += 0.5) {
        const x1 = Math.min(x + 0.5, trackEnd);
        const cx = (x + x1) / 2;
        K.box(x1 - x + 0.006, 0.065, RAIL.ballastWidth, cx, 1.1275, railZ,
          K.vary(0x8d8677, rand, { l: 0.03, s: 0.02 }));
        K.box(x1 - x + 0.006, 0.02, RAIL.ballastWidth + 0.09, cx, 1.158, railZ,
          K.vary(0x9a9283, rand, { l: 0.03, s: 0.02 }));
      }
      // ballast shoulder stones
      for (let x = trackStart + 0.1; x < trackEnd - 0.1; x += 0.16) {
        for (const side of [-1, 1]) {
          if (rand() < 0.35) continue;
          const px = x + (rand() - 0.5) * 0.1;
          const pz = railZ + side * (RAIL.ballastWidth / 2 + (rand() - 0.5) * 0.08);
          const sc = 0.014 + rand() * 0.02;
          cobbleInst.add({
            pos: [px, 1.155 + rand() * 0.01, pz],
            rot: [rand() * 3, rand() * 6.28, rand() * 3],
            scale: [sc, sc * 0.6, sc],
            color: rockColor(rand() < 0.4 ? 'dark' : 'rock'),
          });
        }
      }

      // sleepers (instanced)
      const sleeperMat = instMat({ roughness: 0.86 });
      const sleeperGeo = instGeo(new THREE.BoxGeometry(1, 1, 1));
      const sleeperInst = K.instancer(sleeperGeo, sleeperMat, { name: 'rail:sleepers' });
      let ns = 0;
      for (let x = trackStart + 0.08; x < trackEnd - 0.02; x += 0.165) {
        sleeperInst.add({
          pos: [x, 1.185, railZ],
          rot: [0, (rand() - 0.5) * 0.012, 0],
          scale: [0.05, 0.028, 0.44],
          color: K.vary(0x5a4635, rand, { l: 0.06, s: 0.05, h: 0.008 }),
        });
        ns++;
      }
      // rails: foot / web / head (segmented so they stop at the shore)
      for (const side of [-1, 1]) {
        const z = railZ + side * (RAIL.gauge / 2);
        for (let x = trackStart; x < trackEnd; x += 0.6) {
          const x1 = Math.min(x + 0.6, trackEnd);
          const cx = (x + x1) / 2;
          K.box(x1 - x + 0.004, 0.012, 0.052, cx, 1.205, z, 0x655f52, { bucket: 'metal' });
          K.box(x1 - x + 0.004, 0.016, 0.018, cx, 1.219, z, 0x6f695b, { bucket: 'metal' });
          K.box(x1 - x + 0.004, 0.012, 0.03, cx, 1.233, z, 0x8f8778, { bucket: 'metal' });
          K.box(x1 - x + 0.004, 0.003, 0.012, cx, 1.2405, z, 0xb0a794, { bucket: 'metal' });
        }
      }
      K.count('railSleepers', ns);

      // rail fastenings
      const boltMat = instMat({ roughness: 0.6, metalness: 0.3 });
      const boltInst = K.instancer(instGeo(new THREE.BoxGeometry(1, 1, 1)), boltMat, { name: 'rail:clips' });
      for (let x = trackStart + 0.08; x < trackEnd - 0.02; x += 0.165) {
        for (const side of [-1, 1]) {
          boltInst.add({
            pos: [x, 1.2, railZ + side * (RAIL.gauge / 2)],
            rot: [0, 0, 0],
            scale: [0.075, 0.012, 0.05],
            color: K.vary(0x6a6353, rand, { l: 0.04 }),
          });
        }
      }

      // ---- buffer stops at both land ends
      for (const [x, dir] of [[trackStart + 0.1, 1], [trackEnd - 0.1, -1]]) {
        const col = K.vary(C.rust, rand, { l: 0.03, s: 0.03 });
        K.box(0.16, 0.16, 0.52, x, 1.27, railZ, K.vary(0x4a463c, rand, { l: 0.04 }), { bucket: 'paint' });
        for (const side of [-1, 1]) {
          K.cyl(0.045, 0.13, x - dir * 0.1, 1.27, railZ + side * 0.13, K.vary(0x3a3730, rand, { l: 0.02 }), {
            rot: [0, 0, Math.PI / 2], seg: 10,
          });
          K.cyl(0.055, 0.02, x - dir * 0.1, 1.27, railZ + side * 0.13, 0x2f2c27, { rot: [0, 0, Math.PI / 2], seg: 10 });
        }
        K.box(0.05, 0.1, 0.5, x + dir * 0.04, 1.19, railZ, col, { bucket: 'paint' });
        for (let s = 0; s < 3; s++) {
          K.box(0.055, 0.09, 0.06, x + dir * 0.04, 1.19, railZ - 0.18 + s * 0.18, s % 2 ? 0xc7a76a : 0x3a3833);
        }
        K.box(0.2, 0.08, 0.46, x + dir * 0.15, 1.22, railZ, K.vary(0x7a7263, rand, { l: 0.03 }));
      }

      // ---- colour-light signals beside the track
      function signal(x) {
        const z = railZ - 0.62;
        if (!onLand(x, z, 0.3)) return;
        const col = K.vary(0x4b4a44, rand, { l: 0.03 });
        K.box(0.18, 0.08, 0.16, x, 1.15, z, K.vary(C.concreteDark, rand, { l: 0.03 }));
        K.cyl(0.022, 0.62, x, 1.46, z, col, { seg: 8, bucket: 'metal' });
        K.box(0.11, 0.24, 0.08, x, 1.8, z, col, { bucket: 'paint' });
        K.box(0.14, 0.02, 0.1, x, 1.93, z, K.shade(col, 0.06), { bucket: 'paint' });
        for (let i = 0; i < 3; i++) {
          const lens = [0x8a3a30, 0xb08a4a, 0x4d7a5a][i];
          K.cyl(0.028, 0.012, x, 1.885 - i * 0.065, z + 0.048, lens, {
            rot: [Math.PI / 2, 0, 0], seg: 10, bucket: i === 0 ? 'lamp' : 'glass',
          });
          K.cyl(0.036, 0.014, x, 1.885 - i * 0.065, z + 0.054, 0x35322c, { rot: [Math.PI / 2, 0, 0], seg: 10 });
        }
        for (let i = 0; i < 5; i++) K.box(0.06, 0.008, 0.08, x + 0.02, 1.48 + i * 0.08, z + 0.06, col, { bucket: 'metal' });
        K.box(0.16, 0.24, 0.14, x + 0.28, 1.27, z + 0.08, K.vary(0x8f8a7c, rand, { l: 0.03, s: 0.02 }), { bucket: 'paint' });
        K.box(0.17, 0.03, 0.15, x + 0.28, 1.405, z + 0.08, K.shade(0x6b665a, 0.02), { bucket: 'paint' });
        K.box(0.02, 0.02, 0.13, x + 0.28, 1.3, z + 0.155, 0x3a3833);
      }
      sleeperInst.finish(scene);
      boltInst.finish(scene);
      signal(2.3);
      signal(9.6);

      // ---- cable ducts beside the track (segmented, clipped)
      for (let x = trackStart + 0.2; x < trackEnd - 0.2; x += 0.8) {
        K.box(0.78, 0.035, 0.055, x + 0.4, 1.125, railZ + 0.56, K.vary(C.concreteDark, rand, { l: 0.03 }));
        K.box(0.72, 0.008, 0.062, x + 0.4, 1.145, railZ + 0.56, K.vary(C.concrete, rand, { l: 0.04 }));
      }
      if (onLand(5.2, railZ, 0.2)) {
        K.box(0.2, 0.04, 1.4, 5.2, 1.16, railZ, K.vary(C.concrete, rand, { l: 0.03 }));
        for (let i = 0; i < 5; i++) K.box(0.15, 0.006, 0.035, 5.2, 1.183, railZ - 0.5 + i * 0.25, 0x4b473d);
      }

      // ---- level crossing (only where the layout road actually meets land)
      if (onLand(11.95, railZ, 0.2)) {
        const cxMid = 11.95;
        K.box(0.7, 0.03, RAIL.ballastWidth + 0.06, cxMid, 1.176, railZ,
          K.vary(C.concrete, rand, { l: 0.03, s: 0.03 }));
        for (let i = 0; i < 5; i++) {
          K.box(0.68, 0.022, 0.16, cxMid, 1.196, railZ - 0.4 + i * 0.2,
            K.vary(C.wood, rand, { l: 0.05, s: 0.04, h: 0.01 }));
        }
        K.box(0.7, 0.006, 0.035, cxMid, 1.198, railZ, 0x34312b);
        for (const z of [railZ + 0.98, railZ - 0.98]) {
          K.box(0.42, 0.004, 0.05, 11.95, L.heightAt(11.95, z) + 0.02, z, C.lineWhite);
        }
        function warningPost(x, z, facing) {
          const col = 0x4a463e;
          K.cyl(0.018, 0.36, x, 1.29, z, col, { seg: 8, bucket: 'metal' });
          K.cyl(0.06, 0.02, x, 1.11, z, K.vary(C.concreteDark, rand, { l: 0.03 }), { seg: 8 });
          for (const a of [0.72, -0.72]) {
            K.box(0.26, 0.03, 0.012, x, 1.47, z, K.vary(C.lineWhite, rand, { l: 0.02 }), { rot: [0, facing, a] });
            K.box(0.26, 0.012, 0.012, x, 1.47, z + 0.008, 0x9c4a3c, { rot: [0, facing, a] });
          }
          K.box(0.06, 0.1, 0.04, x, 1.36, z, 0x3a3833, { rot: [0, facing, 0] });
          K.cyl(0.022, 0.014, x - 0.0, 1.38, z + 0.025, 0x9c3f33, { rot: [Math.PI / 2, 0, 0], seg: 8, bucket: 'lamp' });
          K.cyl(0.022, 0.014, x, 1.34, z + 0.025, 0x9c3f33, { rot: [Math.PI / 2, 0, 0], seg: 8, bucket: 'lamp' });
          K.cyl(0.03, 0.02, x, 1.38, z + 0.02, 0x35322c, { rot: [Math.PI / 2, 0, 0], seg: 8 });
          K.box(0.05, 0.05, 0.05, x, 1.24, z, 0x4a463e);
        }
        warningPost(11.62, railZ + 0.72, -Math.PI / 2);
        warningPost(11.62, railZ - 0.72, Math.PI / 2);
        for (const side of [-1, 1]) {
          const z = railZ + side * 0.72;
          K.strut([11.62, 1.45, z], [11.62, 1.98, z], 0.012, 0x4a463e, { seg: 6, bucket: 'metal' });
          for (let i = 0; i < 6; i++) {
            K.box(0.02, 0.055, 0.02, 11.62, 1.5 + i * 0.08, z, i % 2 ? 0x9c4a3c : 0xd6cdb8);
          }
        }
      }
    })();

    /* ---------------------------------------------- old-town retaining walls -- */
    (function townRetaining() {
      const wallX = -10.76;
      const z0 = -4.22, z1 = -0.86;
      const stairGap = [-1.84, -1.02];
      const nSeg = 10;
      const segs = [];
      for (let i = 0; i < nSeg; i++) {
        const za = z0 + (z1 - z0) * (i / nSeg);
        const zb = z0 + (z1 - z0) * ((i + 1) / nSeg);
        const zm = (za + zb) / 2;
        if (zm > stairGap[1] || zm < stairGap[0]) segs.push([za, zb]);
      }
      for (const [za, zb] of segs) {
        const zm = (za + zb) / 2;
        const len = Math.abs(zb - za);
        const topY = clamp(L.heightAt(wallX - 0.22, zm) + 0.03, 1.34, 2.42);
        const bottom = 1.02;
        // wall body with a little per-segment tone shift
        K.box(0.16, topY - bottom, len + 0.012, wallX - 0.08, (topY + bottom) / 2, zm,
          K.vary(0x8a7d68, rand, { l: 0.035, s: 0.03, h: 0.008 }));
        // horizontal stone courses
        for (let y = 1.24; y < topY - 0.12; y += 0.215) {
          K.box(0.012, 0.011, len - 0.02, wallX + 0.004, y, zm, K.shade(0x6f6453, 0.0, 0.02));
        }
        // vertical joints
        for (let k = 1; k < 3; k++) {
          K.box(0.012, topY - 1.2, 0.012, wallX + 0.004, (topY + 1.2) / 2, za + (zb - za) * (k / 3),
            K.shade(0x6f6453, 0.0, 0.02));
        }
        // slim raised pilaster at the segment centre
        K.box(0.032, topY - 1.06, 0.1, wallX - 0.004, (topY + 1.06) / 2, zm,
          K.vary(0x94876f, rand, { l: 0.03, s: 0.02 }));
        K.box(0.07, 0.04, 0.13, wallX - 0.004, topY - 0.018, zm, K.vary(0xa89b84, rand, { l: 0.03 }));
        // coping slab with a slight overhang
        K.box(0.24, 0.06, len - 0.012, wallX - 0.1, topY + 0.03, zm, K.vary(0xa89b84, rand, { l: 0.04, s: 0.03 }));
        // damp / moss at the foot
        K.box(0.02, 0.16, len - 0.04, wallX + 0.007, 1.1, zm, K.vary(0x5b6648, rand, { l: 0.04, s: 0.05 }));
      }
      // gate posts framing the stair opening
      for (const z of [stairGap[1], stairGap[0]]) {
        const topY = clamp(L.heightAt(wallX - 0.22, z) + 0.03, 1.45, 2.42);
        K.box(0.19, topY - 1.02, 0.15, wallX - 0.04, (topY + 1.02) / 2, z, K.vary(0x8f8269, rand, { l: 0.03, s: 0.02 }));
        K.box(0.23, 0.05, 0.19, wallX - 0.04, topY + 0.025, z, K.vary(0xb0a289, rand, { l: 0.03 }));
      }
      // ---- diagonal stair cut into the hillside (horizontal treads on a
      //      solid inclined stone body, continuous cheek walls)
      (function hillStair() {
        const Ax = -10.53, Az = -0.98;
        const Bx = -11.18, Bz = -2.42;
        const hA = 1.1, hB = L.heightAt(Bx, Bz) + 0.02;
        const dx = Bx - Ax, dz = Bz - Az;
        const run = Math.hypot(dx, dz);
        const ux = dx / run, uz = dz / run;
        const nx = uz, nz = -ux; // downhill side
        const ang = Math.atan2(-uz, ux);
        const n = 13;
        const tread = run / n;
        const riser = (hB - hA) / n;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n;
          const cx = Ax + dx * t, cz = Az + dz * t;
          const top = hA + riser * (i + 1);
          // solid body of the flight (down to the ground, buried on the uphill side)
          K.box(0.62, 0.5, tread + 0.02, cx, top - 0.27, cz,
            K.vary(0x8a7d68, rand, { l: 0.03, s: 0.02 }), { rot: [0, ang, 0] });
          // tread slab
          K.box(0.62, 0.035, tread - 0.004, cx, top + 0.002, cz,
            K.vary(0x9f927b, rand, { l: 0.04, s: 0.025 }), { rot: [0, ang, 0] });
        }
        // continuous inclined cheek walls
        const dir = new THREE.Vector3().subVectors(
          new THREE.Vector3(Bx, hB, Bz), new THREE.Vector3(Ax, hA, Az));
        const len = dir.length();
        dir.normalize();
        const side = new THREE.Vector3().crossVectors(dir, upVec).normalize();
        const up2 = new THREE.Vector3().crossVectors(side, dir).normalize();
        const quat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(dir, up2, side));
        const mid = new THREE.Vector3(Ax, hA, Az).addScaledVector(dir, len * 0.5).addScaledVector(up2, 0.17);
        for (const sd of [-1, 1]) {
          const off = new THREE.Vector3().copy(side).multiplyScalar(sd * 0.33);
          K.add(K.geoBox(), K.vary(0x7e7260, rand, { l: 0.03, s: 0.02 }), {
            quat: quat.clone(), scale: [len, 0.4, 0.075],
            pos: [mid.x + off.x, mid.y + off.y, mid.z + off.z],
          });
          K.add(K.geoBox(), K.vary(0x968a74, rand, { l: 0.03 }), {
            quat: quat.clone(), scale: [len, 0.05, 0.11],
            pos: [mid.x + off.x, mid.y + off.y + 0.21, mid.z + off.z],
          });
        }
        // handrail on the downhill cheek
        const hA2 = [Ax + nx * 0.33, hA + 0.62, Az + nz * 0.33];
        const hB2 = [Bx + nx * 0.33, hB + 0.62, Bz + nz * 0.33];
        K.strut(hA2, hB2, 0.012, 0x5a5244, { seg: 6, bucket: 'metal' });
        for (const t of [0.05, 0.5, 0.95]) {
          const px = Ax + dx * t + nx * 0.33, pz = Az + dz * t + nz * 0.33;
          const py = hA + (hB - hA) * t;
          K.cyl(0.009, 0.44, px, py + 0.33, pz, 0x5a5244, { seg: 5, bucket: 'metal' });
        }
        // bottom apron + top landing with lamp
        K.box(0.7, 0.1, 0.34, Ax + 0.02, hA + 0.02, Az + 0.05, K.vary(0x8a7d68, rand, { l: 0.03 }), { rot: [0, ang, 0] });
        K.box(0.74, 0.03, 0.38, Ax + 0.02, hA + 0.08, Az + 0.05, K.vary(0xb3a58c, rand, { l: 0.03 }), { rot: [0, ang, 0] });
        K.box(0.62, 0.14, 0.5, Bx - 0.12, hB - 0.06, Bz - 0.22, K.vary(0x8a7d68, rand, { l: 0.02, s: 0.02 }), { rot: [0, 0.55, 0] });
        K.box(0.66, 0.03, 0.54, Bx - 0.12, hB + 0.01, Bz - 0.22, K.vary(0xb3a58c, rand, { l: 0.02 }), { rot: [0, 0.55, 0] });
        K.cyl(0.012, 0.46, Bx - 0.34, hB + 0.36, Bz - 0.12, 0x4d4a42, { seg: 5, bucket: 'metal' });
        K.cyl(0.06, 0.02, Bx - 0.34, hB + 0.6, Bz - 0.12, 0x3f3b33, { seg: 8, bucket: 'metal' });
        K.cyl(0.028, 0.045, Bx - 0.34, hB + 0.63, Bz - 0.12, K.vary(C.lampWarm, rand, { l: 0.02 }), { seg: 8, bucket: 'lamp' });
        K.cyl(0.07, 0.02, Bx - 0.34, hB + 0.66, Bz - 0.12, 0x3f3b33, { seg: 8, bucket: 'metal' });
      })();
      // low wall on the north knoll
      for (let i = 0; i < 3; i++) {
        const z = 0.55 + i * 0.55;
        const topY = Math.max(1.2, L.heightAt(wallX - 0.15, z) + 0.02);
        K.box(0.14, topY - 1.03, 0.54, wallX - 0.07, (topY + 1.03) / 2, z, K.vary(0x8a7d68, rand, { l: 0.03, s: 0.02 }));
        K.box(0.2, 0.05, 0.56, wallX - 0.07, topY + 0.015, z, K.vary(0xa89b84, rand, { l: 0.03 }));
      }
      // flat stone pavement on the three small plazas (draped by normal)
      const upQ = new THREE.Quaternion();
      function plazaSlab(cx, cz, r, step, ring) {
        for (let dx = -r; dx <= r; dx += step) {
          for (let dz = -r; dz <= r; dz += step) {
            const px = cx + dx + (rand() - 0.5) * 0.025;
            const pz = cz + dz + (rand() - 0.5) * 0.025;
            if (Math.hypot(dx, dz) > r - 0.02) continue;
            const y = L.heightAt(px, pz);
            const n = normalAt(px, pz);
            upQ.setFromUnitVectors(upVec, n);
            K.box(step * 0.92, 0.028, step * 0.92, px, y + 0.002, pz,
              K.vary(0x7f7767, rand, { l: 0.06, s: 0.04, h: 0.008 }),
              { quat: upQ.clone() });
          }
        }
        if (ring) {
          const nK = Math.max(10, Math.round(r * 34));
          for (let i = 0; i < nK; i++) {
            const a = (i / nK) * Math.PI * 2;
            const px = cx + Math.cos(a) * (r - 0.03), pz = cz + Math.sin(a) * (r - 0.03);
            const y = L.heightAt(px, pz);
            K.box(0.075, 0.045, (Math.PI * 2 * r) / nK + 0.015, px, y + 0.012, pz,
              K.vary(0x6f6759, rand, { l: 0.04, s: 0.03 }), { rot: [0, -a, 0] });
          }
        }
      }
      plazaSlab(-11.05, -3.3, 0.32, 0.19, false);
      plazaSlab(-10.28, -1.9, 0.4, 0.19, true);
      // stone bench + planter on the flat lower plaza (fishing quay strip)
      const bx = -10.33, bz = -2.95;
      const by = L.heightAt(bx, bz);
      K.box(0.36, 0.05, 0.13, bx, by + 0.16, bz, K.vary(0xb3a58c, rand, { l: 0.03 }), { rot: [0, 0.1, 0] });
      K.box(0.06, 0.13, 0.1, bx, by + 0.075, bz - 0.13, K.vary(0x7e7260, rand, { l: 0.03 }), { rot: [0, 0.1, 0] });
      K.box(0.06, 0.13, 0.1, bx, by + 0.075, bz + 0.13, K.vary(0x7e7260, rand, { l: 0.03 }), { rot: [0, 0.1, 0] });
      const px = -10.35, pz = -0.75;
      const py = L.heightAt(px, pz);
      K.cyl(0.115, 0.16, px, py + 0.08, pz, K.vary(0x7e7260, rand, { l: 0.03 }));
      K.cyl(0.13, 0.03, px, py + 0.17, pz, K.vary(0xb3a58c, rand, { l: 0.03 }));
      K.cyl(0.095, 0.02, px, py + 0.185, pz, K.vary(C.foliageDark, rand, { l: 0.03 }), { seg: 10 });
      K.count('trees', 1);
    })();

    /* ====================================================================== *
     * 7.  WATERFRONT — pontoon, dolphins, slipway, quay benches
     * ====================================================================== */
    (function pontoon() {
      const PP = L.placements.pontoon; // x0 -9.5 .. x1 -8.15, z0 1.35 .. z1 2.55
      const deckY = 0.245;
      const x0 = PP.x0, x1 = PP.x1, z0 = PP.z0, z1 = PP.z1;
      const cx = (x0 + x1) / 2;
      // floats
      for (const fz of [z0 + 0.22, (z0 + z1) / 2, z1 - 0.22]) {
        K.box(1.22, 0.16, 0.3, cx, 0.1, fz, K.vary(0x3b3831, rand, { l: 0.03, s: 0.02 }));
        K.box(1.26, 0.03, 0.32, cx, 0.19, fz, K.shade(0x4a463d, 0.01), { bucket: 'metal' });
      }
      // deck planks
      const plankW = 0.166;
      for (let z = z0 + plankW / 2; z < z1 - 0.02; z += plankW) {
        K.box(x1 - x0, 0.035, plankW - 0.012, cx, deckY, z, K.vary(C.woodLight, rand, { l: 0.06, s: 0.05, h: 0.008 }));
      }
      // outer trim + kerb
      K.box(x1 - x0, 0.06, 0.05, cx, deckY + 0.02, z1 - 0.02, K.vary(C.wood, rand, { l: 0.04 }));
      K.box(x1 - x0, 0.06, 0.05, cx, deckY + 0.02, z0 + 0.02, K.vary(C.wood, rand, { l: 0.04 }));
      K.box(0.05, 0.06, z1 - z0, x1 - 0.02, deckY + 0.02, (z0 + z1) / 2, K.vary(C.wood, rand, { l: 0.04 }));
      // cleats along the outer edge
      for (const z of [z0 + 0.25, (z0 + z1) / 2, z1 - 0.25]) {
        K.box(0.11, 0.03, 0.045, x1 - 0.11, deckY + 0.055, z, 0x55514a, { bucket: 'metal' });
        K.cyl(0.018, 0.03, x1 - 0.16, deckY + 0.07, z, 0x55514a, { seg: 6, bucket: 'metal' });
        K.cyl(0.018, 0.03, x1 - 0.06, deckY + 0.07, z, 0x55514a, { seg: 6, bucket: 'metal' });
      }
      // tyres against the quay wall
      for (const z of [z0 + 0.28, (z0 + z1) / 2, z1 - 0.28]) {
        K.torus(0.075, 0.028, x0 + 0.05, 0.14, z, K.vary(0x2b2924, rand, { l: 0.03 }), { rot: [0, Math.PI / 2, 0], rs: 8, ts: 14 });
      }
      // hanging fenders on the outer edge
      for (const z of [z0 + 0.4, z1 - 0.4]) {
        K.cyl(0.035, 0.2, x1 + 0.02, 0.13, z, K.vary(0x33302a, rand, { l: 0.03 }), { seg: 8 });
      }
      // access ladder on the outer edge
      for (const side of [-1, 1]) {
        K.cyl(0.008, 0.42, x1 + 0.015, 0.0, (z0 + z1) / 2 + side * 0.1, 0x514c43, { seg: 5, bucket: 'metal' });
      }
      for (let i = 0; i < 4; i++) {
        K.box(0.012, 0.01, 0.2, x1 + 0.015, 0.14 - i * 0.08, (z0 + z1) / 2, 0x514c43, { bucket: 'metal' });
      }
      // coiled mooring ropes
      K.torus(0.06, 0.018, x1 - 0.35, deckY + 0.045, z0 + 0.3, K.vary(0x857b66, rand, { l: 0.04 }), { rot: [-Math.PI / 2, 0, 0] });
      K.torus(0.05, 0.016, x1 - 0.5, deckY + 0.04, z1 - 0.3, K.vary(0x7b7262, rand, { l: 0.04 }), { rot: [-Math.PI / 2, 0, 0] });
      // ---- gangway from the fishing-quay deck down to the pontoon
      const A = [-10.12, 1.12, 1.95];
      const B = [-8.98, 0.31, 1.95];
      const dx = B[0] - A[0], dy = B[1] - A[1];
      const len = Math.hypot(dx, dy);
      const pitch = Math.atan2(dy, dx);
      const nP = 10;
      for (let i = 0; i < nP; i++) {
        const t = (i + 0.5) / nP;
        const px = A[0] + dx * t, py = A[1] + dy * t;
        K.box(len / nP - 0.006, 0.028, 0.42, px, py, A[2], K.vary(C.woodLight, rand, { l: 0.05, s: 0.04 }), {
          rot: [0, 0, pitch],
        });
      }
      // stringers + handrails
      for (const side of [-1, 1]) {
        const oz = side * 0.235;
        K.strut([A[0], A[1] + 0.02, A[2] + oz], [B[0], B[1] + 0.02, B[2] + oz], 0.018, K.vary(C.woodDark, rand, { l: 0.03 }), { seg: 6 });
        // handrail follows the ramp slope and is carried by three posts
        K.strut([A[0], A[1] + 0.48, A[2] + oz], [B[0], B[1] + 0.46, B[2] + oz], 0.011, 0x8d7a5a, { seg: 5, bucket: 'metal' });
        for (const t of [0.02, 0.5, 0.98]) {
          const px = A[0] + (B[0] - A[0]) * t;
          const py = A[1] + (B[1] - A[1]) * t;
          K.cyl(0.009, 0.47, px, py + 0.24, A[2] + oz, 0x8d7a5a, { seg: 5, bucket: 'metal' });
        }
      }
      // landing plate on the pontoon
      K.box(0.34, 0.03, 0.5, B[0] + 0.12, deckY + 0.03, B[2], K.vary(C.wood, rand, { l: 0.03 }), { rot: [0, 0, pitch] });
      // floating life ring on the pontoon deck
      K.torus(0.09, 0.03, x1 - 0.22, deckY + 0.055, (z0 + z1) / 2, K.vary(C.lineWhite, rand, { l: 0.02 }), { rot: [-Math.PI / 2, 0, 0] });
    })();

    // ---- timber dolphins / mooring piles in the basin
    (function dolphins() {
      const clusters = [
        { x: -8.02, z: 0.55, n: 3, r: 0.24 },
        { x: -7.98, z: 1.75, n: 3, r: 0.22 },
        { x: -8.1, z: 2.92, n: 2, r: 0.2 },
        { x: -7.6, z: 3.9, n: 2, r: 0.26 },
      ];
      for (const c of clusters) {
        const tops = [];
        for (let i = 0; i < c.n; i++) {
          const a = (i / c.n) * Math.PI * 2 + rand() * 0.4;
          const px = c.x + Math.cos(a) * c.r * 0.5;
          const pz = c.z + Math.sin(a) * c.r * 0.5;
          const top = 0.62 + rand() * 0.06;
          const h = top + 0.55;
          K.cyl(0.042, h, px, top - h / 2, pz, K.vary(C.woodDark, rand, { l: 0.05, s: 0.05 }), {
            rot: [(rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06], seg: 7,
          });
          K.cyl(0.046, 0.02, px, top + 0.01, pz, K.vary(C.wood, rand, { l: 0.03 }), { seg: 7 });
          tops.push([px, top - 0.04, pz]);
        }
        // cross-brace + cap
        if (tops.length >= 2) {
          K.strut(tops[0], tops[1], 0.018, K.vary(C.wood, rand, { l: 0.03 }), { seg: 6 });
          K.strut([tops[0][0], tops[0][1] - 0.2, tops[0][2]], [tops[1][0], tops[1][1] - 0.2, tops[1][2]], 0.016, K.vary(C.wood, rand, { l: 0.03 }), { seg: 6 });
        }
        K.cyl(0.06, 0.045, c.x, 0.55, c.z, K.vary(C.woodLight, rand, { l: 0.04 }), { seg: 8 });
        // hanging tyre
        if (rand() < 0.7) {
          K.torus(0.055, 0.02, c.x + 0.12, 0.42, c.z, K.vary(0x2c2a25, rand, { l: 0.02 }), { rot: [0, Math.PI / 2, 0], rs: 6, ts: 12 });
        }
        // a mooring line curling in the water is left to the fleet
      }
      // navigation posts near the channel edge
      for (const [x, z, color] of [[-6.9, 5.2, 0x4f7a5a], [-5.6, 6.4, 0x9c4a3c]]) {
        K.cyl(0.04, 0.85, x, 0.2, z, K.vary(C.wood, rand, { l: 0.04 }), { seg: 7 });
        K.cyl(0.075, 0.11, x, 0.68, z, color, { seg: 8 });
        K.cyl(0.06, 0.02, x, 0.75, z, K.shade(color, -0.03), { seg: 8 });
        K.cyl(0.028, 0.14, x, 0.82, z, K.shade(color, -0.02), { seg: 6 });
        K.sphere(0.032, x, 0.9, z, K.shade(color, 0.03), { ws: 6, hs: 4 });
      }
    })();

    // ---- small concrete slipway by the pebble cove
    (function slipway() {
      const cx = -9.86, cz = 3.85;
      // find the coast direction there (east-facing shore)
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        const y = 0.34 - i * 0.13;
        K.box(0.62, 0.07, 0.34, cx + i * 0.1, y, cz - i * 0.06, K.vary(C.concreteDark, rand, { l: 0.035, s: 0.02 }),
          { rot: [0, 0.5, 0] });
      }
      // side kerbs
      for (const side of [-1, 1]) {
        K.box(0.05, 0.1, 1.0, cx - 0.02 + side * 0.24, 0.2, cz - 0.1, K.vary(C.concrete, rand, { l: 0.03 }), { rot: [0, 0.5, 0] });
      }
      // bollard
      K.cyl(0.035, 0.16, cx - 0.3, 0.36, cz + 0.28, 0x46423a, { seg: 8, bucket: 'metal' });
    })();

    // ---- quay-side benches and planters on the promenade
    (function quayBenches() {
      for (const [x, z] of [[8.35, -4.82], [10.75, -4.82]]) {
        const ang = 0;
        K.box(0.46, 0.045, 0.145, x, 1.27, z, K.vary(C.stoneLight, rand, { l: 0.03, s: 0.02 }), { rot: [0, ang, 0] });
        K.box(0.06, 0.16, 0.12, x - 0.16, 1.19, z, K.vary(C.stoneDark, rand, { l: 0.03 }), { rot: [0, ang, 0] });
        K.box(0.06, 0.16, 0.12, x + 0.16, 1.19, z, K.vary(C.stoneDark, rand, { l: 0.03 }), { rot: [0, ang, 0] });
        K.box(0.5, 0.03, 0.2, x, 1.14, z, K.vary(C.stone, rand, { l: 0.03 }), { rot: [0, ang, 0] });
      }
      // two timber planters
      for (const [x, z] of [[6.9, -4.85], [12.15, -4.85]]) {
        K.cyl(0.15, 0.22, x, 1.21, z, K.vary(C.wood, rand, { l: 0.04, s: 0.04 }), { seg: 10 });
        K.cyl(0.16, 0.02, x, 1.325, z, K.vary(C.woodDark, rand, { l: 0.03 }), { seg: 10 });
        K.cyl(0.12, 0.02, x, 1.34, z, K.vary(C.foliageDark, rand, { l: 0.04 }), { seg: 10 });
        for (let i = 0; i < 3; i++) {
          const a = rand() * 6.28;
          K.sphere(0.05 + rand() * 0.03, x + Math.cos(a) * 0.06, 1.37 + rand() * 0.03, z + Math.sin(a) * 0.06,
            K.vary(C.foliage, rand, { l: 0.05, s: 0.05 }), { ws: 6, hs: 4 });
        }
      }
    })();

    // ---- anchors shared with other modules
    K.anchor('lighthouseLamp', { pos: [LH.x, 2.65, LH.z] });
    K.anchor('pontoon', {
      x0: L.placements.pontoon.x0, x1: L.placements.pontoon.x1,
      z0: L.placements.pontoon.z0, z1: L.placements.pontoon.z1, deckY: 0.25,
    });
    K.anchor('breakwater', { walkY: BW_WALK_Y, end: [tip.x, BW_WALK_Y, tip.z] });

    // breakwater label
    K.addLabel({
      pos: [13.55, 1.72, -1.2],
      title: '防波堤',
      sub: 'BREAKWATER · TETRAPODS',
      priority: 9,
      side: -1,
    });

    /* ====================================================================== *
     * __NEXT_SECTION__
     * ====================================================================== */

    /* ---- flush instancers --------------------------------------------- */
    boulderInst.finish(scene);
    cobbleInst.finish(scene);
    wrackInst.finish(scene);
    pebbleInst.finish(scene);
    shrubInst.finish(scene);
    tuftInst.finish(scene);

    P.stats.islandTris = (P.stats.islandTris || 0) + islandTris;
  };
})();
