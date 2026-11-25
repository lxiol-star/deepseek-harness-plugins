/**
 * dsh-kimi-tower browser half: the entry of the client bundle.
 *
 * Responsibilities, in order: install the stylesheets, register the dock above
 * the composer, register the canvas toggle in the session header, and register
 * the fullscreen canvas on the shell's overlay seat.
 *
 * The three are slot contributions of different scopes, so they share what
 * they must through a small store (`./canvasStore.js`) rather than props.
 * Everything here is read-only towards the tower: the only request is the poll
 * of `/tower/state`.
 *
 * Two of the three seats are lists that the shell keys by session, and it
 * passes each cell its `sessionId` as a standard prop (`conversation.input.dock`
 * already worked that way before the canvas; the header actions list documents
 * the same standard props). The overlay seat is not session-scoped, so the
 * canvas remembers the session it was opened for in the store.
 *
 * The bundle is built to `lib/client.js` as a single file wrapped in the
 * `window.__ModuleLoader__.load` envelope. Its `require` only ever asks for
 * the platform's baseline modules (`react`, `react-dom`).
 */
import { CanvasToggle } from './canvasToggle.js'
import { CSS as CANVAS_CSS, STYLE_ID as CANVAS_STYLE_ID } from './canvasCss.js'
import { CanvasOverlaySlot } from './canvasOverlay.js'
import { createCanvasStore } from './canvasStore.js'
import { TowerDock } from './dock.js'
import { CSS as DOCK_CSS, STYLE_ID as DOCK_STYLE_ID } from './dockCss.js'

/** Services the browser half needs from the shell. */
export const inject = ['slots', 'uiWorkspace']

/** Install one stylesheet, once per document. */
function ensureStyle(id, css) {
  if (document.getElementById(id) !== null) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = css
  document.head.appendChild(style)
}

/**
 * Activate the browser half.
 *
 * @param ctx - client root context.
 */
export function apply(ctx) {
  ensureStyle(DOCK_STYLE_ID, DOCK_CSS)
  ensureStyle(CANVAS_STYLE_ID, CANVAS_CSS)

  const store = createCanvasStore()
  const openSession = id => ctx.uiWorkspace.openSession(id)

  // The dock above the composer: the mission cards, and the first way into the canvas.
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'tower-progress',
    order: 30,
    inject: () => ({
      openSession,
      openCanvas: sessionId => store.open(sessionId),
      reportTower: (sessionId, snapshot) => store.report(sessionId, snapshot),
    }),
  }, TowerDock))

  // The canvas toggle in the session header: the way in that works with no
  // mission at all. It shows only while the tower mode is on for the session.
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'tower-canvas.toggle',
    order: 20,
    inject: () => ({ store }),
  }, CanvasToggle)), 'dsh-kimi-tower:canvas-toggle')

  // The fullscreen canvas, on the shell's additive overlay seat. The slot
  // component renders nothing while the canvas is closed.
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'tower-canvas.overlay',
    order: 50,
    inject: () => ({ store, openSession }),
  }, CanvasOverlaySlot)), 'dsh-kimi-tower:canvas-overlay')
}
