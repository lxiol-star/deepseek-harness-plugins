# Kimi tower mode for DeepSeek Harness

This bundle ports Kimi Code's **tower mode** to DSH. Its Host surface is the
`/tower` command, 13 model-facing tools, a prompt section, and per-agent
guards; its browser half is a progress dock above the composer and a
fullscreen, read-only fleet canvas. It adds no windows of its own beyond that
canvas.

## The model

The main agent becomes the **tower**. It never writes mission code itself:

- `tower_init` records the base branch and creates `.tower/`.
- `tower_plan` splits the objective into missions (`M1`, `M2`, …), each with a
  branch (`feat/<slug>`), an isolated worktree (`.tower/worktrees/wt-N`), a
  file scope, tasks, optional verbatim user context, dependencies, and a kind:
  `build`, `survey`, or `artifact`.
- `tower_spawn` starts one worker per mission as a DSH subagent whose `cwd` is
  the worktree; reviewers are spawned with `review_target` and stay read-only.
- Workers commit in their worktrees, keep `tower_mission` current, and finish
  with `tower_complete(report)`.
- The tower routes traffic with `tower_send` / `tower_inbox`, files
  out-of-scope discoveries with `tower_finding`, and merges only through
  `tower_merge` after the gate passes.
- `tower_rebase` moves a stale mission onto the current base. `tower_teardown`
  removes eligible worktrees; `.tower/comms/` stays as the audit trail.

## The merge gate

`tower_merge` refuses unless all of these hold:

- the mission is `completed`, has no open tasks or blockers, and its worker is
  observably idle;
- dependency missions are merged or abandoned;
- the branch contains the current base tip (else `tower_rebase`);
- for build missions, the latest applicable review is `clean` with
  `merge=merge` on the exact branch tip (a conflict-free rebase can waive the
  tip binding, never the verdict);
- for artifact missions, explicit human acceptance is recorded as a
  mission-matching `reviewer=tower` clean+merge review on the completion tip;
- every changed file is inside the mission scope;
- the main checkout is on the base branch and the merge touches no dirty file.

Surveys are the only zero-diff no-op close.

## DSH integration details

- **Init safety**: tower refuses an unborn repository and a base checkout with
  more than 200 dirty entries before any branch switch or `git add`; `/tower on`
  accepts no trailing text (the objective is a normal message).
- **Mode state** is derived from the session log (`command/run` plus
  `command/done` for `/tower`), so resume and fork restore it without a
  plugin-private session event.
- **Tool visibility** is a `when` condition: main tools appear only while the
  mode is active; protocol tools appear for roster children.
- **Workers and reviewers** are real DSH subagents created through
  `ctx.subagents.startActivation` with a reserved child id, so the plugin can
  decorate the child before its first step: worker overlay prompt, tool
  restriction, write containment, bash guard.
- **Messages** are durable `.tower/comms/inbox/*.md` files. Delivery is a DSH
  push: `steer` a running recipient, `followup` an idle tower, and
  `subagents.sendMessage` for children. A tower wake carries message references
  and a compact gate digest.
- **Stop**: `/tower stop <mission>` runs on the authenticated command plane,
  rejects invalid/duplicate/terminal missions, interrupts a running worker, and
  records the mission as paused. The dock's stop button reports the command
  result and keeps the card pending until the poll observes the pause.
- **Progress dock**: the browser half registers into `conversation.input.dock`
  and polls the Host's read-only `/tower/state` route once a second. Cards show
  mission, worktree, live worker model/effort, task count, status, and elapsed
  time; clicking one opens the worker session, and a running card can send
  `/tower stop <mission>` through the authenticated command plane. The route is
  same-origin and carries no message content; departing cards linger for four
  seconds and fade.
- **Canvas**: the browser half also registers a toggle in
  `conversation.session.header.actions` and the fullscreen canvas on the
  `shell.overlay` seat (see [The canvas](#the-canvas)). Both entries and the
  canvas are read-only; the only request either sends is the snapshot GET.
- **Mutual exclusion**: entering plan mode leaves tower mode; while tower mode
  is active `todo_write`, `subagent`, `subagent_fork`, `workflow`, `ralph`,
  `wait_agent`, and `create_goal` are refused by a monotonic guard.

## The canvas

A fullscreen, strictly read-only picture of the tower. It is mounted on the
shell's additive `shell.overlay` seat and portalled into `document.body`, so it
never sits inside the desktop window's drag region.

### Entries

- the `画布` button in the progress dock's header, and
- the tower icon in the session header (`conversation.session.header.actions`),
  which is the way in when the tower has no mission at all. The toggle learns
  the mode is on from the dock's polling, or probes the snapshot once after a
  short wait if no dock reported for the session.

### Snapshot

`GET /tower/state?sessionId=…` is the dock snapshot (open missions only);
`&detail=1` is the canvas superset: every mission including merged and
abandoned ones with dependencies, scope, tasks, blockers, notes, user context,
key artifacts and the latest review; the full roster with liveness, death
facts, model and effort; inbox message metadata with per-recipient read state;
filed findings; and the tail of the activity log. Every string is single-lined
and hard-capped by `CANVAS_LIMITS` (200 messages, 50 activity lines, 100 tasks,
20 notes/blockers, 40 scope entries, 2,000-character context, 160-character
labels; see `src/canvas-snapshot.ts`). Inbox files are read through the store's
frontmatter reader only — no message body enters the snapshot. Building it
takes no lock and writes nothing.

The route is served on the Host's loopback HTTP listener. Its definition
declares `auth: 'required'`, but the shipped `dsh web` webserver does not apply
that field to plugin routes, so a tokenless local request receives the
read-only metadata while the app shell itself still answers 401 (filed as a
finding during the 0.1.2 verification). There are no CORS headers and no
message bodies, so this is same-machine metadata rather than a remote surface;
do not rely on the declaration as a security boundary.

### Layout

`layoutCanvas(snapshot, { density, filter })` (`src/canvas/layout.js`) is a
pure function: it reads nothing but its arguments and sorts what it is handed,
so the same snapshot always yields the same coordinates (which is what lets the
node tests pin the geometry). The tower sits at the origin, missions form two
columns — dependency components share a column and stack in dependency order —
and each mission's workers and reviewers are cards in the outer column of its
row. Nodes are the tower, mission groups (a dashed frame that holds the
task-list and scope cards in the detail density), and agent cards. Wires are
`派发` from the tower, `拥有` / `曾负责` / `评审` from an agent to its mission,
`依赖` between missions, and dashed `消息` wires aggregated per unordered pair
of endpoints (with the count, latest subject and unread flag). Structural wires
stay inside the diagram; message wires use reserved corridors, and no wire or
wire label passes through a card.

### Interaction

- `摘要` / `详情` densities; `全部` / `未完成` / `被阻塞` filters (an agent whose
  mission is filtered out is hidden with it).
- drag or arrow keys to pan, wheel or `+`/`−` to zoom, the percentage button
  for 100%, `0` or the toolbar button for "fit to window"; a minimap (click or
  drag) and a legend.
- the side panel follows the selection: a mission (checklist, scope,
  dependencies, blockers, notes, latest review, the user's own words, related
  agents), an agent (liveness, mission, `model · effort`, death facts when
  gone, its session), a wire (the pair's messages) or nothing (overview,
  findings). Three tabs — message stream, review history, activity log — are
  read-only lists of the snapshot.
- `打开会话` on an agent card, or a double click on the card, switches the main
  view to that agent's session and closes the canvas.
- accessibility: the canvas owns focus on open, traps Tab inside its own
  controls, marks the rest of the page `inert`, closes on Escape only while it
  is the topmost layer, and restores focus to the opener on close.
- polling: one fetch immediately on open, then every 3 seconds; paused while
  the document is hidden and while a pan/zoom/minimap gesture runs, with
  exponential backoff on failure, and stopped when the canvas closes.

The API between the two halves is pinned by
`test/canvas-contract.test.mjs`: a synthetic tower repository is run through the
real `detail=1` route and then through the real `layoutCanvas`, with the fields
the browser reads asserted by value (mission detail, roster model/effort,
message pairs, dependencies). Renaming a field on either side fails the test.

## Limits

- Children inherit the tower's model; there is no per-spawn model pool.
- Worktrees are isolation, not a security boundary: workers run with the
  session's DSH permissions.
- The bash guard is the state-protecting subset of Kimi's AST-based guard.
- `/tower` requires DSH's command surface (Web or another interactive client).
  Headless runs can still use the tools if the mode state is active.
