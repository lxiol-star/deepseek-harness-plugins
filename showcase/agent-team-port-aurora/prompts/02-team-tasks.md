# 02 · 共享任务板原文

Lead 在 Phase 2 创建了 6 个 unowned 任务；teammates 先 `team_task_get` 读取，再 `team_task_update(action="claim")` 领取。每个任务都写明了写作用域，避免多人改同一文件。

| id | 标题 | 写作用域 |
|---|---|---|
| task-1 | Build terrain, coastline, quay infrastructure & breakwater (terrain-civils) | `js/world/terrain.js` |
| task-2 | Build container terminal: 4 STS cranes, yard, RTGs, buildings, rail (terminal-yard) | `js/world/terminal.js` |
| task-3 | Build fleet: container ship, tug, pilot boat, fishing boats, sailboat, buoys (fleet) | `js/world/fleet.js` |
| task-4 | Build old town, fishing village, back-street city, props & people (town) | `js/world/town.js` |
| task-5 | Build ambient effects: gulls, smoke, lighthouse beam, beacons, dust, flags (effects) | `js/effects.js` |
| task-6 | QA harness, multi-angle screenshots, interaction/perf/visual critique (verifier) | `tools/`, `shots/`, `docs/QA.md`, `docs/CRITIQUE.md` |

---

## task-1 — terrain-civils

> Own `js/world/terrain.js`. Read `docs/LAYOUT.md` + `docs/CONTRACT.md` + `js/layout.js` + `js/kit.js`. Build: island landform following heightAt with layered rock/soil cliffs, coastline, beaches; cargo & fishing quay walls with concrete detail (coping, panels, ladders, bollards, rubber fenders, rust, safety lines, crane rails); breakwater body with tetrapods, crown walkway, parapet, railings, lamps; lighthouse at (10.05,7.5) with lamp anchor at (10.05,2.65,7.5); peninsula beacon; roads/cobbles/curbs/markings; rail bed/sleepers/rails/signals/buffer stops; retaining walls + stairs in old town hill; pontoon; rocks/pebbles/driftwood; quay promenade furniture. Register 2–4 labels and stats where relevant. Must have zero page errors, good hero + close-up + low-angle screenshots, and >45fps at 1400x900. Report to lead with screenshots, perf, known issues. Do not edit any file other than `js/world/terrain.js`.

## task-2 — terminal-yard

> Own `js/world/terminal.js`. Read docs + layout + kit. Build: 4 detailed animated STS cranes at layout x positions / z=-5.35 with booms over the ship, trolleys/spreaders/cables/warning lights; dense container yard (~340+ instanced containers, muted palette, corrugation texture) with 2 animated RTGs; straddle carriers, terminal tractors, reach stackers, forklifts; support buildings (ops tower, workshop, gatehouse, fuel tank, substation, reefer racks, tire/cable stores); rail yard with flat wagons, a detailed diesel shunter and signals/buffer stops; fences, floodlight masts, signage, road markings/props. Register 2–4 labels (岸桥/堆场/场桥) and counters cranes/containers/buildings. Zero page errors; screenshots hero + close-up + night; >45fps. Report to lead. Do not edit any file other than `js/world/terminal.js`.

## task-3 — fleet

> Own `js/world/fleet.js`. Build: hero container ship (13.6 long) at layout berth with detailed hull, superstructure/bridge/radar/funnel/lifeboats/railings, deck container bays, mooring lines to quay bollards, hull fenders, ship name/draft marks; animated gentle bob/roll + spinning radar + flags; colourful harbour tug with fenders/winch/monitor; pilot boat animated along `layout.routes.pilotLoop` with wake; 3 fishing boats at the fishing quay with nets/crates/gear; sailboat with sail; channel buoys with lights/chains. Keep all clear of quay and each other. Expose anchors shipFunnel/tugFunnel. Register 2–4 labels and vessels counter. Zero page errors; day/close-up/night screenshots; >45fps. Report to lead. Do not edit any file other than `js/world/fleet.js`.

## task-4 — town

> Own `js/world/town.js`. Build: 25–35 hillside buildings on the west peninsula using heightAt (plaster palette, terracotta/slate roofs, chimneys/dormers/shutters/awnings/balconies/laundry/potted plants/shop signs/wall lanterns); church with clock tower; plaza with fountain + working clock; fish market & fishing village details; cafe/shops; back row warehouses/low-rise blocks behind the rail; 40–60 trees/hedges; 40–60 tiny people (some walking); 15–20 parked vehicles + 1–2 animated cars/bus; street furniture (benches, lamps, bins, signs, traffic lights, bus stop, bicycles); animated flags/bunting/fountain. Register 3–4 labels and counters buildings/people/trees/vehicles. Zero page errors; hero/close-up/night screenshots; >45fps. Report to lead. Do not edit any file other than `js/world/town.js`.

## task-5 — effects

> Own `js/effects.js`. Build: 8–12 procedural seagulls (flying loops + perched), smoke/steam puffs at ship/tug/locomotive/bakery chimney anchors (read `PORT.anchors`; use layout fallback positions), rotating lighthouse beam + lens glow at (10.05,2.65,7.5), blinking night nav/beacon lights (buoys, breakwater, crane tips, ship mast), gallery dust motes, and animated flags/bunting on the quay/breakwater. Respect `P.reducedMotion`; use `P.env.mix` for night-only glows; keep draw calls reasonable (<120). Zero page errors; day+night screenshots; >45fps. Report to lead with screenshots/perf. Do not edit any file other than `js/effects.js`.

## task-6 — verifier

> Own `tools/`, `shots/`, `docs/QA.md`, `docs/CRITIQUE.md`. Read contract/layout; inspect main/ui. Build a reproducible QA harness; run preset day/night/labels/close-up/mobile shots; collect errors + `PORT.getPerf()` + stats; verify controls (drag, wheel, dblclick, keyboard, day/night, labels, postcard, loader); test file:// font loading; check visual issues (framing, palette, floating geometry, z-fighting, aliasing, label overlaps, UI overflow, night readability). Write prioritized critique with screenshot crops and send actionable issues to lead. Re-verify after fixes. Do not edit world modules or shell files. Report: PASS/FAIL matrix, issues P0/P1/P2, screenshots, perf numbers.
