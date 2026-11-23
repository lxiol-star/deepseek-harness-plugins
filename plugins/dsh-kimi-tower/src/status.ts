/**
 * Read-only snapshot of the tower fleet for the browser dock.
 *
 * The Host serves this over a small loopback route; the Client polls it once a
 * second while the session is open. Nothing here mutates the store, and the
 * snapshot contains only names, states, progress counts, and local paths.
 */

import { join } from 'node:path'

import type { Agent } from './dsh'
import { isMainAgent, storeFor } from './helpers'
import type { TowerMission, TowerRosterEntry, TowerState } from './protocol/index'

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

const INACTIVE: TowerSnapshot = { active: false, running: 0, missions: [] }

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

/** Build the dock snapshot from one live main agent and its repository state. */
export async function towerSnapshot(ctx: { agents: { get(id: string): Agent | undefined } }, sessionId: string): Promise<TowerSnapshot> {
  const agent = ctx.agents.get(sessionId)
  if (agent === undefined || !isMainAgent(agent)) return INACTIVE

  let state: TowerState
  let repoRoot: string
  try {
    const store = await storeFor(agent)
    repoRoot = store.repoRoot
    state = await store.load()
  } catch {
    return INACTIVE
  }
  if (state.sessionId !== sessionId) return INACTIVE

  const roster = new Map<string, TowerRosterEntry>(state.roster.agents.map((entry) => [entry.name, entry]))
  const now = Date.now()
  const missions = state.missions
    .filter((mission) => mission.status !== 'merged' && mission.status !== 'abandoned')
    .map((mission): TowerCard => {
      const owner = mission.owner === undefined ? undefined : roster.get(mission.owner)
      const worker = owner === undefined ? undefined : ctx.agents.get(owner.agentId)
      const live = owner !== undefined && owner.diedAt === undefined
        && worker !== undefined && worker.status === 'running'
      const selection = worker?.model?.current?.()
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
    })
  return {
    active: true,
    sessionId,
    base: state.base,
    running: missions.filter((mission) => mission.state === 'running').length,
    missions,
  }
}
