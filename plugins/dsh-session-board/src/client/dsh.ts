/**
 * Client-side mirrors of the DSH services this plugin reads.
 *
 * These are declared structurally rather than imported from the harness
 * packages, for two reasons: the shared/client layers then carry no build-time
 * dependency on DSH internals, and the exact fields the panel relies on are
 * written down in one place instead of being spread across imports. Every
 * member here was verified against the installed 0.2.0-rc.2 client; a field
 * that disappears upstream degrades to `undefined` at runtime rather than
 * throwing.
 */

/** A read-only observable snapshot: the shape the client store exposes. */
export interface Source<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** Retention counts of one session, by consumer source. */
export interface RetainInfo {
  referenceCount?: number
  retainedBy?: Partial<Record<string, number>>
}

/** One row of `ctx.sessions.list`. */
export interface SessionSummary {
  id: string
  title?: string
  displayTitle: string
  cwd?: string
  parentId?: string
  origin?: 'subagent'
  running: boolean
  blank: boolean
  updatedAt: number
  retainedBy?: Partial<Record<string, number>>
  projectionValues?: Readonly<Record<string, unknown>>
}

/** The `ctx.sessions.list` snapshot. */
export interface SessionListState {
  ids: string[]
  byId: Record<string, SessionSummary>
  phase?: string
  projectionsBySession?: Readonly<Record<string, { state?: string; values?: Readonly<Record<string, unknown>> }>>
}

/** One session's status, as `ctx.uiSession.sessionStatus` publishes it. */
export interface SessionStatus {
  running: boolean | undefined
  pendingInteraction: { key: string; kind: string; sessionId: string } | undefined
  completionUnread: boolean
}

/** The status snapshot: a map keyed by session id. */
export type SessionStatusSnapshot = ReadonlyMap<string, SessionStatus>

/** One job row, as `ctx.jobs.state` publishes it. */
export interface JobView {
  id: string
  status: string
  label?: string
  kind?: string
  progress?: string
  detail?: string
}

/** The `ctx.jobs.state` snapshot. */
export interface JobsSnapshot {
  rows: Readonly<Record<string, readonly JobView[]>>
  observed?: Readonly<Record<string, unknown>>
}

/** The client jobs service face (only the members used here). */
export interface JobsService {
  state: Source<JobsSnapshot>
  watchRows(sessionId: string): () => void
}

/** The `ctx.workspaces.list` snapshot (only the members used here). */
export interface WorkspaceSnapshot {
  items: readonly { workspaceId: string; title?: string; path: string; sessionIds?: readonly string[] }[]
  /** The DSH client's own archive set; the board mirrors it instead of keeping a second one. */
  archivedSessionIds?: readonly string[]
  pinnedSessionIds?: readonly string[]
}

/** The client workspaces service face (only the members used here). */
export interface WorkspacesService {
  list: Source<WorkspaceSnapshot>
}

/** One durable subagent address, the only target that can reveal a child Session. */
export interface SubagentAddress {
  parentSessionId: string
  childSessionId: string
  mode?: string
}

/** One text part of a prompt, exactly as the official session face accepts it. */
export interface PromptTextPart {
  type: 'text'
  text: string
}

/** Whether the host accepted one prompt. Mirrors the Remote result branch. */
export type PromptResult =
  | { ok: true; value: { accepted: true } }
  | { ok: false; error: { code?: string; message?: string } }

/**
 * The behavior half of one retained Session that the manager panel calls.
 * Only `prompt` is used: the embedded chat renders the rest through slots.
 */
export interface RetainedSessionFace {
  prompt(content: readonly PromptTextPart[], mode: 'queue' | 'steer', signal?: AbortSignal): Promise<PromptResult>
}

/** The binding behind a retained Session reference. */
export interface RetainedSessionBinding {
  readonly session: RetainedSessionFace
}

/** One owned use of an exact Client Session generation. */
export interface SessionReference {
  readonly sessionId: string
  /** Shared binding; only valid after {@link SessionReference.ready} settles. */
  readonly binding: RetainedSessionBinding
  /** This reference's wait for the shared initial Session opening. */
  readonly ready: Promise<RetainedSessionBinding>
  release(): void
}

/** Consumer identity and optional cancellation of one retention. */
export interface SessionRetainOptions {
  readonly source: string
  readonly signal?: AbortSignal | undefined
}

/** Retention and prompting, the two session-service members the panel needs. */
export type RetainSession = (target: string, options: SessionRetainOptions) => SessionReference

/** The sessions service face (only the members used here). */
export interface SessionsService {
  list: Source<SessionListState>
  refreshProjections(sessionId: string): Promise<void>
  /** The durable address of a subagent Session, when the client knows one. */
  subagentAddress?(sessionId: string): SubagentAddress | undefined
  /** Retain a session for the manager chat and explicit prompt sends. */
  retain?: RetainSession
  /** Refresh the Host-authoritative Session list before retaining an unseen id. */
  refresh?: () => Promise<void>
}

/** The navigation service that actually switches the displayed session. */
export interface UiWorkspaceService {
  /** Show a main Session id, or a child Session through its durable address. */
  openSession(target: string | SubagentAddress): void
  archiveSession?: (id: string) => Promise<void>
  unarchiveSession?: (id: string) => Promise<void>
}

/** The uiSession service face (only the members used here). */
export interface UiSessionService {
  sessionStatus: Source<SessionStatusSnapshot>
}

/** Host-folded token accounting. */
export interface TokenUsageProjection {
  uncachedInputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Host-folded cumulative session statistics. */
export interface SessionStatsProjection {
  turns?: number
  steps?: number
  llmMs?: number
  toolMs?: number
  decodeMs?: number
  decodeTokens?: number
}

/** Host-folded per-turn previews. */
export interface TurnOutlineProjection {
  turn: number
  seq?: number
  prompt?: string
  response?: string
}

/** One entry of the host `subagentCatalog` projection. */
export interface SubagentCatalogEntry {
  id: string
  mode?: string
  label?: string
}

/** Read a projection value off a list row, tolerating a missing projection. */
export function projectionOf<T>(row: SessionSummary | undefined, key: string): T | null {
  const values = row?.projectionValues as Record<string, unknown> | undefined
  const value = values?.[key]
  return value === undefined || value === null ? null : (value as T)
}

/** Whether a session row is a subagent child rather than a top-level session. */
export function isSubagentRow(row: SessionSummary): boolean {
  return row.origin === 'subagent' && typeof row.parentId === 'string'
}
