/**
 * Form A's mount adapter: place the docked column as its own track of the
 * shell frame's grid, between the workspace list and the conversation.
 *
 * Why this exists at all: the shell frame is a fixed three-track grid
 * (`sidebar | centre | rightbar`) whose tracks are computed inside
 * `AppFrame.tsx`. The slot registry exposes `sidebar`, `main` and `rightbar`,
 * but all three are `single`/`keyed` seats that are already occupied —
 * registering into one would *shadow* an official occupant instead of adding a
 * sibling column, which this plugin must never do.
 *
 * Why a grid track and not a child of the centre column: the centre column is
 * a vertical stack in current shells (`flex-direction: column`), so any
 * in-flow sibling pushes the conversation below the fold, and re-parenting the
 * conversation's own wrapper makes the renderer stop mounting it. The frame's
 * grid, by contrast, is exactly the mechanism the shell itself uses to give
 * the rightbar a track — the dock asks for one the same way. Nothing is moved
 * and nothing is covered: the conversation simply gets a narrower `1fr`.
 * The adapter only ever inserts *its own* host element; `centre` is never
 * moved, wrapped, or restyled.
 *
 * Recognition is explicit and conservative. The frame is the shell's grid only
 * when:
 *   - `[data-shell-overlay]` is a direct child (the frame is its parent),
 *   - the template holds exactly the shell's three tracks (ours excluded),
 *   - exactly three children are in-flow, auto-placed columns (display:none,
 *     absolute/fixed, display:contents, line-spanning grid items and our own
 *     host are not columns), and
 *   - once mounted, the conversation is the *middle* of those three.
 * Anything else is a shell this adapter does not know: it declines without
 * touching a single style, and the fullscreen board stays available.
 *
 * Width handling has two layers, both local to the frame element:
 *   - `--sb-dock-track` (set on `documentElement` by the client half) is the
 *     user's desired width, so resize/collapse never rewrites the template;
 *   - `--sb-dock-track-effective` (set here, on the frame) is the responsive
 *     cap derived from {@link fitDockTrack}: it reserves the numeric
 *     sidebar/rightbar tracks plus the shell's protected conversation minimum
 *     before spending the rest on the dock. When the frame is too narrow even
 *     for the rail, the adapter takes its track back out and waits.
 *
 * The template itself is re-extended the moment the app rewrites it: the
 * observer corrects synchronously when its marker is missing, because waiting
 * for `requestAnimationFrame` leaves the shell one frame at the wrong width
 * (the collapse flicker users actually saw).
 *
 * Anchors are stable, semantically-named surfaces rather than hashed
 * CSS-module class names:
 *   - `[data-shell-overlay]` is a direct child of the frame, published by
 *     `AppFrame` for exactly this kind of addressing;
 *   - `[data-slot="conversation..."]` is the renderer's own slot wrapper.
 */
import {
  countOriginalTracks,
  DOCK_FALLBACK_PX,
  DOCK_TRACK_VAR,
  EFFECTIVE_TRACK,
  EFFECTIVE_TRACK_VAR,
  fitDockTrack,
  hasDockTrack,
  isDockTrack,
  parseDockTrackValue,
  resolveNativeColumns,
  splitTrackTokens,
} from './dock-layout.ts'

/** Attribute marking our own column, used for idempotent re-attachment. */
export const DOCK_ATTR = 'data-dsh-session-board'

/** Attribute marking the layout-neutral host element the caller supplies. */
const HOST_ATTR = 'data-dsh-session-board-host'

/** Slot wrappers that identify the centre column's content. */
const CONTENT_SELECTORS: readonly string[] = [
  '[data-slot^="conversation"]',
  '[data-slot="main"]',
  '[data-slot^="main."]',
]

/** Elements that never generate a grid box, whatever their computed style. */
const NON_BOX_TAGS = new Set(['SCRIPT', 'STYLE', 'TITLE', 'META', 'LINK', 'TEMPLATE', 'BASE', 'HEAD', 'NOSCRIPT'])

/**
 * The view surface the adapter needs. `Document.defaultView` is typed loosely
 * and is absent in non-browser hosts, so every field is optional and checked
 * at the call site.
 */
interface DockView {
  getComputedStyle?: (element: Element) => CSSStyleDeclaration
  requestAnimationFrame?: (callback: () => void) => number
  cancelAnimationFrame?: (handle: number) => void
}

/** The frame element, or null when the shell is not recognisable. */
export function resolveFrame(doc: Document): HTMLElement | null {
  const overlay = doc.querySelector<HTMLElement>('[data-shell-overlay]')
  const frame = overlay?.parentElement ?? null
  if (frame === null) return null
  const template = frame.style?.gridTemplateColumns
  if (typeof template !== 'string' || template.trim() === '') return null
  // Exactly the shell's three tracks; our own may already be present.
  if (countOriginalTracks(template) !== 3) return null
  const view = viewOf(doc)
  const columns = inFlowColumns(frame, view)
  if (columns.length !== 3) return null
  // Explicit in-flow column order: when the conversation is mounted it must be
  // the middle column, so the dock can be inserted between the two.
  const centre = resolveCentreColumn(frame)
  if (centre !== null && columns[1] !== centre) return null
  return frame
}

/**
 * The centre column: the frame's direct child that hosts the conversation.
 * @returns the column element, or null when the conversation is not mounted.
 */
export function resolveCentreColumn(frame: HTMLElement): HTMLElement | null {
  for (const selector of CONTENT_SELECTORS) {
    const content = frame.querySelector<HTMLElement>(selector)
    if (content === null) continue
    let node: HTMLElement | null = content
    // Walk up to the frame's own child: that is the grid item beside us.
    while (node !== null && node.parentElement !== frame) node = node.parentElement
    if (node !== null && node !== frame) return node
  }
  return null
}

/** The `defaultView` of a document, with the fields this adapter uses. */
function viewOf(doc: Document): DockView {
  return (doc.defaultView ?? globalThis) as unknown as DockView
}

/**
 * Whether a frame child occupies an auto-placed column. Everything that does
 * not generate an in-flow grid item is skipped: hidden and `display:contents`
 * boxes, absolutely/fixed positioned overlays and drag handles, explicitly
 * placed rows (the shell's bottom row spans `1 / -1`), non-visual tags, and
 * our own host/column.
 *
 * When computed style is unavailable the item is treated as a column, which
 * makes recognition *fail* rather than guess — the safe direction.
 */
function isInFlowAutoItem(element: HTMLElement, view: DockView): boolean {
  if (element.hasAttribute(HOST_ATTR) || element.hasAttribute(DOCK_ATTR)) return false
  if (element.hidden === true) return false
  const tag = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : ''
  if (NON_BOX_TAGS.has(tag)) return false
  const read = view.getComputedStyle
  if (typeof read !== 'function') return true
  const style = read.call(view, element)
  if (style.display === 'none' || style.display === 'contents') return false
  if (style.position === 'absolute' || style.position === 'fixed') return false
  if (style.gridColumnStart !== 'auto' || style.gridColumnEnd !== 'auto') return false
  return true
}

/** The frame's children that auto-place as columns, in DOM order. */
function inFlowColumns(frame: HTMLElement, view: DockView): HTMLElement[] {
  const columns: HTMLElement[] = []
  for (const child of Array.from(frame.children)) {
    const element = child as HTMLElement
    if (isInFlowAutoItem(element, view)) columns.push(element)
  }
  return columns
}

/**
 * Index of the track the centre column auto-places into: the number of
 * in-flow, auto-column siblings before it (ours excluded, so an
 * already-placed dock does not shift its own insertion point).
 */
function centreTrackIndex(frame: HTMLElement, centre: HTMLElement, host: HTMLElement, view: DockView): number {
  let index = 0
  for (const child of Array.from(frame.children)) {
    if (child === centre) return index
    if (child === host) continue
    if (isInFlowAutoItem(child as HTMLElement, view)) index += 1
  }
  return -1
}

/** Insert (or re-insert after an app rewrite) our track before the centre's. */
function extendTemplate(frame: HTMLElement, index: number): void {
  const current = frame.style.gridTemplateColumns
  const tokens = splitTrackTokens(typeof current === 'string' ? current : '')
  if (tokens.length === 0) return
  const cleaned = tokens.filter(track => !isDockTrack(track))
  cleaned.splice(Math.min(index, cleaned.length), 0, EFFECTIVE_TRACK)
  const next = cleaned.join(' ')
  if (next !== current) frame.style.gridTemplateColumns = next
}

/** Remove our track, restoring the template the app wrote. */
function restoreTemplate(frame: HTMLElement): void {
  const current = frame.style.gridTemplateColumns
  if (typeof current !== 'string' || !hasDockTrack(current)) return
  const cleaned = splitTrackTokens(current).filter(track => !isDockTrack(track))
  frame.style.gridTemplateColumns = cleaned.join(' ')
}

/** Measured frame width in px, or 0 when it cannot be measured. */
function frameWidth(frame: HTMLElement): number {
  const rect = typeof frame.getBoundingClientRect === 'function' ? frame.getBoundingClientRect() : null
  const measured = rect?.width ?? 0
  if (Number.isFinite(measured) && measured > 0) return measured
  const client = frame.clientWidth
  return Number.isFinite(client) && client > 0 ? client : 0
}

/** The dock width the client half asked for, from CSS or the default. */
function desiredDockWidth(frame: HTMLElement, view: DockView): number {
  const fromComputed = (): number | null => {
    const read = view.getComputedStyle
    if (typeof read !== 'function') return null
    return parseDockTrackValue(read.call(view, frame).getPropertyValue(DOCK_TRACK_VAR))
  }
  return parseDockTrackValue(frame.style.getPropertyValue(DOCK_TRACK_VAR))
    ?? fromComputed()
    ?? DOCK_FALLBACK_PX
}

/** Options for {@link attachDock}. */
export interface AttachDockOptions {
  /** Document to operate on; defaults to the ambient one. */
  document?: Document
  /** Called once per distinct failure reason, for a single diagnostic line. */
  onWarn?: (reason: string) => void
}

/** A live attachment. */
export interface DockAttachment {
  /** Remove the dock and restore the original template. Idempotent. */
  dispose(): void
  /** Whether the dock is currently placed in the shell. */
  isAttached(): boolean
}

/**
 * Place `host` as a frame track before the centre column, and keep it there
 * across the app's own template rewrites and shell re-mounts.
 *
 * @param host - the dock element to place. Ownership stays with the caller.
 * @param options - document and diagnostics.
 * @returns the attachment, or null when the shell is not a recognisable grid —
 *          in which case nothing is inserted, no style is touched, and the
 *          fullscreen board remains available.
 */
export function attachDock(host: HTMLElement, options: AttachDockOptions = {}): DockAttachment | null {
  const doc = options.document ?? host.ownerDocument ?? globalThis.document
  if (doc === undefined || doc === null) return null

  const warned = new Set<string>()
  const warn = (reason: string): void => {
    if (warned.has(reason)) return
    warned.add(reason)
    options.onWarn?.(reason)
  }

  // A shell that is not a recognisable grid is a hard decline; a recognisable
  // one whose conversation has not mounted yet is not — the observer retries.
  if (resolveFrame(doc) === null) {
    warn('dock-seat-unresolved')
    return null
  }

  const view = viewOf(doc)
  let observer: MutationObserver | null = null
  let resizeObserver: ResizeObserver | null = null
  let observedFrame: HTMLElement | null = null
  let disposed = false
  let raf: number | null = null
  let attached = false
  /** The frame whose template currently carries our track. */
  let injectedFrame: HTMLElement | null = null
  /** The centre column our host currently precedes. */
  let placedCentre: HTMLElement | null = null
  let lastTemplate = ''
  let lastWidth = -1

  const cancelRaf = (): void => {
    if (raf === null) return
    const cancel = view.cancelAnimationFrame
    if (typeof cancel === 'function') cancel.call(view, raf)
    raf = null
  }

  /** Take our track back out of the frame we actually touched. */
  const restoreFrame = (frame: HTMLElement | null): void => {
    if (frame === null) return
    restoreTemplate(frame)
    frame.style.removeProperty(EFFECTIVE_TRACK_VAR)
  }

  /** Drop our track and unseat the host; the observer will retry. */
  const unseat = (frame: HTMLElement | null): void => {
    restoreFrame(frame)
    injectedFrame = null
    placedCentre = null
    attached = false
    if (host.parentElement !== null) host.remove()
  }

  /** Keep the resize hook pointed at the current frame. */
  const watchResize = (frame: HTMLElement): void => {
    if (typeof ResizeObserver !== 'function') return
    if (resizeObserver === null) {
      resizeObserver = new ResizeObserver(() => { if (!disposed) schedule() })
    }
    if (observedFrame !== null && observedFrame !== frame) resizeObserver.unobserve(observedFrame)
    if (observedFrame !== frame) resizeObserver.observe(frame)
    observedFrame = frame
  }

  const place = (): boolean => {
    const frame = resolveFrame(doc)
    if (frame === null) {
      unseat(injectedFrame)
      warn('dock-seat-unresolved')
      return false
    }
    // A re-mounted shell is a different element: undo the write on the frame
    // we actually touched before moving to the new one.
    if (injectedFrame !== null && injectedFrame !== frame) restoreFrame(injectedFrame)
    const columns = inFlowColumns(frame, view)
    const centre = resolveCentreColumn(frame)
    if (centre === null || columns.length !== 3 || columns[1] !== centre) {
      // The conversation is not mounted (or is not the middle column): take
      // our track out and wait. Nothing is ever reparented.
      unseat(frame)
      return false
    }
    // Responsive budget: never push the conversation below the width the
    // shell itself protects, and never keep a track the frame cannot afford.
    const native = resolveNativeColumns(frame.style.gridTemplateColumns)
    const fit = fitDockTrack({
      frameWidth: frameWidth(frame),
      sidebar: native === null ? null : native.sidebar,
      rightbar: native === null ? null : native.rightbar,
      desired: desiredDockWidth(frame, view),
    })
    if (fit.mode === 'declined') {
      unseat(frame)
      lastTemplate = typeof frame.style.gridTemplateColumns === 'string' ? frame.style.gridTemplateColumns : ''
      lastWidth = frameWidth(frame)
      return false
    }
    host.setAttribute('data-dock-fit', fit.mode)
    if (fit.mode === 'unknown' || fit.mode === 'full') frame.style.removeProperty(EFFECTIVE_TRACK_VAR)
    else frame.style.setProperty(EFFECTIVE_TRACK_VAR, `${fit.width}px`)
    const index = centreTrackIndex(frame, centre, host, view)
    if (index < 0) {
      attached = false
      return false
    }
    // Insert only our own host before the centre; the centre itself is left
    // exactly where React put it (never reparent, never restyle).
    if (host.parentElement !== frame || host.nextElementSibling !== centre) frame.insertBefore(host, centre)
    extendTemplate(frame, index)
    injectedFrame = frame
    placedCentre = centre
    attached = true
    lastTemplate = typeof frame.style.gridTemplateColumns === 'string' ? frame.style.gridTemplateColumns : ''
    lastWidth = frameWidth(frame)
    watchResize(frame)
    return true
  }

  const schedule = (): void => {
    if (disposed || raf !== null) return
    if (typeof view.requestAnimationFrame !== 'function') {
      place()
      return
    }
    raf = view.requestAnimationFrame(() => {
      raf = null
      if (!disposed) place()
    })
  }

  place()

  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver((records) => {
      if (disposed) return
      const frame = doc.querySelector<HTMLElement>('[data-shell-overlay]')?.parentElement ?? null
      if (frame === null) return
      const template = typeof frame.style.gridTemplateColumns === 'string' ? frame.style.gridTemplateColumns : ''
      const seated = frame === injectedFrame
        && host.parentElement === frame
        && placedCentre !== null
        && host.nextElementSibling === placedCentre
      // Cheap predicate: our marker is gone or the host was unseated. Correct
      // in this same task — a rAF delay shows one frame at the wrong width.
      if (!seated || !hasDockTrack(template)) {
        cancelRaf()
        place()
        return
      }
      // Mutations inside our own subtree (React rendering the dock) can never
      // change the shell's structure; ignore them. Only a child change can
      // alter the set of in-flow columns, so a style-only rewrite (the app
      // dragging a column) stays on the cheap path below.
      const childChanged = records.some(record => record.type === 'childList' && !host.contains(record.target))
      if (childChanged && resolveFrame(doc) === null) {
        cancelRaf()
        place()
        return
      }
      // Structure is settled: only a re-solve of the budget is due.
      const requestedChanged = records.some(record => record.type === 'attributes' && record.target === doc.documentElement)
      if (requestedChanged || template !== lastTemplate || frameWidth(frame) !== lastWidth) schedule()
    })
    observer.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })
    // Requested width lives on html, outside body's subtree.
    observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['style'] })
  }

  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      observer?.disconnect()
      observer = null
      cancelRaf()
      resizeObserver?.disconnect()
      resizeObserver = null
      observedFrame = null
      // Restore the frame we actually wrote to, plus any frame still holding
      // the host after a re-mount we have not re-solved yet.
      restoreFrame(injectedFrame)
      const parent = host.parentElement
      if (parent !== null && parent !== injectedFrame) restoreFrame(parent)
      injectedFrame = null
      placedCentre = null
      attached = false
      host.remove()
    },
    isAttached(): boolean {
      if (disposed || !attached || !host.isConnected) return false
      const frame = resolveFrame(doc)
      if (frame === null || host.parentElement !== frame) return false
      return hasDockTrack(typeof frame.style.gridTemplateColumns === 'string' ? frame.style.gridTemplateColumns : '')
    },
  }
}
