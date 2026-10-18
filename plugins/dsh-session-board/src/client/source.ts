/**
 * Assemble the panel's session inputs from DSH client snapshots.
 *
 * This is the only place that knows which DSH field feeds which card, and it
 * is deliberately defensive: every read tolerates a missing projection or an
 * absent optional snapshot, because projections arrive asynchronously and the
 * panel must render a partial card rather than nothing.
 */
import type {
  BoardSessionInput,
  SessionStatsInput,
  TokenUsageInput,
  TurnOutlineEntryInput,
} from '../shared/types.ts'
import {
  isSubagentRow,
  projectionOf,
  type JobView,
  type SessionListState,
  type SessionStatusSnapshot,
  type SubagentCatalogEntry,
  type WorkspaceSnapshot,
} from './dsh.ts'

/** Job states that count as live background work. */
const LIVE_JOB_STATUSES = new Set(['running', 'stopping'])

/** Everything the assembler reads, already snapshotted. */
export interface AssembleInput {
  list: SessionListState
  statuses: SessionStatusSnapshot
  /** `ctx.jobs.state.rows`, keyed by session id. */
  jobRows: Readonly<Record<string, readonly JobView[]>>
  /** Workspace rows, for the card's workspace label. */
  workspaces: WorkspaceSnapshot | null
}

/**
 * Read one projection for a session, preferring the row's inline values and
 * falling back to the explicit projection store.
 */
function projection<T>(list: SessionListState, id: string, key: string): T | null {
  const inline = projectionOf<T>(list.byId[id], key)
  if (inline !== null) return inline
  const stored = list.projectionsBySession?.[id]?.values?.[key] as T | undefined
  return stored === undefined || stored === null ? null : stored
}

/** Map session id to a workspace label, using the only session↔workspace mapping there is. */
function workspaceLabels(workspaces: WorkspaceSnapshot | null): Map<string, { title: string; id: string; path: string }> {
  const labels = new Map<string, { title: string; id: string; path: string }>()
  if (workspaces === null) return labels
  for (const item of workspaces.items ?? []) {
    const label = item.title ?? item.path.split('/').filter(Boolean).pop() ?? item.path
    for (const sessionId of item.sessionIds ?? []) labels.set(sessionId, { title: label, id: item.workspaceId, path: item.path })
  }
  return labels
}

/** Count subagent children that are themselves running. */
function runningSubagentCount(
  list: SessionListState,
  statuses: SessionStatusSnapshot,
  parentId: string,
): number {
  const catalog = projection<readonly SubagentCatalogEntry[]>(list, parentId, 'subagentCatalog')
  if (catalog === null || !Array.isArray(catalog)) return 0
  let count = 0
  for (const child of catalog) {
    const childStatus = statuses.get(child.id)
    const running = childStatus?.running ?? list.byId[child.id]?.running ?? false
    if (running === true) count += 1
  }
  return count
}

/** Count background jobs a session currently owns. */
function liveJobCount(rows: Readonly<Record<string, readonly JobView[]>>, sessionId: string): number {
  const list = rows[sessionId]
  if (!Array.isArray(list)) return 0
  let count = 0
  for (const job of list) if (LIVE_JOB_STATUSES.has(job.status)) count += 1
  return count
}

/**
 * Build one input row.
 *
 * Only top-level sessions become cards; a subagent child contributes to its
 * parent's counter instead, because the panel is a *session* board and a
 * subagent is a detail of the session that spawned it.
 */
function toInput(
  input: AssembleInput,
  id: string,
  labels: Map<string, { title: string; id: string; path: string }>,
  currentId: string | null,
): BoardSessionInput | null {
  const row = input.list.byId[id]
  if (row === undefined) return null
  const status = input.statuses.get(id)
  return {
    id,
    title: row.displayTitle !== '' ? row.displayTitle : (row.title ?? id),
    workspaceTitle: labels.get(id)?.title ?? row.cwd?.split(/[\\/]/u).filter(Boolean).pop() ?? '',
    workspaceId: labels.get(id)?.id ?? row.cwd ?? '',
    workspacePath: labels.get(id)?.path ?? row.cwd ?? '',
    isSubagent: isSubagentRow(row),
    parentId: row.parentId ?? null,
    // The status source is authoritative; the list row is the fallback for a
    // session the status map has never seen.
    running: status?.running ?? row.running ?? false,
    pendingInteraction: status?.pendingInteraction?.kind ?? null,
    completionUnread: status?.completionUnread === true,
    retainedMainView: (row.retainedBy?.mainView ?? 0) > 0 || id === currentId,
    updatedAt: Number.isFinite(row.updatedAt) ? row.updatedAt : 0,
    tokenUsage: projection<TokenUsageInput>(input.list, id, 'tokenUsage'),
    sessionStats: projection<SessionStatsInput>(input.list, id, 'sessionStats'),
    turnOutline: projection<readonly TurnOutlineEntryInput[]>(input.list, id, 'turnOutline'),
    runningSubagentCount: runningSubagentCount(input.list, input.statuses, id),
    liveJobCount: liveJobCount(input.jobRows, id),
    liveJobDetails: (input.jobRows[id] ?? []).filter(job => LIVE_JOB_STATUSES.has(job.status)).slice(0, 3).map(job => [job.label || job.kind || job.id, job.progress || job.detail || ''].filter(Boolean).join(' · ').slice(0, 240)),
  }
}

/** The session currently displayed in the main view, or null. */
export function currentSessionId(list: SessionListState): string | null {
  for (const row of Object.values(list.byId)) {
    if ((row.retainedBy?.mainView ?? 0) > 0) return row.id
  }
  return null
}

/** Assemble every card input, in host list order. */
export function assembleInputs(input: AssembleInput): BoardSessionInput[] {
  const labels = workspaceLabels(input.workspaces)
  const clientArchived = new Set(input.workspaces?.archivedSessionIds ?? [])
  const currentId = currentSessionId(input.list)
  const out: BoardSessionInput[] = []
  const seen = new Set<string>()

  // `ids` is the host's display order; a row present only in `byId` is a
  // retained subagent fallback, which is counted on its parent instead.
  for (const id of input.list.ids ?? []) {
    if (seen.has(id)) continue
    seen.add(id)
    const row = toInput(input, id, labels, currentId)
    if (row !== null && !row.isSubagent) out.push(clientArchived.has(row.id) ? { ...row, clientArchived: true } : row)
  }
  return out
}
