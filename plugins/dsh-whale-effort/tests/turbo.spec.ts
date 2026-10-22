import { describe, expect, it } from 'vitest'
import { policyText } from '../src/host/policy.js'
import { applySessionPatch, buildSnapshot, defaultSnapshot, sessionFlagsOf } from '../src/host/turbo.js'
import { MAX_TRACKED_SESSIONS, type SessionFlags } from '../src/host/state.js'

/** The all-off default the contract requires for unknown sessions. */
const OFF: SessionFlags = { lightning: false, ultra: false }

/** A zero fleet sample as the pure meter would report it before any traffic. */
const ZERO_SAMPLE = { rate: 0, gen: 0, agents: 0, generating: 0, total: 0 }

describe('session toggle defaults', () => {
  it('defaults every unknown or absent session to both modes off', () => {
    expect(sessionFlagsOf({}, 'session-unknown')).toEqual(OFF)
    expect(sessionFlagsOf({}, undefined)).toEqual(OFF)
    expect(sessionFlagsOf({ 'session-a': { lightning: true, ultra: true } }, 'session-b')).toEqual(OFF)
  })

  it('reads persisted flags exactly', () => {
    const sessions = { 'session-a': { lightning: true, ultra: false } }
    expect(sessionFlagsOf(sessions, 'session-a')).toEqual({ lightning: true, ultra: false })
  })
})

describe('session toggle updates', () => {
  it('creates a new entry for a first touch', () => {
    const next = applySessionPatch({}, 'session-a', { lightning: true, ultra: false })
    expect(next).toEqual({ 'session-a': { lightning: true, ultra: false } })
  })

  it('replaces one session without disturbing the others', () => {
    const sessions = {
      'session-a': { lightning: true, ultra: false },
      'session-b': { lightning: false, ultra: true },
    }
    const next = applySessionPatch(sessions, 'session-a', { lightning: false, ultra: true })
    expect(next['session-a']).toEqual({ lightning: false, ultra: true })
    expect(next['session-b']).toEqual({ lightning: false, ultra: true })
  })

  it('moves a re-touched session to the newest end', () => {
    const sessions = {
      'session-a': { lightning: true, ultra: false },
      'session-b': { lightning: true, ultra: false },
    }
    const next = applySessionPatch(sessions, 'session-a', { lightning: false, ultra: false })
    expect(Object.keys(next)).toEqual(['session-b', 'session-a'])
  })

  it('bounds the map to the newest touched sessions', () => {
    const sessions: Record<string, SessionFlags> = {}
    for (let index = 0; index < MAX_TRACKED_SESSIONS; index += 1) {
      sessions[`session-${String(index)}`] = { lightning: true, ultra: false }
    }
    const next = applySessionPatch(sessions, 'session-new', { lightning: false, ultra: true })
    const keys = Object.keys(next)
    expect(keys).toHaveLength(MAX_TRACKED_SESSIONS)
    expect(keys[0]).toBe('session-1')
    expect(keys.at(-1)).toBe('session-new')
  })
})

describe('session state snapshot', () => {
  it('reports the documented default snapshot when no session identifies the caller', () => {
    expect(defaultSnapshot(9)).toEqual({
      lightning: false,
      ultra: false,
      skin: 'fluid',
      rate: 0,
      gen: 0,
      agents: 0,
      generating: false,
      total: 0,
      stamp: 9,
      policy: '',
    })
  })

  it('reports the contract defaults for a session with no state', () => {
    expect(buildSnapshot(OFF, 'fluid', ZERO_SAMPLE, 1234, '')).toEqual({
      lightning: false,
      ultra: false,
      skin: 'fluid',
      rate: 0,
      gen: 0,
      agents: 0,
      generating: false,
      total: 0,
      stamp: 1234,
      policy: '',
    })
  })

  it('reports the policy body and live fleet numbers when a mode is on', () => {
    const flags = { lightning: true, ultra: false }
    const snapshot = buildSnapshot(flags, 'chrome', { rate: 12, gen: 8, agents: 2, generating: 1, total: 99 }, 7, policyText(flags))
    expect(snapshot.lightning).toBe(true)
    expect(snapshot.ultra).toBe(false)
    expect(snapshot.skin).toBe('chrome')
    expect(snapshot.rate).toBe(12)
    expect(snapshot.gen).toBe(8)
    expect(snapshot.agents).toBe(2)
    expect(snapshot.generating).toBe(true)
    expect(snapshot.total).toBe(99)
    expect(snapshot.policy).toBe(policyText(flags))
  })

  it('maps the breath count to a boolean and keeps integers', () => {
    const snapshot = buildSnapshot(OFF, 'holo', { rate: 0, gen: 0, agents: 3, generating: 2, total: 0 }, 0, '')
    expect(snapshot.generating).toBe(true)
    expect(Number.isInteger(snapshot.rate)).toBe(true)
    expect(Number.isInteger(snapshot.stamp)).toBe(true)
  })
})
