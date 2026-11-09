# 微港 · Port Aurora — BUILD CONTRACT (read this before writing code)

We are building one artifact: a standalone, offline, freely-orbitable miniature
harbour in `<workspace>/miniature-port`. It opens by
double-clicking `index.html`. No network, no npm packages, no external assets.

**Read first:** `docs/LAYOUT.md`, `js/layout.js`, `js/kit.js`, and skim
`js/studio.js` + `js/water.js` to see the style. The current render is
`shots/02-water-clean.png`.

---

## 1. File ownership — do not edit anything else

| Owner | Files |
|---|---|
| Lead | `index.html`, `style.css`, `js/layout.js`, `js/kit.js`, `js/studio.js`, `js/water.js`, `js/post.js`, `js/main.js`, `js/ui.js`, `tools/`, `docs/` |
| `terrain-civils` | `js/world/terrain.js` only |
| `terminal-yard` | `js/world/terminal.js` only |
| `fleet` | `js/world/fleet.js` only |
| `town` | `js/world/town.js` only |
| `effects` | `js/effects.js` only |
| `verifier` | `tools/`, `shots/`, `docs/QA.md`, `docs/CRITIQUE.md` (never world files) |

All files are already wired in `index.html`. Do not add `<script>` tags, do not
edit other modules, do not change the layout data or kit. If the kit is missing
something you need, message the Lead instead of editing it.

Builders must stay inside their own file. Shared filesystem: never touch a file
you don't own.

---

## 2. Lifecycle

`main.js` does:

1. create renderer/scene/camera + studio (plinth, room, lights) + water;
2. `PORT.batch = new PORT.kit.Batcher()`;
3. call `PORT.builders.terrain → terminal → fleet → town → effects` in order,
   passing `ctx = { renderer, scene, camera, THREE, kit, layout, studio, water, batch }`;
4. bake all batched static geometry with `batch.finish(scene)`;
5. start the render loop and the UI.

So: **all static geometry must be added during your builder call**, before
`batch.finish`. Dynamic objects are added immediately to the scene and animated
from tick callbacks. Do not use `setTimeout`/async to add static geometry later.

Each builder is a plain function:

```js
(function () {
  const P = (window.PORT = window.PORT || {});
  P.builders = P.builders || {};
  P.builders.terrain = function terrain(ctx) {
    const K = ctx.kit, L = ctx.layout, THREE = ctx.THREE, B = P.batch;
    const rand = K.rng(0x7e44a1);      // own deterministic stream
    // ... build ...
  };
})();
```

Deterministic output matters: use your own seeded `K.rng(seed)`; never
`Math.random()` for geometry.

---

## 3. The batched static API (`js/kit.js`)

Thousands of small parts are cheap because they are merged into ~6 vertex-colour
meshes. Use these helpers for **everything static**:

```js
K.box(w,h,d, x,y,z, color, opts?)          // opts: {rx,ry,rz,bucket,seg?}
K.cyl(radius,h, x,y,z, color, opts?)       // y-axis, opts.seg=8|12|16
K.cone(radius,h, x,y,z, color, opts?)
K.sphere(radius, x,y,z, color, opts?)      // opts.ws/hs
K.capsule(r,len, x,y,z, color, opts?)
K.torus(R,r, x,y,z, color, opts?)          // opts.rs/ts
K.disc(r, x,y,z, color, opts?)             // flat disc in XZ
K.ring(r, inner, x,y,z, color, opts?)      // flat ring in XZ
K.plane(w,h, x,y,z, color, opts?)          // faces +Z, use rz to lie flat
K.prism(pointsXZ, height, x,y,z, color, opts?) // extruded footprint, base y=0
K.lathe(profile, seg, x,y,z, color, opts?) // profile = [[radius,y],...]
K.strut(a,b,radius, color, opts?)          // round strut between two 3D points
K.bar(a,b,w, color, opts?)                 // square beam between two points
K.rope(a,b,sag,radius, color, opts?)       // catenary rope/cable
K.tube(points3D,radius, color, opts?)      // smooth tube through 3+ points
K.add(geometry, color, opts)               // raw BufferGeometry, most general
```

All positions are world positions; rotations in **radians**. `bucket` is one of:
`matte` (default: stone, concrete, wood, plaster, soil), `paint` (painted metal,
containers, ship paint), `metal` (rails, machinery, brass), `glass` (windows,
lenses), `foliage`, `lamp` (emissive practical lights/windows; they switch on
at night automatically).

Colors: use `K.palette.*` and `K.vary(hex, rand, {l:.04,s:.05,h:.01})`,
`K.shade(hex, dl, ds, dh)`, `K.mixHex(a,b,t)`. Colors are sRGB hex numbers.

Repeated elements (containers, windows, tetrapods, trees, people) should use
instancing to keep memory sane:

```js
const mat = K.std(0xffffff, { roughness: 0.55, metalness: 0.05, map: tex });
const inst = K.instancer(K.geoBox(), mat, { name: 'containers' });
for (...) inst.add({ pos:[x,y,z], rot:[0,ry,0], scale:[w,h,d], color: K.vary(hex, rand) });
inst.finish(ctx.scene);   // adds an InstancedMesh
```

`K.std(color, opts)` caches shared materials; `K.basic(color, opts)` too.
Signs / text plates:

```js
K.sign({
  x, y, z, ry, w: 1.2, h: 0.28,
  text: 'AURORA LINE', sub: 'ROTTERDAM · 露港',
  bg: '#1e2a28', fg: '#f2e7cf', border: '#c6a169', night: true,
  font: K.fonts.sans, lines: [...]
});
```

Canvas textures: `K.canvas(w,h,drawFn)`, `K.texture(canvas,{repeat:[x,y]})`,
`K.textTexture({...})`, `K.glowTexture()`, `K.glowSprite(color,size,opacity)`.

**No custom `MeshStandardMaterial` per object** in a loop. Use `K.std` (cached)
or instancing. Static textures should be ≤1024², generated at build time only.

---

## 4. Dynamic objects & animation

```js
const group = new THREE.Group();
// build children with normal THREE.Mesh + K.std(...) materials
group.position.set(...);
P.addObject(group);                 // adds to scene
K.setShadows(group, true, true);    // cast/receive
K.addTick((dt, t, env) => {
  group.rotation.z = Math.sin(t * 0.5) * 0.01;   // env.mix = 0 day .. 1 night
});
```

- Use `K.std` / `K.basic` (cached) for dynamic meshes.
- Keep total **dynamic draw calls under ~250**; use merged geometries or
  InstancedMesh for repeated moving parts if necessary.
- Ticks receive `(dt, t, env)`; `env.mix` is the day/night blend.
- Respect `P.reducedMotion` (skip decorative motion if true).
- Cast shadows on meaningful shapes only (not every bolt).

Register anchors for cross-module effects (smoke, beams):

```js
K.anchor('shipFunnel', { pos: [x,y,z] });   // plain data, world coords
```

Existing default anchors are in `layout.placements.anchors`; refine them from
your module if your geometry differs.

---

## 5. Labels & stats

```js
K.addLabel({
  pos: [x, y, z], title: '岸桥', sub: 'SHIP-TO-SHORE CRANE',
  priority: 9, side: 1            // side: -1 left, 1 right, 0 auto
});
K.count('cranes', 1);             // keys: parts(auto), containers, cranes,
                                  // vessels, buildings, people, trees, vehicles
```

2–4 labels per module, priority 5–10 (10 = most important). Labels are
auto-placed with leader lines; they must point at real geometry.

---

## 6. Craft & performance rules

- All land objects sit on `L.heightAt(x,z)`; no floating or buried objects.
  Buildings on slopes need a visible stone plinth/foundation.
- Water is `y=0`; hulls draft below it; quay deck `y=1.1`.
- Use the palette; jitter subtly. Warm light, low chroma.
- Detail at three scales: silhouette (masts/cranes/roofs), module (windows,
  panels, containers), micro (bolts, ropes, stains, signage, figures).
- Avoid coplanar z-fighting: offset decals 0.003–0.01, never 0.
- Shadow budget: merged static meshes cast shadows automatically; dynamic
  objects should cast; avoid >10 shadow-casting dynamic lights (there are none
  besides the sun).
- Total static parts across the model can be ~3,000–6,000; the target is a
  rich model that still renders >45 fps at 1600×1000 on an M-series Mac.
- Keep each file self-contained; no `import`, no fetch, no external files.

---

## 7. Testing (required before you report done)

Headless Chrome screenshot + console/perf harness:

```bash
cd <workspace>/miniature-port

# hero view
node tools/shot.mjs --out shots/terrain-hero.png --w 1400 --h 900 --dpr 1.25 --wait 900

# inspect only your module (others skipped)
node tools/shot.mjs --out shots/terminal-only.png --skip "terrain,fleet,town,effects" --view "0.5,0.35,44"

# close-up: yaw,elevation,distance
node tools/shot.mjs --out shots/cranes.png --view "0.15,0.22,24" --w 1400 --h 900 --dpr 1.25

# night
node tools/shot.mjs --out shots/night.png --night --view "0.5,0.35,44"

# labels on
node tools/shot.mjs --out shots/labels.png --labels
```

- The tool prints page errors and perf; **no page errors / build errors** are
  allowed in your report.
- Check the screenshot yourself (read the PNG) from at least the hero angle and
  one close-up; fix visible gaps/floating/z-fighting.
- Use `PORT.setView({yaw,elev,dist}, true)` in `--eval` for exact angles.
- You can evaluate `JSON.stringify(PORT.getPerf())` for calls/triangles/fps.

---

## 8. Team workflow

1. Read your shared task on the team board (`team_task_list`), claim it with
   `team_task_update` (action `claim`, current revision), keep it `in_progress`.
2. Work autonomously; do not wait for permission. Message the Lead
   (`send_message` target `lead`) only when:
   - you need a missing API / cross-module decision,
   - you are done (include: what you built, screenshots, perf, known issues),
   - you are blocked.
3. When done: mark the task `completed` and send the Lead a concise report
   with screenshot paths + `PORT.getPerf()` numbers.
4. No token budget limit, but keep the deliverable coherent: quality over
   quantity, and never break another module's file.

The Lead integrates, tunes the palette/lighting/water, and runs final QA.
