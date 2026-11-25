/**
 * The stage of the tower canvas: the pan and zoom surface, with the floating
 * controls that sit on it (legend, zoom bar, minimap).
 *
 * The view is `{ x, y, zoom }` in screen px (see `src/canvas/viewport.js`).
 * Panning and zooming only change that transform; the cards are never
 * re-laid-out by a gesture.
 *
 * The stage reports its gestures to the owner through `onGesture(reason, on)`.
 * A reason is `'drag'`, `'wheel'` or `'minimap'`; they can overlap, so each is
 * switched off by its own end. The owner pauses polling while any is on.
 */
import { createElement as h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EDGE_KINDS, STATE_TONES, missionTone } from '../canvas/labels.js'
import { placeLabels } from '../canvas/placeLabels.js'
import { relatedIds } from '../canvas/selection.js'
import { COMPACT_ZOOM, ZOOM_MAX, ZOOM_MIN, centreOn, fitView, minimapProjection, panBy, visibleRect, zoomAt, zoomTo } from '../canvas/viewport.js'
import { AgentCard, MissionGroup, TowerCard, Wires, WireLabels } from './canvasNodes.js'

/** Size of the minimap, in screen px. */
const MINIMAP = Object.freeze({ width: 184, height: 116 })
/** Zoom step of one press of a zoom button. */
const ZOOM_STEP = 1.2
/** Wheel delta, in px, that zooms by one step: a mouse notch is about 100. */
const WHEEL_STEP = 0.0016
/** After this many ms without a wheel event, the wheel gesture is over. */
const WHEEL_SETTLE = 400
/** Spacing of the dot grid at zoom 1. */
const DOT_GRID = 18

/** A 16×16 outline icon. */
const icon = d => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true' },
  h('path', { d, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))
const ICON_MINUS = icon('M3.5 8h9')
const ICON_PLUS = icon('M8 3.5v9M3.5 8h9')
const ICON_FIT = icon('M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10')
const ICON_INFO = icon('M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13ZM8 7.3v3.5M8 4.9v.1')

/** A square icon button that sits on the stage. */
function IconButton({ label, onClick, disabled = false, children, className = '' }) {
  return h('button', {
    type: 'button',
    className: `dkc-iconbtn${className === '' ? '' : ` ${className}`}`,
    'aria-label': label,
    title: label,
    disabled,
    onClick,
  }, children)
}

/** The shortcut hint, as key caps (a one-item array) and the words between them. */
const SHORTCUTS = [['+'], ['−'], ' 缩放 · ', ['0'], ' 适应窗口 · ', ['Esc'], ' 关闭']

/** The legend: what each wire and each colour means, and the shortcuts. */
function Legend({ onClose }) {
  const rows = [
    ...EDGE_KINDS.map(kind => [h('i', { key: `${kind.type}-swatch`, className: 'dkc-swatch', 'data-kind': kind.type }), kind.label]),
    ...STATE_TONES.map(state => [h('i', { key: `${state.tone}-swatch`, className: 'dkc-swatch', 'data-kind': `state-${state.tone}` }), state.label]),
  ]
  return h('div', { className: 'dkc-legend dkc-float', role: 'figure', 'aria-label': '图例' }, [
    h('div', { className: 'dkc-legend-title', key: 'title' }, [
      h('span', { key: 'text' }, '图例'),
      h(IconButton, { key: 'close', label: '收起图例', onClick: onClose }, ICON_MINUS),
    ]),
    h('dl', { key: 'rows' }, rows.flatMap(([swatch, label], index) => [
      h('dt', { key: `k${index}` }, swatch),
      h('dd', { key: `v${index}` }, label),
    ])),
    h('div', { className: 'dkc-legend-hint', key: 'hint' }, [
      '拖拽平移 · 滚轮缩放 · 点击卡片看详情',
      h('br', { key: 'br' }),
      ...SHORTCUTS.flatMap((part, index) => (typeof part === 'string'
        ? [part]
        : [h('kbd', { key: `key-${index}` }, part[0])])),
    ]),
  ])
}

/** The zoom toolbar along the bottom. */
function ZoomBar({ view, onZoom, onSetZoom, onFit }) {
  return h('div', { className: 'dkc-zoombar dkc-float', role: 'group', 'aria-label': '缩放' }, [
    h(IconButton, { key: 'out', label: '缩小', disabled: view.zoom <= ZOOM_MIN, onClick: () => onZoom(1 / ZOOM_STEP) }, ICON_MINUS),
    h('button', {
      key: 'level',
      type: 'button',
      className: 'dkc-zoom',
      'aria-label': `缩放 ${Math.round(view.zoom * 100)}%，点击恢复到 100%`,
      title: '恢复到 100%',
      onClick: () => onSetZoom(1),
    }, `${Math.round(view.zoom * 100)}%`),
    h(IconButton, { key: 'in', label: '放大', disabled: view.zoom >= ZOOM_MAX, onClick: () => onZoom(ZOOM_STEP) }, ICON_PLUS),
    h('span', { key: 'sep', className: 'dkc-zoom-sep', 'aria-hidden': 'true' }),
    h(IconButton, { key: 'fit', label: '适应窗口（0）', onClick: onFit }, ICON_FIT),
  ])
}

/** A grey small-scale copy of the diagram with the viewport outlined; click or drag to move the view. */
function MiniMap({ graph, view, size, onViewChange, onGesture }) {
  const ref = useRef(null)
  const dragging = useRef(false)
  const projection = useMemo(
    () => minimapProjection(graph.bounds, MINIMAP.width, MINIMAP.height),
    [graph.bounds],
  )
  const move = event => {
    const element = ref.current
    if (element === null) return
    const rect = element.getBoundingClientRect()
    const world = projection.toWorld(event.clientX - rect.left, event.clientY - rect.top)
    onViewChange(centreOn(view, world.x, world.y, size.width, size.height))
  }
  const end = () => {
    if (!dragging.current) return
    dragging.current = false
    onGesture('minimap', false)
  }
  // The part of the world the stage shows, drawn as an outline.
  const seen = visibleRect(view, size.width, size.height)
  const near = projection.toMap(seen.x, seen.y)
  const far = projection.toMap(seen.x + seen.w, seen.y + seen.h)
  const rectOf = (node, minimum, extra = {}) => {
    const corner = projection.toMap(node.x, node.y)
    return h('rect', {
      key: node.id ?? 'tower',
      className: 'dkc-minimap-rect',
      x: corner.x,
      y: corner.y,
      width: Math.max(minimum, node.w * projection.scale),
      height: Math.max(minimum, node.h * projection.scale),
      ...extra,
    })
  }
  return h('svg', {
    ref,
    className: 'dkc-minimap dkc-float',
    width: MINIMAP.width,
    height: MINIMAP.height,
    viewBox: `0 0 ${MINIMAP.width} ${MINIMAP.height}`,
    role: 'button',
    tabIndex: 0,
    'aria-label': '小地图，点击或拖动以移动画布视野',
    onPointerDown: event => {
      if (event.currentTarget.setPointerCapture !== undefined) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // The pointer is already gone; the press still moves the view once.
        }
      }
      dragging.current = true
      onGesture('minimap', true)
      move(event)
    },
    onPointerMove: event => {
      if (dragging.current) move(event)
    },
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  }, [
    h('rect', { key: 'bg', className: 'dkc-minimap-bg', x: 0.5, y: 0.5, width: MINIMAP.width - 1, height: MINIMAP.height - 1 }),
    ...graph.groups.map(group => rectOf(group, 2, { 'data-tone': missionTone(group.mission) })),
    ...graph.nodes
      .filter(node => node.type === 'agent')
      .map(node => rectOf(node, 2, { 'data-tone': node.live ? 'running' : 'idle' })),
    rectOf({ ...graph.tower, id: undefined }, 3, { 'data-kind': 'tower' }),
    h('rect', {
      key: 'view',
      className: 'dkc-minimap-view',
      x: near.x,
      y: near.y,
      width: Math.max(0, far.x - near.x),
      height: Math.max(0, far.y - near.y),
    }),
  ])
}

/** What the stage says while it has nothing to draw: loading, or a failure. */
function StageState({ state, onRetry }) {
  return h('div', { className: 'dkc-state', role: 'status', 'aria-live': 'polite' }, [
    h('div', { className: 'dkc-state-mark', key: 'mark', 'aria-hidden': 'true' }, 'T'),
    h('b', { key: 'title' }, state.title),
    h('p', { key: 'text' }, state.text),
    state.retry
      ? h('button', { key: 'retry', type: 'button', className: 'dkc-open-action', onClick: onRetry }, '重试')
      : null,
  ])
}

/**
 * The stage.
 *
 * @param props - `{ graph, now, selectedId, onSelect, onOpenAgent, onGesture,
 *   notice, state, onRetry, ready }`. `notice` is a sentence drawn under the
 *   tower; `state` is `{ title, text, retry }` while nothing can be drawn;
 *   `ready` says whether a snapshot has arrived yet.
 * @returns the stage element.
 */
export function CanvasStage(props) {
  const { graph, now, selectedId, onSelect, onOpenAgent, onGesture, notice, state, onRetry, ready } = props
  const stageRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [legendOpen, setLegendOpen] = useState(true)
  const drag = useRef(null)
  const settle = useRef(null)
  // What the view was last fitted for, and whether the user has moved it since.
  const fitted = useRef({ filter: null, ready: false })
  const touched = useRef(false)

  const shown = view ?? { x: 0, y: 0, zoom: 1 }
  const nodes = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph])
  const related = useMemo(() => relatedIds(graph, selectedId), [graph, selectedId])
  // Where each wire's label sits at this zoom. It depends on the zoom and the
  // graph, never on the pan, so dragging does not rebuild it.
  const labels = useMemo(() => placeLabels(graph, shown.zoom), [graph, shown.zoom])

  // The stage's own size, now and whenever it changes.
  useLayoutEffect(() => {
    const element = stageRef.current
    if (element === null) return undefined
    const update = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      setSize(previous => (previous.width === width && previous.height === height ? previous : { width, height }))
    }
    update()
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // The diagram is fitted when the stage is first measured, again when the
  // mission filter changes, and once more when the first snapshot lands (the
  // canvas opens on a lone tower, before the Host has answered — that is still
  // the opening view, unless the user has already moved it by hand). A later
  // snapshot, a density change or a resize keeps the view where it is.
  const filter = graph.filter
  const bounds = graph.bounds
  useLayoutEffect(() => {
    if (size.width === 0 || size.height === 0) return
    const forFilter = fitted.current.filter !== filter
    const withSnapshot = ready && !fitted.current.ready
    if (!forFilter && !withSnapshot) return
    fitted.current = { filter, ready }
    if (withSnapshot && !forFilter && touched.current) return
    touched.current = false
    setView(fitView(bounds, size.width, size.height))
  }, [size.width, size.height, filter, ready, bounds])

  // Every way the user moves the view marks it as touched, so an arriving
  // snapshot will not put it back.
  const centre = size.width / 2
  const middle = size.height / 2
  const fit = useCallback(() => {
    if (size.width === 0) return
    touched.current = false
    setView(fitView(bounds, size.width, size.height))
  }, [bounds, size.width, size.height])
  const zoomBy = useCallback(factor => {
    touched.current = true
    setView(current => (current === null ? current : zoomAt(current, factor, centre, middle)))
  }, [centre, middle])
  const setZoom = useCallback(zoom => {
    touched.current = true
    setView(current => (current === null ? current : zoomTo(current, zoom, centre, middle)))
  }, [centre, middle])

  // The wheel zooms about the pointer. React registers wheel listeners as
  // passive, so the page would still scroll; this one is not.
  useEffect(() => {
    const element = stageRef.current
    if (element === null) return undefined
    const onWheel = event => {
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1
      const delta = event.deltaY * unit
      if (delta === 0) return
      const rect = element.getBoundingClientRect()
      touched.current = true
      setView(current => (current === null
        ? current
        : zoomAt(current, Math.exp(-delta * WHEEL_STEP), event.clientX - rect.left, event.clientY - rect.top)))
      onGesture('wheel', true)
      clearTimeout(settle.current)
      settle.current = setTimeout(() => {
        settle.current = null
        onGesture('wheel', false)
      }, WHEEL_SETTLE)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', onWheel)
      clearTimeout(settle.current)
    }
  }, [onGesture])

  const onPointerDown = event => {
    if (event.button !== 0 && event.button !== 1) return
    if (event.target.closest('.dkc-card, .dkc-label, .dkc-float, .dkc-wire-hit') !== null) return
    const element = stageRef.current
    if (element !== null && element.setPointerCapture !== undefined) {
      try {
        element.setPointerCapture(event.pointerId)
      } catch {
        // The pointer may already be gone; the drag simply will not follow it.
      }
    }
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: view, moved: false }
    setDragging(true)
    onGesture('drag', true)
  }

  const onPointerMove = event => {
    const state = drag.current
    if (state === null || state.id !== event.pointerId) return
    const dx = event.clientX - state.x
    const dy = event.clientY - state.y
    // A press that has not really moved is a click, not a drag.
    if (!state.moved && Math.hypot(dx, dy) < 3) return
    state.moved = true
    touched.current = true
    setView(panBy(state.start, dx, dy))
  }

  const endDrag = event => {
    const state = drag.current
    if (state === null || state.id !== event.pointerId) return
    drag.current = null
    setDragging(false)
    onGesture('drag', false)
    // A click on empty canvas clears the selection.
    if (!state.moved) onSelect(null)
  }

  const onKeyDown = event => {
    if (event.target !== event.currentTarget) return
    let next = null
    switch (event.key) {
      case 'ArrowLeft': next = panBy(view, 80, 0); break
      case 'ArrowRight': next = panBy(view, -80, 0); break
      case 'ArrowUp': next = panBy(view, 0, 80); break
      case 'ArrowDown': next = panBy(view, 0, -80); break
      case '+': case '=': next = zoomAt(view, ZOOM_STEP, centre, middle); break
      case '-': case '_': next = zoomAt(view, 1 / ZOOM_STEP, centre, middle); break
      case '0': next = fitView(bounds, size.width, size.height); break
      default: return
    }
    event.preventDefault()
    if (event.key !== '0') touched.current = true
    setView(next)
  }

  const tower = graph.tower
  const cards = []
  for (const node of graph.nodes) {
    if (node.type === 'tower') {
      cards.push(h(TowerCard, { key: node.id, node, graph, selected: node.id === selectedId, onSelect }))
    } else if (node.type === 'agent') {
      cards.push(h(AgentCard, {
        key: node.id,
        node,
        graph,
        now,
        selected: node.id === selectedId,
        onSelect,
        onOpen: onOpenAgent,
      }))
    }
  }
  for (const group of graph.groups) {
    cards.push(h(MissionGroup, {
      key: group.id,
      group,
      graph,
      nodes,
      selected: group.id === selectedId,
      onSelect,
    }))
  }

  return h('div', {
    className: 'dkc-stage',
    ref: stageRef,
    tabIndex: 0,
    role: 'region',
    'aria-label': '塔台画布。拖拽平移，滚轮缩放，方向键平移，加减号缩放，0 适应窗口',
    'data-dragging': dragging ? '1' : '0',
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    // The capture can be taken away without a pointerup (the window lost
    // focus, a dialog opened): the drag is over all the same.
    onLostPointerCapture: endDrag,
    onKeyDown,
  }, [
    h('div', {
      key: 'dots',
      className: 'dkc-dots',
      style: {
        backgroundSize: `${DOT_GRID * shown.zoom}px ${DOT_GRID * shown.zoom}px`,
        backgroundPosition: `${shown.x}px ${shown.y}px`,
      },
    }),
    h('div', {
      key: 'world',
      className: 'dkc-world',
      style: {
        transform: `translate3d(${shown.x}px, ${shown.y}px, 0) scale(${shown.zoom})`,
        visibility: view === null ? 'hidden' : undefined,
      },
    }, [
      h(Wires, { key: 'wires', edges: graph.edges, related: selectedId === null ? null : related, onSelect }),
      ...cards,
      notice === null ? null : h('div', {
        key: 'notice',
        className: 'dkc-notice',
        style: { left: tower.x + tower.w / 2, top: tower.y + tower.h + 40 },
      }, notice),
    ]),
    h(WireLabels, {
      key: 'labels',
      edges: graph.edges,
      labels,
      view: shown,
      selectedId,
      onSelect,
      compact: shown.zoom < COMPACT_ZOOM,
    }),
    legendOpen
      ? h(Legend, { key: 'legend', onClose: () => setLegendOpen(false) })
      : h('button', {
        key: 'legend-open',
        type: 'button',
        className: 'dkc-legend-toggle dkc-float dkc-iconbtn',
        'aria-label': '显示图例',
        title: '显示图例',
        onClick: () => setLegendOpen(true),
      }, ICON_INFO),
    h(ZoomBar, { key: 'zoom', view: shown, onZoom: zoomBy, onSetZoom: setZoom, onFit: fit }),
    size.width > 0
      ? h(MiniMap, {
        key: 'minimap',
        graph,
        view: shown,
        size,
        onViewChange: next => {
          touched.current = true
          setView(next)
        },
        onGesture,
      })
      : null,
    state === null ? null : h(StageState, { key: 'state', state, onRetry }),
  ])
}
