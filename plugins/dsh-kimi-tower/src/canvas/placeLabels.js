/**
 * Where the wire labels go, so that they can be read.
 *
 * A wire's label is a chip of a fixed size in *screen* pixels (`.dkc-label`:
 * 16px high, 5px of padding either side, 10.5px type), while its anchor is a
 * point in *world* pixels. Zooming out pulls the anchors together and leaves
 * the chips as wide as they were, so labels that cleared each other at 100%
 * end up stacked at the zoom the canvas is fitted to. The independent review
 * measured 15 overlaps out of 25 labels at the default view.
 *
 * So the labels are placed for the zoom they will be shown at. This module
 * takes the graph and a zoom and, for every wire, returns where its chip sits
 * and whether it is shown at all:
 *
 *  1. The chip's *centre* must lie on the wire. It may slide along a straight
 *     run of the wire, and it may drift a little to either side of that run
 *     (`LABEL.drift`, 16px) when the run hugs a card. It may never leave the
 *     wire by more than that, and a chip that cannot find such a place is
 *     hidden rather than moved somewhere the reader cannot tell which wire it
 *     belongs to.
 *  2. The labels that matter claim their place first: 依赖 and 评审, then
 *     消息, then 拥有 / 曾负责, and only then 派发. A hidden label is never
 *     pushed out by one of a less important kind; every chip already placed
 *     is checked, and the chip is swept along its own wire, never across the
 *     canvas.
 *  3. Below `COMPACT_ZOOM` the stage draws only the wires that carry a count
 *     (依赖 and 消息). The placement follows the same rule, so an invisible
 *     chip never takes the room of a visible one.
 *  4. A hidden 消息 label folds into a visible one of the same pair and the
 *     same stretch of wire, which then reads ×N. (The layout already groups
 *     messages per pair; the fold is kept for a graph built by hand.)
 *
 * All of it is a pure function of the graph and the zoom, so the same picture
 * always gets the same labels, and node can pin that no two chips overlap,
 * that none sits on a card, and that every shown chip still sits on its own
 * wire.
 */
import { textWidth } from './measure.js'
import { COMPACT_ZOOM } from './viewport.js'

/** Chip geometry, mirroring `.dkc-label`: height, padding and type size in screen px. */
export const LABEL = Object.freeze({
  height: 16,
  padX: 5,
  fontSize: 10.5,
  /** Least clear space between a chip and a card or another chip. */
  gap: 1,
  /** How far the centre of a chip may sit from its own wire. */
  drift: 16,
})

/** Which labels give way first when there is no room. Higher is placed first. */
const RANK = Object.freeze({ dispatch: 0, former: 1, own: 2, message: 3, review: 4, dep: 5 })

/** The kinds of wire whose label is a count and so can be folded into a twin. */
const COUNTED = new Set(['message'])

/** The kinds whose labels the stage still draws when the canvas is zoomed far out. */
const COMPACT_KINDS = new Set(['dep', 'message'])

/** A chip may try to drift this far at a time, then the next step. */
const DRIFT_STEP = 4
/** How far along its wire a chip is tried at a time, in screen px. */
const ALONG_STEP = 4

/** The width of a chip, in screen px. */
export function labelWidth(text) {
  // The estimate rounds the text up, which covers the 1px border the real
  // element adds on either side.
  return Math.ceil(textWidth(text, LABEL.fontSize, false, 1.06)) + LABEL.padX * 2
}

/** Whether two rectangles overlap, keeping at least `gap` apart otherwise. */
export function overlaps(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
}

/** The chip of a wire in screen pixels, for an anchor given in world px. */
function chipAt(anchor, text, view) {
  const w = labelWidth(text)
  return {
    x: anchor[0] * view.zoom + view.x - w / 2,
    y: anchor[1] * view.zoom + view.y - LABEL.height / 2,
    w,
    h: LABEL.height,
  }
}

/**
 * The chip of a wire where the layout put it, in screen px.
 *
 * @param edge - a wire of the layout.
 * @param view - `{ x, y, zoom }`.
 * @returns `{ x, y, w, h }`, top-left corner and size.
 */
export function labelRect(edge, view) {
  return chipAt(edge.labelAt, edge.label, view)
}

/**
 * The runs a chip may slide along: every straight run of the wire, longest
 * first. A short run is still worth trying when the longest one has no room.
 *
 * @param edge - a wire of the layout.
 * @param view - `{ x, y, zoom }`.
 * @returns `{ axis: 'x' | 'y', fixed, from, to, length }[]` in screen px — the
 *   range of the centre along `axis`, and the coordinate on the other axis.
 */
export function legsOf(edge, view) {
  const toScreen = point => [point[0] * view.zoom + view.x, point[1] * view.zoom + view.y]
  const legs = []
  for (let index = 1; index < edge.points.length; index += 1) {
    const [x0, y0] = toScreen(edge.points[index - 1])
    const [x1, y1] = toScreen(edge.points[index])
    const horizontal = Math.abs(y1 - y0) < 0.5
    const vertical = Math.abs(x1 - x0) < 0.5
    if (!horizontal && !vertical) continue
    if (horizontal && vertical) continue
    legs.push(horizontal
      ? { axis: 'x', fixed: y0, from: Math.min(x0, x1), to: Math.max(x0, x1), length: Math.abs(x1 - x0) }
      : { axis: 'y', fixed: x0, from: Math.min(y0, y1), to: Math.max(y0, y1), length: Math.abs(y1 - y0) })
  }
  legs.sort((a, b) => b.length - a.length || (a.axis < b.axis ? -1 : a.axis > b.axis ? 1 : a.fixed - b.fixed))
  return legs
}

/** Every run of a wire; a wire with no straight run still gets its anchor as a point. */
function runsOf(edge, view) {
  const legs = legsOf(edge, view)
  if (legs.length > 0) return legs
  const x = edge.labelAt[0] * view.zoom + view.x
  const y = edge.labelAt[1] * view.zoom + view.y
  return [{ axis: 'x', fixed: y, from: x, to: x, length: 0 }]
}

/** The wire's longest straight run — where its chip goes first. */
export function legOf(edge, view) {
  return runsOf(edge, view)[0]
}

/** The chip for a centre and a drift, in screen px. */
function rectAt(leg, along, drift, w) {
  return leg.axis === 'x'
    ? { x: along - w / 2, y: leg.fixed - LABEL.height / 2 + drift, w, h: LABEL.height }
    : { x: leg.fixed - w / 2 + drift, y: along - LABEL.height / 2, w, h: LABEL.height }
}

/** The places along a run to try, nearest the layout's anchor first, ends included. */
function positionsAlong(leg, anchor) {
  const start = Math.min(leg.to, Math.max(leg.from, anchor))
  const seen = new Set()
  const positions = []
  const take = value => {
    const clamped = Math.min(leg.to, Math.max(leg.from, value))
    const key = clamped.toFixed(3)
    if (seen.has(key)) return
    seen.add(key)
    positions.push(clamped)
  }
  take(start)
  for (let offset = ALONG_STEP; offset <= Math.max(start - leg.from, leg.to - start); offset += ALONG_STEP) {
    take(start + offset)
    take(start - offset)
  }
  take(leg.from)
  take(leg.to)
  return positions
}

/**
 * Place every wire's label for one zoom.
 *
 * @param graph - a layout from `layoutCanvas`.
 * @param zoom - the zoom the picture is shown at.
 * @returns a `Map` from wire id to `{ at: [x, y], hidden, text? }`: `at` is
 *   the anchor to draw the chip on, in world px; `hidden` for a label dropped
 *   for lack of room; `text` when a fold changed what it says.
 */
export function placeLabels(graph, zoom) {
  const view = { x: 0, y: 0, zoom }
  // Far out the stage draws only the counting wires; their labels are the only
  // ones worth a place, and an invisible one must never take room from them.
  const compact = zoom < COMPACT_ZOOM
  const placed = new Map()
  const kept = []

  // What a chip may never cover: every card, in screen px.
  const cards = [
    ...graph.nodes,
    ...graph.groups,
  ].map(node => ({ x: node.x * zoom, y: node.y * zoom, w: node.w * zoom, h: node.h * zoom }))

  // The most important labels first; ties go to the wire with the longer run,
  // then by id, so the order never depends on the order of the input.
  const runs = new Map(graph.edges.map(edge => [edge.id, runsOf(edge, view)]))
  const order = [...graph.edges].sort((a, b) => (RANK[b.type] - RANK[a.type])
    || (runs.get(b.id)[0].length - runs.get(a.id)[0].length)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  for (const edge of order) {
    if (compact && !COMPACT_KINDS.has(edge.type)) {
      placed.set(edge.id, { at: [edge.labelAt[0], edge.labelAt[1]], hidden: true })
      continue
    }
    const w = labelWidth(edge.label)
    const anchor = edge.labelAt[0] * zoom
    let chosen = null
    // The longest run first, then the next one. On each, the chip is swept
    // outward from the layout's anchor, and at every point it may sit on the
    // wire or drift a little to one side; the first place clear of every card
    // and every chip already placed wins.
    for (const leg of runs.get(edge.id)) {
      const along = leg.axis === 'x' ? anchor : edge.labelAt[1] * zoom
      const positions = positionsAlong(leg, along)
      for (let drift = 0; drift <= LABEL.drift + 0.5 && chosen === null; drift += DRIFT_STEP) {
        for (const side of drift === 0 ? [0] : [1, -1]) {
          const offset = drift * side
          for (const position of positions) {
            const rect = rectAt(leg, position, offset, w)
            if (cards.some(card => overlaps(rect, card, LABEL.gap))) continue
            if (kept.some(other => overlaps(rect, other.rect, LABEL.gap))) continue
            chosen = { leg, position, offset }
            break
          }
          if (chosen !== null) break
        }
      }
      if (chosen !== null) break
    }

    if (chosen === null) {
      placed.set(edge.id, { at: [edge.labelAt[0], edge.labelAt[1]], hidden: true })
      continue
    }
    kept.push({ id: edge.id, rect: rectAt(chosen.leg, chosen.position, chosen.offset, w), leg: chosen.leg })
    // The centre of the chip, on the wire and maybe drifted a little to one
    // side. The renderer positions the chip by its centre, so the geometry
    // tested here and the geometry drawn are the same.
    const centre = chosen.leg.axis === 'x'
      ? [chosen.position, chosen.leg.fixed + chosen.offset]
      : [chosen.leg.fixed + chosen.offset, chosen.position]
    placed.set(edge.id, {
      at: [(centre[0] - view.x) / zoom, (centre[1] - view.y) / zoom],
      hidden: false,
    })
  }

  // A hidden counted label folds into a visible one of the same pair running
  // along the same stretch of wire, so the reader is still told that more
  // passes there. The fold is reported on the host label; the graph is never
  // written to.
  for (const [id, spot] of placed) {
    if (!spot.hidden) continue
    const edge = graph.edges.find(candidate => candidate.id === id)
    if (edge === undefined || !COUNTED.has(edge.type)) continue
    const host = kept.find(other => {
      const twin = graph.edges.find(candidate => candidate.id === other.id)
      if (twin === undefined || twin.type !== edge.type) return false
      if (twin.from !== edge.from || twin.to !== edge.to) return false
      const twinLeg = other.leg
      return legsOf(edge, view).some(leg => leg.axis === twinLeg.axis
        && Math.abs(leg.fixed - twinLeg.fixed) <= LABEL.drift
        && leg.from < twinLeg.to && twinLeg.from < leg.to)
    })
    if (host !== undefined) host.folded = (host.folded ?? 0) + 1
  }
  for (const other of kept) {
    if ((other.folded ?? 0) === 0) continue
    const edge = graph.edges.find(candidate => candidate.id === other.id)
    const count = (edge.count ?? 1) + other.folded
    placed.set(other.id, { ...placed.get(other.id), text: count > 1 ? `${edge.label.replace(/ ×\d+$/, '')} ×${count}` : edge.label })
  }
  return placed
}
