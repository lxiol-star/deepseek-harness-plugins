/* ============================================================================
 * studio.js — the museum room: walnut plinth, brass inlay, gallery backdrop,
 * soft floor, key/fill/rim lights, night practicals and an environment map.
 * Owned by the Lead.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  const K = P.kit;
  const THREE = window.THREE;
  const L = P.layout;
  const W = L.W;

  const studio = (P.studio = {});
  const day = {
    key: 0xffe7c6, keyI: 3.1,
    fill: 0xacc8cf, fillI: 0.75,
    rim: 0xffd9a4, rimI: 1.5,
    hemiSky: 0xe7efec, hemiGround: 0x7e6850, hemiI: 0.55,
    wallTop: 0xa9bab6, wallMid: 0xe8dcc8, wallBottom: 0xd2bfa3,
    glow: 0xffe9c9, glowI: 1.15,
    floor: 0xd7c5ac, fog: 0xcdb99c,
    exposure: 1.0,
  };
  const night = {
    key: 0x9fb5c4, keyI: 0.42,
    fill: 0x5d7180, fillI: 0.12,
    rim: 0xffc37e, rimI: 0.5,
    hemiSky: 0x33414a, hemiGround: 0x241c16, hemiI: 0.16,
    wallTop: 0x141617, wallMid: 0x322921, wallBottom: 0x211b16,
    glow: 0xffb168, glowI: 0.8,
    floor: 0x2c241d, fog: 0x201a14,
    exposure: 1.12,
  };
  studio.day = day;
  studio.night = night;
  studio.mix = 0;

  const state = {};
  studio.state = state;

  function buildWoodTexture() {
    return K.canvas(1024, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#6b4b35');
      g.addColorStop(0.35, '#5a3e2c');
      g.addColorStop(0.7, '#4a3225');
      g.addColorStop(1, '#3d2a1f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const rnd = K.rng(7107);
      for (let i = 0; i < 240; i++) {
        const y = rnd() * h;
        const amp = 1 + rnd() * 3.5;
        const alpha = 0.05 + rnd() * 0.18;
        ctx.strokeStyle = rnd() > 0.55 ? `rgba(22,12,6,${alpha})` : `rgba(194,150,105,${alpha * 0.7})`;
        ctx.lineWidth = 0.6 + rnd() * 2.1;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const yy = y + Math.sin((x / w) * Math.PI * 2 * (1 + rnd() * 1.4) + i) * amp;
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      // a couple of quiet knots
      for (let k = 0; k < 4; k++) {
        const x = rnd() * w, y = rnd() * h;
        for (let r = 2; r < 14; r += 2) {
          ctx.strokeStyle = `rgba(30,17,9,${0.12 - r * 0.006})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(x, y, r * 1.9, r * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // warm sheen
      const sheen = ctx.createLinearGradient(0, 0, 0, h);
      sheen.addColorStop(0, 'rgba(255,220,170,0.08)');
      sheen.addColorStop(0.5, 'rgba(255,220,170,0)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function buildFloorTexture() {
    return K.canvas(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#d9c8b1';
      ctx.fillRect(0, 0, w, h);
      const rnd = K.rng(3391);
      for (let i = 0; i < 9000; i++) {
        const x = rnd() * w, y = rnd() * h;
        const a = rnd() * 0.045;
        ctx.fillStyle = rnd() > 0.45 ? `rgba(255,246,228,${a})` : `rgba(75,55,38,${a})`;
        ctx.fillRect(x, y, 1 + rnd() * 1.4, 1 + rnd() * 1.4);
      }
      // faint paper fibres
      for (let i = 0; i < 60; i++) {
        const y = rnd() * h;
        ctx.strokeStyle = `rgba(90,66,44,${0.02 + rnd() * 0.02})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.7, y + rnd() * 6 - 3, w, y);
        ctx.stroke();
      }
    });
  }

  function buildContactShadow() {
    return K.canvas(512, 512, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.13, w / 2, h / 2, w * 0.5);
      g.addColorStop(0, 'rgba(26,16,8,0.52)');
      g.addColorStop(0.5, 'rgba(26,16,8,0.3)');
      g.addColorStop(0.78, 'rgba(26,16,8,0.08)');
      g.addColorStop(1, 'rgba(26,16,8,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function buildEngravedRing() {
    return K.canvas(1024, 1024, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2, R = w * 0.435;
      ctx.strokeStyle = 'rgba(63,49,33,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(63,49,33,0.28)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.955, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const major = i % 6 === 0;
        const r0 = R * (major ? 0.93 : 0.945);
        const r1 = R * 0.955;
        ctx.strokeStyle = `rgba(63,49,33,${major ? 0.5 : 0.28})`;
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      const marks = [['N', 0], ['E', 0.25], ['S', 0.5], ['W', 0.75]];
      ctx.fillStyle = 'rgba(63,49,33,0.5)';
      ctx.font = '600 22px "DM Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [ch, t] of marks) {
        const a = t * Math.PI * 2;
        ctx.fillText(ch, cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02);
      }
    });
  }

  function buildPlaqueTexture() {
    return K.canvas(1024, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#c8a465');
      g.addColorStop(0.28, '#b08a4f');
      g.addColorStop(0.55, '#9a743e');
      g.addColorStop(0.8, '#b18b50');
      g.addColorStop(1, '#8f6c3b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // brushed metal
      const rnd = K.rng(11);
      for (let i = 0; i < 260; i++) {
        const y = rnd() * h;
        ctx.strokeStyle = `rgba(255,240,205,${0.02 + rnd() * 0.05})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + rnd() * 2 - 1);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(60,40,20,0.65)';
      ctx.lineWidth = 3;
      ctx.strokeRect(22, 22, w - 44, h - 44);
      ctx.strokeStyle = 'rgba(255,235,190,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(27, 27, w - 54, h - 54);
      // engraved text: warm highlight offset + dark fill
      const cx = w / 2;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const title = '微 港 · PORT AURORA';
      ctx.font = '600 74px "Songti SC", "STSong", serif';
      ctx.fillStyle = 'rgba(255,240,200,0.5)';
      ctx.fillText(title, cx, h * 0.43 + 2);
      ctx.fillStyle = '#4a3016';
      ctx.fillText(title, cx, h * 0.43);
      ctx.font = '500 25px "DM Mono", monospace';
      ctx.fillStyle = 'rgba(255,240,200,0.4)';
      ctx.fillText('A  MINIATURE  HARBOUR  ·  SCALE  1:1000  ·  NO. 001', cx, h * 0.75 + 1);
      ctx.fillStyle = '#54391c';
      ctx.fillText('A  MINIATURE  HARBOUR  ·  SCALE  1:1000  ·  NO. 001', cx, h * 0.75);
      // corner screws
      for (const [x, y] of [[52, 52], [w - 52, 52], [52, h - 52], [w - 52, h - 52]]) {
        const sg = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
        sg.addColorStop(0, 'rgba(255,240,205,0.9)');
        sg.addColorStop(0.5, 'rgba(90,64,35,0.9)');
        sg.addColorStop(1, 'rgba(40,26,12,0.9)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(50,32,16,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.stroke();
      }
    });
  }

  function buildEnvTexture() {
    return K.canvas(1024, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#aebfbe');
      g.addColorStop(0.42, '#d9d4c6');
      g.addColorStop(0.55, '#f2e6d2');
      g.addColorStop(0.7, '#b49d81');
      g.addColorStop(1, '#5a4834');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // softboxes: two warm key panels + one cool fill
      function softbox(cx, cy, rx, ry, color, alpha) {
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
        grd.addColorStop(0, `rgba(${color},${alpha})`);
        grd.addColorStop(0.55, `rgba(${color},${alpha * 0.5})`);
        grd.addColorStop(1, `rgba(${color},0)`);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
        ctx.fillStyle = grd;
        ctx.fillRect(-Math.max(rx, ry), -Math.max(rx, ry), Math.max(rx, ry) * 2, Math.max(rx, ry) * 2);
        ctx.restore();
      }
      softbox(w * 0.2, h * 0.24, 230, 130, '255,236,205', 0.95);
      softbox(w * 0.78, h * 0.3, 190, 110, '222,238,240', 0.6);
      softbox(w * 0.55, h * 0.68, 240, 90, '255,214,160', 0.22);
    });
  }

  studio.build = function (renderer, scene) {
    state.scene = scene;

    /* ------------------------------------------------------------ plinth base */
    const woodTex = K.texture(buildWoodTexture(), { repeat: [4, 1] });
    woodTex.wrapS = THREE.RepeatWrapping;
    woodTex.wrapT = THREE.ClampToEdgeWrapping;
    const woodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0xf2e3cd,
      roughness: 0.52,
      metalness: 0.02,
      envMapIntensity: 0.7,
    });
    const profile = [
      [0, -1.9],
      [14.5, -1.9],
      [15.42, -1.87],
      [15.66, -1.72],
      [15.76, -1.42],
      [15.78, -0.9],
      [15.74, -0.4],
      [15.66, -0.05],
      [15.6, 0.13],
      [15.54, 0.16],
      [14.92, 0.16],
      [14.9, 0.03],
      [14.9, -1.52],
      [0, -1.52],
    ];
    const baseGeo = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), 160);
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.castShadow = true;
    base.receiveShadow = true;
    base.name = 'plinth';
    scene.add(base);
    state.base = base;

    // inner dark basin wall behind the water rim
    const basinMat = new THREE.MeshStandardMaterial({ color: 0x2a2019, roughness: 0.9, metalness: 0.05 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(14.9, 14.9, 1.5, 160, 1, true), basinMat);
    basin.position.y = -0.8;
    basin.receiveShadow = true;
    scene.add(basin);

    // brass inlay rings on the rim
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xbf9a5e, roughness: 0.32, metalness: 0.95, envMapIntensity: 1.4 });
    function brassRing(rIn, rOut, y) {
      const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 180), brassMat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    }
    brassRing(14.94, 15.02, 0.162);
    brassRing(15.32, 15.38, 0.162);

    // engraved name plaque on the front rim
    const plaqueTex = K.texture(buildPlaqueTexture());
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: plaqueTex, roughness: 0.4, metalness: 0.7, envMapIntensity: 1.2,
    });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.675), plaqueMat);
    plaque.rotation.x = -Math.PI / 2;
    plaque.position.set(0, 0.168, 15.16);
    plaque.receiveShadow = true;
    scene.add(plaque);

    // side brass bands
    for (const [y, r] of [[-0.28, 15.78], [-1.6, 15.7]]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(r - 0.01, 0.014, 6, 220), brassMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      band.castShadow = false;
      scene.add(band);
    }

    // feet
    const footMat = new THREE.MeshStandardMaterial({ color: 0xa98852, roughness: 0.36, metalness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.16, 20), footMat);
      foot.position.set(Math.cos(a) * 10.2, W.floorY + 0.07, Math.sin(a) * 10.2);
      foot.castShadow = true;
      scene.add(foot);
    }

    /* ------------------------------------------------------------- gallery room */
    const wallUniforms = {
      uTop: { value: new THREE.Color(day.wallTop) },
      uMid: { value: new THREE.Color(day.wallMid) },
      uBottom: { value: new THREE.Color(day.wallBottom) },
      uGlowColor: { value: new THREE.Color(day.glow) },
      uGlowI: { value: day.glowI },
      uGlowDir: { value: new THREE.Vector3(-0.5, 0.55, 0.68).normalize() },
    };
    const wallMat = new THREE.ShaderMaterial({
      uniforms: wallUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uMid, uBottom, uGlowColor;
        uniform float uGlowI;
        uniform vec3 uGlowDir;
        varying vec3 vDir;
        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        void main() {
          float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = mix(uBottom, uMid, smoothstep(0.05, 0.52, h));
          col = mix(col, uTop, smoothstep(0.5, 1.0, h));
          float glow = pow(max(dot(normalize(vDir), normalize(uGlowDir)), 0.0), 7.0);
          col += uGlowColor * glow * uGlowI;
          // subtle gallery wall breathing / paper texture
          float n = hash(floor(gl_FragCoord.xy * 0.5)) - 0.5;
          col += n * 0.0028;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const wall = new THREE.Mesh(new THREE.SphereGeometry(140, 48, 24), wallMat);
    wall.name = 'backdrop';
    wall.renderOrder = -10;
    scene.add(wall);
    state.wall = wall;
    state.wallUniforms = wallUniforms;

    // Keep fog beyond any allowed orbit distance so the model itself never
    // washes out when the camera backs off (especially portrait phones).
    scene.fog = new THREE.Fog(new THREE.Color(day.fog), 140, 280);

    const floorTex = K.texture(buildFloorTexture(), { repeat: [7, 7] });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      color: day.floor,
      roughness: 0.96,
      metalness: 0.0,
      envMapIntensity: 0.25,
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(320, 96), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = W.floorY;
    floor.receiveShadow = true;
    floor.name = 'gallery-floor';
    scene.add(floor);
    state.floor = floor;
    state.floorMat = floorMat;

    // engraved display ring on the floor
    const ringTex = K.texture(buildEngravedRing());
    const ringMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0.55, depthWrite: false })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = W.floorY + 0.006;
    ringMesh.renderOrder = 1;
    scene.add(ringMesh);
    state.ring = ringMesh;

    // soft pool of gallery light on the floor
    const poolTex = K.canvas(512, 512, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w * 0.5, h * 0.48, w * 0.06, w * 0.5, h * 0.48, w * 0.5);
      g.addColorStop(0, 'rgba(255,235,200,0.85)');
      g.addColorStop(0.45, 'rgba(255,228,188,0.4)');
      g.addColorStop(0.75, 'rgba(255,224,180,0.12)');
      g.addColorStop(1, 'rgba(255,224,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(62, 62),
      new THREE.MeshBasicMaterial({
        map: K.texture(poolTex), transparent: true, opacity: 0.45,
        depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe2ba,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = W.floorY + 0.018;
    pool.renderOrder = 0;
    scene.add(pool);
    state.lightPool = pool;

    // side plaque on the plinth
    const sideTex = K.canvas(1024, 256, (ctx, w, h) => {
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#bf9a5e');
      bg.addColorStop(0.4, '#a37d45');
      bg.addColorStop(1, '#8a6737');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const rnd = K.rng(77);
      for (let i = 0; i < 180; i++) {
        ctx.strokeStyle = `rgba(255,240,205,${0.02 + rnd() * 0.04})`;
        ctx.beginPath();
        const y = rnd() * h;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + rnd() * 2 - 1);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(60,40,20,0.55)';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, w - 40, h - 40);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 46px "DM Mono", monospace';
      ctx.fillStyle = 'rgba(255,240,200,0.4)';
      ctx.fillText('AURORA HARBOUR MUSEUM · COLLECTION 01', w / 2, h * 0.46 + 2);
      ctx.fillStyle = '#4c3216';
      ctx.fillText('AURORA HARBOUR MUSEUM · COLLECTION 01', w / 2, h * 0.46);
      ctx.font = '500 24px "Songti SC", serif';
      ctx.fillStyle = 'rgba(255,240,200,0.35)';
      ctx.fillText('露 港 海 事 博 物 馆 · 壹 号 馆 藏', w / 2, h * 0.69 + 1);
      ctx.fillStyle = '#54391c';
      ctx.fillText('露 港 海 事 博 物 馆 · 壹 号 馆 藏', w / 2, h * 0.69);
    });
    const sidePlaque = new THREE.Mesh(
      new THREE.PlaneGeometry(1.95, 0.49),
      new THREE.MeshStandardMaterial({
        map: K.texture(sideTex), roughness: 0.38, metalness: 0.75, envMapIntensity: 1.2,
      })
    );
    sidePlaque.position.set(0, -0.78, 15.73);
    sidePlaque.rotation.y = 0;
    scene.add(sidePlaque);
    state.sidePlaque = sidePlaque;

    // contact shadow under the plinth
    const shadowTex = K.texture(buildContactShadow());
    state.contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 42),
      new THREE.MeshBasicMaterial({
        map: shadowTex, transparent: true, opacity: 0.62, depthWrite: false, color: 0x241a10,
      })
    );
    state.contactShadow.rotation.x = -Math.PI / 2;
    state.contactShadow.position.y = W.floorY + 0.012;
    state.contactShadow.renderOrder = 2;
    scene.add(state.contactShadow);

    /* ------------------------------------------------------------------ lights */
    const key = new THREE.DirectionalLight(day.key, day.keyI);
    key.position.set(-17, 25, 19);
    key.target.position.set(0, 0.9, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.camera.left = -19;
    key.shadow.camera.right = 19;
    key.shadow.camera.top = 19;
    key.shadow.camera.bottom = -19;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 70;
    key.shadow.bias = -0.00025;
    key.shadow.normalBias = 0.028;
    key.shadow.radius = 2.2;
    key.shadow.blurSamples = 8;
    scene.add(key, key.target);
    state.key = key;

    const fill = new THREE.DirectionalLight(day.fill, day.fillI);
    fill.position.set(18, 11, -14);
    scene.add(fill);
    state.fill = fill;

    const rim = new THREE.DirectionalLight(day.rim, day.rimI);
    rim.position.set(7, 10, -23);
    rim.target.position.set(0, 1.2, 0);
    scene.add(rim, rim.target);
    state.rim = rim;

    const hemi = new THREE.HemisphereLight(day.hemiSky, day.hemiGround, day.hemiI);
    scene.add(hemi);
    state.hemi = hemi;

    const nightPracticals = [
      { x: 0.8, y: 3.8, z: -5.6, color: 0xffb062, i: 34, d: 15 },
      { x: -11.2, y: 3.4, z: -2.4, color: 0xffb573, i: 28, d: 13 },
      { x: 10.05, y: 3.05, z: 7.5, color: 0xffd29a, i: 18, d: 10 },
      { x: 5.1, y: 2.4, z: -2.55, color: 0xffc489, i: 16, d: 9 },
      { x: -8.4, y: 3.7, z: -5.4, color: 0xffb066, i: 22, d: 12 },
      { x: 1.0, y: 4.3, z: -8.4, color: 0xffb26a, i: 30, d: 16 },
      { x: 9.2, y: 3.7, z: -7.6, color: 0xffc07e, i: 24, d: 14 },
    ];
    state.nightPracticals = nightPracticals.map((p) => {
      const light = new THREE.PointLight(p.color, 0, p.d, 2);
      light.position.set(p.x, p.y, p.z);
      scene.add(light);
      return { light, max: p.i };
    });

    /* --------------------------------------------------------------- env map */
    try {
      const envTex = K.texture(buildEnvTexture());
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const envRT = pmrem.fromEquirectangular(envTex);
      scene.environment = envRT.texture;
      envTex.dispose();
      pmrem.dispose();
      state.envRT = envRT;
    } catch (err) {
      console.warn('[studio] env map failed', err);
    }

    studio.applyMix(0);
  };

  function lerpColor(target, a, b, t) {
    return target.copy(a).lerp(b, t);
  }
  const _cA = new THREE.Color();
  const _cB = new THREE.Color();

  studio.applyMix = function (mix) {
    studio.mix = mix;
    P.env.mix = mix;
    const s = state;
    if (!s.key) return;
    lerpColor(s.key.color, new THREE.Color(day.key), new THREE.Color(night.key), mix);
    s.key.intensity = K.lerp(day.keyI, night.keyI, mix);
    lerpColor(s.fill.color, new THREE.Color(day.fill), new THREE.Color(night.fill), mix);
    s.fill.intensity = K.lerp(day.fillI, night.fillI, mix);
    lerpColor(s.rim.color, new THREE.Color(day.rim), new THREE.Color(night.rim), mix);
    s.rim.intensity = K.lerp(day.rimI, night.rimI, mix);
    lerpColor(s.hemi.color, new THREE.Color(day.hemiSky), new THREE.Color(night.hemiSky), mix);
    lerpColor(s.hemi.groundColor, new THREE.Color(day.hemiGround), new THREE.Color(night.hemiGround), mix);
    s.hemi.intensity = K.lerp(day.hemiI, night.hemiI, mix);

    const u = s.wallUniforms;
    lerpColor(u.uTop.value, new THREE.Color(day.wallTop), new THREE.Color(night.wallTop), mix);
    lerpColor(u.uMid.value, new THREE.Color(day.wallMid), new THREE.Color(night.wallMid), mix);
    lerpColor(u.uBottom.value, new THREE.Color(day.wallBottom), new THREE.Color(night.wallBottom), mix);
    lerpColor(u.uGlowColor.value, new THREE.Color(day.glow), new THREE.Color(night.glow), mix);
    u.uGlowI.value = K.lerp(day.glowI, night.glowI, mix);

    s.floorMat.color.copy(new THREE.Color(day.floor)).lerp(new THREE.Color(night.floor), mix);
    if (P.scene && P.scene.fog) {
      P.scene.fog.color.copy(new THREE.Color(day.fog)).lerp(new THREE.Color(night.fog), mix);
      P.scene.fog.near = K.lerp(140, 120, mix);
      P.scene.fog.far = K.lerp(280, 260, mix);
    }
    for (const np of s.nightPracticals) np.light.intensity = np.max * mix;

    // practical glows material-wise
    if (K.materials.lamp) K.materials.lamp.emissiveIntensity = mix * 2.8;
    for (const mat of P.nightSigns) {
      if (mat) mat.emissiveIntensity = 0.015 + mix * 0.85;
    }
    if (s.ring) s.ring.material.opacity = K.lerp(0.55, 0.3, mix);
    if (s.contactShadow) s.contactShadow.material.opacity = K.lerp(0.62, 0.78, mix);
  };

  studio.update = function (dt, mix) {
    studio.applyMix(mix);
  };

  studio.colors = { day, night };
})();
