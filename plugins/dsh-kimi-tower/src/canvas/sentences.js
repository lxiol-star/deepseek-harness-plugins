/**
 * Sentences of the canvas, kept out of the React tree.
 *
 * The detail panel mixes layout with wording. Pulling the wording into plain
 * functions is what lets node pin it: a count read off the wrong field shows up
 * as "undefined" on screen, and nothing short of rendering would catch it.
 */
import { MERGE_LABEL, formatStamp, lookup, missionLabel, missionTone, reviewLabel } from './labels.js'

/**
 * The facts of the overview: what the snapshot holds, as `[label, text]` rows.
 *
 * `graph.stats` holds counts (numbers) and `graph.data` the lists they were
 * counted from. Each row reads one or the other — never a count's `.length`.
 *
 * @param graph - a layout from `layoutCanvas`.
 * @returns the rows, each `[label, text]`.
 */
export function overviewFacts(graph) {
  const stats = graph.stats
  const data = graph.data
  return [
    ['基线分支', data.base === '' ? '（未知）' : data.base],
    ['任务', `${stats.missions} 个，${stats.open} 个未完成`],
    ['进行中', `${stats.running} 个运行中，${stats.blocked} 个被阻塞`],
    ['Agent', `${stats.agents} 个，${stats.live} 个在线`],
    ['消息', `${stats.messages} 条，${stats.unread} 条未读`],
    ['发现', `${stats.findings} 条`],
    ['活动日志', `${stats.activity} 行`],
  ]
}

/**
 * The one-line verdict of a mission's latest review.
 *
 * @param mission - a mission of the layout's snapshot.
 * @returns the sentence, or an empty string when there is no review.
 */
export function reviewSummary(mission) {
  const review = mission.review
  if (review === undefined) return ''
  return [
    `第 ${Math.max(1, review.round)} 轮`,
    reviewLabel(review.status),
    lookup(MERGE_LABEL, review.merge, review.merge),
    review.reviewer,
    formatStamp(review.at),
  ].filter(part => part !== '' && part !== undefined).join(' · ')
}

/** Re-exported for the panel's convenience, so it reads wording from one place. */
export { missionLabel, missionTone }
