> **Showcase note:** 本目录是归档版，截图见 `../screenshots/`，原始 QA 工作图（`shots/qa/`）未随仓库提交；下面路径为原始会话记录。
> 
> **Final status (2026-11-09 02:05): 66 pass / 3 warn / 0 fail, 60 fps day/night @1600×1000 dpr1.5, buildErrors [].**
> The final curated gallery is `shots/final/` (with `report.json`, contact sheets, day/night/labels/mobile/postcard shots).
> Earlier per-run QA images have been cleared from the deliverable; paths below refer to those working runs.
>
# 微港 · Port Aurora — QA HARNESS & VERIFICATION PLAN

Owner: `verifier` (task-6). Scope: `tools/`, `shots/`, `docs/QA.md`, `docs/CRITIQUE.md`.
The verifier never edits `index.html`, `style.css`, `js/*.js` or `js/world/*`.

Quality bar: **museum-grade, freely-orbitable miniature harbour that opens by
double-clicking `index.html`, works offline, and stays ≥45 fps at 1400×900 dpr 1.25.**

---

## 1. How to run

```bash
node tools/qa.mjs                     # full matrix + interactions + perf (~100 s)
node tools/qa.mjs --label final       # tag the report (history snapshot + report.json)
node tools/qa.mjs --headed            # real-GPU headed Chrome (optional; same checks)
node tools/qa.mjs --only desktop-day,perf
node tools/qa.mjs --quick             # fewer settle frames, shorter perf sample
```

Exit codes: `0` = no FAIL checks, `1` = failures, `2` = harness error.

No npm dependencies. Node 22+ (this machine: Node 26) and Google Chrome
(`/Applications/Google Chrome.app/...`, override with `CHROME=`). The harness
launches Chrome over CDP and drives the real `file://` page.

`tools/shot.mjs` is untouched and stays backward compatible for builders:
`node tools/shot.mjs --out shots/day.png --night --labels --view "0.46,0.38,51"`.

### Artifacts (all under `shots/qa/`)

| Path | Contents |
|---|---|
| `report.json` | canonical machine-readable report (checks, scenarios, sessions, perf, fonts, offline, images) |
| `latest.json` | pointer to the latest report/label |
| `history/<stamp>-<label>.json` | archived reports per run label |
| `sheet-day.png` | 8-view day matrix + live-default hero |
| `sheet-night.png` | night + labels contact sheet |
| `sheet-details.png` | UI-hidden clean captures (model-only art review) |
| `sheet-all.png` | every scenario |
| `crops/` | 1:1 detail crops (hero quadrants, close-ups, one crop per visible label card) |
| `clean/` | UI-hidden full-resolution captures (framing/palette metrics) |
| `mobile-post-compare.png` | mobile post-processing vs `post=0` reference (haze check) |
| `<session>-<view>.png` | full-resolution screenshots (1440×900@1.5x, 1280×800@1.25x, 430×900@2x) |
| `fonts-plain-chrome.png` | proof of double-click font behaviour without `--allow-file-access-from-files` |
| `postcard-sample.png` | real `PORT.makePostcard()` output |

The matrix lives in `tools/qa.mjs`; contact sheets, crops, framing/palette and
artifact analysis live in `tools/qa-sheet.py` (Pillow). The CDP driver is
`tools/lib/cdp.mjs`. `--headed` runs the same matrix in a visible Chrome window
(real GPU + window server); results are labelled `meta.mode`.

---

## 2. Matrix

Views (yaw / elev / dist around target `(0,1.12,0)`):

| id | yaw | elev | dist | intent |
|---|---|---|---|---|
| `hero` | 0.46 | 0.37 | 46 | brief's hero: water front, ship/cranes mid, town behind |
| `east` | 0.90 | 0.16 | 40 | low angle across water / breakwater |
| `west` | −0.80 | 0.33 | 38 | west hill / old town side |
| `back` | 3.60 | 0.50 | 42 | museum back view, terminal skyline |
| `top` | 0.30 | 1.05 | 40 | plan view: scale consistency, floating/buried objects |
| `ship` | 0.30 | 0.22 | 27 | close vessel detail |
| `cranes` | 0.18 | 0.24 | 25 | close STS crane detail |
| `town` | −0.85 | 0.33 | 27 | close detail angle |

Sessions:

| session | size / dpr | mode | views |
|---|---|---|---|
| `desktop-day` | 1440×900 @1.5 | day, UI | all 8 + live-default hero + clean captures |
| `desktop-night` | 1440×900 @1.5 | night (`?night=1`) | hero, east, west, town + clean hero |
| `desktop-labels` | 1440×900 @1.5 | labels on, then night | hero-labels, hero-night (labels cut 12 of 13) |
| `mobile-day` | 430×900 @2 | mobile emulation | adaptive-fit hero, town, clean hero, labels |
| `mobile-nopost` | 430×900 @2 | `post=0` reference | adaptive hero (+ clean) for post-haze comparison |
| `ui-1280` | 1280×800 @1.25 | day, UI | hero |
| `reduced-motion` | 1440×900 @1.5 | `prefers-reduced-motion: reduce` | hero |
| `interaction` | 1440×900 @1 | controls/keyboard/postcard + live resize + auto-orbit + `?labels=1` | — |
| `perf` | 1400×900 @1.25 | day + night rAF sampling | hero |

Plus a plain-Chrome launch **without** `--allow-file-access-from-files`
(double-click emulation) for the font/offline proof.

---

## 3. Automated checks (report `checks[]`)

### lifecycle
- `page-ready` — `window.__PORT_READY`, `PORT.ready`, `body.ready`, `!body.loading`.
- `loader-hidden` — loader opacity <0.02 / hidden after boot.
- `loader-fit` — loader title/sub/meta `scrollWidth ≤ clientWidth+2`, loader card
  inside viewport (injected DOMContentLoaded watcher).
- `stats` — `PORT.stats.parts > 0`; worldActive heuristic = labels registered or
  containers > 0 or parts > 200.
- `url-night-param` — default load is day (`mix === 0`).

### errors
- `build-errors` / `build-errors-all` — `PORT.buildErrors` empty in every session.
- `page-errors` / `errors-all-sessions` — zero runtime exceptions, console errors
  and `Log.entryAdded` errors in any session (three.js legacy-build deprecation
  warning is allow-listed as known noise).
- `console-warnings` — anything else warns.
- `interaction-errors` — no page errors during the interaction sequence.

### fonts / glyphs
- `fonts-dmmono` — two DM Mono faces `loaded` + `document.fonts.check`.
- `fonts-fraunces` — normal Fraunces face loaded and actually used (italic may
  stay unloaded when no italic rule uses it, which is fine).
- `glyphs` — canvas ink coverage for `微港` (Songti + PingFang) and `PORT`
  (Fraunces) — catches missing CJK/tofu regressions.
- `fonts-plain-chrome` — double-click Chrome without file-access flags must still
  load DM Mono + Fraunces normal faces.

### offline
- `offline` — zero `http(s)` requests/resource entries; protocols must be
  `file:`/`data:`; no `Network.loadingFailed` other than `ERR_ABORTED`.

### UI
- `ui-<WxH>` at 1440×900, 1280×800, 430×900, labels states and live resize:
  - visible panels (`.brand`, `.controls`, `.dossier`, `#compass`, `.hint`) and
    every control button inside the viewport;
  - no panel↔panel (>200 px²) or button overlap;
  - no label card outside the viewport or overlapping another label; card vs
    panel overlap is a WARN; the `#labels` full-viewport scrim is excluded by
    design and is gated through ancestor visibility;
  - labels-on must produce visible cards + leader lines when labels are registered.
- `live-resize` — 1440→1280→430 without reload: canvas backing store equals
  `innerWidth × effectiveDpr`, CSS size follows viewport, UI reflows cleanly.

### interaction
- `drag-orbit` — pointer drag changes yaw by >0.15 rad.
- `wheel-zoom` — wheel increases distance by >2 units.
- `dblclick-reset` — returns to the live boot default (DOM `dblclick`; headless
  Chrome does not synthesise the gesture from CDP mouse events).
- `key-r-reset`, `key-space-orbit`, `key-l-labels`, `key-n-night` — keyboard
  shortcuts, including day↔night mix reaching 1.0 then 0.0.
- `labels-api` — `PORT.ui.setLabels()` toggles `.labels-on` + cards.
- `url-labels-param` — `?labels=1` opens with labels enabled (13 registered,
  12 cards rendered).
- `postcard` — `PORT.makePostcard()` returns a `data:image/png` URL >200 KB and
  restores the renderer size/pixel-ratio; sample PNG saved.
- `buttons-aria` — control aria-pressed/disabled state syncs.

### visual / camera
- `framing-camera-<session>` — projects the plinth rim (r 15.65 at y 0–1.7) into
  NDC: whole plinth inside the viewport with ≥0.015 margin and ≥0.5 width usage.
  This is deterministic and catches portrait-fit and default-distance regressions.
- `framing-hero` — colour-mask model bbox on the clean hero capture (not clipped,
  centred, occupancy ≥6 %).
- `framing-mobile` — same bbox at 430×900: whole plinth visible with margins
  (x>0.035, right<0.965, y>0.04, bottom<0.99), centred, reasonably sized.
- `floating-outside-plinth` — scans every `batch:*` vertex; clusters with radius
  >18.5 (plinth radius 15.78) fail. Catches stray scatter/placement bugs and
  pieces floating above the gallery floor.
- `frames-not-blank` — every screenshot has std-luminance ≥4, mean 4–251.
- `artifact-magenta` — large saturated magenta/hot-pink components fail (WIP or
  missing material colours).
- `artifact-dark-blocks` — large near-black components (lum <32, area ≥120 px at
  480 px working width) in day shots fail; opaque untextured billboards, broken
  sprites and floating black quads. Headless and headed runs are both gated —
  prior headless “corruption” was confirmed to be real terminal-code bugs.
- `palette-hero` — colourfulness, hue spread, saturation, top-colour swatches
  (reported for art review).
- `night-readability` — night/day mean-luminance ratio in [0.10, 0.90] with
  night p90 ≥18.
- `mobile-post-quality` — compares mobile clean capture (`post` on) with the
  `post=0` reference: colourfulness ratio ≥0.70 and contrast (std-luminance)
  ratio ≥0.75, otherwise WARN “washed out by post-processing”.
- `postcard-layout` — analyses `postcard-sample.png`: 2960 px wide (2600 render
  + 180 margins), header ink above y170 (`topPad`), footer ink below the image
  (`bottomPad` 150), framed image region non-blank. Guards the header/overlap
  regression.
- contact-sheet / crop existence checks.

### motion / perf
- `reduced-motion` — `PORT.reducedMotion`, no auto-orbit, static camera over 1.3 s,
  `.ctl` transition ≤0.02 s, `.grain` animation `none`.
- `auto-orbit` — fresh `?orbit=1` load drifts yaw >0.03 rad over 1.9 s.
- `perf-fps` — rAF sampling 3.5 s day + 2 s night; PASS ≥45 fps.
- `perf-budget` — draw calls ≤220 PASS; >220 WARN (triangles <3 M); records
  `renderer.info` for the scene pass (`PORT.getPerf()`), programs, geometries,
  textures, `PORT.stats`, dpr, canvas size, post/shadows flags, GPU string.

---

## 4. Manual visual checklist (reviewed against sheets/crops each phase)

| # | item | looks for |
|---|---|---|
| 1 | composition / framing at hero | three readable layers (water, ship/quay, town/skyline); plinth not clipped; live-default view matches the brief; portrait fit |
| 2 | palette harmony | warm paper/brass/teal museum palette; muted containers/roofs; no neon/debug colours |
| 3 | model scale consistency | ship vs crane vs containers vs houses vs people plausibly 1:1000; doors/windows/rails to scale |
| 4 | floating / buried objects | no mesh hovering above ground or sunk through quay/water; shadow contact |
| 5 | z-fighting | no shimmer/stripes on coplanar decks, rails, quay edges |
| 6 | aliasing | crane lattice/ship rigging/railings clean at 1.5× and 1.25×; no crawling moiré |
| 7 | water / reflection artifacts | no black water, mirror doubling, reflection leaks through plinth, weird meniscus; calm waves |
| 8 | shadow quality | soft, coherent direction, no acne/peter-panning; night lights not shadowed wrongly |
| 9 | night readability | model still legible; lighthouse beam, window glow; no blown blooms; UI readable |
| 10 | label leader-line accuracy | dots on the right object, no crossing lines, no clipped labels, 12 desktop / 6 mobile max |
| 11 | background / plinth presentation | carved walnut rim, brass inlay, museum-wall background, vignette not crushing detail |
| 12 | animation calmness | auto-orbit 0.042 rad/s, no jitter; seagulls/smoke/water subtle; reduced-motion static |
| 13 | page errors | zero exceptions, zero console errors; buildErrors empty |
| 14 | performance | ≥45 fps at 1400×900 dpr 1.25, draw calls ≤220, triangles <3 M |

---

## 5. Results

### Baseline (2026-11-08 ~23:24 CST, label `baseline`)
World modules mid-write, fleet stub. `34 pass · 3 warn · 2 fail · 4 skip`;
the FAILs were a transient `town.js` syntax error saved mid-run.

### Mid-build (23:43, `midbuild`)
Terrain/terminal/town/effects partly integrated. `47 pass · 1 warn · 4 fail`:
terminal WIP magenta/black materials (real code bugs, later fixed), mobile
portrait crop, one harness false positive.

### FINAL — current build (2026-11-09 02:07 CST, label `final`)

All modules final (terrain, terminal, fleet, town, effects; effects beam rebuilt
with radial clip). Headless Chrome, canonical acceptance run:

```
sessions 10 · scenarios 32 · duration 111.7 s
checks: 66 pass · 3 warn · 0 fail · 0 skip
```

| metric | value |
|---|---|
| fps day/night @1400×900 dpr1.25 | **60 / 60** |
| fps day/night @1600×1000 dpr1.5 | **60 / 60** (gate ≥55) |
| draw calls / triangles / parts | 325 / 489 466 / 14 263 (WARN: calls >220) |
| GPU | ANGLE Metal, Apple M4 Pro |
| night/day mean luminance | ratio 0.377, night p90 108 |
| labels | 13 registered, 12 rendered, leader lines accurate |
| postcard | 2960×1945 PNG, ~7.7 MB, header/footer clear (`postcard-layout` PASS) |
| offline | 100 % `file:`/`data:`, 0 http(s), no failed loads |
| page errors / buildErrors | none / `[]` |
| floating outside plinth | 0 stray vertices >18.5 |
| night beam | `night-beam-darkening` PASS (no coherent dark wedges; beam adds 1.25 % lit pixels) |
| UI layout | PASS 1440×900, 1280×800, 430×900 + live resize |
| camera framing | desktop marginX 0.248; mobile portrait marginX 0.041 — PASS |
| mobile post quality | WARN — contrast 0.71× vs `post=0` reference |

**3 WARNs (non-blocking, owner sign-off recommended):**
1. `perf-budget` — 325 draw calls at 1400×900 (target 220); fps still 60/60.
2. `perf-budget-perf-hires` — same 325 calls at 1600×1000 dpr1.5; 60 fps.
3. `mobile-post-quality` — mobile post pipeline contrast 0.71× vs `post=0`
   (bright bloom veil on the large paper backdrop); desktop unaffected.

Final gallery exported to **`shots/final/`**: `hero.png`, `hero-default.png`,
`east/west/back/top.png`, `ship/cranes/town.png` (+ clean versions),
`night-hero.png`, `labels.png`, `labels-night.png`, `mobile-hero.png`,
`mobile-labels.png`, `postcard.png`, contact sheets, `report.json`,
`README.md`. A headed spot-check pass (`shots/final-headed/`) was also run.

## 6. Harness limitations

- **Headless rAF is capped at 60 fps** — `perf-fps` proves the frame budget isn't
  exceeded (60/60 at 322 calls) but cannot measure headroom above 60.
- **dblclick** — headless Chrome does not reliably synthesise a `dblclick` from
  `Input.dispatchMouseEvent`; the test dispatches the DOM event the app listens
  for (`method: "dom-dblclick"`). A manual smoke test in a real browser is still
  recommended for the gesture itself.
- **Mobile** is emulated (430×900 dpr2, touch enabled), not a real device;
  iOS Safari is not exercised. `P.isMobile`/portrait fit is covered.
- **Screenshots are device pixels** (`CSS × dpr`), e.g. 1440×900 @1.5 → 2160×1350.
- `mobile-post-quality` compares two different tone-map pipelines (`post` vs
  `post=0`); it is a relative haze/contrast guard, not an absolute target.
- Contact sheets are downsampled; inspect `shots/qa/<scenario>.png` at 1:1 and
  `crops/` for artifact judgement.

---

## 7. Final gate (after Lead signals integration)

PASS requires all of:

1. 0 FAIL checks; ≤3 documented WARNs with owner sign-off.
2. ≥2 labels registered; label toggle/layout/leader-line checks PASS at 1440 and
   430; `?labels=1` PASS.
3. `page-errors`, `build-errors`, `errors-all-sessions`, `build-errors-all`
   clean; no syntax errors in any module.
4. `artifact-magenta`, `artifact-dark-blocks`, `floating-outside-plinth`,
   `frames-not-blank` PASS (no debug surfaces, stray/floating geometry).
5. `framing-camera-*`, `framing-hero`, `framing-mobile` PASS.
6. fps ≥45 @1400×900 dpr1.25 day and night.
7. UI layout + `live-resize` PASS at all sizes; postcard >200 KB and renderer
   restored; auto-orbit PASS.
8. Offline: no http(s) resources; fonts + glyphs OK in plain Chrome.
9. Visual checklist items 1–14 reviewed against the final contact sheets and
   label crops; remaining nits recorded in `docs/CRITIQUE.md` (P2 only).
10. Final report archived as `history/<stamp>-final.json`; `report.json` matches.
