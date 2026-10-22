/**
 * Durable manager facts: the one manager identity/selection record and the
 * task board. A separate domain from the board fact stores so a broken task
 * store can never take acknowledgements down with it.
 *
 * Records are normalized instead of thrown away: these are derived facts, and a
 * corrupt row should cost one panel row, not the domain's availability.
 */
import type { ManagerSelection, ManagerTaskStatus, ManagerTaskView } from '../../shared/manager.ts'
import { isManagerTaskStatus, normalizeSelection } from '../../shared/manager.ts'
import { defineDomain, domainTable } from '../domain.ts'
import type { DomainSpec, RecordSchema } from '../domain.ts'

/** Domain holding the manager identity record and the task board. */
export const MANAGER_DOMAIN_NAME = 'dsh_session_board_manager'
/** Single-row table holding {@link ManagerStateRecord} under {@link MANAGER_STATE_KEY}. */
export const MANAGER_STATE_TABLE = 'manager_state'
/** Task table keyed by task id. */
export const MANAGER_TASK_TABLE = 'manager_tasks'
/** Key of the single manager state record. */
export const MANAGER_STATE_KEY = 'state'

/** Durable manager identity, selection mirror and wake preference. */
export interface ManagerStateRecord {
  readonly managerSessionId?: string
  readonly managerWorkspaceId?: string
  readonly selection: ManagerSelection
  readonly wakeEnabled: boolean
  /** Monotone revision bumped by every accepted mutation. */
  readonly revision: number
  /** Latest free-form progress line (report_progress without a task). */
  readonly lastProgress?: string
  /** Epoch ms of the last delivered automatic digest. */
  readonly lastWakeAt?: number
  /** Urgent/attention wake timestamps in the rolling hour. */
  readonly wakeUrgentTimes?: readonly number[]
  /** Completion wake timestamps in the rolling hour. */
  readonly wakeBatchTimes?: readonly number[]
}

/** Durable task row (same fields the wire view exposes). */
export type ManagerTaskRecord = ManagerTaskView

/** Empty manager state used before the first mutation. */
export function emptyManagerState(): ManagerStateRecord {
  return { selection: { workspaceIds: [], sessionIds: [] }, wakeEnabled: false, revision: 0 }
}

/** Read a bounded list of finite wake timestamps, or undefined when absent/corrupt. */
function wakeTimes(value: unknown): readonly number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const times = value.filter((at): at is number => typeof at === 'number' && Number.isFinite(at) && at > 0)
  return times.slice(-64)
}

/** Normalize one stored manager record. */
export const managerStateSchema: RecordSchema<ManagerStateRecord> = {
  parse(value) {
    const source = (typeof value === 'object' && value !== null ? value : {}) as Partial<ManagerStateRecord>
    return {
      ...(typeof source.managerSessionId === 'string' && source.managerSessionId !== ''
        ? { managerSessionId: source.managerSessionId }
        : {}),
      ...(typeof source.managerWorkspaceId === 'string' && source.managerWorkspaceId !== ''
        ? { managerWorkspaceId: source.managerWorkspaceId }
        : {}),
      selection: normalizeSelection(source.selection),
      wakeEnabled: source.wakeEnabled === true,
      revision: Number.isInteger(source.revision) && (source.revision as number) >= 0 ? source.revision as number : 0,
      ...(typeof source.lastProgress === 'string' && source.lastProgress !== ''
        ? { lastProgress: source.lastProgress.slice(0, 2_000) }
        : {}),
      ...(typeof source.lastWakeAt === 'number' && Number.isFinite(source.lastWakeAt) && source.lastWakeAt > 0
        ? { lastWakeAt: source.lastWakeAt }
        : {}),
      ...(wakeTimes(source.wakeUrgentTimes) === undefined ? {} : { wakeUrgentTimes: wakeTimes(source.wakeUrgentTimes) as readonly number[] }),
      ...(wakeTimes(source.wakeBatchTimes) === undefined ? {} : { wakeBatchTimes: wakeTimes(source.wakeBatchTimes) as readonly number[] }),
    }
  },
}

/** Normalize one stored task row. */
export const managerTaskSchema: RecordSchema<ManagerTaskRecord> = {
  parse(value) {
    const source = (typeof value === 'object' && value !== null ? value : {}) as Partial<ManagerTaskRecord>
    const id = typeof source.id === 'string' ? source.id : ''
    const title = typeof source.title === 'string' && source.title !== '' ? source.title : 'task'
    const status: ManagerTaskStatus = isManagerTaskStatus(source.status) ? source.status : 'pending'
    const now = Date.now()
    return {
      id,
      title,
      status,
      ...(typeof source.workspaceId === 'string' ? { workspaceId: source.workspaceId } : {}),
      ...(typeof source.sessionId === 'string' ? { sessionId: source.sessionId } : {}),
      ...(typeof source.note === 'string' ? { note: source.note } : {}),
      createdAt: typeof source.createdAt === 'number' ? source.createdAt : now,
      updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : now,
    }
  },
}

/** Manager domain: one identity/selection record plus the task board. */
export const managerDomainSpec: DomainSpec = defineDomain({
  name: MANAGER_DOMAIN_NAME,
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: {
    [MANAGER_STATE_TABLE]: domainTable(managerStateSchema),
    [MANAGER_TASK_TABLE]: domainTable(managerTaskSchema),
  },
})
