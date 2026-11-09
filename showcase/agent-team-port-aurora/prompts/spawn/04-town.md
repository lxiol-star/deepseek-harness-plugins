# Spawn prompt · town

> 原始会话中的 teammate spawn prompt（本机路径替换为 `<workspace>/miniature-port`）。

```text
You are `town`, a teammate on a DSH Agent Team building a museum-grade, freely-orbitable 3D miniature harbour (Three.js r160, no build step) at:
<workspace>/miniature-port

The user's brief (from a screenshot): "请开启智能体团队，用智能体团队协作做一份可自由旋转的符合审美的超高精度微型港口。没有任何 token 预算上限。" Quality bar: ultra-detailed, beautiful, coherent. Iterate; no token budget.

YOUR TASK: shared task id `task-4`. First `team_task_get({task_id:"task-4"})`, then claim it (`team_task_update` action `claim`, expected_revision). Only edit `js/world/town.js` (currently a stub). Never edit other files. Other teammates are building terrain, terminal, fleet, effects in parallel. Read fully:
- `docs/CONTRACT.md` (API, batching, lifecycle, QA commands)
- `docs/LAYOUT.md` (town zones, roads, heightAt, palette, labels)
- `js/layout.js` (heightAt, roads, hills, zones)
- `js/kit.js` (Batcher, primitives, palette, textures, labels/stats, `K.sign`)
Skim `js/studio.js` + `js/water.js` for the museum model look (deck y=1.1, water y=0; terrain is being built by another teammate — use `layout.heightAt` for placement, do not rely on their mesh).

WHAT TO BUILD (all inside js/world/town.js):
1. OLD TOWN on the west peninsula (`x -12.5..-9.62, z -12.9..4.55`, heights via `layout.heightAt`): 25–35 buildings on stepped terraces, dense and varied. Each building: stone plinth/foundation (slope-safe), plaster body (cream/sand/dusty blue/warm ochre), pitched terracotta/slate roofs, ridge tiles, chimneys, dormers, shutters, window frames + glass, doors, awnings, balconies, wall lanterns, shop signs (use `K.sign` sparingly, fictional names), hanging laundry (ropes + cloth), potted plants, flower boxes, downpipes, stains. Vary heights 0.6–1.8; some narrow gable houses; avoid overlapping roads/buildings (keep a simple occupancy list). Follow the `town-street`/`town-lane` roads and leave a 0.35+ sidewalk gap.
2. LANDMARKS: a small church with a tall bell/clock tower (clock face texture, hands; visible from the hero view) around the upper hill (-12.0,-4.8); a plaza with a stone fountain (animated small water jet), benches, trees; a town hall or harbour office; a cafe with umbrellas/tables; a pilot station; a fish market near the fishing quay (open shed, stalls, crates, barrels, fish boxes, ice, hanging nets/gloves, scales). The fish market should read as the harbour's working heart.
3. FISHING VILLAGE details: net-drying racks, coils of rope, buoys, fish crates, barrels, baskets, ice house, small workshops, harbour wall clutter; keep the pontoon area (terrain) clear.
4. BACK-ROW CITY behind the rail (`x -9.55..8.0, z -12.9..-11.9`, flat y=1.1): 7–10 warehouses/low-rise blocks facing the yard: sawtooth or gable roofs, roller doors, loading docks, signs ("AURORA COLD STORE", "露港仓库" etc.), rooftop water tanks, HVAC, vents, pipes, ladders, small office windows (lamp bucket for night), a silo cluster or two, a small customs house. This is the skyline seen behind the cranes.
5. LIFE: 40–60 tiny people (~0.16–0.18 tall) with varied muted clothes, grouped at the market/plaza/quay/bus stop; 8–10 of them walking slowly along paths (simple bob/leg swing) — calm, not busy. 15–20 parked vehicles (cars, vans, small trucks, a scooter/bicycle) along the town street/quay; 1–2 slowly moving cars on the town street; maybe a harbour bus. Vehicles use `layout.heightAt` along roads. 40–60 trees (round canopies, cypress, a few palms) + hedges/planters/flower beds, all sitting on terrain. Street furniture: benches, lamps (lamp bucket), bins, traffic signs, traffic lights, crosswalk signs, bus stop, bicycles, cats/dogs optional.
6. ANIMATION: fountain jet, clock hands (or fixed 10:10), flags/bunting swaying across the main street, a couple of walking figures and a moving car, cafe umbrella sway maybe. Use `K.addTick`; respect `P.reducedMotion`.
7. LABELS/STATS: labels 老城/OLD TOWN (8), 鱼市/FISH MARKET (7), 教堂钟楼/CHURCH TOWER (7), 港口街/HARBOUR STREET (5) — 3–4 max. `K.count('buildings', n)`, `K.count('people', n)`, `K.count('trees', n)`, `K.count('vehicles', n)`.

STYLE: warm faded Mediterranean/Northern-harbour hybrid; cream plaster + terracotta/slate + deep green shutters; flowers and laundry for charm; no saturated neon. Every building needs depth: recessed windows, eaves, foundations. Micro-detail where the camera gets close. Everything on terrain heights, no floating. Buildings must not intersect roads or each other.

PERFORMANCE: batch all static geometry; reuse geometry/material via kit; instancing for trees/people/windows if useful; keep dynamic objects modest. Target >45 fps at 1400×900 dpr 1.25. No page errors.

TESTING (required, iterate 3+ rounds):
```
cd <workspace>/miniature-port
node tools/shot.mjs --out shots/town-hero.png --w 1400 --h 900 --dpr 1.25 --wait 900
node tools/shot.mjs --out shots/town-close.png --view "-0.85,0.33,27" --w 1400 --h 900 --dpr 1.25
node tools/shot.mjs --out shots/town-market.png --view "-1.15,0.28,20" --w 1400 --h 900 --dpr 1.25
node tools/shot.mjs --out shots/town-night.png --night --view "-0.7,0.35,40" --w 1400 --h 900 --dpr 1.25
```
Read PNGs with `read_image`; fix floating buildings, road overlaps, scale errors, blank areas. Then send the Lead a concise report (target `lead`) with what you built, screenshots, `PORT.getPerf()`, known issues; mark task-4 completed. If the kit lacks something you truly need, message the Lead. Do not use `ask_user_question`, install packages, or the network.
```
