import { describe, expect, it } from 'vitest'
import {
  MANAGER_ID_MAX,
  MANAGER_SELECTION_MAX,
  MANAGER_TASK_STATUSES,
  TASK_STATUS_KEYS,
  buildSelectionMessage,
  isManagerTaskStatus,
  managerPhase,
  managerSessionVisible,
  normalizeSelection,
  parseManagerWakeStatus,
  previewText,
} from '../src/shared/manager.ts'

/** First line of every non-empty selection message. */
const HEADER = '[选区] 以下是用户在面板中勾选的对象：'

const NO_LABELS = { workspaceTitles: {}, sessionTitles: {} }

describe('buildSelectionMessage', () => {
  it('is empty when nothing selected and no instruction was written', () => {
    expect(buildSelectionMessage({ workspaceIds: [], sessionIds: [] }, NO_LABELS)).toBe('')
    expect(buildSelectionMessage({ workspaceIds: [], sessionIds: [] }, NO_LABELS, '   ')).toBe('')
  })

  it('renders one label line per selected workspace and session', () => {
    const message = buildSelectionMessage(
      { workspaceIds: ['w1'], sessionIds: ['s1'] },
      { workspaceTitles: { w1: 'Repo one' }, sessionTitles: { s1: 'Chat one' } },
    )
    expect(message).toBe([
      HEADER,
      '- 工作区 Repo one (w1)',
      '- 会话 Chat one (s1)',
    ].join('\n'))
  })

  it('falls back to the raw ids when no label is known', () => {
    const message = buildSelectionMessage({ workspaceIds: ['w1'], sessionIds: ['s1'] }, NO_LABELS)
    expect(message).toBe([
      HEADER,
      '- 工作区 w1 (w1)',
      '- 会话 s1 (s1)',
    ].join('\n'))
  })

  it('appends the known session state as a suffix', () => {
    const message = buildSelectionMessage(
      { workspaceIds: [], sessionIds: ['s1', 's2'] },
      { workspaceTitles: {}, sessionTitles: { s1: 'First', s2: 'Second' }, sessionStates: { s1: 'running' } },
    )
    expect(message).toBe([
      HEADER,
      '- 会话 First (s1) · running',
      '- 会话 Second (s2)',
    ].join('\n'))
  })

  it('keeps selection order but lists every workspace before every session', () => {
    const message = buildSelectionMessage(
      { workspaceIds: ['w2', 'w1'], sessionIds: ['s2', 's1'] },
      NO_LABELS,
    )
    expect(message).toBe([
      HEADER,
      '- 工作区 w2 (w2)',
      '- 工作区 w1 (w1)',
      '- 会话 s2 (s2)',
      '- 会话 s1 (s1)',
    ].join('\n'))
  })

  it('appends the trimmed instruction after one blank line', () => {
    const message = buildSelectionMessage(
      { workspaceIds: ['w1'], sessionIds: [] },
      { workspaceTitles: { w1: 'Repo one' }, sessionTitles: {} },
      '  please fix the build  ',
    )
    expect(message).toBe([
      HEADER,
      '- 工作区 Repo one (w1)',
      '',
      'please fix the build',
    ].join('\n'))
  })

  it('sends an instruction-only message when nothing is selected', () => {
    expect(buildSelectionMessage({ workspaceIds: [], sessionIds: [] }, NO_LABELS, '  hello manager  '))
      .toBe([
        HEADER,
        '',
        'hello manager',
      ].join('\n'))
  })
})

describe('normalizeSelection', () => {
  it('dedupes and preserves first-seen order', () => {
    expect(normalizeSelection({
      workspaceIds: ['w1', 'w1', 'w2'],
      sessionIds: ['s1', 's1'],
    })).toEqual({ workspaceIds: ['w1', 'w2'], sessionIds: ['s1'] })
  })

  it('drops unusable ids', () => {
    const tooLong = 'x'.repeat(MANAGER_ID_MAX + 1)
    expect(normalizeSelection({
      workspaceIds: ['', 'ok', 42, null, tooLong, 'a\0b'],
      sessionIds: [true, 's1'],
    })).toEqual({ workspaceIds: ['ok'], sessionIds: ['s1'] })
  })

  it('caps each list at the wire limit', () => {
    const ids = Array.from({ length: MANAGER_SELECTION_MAX + 10 }, (_, index) => `id-${index}`)
    const normalized = normalizeSelection({ workspaceIds: ids, sessionIds: ids })

    expect(normalized.workspaceIds).toHaveLength(MANAGER_SELECTION_MAX)
    expect(normalized.sessionIds).toHaveLength(MANAGER_SELECTION_MAX)
    expect(normalized.workspaceIds[MANAGER_SELECTION_MAX - 1]).toBe(`id-${MANAGER_SELECTION_MAX - 1}`)
  })

  it('treats a non-object or partial payload as an empty selection', () => {
    expect(normalizeSelection(undefined)).toEqual({ workspaceIds: [], sessionIds: [] })
    expect(normalizeSelection(null)).toEqual({ workspaceIds: [], sessionIds: [] })
    expect(normalizeSelection('w1')).toEqual({ workspaceIds: [], sessionIds: [] })
    expect(normalizeSelection({ workspaceIds: 'w1' })).toEqual({ workspaceIds: [], sessionIds: [] })
  })
})

describe('parseManagerWakeStatus', () => {
  it('normalizes a complete status object', () => {
    expect(parseManagerWakeStatus({
      enabled: true, pending: 3, urgent: 1, attention: 1, completed: 1,
      lastWakeAt: 1_000, nextAt: 4_000, wakesThisHour: 2, suppressed: 0,
    })).toEqual({
      enabled: true, pending: 3, urgent: 1, attention: 1, completed: 1,
      wakesThisHour: 2, suppressed: 0, lastWakeAt: 1_000, nextAt: 4_000,
    })
  })

  it('rejects an object without the enabled flag and fills counters', () => {
    expect(parseManagerWakeStatus(null)).toBeNull()
    expect(parseManagerWakeStatus({ pending: 1 })).toBeNull()
    expect(parseManagerWakeStatus({ enabled: false, pending: '3' })).toMatchObject({ enabled: false, pending: 0, urgent: 0 })
  })
})

describe('isManagerTaskStatus', () => {
  it('accepts every declared status and nothing else', () => {
    for (const status of MANAGER_TASK_STATUSES) expect(isManagerTaskStatus(status)).toBe(true)
    expect(isManagerTaskStatus('bogus')).toBe(false)
    expect(isManagerTaskStatus('')).toBe(false)
    expect(isManagerTaskStatus(undefined)).toBe(false)
    expect(isManagerTaskStatus(1)).toBe(false)
  })
})

describe('managerPhase', () => {
  it('reports waiting first, running when known running, and idle otherwise', () => {
    expect(managerPhase(true, false)).toBe('running')
    expect(managerPhase(true, true)).toBe('waiting')
    expect(managerPhase(false, true)).toBe('waiting')
    expect(managerPhase(undefined, true)).toBe('waiting')
    expect(managerPhase(false, false)).toBe('idle')
    expect(managerPhase(undefined, false)).toBe('idle')
  })
})

describe('previewText', () => {
  it('collapses whitespace and trims', () => {
    expect(previewText('  a\n\n b\t c  ')).toBe('a b c')
    expect(previewText('')).toBe('')
  })

  it('leaves text at the budget untouched', () => {
    const text = 'x'.repeat(120)
    expect(previewText(text)).toBe(text)
  })

  it('truncates with an ellipsis inside the budget', () => {
    const preview = previewText('x'.repeat(200))
    expect(preview).toHaveLength(120)
    expect(preview).toBe(`${'x'.repeat(119)}…`)
  })

  it('honours a custom budget', () => {
    expect(previewText('abcdef', 5)).toBe('abcd…')
    expect(previewText('abcde', 5)).toBe('abcde')
  })
})

describe('TASK_STATUS_KEYS', () => {
  it('names one locale key per task status', () => {
    expect(Object.keys(TASK_STATUS_KEYS).sort()).toEqual([...MANAGER_TASK_STATUSES].sort())
    for (const status of MANAGER_TASK_STATUSES) {
      expect(TASK_STATUS_KEYS[status]).toBe(`task.status.${status}`)
    }
  })
})

describe('managerSessionVisible', () => {
  it('hides both archive kinds unless archived rows are shown', () => {
    expect(managerSessionVisible({}, false)).toBe(true)
    expect(managerSessionVisible({ archivedAt: 1 }, false)).toBe(false)
    expect(managerSessionVisible({ clientArchived: true }, false)).toBe(false)
    expect(managerSessionVisible({ archivedAt: 1, clientArchived: true }, false)).toBe(false)
  })
  it('shows every row when showArchived is on', () => {
    expect(managerSessionVisible({ archivedAt: 1 }, true)).toBe(true)
    expect(managerSessionVisible({ clientArchived: true }, true)).toBe(true)
    expect(managerSessionVisible({}, true)).toBe(true)
  })
})
