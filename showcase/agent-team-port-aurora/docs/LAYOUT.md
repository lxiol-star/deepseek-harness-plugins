# 微港 · Port Aurora — LAYOUT & ART DIRECTION

Everything here is the *single source of truth* for where things are. The same
numbers live in `js/layout.js` (use `PORT.layout`). Read that file too; this doc
explains the intent and the picture.

---

## 1. The object

A museum-grade miniature harbour model, displayed on a turned walnut plinth with
brass inlay. The camera orbits the model freely (360°, 7°–66° elevation).
The whole world is **31 units across** (1 unit = 10 real metres, scale 1:1000).

Orientation: **+x = east/right, +z = south/front (towards the default camera),
+y = up.** Water surface is `y = 0`; the quay deck and working land are
`y = 1.1`; the wooden rim top is `y = 0.16`. The sea is a circular basin
(radius 14.86) inside the plinth.

The default camera looks from the south-east at ~22° elevation:
`yaw 0.46 rad, elevation 0.38 rad, distance 51` around target `(0, 0.72, 0)`
(portrait phones auto-fit to the plinth with a wider FOV).
The hero view should read in three layers: water in front, container ship +
quay in the middle, old town hill + terminal skyline behind.

---

## 2. Plan (top view, not to scale; +z is down / front)

```
                       z = -15  (back, museum wall)
        ┌────────────────────────────────────────────────────┐
        │   west hill old town       back row houses /      │
        │   (terraces, church)       warehouses             │
        │        ╲                  ┌──────────────┐        │
        │         ╲    rail line z=-10.35 ───────────────    │
        │          ╲   container yard   RTG    ops yard      │
        │  fishing  ╲  ┌──────────────────────────────┐     │
        │  quay x=-9.6 ╲│        quay edge z=-4.4      │     │
        │   boats    ╲  └─── 4 STS cranes  ────────────┘     │
        │     ╲        ╲   ═══ container ship ═══            │
        │      ╲        ╲                                    │
        │  peninsula     ╲        harbour basin              │
        │  tip           ╲       (tug, pilot, sailboat)      │
        │                 ╲        ╲ breakwater + lighthouse │
        │                  ╲        ╲                        │
        └────────────────────────────────────────────────────┘
                       z = +15  (front, default camera)
```

Land is an island inside the circular water basin: the west peninsula + the
wide back strip are connected. The east side is enclosed by the curved
breakwater that ends in the lighthouse.

---

## 3. Exact datum (from `layout.js`)

### Island coastline (clockwise)
```
[12.6,-4.4], [12.2,-6.0], [10.4,-8.8], [7.4,-11.0], [3.2,-12.6],
[-1.6,-12.9], [-6.4,-11.9], [-9.8,-9.4], [-11.6,-6.2], [-12.4,-3.0],
[-12.2,1.0], [-11.3,3.9], [-10.0,4.6], [-9.6,2.4], [-9.6,-4.4]
```

### Quay walls (vertical faces, water → deck 1.1)
- **Cargo quay**: from `(-9.6,-4.4)` to `(12.6,-4.4)`, facing +z (the basin).
- **Fishing quay**: from `(-9.6,-4.4)` to `(-9.6,2.4)`, facing +x (the basin).

### Breakwater (curved mole, crown y = 0.95)
```
[12.25,-5.85] → [13.35,-3.4] → [13.75,-0.9] → [13.25,1.85]
→ [12.35,4.05] → [11.15,5.95] → [9.9,7.25]     width 1.15
```
Lighthouse at `(10.05, 7.5)`; small beacon on the peninsula tip at
`(-10.55, 4.35)`.

### Roads (draped ribbons)
| id | centre line | width | note |
|---|---|---|---|
| `quay` | `(-9.15,-5.35) → (12.35,-5.35)` | 0.62 | under the STS cranes |
| `east` | `(11.95,-5.55) → (11.95,-9.9) → (12.0,-11.55)` | 0.52 | terminal east road |
| `back` | `(-8.9,-11.55) → (11.95,-11.55)` | 0.56 | behind the rail line |
| `town-street` | `(-9.85,-3.65) → (-10.15,-2.1) → (-10.55,-0.45) → (-10.95,1.15) → (-11.35,2.55)` | 0.52 | climbs the hill |
| `town-lane` | `(-10.35,-0.9) → (-11.15,-1.25) → (-11.65,-2.4)` | 0.40 | stepped lane |

### Rail
Single main track at `z = -10.35`, from `x = -8.4` to `x = 12.15`, gauge 0.26,
ballast width 0.95, top of rail ~1.22.

### Terrain height
`PORT.layout.heightAt(x,z)` is the only ground-height function. Land is 1.1 by
default; the west peninsula climbs up to ~3.1 on soft hills; the back strip is
flattened at 1.1. The outer coast falls away to a low rocky shore (0.2) except
at the two vertical quay walls, which stay at deck level. Use it for every
building, tree, prop, road edge, etc.

Flat pads: whole back strip `x[-9.5..12.75], z[-12.98..-4.45]`; fishing-quay
strip `x[-10.65..-9.5], z[-4.45..2.65]`.

### Hills
```
(-11.9,-3.5) r3.5 h2.05   old-town hill (chuch / plaza up high)
(-12.1,-8.9) r2.7 h1.15   upper town
(-10.9, 2.2) r1.9 h0.55   fishing knoll
( -8.6,-13.4) r3.2 h0.55  back-left rise
(  6.8,-13.6) r3.0 h0.40  back-right rise
```

---

## 4. Zone ownership (do not build outside your zone)

### `terrain-civils` — js/world/terrain.js
Land form, coastline, rock strata, beaches/pebbles, quay walls, breakwater
body, lighthouse + peninsula beacon, roads/cobbles, rail bed, retaining walls,
stairs, pontoon, ground texture/paving, quay furniture (bollards, fenders,
ladders, life rings, crane rails, safety lines), sea wall details, tetrapods,
mooring hardware. Lighthouse: cream stone tower ~2.6 tall, dark-green lantern,
brass gallery rail, small keeper's hut; its lamp must sit near
`(10.05, 2.65, 7.5)` for the effects beam.

### `terminal-yard` — js/world/terminal.js
4 STS cranes at `x = -6.4, -2.0, 2.4, 6.8`, portal centre `z = -5.35`. Boom
out over the ship (+z). Container yard `x[-8.2..7.45], z[-9.75..-6.0]`.
Quay apron `x[-8.6..12.5]` with truck lane. Support buildings
`x[8.15..11.55], z[-9.9..-6.1]`. Rail yard `z[-11.15..-9.8]` with wagons and a
small shunting locomotive. ~340+ containers. Two RTGs, straddle carriers,
terminal tractors, reach stackers, fences, floodlights, signs.
Only terminal assets here — no old-town buildings.

### `fleet` — js/world/fleet.js
Container ship `centre (0.6,-2.55)`, length 13.6, beam 2.5 (hull edges
z -3.8..-1.3; keep clear of quay wall at -4.4 for fenders/moorings).
Tug at `(5.85, 4.95)`; sailboat `(-4.35, 8.9)`; three fishing boats along
`x=-8.6..-8.7, z=-0.15/1.05/2.25`; pilot boat follows
`PORT.layout.routes.pilotLoop`; two channel buoys at (-2.4,11.4) green and
(2.4,12.1) red. All hulls must sit in water (draft below y=0) and leave a
0.35–0.6 gap to quay walls. Mooring lines attach to quay bollards that
terrain provides (~every 1.8 along the quay, tops around y=1.3).

### `town` — js/world/town.js
Old town on the west peninsula `x[-12.5..-9.62], z[-12.9..4.55]`: ~25–35
buildings on terraces, church + clock tower, plaza/fountain, fish market at
the fishing quay, cafe, shops, back alleys. Back row `x[-9.55..8.0],
z[-12.9..-11.9]`: 7–10 warehouses/low-rise blocks. Vehicles, people, trees,
street furniture, signs, laundry, awnings, a bus stop, etc.

### `effects` — js/effects.js
Seagulls (flying + perched), smoke/steam at funnel/chimney anchors, rotating
lighthouse beam + lens glow, blinking beacons/nav lights, gallery dust motes,
flags/bunting. No static architecture.

---

## 5. Key placements (also in `layout.placements`)

- Container ship funnel anchor ≈ `(5.15, 3.05, -2.55)`.
- Tug funnel ≈ `(5.85, 1.15, 4.95)`.
- Lighthouse lamp ≈ `(10.05, 2.65, 7.5)`.
- Peninsula beacon ≈ `(-10.55, 1.45, 4.35)`.
- Quay flagpole ≈ `(9.5, 2.2, -5.7)`.
- Pontoon (fishing): `x[-9.5..-8.15], z[1.35..2.55]`, deck ~0.28.
- Pilot boat loop: closed polyline in the basin (see layout.js) — keep the
  channel buoys and sailboat out of its path.

---

## 6. Palette & mood

Warm, sun-faded museum model. Base hues from `PORT.kit.palette`:
walnut + brass plinth, cream paper gallery, deep teal water with cream foam,
sage/olive trees, muted plaster (cream, sand, dusty blue), terracotta/slate
roofs, faded teal cranes (`0x3c6b63`) with cream trim, muted container colours
(rust, teal, sage, mustard, cream, maroon, slate), ship hull deep navy with
maroon boot-top and cream superstructure, warm practical lights (`0xffd9a0`).

Rules:
- No pure saturated primaries, no neon except tiny practical lights.
- Use `K.vary(hex, rnd, {...})` for natural variation; keep chroma low.
- Every surface gets at least two tones (base + edge/trim/shadow) where it
  matters at model scale.
- Detail hierarchy: silhouette → large forms → repeated modules → 3–6 micro
  details per zone (bolts, cables, stains, labels, tiny figures).

---

## 7. Suggested explanatory labels (register via `K.addLabel`)

Priority 9–10: `岸桥 / SHIP-TO-SHORE CRANE`, `集装箱船 / CONTAINER SHIP`,
`防波堤与灯塔 / BREAKWATER & LIGHTHOUSE`.
Priority 7–8: `集装箱堆场 / CONTAINER YARD`, `场桥 / RTG`, `老城 / OLD TOWN`,
`鱼市 / FISH MARKET`, `修船滑道 / SLIPWAY` (if built), `拖轮 / HARBOUR TUG`.
Priority 5–6: `教堂钟楼 / CHURCH TOWER`, `铁路支线 / RAIL SPUR`,
`信号塔 / SIGNAL TOWER`. Keep each module to 2–4 labels; they are placed
automatically with leader lines.

---

## 8. Framing / composition targets

- Hero angle: the ship with 4 cranes above it, old town rising left, lighthouse
  sweeping right foreground. Keep the tallest vertical elements left-of-centre
  and right-of-centre, leave the front-centre water open for reflection.
- From the back (yaw ≈ π), the rail yard, back street and warehouse roofs must
  still read as a finished model; do not leave blank flat ground.
- The model must look good from 7° (waterline) and from 66° (top-down).
