/**
 * The host half's HTTP surface: two authenticated JSON routes on the shared
 * `/api` channel and one raw SSE route.
 *
 * The split is deliberate. Ack and snapshot go through `connection.fetch`,
 * which applies the Host/Origin trust fence and browser authentication for the
 * caller. The stream needs to hold a response open, which the Fetch form cannot
 * express, so it registers directly on `webServer` — and pays for that by
 * asking `connection.requestRejection` itself (see the handler).
 *
 * Every dependency is injected rather than reached through a context, so the
 * whole module is exercisable without a harness.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BoardFeed } from '../shared/types.ts'
import { EMPTY_FEED } from '../shared/types.ts'
import { WIKI_ARCHIVE_PATH, WIKI_WORKFLOW_CAPABILITY } from '../shared/archive.ts'
import { WikiArchiveError, validateWikiIds, type WikiArchiver } from './wiki-archive.ts'

/**
 * Physical request paths. `ConnectionFetchRoute.path` is matched against the
 * full request pathname and must start with `/api/`, so these are the exact
 * URLs the browser calls — not paths relative to the channel.
 */
export const BOARD_API_PREFIX = '/api/session-board'
/** `GET` → the whole durable snapshot. */
export const BOARD_SNAPSHOT_PATH = `${BOARD_API_PREFIX}/board`
/** `POST { sessionId }` → move that session's acknowledged cursor. */
export const BOARD_ACK_PATH = `${BOARD_API_PREFIX}/ack`
/** POST { sessionIds } → archive selected sessions into the local Wiki raw layer. */
export const BOARD_WIKI_ARCHIVE_PATH = WIKI_ARCHIVE_PATH
/** Prefix owned by the raw SSE route. */
export const BOARD_STREAM_PREFIX = '/dsh-session-board'
/** `GET` → `text/event-stream`, one `state` frame per change. */
export const BOARD_STREAM_PATH = `${BOARD_STREAM_PREFIX}/stream`

/**
 * Upper bound on a session id accepted from the wire, before it becomes a
 * storage key. Real ids are UUID-shaped; anything longer is a hostile caller
 * trying to grow the durable medium through this route.
 */
const SESSION_ID_MAX = 200

/** One exact Fetch route on the shared `/api` channel. */
export interface BoardFetchRoute {
  readonly path: string
  readonly methods: readonly ('GET' | 'HEAD' | 'POST')[]
  readonly requestBody: 'buffered'
  readonly fetch: (request: Request) => Promise<Response>
}

/** One raw prefix route on the web server. */
export interface BoardWebRoute {
  readonly kind: 'prefix'
  readonly path: string
  readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** Trust-fence input: the headers of one incoming request. */
export interface BoardTrustRequest {
  readonly headers: IncomingMessage['headers']
}

/** Collaborators of {@link createBoardRoutes}. */
export interface BoardRoutesOptions {
  /** Whole durable state. Must be synchronous and must not throw. */
  readonly snapshot: () => BoardFeed
  /** Persist one ack; resolves true only once the write is durable. */
  readonly ack: (sessionId: string) => Promise<boolean>
  /** Archive exact selected DSH IDs into the local Wiki raw layer. */
  readonly wikiArchive: WikiArchiver
  /** Connection's Host/Origin + browser-session fence. */
  readonly requestRejection: (request: BoardTrustRequest) => 401 | 403 | undefined
  /** Containment sink for request-time failures. */
  readonly warn: (message: string) => void
}

/** The registered routes plus the fan-out they share. */
export interface BoardRoutes {
  /** Exact Fetch routes; register each inside its own effect scope. */
  readonly fetchRoutes: readonly BoardFetchRoute[]
  /** The SSE prefix route; register inside an effect scope. */
  readonly streamRoute: BoardWebRoute
  /** Push the current snapshot to every held stream. */
  broadcast(): void
  /** End every held stream; the plugin's unload path. */
  close(): void
}

/**
 * Build the board's routes over injected state readers.
 * @param options - snapshot/ack readers plus the trust fence and log sink.
 * @returns the routes, the broadcaster, and the teardown for held streams.
 */
export function createBoardRoutes(options: BoardRoutesOptions): BoardRoutes {
  /** Responses currently held open for SSE. */
  const held = new Set<ServerResponse>()

  /** One SSE frame carrying the whole feed. */
  const frame = (feed: BoardFeed): string => `event: state\ndata: ${JSON.stringify(feed)}\n\n`

  /**
   * Snapshot read hardened for the request path: a broken reader degrades to an
   * empty feed instead of hanging or rejecting the request.
   */
  const readFeed = (): BoardFeed => {
    try {
      return options.snapshot()
    } catch (error) {
      options.warn(`dsh-session-board: snapshot read failed: ${describeError(error)}`)
      return EMPTY_FEED
    }
  }

  /**
   * Write one frame to one held response.
   *
   * A dead peer must cost that one socket, not the broadcast: `write` throws on
   * some teardown paths and reports asynchronously on others (destroyed peer),
   * so both are turned into "drop this response".
   */
  const write = (res: ServerResponse, chunk: string): boolean => {
    if (res.writableEnded || res.destroyed) return false
    try {
      res.write(chunk, (error) => { if (error) held.delete(res) })
      return true
    } catch {
      return false
    }
  }

  const broadcast = (): void => {
    if (held.size === 0) return
    const chunk = frame(readFeed())
    // Deleting the current entry during Set iteration is well defined; the
    // async write callback above may also delete, which is why removal is
    // idempotent.
    for (const res of held) {
      if (!write(res, chunk)) held.delete(res)
    }
  }

  const snapshotRoute: BoardFetchRoute = {
    path: BOARD_SNAPSHOT_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    // Never awaits the domain: before it is ready this answers with an empty
    // feed, and the connecting stream delivers the first real snapshot.
    fetch: async () => jsonResponse(200, readFeed()),
  }

  const ackRoute: BoardFetchRoute = {
    path: BOARD_ACK_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const sessionId = readSessionId(await readJsonBody(request))
      if (sessionId === null) {
        return jsonResponse(400, { ok: false, error: 'sessionId must be a non-empty string' })
      }
      const durable = await options.ack(sessionId)
      if (!durable) {
        return jsonResponse(500, { ok: false, error: 'acknowledgement could not be stored' })
      }
      // The frame this request caused. Event-driven writes push their own
      // through the ledger's change hook; this one is the route's to send.
      broadcast()
      return jsonResponse(200, { ok: true })
    },
  }

  type ArchiveOperation = { state: 'running' } | { state: 'completed'; result: Awaited<ReturnType<WikiArchiver['commit']>> } | { state: 'failed'; error: string }
  const archiveOperations = new Map<string, ArchiveOperation>()
  const wikiArchiveRoute: BoardFetchRoute = {
    path: BOARD_WIKI_ARCHIVE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      const body = await readJsonBody(request)
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return jsonResponse(400, { ok: false, error: 'INVALID_SELECTION' })
      const value = body as Record<string, unknown>
      try {
        if (value.action === 'capabilities') return jsonResponse(200, { ok: true, capabilities: { workflow: WIKI_WORKFLOW_CAPABILITY } })
        if (value.action === 'preview') {
          const preview = await options.wikiArchive.preview(validateWikiIds(value.sessionIds))
          return jsonResponse(200, { ok: true, preview })
        }
        if ((value.action === 'start' || value.action === 'status') && typeof value.token === 'string' && value.token.length <= 100) {
          let operation = archiveOperations.get(value.token)
          if (value.action === 'start' && operation === undefined) {
            if ([...archiveOperations.values()].some(item => item.state === 'running')) throw new WikiArchiveError('BUSY')
            // Bounded retained results let a retry observe the same operation without duplicating model calls.
            if (archiveOperations.size >= 20) archiveOperations.delete(archiveOperations.keys().next().value as string)
            const token = value.token
            archiveOperations.set(token, { state: 'running' })
            void options.wikiArchive.commit(token).then(
              result => { archiveOperations.set(token, { state: 'completed', result }) },
              error => { archiveOperations.set(token, { state: 'failed', error: error instanceof WikiArchiveError ? error.code : 'ARCHIVE_UNAVAILABLE' }) },
            )
            operation = archiveOperations.get(token)
          }
          if (operation === undefined) throw new WikiArchiveError('PREVIEW_EXPIRED')
          return jsonResponse(200, { ok: true, operation })
        }
        if (value.action === 'commit' && typeof value.token === 'string' && value.token.length <= 100) {
          const result = await options.wikiArchive.commit(value.token)
          return jsonResponse(200, { ok: true, result })
        }
        return jsonResponse(400, { ok: false, error: 'INVALID_SELECTION' })
      } catch (error) {
        options.warn(`dsh-session-board: wiki archive failed: ${describeError(error)}`)
        const code = error instanceof WikiArchiveError ? error.code : 'ARCHIVE_UNAVAILABLE'
        const status = code === 'INVALID_SELECTION' ? 400 : code === 'BUSY' ? 429 : 409
        return jsonResponse(status, { ok: false, error: code })
      }
    },
  }

  const streamRoute: BoardWebRoute = {
    kind: 'prefix',
    path: BOARD_STREAM_PREFIX,
    handler: (req, res) => {
      // SECURITY: a custom webServer route does NOT inherit the host auth gate.
      // Nothing else may run before this fence admits the caller, or the
      // board's session metadata is readable from any process that can reach
      // the port.
      const rejection = options.requestRejection(req)
      if (rejection !== undefined) {
        res.writeHead(rejection, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('unauthorized')
        return
      }
      const url = new URL(req.url ?? '/', 'http://dsh-session-board')
      if (req.method !== 'GET' || url.pathname !== BOARD_STREAM_PATH) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: false, error: 'not found' }))
        return
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        // `no-transform` keeps intermediaries from buffering or rewriting the
        // frames; the web server's gzip filter already skips this media type.
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })
      // Registered before the hello frame so a change landing in between is
      // still delivered; EventSource reconnects resend the full snapshot, so a
      // client that missed frames converges without a resume protocol.
      held.add(res)
      if (!write(res, frame(readFeed()))) held.delete(res)
      const remove = (): void => { held.delete(res) }
      req.on('close', remove)
      res.on('close', remove)
    },
  }

  return {
    fetchRoutes: [snapshotRoute, ackRoute, wikiArchiveRoute],
    streamRoute,
    broadcast,
    close: () => {
      for (const res of held) {
        try {
          res.end()
        } catch {
          // The peer is already gone; the entry is dropped with the set.
        }
      }
      held.clear()
    },
  }
}

/** JSON response for the API channel (no-store: both routes serve live state). */
function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/** Read a request body as JSON; a malformed or empty body is exactly null. */
async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/**
 * Validate the ack body at the wire.
 * @param body - Parsed JSON body.
 * @returns the session id to acknowledge, or null when the body is unusable.
 */
function readSessionId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const value = (body as { sessionId?: unknown }).sessionId
  if (typeof value !== 'string') return null
  const sessionId = value.trim()
  if (sessionId === '' || sessionId.length > SESSION_ID_MAX) return null
  return sessionId
}

/** One-line description of a caught value for logs; never throws. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
