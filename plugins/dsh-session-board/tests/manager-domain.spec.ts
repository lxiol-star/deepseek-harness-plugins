import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MANAGER_DOMAIN_NAME,
  MANAGER_STATE_KEY,
  MANAGER_STATE_TABLE,
  MANAGER_TASK_TABLE,
  PROJECT_COORDINATOR_TABLE,
  PROJECT_DOMAIN_NAME,
  emptyManagerState,
  managerDomainSpec,
  managerTaskSchema,
  managerStateSchema,
  projectDomainSpec,
} from '../src/host/manager/domain.ts'
import type { ManagerCoordinatorRecord } from '../src/host/manager/domain.ts'
import { MANAGER_NOTE_MAX, MANAGER_SELECTION_MAX } from '../src/shared/manager.ts'

/** The state an absent or unusable record normalizes to. */
const EMPTY_STATE = {
  selection: { workspaceIds: [], sessionIds: [] },
  wakeEnabled: false,
  revision: 0,
}

describe('managerStateSchema.parse', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fills every default for an absent record', () => {
    expect(managerStateSchema.parse(undefined)).toEqual(EMPTY_STATE)
  })

  it('normalizes non-object input as an empty state', () => {
    expect(managerStateSchema.parse(null)).toEqual(EMPTY_STATE)
    expect(managerStateSchema.parse('state')).toEqual(EMPTY_STATE)
    expect(managerStateSchema.parse(42)).toEqual(EMPTY_STATE)
  })

  it('keeps non-empty manager ids and drops empty or non-string ones', () => {
    expect(managerStateSchema.parse({ managerSessionId: 'sess', managerWorkspaceId: 'ws' }))
      .toMatchObject({ managerSessionId: 'sess', managerWorkspaceId: 'ws' })

    const empty = managerStateSchema.parse({ managerSessionId: '', managerWorkspaceId: '' })
    expect(empty).not.toHaveProperty('managerSessionId')
    expect(empty).not.toHaveProperty('managerWorkspaceId')

    const wrong = managerStateSchema.parse({ managerSessionId: 42, managerWorkspaceId: null })
    expect(wrong).not.toHaveProperty('managerSessionId')
    expect(wrong).not.toHaveProperty('managerWorkspaceId')
  })

  it('normalizes the stored selection to unique valid ids', () => {
    const parsed = managerStateSchema.parse({
      selection: { workspaceIds: ['w1', 'w1', 7, '', 'w2'], sessionIds: ['s1', 's1'] },
    })
    expect(parsed.selection).toEqual({ workspaceIds: ['w1', 'w2'], sessionIds: ['s1'] })
  })

  it('caps each selection list at the wire limit', () => {
    const workspaceIds = Array.from({ length: MANAGER_SELECTION_MAX + 5 }, (_, index) => `w${index}`)
    const parsed = managerStateSchema.parse({ selection: { workspaceIds, sessionIds: [] } })

    expect(parsed.selection.workspaceIds).toHaveLength(MANAGER_SELECTION_MAX)
    expect(parsed.selection.workspaceIds[MANAGER_SELECTION_MAX - 1]).toBe(`w${MANAGER_SELECTION_MAX - 1}`)
  })

  it('treats wakeEnabled as a strict boolean', () => {
    expect(managerStateSchema.parse({ wakeEnabled: true }).wakeEnabled).toBe(true)
    expect(managerStateSchema.parse({ wakeEnabled: false }).wakeEnabled).toBe(false)
    expect(managerStateSchema.parse({ wakeEnabled: 'true' }).wakeEnabled).toBe(false)
    expect(managerStateSchema.parse({ wakeEnabled: 1 }).wakeEnabled).toBe(false)
  })

  it('keeps bounded wake throttle state and drops corrupt values', () => {
    const parsed = managerStateSchema.parse({
      lastWakeAt: 1_000,
      wakeUrgentTimes: [1_000, Number.NaN, 'x', -1],
      wakeBatchTimes: Array.from({ length: 80 }, (_, index) => index + 1),
    })
    expect(parsed.lastWakeAt).toBe(1_000)
    expect(parsed.wakeUrgentTimes).toEqual([1_000])
    expect(parsed.wakeBatchTimes).toHaveLength(64)
    const empty = managerStateSchema.parse({ lastWakeAt: 0, wakeUrgentTimes: 'nope' })
    expect(empty).not.toHaveProperty('lastWakeAt')
    expect(empty).not.toHaveProperty('wakeUrgentTimes')
  })

  it('keeps a non-negative integer revision and otherwise resets to zero', () => {
    expect(managerStateSchema.parse({ revision: 7 }).revision).toBe(7)
    expect(managerStateSchema.parse({ revision: 0 }).revision).toBe(0)
    for (const value of [-1, 1.5, '3', Number.NaN, Number.POSITIVE_INFINITY, null]) {
      expect(managerStateSchema.parse({ revision: value }).revision).toBe(0)
    }
  })

  it('bounds lastProgress at the note limit', () => {
    expect(managerStateSchema.parse({ lastProgress: 'x'.repeat(MANAGER_NOTE_MAX + 500) }).lastProgress)
      .toHaveLength(MANAGER_NOTE_MAX)
    expect(managerStateSchema.parse({ lastProgress: 'halfway' }).lastProgress).toBe('halfway')
    expect(managerStateSchema.parse({ lastProgress: '' })).not.toHaveProperty('lastProgress')
    expect(managerStateSchema.parse({ lastProgress: 42 })).not.toHaveProperty('lastProgress')
  })
})

describe('managerTaskSchema.parse', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fills pending status and both timestamps from the clock', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12_345)
    expect(managerTaskSchema.parse({})).toEqual({
      id: '',
      title: 'task',
      status: 'pending',
      createdAt: 12_345,
      updatedAt: 12_345,
    })
  })

  it('keeps explicit timestamps, including zero', () => {
    vi.spyOn(Date, 'now').mockReturnValue(999)
    expect(managerTaskSchema.parse({ createdAt: 0, updatedAt: 5 }))
      .toMatchObject({ createdAt: 0, updatedAt: 5 })
    expect(managerTaskSchema.parse({ createdAt: 'soon', updatedAt: null }))
      .toMatchObject({ createdAt: 999, updatedAt: 999 })
  })

  it('falls back to pending for an unknown status and keeps a known one', () => {
    expect(managerTaskSchema.parse({ status: 'blocked' }).status).toBe('blocked')
    expect(managerTaskSchema.parse({ status: 'bogus' }).status).toBe('pending')
    expect(managerTaskSchema.parse({ status: 3 }).status).toBe('pending')
  })

  it('falls back for a non-string id and an empty title', () => {
    expect(managerTaskSchema.parse({ id: 7, title: '' })).toMatchObject({ id: '', title: 'task' })
    expect(managerTaskSchema.parse({ title: 42 }).title).toBe('task')
  })

  it('keeps optional links and note only when they are strings', () => {
    const parsed = managerTaskSchema.parse({ workspaceId: 'w1', sessionId: 's1', note: 'note' })
    expect(parsed).toMatchObject({ workspaceId: 'w1', sessionId: 's1', note: 'note' })

    const dropped = managerTaskSchema.parse({ workspaceId: 1, sessionId: null, note: [] })
    expect(dropped).not.toHaveProperty('workspaceId')
    expect(dropped).not.toHaveProperty('sessionId')
    expect(dropped).not.toHaveProperty('note')
  })
})

describe('emptyManagerState', () => {
  it('returns an empty state with a fresh selection array per call', () => {
    const first = emptyManagerState()
    expect(first).toEqual(EMPTY_STATE)
    expect(emptyManagerState().selection.workspaceIds).not.toBe(first.selection.workspaceIds)
    expect(emptyManagerState().selection.sessionIds).not.toBe(first.selection.sessionIds)
  })
})

describe('managerDomainSpec', () => {
  it('declares its own domain, version and invalid-record policy', () => {
    expect(managerDomainSpec.name).toBe(MANAGER_DOMAIN_NAME)
    expect(managerDomainSpec.name).toBe('dsh_session_board_manager')
    expect(managerDomainSpec.version).toBe(1)
    expect(managerDomainSpec.invalidRecords).toBe('backup-and-skip')
  })

  it('owns exactly the manager state and task tables', () => {
    expect(MANAGER_STATE_TABLE).toBe('manager_state')
    expect(MANAGER_TASK_TABLE).toBe('manager_tasks')
    expect(MANAGER_STATE_KEY).toBe('state')
    expect(Object.keys(managerDomainSpec.tables).sort())
      .toEqual([MANAGER_STATE_TABLE, MANAGER_TASK_TABLE].sort())
    expect(managerDomainSpec.tables[MANAGER_STATE_TABLE]?.valueSchema).toBe(managerStateSchema)
    expect(managerDomainSpec.tables[MANAGER_TASK_TABLE]?.valueSchema).toBe(managerTaskSchema)
  })

  it('normalizes records read through the domain tables', () => {
    expect(managerDomainSpec.tables[MANAGER_STATE_TABLE]?.valueSchema.parse(null)).toEqual(EMPTY_STATE)
    expect(managerDomainSpec.tables[MANAGER_TASK_TABLE]?.valueSchema.parse(null))
      .toMatchObject({ id: '', title: 'task', status: 'pending' })
  })
})

describe('projectDomainSpec', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Coordinator row schema as the domain opener reads it. */
  const coordinatorSchema = projectDomainSpec.tables[PROJECT_COORDINATOR_TABLE]
    ?.valueSchema as { parse(value: unknown): ManagerCoordinatorRecord }
  const row = {
    projectKey: 'github.com/me/i-ai-gw',
    label: 'i-ai-gw',
    sessionId: 'session-1',
    workspaceId: 'wa',
    createdAt: 7,
    remote: 'git@github.com:me/i-ai-gw.git',
  }

  it('declares its own domain, version and coordinator table', () => {
    expect(projectDomainSpec.name).toBe(PROJECT_DOMAIN_NAME)
    expect(projectDomainSpec.name).toBe('dsh_session_board_projects')
    expect(projectDomainSpec.version).toBe(1)
    expect(projectDomainSpec.invalidRecords).toBe('backup-and-skip')
    expect(Object.keys(projectDomainSpec.tables)).toEqual([PROJECT_COORDINATOR_TABLE])
    expect(PROJECT_COORDINATOR_TABLE).toBe('coordinators')
  })

  it('keeps a complete coordinator row unchanged', () => {
    expect(coordinatorSchema.parse(row)).toEqual(row)
  })

  it('fills a missing label and timestamp so old rows stay readable', () => {
    vi.spyOn(Date, 'now').mockReturnValue(12_345)
    const parsed = coordinatorSchema.parse({ projectKey: 'github.com/me/i-ai-gw', sessionId: 's', workspaceId: 'w' })
    expect(parsed).toMatchObject({
      projectKey: 'github.com/me/i-ai-gw', label: 'i-ai-gw', sessionId: 's', workspaceId: 'w', createdAt: 12_345,
    })
    expect(parsed.remote).toBeUndefined()
  })

  it('drops an empty remote and keeps a configured one', () => {
    expect(coordinatorSchema.parse({ ...row, remote: '' }).remote).toBeUndefined()
    expect(coordinatorSchema.parse(row).remote).toBe('git@github.com:me/i-ai-gw.git')
  })

  it('rejects an incomplete identity so the domain backup-and-skips the row', () => {
    expect(() => coordinatorSchema.parse({ projectKey: 'p' })).toThrow('incomplete')
    expect(() => coordinatorSchema.parse(null)).toThrow('incomplete')
  })
})
