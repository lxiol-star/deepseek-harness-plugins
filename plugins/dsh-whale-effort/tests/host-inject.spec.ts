import { describe, expect, it } from 'vitest'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import {
  PLUGIN_ID,
  createPolicyInjector,
  instructionMessage,
  shouldInject,
  type PolicyListenerHost,
  type PreStepListener,
} from '../src/host/inject.js'
import { OFF_NOTICE, policyText } from '../src/host/policy.js'

/** Capture the listener exactly like the Cordis event bus would register it. */
class FakeHost implements PolicyListenerHost {
  listener: PreStepListener | undefined
  disposals = 0

  on(_name: 'agent/pre-step', listener: PreStepListener): () => boolean {
    this.listener = listener
    return () => {
      this.disposals += 1
      return true
    }
  }

  /** Invoke the registered listener; fails the test when none was registered. */
  async step(payload: Parameters<PreStepListener>[0], decision: PreStepDecision): Promise<PreStepDecision> {
    if (this.listener === undefined) throw new Error('listener not registered')
    return await this.listener(payload, async () => decision)
  }
}

/** One admitted user message, shaped like a claimed inbox message. */
function seeded(text = 'do the thing'): UserMessage {
  return {
    id: `message-${text}` as UserMessage['id'],
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }
}

/** Payload for one proposed step of one session. */
function payload(sessionId: string, messages: UserMessage[]): { agent: { id: string }; messages: UserMessage[] } {
  return { agent: { id: sessionId }, messages }
}

describe('injection deduplication input', () => {
  it('injects when the resolved text changes', () => {
    expect(shouldInject(undefined, 'policy body')).toBe(true)
    expect(shouldInject('old body', 'new body')).toBe(true)
    expect(shouldInject('', 'policy body')).toBe(true)
  })

  it('skips identical text and empty text', () => {
    expect(shouldInject('policy body', 'policy body')).toBe(false)
    expect(shouldInject(undefined, '')).toBe(false)
    expect(shouldInject('policy body', '')).toBe(false)
  })

  it('treats the one-off off notice as a change worth injecting once', () => {
    expect(shouldInject('policy body', OFF_NOTICE)).toBe(true)
    expect(shouldInject(OFF_NOTICE, OFF_NOTICE)).toBe(false)
  })
})

describe('instruction message', () => {
  it('is a durable user message attributed to this plugin', () => {
    const message = instructionMessage('policy body')
    expect(message.role).toBe('user')
    expect(message.id.length).toBeGreaterThan(0)
    expect(message.content).toEqual([{ type: 'text', text: 'policy body' }])
    expect(message.source).toEqual({ kind: PLUGIN_ID, form: 'instructions' })
  })

  it('assigns a fresh identity per injection', () => {
    expect(instructionMessage('body').id).not.toBe(instructionMessage('body').id)
  })
})

describe('pre-step listener', () => {
  it('delegates first and appends one instruction message', async () => {
    const host = new FakeHost()
    const injector = createPolicyInjector(host, { resolve: (sessionId) => policyText({ ultra: sessionId === 'session-a' }) })
    const admitted = seeded()
    const decision = await host.step(payload('session-a', [admitted]), { kind: 'enter', messages: [admitted] })
    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') throw new Error('expected an enter decision')
    expect(decision.messages).toHaveLength(2)
    expect(decision.messages[0]).toEqual(admitted)
    expect(decision.messages[1]?.source).toEqual({ kind: PLUGIN_ID, form: 'instructions' })
    expect(injector.lastInjected('session-a')).toBe(policyText({ ultra: true }))
    injector.dispose()
  })

  it('injects exactly once per changed text', async () => {
    const host = new FakeHost()
    let text = 'first text'
    const injector = createPolicyInjector(host, { resolve: () => text })
    const admitted = seeded()
    const first = await host.step(payload('session-a', [admitted]), { kind: 'enter', messages: [admitted] })
    const second = await host.step(payload('session-a', [admitted]), { kind: 'enter', messages: [admitted] })
    expect(first.kind === 'enter' && first.messages.length).toBe(2)
    expect(second.kind === 'enter' && second.messages.length).toBe(1)
    text = 'second text'
    const changed = await host.step(payload('session-a', [admitted]), { kind: 'enter', messages: [admitted] })
    expect(changed.kind === 'enter' && changed.messages.length).toBe(2)
    injector.dispose()
  })

  it('filters strictly by session id', async () => {
    const host = new FakeHost()
    const injector = createPolicyInjector(host, { resolve: (sessionId) => (sessionId === 'session-a' ? 'policy' : '') })
    const admitted = seeded()
    const other = await host.step(payload('session-b', [admitted]), { kind: 'enter', messages: [admitted] })
    expect(other.kind === 'enter' && other.messages.length).toBe(1)
    expect(injector.lastInjected('session-b')).toBeUndefined()
    injector.dispose()
  })

  it('does not inject empty text, a rejecting decision, or an empty admitted batch', async () => {
    const host = new FakeHost()
    const injector = createPolicyInjector(host, { resolve: () => 'policy' })
    const admitted = seeded()
    expect(await host.step(payload('session-a', [admitted]), { kind: 'reject' })).toEqual({ kind: 'reject' })
    expect(await host.step(payload('session-a', []), { kind: 'enter', messages: [] }))
      .toEqual({ kind: 'enter', messages: [] })
    const empty = createPolicyInjector(host, { resolve: () => '' })
    const untouched = await host.step(payload('session-a', [admitted]), { kind: 'enter', messages: [admitted] })
    expect(untouched.kind === 'enter' && untouched.messages.length).toBe(1)
    empty.dispose()
    injector.dispose()
  })

  it('contains resolver failures and keeps the delegated decision', async () => {
    const host = new FakeHost()
    const injector = createPolicyInjector(host, {
      resolve: () => {
        throw new Error('resolver exploded')
      },
    })
    const admitted = seeded()
    const decision = await host.step(payload('session-a', [admitted]), { kind: 'enter', messages: [admitted] })
    expect(decision).toEqual({ kind: 'enter', messages: [admitted] })
    injector.dispose()
  })

  it('degrades to a valid enter decision when delegation fails', async () => {
    const host = new FakeHost()
    const injector = createPolicyInjector(host, { resolve: () => 'policy' })
    const admitted = seeded()
    if (host.listener === undefined) throw new Error('listener not registered')
    const decision = await host.listener(payload('session-a', [admitted]), async () => {
      throw new Error('framework failed')
    })
    expect(decision).toEqual({ kind: 'enter', messages: [admitted] })
    injector.dispose()
  })

  it('stops injecting after disposal', async () => {
    const host = new FakeHost()
    const injector = createPolicyInjector(host, { resolve: () => 'policy' })
    injector.dispose()
    expect(host.disposals).toBe(1)
    const admitted = seeded()
    const decision = await host.step(payload('session-a', [admitted]), { kind: 'enter', messages: [admitted] })
    expect(decision.kind === 'enter' && decision.messages.length).toBe(1)
  })
})
