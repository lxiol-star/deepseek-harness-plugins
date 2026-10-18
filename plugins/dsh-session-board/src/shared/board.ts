/**
 * The board model: session inputs plus the host feed become renderable cards.
 *
 * This is the only place the panel turns DSH facts into display state, so both
 * the docked column and the fullscreen board share exactly one implementation
 * of "what state is this card in, what does it say, and where does it sort".
 * It is pure and synchronous, which is what makes it testable.
 */
import { classify } from './classify.ts'
import {
  cacheHitPercent,
  inputTokens,
  openRunElapsedMs,
  progressRatio,
  tokensPerSecond,
  totalBusyMs,
} from './metrics.ts'
import { compactPreview, lastNonBlank } from './preview.ts'
import type {
  BoardEntry,
  BoardFeed,
  BoardSessionInput,
  BoardTurnStats,
} from './types.ts'

/** Collector for the text of a turn-outline entry. */
interface OutlineEntry {
  turn: number
  prompt?: string
  response?: string
}

/** Preview budgets, in code points. */
export const DEFAULT_INSTRUCTION_MAX = 120
export const DEFAULT_ACTIVITY_MAX = 120
export const DEFAULT_ERROR_MAX = 160

/** Options for one board build. */
export interface BuildBoardOptions {
  /** Wall clock for this frame; elapsed figures are derived against it. */
  now: number
  /** Durable host state. */
  feed: BoardFeed
  /**
   * Local time this client first observed an unread stop for a session. Used
   * only for the host-less fallback, where nothing durable supplies a key.
   */
  unreadSinceOf?: ((id: string) => number | null) | undefined
  /** Local time a pending interaction was first observed for a session. */
  pendingSinceOf?: ((id: string) => number | null) | undefined
  instructionMax?: number | undefined
  activityMax?: number | undefined
  errorMax?: number | undefined
}

/** Map a pending-interaction kind to its locale key. */
function pendingKeyOf(kind: string | null): string | null {
  switch (kind) {
    case null:
      return null
    case 'approval':
      return 'pending.approval'
    case 'plan-review':
      return 'pending.planReview'
    case 'question':
      return 'pending.question'
    default:
      // An unknown kind is still blocking, but the copy must not claim to know
      // which kind it is.
      return 'pending.unknown'
  }
}

/** Map a visual state to its status-line locale key. */
function noteKeyOf(state: BoardEntry['state']): string | null {
  switch (state) {
    case 'blocked':
      return 'note.blocked'
    case 'error':
      return 'note.error'
    case 'unread':
      return 'note.unread'
    default:
      return null
  }
}

/** The turn number of the latest started turn, or null. */
function latestTurn(timeline: readonly OutlineEntry[] | null): number | null {
  if (!Array.isArray(timeline) || timeline.length === 0) return null
  const last = timeline[timeline.length - 1]
  return last !== undefined && Number.isFinite(last.turn) ? last.turn : null
}

/** Derive one card from one session. */
export function buildEntry(input: BoardSessionInput, options: BuildBoardOptions): BoardEntry {
  const ack = options.feed.acks[input.id] ?? null
  const stats: BoardTurnStats | null = options.feed.turns[input.id] ?? null

  const result = classify({
    running: input.running,
    pendingInteraction: input.pendingInteraction !== null,
    completionUnread: input.completionUnread,
    ackLastTurnEnd: ack?.lastTurnEnd ?? null,
    ackAckedAt: ack?.ackedAt ?? null,
    ackLastTurnEndKind: ack?.lastTurnEndKind ?? null,
    pendingSince: options.pendingSinceOf?.(input.id) ?? null,
    unreadSince: options.unreadSinceOf?.(input.id) ?? null,
  })

  const timeline = input.turnOutline
  const usage = input.tokenUsage
  const sessionStats = input.sessionStats
  const rateTokS = tokensPerSecond(sessionStats?.decodeTokens, sessionStats?.decodeMs)
  const elapsedMs = openRunElapsedMs(stats, options.now)
  const isRunning = result.state === 'running'

  const instructionMax = options.instructionMax ?? DEFAULT_INSTRUCTION_MAX
  const activityMax = options.activityMax ?? DEFAULT_ACTIVITY_MAX
  const errorMax = options.errorMax ?? DEFAULT_ERROR_MAX

  const errorNote = result.state === 'error'
    ? compactPreview(ack?.lastTurnEndError, errorMax)
    : ''

  return {
    id: input.id,
    title: input.title,
    workspaceTitle: input.workspaceTitle,
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    ...(input.workspacePath === undefined ? {} : { workspacePath: input.workspacePath }),
    ...(input.clientArchived === true ? { clientArchived: true } : {}),
    isSubagent: input.isSubagent,
    state: result.state,
    group: result.group,
    attentionKind: result.attentionKind,
    waitSince: result.waitSince,
    runSince: stats?.openTurnStart ?? null,
    lastActivityAt: input.updatedAt,
    isCurrent: input.retainedMainView,
    preview: {
      instruction: compactPreview(lastNonBlank(timeline, entry => entry.prompt), instructionMax),
      // The open turn's in-progress text never reaches the wire, so the latest
      // *produced* text is the honest answer to "what did it just do".
      activity: compactPreview(lastNonBlank(timeline, entry => entry.response), activityMax),
      jobs: input.liveJobDetails ?? [],
    },
    progress: {
      turnN: latestTurn(timeline),
      stepM: Number.isFinite(sessionStats?.steps) ? (sessionStats?.steps as number) : null,
      ratio: isRunning && elapsedMs !== null ? progressRatio(elapsedMs, rateTokS) : null,
    },
    metrics: {
      elapsedMs,
      totalBusyMs: totalBusyMs(stats, options.now),
      outputTokens: Number.isFinite(usage?.outputTokens) ? (usage?.outputTokens as number) : null,
      inputTokens: inputTokens(usage),
      rateTokS,
      cacheHitPct: cacheHitPercent(usage),
      liveJobs: Number.isFinite(input.liveJobCount) ? input.liveJobCount : 0,
      runningSubagents: Number.isFinite(input.runningSubagentCount) ? input.runningSubagentCount : 0,
    },
    errorNote: errorNote === '' ? null : errorNote,
    noteKey: noteKeyOf(result.state),
    pendingKey: pendingKeyOf(input.pendingInteraction),
  }
}

/** Derive every card. Ordering is applied separately by the order layer. */
export function buildBoard(
  inputs: readonly BoardSessionInput[],
  options: BuildBoardOptions,
): BoardEntry[] {
  return inputs.map(input => buildEntry(input, options))
}
