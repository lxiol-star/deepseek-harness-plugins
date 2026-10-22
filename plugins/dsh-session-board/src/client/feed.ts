/**
 * The host feed subscription.
 *
 * The host half is the only writer of durable acknowledgement and turn facts,
 * and it pushes one full snapshot per change. This file keeps that snapshot,
 * tracks whether the push channel is live, and degrades silently when SSE is
 * unavailable: the panel then falls back to the client's own
 * `completionUnread` signal, which needs no host at all.
 */
import { EMPTY_FEED, type BoardAckRecord, type BoardFeed, type BoardTurnStats } from '../shared/types.ts'
import type { ReadonlyStore } from './store.ts'
import { WIKI_WORKFLOW_CAPABILITY, parseArchiveSummary, WIKI_ARCHIVE_PATH, type ArchivePreview, type ArchiveSummary } from '../shared/archive.ts'

/** One archive-route failure: the stable code plus the host's diagnostic line. */
export class ArchiveRequestError extends Error {
  /**
   * @param code - stable code the panel maps to localized copy.
   * @param detail - host/bridge diagnostic, safe for the owner to see.
   */
  constructor(readonly code: string, readonly detail?: string) { super(code) }
}

/** Where the host half serves the stream. */
export const STREAM_PATH = '/dsh-session-board/stream'

/** Where the host half accepts an acknowledgement. */
export const ACK_PATH = '/api/session-board/ack'
export { WIKI_ARCHIVE_PATH } from '../shared/archive.ts'

/** Reconnect backoff ceiling, in milliseconds. */
const RETRY_MAX_MS = 30_000

/** What the panel observes about the host feed. */
export interface BoardFeedState {
  feed: BoardFeed
  /** Whether the push channel is currently open. */
  online: boolean
  /** Epoch ms of the last applied snapshot, 0 before the first one. */
  receivedAt: number
}

/** Narrow an unknown value to a record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Read a finite number or null. */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Read a string or null. */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Parse one wire snapshot. Anything unrecognised is dropped rather than
 * partially applied, so a malformed frame can never corrupt the panel state.
 */
export function parseFeed(raw: unknown): BoardFeed | null {
  const root = asRecord(typeof raw === 'string' ? safeParse(raw) : raw)
  if (root === null) return null

  const acks: Record<string, BoardAckRecord> = Object.create(null) as Record<string, BoardAckRecord>
  const turns: Record<string, BoardTurnStats> = Object.create(null) as Record<string, BoardTurnStats>

  for (const [id, value] of Object.entries(asRecord(root.acks) ?? {})) {
    const record = asRecord(value)
    if (record === null) continue
    acks[id] = {
      lastTurnEnd: numberOrNull(record.lastTurnEnd),
      lastTurnEndKind: stringOrNull(record.lastTurnEndKind),
      lastTurnEndError: stringOrNull(record.lastTurnEndError),
      ackedAt: numberOrNull(record.ackedAt),
    }
  }

  for (const [id, value] of Object.entries(asRecord(root.turns) ?? {})) {
    const record = asRecord(value)
    if (record === null) continue
    turns[id] = {
      busyMs: numberOrNull(record.busyMs),
      openTurnStart: numberOrNull(record.openTurnStart),
      waitedMs: numberOrNull(record.waitedMs),
      openWaitStart: numberOrNull(record.openWaitStart),
      openWaitKind: stringOrNull(record.openWaitKind),
      openWaitId: stringOrNull(record.openWaitId),
    }
  }

  return { acks, turns }
}

/** JSON.parse that returns undefined instead of throwing. */
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** The live feed subscription. */
export class BoardFeedClient implements ReadonlyStore<BoardFeedState> {
  private state: BoardFeedState = { feed: EMPTY_FEED, online: false, receivedAt: 0 }
  private readonly listeners = new Set<() => void>()
  private source: EventSource | null = null
  private retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null
  private retryDelay = 1_000
  private disposed = false

  /** Bound for React. */
  readonly getSnapshot = (): BoardFeedState => this.state

  /** Bound for React. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(next: BoardFeedState): void {
    this.state = next
    for (const listener of [...this.listeners]) listener()
  }

  /** Apply a parsed snapshot. */
  apply(feed: BoardFeed): void {
    if (this.disposed) return
    this.publish({ feed, online: true, receivedAt: Date.now() })
  }

  /** Open the push channel. Reconnects on its own until disposed. */
  start(): void {
    if (this.disposed || this.source !== null) return
    if (typeof globalThis.EventSource !== 'function') {
      // No SSE in this environment: stay in local-only mode.
      return
    }
    try {
      const source = new globalThis.EventSource(STREAM_PATH)
      source.addEventListener('state', (event) => {
        const parsed = parseFeed((event as MessageEvent).data)
        if (parsed !== null) this.apply(parsed)
      })
      source.addEventListener('open', () => {
        this.retryDelay = 1_000
        if (!this.state.online) this.publish({ ...this.state, online: true })
      })
      source.addEventListener('error', () => {
        if (this.state.online) this.publish({ ...this.state, online: false })
        this.reconnect()
      })
      this.source = source
    } catch {
      this.source = null
      this.reconnect()
    }
  }

  /** Tear the channel down and retry after the current backoff. */
  private reconnect(): void {
    if (this.disposed || this.retryTimer !== null) return
    try {
      this.source?.close()
    } catch {
      // Already closed.
    }
    this.source = null
    const delay = this.retryDelay
    this.retryDelay = Math.min(RETRY_MAX_MS, this.retryDelay * 2)
    this.retryTimer = globalThis.setTimeout(() => {
      this.retryTimer = null
      this.start()
    }, delay)
  }

  /** Reconnect immediately (used when the page becomes visible again). */
  resume(): void {
    if (this.disposed) return
    if (this.retryTimer !== null) {
      globalThis.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.source === null) {
      this.retryDelay = 1_000
      this.start()
    }
  }

  /**
   * Acknowledge one session. The durable write is the host's; locally we move
   * the cursor straight away so the card settles without waiting for a round
   * trip, and the next pushed snapshot is authoritative either way.
   */
  private async archiveRequest(body: object): Promise<Record<string, unknown>> {
    const response = await globalThis.fetch(WIKI_ARCHIVE_PATH, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    const payload = asRecord(await response.json().catch(() => null))
    if (!response.ok || payload?.ok !== true) {
      const code = typeof payload?.error === 'string' ? payload.error : response.status === 404 ? 'ARCHIVE_UNAVAILABLE' : 'REQUEST_FAILED'
      throw new ArchiveRequestError(code, typeof payload?.detail === 'string' ? payload.detail : undefined)
    }
    return payload
  }
  /**
   * Refuse to start a workflow the running host half does not implement: a
   * browser bundle can be newer than the host it talks to after an upgrade.
   */
  private async requireWorkflow(): Promise<void> {
    let payload: Record<string, unknown>
    try {
      payload = await this.archiveRequest({ action: 'capabilities' })
    } catch (error) {
      // A missing API is reported as unavailable; a host that rejects the probe predates this workflow.
      if (error instanceof Error && error.message === 'ARCHIVE_UNAVAILABLE') throw error
      throw new Error('HOST_OUTDATED')
    }
    const capabilities = asRecord(payload.capabilities)
    if (capabilities?.workflow !== WIKI_WORKFLOW_CAPABILITY) throw new Error('HOST_OUTDATED')
  }
  async previewArchive(sessionIds: readonly string[]): Promise<ArchivePreview> {
    await this.requireWorkflow()
    const payload = await this.archiveRequest({ action: 'preview', sessionIds })
    const preview = asRecord(payload.preview)
    if (typeof preview?.token !== 'string' || typeof preview.expiresAt !== 'number') throw new Error('INVALID_RESULT')
    return { token: preview.token, expiresAt: preview.expiresAt, summary: parseArchiveSummary(preview.summary) }
  }
  async commitArchive(token: string): Promise<ArchiveSummary> {
    await this.requireWorkflow()
    let payload = await this.archiveRequest({ action: 'start', token })
    while (!this.disposed) {
      const operation = asRecord(payload.operation)
      if (operation?.state === 'completed') return parseArchiveSummary(operation.result)
      if (operation?.state === 'failed') {
        throw new ArchiveRequestError(typeof operation.error === 'string' ? operation.error : 'REQUEST_FAILED',
          typeof operation.detail === 'string' ? operation.detail : undefined)
      }
      if (operation?.state !== 'running') throw new Error('INVALID_RESULT')
      await new Promise(resolve => globalThis.setTimeout(resolve, 1_000))
      if (this.disposed) break
      payload = await this.archiveRequest({ action: 'status', token })
    }
    throw new Error('CANCELLED')
  }

  async ack(sessionId: string): Promise<void> {
    const before = this.state
    const current = before.feed.acks[sessionId]
    const optimistic: BoardFeed = {
      ...before.feed,
      acks: {
        ...before.feed.acks,
        [sessionId]: { ...(current ?? {}), ackedAt: Date.now() },
      },
    }
    this.publish({ ...before, feed: optimistic })
    try {
      const response = await globalThis.fetch(ACK_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      if (!response.ok) throw new Error(`ack failed: ${response.status}`)
    } catch {
      // Do not leave a failed optimistic acknowledgement looking durable.
      if (this.state.feed.acks[sessionId]?.ackedAt === optimistic.acks[sessionId]?.ackedAt) {
        const acks = { ...this.state.feed.acks }
        if (current === undefined) delete acks[sessionId]
        else acks[sessionId] = current
        this.publish({ ...this.state, feed: { ...this.state.feed, acks } })
      }
    }
  }

  /** Close the channel and stop reconnecting. */
  dispose(): void {
    this.disposed = true
    if (this.retryTimer !== null) {
      globalThis.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    try {
      this.source?.close()
    } catch {
      // Already closed.
    }
    this.source = null
    this.listeners.clear()
  }
}
