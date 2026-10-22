import { describe, expect, it } from 'vitest'
import type { Guidance, GuidanceApi } from '../src/host/guidance.js'
import type { Turbo } from '../src/host/turbo.js'
import { buildSnapshot, sessionFlagsOf } from '../src/host/turbo.js'
import {
  MAX_REQUEST_BYTES,
  RPC_CHANNEL,
  createChannelHandler,
  dispatchEndpoint,
  endpointOf,
  envelopeOf,
  failResult,
  okResult,
  parseEnvelope,
  type EndpointDeps,
  type RouteRequest,
  type RouteResponse,
} from '../src/host/rpc.js'
import type { SessionFlags, Skin } from '../src/host/state.js'
import { policyText } from '../src/host/policy.js'

const ZERO_SAMPLE = { rate: 0, gen: 0, agents: 0, generating: 0, total: 0 }

/** One complete guidance fixture for the diagnose endpoint. */
function guidanceFixture(overrides: Partial<Guidance> = {}): Guidance {
  return {
    provider: 'fixture-provider',
    model: 'fixture-model',
    userDeclared: true,
    needsGuide: true,
    reason: 'missing',
    current: [],
    expected: ['low', 'high'],
    matched: true,
    mode: 'replace',
    noteKey: null,
    note: 'fixture note',
    warning: null,
    entryHead: '- id: fixture-model',
    fieldBlock: '  reasoningEfforts:',
    entryLine: '- id: fixture-model',
    entryPath: 'llm-pi-ai.providers.fixture-provider.models',
    modelIndent: 10,
    settingsPath: null,
    ...overrides,
  }
}

/** A fake session-state capability that records the last session it was asked about. */
function turboFixture(): Turbo & { readonly seen: string[] } {
  const sessions: Record<string, SessionFlags> = {}
  let skin: Skin = 'fluid'
  const seen: string[] = []
  return {
    seen,
    sample: () => ZERO_SAMPLE,
    stateOf: (sessionId) => sessionFlagsOf(sessions, sessionId),
    snapshot: (sessionId) => {
      if (sessionId !== undefined) seen.push(sessionId)
      const flags = sessionFlagsOf(sessions, sessionId)
      return buildSnapshot(flags, skin, ZERO_SAMPLE, 42, sessionId === undefined ? '' : policyText(flags))
    },
    update: async (patch) => {
      let flags: SessionFlags = { lightning: false, ultra: false }
      if (patch.session !== undefined) {
        flags = { ...sessionFlagsOf(sessions, patch.session), ...patch.lightning === undefined ? {} : { lightning: patch.lightning }, ...patch.ultra === undefined ? {} : { ultra: patch.ultra } }
        sessions[patch.session] = flags
      }
      if (patch.skin !== undefined) skin = patch.skin
      return { ...flags, skin }
    },
    policyOf: (sessionId) => policyText(sessionFlagsOf(sessions, sessionId)),
    refresh: () => {},
    dispose: () => {},
  }
}

/** Build the endpoint dependencies with overridable guidance/turbo providers. */
function depsFixture(overrides: Partial<EndpointDeps> = {}): EndpointDeps {
  const guidance: GuidanceApi = {
    entries: () => [],
    diagnose: async () => guidanceFixture(),
  }
  return {
    guidance: () => guidance,
    turbo: () => turboFixture(),
    ...overrides,
  }
}

describe('client-request envelope', () => {
  it('accepts the documented request shape and keeps the payload', () => {
    expect(parseEnvelope({ type: 'client-request', rpcId: 'r1', method: 'diagnose', payload: { a: 1 } }))
      .toEqual({ rpcId: 'r1', method: 'diagnose', payload: { a: 1 } })
    expect(parseEnvelope({ type: 'client-request', rpcId: 'r1', method: 'store' }))
      .toEqual({ rpcId: 'r1', method: 'store', payload: undefined })
  })

  it('rejects anything the shared transport would reject', () => {
    expect(parseEnvelope(undefined)).toBeUndefined()
    expect(parseEnvelope({ type: 'server-response', rpcId: 'r', method: 'm' })).toBeUndefined()
    expect(parseEnvelope({ type: 'client-request', rpcId: '', method: 'm' })).toBeUndefined()
    expect(parseEnvelope({ type: 'client-request', rpcId: 1, method: 'm' })).toBeUndefined()
    expect(parseEnvelope({ type: 'client-request', rpcId: 'r', method: '' })).toBeUndefined()
    expect(parseEnvelope({ type: 'client-request', rpcId: 'r', method: 5 })).toBeUndefined()
  })

  it('serializes the server-response envelope the browser half parses', () => {
    expect(JSON.parse(envelopeOf('r1', okResult({ value: 1 })))).toEqual({
      type: 'server-response',
      rpcId: 'r1',
      result: { ok: true, value: { value: 1 } },
    })
    expect(JSON.parse(envelopeOf('r2', failResult('not-found', 'nope')))).toEqual({
      type: 'server-response',
      rpcId: 'r2',
      result: { ok: false, error: { code: 'not-found', message: 'nope', details: {} } },
    })
  })
})

describe('endpoint extraction', () => {
  it('extracts flat and nested endpoint names from the channel prefix', () => {
    expect(endpointOf(`${RPC_CHANNEL}/diagnose`)).toBe('diagnose')
    expect(endpointOf(`${RPC_CHANNEL}/session/state?session=session-1`)).toBe('session/state')
    expect(endpointOf(`${RPC_CHANNEL}/session/update`)).toBe('session/update')
  })

  it('rejects other prefixes and traversal-ish names', () => {
    expect(endpointOf(undefined)).toBeUndefined()
    expect(endpointOf('/api/diagnose')).toBeUndefined()
    expect(endpointOf(`${RPC_CHANNEL}/`)).toBeUndefined()
    expect(endpointOf(`${RPC_CHANNEL}/session/../state`)).toBeUndefined()
    expect(endpointOf(`${RPC_CHANNEL}/session state`)).toBeUndefined()
  })
})

describe('endpoint dispatch', () => {
  it('answers unknown endpoints with a stable code', async () => {
    expect(await dispatchEndpoint(depsFixture(), 'nope', {})).toEqual(failResult('not-found', 'unknown endpoint "nope"'))
  })

  it('validates the diagnose payload', async () => {
    const deps = depsFixture()
    expect(await dispatchEndpoint(deps, 'diagnose', {})).toEqual(failResult('invalid-request', 'provider and model are required'))
    expect(await dispatchEndpoint(deps, 'diagnose', { provider: 'p' })).toEqual(failResult('invalid-request', 'provider and model are required'))
  })

  it('reports unavailable guidance services with a stable code', async () => {
    const deps = depsFixture({ guidance: () => undefined })
    expect(await dispatchEndpoint(deps, 'diagnose', { provider: 'p', model: 'm' })).toEqual(
      failResult('guidance-unavailable', 'guide services are not mounted in this profile'),
    )
    expect(await dispatchEndpoint(deps, 'store', {})).toEqual(okResult({ entries: [] }))
  })

  it('returns the guidance object unchanged', async () => {
    const expected = guidanceFixture()
    const deps = depsFixture({
      guidance: () => ({ entries: () => [], diagnose: async () => expected }),
    })
    expect(await dispatchEndpoint(deps, 'diagnose', { provider: 'p', model: 'm' })).toEqual(okResult(expected))
  })

  it('contains diagnose failures in the result envelope', async () => {
    const deps = depsFixture({
      guidance: () => ({
        entries: () => [],
        diagnose: async () => {
          throw new Error('boom')
        },
      }),
    })
    expect(await dispatchEndpoint(deps, 'diagnose', { provider: 'p', model: 'm' })).toEqual(
      failResult('diagnose-failed', 'diagnose failed: boom'),
    )
  })

  it('lists the user-configured knowledge entries', async () => {
    const entries = [{ id: 'x', provider: '*', model: 'x', note: 'n', efforts: { low: 'low' } }]
    const deps = depsFixture({ guidance: () => ({ entries: () => entries, diagnose: async () => guidanceFixture() }) })
    expect(await dispatchEndpoint(deps, 'store', {})).toEqual(okResult({ entries }))
  })

  it('degrades session/state without a session to the default snapshot', async () => {
    const deps = depsFixture()
    expect(await dispatchEndpoint(deps, 'session/state', {})).toEqual(okResult({
      lightning: false,
      ultra: false,
      skin: 'fluid',
      rate: 0,
      gen: 0,
      agents: 0,
      generating: false,
      total: 0,
      stamp: 42,
      policy: '',
    }))
  })

  it('passes a known session id to the snapshot', async () => {
    const turbo = turboFixture()
    await dispatchEndpoint({ guidance: () => undefined, turbo: () => turbo }, 'session/state', { session: 'session-a' })
    expect(turbo.seen).toEqual(['session-a'])
  })

  it('never fails session/state for unusable payloads', async () => {
    const deps = depsFixture()
    expect((await dispatchEndpoint(deps, 'session/state', { session: 42 })).ok).toBe(true)
    expect((await dispatchEndpoint(deps, 'session/state', null)).ok).toBe(true)
    expect((await dispatchEndpoint(deps, 'session/state', {})).ok).toBe(true)
  })

  it('accepts a skin-only update and leaves session toggles untouched', async () => {
    const turbo = turboFixture()
    const result = await dispatchEndpoint({ guidance: () => undefined, turbo: () => turbo }, 'session/update', { skin: 'holo' })
    expect(result).toEqual(okResult({ lightning: false, ultra: false, skin: 'holo' }))
    expect(turbo.seen).toEqual([])
  })

  it('applies a session update and returns the resolved flags', async () => {
    const result = await dispatchEndpoint(depsFixture(), 'session/update', { session: 'session-a', lightning: true })
    expect(result).toEqual(okResult({ lightning: true, ultra: false, skin: 'fluid' }))
  })

  it('rejects malformed update payloads without throwing', async () => {
    const deps = depsFixture()
    expect(await dispatchEndpoint(deps, 'session/update', { skin: 'nebula' })).toEqual(
      failResult('invalid-request', 'lightning/ultra must be booleans and skin must be holo, chrome, or fluid'),
    )
    expect(await dispatchEndpoint(deps, 'session/update', { lightning: 'on' })).toEqual(
      failResult('invalid-request', 'lightning/ultra must be booleans and skin must be holo, chrome, or fluid'),
    )
    expect(await dispatchEndpoint(deps, 'session/update', { session: 42 })).toEqual(
      failResult('invalid-session', 'session must be a non-empty session id'),
    )
  })

  it('contains update failures in the result envelope', async () => {
    const turbo = turboFixture()
    const failing: Turbo = { ...turbo, update: async () => { throw new Error('disk full') } }
    expect(await dispatchEndpoint({ guidance: () => undefined, turbo: () => failing }, 'session/update', { skin: 'holo' }))
      .toEqual(failResult('update-failed', 'session update failed: disk full'))
  })

  it('never fails session/policy and returns empty text for an unknown session', async () => {
    expect(await dispatchEndpoint(depsFixture(), 'session/policy', {})).toEqual(okResult({ text: '' }))
    expect(await dispatchEndpoint(depsFixture(), 'session/policy', { session: 'session-unknown' })).toEqual(okResult({ text: '' }))
  })

  it('returns the active policy body for a session with a mode on', async () => {
    const turbo = turboFixture()
    await turbo.update({ session: 'session-a', ultra: true })
    const result = await dispatchEndpoint({ guidance: () => undefined, turbo: () => turbo }, 'session/policy', { session: 'session-a' })
    expect(result).toEqual(okResult({ text: policyText({ ultra: true }) }))
  })
})

/** A minimal node request stand-in that emits its own body. */
class FakeRequest implements RouteRequest {
  readonly headers: Record<string, string>
  readonly method: string | undefined
  readonly url: string | undefined
  private readonly dataListeners: Array<(chunk: Uint8Array) => void> = []
  private readonly endListeners: Array<() => void> = []
  private readonly errorListeners: Array<(error: unknown) => void> = []

  constructor(method: string | undefined, url: string | undefined, contentType = 'application/json') {
    this.method = method
    this.url = url
    this.headers = { 'content-type': contentType }
  }

  on(event: 'data', listener: (chunk: Uint8Array) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: unknown) => void): void
  on(
    event: 'data' | 'end' | 'error',
    listener: ((chunk: Uint8Array) => void) | (() => void) | ((error: unknown) => void),
  ): void {
    if (event === 'data') this.dataListeners.push(listener as (chunk: Uint8Array) => void)
    else if (event === 'end') this.endListeners.push(listener as () => void)
    else this.errorListeners.push(listener as (error: unknown) => void)
  }

  emitBody(body: string): void {
    const chunk = new TextEncoder().encode(body)
    for (const listener of this.dataListeners) listener(chunk)
    for (const listener of this.endListeners) listener()
  }

  emitError(error: unknown): void {
    for (const listener of this.errorListeners) listener(error)
  }
}

/** A minimal node response stand-in that records the written status and body. */
class FakeResponse implements RouteResponse {
  status: number | undefined
  headers: Record<string, string> | undefined
  body: string | undefined

  writeHead(status: number, headers?: Record<string, string>): unknown {
    this.status = status
    this.headers = headers
    return this
  }

  end(body?: string): unknown {
    this.body = body
    return this
  }
}

/** Run one full channel request whose body is emitted immediately after dispatch starts. */
async function runChannel(
  handler: ReturnType<typeof createChannelHandler>,
  request: FakeRequest,
  response = new FakeResponse(),
  body?: string,
): Promise<FakeResponse> {
  const done = handler(request, response)
  if (body !== undefined) request.emitBody(body)
  await done
  return response
}

/** Build a channel with a pass-through authorization fence. */
function channelFixture(options: { readonly reject?: 401 | 403 } = {}) {
  return createChannelHandler({
    authorize: () => options.reject,
    guidance: () => ({ entries: () => [], diagnose: async () => guidanceFixture() }),
    turbo: () => turboFixture(),
  })
}

describe('channel handler', () => {
  it('applies the authentication fence before anything else', async () => {
    const response = await runChannel(channelFixture({ reject: 401 }), new FakeRequest('POST', `${RPC_CHANNEL}/store`), new FakeResponse(), '{}')
    expect(response.status).toBe(401)
    expect(response.body).toBe('unauthorized')
    const forbidden = await runChannel(channelFixture({ reject: 403 }), new FakeRequest('POST', `${RPC_CHANNEL}/store`))
    expect(forbidden.status).toBe(403)
    expect(forbidden.body).toBe('forbidden')
  })

  it('answers non-POST and off-channel requests with 404', async () => {
    const getResponse = await runChannel(channelFixture(), new FakeRequest('GET', `${RPC_CHANNEL}/store`))
    expect(getResponse.status).toBe(404)
    const offChannel = await runChannel(channelFixture(), new FakeRequest('POST', '/api/session-board/board'))
    expect(offChannel.status).toBe(404)
  })

  it('requires the JSON content type', async () => {
    const response = await runChannel(
      channelFixture(),
      new FakeRequest('POST', `${RPC_CHANNEL}/store`, 'text/plain'),
      new FakeResponse(),
      '{}',
    )
    expect(response.status).toBe(415)
  })

  it('answers malformed JSON and oversized bodies with 400', async () => {
    const invalid = await runChannel(channelFixture(), new FakeRequest('POST', `${RPC_CHANNEL}/store`), new FakeResponse(), '{nope')
    expect(invalid.status).toBe(400)
    const oversized = await runChannel(
      channelFixture(),
      new FakeRequest('POST', `${RPC_CHANNEL}/store`),
      new FakeResponse(),
      'x'.repeat(MAX_REQUEST_BYTES + 1),
    )
    expect(oversized.status).toBe(400)
  })

  it('requires the envelope method to match the addressed endpoint', async () => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'diagnose', payload: {} })
    const response = await runChannel(channelFixture(), new FakeRequest('POST', `${RPC_CHANNEL}/store`), new FakeResponse(), body)
    expect(response.status).toBe(400)
    expect(response.body).toBe('invalid client-request message')
  })

  it('answers a well-formed request with the server-response envelope', async () => {
    const body = JSON.stringify({ type: 'client-request', rpcId: 'r1', method: 'store', payload: {} })
    const response = await runChannel(channelFixture(), new FakeRequest('POST', `${RPC_CHANNEL}/store`), new FakeResponse(), body)
    expect(response.status).toBe(200)
    expect(response.headers).toEqual({ 'content-type': 'application/json' })
    expect(JSON.parse(response.body ?? '')).toEqual({
      type: 'server-response',
      rpcId: 'r1',
      result: { ok: true, value: { entries: [] } },
    })
  })

  it('contains capability failures in the response envelope', async () => {
    const handler = createChannelHandler({
      authorize: () => undefined,
      guidance: () => undefined,
      turbo: () => {
        throw new Error('state gone')
      },
    })
    const body = JSON.stringify({ type: 'client-request', rpcId: 'r9', method: 'session/state', payload: {} })
    const response = await runChannel(handler, new FakeRequest('POST', `${RPC_CHANNEL}/session/state`), new FakeResponse(), body)
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body ?? '')).toEqual({
      type: 'server-response',
      rpcId: 'r9',
      result: { ok: false, error: { code: 'channel-failed', message: 'channel failed: state gone', details: {} } },
    })
  })

  it('turns a request stream failure into 400', async () => {
    const handler = channelFixture()
    const request = new FakeRequest('POST', `${RPC_CHANNEL}/store`)
    const response = new FakeResponse()
    const done = handler(request, response)
    request.emitError(new Error('socket reset'))
    await done
    expect(response.status).toBe(400)
  })
})
