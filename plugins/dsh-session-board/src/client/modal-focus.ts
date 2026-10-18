/**
 * Focus containment, background inerting and return-focus resolution for the
 * fullscreen board.
 *
 * The board is page-like rather than a host dialog: it is portalled to
 * `document.body` so the Electron window-drag region composed inside `#root` is
 * subtracted wholesale. Escaping `#root` also means the board cannot inherit the
 * shell's own modal layer, so this module reproduces the guarantees that matter:
 *
 *  - Tab / Shift+Tab loop across the board's own controls,
 *  - Escape is owned by the board only while no newer dialog or menu sits above
 *    it (the shell's convention is "last modal in document order is foreground",
 *    and every official dialog and menu is portalled to `body` too),
 *  - the rest of the page is inert while the board covers it, and the previous
 *    `inert` state is restored exactly,
 *  - focus returns to the opener when it is still connected, else to the board
 *    toggle (marked `data-session-board-toggle`, else a labelled toggle button).
 *
 * The decision functions are deliberately separated from the DOM walks so the
 * tricky parts are pinned without a browser.
 */

/** Foreground owners, matching the shell modal layer's own selector. */
export const MODAL_LAYER_SELECTOR = '[role="dialog"][aria-modal="true"], [role="menu"]'

/** Attribute an app-level board toggle may carry so return focus can find it. */
export const BOARD_TOGGLE_ATTRIBUTE = 'data-session-board-toggle'

/** Selector for the marked board toggle. */
export const BOARD_TOGGLE_SELECTOR = `[${BOARD_TOGGLE_ATTRIBUTE}]`

/**
 * Candidates for a Tab press, in document order.
 *
 * This is a superset: `focusableIn` drops negative-`tabindex` controls, since
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

/** Every foreground layer in the document, in document order. */
export function modalLayers(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll(MODAL_LAYER_SELECTOR)).filter(element => element.closest('[inert], [hidden], [aria-hidden="true"]') === null)
}

/**
 * Whether the board is the foreground layer.
 *
 * Document order is the shell's own arbitration rule, so the board yields to any
 * newer dialog or menu and to any foreground layer nested inside the board (a
 * menu opened from the toolbar).
 *
 * @param panel - the board's own dialog element.
 * @param layers - foreground layers in document order (see {@link modalLayers}).
 * @returns true when the last layer is the board or lives inside it.
 */
export function isTopmostModal(panel: Element | null, layers: readonly Element[]): boolean {
  if (panel === null) return false
  const top = layers[layers.length - 1]
  if (top === undefined) return true
  return top === panel || panel.contains(top)
}

/** Whether focus sits inside a menu, which owns its own Tab traversal. */
export function isInsideMenu(active: Element | null): boolean {
  return active !== null && active.closest('[role="menu"]') !== null
}

/** The tabbable controls inside a container, in document order. */
export function focusableIn(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter(element => element.closest('[inert], [hidden], [aria-hidden="true"]') === null)
    .filter(element => element.tabIndex >= 0)
}

/**
 * The element a Tab press must move to, or null when the browser's default
 * traversal already stays inside the container.
 *
 * @param items - focusable controls in document order.
 * @param active - the element that currently has focus.
 * @param shift - whether the press was Shift+Tab.
 */
export function trapTabTarget(
  items: readonly HTMLElement[],
  active: Element | null,
  shift: boolean,
): HTMLElement | null {
  const first = items[0]
  const last = items[items.length - 1]
  if (first === undefined || last === undefined) return null
  const index = active === null ? -1 : items.findIndex(item => item === active)
  // Focus outside the board (or on the panel itself) is pulled back in.
  if (index === -1) return shift ? last : first
  if (shift) return index === 0 ? last : null
  return index === items.length - 1 ? first : null
}

/** One background node's `inert` state before the board claimed it. */
interface InertRecord {
  node: Element
  /** The attribute value before the board opened, or null when it was absent. */
  previousValue: string | null
}

/**
 * Make every body child other than the board inert, returning the release.
 *
 * The board is a direct child of `body` (the portal), so its siblings are the
 * whole page. Nodes that were already inert keep their exact previous value, and
 * a node that was not gets the attribute removed again on release: the board
 * never widens or narrows a caller's own inert state.
 *
 * @param doc - the product document.
 * @param panel - the board element to leave interactive.
 * @returns the release; a no-op when there is no body or no board to protect.
 */
export function inertBackground(doc: Document, panel: Element | null): () => void {
  const body = doc.body
  if (body === null || body === undefined || panel === null) return () => {}
  const records: InertRecord[] = []
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
export function escapeAttributeValue(value: string): string {
  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')
}

/** Inputs for {@link resolveRestoreTarget}. */
export interface RestoreQuery {
  /** The element focused when the board opened. */
  saved?: HTMLElement | null
  doc: Document
  /** Accessible names of the board's toggle controls, in preference order. */
  labels?: readonly string[]
}

/**
 * Resolve where focus goes when the board closes.
 *
 * The opener wins while it is still connected; a board opened from a control
 * that has since unmounted falls back to the marked toggle, then to the first
 * toggle button named by the caller's own wording.
 *
 * @param query - saved opener, document, and fallback toggle labels.
 * @returns the element to focus, or null when nothing suitable remains.
 */
export function resolveRestoreTarget(query: RestoreQuery): HTMLElement | null {
  const { saved = null, doc, labels = [] } = query
  if (saved !== null && saved.isConnected) return saved
  const marked = doc.querySelector<HTMLElement>(BOARD_TOGGLE_SELECTOR)
  if (marked !== null) return marked
  for (const label of labels) {
    const match = doc.querySelector<HTMLElement>(`button[aria-label="${escapeAttributeValue(label)}"]`)
    if (match !== null) return match
  }
  return null
}
