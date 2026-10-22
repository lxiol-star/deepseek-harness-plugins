import { describe, expect, it } from 'vitest'
import {
  LIGHTNING_POLICY,
  OFF_NOTICE,
  PRECEDENCE,
  SUBAGENT_GUARD,
  ULTRA_POLICY,
  currentPolicyText,
  policyText,
  resolveActivePolicy,
} from '../src/host/policy.js'

describe('policy text composition', () => {
  it('injects nothing while both modes are off', () => {
    expect(policyText({})).toBe('')
    expect(policyText({ lightning: false, ultra: false })).toBe('')
  })

  it('includes exactly the enabled mode bodies', () => {
    const ultra = policyText({ ultra: true })
    expect(ultra).toContain(PRECEDENCE)
    expect(ultra).toContain(ULTRA_POLICY)
    expect(ultra).toContain(SUBAGENT_GUARD)
    expect(ultra).not.toContain(LIGHTNING_POLICY)

    const lightning = policyText({ lightning: true })
    expect(lightning).toContain(PRECEDENCE)
    expect(lightning).toContain(LIGHTNING_POLICY)
    expect(lightning).toContain(SUBAGENT_GUARD)
    expect(lightning).not.toContain(ULTRA_POLICY)
  })

  it('orders precedence first and the recursion guard last with both modes on', () => {
    const text = policyText({ ultra: true, lightning: true })
    expect(text.indexOf(PRECEDENCE)).toBe(0)
    expect(text.indexOf(ULTRA_POLICY)).toBeGreaterThan(text.indexOf(PRECEDENCE))
    expect(text.indexOf(LIGHTNING_POLICY)).toBeGreaterThan(text.indexOf(ULTRA_POLICY))
    expect(text.indexOf(SUBAGENT_GUARD)).toBeGreaterThan(text.indexOf(LIGHTNING_POLICY))
  })

  it('derives every combination from the two independent bodies', () => {
    const both = policyText({ ultra: true, lightning: true })
    expect(both).toBe([PRECEDENCE, ULTRA_POLICY, LIGHTNING_POLICY, SUBAGENT_GUARD].join('\n\n'))
  })

  it('treats explicit false as disabled', () => {
    expect(policyText({ ultra: false, lightning: false })).toBe('')
    expect(policyText({ ultra: false, lightning: true })).toBe(policyText({ lightning: true }))
  })
})

describe('activated policy selection', () => {
  it('returns the body while a mode is on', () => {
    expect(resolveActivePolicy({ ultra: true }, false)).toBe(policyText({ ultra: true }))
    expect(resolveActivePolicy({ lightning: true }, true)).toBe(policyText({ lightning: true }))
  })

  it('returns the off notice once a previously enabled session turns both off', () => {
    expect(resolveActivePolicy({}, true)).toBe(OFF_NOTICE)
    expect(resolveActivePolicy({ ultra: false, lightning: false }, true)).toBe(OFF_NOTICE)
  })

  it('returns nothing for a session that never enabled a mode', () => {
    expect(resolveActivePolicy({}, false)).toBe('')
  })

  it('keeps the off notice free of the mode bodies', () => {
    expect(OFF_NOTICE).not.toContain(ULTRA_POLICY)
    expect(OFF_NOTICE).not.toContain(LIGHTNING_POLICY)
    expect(OFF_NOTICE).not.toContain(SUBAGENT_GUARD)
  })
})

describe('policy chip text', () => {
  it('shows the body only while a mode is on', () => {
    expect(currentPolicyText({ ultra: true })).toBe(policyText({ ultra: true }))
    expect(currentPolicyText({})).toBe('')
  })

  it('never shows the off notice', () => {
    expect(currentPolicyText({})).not.toBe(OFF_NOTICE)
  })
})
