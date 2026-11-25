/**
 * Layout of the tower canvas: one tower snapshot → nodes, groups and edges.
 *
 * This module is a pure function of the snapshot. It never reads the clock,
 * the DOM or the platform, and it sorts everything it was handed, so the same
 * snapshot always yields the same coordinates. That is what lets node tests
 * pin the geometry (no two cards overlap, no wire crosses a card) and what
 * keeps the canvas still while it is polled.
 *
 * The picture it draws:
 *
 *   [agents] ─拥有/评审─ ╭┄ mission ┄┄┄╮ ──派发── ┌───────┐ ──派发── ╭┄ mission ┄┄┄╮ ─拥有/评审─ [agents]
 *                        ┆ tasks │ scope┆          │ Tower │          ┆ tasks │ scope┆
 *                        ╰┄┄┄┄┄┄┄┄┄┄┄┄╯          └───────┘          ╰┄┄┄┄┄┄┄┄┄┄┄┄╯
 *
 * - The tower sits at the origin. Missions form two columns, one each side.
 *   Missions joined by a dependency share a column and stack in dependency
 *   order, so `依赖` wires only run inside one column.
 * - A mission is a dashed group holding its task-list card and scope card.
 *   Its workers and reviewers are agent cards in the outer column of its row.
 * - Structural wires (派发 / 拥有 / 评审 / 依赖) stay inside the diagram.
 * - `消息` wires are dashed and keep to reserved corridors: the gutter between
 *   a column and the tower, the strip just outside a row, the lane between the
 *   agent column and its groups, and the channel above or below everything.
 *   No wire passes through a card.
 *
 * Text is measured with the estimator in `./measure.js` and cards render the
 * lines computed here, so the geometry and the screen agree.
 */
import { fitLine, wrapLines } from './measure.js'
import { MERGE_LABEL, compareNatural, isOpen, reviewLabel, stateOf } from './labels.js'
import { sanitizeText } from './sanitize.js'

/** Mission filters of the toolbar. */
export const CANVAS_FILTERS = Object.freeze(['all', 'open', 'blocked'])
/** Card densities of the toolbar. */
export const CANVAS_DENSITIES = Object.freeze(['summary', 'detail'])

/** Prefix of an agent node id; the rest is the roster name. */
const AGENT_PREFIX = 'agent:'

/** Fixed distances of the diagram, in CSS px at zoom 1. */
const GEO = Object.freeze({
  /** Group inner edge → tower edge: the gutter the dispatch and message wires use. */
  towerGap: 104,
  /** Agent inner edge → group outer edge: the corridor the 拥有 / 评审 wires bend in. */
  agentGap: 80,
  /** Vertical gap between two rows of a column. */
  rowGap: 96,
  /** Vertical gap between two agent cards of one stack. */
  stackGap: 30,
  /** First message lane, measured from a group's inner edge. */
  laneStart: 12,
  /** Distance between message lanes. */
  laneStep: 6,
  /** Message lanes per gutter. */
  laneCount: 5,
  /** The dependency bypass lane, measured from a group's inner edge. */
  depLane: 48,
  /** How far a dispatch wire leaves the tower before it turns. */
  trunk: 18,
  /** Distance from a row's edge to the message strip outside it. */
  strip: 34,
  /** Distance from a group's edge to the horizontal legs of a bypass wire. */
  bend: 18,
  /** Distance from the diagram to the cross-side message channel. */
  channelPad: 72,
  /** Distance between channel lanes. */
  channelStep: 10,
  /** Margin around the diagram inside the fitted view. */
  pad: 48,
})

/** Card sizes per density, in CSS px at zoom 1. */
const SIZE = Object.freeze({
  summary: Object.freeze({
    towerWidth: 288, towerHeight: 150, groupWidth: 312, agentWidth: 216, agentHeight: 58,
  }),
  detail: Object.freeze({
    towerWidth: 312,
    towerHeight: 150,
    groupWidth: 512,
    groupPadX: 16,
    groupPadY: 14,
    agentWidth: 240,
    agentHeight: 86,
    agentHeightDead: 109,
    tasksWidth: 288,
    scopeWidth: 180,
    cardGap: 12,
    cardPad: 10,
  }),
})

/** Task rows a task card shows before it counts the rest. */
const TASK_LIMIT = 7
/** Glob rows a scope card shows before it counts the rest. */
const SCOPE_LIMIT = 7

const SIDES = Object.freeze(['left', 'right'])
/** Horizontal direction of a side, away from the tower. */
const SIGN = Object.freeze({ left: -1, right: 1 })
/** The card states the Host may report. */
const STATE_NAMES = new Set(['running', 'waiting', 'stale', 'blocked', 'paused', 'done'])

// ---------------------------------------------------------------- reading ---

function pick(raw) {
  return raw !== null && typeof raw === 'object' ? raw : {}
}

/**
 * A string field of the snapshot, made safe to show (see `./sanitize.js`).
 *
 * Every string the canvas draws passes through here once, so no view has to
 * remember to clean what it renders.
 */
function str(value) {
  return typeof value === 'string' ? sanitizeText(value) : ''
}

/** An optional string field of the snapshot: cleaned, or undefined when absent or empty. */
function opt(value) {
  return typeof value === 'string' && value !== '' ? sanitizeText(value) : undefined
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** A list of strings of the snapshot, each made safe to show. */
function strings(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string').map(sanitizeText) : []
}

/** One mission, reduced to the fields the canvas reads. */
function readMission(raw) {
  const mission = pick(raw)
  const tasks = (Array.isArray(mission.tasks) ? mission.tasks : []).map(task => {
    const item = pick(task)
    return { text: str(item.text), done: item.done === true, dropped: item.dropped === true }
  })
  const status = str(mission.status)
  const live = mission.live === true
  const review = pick(mission.review)
  const hasReview = str(review.status) !== '' || str(review.reviewer) !== ''
  return {
    id: str(mission.id),
    title: str(mission.title),
    kind: mission.kind === 'survey' || mission.kind === 'artifact' ? mission.kind : 'build',
    status,
    // A Host that predates the detail contract sends no state; derive it.
    state: STATE_NAMES.has(mission.state) ? mission.state : stateOf(status, live),
    owner: str(mission.owner),
    agentId: str(mission.agentId),
    model: str(mission.model),
    effort: str(mission.effort),
    branch: str(mission.branch),
    worktreePath: str(mission.worktreePath),
    tasksDone: typeof mission.tasksDone === 'number'
      ? num(mission.tasksDone)
      : tasks.filter(task => task.done).length,
    tasksTotal: typeof mission.tasksTotal === 'number' ? num(mission.tasksTotal) : tasks.length,
    startedAt: opt(mission.startedAt),
    elapsedMs: num(mission.elapsedMs),
    live,
    // A dependency is a set: nothing in it repeats, and it has no order of its
    // own. The other lists keep the order the Host wrote them in.
    deps: [...new Set(strings(mission.deps))].sort(compareNatural),
    scope: strings(mission.scope),
    tasks,
    blockers: strings(mission.blockers),
    notes: strings(mission.notes),
    context: opt(mission.context),
    keyArtifacts: strings(mission.keyArtifacts),
    review: hasReview ? {
      round: num(review.round),
      reviewer: str(review.reviewer),
      status: str(review.status),
      merge: str(review.merge),
      at: str(review.at),
    } : undefined,
  }
}

/** One agent, reduced to the fields the canvas reads. */
function readAgent(raw) {
  const agent = pick(raw)
  return {
    name: str(agent.name),
    kind: agent.kind === 'reviewer' ? 'reviewer' : 'worker',
    agentId: str(agent.agentId),
    missionId: str(agent.missionId),
    reviewMissionId: str(agent.reviewMissionId),
    reviewTarget: str(agent.reviewTarget),
    spawnedAt: str(agent.spawnedAt),
    live: agent.live === true,
    diedAt: str(agent.diedAt),
    deathStatus: str(agent.deathStatus),
    deathReason: str(agent.deathReason),
    model: str(agent.model),
    effort: str(agent.effort),
  }
}

/** One message, reduced to the fields the canvas reads. */
function readMessage(raw) {
  const message = pick(raw)
  const unreadBy = strings(message.unreadBy)
  return {
    id: str(message.id),
    from: str(message.from),
    to: str(message.to),
    subject: str(message.subject),
    sentAt: str(message.sentAt),
    action: str(message.action),
    scope: str(message.scope),
    read: message.read === true,
    unreadBy,
    // `unreadBy` is optional. When the Host sends it, it is authoritative.
    unread: Array.isArray(message.unreadBy) ? unreadBy.length > 0 : message.read !== true,
  }
}

/** One finding, reduced to the fields the canvas reads. */
function readFinding(raw) {
  const finding = pick(raw)
  return {
    title: str(finding.title),
    type: str(finding.type),
    severity: str(finding.severity),
    location: str(finding.location),
    summary: str(finding.summary),
    file: str(finding.file),
    agent: str(finding.agent),
    missionId: str(finding.missionId),
    createdAt: str(finding.createdAt),
  }
}

/**
 * Read a `/tower/state?detail=1` snapshot defensively.
 *
 * Every list is optional: a Host that predates the detail contract answers
 * with missions only, and that still draws. Every list but the activity log is
 * sorted here, so the layout does not depend on the order the Host used. The
 * log is kept as sent: its order is its meaning.
 *
 * @param snapshot - the parsed JSON body.
 * @returns the fields the canvas uses, every one present.
 */
function readSnapshot(snapshot) {
  const source = pick(snapshot)
  const list = value => (Array.isArray(value) ? value : [])
  return {
    active: source.active === true,
    sessionId: str(source.sessionId),
    base: str(source.base),
    running: num(source.running),
    missions: list(source.missions).map(readMission)
      .filter(mission => mission.id !== '')
      .sort((a, b) => compareNatural(a.id, b.id)),
    agents: list(source.agents).map(readAgent)
      .filter(agent => agent.name !== '')
      .sort((a, b) => compareNatural(a.name, b.name)),
    messages: list(source.messages).map(readMessage)
      .sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0) || compareNatural(a.id, b.id)),
    findings: list(source.findings).map(readFinding)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) || compareNatural(a.title, b.title)),
    activity: strings(source.activity),
  }
}

/**
 * Whether a mission passes a toolbar filter.
 *
 * @param mission - a mission of the snapshot.
 * @param filter - `all`, `open` or `blocked`.
 * @returns whether it is drawn.
 */
function missionMatches(mission, filter) {
  if (filter === 'open') return isOpen(mission)
  if (filter === 'blocked') return mission.status === 'blocked' || mission.state === 'blocked'
  return true
}

// ----------------------------------------------------------------- sizing ---

/** Room left for the status and kind tags at the top right of a mission card. */
const BADGES = 100
/** Height of the "另有 N 项" line under a list that was cut. */
const MORE_LINE = 28

/**
 * The flags of a mission, as one run of text.
 *
 * Only what the card can act on is named; the detail panel has the rest.
 *
 * @param mission - the mission.
 * @param deps - the dependencies that are drawn.
 * @returns the flags, joined by a middle dot.
 */
function flagsText(mission, deps) {
  const parts = []
  if (mission.blockers.length > 0) parts.push(`阻塞 ${mission.blockers.length}`)
  if (mission.review !== undefined) {
    const verdict = [reviewLabel(mission.review.status)]
    const merge = MERGE_LABEL[mission.review.merge]
    if (merge !== undefined) verdict.push(merge)
    parts.push(`评审 第${Math.max(1, mission.review.round)}轮 ${verdict.join(' · ')}`)
  }
  if (deps.length > 0) parts.push(`依赖 ${deps.join(' ')}`)
  if (mission.notes.length > 0) parts.push(`备注 ${mission.notes.length}`)
  if (mission.keyArtifacts.length > 0) parts.push(`关键产物 ${mission.keyArtifacts.length}`)
  if (mission.context !== undefined) parts.push('含用户原话')
  return parts.join(' · ')
}

/**
 * The row under a summary card's title: progress, who holds it, what weighs on it.
 *
 * @param mission - the mission.
 * @param deps - the dependencies that are drawn.
 * @returns one line of text.
 */
function summaryMeta(mission, deps) {
  const parts = [`${mission.tasksDone}/${mission.tasksTotal} 任务`]
  if (mission.owner !== '') {
    parts.push(mission.model !== '' ? `${mission.owner} · ${mission.model}` : mission.owner)
  }
  if (mission.blockers.length > 0) parts.push(`阻塞 ${mission.blockers.length}`)
  if (deps.length > 0) parts.push(`依赖 ${deps.join(' ')}`)
  return parts.join(' · ')
}

/**
 * The row under a detail card's title: who holds the mission, and with what.
 *
 * @param mission - the mission.
 * @returns one line of text.
 */
function detailMeta(mission) {
  if (mission.owner === '') return '尚未派发给任何 agent'
  const who = [mission.owner, mission.model, mission.effort].filter(part => part !== '').join(' · ')
  return mission.live ? who : `${who} · 已离线`
}

/**
 * Size the task-list card of a mission.
 *
 * @param mission - the mission.
 * @returns the card's size, its rows with pre-broken text, and what was cut.
 */
function measureTasks(mission) {
  const base = SIZE.detail
  const pad = base.cardPad
  const textWidth = base.tasksWidth - pad * 2 - 22
  const tasks = mission.tasks
  const items = tasks.slice(0, TASK_LIMIT).map(task => ({
    ...wrapLines(task.text, textWidth, 12, 2),
    done: task.done,
    dropped: task.dropped,
  }))
  let h = pad + 18 + 8
  if (items.length === 0) h += 18
  else h += items.reduce((sum, item) => sum + 18 * Math.max(1, item.lines.length) + 4, 0) - 4
  if (tasks.length > TASK_LIMIT) h += MORE_LINE
  h += pad
  return { w: base.tasksWidth, h, items, more: Math.max(0, tasks.length - TASK_LIMIT), empty: tasks.length === 0 }
}

/**
 * Size the scope card of a mission.
 *
 * @param mission - the mission.
 * @returns the card's size, its rows, and what was cut.
 */
function measureScope(mission) {
  const base = SIZE.detail
  const pad = base.cardPad
  const textWidth = base.scopeWidth - pad * 2
  const globs = mission.scope
  const items = globs.slice(0, SCOPE_LIMIT).map(glob => fitLine(glob, textWidth, 11, true))
  let h = pad + 18 + 8
  h += items.length === 0 ? 18 : items.length * 20
  if (globs.length > SCOPE_LIMIT) h += MORE_LINE
  h += pad
  return { w: base.scopeWidth, h, items, more: Math.max(0, globs.length - SCOPE_LIMIT), empty: globs.length === 0 }
}

/**
 * Size a mission's group and the text it shows.
 *
 * A summary card is the frame itself: a title of up to two lines and one
 * meta line. A detail card is a frame with a header of title, meta and flags,
 * and a body holding the task-list and scope cards.
 *
 * @param mission - the mission.
 * @param density - `summary` or `detail`.
 * @param deps - the dependencies that are drawn.
 * @returns the group's width and height, and its pre-broken text.
 */
function measureGroup(mission, density, deps) {
  const base = SIZE[density]
  if (density === 'summary') {
    const title = wrapLines(mission.title, base.groupWidth - 28 - 38 - BADGES - 8, 12.5, 2, false, 1.04)
    const h = 24 + 20 * Math.max(1, title.lines.length) + 4 + 16
    return { w: base.groupWidth, h, headerHeight: h, bodyHeight: 0, title, meta: summaryMeta(mission, deps), flags: null, tasks: null, scope: null }
  }
  const inner = base.groupWidth - base.groupPadX * 2
  const title = wrapLines(mission.title, inner - 38 - BADGES - 12, 13, 2, false, 1.04)
  const flags = wrapLines(flagsText(mission, deps), inner, 11, 2)
  const tasks = measureTasks(mission)
  const scope = measureScope(mission)
  const titleHeight = 20 * Math.max(1, title.lines.length)
  const headerHeight = titleHeight + 4 + 16 + (flags.lines.length > 0 ? 4 + 16 * flags.lines.length : 0)
  const bodyHeight = Math.max(tasks.h, scope.h)
  return {
    w: base.groupWidth,
    h: base.groupPadY * 2 + headerHeight + 12 + bodyHeight,
    headerHeight,
    bodyHeight,
    title,
    meta: detailMeta(mission),
    flags,
    tasks,
    scope,
  }
}

/** The height of an agent card. An agent that is gone gets a line to say why. */
function agentHeight(agent, density) {
  if (density === 'summary') return SIZE.summary.agentHeight
  return agent.live ? SIZE.detail.agentHeight : SIZE.detail.agentHeightDead
}

// --------------------------------------------------------------- ordering ---

/**
 * The mission an agent card sits beside.
 *
 * A reviewer is bound by `reviewMissionId`, or else by the branch it reviews;
 * a worker by `missionId`. An agent that resolves to nothing is unattached.
 *
 * @param agent - the agent.
 * @param missions - the drawn missions, in id order.
 * @returns the mission id, or null.
 */
function resolveMission(agent, missions) {
  const first = agent.kind === 'reviewer' ? agent.reviewMissionId : agent.missionId
  const second = agent.kind === 'reviewer' ? agent.missionId : agent.reviewMissionId
  for (const id of [first, second]) {
    if (id !== '' && missions.some(mission => mission.id === id)) return id
  }
  if (agent.reviewTarget !== '') {
    const match = missions.find(mission => mission.branch === agent.reviewTarget)
    if (match !== undefined) return match.id
  }
  return null
}

/**
 * What an agent is to the mission it sits beside.
 *
 * @param agent - the agent.
 * @param mission - the mission, or null when the agent is unattached.
 * @returns `owner`, `former`, `reviewer` or `worker`.
 */
function roleOf(agent, mission) {
  if (agent.kind === 'reviewer') return 'reviewer'
  if (mission === null) return 'worker'
  return agent.name === mission.owner ? 'owner' : 'former'
}

function roleRank(role) {
  return role === 'owner' ? 0 : role === 'former' ? 1 : 2
}

/**
 * Order missions so every mission follows the missions it depends on.
 *
 * Kahn's algorithm, smallest id first, so the order does not depend on the
 * order the Host listed the missions.
 *
 * @param ids - the missions of one dependency component.
 * @param depsOf - resolves a mission's drawn dependencies.
 * @returns the ids in dependency order.
 */
function topological(ids, depsOf) {
  const inside = new Set(ids)
  const dependents = new Map(ids.map(id => [id, []]))
  const pending = new Map()
  for (const id of ids) {
    const deps = depsOf(id).filter(dep => inside.has(dep))
    pending.set(id, deps.length)
    for (const dep of deps) dependents.get(dep).push(id)
  }
  const ready = ids.filter(id => pending.get(id) === 0).sort(compareNatural)
  const order = []
  while (ready.length > 0) {
    const id = ready.shift()
    order.push(id)
    for (const next of dependents.get(id)) {
      const left = pending.get(next) - 1
      pending.set(next, left)
      if (left === 0) ready.push(next)
    }
    ready.sort(compareNatural)
  }
  // A dependency cycle leaves missions unvisited; append them in id order.
  for (const id of [...ids].sort(compareNatural)) if (!order.includes(id)) order.push(id)
  return order
}

// --------------------------------------------------------------- geometry ---

/**
 * Drop repeated points and points that sit on a straight line.
 *
 * @param points - the waypoints.
 * @returns the same polyline with nothing redundant.
 */
function compact(points) {
  const out = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (last !== undefined && last[0] === point[0] && last[1] === point[1]) continue
    const before = out[out.length - 2]
    if (last !== undefined && before !== undefined
      && ((before[0] === last[0] && last[0] === point[0]) || (before[1] === last[1] && last[1] === point[1]))) {
      out[out.length - 1] = point
      continue
    }
    out.push(point)
  }
  return out
}

/**
 * Where a wire's label chip sits: the middle of its longest horizontal leg.
 *
 * A chip on a vertical run would cover the parallel wires that share a gutter
 * lane or an agent corridor.
 *
 * @param points - the wire's waypoints.
 * @returns the anchor.
 */
function labelAnchor(points) {
  let best = [points[0][0], points[0][1]]
  let bestLength = -1
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1]
    const [x1, y1] = points[index]
    const horizontal = Math.abs(y1 - y0) < 0.5
    const length = (horizontal ? 1e6 : 0) + Math.abs(x1 - x0) + Math.abs(y1 - y0)
    if (length > bestLength) {
      best = [(x0 + x1) / 2, (y0 + y1) / 2]
      bestLength = length
    }
  }
  return best
}

/**
 * Give each wire of one corridor its own lane, as far as possible.
 *
 * Wires are visited top to bottom (left to right for a channel) and take the
 * first lane no earlier wire overlaps in. A corridor with more overlapping
 * wires than lanes shares its last lane rather than running out of room.
 *
 * @param uses - `{ key, min, max }` per wire; the lane is written back as `lane`.
 * @param laneCount - lanes available.
 */
function assignLanes(uses, laneCount) {
  uses.sort((a, b) => (a.min - b.min) || (a.max - b.max) || compareNatural(a.key, b.key))
  const lanes = Array.from({ length: laneCount }, () => [])
  for (const use of uses) {
    let lane = 0
    while (lane < laneCount - 1 && lanes[lane].some(other => use.min - 10 <= other.max && other.min - 10 <= use.max)) {
      lane += 1
    }
    lanes[lane].push(use)
    use.lane = lane
  }
}

/**
 * Push a port position off the positions it would sit on top of.
 *
 * @param y - the wanted position.
 * @param avoid - positions to keep clear of.
 * @param low - the lowest allowed position.
 * @param high - the highest allowed position.
 * @returns a position at least 8px from every avoided one, when the band allows.
 */
function separate(y, avoid, low, high) {
  let value = y
  for (let guard = 0; guard < 24; guard += 1) {
    const hit = avoid.find(other => Math.abs(other - value) < 8)
    if (hit === undefined) break
    value = hit + (value >= hit ? 8 : -8)
  }
  return Math.min(high, Math.max(low, value))
}

/** Copy the fields of an agent, and where it was placed, that its node exposes. */
function agentNode(agent, place) {
  return {
    id: `${AGENT_PREFIX}${agent.name}`,
    type: 'agent',
    x: place.x,
    y: place.y,
    w: place.w,
    h: place.h,
    name: agent.name,
    kind: agent.kind,
    role: place.role,
    // The mission the card sits beside, however the agent was bound to it.
    missionId: place.missionId,
    side: place.side,
    row: place.row.index,
    index: place.index,
    reviewMissionId: agent.reviewMissionId,
    reviewTarget: agent.reviewTarget,
    agentId: agent.agentId,
    model: agent.model,
    effort: agent.effort,
    spawnedAt: agent.spawnedAt,
    live: agent.live,
    diedAt: agent.diedAt,
    deathStatus: agent.deathStatus,
    deathReason: agent.deathReason,
  }
}

// ----------------------------------------------------------------- layout ---

/**
 * Lay out the canvas for one tower snapshot.
 *
 * @param snapshot - the JSON body of `/tower/state?sessionId=…&detail=1`.
 * @param options - `{ density, filter }`; anything else falls back to the
 *   defaults (`summary`, `all`).
 * @returns the tower, the nodes, the mission groups, the wires, the rows and
 *   the bounding box, in CSS px at zoom 1 with the tower centred on the origin.
 */
export function layoutCanvas(snapshot, options = {}) {
  const density = CANVAS_DENSITIES.includes(options.density) ? options.density : 'summary'
  const filter = CANVAS_FILTERS.includes(options.filter) ? options.filter : 'all'
  const base = SIZE[density]
  const data = readSnapshot(snapshot)

  // The missions that are drawn, and which of their dependencies are drawn too.
  const shown = new Map()
  for (const mission of data.missions) if (missionMatches(mission, filter)) shown.set(mission.id, mission)
  const missions = [...shown.values()].sort((a, b) => compareNatural(a.id, b.id))
  const depsOf = mission => [...new Set(mission.deps)]
    .filter(id => id !== mission.id && shown.has(id))
    .sort(compareNatural)

  // Agents, deduplicated by name and attached to the mission they sit beside.
  // `place` holds what the layout works out about an agent; the snapshot's own
  // objects are never written to, so `data` stays a plain copy of the input.
  const agents = new Map()
  const place = new Map()
  const attached = new Map()
  const loose = []
  for (const agent of data.agents) {
    if (agents.has(agent.name)) continue
    const target = resolveMission(agent, data.missions)
    // An agent whose mission is merely filtered out is hidden with it. Only
    // an agent that names no mission of the snapshot gets a row of its own.
    if (target !== null && !shown.has(target)) continue
    agents.set(agent.name, agent)
    place.set(agent.name, { role: roleOf(agent, target === null ? null : shown.get(target)), missionId: target ?? '' })
    if (target === null) {
      loose.push(agent)
      continue
    }
    const list = attached.get(target)
    if (list === undefined) attached.set(target, [agent])
    else list.push(agent)
  }
  // Owner first, then whoever held the mission before, then reviewers; the
  // live before the dead; then by name.
  const byStackOrder = (a, b) => (roleRank(place.get(a.name).role) - roleRank(place.get(b.name).role))
    || (Number(!a.live) - Number(!b.live))
    || compareNatural(a.name, b.name)
  for (const list of attached.values()) list.sort(byStackOrder)
  loose.sort(byStackOrder)

  // A row is one mission's group and the stack of agent cards beside it. Rows
  // know their height now and their position once the columns are packed.
  const makeRow = (mission, stack) => {
    const group = mission === null ? null : measureGroup(mission, density, depsOf(mission))
    const entries = stack.map(agent => ({ agent, place: place.get(agent.name), h: agentHeight(agent, density) }))
    const stackHeight = entries.reduce((sum, entry) => sum + entry.h, 0)
      + Math.max(0, entries.length - 1) * GEO.stackGap
    const row = {
      mission,
      group,
      stack: entries,
      stackHeight,
      h: Math.max(group === null ? 0 : group.h, stackHeight),
    }
    entries.forEach((entry, index) => {
      entry.place.row = row
      entry.place.index = index
    })
    return row
  }
  const rowOf = new Map(missions.map(mission => [mission.id, makeRow(mission, attached.get(mission.id) ?? [])]))

  // Missions joined by a dependency (in either direction) share a column, so
  // a dependency wire never has to cross the tower.
  const parent = new Map(missions.map(mission => [mission.id, mission.id]))
  const find = id => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root)
    parent.set(id, root)
    return root
  }
  for (const mission of missions) {
    for (const dep of depsOf(mission)) {
      const a = find(dep)
      const b = find(mission.id)
      if (a !== b) parent.set(a, b)
    }
  }
  const buckets = new Map()
  for (const mission of missions) {
    const root = find(mission.id)
    const bucket = buckets.get(root)
    if (bucket === undefined) buckets.set(root, [mission.id])
    else bucket.push(mission.id)
  }
  const components = [...buckets.values()].map(ids => {
    const ordered = topological(ids, id => depsOf(shown.get(id)))
    const height = ordered.reduce((sum, id, index) => sum + rowOf.get(id).h + (index > 0 ? GEO.rowGap : 0), 0)
    return { ids: ordered, height }
  })
  // The tallest component picks its column first; each goes to the shorter one.
  components.sort((a, b) => (b.height - a.height) || compareNatural(a.ids[0], b.ids[0]))
  const sides = { left: { rows: [], height: 0 }, right: { rows: [], height: 0 } }
  for (const component of components) {
    const side = sides.left.height <= sides.right.height ? sides.left : sides.right
    side.rows.push(...component.ids.map(id => rowOf.get(id)))
    side.height += component.height + GEO.rowGap
  }
  // An unattached agent is neither closed nor blocked, so it is hidden only
  // by the filter that asks for blocked missions.
  const looseRow = loose.length > 0 && filter !== 'blocked' ? makeRow(null, loose) : null
  if (looseRow !== null) sides.right.rows.push(looseRow)
  for (const side of SIDES) {
    sides[side].rows.forEach((row, index) => {
      row.side = side
      row.index = index
    })
  }

  // Messages, aggregated per unordered pair of endpoints: one wire per pair,
  // labelled with how many messages went over it. A broadcast (`to: 'all'`)
  // has no pair, and neither has a name that is not on the canvas; the panel
  // lists both.
  const endpoint = value => (value === 'tower' ? 'tower' : agents.has(value) ? `${AGENT_PREFIX}${value}` : null)
  const pairs = new Map()
  for (const message of data.messages) {
    const from = endpoint(message.from)
    const to = endpoint(message.to)
    if (from === null || to === null || from === to) continue
    const [a, b] = from < to ? [from, to] : [to, from]
    const key = `${a}|${b}`
    let pair = pairs.get(key)
    if (pair === undefined) {
      pair = { key, a, b, count: 0, sent: { [a]: 0, [b]: 0 }, latest: message, unread: false }
      pairs.set(key, pair)
    }
    pair.count += 1
    pair.sent[from] += 1
    pair.latest = message
    pair.unread = pair.unread || message.unread
  }
  const pairList = [...pairs.values()]

  // The tower is as tall as its ports need: along each edge, one dispatch port
  // per row in the upper band and one message port per wire in the lower band.
  const ports = { left: { dispatch: [], message: [] }, right: { dispatch: [], message: [] } }
  for (const side of SIDES) {
    ports[side].dispatch = sides[side].rows.filter(row => row.group !== null)
    ports[side].message = pairList
      .filter(pair => (pair.a === 'tower' || pair.b === 'tower')
        && place.get((pair.a === 'tower' ? pair.b : pair.a).slice(AGENT_PREFIX.length)).row.side === side)
      .map(pair => (pair.a === 'tower' ? pair.b : pair.a).slice(AGENT_PREFIX.length))
      .sort((x, y) => {
        const a = place.get(x)
        const b = place.get(y)
        return (a.row.index - b.row.index) || (a.index - b.index) || compareNatural(x, y)
      })
  }
  let usable = 104
  for (const side of SIDES) {
    const dispatch = ports[side].dispatch.length
    const message = ports[side].message.length
    usable = Math.max(
      usable,
      dispatch > 0 ? Math.ceil(dispatch * 20 / 0.54) : 0,
      message > 0 ? Math.ceil(message * 18 / 0.42) + 16 : 0,
    )
  }
  const towerWidth = base.towerWidth
  const towerHeight = Math.max(base.towerHeight, usable + 68)

  // Positions: each column is centred on the tower.
  for (const side of SIDES) {
    const sign = SIGN[side]
    const rows = sides[side].rows
    const total = rows.reduce((sum, row, index) => sum + row.h + (index > 0 ? GEO.rowGap : 0), 0)
    const innerX = sign * (towerWidth / 2 + GEO.towerGap)
    let y = -total / 2
    for (const row of rows) {
      row.top = y
      row.bottom = y + row.h
      row.innerX = innerX
      // The group hangs off the gutter, its inner edge on the gutter line; an
      // unattached row lines its agents up with where that group would be.
      row.outerX = innerX + sign * (row.group === null ? base.groupWidth : row.group.w)
      if (row.group !== null) {
        row.group.x = sign < 0 ? innerX - row.group.w : innerX
        row.group.y = y + (row.h - row.group.h) / 2
      }
      // The agent stack sits in the next column out, its inner edge one gap
      // away from the group's outer edge.
      const agentInnerX = row.outerX + sign * GEO.agentGap
      let stackY = y + (row.h - row.stackHeight) / 2
      for (const entry of row.stack) {
        const spot = entry.place
        spot.x = sign < 0 ? agentInnerX - base.agentWidth : agentInnerX
        spot.y = stackY
        spot.w = base.agentWidth
        spot.h = entry.h
        spot.innerX = agentInnerX
        spot.side = side
        // Even cards are reached from above and odd ones from below.
        spot.above = spot.index % 2 === 0
        stackY += entry.h + GEO.stackGap
      }
      y += row.h + GEO.rowGap
    }
  }

  const rows = [...sides.left.rows, ...sides.right.rows]
  const tower = {
    id: 'tower',
    type: 'tower',
    x: -towerWidth / 2,
    y: -towerHeight / 2,
    w: towerWidth,
    h: towerHeight,
    ports: { left: [], right: [] },
  }
  const towerPort = (side, y, kind, edgeId) => {
    const port = { x: SIGN[side] * towerWidth / 2, y, kind, edgeId }
    tower.ports[side].push(port)
    return port
  }

  // Port bands. Messages take the lower band of an edge and dispatch the upper
  // one, so the two families never leave the tower from the same point.
  const band = towerHeight - 68
  const bandTop = -band / 2
  const bandBottom = band / 2
  const plan = { left: { dispatch: [], message: [] }, right: { dispatch: [], message: [] } }
  for (const side of SIDES) {
    const dispatch = ports[side].dispatch
    const message = ports[side].message
    const shared = message.length > 0
    plan[side].dispatch = dispatch.map((row, index) =>
      bandTop + band * (shared ? 0.54 : 1) * (index + 0.5) / dispatch.length)
    const centres = dispatch.map(row => row.group.y + row.group.h / 2)
    plan[side].message = message.map((_, index) => separate(
      bandTop + band * 0.58 + band * 0.42 * (index + 0.5) / message.length,
      [...centres, ...plan[side].dispatch],
      bandTop + band * 0.58 + 4,
      bandBottom - 4,
    ))
  }

  const edges = []

  // 派发: the tower to every mission.
  for (const side of SIDES) {
    const sign = SIGN[side]
    ports[side].dispatch.forEach((row, index) => {
      const mission = row.mission
      const group = row.group
      const py = plan[side].dispatch[index]
      const id = `dispatch:${mission.id}`
      const port = towerPort(side, py, 'dispatch', id)
      const cy = group.y + group.h / 2
      const points = compact([
        [port.x, py],
        [port.x + sign * GEO.trunk, py],
        [port.x + sign * GEO.trunk, cy],
        [row.innerX, cy],
      ])
      edges.push({
        id,
        type: 'dispatch',
        from: 'tower',
        to: `mission:${mission.id}`,
        label: '派发',
        state: mission.state,
        points,
        // On the wire's own port, in the stretch between its trunk and the
        // dependency lane: the message lanes run further out.
        labelAt: [port.x + sign * 38, py],
      })
    })
  }

  // 拥有 / 曾负责 / 评审: each agent to the mission it sits beside.
  for (const row of rows) {
    if (row.group === null) continue
    const sign = SIGN[row.side]
    const group = row.group
    const mission = row.mission
    row.stack.forEach((entry, index) => {
      const agent = entry.agent
      const spot = entry.place
      const cy = spot.y + spot.h / 2
      const attachY = group.y + group.h * (index + 1) / (row.stack.length + 1)
      // The bend sits past the middle, so the label has the longer leg.
      const bendX = row.outerX + sign * GEO.agentGap * 0.62
      const points = compact([
        [spot.innerX, cy],
        [bendX, cy],
        [bendX, attachY],
        [row.outerX, attachY],
      ])
      const type = spot.role === 'reviewer' ? 'review' : spot.role === 'former' ? 'former' : 'own'
      edges.push({
        id: `${type}:${mission.id}:${agent.name}`,
        type,
        from: `${AGENT_PREFIX}${agent.name}`,
        to: `mission:${mission.id}`,
        label: type === 'review' ? '评审' : type === 'former' ? '曾负责' : '拥有',
        state: agent.live ? mission.state : 'stale',
        points,
        labelAt: labelAnchor(points),
      })
    })
  }

  // 依赖: the prerequisite to the dependent, between two rows of one column.
  const outgoing = new Map()
  const incoming = new Map()
  for (const mission of missions) {
    for (const dep of depsOf(mission)) {
      if (!outgoing.has(dep)) outgoing.set(dep, [])
      if (!incoming.has(mission.id)) incoming.set(mission.id, [])
      outgoing.get(dep).push(mission.id)
      incoming.get(mission.id).push(dep)
    }
  }
  const spread = (group, count, index) => group.x + group.w * (0.5 + 0.16 * (index - (count - 1) / 2))
  for (const mission of missions) {
    const target = rowOf.get(mission.id)
    const deps = incoming.get(mission.id) ?? []
    deps.forEach((dep, index) => {
      const source = rowOf.get(dep)
      const from = source.group
      const to = target.group
      const x0 = spread(from, outgoing.get(dep).length, outgoing.get(dep).indexOf(mission.id))
      const x1 = spread(to, deps.length, index)
      let points
      if (target.index === source.index + 1) {
        const midY = (source.bottom + target.top) / 2
        points = compact([
          [x0, from.y + from.h],
          [x0, midY],
          [x1, midY],
          [x1, to.y],
        ])
      } else {
        // Not neighbours: the wire borrows the dependency lane in the gutter
        // beside the column to get past the rows in between.
        const laneX = source.innerX - SIGN[source.side] * GEO.depLane
        points = compact([
          [x0, from.y + from.h],
          [x0, from.y + from.h + GEO.bend],
          [laneX, from.y + from.h + GEO.bend],
          [laneX, to.y - GEO.bend],
          [x1, to.y - GEO.bend],
          [x1, to.y],
        ])
      }
      const prerequisite = shown.get(dep)
      edges.push({
        id: `dep:${dep}:${mission.id}`,
        type: 'dep',
        from: `mission:${dep}`,
        to: `mission:${mission.id}`,
        label: '依赖',
        state: prerequisite.status === 'merged' ? 'done'
          : prerequisite.status === 'abandoned' ? 'blocked' : prerequisite.state,
        points,
        labelAt: labelAnchor(points),
      })
    })
  }

  // 消息: dashed wires that keep to the corridors left free above.
  const agentName = key => key.slice(AGENT_PREFIX.length)
  const touching = new Map()
  for (const pair of pairList) {
    for (const end of [pair.a, pair.b]) {
      if (end === 'tower') continue
      if (!touching.has(end)) touching.set(end, [])
      touching.get(end).push(pair)
    }
  }
  for (const list of touching.values()) list.sort((x, y) => compareNatural(x.key, y.key))

  // How a wire reaches one agent card: into the card's inner edge, from a lane
  // in the corridor between the agent column and the groups, which the wire
  // enters from the strip just outside the row. Even cards in a stack are
  // reached from above and odd ones from below, so the lanes stay short.
  const agentEnd = (key, pair) => {
    const spot = place.get(agentName(key))
    const sign = SIGN[spot.side]
    const order = touching.get(key).indexOf(pair)
    const offset = Math.min(14 + 7 * order, spot.h / 2 - 8)
    // The corridor lies between the agent column and the groups, which is
    // back towards the tower: opposite to the agent's own side direction.
    const corridorX = spot.innerX - sign * Math.min(16 + 8 * order, GEO.agentGap - 24)
    const portY = spot.y + spot.h / 2 + (spot.above ? -offset : offset)
    const stripY = spot.above ? spot.row.top - GEO.strip : spot.row.bottom + GEO.strip
    return {
      side: spot.side,
      port: [spot.innerX, portY],
      // From the card out to the junction where the wire turns into its lane.
      approach: [[corridorX, portY], [corridorX, stripY]],
      at: [corridorX, stripY],
    }
  }

  // Tower message ports, in row order, so the wires fan out without crossing.
  const towerEnd = new Map() // pair key → the end plan on the tower
  for (const side of SIDES) {
    ports[side].message.forEach((name, index) => {
      const key = `${AGENT_PREFIX}${name}`
      const pair = pairList.find(candidate => (candidate.a === 'tower' && candidate.b === key)
        || (candidate.b === 'tower' && candidate.a === key))
      if (pair === undefined) return
      const py = plan[side].message[index]
      const port = towerPort(side, py, 'message', `message:${pair.key}`)
      towerEnd.set(pair.key, { side, port: [port.x, py], approach: [], at: [port.x, py] })
    })
  }

  // Both ends of every wire, in the pair's own `a` then `b` order.
  const ends = new Map()
  for (const pair of pairList) {
    ends.set(pair.key, {
      a: pair.a === 'tower' ? towerEnd.get(pair.key) : agentEnd(pair.a, pair),
      b: pair.b === 'tower' ? towerEnd.get(pair.key) : agentEnd(pair.b, pair),
    })
  }
  const crossSide = pairList.filter(pair => {
    const plans = ends.get(pair.key)
    return plans.a.side !== plans.b.side
  })

  // Cross-side wires cross the middle above or below the tower, nearer to
  // their ends; each takes a lane in that channel.
  const topY = Math.min(tower.y, ...rows.map(row => row.top)) - GEO.channelPad
  const bottomY = Math.max(tower.y + tower.h, ...rows.map(row => row.bottom)) + GEO.channelPad
  const channelUses = new Map() // pair key → the channel the wire crosses by
  for (const pair of crossSide) {
    const plans = ends.get(pair.key)
    const channel = (plans.a.at[1] + plans.b.at[1]) / 2 <= 0 ? 'top' : 'bottom'
    channelUses.set(pair.key, { key: pair.key, channel, min: 0, max: 0 })
  }
  for (const name of ['top', 'bottom']) {
    assignLanes([...channelUses.values()].filter(use => use.channel === name), 6)
  }
  const channelY = pair => {
    const use = channelUses.get(pair.key)
    return use.channel === 'top' ? topY - use.lane * GEO.channelStep : bottomY + use.lane * GEO.channelStep
  }

  // Every wire takes a lane in each gutter it runs through.
  const laneUses = { left: [], right: [] }
  for (const pair of pairList) {
    const plans = ends.get(pair.key)
    if (plans.a.side === plans.b.side) {
      laneUses[plans.a.side].push({
        key: pair.key,
        min: Math.min(plans.a.at[1], plans.b.at[1]),
        max: Math.max(plans.a.at[1], plans.b.at[1]),
      })
      continue
    }
    const channel = channelY(pair)
    for (const side of [plans.a.side, plans.b.side]) {
      const y = plans[side === plans.a.side ? 'a' : 'b'].at[1]
      laneUses[side].push({ key: pair.key, min: Math.min(y, channel), max: Math.max(y, channel) })
    }
  }
  for (const side of SIDES) assignLanes(laneUses[side], GEO.laneCount)
  const gutterX = side => SIGN[side] * (towerWidth / 2 + GEO.towerGap)
  const laneX = (side, pair) => {
    const lane = laneUses[side].find(use => use.key === pair.key).lane
    return gutterX(side) - SIGN[side] * (GEO.laneStart + GEO.laneStep * lane)
  }

  // The wires. Each leaves one card through its corridor, runs along its
  // gutter lane, and enters the other card through that card's corridor.
  for (const pair of pairList) {
    const plans = ends.get(pair.key)
    const legs = []
    if (plans.a.side === plans.b.side) {
      const lx = laneX(plans.a.side, pair)
      legs.push([lx, plans.a.at[1]], [lx, plans.b.at[1]])
    } else {
      const cy = channelY(pair)
      legs.push(
        [laneX(plans.a.side, pair), plans.a.at[1]],
        [laneX(plans.a.side, pair), cy],
        [laneX(plans.b.side, pair), cy],
        [laneX(plans.b.side, pair), plans.b.at[1]],
      )
    }
    const path = compact([
      plans.a.port,
      ...plans.a.approach,
      ...legs,
      ...plans.b.approach.slice().reverse(),
      plans.b.port,
    ])
    // The wire points towards whoever receives more than they send, so it runs
    // from the heavier sender and its first point sits on the `from` card.
    const forward = pair.sent[pair.a] >= pair.sent[pair.b]
    const points = forward ? path : path.slice().reverse()
    edges.push({
      id: `message:${pair.key}`,
      type: 'message',
      from: forward ? pair.a : pair.b,
      to: forward ? pair.b : pair.a,
      label: `消息 ×${pair.count}`,
      state: 'message',
      points,
      labelAt: labelAnchor(points),
      count: pair.count,
      bidirectional: pair.sent[pair.a] > 0 && pair.sent[pair.b] > 0,
      unread: pair.unread,
      latest: pair.latest,
    })
  }

  // Collect the nodes.
  const nodes = [tower]
  const groups = []
  for (const row of rows) {
    if (row.group !== null) {
      const group = row.group
      const mission = row.mission
      group.id = `mission:${mission.id}`
      group.type = 'mission'
      group.missionId = mission.id
      group.mission = mission
      group.side = row.side
      group.row = row.index
      group.cardIds = []
      group.agents = row.stack.map(entry => entry.agent.name)
      if (group.tasks !== null) {
        const tasks = {
          id: `tasks:${mission.id}`,
          type: 'tasks',
          missionId: mission.id,
          x: group.x + base.groupPadX,
          y: group.y + base.groupPadY + group.headerHeight + 12,
          ...group.tasks,
        }
        const scope = {
          id: `scope:${mission.id}`,
          type: 'scope',
          missionId: mission.id,
          x: tasks.x + tasks.w + base.cardGap,
          y: tasks.y,
          ...group.scope,
        }
        group.cardIds.push(tasks.id, scope.id)
        nodes.push(tasks, scope)
      }
      groups.push(group)
    }
    for (const entry of row.stack) nodes.push(agentNode(entry.agent, entry.place))
  }

  // The bounding box: everything drawn, chips included.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const take = (x, y) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const node of nodes) {
    take(node.x, node.y)
    take(node.x + node.w, node.y + node.h)
  }
  for (const edge of edges) {
    for (const [x, y] of edge.points) take(x, y)
    take(edge.labelAt[0] - 48, edge.labelAt[1] - 10)
    take(edge.labelAt[0] + 48, edge.labelAt[1] + 10)
  }
  const bounds = {
    x: minX - GEO.pad,
    y: minY - GEO.pad,
    w: maxX - minX + GEO.pad * 2,
    h: maxY - minY + GEO.pad * 2,
  }

  const live = data.agents.filter(agent => agent.live).length
  return {
    density,
    filter,
    active: data.active,
    data,
    tower,
    nodes,
    groups,
    rows: rows.map(row => ({
      side: row.side,
      index: row.index,
      top: row.top,
      bottom: row.bottom,
      groupId: row.group === null ? null : row.group.id,
      agentIds: row.stack.map(entry => `${AGENT_PREFIX}${entry.agent.name}`),
    })),
    edges,
    bounds,
    stats: {
      missions: data.missions.length,
      shown: missions.length,
      open: data.missions.filter(isOpen).length,
      running: data.missions.filter(mission => mission.state === 'running').length,
      blocked: data.missions.filter(mission => mission.state === 'blocked').length,
      agents: data.agents.length,
      live,
      messages: data.messages.length,
      unread: data.messages.filter(message => message.unread).length,
      findings: data.findings.length,
      activity: data.activity.length,
    },
  }
}
