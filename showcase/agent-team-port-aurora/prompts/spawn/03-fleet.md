# Spawn prompt · fleet

> 原始会话中的 teammate spawn prompt（本机路径替换为 `<workspace>/miniature-port`）。

```text
You are `fleet`, a teammate on a DSH Agent Team building a museum-grade, freely-orbitable 3D miniature harbour (Three.js r160, no build step) at:
<workspace>/miniature-port

The user's brief (from a screenshot): "请开启智能体团队，用智能体团队协作做一份可自由旋转的符合审美的超高精度微型港口。没有任何 token 预算上限。" Quality bar: ultra-detailed, beautiful, coherent. Iterate; no token budget.

YOUR TASK: shared task id `task-3`. First `team_task_get({task_id:"task-3"})`, then claim it (`team_task_update` action `claim`, expected_revision). Only edit `js/world/fleet.js` (currently a stub). Never edit other files. Other teammates are building terrain, terminal, town, effects in parallel. Read fully:
- `docs/CONTRACT.md` (API, batching, lifecycle, QA commands)
- `docs/LAYOUT.md` (berth, tug/sailboat/fishing boat/buoy placements, pilot loop, anchors)
- `js/layout.js` (placements, routes, water radius, quay walls)
- `js/kit.js` (Batcher, primitives, palette, textures, labels/stats)
Skim `js/studio.js` + `js/water.js` for lighting/water (water y=0; real planar reflections; keep hulls' waterlines believable).

WHAT TO BUILD (all inside js/world/fleet.js):
1. CONTAINER SHIP (hero). Berth centre `(0.6, -2.55)`, length 13.6 along x, beam 2.5 (hull z -3.8..-1.3), bow towards +x, superstructure aft (around x=-4.5). Detailed hull: bulbous bow, flare, deck sheer, maroon boot-top, navy/black hull, draft marks, Plimsoll, bilge keel, rudder hint, anchors + hawse pipes, foredeck windlass, hatch covers, lashing bridges, deck container bays (3–4 tiers, muted colours, use instancing or batch; 60–100 boxes), superstructure with 4–5 decks, bridge wings, glass windows (glass bucket + lamp bucket for night), radar mast + spinning radar, antennas, funnel with fictional line mark, lifeboats + davits, railings, ladders, deck lights, flags, a couple of crew figures. Ship name on the bow via a canvas texture/sign ("AURORA", "PORT AURORA" etc.). Gentle bob/roll (very subtle, ~0.01 units) + radar spin + flag sway. Register `K.anchor('shipFunnel', {pos:[x,y,z]})` at the actual funnel top and `K.anchor('shipMast', ...)`.
2. MOORING. 4–6 mooring lines from bow/stern winches to quay bollards (read `PORT.anchors.quayBollards` if terrain registers it, else place at x≈-5.5,-1.5,2.5,6.5, top y≈1.3, z≈-4.55). Black rubber fenders between hull and quay wall. Ropes via `K.rope` (static, batch). A couple of rat guards maybe.
3. HARBOUR TUG at `(5.85, 4.95)` heading -0.9: ~2.8–3.2 long, deep red/maroon hull with white/cream house, black rubber tyre fenders, towing winch aft, fire monitor, mast, exhaust stack, nav lights, name, railings, bollard. Gentle bob + slight yaw sway; register `K.anchor('tugFunnel', {pos:[x,y,z]})`.
4. PILOT BOAT animated along `layout.routes.pilotLoop` (closed): ~1.6 long, white hull with orange stripe, small wheelhouse, radar, mast, fenders; position/heading from `L.samplePolyline`; gentle bob; white foam wake trail + stern foam rings fading; nav lights. Keep clear of the sailboat and buoys.
5. FISHING BOATS (3) along the fishing quay at layout.placements.fishingBoats: small 1.2–1.5 long, coloured hulls (faded blue/red/green), tiny wheelhouse, mast, nets/floats/crates/barrels, fenders; moored to the pontoon (terrain builds pontoon), ropes; gentle bob. One could have a small crane/winch.
6. SAILBOAT at `(-4.35, 8.9)`: ~1.8 long, cream hull, wooden trim, mast + boom, two sails (white/cream, slight curve, DoubleSide), pennant; gentle heel/bob, maybe slow yaw drift.
7. BUOYS: green buoy at (-2.4,11.4) and red at (2.4,12.1) with light cage, number, chain to sinker, gentle bob; plus 2–3 small mooring buoys near the fishing quay. Register anchors `buoyGreen`, `buoyRed` with lamp positions for effects.
8. LABELS/STATS: labels 集装箱船/CONTAINER SHIP (priority 10), 拖轮/HARBOUR TUG (6), 渔船/FISHING FLEET (5). `K.count('vessels', 6)`. Maybe count ship deck containers into 'containers'? No — terminal owns that stat; don't double count.

STYLE: `K.palette` + `K.vary`; faded, elegant model-ship paint; no neon. Detailed silhouettes and micro-detail (railings, windows, cables, life rings). All water craft draft below y=0; decks above. Avoid intersecting the quay/ship; the gap to the quay wall is ~0.5–0.7 units. Reflections are real, so hull waterlines and above-water detail matter. Animation must be calm and smooth, never distracting.

PERFORMANCE: batch all static hull parts where possible (the ship's body can be a dynamic group if it bobs — but then it cannot be batched; use merged meshes or a modest number of meshes with cached materials). Animated boats can be THREE.Group hierarchies; keep dynamic draw calls under ~150. Target >45 fps at 1400×900 dpr 1.25. No page errors.

TESTING (required, iterate 3+ rounds):
```
cd <workspace>/miniature-port
node tools/shot.mjs --out shots/fleet-hero.png --w 1400 --h 900 --dpr 1.25 --wait 900
node tools/shot.mjs --out shots/fleet-ship.png --view "0.35,0.2,27" --w 1400 --h 900 --dpr 1.25
node tools/shot.mjs --out shots/fleet-fishing.png --view "-0.7,0.3,30" --w 1400 --h 900 --dpr 1.25
```
Read PNGs with `read_image`, fix proportions/floating/intersections, check no page errors. Then send the Lead a concise report (target `lead`) with what you built, screenshots, `PORT.getPerf()`, known issues; mark task-3 completed. If the kit lacks something you truly need, message the Lead. Do not use `ask_user_question`, install packages, or the network.
```
