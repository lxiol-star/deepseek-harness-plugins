/**
 * The authenticated loopback RPC channel shared with the browser half.
 *
 * One prefix route, `POST /dsh-whale-effort/<endpoint>`, carrying the same
 * envelope the shared Connection transport uses:
 *
 * - request: `{ type: 'client-request', rpcId, method, payload? }`
 * - response: `{ type: 'server-response', rpcId, result }` where `result` is
 *   `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }`.
 *
 * The handler answers requests only after `requestRejection` (Host/Origin plus
 * browser-session authentication) admits them, and nothing here throws to the
 * server: every failure becomes an error envelope.
 *
 * @module dsh-whale-effort/host/rpc
 */

import type { GuidanceApi } from './guidance.js'
import type { Turbo, TurboUpdate } from './turbo.js'
import { isSessionId, SKINS, type Skin, describeError } from './state.js'

/** Prefix the browser half posts to. */
export const RPC_CHANNEL = '/dsh-whale-effort'

/** Largest request body this channel accepts, in bytes. */
export const MAX_REQUEST_BYTES = 64 * 1024

/** A plain JSON object (the only envelope body the browser half parses). */
export type JsonObject = Record<string, unknown>

/** The node request surface one prefix route owns. */
export interface RouteRequest {
  /** HTTP method, if present. */
  readonly method?: string
  /** Request target, if present. */
  readonly url?: string
  /** Request headers. */
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>
  /** Register one request stream listener. */
  on(event: 'data', listener: (chunk: Uint8Array) => void): void
  /** Register the end-of-stream listener. */
  on(event: 'end', listener: () => void): void
  /** Register the stream-failure listener. */
  on(event: 'error', listener: (error: unknown) => void): void
}

/** The node response surface one prefix route owns. */
export interface RouteResponse {
  /** Write the status line and headers. */
  writeHead(status: number, headers?: Record<string, string>): unknown
  /** Complete the response. */
  end(body?: string): unknown
}

/** One decoded `client-request` envelope posted by the browser half. */
export interface ClientRequestEnvelope {
  /** Caller-chosen correlation id, echoed on the response. */
  readonly rpcId: string
  /** Endpoint the envelope addresses. */
  readonly method: string
  /** Endpoint-specific body. */
  readonly payload?: unknown
}

/** @returns a success result envelope body. */
export function okResult(value: unknown): JsonObject {
  return { ok: true, value }
}

/**
 * @param code - stable machine code for the browser half.
 * @param message - human-readable summary.
 * @returns a failure result envelope body; `details` is always an object.
 */
export function failResult(code: string, message: string): JsonObject {
  return { ok: false, error: { code, message, details: {} } }
}

/** @returns a plain object test usable for field validation. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse one `client-request` envelope.
 * @param value - decoded JSON body of any shape.
 * @returns the envelope, or undefined when it is not a well-formed request.
 */
export function parseEnvelope(value: unknown): ClientRequestEnvelope | undefined {
  if (!isRecord(value) || value['type'] !== 'client-request') return undefined
  const rpcId = value['rpcId']
  const method = value['method']
  if (typeof rpcId !== 'string' || rpcId.length === 0) return undefined
  if (typeof method !== 'string' || method.length === 0) return undefined
  return { rpcId, method, payload: value['payload'] }
}

/**
 * Serialize one `server-response` envelope.
 * @param rpcId - correlation id being answered.
 * @param result - result body from {@link okResult} / {@link failResult}.
 * @returns the JSON response body.
 */
export function envelopeOf(rpcId: string, result: JsonObject): string {
  return JSON.stringify({ type: 'server-response', rpcId, result })
}

/**
 * Extract the endpoint segment of a channel URL.
 * @param url - request target, possibly carrying a query string.
 * @returns the endpoint name, or undefined when the path is not this channel's.
 */
export function endpointOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  const pathname = url.split('?')[0] ?? ''
  const prefix = `${RPC_CHANNEL}/`
  if (!pathname.startsWith(prefix)) return undefined
  const endpoint = pathname.slice(prefix.length)
  // Nested endpoint names use `/` (`session/state`); every other segment stays
  // opaque. Empty, `.`, and `..` segments are refused exactly like the shared
  // browser RPC caller refuses them.
  const segments = endpoint.split('/')
  const valid = segments.every((segment) =>
    segment !== '' && segment !== '.' && segment !== '..' && /^[A-Za-z0-9_$.-]+$/u.test(segment))
  return valid ? endpoint : undefined
}

/**
 * Read one JSON request body, refusing anything past {@link MAX_REQUEST_BYTES}.
 * @param request - request stream.
 * @returns the parsed JSON value.
 */
export function readJsonBody(request: RouteRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    const decoder = new TextDecoder()
    let bytes = 0
    let settled = false
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      reject(error instanceof Error ? error : new Error('request stream failed'))
    }
    request.on('data', (chunk) => {
      if (settled) return
      bytes += chunk.length
      if (bytes > MAX_REQUEST_BYTES) {
        fail(new Error('body too large'))
        return
      }
      // HTTP chunks can split a UTF-8 character; keep incomplete bytes for the next chunk.
      chunks.push(decoder.decode(chunk, { stream: true }))
    })
    request.on('end', () => {
      if (settled) return
      settled = true
      try {
        chunks.push(decoder.decode())
        resolve(JSON.parse(chunks.join('')))
      } catch (error) {
        reject(error instanceof Error ? error : new Error('body is not JSON'))
      }
    })
    request.on('error', fail)
  })
}

/** What the endpoint dispatcher may call. */
export interface EndpointDeps {
  /** Current guidance capability (replaced when the settings/model services mount). */
  readonly guidance: () => GuidanceApi | undefined
  /** Current session-state capability. */
  readonly turbo: () => Turbo
}

/** Read one optional payload record field as a non-empty session id. */
function sessionField(payload: Record<string, unknown>): string | undefined {
  const session = payload['session']
  return typeof session === 'string' && session.length > 0 ? session : undefined
}

/** Read one optional boolean patch field; invalid types are reported. */
function booleanField(payload: Record<string, unknown>, key: string): boolean | undefined | 'invalid' {
  const value = payload[key]
  if (value === undefined) return undefined
  return typeof value === 'boolean' ? value : 'invalid'
}

/** Read one optional skin patch field; invalid types are reported. */
function skinField(payload: Record<string, unknown>): Skin | undefined | 'invalid' {
  const value = payload['skin']
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !(SKINS as readonly string[]).includes(value)) return 'invalid'
  return value as Skin
}

/**
 * Answer one endpoint with the result envelope body the browser half parses.
 * @param deps - current guidance and session capabilities.
 * @param endpoint - addressed endpoint name.
 * @param payload - decoded request payload.
 * @returns the result body; never rejects for endpoint-level failures.
 */
export async function dispatchEndpoint(
  deps: EndpointDeps,
  endpoint: string,
  payload: unknown,
): Promise<JsonObject> {
  const request = isRecord(payload) ? payload : {}
  switch (endpoint) {
    case 'diagnose': {
      const provider = request['provider']
      const model = request['model']
      if (typeof provider !== 'string' || provider.length === 0 || typeof model !== 'string' || model.length === 0) {
        return failResult('invalid-request', 'provider and model are required')
      }
      const guidance = deps.guidance()
      if (guidance === undefined) return failResult('guidance-unavailable', 'guide services are not mounted in this profile')
      try {
        return okResult(await guidance.diagnose(provider, model))
      } catch (error) {
        return failResult('diagnose-failed', `diagnose failed: ${describeError(error)}`)
      }
    }
    case 'store': {
      const guidance = deps.guidance()
      return okResult({ entries: guidance === undefined ? [] : [...guidance.entries()] })
    }
    case 'session/state': {
      // Never throws: an absent or unusable session id degrades to the default snapshot.
      return okResult(deps.turbo().snapshot(sessionField(request)))
    }
    case 'session/update': {
      const lightning = booleanField(request, 'lightning')
      const ultra = booleanField(request, 'ultra')
      const skin = skinField(request)
      if (lightning === 'invalid' || ultra === 'invalid' || skin === 'invalid') {
        return failResult('invalid-request', 'lightning/ultra must be booleans and skin must be holo, chrome, or fluid')
      }
      const rawSession = request['session']
      if (rawSession !== undefined && !isSessionId(rawSession)) {
        return failResult('invalid-session', 'session must be a non-empty session id')
      }
      const patch: TurboUpdate = {
        ...(typeof rawSession === 'string' ? { session: rawSession } : {}),
        ...(lightning === undefined ? {} : { lightning }),
        ...(ultra === undefined ? {} : { ultra }),
        ...(skin === undefined ? {} : { skin }),
      }
      try {
        return okResult(await deps.turbo().update(patch))
      } catch (error) {
        return failResult('update-failed', `session update failed: ${describeError(error)}`)
      }
    }
    case 'session/policy': {
      // Never throws: an unknown session simply has no active policy.
      const session = sessionField(request)
      return okResult({ text: session === undefined ? '' : deps.turbo().policyOf(session) })
    }
    default:
      return failResult('not-found', `unknown endpoint ${JSON.stringify(endpoint)}`)
  }
}

/** What the channel route needs from its owner. */
export interface ChannelOptions extends EndpointDeps {
  /**
   * Apply the deployment's Host/Origin and browser-session fence.
   * @param request - incoming request headers.
   * @returns a rejection status, or undefined when the request may proceed.
   */
  readonly authorize: (request: RouteRequest) => 401 | 403 | undefined
}

/**
 * Build the HTTP handler for the channel's prefix route.
 * @param options - authorization fence plus the endpoint capabilities.
 * @returns the request handler; it answers every path without throwing.
 */
export function createChannelHandler(
  options: ChannelOptions,
): (request: RouteRequest, response: RouteResponse) => Promise<void> {
  return async (request, response) => {
    const rejection = options.authorize(request)
    if (rejection !== undefined) {
      response.writeHead(rejection)
      response.end(rejection === 401 ? 'unauthorized' : 'forbidden')
      return
    }
    const endpoint = endpointOf(request.url)
    if (request.method !== 'POST' || endpoint === undefined) {
      response.writeHead(404)
      response.end('not found')
      return
    }
    const mediaType = String(request.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase()
    if (mediaType !== 'application/json') {
      response.writeHead(415)
      response.end('content type must be application/json')
      return
    }
    let body: unknown
    try {
      body = await readJsonBody(request)
    } catch {
      response.writeHead(400)
      response.end('body is not JSON')
      return
    }
    const message = parseEnvelope(body)
    if (message === undefined || message.method !== endpoint) {
      response.writeHead(400)
      response.end('invalid client-request message')
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    try {
      response.end(envelopeOf(message.rpcId, await dispatchEndpoint(options, endpoint, message.payload)))
    } catch (error) {
      response.end(envelopeOf(message.rpcId, failResult('channel-failed', `channel failed: ${describeError(error)}`)))
    }
  }
}
