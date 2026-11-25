# dsh-kimi-tower

Kimi Code's **tower mode**, ported to DeepSeek Harness as a Host bundle with a
small browser half: a progress dock above the composer and a fullscreen,
read-only canvas of the whole fleet.

Tower turns the main agent into a control tower for one repository: it splits
the objective into missions, runs each worker in its own git worktree and
branch, has independent reviewers gate merges, and keeps every participant in
sync through a file-backed inbox under `.tower/comms/`.

## What you get

- **`/tower` command** — `/tower on`, `/tower off`, `/tower status`,
  `/tower stop <mission>`, `/tower teardown`, or `/tower <base-branch>`.
- **13 tools** (model-facing, all gated to tower mode):
  `tower_init`, `tower_plan`, `tower_spawn`, `tower_merge`, `tower_rebase`,
  `tower_teardown`, `tower_complete`, `tower_send`, `tower_inbox`,
  `tower_finding`, `tower_review`, `tower_mission`, `tower_status`.
- **Worker/reviewer subagents** — workers run in `.tower/worktrees/wt-N`,
  reviewers inspect a branch read-only. Their tools are restricted by a
  DSH tool restriction and their prompt carries the tower worker overlay.
- **Review-gated merges** — build missions need a clean review with
  `merge=merge` on the exact tip; artifact missions need explicit human
  acceptance; surveys close zero-diff.
- **Guards** — while tower mode is active the tower cannot use `todo_write`,
  `subagent`, `subagent_fork`, `workflow`, `ralph`, `wait_agent`, or
  `create_goal`; workers cannot write outside their worktree; the bash guard
  protects `.tower/comms/` from `rm -r`, `git reset --hard`, and
  `git clean -fdx`.
- **Durable mode** — tower mode is folded from the session log
  (`command/run`/`command/done` for `/tower`), so resume and fork recover it.
- **Progress dock** — above the composer: one card per open mission with the
  worktree, live worker `model · effort`, task progress, status, elapsed time,
  a stop button, and click-through to the worker session.
- **Tower canvas** — a fullscreen read-only picture of the fleet, opened from
  the dock's `画布` button or from the tower icon in the session header. Mission
  groups, agent cards, and 派发 / 拥有 / 评审 / 依赖 / 消息 wires; summary and
  detail densities; all / open / blocked filters; pan, zoom, fit, minimap and
  legend; a side panel with the selected mission or agent, the message stream,
  review history, and the activity log. Clicking an agent's `打开会话` (or
  double-clicking its card) switches to that session; Escape closes.

## Install

From this directory:

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-kimi-tower
```

or in DSH: **Settings → Plugins → Add plugin** and pick this directory.

## Use

1. In a git repository, run `/tower on` (or `/tower develop` to create/use a
   local base branch). This initializes `.tower/` and keeps the current branch
   as the base.
2. Send the objective as a normal message. The tower plans missions and spawns
   one worker per dependency-unblocked mission.
3. Supervise with `tower_status`; redirect work with a normal message. Worker
   completions and inbox traffic wake the tower.
4. Merge only through `tower_merge`; fix base drift with `tower_rebase`.
5. After every mission is merged or abandoned: `tower_teardown`, then
   `/tower off`.

`.tower/comms/` (state, inbox, findings, reviews, activity log) is the audit
trail. Never edit it by hand.

## Compatibility and limits

- DSH `0.2.2-rc.5` (developed and smoke-tested against the installed Desktop
  build and a clean `dsh web` profile). It imports no DSH package at runtime;
  the browser half uses only the documented client slots
  (`conversation.input.dock`, `conversation.session.header.actions`,
  `shell.overlay`) and the shell's frozen `react` / `react-dom` module table.
- Per-spawn model selection from Kimi is not exposed; children inherit the
  tower session's provider/model.
- The Kimi bash parser guard is reduced to the state-protecting subset
  (`rm`, `git reset --hard`, `git clean -fdx` over `.tower/`).
- Worktrees share your DSH permissions and are not a security sandbox.
- The Kimi reminder's 2/5-turn sparse/full cadence is simplified to one stable
  full section while the mode is active, plus an injected exit notice.

## Verification

Run on macOS with the installed DSH `0.2.2-rc.5`:

- `npm run check` — 120 tests pass (`tsc --noEmit` clean): the vendored
  protocol against real git repositories (init, plan, scope deps, worktree
  commit, completion, independent review, merge, out-of-scope refusal,
  stale-base rebase, teardown, state loss), the DSH tool surface against a fake
  Host (command activation, plan → spawn → complete → review → merge, guards,
  exit), the dock and canvas snapshots, the canvas layout and client machinery,
  the Host → client contract test (`test/canvas-contract.test.mjs`: synthetic
  tower repository → real `detail=1` route → real `layoutCanvas`, with the
  fields the browser reads asserted by value), and packaging.
- 0.1.2-beta.1 real-instance check (this is the prerelease; 0.1.2 final is not
  published yet): a separate `dsh web` 0.2.2-rc.5 instance on a
  temporary DSH home, a temporary git repository, and a synthetic fleet
  (running / offline / blocked / paused / merged / abandoned, dependencies, a
  dead worker, review history, inbox traffic, a finding, and a real live Host
  agent with `model · effort`) confirmed the dock, both canvas entries, the
  node/wire counts against `layoutCanvas`, filters, densities, pan/zoom/fit,
  minimap, legend, detail panel, the three lists, session jump (button and
  double click), Escape/focus/inert, and the 3-second polling that stops on
  close. Light and dark screenshots were taken; neither is committed.
- Real headless E2E with a local model route: `/tower` mode hydrated from the
  session log; `tower_status`, `tower_plan`, and `tower_spawn` executed in the
  real Host; the spawned worker ran in `.tower/worktrees/wt-1` with the
  restricted tool list (`read`, `bash`, `tower_mission`, `tower_inbox`,
  `tower_complete`, … and no `tower_plan`/`tower_spawn`/`tower_merge`); its
  `tower_complete` stored the survey summary and woke the tower with a gate
  digest; the tower closed the zero-diff survey with `tower_merge` and removed
  the worktree with `tower_teardown`.
- Installed in the Desktop profile: the `include:kimi-tower` row reports
  `enabled: true`, `fiberPhase: active`.

### Cross-version check

Tested against two local builds side by side:

| Build | Version / commit | Plugin row | Headless E2E |
| --- | --- | --- | --- |
| Harness Dev | `0.2.2-rc.5` / `2e39e70` (repointed to an isolated `dev-latest` worktree) | running; `/tower status` executed in the desktop UI and logged as `command/done` | `tower_status` / `tower_plan` / `tower_spawn` / worker / `tower_review` / `tower_merge` |
| Harness Dev2 | `0.2.2-rc.5` / `2e39e70` (isolated `dev2-latest` worktree) | running | same tool surface |
| Harness Dev3 | `0.2.2-rc.5` / `2e39e70` (isolated `dev3-latest` worktree) | running | full feature matrix below |
| Installed Desktop app | `0.2.2-rc.5` | `include:kimi-tower` active | `tower_status` / `tower_plan` / `tower_spawn` / worker completion / `tower_merge` |

The earlier alpha.3 build (`8bd0733`) was also exercised before the upgrade:
`tower_status` → `tower_plan` → `tower_spawn` → worker `tower_complete` →
wake → `tower_merge` → `tower_teardown`, plus the `wait_agent` denial.

### Feature coverage

Real tools on the rc.5 Host, driven by a model against a scratch git repo:

- **Mode/commands** — `/tower status`, `/tower on`, `/tower off`, and
  `/tower stop M1` executed through the desktop Host command plane; stop
  pauses the mission and interrupts the worker; the
  composer command palette lists `tower` for `/tow`; on/off and mode hydration
  are also covered by the fake-Host suite.
- **Workspace** — `tower_init` re-anchors to a new local base and reports
  stale/no-branch relations and the checkout mismatch.
- **Planning** — build, survey, and artifact missions.
- **Desktop UI flow** — plan → spawn a real worker → worker completes →
  tower inbox → merge → teardown, run inside the running Dev2 desktop app
  (not only the headless CLI). The per-mission dock, its live polling, its
  click-through, and its disappearance after merge were separately verified.
- **Fleet** — real worker and reviewer subagents; worker commits in its
  worktree; reviewer reads the branch read-only.
- **Messaging** — tower→worker directive, worker→tower message, broadcast,
  inbox acknowledgement and remaining-count.
- **Findings** — an `improve` finding and a `vuln` finding, both stored.
- **Missions** — read, note, blocker, clear-blockers, task_done, task_drop with
  reason, abandon.
- **Completion** — survey, build, and artifact `tower_complete`, including
  `key_artifacts` and the bound completion tip.
- **Review** — clean/merge, hold refusal, non-clean reopening, and the
  headless artifact-acceptance refusal.
- **Merge** — successful merge, stale-base refusal, hold refusal, and a
  conflict-free rebase followed by merge.
- **Teardown** — dry run, `exclude`, `force`, and live-agent protection (a worktree whose worker is still running is kept and reported as `live agent: <name>`).
- **Guards** — `todo_write`, `subagent`, `wait_agent`, and `create_goal` are
  refused while the mode is active; the bash guard is inert outside the mode
  and refuses `git reset --hard` while it is active.

One model-compatibility fix came out of the desktop drill: models commonly
send every optional argument, including `scope: []`, `blocker: ""`, and
`task_drop: ""`. The tool now normalizes those empty values to `undefined`, so
a `tower_mission` task update is not mistaken for a scope change. The fake-Host
suite covers it.

Known limitation found in the drill: the worker write guard covers the
`write`/`edit` tools, not shell redirection. A worker can still write outside
its worktree through `bash` under the session sandbox; a survey worker filed
this as a `vuln` finding during the test. Treat worktrees as isolation for
cooperating agents, not as a security boundary.

## UI dock

The plugin ships a browser half (`lib/client.js`, declared as `dsh.client`)
that registers a dock in `conversation.input.dock` above the composer. While
tower mode is active and missions are open, it shows one card per mission:

- mission number, mission id, and title;
- a collapsed `后台 Agent ● N` pill; clicking the header or the pill toggles
  the full card grid;
- `Work in <worktree>` path;
- the worker's live `model · effort` when its agent is still alive;
- task progress (`done/total`) and a status dot;
- elapsed time, updated every second;
- a stop button on running cards, which runs `/tower stop <mission>` and
  interrupts the worker;
- clicking a card opens the worker's session; cards that leave the snapshot
  linger for four seconds and fade out instead of disappearing abruptly.

The Host serves the read-only snapshot at `GET /tower/state?sessionId=…`; the
browser polls it once a second, but only while a dock is mounted. The route is
read-only, returns no message content, and disappears with the plugin. The
client uses a relative URL, so it works both in the Electron `dsh-app://`
shell and in a browser tab served by the same Host.

> The route definition carries `auth: 'required'`, but the shipped `dsh web`
> webserver does not apply that field to plugin routes: on the loopback listener
> the route answers without the page token (the app shell itself still returns
> 401 without it). The payload is read-only metadata with no message bodies and
> no CORS headers, so it is same-machine information rather than a remote
> surface — do not treat the flag as a security boundary. The 0.1.2-beta.1
> verification filed this as a finding.

Verified in the Dev2 desktop app: two real survey workers rendered as
`Progress alpha` / `Progress beta` with `gpt-6-luna · max`, `0/1` and `1/1`
task progress, second-by-second elapsed time, and click-through to the worker
session; the dock disappeared when both missions merged. Dev3 rendered
`M3 Pill alpha` / `M4 Pill beta` with `auto/deepseek-v4.1-flash`, and the
header collapsed to a `后台 Agent 2` pill (and expanded again) through DOM
clicks. The running card's stop button sent `/tower stop M1`, the worker died
with `aborted`, the mission moved to `paused`, and the card changed to
`已离线`; abandoning it produced a `data-fading` card that was gone after the
four-second linger. No window was brought to the foreground during the checks.

## Tower canvas

The canvas is the second client contribution. It is a fullscreen, strictly
read-only view of the tower, mounted on the shell's additive `shell.overlay`
seat and rendered into `document.body` (so it does not swallow the desktop
window's drag region).

Two entries open it:

- the `画布` button in the progress dock's header, and
- the tower icon in the session header (`conversation.session.header.actions`),
  which exists even when the tower has no mission at all — just turned on.

What it draws, from the `detail=1` snapshot:

- a tower card in the middle, mission groups in two columns (each a dashed
  frame holding a task-list card and a scope card in the detail density), and
  the mission's workers/reviewers as agent cards in the outer column;
- wires: `派发` from the tower, `拥有` / `曾负责` / `评审` from an agent, `依赖`
  between missions of one column, and dashed `消息` wires aggregated per pair
  of endpoints with an unread tone;
- `摘要` / `详情` densities, and `全部` / `未完成` / `被阻塞` filters;
- drag-to-pan (plus arrow keys), wheel or `+`/`−` zoom, the zoom percentage
  button, `0`/the fit button for "fit to window", a minimap, and a legend;
- a side panel for the selected mission, agent, or wire: checklist, scope,
  dependencies, blockers, notes, latest review, the user's own words, and the
  three read-only lists (message stream, review history, activity log);
- the agent's `model · effort` from the Host's live `AgentModel`, on the card,
  in the panel, in the detail-density mission header, and on the dock card;
- `打开会话` on an agent card (or a double click) opens that agent's session and
  closes the canvas.

Accessibility: the canvas owns focus while open, keeps Tab inside its own
controls, marks the rest of the page `inert`, closes on Escape only while it is
the topmost layer, and restores focus to the opener. Its poller fetches once
immediately, then every 3 seconds; it pauses while the document is hidden or a
pan/zoom gesture is in progress, backs off on failure, and stops when the
canvas closes. The layout itself (`src/canvas/layout.js`) is a pure function of
the snapshot, so the same snapshot always yields the same coordinates.

## Development

```sh
npm install
npm run build      # esbuild → lib/index.js
npm test           # protocol + integration tests (real git repos, fake Host)
npm run typecheck
```

The protocol layer under `src/protocol/` is a near-verbatim port of
`kimi-code/packages/agent-core-v2/src/features/tower/protocol` (MIT, see
`NOTICE`); only the main-session recognition was adapted to DSH session ids.

## License

MIT. Portions copyright Moonshot AI; see `NOTICE` and `LICENSE`.
