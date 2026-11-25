/**
 * Focus containment, background inerting and return focus for the canvas.
 *
 * The canvas is portalled to `document.body` (so the macOS window-drag region
 * composed inside `#root` is not swallowed by a full-window surface), which
 * means it cannot inherit the shell's modal layer. This module reproduces the
 * guarantees that matter, following the fullscreen board of
 * `dsh-session-board`:
 *
 *  - Tab / Shift+Tab loop across the canvas's own controls,
 *  - Escape is owned by the canvas only while no newer dialog or menu sits
 *    above it (the shell's rule: the last modal in document order is the
 *    foreground one),
 *  - the rest of the page is inert while the canvas is open, and each node's
 *    previous `inert` state is restored exactly,
 *  - focus returns to the opener when it is still connected, else to a marked
 *    canvas entry on the dock.
 *
 * The decisions are kept apart from the DOM walks so they can be pinned in node.
 */

/** Foreground owners, matching the shell modal layer's own selector. */
export const MODAL_LAYER_SELECTOR = '[role="dialog"][aria-modal="true"], [role="menu"]'

/** Attribute every canvas entry button on the dock carries. */
export const CANVAS_ENTRY_ATTRIBUTE = 'data-dkt-canvas-entry'

/** Selector for the marked canvas entries. */
export const CANVAS_ENTRY_SELECTOR = `[${CANVAS_ENTRY_ATTRIBUTE}]`

/**
 * Candidates for a Tab press, in document order.
 *
 * A superset: {@link focusableIn} drops negative-`tabindex` controls, since
 * they are focusable only programmatically and must not join the Tab loop.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Every foreground layer in the document, in document order.
 *
 * @param doc - the document.
 * @returns the dialogs and menus that are not hidden or inert.
 */
export function modalLayers(doc) {
  return Array.from(doc.querySelectorAll(MODAL_LAYER_SELECTOR))
    .filter(element => element.closest('[inert], [hidden], [aria-hidden="true"]') === null)
}

/**
 * Whether the canvas is the foreground layer.
 *
 * Document order is the shell's own arbitration rule, so the canvas yields to
 * any newer dialog or menu, and to any foreground layer nested inside it.
 *
 * @param panel - the canvas's own dialog element.
 * @param layers - foreground layers in document order.
 * @returns true when the last layer is the canvas or lives inside it.
 */
export function isTopmostModal(panel, layers) {
  if (panel === null || panel === undefined) return false
  const top = layers[layers.length - 1]
  if (top === undefined) return true
  return top === panel || panel.contains(top)
}

/** Whether focus sits inside a menu, which owns its own Tab traversal. */
export function isInsideMenu(active) {
  return active !== null && active !== undefined && active.closest('[role="menu"]') !== null
}

/**
 * The tabbable controls inside a container, in document order.
 *
 * @param root - the container.
 * @returns the controls Tab may move to.
 */
export function focusableIn(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(element => element.closest('[inert], [hidden], [aria-hidden="true"]') === null)
    .filter(element => element.tabIndex >= 0)
}

/**
 * The element a Tab press must move to, or null when the browser's own
 * traversal already stays inside the container.
 *
 * @param items - focusable controls in document order.
 * @param active - the element that currently has focus.
 * @param shift - whether the press was Shift+Tab.
 * @returns the control to focus, or null.
 */
export function trapTabTarget(items, active, shift) {
  const first = items[0]
  const last = items[items.length - 1]
  if (first === undefined) return null
  const index = active === null || active === undefined ? -1 : items.findIndex(item => item === active)
  // Focus outside the canvas (or on the panel itself) is pulled back in.
  if (index === -1) return shift ? last : first
  if (shift) return index === 0 ? last : null
  return index === items.length - 1 ? first : null
}

/**
 * Make every body child other than the canvas inert, returning the release.
 *
 * The canvas is a direct child of `body` (the portal), so its siblings are the
 * whole page. Nodes that were already inert keep their exact previous value,
 * and a node that was not gets the attribute removed again on release.
 *
 * @param doc - the document.
 * @param panel - the canvas element to leave interactive.
 * @returns the release; a no-op when there is no body or no panel.
 */
export function inertBackground(doc, panel) {
  const body = doc.body
  if (body === null || body === undefined || panel === null || panel === undefined) return () => {}
  const records = []
  for (const child of Array.from(body.children)) {
    if (child === panel || child.contains(panel)) continue
    records.push({ node: child, previousValue: child.getAttribute('inert') })
    child.setAttribute('inert', '')
  }
  return () => {
    for (const record of records) {
      if (record.previousValue === null) record.node.removeAttribute('inert')
      else record.node.setAttribute('inert', record.previousValue)
    }
    records.length = 0
  }
}

/** Quote a value for a double-quoted attribute selector. */
export function escapeAttributeValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Resolve where focus goes when the canvas closes.
 *
 * The opener wins while it is still connected. The dock re-renders while the
 * canvas is open (it keeps polling), so an opener that was unmounted falls
 * back to the first marked canvas entry, then to the first dock control.
 *
 * @param query - `{ saved, doc, labels }`.
 * @returns the element to focus, or null when nothing suitable remains.
 */
export function resolveRestoreTarget(query) {
  const saved = query.saved ?? null
  const doc = query.doc
  const labels = query.labels ?? []
  if (saved !== null && saved.isConnected) return saved
  const marked = doc.querySelector(CANVAS_ENTRY_SELECTOR)
  if (marked !== null) return marked
  for (const label of labels) {
    const match = doc.querySelector(`button[aria-label="${escapeAttributeValue(label)}"]`)
    if (match !== null) return match
  }
  return null
}
