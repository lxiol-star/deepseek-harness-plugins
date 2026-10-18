// @vitest-environment jsdom
/**
 * Focus containment and return-focus decisions for the fullscreen board.
 *
 * These pin the parts that are easy to get subtly wrong: the Tab loop at both
 * edges, yielding to a newer dialog, exact `inert` restoration, and the
 * opener -> marked toggle -> labelled button fallback chain.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BOARD_TOGGLE_SELECTOR, escapeAttributeValue, focusableIn, inertBackground, isInsideMenu,
  isTopmostModal, modalLayers, resolveRestoreTarget, trapTabTarget,
} from '../src/client/modal-focus.ts'

/** A `<button>` appended to the given parent. */
function button(label: string, parent: HTMLElement = document.body): HTMLButtonElement {
  const element = document.createElement('button')
  element.textContent = label
  parent.append(element)
  return element
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('trapTabTarget', () => {
  it('returns null when the board has no controls to trap', () => {
    expect(trapTabTarget([], null, false)).toBeNull()
    expect(trapTabTarget([], null, true)).toBeNull()
  })

  it('pulls focus that escaped the board back to an edge', () => {
    const first = button('first')
    const last = button('last')
    const outside = document.createElement('button')
    expect(trapTabTarget([first, last], outside, false)).toBe(first)
    expect(trapTabTarget([first, last], outside, true)).toBe(last)
    // The panel itself is focused on open: forward goes to the first control.
    expect(trapTabTarget([first, last], null, false)).toBe(first)
    expect(trapTabTarget([first, last], null, true)).toBe(last)
  })

  it('wraps from the last control to the first and back', () => {
    const first = button('first')
    const middle = button('middle')
    const last = button('last')
    const items = [first, middle, last]
    expect(trapTabTarget(items, last, false)).toBe(first)
    expect(trapTabTarget(items, first, true)).toBe(last)
  })

  it('leaves interior moves to the browser default', () => {
    const first = button('first')
    const middle = button('middle')
    const last = button('last')
    const items = [first, middle, last]
    expect(trapTabTarget(items, middle, false)).toBeNull()
    expect(trapTabTarget(items, middle, true)).toBeNull()
  })

  it('keeps a lone control cycling onto itself', () => {
    const only = button('only')
    expect(trapTabTarget([only], only, false)).toBe(only)
    expect(trapTabTarget([only], only, true)).toBe(only)
  })
})

describe('isTopmostModal', () => {
  it('treats a board with no foreground layers as topmost', () => {
    const panel = document.createElement('div')
    expect(isTopmostModal(panel, [])).toBe(true)
  })

  it('treats the board itself, and layers inside it, as topmost', () => {
    const panel = document.createElement('div')
    const menu = document.createElement('div')
    panel.append(menu)
    expect(isTopmostModal(panel, [panel])).toBe(true)
    expect(isTopmostModal(panel, [panel, menu])).toBe(true)
  })

  it('yields to a newer dialog or menu above the board', () => {
    const panel = document.createElement('div')
    document.body.append(panel)
    const dialog = document.createElement('div')
    document.body.append(dialog)
    expect(isTopmostModal(panel, [panel, dialog])).toBe(false)
  })

  it('is not topmost without a panel', () => {
    expect(isTopmostModal(null, [])).toBe(false)
  })
})

describe('modalLayers', () => {
  it('lists dialogs and menus in document order', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(dialog, menu)
    expect(modalLayers(document)).toEqual([dialog, menu])
  })

  it('ignores a non-modal dialog and unrelated overlays', () => {
    const plain = document.createElement('div')
    plain.setAttribute('role', 'dialog')
    document.body.append(plain)
    expect(modalLayers(document)).toEqual([])
  })
})

describe('isInsideMenu', () => {
  it('recognises focus held by a portaled menu', () => {
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const item = button('item', menu)
    document.body.append(menu)
    expect(isInsideMenu(item)).toBe(true)
    expect(isInsideMenu(menu)).toBe(true)
    expect(isInsideMenu(document.body)).toBe(false)
    expect(isInsideMenu(null)).toBe(false)
  })
})

describe('focusableIn', () => {
  it('collects enabled controls in document order and skips the unreachable', () => {
    const panel = document.createElement('div')
    const enabled = button('enabled', panel)
    const disabled = button('disabled', panel)
    disabled.disabled = true
    const negative = button('negative', panel)
    negative.tabIndex = -1
    const hidden = button('hidden', panel)
    hidden.hidden = true
    const input = document.createElement('input')
    panel.append(input)
    const link = document.createElement('a')
    link.href = '#somewhere'
    link.textContent = 'link'
    panel.append(link)
    const inertHost = document.createElement('div')
    inertHost.setAttribute('inert', '')
    panel.append(inertHost)
    button('inert child', inertHost)
    document.body.append(panel)

    expect(focusableIn(panel)).toEqual([enabled, input, link])
  })
})

describe('inertBackground', () => {
  it('inerts every body sibling of the board and restores the exact prior state', () => {
    const root = document.createElement('div')
    root.id = 'root'
    const alreadyInert = document.createElement('div')
    alreadyInert.setAttribute('inert', 'true')
    const panel = document.createElement('div')
    document.body.append(root, alreadyInert, panel)

    const release = inertBackground(document, panel)

    expect(root.hasAttribute('inert')).toBe(true)
    expect(alreadyInert.getAttribute('inert')).toBe('')
    expect(panel.hasAttribute('inert')).toBe(false)

    release()

    expect(root.hasAttribute('inert')).toBe(false)
    // A caller's own inert value comes back byte for byte.
    expect(alreadyInert.getAttribute('inert')).toBe('true')
  })

  it('leaves a non-child ancestor of the board interactive', () => {
    const host = document.createElement('div')
    const panel = document.createElement('div')
    host.append(panel)
    const sibling = document.createElement('div')
    document.body.append(host, sibling)

    const release = inertBackground(document, panel)
    expect(host.hasAttribute('inert')).toBe(false)
    expect(sibling.hasAttribute('inert')).toBe(true)
    release()
  })

  it('is a no-op without a board element', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const release = inertBackground(document, null)
    expect(root.hasAttribute('inert')).toBe(false)
    release()
    expect(root.hasAttribute('inert')).toBe(false)
  })
})

describe('resolveRestoreTarget', () => {
  it('prefers a still-connected opener over every fallback', () => {
    const marked = button('toggle')
    marked.setAttribute('data-session-board-toggle', '')
    const opener = button('opener')
    expect(resolveRestoreTarget({ saved: opener, doc: document, labels: ['Open board'] })).toBe(opener)
    expect(marked.isConnected).toBe(true)
  })

  it('falls back to the marked toggle when the opener is gone', () => {
    const marked = button('toggle')
    marked.setAttribute('data-session-board-toggle', '')
    const opener = button('opener')
    opener.remove()
    expect(resolveRestoreTarget({ saved: opener, doc: document, labels: [] })).toBe(marked)
    expect(BOARD_TOGGLE_SELECTOR).toBe('[data-session-board-toggle]')
  })

  it('falls back to a labelled toggle button, then to nothing', () => {
    const closeToggle = button('close')
    closeToggle.setAttribute('aria-label', 'Close board')
    expect(resolveRestoreTarget({ doc: document, labels: ['Open board', 'Close board'] })).toBe(closeToggle)
    closeToggle.remove()
    expect(resolveRestoreTarget({ doc: document, labels: ['Open board', 'Close board'] })).toBeNull()
  })

  it('quotes label values that contain selector metacharacters', () => {
    const quoted = button('quoted')
    quoted.setAttribute('aria-label', 'Close "board" \\ now')
    expect(escapeAttributeValue('Close "board" \\ now')).toBe('Close \\"board\\" \\\\ now')
    expect(resolveRestoreTarget({ doc: document, labels: ['Close "board" \\ now'] })).toBe(quoted)
  })

  it('ignores a null saved opener', () => {
    const marked = button('toggle')
    marked.setAttribute('data-session-board-toggle', '')
    expect(resolveRestoreTarget({ saved: null, doc: document, labels: [] })).toBe(marked)
  })
})
