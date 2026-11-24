/**
 * Read-only detail snapshot of the whole tower for the global canvas.
 *
 * The Host serves it from the same loopback route as the dock snapshot when
 * the request carries `detail=1`. It is a strict superset of the dock snapshot:
 * every mission (merged and abandoned ones included) with its dependency,
 * scope, task, blocker, and review detail, the full agent roster, inbox
 * message metadata, filed findings, and the tail of the activity log.
 *
 * Nothing here writes. The state file is only loaded, finding files are read by
 * their head only, the activity log is read from its end, and no store method
 * that takes a lock or records a read is ever called. Inbox files are read
 * through the store's frontmatter reader, which stops at the end of the
 * frontmatter but works in 16 KiB chunks, so some body text may be read from
 * disk; it is discarded at once and never enters the snapshot.
 */

import { open, readdir } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'

import type { TowerMission, TowerReviewInfo, TowerRosterEntry, TowerState, TowerStore } from './protocol/index'
import {
  ACTIVITY_LOG,
  BROADCAST_NAME,
  FINDINGS_DIR,
  INBOX_DIR,
  TOWER_FILE_IO_CONCURRENCY,
  TOWER_NAME,
  inboxItemUnread,
  mapWithConcurrency,
  parseFrontmatter,
  readFrontmatterPrefix,
} from './protocol/index'
import type { RosterIndex, SnapshotContext, TowerCard, TowerSnapshot } from './status'
import { isAgentLive, rosterIndex, snapshotSource, towerCard } from './status'

export interface CanvasTask {
  readonly text: string
  readonly done: boolean
  readonly dropped?: boolean
}

/** The latest review round recorded for a mission's branch. */
export interface CanvasReview {
  readonly round: number
  readonly reviewer: string
  readonly status: string
  readonly merge: string
  /** When the review was recorded: a full instant, or only its date. */
  readonly at?: string
}

export interface CanvasMission extends TowerCard {
  readonly deps: readonly string[]
  readonly scope: readonly string[]
  readonly tasks: readonly CanvasTask[]
  readonly blockers: readonly string[]
  readonly notes: readonly string[]
  /** The user's own words the mission was planned from. */
  readonly context?: string
  readonly keyArtifacts: readonly string[]
  readonly review?: CanvasReview
}

export interface CanvasAgent {
  readonly name: string
  readonly kind: TowerRosterEntry['kind']
  readonly agentId: string
  readonly missionId?: string
  readonly reviewMissionId?: string
  readonly reviewTarget?: string
  readonly spawnedAt: string
  readonly live: boolean
  readonly diedAt?: string
  readonly deathStatus?: string
  readonly deathReason?: string
  readonly model?: string
  readonly effort?: string
}

export interface CanvasMessage {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly sentAt: string
  readonly action?: string
  readonly scope?: string
  /** True once every recipient has read the message. */
  readonly read: boolean
  /** Recipients that have not read it yet; omitted when there are none. */
  readonly unreadBy?: readonly string[]
}

export interface CanvasFinding {
  readonly title: string
  readonly type: string
  readonly severity: string
  /** The file or symbol the finding concerns. */
  readonly location?: string
  /** First paragraph of the finding's summary. */
  readonly summary?: string
  /** Repository-relative path of the finding document. */
  readonly file: string
  readonly agent?: string
  readonly missionId?: string
  /** When the finding was filed: a full instant, or only its date. */
  readonly createdAt?: string
}

export interface CanvasSnapshot extends TowerSnapshot {
  readonly missions: readonly CanvasMission[]
  readonly agents: readonly CanvasAgent[]
  readonly messages: readonly CanvasMessage[]
  readonly findings: readonly CanvasFinding[]
  readonly activity: readonly string[]
}

/**
 * Hard bounds that keep the canvas payload small and its text single-line.
 * Contract limits: subjects 160, mission context 2000, notes and blockers 500
 * each, at most 100 tasks, 40 scope entries, 20 notes, 20 blockers, 200
 * messages, and 50 activity lines.
 */
export const CANVAS_LIMITS = {
  /** An inbox subject. */
  subject: 160,
  /** Titles, names, ids, verdicts, and other short labels. */
  label: 160,
  /** A mission's context. */
  context: 2000,
  /** One task, note, blocker, scope, artifact, or death-reason line. */
  line: 500,
  /** The first paragraph of a finding summary. */
  summary: 300,
  /** One activity log line. */
  activityLine: 1000,
  /** Activity log lines, counted from the end of the file, searched for recorded instants. */
  logTail: 1000,
  tasks: 100,
  scope: 40,
  notes: 20,
  blockers: 20,
  messages: 200,
  activity: 50,
} as const

/** The canvas snapshot of a session that owns no tower. */
export const CANVAS_INACTIVE: CanvasSnapshot = {
  active: false,
  running: 0,
  missions: [],
  agents: [],
  messages: [],
  findings: [],
  activity: [],
}

const FENCE = '---'
const FINDING_HEADING = '# Finding: '
const FINDING_DATE = /^\d{8}$/
const MISSION_ID = /^M\d+/
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
const HEAD_BYTES = 16 * 1024
const LOG_TAIL_CHUNK_BYTES = 64 * 1024

/** Collapse all whitespace to single spaces, trim, and cut to at most `max` code units. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const last = cut.charCodeAt(cut.length - 1)
  // Never leave half of a surrogate pair at the cut.
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut
}

/** `oneLine` for an optional field: undefined or empty stays undefined, so the key is omitted. */
function optionalLine(value: string | undefined, max: number): string | undefined {
  const flat = value === undefined ? '' : oneLine(value, max)
  return flat.length === 0 ? undefined : flat
}

/** Spread helper that adds `{ key: value }` only when `value` is defined. */
function field<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value }
}

/**
 * Single-line every string in `values` and cap each at `limit`. With `max`,
 * keep only the first `max` entries, or the last ones when `keepLast` is set.
 */
function textList(
  values: readonly string[] | undefined,
  limit: number,
  max?: number,
  keepLast = false,
): string[] {
  if (!Array.isArray(values)) return []
  const flat = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => oneLine(value, limit))
  if (max === undefined) return flat
  return keepLast ? flat.slice(-max) : flat.slice(0, max)
}

/**
 * Read state of one message for the canvas. Each recipient is judged by the
 * store's own `inboxItemUnread` rule, the one the inbox tools and the
 * completion gate use, so the canvas cannot disagree with them.
 *
 * Recipients are the tower for `to=tower`, the named roster agent for a
 * direct message, and for a broadcast the tower plus the roster agents that
 * existed when it was sent. The sender never has to read its own message, and
 * agents that have died are left out of a broadcast so it does not stay
 * unread forever. A direct message keeps its one named recipient even after
 * that agent died: a message its only reader never saw stays unread.
 */
function messageReadState(
  state: TowerState,
  message: { readonly id: string; readonly from: string; readonly to: string; readonly sentAt: string },
): Pick<CanvasMessage, 'read' | 'unreadBy'> {
  let recipients: readonly string[]
  if (message.to === TOWER_NAME) {
    recipients = [TOWER_NAME]
  } else if (message.to === BROADCAST_NAME) {
    recipients = [
      TOWER_NAME,
      ...state.roster.agents
        .filter((entry) => entry.spawnedAt <= message.sentAt && entry.diedAt === undefined)
        .map((entry) => entry.name),
    ]
  } else if (state.roster.agents.some((entry) => entry.name === message.to)) {
    recipients = [message.to]
  } else {
    recipients = []
  }
  const unreadBy = recipients.filter(
    (name) => name !== message.from
      && inboxItemUnread(state, name, { messageId: message.id, sentAt: message.sentAt }),
  )
  return {
    read: unreadBy.length === 0,
    ...field('unreadBy', unreadBy.length === 0 ? undefined : unreadBy),
  }
}

/** The header of one inbox file: frontmatter only, never the body. */
interface InboxHead {
  readonly file: string
  readonly id: string
  readonly from: string
  readonly to: string
  readonly subject: string
  readonly sentAt: string
  readonly action?: string
  readonly scope?: string
}

/** Read every inbox file's frontmatter through the store's own parser, oldest first. */
async function readInboxHeads(store: TowerStore): Promise<readonly InboxHead[]> {
  let files: readonly string[]
  try {
    files = await readdir(store.abs(INBOX_DIR))
  } catch {
    return []
  }
  const heads = await mapWithConcurrency(
    files.filter((file) => file.endsWith('.md')),
    TOWER_FILE_IO_CONCURRENCY,
    async (file): Promise<InboxHead | undefined> => {
      const rel = join(INBOX_DIR, file)
      let text: string
      try {
        text = await readFrontmatterPrefix(store.abs(rel))
      } catch {
        return undefined
      }
      // Only the fields are kept; any body text read past them is discarded here.
      const { fields } = parseFrontmatter(text)
      if (fields['type'] !== 'inbox') return undefined
      const action = fields['action']
      const scope = fields['scope']
      return {
        file: rel,
        id: fields['message_id'] ?? rel,
        from: fields['from'] ?? 'unknown',
        to: fields['to'] ?? '',
        subject: fields['subject'] ?? '',
        sentAt: fields['sent_at'] ?? '',
        ...field('action', action === undefined || action.length === 0 ? undefined : action),
        ...field('scope', scope === undefined || scope.length === 0 ? undefined : scope),
      }
    },
  )
  const present = heads.filter((head): head is InboxHead => head !== undefined)
  present.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.file.localeCompare(b.file))
  return present
}

/** The header and first sections of one finding document. */
interface FindingHead {
  readonly file: string
  readonly title: string
  readonly type: string
  readonly severity: string
  readonly agent?: string
  readonly missionId?: string
  readonly location?: string
  readonly summary?: string
  /** The date the document records for itself, `YYYY-MM-DD`. */
  readonly date?: string
}

/** Lines of the section under a `## Heading`, up to the next heading or fence. */
function sectionLines(lines: readonly string[], heading: string): readonly string[] {
  const start = lines.findIndex((line) => line.trim() === heading)
  if (start === -1) return []
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('#') || line.trim() === FENCE)
  return end === -1 ? rest : rest.slice(0, end)
}

/** The leading paragraph of a section: its first run of non-blank lines. */
function firstParagraph(section: readonly string[]): string {
  const paragraph: string[] = []
  for (const line of section) {
    if (line.trim().length === 0) {
      if (paragraph.length > 0) break
      continue
    }
    paragraph.push(line)
  }
  return paragraph.join('\n')
}

/** Parse the head of a finding document the way `fileFinding` writes it. */
function parseFinding(text: string, file: string): FindingHead | undefined {
  const lines = text.split(/\r?\n/)
  const heading = lines[0] ?? ''
  if (!heading.startsWith(FINDING_HEADING)) return undefined
  const fence = lines.findIndex((line, index) => index > 0 && line.trim() === FENCE)
  const header = lines.slice(1, fence === -1 ? lines.length : fence)
  const attribute = (label: string): string | undefined => {
    const prefix = `**${label}**: `
    const line = header.find((candidate) => candidate.startsWith(prefix))
    return line === undefined ? undefined : line.slice(prefix.length)
  }
  const type = attribute('Type')
  const severity = attribute('Severity')
  if (type === undefined || severity === undefined) return undefined

  const mission = attribute('Mission')
  const missionId = mission === undefined || mission.trim() === '(none)'
    ? undefined
    : MISSION_ID.exec(mission)?.[0]
  const stamp = attribute('Date') ?? ''
  const location = oneLine(sectionLines(lines, '## Location').join('\n'), CANVAS_LIMITS.line)
  return {
    file,
    title: heading.slice(FINDING_HEADING.length),
    type,
    severity,
    ...field('agent', optionalLine(attribute('Agent'), CANVAS_LIMITS.label)),
    ...field('missionId', missionId),
    ...field('location', location === '' || location === '(not specified)' ? undefined : location),
    ...field('summary', optionalLine(firstParagraph(sectionLines(lines, '## Summary')), CANVAS_LIMITS.summary)),
    ...(FINDING_DATE.test(stamp)
      ? { date: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}` }
      : {}),
  }
}

/** Read at most the first `HEAD_BYTES` of a file; '' when it cannot be read. */
async function readHead(path: string): Promise<string> {
  let handle: FileHandle
  try {
    handle = await open(path, 'r')
  } catch {
    return ''
  }
  try {
    const buffer = Buffer.allocUnsafe(HEAD_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0)
    return new TextDecoder().decode(buffer.subarray(0, bytesRead))
  } catch {
    return ''
  } finally {
    await handle.close()
  }
}

/** Read the head of every finding document. */
async function readFindings(store: TowerStore): Promise<readonly FindingHead[]> {
  let files: readonly string[]
  try {
    files = await readdir(store.abs(FINDINGS_DIR))
  } catch {
    return []
  }
  const heads = await mapWithConcurrency(
    files.filter((file) => file.endsWith('.md')),
    TOWER_FILE_IO_CONCURRENCY,
    async (file): Promise<FindingHead | undefined> => {
      const rel = join(FINDINGS_DIR, file)
      return parseFinding(await readHead(store.abs(rel)), rel)
    },
  )
  return heads.filter((head): head is FindingHead => head !== undefined)
}

/** A `review.write` log line, reduced to what identifies the review it recorded. */
interface RecordedReview {
  readonly at: string
  readonly actor: string
  readonly reviewed: string
  readonly round: string
}

interface LogTail {
  /** The last lines of the log, oldest first. */
  readonly lines: readonly string[]
  /** Instants of `finding.file` entries, by the finding file they recorded. */
  readonly filedAt: ReadonlyMap<string, string>
  readonly reviews: readonly RecordedReview[]
}

/**
 * The last lines of a file, read backwards in chunks so that a long log costs
 * bounded IO however far it has grown.
 */
async function readLogTail(path: string): Promise<readonly string[]> {
  let handle: FileHandle
  try {
    handle = await open(path, 'r')
  } catch {
    return []
  }
  try {
    const { size } = await handle.stat()
    const parts: Buffer[] = []
    let lines: string[] = []
    let end = size
    while (end > 0) {
      const start = Math.max(0, end - LOG_TAIL_CHUNK_BYTES)
      const buffer = Buffer.allocUnsafe(end - start)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
      if (bytesRead === 0) break
      parts.unshift(buffer.subarray(0, bytesRead))
      end = start
      lines = Buffer.concat(parts).toString('utf8').split('\n').filter((line) => line.trim().length > 0)
      if (lines.length > CANVAS_LIMITS.logTail) break
    }
    return lines.slice(-CANVAS_LIMITS.logTail)
  } catch {
    return []
  } finally {
    await handle.close()
  }
}

/** Value of the exact `key=value` token among a log line's space-separated fields. */
function logValue(line: readonly string[], key: string): string | undefined {
  const prefix = `${key}=`
  const token = line.find((part) => part.startsWith(prefix))
  return token === undefined ? undefined : token.slice(prefix.length)
}

/**
 * Pick the instants the store recorded, from the log tail only. A finding is
 * matched by the file its `finding.file` line refers to; a review by the
 * commit and round its `review.write` line names.
 */
function parseLogTail(lines: readonly string[]): LogTail {
  const filedAt = new Map<string, string>()
  const reviews: RecordedReview[] = []
  for (const line of lines) {
    const tokens = line.split(' ')
    const at = tokens[0]
    const actor = tokens[1]
    const action = tokens[2]
    if (at === undefined || actor === undefined || action === undefined) continue
    if (!INSTANT.test(at) || Number.isNaN(Date.parse(at))) continue
    if (action === 'finding.file') {
      const ref = logValue(tokens, 'ref')
      if (ref !== undefined && !filedAt.has(ref)) filedAt.set(ref, at)
    } else if (action === 'review.write') {
      const reviewed = logValue(tokens, 'reviewed')
      const round = logValue(tokens, 'round')
      if (reviewed !== undefined && round !== undefined) reviews.push({ at, actor, reviewed, round })
    }
  }
  return { lines, filedAt, reviews }
}

/**
 * When a review was recorded: the instant of its `review.write` log line when
 * the log tail still has it, otherwise the date on the review itself. File
 * modification times are never used.
 */
function reviewRecordedAt(review: TowerReviewInfo, log: LogTail): string | undefined {
  const reviewed = review.reviewedCommit.slice(0, 7)
  const round = String(review.round)
  const matches = (entry: RecordedReview): boolean =>
    entry.reviewed === reviewed && entry.round === round
  const recorded = log.reviews.find((entry) => matches(entry) && entry.actor === review.reviewer)
    ?? log.reviews.find(matches)
  if (recorded !== undefined) return recorded.at
  const date = review.date.trim()
  return date.length === 0 ? undefined : date
}

function canvasReview(review: TowerReviewInfo, log: LogTail): CanvasReview {
  return {
    round: review.round,
    reviewer: review.reviewer,
    status: review.status,
    merge: review.merge,
    ...field('at', reviewRecordedAt(review, log)),
  }
}

function canvasMission(
  mission: TowerMission,
  card: TowerCard,
  review: CanvasReview | undefined,
): CanvasMission {
  const tasks: readonly CanvasTask[] = Array.isArray(mission.tasks)
    ? mission.tasks.slice(0, CANVAS_LIMITS.tasks).map((task) => ({
      text: oneLine(task?.text ?? '', CANVAS_LIMITS.line),
      done: task?.done === true,
      ...field('dropped', task?.dropped === undefined ? undefined : task.dropped === true),
    }))
    : []
  return {
    ...card,
    deps: textList(mission.deps, CANVAS_LIMITS.label),
    scope: textList(mission.scope, CANVAS_LIMITS.line, CANVAS_LIMITS.scope),
    tasks,
    blockers: textList(mission.blockers, CANVAS_LIMITS.line, CANVAS_LIMITS.blockers, true),
    notes: textList(mission.notes, CANVAS_LIMITS.line, CANVAS_LIMITS.notes, true),
    ...field('context', optionalLine(mission.context, CANVAS_LIMITS.context)),
    keyArtifacts: textList(mission.keyArtifacts, CANVAS_LIMITS.line),
    ...field('review', review),
  }
}

function canvasAgent(ctx: SnapshotContext, entry: TowerRosterEntry): CanvasAgent {
  // `current?.()` as in the dock card: an unusable Host model omits the name only.
  const selection = ctx.agents.get(entry.agentId)?.model?.current?.()
  return {
    name: oneLine(entry.name, CANVAS_LIMITS.label),
    kind: entry.kind,
    agentId: oneLine(entry.agentId, CANVAS_LIMITS.label),
    ...field('missionId', optionalLine(entry.missionId, CANVAS_LIMITS.label)),
    ...field('reviewMissionId', optionalLine(entry.reviewMissionId, CANVAS_LIMITS.label)),
    ...field('reviewTarget', optionalLine(entry.reviewTarget, CANVAS_LIMITS.label)),
    spawnedAt: entry.spawnedAt,
    live: isAgentLive(ctx, entry),
    ...field('diedAt', entry.diedAt),
    ...field('deathStatus', optionalLine(entry.deathStatus, CANVAS_LIMITS.label)),
    ...field('deathReason', optionalLine(entry.deathReason, CANVAS_LIMITS.line)),
    ...field('model', selection?.model),
    ...field('effort', selection?.reasoningEffort),
  }
}

/**
 * Build the canvas snapshot of the tower bound to `sessionId` from one live
 * main agent and its repository state.
 */
export async function canvasSnapshot(ctx: SnapshotContext, sessionId: string): Promise<CanvasSnapshot> {
  const source = await snapshotSource(ctx, sessionId)
  if (source === undefined) return CANVAS_INACTIVE
  const { store, state, repoRoot } = source
  const roster: RosterIndex = rosterIndex(state)
  const now = Date.now()

  // Every read below is independent, so they run together; none of them writes.
  const [log, inbox, findings, reviews] = await Promise.all([
    readLogTail(store.abs(ACTIVITY_LOG)).then(parseLogTail),
    readInboxHeads(store),
    readFindings(store),
    mapWithConcurrency(
      state.missions,
      TOWER_FILE_IO_CONCURRENCY,
      (mission) => store.reviewsFor(mission.branch),
    ),
  ])

  const missions = state.missions.map((mission, index): CanvasMission => {
    const latest = reviews[index]?.at(-1)
    return canvasMission(
      mission,
      towerCard(mission, roster, ctx, repoRoot, now),
      latest === undefined ? undefined : canvasReview(latest, log),
    )
  })

  const messages = inbox.slice(-CANVAS_LIMITS.messages).map(
    (head): CanvasMessage => ({
      id: head.id,
      from: oneLine(head.from, CANVAS_LIMITS.label),
      to: oneLine(head.to, CANVAS_LIMITS.label),
      subject: oneLine(head.subject, CANVAS_LIMITS.subject),
      sentAt: head.sentAt,
      ...field('action', optionalLine(head.action, CANVAS_LIMITS.label)),
      ...field('scope', optionalLine(head.scope, CANVAS_LIMITS.label)),
      ...messageReadState(state, head),
    }),
  )

  const canvasFindings = findings.map(
    (head): CanvasFinding => ({
      title: oneLine(head.title, CANVAS_LIMITS.label),
      type: oneLine(head.type, CANVAS_LIMITS.label),
      severity: oneLine(head.severity, CANVAS_LIMITS.label),
      ...field('location', head.location),
      ...field('summary', head.summary),
      file: head.file,
      ...field('agent', head.agent),
      ...field('missionId', head.missionId),
      ...field('createdAt', log.filedAt.get(head.file) ?? head.date),
    }),
  )
  canvasFindings.sort(
    (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.file.localeCompare(b.file),
  )

  return {
    active: true,
    sessionId,
    base: state.base,
    running: missions.filter((mission) => mission.state === 'running').length,
    missions,
    agents: state.roster.agents.map((entry) => canvasAgent(ctx, entry)),
    messages,
    findings: canvasFindings,
    activity: log.lines
      .slice(-CANVAS_LIMITS.activity)
      .map((line) => oneLine(line, CANVAS_LIMITS.activityLine)),
  }
}
