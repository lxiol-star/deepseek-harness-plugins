# dsh-whale-effort merge contract

Frozen for the merge of two upstream DSH plugins into one package under
`plugins/dsh-whale-effort/` (repo `lxiol-star/deepseek-harness-plugins`, Apache-2.0
collection, plugin version `0.1.0`, target DSH `0.2.1-rc.2`).

Upstream sources (read them, do not modify):

| Alias | Local path | Upstream | License | What we keep |
| --- | --- | --- | --- | --- |
| **A** | `/tmp/dshmerge/dsh-reasoning-effort` | `HanaAyane/dsh-reasoning-effort` v0.9.0 | MIT | Native model-selector integration, chibi whale-girl runner icon (assets/chibi-runner-strip.png), bilingual copy, guidance/config tutorial, effort-selection logic |
| **B** | `/tmp/dshmerge/dsh-effort-slider` | `yuhub233/dsh-effort-slider` v1.1.0 | MIT | Sci-fi energy skins + fluid particle engine, Ultra tier, lightning orchestration mode, subagent tok/s readout, policy text |

Product decisions (user-adjudicated):

1. Base = A. The merged plugin keeps A's UX: it wraps DSH's native model selector
   and renders the effort slider inside the native "reasoning effort" pane.
2. Icon = A's whale-girl chibi runner. It stays the slider thumb (and the README motif).
3. Visual effects = B's energy/fluid/skin system, applied to the merged slider.
4. B's functional extras are part of the merge: Ultra pseudo-tier (writes the real
   MAX effort id), lightning orchestration toggle (default off), subagent tok/s readout.
5. Everything the plugin adds is bilingual (zh + en) and the published package must
   not import `@deepseek-ai/*` at runtime (type-only imports are erased).

## Package layout (ownership)

```
plugins/dsh-whale-effort/
├── package.json, cordis.patch.yml, tsconfig.json, vitest.config.ts     [packager-docs]
├── scripts/build.mjs, scripts/typecheck.mjs                            [packager-docs]
├── README.md, README.en.md, CHANGELOG.md, UPSTREAM.md,
│   THIRD-PARTY.md, LICENSE                                             [packager-docs]
├── src/index.ts                                                        [host-porter]
├── src/host/**
│   ├── knowledge.ts   (copied from A; do not restructure unless necessary) [host-porter]
│   ├── guidance.ts    (A's diagnose logic moved out of A's index.ts)   [host-porter]
│   ├── policy.ts      (B's policy.mjs ported to TS)                    [host-porter]
│   ├── metrics.ts     (B's metrics.mjs ported to TS)                   [host-porter]
│   ├── state.ts       (B's JSON preference/session state, normalized)  [host-porter]
│   ├── inject.ts      (B's inject.mjs ported to TS)                    [host-porter]
│   ├── turbo.ts       (B's turbo.mjs: session tree, fleet membership, routes handler data) [host-porter]
│   └── rpc.ts         (envelope + endpoint dispatch, requestRejection fence) [host-porter]
├── src/client/effects/**   (new; B's CSS + fluid engine + small React chrome) [fx-porter]
├── src/client/index.tsx, locales.ts, styles.ts, effort-selection.ts    [lead]
├── src/client/native-selector.tsx, menu-position.ts, agent-tutorial.*.md (kept as-is) [lead]
└── tests/**                                                            [owner listed per file]
```

`design/visual-spec.md` is A's approved visual baseline, kept for reference.
`src/assets.d.ts` already declares `*.png` / `*.md` module imports. `assets/` is not
published; the build inlines both the sprite and the Markdown into `lib/client.js`.

## Host ↔ client contract

One authenticated loopback prefix route, `POST /dsh-whale-effort/<endpoint>`,
registered through `webServer.register` with `connection.requestRejection` exactly
like A's channel (the collection handoff forbids unauthenticated bare routes).

Envelope in: `{ type: 'client-request', rpcId: string, method: string, payload?: unknown }`
Envelope out: `{ type: 'server-response', rpcId, result }` where `result` is
`{ ok: true, value }` or `{ ok: false, error: { code, message, details: {} } }`.

Endpoints (all `POST`, `content-type: application/json`):

| endpoint | payload | value |
| --- | --- | --- |
| `diagnose` | `{ provider, model }` | A's `Guidance` object unchanged |
| `store` | `{}` | `{ entries: KnowledgeEntry[] }` (user-configured entries only; built-ins included by guid- ance) |
| `session/state` | `{ session: string }` | `{ lightning: boolean, ultra: boolean, skin: Skin, rate: number, gen: number, agents: number, generating: boolean, total: number, stamp: number, policy: string }` |
| `session/update` | `{ session: string, lightning?: boolean, ultra?: boolean, skin?: Skin }` | `{ lightning: boolean, ultra: boolean, skin: Skin }` |
| `session/policy` | `{ session: string }` | `{ text: string }` — the exact policy body currently resolved for that session (for the read-only policy chip) |

`session/state` and `session/policy` never throw: unknown session ids degrade to the
default snapshot (`lightning:false, ultra:false, skin:<default>, rate:0, ...`).

Skin values: `'holo' | 'chrome' | 'fluid'`; default `'fluid'`.

Persistence: one JSON document at `$DSH_HOME/storages/dsh-whale-effort.json`
(`$DSH_HOME` resolved as explicit env → `process.env.DSH_HOME` → `~/.dsh`):
`{ version: 1, skin: Skin, sessions: { [sessionId]: { lightning: boolean, ultra: boolean } } }`
— bounded to the 40 most recently touched sessions, atomic replace via temp file +
rename, normalized-not-thrown on malformed input like B's `index.mjs` does.

Policy injection (host): `ctx.on('agent/pre-step', ...)` waterfall; call `next()`
first, then append one instruction message when the resolved text for that
`agent.id` changed since the last injection. Filter strictly by session id (never by
scope). Message shape must match DSH rc.2 (`@deepseek-ai/dsh-agent` `PreStepDecision`
user message with `source: { kind: 'plugin', plugin: 'dsh-whale-effort', form: 'instructions' }`).
The listener never throws and always returns a valid decision. Policy text and
lightning/Ultra semantics are ported from B (`inject.mjs`, `policy.mjs`, `TURBO-CONTRACT.md`).

Metrics (host): port `metrics.mjs` verbatim in behavior; feed it from
`agent/assistant-stream` frames for descendants of the tracked session, membership
tracked from `session/created` / `session/disposed` + `header.parentSession` /
`header.origin === 'subagent'`. Read-only; never fabricate numbers; no timers.

## Client modules

`src/client/effects/` is delivered by `fx-porter` with this API (other files must not
be required to change):

```ts
// effects/skins.ts
export type Skin = 'holo' | 'chrome' | 'fluid'
export const SKINS: readonly Skin[]          // panel order: holo, chrome, fluid
export const DEFAULT_SKIN: Skin              // 'fluid'
export function skinLabel(skin: Skin): string // localized label is supplied by Lead

// effects/fluid.ts — B's fluid particle engine, adapted for A's layout
export interface FluidHandle {
  setProgress(progress: number): void        // 0..1
  setSkin(skin: Skin): void
  setUltra(on: boolean): void                // top-tier ×2 flow + star stream
  setLightning(on: boolean): void            // --es-rate drive
  setRate(normalized: number): void          // 0..1 glow intensity only
  dispose(): void
}
export function createFluidRenderer(canvas: HTMLCanvasElement, options: { skin: Skin }): FluidHandle

// effects/css.ts
export const EFFECTS_CSS: string             // all new visual CSS, scoped to `.we-*`
                                             // classes / `[data-we-skin]` attributes only

// effects/EffectsRail.tsx — visual stack rendered inside `.re-effort-slider`
export interface EffectsRailProps {
  progress: number        // 0..1 current thumb position
  dragging: boolean
  skin: Skin
  ultra: boolean
  lightning: boolean
  rate: number            // 0..1 normalized glow, from host tok/s
  top: boolean            // thumb at the model's real MAX level
}
export function EffectsRail(props: EffectsRailProps): JSX.Element

// effects/BoltToggle.tsx
export function BoltToggle(props: { on: boolean; disabled?: boolean; label: string; onToggle(): void }): JSX.Element
// effects/RateReadout.tsx
export function RateReadout(props: { total: number; generating: boolean; label: string }): JSX.Element
// effects/PolicyChip.tsx
export function PolicyChip(props: { text: string; title: string; expandLabel: string }): JSX.Element
// effects/index.ts re-exports all of the above
```

Rules for `fx-porter`:

- Port B's `effort-slider.css` faithfully for the visual layers (`we-` prefix); do not
  rename or restyle A's `re-*` rules. Where B's rule conflicts with A's layout, keep
  B's effect geometry scoped under the new `we-` classes.
- The fluid engine is the only canvas renderer; reduced-motion freezes animation
  (B's `@media` behaviour plus a JS `matchMedia` check).
- No `!important`, no `:root`/`html`/`body` selectors (B already avoids these), no
  runtime imports outside the frozen module table + local modules.
- Components may use `react` and its `jsx-runtime` only.
- Keep the whale-girl sprite untouched: the chibi thumb itself is Lead's CSS, not
  part of `EffectsRail`.

## Client integration (Lead)

`src/client/index.tsx` keeps A's structure (`EffortSlider`, `AdvancedModelSelect`,
`NativeEffortPanel`, settings rows, `apply`) and adds:

- Display levels = model's real efforts + an appended `Ultra` pseudo level when the
  model exposes >= 2 efforts. Selecting Ultra commits the real MAX effort id and sets
  `ultra: true` host state (and the reverse when leaving Ultra).
- Lightning bolt toggle in the pane; per-session state round-trips through the RPC.
- tok/s readout polled through `session/state` while the pane is open (host provides
  the numbers; the client only formats integers, no k/M abbreviation).
- `EFFECTS_CSS` injected in `apply` after A's styles; `<EffectsRail>` inside the
  slider, `BoltToggle`/`RateReadout`/`PolicyChip` around it.
- Skin picker as a new settings row (`settings.general.item`), persisted through the
  host (`session/update` with `skin`); default `fluid`.
- Every new string goes through `locales.ts` (zh + en).

## Verification

- `cd plugins/dsh-whale-effort && DSH_REPO=/path/to/deepseek-harness npm run check`
- `DSH_REPO=... npm run build`; committed `lib/` must match a fresh build.
- Unit tests cover: policy selection/dedup input, metrics math, state normalization,
  effort display-level mapping (Ultra → MAX), locale key symmetry.
- Live verification in Harness Dev2 (`~/.dsh-dev2`, CDP 9242) by the verifier.
