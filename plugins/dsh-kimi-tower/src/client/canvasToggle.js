/**
 * The canvas toggle in the session header: an icon button that opens and
 * closes the fullscreen canvas.
 *
 * It is the way into the canvas that does not depend on the dock, which hides
 * itself when the tower has nothing to show — so a tower that was just turned
 * on and has no mission yet can still be looked at.
 *
 * The button shows only while the tower mode is on for this session. It learns
 * that from the shared store, which the dock keeps current with the polling it
 * already does (see `./canvasStore.js`). It never polls on its own, except
 * once, after a short wait, when nothing has reported for this session at all
 * — the case of a shell without the dock slot.
 */
import { createElement as h, useCallback, useEffect, useSyncExternalStore } from 'react'
import { fetchTowerState } from './towerState.js'

/** How long to give the dock's own polling before asking the Host once. */
const PROBE_DELAY = 1500

/** The icon: the tower at the left, two missions at the right, wires between. */
const ICON = h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
  h('path', {
    d: 'M2.5 5.5h4v5h-4zM9.5 2h4v3.5h-4zM9.5 10.5h4v3.5h-4zM6.5 7l3-2.2M6.5 9l3 2.6',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }))

/**
 * The toggle.
 *
 * @param props - `{ sessionId, store, fetchState? }`. `sessionId` comes from
 *   the slot; `store` and an optional `fetchState` are injected.
 * @returns the button, or null while the tower is off for this session.
 */
export function CanvasToggle({ sessionId, store, fetchState = fetchTowerState }) {
  const towerOf = useCallback(() => store.towerOf(sessionId), [store, sessionId])
  const tower = useSyncExternalStore(store.subscribe, towerOf)
  const open = useSyncExternalStore(store.subscribe, store.isOpen)

  // Nothing has reported for this session: ask the Host once, well after the
  // dock's first poll would have reported, in case there is no dock.
  const known = tower !== null
  useEffect(() => {
    if (known || typeof sessionId !== 'string' || sessionId === '') return undefined
    const timer = setTimeout(() => {
      // The dock may have reported in the meantime.
      if (store.towerOf(sessionId) !== null) return
      fetchState(sessionId).then(
        snapshot => store.report(sessionId, snapshot),
        () => {},
      )
    }, PROBE_DELAY)
    return () => clearTimeout(timer)
  }, [known, sessionId, store, fetchState])

  if (tower === null || tower.active !== true) return null
  const label = open ? '关闭画布' : '打开画布'
  return h('button', {
    type: 'button',
    className: 'dkt-canvas-toggle',
    'data-testid': 'tower-canvas-toggle',
    'data-dkt-canvas-entry': open ? undefined : '',
    'aria-label': label,
    title: label,
    'aria-pressed': open ? 'true' : 'false',
    onClick: () => (open ? store.close() : store.open(sessionId)),
  }, ICON)
}
