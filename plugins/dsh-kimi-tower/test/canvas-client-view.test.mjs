/**
 * The canvas's view-side machinery that has no DOM of its own: viewport maths,
 * focus decisions and the polling rhythm.
 *
 * The overlay wires these into React and the real document; what is pinned
 * here is the arithmetic and the timing, which is where the mistakes hide.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CANVAS_ENTRY_ATTRIBUTE, escapeAttributeValue, focusableIn, inertBackground, isInsideMenu, isTopmostModal,
  modalLayers, resolveRestoreTarget, trapTabTarget,
} from '../src/client/modalFocus.js'
import { CANVAS_POLL_INTERVAL, createPoller } from '../src/client/towerPoll.js'
import {
  FIT_MAX_ZOOM, ZOOM_MAX, ZOOM_MIN, centreOn, clampZoom, fitView, minimapProjection, panBy, toWorld, visibleRect,
  zoomAt, zoomTo,
} from '../src/canvas/viewport.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// --------------------------------------------------------------- viewport ---

test('fitView centres the diagram and never zooms past the limits', () => {
  const bounds = { x: -900, y: -300, w: 1800, h: 600 }
  const view = fitView(bounds, 1440, 848)
  // Width-bound: (1440 - 96) / 1800 = 0.7467; height allows 660 / 600 = 1.1.
  assert.ok(Math.abs(view.zoom - 1344 / 1800) < 1e-9)
  // The diagram centre lands on the centre of the room left by the toolbars
  // (the top and bottom bands differ, so that is not the stage centre).
  const centre = toWorld(view, 1440 / 2, 88 + 660 / 2)
  assert.ok(Math.abs(centre.x) < 1e-6 && Math.abs(centre.y) < 1e-6)

  // A tiny diagram is not blown up without limit.
  const small = fitView({ x: -156, y: -75, w: 312, h: 150 }, 1440, 848)
  assert.equal(small.zoom, FIT_MAX_ZOOM)

  // A huge one is not shrunk without limit either.
  const huge = fitView({ x: 0, y: 0, w: 1e6, h: 1e6 }, 800, 600)
  assert.equal(huge.zoom, ZOOM_MIN)

  // Nothing to fit still yields a usable view.
  for (const bad of [undefined, null, {}, { w: 0, h: 0 }]) {
    const fallback = fitView(bad, 800, 600)
    assert.ok(Number.isFinite(fallback.x) && Number.isFinite(fallback.y) && fallback.zoom >= ZOOM_MIN)
  }
})

test('the fitted diagram clears the toolbars on every edge', () => {
  const width = 1200
  const height = 700
  const padding = { top: 80, right: 40, bottom: 96, left: 40 }
  const bounds = { x: -1000, y: -900, w: 2000, h: 1800 }
  const view = fitView(bounds, width, height, padding)
  const left = bounds.x * view.zoom + view.x
  const right = (bounds.x + bounds.w) * view.zoom + view.x
  const top = bounds.y * view.zoom + view.y
  const bottom = (bounds.y + bounds.h) * view.zoom + view.y
  assert.ok(left >= padding.left && right <= width - padding.right, 'horizontal margins')
  assert.ok(top >= padding.top && bottom <= height - padding.bottom, 'vertical margins')
  // Height-bound here, so the diagram is centred horizontally with room to spare.
  assert.ok(Math.abs((left + right) / 2 - width / 2) < 1e-6)
  assert.ok(Math.abs(view.zoom - (height - 80 - 96) / 1800) < 1e-9)
})

test('zoomAt keeps the point under the cursor still on screen', () => {
  const view = { x: 120, y: -40, zoom: 0.5 }
  const anchor = { x: 410, y: 265 }
  const before = toWorld(view, anchor.x, anchor.y)
  for (const factor of [1.2, 0.5, 3, 0.1]) {
    const next = zoomAt(view, factor, anchor.x, anchor.y)
    assert.equal(next.zoom, clampZoom(view.zoom * factor))
    const after = toWorld(next, anchor.x, anchor.y)
    assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9)
  }
})

test('the zoom is clamped and a no-op zoom returns the same view object', () => {
  const view = { x: 10, y: 20, zoom: ZOOM_MAX }
  assert.equal(zoomAt(view, 2, 0, 0), view, 'already at the maximum')
  const low = { x: 10, y: 20, zoom: ZOOM_MIN }
  assert.equal(zoomAt(low, 0.5, 0, 0), low, 'already at the minimum')
  assert.equal(clampZoom(99), ZOOM_MAX)
  assert.equal(clampZoom(0.001), ZOOM_MIN)
  assert.equal(clampZoom(NaN), 1)
  assert.equal(zoomTo(view, 1, 5, 5).zoom, 1)
  assert.equal(zoomTo(view, 99, 5, 5).zoom, ZOOM_MAX)
})

test('panBy, centreOn and visibleRect are each other inverses', () => {
  const view = { x: 50, y: -25, zoom: 0.8 }
  const moved = panBy(view, 10, -4)
  assert.deepEqual(moved, { x: 60, y: -29, zoom: 0.8 })
  const centred = centreOn(view, 100, 200, 1000, 500)
  const back = toWorld(centred, 500, 250)
  assert.ok(Math.abs(back.x - 100) < 1e-9 && Math.abs(back.y - 200) < 1e-9)
  const rect = visibleRect(centred, 1000, 500)
  assert.ok(Math.abs(rect.x + rect.w / 2 - 100) < 1e-9 && Math.abs(rect.y + rect.h / 2 - 200) < 1e-9)
  assert.equal(rect.w, 1000 / 0.8)
  // A missing view behaves as the identity view.
  assert.deepEqual(toWorld(null, 30, 40), { x: 30, y: 40 })
  assert.deepEqual(visibleRect(undefined, 200, 100), { x: 0, y: 0, w: 200, h: 100 })
})

test('the minimap projection fits the diagram and maps both ways', () => {
  const bounds = { x: -976, y: -330, w: 1180, h: 602 }
  const projection = minimapProjection(bounds, 184, 116, 6)
  assert.ok(Math.abs(projection.scale - Math.min(172 / 1180, 104 / 602)) < 1e-12)
  const corner = projection.toMap(bounds.x, bounds.y)
  const far = projection.toMap(bounds.x + bounds.w, bounds.y + bounds.h)
  assert.ok(corner.x >= 6 - 1e-9 && corner.y >= 6 - 1e-9 && far.x <= 178 + 1e-9 && far.y <= 110 + 1e-9)
  const round = projection.toWorld(corner.x, corner.y)
  assert.ok(Math.abs(round.x - bounds.x) < 1e-9 && Math.abs(round.y - bounds.y) < 1e-9)
  assert.ok(Number.isFinite(minimapProjection(undefined, 184, 116).scale))
})

// ------------------------------------------------------------------ focus ---

/** A fake element: just enough of the Element API for the focus helpers. */
function element(extra = {}) {
  const attributes = new Map()
  const node = {
    isConnected: true,
    tabIndex: 0,
    parent: null,
    getAttribute: name => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name),
    closest: () => null,
    /** Whether `other` hangs below this node (one level is all the tests need). */
    contains(other) {
      return other !== null && other !== undefined && other.parent === this
    },
    ...extra,
  }
  return node
}

test('Tab loops inside the canvas and leaves the middle to the browser', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.equal(trapTabTarget(items, null, false), items[0], 'focus outside is pulled to the first')
  assert.equal(trapTabTarget(items, null, true), items[2], '…or the last, going backwards')
  assert.equal(trapTabTarget(items, items[2], false), items[0], 'forward off the end wraps')
  assert.equal(trapTabTarget(items, items[0], true), items[2], 'backward off the start wraps')
  assert.equal(trapTabTarget(items, items[0], false), null)
  assert.equal(trapTabTarget(items, items[1], true), null)
  assert.equal(trapTabTarget([], items[0], false), null, 'nothing to focus')
})

test('the canvas owns Escape only while it is the last foreground layer', () => {
  const panel = element()
  const nested = element({ parent: panel })
  const newer = element()
  assert.equal(isTopmostModal(panel, []), true)
  assert.equal(isTopmostModal(panel, [panel]), true)
  assert.equal(isTopmostModal(panel, [{}, panel, nested]), true, 'a menu inside the canvas is still the canvas')
  assert.equal(isTopmostModal(panel, [panel, newer]), false, 'a newer dialog takes over')
  assert.equal(isTopmostModal(null, []), false)
  const menu = { closest: selector => (selector === '[role="menu"]' ? {} : null) }
  assert.equal(isInsideMenu(menu), true)
  assert.equal(isInsideMenu(element()), false)
  assert.equal(isInsideMenu(null), false)
})

test('modal layers skip what is hidden or inert', () => {
  const visible = element()
  const hidden = element({ closest: selector => (selector.includes('[hidden]') ? {} : null) })
  const doc = { querySelectorAll: selector => (selector.includes('role="dialog"') ? [visible, hidden, element()] : []) }
  assert.equal(modalLayers(doc).length, 2)
})

test('focusableIn drops the disabled, the hidden and the negative tabindex', () => {
  const keep = element()
  const programmatic = element({ tabIndex: -1 })
  const inInert = element({ closest: () => ({}) })
  const root = { querySelectorAll: () => [keep, programmatic, inInert, element({ tabIndex: 1 })] }
  assert.equal(focusableIn(root).length, 2)
})

test('inertBackground makes every other body child inert and puts each back exactly', () => {
  const call = node => node.calls.join(',')
  const make = name => {
    const node = element()
    node.calls = []
    const original = node.setAttribute
    node.setAttribute = (attribute, value) => { node.calls.push(`set:${attribute}=${value}`); original(attribute, value) }
    node.removeAttribute = attribute => { node.calls.push(`remove:${attribute}`) }
    node.name = name
    return node
  }
  const page = make('page')
  const already = make('already')
  already.setAttribute('inert', '')
  already.calls.length = 0
  const portalHost = make('portal-host')
  const panel = element({ parent: portalHost })
  const doc = { body: { children: [page, already, portalHost] } }

  const release = inertBackground(doc, panel)
  assert.equal(call(page), 'set:inert=')
  assert.equal(call(already), 'set:inert=')
  assert.equal(call(portalHost), '', 'the canvas and its portal host stay interactive')
  release()
  assert.equal(call(page), 'set:inert=,remove:inert', 'a node that was not inert is not left inert')
  assert.equal(call(already), 'set:inert=,set:inert=', 'a node that was already inert stays inert')
  release()
  assert.equal(call(page), 'set:inert=,remove:inert', 'releasing twice changes nothing')
  // A missing panel or body is a no-op.
  assert.doesNotThrow(() => inertBackground(doc, null)())
  assert.doesNotThrow(() => inertBackground({ body: null }, panel)())
})

test('focus returns to the opener, else to a marked canvas entry, else to a named button', () => {
  const opener = element()
  const marked = element()
  const labelled = element()
  const table = new Map([
    [`[${CANVAS_ENTRY_ATTRIBUTE}]`, marked],
    ['button[aria-label="打开画布"]', labelled],
  ])
  const doc = { querySelector: selector => table.get(selector) ?? null }
  assert.equal(resolveRestoreTarget({ saved: opener, doc }), opener)
  assert.equal(resolveRestoreTarget({ saved: element({ isConnected: false }), doc }), marked, 'an unmounted opener falls back')
  assert.equal(resolveRestoreTarget({ saved: null, doc }), marked)
  // No marked entry (the dock is gone): the first labelled dock control wins.
  const bare = { querySelector: selector => (selector === 'button[aria-label="打开画布"]' ? labelled : null) }
  assert.equal(resolveRestoreTarget({ saved: null, doc: bare, labels: ['展开', '打开画布'] }), labelled)
  assert.equal(resolveRestoreTarget({ saved: null, doc: bare, labels: [] }), null)
  assert.equal(resolveRestoreTarget({ saved: null, doc: { querySelector: () => null }, labels: ['打开画布'] }), null)
  assert.equal(resolveRestoreTarget({ doc }), marked, 'no saved element at all')
  assert.equal(escapeAttributeValue('say "hi" \\'), 'say \\"hi\\" \\\\')
})

// ----------------------------------------------------------------- poller ---

test('the poller fetches at once, then every interval', async () => {
  let calls = 0
  const values = []
  const poller = createPoller({ load: async () => { calls += 1; return calls }, interval: 8, onSuccess: value => values.push(value) })
  poller.start()
  assert.equal(calls, 1, 'the first request is immediate')
  assert.equal(poller.inFlight(), true)
  await sleep(45)
  poller.stop()
  assert.ok(calls >= 3 && calls <= 7, `polled at the interval, got ${calls} calls`)
  assert.deepEqual(values, Array.from({ length: calls }, (_, index) => index + 1))
  assert.equal(poller.paused(), false)
  const still = calls
  await sleep(30)
  assert.equal(calls, still, 'no request after stop')
})

test('the default rhythm is the one the tower asked for', () => {
  assert.equal(CANVAS_POLL_INTERVAL, 3000)
})

test('a pause stops the requests and cancels the one in flight; resuming fetches at once', async () => {
  let calls = 0
  let signal
  const failures = []
  const poller = createPoller({
    load: async current => {
      calls += 1
      signal = current
      return calls
    },
    interval: 6,
    onFailure: (...args) => failures.push(args),
  })
  poller.start()
  await sleep(20)
  const before = calls
  poller.pause('hidden')
  assert.equal(poller.paused(), true)
  await sleep(30)
  assert.equal(calls, before, 'nothing while paused')
  poller.resume('hidden')
  assert.equal(calls, before + 1, 'resuming fetches at once, not after an interval')
  await sleep(20)
  poller.pause('gesture')
  const during = calls
  await sleep(25)
  assert.equal(calls, during)
  // Two reasons at once: lifting one is not enough.
  poller.pause('hidden')
  poller.resume('gesture')
  await sleep(20)
  assert.equal(calls, during, 'the other reason still pauses')
  poller.resume('hidden')
  assert.equal(calls, during + 1)
  // Resuming something that never paused does nothing.
  const settled = calls
  await sleep(12)
  const settled2 = calls
  poller.resume('never-paused')
  assert.equal(calls, settled2)
  poller.stop()
  assert.deepEqual(failures, [], 'a cancelled request is not a failure')
  assert.ok(settled >= during + 1)
})

test('a pause aborts the request that is in flight and its result is dropped', async () => {
  let calls = 0
  const delivered = []
  let firstSignal
  const poller = createPoller({
    load: signal => new Promise((resolve, reject) => {
      calls += 1
      if (calls === 1) {
        firstSignal = signal
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        return
      }
      setTimeout(() => resolve(calls), 2)
    }),
    interval: 6,
    onSuccess: value => delivered.push(value),
  })
  poller.start()
  assert.equal(calls, 1)
  poller.pause('gesture')
  assert.equal(firstSignal.aborted, true, 'the in-flight request was cancelled')
  await sleep(5)
  assert.equal(poller.inFlight(), false)
  assert.equal(delivered.length, 0)
  poller.resume('gesture')
  await sleep(5)
  assert.deepEqual(delivered, [2], 'the catch-up request is delivered')
  poller.stop()
})

test('failures back off instead of retrying at full speed, and a success resets the rhythm', async () => {
  let attempts = 0
  const failures = []
  let failing = true
  const poller = createPoller({
    load: async () => {
      attempts += 1
      if (failing) throw new Error(`status ${attempts}`)
      return attempts
    },
    interval: 10,
    maxBackoff: 80,
    onFailure: (error, count) => failures.push(count),
  })
  poller.start()
  await sleep(150)
  // Without backoff this would be about fifteen attempts; 10 + 20 + 40 + 80 … keeps it far lower.
  assert.ok(attempts >= 3 && attempts <= 7, `backed off, got ${attempts} attempts`)
  assert.deepEqual(failures, Array.from({ length: failures.length }, (_, index) => index + 1), 'consecutive failures are counted')
  failing = false
  const recovered = attempts
  await sleep(12)
  assert.ok(attempts >= recovered + 1, 'it kept trying')
  await sleep(45)
  const afterRecovery = attempts - recovered - 1
  assert.ok(afterRecovery >= 2, 'back to the plain interval after a success')
  poller.stop()
})

test('stopping ignores a response that arrives late', async () => {
  const delivered = []
  let release
  const poller = createPoller({
    load: () => new Promise(resolve => { release = resolve }),
    interval: 5,
    onSuccess: value => delivered.push(value),
  })
  poller.start()
  assert.equal(poller.inFlight(), true)
  poller.stop()
  assert.equal(poller.inFlight(), false)
  release('late')
  await sleep(10)
  assert.deepEqual(delivered, [], 'a late response is dropped')
  // Starting again works, and is a fresh immediate request.
  let again = 0
  const second = createPoller({ load: async () => { again += 1 }, interval: 50 })
  second.start()
  second.start()
  await sleep(5)
  assert.equal(again, 1, 'start is idempotent')
  second.stop()
})
