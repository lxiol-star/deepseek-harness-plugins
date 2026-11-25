/**
 * Chinese labels and time formatting for the tower canvas.
 *
 * The canvas is read-only and its copy is hardcoded, matching the dock. The
 * label maps are kept apart from the layout so the overlay can reuse them for
 * the detail panel, and so a label is decided in exactly one place.
 */

/**
 * Read a label map without ever reaching its prototype.
 *
 * A snapshot is data an agent wrote. `status: "__proto__"` or `merge:
 * "constructor"` must not hand back `Object.prototype` or a function to
 * render; a key that is not the table's own reads as absent.
 *
 * @param table - one of the frozen label maps below.
 * @param key - the raw value from the snapshot.
 * @param fallback - what to show when the table has no such key.
 * @returns the label, or the fallback.
 */
export function lookup(table, key, fallback) {
  return Object.hasOwn(table, key) ? table[key] : fallback
}

/** A label map with no prototype, so nothing can be found on it by accident. */
const table = entries => Object.freeze(Object.assign(Object.create(null), entries))

/** Card state, as the Host reports it on `missions[].state`. */
export const STATE_LABEL = table({
  running: '运行中',
  waiting: '待派发',
  stale: '已离线',
  blocked: '被阻塞',
  paused: '已暂停',
  done: '已完成',
})

/** Lifecycle status, as the protocol stores it on `missions[].status`. */
export const STATUS_LABEL = table({
  planned: '待派发',
  active: '进行中',
  completed: '待验收',
  blocked: '被阻塞',
  paused: '已暂停',
  merged: '已合并',
  abandoned: '已放弃',
})

/** Mission kind. */
export const KIND_LABEL = table({
  build: '开发',
  survey: '调研',
  artifact: '交付',
})

/** How a merge recommendation reads. */
export const MERGE_LABEL = table({
  merge: '可合并',
  'fix-then-merge': '修后合并',
  hold: '暂缓',
})

/** Agent kind, as a short tag on a card. */
export const AGENT_KIND_LABEL = table({
  worker: 'Worker',
  reviewer: '评审',
})

/** Edge types, in legend order. */
export const EDGE_LABEL = table({
  dispatch: '派发',
  own: '拥有',
  former: '曾负责',
  review: '评审',
  dep: '依赖',
  message: '消息',
})

/** Statuses that leave a mission open from the tower's point of view. */
const CLOSED_STATUS = new Set(['merged', 'abandoned'])

/**
 * Derive the card state from a lifecycle status and the worker's liveness.
 *
 * Used when a snapshot arrives without `state` (a Host older than the detail
 * contract).
 *
 * @param status - the lifecycle status.
 * @param live - whether the owning worker is live.
 * @returns the card state.
 */
export function stateOf(status, live) {
  switch (status) {
    case 'planned': return 'waiting'
    case 'active': return live ? 'running' : 'stale'
    case 'blocked': return 'blocked'
    case 'paused': return 'paused'
    default: return 'done'
  }
}

/**
 * Whether a mission still counts as open work.
 *
 * `completed` is open: it awaits review or acceptance and the store sends it
 * back to active when a review comes back non-clean.
 *
 * @param mission - a mission of the canvas snapshot.
 * @returns true unless the mission was merged or abandoned.
 */
export function isOpen(mission) {
  return !CLOSED_STATUS.has(mission.status)
}

/**
 * The colour role of a mission: what its lifecycle status means at a glance.
 *
 * `done` (green) is a merged mission; `accent` (blue) is one that finished its
 * work and now awaits review or acceptance; `plain` is an abandoned one.
 *
 * @param mission - a mission of the canvas snapshot.
 * @returns the tone, one of the `.dkc-tag[data-tone]` values.
 */
export function missionTone(mission) {
  switch (mission.status) {
    case 'merged': return 'done'
    case 'abandoned': return 'plain'
    case 'completed': return 'accent'
    case 'blocked': return 'blocked'
    case 'paused': return 'paused'
    case 'planned': return 'waiting'
    default: return mission.live ? 'running' : 'stale'
  }
}

/**
 * The one label a mission is shown under.
 *
 * The lifecycle status is more specific than the card state (`待验收` versus
 * `已完成`), so it wins when the Host sent one.
 *
 * @param mission - a mission of the canvas snapshot.
 * @returns the label.
 */
export function missionLabel(mission) {
  // `statusText` is the status as the Host wrote it; a corrupted one shows as
  // its own raw text rather than borrowing the label of the status it was
  // normalised to.
  const written = mission.statusText ?? mission.status
  return lookup(STATUS_LABEL, written, lookup(STATE_LABEL, mission.state, written))
}

/**
 * Read a review verdict.
 *
 * `clean` is a pass; `p1-2items` / `p2-1items` carry a priority and a count.
 * Anything else is shown as the Host sent it.
 *
 * @param status - the verdict string.
 * @returns the label.
 */
export function reviewLabel(status) {
  if (status === 'clean') return '通过'
  const match = /^p([12])-(\d+)items$/.exec(String(status ?? ''))
  if (match !== null) return `P${match[1]} 问题 ×${match[2]}`
  return String(status ?? '')
}

/**
 * Elapsed time in Chinese units, the way the dock formats it.
 *
 * @param ms - a duration in milliseconds.
 * @returns the formatted duration.
 */
export function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000))
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分${seconds % 60}秒`
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分`
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function localDate(ms) {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * Parse a timestamp that may be a full ISO instant or a date only.
 *
 * The Host writes `missions[].review.at` and `findings[].createdAt` from the
 * protocol, where both forms occur. A date-only value has no time of day, and
 * an unparseable value is not a date at all; neither may reach `new Date`.
 *
 * @param value - the raw field.
 * @returns the parsed time, or null when the value is not a timestamp.
 */
export function parseTime(value) {
  if (typeof value !== 'string' || value === '') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, ms: null }
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return null
  return { date: localDate(ms), ms }
}

/**
 * Format a timestamp compactly for a list row.
 *
 * @param value - the raw field.
 * @returns `MM-DD HH:mm` for an instant, `MM-DD` for a date-only value, the
 * raw text when it is unparseable, and an empty string when absent.
 */
export function formatClock(value) {
  const parsed = parseTime(value)
  if (parsed === null) return typeof value === 'string' ? value : ''
  const day = parsed.date.slice(5)
  if (parsed.ms === null) return day
  const date = new Date(parsed.ms)
  return `${day} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * Format a timestamp in full for a detail row.
 *
 * @param value - the raw field.
 * @returns `YYYY-MM-DD HH:mm` for an instant, the date for a date-only value,
 * the raw text when it is unparseable, and an empty string when absent.
 */
export function formatStamp(value) {
  const parsed = parseTime(value)
  if (parsed === null) return typeof value === 'string' ? value : ''
  if (parsed.ms === null) return parsed.date
  const date = new Date(parsed.ms)
  return `${parsed.date} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * Compare two ids the way a person reads them: `M2` sorts before `M10`.
 *
 * @param a - the first id.
 * @param b - the second id.
 * @returns negative, zero, or positive.
 */
export function compareNatural(a, b) {
  const left = String(a).split(/(\d+)/)
  const right = String(b).split(/(\d+)/)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const x = left[index] ?? ''
    const y = right[index] ?? ''
    if (x === y) continue
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) - Number(y)
    return x < y ? -1 : 1
  }
  return 0
}

/** How an agent's end status reads. Anything the Host sends that is not here is shown as sent. */
const DEATH_LABEL = table({
  completed: '已完成',
  error: '出错',
  interrupted: '已中断',
  cancelled: '已取消',
  canceled: '已取消',
  timeout: '已超时',
  'max-tokens': '输出达上限',
  blocked: '被阻止',
  idle: '已空闲',
  stopped: '已停止',
})

/**
 * Read the status an agent ended with.
 *
 * @param status - the raw `deathStatus`.
 * @returns `已结束` when none was sent, else `已结束 · <label>`.
 */
export function deathLabel(status) {
  if (status === undefined || status === null || status === '') return '已结束'
  return `已结束 · ${lookup(DEATH_LABEL, status, status)}`
}

/**
 * The role line of an agent card: its kind, the mission it is bound to, and
 * its model.
 *
 * @param agent - an agent node of the layout.
 * @returns one line of text.
 */
export function agentMeta(agent) {
  const parts = [lookup(AGENT_KIND_LABEL, agent.kind, 'Worker')]
  if (agent.role === 'owner') parts.push(`负责 ${agent.missionId}`)
  else if (agent.role === 'former') parts.push(`曾负责 ${agent.missionId}`)
  else if (agent.role === 'reviewer') parts.push(agent.missionId !== '' ? agent.missionId : '未关联任务')
  else parts.push('未关联任务')
  if (agent.model !== '') parts.push(agent.model + (agent.effort !== '' ? ` · ${agent.effort}` : ''))
  return parts.join(' · ')
}

/**
 * How long a live agent has been running, from when it was spawned.
 *
 * @param agent - an agent node of the layout.
 * @param now - the current time in ms.
 * @returns the formatted duration, or an empty string when it cannot be told.
 */
export function agentUptime(agent, now) {
  return elapsedSince(agent.spawnedAt, now)
}

/**
 * How long ago a timestamp was.
 *
 * @param value - the raw timestamp (an instant; a date alone has no time of day).
 * @param now - the current time in ms.
 * @returns the formatted duration, or an empty string when it cannot be told.
 */
export function elapsedSince(value, now) {
  const parsed = parseTime(value)
  if (parsed === null || parsed.ms === null) return ''
  return formatElapsed(Math.max(0, now - parsed.ms))
}

/**
 * The edge types in the order the legend lists them, with how each is drawn.
 */
export const EDGE_KINDS = Object.freeze([
  Object.freeze({ type: 'dispatch', label: '派发' }),
  Object.freeze({ type: 'own', label: '拥有 / 评审' }),
  Object.freeze({ type: 'dep', label: '依赖' }),
  Object.freeze({ type: 'message', label: '消息' }),
])

/** The mission tones, in the order the legend lists them. */
export const STATE_TONES = Object.freeze([
  Object.freeze({ tone: 'running', label: '运行中' }),
  Object.freeze({ tone: 'blocked', label: '被阻塞' }),
  Object.freeze({ tone: 'paused', label: '已暂停 / 已离线' }),
  Object.freeze({ tone: 'done', label: '已完成' }),
])
