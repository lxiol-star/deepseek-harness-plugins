import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Agent, Context, ToolDefinition, ToolRunContext } from './dsh'
import type { TowerRuntime } from './runtime'
import { deliverAndReport } from './delivery'
import { isMainAgent } from './helpers'
import {
  COMPLETE_DESCRIPTION,
  FINDING_DESCRIPTION,
  INBOX_DESCRIPTION,
  INIT_DESCRIPTION,
  MERGE_DESCRIPTION,
  MISSION_DESCRIPTION,
  PLAN_DESCRIPTION,
  REBASE_DESCRIPTION,
  REVIEW_DESCRIPTION,
  SEND_DESCRIPTION,
  SPAWN_DESCRIPTION,
  STATUS_DESCRIPTION,
  TEARDOWN_DESCRIPTION,
} from './prompts'
import {
  MISSIONS_DIR,
  TOWER_NAME,
  TowerProtocolError,
  missionFileName,
  type TowerMission,
  type TowerMissionGateBlock,
  type TowerReviewBinding,
  type TowerState,
} from './protocol/index'
import { spawnTowerAgent } from './spawn'

const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  render: (_args: unknown, value: { text: string }) => [{ type: 'text' as const, text: value.text }],
}

function objectSchema(
  properties: Record<string, unknown>,
  required: readonly string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required: [...required], additionalProperties: false }
}

function string(description: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'string', description, ...extra }
}

function boolean(description: string): Record<string, unknown> {
  return { type: 'boolean', description }
}

function integer(description: string): Record<string, unknown> {
  return { type: 'integer', description }
}

function array(items: Record<string, unknown>, description: string): Record<string, unknown> {
  return { type: 'array', items, description }
}

const MISSION_STATUSES = ['planned', 'active', 'completed', 'blocked', 'paused', 'merged', 'abandoned'] as const

/** Register all tower tools. */
export function registerTowerTools(ctx: Context, runtime: TowerRuntime, options: { agentCanEnable?: boolean } = {}): void {
  const register = (definition: ToolDefinition, when: (context: { agent: Agent }) => boolean): void => {
    ctx.effect(() => ctx.tools.register(definition, { when }), `dsh-kimi-tower:${definition.name}`)
  }

  const mainOnly = ({ agent }: { agent: Agent }): boolean => runtime.isActive(agent)
  /** Offered only while tower is off: once it is on, `tower_init` and the rest of the protocol take over. */
  const activatable = ({ agent }: { agent: Agent }): boolean =>
    options.agentCanEnable === true && isMainAgent(agent) && !runtime.isActive(agent)
  const shared = ({ agent }: { agent: Agent }): boolean => runtime.toolVisible(agent, 'tower_send')
  const completeOnly = ({ agent }: { agent: Agent }): boolean => runtime.childOf(agent)?.kind === 'worker'
  const reviewOnly = ({ agent }: { agent: Agent }): boolean => {
    const binding = runtime.childOf(agent)
    return binding?.kind === 'reviewer' || (isMainAgent(agent) && runtime.isActive(agent))
  }

  register({
    name: 'tower_activate',
    description: 'Enter tower mode in this Session\'s own workspace without waiting for a person to run /tower on. Only the main '
      + 'agent of a workspace may call it, and only where the workspace owner allows it. On success tower mode is active and the '
      + 'rest of the protocol (tower_init, tower_plan, ...) becomes available; prefer tower_init afterwards if the workspace is fresh.',
    parameters: objectSchema({ base: string('Local branch that missions fork from and merge back into, as tower_init takes it.') }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent as Agent | undefined
      if (agent === undefined || !isMainAgent(agent)) {
        throw new TowerProtocolError('tower mode is entered by the main agent of a workspace, which this Session is not')
      }
      if (runtime.isActive(agent)) return { text: 'Tower mode is already active in this workspace.' }
      const base = typeof args.base === 'string' && args.base.length > 0 ? args.base : undefined
      const result = await runtime.activate(agent, base)
      return { text: [
        `Tower mode: ON (base ${result.base}, checkout ${result.checkout})`,
        result.created ? 'Created .tower/ in this workspace.' : 'Adopted the existing .tower/ workspace.',
        'Next: tower_init to plan missions, then tower_spawn per mission.',
      ].join('\n') }
    }),
  }, activatable)

  register({
    name: 'tower_init',
    description: INIT_DESCRIPTION,
    parameters: objectSchema({ base: string('Local branch that missions fork from and merge back into (e.g. "develop"). Defaults to the branch currently checked out in the main worktree.') }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent)
      const store = await runtime.store(main)
      const priorOwner = await store.load().then((state) => state.sessionId, () => undefined)
      if (priorOwner !== undefined && priorOwner !== main.id) {
        const owner = ctx.agents.get(priorOwner)
        if (owner !== undefined) {
          throw new TowerProtocolError(
            `tower workspace is owned by a live session (${priorOwner}) — adopting it would retire that session's roster. `
            + 'Use the tower from that session, or close it first.',
          )
        }
      }
      const result = await store.init(main.id, args?.base)
      const lines = [
        result.created
          ? 'tower workspace initialized'
          : 'tower workspace already initialized — existing state preserved',
        `base branch: ${result.base}`,
        ...(result.rebasedFrom !== undefined
          ? [`base re-anchored from "${result.rebasedFrom}" to "${result.base}" — open missions now evaluate against "${result.base}"`]
          : []),
        ...((result.rebaseDigest?.missions ?? []).map(reanchorMissionLine)),
        ...(result.checkout !== result.base
          ? [
              result.checkout === 'HEAD'
                ? `note: the main checkout is in a detached HEAD state — merges stay blocked until the base is checked out (git checkout ${result.base})`
                : `note: the main checkout is on "${result.checkout}", not base "${result.base}" — merges stay blocked until it is switched over (git checkout ${result.base})`,
            ]
          : []),
        'workspace: .tower/ (comms under .tower/comms/, worktrees under .tower/worktrees/)',
        ...(result.openMissions.length > 0
          ? [`carried-over open missions: ${result.openMissions.join(', ')} — their scopes are still reserved. Continue them (tower_spawn fresh workers), or abandon them first (tower_mission status=abandoned) so a new plan can use those files.`]
          : []),
        ...(result.retiredAgents.length > 0
          ? [`adopted from a previous session — retired its stale roster entries: ${result.retiredAgents.join(', ')}. Their agents belong to the dead session and cannot be resumed; missions and worktrees are preserved — tower_spawn fresh workers to continue them.`]
          : []),
        '',
        'Tower mode is active and the tower tool set is enabled.',
        'Next: split the work with tower_plan (one mission per disjoint file scope), then tower_spawn a worker per mission. Assign independent reviewers for their branches, and merge with tower_merge only after a clean review with merge verdict "merge".',
      ]
      return { text: lines.join('\n') }
    }),
  }, mainOnly)

  register({
    name: 'tower_plan',
    description: PLAN_DESCRIPTION,
    parameters: objectSchema(
      {
        missions: array(
          objectSchema(
            {
              title: string('Short mission title; becomes the branch/worktree slug. Printable ASCII English only — any non-ASCII character is rejected. Include a unique identifier word (a business code, a module name, a ticket id).'),
              scope: array(string('Files/globs this mission may touch (e.g. "src/build/**").'), 'Files/globs this mission may touch.'),
              tasks: array(string('A verifiable checklist item.'), 'Checklist the worker will tick off via tower_mission task_done.'),
              context: string("The user's own key sentences about this mission, copied verbatim. Never paste the full conversation history."),
              deps: array(string('Mission id (e.g. "M1") that must merge before this one can merge.'), 'Mission ids that must merge before this one can merge.'),
              kind: { type: 'string', enum: ['build', 'survey', 'artifact'], description: '"survey" = read-only, zero-diff investigation. "artifact" = committed deliverables with explicit human acceptance. Default "build".' },
            },
            ['title', 'scope'],
          ),
          'Missions to create.',
        ),
      },
      ['missions'],
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent)
      const store = await runtime.store(main)
      const missions = await store.plan(args.missions)
      const rows = missions.map(
        (mission) => `| ${mission.id} | ${mission.title} | ${mission.kind} | ${mission.branch} | ${mission.worktree} | ${mission.scope.join(', ')} |`,
      )
      return {
        text: [
          `planned ${String(missions.length)} mission(s):`,
          '',
          '| ID | Mission | Kind | Branch | Worktree | Scope |',
          '| -- | ------- | ---- | ------ | -------- | ----- |',
          ...rows,
          '',
          'Next: tower_spawn one worker per mission (workers get their worktree path and mission briefing automatically). Build missions also need independent reviewers. Artifact missions instead present their key artifacts for explicit human acceptance of the entire committed tip before tower_merge. Survey missions need no reviewer — they close with a zero-diff tower_merge.',
        ].join('\n'),
      }
    }),
  }, mainOnly)

  register({
    name: 'tower_spawn',
    description: SPAWN_DESCRIPTION,
    parameters: objectSchema(
      {
        name: string('Unique tower name for the agent (e.g. "agent-build", "reviewer-a"). Used for inbox addressing and mission ownership.'),
        kind: { type: 'string', enum: ['worker', 'reviewer'], description: 'workers execute a mission in their worktree; reviewers review one branch' },
        mission_id: string('Required for workers: the mission id (e.g. "M1") from tower_plan.'),
        review_target: string('Required for reviewers: the branch to review (e.g. "feat/vulkan-build").'),
        instructions: string('Extra tower instructions appended to the generated briefing.'),
      },
      ['name', 'kind'],
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent)
      const outcome = await spawnTowerAgent(ctx, runtime, main, args, exec.signal)
      return { text: outcome.text }
    }),
  }, mainOnly)

  register({
    name: 'tower_merge',
    description: MERGE_DESCRIPTION,
    parameters: objectSchema({ branch: string('The mission branch to merge into the base branch (e.g. "feat/vulkan-build")') }, ['branch']),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent)
      const store = await runtime.store(main)
      const result = await store.merge(args.branch, { activeAgentIds: () => runtime.runningAgentIds() })
      const { status, mergeCommit, conflictsWith, evaluatedBranchTip, currentBranchTip } = result
      if (status === 'advanced') {
        if (result.noop === true) {
          throw new TowerProtocolError(
            `SURVEY NOT CLOSED: ${args.branch} advanced from the evaluated zero-diff tip ${evaluatedBranchTip} to ${currentBranchTip} before the mission could be closed — no git merge was performed and the mission was not marked merged; re-evaluate the new tip`,
          )
        }
        throw new TowerProtocolError(
          [
            `PARTIAL MERGE: only the evaluated commit ${evaluatedBranchTip} of ${args.branch} was merged (merge commit ${mergeCommit}).`,
            `${args.branch} advanced during the merge to ${currentBranchTip}; that newer tip and any commits after ${evaluatedBranchTip} were NOT merged.`,
            'The mission was not marked merged. Review the new exact tip, then retry tower_merge; an artifact mission instead needs fresh explicit human acceptance on that tip. Do not treat the partial merge as a completed mission merge.',
          ].join('\n'),
        )
      }
      const after = await store.load()
      const allClosed = after.missions.length > 0
        && after.missions.every((mission) => mission.status === 'merged' || mission.status === 'abandoned')
      const teardownHint = 'Every mission is now merged or abandoned — ready for tower_teardown (branches and .tower/comms/ are kept; dirty worktrees are protected).'
      if (status === 'noop') {
        return {
          text: [
            `${args.branch} is a read-only survey with a zero-diff branch — mission marked merged, no git merge needed.`,
            allClosed ? teardownHint : 'Continue with the remaining missions in Dependency Flow order.',
          ].join('\n'),
        }
      }
      const lines = [
        `merged ${args.branch} (merge commit ${mergeCommit.slice(0, 7)})`,
        `full commit: ${mergeCommit}`,
      ]
      if (conflictsWith.length > 0) {
        lines.push(
          '',
          'These unmerged branches changed the same files and now likely conflict with the base:',
          ...conflictsWith.map((conflict) => `- ${conflict.branch}: ${conflict.files.join(', ')}`),
          'For each affected mission, follow the next structured refusal: tower_rebase while its worker is idle (or ask the worker to rebase mid-turn). Conflict-free rebase preserves build review binding; artifact missions instead require fresh explicit human acceptance after the tip moves. Real conflicts must be resolved before another merge.',
        )
      } else if (allClosed) {
        lines.push(`The mission is now marked merged. ${teardownHint}`)
      } else {
        lines.push('The mission is now marked merged. Continue with the remaining missions in Dependency Flow order.')
      }
      return { text: lines.join('\n') }
    }),
  }, mainOnly)

  register({
    name: 'tower_rebase',
    description: REBASE_DESCRIPTION,
    parameters: objectSchema({ mission: string('Mission id (e.g. "M3") whose branch should be rebased onto the current base') }, ['mission']),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent)
      const store = await runtime.store(main)
      const state = await store.load()
      const mission = state.missions.find((candidate) => candidate.id === String(args.mission).trim())
      if (mission === undefined) {
        throw new TowerProtocolError(
          `unknown mission "${args.mission}" — known: ${state.missions.map((candidate) => candidate.id).join(', ') || '(none)'}`,
        )
      }
      const result = await store.rebaseMission(TOWER_NAME, mission.id, { activeAgentIds: () => runtime.runningAgentIds() })
      if (result.status === 'up-to-date') {
        return { text: `mission ${mission.id} (${mission.branch}) is already up to date with base "${state.base}" — retry tower_merge; if it was refused for another reason, that refusal tells you what is missing` }
      }
      if (result.status === 'conflict') {
        return {
          text: [
            `rebase of mission ${mission.id} (${mission.branch}) onto "${state.base}" conflicted and was aborted — the mission is marked blocked.`,
            `conflicted files: ${result.files?.join(', ') || '(none reported)'}`,
            mission.kind === 'artifact'
              ? 'send the worker a directive to resolve the conflicts in its worktree; the moved tip then needs fresh explicit human acceptance.'
              : 'send the worker a directive to resolve the conflicts in its worktree and request a fresh review.',
          ].join('\n'),
        }
      }
      return {
        text: [
          `rebased mission ${mission.id} (${mission.branch}) onto "${state.base}": ${result.fromCommit!.slice(0, 7)} → ${result.toCommit!.slice(0, 7)}.`,
          mission.kind === 'artifact'
            ? 'The pre-rebase human acceptance does not carry over — have the worker run tower_complete with the current report and key_artifacts at the rebased tip, present that new request for fresh explicit human acceptance of the entire tip, record it with tower_review, then retry tower_merge.'
            : 'The pre-rebase review keeps its exact-tip binding, but merge approval still requires a clean review with merge verdict "merge" — retry tower_merge.',
        ].join('\n'),
      }
    }),
  }, mainOnly)

  register({
    name: 'tower_teardown',
    description: TEARDOWN_DESCRIPTION,
    parameters: objectSchema({
      force: boolean('Remove worktrees even when they contain uncommitted changes — a worktree whose roster agent is still running is kept regardless'),
      exclude: array(string('Worktree name to keep.'), 'Worktree names to keep — they are skipped and reported, whatever their state'),
      dry_run: boolean('Print the would-remove / would-keep list with reasons without changing anything on disk or in state'),
    }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const main = runtime.assertActive(exec.agent)
      const store = await runtime.store(main)
      const priorOwner = await store.load().then((state) => state.sessionId, () => undefined)
      if (priorOwner !== undefined && priorOwner !== main.id) {
        const owner = ctx.agents.get(priorOwner)
        if (owner !== undefined) {
          throw new TowerProtocolError(
            `tower workspace is owned by a live session (${priorOwner}) — tearing it down would dismantle that session's fleet. Use tower_teardown from that session, or close it first.`,
          )
        }
      }
      const report = await store.teardown({
        force: args?.force,
        exclude: args?.exclude,
        dryRun: args?.dry_run,
        liveAgentIds: runtime.liveParticipantIds(),
      })
      return {
        text: [
          args?.dry_run === true ? 'tower teardown (dry run — nothing was changed):' : 'tower teardown:',
          ...report.map((line) => `- ${line}`),
          '',
          'Tower mode stays active — the next objective starts with tower_init, and the human can turn the mode off with /tower off. .tower/comms/ (state, inbox, findings, reviews, activity log) is kept as the audit trail — remove it by hand only if you are sure.',
        ].join('\n'),
      }
    }),
  }, mainOnly)

  register({
    name: 'tower_complete',
    description: COMPLETE_DESCRIPTION,
    parameters: objectSchema(
      {
        report: string('Full completion report for the tower and the next review round.'),
        key_artifacts: array(string('Committed path of a key deliverable.'), 'Required for artifact missions: committed paths of the key deliverables for human acceptance. Approval covers the entire completion tip, not only these paths'),
      },
      ['report'],
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent
      if (agent === undefined || isMainAgent(agent)) throw new Error('tower_complete is only available to tower workers')
      const store = await runtime.store(agent)
      const resolved = await store.resolveMessagingCaller(await store.loadOrRecover(), agent.id)
      const report = String(args?.report ?? '').trim()
      const result = await store.complete(resolved.caller, report, args?.key_artifacts)
      const deliveredState = await store.load()
      const lines: string[] = []
      if (result.mission === undefined) {
        lines.push(
          `the tower state was recovered at ${result.recoveredAt ?? 'an unknown time'} after a loss — your mission record is gone, so no mission was marked completed and nothing pretends otherwise`,
        )
      } else {
        lines.push(`mission ${result.mission.id} persisted as ${result.mission.status}`)
      }
      if (result.message !== undefined) {
        lines.push(
          `${result.message.item.subject} notification: ${result.message.item.file}`,
          result.notificationCreated ? 'notification: stored once' : 'notification: reused the stored message; no duplicate was written',
          await deliverAndReport(ctx, runtime, deliveredState, agent, result.message, exec.signal, store),
        )
      }
      if (result.notificationError !== undefined) lines.push(`notification error: ${result.notificationError}`)
      if (result.activityLogError !== undefined) lines.push(`activity log error: ${result.activityLogError}`)
      return { text: lines.join('\n') }
    }),
  }, completeOnly)

  register({
    name: 'tower_send',
    description: SEND_DESCRIPTION,
    parameters: objectSchema(
      {
        to: string('Recipient: a roster agent name, "tower", or "all" (broadcast)'),
        subject: string('One-line subject; keep it greppable'),
        body: string('Full message body (markdown)'),
        scope: string('Optional scope tag (e.g. the mission id).'),
        action: string('Optional action tag for machine routing'),
        consent_ref: string('Optional reference to a consent/approval record this message relies on'),
      },
      ['to', 'subject', 'body'],
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('tower_send requires an agent context')
      const store = await runtime.store(agent)
      const resolved = await store.resolveMessagingCaller(await store.loadOrRecover(), agent.id)
      const sent = await store.sendDetailed(resolved.caller, {
        to: String(args.to).trim(),
        subject: args.subject,
        body: args.body,
        scope: typeof args.scope === 'string' && args.scope.trim() !== '' ? args.scope : undefined,
        action: typeof args.action === 'string' && args.action.trim() !== '' ? args.action : undefined,
        consentRef: typeof args.consent_ref === 'string' && args.consent_ref.trim() !== '' ? args.consent_ref : undefined,
      })
      const delivery = await deliverAndReport(ctx, runtime, resolved.state, agent, sent, exec.signal, store)
      const lines = [`message sent to ${args.to}\nfile: ${sent.item.file}`, delivery]
      if (resolved.placeholder === true) {
        lines.push(
          `note: the tower state was recovered after a loss, so your roster entry was reconstructed as placeholder "${resolved.caller}" — your original name and mission assignment are gone; the recovered state's recoveredAt marker reminds the tower to report the history loss to the user`,
        )
      }
      if (sent.activityLogError !== undefined) lines.push(`activity log error: ${sent.activityLogError}`)
      return { text: lines.join('\n') }
    }),
  }, shared)

  register({
    name: 'tower_inbox',
    description: INBOX_DESCRIPTION,
    parameters: objectSchema({
      limit: integer('Max messages to return (default 20), newest first'),
      include_read: boolean('Include previously acknowledged messages for history lookup; only returned messages are acknowledged'),
    }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('tower_inbox requires an agent context')
      const store = await runtime.store(agent)
      const state = await store.load()
      const caller = callerOf(agent, store, state)
      const limit = args?.limit ?? 20
      const items = args?.include_read === true
        ? await store.readInbox(caller, limit)
        : await store.readUnreadInbox(caller, limit)
      if (items.length === 0) return { text: `inbox empty for ${caller}; 0 unread message(s) remaining` }
      const remaining = await store.ackInbox(caller, items.map((item) => item.messageId))
      const sections = items.map((item) =>
        [
          `file: ${item.file}`,
          `from: ${item.from}`,
          `to: ${item.to}`,
          `subject: ${item.subject}`,
          `sent_at: ${item.sentAt}`,
          ...(item.scope !== undefined ? [`scope: ${item.scope}`] : []),
          ...(item.action !== undefined ? [`action: ${item.action}`] : []),
          '',
          item.body,
        ].join('\n'),
      )
      return {
        text: [
          `${String(items.length)} message(s) for ${caller} (newest first):`,
          '',
          sections.join('\n\n---\n\n'),
          '',
          `${String(remaining)} unread message(s) remaining`,
        ].join('\n'),
      }
    }),
  }, shared)

  register({
    name: 'tower_finding',
    description: FINDING_DESCRIPTION,
    parameters: objectSchema(
      {
        type: { type: 'string', enum: ['bug', 'improve', 'vuln', 'idea'], description: 'Finding category' },
        title: string('Short finding title'),
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        summary: string('What was found, in a sentence or two'),
        location: string('File/symbol the finding concerns'),
        details: string('Full details: evidence, reproduction, impact'),
        suggested_fix: string('What you would do about it'),
      },
      ['type', 'title', 'summary', 'details', 'suggested_fix'],
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('tower_finding requires an agent context')
      const store = await runtime.store(agent)
      const state = await store.load()
      const caller = callerOf(agent, store, state)
      const rel = await store.fileFinding(caller, {
        type: args.type,
        title: args.title,
        severity: args.severity,
        summary: args.summary,
        location: args.location,
        details: args.details,
        suggestedFix: args.suggested_fix,
      })
      return { text: `finding filed: ${rel}\nThe tower will route it — do not fix out-of-scope issues yourself.` }
    }),
  }, shared)

  register({
    name: 'tower_review',
    description: REVIEW_DESCRIPTION,
    parameters: objectSchema(
      {
        target: string('The branch you were assigned to review'),
        status: { type: 'string', pattern: '^(clean|p[12]-\\d+items)$', description: 'Verdict: "clean", or "p1-Nitems" / "p2-Nitems" with the number of findings at that priority' },
        merge: { type: 'string', enum: ['merge', 'fix-then-merge', 'hold'], description: 'Merge recommendation for the tower' },
        findings: string('Full findings text (markdown); write "none" when clean'),
        checks: array(string('A checklist item you verified.'), 'Checklist items you verified (e.g. "tests pass", "no secrets")'),
        decision: string('The reasoning behind your verdict'),
        acceptance_tip: string('Required for tower-recorded artifact acceptance: the completion tip shown in the acceptance-request the human approved'),
      },
      ['target', 'status', 'merge', 'findings', 'decision'],
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('tower_review requires an agent context')
      const store = await runtime.store(agent)
      const state = await store.load()
      const caller = callerOf(agent, store, state)
      const artifactMission = state.missions.find(
        (mission) => mission.branch === args.target
          && mission.kind === 'artifact'
          && mission.status !== 'merged'
          && mission.status !== 'abandoned',
      )
      if (
        caller === 'tower'
        && artifactMission !== undefined
        && args.status === 'clean'
        && args.merge === 'merge'
        && ctx.get('headlessStartup') !== undefined
      ) {
        throw new TowerProtocolError(
          `artifact acceptance for ${args.target} cannot be recorded in a headless or noninteractive run — leave mission ${artifactMission.id} completed and waiting for explicit human approval in an interactive session`,
        )
      }
      const result = await store.submitReview(caller, {
        target: args.target,
        status: args.status,
        merge: args.merge,
        findings: args.findings,
        checks: args.checks,
        decision: args.decision,
        acceptanceTip: args.acceptance_tip,
      })
      const deliveredState = await store.load()
      const deliveries: string[] = []
      for (const message of result.storedMessages) {
        deliveries.push(await deliverAndReport(ctx, runtime, deliveredState, agent, message, exec.signal, store))
      }
      const notified = result.storedMessages.map((message) => message.item.to)
      const lines = [
        `review submitted: ${result.review.file}`,
        `notified: ${notified.length > 0 ? notified.join(', ') : '(none)'}`,
        ...(result.notificationError !== undefined ? [`notification error: ${result.notificationError}`] : []),
        ...(result.activityLogError !== undefined ? [`activity log error: ${result.activityLogError}`] : []),
        ...deliveries,
      ]
      if (artifactMission !== undefined) {
        if (args.status === 'clean' && args.merge === 'merge' && caller === 'tower' && result.review.mission === artifactMission.id) {
          lines.push(`next: explicit human acceptance for ${args.target} is recorded on the exact tip — the tower can tower_merge it in Dependency Flow order.`)
        } else if (args.status === 'clean' && args.merge === 'merge') {
          lines.push(`next: ${args.target} is still waiting for mission-matching explicit human acceptance recorded by reviewer=tower; this review alone does not make the artifact merge-ready.`)
        } else if (args.status === 'clean') {
          lines.push(`next: ${args.target} is not merge-approved — artifact acceptance requires status "clean" with merge verdict "merge", recorded by reviewer=tower after explicit user approval.`)
        } else {
          lines.push(`next: ${args.target} is not merge-ready — the author must rework the artifacts, then the tower must obtain fresh explicit human acceptance on the exact tip.`)
        }
      } else if (args.status === 'clean' && args.merge === 'merge') {
        lines.push(`next: ${args.target} is merge-ready — the tower can tower_merge it in Dependency Flow order.`)
      } else if (args.status === 'clean') {
        lines.push(
          args.merge === 'hold'
            ? `next: ${args.target} is blocked by the latest review's "hold" verdict — the merge gate rejects it; do not tower_merge until a later clean review with merge verdict "merge" supersedes it.`
            : `next: ${args.target} is not merge-approved — "fix-then-merge" is not approval; the merge gate requires a clean review with merge verdict "merge" before tower_merge.`,
        )
      } else {
        lines.push(`next: ${args.target} is not merge-ready — the gate requires a clean review with merge verdict "merge" on the exact tip; the author must fix and re-review.`)
      }
      return { text: lines.join('\n') }
    }),
  }, reviewOnly)

  register({
    name: 'tower_mission',
    description: MISSION_DESCRIPTION,
    parameters: objectSchema(
      {
        id: string('Mission id (e.g. "M1")'),
        status: { type: 'string', enum: [...MISSION_STATUSES], description: 'New lifecycle status. Workers may update only their own mission. "abandoned" is tower-only. "merged" cannot be set here.' },
        note: string('Append a decision-log note'),
        blocker: string('Report a blocker (also sets status to blocked)'),
        clear_blockers: boolean('Clear all recorded blockers'),
        task_done: string('Mark the first open task containing this text as done'),
        task_drop: string('Mark the first open task containing this text as dropped — requires task_drop_reason'),
        task_drop_reason: string('Mandatory with task_drop: why the task is legitimately descoped'),
        scope: array(string('Scope glob.'), 'Tower only: replace the mission scope globs (picomatch — `**` crosses directories).'),
      },
      ['id'],
    ),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('tower_mission requires an agent context')
      const store = await runtime.store(agent)
      const state = await store.load()
      const caller = callerOf(agent, store, state)
      const scope = Array.isArray(args.scope) && args.scope.length > 0 ? args.scope : undefined
      const note = typeof args.note === 'string' && args.note.trim() !== '' ? args.note : undefined
      const blocker = typeof args.blocker === 'string' && args.blocker.trim() !== '' ? args.blocker : undefined
      const taskDone = typeof args.task_done === 'string' && args.task_done.trim() !== '' ? args.task_done : undefined
      const taskDrop = typeof args.task_drop === 'string' && args.task_drop.trim() !== ''
        ? { text: args.task_drop, reason: typeof args.task_drop_reason === 'string' && args.task_drop_reason.trim() !== '' ? args.task_drop_reason : undefined }
        : undefined
      const clearBlockers = args.clear_blockers === true ? true : undefined
      const hasPatch = args.status !== undefined
        || note !== undefined
        || blocker !== undefined
        || clearBlockers !== undefined
        || taskDone !== undefined
        || taskDrop !== undefined
        || scope !== undefined
      if (!hasPatch) {
        const mission = state.missions.find((candidate) => candidate.id === args.id)
        if (mission === undefined) {
          throw new TowerProtocolError(`unknown mission "${args.id}" — known missions: ${state.missions.map((candidate) => candidate.id).join(', ') || '(none planned yet)'}`)
        }
        return { text: await renderMission(store, mission) }
      }
      const mission = await store.updateMission(caller, args.id, {
        status: args.status,
        note,
        blocker,
        clearBlockers,
        taskDone,
        taskDrop,
        scope,
      })
      return {
        text: [
          `mission ${mission.id} updated — status: ${mission.status}, open tasks: ${String(mission.tasks.filter((task) => !task.done && task.dropped !== true).length)}, blockers: ${String(mission.blockers.length)}`,
          '',
          await renderMission(store, mission),
        ].join('\n'),
      }
    }),
  }, shared)

  register({
    name: 'tower_status',
    description: STATUS_DESCRIPTION,
    parameters: objectSchema({ limit: integer('Maximum entries to return in each detail list (default 20), newest first') }),
    output: TEXT_OUTPUT,
    execute: (args, exec) => runTool(ctx, exec, async () => {
      const agent = exec.agent
      if (agent === undefined) throw new Error('tower_status requires an agent context')
      const store = await runtime.store(agent)
      if (!(await store.isInitialized())) {
        if (await store.isStateLost()) return { text: renderStateLostReport() }
        throw new TowerProtocolError('tower is not initialized in this repository — run tower_init first')
      }
      const state = await store.load()
      const caller = callerOf(agent, store, state)
      return { text: await renderStatus(store, state, caller, runtime, args?.limit ?? 20) }
    }),
  }, shared)
}

function runTool<T extends { text: string }>(
  _ctx: Context,
  _exec: ToolRunContext,
  execute: () => Promise<T>,
): Promise<T> {
  return execute()
}

function callerOf(agent: Agent, store: any, state: TowerState): string {
  if (isMainAgent(agent)) return 'tower'
  return store.resolveCallerName(state, agent.id)
}

async function renderMission(store: any, mission: TowerMission): Promise<string> {
  return readFile(store.abs(join(MISSIONS_DIR, missionFileName(mission.id, mission.slug))), 'utf8')
}

function reanchorMissionLine(mission: { id: string; branch: string; relation: 'up-to-date' | 'stale' | 'no-branch' }): string {
  const prefix = `mission ${mission.id} (${mission.branch}): ${mission.relation}`
  switch (mission.relation) {
    case 'up-to-date':
      return `${prefix} — the branch already contains the new base tip; no rebase is required by this re-anchor`
    case 'stale':
      return `${prefix} — the new base is not an ancestor of this branch tip; run tower_rebase(mission="${mission.id}") before merging`
    case 'no-branch':
      return `${prefix} — no branch exists yet; spawn first, then evaluate its relation before merging`
  }
}

/* -------------------------------------------------------------- status UI */

interface StatusGate {
  readonly missionId: string
  readonly branch: string
  readonly ready: boolean
  readonly noop: boolean
  readonly blocks: readonly TowerMissionGateBlock[]
  readonly selectedReview?: { reviewer: string; round: number; status: string; merge: string }
  readonly reviewBinding?: TowerReviewBinding
}

const STATUS_EMOJI: Record<TowerMission['status'], string> = {
  planned: '🟡',
  active: '🔵',
  completed: '🟢',
  blocked: '🔴',
  paused: '⏸️',
  merged: '✅',
  abandoned: '🚫',
}

async function renderStatus(
  store: any,
  state: TowerState,
  caller: string,
  runtime: TowerRuntime,
  limit: number,
): Promise<string> {
  const pending = state.missions.filter((mission) => mission.status !== 'merged' && mission.status !== 'abandoned')
  const activeAgentIds = runtime.runningAgentIds()
  const gate: StatusGate[] = []
  for (const mission of pending) {
    const result = await store.missionGate(state, mission, { activeAgentIds })
    gate.push({
      missionId: mission.id,
      branch: mission.branch,
      ready: result.ready,
      noop: result.noop,
      blocks: result.blocks,
      selectedReview: result.selectedReview === undefined
        ? undefined
        : {
            reviewer: result.selectedReview.reviewer,
            round: result.selectedReview.round,
            status: result.selectedReview.status,
            merge: result.selectedReview.merge,
          },
      reviewBinding: result.reviewBinding,
    })
  }
  const inbox = await store.readInbox(caller, 1000)
  const recentActivity = await store.recentLog(10)
  const sections: string[] = [
    `# Tower status — base: ${state.base} (mode: ${state.mode}), you are: ${caller}`,
    '',
    ...renderRecoveredAtWarning(state),
    '## Missions',
    '',
    ...renderMissions(state, limit),
    ...renderUnspawnedMissions(state, limit),
    ...renderDeathWarnings(state, limit),
    '',
    '## Roster',
    '',
    ...renderRoster(state, limit),
    '',
    '## Review gate (unmerged branches)',
    '',
    ...renderReviewGate(state, gate, limit),
  ]
  if (state.missions.length > 0 && state.missions.every((mission) => mission.status === 'merged' || mission.status === 'abandoned')) {
    sections.push(
      '',
      '## Done',
      '',
      'All missions are merged or abandoned. Free the worktree checkouts now: run tower_teardown (branches and .tower/comms/ are kept; dirty worktrees are protected).',
    )
  }
  sections.push(
    '',
    '## Inbox',
    '',
    `${String(inbox.length)} message(s) visible to you — read with tower_inbox.`,
    '',
    '## Concurrency (adaptive)',
    '',
    `budget: ${String(runtime.config.maxWorkers ?? 'unlimited')} agent(s) · running: ${String(runtime.runningAgentIds().size)}`,
    '',
    '## Recent activity',
    '',
    ...(recentActivity.length > 0 ? recentActivity : ['(activity log is empty)']),
  )
  return sections.join('\n')
}

function renderStateLostReport(): string {
  return [
    '# Tower status — STATE LOST',
    '',
    '.tower/comms/state.json is missing but the .tower/ directory still exists — this tower was initialized here before, and its comms state was deleted (e.g. by git clean). All recorded mission, roster, and review history is lost.',
    '',
    'Report this history loss to the user now — continuing silently would pretend the loss never happened.',
    '',
    'What still works:',
    '- tower_send and tower_complete recover a minimal state automatically (stamped recoveredAt, base taken from the current checkout branch) and keep delivering messages — worker reports are not lost.',
    '- tower_merge and tower_rebase refuse with an explicit state-lost error instead of silently running against an empty history.',
    '- Mission branches and worktrees under .tower/worktrees survive on disk; re-plan from that evidence only after the user decides how to proceed.',
  ].join('\n')
}

function renderRecoveredAtWarning(state: TowerState): string[] {
  if (state.recoveredAt === undefined) return []
  return [
    '## ⚠️ State recovered after a loss',
    '',
    `This tower's state was reconstructed at ${state.recoveredAt} after .tower/comms/state.json was lost — every mission, roster entry, and review from before that point is gone, so the lists below are the recovered minimum, not reality. Report the history loss to the user before continuing routine orchestration.`,
    '',
  ]
}

function renderReviewGate(state: TowerState, gate: readonly StatusGate[], limit: number): string[] {
  const pending = state.missions.filter((mission) => mission.status !== 'merged' && mission.status !== 'abandoned')
  if (pending.length === 0) return ['(no open missions — or none planned yet)']
  const visible = gate.slice(-limit).toReversed()
  const lines: string[] = [`Showing ${String(visible.length)} of ${String(pending.length)} open mission(s), newest first.`, '']
  for (const missionGate of visible) {
    const review = missionGate.selectedReview
    const reviewText = review === undefined
      ? ''
      : `; review=round ${String(review.round)} by ${review.reviewer} ${review.status}/${review.merge || 'legacy'} binding=${missionGate.reviewBinding ?? 'unavailable'}`
    if (missionGate.ready) {
      lines.push(`- ${missionGate.branch} (${missionGate.missionId}): READY reasons=none${missionGate.noop ? '; zero-diff survey no-op, review skipped' : ''}${reviewText}`)
      continue
    }
    const reasons = missionGate.blocks.map((block) => block.reason).join(',')
    const details = missionGate.blocks.map((block) => block.message.replace(/^merge blocked: /, '')).join(' | ')
    lines.push(`- ${missionGate.branch} (${missionGate.missionId}): BLOCKED reasons=${reasons}; ${details}${reviewText}`)
  }
  return [...lines, ...renderOmission(pending.length - visible.length, 'review gate entries')]
}

function renderMissions(state: TowerState, limit: number): string[] {
  if (state.missions.length === 0) return ['(no missions planned — use tower_plan)']
  const counts = new Map<TowerMission['status'], number>()
  for (const mission of state.missions) counts.set(mission.status, (counts.get(mission.status) ?? 0) + 1)
  const totals = [...counts].map(([status, count]) => `${String(count)} ${status}`).join(', ')
  const visible = state.missions.slice(-limit).toReversed()
  return [
    `Showing ${String(visible.length)} of ${String(state.missions.length)} mission(s), newest first.`,
    `Status totals: ${totals}.`,
    '',
    '| ID | Mission | Branch | Worktree | Status | Owner | Kind |',
    '| -- | ------- | ------ | -------- | ------ | ----- | ---- |',
    ...visible.map(
      (mission) =>
        `| ${mission.id} | ${mission.title}${mission.kind === 'survey' ? ' 🔍' : ''} | ${mission.branch} | ${mission.worktree} | ${STATUS_EMOJI[mission.status]} ${mission.status} | ${mission.owner ?? '—'} | ${mission.kind} |`,
    ),
    ...renderOmission(state.missions.length - visible.length, 'missions'),
  ]
}

function renderRoster(state: TowerState, limit: number): string[] {
  if (state.roster.agents.length === 0) return ['(no agents registered — spawn workers/reviewers with tower_spawn)']
  const workers = state.roster.agents.filter((agent) => agent.kind === 'worker').length
  const reviewers = state.roster.agents.length - workers
  const visible = [...state.roster.agents]
    .toSorted((a, b) => b.spawnedAt.localeCompare(a.spawnedAt))
    .slice(0, limit)
  const lines = visible.map((agent) => {
    const assignment = agent.kind === 'worker'
      ? `mission ${agent.missionId ?? '?'} (branch ${agent.branch ?? '?'}, worktree ${agent.worktree ?? '?'})`
      : `reviewing ${agent.reviewTarget ?? '?'}`
    const death = agent.diedAt === undefined ? '' : ` — 💀 ${agent.deathStatus ?? 'died'}`
    return `- ${agent.name} (${agent.kind}) — agent ${agent.agentId}, ${assignment}${death}`
  })
  return [
    `Showing ${String(visible.length)} of ${String(state.roster.agents.length)} agent(s) (${String(workers)} workers, ${String(reviewers)} reviewers), newest spawned first.`,
    '',
    ...lines,
    ...renderOmission(state.roster.agents.length - visible.length, 'roster entries'),
  ]
}

function renderUnspawnedMissions(state: TowerState, limit: number): string[] {
  const pending = state.missions.filter((mission) => mission.status === 'planned' && mission.owner === undefined)
  if (pending.length === 0) return []
  const visible = pending.slice(-limit).toReversed()
  return [
    '',
    '## Awaiting spawn',
    '',
    `Showing ${String(visible.length)} of ${String(pending.length)} planned mission(s), newest first.`,
    '',
    ...visible.map(
      (mission) =>
        `- ${mission.id} [${mission.kind}] (${mission.branch}) — planned but no worker spawned yet: launch one with tower_spawn(kind="worker", mission_id="${mission.id}", name="...")`,
    ),
    ...renderOmission(pending.length - visible.length, 'awaiting-spawn missions'),
  ]
}

function renderDeathWarnings(state: TowerState, limit: number): string[] {
  const deadByName = new Map(
    state.roster.agents.filter((agent) => agent.diedAt !== undefined).map((agent) => [agent.name, agent]),
  )
  const warnings: { diedAt: string; text: string }[] = []
  for (const mission of state.missions) {
    if (mission.owner === undefined) continue
    if (mission.status === 'merged' || mission.status === 'abandoned') continue
    const entry = deadByName.get(mission.owner)
    if (entry === undefined) continue
    warnings.push({
      diedAt: entry.diedAt ?? '',
      text: entry.kind === 'reviewer'
        ? `- ⚠️ ${mission.id} reviewer ${entry.name} died (${entry.deathStatus ?? 'unknown'}) — diagnose first: check the death status/reason. A reviewer is one-shot: do not reuse it; after diagnosis, spawn a fresh reviewer only if the mission still needs one`
        : `- ⚠️ ${mission.id} owner ${entry.name} died (${entry.deathStatus ?? 'unknown'}) — diagnose first: check why it died before reviving anything. A user-stopped worker is never resumed, reassigned, or replaced`,
    })
  }
  if (warnings.length === 0) return []
  const visible = warnings.toSorted((a, b) => b.diedAt.localeCompare(a.diedAt)).slice(0, limit)
  return [
    '',
    '## Dead workers',
    '',
    `Showing ${String(visible.length)} of ${String(warnings.length)} death warning(s), newest death first.`,
    '',
    ...visible.map((warning) => warning.text),
    ...renderOmission(warnings.length - visible.length, 'death warnings'),
  ]
}

function renderOmission(omitted: number, noun: string): string[] {
  if (omitted === 0) return []
  return ['', `${String(omitted)} earlier ${noun} omitted; call tower_status with a larger limit to inspect them.`]
}
