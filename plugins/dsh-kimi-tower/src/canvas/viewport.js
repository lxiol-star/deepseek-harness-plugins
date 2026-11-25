/**
 * Viewport maths of the tower canvas: fit, zoom, pan and the minimap.
 *
 * The canvas keeps a view of `{ x, y, zoom }` in screen px. A world point is
 * drawn at `(wx * zoom + x, wy * zoom + y)`. Every function here is pure and
 * works on plain numbers, so the arithmetic can be pinned in node.
 */

/** How far the canvas can be zoomed out. */
export const ZOOM_MIN = 0.2
/** How far the canvas can be zoomed in. */
export const ZOOM_MAX = 2.5
/** A small diagram is not blown up past this when it is fitted. */
export const FIT_MAX_ZOOM = 1.25

/**
 * The room a fitted diagram keeps from the stage edges. The top and bottom
 * bands hold the floating toolbars, the legend and the minimap.
 */
export const FIT_PADDING = Object.freeze({ top: 88, right: 48, bottom: 100, left: 48 })

const INITIAL = Object.freeze({ x: 0, y: 0, zoom: 1 })

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Keep a zoom level inside the allowed range.
 *
 * @param zoom - the wanted zoom.
 * @returns the zoom to use.
 */
export function clampZoom(zoom) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, finite(zoom, 1)))
}

/**
 * The view that shows a whole bounding box, centred, inside a stage.
 *
 * @param bounds - `{ x, y, w, h }` in world px.
 * @param width - the stage width in screen px.
 * @param height - the stage height in screen px.
 * @param padding - the room to keep, per edge.
 * @returns the fitted view.
 */
export function fitView(bounds, width, height, padding = FIT_PADDING) {
  const boxW = Math.max(1, finite(bounds?.w, 1))
  const boxH = Math.max(1, finite(bounds?.h, 1))
  const boxX = finite(bounds?.x, 0)
  const boxY = finite(bounds?.y, 0)
  const availW = Math.max(1, finite(width, 1) - finite(padding.left, 0) - finite(padding.right, 0))
  const availH = Math.max(1, finite(height, 1) - finite(padding.top, 0) - finite(padding.bottom, 0))
  const zoom = Math.min(clampZoom(Math.min(availW / boxW, availH / boxH)), FIT_MAX_ZOOM)
  return {
    x: finite(padding.left, 0) + (availW - boxW * zoom) / 2 - boxX * zoom,
    y: finite(padding.top, 0) + (availH - boxH * zoom) / 2 - boxY * zoom,
    zoom,
  }
}

/**
 * Zoom by a factor about a screen point, which stays put on the screen.
 *
 * @param view - the current view.
 * @param factor - multiply the zoom by this.
 * @param cx - the anchor's x in screen px.
 * @param cy - the anchor's y in screen px.
 * @returns the new view; the same object when the zoom would not change.
 */
export function zoomAt(view, factor, cx, cy) {
  const current = view ?? INITIAL
  const zoom = clampZoom(current.zoom * finite(factor, 1))
  if (zoom === current.zoom) return current
  const x = finite(cx, 0)
  const y = finite(cy, 0)
  return { x: x - (x - current.x) * (zoom / current.zoom), y: y - (y - current.y) * (zoom / current.zoom), zoom }
}

/**
 * Set an exact zoom about a screen point.
 *
 * @param view - the current view.
 * @param zoom - the zoom to reach.
 * @param cx - the anchor's x in screen px.
 * @param cy - the anchor's y in screen px.
 * @returns the new view.
 */
export function zoomTo(view, zoom, cx, cy) {
  const current = view ?? INITIAL
  return zoomAt(current, clampZoom(zoom) / current.zoom, cx, cy)
}

/**
 * Move the view by a screen distance.
 *
 * @param view - the current view.
 * @param dx - horizontal distance in screen px.
 * @param dy - vertical distance in screen px.
 * @returns the moved view.
 */
export function panBy(view, dx, dy) {
  const current = view ?? INITIAL
  return { x: current.x + finite(dx, 0), y: current.y + finite(dy, 0), zoom: current.zoom }
}

/**
 * The view that centres a world point, keeping the zoom.
 *
 * @param view - the current view (only its zoom is used).
 * @param wx - the world x to centre.
 * @param wy - the world y to centre.
 * @param width - the stage width in screen px.
 * @param height - the stage height in screen px.
 * @returns the centred view.
 */
export function centreOn(view, wx, wy, width, height) {
  const current = view ?? INITIAL
  return { x: finite(width, 0) / 2 - finite(wx, 0) * current.zoom, y: finite(height, 0) / 2 - finite(wy, 0) * current.zoom, zoom: current.zoom }
}

/**
 * Translate a screen point to a world point.
 *
 * @param view - the current view.
 * @param sx - screen x in px.
 * @param sy - screen y in px.
 * @returns the world point.
 */
export function toWorld(view, sx, sy) {
  const current = view ?? INITIAL
  return { x: (finite(sx, 0) - current.x) / current.zoom, y: (finite(sy, 0) - current.y) / current.zoom }
}

/**
 * The part of the world a stage shows.
 *
 * @param view - the current view.
 * @param width - the stage width in screen px.
 * @param height - the stage height in screen px.
 * @returns `{ x, y, w, h }` in world px.
 */
export function visibleRect(view, width, height) {
  const current = view ?? INITIAL
  // `-0` would fail a strict equality against a stored view.
  return { x: (0 - current.x) / current.zoom || 0, y: (0 - current.y) / current.zoom || 0, w: finite(width, 0) / current.zoom, h: finite(height, 0) / current.zoom }
}

/**
 * Fit a bounding box into the minimap.
 *
 * @param bounds - `{ x, y, w, h }` in world px.
 * @param width - the minimap width in screen px.
 * @param height - the minimap height in screen px.
 * @param margin - the room to keep around the diagram.
 * @returns `{ scale, offsetX, offsetY, toMap, toWorld }`.
 */
export function minimapProjection(bounds, width, height, margin = 6) {
  const boxW = Math.max(1, finite(bounds?.w, 1))
  const boxH = Math.max(1, finite(bounds?.h, 1))
  const scale = Math.max(1e-6, Math.min((finite(width, 1) - margin * 2) / boxW, (finite(height, 1) - margin * 2) / boxH))
  const offsetX = (finite(width, 1) - boxW * scale) / 2 - finite(bounds?.x, 0) * scale
  const offsetY = (finite(height, 1) - boxH * scale) / 2 - finite(bounds?.y, 0) * scale
  return {
    scale,
    offsetX,
    offsetY,
    toMap: (x, y) => ({ x: finite(x, 0) * scale + offsetX, y: finite(y, 0) * scale + offsetY }),
    toWorld: (x, y) => ({ x: (finite(x, 0) - offsetX) / scale, y: (finite(y, 0) - offsetY) / scale }),
  }
}
