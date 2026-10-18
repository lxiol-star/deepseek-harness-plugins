import { describe, expect, it } from 'vitest'
import { classify, groupOf, isUnacked } from '../src/shared/classify.ts'
import type { ClassifyInput } from '../src/shared/classify.ts'

/** A baseline input: an idle, acknowledged session. */
function input(overrides: Partial<ClassifyInput> = {}): ClassifyInput {
  return {
    running: false,
    pendingInteraction: false,
    completionUnread: false,
    ackLastTurnEnd: null,
    ackAckedAt: null,
    ackLastTurnEndKind: null,
    ...overrides,
  }
}

describe('classify', () => {
  it('treats a pending interaction as attention even while the agent is running', () => {
    const result = classify(input({ running: true, pendingInteraction: true }))
    expect(result.state).toBe('blocked')
    expect(result.group).toBe('attention')
    expect(result.attentionKind).toBe('blocked')
  })

  it('classifies a running session as in progress', () => {
    const result = classify(input({ running: true }))
    expect(result.state).toBe('running')
    expect(result.group).toBe('running')
    expect(result.waitSince).toBeNull()
  })

  it('classifies an unacknowledged turn end as attention, keyed by its own timestamp', () => {
    const result = classify(input({ ackLastTurnEnd: 5_000, ackAckedAt: 1_000 }))
    expect(result.state).toBe('unread')
    expect(result.attentionKind).toBe('unread')
    expect(result.waitSince).toBe(5_000)
  })

  it('treats a turn end with no acknowledgement cursor as waiting', () => {
    const result = classify(input({ ackLastTurnEnd: 5_000, ackAckedAt: null }))
    expect(result.state).toBe('unread')
  })

  it('treats a turn end at or before the cursor as acknowledged', () => {
    expect(classify(input({ ackLastTurnEnd: 5_000, ackAckedAt: 5_000 })).state).toBe('done')
    expect(classify(input({ ackLastTurnEnd: 4_000, ackAckedAt: 5_000 })).state).toBe('done')
  })

  it('flags an error-ended turn distinctly', () => {
    const result = classify(input({ ackLastTurnEnd: 9_000, ackLastTurnEndKind: 'error' }))
    expect(result.state).toBe('error')
    expect(result.attentionKind).toBe('error')
    expect(result.waitSince).toBe(9_000)
  })

  it('treats non-error end reasons as ordinary unread', () => {
    for (const kind of ['completed', 'aborted', 'blocked', 'max-tokens', 'interrupted', 'forked']) {
      const result = classify(input({ ackLastTurnEnd: 9_000, ackLastTurnEndKind: kind }))
      expect(result.state, kind).toBe('unread')
    }
  })

  it('falls back to the client-local unread flag when the host feed is silent', () => {
    const result = classify(input({ completionUnread: true, unreadSince: 1_234 }))
    expect(result.state).toBe('unread')
    expect(result.waitSince).toBe(1_234)
  })

  it('prefers the durable cursor over the client-local flag', () => {
    const result = classify(input({ completionUnread: true, unreadSince: 1_234, ackLastTurnEnd: 9_000 }))
    expect(result.waitSince).toBe(9_000)
  })

  it('does not treat an absent status as anything but idle', () => {
    // A session never observed as running and with no pending interaction has
    // no entry in the status map; "absent" must not read as unknown or running.
    const result = classify(input({ running: undefined }))
    expect(result.state).toBe('done')
  })

  it('does not treat running:false plus a fresh cursor as attention', () => {
    const result = classify(input({ running: false, ackLastTurnEnd: 100, ackAckedAt: 100 }))
    expect(result.state).toBe('done')
  })

  it('reports the wait timestamp it was given for a blocked session', () => {
    expect(classify(input({ pendingInteraction: true, pendingSince: 777 })).waitSince).toBe(777)
  })
})

describe('isUnacked', () => {
  it('requires a known turn end', () => {
    expect(isUnacked(null, null)).toBe(false)
    expect(isUnacked(null, 10)).toBe(false)
  })

  it('compares the cursor strictly', () => {
    expect(isUnacked(10, 9)).toBe(true)
    expect(isUnacked(10, 10)).toBe(false)
  })
})

describe('groupOf', () => {
  it('maps every state to its group', () => {
    expect(groupOf('blocked')).toBe('attention')
    expect(groupOf('error')).toBe('attention')
    expect(groupOf('unread')).toBe('attention')
    expect(groupOf('running')).toBe('running')
    expect(groupOf('done')).toBe('done')
  })
})

// Durable acknowledgement must not re-light through the client fallback.
it('does not restore completionUnread after durable ack', () => {
  expect(classify({ running: false, pendingInteraction: false, completionUnread: true, unreadSince: 1_234, ackLastTurnEnd: 9_000, ackAckedAt: 9_500, ackLastTurnEndKind: 'completed' }).state).toBe('done')
})
