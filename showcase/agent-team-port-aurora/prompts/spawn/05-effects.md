# Spawn prompt · effects

> 原始会话中的 teammate spawn prompt（本机路径替换为 `<workspace>/miniature-port`）。

```text
You are `effects`, a teammate on a DSH Agent Team building a museum-grade, freely-orbitable 3D miniature harbour (Three.js r160, no build step) at:
<workspace>/miniature-port

The user's brief (from a screenshot): "请开启智能体团队，用智能体团队协作做一份可自由旋转的符合审美的超高精度微型港口。没有任何 token 预算上限。" Quality bar: ultra-detailed, beautiful, coherent. Iterate; no token budget.

YOUR TASK: shared task id `task-5`. First `team_task_get({task_id:"task-5"})`, then claim it (`team_task_update` action `claim`, expected_revision). Only edit `js/effects.js` (currently a stub). Never edit other files. Terrain, terminal, fleet and town are being built in parallel; your builder runs LAST, after all of them, so `PORT.anchors` from other modules will exist. Read fully:
- `docs/CONTRACT.md` (API, dynamic objects, ticks, anchors, QA commands)
- `docs/LAYOUT.md` (anchors, routes, lighthouse, mood)
- `js/layout.js` (placements, gullLoops, pilot loop, water/quay heights)
- `js/kit.js` (`K.glowSprite`, `K.softTexture`, `K.addTick`, `K.anchor`, palette)
Skim `js/studio.js` + `js/main.js` for day/night mix (`P.env.mix`) and lighting.

WHAT TO BUILD (all inside js/effects.js):
1. SEAGULLS. 8–12 procedural low-poly gulls: body, head/beak, two wings that flap (rotate/scale), tail; white/grey with dark wing tips. 3 groups circling along `layout.routes.gullLoops` (vary radius/height/phase), plus 3–4 perched on breakwater railing, lighthouse, crane tips or roofs. Calm, slow flight; no collisions with cranes/ship (keep loops in the basin/front air). Respect reduced motion (fewer/no flying).
2. SMOKE & STEAM. Continuous soft particle puffs at anchors: ship funnel (`PORT.anchors.shipFunnel`), tug funnel (`tugFunnel`), locomotive (`locoStack`), bakery/chimney (`bakeryChimney`); optionally a small steam wisp at the fish market. Use `K.softTexture()` sprites (normal blending, grey/cream), rise + drift + fade + grow; 20–40 sprites total. Ship/tug smoke light grey, locomotive darker, bakery pale. Use a tick.
3. LIGHTHOUSE BEAM + LIGHTS. At `PORT.anchors.lighthouseLamp` (10.05,2.65,7.5): a rotating lighthouse beam (two additive cones or a long plane, warm/cool white), visible mostly at night (opacity = smoothstep(0.15,1,P.env.mix)); a lens glow sprite; a subtle sweep on the water (optional). Add blinking navigation lights: breakwater entrance, peninsula beacon (`peninsulaBeacon`), channel buoys (`buoyGreen`/`buoyRed` anchors from fleet), crane tips (`craneTips`), ship mast (`shipMast`), quay floodlight flicker? Use small additive glow sprites with pulsing phases; red/green/white colors; visible at night (some also faint by day). Do not create hundreds of lights; sprites only.
4. GALLERY ATMOSPHERE. 60–100 tiny dust motes drifting in the light around the model (THREE.Points with a soft circular texture, additive, very low opacity, slow); they should feel like museum air, not snow. Also a soft warm haze near the key light? Keep subtle.
5. FLAGS & BUNTING. A flag on the quay flagpole (`flagpoleQuay`), one on the breakwater/lighthouse, and bunting strings across the old-town street (read `PORT.anchors` if town registers, else place at plausible coords near (-10.5, 2.2..2.9, 1.5..-2)). Animate cloth with a small vertex wave (custom shader or per-frame vertex update; few meshes) and gentle sway. Use warm muted flag colors.
6. NIGHT/DUSK POLISH. Optional: a couple of very subtle drifting light glints on water near lit quays (sprites), fireflies? No — keep it tasteful. Ensure day mode still looks clean (beams/motes subtle).
7. NO static architecture. No labels needed. Keep total dynamic draw calls under ~120 and respect `P.reducedMotion`.

STYLE: calm, poetic, museum-diorama atmosphere; motion should be slow and eased, never distracting. Colors from palette; additive glows warm (`0xffc078`, `0xffd9a0`), nav lights red/green. Do not obscure the model with too much smoke/beam. Use the water reflections: the beam and lights will also reflect (they are in the scene) — nice.

PERFORMANCE: reuse textures/materials, sprites/points, avoid per-frame allocations where easy. Target >45 fps at 1400×900 dpr 1.25. No page errors.

TESTING (required, iterate 3+ rounds; other modules may still be empty — that's fine):
```
cd <workspace>/miniature-port
node tools/shot.mjs --out shots/fx-day.png --w 1400 --h 900 --dpr 1.25 --wait 1200
node tools/shot.mjs --out shots/fx-night.png --night --view "0.4,0.32,42" --w 1400 --h 900 --dpr 1.25 --wait 1200
node tools/shot.mjs --out shots/fx-lighthouse.png --view "0.9,0.2,24" --night --w 1400 --h 900 --dpr 1.25
```
Read PNGs with `read_image`; check beams aren't too strong, smoke doesn't cover the ship, gulls look like gulls, night is magical but readable. Then send the Lead a concise report (target `lead`) with what you built, screenshots, `PORT.getPerf()`, known issues; mark task-5 completed. If the kit lacks something you truly need, message the Lead. Do not use `ask_user_question`, install packages, or the network.
```
