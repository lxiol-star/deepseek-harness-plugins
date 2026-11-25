/**
 * The dock above the composer: every open tower mission, its worker, progress
 * counts, and elapsed time.
 *
 * The Host route is read-only (`/tower/state`), so the dock only polls and
 * renders. Clicking a running card opens the worker's session; the stop button
 * asks the tower to stop one mission.
 *
 * Besides the mission cards the dock carries two ways into the fullscreen
 * canvas (`./canvasOverlay.js`): one on the collapsed pill, one on the expanded
 * header. Both share the canvas's open state through the store
 * (`./canvasStore.js`), which the dock also keeps informed about the tower —
 * it reports each snapshot it already polls, so nothing else has to poll.
 */
import { createElement as h, useEffect, useRef, useState } from 'react'
import { sanitizeText } from '../canvas/sanitize.js'
import { CSS as DOCK_CSS, STYLE_ID as DOCK_STYLE_ID } from './dockCss.js'

/**
 * Clean a snapshot string where the dock shows it.
 *
 * The dock only ever renders text nodes, but the invisible characters
 * `sanitizeText` removes can still mislead in a card label or a tooltip, so
 * its strings get the same cleaning the canvas gives its own.
 */
const show = value => sanitizeText(value)

/** The glyph of both canvas entries: the tower, two missions, and the wires. */
const CANVAS_ICON = h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
  h('path', {
    d: 'M2.5 5.5h4v5h-4zM9.5 2h4v3.5h-4zM9.5 10.5h4v3.5h-4zM6.5 7l3-2.2M6.5 9l3 2.6',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }))

/** The canvas glyph as a component, so it can sit in a list under a key. */
function CanvasIcon() {
  return CANVAS_ICON
}

function ensureStyle() {
  if (document.getElementById(DOCK_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = DOCK_STYLE_ID
  style.textContent = DOCK_CSS
  document.head.appendChild(style)
}

function formatElapsed(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}分${seconds % 60}秒`
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分`
}

function statusLabel(state) {
  if (state === 'waiting') return '待派发'
  if (state === 'stale') return '已离线'
  if (state === 'blocked') return '被阻塞'
  if (state === 'paused') return '已暂停'
  if (state === 'done') return '已完成'
  return '运行中'
}

function durationOf(mission, now) {
  if (mission.startedAt === undefined) return mission.elapsedMs
  const started = Date.parse(mission.startedAt)
  if (Number.isNaN(started)) return mission.elapsedMs
  return Math.max(0, now - started)
}

function Card({ mission, index, now, openSession, sessionId, stopping, onStop }) {
  const openable = typeof mission.agentId === 'string' && mission.agentId.length > 0
  return h('div', {
    className: 'dkt-card',
    role: openable ? 'button' : undefined,
    tabIndex: openable ? 0 : undefined,
    'data-state': mission.state,
    'data-open': openable ? '1' : '0',
    'data-fading': mission.fading === true ? '1' : '0',
    title: show(mission.worktreePath),
    onClick: openable ? () => openSession(mission.agentId) : undefined,
    onKeyDown: openable ? (event) => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openSession(mission.agentId)
      }
    } : undefined,
  }, [
    h('div', { className: 'dkt-top', key: 'top' }, [
      h('span', { className: 'dkt-num', key: 'n' }, String(index + 1).padStart(2, '0')),
      h('span', { className: 'dkt-id', key: 'id' }, show(mission.id)),
      h('span', { className: 'dkt-name', key: 'name' }, show(mission.title)),
      mission.state === 'running'
        ? h('button', {
          className: 'dkt-stop',
          key: 'stop',
          type: 'button',
          'aria-label': `停止 ${show(mission.id)}`,
          disabled: stopping !== null,
          'data-stopping': stopping === mission.id ? '1' : '0',
          onClick: (event) => {
            event.stopPropagation()
            onStop(mission)
          },
          onKeyDown: (event) => { event.stopPropagation() },
        }, stopping === mission.id ? '…' : '■')
        : null,
    ]),
    h('div', { className: 'dkt-meta', key: 'meta' }, `Work in ${show(mission.worktreePath)}`),
    mission.model ? h('div', { className: 'dkt-model', key: 'model' }, `${show(mission.model)}${mission.effort ? ' · ' + show(mission.effort) : ''}`) : null,
    h('div', { className: 'dkt-foot', key: 'foot' }, [
      h('span', { className: 'dkt-kind', key: 'kind' }, `${mission.owner ? show(mission.owner) + ' · ' : ''}${show(mission.kind)} · ${mission.tasksDone}/${mission.tasksTotal} 任务`),
      h('span', { className: 'dkt-status', key: 'status' }, [
        h('span', { className: 'dkt-dot', key: 'dot' }),
        h('span', { key: 'label' }, mission.fading === true ? '已结束' : statusLabel(mission.state)),
        mission.state === 'running'
          ? h('span', { className: 'dkt-time', key: 'time' }, formatElapsed(durationOf(mission, now)))
          : null,
      ]),
    ]),
  ])
}

export function TowerDock({ sessionId, openSession, openCanvas, reportTower }) {
  const [snapshot, setSnapshot] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [collapsed, setCollapsed] = useState(false)
  const [stopping, setStopping] = useState(null)
  const [stopError, setStopError] = useState(null)
  const [fading, setFading] = useState([])
  const previousRef = useRef(new Map())
  const stoppingRef = useRef(null)
  const stopOperation = useRef(0)
  const stopTimer = useRef(null)
  const sessionRef = useRef(sessionId)
  const mountedRef = useRef(true)

  // Tell the shared store what each poll learnt about this session's tower, so
  // the header toggle can show itself without polling of its own.
  useEffect(() => {
    if (typeof reportTower !== 'function') return
    const active = snapshot !== null && snapshot.active === true && snapshot.sessionId === sessionId
    reportTower(sessionId, active ? snapshot : null)
  }, [reportTower, sessionId, snapshot])
  sessionRef.current = sessionId
  useEffect(() => {
    previousRef.current = new Map()
    stoppingRef.current = null
    stopOperation.current += 1
    if (stopTimer.current !== null) { clearTimeout(stopTimer.current); stopTimer.current = null }
    setFading([])
    setCollapsed(false)
    setStopping(null)
    setStopError(null)
    setSnapshot(null)
  }, [sessionId])
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (stopTimer.current !== null) { clearTimeout(stopTimer.current); stopTimer.current = null }
    }
  }, [])
  useEffect(() => {
    let stopped = false
    let sequence = 0
    let failures = 0
    let controller = null
    const load = async () => {
      const mine = ++sequence
      controller?.abort()
      controller = new AbortController()
      try {
        const response = await fetch(`/tower/state?sessionId=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`tower status ${response.status}`)
        const next = await response.json()
        if (!stopped && mine === sequence) {
          failures = 0
          setSnapshot(next)
        }
      } catch (error) {
        if (stopped || mine !== sequence || (error && error.name === 'AbortError')) return
        failures += 1
        if (failures >= 3) setSnapshot(null)
      }
    }
    void load()
    const poll = setInterval(() => { void load() }, 1000)
    const clock = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => {
      stopped = true
      controller?.abort()
      clearInterval(poll)
      clearInterval(clock)
    }
  }, [sessionId])
  useEffect(() => {
    if (snapshot === null || snapshot.active !== true || snapshot.sessionId !== sessionId
      || !Array.isArray(snapshot.missions)) return
    const current = new Map(snapshot.missions.map((mission) => [mission.id, mission]))
    const gone = [...previousRef.current.values()].filter((mission) => !current.has(mission.id))
    setFading((existing) => {
      const live = existing.filter((mission) => !current.has(mission.id))
      const known = new Set(live.map((mission) => mission.id))
      return [...live, ...gone.filter((mission) => !known.has(mission.id))
        .map((mission) => ({ ...mission, state: 'done', fading: true, fadeUntil: Date.now() + 4000 }))]
    })
    previousRef.current = current
  }, [snapshot, sessionId])
  useEffect(() => {
    const timer = setInterval(() => {
      setFading((existing) => existing.filter((mission) => mission.fadeUntil > Date.now()))
    }, 1000)
    return () => { clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (stopping === null || snapshot === null) return
    const mission = snapshot.missions.find((candidate) => candidate.id === stopping)
    if (mission === undefined || mission.state !== 'running') {
      if (stopTimer.current !== null) { clearTimeout(stopTimer.current); stopTimer.current = null }
      stoppingRef.current = null
      setStopping(null)
    }
  }, [snapshot, stopping])
  if (snapshot === null || snapshot.active !== true || snapshot.sessionId !== sessionId
    || !Array.isArray(snapshot.missions)) return null
  const currentIds = new Set(snapshot.missions.map((mission) => mission.id))
  const visible = [
    ...snapshot.missions,
    ...fading.filter((mission) => mission.fadeUntil > Date.now() && !currentIds.has(mission.id)),
  ]
  if (visible.length === 0) return null
  const running = typeof snapshot.running === 'number' ? snapshot.running : 0
  const pending = visible.filter((mission) => mission.fading !== true && mission.state !== 'done').length
  const count = running > 0 ? running : pending > 0 ? pending : visible.length
  const countLabel = running > 0 ? `${running} 运行中` : pending > 0 ? `${pending} 个待处理` : `${visible.length} 个已结束`
  const stop = async (mission) => {
    if (!/^M[0-9]+$/.test(mission.id) || stoppingRef.current !== null) return
    const operation = ++stopOperation.current
    const targetSession = sessionId
    stoppingRef.current = mission.id
    setStopping(mission.id)
    setStopError(null)
    try {
      const rpcId = crypto.randomUUID()
      const response = await fetch('/api/commands/execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId,
          method: 'commands/execute',
          payload: { args: { agentId: sessionId, line: `/tower stop ${mission.id}`, submittedAttachments: [] } },
        }),
      })
      if (!response.ok) throw new Error(`stop failed (${response.status})`)
      const envelope = await response.json()
      const command = envelope && envelope.result && envelope.result.ok === true
        ? envelope.result.value && envelope.result.value.result
        : undefined
      if (command === undefined || command.kind !== 'success') {
        throw new Error((command && command.text) || '停止失败')
      }
      if (stopOperation.current === operation && sessionRef.current === targetSession) {
        stopTimer.current = setTimeout(() => {
          if (!mountedRef.current || stopOperation.current !== operation) return
          stopTimer.current = null
          stoppingRef.current = null
          setStopping(null)
          setStopError('停止未确认，请重试')
        }, 8000)
      }
    } catch (error) {
      if (stopOperation.current === operation && sessionRef.current === targetSession) {
        stoppingRef.current = null
        setStopping(null)
        setStopError(error instanceof Error ? error.message : '停止失败')
      }
    }
  }
  // Both ways into the canvas carry the same mark, so closing the canvas can
  // hand focus back to one of them.
  const canvasEntry = {
    type: 'button',
    'data-dkt-canvas-entry': '',
    'data-testid': 'tower-dock-canvas',
    'aria-label': '打开画布',
    title: '打开塔台画布',
    onClick: () => openCanvas(sessionId),
  }
  if (collapsed) {
    return h('span', { className: 'dkt-pill', role: 'group', 'aria-label': '后台 Agent' }, [
      h('button', {
        key: 'main',
      className: 'dkt-pill-main',
        type: 'button',
        'data-testid': 'tower-dock-pill',
        'aria-label': running > 0 ? `后台 Agent ${count} 运行中，展开` : `后台 Agent ${count} 个子任务，展开`,
        onClick: () => setCollapsed(false),
      }, [
        h('span', { className: 'dkt-mark', key: 'mark', 'aria-hidden': 'true' }, 'T'),
        h('span', { key: 'label' }, '后台 Agent'),
        h('span', { className: 'dkt-pill-dot', key: 'dot', 'aria-hidden': 'true' }),
        h('span', { className: 'dkt-pill-count', key: 'count' }, String(count)),
      ]),
      h('span', { className: 'dkt-pill-sep', key: 'sep', 'aria-hidden': 'true' }),
      h('button', { ...canvasEntry, key: 'canvas', className: 'dkt-canvas-btn' }, [h(CanvasIcon, { key: 'icon' }), '画布']),
    ])
  }
  return h('section', { className: 'dkt-dock', 'data-testid': 'tower-dock', 'aria-label': 'Tower 子任务' }, [
    h('div', { className: 'dkt-toprow', key: 'toprow' }, [
      h('button', { className: 'dkt-head', key: 'head', type: 'button', 'aria-expanded': 'true', onClick: () => setCollapsed(true) }, [
        h('span', { className: 'dkt-mark', key: 'mark', 'aria-hidden': 'true' }, 'T'),
        h('span', { className: 'dkt-title', key: 'title' }, '后台 Agent'),
        h('span', { className: 'dkt-count', key: 'count' }, countLabel),
        h('span', { className: 'dkt-base', key: 'base' }, `base ${show(snapshot.base)}`),
        h('span', { className: 'dkt-chev', key: 'chev', 'aria-hidden': 'true' }, '⌄'),
      ]),
      h('button', { ...canvasEntry, key: 'canvas', className: 'dkt-canvas-btn dkt-canvas-btn-compact' }, [h(CanvasIcon, { key: 'icon' }), '画布']),
    ]),
    stopError === null ? null : h('div', { className: 'dkt-error', key: 'error', role: 'alert' }, stopError),
    h('div', { className: 'dkt-grid', key: 'grid' }, visible.map((mission, index) =>
      h(Card, { key: mission.id, mission, index, now, openSession, sessionId, stopping, onStop: stop }))),
  ])
}
