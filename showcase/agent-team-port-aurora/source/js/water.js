/* ============================================================================
 * water.js — the harbour basin: a custom water shader with gentle waves,
 * shore foam from a generated mask, sun glints and a planar reflection pass
 * (so ships, cranes and night windows really mirror in the water).
 * Owned by the Lead.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  const K = P.kit;
  const THREE = window.THREE;
  const L = P.layout;
  const W = L.W;

  const water = (P.water = {});
  water.radius = W.waterRadius;

  const DAY = {
    deep: 0x123b40,
    shallow: 0x3a746b,
    foam: 0xe7ddc9,
    spec: 0xfff3d8,
  };
  const NIGHT = {
    deep: 0x081a22,
    shallow: 0x102f36,
    foam: 0x657a7b,
    spec: 0xffc27c,
  };

  /* ----------------------------------------------------------- shoreline mask */
  function worldToCanvas(x, z, size) {
    const span = 32;
    return [((x + 16) / span) * size, ((z + 16) / span) * size];
  }

  function buildMaskTexture() {
    const size = 1024;
    const raw = K.canvas(size, size, (ctx) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      L.landOutline.forEach((p, i) => {
        const [x, y] = worldToCanvas(p[0], p[1], size);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();

      // breakwater (capsule stroke)
      const pts = L.breakwater.points;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = (L.breakwater.width / 32) * size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = worldToCanvas(p[0], p[1], size);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // pontoons and dolphins
      const pp = L.placements.pontoon;
      ctx.fillRect(
        ((pp.x0 + 16) / 32) * size,
        ((pp.z0 + 16) / 32) * size,
        ((pp.x1 - pp.x0) / 32) * size,
        ((pp.z1 - pp.z0) / 32) * size
      );
    });
    // blur the mask a little for soft foam distance
    const blurred = K.canvas(size, size, (ctx) => {
      ctx.filter = 'blur(7px)';
      ctx.drawImage(raw, 0, 0);
      ctx.filter = 'none';
    });
    return K.texture(blurred);
  }

  /* -------------------------------------------------------------- reflection */
  const _normal = new THREE.Vector3(0, 1, 0);
  const _mirrorPoint = new THREE.Vector3(0, 0, 0);
  const _view = new THREE.Vector3();
  const _lookAt = new THREE.Vector3();
  const _target = new THREE.Vector3();
  const _rotation = new THREE.Matrix4();
  const _texMatrix = new THREE.Matrix4();
  const _bias = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1
  );

  water.build = function (renderer, scene, camera) {
    water.scene = scene;
    water.mainCamera = camera;
    water.mask = buildMaskTexture();

    const uniforms = {
      uTime: { value: 0 },
      uMix: { value: 0 },
      uDeep: { value: new THREE.Color(DAY.deep) },
      uShallow: { value: new THREE.Color(DAY.shallow) },
      uFoam: { value: new THREE.Color(DAY.foam) },
      uSpec: { value: new THREE.Color(DAY.spec) },
      uSunDir: { value: new THREE.Vector3(-0.482, 0.684, 0.539).normalize() },
      uMask: { value: water.mask },
      uReflection: { value: null },
      uReflectMatrix: { value: new THREE.Matrix4() },
      uReflectStrength: { value: 0.9 },
      uWave: { value: 1.0 },
    };
    water.uniforms = uniforms;

    const geometry = new THREE.PlaneGeometry(30.6, 30.6, 180, 180);
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: false,
      depthWrite: true,
      side: THREE.FrontSide,
      fog: false,
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uWave;
        uniform mat4 uReflectMatrix;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying vec4 vReflectCoord;

        float waveHeight(vec2 p) {
          float h = 0.0;
          h += sin(p.x * 0.62 + uTime * 0.42) * 0.012;
          h += sin(p.y * 0.81 - uTime * 0.33) * 0.010;
          h += sin((p.x + p.y) * 1.25 + uTime * 0.55) * 0.006;
          h += sin((p.x - p.y) * 2.1 - uTime * 0.8) * 0.003;
          return h * uWave;
        }

        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float h = waveHeight(wp.xz);
          wp.y = ${'0.0'} + h;
          float e = 0.055;
          float hx = waveHeight(wp.xz + vec2(e, 0.0)) - waveHeight(wp.xz - vec2(e, 0.0));
          float hz = waveHeight(wp.xz + vec2(0.0, e)) - waveHeight(wp.xz - vec2(0.0, e));
          vec3 n = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));
          vWorld = wp.xyz;
          vNormalW = n;
          vReflectCoord = uReflectMatrix * vec4(wp.xyz, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uMix;
        uniform vec3 uDeep, uShallow, uFoam, uSpec;
        uniform vec3 uSunDir;
        uniform sampler2D uMask;
        uniform sampler2D uReflection;
        uniform float uReflectStrength;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying vec4 vReflectCoord;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          float r = length(vWorld.xz);
          if (r > 14.86) discard;

          vec2 maskUv = vec2((vWorld.x + 16.0) / 32.0, 1.0 - (vWorld.z + 16.0) / 32.0);
          float land = texture2D(uMask, maskUv).r;
          float shelf = smoothstep(0.015, 0.5, land);
          float shoreBand = smoothstep(0.03, 0.42, land) * (1.0 - smoothstep(0.5, 0.62, land));

          // the vertex-wave normal is smooth; no high-frequency fragment
          // perturbation (it caused a visible interference weave in reflections)
          vec3 N = normalize(vNormalW);
          vec2 rp = vWorld.xz;
          // very low-frequency swell perturbation (smooth, no interference weave)
          float gx = sin(rp.x * 0.82 + rp.y * 0.31 + uTime * 0.52) * 0.55
                   + sin(rp.x * 0.31 - rp.y * 0.67 - uTime * 0.31) * 0.45;
          float gz = cos(rp.y * 0.78 - rp.x * 0.38 + uTime * 0.44) * 0.5
                   + sin(rp.y * 0.29 + rp.x * 0.74 + uTime * 0.26) * 0.4;
          N.xz += vec2(gx, gz) * 0.014;
          N = normalize(N);

          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.2);

          // reflection, distorted by the water normal
          vec4 rc = vReflectCoord;
          rc.xy += N.xz * 0.085 * rc.w;
          vec3 refl = texture2DProj(uReflection, rc).rgb;

          vec3 base = mix(uDeep, uShallow, shelf);
          // broad, smooth tonal drift only (no high-frequency noise: avoids moiré)
          base *= 0.97 + 0.035 * sin(vWorld.x * 0.55 + vWorld.z * 0.72 + uTime * 0.09);
          vec3 col = mix(base, refl * 1.02, clamp(fres, 0.0, 0.82) * uReflectStrength);

          // sun glints
          vec3 H = normalize(V + normalize(uSunDir));
          float spec = pow(max(dot(N, H), 0.0), 240.0) * 2.6 + pow(max(dot(N, H), 0.0), 34.0) * 0.045;
          vec3 specCol = uSpec;
          // night practical glints (warm)
          vec3 lampDir = normalize(vec3(-0.25, 0.42, 0.85));
          vec3 H2 = normalize(V + lampDir);
          float lampSpec = pow(max(dot(N, H2), 0.0), 90.0) * uMix * 0.5;
          col += specCol * spec * (0.55 + 0.45 * (1.0 - uMix)) + vec3(1.0, 0.72, 0.42) * lampSpec;

          // foam: animated lace along the shore, quay corners and the mole
          float fnoise = noise2(vWorld.xz * 7.5 + vec2(uTime * 0.22, -uTime * 0.16));
          float fnoise2 = noise2(vWorld.xz * 17.0 - vec2(uTime * 0.12, uTime * 0.2));
          float foam = shoreBand * (0.42 + 0.7 * fnoise) + smoothstep(0.5, 0.72, shoreBand) * 0.2;
          foam = smoothstep(0.5, 0.9, foam + fnoise2 * 0.14);
          // a fine bright rim right at the shoreline
          foam += smoothstep(0.32, 0.55, land) * (1.0 - smoothstep(0.55, 0.68, land)) * 0.4;
          foam = clamp(foam, 0.0, 1.0);
          col = mix(col, uFoam, foam * 0.68);

          // gentle darkening right under vertical quay walls
          col *= 1.0 - 0.22 * smoothstep(0.5, 1.0, land) * 0.0;

          // fade the outer rim into the wooden lip shadow
          col *= 1.0 - 0.16 * smoothstep(14.2, 14.86, r);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'water';
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = W.waterY;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    water.mesh = mesh;

    // planar reflection target
    water.rt = new THREE.WebGLRenderTarget(1024, 1024, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    water.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    water.mirrorCamera = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
    water.mirrorCamera.matrixAutoUpdate = true;
    water.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0);
    water.uniforms.uReflection.value = water.rt.texture;
    water.reflectionEnabled = true;

    water.resize(renderer);
    water.setMix(0);
  };

  water.resize = function (renderer) {
    if (!water.rt) return;
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const rw = Math.max(480, Math.min(1280, Math.round(size.x * 0.55)));
    const rh = Math.max(300, Math.min(800, Math.round(size.y * 0.55)));
    water.rt.setSize(rw, rh);
  };

  water.setMix = function (mix) {
    if (!water.uniforms) return;
    const u = water.uniforms;
    u.uMix.value = mix;
    u.uDeep.value.copy(K.mixHex(DAY.deep, NIGHT.deep, mix));
    u.uShallow.value.copy(K.mixHex(DAY.shallow, NIGHT.shallow, mix));
    u.uFoam.value.copy(K.mixHex(DAY.foam, NIGHT.foam, mix));
    u.uSpec.value.copy(K.mixHex(DAY.spec, NIGHT.spec, mix));
    u.uReflectStrength.value = K.lerp(0.86, 0.98, mix);
  };

  water.update = function (dt, mix) {
    if (!water.uniforms) return;
    water.uniforms.uTime.value = P.env.time;
    const target = mix == null ? P.env.mix : mix;
    if (Math.abs(water.uniforms.uMix.value - target) > 0.002) water.setMix(target);
  };

  water.updateReflection = function (renderer, scene, camera) {
    if (!water.mesh || !water.reflectionEnabled) return;
    const mesh = water.mesh;
    const rt = water.rt;
    const mirror = water.mirrorCamera;

    // mirror the camera across y = 0 (following three.js Reflector math)
    _view.copy(_mirrorPoint).sub(camera.position).reflect(_normal).negate().add(_mirrorPoint);
    _rotation.extractRotation(camera.matrixWorld);
    _lookAt.set(0, 0, -1).applyMatrix4(_rotation).add(camera.position);
    _target.copy(_mirrorPoint).sub(_lookAt).reflect(_normal).negate().add(_mirrorPoint);
    mirror.position.copy(_view);
    mirror.up.set(0, 1, 0).applyMatrix4(_rotation).reflect(_normal);
    mirror.lookAt(_target);
    mirror.fov = camera.fov;
    mirror.aspect = camera.aspect;
    mirror.near = camera.near;
    mirror.far = camera.far;
    mirror.updateProjectionMatrix();
    mirror.updateMatrixWorld();

    _texMatrix.copy(_bias)
      .multiply(mirror.projectionMatrix)
      .multiply(mirror.matrixWorldInverse);
    water.uniforms.uReflectMatrix.value.copy(_texMatrix);

    const prevTarget = renderer.getRenderTarget();
    const prevClip = renderer.clippingPlanes;
    const prevAutoClear = renderer.autoClear;
    mesh.visible = false;
    renderer.setRenderTarget(rt);
    renderer.autoClear = true;
    renderer.clippingPlanes = [water.clipPlane];
    renderer.render(scene, mirror);
    renderer.clippingPlanes = prevClip;
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    mesh.visible = true;
  };
})();
