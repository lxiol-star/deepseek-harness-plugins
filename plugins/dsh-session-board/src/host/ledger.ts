/**
 * The durable fact ledger: everything the host half knows about turns, plus
 * the ack cursor, folded from `session/event` and served to the routes.
 *
 * Reads are synchronous (the domain keeps its records in memory); writes are
 * asynchronous and always contained — a failing write is logged through the
 * injected sink and never escapes an event handler.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: brings `session/event` and its `Session`/`SessionEvent` payload
// types into the `Events` interface this file listens on.
import type {} from '@deepseek-ai/dsh-session'
import type { BoardAckRecord, BoardFeed, BoardTurnStats } from '../shared/types.ts'
import { truncateErrorNote } from './domain.ts'
import type { BoardAckTable, BoardTurnTable, StoredTurnRecord } from './domain.ts'

/** The turn-end facts one `turn/end` event contributes. */
export interface TurnEndFacts {
  /** Event time (epoch ms); the ordering key for unread/attention. */
  readonly time: number
  /** `TurnEndReason.kind`, or null when the log carried none. */
  readonly kind: string | null
  /** Raw error text for an `error` turn (truncated on write), else null. */
  readonly errorMessage: string | null
}

export interface WaitFacts {
  readonly time: number
  readonly kind: string
  readonly id: string | null
}

/**
 * Tool names whose `tool/call` blocks on a human answer and therefore opens a
 * question wait. `exit_plan_mode` is included because presenting a plan is a
 * `plan-review` question that waits for approve/keep-planning; `question` is a
 * legacy alias retained for logs written before the current tool name.
 */
const QUESTION_TOOLS: ReadonlySet<string> = new Set([
  'ask_user_question',
  'request_user_input',
  'exit_plan_mode',
  'question',
])

/**
 * Separator inside one persisted wait key. Wait kinds are a known, colon-free
 * vocabulary, so `kind:id` is injective and the id may itself contain colons.
 */
const WAIT_KEY_SEP = ':'

/**
 * The key identifying one wait to match its start against its end.
 * @param kind - Wait family (`approval` or `question`).
 * @param id - Request/approval id or tool-call id, when the event carried one.
 * @returns the persisted key.
 */
function encodeWaitKey(kind: string, id: string | null): string {
  return `${kind}${WAIT_KEY_SEP}${id ?? ''}`
}

/** Inverse of {@link encodeWaitKey}; an absent id reads back as null. */
function decodeWaitKey(key: string): { kind: string; id: string | null } {
  const at = key.indexOf(WAIT_KEY_SEP)
  if (at < 0) return { kind: key, id: null }
  const id = key.slice(at + 1)
  return { kind: key.slice(0, at), id: id === '' ? null : id }
}

/**
 * The open wait keys of one record.
 *
 * A record written by an older build has no `openWaitKeys` but may still carry
 * the single `openWaitKind`/`openWaitId` pair; that pair is promoted to a
 * one-element set so a restart can still match the wait's end instead of
 * leaving the interval open forever.
 * @param record - stored turn record, possibly absent.
 * @returns the open keys, never null.
 */
function openWaitKeysOf(record: StoredTurnRecord | undefined): string[] {
  const stored = record?.openWaitKeys
  if (Array.isArray(stored)) return stored.filter(key => typeof key === 'string' && key !== '')
  const start = record?.openWaitStart
  const kind = record?.openWaitKind
  if (start !== null && start !== undefined && kind !== null && kind !== undefined) {
    return [encodeWaitKey(kind, record?.openWaitId ?? null)]
  }
  return []
}

/**
 * The deprecated single-wait mirror of an open key set: the first open wait,
 * or two nulls when nothing is open.
 * @param keys - open wait keys.
 * @returns the legacy `openWaitKind`/`openWaitId` pair.
 */
function legacyWaitFields(keys: readonly string[]): { openWaitKind: string | null; openWaitId: string | null } {
  const first = keys[0]
  if (first === undefined) return { openWaitKind: null, openWaitId: null }
  const decoded = decodeWaitKey(first)
  return { openWaitKind: decoded.kind, openWaitId: decoded.id }
}

/**
 * Advance a record's activity bound.
 *
 * Monotone on purpose: a replayed event whose time is older than the last one
 * seen must not pull the bound backwards and re-expose time already charged.
 * @param record - stored turn record, possibly absent.
 * @param time - event time.
 * @returns the new `lastEventAt`.
 */
function touchLastEventAt(record: StoredTurnRecord | undefined, time: number): number {
  const previous = record?.lastEventAt ?? null
  return previous === null ? time : Math.max(previous, time)
}

/**
 * Blocking-wait time already settled plus the open union interval up to `time`.
 *
 * `waitedMs` holds whole union intervals that closed inside the turn;
 * `openWaitStart` is where the still-open union began. Summing them counts
 * every overlapping wait exactly once.
 * @param record - stored turn record, possibly absent.
 * @param time - instant to measure through.
 * @returns the non-negative wait total in ms.
 */
function waitedThrough(record: StoredTurnRecord | undefined, time: number): number {
  const settled = Math.max(0, record?.waitedMs ?? 0)
  const openStart = record?.openWaitStart
  if (openStart === null || openStart === undefined) return settled
  return settled + Math.max(0, time - openStart)
}

/** Collaborators of a {@link BoardLedger}. */
export interface BoardLedgerOptions {
  /** `acks` table of the `dsh_session_board` domain. */
  readonly acks: BoardAckTable
  /** `turn_stats` table of the `dsh_session_board_turns` domain. */
  readonly turns: BoardTurnTable
  /** Called after a durable turn/reconciliation write; not called for acks. */
  readonly onChange: () => void
  /** Containment sink for write failures. */
  readonly warn: (message: string) => void
  /** Clock; injectable so tests can pin "now". Defaults to `Date.now`. */
  readonly now?: () => number
}

/**
 * Owns both tables and the ordering of their writes.
 *
 * @remarks
 * The write chain per session is the load-bearing part: `KvTable.put` resolves
 * only after the backend write lands and replaces the in-memory record only
 * then, so two unserialized read-modify-write pairs both read the pre-write
 * record and the later `put` silently reverts the earlier one's field — an ack
 * landing while a turn ends would drop the turn fact (or the ack). Serializing
 * per session removes the interleaving; distinct sessions never contend.
 */
export class BoardLedger {
  private readonly acks: BoardAckTable
  private readonly turns: BoardTurnTable
  private readonly onChange: () => void
  private readonly warn: (message: string) => void
  private readonly now: () => number
  /** Tail of each session's write chain; entries are dropped once settled. */
  private readonly chains = new Map<string, Promise<void>>()

  /** @param options - table handles, change hook, containment sink, clock. */
  constructor(options: BoardLedgerOptions) {
    this.acks = options.acks
    this.turns = options.turns
    this.onChange = options.onChange
    this.warn = options.warn
    this.now = options.now ?? Date.now
  }

  /**
   * Record a closed turn. Preserves an existing `ackedAt`: a new turn end must
   * move `lastTurnEnd` past the cursor (so the card reads as unacknowledged),
   * not clear the cursor itself.
   *
   * Always settles any open turn into `busyMs` and clears the wait state — a
   * turn boundary cannot leave a wait interval open, because the wait belonged
   * to the turn that just ended. A duplicate `turn/end` (no open turn) adds no
   * busy time a second time, but still clears stray wait state and advances the
   * activity bound.
   * @param sessionId - Session the event belongs to.
   * @param facts - Turn-end facts off the event.
   */
  recordTurnEnd(sessionId: string, facts: TurnEndFacts): void {
    void this.enqueue(sessionId, async () => {
      const currentAck = this.acks.get(sessionId)
      await this.acks.put(sessionId, {
        lastTurnEnd: facts.time,
        lastTurnEndKind: facts.kind,
        lastTurnEndError: facts.errorMessage === null ? null : truncateErrorNote(facts.errorMessage),
        ackedAt: currentAck?.ackedAt ?? null,
      })
      const currentTurn = this.turns.get(sessionId)
      const openTurnStart = currentTurn?.openTurnStart ?? null
      const busyMs = openTurnStart === null
        ? (currentTurn?.busyMs ?? null)
        : Math.max(0, currentTurn?.busyMs ?? 0)
          + Math.max(0, facts.time - openTurnStart - waitedThrough(currentTurn, facts.time))
      await this.turns.put(sessionId, {
        busyMs,
        openTurnStart: null,
        waitedMs: null,
        openWaitStart: null,
        openWaitKind: null,
        openWaitId: null,
        openWaitKeys: null,
        lastEventAt: touchLastEventAt(currentTurn, facts.time),
      })
      this.onChange()
    }, 'turn/end')
  }

  /**
   * Open a turn's clock. `busyMs` is preserved across turns; `waitedMs` resets
   * because it accumulates only inside the current turn, and `openWaitStart` is
   * cleared because a wait interval cannot outlive the turn that opened it.
   *
   * A repeated `turn/start` while one is already open settles the turn it
   * replaces first, so the earlier interval is not silently dropped. When the
   * new event is older than the open start (a replayed log), the open record is
   * left untouched rather than moving the clock backwards.
   * @param sessionId - Session the event belongs to.
   * @param time - Event time (epoch ms).
   */
  recordTurnStart(sessionId: string, time: number): void {
    void this.enqueue(sessionId, async () => {
      const current = this.turns.get(sessionId)
      const lastEventAt = touchLastEventAt(current, time)
      if (current !== undefined && current.openTurnStart !== null && time < current.openTurnStart) {
        await this.turns.put(sessionId, { ...current, lastEventAt })
        this.onChange()
        return
      }
      const openTurnStart = current?.openTurnStart ?? null
      const busyMs = openTurnStart === null
        ? (current?.busyMs ?? null)
        : Math.max(0, current?.busyMs ?? 0)
          + Math.max(0, time - openTurnStart - waitedThrough(current, time))
      await this.turns.put(sessionId, {
        busyMs,
        openTurnStart: time,
        waitedMs: null,
        openWaitStart: null,
        openWaitKind: null,
        openWaitId: null,
        openWaitKeys: null,
        lastEventAt,
      })
      this.onChange()
    }, 'turn/start')
  }

  /**
   * Open one blocking wait. The union interval is anchored at the first open
   * wait and stays open until every key is released, so a second, overlapping
   * wait is recorded in `openWaitKeys` without restarting the clock.
   *
   * A wait outside an open turn is not charged to any turn; only the activity
   * bound moves, so a later restart still bounds itself by a real event.
   * @param sessionId - Session the event belongs to.
   * @param facts - Wait kind and id off the event.
   */
  recordWaitStart(sessionId: string, facts: WaitFacts): void {
    void this.enqueue(sessionId, async () => {
      const current = this.turns.get(sessionId)
      if (current === undefined) return
      const lastEventAt = touchLastEventAt(current, facts.time)
      if ((current.openTurnStart ?? null) === null) {
        await this.turns.put(sessionId, { ...current, lastEventAt })
        this.onChange()
        return
      }
      const keys = openWaitKeysOf(current)
      const key = encodeWaitKey(facts.kind, facts.id)
      if (keys.includes(key)) {
        // Duplicate start for a wait already open: only activity moves.
        await this.turns.put(sessionId, { ...current, lastEventAt })
        this.onChange()
        return
      }
      const existingStart = current.openWaitStart ?? null
      const openWaitStart = keys.length === 0 || existingStart === null
        ? facts.time
        : Math.min(existingStart, facts.time)
      const nextKeys = [...keys, key]
      const legacy = legacyWaitFields(nextKeys)
      await this.turns.put(sessionId, {
        busyMs: current.busyMs,
        openTurnStart: current.openTurnStart,
        waitedMs: current.waitedMs,
        openWaitStart,
        openWaitKind: legacy.openWaitKind,
        openWaitId: legacy.openWaitId,
        openWaitKeys: nextKeys,
        lastEventAt,
      })
      this.onChange()
    }, 'wait/start')
  }

  /**
   * Release one blocking wait. Only the matching key (same kind *and* id) is
   * removed; a result for another tool, a second decision, or an end whose id
   * the record never opened changes nothing but the activity bound.
   *
   * The union interval is folded into `waitedMs` only when the last open key is
   * released, which is what prevents overlapping waits from being counted
   * twice.
   * @param sessionId - Session the event belongs to.
   * @param facts - Wait kind and id off the event.
   */
  recordWaitEnd(sessionId: string, facts: WaitFacts): void {
    void this.enqueue(sessionId, async () => {
      const current = this.turns.get(sessionId)
      if (current === undefined) return
      const lastEventAt = touchLastEventAt(current, facts.time)
      const keys = openWaitKeysOf(current)
      const key = encodeWaitKey(facts.kind, facts.id)
      if (!keys.includes(key)) {
        await this.turns.put(sessionId, { ...current, lastEventAt })
        this.onChange()
        return
      }
      const remaining = keys.filter(open => open !== key)
      if (remaining.length > 0) {
        const legacy = legacyWaitFields(remaining)
        await this.turns.put(sessionId, {
          busyMs: current.busyMs,
          openTurnStart: current.openTurnStart,
          waitedMs: current.waitedMs,
          openWaitStart: current.openWaitStart ?? null,
          openWaitKind: legacy.openWaitKind,
          openWaitId: legacy.openWaitId,
          openWaitKeys: remaining,
          lastEventAt,
        })
        this.onChange()
        return
      }
      const openWaitStart = current.openWaitStart ?? null
      const waitedMs = openWaitStart === null
        ? Math.max(0, current.waitedMs ?? 0)
        : Math.max(0, current.waitedMs ?? 0) + Math.max(0, facts.time - openWaitStart)
      await this.turns.put(sessionId, {
        busyMs: current.busyMs,
        openTurnStart: current.openTurnStart,
        waitedMs,
        openWaitStart: null,
        openWaitKind: null,
        openWaitId: null,
        openWaitKeys: null,
        lastEventAt,
      })
      this.onChange()
    }, 'wait/end')
  }

  /**
   * Move the acknowledged cursor to now, preserving the turn facts.
   *
   * The route that calls this pushes the resulting state frame itself (the
   * caller owns the response it caused), which is why this write does not go
   * through {@link BoardLedgerOptions.onChange}.
   * @param sessionId - Session being acknowledged.
   * @returns true only once the write is durable; false when it failed.
   */
  async ack(sessionId: string): Promise<boolean> {
    let durable = false
    await this.enqueue(sessionId, async () => {
      const current = this.acks.get(sessionId)
      await this.acks.put(sessionId, {
        lastTurnEnd: current?.lastTurnEnd ?? null,
        lastTurnEndKind: current?.lastTurnEndKind ?? null,
        lastTurnEndError: current?.lastTurnEndError ?? null,
        ackedAt: this.now(),
      })
      durable = true
    }, 'ack')
    return durable
  }

  /**
   * Whole durable state as one wire snapshot. Synchronous and total: absent
   * fields (a record written before a field existed) read as null.
   * @returns the feed pushed to clients.
   */
  snapshot(): BoardFeed {
    const acks = emptySection<BoardAckRecord>()
    for (const [sessionId, record] of this.acks.entries()) {
      acks[sessionId] = {
        lastTurnEnd: record?.lastTurnEnd ?? null,
        lastTurnEndKind: record?.lastTurnEndKind ?? null,
        lastTurnEndError: record?.lastTurnEndError ?? null,
        ackedAt: record?.ackedAt ?? null,
      }
    }
    const turns = emptySection<BoardTurnStats>()
    for (const [sessionId, record] of this.turns.entries()) {
      turns[sessionId] = {
        busyMs: record?.busyMs ?? null,
        openTurnStart: record?.openTurnStart ?? null,
        waitedMs: record?.waitedMs ?? null,
        openWaitStart: record?.openWaitStart ?? null,
        openWaitKind: record?.openWaitKind ?? null,
        openWaitId: record?.openWaitId ?? null,
        openWaitKeys: record?.openWaitKeys ?? null,
        lastEventAt: record?.lastEventAt ?? null,
      }
    }
    return { acks, turns }
  }

  /**
   * Close the turns a previous process left open.
   *
   * This process just started, so no recorded open turn can still be running.
   * The fold stops at the record's {@link StoredTurnRecord.lastEventAt} — the
   * last instant this installation is known to have observed activity — rather
   * than at `now`, so the time the process spent down is never charged as busy
   * time. A record written before `lastEventAt` existed carries no such bound;
   * see {@link restartCloseAt} for the conservative fallback.
   * @returns true when at least one record was actually rewritten.
   */
  async reconcileOpenTurns(): Promise<boolean> {
    const now = this.now()
    let rewrote = false
    for (const [sessionId, record] of this.turns.entries()) {
      if ((record?.openTurnStart ?? null) === null) continue
      let closed = false
      await this.enqueue(sessionId, async () => {
        const current = this.turns.get(sessionId)
        const openTurnStart = current?.openTurnStart ?? null
        // Re-read behind the chain: an in-flight turn/start may have already
        // replaced the record this scan saw.
        if (current === undefined || openTurnStart === null) return
        const closeAt = this.restartCloseAt(sessionId, current, openTurnStart, now)
        await this.turns.put(sessionId, {
          busyMs: (current.busyMs ?? 0) + Math.max(0, closeAt - openTurnStart - waitedThrough(current, closeAt)),
          openTurnStart: null,
          waitedMs: null,
          openWaitStart: null,
          openWaitKind: null,
          openWaitId: null,
          openWaitKeys: null,
          lastEventAt: current.lastEventAt ?? null,
        })
        closed = true
        this.onChange()
      }, 'reconciliation')
      if (closed) rewrote = true
    }
    return rewrote
  }

  /**
   * The instant a stale open turn may be charged through on restart.
   *
   * Never `now`: the process may have been down for days. A record with a
   * recorded activity bound closes there (clamped to `now` so a skewed future
   * timestamp cannot over-charge). An older record has no bound, so the newest
   * fact that is at least the open start — the ack cursor's `lastTurnEnd` when
   * it is later, else the open start itself — is used. Both fallbacks yield a
   * non-negative interval and therefore charge zero downtime rather than
   * guessing.
   * @param sessionId - Session being reconciled.
   * @param record - Current stored record (open turn).
   * @param openTurnStart - Start of the open turn.
   * @param now - Reconciliation clock reading.
   * @returns the epoch ms to close at.
   */
  private restartCloseAt(sessionId: string, record: StoredTurnRecord, openTurnStart: number, now: number): number {
    // `?? null` also covers a raw record whose stored value predates the field.
    const lastEventAt = record.lastEventAt ?? null
    if (lastEventAt !== null) return Math.min(lastEventAt, now)
    const ackEnd = this.acks.get(sessionId)?.lastTurnEnd ?? null
    const bounded = ackEnd === null ? openTurnStart : Math.max(openTurnStart, ackEnd)
    return Math.min(bounded, now)
  }

  /**
   * Run one durable write in this session's submission order.
   *
   * A failed predecessor is already reported by this method's own guard, so it
   * must not strand the writes queued behind it (`then(job, job)`).
   * @param sessionId - Session owning the write.
   * @param job - The durable write and its follow-up.
   * @param label - Failure label for the log line.
   * @returns a promise that never rejects, settling once the write finished.
   */
  private enqueue(sessionId: string, job: () => Promise<void>, label: string): Promise<void> {
    const tail = this.chains.get(sessionId) ?? Promise.resolve()
    const pending = tail.then(job, job).catch((error: unknown) => {
      this.warn(`dsh-session-board: ${label} write failed for session ${sessionId}: ${describeError(error)}`)
    })
    this.chains.set(sessionId, pending)
    void pending.then(() => {
      // Track in-flight sessions, not history: only the tail may clear its slot.
      if (this.chains.get(sessionId) === pending) this.chains.delete(sessionId)
    })
    return pending
  }
}

/**
 * Subscribe the ledger to the session log.
 *
 * Registration stays here (next to the facts it feeds) so `plugin.ts` reads as
 * wiring; `ctx.on` is already effect-scoped and must not be wrapped again.
 * @param ctx - Host plugin context carrying `session/event`.
 * @param ledgerReady - Always-settling handle on the ledger; null means the
 * durable store never opened and turn facts are dropped (the client half still
 * renders from its own projections).
 */
export function subscribeBoardLedger(ctx: Context, ledgerReady: Promise<BoardLedger | null>): void {
  ctx.on('session/event', (session, event) => {
    // The event crosses a durability boundary (the log is restored from disk),
    // so its payload is read as wire data: the `session/event` declaration
    // gates the event name, and anything unrecognized is ignored rather than
    // thrown out of a listener.
    const envelope = asRecord(event)
    if (envelope === null) return
    const type = envelope['type']
    const sessionId = readSessionId(session)
    if (sessionId === null) return
    const time = readEventTime(envelope['time'])
    if (time === null) return
    const data = asRecord(envelope['data'])
    if (type === 'turn/start') {
      void ledgerReady.then((ledger) => { ledger?.recordTurnStart(sessionId, time) })
      return
    }
    if (type === 'turn/end') {
      const facts = readTurnEndFacts(time, data === null ? null : data['reason'])
      void ledgerReady.then((ledger) => { ledger?.recordTurnEnd(sessionId, facts) })
      return
    }
    const wait = readWaitEvent(type, time, data)
    if (wait === null) return
    void ledgerReady.then((ledger) => {
      if (wait.start) ledger?.recordWaitStart(sessionId, wait.facts)
      else ledger?.recordWaitEnd(sessionId, wait.facts)
    })
  })
}

/** One-line description of a caught value for logs; never throws. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Session id off a session header, or null when it is unusable as a key. */
function readSessionId(session: unknown): string | null {
  const envelope = asRecord(session)
  return envelope === null ? null : readString(envelope['id'])
}

/** Epoch ms of one event, or null when the log carried a non-numeric time. */
function readEventTime(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Read the turn-end reason off a committed event.
 *
 * `TurnEndReasonMap` is merge-extensible, so the payload is not trusted to be
 * one of the literals this build knows: an unrecognized `kind` is preserved
 * verbatim (the client decides how to show it) instead of being normalized into
 * a literal DSH never emits, and the error text is read only when it really is
 * a string — otherwise a card would render "[object Object]". A missing `kind`
 * still records the timestamp, because the time is what orders the card.
 * @param time - Validated `event.time`.
 * @param reason - `event.data.reason`.
 * @returns the facts to store.
 */
function readTurnEndFacts(time: number, reason: unknown): TurnEndFacts {
  const envelope = asRecord(reason)
  const kind = envelope === null ? null : readString(envelope['kind'])
  const error = envelope === null ? null : asRecord(envelope['error'])
  const message = error === null ? null : readString(error['message'])
  return { time, kind, errorMessage: kind === 'error' ? message : null }
}

/**
 * Read the wait one session event opens or closes, if any.
 *
 * The payload shapes are the real ones DSH writes:
 * - `approval/asked` / `approval/decided` both key on `data.id` (the
 *   `ApprovalRequestId`), never on the optional `data.callId` that only the
 *   ask carries.
 * - `tool/call` carries `data.callId`; only a call to a human-question tool
 *   ({@link QUESTION_TOOLS}) opens a wait.
 * - `tool/result` has no top-level call id at all: the id lives on the
 *   `ToolResultMessage` as `data.message.source.callId` or `toolCallId`, and
 *   every result is inspected because that is the only way to learn which wait
 *   (if any) it closes.
 * @param type - `event.type`.
 * @param time - Validated `event.time`.
 * @param data - `event.data`.
 * @returns the start/end signal and facts, or null when the event is not a wait.
 */
function readWaitEvent(type: unknown, time: number, data: Record<string, unknown> | null): { start: boolean; facts: WaitFacts } | null {
  if (type === 'approval/asked') {
    return { start: true, facts: { time, kind: 'approval', id: data === null ? null : readString(data['id']) } }
  }
  if (type === 'approval/decided') {
    return { start: false, facts: { time, kind: 'approval', id: data === null ? null : readString(data['id']) } }
  }
  if (type === 'tool/call') {
    const name = data === null ? null : readString(data['name'])
    if (name !== null && QUESTION_TOOLS.has(name)) {
      return { start: true, facts: { time, kind: 'question', id: data === null ? null : readString(data['callId']) } }
    }
    return null
  }
  if (type === 'tool/result') {
    return { start: false, facts: { time, kind: 'question', id: readQuestionResultId(data) } }
  }
  return null
}

/**
 * The tool-call id one `tool/result` answers.
 *
 * `ToolResultMessage` carries the id twice — in `source.callId` and in
 * `toolCallId` — and the message is the only place a result names its call.
 * Either copy is accepted so a log written by a build that populated only one
 * still closes its wait.
 * @param data - `event.data`.
 * @returns the call id, or null when the payload carried none.
 */
function readQuestionResultId(data: Record<string, unknown> | null): string | null {
  if (data === null) return null
  const message = asRecord(data['message'])
  if (message === null) return null
  const source = asRecord(message['source'])
  const fromSource = source === null ? null : readString(source['callId'])
  return fromSource ?? readString(message['toolCallId'])
}

/** Narrow one unknown value to a plain record; arrays and null are not records. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** The value when it is a non-empty string, else null. */
function readString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Null-prototype accumulator for one feed section: keys are external session
 * ids, and on a plain object a literal `__proto__` key would rewrite the
 * accumulator's prototype instead of adding an entry.
 */
function emptySection<V>(): Record<string, V> {
  return Object.create(null) as Record<string, V>
}
