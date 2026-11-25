/**
 * Read-only snapshot of the tower fleet for the browser dock.
 *
 * The Host serves this over a small loopback route; the Client polls it once a
 * second while the session is open. Nothing here mutates the store, and the
 * snapshot contains only names, states, progress counts, and local paths.
 *
 * The canvas view (`canvas-snapshot.ts`) builds on the same session lookup and
 * card projection, so its mission entries are a strict superset of these.
 */

import { join } from 'node:path'

import type { Agent } from './dsh'
import { isMainAgent, storeFor } from './helpers'
import type { TowerMission, TowerRosterEntry, TowerState, TowerStore } from './protocol/index'

export type TowerCardState = 'running' | 'waiting' | 'stale' | 'blocked' | 'paused' | 'done'

export interface TowerCard {
  readonly id: string
  readonly title: string
  readonly kind: TowerMission['kind']
  readonly status: TowerMission['status']
  readonly state: TowerCardState
  readonly owner?: string
  readonly agentId?: string
  readonly model?: string
  readonly effort?: string
  readonly branch: string
  readonly worktreePath: string
  readonly tasksDone: number
  readonly tasksTotal: number
  readonly startedAt?: string
  readonly elapsedMs: number
  readonly live: boolean
}

export interface TowerSnapshot {
  readonly active: boolean
  readonly sessionId?: string
  readonly base?: string
  readonly running: number
  readonly missions: readonly TowerCard[]
}

/** The dock snapshot of a session that owns no tower. */
export const INACTIVE_SNAPSHOT: TowerSnapshot = { active: false, running: 0, missions: [] }

/** The Host surface a snapshot reads: live agents by session id. */
export interface SnapshotContext {
  readonly agents: { get(id: string): Agent | undefined }
  /** Where a failed model lookup is reported; absent in tests that do not care. */
  readonly logger?: { warn?(...args: unknown[]): void } | null
}

/** A tower state bound to one session, ready to be projected without writing. */
export interface SnapshotSource {
  readonly store: TowerStore
  readonly repoRoot: string
  readonly state: TowerState
}

/** Roster entries indexed by agent name. */
export type RosterIndex = ReadonlyMap<string, TowerRosterEntry>

/** Map a mission plus its worker's liveness onto the card language. */
export function cardState(mission: TowerMission, live: boolean): TowerCardState {
  switch (mission.status) {
    case 'planned': return 'waiting'
    case 'active': return live ? 'running' : 'stale'
    case 'blocked': return 'blocked'
    case 'paused': return 'paused'
    case 'completed': return 'done'
    default: return 'done'
  }
}

/** Whether a roster entry still has a running agent behind it. */
export function isAgentLive(ctx: SnapshotContext, entry: TowerRosterEntry): boolean {
  if (entry.diedAt !== undefined) return false
  return ctx.agents.get(entry.agentId)?.status === 'running'
}

/** The model selection a Host agent reports right now. */
export interface ModelSelection {
  readonly model?: string
  readonly reasoningEffort?: string
}

/**
 * The last failure reported for an agent, by agent id.
 *
 * The dock polls once a second and the canvas every few, and one canvas
 * snapshot looks the same agent up twice, so a broken model would otherwise
 * write the same line on every request. A failure is reported again only when
 * its message differs from the last one reported for that agent.
 *
 * De-duplication is keyed on the *call*: once `warn` has been invoked for a
 * message, that message counts as reported, whether or not the Host's log
 * level lets the line through. The level is `warn` because the Host filters
 * `debug` by default, and a failure that is de-duplicated before it is
 * filtered would then never be visible at all. The entry is dropped as soon
 * as a lookup for that agent ends without throwing, so "fails, recovers,
 * fails again the same way" reports twice.
 */
const reportedModelFailures = new Map<string, string>()

/**
 * The model selection a Host agent reports, or undefined when it reports none.
 *
 * The selection is a nicety on a card, so nothing about it may take the whole
 * snapshot down: the agent may be gone, carry no `model`, carry a `current`
 * that is missing or not a function, or `current()` may itself fail. Each of
 * those costs this one agent its model name and nothing else.
 *
 * `current` is called as a method of its `model`. The real Host model is a
 * class whose `current` reads `this`; detaching the method and calling it bare
 * throws, and that is how every model name once vanished from the dock.
 */
export function modelSelection(ctx: SnapshotContext, agentId: string): ModelSelection | undefined {
  const model = ctx.agents.get(agentId)?.model
  const current = model?.current
  if (typeof current !== 'function') {
    forgetModelFailure(agentId)
    return undefined
  }
  try {
    const selection = current.call(model) ?? undefined
    forgetModelFailure(agentId)
    return selection
  } catch (error) {
    reportModelFailure(ctx, agentId, error)
    return undefined
  }
}

/** A lookup that did not throw ends the current failure for that agent. */
function forgetModelFailure(agentId: string): void {
  reportedModelFailures.delete(agentId)
}

/**
 * Report a failed model lookup, once per agent and message, at warn level.
 *
 * Reporting must never be the thing that fails the snapshot, so every shape
 * the Host might hand over is tolerated: no logger, a null logger, a `warn`
 * that is missing or not a function, or one that throws.
 */
function reportModelFailure(ctx: SnapshotContext, agentId: string, error: unknown): void {
  const logger = ctx.logger
  if (logger == null) return
  const message = error instanceof Error ? error.message : String(error)
  if (reportedModelFailures.get(agentId) === message) return
  reportedModelFailures.set(agentId, message)
  const warn = logger.warn
  if (typeof warn !== 'function') return
  try {
    warn.call(logger, 'dsh-kimi-tower: model selection unavailable', agentId, message)
  } catch {
    // A closed sink is not worth a second report.
  }
}

/** Project one mission onto the card shared by the dock and the canvas. */
export function towerCard(
  mission: TowerMission,
  roster: RosterIndex,
  ctx: SnapshotContext,
  repoRoot: string,
  now: number,
): TowerCard {
  const owner = mission.owner === undefined ? undefined : roster.get(mission.owner)
  const live = owner !== undefined && isAgentLive(ctx, owner)
  const selection = owner === undefined ? undefined : modelSelection(ctx, owner.agentId)
  const startedAt = owner?.spawnedAt
  const started = startedAt === undefined ? undefined : Date.parse(startedAt)
  const elapsedMs = started === undefined || Number.isNaN(started) ? 0 : Math.max(0, now - started)
  return {
    id: mission.id,
    title: mission.title,
    kind: mission.kind,
    status: mission.status,
    state: cardState(mission, live),
    owner: mission.owner,
    agentId: owner?.agentId,
    model: selection?.model,
    effort: selection?.reasoningEffort,
    branch: mission.branch,
    worktreePath: join(repoRoot, '.tower', 'worktrees', mission.worktree),
    tasksDone: mission.tasks.filter((task) => task.done || task.dropped === true).length,
    tasksTotal: mission.tasks.length,
    startedAt,
    elapsedMs,
    live,
  }
}

/**
 * Load the tower state bound to `sessionId`, or undefined when the session has
 * no live main agent, no readable tower, or the tower belongs to another
 * session. Only reads: no lock is taken and no file is written.
 */
export async function snapshotSource(
  ctx: SnapshotContext,
  sessionId: string,
): Promise<SnapshotSource | undefined> {
  const agent = ctx.agents.get(sessionId)
  if (agent === undefined || !isMainAgent(agent)) return undefined

  let store: TowerStore
  let state: TowerState
  try {
    store = await storeFor(agent)
    state = await store.load()
  } catch {
    return undefined
  }
  if (state.sessionId !== sessionId) return undefined

  return { store, repoRoot: store.repoRoot, state }
}

/** Index a roster by agent name. */
export function rosterIndex(state: TowerState): RosterIndex {
  return new Map(state.roster.agents.map((entry) => [entry.name, entry]))
}

/** Build the dock snapshot from one live main agent and its repository state. */
export async function towerSnapshot(ctx: SnapshotContext, sessionId: string): Promise<TowerSnapshot> {
  const source = await snapshotSource(ctx, sessionId)
  if (source === undefined) return INACTIVE_SNAPSHOT

  const roster = rosterIndex(source.state)
  const now = Date.now()
  const missions = source.state.missions
    .filter((mission) => mission.status !== 'merged' && mission.status !== 'abandoned')
    .map((mission) => towerCard(mission, roster, ctx, source.repoRoot, now))
  return {
    active: true,
    sessionId,
    base: source.state.base,
    running: missions.filter((mission) => mission.state === 'running').length,
    missions,
  }
}
