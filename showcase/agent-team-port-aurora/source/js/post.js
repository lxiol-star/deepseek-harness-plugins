/* ============================================================================
 * post.js — the camera room: HDR scene pass, gentle bloom, model-photography
 * tilt-shift, ACES filmic curve, split-tone grade, vignette and fine grain.
 * Owned by the Lead.
 * ========================================================================= */
(function () {
  const P = (window.PORT = window.PORT || {});
  const THREE = window.THREE;
  const Post = (P.Post = class Post {
    constructor(renderer) {
      this.renderer = renderer;
      this.enabled = true;
      this.quadScene = new THREE.Scene();
      this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
      this.quad.frustumCulled = false;
      this.quadScene.add(this.quad);

      const opts = {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false,
      };
      this.sceneRT = new THREE.WebGLRenderTarget(2, 2, Object.assign({ samples: 4 }, opts));
      this.softRT = new THREE.WebGLRenderTarget(2, 2, opts);
      this.softTmpRT = new THREE.WebGLRenderTarget(2, 2, opts);
      this.bloomRT = new THREE.WebGLRenderTarget(2, 2, opts);
      this.bloomTmpRT = new THREE.WebGLRenderTarget(2, 2, opts);

      this.copyMat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: Post.quadVert,
        fragmentShader: /* glsl */`
          uniform sampler2D tDiffuse;
          varying vec2 vUv;
          void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
        `,
        depthTest: false, depthWrite: false,
      });
      this.brightMat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, uThreshold: { value: 0.85 } },
        vertexShader: Post.quadVert,
        fragmentShader: /* glsl */`
          uniform sampler2D tDiffuse;
          uniform float uThreshold;
          varying vec2 vUv;
          void main() {
            vec3 c = texture2D(tDiffuse, vUv).rgb;
            float l = max(c.r, max(c.g, c.b));
            float k = smoothstep(uThreshold, uThreshold + 0.45, l);
            gl_FragColor = vec4(c * k, 1.0);
          }
        `,
        depthTest: false, depthWrite: false,
      });
      this.blurMat = new THREE.ShaderMaterial({
        uniforms: {
          tDiffuse: { value: null },
          uDir: { value: new THREE.Vector2(1, 0) },
        },
        vertexShader: Post.quadVert,
        fragmentShader: /* glsl */`
          uniform sampler2D tDiffuse;
          uniform vec2 uDir;
          varying vec2 vUv;
          void main() {
            vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
            sum += texture2D(tDiffuse, vUv + uDir * 1.384615) * 0.316216;
            sum += texture2D(tDiffuse, vUv - uDir * 1.384615) * 0.316216;
            sum += texture2D(tDiffuse, vUv + uDir * 3.230769) * 0.070270;
            sum += texture2D(tDiffuse, vUv - uDir * 3.230769) * 0.070270;
            gl_FragColor = sum;
          }
        `,
        depthTest: false, depthWrite: false,
      });
      this.finalMat = new THREE.ShaderMaterial({
        uniforms: {
          tScene: { value: this.sceneRT.texture },
          tSoft: { value: this.softRT.texture },
          tBloom: { value: this.bloomRT.texture },
          uResolution: { value: new THREE.Vector2(2, 2) },
          uTime: { value: 0 },
          uExposure: { value: 1.0 },
          uTilt: { value: 0.85 },
          uFocus: { value: 0.16 },
          uBloom: { value: 0.55 },
          uVignette: { value: 0.32 },
          uGrain: { value: 0.022 },
        },
        vertexShader: Post.quadVert,
        fragmentShader: /* glsl */`
          uniform sampler2D tScene, tSoft, tBloom;
          uniform vec2 uResolution;
          uniform float uTime, uExposure, uTilt, uFocus, uBloom, uVignette, uGrain;
          varying vec2 vUv;

          vec3 aces(vec3 x) {
            return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
          }
          float hash(vec2 p) {
            p = fract(p * vec2(443.897, 441.423));
            p += dot(p, p + 19.19);
            return fract(p.x * p.y);
          }
          void main() {
            vec3 sharp = texture2D(tScene, vUv).rgb;
            vec3 soft = texture2D(tSoft, vUv).rgb;
            float d = abs(vUv.y - 0.5);
            float tilt = smoothstep(uFocus, uFocus + 0.26, d);
            // also soften the extreme left/right edges a touch
            tilt = max(tilt, smoothstep(0.34, 0.5, abs(vUv.x - 0.5)) * 0.45);
            vec3 col = mix(sharp, soft, clamp(tilt * uTilt, 0.0, 1.0));

            vec3 bloom = texture2D(tBloom, vUv).rgb;
            col += bloom * vec3(1.0, 0.86, 0.68) * uBloom;

            col *= uExposure;
            col = aces(col);

            // split tone: cool shadows / warm highlights
            float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
            vec3 shadowTint = vec3(0.93, 0.985, 1.035);
            vec3 highTint = vec3(1.045, 1.0, 0.94);
            col = mix(col * shadowTint, col * highTint, smoothstep(0.12, 0.82, lum));

            // vignette
            float vig = smoothstep(0.34, 0.95, length((vUv - 0.5) * vec2(1.16, 1.0)));
            col *= 1.0 - vig * uVignette;

            // fine film grain
            float g = hash(vUv * uResolution + uTime * 7.31) - 0.5;
            col += g * uGrain;

            col = pow(max(col, 0.0), vec3(1.0 / 2.2));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
        depthTest: false, depthWrite: false,
      });
      this.quad.material = this.copyMat;
      this.activeQuad = null;
      this.size = new THREE.Vector2(2, 2);
      this._renderTarget = null;
    }

    setSize(renderer) {
      const s = new THREE.Vector2();
      renderer.getDrawingBufferSize(s);
      this.size.copy(s);
      const w = Math.max(2, Math.round(s.x));
      const h = Math.max(2, Math.round(s.y));
      this.sceneRT.setSize(w, h);
      const sw = Math.max(2, Math.round(w * 0.5));
      const sh = Math.max(2, Math.round(h * 0.5));
      this.softRT.setSize(sw, sh);
      this.softTmpRT.setSize(sw, sh);
      const bw = Math.max(2, Math.round(w * 0.25));
      const bh = Math.max(2, Math.round(h * 0.25));
      this.bloomRT.setSize(bw, bh);
      this.bloomTmpRT.setSize(bw, bh);
      this.finalMat.uniforms.uResolution.value.set(w, h);
    }

    blit(material, target) {
      this.quad.material = material;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.quadScene, this.quadCamera);
    }

    render(scene, camera, params = {}) {
      const r = this.renderer;
      const prevTarget = r.getRenderTarget();
      const prevClearColor = new THREE.Color();
      r.getClearColor(prevClearColor);
      const prevClearAlpha = r.getClearAlpha();
      const prevAutoClear = r.autoClear;

      // 1. scene → HDR target
      r.autoClear = true;
      r.setRenderTarget(this.sceneRT);
      r.clear(true, true, true);
      r.render(scene, camera);
      this.sceneStats = { calls: r.info.render.calls, triangles: r.info.render.triangles };

      // 2. full-colour soft pass for the tilt-shift blur
      this.copyMat.uniforms.tDiffuse.value = this.sceneRT.texture;
      this.blit(this.copyMat, this.softRT);
      this.blurMat.uniforms.tDiffuse.value = this.softRT.texture;
      this.blurMat.uniforms.uDir.value.set(1.0 / this.softRT.width, 0);
      this.blit(this.blurMat, this.softTmpRT);
      this.blurMat.uniforms.tDiffuse.value = this.softTmpRT.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1.0 / this.softRT.height);
      this.blit(this.blurMat, this.softRT);

      // 3. bloom: threshold + two blur passes
      this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
      this.brightMat.uniforms.uThreshold.value = params.bloomThreshold ?? 0.85;
      this.blit(this.brightMat, this.bloomRT);
      this.blurMat.uniforms.tDiffuse.value = this.bloomRT.texture;
      this.blurMat.uniforms.uDir.value.set(1.4 / this.bloomRT.width, 0);
      this.blit(this.blurMat, this.bloomTmpRT);
      this.blurMat.uniforms.tDiffuse.value = this.bloomTmpRT.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1.4 / this.bloomRT.height);
      this.blit(this.blurMat, this.bloomRT);

      // 4. composite to the screen
      const u = this.finalMat.uniforms;
      u.uTime.value = params.time ?? 0;
      u.uExposure.value = params.exposure ?? 1.0;
      u.uTilt.value = params.tilt ?? 0.85;
      u.uFocus.value = params.focus ?? 0.16;
      u.uBloom.value = params.bloom ?? 0.55;
      u.uVignette.value = params.vignette ?? 0.32;
      u.uGrain.value = params.grain ?? 0.022;
      this.quad.material = this.finalMat;
      r.setRenderTarget(null);
      r.autoClear = true;
      r.clear(true, true, true);
      r.render(this.quadScene, this.quadCamera);

      r.autoClear = prevAutoClear;
      r.setClearColor(prevClearColor, prevClearAlpha);
      r.setRenderTarget(prevTarget);
    }
  });

  Post.quadVert = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;
})();
