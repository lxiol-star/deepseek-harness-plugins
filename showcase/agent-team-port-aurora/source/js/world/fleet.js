/* ============================================================================
 * fleet.js — 微港 · Port Aurora / the fleet
 *
 * The container ship AURORA at the berth, her mooring lines and fenders, a
 * harbour tug, a pilot boat on patrol, three fishing boats at the fish quay,
 * a small sailboat and the channel buoys.
 *
 * Design notes
 *   - every watercraft is one THREE.Group of merged vertex-coloured meshes
 *     (one draw call per kit material bucket), so thousands of small parts
 *     cost ~5 draw calls per boat;
 *   - hulls are lofted from station curves, with a maroon boot-top, a cream
 *     sheer stripe and a deck strip that follows the sheer;
 *   - water surface is y = 0: hulls are drafted below it, freeboard above;
 *   - animation is quiet: a few millimetres of heave, a fraction of a degree
 *     of roll, one spinning radar, flags that breathe.
 *
 * Owned by teammate `fleet` — do not edit other files.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  P.builders = P.builders || {};

  P.builders.fleet = function fleet(ctx) {
    const K = ctx.kit;
    const L = ctx.layout;
    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const B = ctx.batch;
    const pal = K.palette;
    const rand = K.rng(0x51f0e7);
    const clamp = K.clamp;
    const lerp = K.lerp;
    const TAU = Math.PI * 2;

    /* ====================================================================== *
     * 0.  palette — a faded, painterly model-ship set built from the kit hues
     * ====================================================================== */
    const C = {
      hull: K.shade(pal.hull, 0.005, 0.0, 0.0),
      hullDark: K.shade(pal.hull, -0.05, 0.02, 0.0),
      hullLight: K.shade(pal.hull, 0.06, -0.02, 0.01),
      boot: K.shade(pal.hullRed, -0.02, -0.01, 0.0),
      underwater: K.shade(pal.hullRed, -0.11, -0.04, 0.0),
      stripe: K.shade(pal.shipWhite, 0.02, -0.02, 0.0),
      deck: K.shade(pal.craneDark, 0.055, -0.02, 0.02),
      deckDark: K.shade(pal.craneDark, -0.02, -0.02, 0.0),
      hatch: K.shade(pal.concrete, -0.15, -0.02, 0.01),
      hatchDark: K.shade(pal.concreteDark, -0.06, -0.02, 0.0),
      house: K.shade(pal.shipWhite, 0.012, -0.012, 0.0),
      houseShade: K.shade(pal.shipCream, -0.01, -0.01, 0.0),
      trim: K.shade(pal.paperWarm, -0.02, -0.02, 0.0),
      glass: K.shade(pal.glassDark, 0.02, 0.02, 0.0),
      glassLight: K.shade(pal.glassBlue, 0.02, 0.0, 0.0),
      rail: K.shade(pal.shipWhite, -0.035, -0.04, 0.0),
      iron: K.shade(pal.ink, 0.08, -0.02, 0.0),
      metal: K.shade(pal.stoneDark, -0.04, -0.05, 0.0),
      brass: K.shade(pal.brass, 0.0, 0.02, 0.0),
      rope: K.shade(pal.inkSoft, -0.10, 0.02, 0.0),
      ropeLight: K.shade(pal.woodLight, -0.03, -0.04, 0.0),
      rubber: K.shade(pal.ink, -0.01, -0.05, 0.0),
      rust: K.shade(pal.rust, -0.02, -0.03, 0.0),
      lamp: K.shade(pal.lampWarm, -0.01, 0.0, 0.0),
      lampGlass: K.shade(pal.paperWarm, -0.05, -0.01, 0.0),
      wood: K.shade(pal.woodLight, -0.02, -0.02, 0.0),
      woodDark: K.shade(pal.wood, 0.0, 0.0, 0.0),
      cream: K.shade(pal.shipCream, 0.0, 0.0, 0.0),
      white: K.shade(pal.shipWhite, 0.03, -0.03, 0.0),
      orange: K.mixHex(pal.copper, pal.lineYellow, 0.45),
      buoyGreen: K.shade(pal.roofGreen, 0.015, 0.03, 0.0),
      buoyRed: K.shade(pal.hullRed, 0.05, 0.02, 0.0),
      sail: K.shade(pal.paperWarm, -0.01, -0.02, 0.0),
      tarp: K.shade(pal.foliageDark, 0.04, -0.08, 0.01),
      sand: K.shade(pal.sand, 0.0, -0.02, 0.0),
    };
    // hex numbers, not THREE.Color: K.vary() expects a hex input
    const hx = (hex, dl, ds, dh) => K.shade(hex, dl, ds, dh).getHex();
    const CONTAINER_COLS = [
      hx(pal.hullRed, 0.075, -0.10, 0.012),
      hx(pal.roofTerracotta, 0.06, -0.12, 0.02),
      hx(pal.crane, 0.075, -0.10, 0.0),
      hx(pal.craneDark, 0.13, -0.04, 0.0),
      hx(pal.plasterBlue, 0.02, -0.04, 0.012),
      hx(pal.foliageDark, 0.11, -0.08, 0.02),
      hx(pal.lineYellow, -0.02, -0.14, 0.012),
      hx(pal.inkSoft, 0.2, -0.08, 0.0),
      hx(pal.shipCream, 0.0, -0.05, 0.0),
      hx(pal.copper, 0.05, -0.10, 0.0),
    ];
    const REEFER = K.shade(pal.shipWhite, -0.01, -0.02, 0.0);

    /* ====================================================================== *
     * 1.  dynamic merged meshes — the Batcher, but bound to a group
     * ====================================================================== */
    const _pos = new THREE.Vector3();
    const _quat = new THREE.Quaternion();
    const _eul = new THREE.Euler();
    const _scale = new THREE.Vector3();
    const _mat = new THREE.Matrix4();
    const _nmat = new THREE.Matrix3();

    function DynMesh() {
      this.buckets = new Map();
      this.parts = 0;
    }
    DynMesh.prototype._b = function (name) {
      let b = this.buckets.get(name);
      if (!b) { b = { pos: [], norm: [], col: [], uv: [] }; this.buckets.set(name, b); }
      return b;
    };
    DynMesh.prototype.add = function (geo, color, o) {
      if (!geo || !geo.attributes || !geo.attributes.position) return;
      o = o || {};
      const bucket = K.materials[o.bucket] ? o.bucket : 'paint';
      const b = this._b(bucket);
      const p = o.pos || [0, 0, 0];
      const r = o.rot || [0, 0, 0];
      const sc = o.scale == null ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
      _pos.set(p[0] || 0, p[1] || 0, p[2] || 0);
      if (o.quat) _quat.copy(o.quat);
      else { _eul.set(r[0] || 0, r[1] || 0, r[2] || 0); _quat.setFromEuler(_eul); }
      _scale.set(sc[0] == null ? 1 : sc[0], sc[1] == null ? 1 : sc[1], sc[2] == null ? 1 : sc[2]);
      _mat.compose(_pos, _quat, _scale);
      _nmat.getNormalMatrix(_mat);
      const e = _mat.elements, n = _nmat.elements;
      const pa = geo.attributes.position;
      const na = geo.attributes.normal;
      const ua = geo.attributes.uv;
      const idx = geo.index;
      const count = idx ? idx.count : pa.count;
      const colorFn = o.colorFn;
      let cr = 1, cg = 1, cb = 1;
      if (!colorFn) {
        const c = K.color(color == null ? 0xcccccc : color);
        cr = c.r; cg = c.g; cb = c.b;
      }
      const bp = b.pos, bn = b.norm, bc = b.col, buv = b.uv;
      for (let i = 0; i < count; i++) {
        const vi = idx ? idx.getX(i) : i;
        const x = pa.getX(vi), y = pa.getY(vi), z = pa.getZ(vi);
        bp.push(
          e[0] * x + e[4] * y + e[8] * z + e[12],
          e[1] * x + e[5] * y + e[9] * z + e[13],
          e[2] * x + e[6] * y + e[10] * z + e[14]
        );
        let nx = 0, ny = 1, nz = 0;
        if (na) {
          nx = na.getX(vi); ny = na.getY(vi); nz = na.getZ(vi);
          const tx = n[0] * nx + n[3] * ny + n[6] * nz;
          const ty = n[1] * nx + n[4] * ny + n[7] * nz;
          const tz = n[2] * nx + n[5] * ny + n[8] * nz;
          const l = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1;
          nx = tx / l; ny = ty / l; nz = tz / l;
        }
        bn.push(nx, ny, nz);
        if (colorFn) {
          const c = colorFn(x, y, z);
          bc.push(c.r, c.g, c.b);
        } else {
          bc.push(cr, cg, cb);
        }
        if (ua) buv.push(ua.getX(vi), ua.getY(vi));
        else buv.push(0, 0);
      }
      this.parts++;
    };
    DynMesh.prototype.build = function (name, parent, overrides) {
      const g = parent || new THREE.Group();
      const order = ['matte', 'paint', 'metal', 'glass', 'lamp', 'foliage'];
      for (let q = 0; q < order.length; q++) {
        const bucket = order[q];
        const b = this.buckets.get(bucket);
        if (!b || !b.pos.length) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
        if (b.uv && b.uv.length) geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        const mat = (overrides && overrides[bucket]) || K.materials[bucket];
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = name + ':' + bucket;
        mesh.castShadow = !!K.castShadowBucket[bucket];
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        g.add(mesh);
      }
      return g;
    };

    /* small painter on top of a DynMesh (all coords are the boat's local frame) */
    function Art(dyn) { this.d = dyn; }
    Art.prototype.geo = function (g, color, o) { this.d.add(g, color, o || {}); return this; };
    Art.prototype.box = function (w, h, d, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      opt.pos = [x, y, z]; opt.scale = [w, h, d];
      this.d.add(K.geoBox(), color, opt);
      return this;
    };
    Art.prototype.taper = function (w0, d0, w1, d1, h, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      opt.pos = [x, y, z];
      this.d.add(taperGeo(w0, d0, w1, d1, h), color, opt);
      return this;
    };
    Art.prototype.cyl = function (r, h, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      const seg = opt.seg || 10;
      opt.pos = [x, y, z]; opt.scale = [r, h, r];
      this.d.add(K.geoCyl(seg), color, opt);
      return this;
    };
    Art.prototype.cylX = function (r, len, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      const seg = opt.seg || 10;
      opt.pos = [x, y, z]; opt.scale = [r, len, r]; opt.rot = [0, 0, Math.PI / 2];
      this.d.add(K.geoCyl(seg), color, opt);
      return this;
    };
    Art.prototype.cylZ = function (r, len, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      const seg = opt.seg || 10;
      opt.pos = [x, y, z]; opt.scale = [r, len, r]; opt.rot = [Math.PI / 2, 0, 0];
      this.d.add(K.geoCyl(seg), color, opt);
      return this;
    };
    Art.prototype.cylT = function (rt, rb, h, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      const seg = opt.seg || 10;
      opt.pos = [x, y, z];
      this.d.add(K.cylGeo(rt, rb, h, seg), color, opt);
      return this;
    };
    Art.prototype.sphere = function (r, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      opt.pos = [x, y, z]; opt.scale = [r, r, r];
      this.d.add(K.geoSphere(opt.ws || 10, opt.hs || 7), color, opt);
      return this;
    };
    Art.prototype.ellipsoid = function (sx, sy, sz, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      opt.pos = [x, y, z]; opt.scale = [sx, sy, sz];
      this.d.add(K.geoSphere(opt.ws || 12, opt.hs || 8), color, opt);
      return this;
    };
    Art.prototype.capsule = function (r, len, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      this.d.add(K.geoCapsule(r, len, opt.cs || 4, opt.rs || 6), color, {
        pos: [x, y, z], rot: opt.rot || [0, 0, 0],
      });
      return this;
    };
    Art.prototype.torus = function (R, r, x, y, z, color, o) {
      const opt = o ? Object.assign({}, o) : {};
      this.d.add(K.geoTorus(R, r, opt.rs || 6, opt.ts || 14), color, {
        pos: [x, y, z], rot: opt.rot || [0, 0, 0], scale: opt.scale || [1, 1, 1],
      });
      return this;
    };
    Art.prototype.strut = function (a, b, r, color, o) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-5) return this;
      const q = new THREE.Quaternion().setFromUnitVectors(
        _upVec, _v3.set(dx / len, dy / len, dz / len)
      );
      const opt = o ? Object.assign({}, o) : {};
      this.d.add(K.geoCyl(opt.seg || 6), color, {
        quat: q,
        pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        scale: [r, len, r],
      });
      return this;
    };
    Art.prototype.bar = function (a, b, w, color, o) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 1e-5) return this;
      const q = new THREE.Quaternion().setFromUnitVectors(
        _upVec, _v3.set(dx / len, dy / len, dz / len)
      );
      this.d.add(K.geoBox(), color, {
        quat: q,
        pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        scale: [w, len, (o && o.depth) || w],
      });
      return this;
    };
    const _upVec = new THREE.Vector3(0, 1, 0);
    const _v3 = new THREE.Vector3();

    /* --------------------------------------------------- tapered box (hull-ish) */
    function taperGeo(w0, d0, w1, d1, h) {
      const a = w0 / 2, b = d0 / 2, c = w1 / 2, d = d1 / 2;
      const pos = [
        -a, 0, -b, a, 0, -b, a, 0, b, -a, 0, b,
        -c, h, -d, c, h, -d, c, h, d, -c, h, d,
      ];
      const idx = [
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3,
        3, 7, 4, 3, 4, 0,
      ];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    /* ====================================================================== *
     * 2.  hull lofting helpers
     *     canonical boat frame: +x = bow, +z = starboard, y = up, y=0 water
     * ====================================================================== */
    function curveAt(pts, u) {
      if (u <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        const b = pts[i];
        if (u <= b[0]) {
          const a = pts[i - 1];
          const t = K.smoothstep(a[0], b[0], u);
          return a[1] + (b[1] - a[1]) * t;
        }
      }
      return pts[pts.length - 1][1];
    }
    function hullHalf(cfg, u, v) {
      const flare = cfg.flare ? cfg.flare(u) : 0;
      const w = cfg.halfBeam * curveAt(cfg.beamPts, u) * curveAt(cfg.shapePts, v) *
        (1 + flare * K.smoothstep(0.5, 1, v));
      return Math.min(cfg.halfBeam, w);
    }
    function hullSurf(cfg, vA, vB, rowTs) {
      const S = cfg.stations;
      const pos = [], idx = [];
      const R = rowTs.length;
      for (let i = 0; i < S; i++) {
        const u = i / (S - 1);
        const x = cfg.x0 + (cfg.x1 - cfg.x0) * u;
        const yb = cfg.yb(u), yd = cfg.yd(u);
        const va = vA(u), vb = vB(u);
        for (let j = 0; j < R; j++) {
          const v = va + (vb - va) * rowTs[j];
          const y = yb + v * (yd - yb);
          const hw = hullHalf(cfg, u, v);
          pos.push(x, y, hw, x, y, -hw);
        }
      }
      for (let i = 0; i < S - 1; i++) {
        for (let j = 0; j < R - 1; j++) {
          const a = (i * R + j) * 2;
          const b = ((i + 1) * R + j) * 2;
          idx.push(a, b, b + 2, a, b + 2, a + 2);
          idx.push(a + 1, b + 3, b + 1, a + 1, a + 3, b + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    function hullDeckGeo(cfg, camber) {
      const S = cfg.stations;
      const pos = [], idx = [];
      for (let i = 0; i < S; i++) {
        const u = i / (S - 1);
        const x = cfg.x0 + (cfg.x1 - cfg.x0) * u;
        const y = cfg.yd(u);
        const hw = hullHalf(cfg, u, 1);
        pos.push(x, y, hw, x, y + camber, 0, x, y, -hw);
      }
      for (let i = 0; i < S - 1; i++) {
        const a = i * 3, b = (i + 1) * 3;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    function hullCapGeo(cfg, u, vA, vB, rows, facing) {
      const x = cfg.x0 + (cfg.x1 - cfg.x0) * u;
      const yb = cfg.yb(u), yd = cfg.yd(u);
      const pos = [], idx = [];
      for (let j = 0; j < rows.length; j++) {
        const v = vA + (vB - vA) * rows[j];
        const y = yb + v * (yd - yb);
        const hw = hullHalf(cfg, u, v);
        pos.push(x, y, -hw, x, y, hw);
      }
      for (let j = 0; j < rows.length - 1; j++) {
        const a = j * 2;
        if (facing < 0) idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
        else idx.push(a, a + 3, a + 1, a, a + 2, a + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }
    function buildHull(art, cfg) {
      const vBoot = (u) => clamp(
        (cfg.bootTop - cfg.yb(u)) / Math.max(0.004, cfg.yd(u) - cfg.yb(u)), 0.012, 0.965
      );
      const vStripe = (u) => {
        const v = (cfg.yd(u) - cfg.stripeH - cfg.yb(u)) / Math.max(0.004, cfg.yd(u) - cfg.yb(u));
        return clamp(v, vBoot(u) + 0.012, 0.985);
      };
      // boot-top / underbody
      art.geo(hullSurf(cfg, () => 0, vBoot, [0, 0.22, 0.44, 0.64, 0.82, 0.94, 1]), cfg.bootColor);
      // painted hull side
      art.geo(hullSurf(cfg, vBoot, (u) => (cfg.stripeColor != null ? vStripe(u) : 1),
        cfg.stripeColor != null ? [0, 0.26, 0.52, 0.76, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1]), cfg.hullColor);
      // sheer stripe
      if (cfg.stripeColor != null) {
        art.geo(hullSurf(cfg, vStripe, () => 1, [0, 1]), cfg.stripeColor);
      }
      // deck
      art.geo(hullDeckGeo(cfg, cfg.deckCamber == null ? 0.008 : cfg.deckCamber), cfg.deckColor);
      // transom caps
      art.geo(hullCapGeo(cfg, 0, 0, vBoot(0), [0, 0.3, 0.6, 0.85, 1], -1), cfg.bootColor);
      art.geo(hullCapGeo(cfg, 0, vBoot(0), cfg.stripeColor != null ? vStripe(0) : 1,
        [0, 0.3, 0.6, 0.85, 1], -1), cfg.hullColor);
      if (cfg.stripeColor != null) {
        art.geo(hullCapGeo(cfg, 0, vStripe(0), 1, [0, 1], -1), cfg.stripeColor);
      }
      const uOf = (x) => (x - cfg.x0) / (cfg.x1 - cfg.x0);
      return {
        cfg,
        u: uOf,
        deckAt: (x) => cfg.yd(uOf(x)),
        halfAt: (x, y) => {
          const u = uOf(x);
          const yb = cfg.yb(u), yd = cfg.yd(u);
          return hullHalf(cfg, u, (y - yb) / Math.max(0.004, yd - yb));
        },
      };
    }

    /* ====================================================================== *
     * 3.  shared decoration helpers
     * ====================================================================== */
    function railRun(art, pts, h, color) {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        art.box(0.0075, h, 0.0075, p[0], p[1] + h / 2, p[2], color, { bucket: 'metal' });
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        art.strut([a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], 0.0042, color, { bucket: 'metal', seg: 5 });
        art.strut([a[0], a[1] + h * 0.52, a[2]], [b[0], b[1] + h * 0.52, b[2]], 0.0032, color, { bucket: 'metal', seg: 5 });
      }
    }
    function edgeRail(art, hull, xStart, xEnd, side, step, h) {
      const pts = [];
      const n = Math.max(2, Math.round(Math.abs(xEnd - xStart) / step));
      for (let i = 0; i <= n; i++) {
        const x = lerp(xStart, xEnd, i / n);
        const y = hull.deckAt(x) + 0.014;
        const hw = hull.halfAt(x, y);
        pts.push([x, y, side * Math.max(0.045, hw - 0.028)]);
      }
      railRun(art, pts, h, C.rail);
    }
    function bollard(art, x, y, z, color, scale) {
      const s = scale || 1;
      art.box(0.075 * s, 0.014 * s, 0.075 * s, x, y + 0.007 * s, z, color, { bucket: 'metal' });
      art.cyl(0.023 * s, 0.075 * s, x, y + 0.045 * s, z, color, { seg: 8, bucket: 'metal' });
      art.cyl(0.034 * s, 0.016 * s, x, y + 0.086 * s, z, color, { seg: 8, bucket: 'metal' });
    }
    function lifeRing(art, x, y, z, rot) {
      art.torus(0.047, 0.014, x, y, z, C.white, { rot: rot || [Math.PI / 2, 0, 0], rs: 5, ts: 12 });
      art.torus(0.047, 0.014, x, y, z, C.orange, { rot: rot || [Math.PI / 2, 0, 0], scale: [1.02, 1.02, 0.55], rs: 5, ts: 12 });
    }
    function ladder(art, x, y0, y1, z, w, color, rotY) {
      const ry = rotY || 0;
      const dx = Math.cos(ry) * (w / 2), dz = Math.sin(ry) * (w / 2);
      art.strut([x - dx, y0, z - dz], [x - dx, y1, z - dz], 0.006, color, { bucket: 'metal', seg: 5 });
      art.strut([x + dx, y0, z + dz], [x + dx, y1, z + dz], 0.006, color, { bucket: 'metal', seg: 5 });
      const n = Math.max(2, Math.round((y1 - y0) / 0.075));
      for (let i = 1; i < n; i++) {
        const y = lerp(y0, y1, i / n);
        art.strut([x - dx, y, z - dz], [x + dx, y, z + dz], 0.004, color, { bucket: 'metal', seg: 4 });
      }
    }
    function crew(art, x, y, z, jacket, rotY) {
      const ry = rotY || 0;
      const ox = Math.sin(ry) * 0.008, oz = Math.cos(ry) * 0.008;
      art.box(0.026, 0.062, 0.026, x, y + 0.031, z, C.hullDark);
      art.box(0.036, 0.054, 0.024, x + ox, y + 0.088, z + oz, jacket);
      art.sphere(0.0145, x + ox, y + 0.126, z + oz, C.skin || K.shade(pal.plasterWarm, 0.02, 0.0, 0.0), { ws: 8, hs: 6 });
      art.box(0.03, 0.02, 0.012, x + ox, y + 0.148, z + oz, C.iron);
    }

    /* flags ------------------------------------------------------------------ */
    const flagTex = K.texture(K.canvas(192, 112, (ctx2, w, h) => {
      ctx2.fillStyle = '#e7dcc4';
      ctx2.fillRect(0, 0, w, h);
      ctx2.fillStyle = '#2b3d49';
      ctx2.beginPath();
      ctx2.moveTo(0, 0); ctx2.lineTo(w, 0); ctx2.lineTo(w, h * 0.3);
      ctx2.lineTo(0, h * 0.44); ctx2.closePath(); ctx2.fill();
      ctx2.fillStyle = '#a9603f';
      ctx2.beginPath();
      ctx2.moveTo(w * 0.28, h * 0.62);
      ctx2.lineTo(w * 0.36, h * 0.72);
      ctx2.lineTo(w * 0.28, h * 0.82);
      ctx2.lineTo(w * 0.2, h * 0.72);
      ctx2.closePath(); ctx2.fill();
      ctx2.strokeStyle = 'rgba(231,220,196,0.5)';
      ctx2.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx2.beginPath();
        ctx2.moveTo(w * 0.5, h * (0.6 + i * 0.09));
        ctx2.bezierCurveTo(w * 0.66, h * (0.54 + i * 0.09), w * 0.78, h * (0.7 + i * 0.09), w * 0.94, h * (0.62 + i * 0.09));
        ctx2.stroke();
      }
    }));
    function makeFlag(w, h, phase) {
      const segX = 6, segY = 3;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array((segX + 1) * (segY + 1) * 3);
      const uv = new Float32Array((segX + 1) * (segY + 1) * 2);
      const idx = [];
      let k = 0;
      for (let j = 0; j <= segY; j++) {
        for (let i = 0; i <= segX; i++) {
          pos[k * 3] = (i / segX) * w;
          pos[k * 3 + 1] = (j / segY) * h;
          pos[k * 3 + 2] = 0;
          uv[k * 2] = i / segX;
          uv[k * 2 + 1] = j / segY;
          k++;
        }
      }
      for (let j = 0; j < segY; j++) {
        for (let i = 0; i < segX; i++) {
          const a = j * (segX + 1) + i;
          const b = a + 1;
          const c = a + segX + 1;
          const d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        map: flagTex, side: THREE.DoubleSide, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.5,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const base = pos.slice();
      function update(t) {
        const p = geo.attributes.position;
        const arr = p.array;
        for (let i = 0; i < base.length; i += 3) {
          const x = base[i], y = base[i + 1];
          const u = clamp(x / w, 0, 1);
          const v = clamp(y / h, 0, 1);
          arr[i + 2] = Math.sin(u * 4.6 - t * 2.5 + phase) * w * 0.10 * u * (0.4 + 0.6 * v) +
            Math.sin(u * 8.1 - t * 3.7 + phase * 1.7) * w * 0.028 * u;
        }
        p.needsUpdate = true;
      }
      update(0);
      return { mesh, update };
    }

    /* soft wake / contact foam ------------------------------------------------- */
    const foamTex = K.texture(K.canvas(256, 256, (ctx2, w, h) => {
      const g = ctx2.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w * 0.5);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.8, 'rgba(255,255,255,0)');
      g.addColorStop(0.9, 'rgba(255,255,255,0.45)');
      g.addColorStop(0.96, 'rgba(255,255,255,0.7)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2.fillStyle = g;
      ctx2.beginPath();
      ctx2.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
      ctx2.fill();
    }));
    function contactFoamMesh(quads) {
      const pos = [], uv = [], idx = [];
      let vi = 0;
      for (let qi = 0; qi < quads.length; qi++) {
        const q = quads[qi];
        const rot = q.rot || 0;
        const c = Math.cos(rot), s = Math.sin(rot);
        const hw = q.w / 2, hd = q.d / 2;
        const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
        for (let i = 0; i < 4; i++) {
          const lx = corners[i][0], lz = corners[i][1];
          pos.push(q.x + lx * c + lz * s, 0.032, q.z - lx * s + lz * c);
          uv.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1);
        }
        idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
        vi += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const mat = new THREE.MeshBasicMaterial({
        map: foamTex, transparent: true, opacity: 0.24, depthWrite: false,
        color: K.color(K.shade(pal.foam, -0.02, -0.03, 0.0)),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 3;
      mesh.name = 'fleet:contactFoam';
      return mesh;
    }

    /* text sign helpers -------------------------------------------------------- */
    function signMesh(w, h, tex) {
      const geo = new THREE.PlaneGeometry(w, h);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, alphaTest: 0.03, roughness: 0.55,
        metalness: 0.02, side: THREE.FrontSide, envMapIntensity: 0.7,
      });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = false;
      m.receiveShadow = false;
      return m;
    }

    /* ====================================================================== *
     * 4.  THE CONTAINER SHIP — AURORA
     * ====================================================================== */
    const SHIP = {
      cx: 0.6, cz: -2.55,
      x0: -6.8, x1: 6.8,
      halfBeam: 1.25,
      length: 13.6,
    };
    function buildContainerShip() {
      const dyn = new DynMesh();
      const A = new Art(dyn);
      const cfg = {
        x0: SHIP.x0, x1: SHIP.x1, stations: 46, halfBeam: SHIP.halfBeam,
        beamPts: [[0, 0.855], [0.03, 0.90], [0.10, 0.965], [0.22, 0.997], [0.45, 1],
          [0.68, 1], [0.79, 0.992], [0.87, 0.962], [0.93, 0.89], [0.965, 0.735],
          [0.988, 0.42], [1, 0.03]],
        shapePts: [[0, 0.05], [0.055, 0.26], [0.13, 0.52], [0.23, 0.73], [0.34, 0.88],
          [0.47, 0.975], [0.60, 1.0], [0.72, 0.996], [0.84, 0.986], [0.93, 0.974], [1, 0.962]],
        yb: (u) => -0.615 + 0.30 * K.smoothstep(0.20, 0.02, u) + 0.49 * K.smoothstep(0.70, 0.995, u),
        yd: (u) => 0.49 + 0.07 * K.smoothstep(0.63, 0.995, u) + 0.048 * (1 - K.smoothstep(0.03, 0.30, u)),
        flare: (u) => 0.24 * K.smoothstep(0.78, 0.995, u),
        bootTop: 0.055, stripeH: 0.036,
        bootColor: C.boot, hullColor: C.hull, stripeColor: C.stripe,
        deckColor: C.deck, deckCamber: 0.009,
      };
      const hull = buildHull(A, cfg);
      const deckAt = hull.deckAt;
      const halfAt = hull.halfAt;

      /* ---- hull micro-detail ------------------------------------------------ */
      // bulbous bow + stem
      A.ellipsoid(0.36, 0.155, 0.15, 6.55, -0.25, 0, C.boot, { ws: 14, hs: 9 });
      A.box(0.045, 0.5, 0.055, 6.785, 0.28, 0, C.hullDark);
      A.cylX(0.02, 0.7, 6.77, 0.28, 0, C.metal); // stem guard
      // bilge keels
      for (const s of [-1, 1]) {
        A.box(8.7, 0.026, 0.045, -0.4, -0.004, s * 1.228, C.hullDark);
      }
      // rudder, propeller boss, skeg
      A.box(0.07, 0.34, 0.22, -6.86, -0.3, 0, C.underwater);
      A.cylX(0.05, 0.16, -6.7, -0.4, 0, C.iron);
      A.box(0.2, 0.12, 0.5, -6.72, -0.34, 0, C.underwater);
      // draft marks at bow and stern
      for (const side of [-1, 1]) {
        for (const bx of [6.28, -6.22]) {
          for (let k = 0; k < 4; k++) {
            const y = 0.075 + k * 0.062;
            const hw = halfAt(bx, y);
            A.box(0.048, 0.0075, 0.006, bx, y, side * (hw + 0.004), C.stripe, { bucket: 'paint' });
          }
        }
        // Plimsoll mark
        const px = 1.05, py = 0.30;
        const phw = halfAt(px, py);
        A.cylZ(0.052, 0.005, px, py, side * (phw + 0.003), C.stripe, { seg: 12 });
        A.box(0.115, 0.011, 0.006, px, py + 0.006, side * (phw + 0.004), C.orange);
      }
      // hull side seam line (a quiet, elegant model detail)
      for (const side of [-1, 1]) {
        const pts = [];
        for (let x = -6.2; x <= 5.9; x += 0.4) {
          const y = 0.19;
          pts.push([x, y, side * (halfAt(x, y) + 0.002)]);
        }
        for (let i = 0; i < pts.length - 1; i++) {
          A.strut(pts[i], pts[i + 1], 0.0028, C.hullDark, { bucket: 'paint', seg: 4 });
        }
      }

      /* ---- deck furniture -------------------------------------------------- */
      // corrugated shell texture for the containers (one extra draw call, all
      // of the deck cargo is painted with it so every box gets panel lines)
      const corrTex = K.texture(K.canvas(128, 128, (c2, w, h) => {
        c2.fillStyle = '#f2efe9';
        c2.fillRect(0, 0, w, h);
        const stripes = 12;
        for (let i = 0; i < stripes; i++) {
          const x = (i / stripes) * w;
          const sw = w / stripes + 0.6;
          const g = c2.createLinearGradient(x, 0, x + sw, 0);
          g.addColorStop(0, '#b9b4ac');
          g.addColorStop(0.2, '#f7f4ee');
          g.addColorStop(0.55, '#e8e3da');
          g.addColorStop(0.86, '#c1bcb3');
          g.addColorStop(1, '#a8a39b');
          c2.fillStyle = g;
          c2.fillRect(x, 0, sw, h);
        }
        // frame: delineates each container against its neighbours
        c2.strokeStyle = '#8a857d';
        c2.lineWidth = 7;
        c2.strokeRect(3.5, 3.5, w - 7, h - 7);
        c2.fillStyle = '#9a948b';
        c2.fillRect(0, 0, w, 5);
        c2.fillRect(0, h - 5, w, 5);
        // faint weather streaks
        const rr = K.rng(0xc0ffee);
        for (let i = 0; i < 8; i++) {
          c2.fillStyle = 'rgba(96,76,58,' + (0.03 + rr() * 0.05).toFixed(3) + ')';
          c2.fillRect(rr() * w, 8 + rr() * 60, 1 + rr() * 2, h - 20 - rr() * 30);
        }
      }));
      const cargoMat = new THREE.MeshStandardMaterial({
        vertexColors: true, map: corrTex, roughness: 0.62, metalness: 0.04, envMapIntensity: 0.55,
      });
      const cargoDyn = new DynMesh();
      const CA = new Art(cargoDyn);

      // hatch covers + coamings
      const BAYS = [-2.88, -1.48, -0.08, 1.32, 2.72, 4.12];
      const bayLen = 1.18;
      const bayGap = 0.22;
      for (let bi = 0; bi < BAYS.length; bi++) {
        const bx = BAYS[bi];
        const dy = deckAt(bx);
        A.box(bayLen + 0.17, 0.02, 2.12, bx, dy + 0.022, 0, C.hatchDark);
        A.box(bayLen + 0.07, 0.045, 2.05, bx, dy + 0.05, 0, C.hatch);
        for (const s of [-0.68, 0, 0.68]) {
          A.box(bayLen + 0.06, 0.006, 0.006, bx, dy + 0.077, s, C.hatchDark);
        }
      }
      // lashing bridges over the bay gaps, with rails and corner posts
      for (let gi = 0; gi < BAYS.length - 1; gi++) {
        const bx = BAYS[gi] + (bayLen + bayGap) / 2;
        const dy = deckAt(bx);
        A.box(0.2, 0.02, 2.16, bx, dy + 0.52, 0, C.metal);
        A.box(0.2, 0.012, 0.035, bx, dy + 0.565, 1.06, C.rail);
        A.box(0.2, 0.012, 0.035, bx, dy + 0.565, -1.06, C.rail);
        for (const s of [-1, 1]) {
          A.box(0.045, 0.52, 0.045, bx, dy + 0.26, s * 1.09, C.metal);
          A.box(0.02, 0.05, 0.02, bx, dy + 0.545, s * 1.06, C.rail, { bucket: 'metal' });
        }
        // lashing rods hinting at the stack lashings
        for (const s of [-1, 1]) {
          A.strut([bx, dy + 0.53, s * 1.02], [bx + 0.18, dy + 0.84, s * 0.8], 0.004, C.metal, { seg: 3, bucket: 'metal' });
        }
      }
      // deck containers, corrugated
      const stackZ = [];
      for (let i = 0; i < 8; i++) stackZ.push((i - 3.5) * 0.253);
      const tierBase = [1.9, 2.6, 2.2, 2.9, 2.3, 1.7];
      for (let bi = 0; bi < BAYS.length; bi++) {
        const bx = BAYS[bi];
        const dy = deckAt(bx);
        for (let si = 0; si < stackZ.length; si++) {
          let tiers = Math.round(tierBase[bi] + (rand() - 0.5) * 1.2);
          tiers = clamp(tiers, 1, 4);
          for (let t = 0; t < tiers; t++) {
            const white = rand() < 0.08;
            const col = white ? REEFER : K.vary(CONTAINER_COLS[(rand() * CONTAINER_COLS.length) | 0], rand, { l: 0.03, s: 0.05, h: 0.015 });
            CA.box(1.16, 0.259, 0.244, bx, dy + 0.075 + 0.1295 + t * 0.265, stackZ[si], col);
          }
        }
      }
      const cargoGroup = cargoDyn.build('ship:cargo', null, { paint: cargoMat });

      // ---- accommodation block --------------------------------------------
      const HX0 = -6.14, HX1 = -4.14, HZ = 1.0;
      const houseBase = 0.49, levelH = 0.285;
      for (let k = 0; k < 4; k++) {
        const y0 = houseBase + k * levelH;
        A.box(HX1 - HX0, levelH, HZ * 2, (HX0 + HX1) / 2, y0 + levelH / 2, 0, C.house);
        A.box(HX1 - HX0 + 0.03, 0.016, HZ * 2 + 0.034, (HX0 + HX1) / 2, y0 + levelH, 0, C.trim);
        A.box(HX1 - HX0 + 0.012, 0.009, HZ * 2 + 0.014, (HX0 + HX1) / 2, y0 + levelH - 0.012, 0, C.hullDark);
        // side windows — a dense ribbon, broken by cream mullions
        for (const side of [-1, 1]) {
          for (let wi = 0; wi < 10; wi++) {
            const wx = -6.01 + wi * 0.201;
            const lit = rand() < 0.15;
            A.box(0.152, 0.085, 0.012, wx, y0 + 0.168, side * (HZ + 0.007),
              lit ? C.lampGlass : C.glass, { bucket: lit ? 'lamp' : 'glass' });
            A.box(0.162, 0.012, 0.02, wx, y0 + 0.218, side * (HZ + 0.009), C.trim);
            A.box(0.162, 0.01, 0.016, wx, y0 + 0.118, side * (HZ + 0.008), C.houseShade);
          }
        }
        // front + rear windows
        for (let wi = 0; wi < 5; wi++) {
          const wz = -0.78 + wi * 0.39;
          const lit = rand() < 0.14;
          A.box(0.012, 0.072, 0.14, HX1 + 0.006, y0 + 0.165, wz,
            lit ? C.lampGlass : C.glass, { bucket: lit ? 'lamp' : 'glass' });
          if (wi < 3) {
            const rl = rand() < 0.12;
            A.box(0.012, 0.068, 0.13, HX0 - 0.006, y0 + 0.165, wz,
              rl ? C.lampGlass : C.glass, { bucket: rl ? 'lamp' : 'glass' });
          }
        }
      }
      // fire escapes / ladders on the house sides
      for (const side of [-1, 1]) {
        ladder(A, -5.7, 0.52, 1.62, side * (HZ + 0.05), 0.17, C.rail, 0);
        lifeRing(A, -5.12, 1.02, side * (HZ + 0.06), [Math.PI / 2, 0, 0]);
        lifeRing(A, -4.86, 1.28, side * (HZ + 0.06), [Math.PI / 2, 0, 0]);
      }
      // house doors
      A.box(0.03, 0.17, 0.09, HX1 + 0.02, houseBase + 0.09, 0.62, C.trim);
      A.box(0.03, 0.17, 0.09, HX1 + 0.02, houseBase + 0.09, -0.62, C.trim);

      // ---- bridge ----------------------------------------------------------
      const BRX0 = -4.46, BRX1 = -4.10, BRZ = 1.03;
      const bridgeY = 1.63;
      A.box(BRX1 - BRX0, 0.30, BRZ * 2, (BRX0 + BRX1) / 2, bridgeY + 0.15, 0, C.house);
      A.box(BRX1 - BRX0 + 0.06, 0.02, BRZ * 2 + 0.06, (BRX0 + BRX1) / 2, bridgeY + 0.30, 0, C.trim);
      // front glass band + mullions
      A.box(0.014, 0.105, 1.94, BRX1 + 0.006, bridgeY + 0.19, 0, C.glass, { bucket: 'glass' });
      for (let i = 0; i <= 6; i++) {
        const wz = -0.925 + i * (1.85 / 6);
        A.box(0.02, 0.105, 0.016, BRX1 + 0.012, bridgeY + 0.19, wz, C.trim);
      }
      // side windows
      for (const side of [-1, 1]) {
        A.box(0.32, 0.095, 0.014, -4.26, bridgeY + 0.19, side * (BRZ + 0.006), C.glass, { bucket: 'glass' });
        // bridge wings
        A.box(0.34, 0.035, 0.30, -4.27, bridgeY + 0.015, side * 1.185, C.house);
        A.box(0.32, 0.07, 0.24, -4.27, bridgeY + 0.07, side * 1.19, C.houseShade);
        A.box(0.18, 0.03, 0.18, -4.27, bridgeY + 0.12, side * 1.2, C.iron);
        // wing railing
        railRun(A, [
          [-4.42, bridgeY + 0.02, side * 1.33],
          [-4.12, bridgeY + 0.02, side * 1.33],
        ], 0.09, C.rail);
        railRun(A, [
          [-4.42, bridgeY + 0.02, side * 1.05],
          [-4.42, bridgeY + 0.02, side * 1.33],
        ], 0.09, C.rail);
        // searchlight
        A.cylX(0.032, 0.06, -4.02, bridgeY + 0.1, side * 1.19, C.iron);
        A.sphere(0.023, -3.985, bridgeY + 0.1, side * 1.19, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
        // navigation light: red to port (-z), green to starboard (+z)
        A.sphere(0.022, -4.06, bridgeY + 0.09, side * 1.33, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
        A.cyl(0.012, 0.03, -4.06, bridgeY + 0.035, side * 1.33, C.iron, { seg: 6 });
      }
      // bridge roof / monkey island
      A.box(0.52, 0.026, 2.18, -4.27, bridgeY + 0.313, 0, C.trim);
      for (const side of [-1, 1]) {
        for (const dx of [-0.16, 0.04]) {
          A.box(0.012, 0.06, 0.012, -4.27 + dx, bridgeY + 0.35, side * 1.06, C.rail, { bucket: 'metal' });
        }
        A.box(0.24, 0.01, 0.012, -4.27, bridgeY + 0.38, side * 1.06, C.rail, { bucket: 'metal' });
      }
      // life raft canisters on the house roof
      for (const side of [-1, 1]) {
        A.cylX(0.055, 0.34, -5.0, 1.72, side * 0.8, C.white, { seg: 10 });
        A.box(0.36, 0.03, 0.04, -5.0, 1.68, side * 0.8, C.metal);
      }

      // ---- funnel ----------------------------------------------------------
      const FX = -5.42;
      A.box(0.42, 0.03, 0.58, FX, 1.645, 0, C.trim);
      A.taper(0.34, 0.52, 0.3, 0.46, 0.96, FX, 1.66, 0, C.hull);
      A.box(0.312, 0.12, 0.474, FX, 2.56, 0, C.stripe);
      A.box(0.30, 0.02, 0.455, FX, 2.625, 0, C.hullDark);
      // exhaust
      A.cyl(0.055, 0.24, FX + 0.04, 2.74, 0.06, C.iron, { seg: 10 });
      A.cyl(0.062, 0.035, FX + 0.04, 2.865, 0.06, C.metal, { seg: 10 });
      A.cyl(0.035, 0.19, FX - 0.05, 2.7, -0.1, C.iron, { seg: 8 });
      // steam pipe
      A.strut([FX + 0.16, 1.7, 0.19], [FX + 0.16, 2.42, 0.19], 0.018, C.metal, { seg: 6 });
      // funnel emblem
      const emblemTex = K.texture(K.canvas(256, 288, (ctx2, w, h) => {
        ctx2.clearRect(0, 0, w, h);
        ctx2.strokeStyle = 'rgba(233,222,200,0.92)';
        ctx2.lineWidth = 7;
        ctx2.beginPath();
        ctx2.arc(w / 2, 116, 72, 0, Math.PI * 2);
        ctx2.stroke();
        // aurora star
        ctx2.fillStyle = 'rgba(233,222,200,0.95)';
        ctx2.beginPath();
        const sx = w / 2, sy = 96;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? 40 : 13;
          const px = sx + Math.cos(a) * r, py = sy + Math.sin(a) * r;
          if (i === 0) ctx2.moveTo(px, py); else ctx2.lineTo(px, py);
        }
        ctx2.closePath();
        ctx2.fill();
        // waves
        ctx2.strokeStyle = 'rgba(233,222,200,0.9)';
        ctx2.lineWidth = 5;
        for (let r2 = 0; r2 < 3; r2++) {
          ctx2.beginPath();
          const y = 158 + r2 * 13;
          ctx2.moveTo(w / 2 - 52, y);
          ctx2.bezierCurveTo(w / 2 - 26, y - 10, w / 2 + 26, y + 10, w / 2 + 52, y);
          ctx2.stroke();
        }
        ctx2.fillStyle = 'rgba(233,222,200,0.95)';
        ctx2.font = '600 25px ' + K.fonts.sans;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText('AURORA LINE', w / 2, 246);
      }));
      const emblemMat = new THREE.MeshStandardMaterial({
        map: emblemTex, transparent: true, alphaTest: 0.03, roughness: 0.5,
        metalness: 0.02, side: THREE.FrontSide, envMapIntensity: 0.7,
      });
      for (const side of [-1, 1]) {
        const em = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.315), emblemMat);
        em.position.set(FX, 2.33, side * 0.245);
        if (side < 0) em.rotation.y = Math.PI;
        emblemMeshes.push(em);
      }

      // ---- radar mast ------------------------------------------------------
      const MX = -4.32, mastBase = bridgeY + 0.32;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          A.strut([MX + sx * 0.055, mastBase, sz * 0.055], [MX + sx * 0.02, mastBase + 0.78, sz * 0.02], 0.008, C.metal, { seg: 5 });
        }
      }
      for (let i = 1; i <= 3; i++) {
        const y = mastBase + i * 0.19;
        A.box(0.115, 0.008, 0.008, MX, y, -0.043, C.metal);
        A.box(0.115, 0.008, 0.008, MX, y, 0.043, C.metal);
        A.box(0.008, 0.008, 0.095, MX, y, 0, C.metal);
      }
      A.box(0.3, 0.024, 0.3, MX, mastBase + 0.55, 0, C.metal);
      A.cyl(0.014, 0.62, MX, mastBase + 0.93, 0, C.metal, { seg: 8 });
      // S-band antenna + satcom dome
      A.box(0.05, 0.14, 0.05, MX + 0.11, mastBase + 0.63, 0, C.iron);
      A.box(0.1, 0.02, 0.03, MX + 0.11, mastBase + 0.71, 0, C.metal);
      A.sphere(0.075, MX - 0.08, mastBase + 0.66, -0.1, C.white, { ws: 10, hs: 7 });
      // whip antennas
      A.strut([MX, mastBase + 0.95, 0], [MX - 0.16, mastBase + 1.32, 0.05], 0.005, C.metal, { seg: 4 });
      A.strut([MX, mastBase + 0.95, 0], [MX + 0.14, mastBase + 1.28, -0.06], 0.005, C.metal, { seg: 4 });
      // masthead lamp + nav lights
      A.sphere(0.02, MX, mastBase + 1.26, 0, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
      A.sphere(0.018, MX + 0.06, mastBase + 0.36, 0.055, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
      // spinning radar (separate group)
      const radarDyn = new DynMesh();
      const RA = new Art(radarDyn);
      RA.box(0.5, 0.022, 0.05, 0, 0, 0, C.metal);
      RA.box(0.055, 0.05, 0.075, 0.245, 0.0, 0, C.iron);
      RA.box(0.055, 0.05, 0.075, -0.245, 0.0, 0, C.iron);
      RA.cyl(0.03, 0.05, 0, -0.02, 0, C.iron, { seg: 8 });
      const radar = radarDyn.build('ship:radar');
      radar.name = 'ship:radar';
      radar.position.set(MX, mastBase + 0.6, 0);

      // ---- lifeboats + davits ---------------------------------------------
      for (const side of [-1, 1]) {
        const bx = -5.28, bz = side * 1.26;
        A.capsule(0.064, 0.36, bx, 0.70, bz, C.white, { rot: [0, 0, Math.PI / 2], cs: 5, rs: 6 });
        A.box(0.4, 0.03, 0.116, bx, 0.742, bz, C.orange);
        A.box(0.34, 0.016, 0.012, bx, 0.716, bz + 0.062, C.glass, { bucket: 'glass' });
        A.box(0.34, 0.016, 0.012, bx, 0.716, bz - 0.062, C.glass, { bucket: 'glass' });
        A.box(0.028, 0.05, 0.018, bx + 0.31, 0.72, bz, C.iron);
        // davits
        for (const dx of [-0.28, 0.28]) {
          A.strut([bx + dx, deckAt(bx) + 0.02, side * 0.94], [bx + dx, 1.52, side * 0.94], 0.016, C.metal, { seg: 6 });
          A.strut([bx + dx, 1.52, side * 0.94], [bx + dx, 1.60, side * 1.31], 0.014, C.metal, { seg: 6 });
          A.strut([bx + dx, 1.60, side * 1.31], [bx + dx, 1.24, side * 1.32], 0.005, C.rope, { seg: 4 });
        }
      }

      // ---- forecastle ------------------------------------------------------
      // breakwater: a curved plate across the deck
      for (let k = -3; k <= 3; k++) {
        const z = k * 0.3;
        const x = 5.24 + Math.abs(k) * 0.055;
        A.box(0.028, 0.175, 0.32, x, deckAt(x) + 0.088, z, C.hullDark, { rot: [0, -k * 0.19, 0] });
      }
      // windlass, chain stoppers and chain runs to the hawse pipes
      const wlx = 5.78, wly = deckAt(wlx);
      A.box(0.32, 0.09, 0.34, wlx, wly + 0.055, 0, C.iron);
      A.cylZ(0.062, 0.26, wlx + 0.02, wly + 0.13, 0, C.metal, { seg: 10 });
      A.cylZ(0.048, 0.2, wlx - 0.1, wly + 0.13, 0, C.metal, { seg: 8 });
      A.box(0.1, 0.06, 0.1, wlx + 0.16, wly + 0.04, 0.2, C.rust);
      for (const side of [-1, 1]) {
        const hx = 6.3, hy = 0.25;
        const hw = halfAt(hx, hy);
        A.box(0.09, 0.045, 0.07, 5.98, deckAt(5.98) + 0.075, side * 0.44, C.iron);
        A.strut([5.9, deckAt(5.98) + 0.06, side * 0.42], [hx - 0.05, hy + 0.09, side * (hw - 0.06)], 0.013, C.iron, { seg: 5 });
        A.cylZ(0.06, 0.06, hx, hy, side * (hw - 0.004), C.iron, { seg: 10 });
        A.cylZ(0.042, 0.02, hx, hy, side * (hw + 0.026), C.hullDark, { seg: 8 });
        // stowed anchor: shank, stock, crown and flukes
        const ax = 6.22, az = side * (hw + 0.022);
        A.box(0.028, 0.2, 0.032, ax, hy - 0.055, az, C.iron);
        A.box(0.17, 0.026, 0.03, ax, hy + 0.055, az, C.iron);
        A.box(0.032, 0.032, 0.14, ax - 0.03, hy - 0.15, az, C.iron);
        A.box(0.026, 0.1, 0.04, ax - 0.055, hy - 0.135, az, C.iron, { rot: [0.55, 0, 0] });
        A.box(0.026, 0.1, 0.04, ax - 0.005, hy - 0.135, az, C.iron, { rot: [-0.55, 0, 0] });
      }
      // forward mooring winch
      A.box(0.24, 0.09, 0.3, 5.44, deckAt(5.44) + 0.05, 0.4, C.iron);
      A.cylZ(0.055, 0.2, 5.44, deckAt(5.44) + 0.13, 0.4, C.metal, { seg: 8 });
      A.cylZ(0.035, 0.16, 5.55, deckAt(5.55) + 0.13, 0.4, C.metal, { seg: 8 });
      // deck lockers with dark lids, vents, hydrants, chain-locker hatch
      for (const side of [-1, 1]) {
        A.box(0.2, 0.13, 0.24, 5.5, deckAt(5.5) + 0.065, side * 0.88, C.houseShade);
        A.box(0.21, 0.015, 0.25, 5.5, deckAt(5.5) + 0.132, side * 0.88, C.trim);
        A.box(0.05, 0.028, 0.05, 5.5, deckAt(5.5) + 0.148, side * 0.88, C.iron);
        A.cyl(0.026, 0.14, 6.58, deckAt(6.58) + 0.07, side * 0.36, C.hullDark, { seg: 8 });
        A.sphere(0.032, 6.58, deckAt(6.58) + 0.145, side * 0.36, C.iron, { ws: 8, hs: 5 });
      }
      A.box(0.3, 0.08, 0.3, 5.94, deckAt(5.94) + 0.04, 0, C.hatchDark);
      A.cyl(0.022, 0.09, 5.98, deckAt(5.98) + 0.1, 0.3, C.rust, { seg: 8 });
      A.cyl(0.022, 0.09, 5.98, deckAt(5.98) + 0.1, -0.3, C.rust, { seg: 8 });
      for (const side of [-1, 1]) {
        bollard(A, 5.22, deckAt(5.22), side * 0.7, C.iron);
        bollard(A, 6.34, deckAt(6.34), side * 0.44, C.iron);
      }
      A.cyl(0.045, 0.12, 5.34, deckAt(5.34) + 0.06, 0, C.iron, { seg: 8 });
      // foremast with a yard, a deck floodlight and rigging
      const FXM = 6.05;
      A.cyl(0.014, 0.9, FXM, deckAt(FXM) + 0.45, 0, C.metal, { seg: 6 });
      A.box(0.02, 0.02, 0.36, FXM, deckAt(FXM) + 0.66, 0, C.metal);
      A.sphere(0.018, FXM, deckAt(FXM) + 0.92, 0, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
      A.sphere(0.014, FXM + 0.02, deckAt(FXM) + 0.4, 0.1, C.lamp, { bucket: 'lamp', ws: 6, hs: 4 });
      A.strut([FXM, deckAt(FXM) + 0.86, 0], [FXM - 0.12, deckAt(FXM) + 0.1, 0.78], 0.004, C.metal, { seg: 4 });
      A.strut([FXM, deckAt(FXM) + 0.86, 0], [FXM - 0.12, deckAt(FXM) + 0.1, -0.78], 0.004, C.metal, { seg: 4 });

      // ---- poop deck -------------------------------------------------------
      const pd = deckAt(-6.45);
      A.box(0.36, 0.28, 0.74, -6.48, pd + 0.14, 0, C.houseShade);
      A.box(0.05, 0.16, 0.09, -6.29, pd + 0.09, 0.12, C.trim);
      A.box(0.2, 0.08, 0.24, -6.34, pd + 0.04, -0.42, C.iron);
      A.cylZ(0.055, 0.2, -6.34, pd + 0.11, -0.42, C.metal, { seg: 8 });
      A.cyl(0.055, 0.12, -6.56, pd + 0.06, 0.52, C.iron, { seg: 8 });
      for (const side of [-1, 1]) {
        bollard(A, -6.22, pd, side * 0.55, C.iron);
        bollard(A, -6.64, pd, side * 0.4, C.iron);
      }
      // stern flag staff
      A.cyl(0.008, 0.82, -6.74, pd + 0.41, 0, C.brass, { seg: 6 });

      // ---- deck railings ---------------------------------------------------
      edgeRail(A, hull, -6.62, 5.12, 1, 0.3, 0.1);
      edgeRail(A, hull, -6.62, 5.12, -1, 0.3, 0.1);
      edgeRail(A, hull, 5.28, 6.6, 1, 0.3, 0.1);
      edgeRail(A, hull, 5.28, 6.6, -1, 0.3, 0.1);
      // stern rail
      {
        const x = -6.66, y = deckAt(x) + 0.014, hw = hull.halfAt(x, y) - 0.03;
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const z = -hw + (2 * hw) * (i / 8);
          pts.push([x, y, z]);
        }
        railRun(A, pts, 0.1, C.rail);
      }

      // ---- deck lights, pipes, vents, bollards -----------------------------
      for (let i = 0; i < 5; i++) {
        const lx = -3.4 + i * 2.05;
        for (const side of [-1, 1]) {
          const y = deckAt(lx);
          const hw = hull.halfAt(lx, y) - 0.1;
          A.cyl(0.008, 0.17, lx, y + 0.085, side * hw, C.metal, { seg: 6 });
          A.box(0.05, 0.03, 0.05, lx, y + 0.185, side * hw, C.iron);
          A.sphere(0.021, lx, y + 0.172, side * (hw + 0.004), C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
        }
      }
      // fire main
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const xa = -6.0 + i * 3.7, xb = xa + 3.7;
          A.strut([xa, deckAt(xa) + 0.055, side * 1.0], [xb, deckAt(xb) + 0.055, side * 1.0], 0.011, C.rust, { seg: 5 });
        }
      }
      // mushroom vents and deck bollards
      for (const lx of [-5.9, -3.0, 1.6, 4.6]) {
        for (const side of [-1, 1]) {
          const y = deckAt(lx);
          const hw = hull.halfAt(lx, y) - 0.22;
          A.cyl(0.03, 0.075, lx, y + 0.04, side * hw, C.houseShade, { seg: 8 });
          A.sphere(0.038, lx, y + 0.09, side * hw, C.metal, { ws: 8, hs: 5 });
        }
      }
      for (const lx of [-6.15, -2.0, 2.0, 5.2]) {
        for (const side of [-1, 1]) {
          bollard(A, lx, deckAt(lx), side * 0.9, C.iron, 1.15);
        }
      }
      // crew figures
      crew(A, -4.24, bridgeY + 0.03, 1.18, C.orange, -Math.PI / 2);
      crew(A, 5.6, deckAt(5.6) + 0.02, -0.35, C.hullDark, 0.4);
      crew(A, -6.42, deckAt(-6.42) + 0.02, 0.22, C.orange, 0.9);

      /* ---- name signs (canvas textures) ----------------------------------- */
      const nameTex = K.textTexture({
        width: 640, height: 144,
        lines: [{ text: 'AURORA', size: 92, font: K.fonts.sans, color: '#ecdfc6', weight: 700, spacing: 16 }],
      });
      const sternTex = K.textTexture({
        width: 640, height: 128,
        lines: [{ text: 'PORT AURORA', size: 62, font: K.fonts.sans, color: '#ecdfc6', weight: 600, spacing: 6 }],
      });
      const signs = [];
      for (const side of [-1, 1]) {
        const nx = 4.9, ny = 0.325;
        const hw = halfAt(nx, ny);
        const e = 0.02;
        const slope = (halfAt(nx + e, ny) - halfAt(nx - e, ny)) / (2 * e);
        const nX = -slope, nZ = side;
        const rotY = Math.atan2(nX, nZ);
        const nm = signMesh(0.92, 0.207, nameTex);
        nm.position.set(nx, ny, side * (hw + 0.008));
        nm.rotation.y = rotY;
        signs.push(nm);
      }
      // stern name on the transom
      const st = signMesh(0.8, 0.16, sternTex);
      st.position.set(SHIP.x0 - 0.008, 0.36, 0);
      st.rotation.y = -Math.PI / 2;
      signs.push(st);

      /* ---- assemble -------------------------------------------------------- */
      const root = new THREE.Group();
      root.name = 'ship:aurora';
      root.position.set(SHIP.cx, 0, SHIP.cz);
      root.rotation.order = 'YXZ';
      const model = new THREE.Group();
      model.name = 'ship:aurora-model';
      root.add(model);
      dyn.build('ship', model);
      model.add(cargoGroup);
      model.add(radar);
      for (const s of signs) model.add(s);
      for (const em of emblemMeshes) model.add(em);
      // flags
      const sternFlag = makeFlag(0.34, 0.2, 0.4);
      sternFlag.mesh.position.set(-6.74, 1.15, 0);
      sternFlag.mesh.rotation.y = Math.PI;
      model.add(sternFlag.mesh);
      const mastFlag = makeFlag(0.26, 0.155, 2.1);
      mastFlag.mesh.position.set(MX, mastBase + 1.0, 0);
      mastFlag.mesh.rotation.y = Math.PI * 0.5;
      model.add(mastFlag.mesh);
      scene.add(root);

      // contact foam
      foamQuads.push({ x: SHIP.cx, z: SHIP.cz, w: 13.85, d: 2.75, rot: 0 });

      return {
        root, model, radar, flags: [sternFlag, mastFlag], hull,
        mastTop: mastBase + 1.32,
        funnelTop: 2.9,
      };
    }
    const emblemMeshes = [];
    const foamQuads = [];
    const ship = buildContainerShip();

    /* ====================================================================== *
     * 5.  MOORINGS — 6 lines to the quay, rubber fenders, rat guards
     * ====================================================================== */
    function quayBollards() {
      const out = [];
      const push = (v) => {
        if (!v) return;
        if (Array.isArray(v) && typeof v[0] === 'number') out.push([v[0], v[1], v[2]]);
        else if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) push(v[i]); }
        else if (v.pos) push(v.pos);
        else if (v.positions) push(v.positions);
        else if (v.points) push(v.points);
        else if (v.x != null) out.push([v.x, v.y == null ? 1.3 : v.y, v.z]);
      };
      push(P.anchors && P.anchors.quayBollards);
      if (!out.length) {
        for (const x of [-5.5, -1.5, 2.5, 6.5]) out.push([x, 1.3, -4.55]);
      }
      return out;
    }
    function buildMoorings() {
      const bollards = quayBollards();
      const hasAnchor = !!(P.anchors && P.anchors.quayBollards);
      if (!hasAnchor) {
        for (let i = 0; i < bollards.length; i++) {
          const b = bollards[i];
          B.add(K.geoBox(), C.iron, { pos: [b[0], 1.112, b[2]], scale: [0.2, 0.024, 0.2] });
          B.add(K.geoCyl(10), C.iron, { pos: [b[0], 1.22, b[2]], scale: [0.045, 0.2, 0.045] });
          B.add(K.geoCyl(10), C.iron, { pos: [b[0], 1.328, b[2]], scale: [0.072, 0.032, 0.072] });
        }
      }
      const pick = (x) => {
        let best = bollards[0];
        let bd = Infinity;
        for (let i = 0; i < bollards.length; i++) {
          const d = Math.abs(bollards[i][0] - x);
          if (d < bd) { bd = d; best = bollards[i]; }
        }
        return best;
      };
      const deckZ = -3.72;
      const lines = [
        { lx: 5.62, to: 6.5, sag: 0.03 },
        { lx: 5.18, to: 2.5, sag: 0.075 },
        { lx: 3.05, to: 2.5, sag: 0.035 },
        { lx: -3.0, to: -1.5, sag: 0.035 },
        { lx: -4.86, to: -1.5, sag: 0.075 },
        { lx: -5.78, to: -5.5, sag: 0.03 },
      ];
      const ropes = [];
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const a = [SHIP.cx + ln.lx, ship.hull.deckAt(ln.lx) + 0.07, deckZ];
        const b = pick(ln.to);
        K.rope(a, b, ln.sag, 0.011, C.rope, { segments: 14, radial: 5 });
        ropes.push([a, b]);
      }
      // rat guards on the two long springs
      for (const ri of [1, 4]) {
        const a = ropes[ri][0], b = ropes[ri][1];
        const t = 0.7;
        const px = lerp(a[0], b[0], t), py = lerp(a[1], b[1], t), pz = lerp(a[2], b[2], t);
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)
        );
        B.add(K.geoCyl(12), C.trim, { quat: q, pos: [px, py, pz], scale: [0.085, 0.006, 0.085] });
      }
      // black rubber fenders in the hull/quay gap
      for (const fx of [-4.4, -2.4, -0.4, 1.6, 3.6, 5.4]) {
        const wy = 0.075;
        B.add(K.geoCapsule(0.125, 0.46, 5, 6), C.rubber, {
          pos: [SHIP.cx + fx, wy, -4.02], rot: [0, 0, Math.PI / 2],
        });
        K.rope(
          [SHIP.cx + fx, ship.hull.deckAt(fx) + 0.03, -3.73],
          [SHIP.cx + fx, wy + 0.14, -4.0], 0.012, 0.006, C.rope, { segments: 6, radial: 4 }
        );
      }
      // hanging cylindrical fenders along the hull side
      for (const fx of [-3.2, 0.2, 3.4]) {
        const top = ship.hull.deckAt(fx) + 0.06;
        B.add(K.geoCyl(8), C.rubber, {
          pos: [SHIP.cx + fx, 0.22, -3.79], scale: [0.07, 0.62, 0.07],
        });
        K.rope([SHIP.cx + fx, top, -3.74], [SHIP.cx + fx, 0.53, -3.79], 0.01, 0.005, C.rope, { segments: 4, radial: 4 });
      }
    }
    buildMoorings();

    /* ====================================================================== *
     * 6a.  the harbour tug MISTRAL
     * ====================================================================== */
    function vesselToWorld(rx, rz, heading, mx, my, mz) {
      // model frame: canonical bow = +x; the model group is rotated -90°, so a
      // model point (mx,my,mz) becomes root-space (-mz, my, mx)
      const ax = -mz, az = mx;
      const c = Math.cos(heading), s = Math.sin(heading);
      return [rx + ax * c + az * s, my, rz - ax * s + az * c];
    }

    function buildTug() {
      const T = { x: 5.85, z: 4.95, heading: -0.9 };
      const dyn = new DynMesh();
      const A = new Art(dyn);
      const cfg = {
        x0: -1.5, x1: 1.5, stations: 32, halfBeam: 0.56,
        beamPts: [[0, 0.84], [0.05, 0.93], [0.16, 1], [0.70, 1], [0.84, 0.96],
          [0.92, 0.85], [0.975, 0.55], [1, 0.05]],
        shapePts: [[0, 0.12], [0.10, 0.50], [0.20, 0.78], [0.32, 0.92], [0.46, 0.985],
          [0.60, 1], [0.75, 0.995], [0.88, 0.975], [1, 0.95]],
        yb: (u) => -0.215 + 0.055 * K.smoothstep(0.82, 1, u) + 0.02 * K.smoothstep(0.12, 0, u),
        yd: (u) => 0.235 + 0.085 * K.smoothstep(0.5, 1, u) + 0.02 * (1 - K.smoothstep(0, 0.25, u)),
        flare: (u) => 0.1 * K.smoothstep(0.8, 0.99, u),
        bootTop: 0.045, stripeH: 0.03,
        bootColor: K.shade(pal.hullRed, -0.13, -0.05),
        hullColor: K.shade(pal.hullRed, -0.01, -0.015),
        stripeColor: K.shade(pal.shipCream, 0.02, -0.01),
        deckColor: K.shade(pal.wood, 0.10, -0.03),
        deckCamber: 0.007,
      };
      const hull = buildHull(A, cfg);
      const deckAt = hull.deckAt, halfAt = hull.halfAt;

      // rub rail + bulwark
      for (const side of [-1, 1]) {
        for (let x = -1.32; x < 1.3; x += 0.22) {
          const y = deckAt(x + 0.11);
          const z = side * (halfAt(x + 0.11, y) - 0.006);
          A.box(0.228, 0.07, 0.026, x + 0.11, y + 0.035, z, C.cream);
          A.box(0.228, 0.014, 0.05, x + 0.11, y + 0.076, z, C.woodDark);
          A.box(0.228, 0.03, 0.03, x + 0.11, y + 0.005, z * 1.01, C.hullDark);
        }
      }
      // tyre fenders all round
      const tyreXs = [-1.16, -0.8, -0.42, -0.04, 0.34, 0.72, 1.1];
      for (const side of [-1, 1]) {
        for (let i = 0; i < tyreXs.length; i++) {
          const tx = tyreXs[i];
          A.torus(0.05, 0.016, tx, 0.078, side * (halfAt(tx, 0.078) + 0.017), C.rubber, { rs: 5, ts: 12 });
        }
      }
      A.torus(0.055, 0.018, -1.47, 0.16, 0, C.rubber, { rot: [0, Math.PI / 2, 0], rs: 5, ts: 12 });

      // wheelhouse
      const WHX0 = -0.02, WHX1 = 0.78, WHZ = 0.42;
      A.taper(WHX1 - WHX0, WHZ * 2, WHX1 - WHX0 - 0.05, WHZ * 2 - 0.04, 0.56,
        (WHX0 + WHX1) / 2, 0.255, 0, C.house);
      // front windscreen
      A.box(0.014, 0.105, 0.68, WHX1 - 0.008, 0.625, 0, C.glass, { bucket: 'glass' });
      for (let i = 0; i < 4; i++) {
        const wz = -0.28 + i * 0.187;
        A.box(0.02, 0.105, 0.014, WHX1 - 0.002, 0.625, wz, C.trim);
      }
      // side windows
      for (const side of [-1, 1]) {
        A.box(0.58, 0.1, 0.014, 0.39, 0.625, side * (WHZ + 0.003), C.glass, { bucket: 'glass' });
        A.box(0.02, 0.1, 0.018, 0.12, 0.625, side * (WHZ + 0.006), C.trim);
        A.box(0.018, 0.1, 0.018, 0.33, 0.625, side * (WHZ + 0.006), C.trim);
        A.box(0.018, 0.1, 0.018, 0.55, 0.625, side * (WHZ + 0.006), C.trim);
        A.box(0.02, 0.1, 0.018, 0.66, 0.625, side * (WHZ + 0.006), C.trim);
        // door
        A.box(0.005, 0.17, 0.1, 0.06, 0.34, side * (WHZ + 0.002), C.cream);
      }
      // roof
      A.box(WHX1 - WHX0 + 0.09, 0.024, WHZ * 2 + 0.09, (WHX0 + WHX1) / 2 + 0.01, 0.832, 0, C.trim);
      // roof railing
      railRun(A, [
        [WHX0 + 0.02, 0.845, -WHZ - 0.03], [WHX1 - 0.02, 0.845, -WHZ - 0.03],
      ], 0.06, C.rail);
      railRun(A, [
        [WHX0 + 0.02, 0.845, WHZ + 0.03], [WHX1 - 0.02, 0.845, WHZ + 0.03],
      ], 0.06, C.rail);
      railRun(A, [
        [WHX1 - 0.02, 0.845, -WHZ - 0.03], [WHX1 - 0.02, 0.845, WHZ + 0.03],
      ], 0.06, C.rail);
      // fire monitor on the roof
      A.cyl(0.026, 0.055, 0.68, 0.852, 0.06, C.orange, { seg: 8 });
      A.strut([0.68, 0.875, 0.06], [0.72, 0.945, 0.06], 0.019, C.orange, { seg: 6 });
      A.strut([0.72, 0.945, 0.06], [0.78, 0.96, 0.06], 0.013, C.iron, { seg: 6 });
      // searchlight
      A.cylX(0.03, 0.05, 0.1, 0.875, 0.22, C.iron, { seg: 8 });
      A.sphere(0.02, 0.128, 0.875, 0.22, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
      // nav lights
      A.sphere(0.014, WHX1 - 0.02, 0.7, -WHZ - 0.012, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
      A.sphere(0.014, WHX1 - 0.02, 0.7, WHZ + 0.012, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
      // mast + aerials
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          A.strut([0.44 + sx * 0.045, 0.845, sz * 0.045], [0.44, 1.205, 0], 0.007, C.metal, { seg: 5 });
        }
      }
      A.box(0.24, 0.014, 0.24, 0.44, 1.19, 0, C.metal);
      A.cyl(0.011, 0.34, 0.44, 1.36, 0, C.metal, { seg: 6 });
      A.sphere(0.016, 0.44, 1.53, 0, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
      A.strut([0.44, 1.5, 0], [0.3, 1.62, 0], 0.004, C.metal, { seg: 4 });
      A.box(0.06, 0.06, 0.06, 0.44, 1.15, 0, C.iron);
      // exhaust stacks (two)
      for (const side of [-1, 1]) {
        A.cyl(0.052, 0.6, -0.16, 0.56, side * 0.175, K.shade(pal.hull, 0.1, -0.05), { seg: 10 });
        A.cyl(0.057, 0.045, -0.16, 0.755, side * 0.175, C.cream, { seg: 10 });
        A.cylT(0.043, 0.05, 0.03, -0.16, 0.887, side * 0.175, C.iron, { seg: 8 });
        A.box(0.06, 0.02, 0.06, -0.16, 0.28, side * 0.175, C.hullDark);
      }

      // aft working deck: towing winch, hook, bollards, rope
      A.box(0.3, 0.06, 0.5, -0.62, 0.29, 0, C.hullDark);
      A.cylZ(0.075, 0.42, -0.62, 0.365, 0, C.metal, { seg: 10 });
      A.box(0.03, 0.2, 0.06, -0.62, 0.36, 0.22, C.iron);
      A.box(0.03, 0.2, 0.06, -0.62, 0.36, -0.22, C.iron);
      A.box(0.16, 0.035, 0.2, -1.02, 0.3, 0, C.iron);
      A.cyl(0.016, 0.1, -1.02, 0.34, 0, C.metal, { seg: 6 });
      A.torus(0.095, 0.018, -0.85, 0.275, 0.26, C.ropeLight, { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 14 });
      A.torus(0.075, 0.016, -0.9, 0.27, -0.22, C.ropeLight, { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 12 });
      bollard(A, -1.28, deckAt(-1.28), 0.3, C.iron);
      bollard(A, -1.28, deckAt(-1.28), -0.3, C.iron);
      bollard(A, -0.12, deckAt(-0.12), 0.38, C.iron);

      // bow: windlass, anchor, bollards
      A.box(0.22, 0.07, 0.28, 1.12, deckAt(1.12) + 0.045, 0, C.iron);
      A.cylZ(0.045, 0.16, 1.16, deckAt(1.16) + 0.1, 0, C.metal, { seg: 8 });
      for (const side of [-1, 1]) {
        const hx = 1.34, hy = 0.14;
        const hw = halfAt(hx, hy);
        A.cylZ(0.038, 0.04, hx, hy, side * (hw - 0.01), C.iron, { seg: 8 });
        A.strut([1.16, deckAt(1.16) + 0.05, side * 0.1], [hx - 0.02, hy + 0.04, side * (hw - 0.05)], 0.01, C.iron, { seg: 5 });
        A.box(0.03, 0.11, 0.025, hx - 0.03, hy - 0.05, side * (hw + 0.008), C.iron);
        A.box(0.06, 0.02, 0.05, hx - 0.03, hy - 0.11, side * (hw + 0.008), C.iron);
      }
      bollard(A, 1.3, deckAt(1.3), 0.24, C.iron);
      bollard(A, 1.3, deckAt(1.3), -0.24, C.iron);
      // bow railing
      for (const side of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 4; i++) {
          const x = lerp(0.9, 1.34, i / 4);
          const y = deckAt(x) + 0.014;
          pts.push([x, y, side * (halfAt(x, y) - 0.04)]);
        }
        railRun(A, pts, 0.075, C.rail);
      }
      // stern rail
      {
        const y = deckAt(-1.44) + 0.014;
        const hw = halfAt(-1.44, y) - 0.03;
        const pts = [];
        for (let i = 0; i <= 6; i++) pts.push([-1.44, y, -hw + (2 * hw) * (i / 6)]);
        railRun(A, pts, 0.075, C.rail);
      }
      // life ring + crew
      lifeRing(A, -0.02, 0.5, 0.44, [Math.PI / 2, 0, 0]);
      crew(A, -0.9, deckAt(-0.9) + 0.02, 0.24, C.hullDark, 0.5);

      /* name boards */
      const nameTex = K.textTexture({
        width: 512, height: 112,
        lines: [{ text: 'MISTRAL', size: 62, font: K.fonts.sans, color: '#eadfc8', weight: 700, spacing: 8 }],
      });
      const signs = [];
      for (const side of [-1, 1]) {
        const nx = 0.98, ny = 0.15;
        const hw = halfAt(nx, ny);
        const e = 0.02;
        const slope = (halfAt(nx + e, ny) - halfAt(nx - e, ny)) / (2 * e);
        const nm = signMesh(0.44, 0.096, nameTex);
        nm.position.set(nx, ny, side * (hw + 0.008));
        nm.rotation.y = Math.atan2(-slope, side);
        signs.push(nm);
      }

      // radar
      const tugSigns = [];
      const rd = new DynMesh();
      const RA = new Art(rd);
      RA.box(0.34, 0.018, 0.04, 0, 0, 0, C.metal);
      RA.box(0.04, 0.04, 0.06, 0.16, 0, 0, C.iron);
      RA.box(0.04, 0.04, 0.06, -0.16, 0, 0, C.iron);
      RA.cyl(0.02, 0.04, 0, -0.015, 0, C.iron, { seg: 8 });
      const radar = rd.build('tug:radar');
      radar.name = 'tug:radar';
      radar.position.set(0.44, 1.27, 0);

      // wheelhouse name boards
      const tugNameTex = K.textTexture({
        width: 512, height: 112,
        lines: [{ text: 'MISTRAL', size: 58, font: K.fonts.sans, color: '#2b3d49', weight: 700, spacing: 8 }],
      });
      for (const side of [-1, 1]) {
        const nm = signMesh(0.32, 0.07, tugNameTex);
        nm.position.set(0.4, 0.735, side * (0.425 + 0.006));
        if (side < 0) nm.rotation.y = Math.PI;
        tugSigns.push(nm);
      }
      // towline from the winch to the stern roller
      A.strut([-0.62, 0.37, 0], [-0.98, 0.31, 0], 0.012, C.ropeLight, { seg: 5 });
      A.strut([-0.98, 0.31, 0], [-1.36, 0.29, 0], 0.012, C.ropeLight, { seg: 5 });
      A.cylZ(0.02, 0.2, -1.38, 0.29, 0, C.iron, { seg: 8 });
      // a warm window or two on the house
      for (const side of [-1, 1]) {
        A.box(0.05, 0.09, 0.016, 0.22, 0.625, side * (WHZ + 0.004), C.lampGlass, { bucket: 'lamp' });
        A.box(0.05, 0.09, 0.016, 0.5, 0.625, side * (WHZ + 0.004), C.lampGlass, { bucket: 'lamp' });
      }
      const flag = makeFlag(0.2, 0.115, 0.7);
      flag.mesh.position.set(0.44, 1.5, 0);
      flag.mesh.rotation.y = Math.PI;

      const root = new THREE.Group();
      root.name = 'tug:mistral';
      root.position.set(T.x, 0, T.z);
      root.rotation.order = 'YXZ';
      root.rotation.y = T.heading;
      const model = new THREE.Group();
      model.rotation.y = -Math.PI / 2;
      root.add(model);
      dyn.build('tug', model);
      model.add(radar);
      model.add(flag.mesh);
      for (const s of signs) model.add(s);
      for (const s of tugSigns) model.add(s);
      scene.add(root);
      foamQuads.push({ x: T.x, z: T.z, w: 3.15, d: 1.32, rot: T.heading - Math.PI / 2 });

      const funnel = vesselToWorld(T.x, T.z, T.heading, -0.16, 0.93, 0.175);
      return { root, model, radar, flag, T, hull, funnel };
    }
    const tug = buildTug();

    /* ====================================================================== *
     * 6b.  pilot boat on the pilot loop (with a soft foam wake)
     * ====================================================================== */
    function buildWake() {
      const MAX = 190;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(MAX * 2 * 3);
      const col = new Float32Array(MAX * 2 * 4);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
      const idx = [];
      for (let i = 0; i < MAX - 1; i++) {
        const a = i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      geo.setIndex(idx);
      geo.setDrawRange(0, 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      mesh.name = 'fleet:pilotWake';
      scene.add(mesh);

      const ringTex = K.texture(K.canvas(128, 128, (c2, w, h) => {
        c2.clearRect(0, 0, w, h);
        const g = c2.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.78, 'rgba(255,255,255,0)');
        g.addColorStop(0.87, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.94, 'rgba(255,255,255,0.22)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c2.fillStyle = g;
        c2.beginPath();
        c2.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
        c2.fill();
      }));
      const RQ = 3;
      const rgeo = new THREE.BufferGeometry();
      const rpos = new Float32Array(RQ * 4 * 3);
      const rcol = new Float32Array(RQ * 4 * 4);
      const ruv = new Float32Array(RQ * 4 * 2);
      const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let q = 0; q < RQ; q++) {
        for (let i = 0; i < 4; i++) {
          ruv[(q * 4 + i) * 2] = uvs[i][0];
          ruv[(q * 4 + i) * 2 + 1] = uvs[i][1];
        }
      }
      rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3).setUsage(THREE.DynamicDrawUsage));
      rgeo.setAttribute('color', new THREE.BufferAttribute(rcol, 4).setUsage(THREE.DynamicDrawUsage));
      rgeo.setAttribute('uv', new THREE.BufferAttribute(ruv, 2));
      const ridx = [];
      for (let q = 0; q < RQ; q++) {
        const b = q * 4;
        ridx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      rgeo.setIndex(ridx);
      const rmesh = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({
        map: ringTex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      }));
      rmesh.frustumCulled = false;
      rmesh.renderOrder = 4.9;
      rmesh.name = 'fleet:pilotRings';
      scene.add(rmesh);

      const samples = [];
      let lastX = 0, lastZ = 0;
      function update(dt, bx, bz, heading, t) {
        const hx = Math.sin(heading), hz = Math.cos(heading);
        const sx = bx - hx * 0.62, sz = bz - hz * 0.62;
        const ddx = sx - lastX, ddz = sz - lastZ;
        if (ddx * ddx + ddz * ddz > 0.0025) {
          samples.unshift({ x: sx, z: sz, hx, hz, age: 0 });
          if (samples.length > MAX) samples.pop();
          lastX = sx; lastZ = sz;
        }
        for (let i = 0; i < samples.length; i++) samples[i].age += dt;
        while (samples.length && samples[samples.length - 1].age > 2.7) samples.pop();
        const n = samples.length;
        if (n < 2) {
          geo.setDrawRange(0, 0);
        } else {
          for (let i = 0; i < n; i++) {
            const s = samples[i];
            const alpha = Math.pow(Math.max(0, 1 - s.age / 2.7), 1.4) * 0.38;
            const w = 0.035 + s.age * 0.075;
            const px = s.hz, pz = -s.hx;
            const o = i * 6, o4 = i * 8;
            pos[o] = s.x + px * w; pos[o + 1] = 0.045; pos[o + 2] = s.z + pz * w;
            pos[o + 3] = s.x - px * w; pos[o + 4] = 0.045; pos[o + 5] = s.z - pz * w;
            col[o4] = 0.96; col[o4 + 1] = 0.99; col[o4 + 2] = 0.97; col[o4 + 3] = alpha;
            col[o4 + 4] = 0.96; col[o4 + 5] = 0.99; col[o4 + 6] = 0.97; col[o4 + 7] = alpha;
          }
          geo.setDrawRange(0, (n - 1) * 6);
          geo.attributes.position.needsUpdate = true;
          geo.attributes.color.needsUpdate = true;
        }
        // expanding stern wash rings
        for (let q = 0; q < RQ; q++) {
          const phase = (t * 0.5 + q / RQ) % 1;
          const size = 0.1 + phase * 0.72;
          const alpha = Math.pow(1 - phase, 2.0) * 0.26;
          const cxx = bx - hx * (0.6 + phase * 0.55);
          const czz = bz - hz * (0.6 + phase * 0.55);
          const px = hz, pz = -hx;
          const b = q * 4 * 3, cB = q * 4 * 4;
          const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
          for (let i = 0; i < 4; i++) {
            const ax = corners[i][0], az = corners[i][1];
            rpos[b + i * 3] = cxx + (hx * az + px * ax) * size;
            rpos[b + i * 3 + 1] = 0.042;
            rpos[b + i * 3 + 2] = czz + (hz * az + pz * ax) * size;
            rcol[cB + i * 4] = 0.97;
            rcol[cB + i * 4 + 1] = 0.995;
            rcol[cB + i * 4 + 2] = 0.98;
            rcol[cB + i * 4 + 3] = alpha;
          }
        }
        rgeo.attributes.position.needsUpdate = true;
        rgeo.attributes.color.needsUpdate = true;
      }
      return { update };
    }

    function buildPilotBoat() {
      const route = L.routes.pilotLoop;
      const cps = route.points.map((p) => new THREE.Vector3(p[0], 0, p[1]));
      const curve = new THREE.CatmullRomCurve3(cps, true, 'catmullrom', 0.5);
      const routeLen = curve.getLength();
      const dyn = new DynMesh();
      const A = new Art(dyn);
      const cfg = {
        x0: -0.8, x1: 0.8, stations: 26, halfBeam: 0.26,
        beamPts: [[0, 0.82], [0.05, 0.90], [0.18, 0.99], [0.55, 1], [0.72, 0.98],
          [0.86, 0.85], [0.95, 0.55], [1, 0.04]],
        shapePts: [[0, 0.14], [0.10, 0.46], [0.22, 0.72], [0.36, 0.88], [0.52, 0.96],
          [0.68, 1], [0.82, 0.99], [1, 0.95]],
        yb: (u) => -0.10 + 0.04 * K.smoothstep(0.8, 1, u) + 0.02 * K.smoothstep(0.1, 0, u),
        yd: (u) => 0.135 + 0.05 * K.smoothstep(0.45, 1, u) + 0.02 * (1 - K.smoothstep(0, 0.2, u)),
        flare: (u) => 0.08 * K.smoothstep(0.8, 0.99, u),
        bootTop: 0.03, stripeH: 0.02,
        bootColor: K.shade(pal.hull, 0.05, 0.0),
        hullColor: K.shade(pal.shipWhite, 0.02, -0.02),
        stripeColor: C.orange,
        deckColor: K.shade(pal.woodLight, 0.03, -0.02),
        deckCamber: 0.005,
      };
      const hull = buildHull(A, cfg);
      const deckAt = hull.deckAt, halfAt = hull.halfAt;
      // wheelhouse
      const WHX0 = -0.10, WHX1 = 0.3, WHZ = 0.165;
      A.taper(WHX1 - WHX0, WHZ * 2, WHX1 - WHX0 - 0.02, WHZ * 2 - 0.02, 0.24,
        (WHX0 + WHX1) / 2, 0.16, 0, C.white);
      A.box(0.012, 0.085, 0.27, WHX1 - 0.004, 0.34, 0, C.glass, { bucket: 'glass' });
      for (const side of [-1, 1]) {
        A.box(0.3, 0.075, 0.012, 0.1, 0.34, side * (WHZ + 0.003), C.glass, { bucket: 'glass' });
        A.box(0.016, 0.075, 0.016, 0.0, 0.34, side * (WHZ + 0.005), C.trim);
      }
      A.box(0.26, 0.012, 0.05, 0.1, 0.405, 0, C.orange);
      A.box(0.44, 0.022, WHZ * 2 + 0.06, 0.1, 0.41, 0, C.cream);
      // radar dome + antenna mast
      A.ellipsoid(0.042, 0.035, 0.042, 0.14, 0.435, 0, C.white, { ws: 10, hs: 7 });
      A.cyl(0.009, 0.24, 0.02, 0.52, 0, C.metal, { seg: 6 });
      A.sphere(0.014, 0.02, 0.645, 0, C.lamp, { bucket: 'lamp', ws: 8, hs: 6 });
      A.strut([0.02, 0.62, 0], [-0.06, 0.7, 0], 0.004, C.metal, { seg: 4 });
      // bow + stern hardware
      A.cyl(0.01, 0.2, 0.62, 0.24, 0, C.metal, { seg: 6 });
      A.box(0.03, 0.03, 0.09, -0.72, 0.175, 0, C.iron);
      A.cyl(0.026, 0.06, -0.66, 0.17, 0, C.iron, { seg: 8 });
      for (const side of [-1, 1]) {
        A.box(0.05, 0.1, 0.02, 0.56, 0.2, side * 0.14, C.cream);
        A.box(0.05, 0.1, 0.02, -0.5, 0.19, side * 0.13, C.cream);
        // fender strip
        A.box(0.9, 0.035, 0.016, 0.02, 0.075, side * (halfAt(0.02, 0.075) + 0.006), C.rubber);
        A.torus(0.035, 0.011, 0.4, 0.04, side * (halfAt(0.4, 0.04) + 0.012), C.rubber, { rs: 4, ts: 10 });
      }
      // foredeck railing
      for (const side of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 4; i++) {
          const x = lerp(0.36, 0.76, i / 4);
          const y = deckAt(x) + 0.012;
          pts.push([x, y, side * (halfAt(x, y) - 0.02)]);
        }
        railRun(A, pts, 0.05, C.rail);
      }
      // nav lights + one warm window
      A.sphere(0.011, WHX1 - 0.01, 0.3, -WHZ - 0.01, C.lamp, { bucket: 'lamp', ws: 6, hs: 4 });
      A.sphere(0.011, WHX1 - 0.01, 0.3, WHZ + 0.01, C.lamp, { bucket: 'lamp', ws: 6, hs: 4 });
      A.sphere(0.012, 0.02, 0.49, 0, C.lamp, { bucket: 'lamp', ws: 6, hs: 4 });
      for (const side of [-1, 1]) {
        A.box(0.04, 0.07, 0.014, 0.16, 0.34, side * (WHZ + 0.005), C.lampGlass, { bucket: 'lamp' });
      }

      // PILOT boards
      const pilotTex = K.textTexture({
        width: 384, height: 128,
        lines: [{ text: 'PILOT', size: 66, font: K.fonts.sans, color: '#2b3d49', weight: 700, spacing: 8 }],
      });
      const signs = [];
      for (const side of [-1, 1]) {
        const nm = signMesh(0.2, 0.067, pilotTex);
        nm.position.set(0.1, 0.355, side * (WHZ + 0.008));
        if (side < 0) nm.rotation.y = Math.PI;
        signs.push(nm);
      }

      const root = new THREE.Group();
      root.name = 'pilotBoat';
      root.rotation.order = 'YXZ';
      const model = new THREE.Group();
      model.rotation.y = -Math.PI / 2;
      root.add(model);
      dyn.build('pilot', model);
      for (const s of signs) model.add(s);
      scene.add(root);

      const wake = buildWake();
      return { root, model, hull, curve, routeLen, wake, u: 0.12, heading: 0 };
    }
    const pilot = buildPilotBoat();

    /* ====================================================================== *
     * 6c.  the fishing fleet at the fish quay + their mooring buoys
     * ====================================================================== */
    const MOORING_BUOYS = [
      { x: -7.50, z: -0.15, phase: 0.5 },
      { x: -7.56, z: 1.05, phase: 2.4 },
      { x: -7.40, z: 3.2, phase: 4.2 },
    ];
    function buildMooringBuoys() {
      const list = [];
      for (let i = 0; i < MOORING_BUOYS.length; i++) {
        const b = MOORING_BUOYS[i];
        const dyn = new DynMesh();
        const A = new Art(dyn);
        A.ellipsoid(0.066, 0.055, 0.066, 0, 0.042, 0, C.orange, { ws: 12, hs: 8 });
        A.cyl(0.06, 0.014, 0, 0.072, 0, C.cream, { seg: 12 });
        A.torus(0.02, 0.006, 0, 0.094, 0, C.metal, { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 10 });
        A.cyl(0.01, 0.2, 0, -0.08, 0, C.rope, { seg: 6 });
        const root = dyn.build('mooringBuoy');
        root.position.set(b.x, 0, b.z);
        scene.add(root);
        list.push({ root, def: b, phase: b.phase });
      }
      return list;
    }
    const mooringBuoys = buildMooringBuoys();

    function fishingQuayBollards() {
      const raw = P.anchors && P.anchors.fishingBollards;
      const out = [];
      if (raw && raw.positions) {
        for (let i = 0; i < raw.positions.length; i++) out.push(raw.positions[i]);
      }
      if (!out.length) {
        for (const z of [-2.1, -0.4, 1.3]) out.push([-9.82, 1.3, z]);
      }
      return out;
    }

    function buildFishingBoat(spec) {
      const FL = spec.len, FB = spec.beam;
      const dyn = new DynMesh();
      const A = new Art(dyn);
      const cfg = {
        x0: -FL / 2, x1: FL / 2, stations: 26, halfBeam: FB / 2,
        beamPts: [[0, 0.80], [0.06, 0.90], [0.18, 0.97], [0.45, 1], [0.72, 0.99],
          [0.86, 0.90], [0.94, 0.65], [1, 0.05]],
        shapePts: [[0, 0.14], [0.10, 0.46], [0.24, 0.74], [0.40, 0.90], [0.55, 0.98],
          [0.70, 1], [0.85, 0.985], [1, 0.94]],
        yb: (u) => -0.13 + 0.03 * K.smoothstep(0.8, 1, u) + 0.015 * K.smoothstep(0.1, 0, u),
        yd: (u) => 0.115 + 0.075 * K.smoothstep(0.35, 1, u) + 0.012 * (1 - K.smoothstep(0, 0.2, u)),
        flare: (u) => 0.1 * K.smoothstep(0.8, 0.99, u),
        bootTop: 0.03, stripeH: 0.026,
        bootColor: K.shade(pal.hullRed, -0.05, -0.02),
        hullColor: spec.hull,
        stripeColor: spec.stripe || C.cream,
        deckColor: K.shade(pal.wood, 0.08, -0.03),
        deckCamber: 0.006,
      };
      const hull = buildHull(A, cfg);
      const deckAt = hull.deckAt, halfAt = hull.halfAt;

      // gunwale cap + rubbing strake
      for (const side of [-1, 1]) {
        for (let x = -FL / 2 + 0.05; x < FL / 2 - 0.08; x += 0.17) {
          const y = deckAt(x + 0.085);
          A.box(0.18, 0.014, 0.032, x + 0.085, y + 0.016, side * (halfAt(x + 0.085, y) - 0.008), C.woodDark);
        }
      }
      // little bulwark forward
      for (const side of [-1, 1]) {
        for (let x = FL * 0.12; x < FL * 0.44; x += 0.16) {
          const y = deckAt(x + 0.08);
          A.box(0.17, 0.045, 0.02, x + 0.08, y + 0.035, side * (halfAt(x + 0.08, y) - 0.012), spec.hull);
        }
      }
      // wheelhouse aft
      const wx0 = -FL * 0.44, wx1 = -FL * 0.06, wz = FB * 0.31;
      const base = deckAt((wx0 + wx1) / 2) + 0.005;
      A.taper(wx1 - wx0, wz * 2, wx1 - wx0 - 0.035, wz * 2 - 0.03, 0.2,
        (wx0 + wx1) / 2, base, 0, C.cream);
      A.box(0.012, 0.07, 0.1, wx1 - 0.004, base + 0.14, 0, C.glass, { bucket: 'glass' });
      for (const side of [-1, 1]) {
        A.box(0.12, 0.065, 0.012, (wx0 + wx1) / 2, base + 0.14, side * (wz + 0.002), C.glass, { bucket: 'glass' });
      }
      A.box(wx1 - wx0 + 0.045, 0.018, wz * 2 + 0.05, (wx0 + wx1) / 2, base + 0.208, 0, C.trim);
      for (const side of [-1, 1]) {
        A.box(0.04, 0.065, 0.014, wx1 - 0.055, base + 0.14, side * (wz + 0.004), C.lampGlass, { bucket: 'lamp' });
      }
      A.cyl(0.016, 0.12, wx0 + 0.06, base + 0.28, wz * 0.35, C.iron, { seg: 6 });
      // mast, boom, rigging
      const MX2 = FL * 0.1;
      const mBase = deckAt(MX2) + 0.02;
      A.cyl(0.011, 0.55, MX2, mBase + 0.275, 0, C.woodDark, { seg: 6 });
      A.strut([MX2, mBase + 0.4, 0], [-FL * 0.36, mBase + 0.34, 0], 0.008, C.woodDark, { seg: 5 });
      A.strut([MX2, mBase + 0.34, 0], [MX2 - 0.02, mBase + 0.06, 0.16], 0.006, C.woodDark, { seg: 4 });
      A.sphere(0.013, MX2, mBase + 0.57, 0, C.lamp, { bucket: 'lamp', ws: 6, hs: 4 });
      A.strut([MX2, mBase + 0.54, 0], [FL * 0.46, mBase + 0.08, 0], 0.0035, C.metal, { seg: 4 });
      A.strut([MX2, mBase + 0.54, 0], [-FL * 0.44, mBase + 0.08, 0], 0.0035, C.metal, { seg: 4 });
      // net drum
      A.cylZ(0.032, 0.16, -FL * 0.26, deckAt(-FL * 0.26) + 0.09, 0, C.iron, { seg: 8 });
      A.box(0.03, 0.09, 0.22, -FL * 0.3, deckAt(-FL * 0.3) + 0.045, 0, C.woodDark);
      // tyres
      for (const side of [-1, 1]) {
        for (const tx of [-FL * 0.3, 0, FL * 0.28]) {
          A.torus(0.034, 0.011, tx, 0.04, side * (halfAt(tx, 0.04) + 0.012), C.rubber, { rs: 4, ts: 10 });
        }
      }
      // cleats
      for (const side of [-1, 1]) {
        A.box(0.06, 0.02, 0.02, -FL * 0.45, deckAt(-FL * 0.45) + 0.03, side * 0.1, C.iron);
        A.box(0.06, 0.02, 0.02, FL * 0.43, deckAt(FL * 0.43) + 0.03, side * 0.09, C.iron);
      }
      lifeRing(A, wx0 + 0.1, base + 0.12, wz + 0.02, [Math.PI / 2, 0, 0]);

      // ---- gear variants ---------------------------------------------------
      if (spec.gear === 'nets') {
        A.ellipsoid(0.11, 0.045, 0.09, FL * 0.24, deckAt(FL * 0.24) + 0.07, 0.02, C.tarp, { ws: 10, hs: 6 });
        A.ellipsoid(0.08, 0.035, 0.07, FL * 0.15, deckAt(FL * 0.15) + 0.06, -0.08, C.tarp, { ws: 8, hs: 5 });
        for (let i = 0; i < 4; i++) {
          const fx = FL * (0.06 + i * 0.1);
          A.sphere(0.023, fx, deckAt(fx) + 0.028, 0.14 - (i % 2) * 0.05, C.orange, { ws: 8, hs: 5 });
          A.strut([fx, deckAt(fx) + 0.03, 0.1], [fx, deckAt(fx) + 0.028, 0.135], 0.003, C.ropeLight, { seg: 3 });
        }
        A.cyl(0.05, 0.1, -FL * 0.05, deckAt(-FL * 0.05) + 0.06, -0.13, C.wood, { seg: 8 });
      } else if (spec.gear === 'crane') {
        const cx1 = FL * 0.34, cy = deckAt(cx1);
        A.strut([cx1 - 0.1, cy, 0.12], [cx1 - 0.18, cy + 0.4, 0], 0.014, C.metal, { seg: 5 });
        A.strut([cx1 - 0.1, cy, -0.12], [cx1 - 0.18, cy + 0.4, 0], 0.014, C.metal, { seg: 5 });
        A.strut([cx1 - 0.18, cy + 0.4, 0], [FL * 0.04, cy + 0.25, 0], 0.012, C.metal, { seg: 5 });
        A.strut([FL * 0.04, cy + 0.25, 0], [FL * 0.02, cy + 0.1, 0], 0.003, C.rope, { seg: 3 });
        A.box(0.03, 0.04, 0.03, FL * 0.02, cy + 0.09, 0, C.iron);
        A.cyl(0.04, 0.1, cx1 - 0.05, cy + 0.06, 0.16, C.iron, { seg: 8 });
      } else {
        for (let i = 0; i < 4; i++) {
          const cx = FL * (0.06 + (i % 2) * 0.12);
          const cz = -0.12 + Math.floor(i / 2) * 0.2;
          A.box(0.11, 0.075, 0.11, cx, deckAt(cx) + 0.085 + (i > 2 ? 0.075 : 0), cz, C.wood, { rot: [0, i * 0.3, 0] });
        }
        A.cyl(0.038, 0.085, -FL * 0.02, deckAt(-FL * 0.02) + 0.05, 0.13, K.shade(pal.rust, 0.05, -0.02), { seg: 8 });
        A.cyl(0.038, 0.085, -FL * 0.09, deckAt(-FL * 0.09) + 0.05, -0.1, K.shade(pal.rust, 0.05, -0.02), { seg: 8 });
        A.ellipsoid(0.07, 0.03, 0.05, FL * 0.2, deckAt(FL * 0.2) + 0.05, -0.12, C.tarp, { ws: 8, hs: 5 });
      }
      // crew
      crew(A, -FL * 0.3, deckAt(-FL * 0.3) + 0.018, 0.16, spec.hull, 0.7);

      const root = new THREE.Group();
      root.name = 'fishingBoat';
      root.position.set(spec.x, 0, spec.z);
      root.rotation.order = 'YXZ';
      root.rotation.y = spec.heading;
      const model = new THREE.Group();
      model.rotation.y = -Math.PI / 2;
      root.add(model);
      dyn.build('fishing', model);
      scene.add(root);
      foamQuads.push({ x: spec.x, z: spec.z, w: FL + 0.26, d: FB + 0.3, rot: spec.heading - Math.PI / 2 });

      // ---- mooring lines (static batch) ----
      const h = spec.heading;
      const bowW = vesselToWorld(spec.x, spec.z, h, FL / 2 - 0.04, deckAt(FL / 2 - 0.04) + 0.035, 0);
      const sternW = vesselToWorld(spec.x, spec.z, h, -FL / 2 + 0.03, deckAt(-FL / 2 + 0.03) + 0.035, 0);
      if (spec.alongside === 'pontoon') {
        // lying alongside the floating pontoon — short head and stern lines
        K.rope([bowW[0], bowW[1], bowW[2]], [-8.26, 0.33, 1.55], 0.014, 0.005, C.rope, { segments: 8, radial: 4 });
        K.rope([sternW[0], sternW[1], sternW[2]], [-8.26, 0.33, 2.36], 0.014, 0.005, C.rope, { segments: 8, radial: 4 });
      } else {
        const buoy = MOORING_BUOYS[spec.buoy];
        if (buoy) {
          K.rope([bowW[0], bowW[1], bowW[2]], [buoy.x, 0.05, buoy.z], 0.018, 0.005, C.rope, { segments: 10, radial: 4 });
        }
        // stern lines over the quay coping to the fishing-quay bollards
        const fbs = fishingQuayBollards().slice().sort((a, b) => Math.abs(a[2] - spec.z) - Math.abs(b[2] - spec.z));
        for (const s of [-1, 1]) {
          const bb = fbs[s < 0 ? 0 : Math.min(1, fbs.length - 1)];
          if (!bb) continue;
          const edge = [-9.58, 1.12, bb[2] + s * 0.06];
          K.rope([sternW[0], sternW[1], sternW[2] + s * 0.1], edge, 0.02, 0.006, C.rope, { segments: 8, radial: 4 });
          K.rope(edge, [bb[0], bb[1], bb[2]], 0.006, 0.006, C.rope, { segments: 4, radial: 4 });
        }
      }
      return { root, model, hull, spec };
    }
    // boats 1 + 2 stern-to the fish quay; boat 3 lies alongside the floating
    // pontoon (the layout position sits inside the pontoon footprint).
    const FISH_SPECS = [
      { x: -8.62, z: -0.15, heading: Math.PI / 2, len: 1.40, beam: 0.46, buoy: 0, gear: 'nets', phase: 0.4, hull: K.shade(pal.plasterBlue, -0.02, 0.06) },
      { x: -8.68, z: 1.05, heading: Math.PI / 2, len: 1.25, beam: 0.43, buoy: 1, gear: 'crane', phase: 2.2, hull: K.shade(pal.hullRed, 0.03, -0.09) },
      { x: -7.64, z: 1.95, heading: Math.PI, len: 1.15, beam: 0.42, buoy: -1, gear: 'crates', phase: 4.1, hull: K.shade(pal.roofGreen, 0.02, -0.02), alongside: 'pontoon' },
    ];
    const fishing = FISH_SPECS.map((s) => buildFishingBoat(s));

    /* ====================================================================== *
     * 6d.  the little sailboat
     * ====================================================================== */
    function sailGeom(tack, head, clew, bulge, segU, segV) {
      const pos = [], idx = [];
      for (let j = 0; j <= segV; j++) {
        const v = j / segV;
        const lx = tack[0] + (head[0] - tack[0]) * v;
        const ly = tack[1] + (head[1] - tack[1]) * v;
        const lz = tack[2] + (head[2] - tack[2]) * v;
        const rx = clew[0] + (head[0] - clew[0]) * v;
        const ry = clew[1] + (head[1] - clew[1]) * v;
        const rz = clew[2] + (head[2] - clew[2]) * v;
        for (let i = 0; i <= segU; i++) {
          const u = i / segU;
          const x = lx + (rx - lx) * u;
          const y = ly + (ry - ly) * u;
          const z = lz + (rz - lz) * u + Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.1)) * bulge;
          pos.push(x, y, z);
        }
      }
      for (let j = 0; j < segV; j++) {
        for (let i = 0; i < segU; i++) {
          const a = j * (segU + 1) + i;
          const b = a + 1;
          const c = a + segU + 1;
          const d = c + 1;
          idx.push(a, b, d, a, d, c);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    function buildSailboat() {
      const S = { x: -4.35, z: 8.9, heading: 2.3 };
      const dyn = new DynMesh();
      const A = new Art(dyn);
      const cfg = {
        x0: -0.925, x1: 0.925, stations: 26, halfBeam: 0.28,
        beamPts: [[0, 0.86], [0.05, 0.93], [0.16, 0.99], [0.5, 1], [0.7, 0.96],
          [0.84, 0.85], [0.93, 0.6], [1, 0.04]],
        shapePts: [[0, 0.2], [0.10, 0.5], [0.24, 0.76], [0.40, 0.92], [0.56, 0.99],
          [0.70, 1], [0.86, 0.985], [1, 0.94]],
        yb: (u) => -0.16 + 0.05 * K.smoothstep(0.82, 1, u) + 0.03 * K.smoothstep(0.1, 0, u),
        yd: (u) => 0.13 + 0.04 * K.smoothstep(0.4, 1, u) + 0.012 * (1 - K.smoothstep(0, 0.2, u)),
        flare: (u) => 0.08 * K.smoothstep(0.8, 0.99, u),
        bootTop: 0.035, stripeH: 0.016,
        bootColor: K.shade(pal.hull, 0.08, -0.02),
        hullColor: K.shade(pal.shipCream, 0.02, -0.02),
        stripeColor: C.woodDark,
        deckColor: K.shade(pal.wood, 0.12, -0.03),
        deckCamber: 0.006,
      };
      const hull = buildHull(A, cfg);
      const deckAt = hull.deckAt, halfAt = hull.halfAt;
      // toe rails
      for (const side of [-1, 1]) {
        for (let x = -0.82; x < 0.8; x += 0.17) {
          const y = deckAt(x + 0.085);
          A.box(0.18, 0.012, 0.026, x + 0.085, y + 0.012, side * (halfAt(x + 0.085, y) - 0.008), C.woodDark);
        }
      }
      // cabin trunk
      A.taper(0.52, 0.3, 0.42, 0.24, 0.095, -0.16, 0.145, 0, K.shade(pal.shipCream, 0.02, -0.02));
      for (const side of [-1, 1]) {
        A.box(0.2, 0.045, 0.012, -0.2, 0.19, side * 0.153, C.glass, { bucket: 'glass' });
      }
      A.taper(0.44, 0.25, 0.38, 0.2, 0.03, -0.18, 0.24, 0, C.cream);
      // cockpit coaming
      A.box(0.34, 0.06, 0.02, -0.55, 0.16, 0.18, C.wood);
      A.box(0.34, 0.06, 0.02, -0.55, 0.16, -0.18, C.wood);
      A.box(0.02, 0.06, 0.36, -0.73, 0.16, 0, C.wood);
      // mast, boom, rigging
      const MX2 = 0.1, MB = 0.14;
      A.cylT(0.014, 0.02, 2.02, MX2, MB + 1.01, 0, C.metal, { seg: 8 });
      A.strut([MX2, 0.66, 0], [-0.78, 0.64, 0], 0.011, C.metal, { seg: 6 });
      A.strut([MX2, 2.13, 0], [0.86, 0.16, 0], 0.004, C.metal, { seg: 3 });
      A.strut([MX2, 2.13, 0], [-0.9, 0.15, 0], 0.004, C.metal, { seg: 3 });
      for (const side of [-1, 1]) {
        A.strut([MX2, 2.1, 0], [MX2 + 0.04, 0.17, side * 0.24], 0.003, C.metal, { seg: 3 });
        A.box(0.02, 0.012, 0.055, MX2, 1.35, side * 0.09, C.metal);
      }
      // bow pulpit + stern pushpit
      for (const side of [-1, 1]) {
        A.strut([0.6, 0.16, side * 0.14], [0.82, 0.25, side * 0.06], 0.006, C.metal, { seg: 4 });
        A.strut([-0.72, 0.16, side * 0.17], [-0.84, 0.25, side * 0.08], 0.006, C.metal, { seg: 4 });
      }
      A.box(0.02, 0.02, 0.2, 0.86, 0.25, 0, C.metal);
      A.box(0.02, 0.02, 0.24, -0.86, 0.25, 0, C.metal);
      // anchor chain at the bow
      A.cyl(0.006, 0.34, 0.79, 0.0, 0.05, C.iron, { seg: 4 });
      // fenders
      A.capsule(0.028, 0.1, 0.1, 0.1, 0.27, C.cream, { rot: [0, 0, 0], cs: 4, rs: 4 });
      A.capsule(0.028, 0.1, -0.5, 0.1, 0.25, C.cream, { rot: [0, 0, 0], cs: 4, rs: 4 });

      // sails
      const sailMat = K.std(K.shade(pal.paperWarm, -0.005, -0.01).getHex(), {
        roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide, envMapIntensity: 0.35,
      });
      const mainGeo = sailGeom([0.09, 0.64, 0], [0.09, 2.12, 0], [-0.76, 0.65, 0], -0.1, 7, 6);
      const jibGeo = sailGeom([0.72, 0.2, 0], [0.32, 1.86, 0], [-0.07, 0.5, 0], 0.09, 6, 5);
      const mainSail = new THREE.Mesh(mainGeo, sailMat);
      mainSail.name = 'sailboat:main';
      const jib = new THREE.Mesh(jibGeo, sailMat);
      jib.name = 'sailboat:jib';
      const sails = new THREE.Group();
      sails.add(mainSail);
      sails.add(jib);
      const pennant = makeFlag(0.22, 0.06, 1.4);
      pennant.mesh.position.set(MX2, 2.14, 0);
      pennant.mesh.rotation.y = Math.PI;

      const root = new THREE.Group();
      root.name = 'sailboat';
      root.position.set(S.x, 0, S.z);
      root.rotation.order = 'YXZ';
      root.rotation.y = S.heading;
      const model = new THREE.Group();
      model.rotation.y = -Math.PI / 2;
      root.add(model);
      dyn.build('sailboat', model);
      model.add(sails);
      model.add(pennant.mesh);
      scene.add(root);
      foamQuads.push({ x: S.x, z: S.z, w: 2.0, d: 0.68, rot: S.heading - Math.PI / 2 });
      return { root, model, hull, sails, pennant, S };
    }
    const sailboat = buildSailboat();

    /* ====================================================================== *
     * 6e.  channel buoys + their light cages
     * ====================================================================== */
    function buildChannelBuoys() {
      const defs = [
        { x: -2.4, z: 11.4, kind: 'green', phase: 0.7, name: 'buoyGreen' },
        { x: 2.4, z: 12.1, kind: 'red', phase: 3.1, name: 'buoyRed' },
      ];
      const list = [];
      for (let bi = 0; bi < defs.length; bi++) {
        const d = defs[bi];
        const dyn = new DynMesh();
        const A = new Art(dyn);
        const body = d.kind === 'green' ? C.buoyGreen : C.buoyRed;
        // buoy body: flared waterline, tapered tower
        A.geo(K.latheGeo([
          [0.0, 0.0], [0.11, 0.004], [0.146, 0.05], [0.142, 0.115], [0.122, 0.175],
          [0.09, 0.24], [0.062, 0.30], [0.052, 0.34],
        ], 16), body, {});
        // proud cream band and a dark waterline band
        A.cyl(0.148, 0.034, 0, 0.148, 0, C.cream, { seg: 16 });
        A.cyl(0.15, 0.012, 0, 0.058, 0, K.shade(pal.ink, 0.03, 0.0), { seg: 16 });
        // light cage: four posts + top and bottom rings
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          A.box(0.01, 0.135, 0.01, Math.cos(a) * 0.052, 0.405, Math.sin(a) * 0.052, C.metal);
        }
        A.torus(0.056, 0.008, 0, 0.47, 0, C.metal, { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 12 });
        A.torus(0.052, 0.007, 0, 0.345, 0, C.metal, { rot: [Math.PI / 2, 0, 0], rs: 4, ts: 12 });
        A.sphere(0.036, 0, 0.412, 0, C.lamp, { bucket: 'lamp', ws: 10, hs: 7 });
        // IALA topmark: cone for green, can for red
        if (d.kind === 'green') {
          A.geo(K.geoCone(10), body, { pos: [0, 0.548, 0], scale: [0.062, 0.11, 0.062] });
          A.box(0.018, 0.03, 0.018, 0, 0.49, 0, C.metal);
        } else {
          A.cyl(0.058, 0.085, 0, 0.54, 0, body, { seg: 10 });
          A.cyl(0.062, 0.014, 0, 0.589, 0, C.cream, { seg: 10 });
          A.box(0.018, 0.03, 0.018, 0, 0.49, 0, C.metal);
        }
        // chain to the sinker
        A.cyl(0.014, 0.5, 0, -0.22, 0, C.rope, { seg: 6 });
        A.box(0.1, 0.035, 0.1, 0, -0.47, 0, C.iron);
        const root = dyn.build('buoy:' + d.kind);
        root.position.set(d.x, 0, d.z);
        scene.add(root);
        list.push({ root, def: d, lamp: [d.x, 0.412, d.z] });
      }
      return list;
    }
    const channelBuoys = buildChannelBuoys();

    // one merged contact-foam sheet for all moored hulls
    if (foamQuads.length) scene.add(contactFoamMesh(foamQuads));


    /* ====================================================================== *
     * 7.  registries: labels, anchors, counters, animation
     * ====================================================================== */
    K.addLabel({
      pos: [0.2, 3.42, SHIP.cz],
      title: '集装箱船',
      sub: 'CONTAINER SHIP · 136 M',
      priority: 10,
    });
    K.addLabel({ pos: [5.85, 1.72, 4.95], title: '拖轮', sub: 'HARBOUR TUG MISTRAL', priority: 6 });
    K.addLabel({ pos: [-8.55, 1.12, 1.05], title: '渔船', sub: 'FISHING FLEET', priority: 5 });

    K.anchor('shipFunnel', { pos: [SHIP.cx - 5.42, 2.9, SHIP.cz] });
    K.anchor('shipMast', { pos: [SHIP.cx - 4.32, 3.28, SHIP.cz] });
    K.anchor('tugFunnel', { pos: tug.funnel });
    for (let i = 0; i < channelBuoys.length; i++) {
      K.anchor(channelBuoys[i].def.name, { pos: channelBuoys[i].lamp });
    }

    K.count('vessels', 6);

    /* ---- animation ------------------------------------------------------- */
    const ticks = [];

    // the ship: a few millimetres of heave, a fraction of a degree of roll
    (function animateShip() {
      const root = ship.root;
      ticks.push((dt, t) => {
        root.position.x = SHIP.cx;
        root.position.z = SHIP.cz;
        root.position.y = Math.sin(t * 0.62) * 0.0075 + Math.sin(t * 1.31 + 1.2) * 0.0032;
        root.rotation.x = Math.sin(t * 0.48 + 0.4) * 0.0040 + Math.sin(t * 0.97 + 2.1) * 0.0016;
        root.rotation.z = Math.sin(t * 0.57 + 1.7) * 0.0026;
        ship.radar.rotation.y += dt * 1.45;
        ship.flags[0].update(t);
        ship.flags[1].update(t + 1.3);
      });
    })();

    // the tug: idling at her buoy, snubbing gently on the lines
    ticks.push((dt, t) => {
      tug.root.position.y = Math.sin(t * 0.88 + 1.1) * 0.0065 + Math.sin(t * 1.6 + 0.4) * 0.0022;
      tug.root.rotation.y = tug.T.heading + Math.sin(t * 0.21 + 0.5) * 0.014;
      tug.root.rotation.x = Math.sin(t * 0.93 + 2.1) * 0.0045;
      tug.root.rotation.z = Math.sin(t * 0.71 + 0.9) * 0.006;
      tug.radar.rotation.y += dt * 1.9;
      tug.flag.update(t + 0.8);
    });

    // the pilot boat: slow patrol along the loop, heading eased at the corners
    (function animatePilot() {
      let u = 0.12, heading = 0, started = false;
      ticks.push((dt, t) => {
        u = (u + (dt * 0.30) / pilot.routeLen) % 1;
        const p = pilot.curve.getPointAt(u);
        const tan = pilot.curve.getTangentAt(u);
        const target = Math.atan2(tan.x, tan.z);
        if (!started) { heading = target; started = true; }
        let dh = target - heading;
        while (dh > Math.PI) dh -= TAU;
        while (dh < -Math.PI) dh += TAU;
        heading += dh * Math.min(1, dt * 2.4);
        pilot.root.position.set(p.x, 0.005 + Math.sin(t * 1.55 + 0.6) * 0.008, p.z);
        pilot.root.rotation.y = heading;
        pilot.root.rotation.x = Math.sin(t * 1.9 + 0.9) * 0.009;
        pilot.root.rotation.z = Math.sin(t * 1.15 + 2.2) * 0.011;
        pilot.wake.update(dt, p.x, p.z, heading, t);
      });
    })();

    // the fishing fleet, each on her own phase of the swell
    for (let i = 0; i < fishing.length; i++) {
      const b = fishing[i];
      const ph = b.spec.phase;
      ticks.push((dt, t) => {
        b.root.position.y = Math.sin(t * 1.02 + ph) * 0.006 + Math.sin(t * 1.71 + ph * 2) * 0.0025;
        b.root.rotation.y = b.spec.heading + Math.sin(t * 0.31 + ph) * 0.012;
        b.root.rotation.z = Math.sin(t * 0.83 + ph) * 0.011;
        b.root.rotation.x = Math.sin(t * 0.67 + ph * 1.7) * 0.004;
      });
    }

    // the sailboat, unhurried
    ticks.push((dt, t) => {
      sailboat.root.position.y = Math.sin(t * 0.52 + 1.2) * 0.007;
      sailboat.root.rotation.y = sailboat.S.heading + Math.sin(t * 0.16 + 0.6) * 0.035;
      sailboat.root.rotation.z = Math.sin(t * 0.34 + 0.7) * 0.018;
      sailboat.root.rotation.x = Math.sin(t * 0.47 + 2.3) * 0.005;
      sailboat.pennant.update(t * 1.4);
    });

    // channel buoys
    for (let i = 0; i < channelBuoys.length; i++) {
      const b = channelBuoys[i];
      const ph = b.def.phase;
      ticks.push((dt, t) => {
        b.root.position.y = Math.sin(t * 1.05 + ph) * 0.006 + Math.sin(t * 1.8 + ph * 2) * 0.002;
        b.root.rotation.z = Math.sin(t * 0.8 + ph) * 0.02;
        b.root.rotation.x = Math.sin(t * 0.65 + ph * 1.3) * 0.015;
      });
    }
    // small mooring buoys
    for (let i = 0; i < mooringBuoys.length; i++) {
      const b = mooringBuoys[i];
      ticks.push((dt, t) => {
        b.root.position.y = Math.sin(t * 1.2 + b.phase) * 0.008;
        b.root.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.05;
      });
    }

    K.addTick((dt, t) => {
      for (let i = 0; i < ticks.length; i++) {
        try { ticks[i](dt, t); } catch (e) { /* keep the harbour calm */ }
      }
    });

    P.stats.parts = (P.stats.parts || 0) + 0;
  };
})();
