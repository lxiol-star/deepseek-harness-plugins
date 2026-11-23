import type { Agent, Context, TextBlock } from './dsh'
import type { TowerRuntime } from './runtime'
import { userText } from './helpers'
import type { TowerInboxItem, TowerSendResult, TowerState } from './protocol/index'

/** Outcome of trying to push one stored message to its recipients. */
export interface DeliveryReport {
  readonly steered: string[]
  readonly queued: string[]
  readonly failed: string[]
}

/** One-line wake text; the body itself stays in the inbox file. */
export function wakeText(item: TowerInboxItem, digest: readonly string[] = []): string {
  return [
    `Tower inbox: ${item.from} → ${item.to}: "${item.subject}"`,
    `messageId=${item.messageId}${item.scope === undefined ? '' : ` scope=${item.scope}`}`,
    `file=${item.file}`,
    ...(digest.length === 0 ? [] : ['', 'Gate digest:', ...digest]),
    '',
    'Read and route it with tower_inbox; this wake does not acknowledge it.',
  ].join('\n')
}

/**
 * Push a stored inbox message to its live recipients.
 *
 * Tower and broadcast targets wake the main agent (steer while it runs,
 * followup while it idles). Roster targets are reached through the subagent
 * service so a running child sees the directive at its next step boundary;
 * a child without a live activation falls back to its Agent handle.
 */
export async function deliverTowerMessage(
  ctx: Context,
  runtime: TowerRuntime,
  state: TowerState,
  sender: Agent | undefined,
  sent: TowerSendResult,
  signal: AbortSignal,
  store?: { missionGate(state: TowerState, mission: any, options: { activeAgentIds: ReadonlySet<string> }): Promise<{ ready: boolean; blocks: readonly { reason: string }[] }> },
): Promise<DeliveryReport> {
  const steered: string[] = []
  const queued: string[] = []
  const failed: string[] = []
  const item = sent.item
  const targets = new Set<string>()
  const mainId = state.sessionId
  if (item.to === 'tower') {
    if (mainId !== undefined) targets.add(mainId)
  } else if (item.to === 'all') {
    if (mainId !== undefined) targets.add(mainId)
    for (const entry of state.roster.agents) targets.add(entry.agentId)
  } else {
    const entry = state.roster.agents.find((candidate) => candidate.name === item.to)
    if (entry !== undefined) targets.add(entry.agentId)
  }
  if (targets.size === 0) return { steered, queued, failed: [`no live recipient for "${item.to}"`] }

  const main = mainId === undefined ? undefined : ctx.agents.get(mainId)
  const digest = item.to === 'tower' || item.to === 'all'
    ? await gateDigest(runtime, state, item, store)
    : []
  const content: TextBlock[] = [{ type: 'text', text: wakeText(item, digest) }]

  for (const targetId of targets) {
    if (sender !== undefined && targetId === sender.id) continue
    const target = ctx.agents.get(targetId)
    if (targetId === mainId) {
      if (main === undefined) {
        queued.push(`${item.to} (tower session is not live)`)
        continue
      }
      try {
        wakeAgent(main, content)
        if (main.status === 'running') steered.push('tower')
        else queued.push('tower')
      } catch (error) {
        failed.push(`tower: ${messageOf(error)}`)
      }
      continue
    }
    if (ctx.subagents !== undefined && main !== undefined) {
      try {
        await ctx.subagents.sendMessage(main, targetId, content, { signal })
        steered.push(item.to)
        continue
      } catch (error) {
        if (target === undefined) {
          failed.push(`${item.to}: ${messageOf(error)}`)
          continue
        }
      }
    }
    if (target !== undefined) {
      try {
        wakeAgent(target, content)
        if (target.status === 'running') steered.push(item.to)
        else queued.push(item.to)
      } catch (error) {
        failed.push(`${item.to}: ${messageOf(error)}`)
      }
      continue
    }
    failed.push(`${item.to}: not live`)
  }
  return { steered, queued, failed }
}

/** Compact gate digest for the missions a tower wake refers to. */
async function gateDigest(
  runtime: TowerRuntime,
  state: TowerState,
  item: TowerInboxItem,
  store?: { missionGate(state: TowerState, mission: any, options: { activeAgentIds: ReadonlySet<string> }): Promise<{ ready: boolean; blocks: readonly { reason: string }[] }> },
): Promise<string[]> {
  if (store === undefined) return []
  const ids = new Set<string>()
  if (item.scope !== undefined && /^M\d+$/.test(item.scope.trim())) ids.add(item.scope.trim())
  for (const mission of state.missions) {
    if ((mission.status === 'completed' || mission.status === 'blocked') && item.subject.includes(mission.id)) ids.add(mission.id)
  }
  if (ids.size === 0) return []
  const activeAgentIds = runtime.runningAgentIds()
  const lines: string[] = []
  for (const id of [...ids].slice(0, 4)) {
    const mission = state.missions.find((candidate) => candidate.id === id)
    if (mission === undefined) {
      lines.push(`- ${id}: gate=mission-missing`)
      continue
    }
    if (mission.status === 'merged' || mission.status === 'abandoned') {
      lines.push(`- ${id}: gate=${mission.status}`)
      continue
    }
    try {
      const gate = await store.missionGate(state, mission, { activeAgentIds })
      lines.push(gate.ready
        ? `- ${id}: gate=READY reasons=none`
        : `- ${id}: gate=BLOCKED reasons=${gate.blocks.map((block) => block.reason).join(',')}`)
    } catch {
      lines.push(`- ${id}: gate=unavailable`)
    }
  }
  return lines
}

/** Deliver one message and render a compact human/model-readable receipt. */
export async function deliverAndReport(
  ctx: Context,
  runtime: TowerRuntime,
  state: TowerState,
  sender: Agent | undefined,
  sent: TowerSendResult,
  signal: AbortSignal,
  store?: Parameters<typeof deliverTowerMessage>[6],
): Promise<string> {
  const report = await deliverTowerMessage(ctx, runtime, state, sender, sent, signal, store)
  const parts: string[] = []
  if (report.steered.length > 0) parts.push(`steered: ${report.steered.join(', ')}`)
  if (report.queued.length > 0) parts.push(`queued for next turn: ${report.queued.join(', ')}`)
  if (report.failed.length > 0) parts.push(`undeliverable: ${report.failed.join('; ')}`)
  return parts.length === 0 ? 'delivery: no live recipient' : `delivery: ${parts.join(' · ')}`
}

/** Steer a running agent or start its next turn when idle. */
export function wakeAgent(agent: Agent, content: TextBlock[]): void {
  const message = { ...userText(''), content }
  if (agent.status === 'running') agent.steer(message)
  else agent.followup(message)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
