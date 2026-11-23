import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Agent, Context } from './dsh'
import type { TowerRuntime } from './runtime'
import {
  GitError,
  MISSIONS_DIR,
  TOWER_NAME,
  TowerProtocolError,
  TowerStore,
  WORKTREES_DIR,
  isReservedTowerAgentName,
  missionFileName,
  parseFrontmatter,
  resolveMissionByBranch,
  type TowerInboxItem,
  type TowerMission,
  type TowerState,
} from './protocol/index'

const REVIEW_REQUEST_SCAN_LIMIT = 50
const REVIEW_HISTORY_ROUNDS = 5
const REVIEW_EXCERPT_MAX_CHARS = 8000

export interface TowerSpawnInput {
  readonly name: string
  readonly kind: 'worker' | 'reviewer'
  readonly mission_id?: string
  readonly review_target?: string
  readonly instructions?: string
}

/** Result returned to the model immediately after a spawn is published. */
export interface SpawnOutcome {
  readonly text: string
}

/**
 * Spawn one worker or reviewer as a background subagent and register it in the
 * tower roster. The tool returns immediately; the child's completion arrives
 * through the subagent runtime's parent delivery.
 */
export async function spawnTowerAgent(
  ctx: Context,
  runtime: TowerRuntime,
  main: Agent,
  args: TowerSpawnInput,
  signal: AbortSignal,
): Promise<SpawnOutcome> {
  if (ctx.subagents === undefined) throw new Error('the subagent service is not available in this composition')
  const store = await runtime.store(main)
  const state = await store.load()

  const name = args.name.trim()
  if (name.length === 0 || name !== args.name) {
    throw new Error(`tower agent name "${args.name}" must not be blank or carry surrounding whitespace`)
  }
  if (isReservedTowerAgentName(name)) {
    throw new Error(`tower agent name "${name}" is reserved by the tower protocol — pick a different name`)
  }
  if (name === 'lead' || !/^[a-z][a-z0-9-]{0,31}$/.test(name)) {
    throw new Error(
      `tower agent name "${name}" is not a valid DSH subagent name — use 1–32 lower-case letters, digits, or hyphens, starting with a letter, other than "lead" (e.g. "worker-1", "reviewer-a")`,
    )
  }
  const existing = store.findByName(state, name)
  if (existing !== undefined) {
    throw new Error(
      `tower agent "${name}" is already registered (agent_id: ${existing.agentId}, kind: ${existing.kind}) — `
      + (existing.kind === 'worker'
        ? 'resume it instead of spawning a duplicate (send it a message with tower_send), or spawn a fresh worker under a new name after it dies.'
        : 'a reviewer is one-shot: diagnose the previous round and spawn a fresh reviewer with a new name instead of reusing this one.'),
    )
  }

  let mission: TowerMission | undefined
  let reviewTarget: string | undefined
  if (args.kind === 'worker') {
    const missionId = args.mission_id?.trim()
    if (missionId === undefined || missionId.length === 0) throw new Error('worker spawns require mission_id')
    mission = state.missions.find((candidate) => candidate.id === missionId)
    if (mission === undefined) {
      const known = state.missions.map((candidate) => candidate.id).join(', ')
      throw new Error(`unknown mission "${missionId}" — known missions: ${known.length > 0 ? known : '(none planned yet)'}`)
    }
    if (mission.status === 'merged' || mission.status === 'abandoned') {
      throw new Error(`mission ${mission.id} is ${mission.status} — terminal missions cannot spawn workers; no worktree or agent was created`)
    }
  } else {
    reviewTarget = args.review_target?.trim()
    if (reviewTarget === undefined || reviewTarget.length === 0) throw new Error('reviewer spawns require review_target')
  }

  const leaseBranch = mission?.branch ?? reviewTarget
  if (leaseBranch === undefined) throw new Error('tower spawn could not resolve the branch lease')

  const reviewMission = reviewTarget !== undefined ? resolveMissionByBranch(state, reviewTarget) : undefined
  let notes: string[] = []

  if (mission !== undefined) {
    try {
      const added = await store.addWorktree(mission.worktree, mission.branch, state.base)
      if (added.spawnBase !== undefined) {
        await store.updateMission(TOWER_NAME, mission.id, { spawnBase: added.spawnBase }, { silent: true })
        mission = { ...mission, spawnBase: added.spawnBase }
        notes.push(
          `base snapshot: ${added.spawnBase.slice(0, 7)} — the base checkout had uncommitted changes; they are committed as the branch's first commit (the checkout itself was left untouched)`,
        )
      }
    } catch (error) {
      if (error instanceof TowerProtocolError) throw error
      notes.push(`worktree setup warning (continuing): ${messageOf(error)}`)
    }
  }

  const worktreeAbs = mission === undefined ? undefined : store.abs(join(WORKTREES_DIR, mission.worktree))
  const cwd = args.kind === 'worker' && worktreeAbs !== undefined ? worktreeAbs : store.repoRoot
  const prompt = await buildBriefing(store, state, args, mission, reviewTarget, reviewMission)
  const description = mission !== undefined
    ? `${mission.id} ${name}: ${mission.title}`
    : reviewMission !== undefined
      ? `${reviewMission.id} review: ${reviewTarget ?? ''}`
      : `review ${name}: ${reviewTarget ?? ''}`

  const childId = `session-${randomUUID()}`
  runtime.bindChild(childId, {
    name,
    kind: args.kind,
    missionId: mission?.id,
    reviewTarget,
    worktree: mission?.worktree,
    branch: mission?.branch,
    worktreeAbs,
    repoRoot: store.repoRoot,
  })

  try {
    await store.registerSpawnedAgent(
      {
        name,
        agentId: childId,
        sessionId: main.id,
        kind: args.kind,
        missionId: mission?.id,
        reviewTarget,
        reviewMissionId: reviewMission?.id,
        worktree: mission?.worktree,
        branch: mission?.branch,
        spawnedAt: new Date().toISOString(),
      },
      mission === undefined ? undefined : { id: mission.id, owner: name },
    )
  } catch (error) {
    runtime.unbindChild(childId)
    throw error
  }

  let activation: Awaited<ReturnType<NonNullable<Context['subagents']>['startActivation']>>
  try {
    activation = await ctx.subagents.startActivation({
      provider: 'spawn',
      label: description,
      name,
      childId,
      cwd,
      prompt: [{ type: 'text', text: prompt }],
      parent: main,
      signal,
      delivery: 'parent',
    })
  } catch (error) {
    runtime.unbindChild(childId)
    await store.markAgentDied(childId, 'spawn-failed', messageOf(error), main.id).catch(() => undefined)
    if (error instanceof TowerProtocolError || error instanceof GitError) throw error
    throw new Error(`tower spawn failed: ${messageOf(error)}`)
  }

  if (activation.childId !== childId) {
    runtime.unbindChild(childId)
    runtime.bindChild(activation.childId, {
      name,
      kind: args.kind,
      missionId: mission?.id,
      reviewTarget,
      worktree: mission?.worktree,
      branch: mission?.branch,
      worktreeAbs,
      repoRoot: store.repoRoot,
    })
  }

  await store.appendLog(
    TOWER_NAME,
    'spawn',
    {
      name,
      kind: args.kind,
      agent: activation.childId,
      mission: mission?.id,
      target: reviewTarget,
    },
    mission === undefined ? undefined : join(MISSIONS_DIR, missionFileName(mission.id, mission.slug)),
  )

  const lines = [
    `name: ${name}`,
    `kind: ${args.kind}`,
    `agent_id: ${activation.childId}`,
    'status: running',
    ...(mission !== undefined
      ? [
          `mission: ${mission.id} — ${mission.title}`,
          `branch: ${mission.branch}`,
          `worktree: ${worktreeAbs ?? ''}`,
        ]
      : [`review_target: ${reviewTarget ?? ''}`]),
    ...notes,
    '',
    args.kind === 'worker'
      ? 'The worker runs detached in the background; its completion arrives as a notification. Use tower_inbox/tower_status only when a decision needs them. If it dies, diagnose first: check why it died (the died entry\'s status/reason) before reviving anything. A user-stopped worker is never resumed, reassigned, or replaced.'
      : 'The reviewer runs detached in the background; its completion arrives as a notification. If it dies, diagnose first. A reviewer is one-shot — do not reuse it; after diagnosis, spawn a fresh reviewer only if the mission still needs one. A user-stopped reviewer is never replaced.',
  ]
  return { text: lines.join('\n') }
}

/** Build the worker/reviewer briefing. */
export async function buildBriefing(
  store: TowerStore,
  state: TowerState,
  args: TowerSpawnInput,
  mission: TowerMission | undefined,
  reviewTarget: string | undefined,
  targetMission: TowerMission | undefined,
): Promise<string> {
  const extra = args.instructions !== undefined && args.instructions.trim().length > 0
    ? `\n\n# Additional instructions from the tower\n${args.instructions.trim()}`
    : ''
  if (mission !== undefined) {
    const missionText = await readFile(
      store.abs(join(MISSIONS_DIR, missionFileName(mission.id, mission.slug))),
      'utf8',
    )
    const worktreeAbs = store.abs(join(WORKTREES_DIR, mission.worktree))
    const workplace = [
      '# Your workplace',
      `- Your private git worktree: ${worktreeAbs}`,
      `- Your branch: ${mission.branch} (base: ${state.base})`,
      ...(mission.spawnBase !== undefined
        ? [
            `- Your branch starts from snapshot commit ${mission.spawnBase.slice(0, 7)}: the base checkout's uncommitted changes (WIP), captured at spawn so you can build on them. That commit is your foundation — never revert, amend, or claim it as your own work; your own commits go on top of it.`,
          ]
        : []),
      `- Your working directory is already the worktree. Address every path inside it; reads of the main checkout (${store.repoRoot}) or another agent's worktree are allowed when coordination calls for it. A guard hard-denies any write or edit outside ${worktreeAbs}.`,
      mission.kind === 'survey'
        ? `- Scope — what you investigate (read-only; reserves nothing): ${mission.scope.join(', ')}`
        : `- Scope — the only files you may change: ${mission.scope.join(', ')}`,
      '',
    ].join('\n')
    if (mission.kind === 'survey') {
      return [
        `You are "${args.name}", a tower worker agent in a multi-agent workspace, assigned a READ-ONLY survey mission.`,
        '',
        workplace,
        '# Your mission',
        '',
        missionText.trim(),
        '',
        '# Read-only discipline',
        '- Your scope marks what you investigate, not what you may change. You MUST NOT modify, add, or delete any file in the repo, and your branch must end with zero commits — a changed file makes the merge gate reject your mission as a read-only violation.',
        '- Your deliverables are knowledge: record findings as tower_mission notes, send summaries to the tower and to dependent agents with tower_send, and file tower_finding for out-of-scope discoveries.',
        '',
        '# Communication protocol',
        '- Ambiguity is escalated, not guessed: if the mission leaves substantive doubt about what to investigate, tower_send(to="tower", subject="clarify-request", body=what needs pinning down) BEFORE acting — the tower relays to the human; you never ask the user directly.',
        '',
        '# When the survey is done',
        '1. Call tower_inbox once and fold anything new into your summary — tower_complete refuses while unread messages wait in your inbox.',
        '2. Call tower_complete(report=the full survey result). It records completed and stores survey-summary to the tower in one protocol flow — do not substitute a tower_mission status patch or a manual tower_send.',
        '3. Finish with a structured final summary: what you covered, key facts with file:line references, open questions.',
        extra,
      ].join('\n')
    }
    const historySection = await workerHistorySection(store, mission, args.name)
    return [
      `You are "${args.name}", a tower worker agent in a multi-agent workspace.`,
      '',
      workplace,
      '# Your mission',
      '',
      missionText.trim(),
      '',
      historySection,
      '# Communication protocol',
      '- Found something notable outside your scope? File it with tower_finding instead of fixing it.',
      '- Keep your mission current with tower_mission: task_done as you finish tasks, note for decisions, blocker when stuck.',
      mission.kind === 'artifact'
        ? '- Ambiguity is escalated, not guessed: if the mission and its Context leave substantive doubt about what to deliver, tower_send(to="tower", subject="clarify-request", body=what needs pinning down) BEFORE acting — the tower relays to the human; you never ask the user directly.'
        : '- Ambiguity is escalated, not guessed: if the mission and its Context leave substantive doubt about what to build, tower_send(to="tower", subject="clarify-request", body=what needs pinning down) BEFORE acting — the tower relays to the human; you never ask the user directly.',
      '',
      '# When the mission is done',
      mission.kind === 'artifact'
        ? '1. `git add` + `git commit` every artifact needed for acceptance in the worktree, inside your scope. Uncommitted files are excluded from acceptance and merge.'
        : "1. `git add` + `git commit` your mission's changes in the worktree (source files only — no build outputs).",
      `2. Before completing, call tower_inbox once and incorporate anything new into the delivery — tower_complete refuses while unread messages wait in your inbox. Re-read your mission too (tower_mission(id="${mission.id}") with no patch fields): the tower may have changed its tasks mid-flight.`,
      mission.kind === 'artifact'
        ? '3. Call tower_complete(report=what you delivered and why, reconciled against the mission tasks item by item, key_artifacts=[the committed paths of the key deliverables the human should inspect]). Every key path must be committed, exist as a file at the current tip, and stay inside your scope, but the list does not need to cover the whole diff. It records completed and stores acceptance-request to the tower in one protocol flow — do not substitute a tower_mission status patch or a manual tower_send. The tower will present those key artifacts and explain that approval authorizes the entire tip, including additional committed files; no independent reviewer is required. If you commit anything after tower_complete, run it again with the updated report and key_artifacts before the tower requests acceptance — acceptance is bound to the last completion tip.'
        : '3. Call tower_complete(report=what you changed and why, reconciled against the mission tasks item by item — the reviewer maps each task to your diff). It records completed and stores review-request to the tower in one protocol flow — do not substitute a tower_mission status patch or a manual tower_send.',
      mission.kind === 'artifact'
        ? '4. Finish with a structured final summary: key artifact paths, key decisions, open follow-ups.'
        : '4. Finish with a structured final summary: files changed, key decisions, open follow-ups.',
      extra,
    ].join('\n')
  }

  const target = reviewTarget ?? ''
  const author = targetMission?.owner
  const reviewBase = targetMission !== undefined ? await store.diffBase(state, targetMission) : state.base
  const missionSection = targetMission !== undefined
    ? `# Mission under review — verify the diff against this intent, not only against code health\n\n${(
        await readFile(store.abs(join(MISSIONS_DIR, missionFileName(targetMission.id, targetMission.slug))), 'utf8')
      ).trim()}\n\n`
    : ''
  const completionReport = author !== undefined
    ? await findCompletionReport(store, author, targetMission?.kind === 'artifact' ? 'acceptance-request' : 'review-request')
    : undefined
  const selfReportSection = completionReport !== undefined
    ? `# The author's own account (their ${targetMission?.kind === 'artifact' ? 'acceptance-request' : 'review-request'} to the tower)\n${completionReport.body.trim()}\n\n`
    : ''
  const historySection = await reviewHistorySection(store, target)
  const checklist = targetMission !== undefined
    ? '1. Intent — does the diff deliver the mission above? Map every task to the changes; healthy code that answers the wrong requirement or silently drops a task is a finding, not a pass.\n2. Security\n3. Data integrity\n4. Performance\n5. Error handling\n6. Code quality\n\n'
    : '1. Security\n2. Data integrity\n3. Performance\n4. Error handling\n5. Code quality\n\n'
  return [
    `You are "${args.name}", a tower reviewer agent in a multi-agent workspace.`,
    '',
    '# Your assignment',
    `Review branch "${target}" against base "${reviewBase}".`,
    `- Work read-only in the main checkout (${store.repoRoot}): \`git diff ${reviewBase}...${target}\`, \`git log ${reviewBase}..${target}\`, and read files as needed.`,
    '- Do NOT modify any code.',
    '',
    missionSection,
    selfReportSection,
    historySection,
    '# Review checklist (in priority order)',
    checklist,
    '# When done — tower_review is the only mandatory protocol step',
    targetMission?.kind === 'artifact'
      ? `1. Submit your verdict with tower_review: { target: "${target}", status: "clean" | "p1-Nitems" | "p2-Nitems", merge: "merge" | "fix-then-merge" | "hold", findings, checks, decision }. This independent review is advisory only: it cannot replace explicit human acceptance recorded by reviewer=tower on the exact branch tip. Standard review-result notifications are stored automatically — do not send a second manual tower_send.`
      : `1. Submit your verdict with tower_review: { target: "${target}", status: "clean" | "p1-Nitems" | "p2-Nitems", merge: "merge" | "fix-then-merge" | "hold", findings, checks, decision }. Only a clean review with merge verdict "merge" on the exact branch tip lets the tower merge. Standard review-result notifications are stored automatically — do not send a second manual tower_send.`,
    'Then finish with a structured summary of the review.',
    extra,
  ].join('\n')
}

async function findCompletionReport(
  store: TowerStore,
  author: string,
  subject: 'review-request' | 'acceptance-request' = 'review-request',
): Promise<TowerInboxItem | undefined> {
  return (await store.readInbox('tower', REVIEW_REQUEST_SCAN_LIMIT)).find(
    (item) => item.from === author && item.subject.startsWith(subject),
  )
}

async function workerHistorySection(
  store: TowerStore,
  mission: TowerMission,
  agentName: string,
): Promise<string> {
  const latest = await store.latestReview(mission.branch)
  const predecessor = mission.owner !== undefined && mission.owner !== agentName ? mission.owner : undefined
  const completionReport = predecessor !== undefined
    ? await findCompletionReport(store, predecessor, mission.kind === 'artifact' ? 'acceptance-request' : 'review-request')
    : undefined
  if (latest === undefined && completionReport === undefined) return ''
  const parts = [
    '# Previous work on this branch',
    mission.kind === 'artifact'
      ? 'An earlier worker already ran on this branch — continue from its work instead of starting over, and address the latest human feedback below rather than re-opening what it already settled.'
      : 'An earlier worker already ran on this branch — continue from its work instead of starting over, and address the review verdict below rather than re-opening what it already settled.',
  ]
  if (latest !== undefined) {
    parts.push(
      mission.kind === 'artifact'
        ? `## Latest feedback — round ${String(latest.round)} by ${latest.reviewer}: ${latest.status}, merge verdict "${latest.merge}"`
        : `## Latest review — round ${String(latest.round)} by ${latest.reviewer}: ${latest.status}, merge verdict "${latest.merge}"`,
      await reviewExcerpt(store, latest.file),
    )
  }
  if (completionReport !== undefined) {
    parts.push(
      mission.kind === 'artifact'
        ? "## The previous worker's acceptance-request to the tower"
        : "## The previous worker's review-request to the tower",
      truncateSection(completionReport.body.trim(), REVIEW_EXCERPT_MAX_CHARS),
    )
  }
  return `${parts.join('\n\n')}\n\n`
}

async function reviewHistorySection(store: TowerStore, target: string): Promise<string> {
  const reviews = await store.reviewsFor(target)
  if (reviews.length === 0) return ''
  const recent = reviews.slice(-REVIEW_HISTORY_ROUNDS)
  const omitted = reviews.length - recent.length
  const parts = [
    '# Review history on this branch',
    'Earlier review rounds already ran on this branch — verify their findings against the current tip instead of reporting them again; re-report only what still reproduces.',
  ]
  if (omitted > 0) {
    parts.push(`(${String(omitted)} earlier round(s) omitted — the full record lives in .tower/comms/reviews/.)`)
  }
  for (const review of recent) {
    parts.push(
      `## Round ${String(review.round)} by ${review.reviewer}: ${review.status}, merge verdict "${review.merge}"`,
      await reviewExcerpt(store, review.file),
    )
  }
  return `${parts.join('\n\n')}\n\n`
}

async function reviewExcerpt(store: TowerStore, file: string): Promise<string> {
  const { body } = parseFrontmatter(await readFile(store.abs(file), 'utf8'))
  return truncateSection(body.trim(), REVIEW_EXCERPT_MAX_CHARS)
}

function truncateSection(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…(truncated)`
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
