import { describe, expect, it } from 'vitest'
import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session/types'
import { EventMux, MUX_LIMITS } from '../src/host/manager/mux.ts'

// --- Synthetic committed session events -------------------------------------
// The mux folds durable `SessionEvent`s, so the fixtures are real event
// variants rather than untyped records: the compiler checks every field the
// mux reads. Branded ids are the only values asserted instead of constructed.

type TurnStartEvent = Extract<SessionEvent, { type: 'turn/start' }>
type TurnEndEvent = Extract<SessionEvent, { type: 'turn/end' }>
type AssistantEvent = Extract<SessionEvent, { type: 'assistant/message' }>
type ToolResultEvent = Extract<SessionEvent, { type: 'tool/result' }>
type UserEvent = Extract<SessionEvent, { type: 'user/message' }>
type TurnEndKind = TurnEndEvent['data']['reason']['kind']

/** Opaque message id shared by the synthetic messages. */
const MESSAGE_ID = 'message-1' as AssistantEvent['data']['message']['id']

/** Brand a fixture's log position; only the mux's `event.type`/`data` reads matter. */
function seq(value: number): SessionSeq {
  return value as SessionSeq
}

function turnStart(time: number, turn = 1): TurnStartEvent {
  return { type: 'turn/start', seq: seq(1), time, data: { turn } }
}

function turnEnd(time: number, turn = 1, kind: TurnEndKind = 'completed'): TurnEndEvent {
  return {
    type: 'turn/end',
    seq: seq(2),
    time,
    data: { turn, reason: { kind } as TurnEndEvent['data']['reason'] },
  }
}

function assistantContent(
  time: number,
  content: AssistantEvent['data']['message']['content'],
  turn = 1,
  step = 1,
): AssistantEvent {
  return {
    type: 'assistant/message',
    seq: seq(3),
    time,
    surfaceOp: 'append',
    data: {
      turn,
      step,
      message: {
        id: MESSAGE_ID,
        role: 'assistant',
        content,
        source: { kind: 'model', provider: 'test', model: 'test' },
      },
      stream: [],
    },
  }
}

function assistantMessage(time: number, texts: readonly string[], turn = 1, step = 1): AssistantEvent {
  return assistantContent(time, texts.map(text => ({ type: 'text' as const, text })), turn, step)
}

function toolResult(
  time: number,
  options: { turn?: number; step?: number; isError?: boolean; reason?: string; code?: string } = {},
): ToolResultEvent {
  const callId = 'call-1' as ToolResultEvent['data']['message']['toolCallId']
  const error = options.reason === undefined && options.code === undefined
    ? {}
    : {
        error: {
          name: 'ToolFailure',
          code: options.code ?? 'TOOL_FAILED',
          ...(options.reason === undefined ? {} : { reason: options.reason }),
        },
      }
  return {
    type: 'tool/result',
    seq: seq(4),
    time,
    surfaceOp: 'append',
    data: {
      turn: options.turn ?? 1,
      step: options.step ?? 1,
      message: {
        id: MESSAGE_ID,
        role: 'tool',
        content: [],
        source: { kind: 'tool', callId },
        toolCallId: callId,
        isError: options.isError ?? true,
      },
      ...error,
    },
  }
}

function userMessage(time: number, text = 'hello'): UserEvent {
  return {
    type: 'user/message',
    seq: seq(5),
    time,
    surfaceOp: 'append',
    data: {
      id: 'user-1' as UserEvent['data']['id'],
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    },
  }
}

function stepStart(time: number): SessionEvent {
  return { type: 'step/start', seq: seq(6), time, data: { turn: 1, step: 1 } }
}

// --- Helpers ----------------------------------------------------------------

function levelOf(mux: EventMux, sourceId: string) {
  return mux.snapshot().sources[sourceId]
}

function edgesOf(mux: EventMux) {
  return mux.snapshot().edges
}

function edgeOf(mux: EventMux, key: string) {
  return edgesOf(mux).find(candidate => candidate.key === key)
}

/** Record every turn/start edge of one source at increasing clocks. */
function fillProgressEdges(mux: EventMux, sourceId: string, count: number, startAt = 1_000): void {
  for (let index = 0; index < count; index += 1) {
    const at = startAt + index
    mux.record(sourceId, turnStart(at, index + 1), at)
  }
}

describe('EventMux turn lifecycle', () => {
  it('starts a turn as running with one progress edge', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(1_000, 2), 1_000)

    expect(levelOf(mux, 's1')).toEqual({ status: 'running', turn: 2, lastAt: 1_000 })
    expect(edgesOf(mux)).toEqual([{
      key: 's1:turn-start:2',
      sourceId: 's1',
      kind: 'turn-start',
      priority: 'progress',
      at: 1_000,
      summary: 'turn 2 started',
    }])
    expect(mux.snapshot().revision).toBe(1)
  })

  it('settles a completed turn as done with a completed edge', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(1_000, 1), 1_000)
    mux.record('s1', turnEnd(4_000, 1, 'completed'), 4_000)

    expect(levelOf(mux, 's1')).toEqual({
      status: 'done',
      turn: 1,
      lastAt: 4_000,
      lastKind: 'completed',
    })
    expect(edgeOf(mux, 's1:turn-end:1')).toEqual({
      key: 's1:turn-end:1',
      sourceId: 's1',
      kind: 'turn-end',
      priority: 'completed',
      at: 4_000,
      summary: 'turn 1 ended (completed)',
    })
  })

  it('maps every non-completed turn end to waiting, error or done', () => {
    const cases: ReadonlyArray<readonly [TurnEndKind, string]> = [
      ['aborted', 'waiting'],
      ['blocked', 'waiting'],
      ['error', 'error'],
      ['max-tokens', 'error'],
      ['interrupted', 'error'],
      ['forked', 'done'],
    ]
    for (const [kind, status] of cases) {
      const mux = new EventMux()
      mux.record('s1', turnEnd(0, 1, kind), 1_000)
      expect(levelOf(mux, 's1')?.status).toBe(status)
      expect(levelOf(mux, 's1')?.lastKind).toBe(kind)
      expect(edgesOf(mux)[0]?.priority).toBe(status === 'error' ? 'error' : status === 'waiting' ? 'needs-input' : 'completed')
    }
  })

  it('uses the last assistant preview as the failed-turn error note', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(0, 1), 0)
    mux.record('s1', assistantMessage(1_000, ['  provider\n exploded  ']), 1_000)
    mux.record('s1', turnEnd(2_000, 1, 'error'), 2_000)

    expect(levelOf(mux, 's1')).toEqual({
      status: 'error',
      turn: 1,
      lastAt: 2_000,
      lastKind: 'error',
      lastError: 'provider exploded',
      preview: 'provider exploded',
    })
    expect(edgeOf(mux, 's1:turn-end:1')?.priority).toBe('error')
  })

  it('falls back to a generic note when the failed turn has no preview', () => {
    const mux = new EventMux()
    mux.record('s1', turnEnd(0, 1, 'error'), 1_000)
    expect(levelOf(mux, 's1')?.lastError).toBe('turn failed')
  })
})

describe('EventMux assistant previews', () => {
  it('collapses whitespace and trims the preview', () => {
    const mux = new EventMux()
    mux.record('s1', assistantMessage(500, ['  hello\n\n  world\t']), 500)

    expect(levelOf(mux, 's1')).toEqual({ status: 'idle', lastAt: 500, preview: 'hello world' })
  })

  it('bounds the preview at the mux text limit', () => {
    const mux = new EventMux()
    mux.record('s1', assistantMessage(500, ['x'.repeat(400)]), 500)

    const preview = levelOf(mux, 's1')?.preview ?? ''
    expect(preview).toHaveLength(MUX_LIMITS.textMax)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.slice(0, -1)).toBe('x'.repeat(MUX_LIMITS.textMax - 1))
  })

  it('joins text blocks and ignores non-text blocks', () => {
    const mux = new EventMux()
    mux.record('s1', assistantContent(500, [
      { type: 'text', text: 'alpha' },
      { type: 'reasoning', text: 'not shown' },
      { type: 'text', text: 'beta' },
    ]), 500)

    expect(levelOf(mux, 's1')?.preview).toBe('alpha beta')
  })
})

describe('EventMux tool results', () => {
  it('records a failed tool result as an error edge', () => {
    const mux = new EventMux()
    mux.record('s1', toolResult(1_000, { reason: 'boom' }), 1_000)

    expect(levelOf(mux, 's1')).toEqual({ status: 'idle', lastAt: 1_000, lastError: 'boom' })
    expect(edgesOf(mux)).toEqual([{
      key: 's1:tool-error:1:1',
      sourceId: 's1',
      kind: 'tool-error',
      priority: 'error',
      at: 1_000,
      summary: 'tool error: boom',
    }])
  })

  it('dedupes a repeated failure of the same turn and step', () => {
    const mux = new EventMux()
    mux.record('s1', toolResult(1_000, { reason: 'boom' }), 1_000)
    mux.record('s1', toolResult(2_000, { reason: 'boom' }), 2_000)

    expect(edgesOf(mux)).toHaveLength(1)
    expect(mux.stats().revision).toBe(2)

    mux.record('s1', toolResult(3_000, { step: 2, reason: 'boom' }), 3_000)
    expect(edgesOf(mux)).toHaveLength(2)
  })

  it('falls back to the error code, then to a generic note', () => {
    const withCode = new EventMux()
    withCode.record('s1', toolResult(1_000, { code: 'E_TOOL' }), 1_000)
    expect(levelOf(withCode, 's1')?.lastError).toBe('E_TOOL')

    const bare = new EventMux()
    bare.record('s1', toolResult(1_000), 1_000)
    expect(levelOf(bare, 's1')?.lastError).toBe('tool failed')
  })

  it('touches the source without an edge for a successful tool result', () => {
    const mux = new EventMux()
    mux.record('s1', toolResult(1_000, { isError: false }), 1_000)

    expect(levelOf(mux, 's1')).toEqual({ status: 'idle', lastAt: 1_000 })
    expect(edgesOf(mux)).toEqual([])
  })
})

describe('EventMux user messages', () => {
  it('refreshes lastAt without changing the status or queueing an edge', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(1_000, 1), 1_000)
    mux.record('s1', userMessage(2_000), 2_000)

    const level = levelOf(mux, 's1')
    expect(level).toMatchObject({ status: 'running', turn: 1, lastAt: 2_000 })
    expect(level).not.toHaveProperty('lastKind')
    expect(level).not.toHaveProperty('preview')
    expect(edgesOf(mux)).toHaveLength(1)
    expect(mux.snapshot().revision).toBe(2)
  })
})

describe('EventMux agent status', () => {
  it('creates and flips a live-only level', () => {
    const mux = new EventMux()
    mux.agentStatus('s1', 'running', 1_000)
    expect(levelOf(mux, 's1')).toEqual({ status: 'running', lastAt: 1_000 })

    mux.agentStatus('s1', 'idle', 2_000)
    expect(levelOf(mux, 's1')).toEqual({ status: 'idle', lastAt: 2_000 })
    expect(mux.snapshot().revision).toBe(2)
    expect(edgesOf(mux)).toEqual([])
  })

  it('never overwrites a durable error level', () => {
    const mux = new EventMux()
    mux.record('s1', turnEnd(0, 1, 'error'), 1_000)
    const revision = mux.snapshot().revision

    mux.agentStatus('s1', 'running', 2_000)
    expect(levelOf(mux, 's1')).toMatchObject({ status: 'error', lastAt: 1_000 })
    expect(mux.snapshot().revision).toBe(revision)
  })
})

describe('EventMux remove', () => {
  it('deletes a source level and bumps the revision', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(0), 0)
    mux.remove('s1')

    expect(mux.snapshot().sources).toEqual({})
    expect(mux.snapshot().revision).toBe(2)
    expect(mux.stats().sources).toBe(0)
  })

  it('is a no-op for an unknown source', () => {
    const mux = new EventMux()
    mux.remove('missing')
    expect(mux.snapshot().revision).toBe(0)
  })
})

describe('EventMux snapshot', () => {
  it('reports a monotone revision across every mutation', () => {
    const mux = new EventMux()
    const revisions = [mux.snapshot().revision]
    mux.record('s1', turnStart(0), 0)
    revisions.push(mux.snapshot().revision)
    mux.record('s1', assistantMessage(1, ['hi']), 1)
    revisions.push(mux.snapshot().revision)
    mux.agentStatus('s2', 'running', 2)
    revisions.push(mux.snapshot().revision)
    mux.remove('s2')
    revisions.push(mux.snapshot().revision)

    expect(revisions).toEqual([0, 1, 2, 3, 4])
  })

  it('leaves ignored event types out of the snapshot', () => {
    const mux = new EventMux()
    mux.record('s1', stepStart(0), 0)
    expect(mux.snapshot()).toEqual({ revision: 0, sources: {}, edges: [] })
  })

  it('returns plain edges without the internal sequence', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(0), 0)

    const only = edgesOf(mux)[0]
    expect(only).toBeDefined()
    expect(Object.keys(only ?? {}).sort()).toEqual(['at', 'key', 'kind', 'priority', 'sourceId', 'summary'])
  })
})

describe('EventMux pending queue', () => {
  it('reads without consuming and acknowledges only when asked', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(0), 0)

    const pending = mux.pendingForWake()
    expect(pending.edges).toHaveLength(1)
    expect(mux.snapshot().edges).toHaveLength(1)
    mux.acknowledge(pending.edges.map(edge => edge.key))
    expect(mux.snapshot().edges).toEqual([])
    expect(mux.pendingForWake().edges).toEqual([])
  })

  it('orders edges by priority, then newest first', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(0, 1), 100)
    mux.record('s2', turnEnd(0, 1, 'completed'), 200)
    mux.record('s3', toolResult(0, { reason: 'boom' }), 300)
    mux.record('s4', toolResult(0, { reason: 'bang' }), 400)

    expect(mux.pendingForWake().edges.map(edge => edge.key)).toEqual([
      's4:tool-error:1:1',
      's3:tool-error:1:1',
      's2:turn-end:1',
      's1:turn-start:1',
    ])
  })

  it('bounds the read and keeps the rest queued', () => {
    const mux = new EventMux()
    mux.record('s1', turnStart(100, 1), 100)
    mux.record('s1', turnStart(200, 2), 200)
    mux.record('s1', turnStart(300, 3), 300)

    const first = mux.pendingForWake(2)
    expect(first.edges).toHaveLength(2)
    mux.acknowledge(first.edges.map(edge => edge.key))
    expect(mux.snapshot().edges).toHaveLength(1)
  })
})

describe('EventMux ignore', () => {
  it('drops the ignored source and never records it again', () => {
    const mux = new EventMux()
    mux.record('manager', turnEnd(0, 1, 'completed'), 1_000)
    mux.record('s1', turnStart(0, 1), 1_000)
    expect(mux.snapshot().sources).toHaveProperty('manager')

    mux.ignore('manager')
    expect(mux.isIgnored('manager')).toBe(true)
    expect(mux.snapshot().sources).not.toHaveProperty('manager')
    expect(mux.snapshot().edges.some(edge => edge.sourceId === 'manager')).toBe(false)

    mux.record('manager', turnStart(0, 2), 2_000)
    mux.agentStatus('manager', 'idle', 2_000)
    expect(mux.snapshot().sources).not.toHaveProperty('manager')
    expect(mux.snapshot().edges.some(edge => edge.sourceId === 'manager')).toBe(false)
  })
})

describe('EventMux digest', () => {
  it('is empty without edges', () => {
    expect(new EventMux().digest([])).toBe('')
  })

  it('renders one line per pending edge without consuming them', () => {
    const mux = new EventMux()
    mux.record('s1', toolResult(0, { reason: 'boom' }), 1_000)
    mux.record('s1', turnEnd(0, 1, 'completed'), 2_000)

    const pending = mux.pendingForWake()
    const digest = mux.digest(pending.edges, pending.dropped)
    expect(digest).toContain('[自动唤醒] 工作区/会话出现需要处理的变化：')
    expect(digest).toContain('- [错误] s1: tool error: boom')
    expect(digest).toContain('- [完成] s1: turn 1 ended (completed)')
    expect(mux.snapshot().edges).toHaveLength(2)
  })

  it('notes how many low-priority edges a bounded queue dropped', () => {
    const mux = new EventMux()
    fillProgressEdges(mux, 's1', MUX_LIMITS.perSource + 1)

    expect(mux.stats().dropped).toBe(1)
    const pending = mux.pendingForWake()
    expect(pending.dropped).toBe(1)
    expect(mux.digest(pending.edges, pending.dropped)).toContain('（另有 1 条低优先级事件因队列上限被丢弃）')
  })
})

describe('EventMux bounds', () => {
  it('trims one source to the per-source budget, lowest priority and oldest first', () => {
    const mux = new EventMux()
    fillProgressEdges(mux, 's1', 6)
    for (let step = 1; step <= 3; step += 1) {
      mux.record('s1', toolResult(2_000 + step, { step, reason: 'boom' }), 2_000 + step)
    }

    expect(edgesOf(mux)).toHaveLength(MUX_LIMITS.perSource)
    expect(mux.stats().dropped).toBe(1)

    const keys = edgesOf(mux).map(edge => edge.key)
    expect(keys).not.toContain('s1:turn-start:1')
    expect(keys).toContain('s1:turn-start:6')
    expect(keys.filter(key => key.includes(':tool-error:'))).toHaveLength(3)
  })

  it('trims the global list at the global budget, lowest priority and oldest first', () => {
    const mux = new EventMux()
    const sources = MUX_LIMITS.global / MUX_LIMITS.perSource
    for (let source = 0; source < sources; source += 1) {
      for (let turn = 1; turn <= MUX_LIMITS.perSource; turn += 1) {
        const at = source * 100 + turn
        mux.record(`s${source}`, turnStart(at, turn), at)
      }
    }
    expect(edgesOf(mux)).toHaveLength(MUX_LIMITS.global)
    expect(mux.stats().dropped).toBe(0)

    mux.record('overflow', toolResult(10_000, { reason: 'boom' }), 10_000)

    const keys = edgesOf(mux).map(edge => edge.key)
    expect(keys).toHaveLength(MUX_LIMITS.global)
    expect(mux.stats().dropped).toBe(1)
    expect(keys).toContain('overflow:tool-error:1:1')
    expect(keys).not.toContain('s0:turn-start:1')
  })

  it('keeps draining and stats consistent after overflow', () => {
    const mux = new EventMux()
    const sources = MUX_LIMITS.global / MUX_LIMITS.perSource + 2
    for (let source = 0; source < sources; source += 1) {
      for (let turn = 1; turn <= MUX_LIMITS.perSource; turn += 1) {
        const at = source * 100 + turn
        mux.record(`s${source}`, turnStart(at, turn), at)
      }
    }

    const stats = mux.stats()
    expect(stats.sources).toBe(sources)
    expect(stats.edges).toBe(MUX_LIMITS.global)
    expect(stats.dropped).toBe(sources * MUX_LIMITS.perSource - MUX_LIMITS.global)
    expect(stats.revision).toBe(mux.snapshot().revision)
    expect(edgesOf(mux)).toHaveLength(stats.edges)

    const pending = mux.pendingForWake(Number.MAX_SAFE_INTEGER)
    expect(pending.edges).toHaveLength(MUX_LIMITS.global)
    mux.acknowledge(pending.edges.map(edge => edge.key))
    expect(mux.stats()).toEqual({
      sources,
      edges: 0,
      dropped: stats.dropped,
      revision: stats.revision,
    })
  })
})
