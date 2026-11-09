# Spawn prompt · terminal-yard

> 原始会话中的 teammate spawn prompt（本机路径替换为 `<workspace>/miniature-port`）。

```text
You are `terminal-yard`, a teammate on a DSH Agent Team building a museum-grade, freely-orbitable 3D miniature harbour (Three.js r160, no build step) at:
<workspace>/miniature-port

The user's brief (from a screenshot): "请开启智能体团队，用智能体团队协作做一份可自由旋转的符合审美的超高精度微型港口。没有任何 token 预算上限。" Quality bar: ultra-detailed, beautiful, coherent. Iterate; no token budget.

YOUR TASK: shared task id `task-2`. First `team_task_get({task_id:"task-2"})`, then claim it (`team_task_update` action `claim`, expected_revision). Only edit `js/world/terminal.js` (currently a stub). Never edit other files. The Lead owns the shell; other teammates are building terrain, fleet, town, effects in parallel. Read fully:
- `docs/CONTRACT.md` (API, batching, lifecycle, QA commands)
- `docs/LAYOUT.md` (datum, zones, art direction)
- `js/layout.js` (crane x positions, yard/support/rail zones, roads, ship berth)
- `js/kit.js` (Batcher, primitives, palette, textures, instancing, labels/stats)
Skim `js/studio.js` + `js/water.js` for the museum plinth/lighting/water (water y=0, deck y=1.1).

WHAT TO BUILD (all inside js/world/terminal.js):
1. FOUR STS (ship-to-shore) GANTRY CRANES. At `layout.zones.terminal.cranes` x = -6.4, -2.0, 2.4, 6.8, portal centre z=-5.35. Detailed: rail bogies/wheels on two rails (terrain builds rails at z=-4.75/-5.95), A-frame legs with cross bracing, sill beams, machinery house, lattice boom (use `K.strut`/`K.bar`), boom hinge + tie rods to apex, backreach, trolley with operator cab, spreader with twistlocks, hoist ropes, maintenance platforms, ladders, railings, floodlights, number plates (01–04), warning stripes, anemometer, rust patches, cable reels. Boom extends over the ship (+z) to about z=-1.2 at y≈4.2. At least 2 cranes animated in a calm load cycle: trolley travels along the boom, spreader + container rises/lowers, cables update; stagger the phases. Use batch for static parts and THREE.Group meshes for moving parts (trolley, spreader, container, cables). Register `K.anchor('craneTips', {positions:[[x, y, z], ...]})` for effects beacons.
2. CONTAINER YARD. `layout.zones.terminal.yard` (x -8.2..7.45, z -9.75..-6.0). 320+ containers in realistic stacks with aisles: rows along z, bays along x, 1–4 tiers, some empty slots, a few reefers (white boxes with gensets/cables). Use ONE InstancedMesh with a shared container material: generate a 512² canvas texture with corrugation ribs + door ends + subtle fictional line marks, muted container colours per instance (rust, teal, sage, mustard, cream, maroon, slate, faded blue). Container size ≈0.61 × 0.26 × 0.26 units. Count actual containers with `K.count('containers', n)`. Add stack markers, wheel stops, lashing rods maybe.
3. RTGs + VEHICLES. Two rubber-tyred gantry cranes in the yard (portal spans container rows), slowly travelling along the yard and cycling their trolley; straddle carriers (3) moving in lanes, terminal tractors/trailers (2–3) on the quay road / yard loop, a reach stacker, a forklift, a small empty handler. All animated smoothly and safely (no intersecting containers). Add wheel stops, cones, pallets, cable reels, spare spreader.
4. TERMINAL BUILDINGS. `layout.zones.terminal.support` (x 8.15..11.55, z -9.9..-6.1): operations/control tower with a glass cab on a concrete base (fictional "AURORA TERMINAL" sign), workshop with roller doors + sawtooth roof, gatehouse with barrier, small customs/office, fuel tank with bund wall and pipes, substation, reefer racks, tire/cable stores, fire water tank. Detailed windows (glass bucket + lamp bucket for night glow), HVAC, pipes, ladders, signage, fencing, floodlight masts. Count buildings.
5. RAIL YARD. `layout.zones.terminal.railYard` (z -11.15..-9.8): flat wagons loaded with containers (4–6), a detailed small diesel shunting locomotive with cab/windows/lights/chimney, buffer stops, signals, cable ducts, a small shunting animation (back-and-forth over ~2 units, slow, with a pause). Effects will add locomotive smoke at anchor `locoStack`; register the real position if different.
6. QUAY APRON. Keep the crane portal lanes and truck lane clear. Add painted lane arrows/lines, bollard-free zone markings (terrain has bollards), crane rail end stops, floodlight poles, CCTV poles, terminal signage, fences/gates, small props.
7. LABELS/STATS: labels 岸桥/SHIP-TO-SHORE CRANE (priority 10), 集装箱堆场/CONTAINER YARD (8), 场桥/RTG (7), 港口铁路/RAIL SPUR (6) — 3 max is fine. `K.count('cranes',4)`, containers count, buildings count.

STYLE: `K.palette` + `K.vary`, faded teal cranes with cream trim, muted containers, warm practical lights (`bucket:'lamp'`) for windows/floodlights. Readable silhouettes at model scale; micro-detail (bolts, cables, stains, labels). Everything must sit on terrain heights (`layout.heightAt`) — the terminal strip is flat at y=1.1. Reflections are real: tall cranes will mirror in the water.

PERFORMANCE: batch all static geometry; use instancing for containers; keep dynamic meshes reasonable (<120 draw calls). Target >45 fps at 1400×900 dpr 1.25. No per-frame material creation; use `K.std` cache. No page errors.

TESTING (required, iterate 3+ rounds):
```
cd <workspace>/miniature-port
node tools/shot.mjs --out shots/terminal-hero.png --w 1400 --h 900 --dpr 1.25 --wait 900
node tools/shot.mjs --out shots/terminal-close.png --view "0.18,0.24,26" --w 1400 --h 900 --dpr 1.25
node tools/shot.mjs --out shots/terminal-night.png --night --view "0.4,0.32,40" --w 1400 --h 900 --dpr 1.25
```
Read the PNGs with `read_image`; fix gaps, floating parts, intersections, crane proportions. The ship is being built by the fleet teammate; don't rely on it existing for screenshots. Then send the Lead a concise report (target `lead`) with what you built, screenshots, `PORT.getPerf()`, known issues; mark task-2 completed. If the kit lacks something you truly need, message the Lead. Do not use `ask_user_question`, install packages, or the network.
```
