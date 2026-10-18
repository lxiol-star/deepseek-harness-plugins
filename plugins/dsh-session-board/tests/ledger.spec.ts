import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { BoardLedger, subscribeBoardLedger } from '../src/host/ledger.ts'
import {
  TURN_TABLE_NAME,
  turnDomainSpec,
  type BoardAckTable,
  type BoardTurnTable,
  type KvTableLike,
  type StoredAckRecord,
  type StoredTurnRecord,
} from '../src/host/domain.ts'

type RecordValue = Record<string, unknown>

/** An in-memory table handle with the slice of `KvTableLike` the ledger uses. */
function table<V>(): KvTableLike<V> {
  const values = new Map<string, V>()
  return {
    get: key => values.get(key),
    entries: () => values.entries(),
    put: async (key, value) => { values.set(key, structuredClone(value)) },
    delete: async key => values.delete(key),
  }
}

/** A table whose next `put`s can be made to fail, for containment tests. */
function gatedTable<V>(): { table: KvTableLike<V>; failNextPut: (times?: number) => void } {
  const values = new Map<string, V>()
  let remainingFailures = 0
  return {
    failNextPut: (times = 1) => { remainingFailures = times },
    table: {
      get: key => values.get(key),
      entries: () => values.entries(),
      put: async (key, value) => {
        if (remainingFailures > 0) {
          remainingFailures -= 1
          throw new Error('simulated write failure')
        }
        values.set(key, structuredClone(value))
      },
      delete: async key => values.delete(key),
    },
  }
}

/** Let every queued microtask and the ledger's zero-delay jobs settle. */
function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

interface Harness {
  readonly ledger: BoardLedger
  readonly warnings: string[]
  /** Deliver one event exactly as `session/event` would. */
  emit(sessionId: string, event: RecordValue): void
}

/**
 * Build a ledger plus a fake `ctx` that captures the one `session/event`
 * listener, so tests exercise the real subscription and its wire readers.
 */
function harness(acks: BoardAckTable, turns: BoardTurnTable, now: () => number = () => 0): Harness {
  const warnings: string[] = []
  const ledger = new BoardLedger({
    acks,
    turns,
    onChange: () => {},
    warn: message => { warnings.push(message) },
    now,
  })
  const registered = new Map<string, (session: unknown, event: unknown) => void>()
  const ctx = {
    on: (name: string, handler: (session: unknown, event: unknown) => void) => {
      registered.set(name, handler)
      return () => {}
    },
  } as unknown as Context
  subscribeBoardLedger(ctx, Promise.resolve(ledger))
  return {
    ledger,
    warnings,
    emit: (sessionId, event) => {
      const handler = registered.get('session/event')
      if (handler === undefined) throw new Error('session/event listener was not registered')
      handler({ id: sessionId }, event)
    },
  }
}

// --- Real `SessionEvent` payload builders -----------------------------------
// Shapes mirror `SessionEventMap` in the DSH checkout: turn/start and turn/end
// carry `data.turn`/`data.reason`, tool/call carries `data.callId`/`data.name`,
// tool/result carries a `ToolResultMessage`, approval events key on `data.id`.

function turnStart(time: number, turn = 1): RecordValue {
  return { type: 'turn/start', seq: 1, time, data: { turn } }
}

function turnEnd(time: number, turn = 1, kind = 'completed'): RecordValue {
  return { type: 'turn/end', seq: 1, time, data: { turn, reason: { kind } } }
}

function toolCall(time: number, callId: string, name: string): RecordValue {
  return { type: 'tool/call', seq: 1, time, data: { turn: 1, step: 1, callId, name, arguments: '{}' } }
}

/** `via` selects which of the two real call-id copies the result carries. */
function toolResult(time: number, callId: string, via: 'source' | 'toolCallId' = 'source'): RecordValue {
  const message: RecordValue = {
    id: `message-${callId}`,
    role: 'tool',
    content: [],
    toolCallId: callId,
    isError: false,
  }
  if (via === 'source') message['source'] = { kind: 'tool', callId }
  return { type: 'tool/result', seq: 1, time, data: { turn: 1, step: 1, message }, surfaceOp: 'append' }
}

function approvalAsked(time: number, id: string, callId?: string): RecordValue {
  const data: RecordValue = { id, toolName: 'bash' }
  if (callId !== undefined) data['callId'] = callId
  return { type: 'approval/asked', seq: 1, time, data }
}

function approvalDecided(time: number, id: string, outcome = 'allowed-once'): RecordValue {
  return { type: 'approval/decided', seq: 1, time, data: { id, outcome } }
}

describe('BoardLedger turn accounting', () => {
  it('settles an open turn into busyMs at turn/end', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger } = harness(acks, turns)

    ledger.recordTurnStart('s1', 1_000)
    await flush()
    ledger.recordTurnEnd('s1', { time: 4_000, kind: 'completed', errorMessage: null })
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({
      busyMs: 3_000,
      openTurnStart: null,
      waitedMs: null,
      openWaitStart: null,
      openWaitKeys: null,
      lastEventAt: 4_000,
    })
  })

  it('does not add busy time again for a duplicate turn/end', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger } = harness(acks, turns)

    ledger.recordTurnStart('s1', 1_000)
    await flush()
    ledger.recordTurnEnd('s1', { time: 4_000, kind: 'completed', errorMessage: null })
    await flush()
    ledger.recordTurnEnd('s1', { time: 6_000, kind: 'completed', errorMessage: null })
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({
      busyMs: 3_000,
      openTurnStart: null,
      lastEventAt: 6_000,
    })
  })

  it('settles the replaced turn when turn/start repeats', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger } = harness(acks, turns)

    ledger.recordTurnStart('s1', 1_000)
    await flush()
    ledger.recordTurnStart('s1', 2_000)
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 1_000, openTurnStart: 2_000 })

    ledger.recordTurnEnd('s1', { time: 5_000, kind: 'completed', errorMessage: null })
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 4_000, openTurnStart: null })
  })

  it('folds an open wait when a repeated turn/start replaces the turn', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger } = harness(acks, turns)

    ledger.recordTurnStart('s1', 1_000)
    await flush()
    ledger.recordWaitStart('s1', { time: 2_000, kind: 'question', id: 'q-1' })
    await flush()
    ledger.recordTurnStart('s1', 3_000)
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({
      busyMs: 1_000,
      openTurnStart: 3_000,
      waitedMs: null,
      openWaitStart: null,
      openWaitKeys: null,
    })
  })

  it('folds and clears an open wait when the turn ends', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(1_000))
    emit('s1', toolCall(2_000, 'q-1', 'ask_user_question'))
    emit('s1', turnEnd(5_000))
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({
      busyMs: 1_000,
      openTurnStart: null,
      waitedMs: null,
      openWaitStart: null,
      openWaitKeys: null,
    })
  })

  it('ignores a repeated turn/start older than the open start', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger } = harness(acks, turns)

    ledger.recordTurnStart('s1', 5_000)
    await flush()
    ledger.recordTurnStart('s1', 1_000)
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: null, openTurnStart: 5_000 })

    ledger.recordTurnEnd('s1', { time: 6_000, kind: 'completed', errorMessage: null })
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 1_000 })
  })

  it('preserves the acknowledgement cursor when a later turn ends', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger } = harness(acks, turns, () => 9_000)

    await ledger.ack('s1')
    ledger.recordTurnEnd('s1', { time: 10_000, kind: 'completed', errorMessage: null })
    await flush()

    expect(ledger.snapshot().acks['s1']).toMatchObject({ ackedAt: 9_000, lastTurnEnd: 10_000 })
  })
})

describe('BoardLedger wait union', () => {
  it('subtracts a completed blocking wait from busy time', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger } = harness(acks, turns)

    ledger.recordTurnStart('s1', 1_000)
    await flush()
    ledger.recordWaitStart('s1', { time: 2_000, kind: 'approval', id: 'a1' })
    await flush()
    ledger.recordWaitEnd('s1', { time: 3_000, kind: 'approval', id: 'a1' })
    await flush()
    ledger.recordTurnEnd('s1', { time: 5_000, kind: 'completed', errorMessage: null })
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 3_000 })
  })

  it('counts overlapping question and approval waits as one union interval', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(0))
    emit('s1', toolCall(1_000, 'q-1', 'ask_user_question'))
    emit('s1', approvalAsked(1_500, 'ap-1', 'call-9'))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({
      openWaitStart: 1_000,
      openWaitKeys: ['question:q-1', 'approval:ap-1'],
      waitedMs: null,
    })

    emit('s1', approvalDecided(2_000, 'ap-1'))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({
      openWaitStart: 1_000,
      openWaitKeys: ['question:q-1'],
      waitedMs: null,
    })

    emit('s1', toolResult(3_000, 'q-1'))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({
      openWaitStart: null,
      openWaitKeys: null,
      waitedMs: 2_000,
    })

    emit('s1', turnEnd(5_000))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 3_000 })
  })

  it('does not span the gap between sequential waits', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(0))
    emit('s1', toolCall(1_000, 'q-1', 'ask_user_question'))
    emit('s1', toolResult(2_000, 'q-1'))
    emit('s1', approvalAsked(3_000, 'ap-1'))
    emit('s1', approvalDecided(4_000, 'ap-1'))
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({ waitedMs: 2_000, openWaitStart: null })

    emit('s1', turnEnd(5_000))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 3_000 })
  })

  it('does not close a wait for a different request id', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(1_000))
    emit('s1', toolCall(2_000, 'q1', 'ask_user_question'))
    emit('s1', toolResult(4_000, 'q2'))
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({
      openWaitStart: 2_000,
      openWaitKeys: ['question:q1'],
      waitedMs: null,
    })
  })

  it('does not close a wait whose id matches under another kind', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(0))
    emit('s1', toolCall(1_000, 'shared', 'ask_user_question'))
    emit('s1', approvalDecided(2_000, 'shared'))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({
      openWaitKeys: ['question:shared'],
      openWaitStart: 1_000,
    })

    emit('s1', toolResult(3_000, 'shared'))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ waitedMs: 2_000, openWaitKeys: null })
  })
})

describe('subscribeBoardLedger real event payloads', () => {
  it('pairs approval events by data.id, not the optional callId', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(1_000))
    emit('s1', approvalAsked(2_000, 'ap-1', 'call-9'))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ openWaitKeys: ['approval:ap-1'], openWaitStart: 2_000 })

    emit('s1', approvalDecided(3_000, 'ap-1'))
    emit('s1', turnEnd(4_000))
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 2_000, waitedMs: null })
  })

  it('closes a question wait from data.message.source.callId', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(1_000))
    emit('s1', toolCall(2_000, 'q-1', 'ask_user_question'))
    emit('s1', toolResult(3_000, 'q-1', 'source'))
    emit('s1', turnEnd(4_000))
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 2_000, waitedMs: null })
  })

  it('falls back to data.message.toolCallId when source.callId is absent', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(1_000))
    emit('s1', toolCall(2_000, 'q-1', 'ask_user_question'))
    emit('s1', toolResult(3_000, 'q-1', 'toolCallId'))
    emit('s1', turnEnd(4_000))
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 2_000, waitedMs: null })
  })

  it('opens a question wait for request_user_input and exit_plan_mode', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()

    const first = harness(acks, turns)
    first.emit('s1', turnStart(0))
    first.emit('s1', toolCall(1_000, 'q-2', 'request_user_input'))
    await flush()
    expect(first.ledger.snapshot().turns['s1']).toMatchObject({ openWaitKeys: ['question:q-2'] })

    const second = harness(table<StoredAckRecord>(), table<StoredTurnRecord>())
    second.emit('s2', turnStart(0))
    second.emit('s2', toolCall(1_000, 'q-3', 'exit_plan_mode'))
    await flush()
    expect(second.ledger.snapshot().turns['s2']).toMatchObject({ openWaitKeys: ['question:q-3'] })
  })

  it('leaves a non-question tool call out of the wait set', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, emit } = harness(acks, turns)

    emit('s1', turnStart(0))
    emit('s1', toolCall(1_000, 'c-1', 'bash'))
    emit('s1', toolResult(2_000, 'c-1'))
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({
      openWaitStart: null,
      openWaitKeys: null,
      waitedMs: null,
      lastEventAt: 2_000,
    })
  })
})

describe('restart reconciliation', () => {
  it('closes a stale open turn at lastEventAt instead of now', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()

    const first = harness(acks, turns)
    first.emit('s1', turnStart(1_000))
    first.emit('s1', toolCall(2_000, 'q-1', 'ask_user_question'))
    first.emit('s1', toolResult(3_000, 'q-1'))
    await flush()
    expect(first.ledger.snapshot().turns['s1']).toMatchObject({
      openTurnStart: 1_000,
      waitedMs: 1_000,
      lastEventAt: 3_000,
    })

    // The process was down from t=3_000 to t=100_000; none of that is busy.
    const second = harness(acks, turns, () => 100_000)
    expect(await second.ledger.reconcileOpenTurns()).toBe(true)
    expect(second.ledger.snapshot().turns['s1']).toMatchObject({
      busyMs: 1_000,
      openTurnStart: null,
      openWaitKeys: null,
      lastEventAt: 3_000,
    })
  })

  it('bounds an old record without lastEventAt by the ack cursor', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    await acks.put('s1', { lastTurnEnd: 1_500, lastTurnEndKind: 'completed', lastTurnEndError: null, ackedAt: null })
    await turns.put('s1', {
      busyMs: null,
      openTurnStart: 1_000,
      waitedMs: null,
      openWaitStart: null,
      openWaitKind: null,
      openWaitId: null,
    } as unknown as StoredTurnRecord)

    const { ledger } = harness(acks, turns, () => 100_000)
    expect(await ledger.reconcileOpenTurns()).toBe(true)
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 500, openTurnStart: null })
  })

  it('charges no downtime for an old record with no bound at all', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    await turns.put('s1', {
      busyMs: null,
      openTurnStart: 1_000,
      waitedMs: null,
      openWaitStart: null,
      openWaitKind: null,
      openWaitId: null,
    } as unknown as StoredTurnRecord)

    const { ledger } = harness(acks, turns, () => 100_000)
    expect(await ledger.reconcileOpenTurns()).toBe(true)
    expect(ledger.snapshot().turns['s1']).toMatchObject({ busyMs: 0, openTurnStart: null })
  })

  it('promotes a legacy single open wait so its end still matches', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    await turns.put('s1', {
      busyMs: null,
      openTurnStart: 1_000,
      waitedMs: null,
      openWaitStart: 2_000,
      openWaitKind: 'question',
      openWaitId: 'q-1',
    } as unknown as StoredTurnRecord)

    const { ledger } = harness(acks, turns)
    ledger.recordWaitEnd('s1', { time: 3_000, kind: 'question', id: 'q-1' })
    await flush()

    expect(ledger.snapshot().turns['s1']).toMatchObject({
      waitedMs: 1_000,
      openWaitStart: null,
      openWaitKeys: null,
    })
  })

  it('reports no rewrite when no turn is open', async () => {
    const turns = table<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger } = harness(acks, turns)
    ledger.recordTurnStart('s1', 1_000)
    await flush()
    ledger.recordTurnEnd('s1', { time: 2_000, kind: 'completed', errorMessage: null })
    await flush()

    expect(await ledger.reconcileOpenTurns()).toBe(false)
  })
})

describe('write failure containment', () => {
  it('keeps a queued ack reachable after a failed write', async () => {
    const turns = table<StoredTurnRecord>()
    const gated = gatedTable<StoredAckRecord>()
    const { ledger, warnings } = harness(gated.table, turns, () => 9_000)

    gated.failNextPut(1)
    ledger.recordTurnEnd('s1', { time: 10_000, kind: 'completed', errorMessage: null })
    const durable = await ledger.ack('s1')

    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('turn/end')
    expect(durable).toBe(true)
    expect(ledger.snapshot().acks['s1']).toMatchObject({ ackedAt: 9_000 })
  })

  it('contains a failed turn write without stranding later writes', async () => {
    const gated = gatedTable<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { ledger, warnings } = harness(acks, gated.table)

    ledger.recordTurnStart('s1', 1_000)
    await flush()
    gated.failNextPut(1)
    ledger.recordTurnEnd('s1', { time: 4_000, kind: 'completed', errorMessage: null })
    await flush()

    expect(warnings.length).toBeGreaterThan(0)
    // The ack half of turn/end landed before the failing turn write.
    expect(ledger.snapshot().acks['s1']).toMatchObject({ lastTurnEnd: 4_000 })

    // The chain is not stranded: the next durable write lands.
    ledger.recordTurnStart('s1', 5_000)
    await flush()
    expect(ledger.snapshot().turns['s1']).toMatchObject({ openTurnStart: 5_000 })
  })

  it('never throws out of the event listener when a write fails', async () => {
    const gated = gatedTable<StoredTurnRecord>()
    const acks = table<StoredAckRecord>()
    const { emit } = harness(acks, gated.table)

    gated.failNextPut(1)
    expect(() => { emit('s1', turnStart(1_000)) }).not.toThrow()
    await flush()
  })
})

describe('turn record normalization', () => {
  const schema = turnDomainSpec.tables[TURN_TABLE_NAME]

  it('defaults fields an older record never wrote', () => {
    const parsed = schema?.valueSchema.parse({
      busyMs: 3,
      openTurnStart: 10,
      waitedMs: 1,
      openWaitStart: 2,
      openWaitKind: 'question',
      openWaitId: 'q-1',
    })
    expect(parsed).toEqual({
      busyMs: 3,
      openTurnStart: 10,
      waitedMs: 1,
      openWaitStart: 2,
      openWaitKind: 'question',
      openWaitId: 'q-1',
      openWaitKeys: null,
      lastEventAt: null,
    })
  })

  it('keeps only string wait keys and normalizes an empty set to null', () => {
    expect(schema?.valueSchema.parse({ openWaitKeys: ['question:q-1', 7, '', 'approval:ap-1'] }))
      .toMatchObject({ openWaitKeys: ['question:q-1', 'approval:ap-1'] })
    expect(schema?.valueSchema.parse({ openWaitKeys: [] })).toMatchObject({ openWaitKeys: null })
    expect(schema?.valueSchema.parse({ lastEventAt: 'soon' })).toMatchObject({ lastEventAt: null })
  })
})
