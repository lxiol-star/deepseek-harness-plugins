/**
 * Wire geometry: the SVG shapes of a wire.
 *
 * The layout hands over a wire as a list of waypoints (see
 * `./layout.js`). This module turns that list into the path that is drawn and
 * the arrowhead at its end. Pure arithmetic, so it is pinned in node.
 */

/** Length of an arrowhead along its wire, in world px. */
export const HEAD = 9
/** Half-width of an arrowhead, in world px. */
export const HEAD_HALF = 5

const fmt = value => Math.round(value * 100) / 100
const fmtPoint = point => `${fmt(point[0])} ${fmt(point[1])}`

/**
 * Draw a wire short of its last point, so its arrowhead ends exactly there.
 *
 * The arrowhead points along the last leg. A wire whose last leg is shorter
 * than the head would have its line poke out of the head, so the line is cut
 * back no further than the start of that leg.
 *
 * @param points - the wire's waypoints, at least one.
 * @returns `path`: the line to stroke; `head`: the triangle to fill.
 */
export function wireGeometry(points) {
  const last = points[points.length - 1]
  const before = points.length > 1 ? points[points.length - 2] : [last[0] - 1, last[1]]
  let dx = last[0] - before[0]
  let dy = last[1] - before[1]
  let length = Math.hypot(dx, dy)
  if (length < 0.001) {
    dx = 1
    dy = 0
    length = 1
  }
  const ux = dx / length
  const uy = dy / length
  const headLength = Math.min(HEAD, length)
  const base = [last[0] - ux * headLength, last[1] - uy * headLength]
  const half = HEAD_HALF * (headLength / HEAD)
  const line = [...points.slice(0, -1), base].map(fmtPoint)
  const head = [
    last,
    [base[0] - uy * half, base[1] + ux * half],
    [base[0] + uy * half, base[1] - ux * half],
  ].map(fmtPoint)
  return { path: `M${line.join('L')}`, head: `M${head.join('L')}Z` }
}

/**
 * Where an arrowhead points, as a compass word for a screen reader.
 *
 * @param points - the wire's waypoints.
 * @returns `上`, `下`, `左` or `右`.
 */
export function wireDirection(points) {
  const first = points[0]
  const last = points[points.length - 1]
  return Math.abs(last[0] - first[0]) >= Math.abs(last[1] - first[1])
    ? (last[0] >= first[0] ? '右' : '左')
    : (last[1] >= first[1] ? '下' : '上')
}
