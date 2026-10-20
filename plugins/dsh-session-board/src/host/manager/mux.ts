/**
 * Host-side event multiplexer (the "epoll" of the manager panel).
 *
 * Every live place that can need attention — a session turn, an agent status
 * flip, a task-assigned session — is a source identified by a stable string.
 * The mux folds their event streams into two shapes:
 *
 *  - a *level-triggered* snapshot (`snapshot()`) that the panel and the manager
 *    tools read at any time, and
 *  - a *edge-triggered* bounded list of "worth telling the manager" items
 *    (`consumeEdges()`), which the wake policy may turn into one digest.
 *
 * The shape mirrors epoll deliberately: sources are fds, `session/event` is the
 * readiness notification, the priority class is EPOLLPRI, the bounded edge list
 * is the overflow guard, and consuming the list is EPOLLONESHOT. There is no
 * per-event wakeup: one digest per drain.
 *
 * Only durable session facts and agent status are folded here. Live-only
 * waterfalls (`approval/request`, `user-questions/request`) are never touched:
 * a listener that fails to delegate would break the approval chain.
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'

/** One source's level-triggered truth. */
export interface MuxSourceLevel {
  /** Coarse state a panel can render. */
  readonly status: 'idle' | 'running' | 'waiting' | 'error' | 'done'
  /** Last open turn number. */
  readonly turn?: number
  /** Epoch milliseconds of the last folded event. */
  readonly lastAt: number
  /** Last `turn/end` reason kind (`completed`, `error`, …). */
  readonly lastKind?: string
  /** Truncated error note of the last failed turn/tool. */
  readonly lastError?: string
  /** Truncated assistant preview of the last message. */
  readonly preview?: string
}

/** Priority of one edge; declaration order is the rank. */
export type MuxPriority = 'needs-input' | 'error' | 'completed' | 'progress'

/** One edge worth a manager digest. */
export interface MuxEdge {
  /** Stable dedupe identity (`session:<id>:turn:<n>` …). */
  readonly key: string
  /** Source id the edge belongs to. */
  readonly sourceId: string
  /** Edge family, for display/tests. */
  readonly kind: 'turn-end' | 'tool-error' | 'turn-start' | 'agent-status'
  readonly priority: MuxPriority
  /** Epoch milliseconds. */
  readonly at: number
  /** One-line human-readable summary. */
  readonly summary: string
}

/** Full snapshot handed to the panel/tools. */
export interface MuxSnapshot {
  readonly revision: number
  readonly sources: Readonly<Record<string, MuxSourceLevel>>
  readonly edges: readonly MuxEdge[]
}

/** One entry of the bounded edge list. */
interface StoredEdge extends MuxEdge {
  readonly seq: number
}

/** Upper bounds; overflow drops the oldest low-priority edges first. */
export const MUX_LIMITS = {
  /** Edges kept per source. */
  perSource: 8,
  /** Edges kept overall. */
  global: 64,
  /** Longest stored error/preview text. */
  textMax: 160,
} as const

/** Rank of one priority (lower is more urgent). */
const PRIORITY_RANK: Record<MuxPriority, number> = {
  'needs-input': 0,
  error: 1,
  completed: 2,
  progress: 3,
}

/** Collapse one text field to a bounded single line (code points, not UTF-16 units). */
function clip(text: string, max = MUX_LIMITS.textMax): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const points = Array.from(collapsed)
  return points.length <= max ? collapsed : `${points.slice(0, Math.max(0, max - 1)).join('')}…`
}

/** Extract the plain text of an assistant message's content blocks. */
function assistantPreview(event: SessionEvent): string {
  if (event.type !== 'assistant/message') return ''
  const parts: string[] = []
  for (const block of event.data.message.content) {
    if (block.type === 'text') parts.push(block.text)
  }
  return clip(parts.join(' '))
}

/** Fold the `turn/end` reason into the source's coarse status. */
function statusAfterTurn(reason: string | undefined): MuxSourceLevel['status'] {
  if (reason === 'error' || reason === 'max-tokens' || reason === 'interrupted') return 'error'
  if (reason === 'aborted' || reason === 'blocked') return 'waiting'
  return 'done'
}

/**
 * The event multiplexer. One instance per plugin fiber; all state is in memory
 * and rebuilt from session logs/registries after a host restart.
 */
export class EventMux {
  private readonly levels = new Map<string, MuxSourceLevel>()
  private readonly edges: StoredEdge[] = []
  private revision = 0
  private seq = 0
  private dropped = 0
  /** Drops accumulated since the last drain; reported once, then reset. */
  private droppedSinceDrain = 0

  /**
   * Fold one committed session event into its source level and edges.
   * @param sessionId - source session id.
   * @param event - the committed durable event.
   * @param now - injectable clock for tests.
   */
  record(sessionId: string, event: SessionEvent, now = Date.now()): void {
    const current = this.levels.get(sessionId)
    const base: MuxSourceLevel = current ?? { status: 'idle', lastAt: now }
    const touch = (next: MuxSourceLevel): void => {
      this.levels.set(sessionId, next)
      this.revision += 1
    }
    switch (event.type) {
      case 'turn/start': {
        touch({ ...base, status: 'running', turn: event.data.turn, lastAt: now })
        this.pushEdge({
          key: `${sessionId}:turn-start:${event.data.turn}`,
          sourceId: sessionId,
          kind: 'turn-start',
          priority: 'progress',
          at: now,
          summary: `turn ${event.data.turn} started`,
        })
        return
      }
      case 'turn/end': {
        const reason = event.data.reason.kind
        const status = statusAfterTurn(reason)
        touch({
          ...base,
          status,
          turn: event.data.turn,
          lastAt: now,
          lastKind: reason,
          ...(status === 'error' ? { lastError: base.preview ?? 'turn failed' } : {}),
        })
        this.pushEdge({
          key: `${sessionId}:turn-end:${event.data.turn}`,
          sourceId: sessionId,
          kind: 'turn-end',
          priority: status === 'error' ? 'error' : 'completed',
          at: now,
          summary: `turn ${event.data.turn} ended (${reason})`,
        })
        return
      }
      case 'assistant/message': {
        const preview = assistantPreview(event)
        touch({ ...base, lastAt: now, ...(preview === '' ? {} : { preview }) })
        return
      }
      case 'tool/result': {
        if (event.data.message.isError !== true) {
          touch({ ...base, lastAt: now })
          return
        }
        const detail = clip(String(event.data.error?.reason ?? event.data.error?.code ?? 'tool failed'))
        touch({ ...base, lastAt: now, lastError: detail })
        this.pushEdge({
          key: `${sessionId}:tool-error:${event.data.turn}:${event.data.step}`,
          sourceId: sessionId,
          kind: 'tool-error',
          priority: 'error',
          at: now,
          summary: `tool error: ${detail}`,
        })
        return
      }
      case 'user/message': {
        touch({ ...base, lastAt: now })
        return
      }
      default:
        return
    }
  }

  /**
   * Fold one agent status flip. Agent status is live-only; a later session
   * event still wins because it carries the durable truth.
   * @param sessionId - source session id.
   * @param status - agent status.
   * @param now - injectable clock.
   */
  agentStatus(sessionId: string, status: 'idle' | 'running', now = Date.now()): void {
    const current = this.levels.get(sessionId)
    if (current !== undefined && current.status === 'error') return
    const next: MuxSourceLevel = { ...(current ?? { lastAt: now }), status, lastAt: now }
    this.levels.set(sessionId, next)
    this.revision += 1
  }

  /** Drop one source (session disposed) together with its queued edges. */
  remove(sessionId: string): void {
    const hadEdges = this.edges.some(edge => edge.sourceId === sessionId)
    if (hadEdges) this.removeBySeq(new Set(this.edges.filter(edge => edge.sourceId === sessionId).map(edge => edge.seq)))
    if (!this.levels.delete(sessionId) && !hadEdges) return
    this.revision += 1
  }

  /** Read the level-triggered truth plus the current edge list. */
  snapshot(): MuxSnapshot {
    const sources: Record<string, MuxSourceLevel> = {}
    for (const [id, level] of this.levels) sources[id] = level
    return {
      revision: this.revision,
      sources,
      edges: this.edges.map(({ key, sourceId, kind, priority, at, summary }) =>
        ({ key, sourceId, kind, priority, at, summary })),
    }
  }

  /**
   * Drain ready edges for one manager digest (EPOLLONESHOT): the caller gets
   * the highest-priority items in reverse-age order and the list is cleared.
   * @param maxItems - upper bound of returned edges.
   * @returns up to `maxItems` edges, urgent first.
   */
  consumeEdges(maxItems = 20): MuxEdge[] {
    return this.drain(maxItems).edges
  }

  /**
   * Drain the bounded edge list (EPOLLONESHOT) and report what the queue had
   * to drop since the previous drain. The surplus beyond `maxItems` is a real
   * loss too: it is counted in `stats().dropped` instead of vanishing.
   */
  private drain(maxItems: number): { edges: MuxEdge[]; dropped: number } {
    const limit = Math.max(1, maxItems)
    if (this.edges.length === 0) {
      const dropped = this.droppedSinceDrain
      this.droppedSinceDrain = 0
      return { edges: [], dropped }
    }
    const sorted = [...this.edges].sort((left, right) =>
      PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] || right.at - left.at)
    const picked = sorted.slice(0, limit)
    const surplus = Math.max(0, this.edges.length - limit)
    this.edges.length = 0
    this.dropped += surplus
    const dropped = this.droppedSinceDrain + surplus
    this.droppedSinceDrain = 0
    return {
      edges: picked.map(({ key, sourceId, kind, priority, at, summary }) =>
        ({ key, sourceId, kind, priority, at, summary })),
      dropped,
    }
  }

  /** Manager digest text for the edges drained by one wakeup. */
  digest(maxItems = 20): string {
    const { edges, dropped } = this.drain(maxItems)
    if (edges.length === 0) return ''
    const lines = edges.map(edge => `- [${edge.priority}] ${edge.sourceId}: ${edge.summary}`)
    return [
      '[自动唤醒] 工作区/会话出现需要处理的变化：',
      ...lines,
      ...(dropped > 0 ? [`（有 ${dropped} 条低优先级事件因队伍上限被丢弃）`] : []),
    ].join('\n')
  }

  /** Per-source edge budget: drop the oldest progress edges of that source. */
  private trimSource(sourceId: string): void {
    const own = this.edges.filter(edge => edge.sourceId === sourceId)
    if (own.length <= MUX_LIMITS.perSource) return
    const excess = own.length - MUX_LIMITS.perSource
    own.sort((left, right) => PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority] || left.at - right.at)
    const drop = new Set(own.slice(0, excess).map(edge => edge.seq))
    this.removeBySeq(drop)
    this.dropped += drop.size
    this.droppedSinceDrain += drop.size
  }

  /** Global edge budget: drop the oldest lowest-priority edges. */
  private trimGlobal(): void {
    if (this.edges.length <= MUX_LIMITS.global) return
    const excess = this.edges.length - MUX_LIMITS.global
    const order = [...this.edges].sort((left, right) =>
      PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority] || left.at - right.at)
    const drop = new Set(order.slice(0, excess).map(edge => edge.seq))
    this.removeBySeq(drop)
    this.dropped += drop.size
    this.droppedSinceDrain += drop.size
  }

  private removeBySeq(drop: ReadonlySet<number>): void {
    let write = 0
    for (let read = 0; read < this.edges.length; read += 1) {
      const edge = this.edges[read]
      if (edge === undefined || drop.has(edge.seq)) continue
      this.edges[write] = edge
      write += 1
    }
    this.edges.length = write
  }

  /** Append one bounded edge, deduping an identical live key. */
  private pushEdge(input: Omit<MuxEdge, 'priority'> & { priority: MuxPriority }): void {
    if (this.edges.some(edge => edge.key === input.key)) return
    this.seq += 1
    this.edges.push({ ...input, seq: this.seq })
    this.trimSource(input.sourceId)
    this.trimGlobal()
  }

  /** Observability: counts for tests, logs and the panel footer. */
  stats(): { sources: number; edges: number; dropped: number; revision: number } {
    return { sources: this.levels.size, edges: this.edges.length, dropped: this.dropped, revision: this.revision }
  }
}
