/* ============================================================================
 * kit.js — the shared craft kit: palette, static geometry batcher, primitives,
 * materials, instancing, canvas textures, labels/ticks/stats registries.
 * Owned by the Lead. Read-only for world builders (use it, don't edit it).
 *
 * The core idea: every static part is baked into one of ~6 merged vertex-colour
 * meshes, so thousands of tiny details cost only a handful of draw calls.
 * Animated parts are normal THREE.Object3D groups added with PORT.addObject().
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  const THREE = window.THREE;
  const K = (P.kit = {});
  K.THREE = THREE;

  /* ------------------------------------------------------------------- math */
  const TAU = (K.TAU = Math.PI * 2);
  K.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  K.lerp = (a, b, t) => a + (b - a) * t;
  K.mix = K.lerp;
  K.deg = (d) => (d * Math.PI) / 180;
  K.rad = (r) => (r * 180) / Math.PI;
  K.damp = (current, target, lambda, dt) =>
    K.lerp(current, target, 1 - Math.exp(-lambda * dt));
  K.smoothstep = (a, b, x) => {
    const t = K.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  K.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  K.easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  K.rng = (seed) => mulberry32(seed);
  K.rand = mulberry32(0xa0c0ffee); // global deterministic stream
  K.pick = (rnd, arr) => arr[Math.min(arr.length - 1, (rnd() * arr.length) | 0)];
  K.chance = (rnd, p) => rnd() < p;
  K.range = (rnd, a, b) => a + (b - a) * rnd();
  K.shuffle = (rnd, arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  /* ------------------------------------------------------------------ colour */
  // A warm, slightly faded nautical palette.  Use these and jitter slightly;
  // do not introduce saturated neon colours (except practical lights).
  K.palette = {
    paper: 0xefe4d2,
    paperDeep: 0xdccdb8,
    paperWarm: 0xf6ecda,
    ink: 0x2f2a24,
    inkSoft: 0x6b6155,
    waterDeep: 0x17474a,
    waterMid: 0x2b6a66,
    waterShallow: 0x5b9587,
    foam: 0xefe7d6,
    sand: 0xd9c8a6,
    pebble: 0xa99c86,
    rock: 0x8c8070,
    rockLight: 0xb3a48d,
    stone: 0xc9b99f,
    stoneLight: 0xdccfba,
    stoneDark: 0x9b8a72,
    concrete: 0xb6ad9d,
    concreteDark: 0x8e8373,
    asphalt: 0x5d5b55,
    asphaltLight: 0x77736a,
    lineWhite: 0xd9d2c2,
    lineYellow: 0xc9a95f,
    wood: 0x5c4130,
    woodDark: 0x3f2c21,
    woodLight: 0x8a6248,
    brass: 0xb9935a,
    brassLight: 0xd8b87c,
    copper: 0xa76f49,
    rust: 0x9c5a3d,
    crane: 0x3c6b63,
    craneDark: 0x2a4f4a,
    craneLight: 0x5c8a80,
    craneTrim: 0xe6d6b9,
    hull: 0x243642,
    hullRed: 0x8d4b3f,
    shipWhite: 0xe8dfcd,
    shipCream: 0xd9cdb3,
    roofTerracotta: 0xa65f47,
    roofRust: 0x8f533f,
    roofSlate: 0x5a6570,
    roofGreen: 0x4f6a5d,
    plaster: 0xd8c3a5,
    plasterWarm: 0xc9a98e,
    plasterPale: 0xe4d7c0,
    plasterBlue: 0x9fb1ad,
    brick: 0x9c6049,
    glassDark: 0x2a4650,
    glassBlue: 0x496f77,
    foliage: 0x6d7f57,
    foliageLight: 0x87936b,
    foliageDark: 0x52684a,
    grass: 0x98a37e,
    flowerA: 0xc98c74,
    flowerB: 0xd7c08f,
    lampWarm: 0xffd9a0,
    lampCool: 0xcfe3dc,
    nightGlow: 0xffc078,
    shadow: 0x2a251f,
  };

  const colorCache = new Map();
  K.color = function (value) {
    if (value && value.isColor) return value.clone();
    if (typeof value === 'number' || typeof value === 'string') {
      let c = colorCache.get(value);
      if (!c) {
        c = new THREE.Color(value);
        colorCache.set(value, c);
      }
      return c.clone();
    }
    return new THREE.Color(0xffffff);
  };

  function hexToRgb(hex) {
    if (typeof hex === 'string') hex = parseInt(hex.replace('#', ''), 16);
    return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 };
  }
  function rgbToHex(r, g, b) {
    return (Math.round(K.clamp(r, 0, 255)) << 16) | (Math.round(K.clamp(g, 0, 255)) << 8) | Math.round(K.clamp(b, 0, 255));
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r * 255, g * 255, b * 255];
  }
  K.shade = function (hex, dl = 0, ds = 0, dh = 0) {
    const { r, g, b } = hexToRgb(hex);
    let [h, s, l] = rgbToHsl(r, g, b);
    h = (h + dh) % 1; if (h < 0) h += 1;
    s = K.clamp(s + ds, 0, 1);
    l = K.clamp(l + dl, 0.02, 0.98);
    const [rr, gg, bb] = hslToRgb(h, s, l);
    return new THREE.Color(rgbToHex(rr, gg, bb));
  };
  K.mixHex = function (a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return new THREE.Color(rgbToHex(K.lerp(A.r, B.r, t), K.lerp(A.g, B.g, t), K.lerp(A.b, B.b, t)));
  };
  K.vary = function (hex, rnd, opt = {}) {
    const dl = opt.l ?? 0.05, ds = opt.s ?? 0.06, dh = opt.h ?? 0.012;
    return K.shade(hex, (rnd() * 2 - 1) * dl, (rnd() * 2 - 1) * ds, (rnd() * 2 - 1) * dh);
  };
  // Linear-space tint toward white/black, good for sunlit vs. shaded paint.
  K.tint = (hex, amt) => {
    const c = K.color(hex);
    return amt >= 0 ? c.lerp(new THREE.Color(0xffffff), amt) : c.lerp(new THREE.Color(0x000000), -amt);
  };

  /* --------------------------------------------------------------- materials */
  K.materials = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.0, envMapIntensity: 0.5 }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.06, envMapIntensity: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.82, envMapIntensity: 1.1 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.55, envMapIntensity: 1.5 }),
    foliage: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.4 }),
    lamp: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.4, metalness: 0.0,
      emissive: new THREE.Color(0xffb56b), emissiveIntensity: 0.0, envMapIntensity: 0.5,
    }),
  };
  K.castShadowBucket = { matte: true, paint: true, metal: true, glass: false, foliage: true, lamp: false };

  const dynMatCache = new Map();
  K.std = function (color = 0xcccccc, opt = {}) {
    const key = [color, opt.roughness ?? 0.8, opt.metalness ?? 0, opt.emissive ?? -1,
      opt.emissiveIntensity ?? 0, opt.transparent ? 1 : 0, opt.opacity ?? 1,
      opt.side ?? 0, opt.flatShading ? 1 : 0, opt.map ? 'm' : '', opt.envMapIntensity ?? 1].join('|');
    let m = dynMatCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color,
        roughness: opt.roughness ?? 0.8,
        metalness: opt.metalness ?? 0,
        emissive: opt.emissive ?? 0x000000,
        emissiveIntensity: opt.emissiveIntensity ?? 0,
        transparent: !!opt.transparent,
        opacity: opt.opacity ?? 1,
        side: opt.side ?? THREE.FrontSide,
        flatShading: !!opt.flatShading,
        envMapIntensity: opt.envMapIntensity ?? 1,
      });
      if (opt.map) { m.map = opt.map; m.needsUpdate = true; }
      dynMatCache.set(key, m);
    }
    return m;
  };
  K.basic = function (color = 0xffffff, opt = {}) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: opt.transparent ?? false,
      opacity: opt.opacity ?? 1,
      side: opt.side ?? THREE.FrontSide,
      depthWrite: opt.depthWrite ?? true,
      map: opt.map ?? null,
      blending: opt.blending ?? THREE.NormalBlending,
    });
  };

  /* ------------------------------------------------------- geometry primitives */
  const geoCache = new Map();
  const cached = (key, make) => {
    let g = geoCache.get(key);
    if (!g) { g = make(); g.userData.cached = true; geoCache.set(key, g); }
    return g;
  };
  K.geoCache = geoCache;
  K.geoBox = () => cached('box', () => new THREE.BoxGeometry(1, 1, 1));
  K.geoCyl = (seg = 16, open = false) =>
    cached(`cyl:${seg}:${open}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open));
  K.geoSphere = (ws = 16, hs = 10) =>
    cached(`sph:${ws}:${hs}`, () => new THREE.SphereGeometry(1, ws, hs));
  K.geoCone = (seg = 16) => cached(`cone:${seg}`, () => new THREE.ConeGeometry(1, 1, seg));
  K.geoPlane = () => cached('plane', () => new THREE.PlaneGeometry(1, 1));
  K.geoCircle = (seg = 32) => cached(`circle:${seg}`, () => new THREE.CircleGeometry(1, seg));
  K.geoRing = (inner = 0.8, seg = 32) => cached(`ring:${inner}:${seg}`, () => new THREE.RingGeometry(inner, 1, seg));
  K.geoTorus = (R, r, rs = 8, ts = 20) =>
    cached(`torus:${R}|${r}|${rs}|${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts));
  K.geoCapsule = (r = 0.5, len = 1, cs = 6, rs = 8) =>
    cached(`cap:${r}|${len}|${cs}|${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs));
  K.cylGeo = (rt, rb, h, seg = 16) =>
    cached(`cyl2:${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1));

  // Prism from an XZ polygon, base at y=0, top at y=height.
  K.prismGeo = function (points, height) {
    const contour = points.map((p) => new THREE.Vector2(p[0], p[1]));
    let faces;
    try { faces = THREE.ShapeUtils.triangulateShape(contour, []); }
    catch (e) { faces = []; }
    const pos = [];
    const push = (ax, ay, az) => pos.push(ax, ay, az);
    // top / bottom
    for (const f of faces) {
      const [a, b, c] = f;
      const A = contour[a], B = contour[b], C = contour[c];
      push(A.x, height, A.y); push(C.x, height, C.y); push(B.x, height, B.y);
      push(A.x, 0, A.y); push(B.x, 0, B.y); push(C.x, 0, C.y);
    }
    // sides
    const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
    const cz = points.reduce((s, p) => s + p[1], 0) / points.length;
    for (let i = 0; i < points.length; i++) {
      const p = points[i], q = points[(i + 1) % points.length];
      const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
      const dx = q[0] - p[0], dz = q[1] - p[1];
      let nx = dz, nz = -dx; // candidate outward normal
      if (nx * (mx - cx) + nz * (mz - cz) < 0) { nx = -nx; nz = -nz; }
      const len = Math.hypot(nx, nz) || 1;
      nx /= len; nz /= len;
      // two triangles, normal set via face ordering; compute per-vertex normals below
      push(p[0], 0, p[1]); push(q[0], 0, q[1]); push(q[0], height, q[1]);
      push(p[0], 0, p[1]); push(q[0], height, q[1]); push(p[0], height, p[1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };

  // Convex-ish lathe from [radius, y] profile points.
  K.latheGeo = function (profile, seg = 32) {
    return new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  };

  /* ------------------------------------------------------------ batch helpers */
  const _pos = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = new THREE.Vector3();
  const _m4 = new THREE.Matrix4();
  const _nm3 = new THREE.Matrix3();

  class Batcher {
    constructor() {
      this.buckets = new Map();
      this.parts = 0;
      this.triangles = 0;
      this.meshes = [];
    }
    add(geometry, color, opts = {}) {
      if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
      let bucket = opts.bucket || 'matte';
      if (!K.materials[bucket]) bucket = 'matte';
      let b = this.buckets.get(bucket);
      if (!b) { b = { pos: [], norm: [], col: [] }; this.buckets.set(bucket, b); }

      const p = opts.pos || [0, 0, 0];
      const r = opts.rot || [0, 0, 0];
      const sc = opts.scale == null ? [1, 1, 1] : typeof opts.scale === 'number' ? [opts.scale, opts.scale, opts.scale] : opts.scale;
      _pos.set(p[0] || 0, p[1] || 0, p[2] || 0);
      if (opts.quat) _q.copy(opts.quat);
      else { _e.set(r[0] || 0, r[1] || 0, r[2] || 0, opts.order || 'XYZ'); _q.setFromEuler(_e); }
      _s.set(sc[0] ?? 1, sc[1] ?? 1, sc[2] ?? 1);
      _m4.compose(_pos, _q, _s);
      _nm3.getNormalMatrix(_m4);
      const e = _m4.elements;
      const n = _nm3.elements;

      const col = K.color(color);
      const cr = col.r, cg = col.g, cb = col.b;
      const pa = geometry.attributes.position;
      const na = geometry.attributes.normal;
      const idx = geometry.index;
      const count = idx ? idx.count : pa.count;
      const bpos = b.pos, bnorm = b.norm, bcol = b.col;
      for (let i = 0; i < count; i++) {
        const vi = idx ? idx.getX(i) : i;
        const x = pa.getX(vi), y = pa.getY(vi), z = pa.getZ(vi);
        bpos.push(
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
          const l = Math.hypot(tx, ty, tz) || 1;
          nx = tx / l; ny = ty / l; nz = tz / l;
        }
        bnorm.push(nx, ny, nz);
        bcol.push(cr, cg, cb);
      }
      this.parts++;
      this.triangles += count / 3;
    }
    finish(scene) {
      for (const [bucket, b] of this.buckets) {
        if (!b.pos.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
        g.computeBoundingSphere();
        g.computeBoundingBox();
        const mesh = new THREE.Mesh(g, K.materials[bucket]);
        mesh.name = 'batch:' + bucket;
        mesh.castShadow = !!K.castShadowBucket[bucket];
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        scene.add(mesh);
        this.meshes.push(mesh);
      }
      P.stats.parts = (P.stats.parts || 0) + this.parts;
      return this.meshes;
    }
  }
  K.Batcher = Batcher;
  K.batch = () => P.batch;

  // Static convenience helpers.  All positions are world positions.
  K.add = (geo, color, opts) => P.batch.add(geo, color, opts);
  K.box = (w, h, d, x, y, z, color, o = {}) =>
    P.batch.add(K.geoBox(), color, Object.assign({}, o, { scale: [w, h, d], pos: [x, y, z] }));
  K.cyl = (radius, h, x, y, z, color, o = {}) =>
    P.batch.add(K.geoCyl(o.seg || 16), color, Object.assign({}, o, { scale: [radius, h, radius], pos: [x, y, z] }));
  K.cone = (radius, h, x, y, z, color, o = {}) =>
    P.batch.add(K.geoCone(o.seg || 16), color, Object.assign({}, o, { scale: [radius, h, radius], pos: [x, y, z] }));
  K.sphere = (radius, x, y, z, color, o = {}) =>
    P.batch.add(K.geoSphere(o.ws || 16, o.hs || 10), color, Object.assign({}, o, { scale: [radius, radius, radius], pos: [x, y, z] }));
  K.plane = (w, h, x, y, z, color, o = {}) =>
    P.batch.add(K.geoPlane(), color, Object.assign({}, o, { scale: [w, h, 1], pos: [x, y, z] }));
  K.prism = (points, height, x, y, z, color, o = {}) =>
    P.batch.add(K.prismGeo(points, height), color, Object.assign({}, o, { pos: [x, y, z] }));
  K.lathe = (profile, seg, x, y, z, color, o = {}) =>
    P.batch.add(K.latheGeo(profile, seg), color, Object.assign({}, o, { pos: [x, y, z] }));
  K.torus = (R, r, x, y, z, color, o = {}) =>
    P.batch.add(K.geoTorus(R, r, o.rs || 8, o.ts || 20), color, Object.assign({}, o, { pos: [x, y, z] }));
  K.capsule = (r, len, x, y, z, color, o = {}) =>
    P.batch.add(K.geoCapsule(r, len, o.cs || 6, o.rs || 8), color, Object.assign({}, o, { pos: [x, y, z] }));
  // Flat disc on the ground (rotated into XZ).
  K.disc = (r, x, y, z, color, o = {}) =>
    P.batch.add(K.geoCircle(o.seg || 32), color, Object.assign({}, o, { rot: [-Math.PI / 2, 0, 0], scale: [r, r, 1], pos: [x, y, z] }));
  K.ring = (r, inner, x, y, z, color, o = {}) =>
    P.batch.add(K.geoRing(inner, o.seg || 32), color, Object.assign({}, o, { rot: [-Math.PI / 2, 0, 0], scale: [r, r, 1], pos: [x, y, z] }));

  const _up = new THREE.Vector3(0, 1, 0);
  const _va = new THREE.Vector3();
  const _vb = new THREE.Vector3();
  const _vd = new THREE.Vector3();
  function quatBetween(a, b) {
    _va.set(a[0], a[1], a[2]);
    _vb.set(b[0], b[1], b[2]);
    _vd.subVectors(_vb, _va);
    const len = _vd.length();
    _vd.normalize();
    _q.setFromUnitVectors(_up, _vd);
    return { q: _q.clone(), len };
  }
  // Round strut / pipe / cable between two points (great for cranes and rigging).
  K.strut = (a, b, radius, color, o = {}) => {
    const { q, len } = quatBetween(a, b);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    P.batch.add(K.geoCyl(o.seg || 8), color, Object.assign({}, o, { quat: q, scale: [radius, len, radius], pos: mid }));
  };
  // Square beam between two points.
  K.bar = (a, b, w, color, o = {}) => {
    const { q, len } = quatBetween(a, b);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    P.batch.add(K.geoBox(), color, Object.assign({}, o, { quat: q, scale: [w, len, o.depth || w], pos: mid }));
  };
  // Sagging rope (mooring lines, cables, laundry lines).
  K.rope = (a, b, sag, radius, color, o = {}) => {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const geo = new THREE.TubeGeometry(curve, o.segments || 10, radius, o.radial || 4, false);
    P.batch.add(geo, color, {});
  };
  // Smooth tube through 3+ points.
  K.tube = (points, radius, color, o = {}) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const geo = new THREE.TubeGeometry(curve, o.segments || Math.max(8, points.length * 5), radius, o.radial || 4, !!o.closed);
    P.batch.add(geo, color, {});
  };

  /* ------------------------------------------------------------- instancing */
  class Instancer {
    constructor(geometry, material, opts = {}) {
      this.geometry = geometry;
      this.material = material;
      this.entries = [];
      this.opts = opts;
    }
    add(opts = {}) {
      const p = opts.pos || [0, 0, 0];
      const r = opts.rot || [0, 0, 0];
      const sc = opts.scale == null ? [1, 1, 1] : typeof opts.scale === 'number' ? [opts.scale, opts.scale, opts.scale] : opts.scale;
      _pos.set(p[0], p[1], p[2]);
      _e.set(r[0] || 0, r[1] || 0, r[2] || 0);
      _q.setFromEuler(_e);
      _s.set(sc[0] ?? 1, sc[1] ?? 1, sc[2] ?? 1);
      _m4.compose(_pos, _q, _s);
      this.entries.push({ matrix: _m4.clone(), color: opts.color != null ? K.color(opts.color) : null });
      return this;
    }
    finish(scene) {
      const n = this.entries.length;
      if (!n) return null;
      const inst = new THREE.InstancedMesh(this.geometry, this.material, n);
      inst.name = this.opts.name || 'instances';
      let anyColor = false;
      for (let i = 0; i < n; i++) {
        inst.setMatrixAt(i, this.entries[i].matrix);
        if (this.entries[i].color) anyColor = true;
      }
      if (anyColor) {
        for (let i = 0; i < n; i++) inst.setColorAt(i, this.entries[i].color || new THREE.Color(1, 1, 1));
        inst.instanceColor.needsUpdate = true;
      }
      inst.castShadow = this.opts.castShadow ?? true;
      inst.receiveShadow = this.opts.receiveShadow ?? true;
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      scene.add(inst);
      return inst;
    }
  }
  K.Instancer = Instancer;
  K.instancer = (geo, mat, opts) => new Instancer(geo, mat, opts);

  /* -------------------------------------------------------------- textures */
  K.canvas = function (w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (draw) draw(ctx, w, h);
    return c;
  };
  K.texture = function (canvas, opts = {}) {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = opts.anisotropy ?? (P.renderer ? Math.min(8, P.renderer.capabilities.getMaxAnisotropy()) : 4);
    if (opts.repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    if (opts.offset) t.offset.set(opts.offset[0], opts.offset[1]);
    t.needsUpdate = true;
    return t;
  };
  K.fonts = {
    serif: '"Fraunces", "Songti SC", "STSong", "Noto Serif SC", serif',
    song: '"Songti SC", "STSong", "Noto Serif SC", serif',
    sans: '"Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif',
    mono: '"DM Mono", "SFMono-Regular", Menlo, monospace',
  };

  // Draw 1..n lines of text on a canvas texture and (optionally) make a sign
  // mesh attached to the scene.  Handles Chinese + Latin.
  K.textTexture = function (opt = {}) {
    const w = opt.width || 512;
    const h = opt.height || 128;
    const canvas = K.canvas(w, h, (ctx) => {
      if (opt.bg) {
        ctx.fillStyle = opt.bg;
        if (opt.radius) {
          const r = opt.radius;
          ctx.beginPath();
          ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r);
          ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.closePath(); ctx.fill();
        } else ctx.fillRect(0, 0, w, h);
      }
      if (opt.border) {
        ctx.strokeStyle = opt.border;
        ctx.lineWidth = opt.borderWidth || Math.max(2, h * 0.03);
        const inset = ctx.lineWidth / 2 + (opt.borderInset || h * 0.06);
        ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      }
      const lines = opt.lines || [{ text: opt.text || '', size: h * 0.44, font: opt.font || K.fonts.sans, color: opt.fg || '#f2e7cf', weight: opt.weight || 600, spacing: opt.letterSpacing || 0 }];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const padX = (opt.padX ?? 0.08) * w;
      const padY = (opt.padY ?? 0.1) * h;
      const total = lines.reduce((s, l) => s + (l.size || h * 0.4) * (l.lineHeight || 1.18), 0);
      let y = (h - total) / 2 + padY * 0.2;
      for (const line of lines) {
        const size = line.size || h * 0.4;
        ctx.font = `${line.weight || 600} ${size}px ${line.font || K.fonts.sans}`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = (line.spacing || 0) + 'px';
        ctx.fillStyle = line.color || opt.fg || '#f2e7cf';
        ctx.fillText(line.text, w / 2, y + size * 0.58, w - padX * 2);
        y += size * (line.lineHeight || 1.18);
      }
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      if (opt.grain) {
        const img = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < img.data.length; i += 4) {
          const n = (Math.random() - 0.5) * (opt.grain || 10);
          img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
        }
        ctx.putImageData(img, 0, 0);
      }
    });
    return K.texture(canvas, { anisotropy: 8 });
  };

  K.sign = function (opt = {}) {
    const aspect = opt.height && opt.width ? opt.width / opt.height : (opt.aspect || 4);
    const cw = 512;
    const ch = Math.round(cw / aspect);
    const tex = K.textTexture(Object.assign({ width: cw, height: ch }, opt));
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.62,
      metalness: 0.05,
      side: opt.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      transparent: true,
      alphaTest: 0.02,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: opt.night === false ? 0.0 : 0.015,
    });
    const width = opt.w || 1;
    const height = opt.h != null ? opt.h : opt.hgt != null ? opt.hgt : width / aspect;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    mesh.position.set(opt.x || 0, opt.y || 0, opt.z || 0);
    mesh.rotation.set(opt.rx || 0, opt.ry || 0, opt.rz || 0);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (P.scene) P.scene.add(mesh);
    if (opt.night !== false) P.nightSigns.push(mat);
    return mesh;
  };

  K.glowTexture = (() => {
    let tex = null;
    return function () {
      if (tex) return tex;
      const canvas = K.canvas(128, 128, (ctx) => {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
      });
      tex = K.texture(canvas);
      return tex;
    };
  })();
  K.glowSprite = function (color, size, opacity = 1, blending = THREE.AdditiveBlending) {
    const mat = new THREE.SpriteMaterial({
      map: K.glowTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, 1);
    return sprite;
  };
  K.softTexture = (() => {
    let tex = null;
    return function (softness = 0.7) {
      if (tex) return tex;
      const canvas = K.canvas(128, 128, (ctx) => {
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,0.9)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.42)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
      });
      tex = K.texture(canvas);
      return tex;
    };
  })();

  /* -------------------------------------------------------------- registries */
  P.stats = P.stats || {};
  P.labels = P.labels || [];
  P.ticks = P.ticks || [];
  P.nightSigns = P.nightSigns || [];
  P.anchors = P.anchors || {};
  P.env = P.env || { mix: 0, time: 0 };

  K.count = (key, n = 1) => { P.stats[key] = (P.stats[key] || 0) + n; };
  K.addTick = (fn) => { P.ticks.push(fn); };
  K.addLabel = (data) => { P.labels.push(data); };
  K.addObject = (obj) => {
    if (!P.scene) return obj;
    P.scene.add(obj);
    return obj;
  };
  K.setShadows = (obj, cast = true, receive = true) => {
    obj.traverse((o) => {
      if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
    });
  };
  K.anchor = (name, data) => { P.anchors[name] = data; };
  K.flag = () => {}; // reserved

  /* ------------------------------------------------------------------- misc */
  K.splinePoints = (points, n = 24) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return curve.getPoints(n);
  };
  K.mesh = (geo, mat) => new THREE.Mesh(geo, mat);
  K.group = (children = []) => {
    const g = new THREE.Group();
    for (const c of children) g.add(c);
    return g;
  };
  K.v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  K.euler = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);

  K.version = '1.0';
})();
