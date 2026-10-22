/**
 * Client-side Host transport: envelope handling, snapshot normalization and the
 * skin preference store. The Host half is simulated with a fake RPC, so these
 * tests stay offline and deterministic.
 */
import { describe, expect, it } from 'vitest'
import {
  EMPTY_TURBO,
  makeTurboService,
  RPC_CHANNEL,
  skinStore,
  type HostRpc,
} from '../src/client/turbo.js'
import { DEFAULT_SKIN } from '../src/client/effects/skins.js'

/** Record every call and answer with a canned result. */
function fakeRpc(answer: (endpoint: string, payload?: unknown) => unknown): HostRpc & { calls: Array<{ channel: string; endpoint: string; payload?: unknown }> } {
  const calls: Array<{ channel: string; endpoint: string; payload?: unknown }> = []
  return {
    calls,
    call: async (channel, endpoint, payload) => {
      calls.push({ channel, endpoint, payload })
      return answer(endpoint, payload)
    },
  }
}

describe('makeTurboService', () => {
  it('is absent when the client exposes no RPC transport', () => {
    expect(makeTurboService(undefined)).toBeNull()
  })

  it('addresses the plugin channel and endpoints', async () => {
    const rpc = fakeRpc(() => ({ ok: true, value: { lightning: false, ultra: false, skin: 'chrome' } }))
    const service = makeTurboService(rpc)
    expect(service).not.toBeNull()
    await service?.state('s1')
    await service?.update({ session: 's1', lightning: true })
    expect(rpc.calls.map((call) => [call.channel, call.endpoint])).toEqual([
      [RPC_CHANNEL, 'session/state'],
      [RPC_CHANNEL, 'session/update'],
    ])
  })

  it('reads the global skin without a session', async () => {
    const rpc = fakeRpc(() => ({ ok: true, value: { skin: 'holo' } }))
    const service = makeTurboService(rpc)
    const snapshot = await service?.state()
    expect(snapshot?.skin).toBe('holo')
    expect(rpc.calls[0]?.payload).toEqual({})
  })

  it('normalizes numbers and rejects unknown skins', async () => {
    const rpc = fakeRpc(() => ({
      ok: true,
      value: { lightning: true, ultra: 'yes', skin: 'nebula', rate: 12840.6, gen: -3, agents: 2, generating: 1, total: 99, stamp: 1234 },
    }))
    const snapshot = await makeTurboService(rpc)?.state('s')
    expect(snapshot).toMatchObject({ lightning: true, ultra: false, skin: DEFAULT_SKIN, rate: 12841, gen: 0, agents: 2, generating: false, total: 99, stamp: 1234 })
  })

  it('degrades a failed or malformed envelope to null', async () => {
    const failed = makeTurboService(fakeRpc(() => ({ ok: false, error: { code: 'x', message: 'y' } })))
    expect(await failed?.state('s')).toBeNull()
    const malformed = makeTurboService(fakeRpc(() => ({ ok: true, value: 'nope' })))
    expect(await malformed?.state('s')).toBeNull()
    const throwing = makeTurboService({ call: async () => { throw new Error('offline') } })
    expect(await throwing?.state('s')).toBeNull()
  })

  it('returns the policy body for one session', async () => {
    const rpc = fakeRpc(() => ({ ok: true, value: { text: '## Ultra Mode' } }))
    expect(await makeTurboService(rpc)?.policy('s1')).toBe('## Ultra Mode')
    const missing = makeTurboService(fakeRpc(() => ({ ok: true, value: {} })))
    expect(await missing?.policy('s1')).toBeNull()
  })
})

describe('EMPTY_TURBO', () => {
  it('is a safe frozen default', () => {
    expect(EMPTY_TURBO.lightning).toBe(false)
    expect(EMPTY_TURBO.ultra).toBe(false)
    expect(EMPTY_TURBO.skin).toBe(DEFAULT_SKIN)
    expect(EMPTY_TURBO.rate).toBe(0)
    expect(Object.isFrozen(EMPTY_TURBO)).toBe(true)
  })
})

describe('skinStore', () => {
  it('publishes changes to subscribers', () => {
    const seen: string[] = []
    const unsubscribe = skinStore.subscribe(() => seen.push(skinStore.getSnapshot()))
    skinStore.set('chrome', false)
    skinStore.set('holo', false)
    skinStore.set('holo', false)
    unsubscribe()
    expect(seen).toEqual(['chrome', 'holo'])
    skinStore.set(DEFAULT_SKIN, false)
  })

  it('ignores unsupported values', () => {
    skinStore.set(DEFAULT_SKIN, false)
    skinStore.set('nebula' as never, false)
    expect(skinStore.getSnapshot()).toBe(DEFAULT_SKIN)
  })
})
