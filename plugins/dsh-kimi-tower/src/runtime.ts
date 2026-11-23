import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { Agent, Context } from './dsh'
import {
  TOWER_DENIED_MAIN_TOOLS,
  REVIEWER_TOOL_ALLOW,
  WORKER_TOOL_ALLOW,
  agentCwd,
  canonicalPath,
  isMainAgent,
  storeFor,
  userText,
} from './helpers'
import { TOWER_MODE_EXIT_REMINDER } from './prompts'
import {
  TowerProtocolError,
  TowerStore,
  type TowerState,
} from './protocol/index'

/** How one spawned tower child is bound to the protocol. */
export interface ChildBinding {
  readonly name: string
  readonly kind: 'worker' | 'reviewer'
  readonly missionId?: string
  readonly reviewTarget?: string
  readonly worktree?: string
  readonly branch?: string
  readonly worktreeAbs?: string
  readonly repoRoot: string
}

export interface TowerRuntimeConfig {
  /** Maximum tower children allowed to run at once (advisory budget in the status dashboard). */
  readonly maxWorkers?: number
}

const TOWER_STATE_FILE = '.tower/comms/state.json'

/**
 * Tower-mode state for every live session plus the per-agent registrations the
 * mode owns (prompt sections, tool restrictions, guards).
 *
 * Mode itself is folded from the session log (`command/run` + `command/done`
 * for `/tower`), so resume and fork recover it without a plugin-private event.
 */
export class TowerRuntime {
  readonly ctx: Context
  readonly config: TowerRuntimeConfig
  private readonly active = new Map<string, boolean>()
  private readonly mainSessions = new Set<string>()
  private readonly children = new Map<string, ChildBinding>()
  private decorated = new WeakSet<Agent>()
  private readonly disposers = new Map<string, (() => void)[]>()
  private readonly stopping = new Set<string>()

  constructor(ctx: Context, config: TowerRuntimeConfig = {}) {
    this.ctx = ctx
    this.config = config
  }

  /* ---------------------------------------------------------------- state */

  /** Fold tower mode from the session log; idempotent per main session. */
  hydrate(agent: Agent): void {
    if (!isMainAgent(agent)) return
    if (this.mainSessions.has(agent.id)) return
    this.mainSessions.add(agent.id)
    let active = false
    const running = new Map<string, string[]>()
    const events = typeof agent.session.snapshotEvents === 'function' ? agent.session.snapshotEvents() : []
    for (const event of events) {
      const data = event.data as { commandId?: unknown; name?: unknown; args?: unknown; kind?: unknown } | undefined
      if (event.type === 'command/run' && data?.name === 'tower' && typeof data.commandId === 'string') {
        running.set(data.commandId, String(data.args ?? '').trim().split(/\s+/).filter((token) => token.length > 0))
      } else if (event.type === 'command/done' && typeof data?.commandId === 'string') {
        const tokens = running.get(data.commandId)
        if (tokens === undefined) continue
        running.delete(data.commandId)
        if (data.kind !== 'success') continue
        const verb = tokens[0] ?? ''
        if (verb === 'on' || (verb !== '' && !['off', 'status', 'teardown', 'stop'].includes(verb))) active = true
        else if (verb === 'off') active = false
      }
    }
    this.active.set(agent.id, active)
  }

  /** Whether tower mode is active for this agent (main agent only). */
  isActive(agent: Agent | undefined): boolean {
    if (agent === undefined || !isMainAgent(agent)) return false
    if (!this.mainSessions.has(agent.id)) this.hydrate(agent)
    return this.active.get(agent.id) === true
  }

  /** Whether this agent is a tower child (worker or reviewer). */
  childOf(agent: Agent | undefined): ChildBinding | undefined {
    if (agent === undefined) return undefined
    return this.children.get(agent.id)
  }

  /** Binding lookup by session id, for lifecycle events that carry only an id. */
  bindingById(sessionId: string): ChildBinding | undefined {
    return this.children.get(sessionId)
  }

  /** Register the binding before the child is published so its first step already sees tower tools. */
  bindChild(sessionId: string, binding: ChildBinding): void {
    this.children.set(sessionId, binding)
  }

  /** Remove a binding whose spawn failed. */
  unbindChild(sessionId: string): void {
    this.children.delete(sessionId)
  }

  /** Resolve a tower child's binding from the workspace roster (resume path). */
  async resolveChild(agent: Agent): Promise<ChildBinding | undefined> {
    const existing = this.children.get(agent.id)
    if (existing !== undefined) return existing
    if (isMainAgent(agent)) return undefined
    try {
      const store = await storeFor(agent)
      const state = await store.load()
      const entry = store.resolveAgent(state, agent.id)
      if (entry === undefined) return undefined
      const mission = entry.missionId === undefined
        ? undefined
        : state.missions.find((candidate) => candidate.id === entry.missionId)
      const binding: ChildBinding = {
        name: entry.name,
        kind: entry.kind,
        missionId: entry.missionId,
        reviewTarget: entry.reviewTarget,
        worktree: entry.worktree ?? mission?.worktree,
        branch: entry.branch ?? mission?.branch,
        repoRoot: store.repoRoot,
        worktreeAbs:
          (entry.worktree ?? mission?.worktree) === undefined
            ? undefined
            : store.abs(`.tower/worktrees/${String(entry.worktree ?? mission?.worktree)}`),
      }
      this.children.set(agent.id, binding)
      return binding
    } catch {
      return undefined
    }
  }

  /* --------------------------------------------------------------- access */

  async store(agent: Agent): Promise<TowerStore> {
    return storeFor(agent)
  }

  assertMain(agent: Agent | undefined): Agent {
    if (agent === undefined || !isMainAgent(agent)) {
      throw new Error('Tower orchestration tools are only supported by the main agent.')
    }
    return agent
  }

  assertActive(agent: Agent | undefined): Agent {
    const main = this.assertMain(agent)
    if (!this.isActive(main)) {
      throw new Error(
        'tower mode is not active — only the user can enable it (with /tower on), never the agent. '
        + 'Ask the user to turn tower mode on, then drive the tower protocol.',
      )
    }
    return main
  }

  /** Tool visibility for the model: main tools need the mode, protocol tools need a tower child. */
  toolVisible(agent: Agent, tool: string): boolean {
    if (isMainAgent(agent)) {
      if (!this.isActive(agent)) return false
      return tool !== 'tower_complete'
    }
    const binding = this.children.get(agent.id)
    if (binding === undefined) return false
    if (binding.kind === 'reviewer' && tool === 'tower_complete') return false
    return true
  }

  /* ----------------------------------------------------------- activation */

  async activate(agent: Agent, base?: string): Promise<{ base: string; created: boolean; retiredAgents: readonly string[]; checkout: string; openMissions: readonly string[] }> {
    const main = this.assertMain(agent)
    const store = await this.store(main)
    const prior = await store.load().catch(() => undefined)
    const owner = prior?.sessionId
    if (owner !== undefined && owner !== main.id) {
      const ownerAgent = this.ctx.agents.get(owner)
      if (ownerAgent !== undefined && ownerAgent.status === 'running') {
        throw new Error(
          `another live session owns the workspace tower (session ${owner}) — close tower there first, or wait until it is idle`,
        )
      }
    }
    const planMode = this.ctx.get('planMode') as { set?: (agent: Agent, active: boolean) => unknown } | undefined
    if (planMode !== undefined && typeof planMode.set === 'function') {
      try {
        planMode.set(main, false)
      } catch {
        // Plan mode may be mid-transition; tower still wins for this session.
      }
    }
    const goal = this.ctx.get('goal') as {
      get?: (agent: Agent) => { id: string; revision: number; phase: string } | undefined
      pause?: (agent: Agent, ref: { id: string; revision: number }) => unknown
    } | undefined
    if (goal !== undefined && typeof goal.get === 'function' && typeof goal.pause === 'function') {
      try {
        const current = goal.get(main)
        if (current !== undefined && current.phase === 'active') {
          goal.pause(main, { id: current.id, revision: current.revision })
        }
      } catch {
        // A goal that cannot be paused must not block tower entry; the guard
        // still refuses resuming it while the mode is active.
      }
    }
    const result = await store.init(main.id, base)
    this.active.set(main.id, true)
    this.mainSessions.add(main.id)
    return result
  }

  async deactivate(agent: Agent, reason: 'user' | 'mode-mutex' = 'user'): Promise<void> {
    const main = this.assertMain(agent)
    this.active.set(main.id, false)
    try {
      const store = await this.store(main)
      await store.release(main.id)
    } catch {
      // Releasing ownership is best-effort; the on-disk workspace stays usable.
    }
    if (reason === 'user') {
      try {
        main.inject(userText(TOWER_MODE_EXIT_REMINDER))
      } catch {
        // Injecting the exit notice must not make /tower off fail.
      }
    }
  }

  /* ---------------------------------------------------------- decoration */

  /** Install every per-agent registration tower mode owns. Safe to call repeatedly. */
  async installAgent(agent: Agent): Promise<void> {
    if (this.decorated.has(agent)) return
    this.decorated.add(agent)
    const collected: (() => void)[] = []
    try {
      if (isMainAgent(agent)) {
        this.hydrate(agent)
        collected.push(this.installMainGuard(agent))
        collected.push(this.installBashGuard(agent))
      } else {
        const binding = await this.resolveChild(agent)
        if (binding !== undefined) collected.push(...this.installChild(agent, binding))
      }
    } catch (error) {
      this.ctx.logger?.warn?.('dsh-kimi-tower: failed to decorate agent %s: %o', agent.id, error)
    }
    this.disposers.set(agent.id, collected)
  }

  /** Unwind every registration this plugin added to one agent. */
  disposeAgent(agentId: string): void {
    const list = this.disposers.get(agentId)
    if (list === undefined) return
    this.disposers.delete(agentId)
    for (const dispose of list.reverse()) {
      try {
        dispose()
      } catch {
        // A registration the agent already disposed must not break unload.
      }
    }
  }

  /** Unwind agent-scoped registrations when the plugin unloads or reloads. */
  disposeAll(): void {
    for (const agentId of [...this.disposers.keys()]) this.disposeAgent(agentId)
    this.decorated = new WeakSet<Agent>()
  }

  private installMainGuard(agent: Agent): () => void {
    return agent.ctx.tools.guard((execution: { name: string; arguments: unknown }) => {
      if (!this.isActive(agent)) return undefined
      const denial = TOWER_DENIED_MAIN_TOOLS[execution.name]
      if (denial !== undefined) return denial
      if (execution.name === 'update_goal') {
        const args = execution.arguments as { status?: unknown } | undefined
        if (args?.status === 'active') {
          return 'Resuming a goal is not available while tower mode is active — tower mode and goals are mutually exclusive. '
            + 'If the work genuinely needs the goal instead, exit tower mode first.'
        }
      }
      return undefined
    })
  }

  private installChild(agent: Agent, binding: ChildBinding): (() => void)[] {
    const disposers: (() => void)[] = []
    const overlay = [
      `You are "${binding.name}", a tower ${binding.kind} agent in a multi-agent workspace.`,
      binding.kind === 'worker'
        ? `Your mission is ${binding.missionId ?? '(unknown)'} on branch ${binding.branch ?? '(unknown)'}; your worktree is ${binding.worktreeAbs ?? '(unknown)'}.`
        : `You are reviewing branch ${binding.reviewTarget ?? '(unknown)'} read-only.`,
      '',
      WORKER_OVERLAY_TEXT,
    ].join('\n')
    disposers.push(agent.ctx.systemPrompt.section({
      name: 'tower:worker',
      order: 501,
      text: overlay,
    }))
    disposers.push(this.restrictTools(agent, binding.kind === 'worker' ? WORKER_TOOL_ALLOW : REVIEWER_TOOL_ALLOW))
    if (binding.kind === 'worker' && binding.worktreeAbs !== undefined) {
      disposers.push(this.installWriteGuard(agent, binding.worktreeAbs))
    }
    disposers.push(this.installBashGuard(agent))
    return disposers
  }

  /**
   * Restrict a child to its allowlist. DSH refuses unknown or scope-local
   * names, so learn the restrictable set from the refusal and retry once.
   */
  private restrictTools(agent: Agent, allow: readonly string[]): () => void {
    const names = new Set(allow)
    try {
      return agent.ctx.tools.restrict({ allow: [...names] })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const known = /known global tools: (.*)$/s.exec(message)?.[1]
      if (known === undefined) {
        this.ctx.logger?.warn?.('dsh-kimi-tower: tool restriction failed for %s: %s', agent.id, message)
        return () => undefined
      }
      const restrictable = new Set(known.split(',').map((name) => name.trim()).filter((name) => name.length > 0))
      const filtered = [...names].filter((name) => restrictable.has(name))
      try {
        return agent.ctx.tools.restrict({ allow: filtered })
      } catch (retryError) {
        this.ctx.logger?.warn?.(
          'dsh-kimi-tower: tool restriction failed for %s: %s',
          agent.id,
          retryError instanceof Error ? retryError.message : String(retryError),
        )
        return () => undefined
      }
    }
  }

  private installWriteGuard(agent: Agent, worktree: string): () => void {
    return agent.ctx.tools.guard((execution: { name: string; arguments: unknown }) => {
      if (execution.name !== 'write' && execution.name !== 'edit') return undefined
      const args = execution.arguments as { file_path?: unknown } | undefined
      const path = args?.file_path
      if (typeof path !== 'string' || path.length === 0) return undefined
      const absolute = isAbsolute(path) ? resolve(path) : resolve(agentCwd(agent), path)
      if (isWithin(absolute, worktree)) return undefined
      return `tower workers may only write inside their own worktree (${worktree}) — denied: ${absolute}. `
        + 'Out-of-scope changes are not yours to make: file them with tower_finding or ask the tower via tower_send.'
    })
  }

  private installBashGuard(agent: Agent): () => void {
    return agent.ctx.tools.guard((execution: { name: string; arguments: unknown }) => {
      if (execution.name !== 'bash') return undefined
      const args = execution.arguments as { command?: unknown; cwd?: unknown } | undefined
      const command = args?.command
      if (typeof command !== 'string' || command.length === 0) return undefined
      const repoRoot = agentCwd(agent)
      if (isMainAgent(agent) && !this.isActive(agent) && !towerWorkspaceOwned(repoRoot)) return undefined
      const cwd = typeof args?.cwd === 'string' ? resolve(repoRoot, args.cwd) : repoRoot
      return analyzeBashGuard(command, cwd, repoRoot)
    })
  }

  /* -------------------------------------------------------------- helpers */

  /** Main agent id owning the workspace, when a store is reachable. */
  async ownerSessionId(agent: Agent): Promise<string | undefined> {
    try {
      const store = await this.store(agent)
      const state = await store.load()
      return state.sessionId
    } catch {
      return undefined
    }
  }

  /** Live tower children as seen by the runtime (used by gates and teardown). */
  liveChildIds(): Set<string> {
    const live = new Set<string>()
    for (const [id, binding] of this.children) {
      const agent = this.ctx.agents.get(id)
      if (agent === undefined) continue
      if (agent.status === 'running' || binding.kind === 'worker' || binding.kind === 'reviewer') live.add(id)
    }
    return live
  }

  /** Agent ids currently running in this process. */
  runningAgentIds(): Set<string> {
    const running = new Set<string>()
    for (const agent of this.ctx.agents.list()) {
      if (agent.status === 'running') running.add(agent.id)
    }
    return running
  }

  /** All tower participant agent ids currently live. */
  liveParticipantIds(): Set<string> {
    const live = new Set<string>()
    for (const [id] of this.children) {
      if (this.ctx.agents.get(id) !== undefined) live.add(id)
    }
    return live
  }

  /** Load state, mapping protocol errors to plain errors for tool results. */
  async state(agent: Agent): Promise<TowerState> {
    const store = await this.store(agent)
    return store.load()
  }

  /** Interrupt one live tower worker on behalf of its main agent. */
  async stopMission(agent: Agent, missionId: string): Promise<string> {
    if (!/^M[0-9]+$/.test(missionId)) throw new Error(`invalid mission id: ${missionId}`)
    const key = `${agent.id}:${missionId}`
    if (this.stopping.has(key)) throw new Error(`mission ${missionId} is already being stopped`)
    this.stopping.add(key)
    try {
      const store = await this.store(agent)
      const state = await store.load()
      if (state.sessionId !== agent.id) throw new Error('this session is not the tower')
      const mission = state.missions.find((candidate) => candidate.id === missionId)
      if (mission === undefined) throw new Error(`mission ${missionId} does not exist`)
      if (mission.status === 'paused') return `Mission ${missionId} is already paused.`
      if (mission.status !== 'active' && mission.status !== 'blocked') {
        throw new Error(`mission ${missionId} is ${mission.status}; only a running worker can be stopped`)
      }
      const owner = state.roster.agents.find((candidate) => candidate.name === mission.owner)
      if (owner === undefined) throw new Error(`mission ${missionId} has no worker`)
      const worker = this.ctx.agents.get(owner.agentId)
      if (worker === undefined || worker.status !== 'running') throw new Error(`${owner.name} is not running`)
      if (this.ctx.subagents?.interrupt === undefined) throw new Error('subagent interruption is unavailable')
      this.ctx.subagents.interrupt(owner.agentId, { kind: 'ancestor', agent })
      await store.pauseMissionForStop(missionId, agent.id)
      return `Stop requested for ${owner.name} on ${mission.id}.`
    } finally {
      this.stopping.delete(key)
    }
  }

  async commandStatus(agent: Agent): Promise<string> {
    const store = await this.store(agent)
    if (!(await store.isInitialized())) {
      if (await store.isStateLost()) {
        return 'Tower mode: ON\nTower state was lost: .tower/comms/state.json is missing but .tower/ still exists — '
          + 'all recorded mission, roster, and review history is gone. Report this loss to the user.'
      }
      return `Tower mode: ${this.isActive(agent) ? 'ON' : 'OFF'}\nTower is not initialized in this repository — run /tower on.`
    }
    const state = await store.load()
    const missions = state.missions
    const lines = [
      `Tower mode: ${this.isActive(agent) ? 'ON' : 'OFF'}`,
      `Base: ${state.base} (mode: ${state.mode})`,
      ...(state.recoveredAt === undefined
        ? []
        : [`⚠️ State recovered at ${state.recoveredAt} after a loss — history before that point is gone.`]),
      'Missions:',
      ...(missions.length === 0
        ? ['  (none)']
        : missions.map(
            (mission) =>
              `  ${mission.id} ${mission.title} — ${mission.status} · owner ${mission.owner ?? '—'} · ${mission.branch} · kind ${mission.kind}`,
          )),
      'Roster:',
      ...(state.roster.agents.length === 0
        ? ['  (none)']
        : state.roster.agents.map((entry) => {
            const assignment = entry.kind === 'worker'
              ? `mission ${entry.missionId ?? '?'}`
              : `reviewing ${entry.reviewTarget ?? '?'}`
            const death = entry.diedAt === undefined ? '' : ` · died ${entry.deathStatus ?? 'unknown'}`
            return `  ${entry.name} (${entry.kind}) — ${assignment} · ${entry.agentId}${death}`
          })),
      `Concurrency: budget ${String(this.config.maxWorkers ?? 'unlimited')} agent(s) · running ${String(this.runningAgentIds().size)}`,
    ]
    return lines.join('\n')
  }
}

const WORKER_OVERLAY_TEXT = `All collaboration protocol traffic (inbox messages, findings, reviews, mission updates) goes through the Tower* tools ONLY — never create, edit, or delete protocol artifacts under \`.tower/comms/\` by hand; hand-written protocol files break the merge gate. Your briefing names your mission (worker) or review target (reviewer) — stay inside it.

Stay responsive while you work. Inbox messages sent to you while you are running are steered into your current turn as injected user messages — when one arrives, read tower_inbox and act on it at the next step boundary instead of deferring it. Long-running bash commands (installs, builds, full test suites — anything expected to take more than a minute) must run with \`run_in_background=true\`; rely on their completion notifications or natural progress boundaries instead of polling, so you remain responsive to steered messages.`

/** Whether the checkout already owns a tower workspace (state has a session id). */
export function towerWorkspaceOwned(repoRoot: string): boolean {
  try {
    const state = JSON.parse(readFileSync(join(repoRoot, TOWER_STATE_FILE), 'utf8')) as { sessionId?: unknown }
    return typeof state.sessionId === 'string' && state.sessionId.length > 0
  } catch {
    return false
  }
}

/** Whether `candidate` is inside `base` (or equal to it). */
export function isWithin(candidate: string, base: string): boolean {
  const rel = relative(canonicalPath(base), canonicalPath(candidate))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

const DYNAMIC = /[$`*?[\]{}]/

/**
 * The subset of Kimi Code's bash guard that protects tower protocol state:
 * `git clean -fdx` over comms, `git reset --hard` in the main checkout, and
 * `rm -r` of `.tower/` or `.tower/comms/`.
 */
export function analyzeBashGuard(command: string, cwd: string, repoRoot: string): string | undefined {
  if (!/\b(?:git|rm)\b/.test(command)) return undefined
  if (DYNAMIC.test(command)) return undefined
  const comms = resolve(repoRoot, '.tower/comms')
  const towerRoot = resolve(repoRoot, '.tower')
  const worktrees = resolve(repoRoot, '.tower/worktrees')
  if (/\bgit\b/.test(command) && /\breset\b/.test(command) && /--hard\b/.test(command)) {
    if (isWithin(cwd, repoRoot) && !isWithin(cwd, worktrees)) {
      return 'git reset --hard is refused in the tower checkout — it would discard uncommitted work the merge gate still needs. '
        + 'Commit or stash your changes instead; the tower never resets the base checkout for you.'
    }
  }
  if (/\brm\b/.test(command) && /(?:^|\s)-[a-zA-Z]*[rR]/.test(command)) {
    for (const operand of command.split(/\s+/).slice(1)) {
      if (operand.startsWith('-')) continue
      const absolute = resolve(cwd, operand)
      if (isWithin(absolute, comms)) {
        return `refusing to remove ${operand}: .tower/comms/ is the tower audit trail — status, notifications, and the merge gate depend on it.`
      }
      if (absolute === towerRoot || (isWithin(absolute, towerRoot) && !isWithin(absolute, worktrees))) {
        return `refusing to remove ${operand}: it holds tower protocol state — use /tower teardown to remove worktrees safely.`
      }
    }
  }
  if (/\bgit\b/.test(command) && /\bclean\b/.test(command)) {
    const force = /(?:^|\s)-[a-zA-Z]*f/.test(command) || /--force\b/.test(command)
    const dryRun = /(?:^|\s)-[a-zA-Z]*n/.test(command) || /--dry-run\b/.test(command)
    const interactive = /(?:^|\s)-[a-zA-Z]*i/.test(command) || /--interactive\b/.test(command)
    const ignored = /(?:^|\s)-[a-zA-Z]*[xX]/.test(command)
    if (force && ignored && !dryRun && !interactive) {
      const targets = command.split(/\s+/).slice(1).filter((token) => !token.startsWith('-'))
      const target = targets.length === 0 ? cwd : resolve(cwd, targets[0]!)
      if (isWithin(target, comms) || isWithin(cwd, comms)) {
        return 'git clean -fdx is refused over .tower/comms/ — it would delete the tower audit trail and merge-gate records.'
      }
    }
  }
  return undefined
}

export { TOWER_STATE_FILE, TowerProtocolError }
