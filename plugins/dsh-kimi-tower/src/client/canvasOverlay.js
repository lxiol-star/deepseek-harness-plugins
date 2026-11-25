/**
 * The fullscreen tower canvas: a read-only picture of the whole fleet.
 *
 * Mounted through the `shell.overlay` slot (the shell's additive, frame-wide
 * seat) but rendered into `document.body`, like the fullscreen board of
 * `dsh-session-board`. The portal is deliberate: on macOS the Electron
 * window's drag region is composed from element geometry inside `#root`, so a
 * full-window surface living there would swallow the title-bar drag. A
 * body-level layer is subtracted wholesale instead.
 *
 * Accessibility is handled here rather than inherited from a host dialog: the
 * canvas is a page-like surface, so it owns focus on open, traps Tab inside
 * its own controls, makes the rest of the page inert, closes on Escape only
 * while it is the foreground layer, and restores the previously focused
 * control on close (`./modalFocus.js`).
 *
 * The header is also the window's drag surface (`data-window-drag`, plus a
 * passive gutter that clears the macOS traffic lights); its controls are
 * marked `no-drag`.
 *
 * Polling (./towerPoll.js): one request at once when the canvas opens, then
 * every three seconds; paused while the document is hidden and for the length
 * of a pan, a wheel zoom or a minimap drag; a failure backs off. A new
 * snapshot never moves the view: the diagram is fitted when the canvas opens
 * and when the user asks for it.
 */
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { CANVAS_DENSITIES, CANVAS_FILTERS, layoutCanvas } from '../canvas/layout.js'
import { CanvasPanel, TABS } from './canvasPanel.js'
import { CanvasStage } from './canvasStage.js'
import { focusableIn, inertBackground, isInsideMenu, isTopmostModal, modalLayers, resolveRestoreTarget, trapTabTarget } from './modalFocus.js'
import { describeError, fetchTowerDetail } from './towerState.js'
import { createPoller } from './towerPoll.js'

const FILTER_LABEL = Object.freeze({ all: '全部', open: '未完成', blocked: '被阻塞' })
const DENSITY_LABEL = Object.freeze({ summary: '摘要', detail: '详情' })

const ICON_CLOSE = h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
  h('path', { d: 'M4 4l8 8M12 4l-8 8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }))
const ICON_PANEL = h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
  h('path', { d: 'M2.5 3.5h11v9h-11zM9.5 3.5v9', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round' }))

/** The slot's component: the canvas while it is open, nothing otherwise. */
export function CanvasOverlaySlot({ store, openSession }) {
  const open = useSyncExternalStore(store.subscribe, store.isOpen)
  if (!open) return null
  return h(CanvasOverlay, { key: 'canvas', store, openSession })
}

/** A segmented control of the header toolbar. */
function Segmented({ label, options, value, onChange, name }) {
  return h('div', { className: 'dkc-seg', role: 'group', 'aria-label': label }, [
    h('span', { className: 'dkc-seg-label', key: 'label' }, label),
    ...options.map(option => h('button', {
      key: option.value,
      type: 'button',
      'aria-pressed': value === option.value ? 'true' : 'false',
      'data-testid': `canvas-${name}-${option.value}`,
      onClick: () => onChange(option.value),
    }, option.label)),
  ])
}

/** What the header says about the fleet in one line. */
function Tally({ graph }) {
  const stats = graph.stats
  const parts = [
    ['running', '运行中', stats.running],
    ['blocked', '被阻塞', stats.blocked],
    ['unread', '未读', stats.unread],
  ].filter(part => part[2] > 0)
  if (parts.length === 0) return h('span', { className: 'dkc-count' }, h('b', {}, String(stats.missions)), ' 个任务')
  return h('span', { className: 'dkc-count' }, parts.map(([tone, label, value], index) => h('span', { key: tone }, [
    index === 0 ? null : ' · ',
    h('i', { key: 'dot', 'data-on': tone }),
    h('b', { key: 'value' }, String(value)),
    ` ${label}`,
  ])))
}

/** The sentence drawn under the tower when there is little else to draw. */
function noticeOf(graph, filter) {
  if (!graph.active) return '当前会话没有开启塔台模式。在会话里输入 /tower on 后，任务会出现在这里。'
  if (graph.stats.missions === 0) return '塔台已开启，还没有任务。计划第一个任务后，它会出现在塔台两侧。'
  if (graph.groups.length === 0) {
    return filter === 'blocked' ? '没有被阻塞的任务。' : '没有未完成的任务。'
  }
  return null
}

/**
 * The canvas.
 *
 * @param props - `{ store, openSession }`. The canvas binds, once, to the
 *   session it was opened for and keeps polling that session until it closes.
 * @returns the portalled dialog, or null without a document.
 */
export function CanvasOverlay({ store, openSession }) {
  const [sessionId] = useState(() => store.openedFor())
  const [filter, setFilter] = useState('all')
  const [density, setDensity] = useState('summary')
  const [panelOpen, setPanelOpen] = useState(true)
  const [snapshot, setSnapshot] = useState(null)
  const [failure, setFailure] = useState(null)
  const [toast, setToast] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [tab, setTab] = useState('detail')
  const [messagePair, setMessagePair] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [platform] = useState(() => (typeof document === 'undefined' || document.documentElement === undefined
    ? ''
    : document.documentElement.dataset?.platform ?? ''))

  const panelRef = useRef(null)
  const pollerRef = useRef(null)
  const skipRestore = useRef(false)
  const closeRef = useRef(() => {})
  closeRef.current = useCallback(() => store.close(), [store])

  // Poll while open, and only while open.
  useEffect(() => {
    const poller = createPoller({
      load: signal => fetchTowerDetail(sessionId, signal),
      onSuccess: next => {
        setSnapshot(next)
        setFailure(null)
      },
      onFailure: (error, count) => setFailure({ message: describeError(error), count }),
    })
    pollerRef.current = poller
    if (document.hidden === true) poller.pause('hidden')
    const onVisibility = () => {
      if (document.hidden === true) poller.pause('hidden')
      else poller.resume('hidden')
    }
    document.addEventListener('visibilitychange', onVisibility)
    poller.start()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      poller.stop()
      pollerRef.current = null
    }
  }, [sessionId])

  // The running durations tick; nothing ticks while nobody can see it.
  useEffect(() => {
    const clock = setInterval(() => {
      if (document.hidden !== true) setNow(Date.now())
    }, 1000)
    return () => clearInterval(clock)
  }, [])

  // Own focus — and the rest of the page — while open, and put both back.
  useEffect(() => {
    const doc = document
    const panel = panelRef.current
    const active = doc.activeElement
    const previous = active !== null && active !== undefined && typeof active.focus === 'function' ? active : null
    // The release must run before focus returns: an inert ancestor swallows it.
    const release = inertBackground(doc, panel)
    if (panel !== null) panel.focus()

    // Escape and Tab belong to the canvas only while it is the foreground
    // layer. A newer dialog or an open menu keeps both.
    const onKeyDown = event => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return
      const element = panelRef.current
      if (element === null) return
      if (!isTopmostModal(element, modalLayers(doc))) return
      if (event.key === 'Escape') {
        if (event.shiftKey) return
        event.preventDefault()
        // A held key must not re-enter the close command on every repeat.
        if (!event.repeat) closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      // A menu inside the canvas owns traversal while it holds focus.
      if (isInsideMenu(doc.activeElement)) return
      const target = trapTabTarget(focusableIn(element), doc.activeElement, event.shiftKey)
      if (target === null) return
      event.preventDefault()
      target.focus()
    }
    doc.addEventListener('keydown', onKeyDown)
    return () => {
      doc.removeEventListener('keydown', onKeyDown)
      release()
      // Leaving for another session: there is nothing to come back to.
      if (skipRestore.current) return
      resolveRestoreTarget({ saved: previous, doc, labels: ['打开画布', '关闭画布'] })?.focus()
    }
  }, [])

  const graph = useMemo(() => layoutCanvas(snapshot, { density, filter }), [snapshot, density, filter])

  // A selection that has left the canvas (a filter hid it, a mission was
  // dropped) clears rather than showing details of something gone.
  const selectedKnown = selectedId !== null
    && (graph.nodes.some(node => node.id === selectedId)
      || graph.groups.some(group => group.id === selectedId)
      || graph.edges.some(edge => edge.id === selectedId))
  useEffect(() => {
    if (selectedId !== null && !selectedKnown) setSelectedId(null)
  }, [selectedId, selectedKnown])

  const select = useCallback(id => {
    setSelectedId(id ?? null)
    if (id === null || id === undefined) return
    setTab('detail')
    setMessagePair(null)
  }, [])

  const switchTab = useCallback((id, pair) => {
    setTab(TABS.includes(id) ? id : 'detail')
    setMessagePair(Array.isArray(pair) ? pair : null)
  }, [])

  const onGesture = useCallback((reason, on) => {
    const poller = pollerRef.current
    if (poller === null) return
    if (on) poller.pause(reason)
    else poller.resume(reason)
  }, [])

  const close = useCallback(() => {
    skipRestore.current = false
    store.close()
  }, [store])

  // Opening a session leaves the canvas; a refused request keeps it on screen
  // with its error.
  //
  // The shell's `uiWorkspace.openSession` is synchronous and returns nothing:
  // it switches the main view, or throws when the session cannot be resolved.
  // A promise is accepted too, in case a host makes the switch asynchronous,
  // but no shipped host does — so "open" is inferred from the call having
  // returned, not from a value the host hands back.
  const openAgent = useCallback(node => {
    if (node.agentId === '') return
    setToast(null)
    const leave = () => {
      skipRestore.current = true
      store.close()
    }
    let result
    try {
      result = openSession(node.agentId)
    } catch (error) {
      setToast(`打开会话失败：${describeError(error)}`)
      return
    }
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      result.then(leave, error => setToast(`打开会话失败：${describeError(error)}`))
      return
    }
    leave()
  }, [openSession, store])

  if (typeof document === 'undefined' || document.body === null || document.body === undefined) return null

  const notice = snapshot === null ? null : noticeOf(graph, filter)
  const state = snapshot === null
    ? (failure === null
        ? { title: '正在读取塔台状态…', text: '画布打开时才向 Host 取一次完整快照，之后每 3 秒刷新一次。' }
        : {
          title: '塔台状态读取失败',
          text: `${failure.message}（已连续失败 ${failure.count} 次，仍在按间隔重试）`,
          retry: true,
        })
    : null

  const header = h('header', {
    key: 'header',
    className: 'dkc-head',
    'data-window-drag': '',
    'data-platform': platform === '' ? undefined : platform,
  }, [
    // Passive drag surface, and the macOS traffic-light gutter.
    h('div', { className: 'dkc-dragspace', 'aria-hidden': 'true', key: 'dragspace' }),
    h('div', { className: 'dkc-brand', key: 'brand' }, [
      h('span', { className: 'dkc-brand-mark', key: 'mark', 'aria-hidden': 'true' }, 'T'),
      h('span', { className: 'dkc-title', key: 'title' }, '塔台画布'),
      graph.data.base === ''
        ? null
        : h('span', { key: 'base', className: 'dkc-base' }, ['base ', h('b', { key: 'b' }, graph.data.base)]),
    ]),
    h('div', { className: 'dkc-spacer', key: 'spacer' }),
    h(Segmented, {
      key: 'filter',
      name: 'filter',
      label: '任务范围',
      value: filter,
      onChange: setFilter,
      options: CANVAS_FILTERS.map(value => ({ value, label: FILTER_LABEL[value] })),
    }),
    h(Segmented, {
      key: 'density',
      name: 'density',
      label: '密度',
      value: density,
      onChange: setDensity,
      options: CANVAS_DENSITIES.map(value => ({ value, label: DENSITY_LABEL[value] })),
    }),
    h(Tally, { key: 'tally', graph }),
    h('button', {
      key: 'panel',
      type: 'button',
      className: 'dkc-iconbtn',
      'aria-label': panelOpen ? '收起详情面板' : '展开详情面板',
      title: panelOpen ? '收起详情面板' : '展开详情面板',
      'aria-pressed': panelOpen ? 'true' : 'false',
      'data-testid': 'canvas-panel-toggle',
      onClick: () => setPanelOpen(value => !value),
    }, ICON_PANEL),
    h('button', {
      key: 'close',
      type: 'button',
      className: 'dkc-iconbtn',
      'aria-label': '关闭画布',
      title: '关闭画布（Esc）',
      'data-testid': 'canvas-close',
      onClick: close,
    }, ICON_CLOSE),
  ])

  return createPortal(h('div', {
    className: 'dkt-canvas',
    ref: panelRef,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': '塔台画布',
    'data-density': density,
    'data-filter': filter,
    'data-testid': 'tower-canvas',
    tabIndex: -1,
  }, [
    header,
    h('div', { className: 'dkc-body', key: 'body' }, [
      h(CanvasStage, {
        key: 'stage',
        graph,
        now,
        selectedId,
        onSelect: select,
        onOpenAgent: openAgent,
        onGesture,
        notice,
        state,
        onRetry: () => pollerRef.current?.retry(),
        ready: snapshot !== null,
      }),
      panelOpen
        ? h(CanvasPanel, {
          key: 'panel',
          graph,
          now,
          selectedId,
          tab,
          onTab: switchTab,
          messagePair,
          onClearPair: () => setMessagePair(null),
          onSelect: select,
          onOpenAgent: openAgent,
        })
        : null,
    ]),
    toast === null
      ? null
      : h('div', { key: 'toast', className: 'dkc-toast', role: 'alert', 'data-tone': 'danger' }, [
          h('span', { key: 'text' }, toast),
          h('button', {
            key: 'dismiss',
            type: 'button',
            className: 'dkc-iconbtn',
            'aria-label': '关闭提示',
            onClick: () => setToast(null),
          }, ICON_CLOSE),
        ]),
  ]), document.body)
}
