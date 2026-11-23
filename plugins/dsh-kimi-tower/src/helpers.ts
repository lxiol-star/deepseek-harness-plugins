import { randomUUID } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

import type { Agent, TextBlock, UserMessage } from './dsh'
import { TowerStore, resolveTowerRepoRoot, tryGit } from './protocol/index'

/** The tower tool names this plugin registers. */
export const TOWER_TOOL_NAMES = [
  'tower_init',
  'tower_plan',
  'tower_spawn',
  'tower_merge',
  'tower_rebase',
  'tower_teardown',
  'tower_complete',
  'tower_send',
  'tower_inbox',
  'tower_finding',
  'tower_review',
  'tower_mission',
  'tower_status',
] as const

export type TowerToolName = (typeof TOWER_TOOL_NAMES)[number]

/** Tools a tower worker may call: product work plus its protocol subset. */
export const WORKER_TOOL_ALLOW = [
  'read',
  'write',
  'edit',
  'read_image',
  'glob',
  'grep',
  'bash',
  'job_output',
  'job_list',
  'job_kill',
  'web_search',
  'web_fetch',
  'skill',
  'todo_write',
  'tower_complete',
  'tower_finding',
  'tower_inbox',
  'tower_mission',
  'tower_review',
  'tower_send',
  'tower_status',
] as const

/** Tools a reviewer may call: read-only product work plus its protocol subset. */
export const REVIEWER_TOOL_ALLOW = [
  'read',
  'read_image',
  'glob',
  'grep',
  'bash',
  'job_output',
  'job_list',
  'job_kill',
  'web_search',
  'web_fetch',
  'skill',
  'tower_finding',
  'tower_inbox',
  'tower_mission',
  'tower_review',
  'tower_send',
  'tower_status',
] as const

/** Tools the tower (main agent) must not use while tower mode is active. */
export const TOWER_DENIED_MAIN_TOOLS: Readonly<Record<string, string>> = {
  todo_write:
    'todo_write is not available while tower mode is active — mission state lives in the tower protocol '
    + '(tower_plan/tower_mission/tower_status, MISSIONS.md), and todo semantics would serialize the fleet. '
    + 'Spawn every dependency-unblocked mission now, then end your turn: worker completions wake you.',
  subagent:
    'subagent is not available while tower mode is active — the tower fleet runs through tower_spawn, one mission '
    + 'per worker in its own worktree. If the work genuinely needs an ordinary subagent instead, exit tower mode first.',
  subagent_fork:
    'subagent_fork is not available while tower mode is active — the tower fleet runs through tower_spawn, one mission '
    + 'per worker in its own worktree. If the work genuinely needs an ordinary subagent instead, exit tower mode first.',
  workflow:
    'workflow is not available while tower mode is active — tower missions are the unit of parallel work, and '
    + 'tower_spawn owns their worktrees, reviews, and merge gate. If the work genuinely needs a workflow, exit tower mode first.',
  ralph:
    'ralph is not available while tower mode is active — tower missions are the unit of parallel work. '
    + 'If the work genuinely needs a ralph loop, exit tower mode first.',
  wait_agent:
    'wait_agent is not available while tower mode is active — worker completions and inbox traffic wake you. '
    + 'End your turn instead of waiting for the fleet.',
  create_goal:
    'create_goal is not available while tower mode is active — tower mode and goals are mutually exclusive. '
    + 'If the work genuinely needs a goal instead, exit tower mode first.',
}

/** Whether `agent` is the top-level (tower-capable) agent of its session. */
export function isMainAgent(agent: Agent | undefined): boolean {
  if (agent === undefined) return false
  const header = agent.session?.header
  return header?.parentSession === undefined && header?.origin !== 'subagent'
}

/** Absolute working directory of an agent's session. */
export function agentCwd(agent: Agent): string {
  return agent.session?.header?.cwd ?? process.cwd()
}

/** Build one identified user message carrying plain text. */
export function userText(text: string, kind = 'tower'): UserMessage {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind },
  }
}

/** Text of the first text block, for error reporting. */
export function firstText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as TextBlock).type === 'text') {
      return String((block as TextBlock).text ?? '')
    }
  }
  return ''
}

/**
 * Resolve the repository root a tower workspace belongs to.
 *
 * A session started inside `.tower/worktrees/wt-N` belongs to the main
 * checkout; otherwise the git top level wins, falling back to the session
 * directory before the repository exists (tower_init creates it).
 */
export async function resolveRepoRoot(cwd: string): Promise<string> {
  const base = resolveTowerRepoRoot(cwd)
  const top = await tryGit(base, ['rev-parse', '--show-toplevel'])
  return canonicalPath(top === null || top.trim() === '' ? base : top.trim())
}

/** Canonicalize a path, following symlinks when the path (or its parent) exists. */
export function canonicalPath(path: string): string {
  const absolute = resolve(path)
  try {
    return realpathSync.native(absolute)
  } catch {
    try {
      return resolve(realpathSync.native(dirname(absolute)), basename(absolute))
    } catch {
      return absolute
    }
  }
}

/** Build a store bound to the agent's repository. */
export async function storeFor(agent: Agent): Promise<TowerStore> {
  return new TowerStore(await resolveRepoRoot(agentCwd(agent)))
}
