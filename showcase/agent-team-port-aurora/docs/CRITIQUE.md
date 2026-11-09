# 微港 · Port Aurora — QA CRITIQUE

Owner: `verifier`. Evidence lives in `shots/qa/` (`report.json` is the
machine-readable run; `sheet-*.png`, `crops/` and full-res screenshots are for
eyeballing). Severity: **P0 blocker · P1 should fix · P2 polish**.
Status: OPEN / WIP / RE-VERIFY / FIXED / WONTFIX.

> **Snapshot:** FINAL `05:07 UTC / 02:07 CST` — **66 pass · 3 warn · 0 fail ·
> 0 skip**, 32 screenshots, 10 sessions, 111.7 s, all modules final. No P0/P1
> open; three non-blocking WARNs listed below (draw-call budget ×2 sessions,
> mobile post haze). Curated gallery in `shots/final/`.

---

## P0 — blockers

None.

---

## P1 — should fix

None currently open. Recently fixed and verified by the harness:

| issue | evidence | verified |
|---|---|---|
| terminal: magenta deck surfaces + opaque black billboard quads + night grey plane | `diag-no-terminal.png` vs `diag-skip-effects.png`, `artifact-magenta` / `artifact-dark-blocks` fails in `midbuild`/`midbuild2` | **FIXED** — both artifact checks PASS at `midbuild5`; sheets clean |
| mobile portrait framing cropped the model (dist 51, vfov 30 → only ~13 of 31 world units visible) | `mobile-day-hero.png` in `baseline`/`midbuild` | **FIXED** by `adaptCamera()` portrait fit in `js/main.js`; `framing-camera-mobile-day` marginX 0.045 and `framing-mobile` PASS (whole plinth, not clipped) |
| terrain: two clusters of batched geometry floating outside the plinth rim (312 verts @ (20.1, 0.66, 15.0); 168 verts @ (−21.1, 0.61, 8.7); ~2.5 units above the floor, radius 22–25) | grey cylinders in `clean/mobile-day-hero-clean.png`, `desktop-day-east.png`; raycast/vertex probe attributed to `batch:matte` + `?skip=terrain` | **FIXED** — new `floating-outside-plinth` check reports 0 stray vertices >18.5 |
| `?labels=1` parsed but never applied; `shot.mjs --labels` was a no-op | `config.labels` unused | **FIXED** — `url-labels-param` PASS (13 registered, 12 cards, aria-pressed true) |
| postcard header/footer overlapping the framed image (old 120 px margins) | old postcard sample header sat inside the image band | **FIXED** — `topPad=170`/`bottomPad=150`; new `postcard-layout` check PASS (2960×1945, header ink above y170, footer below image) |
| Fraunces declared but unused (155 KB dead weight) | `fonts-fraunces` WARN in `baseline`/`midbuild` | **FIXED** — `.brand .en` now uses `var(--serif)`; normal face loads + check true; PASS |

---

## P2 — polish (open)

### W1 Mobile post-processing washes out the model (OPEN, non-blocking P2 — `js/post.js` / `main.js`)
- Check: `mobile-post-quality` **WARN** — mobile clean capture with post has
  contrast (std-luminance) **0.71×** the `post=0` reference (31.5 vs 44.4) and
  mean luminance 183 vs 166 (brighter/hazier); colourfulness comparable.
  Desktop is unaffected.
- Evidence: `shots/qa/mobile-post-compare.png` (top = current mobile post,
  bottom = `post=0`): the post render has a pale bloom veil over the bright paper
  backdrop and the model loses contrast; the reference is crisp and saturated.
- Likely cause: bloom threshold (0.85) lifts the large bright backdrop, and the
  mobile composition is ~70 % backdrop. Mobile bloom 0.4 / tilt 0.55 / focus 0.2
  may also over-soften.
- Suggestion: on `P.isMobile` (or when `aspect < 1`), raise bloom threshold to
  ~1.0 or lower bloom to ~0.2, and/or reduce exposure slightly; consider
  disabling/reducing tilt-shift for the portrait fit. Re-run
  `node tools/qa.mjs --only mobile-day,mobile-nopost` and check
  `mobile-post-quality` PASS + `mobile-post-compare.png`.
- Not blocking desktop acceptance; mobile is the one place the “museum print”
  look degrades.

### W2 Draw-call budget: 325 calls (OPEN, non-blocking P2 — Lead/builders)
- Check: `perf-budget` + `perf-budget-perf-hires` WARN — 325 calls
  (threshold 220), 489 466 triangles, 14 263 parts; 60/60 fps at both
  1400×900 dpr1.25 and 1600×1000 dpr1.5. Boot/perf is fine, but 300+ calls is
  high for a static miniature.
- Suggestion: batch/instance repeated props (bollards, lamps, railings, windows,
  mooring points, fence posts) and merge per-material meshes where possible;
  aim ≤220. Not a visual defect — accept with sign-off if the team prefers.
- Re-verify: `perf-budget` PASS or documented WARN sign-off.

### P2-3 Portrait composition: plinth fits but the model is small (OPEN, owner: Lead)
- After the adaptive fit, 430×900 shows the whole plinth with margins
  (`framing-camera-mobile-day` marginX 0.045) — correct and safe, but the model
  occupies only ~34 % of the viewport height (widthFrac 0.954, heightFrac 0.217),
  leaving large empty backdrop. It reads as a tiny object rather than a museum
  hero.
- Suggestion: for portrait, allow a tighter horizontal fit (e.g. 0.98 width or a
  slight crop of the empty basin foreground) and raise the camera target so the
  harbour fills more of the vertical space; keep the plinth rim visible.
  Re-check `framing-mobile` + `framing-camera-mobile-day` margins stay ≥0.01.

### P2-4 Studio backdrop seam in portrait (OPEN, owner: Lead — `studio.js`)
- The warm paper backdrop changes tone along a straight horizontal line at
  ~9 % viewport height (visible in `clean/mobile-day-hero-clean.png` and
  `desktop-day-east.png`). Subtle on desktop, more obvious in portrait where
  more backdrop is visible. Consider softening the wall/floor gradient or moving
  the seam behind the model.

### P2-5 three.js legacy-build deprecation warning (WONTFIX — noise)
`vendor/three.min.js` prints one console warning (r150+ legacy build removed in
r160). The harness allow-lists it; not a page error.

---

## Verified good (midbuild5, 00:42)

| area | result |
|---|---|
| lifecycle | `body.ready`, loader hidden, loader text/card fit — PASS |
| controls | drag orbit, wheel zoom, dblclick reset, `R`, `Space`, `N`, aria state — PASS |
| auto-orbit | `?orbit=1` drifts yaw calmly, stops after interaction — PASS |
| day↔night | mix reaches 0.995 then 0.005 (~2.2 s), `body.night`, night shot readable (ratio 0.377, p90 108) — PASS |
| labels | 13 registered, 12 rendered with truthful leader lines (岸桥/集装箱船/防波堤/灯塔/集装箱堆场/老城/鱼市/场桥/港口铁路/教堂钟楼/拖轮/渔船); toggle + `?labels=1` + night-labels PASS; no card/card or card/viewport collisions; one crop per card for review in `crops/labels-*.png` |
| postcard | 2840×1865 PNG data URL ≈7.4 MB, renderer size restored — PASS |
| offline | 0 http(s) requests; all `file:`/`data:`; no failed loads — PASS |
| fonts | DM Mono + Fraunces normal loaded; CJK glyph coverage OK; plain-Chrome double-click PASS |
| reduced motion | no auto-orbit, static camera, 0.01 s UI transitions, grain off — PASS |
| UI layout | 1440×900, 1280×800, 430×900 + live 1440→1280→430 resize: no overflow/overlap — PASS |
| camera framing | desktop marginX 0.248; mobile portrait marginX 0.045; hero bbox (0.081, 0.277)–(0.947, 0.963) — PASS |
| geometry hygiene | 0 batch vertices outside the plinth rim; no debug colours / black billboards — PASS |
| water | calm waves, coherent crane/ship/lighthouse reflections, no black water — PASS |
| shadows | soft PCF, coherent direction, contact shadows; night lighting + lighthouse beam plausible — PASS |
| Chinese UI | 微港 / 模型档案 / controls render in Songti — PASS |
| performance | 60/60 fps day+night @1400×900 dpr1.25; 490 k tris — fps PASS, calls WARN |

## Human visual checklist snapshot (midbuild5)

Legend: ✅ good · ⚠️ check after final polish · ✗ broken.

| # | item | status | notes |
|---|---|---|---|
| 1 | hero composition | ✅ | three layers read clearly (water / ship+quay / town+skyline); plinth framed with margin; live-default 0.46/0.38/51 works. |
| 2 | palette harmony | ✅ | warm paper + brass + teal water + muted containers/roofs; coherent museum palette; no neon/debug colours. |
| 3 | model scale consistency | ✅ | cranes, containers, ship, sailboat, people and town fit 1:1000 reading; doors/windows/railings to scale. |
| 4 | floating / buried objects | ✅ | stray terrain debris fixed and gated by `floating-outside-plinth`; buoys sit on water, boats sit at waterline. |
| 5 | z-fighting | ✅ | no shimmer seen on quay decks, rails, breakwater or plinth inlay at 1.5×. |
| 6 | aliasing | ✅ | crane lattice, ship superstructure, railings and town roofs clean; no crawling moiré in stills. |
| 7 | water / reflection | ✅ | reflections of ship/cranes/lighthouse/boats read correctly; calm ripple; no mirror leaks. |
| 8 | shadows | ✅ | soft, coherent sunlight; contact shadows ground the plinth and boats; night light pools plausible. |
| 9 | night readability | ✅ | model legible, lighthouse beam + windows glow, UI/labels readable; no blown bloom. |
| 10 | label leader accuracy | ✅ | inspected full-res cards: dots land on cranes/ship/breakwater/lighthouse/yard/town/fish quay/RTG/rail/church/tug/fishing boats; no crossings. |
| 11 | background / plinth | ⚠️ | walnut rim + brass inlay + vignette are good; faint horizontal backdrop seam in portrait (P2-4). |
| 12 | animation calmness | ✅ | slow orbit, calm water, seagulls/smoke subtle; reduced-motion fully static. |
| 13 | page errors | ✅ | no exceptions or console errors; `build-errors-all` clean. |
| 14 | performance | ✅ / ⚠️ | 60 fps; draw calls 322 (P2-2). |

---

## Open questions for Lead

1. Mobile post haze (P2-1): worth a `post.js`/mobile-parameter pass, or accepted?
2. Draw calls 322 (P2-2): batch/instance pass, or sign off the WARN?
3. Portrait composition (P2-3): is the safe whole-plinth fit the intended
   mobile hero, or should the model fill more of the portrait frame?
