/**
 * dsh-kimi-tower — Kimi Code's tower mode, ported to DeepSeek Harness.
 *
 * The tower is a control-tower agent: the user enables it with `/tower on`,
 * the tower splits the objective into missions with `tower_plan`, runs each
 * worker in its own git worktree via `tower_spawn`, routes traffic through
 * `.tower/comms/`, and merges only branches that pass the review gate.
 *
 * This module owns the DSH integration: the `/tower` command, the mode prompt
 * section, tool visibility, per-agent guards, and the lifecycle listeners that
 * decorate spawned children and record their deaths.
 */

import type { Agent, Context } from './dsh'
import { TowerRuntime } from './runtime'
import { registerTowerTools } from './tools'
import { TOWER_MODE_FULL_REMINDER } from './prompts'
import { isMainAgent, storeFor } from './helpers'
import { towerSnapshot } from './status'
import type { TowerState } from './protocol/index'

export const name = 'kimi-tower'

/** Services this plugin needs at activation. */
export const inject = ['tools', 'systemPrompt', 'agents', 'subagents']

export interface Config {
  /** Advisory maximum number of tower children allowed to run at once. */
  maxWorkers?: number
  /**
   * Let the main agent of a workspace enter tower mode by itself, with the `tower_activate` tool, instead of waiting for a
   * person to type `/tower on`. Off by default: tower spawns agents, opens worktrees and merges into a base branch, so a person
   * turning it on is the safer default. A Host that runs agents in throwaway workspaces (dsh-superagent) turns it on.
   */
  agentCanEnable?: boolean
}

/** Plugin entry point. */
export function apply(ctx: Context, config: Config = {}): void {
  const runtime = new TowerRuntime(ctx, { maxWorkers: config.maxWorkers })

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: 'tower:policy',
        order: ctx.systemPrompt.getSectionOrder('PLAN_POLICY'),
        interpolate: false,
        text: ({ agent }) => (agent !== undefined && runtime.isActive(agent) ? TOWER_MODE_FULL_REMINDER : ''),
      }),
    'dsh-kimi-tower:tower-policy',
  )

  registerTowerTools(ctx, runtime, { agentCanEnable: config.agentCanEnable === true })
  registerCommand(ctx, runtime)
  registerStatusRoute(ctx)

  ctx.effect(
    () =>
      ctx.on('agent/created', async ({ agent }: { agent: Agent }) => {
        await runtime.installAgent(agent)
      }),
    'dsh-kimi-tower:agent-created',
  )

  ctx.effect(
    () =>
      ctx.on('agent/disposed', ({ agent }: { agent: Agent }) => {
        runtime.disposeAgent(agent.id)
      }),
    'dsh-kimi-tower:agent-disposed',
  )

  ctx.effect(
    () => () => runtime.disposeAll(),
    'dsh-kimi-tower:agent-registrations',
  )

  ctx.effect(
    () =>
      ctx.on('subagent/start', (info: { id?: string }) => {
        void clearDeath(ctx, runtime, info)
      }),
    'dsh-kimi-tower:subagent-start',
  )

  ctx.effect(
    () =>
      ctx.on('subagent/end', (info: { id?: string; stopReason?: string; diagnostic?: string }) => {
        void recordDeath(ctx, runtime, info)
      }),
    'dsh-kimi-tower:subagent-end',
  )

  ctx.effect(
    () =>
      ctx.on('session/event', (session: { id: string }, event: { type: string; data?: unknown }) => {
        if (event.type !== 'command/run') return
        const data = event.data as { name?: unknown; args?: unknown } | undefined
        if (data?.name !== 'plan') return
        const arg = String(data.args ?? '').trim()
        if (arg === 'off') return
        const agent = ctx.agents.get(session.id)
        if (agent === undefined || !runtime.isActive(agent)) return
        void runtime.deactivate(agent, 'mode-mutex').catch(() => undefined)
      }),
    'dsh-kimi-tower:plan-mutex',
  )

  // Decorate agents that already exist when the plugin (re)loads.
  for (const agent of ctx.agents.list()) void runtime.installAgent(agent)
}

function registerCommand(ctx: Context, runtime: TowerRuntime): void {
  ctx.inject(['commands'], (scoped: Context) => {
    scoped.commands?.register({
      definitionId: 'dsh-kimi-tower:tower',
      name: 'tower',
      description: 'Enter, leave, or inspect Kimi tower mode',
      input: { hint: '[on|off|status|stop <mission>|teardown|<base-branch>]' },
      handler: async ({ agent, rawInput }: { agent: Agent; rawInput: string }) => {
        if (!isMainAgent(agent)) {
          return { kind: 'error' as const, text: 'tower mode is only supported by the main agent' }
        }
        const input = rawInput.trim()
        const [verb = '', ...rest] = input.split(/\s+/).filter((token) => token.length > 0)
        try {
          if (verb === 'on' && rest.length > 0) {
            return {
              kind: 'error' as const,
              text: 'Usage: /tower on (no arguments). Send the objective as a normal message after activation. To choose a base branch, use /tower <branch>.',
            }
          }
          if (verb === '' || verb === 'status') {
            return { kind: 'success' as const, text: await runtime.commandStatus(agent) }
          }
          if (verb === 'off') {
            await runtime.deactivate(agent, 'user')
            return { kind: 'success' as const, text: 'Tower mode off. The .tower/ workspace, branches, and worktrees are preserved; use /tower on to resume.' }
          }
          if (verb === 'stop') {
            const missionId = rest[0]
            if (missionId === undefined) return { kind: 'error' as const, text: 'Usage: /tower stop <mission-id>' }
            return { kind: 'success' as const, text: await runtime.stopMission(agent, missionId) }
          }
          if (verb === 'teardown') {
            const store = await storeFor(agent)
            const report = await store.teardown({ liveAgentIds: runtime.liveParticipantIds() })
            return {
              kind: 'success' as const,
              text: ['tower teardown:', ...report.map((line) => `- ${line}`), '', '.tower/comms/ is kept as the audit trail.'].join('\n'),
            }
          }
          const base = verb === 'on' ? undefined : verb
          const result = await runtime.activate(agent, base)
          const lines = [
            result.created
              ? 'Tower mode on — workspace initialized.'
              : 'Tower mode on — existing workspace preserved.',
            `Base branch: ${result.base}`,
            ...(result.checkout !== result.base
              ? [`Note: the main checkout is on "${result.checkout}"; merges stay blocked until it is switched to "${result.base}".`]
              : []),
            ...(result.openMissions.length > 0
              ? [`Carried-over open missions: ${result.openMissions.join(', ')} — continue them or abandon them before planning new work.`]
              : []),
            '',
            'Send the objective as a normal message. The tower will plan missions and spawn workers.',
          ]
          return { kind: 'success' as const, text: lines.join('\n') }
        } catch (error) {
          return { kind: 'error' as const, text: error instanceof Error ? error.message : String(error) }
        }
      },
    })
  })
}

async function recordDeath(
  ctx: Context,
  runtime: TowerRuntime,
  info: { id?: string; stopReason?: string; diagnostic?: string },
): Promise<void> {
  if (typeof info.id !== 'string' || info.id.length === 0) return
  if (info.stopReason === 'completed') return
  const binding = runtime.bindingById(info.id)
  if (binding === undefined) return
  const mainId = await findOwnerSession(ctx, binding.repoRoot)
  if (mainId === undefined) return
  const main = ctx.agents.get(mainId)
  if (main === undefined) return
  try {
    const store = await storeFor(main)
    await store.markAgentDied(info.id, info.stopReason ?? 'died', info.diagnostic, main.id)
  } catch (error) {
    ctx.logger?.warn?.('dsh-kimi-tower: could not record agent death for %s: %o', info.id, error)
  }
}

async function clearDeath(
  ctx: Context,
  runtime: TowerRuntime,
  info: { id?: string },
): Promise<void> {
  if (typeof info.id !== 'string' || info.id.length === 0) return
  const binding = runtime.bindingById(info.id)
  if (binding === undefined) return
  const mainId = await findOwnerSession(ctx, binding.repoRoot)
  if (mainId === undefined) return
  const main = ctx.agents.get(mainId)
  if (main === undefined) return
  try {
    const store = await storeFor(main)
    await store.clearAgentDied(info.id, main.id)
  } catch {
    // Death marks are advisory; a failed clear must not fail the resume.
  }
}

async function findOwnerSession(ctx: Context, repoRoot: string): Promise<string | undefined> {
  for (const agent of ctx.agents.list()) {
    if (!isMainAgent(agent)) continue
    try {
      const store = await storeFor(agent)
      if (store.repoRoot !== repoRoot) continue
      const state: TowerState = await store.load()
      if (state.sessionId === agent.id) return agent.id
    } catch {
      continue
    }
  }
  return undefined
}

export { TowerRuntime, TowerProtocolError } from './runtime'
export * from './protocol/index'

/**
 * Serve the dock snapshot on the loopback Host so the browser half can poll it.
 *
 * The route is anonymous and read-only. It lives on the same Host HTTP server
 * that already serves the page; `webServer` is optional so headless profiles
 * without that service still activate the plugin.
 */
function registerStatusRoute(ctx: Context): void {
  ctx.inject(['webServer'], (scoped: Context) => {
    const server = scoped.webServer
    if (server === undefined) return
    scoped.effect(
      () =>
        server.register({
          kind: 'exact',
          path: '/tower/state',
          auth: 'required',
          handler: async (request: { url?: string }, response: {
            writeHead(status: number, headers: Record<string, string>): void
            end(body?: string): void
          }) => {
            const url = new URL(request.url ?? '/', 'http://127.0.0.1')
            try {
              const snapshot = await towerSnapshot(ctx, url.searchParams.get('sessionId') ?? '')
              response.writeHead(200, {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'no-store',
              })
              response.end(JSON.stringify(snapshot))
            } catch (error) {
              ctx.logger.warn('dsh-kimi-tower: status route failed', error)
              response.writeHead(500, {
                'content-type': 'application/json; charset=utf-8',
              })
              response.end(JSON.stringify({ active: false, running: 0, missions: [] }))
            }
          },
        }),
      'dsh-kimi-tower:status-route',
    )
  })
}

// Host-side snapshot builder, exported for tests and diagnostics.
export { towerSnapshot } from './status'
