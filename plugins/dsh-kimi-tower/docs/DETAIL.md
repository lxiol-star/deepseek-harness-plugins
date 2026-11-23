# Kimi tower mode for DeepSeek Harness

This bundle ports Kimi Code's **tower mode** to DSH. It is a Host-only plugin:
no Client UI, no extra windows. Its surface is the `/tower` command, 13
model-facing tools, a prompt section, and per-agent guards.

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
  `/tower stop <mission>` through the authenticated command plane. The route requires the
  Host's peer authentication, is same-origin, and carries no message content; departing cards linger for four
  seconds and fade.
- **Mutual exclusion**: entering plan mode leaves tower mode; while tower mode
  is active `todo_write`, `subagent`, `subagent_fork`, `workflow`, `ralph`,
  `wait_agent`, and `create_goal` are refused by a monotonic guard.

## Limits

- Children inherit the tower's model; there is no per-spawn model pool.
- Worktrees are isolation, not a security boundary: workers run with the
  session's DSH permissions.
- The bash guard is the state-protecting subset of Kimi's AST-based guard.
- `/tower` requires DSH's command surface (Web or another interactive client).
  Headless runs can still use the tools if the mode state is active.
