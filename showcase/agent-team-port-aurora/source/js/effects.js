/* ============================================================================
 * effects.js — ambient life for Port Aurora.
 *
 * Seagulls (flying + perched), funnel/chimney smoke, the rotating lighthouse
 * beam, night navigation lights, gallery dust motes, flags and street bunting.
 * No static architecture lives here — only animated, weightless things.
 * Owned by teammate `effects`.
 *
 * Conventions (see docs/CONTRACT.md):
 *   - builder runs LAST: terrain → terminal → fleet → town → effects, so
 *     PORT.anchors may already be refined by the other modules.  Every anchor
 *     read is defensive and has a layout fallback.
 *   - no per-frame allocations in the hot path; shared textures/materials;
 *     deterministic geometry via K.rng.
 *   - P.reducedMotion disables flight and slows/settles everything else.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  P.builders = P.builders || {};

  P.builders.effects = function effects(ctx) {
    const THREE = ctx.THREE;
    const K = ctx.kit;
    const L = ctx.layout;
    const W = L.W;
    const scene = ctx.scene;
    const renderer = ctx.renderer;
    const camera = ctx.camera;
    const fxStart = scene.children.length;
    const rnd = K.rng(0x5ea9f00d);
    const reduced = !!P.reducedMotion;
    const TAU = Math.PI * 2;
    const env = P.env;

    /* ------------------------------------------------------------- palette */
    const WHITE = new THREE.Color(0xf3efe4);
    const GREY = new THREE.Color(0xc6c9c8);
    const DARKGREY = new THREE.Color(0x8f979c);

    /* ------------------------------------------------------------- scratch */
    const _v1 = new THREE.Vector3();
    const _q1 = new THREE.Quaternion();
    const _e1 = new THREE.Euler();
    const _m1 = new THREE.Matrix4();
    const _s1 = new THREE.Vector3();
    const _c1 = new THREE.Color();
    const _bufSize = new THREE.Vector2();

    /* ====================================================================
     * 0. ANCHOR READING (defensive: {pos:[..]} | [..] | Vector3 | {x,y,z})
     * ================================================================= */
    function readPos(value) {
      if (!value) return null;
      if (Array.isArray(value)) {
        if (value.length >= 3 && typeof value[0] === 'number') {
          return new THREE.Vector3(value[0], value[1], value[2]);
        }
        return null;
      }
      if (value.isVector3) return value.clone();
      if (value.pos) return readPos(value.pos);
      if (value.position) return readPos(value.position);
      if (typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number') {
        return new THREE.Vector3(value.x, value.y, value.z);
      }
      return null;
    }

    function anchorPos(name, fallback) {
      const v = readPos(P.anchors && P.anchors[name]);
      if (v) return v;
      return fallback ? new THREE.Vector3(fallback[0], fallback[1], fallback[2]) : null;
    }

    function anchorList(name) {
      const a = P.anchors && P.anchors[name];
      if (!a) return [];
      let raw = [];
      if (Array.isArray(a)) {
        if (a.length >= 3 && typeof a[0] === 'number') raw = [a];
        else raw = a;
      } else if (Array.isArray(a.points)) {
        raw = a.points;
      } else if (Array.isArray(a.positions)) {
        raw = a.positions;
      } else if (Array.isArray(a.list)) {
        raw = a.list;
      } else if (a.pos || a.position) {
        raw = [a];
      }
      const out = [];
      for (let i = 0; i < raw.length; i++) {
        const v = readPos(raw[i]);
        if (v) out.push(v);
      }
      return out;
    }

    function hasStat(key) {
      return !!(P.stats && P.stats[key]);
    }

    /* ====================================================================
     * 1. GEOMETRY CRAFTING (merge vertex-coloured parts into one mesh)
     * ================================================================= */
    function prepPart(part) {
      const src = part.geo;
      const g = src.index ? src.toNonIndexed() : src.clone();
      if (part.pos || part.rot || part.scale) {
        _e1.set(
          part.rot ? part.rot[0] : 0,
          part.rot ? part.rot[1] : 0,
          part.rot ? part.rot[2] : 0
        );
        _q1.setFromEuler(_e1);
        _v1.set(
          part.pos ? part.pos[0] : 0,
          part.pos ? part.pos[1] : 0,
          part.pos ? part.pos[2] : 0
        );
        _s1.set(
          part.scale ? part.scale[0] : 1,
          part.scale ? part.scale[1] : 1,
          part.scale ? part.scale[2] : 1
        );
        _m1.compose(_v1, _q1, _s1);
        g.applyMatrix4(_m1);
      }
      const pos = g.attributes.position;
      const count = pos.count;
      const colors = new Float32Array(count * 3);
      if (part.colorFn) {
        for (let i = 0; i < count; i++) {
          part.colorFn(pos.getX(i), pos.getY(i), pos.getZ(i), i, _c1);
          colors[i * 3] = _c1.r;
          colors[i * 3 + 1] = _c1.g;
          colors[i * 3 + 2] = _c1.b;
        }
      } else {
        _c1.set(part.color === undefined ? 0xffffff : part.color);
        for (let i = 0; i < count; i++) {
          colors[i * 3] = _c1.r;
          colors[i * 3 + 1] = _c1.g;
          colors[i * 3 + 2] = _c1.b;
        }
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return g;
    }

    function mergeParts(parts) {
      const geos = parts.map(prepPart);
      let total = 0;
      for (let i = 0; i < geos.length; i++) total += geos[i].attributes.position.count;
      const position = new Float32Array(total * 3);
      const normal = new Float32Array(total * 3);
      const color = new Float32Array(total * 3);
      let off = 0;
      for (let i = 0; i < geos.length; i++) {
        const g = geos[i];
        position.set(g.attributes.position.array, off * 3);
        if (g.attributes.normal) normal.set(g.attributes.normal.array, off * 3);
        color.set(g.attributes.color.array, off * 3);
        off += g.attributes.position.count;
        g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(position, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      out.setAttribute('color', new THREE.BufferAttribute(color, 3));
      out.computeBoundingSphere();
      return out;
    }

    /* ====================================================================
     * 2. SEAGULLS
     * ================================================================= */
    // A gull is: one merged vertex-coloured body + two flapping wing meshes.
    // Body faces +z, wings spread along ±x.  The right wing is a mirrored
    // parent group with a negated roll so both wings beat symmetrically.

    function buildWingGeometry() {
      const cols = [
        { x: 0.0, lead: 0.125, trail: -0.19, y: 0.0, col: new THREE.Color(0xe9e4d7) },
        { x: 0.22, lead: 0.142, trail: -0.2, y: 0.012, col: new THREE.Color(0xd2d5d1) },
        { x: 0.48, lead: 0.1, trail: -0.155, y: 0.026, col: new THREE.Color(0xa8b0af) },
        { x: 0.68, lead: 0.05, trail: -0.1, y: 0.034, col: new THREE.Color(0x7c8488) },
        { x: 0.86, lead: -0.012, trail: -0.046, y: 0.042, col: new THREE.Color(0x2f3439) },
      ];
      const position = [];
      const color = [];
      const vtx = (x, z, y, c) => {
        position.push(x, y, z);
        color.push(c.r, c.g, c.b);
      };
      for (let i = 0; i < cols.length - 1; i++) {
        const a = cols[i];
        const b = cols[i + 1];
        vtx(a.x, a.lead, a.y, a.col);
        vtx(b.x, b.lead, b.y, b.col);
        vtx(b.x, b.trail, b.y, b.col);
        vtx(a.x, a.lead, a.y, a.col);
        vtx(b.x, b.trail, b.y, b.col);
        vtx(a.x, a.trail, a.y, a.col);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
      g.computeVertexNormals();
      return g;
    }

    const wingGeo = buildWingGeometry();

    function gullBodyParts(lift) {
      return [
        {
          geo: K.geoSphere(10, 7).clone(),
          pos: [0, lift, 0],
          scale: [0.092, 0.082, 0.305],
          colorFn: (x, y, z, i, out) => {
            const back = 1 - K.smoothstep(-0.17, 0.09, z);
            out.copy(WHITE).lerp(GREY, back * 0.86);
            out.lerp(DARKGREY, K.smoothstep(0.008, 0.078, y) * back * 0.55);
          },
        },
        {
          geo: K.geoSphere(8, 6).clone(),
          pos: [0, lift + 0.092, 0.246],
          scale: [0.062, 0.06, 0.072],
          color: 0xf5f1e6,
        },
        {
          geo: K.geoCone(6).clone(),
          pos: [0, lift + 0.078, 0.344],
          rot: [Math.PI / 2, 0, 0],
          scale: [0.019, 0.098, 0.019],
          color: 0xd3a04b,
        },
        {
          geo: K.geoSphere(5, 4).clone(),
          pos: [0.043, lift + 0.108, 0.266],
          scale: [0.009, 0.009, 0.009],
          color: 0x2c2a26,
        },
        {
          geo: K.geoSphere(5, 4).clone(),
          pos: [-0.043, lift + 0.108, 0.266],
          scale: [0.009, 0.009, 0.009],
          color: 0x2c2a26,
        },
        {
          geo: K.geoCone(5).clone(),
          pos: [0, lift + 0.004, -0.296],
          rot: [-Math.PI / 2, 0, 0],
          scale: [0.078, 0.17, 0.02],
          color: 0xe7e3d8,
        },
      ];
    }

    const flyBodyGeo = mergeParts(gullBodyParts(0));

    function foldedWingParts() {
      return [
        {
          geo: wingGeo.clone(),
          pos: [0.072, 0.128, -0.02],
          rot: [0, Math.PI / 2 - 0.13, -0.36],
          scale: [0.58, 0.58, 0.58],
        },
        {
          geo: wingGeo.clone(),
          pos: [-0.072, 0.128, -0.02],
          rot: [0, -Math.PI / 2 + 0.13, 0.36],
          scale: [-0.58, 0.58, 0.58],
        },
      ];
    }

    function perchedLegParts() {
      return [
        {
          geo: K.geoCyl(5).clone(),
          pos: [0.03, 0.055, 0.045],
          scale: [0.006, 0.11, 0.006],
          color: 0xb0763f,
        },
        {
          geo: K.geoCyl(5).clone(),
          pos: [-0.03, 0.055, 0.045],
          scale: [0.006, 0.11, 0.006],
          color: 0xb0763f,
        },
        {
          geo: K.geoBox().clone(),
          pos: [0.03, 0.006, 0.058],
          scale: [0.022, 0.012, 0.04],
          color: 0xa06d3c,
        },
        {
          geo: K.geoBox().clone(),
          pos: [-0.03, 0.006, 0.058],
          scale: [0.022, 0.012, 0.04],
          color: 0xa06d3c,
        },
      ];
    }

    const perchGeo = mergeParts(gullBodyParts(0.118).concat(foldedWingParts(), perchedLegParts()));

    const gullMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.5,
    });

    /* ---------------------------------------------------- hexagonal anchor */
    const lampPos = anchorPos('lighthouseLamp', [10.05, 2.65, 7.5]);

    // Crane tips: prefer anchors registered by terminal, else derive from the
    // layout crane row once the terminal has actually been built.
    const craneTips = anchorList('craneTips').concat(anchorList('craneTip')).concat(anchorList('cranes'));
    if (!craneTips.length && (hasStat('cranes') || (P.stats && P.stats.parts > 420))) {
      const xs = (L.zones && L.zones.terminal && L.zones.terminal.cranes) || [-6.4, -2.0, 2.4, 6.8];
      for (let i = 0; i < xs.length; i++) craneTips.push(new THREE.Vector3(xs[i], 8.15, -5.35));
    }
    // de-duplicate roughly (anchor scans can repeat a single point)
    for (let i = craneTips.length - 1; i > 0; i--) {
      if (craneTips[i].distanceTo(craneTips[i - 1]) < 0.05) craneTips.splice(i, 1);
    }

    const flyers = [];
    const perched = [];
    const loops = (L.routes && L.routes.gullLoops) || [
      { cx: 1, cz: 2, r: 7.5, y: 7.2, speed: 0.35, phase: 0 },
      { cx: -4, cz: 7, r: 5.2, y: 6.0, speed: 0.28, phase: 2.1 },
      { cx: 6, cz: 5, r: 4.4, y: 8.0, speed: 0.4, phase: 4.0 },
    ];

    function breakwaterPerch(fraction) {
      const pts = (L.breakwater && L.breakwater.points) || [];
      let p = { x: 12.0, z: 4.0, angle: 0 };
      if (pts.length > 1 && L.samplePolyline) p = L.samplePolyline(pts, fraction);
      const dx = -p.x;
      const dz = -p.z;
      const len = Math.hypot(dx, dz) || 1;
      return new THREE.Vector3(p.x + (dx / len) * 0.30, 1.255, p.z + (dz / len) * 0.30);
    }

    const perchSpots = [];
    if (reduced) {
      perchSpots.push(breakwaterPerch(0.2), breakwaterPerch(0.34), breakwaterPerch(0.48),
        breakwaterPerch(0.62), breakwaterPerch(0.74));
    } else {
      perchSpots.push(breakwaterPerch(0.3), breakwaterPerch(0.52));
    }
    perchSpots.push(new THREE.Vector3(lampPos.x + 0.54, lampPos.y - 0.42, lampPos.z + 0.05));
    if (craneTips.length > 1) {
      _v1.copy(craneTips[craneTips.length - 1]);
      perchSpots.push(new THREE.Vector3(_v1.x, _v1.y + 0.03, _v1.z));
    } else {
      perchSpots.push(breakwaterPerch(0.68));
    }
    if (reduced) {
      if (craneTips.length > 0) perchSpots.push(new THREE.Vector3(craneTips[0].x, craneTips[0].y + 0.03, craneTips[0].z));
      else perchSpots.push(breakwaterPerch(0.86));
    }

    // Building flying gulls ---------------------------------------------------
    if (!reduced) {
      for (let i = 0; i < 8; i++) {
        const loopIndex = i % loops.length;
        const loop = loops[loopIndex];
        const r = loop.r * (0.88 + (i % 3) * 0.08 + rnd() * 0.06);
        const sz = loopIndex === 0 ? 0.52 : loopIndex === 1 ? 0.82 : 0.78;
        const group = new THREE.Group();
        group.rotation.order = 'YXZ';
        const body = new THREE.Mesh(flyBodyGeo, gullMat);
        group.add(body);
        const wl = new THREE.Group();
        wl.position.set(0.072, 0.03, 0.012);
        const wlMesh = new THREE.Mesh(wingGeo, gullMat);
        wl.add(wlMesh);
        group.add(wl);
        const wr = new THREE.Group();
        wr.position.set(-0.072, 0.03, 0.012);
        wr.scale.x = -1;
        const wrMesh = new THREE.Mesh(wingGeo, gullMat);
        wr.add(wrMesh);
        group.add(wr);
        // Model scale: real gull wingspan ~1.3 m -> ~0.13 world units at 1:1000.
        // Two 'charm' birds are a touch larger so they read when the camera is close.
        const scl = 0.055 + rnd() * 0.028 + (i < 2 ? 0.055 : 0);
        group.scale.setScalar(scl);
        group.position.set(loop.cx, loop.y, loop.cz);
        scene.add(group);
        flyers.push({
          group,
          wl,
          wr,
          cx: loop.cx,
          cz: loop.cz,
          r,
          rz: r * sz,
          y: loop.y + (loopIndex === 0 ? 0.0 : loopIndex === 1 ? -0.6 : -0.35) + (rnd() - 0.5) * 0.5,
          dir: 1,
          phase: loop.phase + rnd() * TAU,
          omega: loop.speed * (0.82 + rnd() * 0.4),
          bob: rnd() * TAU,
          flapPh: rnd() * TAU,
          flapRate: 2.05 + rnd() * 0.9,
        });
      }
    }

    // Perched gulls -----------------------------------------------------------
    for (let i = 0; i < perchSpots.length; i++) {
      const p = perchSpots[i];
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(perchGeo, gullMat);
      group.add(mesh);
      group.scale.setScalar(0.15 + rnd() * 0.05);
      group.position.copy(p);
      const face = Math.atan2(-p.x + (rnd() - 0.5) * 3, -p.z + (rnd() - 0.5) * 3);
      group.rotation.y = face;
      scene.add(group);
      perched.push({ group, yaw: face, phase: rnd() * TAU });
    }

    function updateGulls(dt, tt) {
      for (let i = 0; i < flyers.length; i++) {
        const g = flyers[i];
        const a = g.phase + tt * g.omega * g.dir;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        g.group.position.set(
          g.cx + ca * g.r,
          g.y + Math.sin(tt * 0.42 + g.bob) * 0.07,
          g.cz + sa * g.rz
        );
        const dx = -sa * g.r * g.dir;
        const dz = ca * g.rz * g.dir;
        const yaw = Math.atan2(dx, dz);
        g.group.rotation.y = yaw;
        g.group.rotation.z = 0.17 * g.dir;
        g.group.rotation.x = Math.sin(tt * 0.9 + g.bob) * 0.035;
        const burst = 0.5 + 0.5 * Math.sin(tt * (0.19 + g.flapRate * 0.035) + g.flapPh);
        const amp = 0.14 + 0.86 * burst * burst;
        const flap = 0.10 + Math.sin(tt * g.flapRate + g.flapPh) * 0.55 * amp;
        g.wl.rotation.z = flap;
        g.wr.rotation.z = -flap;
      }
      for (let i = 0; i < perched.length; i++) {
        const p = perched[i];
        p.group.rotation.y = p.yaw + Math.sin(tt * 0.31 + p.phase) * 0.11;
      }
    }

    /* ====================================================================
     * 3. SMOKE & STEAM  (soft sprites, normal blending, recycled life cycles)
     * ================================================================= */
    const softTex = K.softTexture();
    const smokeSources = [
      {
        pos: anchorPos('shipFunnel', [5.15, 3.05, -2.55]),
        count: 6, dayColor: 0xd3cdc1, nightColor: 0xa79f92,
        rise: 2.1, driftX: 0.34, driftZ: 0.16, size0: 0.16, size1: 1.34,
        alpha: 0.34, period: 8.1, spread: 0.16, wobble: 0.2,
      },
      {
        pos: anchorPos('tugFunnel', [5.85, 1.15, 4.95]),
        count: 4, dayColor: 0xd8d2c6, nightColor: 0xaaa295,
        rise: 1.25, driftX: 0.24, driftZ: 0.2, size0: 0.12, size1: 0.88,
        alpha: 0.29, period: 6.6, spread: 0.12, wobble: 0.15,
      },
      {
        pos: anchorPos('locoStack', [0.0, 2.1, -10.35]),
        count: 5, dayColor: 0x8f877b, nightColor: 0x6d675d,
        rise: 1.25, driftX: 0.2, driftZ: 0.05, size0: 0.13, size1: 0.95,
        alpha: 0.34, period: 7.4, spread: 0.14, wobble: 0.13,
      },
      {
        pos: anchorPos('bakeryChimney', [-11.15, 2.6, -6.4]),
        count: 4, dayColor: 0xe8dfcd, nightColor: 0xbcb2a2,
        rise: 1.0, driftX: 0.2, driftZ: 0.12, size0: 0.1, size1: 0.72,
        alpha: 0.24, period: 7.0, spread: 0.1, wobble: 0.12,
      },
      {
        pos: anchorPos('fishSteam', [-9.95, 1.75, 0.9]),
        count: 2, dayColor: 0xece9de, nightColor: 0xc4bdae,
        rise: 0.8, driftX: 0.16, driftZ: 0.1, size0: 0.09, size1: 0.55,
        alpha: 0.2, period: 5.6, spread: 0.08, wobble: 0.1,
      },
    ];

    // A few pale wisps from town chimneys, if town registered them.
    const townChimneys = anchorList('townChimneys').slice(0, 3);
    for (let i = 0; i < townChimneys.length; i++) {
      smokeSources.push({
        pos: townChimneys[i],
        count: 1, dayColor: 0xded6c6, nightColor: 0xb2a897,
        rise: 0.95, driftX: 0.18, driftZ: 0.08, size0: 0.08, size1: 0.5,
        alpha: 0.2, period: 5.8, spread: 0.06, wobble: 0.1,
      });
    }

    const puffs = [];
    for (let si = 0; si < smokeSources.length; si++) {
      const src = smokeSources[si];
      let count = src.count;
      if (reduced) count = Math.max(2, Math.round(count * 0.6));
      for (let i = 0; i < count; i++) {
        const mat = new THREE.SpriteMaterial({
          map: softTex,
          color: src.dayColor,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: true,
          blending: THREE.NormalBlending,
          fog: true,
        });
        const sprite = new THREE.Sprite(mat);
        sprite.renderOrder = 4;
        sprite.position.copy(src.pos);
        scene.add(sprite);
        puffs.push({
          sprite,
          mat,
          ox: src.pos.x,
          oy: src.pos.y,
          oz: src.pos.z,
          dayColor: new THREE.Color(src.dayColor),
          nightColor: new THREE.Color(src.nightColor),
          driftX: src.driftX,
          driftZ: src.driftZ,
          rise: src.rise,
          s0: src.size0,
          s1: src.size1 * (0.85 + rnd() * 0.35),
          alpha: src.alpha,
          period: src.period * (0.85 + rnd() * 0.3),
          spread: src.spread,
          wobble: src.wobble,
          age: (i + rnd() * 0.55) / count,
          ph: rnd() * TAU,
          rot: (rnd() - 0.5) * 0.7,
          spin: (rnd() - 0.5) * 0.4,
          tilt: 0.88 + rnd() * 0.24,
        });
      }
      K.count('parts', count);
    }

    function updateSmoke(dt, tt, mix) {
      const speed = reduced ? 0.32 : 1;
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        p.age += (dt / p.period) * speed;
        if (p.age >= 1) p.age -= 1;
        const a = p.age;
        const grow = Math.pow(a, 0.7);
        p.sprite.position.set(
          p.ox + p.driftX * a * p.period + Math.sin(tt * 0.57 + p.ph) * p.wobble * a,
          p.oy + p.rise * Math.pow(a, 0.92) + p.spread * Math.sin(tt * 0.9 + p.ph * 2.1) * a,
          p.oz + p.driftZ * a * p.period + Math.cos(tt * 0.43 + p.ph * 1.7) * p.wobble * a
        );
        const s = p.s0 + (p.s1 - p.s0) * grow;
        p.sprite.scale.set(s, s * p.tilt, 1);
        const fadeIn = K.smoothstep(0, 0.14, a);
        const fadeOut = 1 - K.smoothstep(0.5, 1.0, a);
        p.mat.opacity = p.alpha * fadeIn * fadeOut * (reduced ? 0.82 : 1);
        p.mat.color.copy(p.dayColor).lerp(p.nightColor, mix * 0.85);
        p.mat.rotation = p.rot + a * p.spin;
      }
    }

    /* ====================================================================
     * 4. LIGHTHOUSE BEAM + LENS
     * ================================================================= */
    // A hollow cone drawn with a custom additive shader: warm colour, soft
    // view-dependent edges and a far-end fade so it can only add light and
    // never paints the gallery wall / plinth rim.
    const beamLength = 9;
    const BEAM_VERT = [
      'uniform float uLength;',
      'varying float vT;',
      'varying float vEdge;',
      'varying vec3 vWorld;',
      'void main() {',
      '  vT = clamp(-position.y / uLength, 0.0, 1.0);',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  vec3 n = normalize(normalMatrix * normal);',
      '  vec3 v = normalize(-mv.xyz);',
      '  vEdge = abs(dot(n, v));',
      '  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n');
    const BEAM_FRAG = [
      'uniform vec3 uColor;',
      'uniform float uOpacity;',
      'uniform float uFadePow;',
      'varying float vT;',
      'varying float vEdge;',
      'varying vec3 vWorld;',
      'void main() {',
      '  float along = clamp(vT, 0.0, 1.0);',
      '  float farFade = pow(1.0 - along, uFadePow) * (1.0 - smoothstep(0.60, 0.96, along));',
      '  float startFade = smoothstep(0.0, 0.06, along);',
      '  float edge = mix(0.04, 1.0, smoothstep(0.02, 0.8, vEdge));',
      '  float basin = 1.0 - smoothstep(13.3, 15.3, length(vWorld.xz));',
      '  float a = uOpacity * farFade * startFade * edge * basin;',
      '  if (a < 0.0012) discard;',
      '  gl_FragColor = vec4(uColor, a);',
      '}',
    ].join('\n');

    const beamGroup = new THREE.Group();
    beamGroup.position.copy(lampPos);
    scene.add(beamGroup);

    const beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uLength: { value: beamLength },
        uColor: { value: new THREE.Color(0xffbf74) },
        uOpacity: { value: 0 },
        uFadePow: { value: 1.8 },
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.ConeGeometry(0.72, beamLength, 20, 10, true);
    beamGeo.translate(0, -beamLength / 2, 0);
    const downAxis = new THREE.Vector3(0, -1, 0);
    const beamA = new THREE.Mesh(beamGeo, beamMat);
    beamA.quaternion.setFromUnitVectors(downAxis, new THREE.Vector3(1, -0.05, 0).normalize());
    const beamB = new THREE.Mesh(beamGeo, beamMat);
    beamB.quaternion.setFromUnitVectors(downAxis, new THREE.Vector3(-1, -0.05, 0).normalize());
    beamA.renderOrder = 6;
    beamB.renderOrder = 6;
    beamGroup.add(beamA, beamB);

    const lensGlow = K.glowSprite(0xffd9a0, 1.05, 0.08);
    lensGlow.position.copy(lampPos);
    lensGlow.renderOrder = 7;
    scene.add(lensGlow);
    const lensCore = K.glowSprite(0xfff6e2, 0.34, 0.12);
    lensCore.position.copy(lampPos);
    lensCore.renderOrder = 8;
    scene.add(lensCore);

    // A very soft warm pool of light on the water that follows the sweep.
    function buildPoolTexture() {
      return K.texture(
        K.canvas(256, 64, (c2d, w, h) => {
          const g = c2d.createLinearGradient(0, 0, w, 0);
          g.addColorStop(0, 'rgba(255,241,212,0.95)');
          g.addColorStop(0.35, 'rgba(255,226,176,0.32)');
          g.addColorStop(1, 'rgba(255,220,160,0)');
          c2d.fillStyle = g;
          c2d.fillRect(0, 0, w, h);
          const v = c2d.createLinearGradient(0, 0, 0, h);
          v.addColorStop(0, 'rgba(0,0,0,0)');
          v.addColorStop(0.5, 'rgba(0,0,0,1)');
          v.addColorStop(1, 'rgba(0,0,0,0)');
          c2d.globalCompositeOperation = 'destination-in';
          c2d.fillStyle = v;
          c2d.fillRect(0, 0, w, h);
        })
      );
    }

    const sweepGroup = new THREE.Group();
    sweepGroup.position.set(lampPos.x, 0.04, lampPos.z);
    scene.add(sweepGroup);
    const poolGeo = new THREE.PlaneGeometry(10, 3.0);
    poolGeo.translate(5, 0, 0);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshBasicMaterial({
      map: buildPoolTexture(),
      color: 0xffcb86,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    });
    const poolA = new THREE.Mesh(poolGeo, poolMat);
    const poolB = new THREE.Mesh(poolGeo, poolMat);
    poolB.rotation.y = Math.PI;
    poolA.renderOrder = 3;
    poolB.renderOrder = 3;
    sweepGroup.add(poolA, poolB);

    const beamAngle0 = 2.35;

    function updateLighthouse(dt, tt, mix, night) {
      beamGroup.rotation.y = reduced ? beamAngle0 : beamAngle0 + tt * 0.235;
      sweepGroup.rotation.y = beamGroup.rotation.y;
      // Strictly night-gated: at mix 0 the shaft/glow are exactly invisible.
      const beamFade = K.smoothstep(0.28, 0.92, mix);
      const camDist = camera.position.distanceTo(lampPos);
      const nearFade = K.smoothstep(6, 13, camDist);
      beamMat.uniforms.uOpacity.value = 0.115 * beamFade * nearFade * (reduced ? 0.82 : 1);
      lensGlow.material.opacity = 0.4 * beamFade;
      lensCore.material.opacity = 0.62 * beamFade;
      poolMat.opacity = 0.018 * beamFade * nearFade;
      // lens swells faintly with the sweep, like a mariner's blink
      const pulse = 0.9 + 0.1 * Math.sin(tt * 0.55);
      lensGlow.scale.setScalar(0.92 * (0.95 + 0.08 * Math.sin(tt * 0.31)));
      lensCore.scale.setScalar(0.3 * pulse);
    }

    /* ====================================================================
     * 5. SHADERED SPRITE POINTS — nav lights, water glints, dust motes
     *    (one draw call each; per-point size/phase/colour in attributes)
     * ================================================================= */
    const NAV_VERT = [
      'uniform float uTime;',
      'uniform float uScale;',
      'uniform float uNight;',
      'uniform float uBoost;',
      'attribute vec3 aColor;',
      'attribute float aSize;',
      'attribute float aPhase;',
      'attribute float aFreq;',
      'attribute float aDay;',
      'attribute float aPattern;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'void main() {',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      '  float dist = max(0.12, -mv.z);',
      '  gl_PointSize = clamp(aSize * uScale / dist, 1.0, 96.0);',
      '  float s = sin(uTime * aFreq + aPhase);',
      '  float blink = smoothstep(0.15, 0.95, s);',
      '  blink *= blink;',
      '  float steady = 0.62 + 0.38 * sin(uTime * aFreq * 0.45 + aPhase * 1.7);',
      '  float shape = mix(steady, blink, aPattern);',
      '  float vis = mix(aDay, 1.0, uNight);',
      '  vAlpha = shape * vis;',
      '  vColor = aColor * uBoost;',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n');

    const NAV_FRAG = [
      'uniform sampler2D uMap;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'void main() {',
      '  float a = texture2D(uMap, gl_PointCoord).a;',
      '  if (a < 0.004) discard;',
      '  gl_FragColor = vec4(vColor, a * vAlpha);',
      '}',
    ].join('\n');

    const DUST_VERT = [
      'uniform float uTime;',
      'uniform float uScale;',
      'uniform float uOpacity;',
      'attribute vec3 aColor;',
      'attribute float aSize;',
      'attribute float aPhase;',
      'attribute float aSpeed;',
      'attribute float aAmp;',
      'attribute float aTw;',
      'varying vec3 vColor;',
      'varying float vAlpha;',
      'void main() {',
      '  vec3 p = position;',
      '  p.x += sin(uTime * aSpeed + aPhase) * aAmp;',
      '  p.y += sin(uTime * aSpeed * 0.73 + aPhase * 1.7) * aAmp * 0.8;',
      '  p.z += cos(uTime * aSpeed * 0.87 + aPhase * 2.3) * aAmp;',
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
      '  gl_PointSize = clamp(aSize * uScale / max(0.12, -mv.z), 1.0, 18.0);',
      '  float tw = 0.55 + 0.45 * sin(uTime * aTw + aPhase * 2.0);',
      '  vAlpha = uOpacity * tw;',
      '  vColor = aColor;',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n');

    function pointScale() {
      renderer.getDrawingBufferSize(_bufSize);
      return _bufSize.y / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }

    function makePoints(specs, vert, frag, uniforms) {
      const n = specs.length;
      const position = new Float32Array(n * 3);
      const color = new Float32Array(n * 3);
      const aSize = new Float32Array(n);
      const aPhase = new Float32Array(n);
      const aFreq = new Float32Array(n);
      const aDay = new Float32Array(n);
      const aPattern = new Float32Array(n);
      const aSpeed = new Float32Array(n);
      const aAmp = new Float32Array(n);
      const aTw = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const s = specs[i];
        position[i * 3] = s.pos[0];
        position[i * 3 + 1] = s.pos[1];
        position[i * 3 + 2] = s.pos[2];
        _c1.set(s.color);
        color[i * 3] = _c1.r;
        color[i * 3 + 1] = _c1.g;
        color[i * 3 + 2] = _c1.b;
        aSize[i] = s.size;
        aPhase[i] = s.phase;
        aFreq[i] = s.freq;
        aDay[i] = s.day;
        aPattern[i] = s.pattern != null ? s.pattern : 1;
        aSpeed[i] = s.speed != null ? s.speed : 0.5;
        aAmp[i] = s.amp != null ? s.amp : 0.2;
        aTw[i] = s.tw != null ? s.tw : 0.6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
      geo.setAttribute('aFreq', new THREE.BufferAttribute(aFreq, 1));
      geo.setAttribute('aDay', new THREE.BufferAttribute(aDay, 1));
      geo.setAttribute('aPattern', new THREE.BufferAttribute(aPattern, 1));
      geo.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
      geo.setAttribute('aAmp', new THREE.BufferAttribute(aAmp, 1));
      geo.setAttribute('aTw', new THREE.BufferAttribute(aTw, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      points.renderOrder = 9;
      scene.add(points);
      return { points, uniforms };
    }

    /* ------------------------------------------------------------ nav lights */
    const lightSpecs = [];
    function addLight(pos, color, size, freq, phase, pattern, day) {
      if (!pos) return;
      lightSpecs.push({ pos: [pos.x, pos.y, pos.z], color, size, freq, phase, pattern, day });
    }

    // Breakwater mole: green entering light at the head, red at the root.
    addLight(new THREE.Vector3(9.6, 1.31, 6.78), 0x5fd08a, 0.2, 0.85, 0.0, 0.25, 0.22);
    addLight(new THREE.Vector3(12.28, 1.31, -5.3), 0xd8574f, 0.18, 1.05, 1.7, 0.2, 0.18);
    // Peninsula beacon — slow white flash.
    addLight(anchorPos('peninsulaBeacon', [-10.55, 1.45, 4.35]), 0xffe1a6, 0.34, 0.9, 0.6, 1.0, 0.1);
    // Channel buoys.
    function buoyTop(v, fallback) {
      const p = v || (fallback ? new THREE.Vector3(fallback[0], fallback[1], fallback[2]) : null);
      if (!p) return null;
      return new THREE.Vector3(p.x, p.y < 0.45 ? p.y + 0.55 : p.y, p.z);
    }
    addLight(buoyTop(anchorPos('buoyGreen', null), [-2.4, 0.55, 11.4]), 0x5fd08a, 0.26, 1.55, 0.4, 1.0, 0.04);
    addLight(buoyTop(anchorPos('buoyRed', null), [2.4, 0.55, 12.1]), 0xd8574f, 0.26, 1.15, 2.5, 1.0, 0.04);
    // Crane tips: white blinking aviation lights.
    for (let i = 0; i < Math.min(4, craneTips.length); i++) {
      const p = craneTips[i];
      addLight(p, 0xfff0cd, 0.17, 1.35, p.x * 0.7, 1.0, 0.3);
    }
    // Container ship masthead.
    let mastPos = anchorPos('shipMast', null);
    if (!mastPos && hasStat('vessels')) {
      mastPos = new THREE.Vector3(5.15, 4.55, -2.55);
    }
    if (mastPos) addLight(mastPos, 0xfff0cd, 0.25, 0.72, 0.0, 0.72, 0.28);

    // Ops tower beacon (registered by terminal).
    const opsBeacon = anchorPos('opsTowerBeacon', null);
    if (opsBeacon) addLight(opsBeacon, 0xffe1a6, 0.26, 1.2, 0.35, 1.0, 0.14);

    // Optional: warm flood/lamppost anchors any owner registered (kept subtle).
    let floods = 0;
    const anchorKeys = Object.keys(P.anchors || {});
    for (let i = 0; i < anchorKeys.length && floods < 5; i++) {
      const key = anchorKeys[i];
      if (!/flood|worklight|apronlamp/i.test(key)) continue;
      const list = anchorList(key);
      for (let j = 0; j < list.length && floods < 5; j++) {
        addLight(list[j], 0xffc078, 0.3, 0.55, rnd() * TAU, 0, 0.0);
        floods++;
      }
    }

    const navUniforms = {
      uTime: { value: 0 },
      uScale: { value: pointScale() },
      uNight: { value: 0 },
      uBoost: { value: 1.7 },
      uMap: { value: K.glowTexture() },
    };
    const navLights = makePoints(lightSpecs, NAV_VERT, NAV_FRAG, navUniforms);

    /* --------------------------------------------------------- water glints */
    const glintSpecs = [];
    for (let i = 0; i < 26; i++) {
      let x;
      let z;
      if (i < 18) {
        x = K.range(rnd, -8.2, 11.2);
        z = K.range(rnd, -1.4, 5.6);
      } else {
        x = K.range(rnd, 6.4, 13.0);
        z = K.range(rnd, 3.2, 9.2);
      }
      glintSpecs.push({
        pos: [x, 0.045, z],
        color: rnd() < 0.8 ? 0xffc078 : 0xffe0ad,
        size: 0.05 + rnd() * 0.055,
        freq: 1.3 + rnd() * 2.1,
        phase: rnd() * TAU,
        pattern: 1,
        day: 0,
      });
    }
    const glintUniforms = {
      uTime: { value: 0 },
      uScale: { value: pointScale() },
      uNight: { value: 0 },
      uBoost: { value: 1.15 },
      uMap: { value: K.glowTexture() },
    };
    const glints = makePoints(glintSpecs, NAV_VERT, NAV_FRAG, glintUniforms);

    /* ----------------------------------------------------------- dust motes */
    const dustSpecs = [];
    const dustCount = reduced ? 66 : 96;
    for (let i = 0; i < dustCount; i++) {
      const ang = rnd() * TAU;
      const rad = 3.4 + Math.pow(rnd(), 0.72) * 18.5;
      const y = 0.5 + Math.pow(rnd(), 0.85) * 12.4;
      dustSpecs.push({
        pos: [Math.cos(ang) * rad, y, Math.sin(ang) * rad],
        color: rnd() < 0.72 ? 0xffe4bc : 0xf2ead9,
        size: 0.022 + rnd() * 0.034,
        phase: rnd() * TAU,
        speed: 0.11 + rnd() * 0.22,
        amp: 0.12 + rnd() * 0.42,
        tw: 0.25 + rnd() * 0.7,
      });
    }
    const dustUniforms = {
      uTime: { value: 0 },
      uScale: { value: pointScale() },
      uOpacity: { value: 0.17 },
      uMap: { value: K.glowTexture() },
    };
    const dust = makePoints(dustSpecs, DUST_VERT, NAV_FRAG, dustUniforms);
    dust.points.renderOrder = 2;

    /* ====================================================================
     * 6. FLAGS + BUNTING
     * ================================================================= */
    const flagMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.88,
      metalness: 0.0,
      envMapIntensity: 0.55,
    });

    const flags = [];

    function makeFlagGeometry(width, height, bands) {
      const geo = new THREE.PlaneGeometry(width, height, 12, 6);
      geo.translate(width / 2, 0, 0);
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const bandColors = bands.map((b) => new THREE.Color(b.color));
      for (let i = 0; i < pos.count; i++) {
        const t = K.clamp((pos.getY(i) + height / 2) / height, 0, 1);
        let ci = 0;
        for (let b = 0; b < bands.length; b++) if (t >= bands[b].y0) ci = b;
        const c = bandColors[ci];
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      return geo;
    }

    function addFlag(poleTop, width, height, yaw, bands) {
      const geo = makeFlagGeometry(width, height, bands);
      const base = new Float32Array(geo.attributes.position.array);
      const mesh = new THREE.Mesh(geo, flagMat);
      mesh.position.set(poleTop.x, poleTop.y - height * 0.52, poleTop.z);
      mesh.rotation.y = yaw;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      scene.add(mesh);
      flags.push({ geo, base, width, height, phase: rnd() * TAU });
      return mesh;
    }

    function updateFlags(tt) {
      for (let f = 0; f < flags.length; f++) {
        const flag = flags[f];
        const geo = flag.geo;
        const arr = geo.attributes.position.array;
        const base = flag.base;
        const count = geo.attributes.position.count;
        for (let i = 0; i < count; i++) {
          const x = base[i * 3];
          const y = base[i * 3 + 1];
          const u = x / flag.width;
          const wave = reduced
            ? 0.012 * u * Math.sin(u * 3.0 + flag.phase)
            : Math.sin(u * 4.4 - tt * 2.55 + flag.phase) * 0.09 * u +
              Math.sin(u * 2.05 - tt * 1.5 + flag.phase * 1.6) * 0.038 * u;
          arr[i * 3] = x;
          arr[i * 3 + 1] = y - u * u * 0.028;
          arr[i * 3 + 2] = wave;
        }
        geo.attributes.position.needsUpdate = true;
        geo.computeVertexNormals();
      }
    }

    function makeFlagMast(base, height) {
      const poleGeo = mergeParts([
        {
          geo: K.geoCyl(6).clone(),
          pos: [0, height * 0.5, 0],
          scale: [0.011, height, 0.011],
          color: 0x6d5a43,
        },
        {
          geo: K.geoSphere(6, 4).clone(),
          pos: [0, height + 0.008, 0],
          scale: [0.028, 0.028, 0.028],
          color: 0xc9a95f,
        },
      ]);
      const mast = new THREE.Mesh(poleGeo, gullMat);
      mast.position.copy(base);
      mast.castShadow = false;
      scene.add(mast);
      return mast;
    }

    // Quay flag: layout anchor `flagpoleQuay` names the pole top, but no owner
    // builds the pole, so we plant a slim brass-topped mast of our own.
    const quayPole = anchorPos('flagpoleQuay', [9.5, 2.2, -5.7]);
    const quayMastBase = new THREE.Vector3(quayPole.x, W.deckY, quayPole.z);
    const quayMastH = Math.max(0.9, quayPole.y - W.deckY);
    makeFlagMast(quayMastBase, quayMastH);
    addFlag(new THREE.Vector3(quayMastBase.x, quayMastBase.y + quayMastH, quayMastBase.z), 0.82, 0.5, 1.15, [
      { y0: 0.0, color: 0x315052 },
      { y0: 0.34, color: 0xefe4d2 },
      { y0: 0.63, color: 0x9a4f3d },
    ]);
    K.count('parts', 4);

    // Small flag on the breakwater next to the lighthouse.
    const bwFlagBase = new THREE.Vector3(10.9, 1.255, 5.76);
    makeFlagMast(bwFlagBase, 1.12);
    addFlag(new THREE.Vector3(bwFlagBase.x, bwFlagBase.y + 1.1, bwFlagBase.z), 0.58, 0.36, -1.28, [
      { y0: 0.0, color: 0x9a4f3d },
      { y0: 0.4, color: 0xefe4d2 },
      { y0: 0.68, color: 0x315052 },
    ]);

    /* ------------------------------------------------------------- bunting */
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x4a3a2c,
      transparent: true,
      opacity: 0.5,
    });

    const buntings = [];

    function addBunting(A, B, sag, phase, palette) {
      const n = K.clamp(Math.round(A.distanceTo(B) / 0.15), 8, 30);
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const s = i / n;
        pts.push(new THREE.Vector3().lerpVectors(A, B, s).add(_v1.set(0, -Math.sin(Math.PI * s) * sag, 0)));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(lineGeo, lineMat);
      line.frustumCulled = false;
      scene.add(line);
      const position = [];
      const color = [];
      const us = [];
      const cols = palette.map((c) => new THREE.Color(c));
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        const mid = new THREE.Vector3().lerpVectors(p, q, 0.5);
        const flutter = (rnd() - 0.5) * 0.06;
        const c = cols[i % cols.length];
        const apex = new THREE.Vector3(mid.x + flutter * 0.25, mid.y - 0.15 - rnd() * 0.03, mid.z + flutter);
        const a = new THREE.Vector3().lerpVectors(p, q, 0.1);
        const b = new THREE.Vector3().lerpVectors(p, q, 0.9);
        const tri = [a, b, apex];
        const u = (i + 0.5) / n;
        for (let k = 0; k < 3; k++) {
          position.push(tri[k].x, tri[k].y, tri[k].z);
          color.push(c.r, c.g, c.b);
          us.push(u);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, flagMat);
      mesh.castShadow = false;
      scene.add(mesh);
      buntings.push({ geo, base: new Float32Array(geo.attributes.position.array), us, phase });
    }

    function updateBunting(tt) {
      if (reduced) return;
      for (let s = 0; s < buntings.length; s++) {
        const bt = buntings[s];
        const arr = bt.geo.attributes.position.array;
        const count = bt.geo.attributes.position.count;
        for (let i = 0; i < count; i++) {
          const u = bt.us[i];
          const w = Math.sin(u * 8.0 - tt * 1.55 + bt.phase) * 0.016 * Math.sin(Math.PI * u);
          arr[i * 3 + 2] = bt.base[i * 3 + 2] + w;
          arr[i * 3 + 1] = bt.base[i * 3 + 1] + w * 0.45;
        }
        bt.geo.attributes.position.needsUpdate = true;
      }
    }

    const buntingPalette = [0xefe4d2, 0x9a4f3d, 0xc9a95f, 0x4a6b6a, 0xdccdb8, 0x7d8978];
    // Per the Lead: town registers bunting anchors when it builds the street
    // bunting itself, so only fall back to our own strings when both are absent.
    const townBunting = anchorPos('buntingA', null) && anchorPos('buntingB', null);
    if (!townBunting) {
      addBunting(new THREE.Vector3(-11.35, 2.74, 1.35), new THREE.Vector3(-9.86, 2.52, 1.02), 0.22, 0.0, buntingPalette);
      addBunting(new THREE.Vector3(-11.42, 2.62, -0.9), new THREE.Vector3(-9.9, 2.42, -1.2), 0.2, 1.9, buntingPalette);
      K.count('parts', 36);
    }

    /* ====================================================================
     * 7. THE TICK
     * ================================================================= */
    let animT = 0;

    K.addTick(function effectsTick(dt, time, e) {
      const step = Math.min(dt, 0.05);
      animT += step * (reduced ? 0.35 : 1);
      const mix = e && e.mix != null ? e.mix : P.env.mix || 0;
      const night = K.smoothstep(0.15, 1.0, mix);

      updateGulls(step, animT);
      updateSmoke(step, animT, mix);
      updateLighthouse(step, animT, mix, night);

      navUniforms.uTime.value = animT;
      navUniforms.uScale.value = pointScale();
      navUniforms.uNight.value = mix;
      glintUniforms.uTime.value = animT;
      glintUniforms.uScale.value = navUniforms.uScale.value;
      glintUniforms.uNight.value = mix;
      dustUniforms.uTime.value = animT;
      dustUniforms.uScale.value = navUniforms.uScale.value;
      dustUniforms.uOpacity.value = K.lerp(0.17, 0.13, mix);

      updateFlags(animT);
      updateBunting(animT);

    });

    // Tag everything this builder added (QA can hide/isolate effects wholesale).
    const fxObjects = scene.children.slice(fxStart);
    for (let i = 0; i < fxObjects.length; i++) fxObjects[i].userData.fx = true;

    // A tiny debug handle (harmless, useful for QA screenshots).
    P.effects = {
      gulls: flyers.length + perched.length,
      puffs: puffs.length,
      lights: lightSpecs.length,
      reduced,
      objs: {
        all: fxObjects,
        beamGroup,
        lensGlow,
        lensCore,
        sweepGroup,
        nav: navLights.points,
        glints: glints.points,
        dust: dust.points,
        flyers,
        perched,
      },
    };
  };
})();
