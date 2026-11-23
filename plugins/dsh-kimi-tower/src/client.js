/**
 * dsh-kimi-tower browser half: a compact dock above the composer that shows
 * every open tower mission, its worker, progress counts, and elapsed time.
 *
 * The Host route is read-only (`/tower/state`), so this file only polls and
 * renders. Clicking a running card opens the worker's session.
 */
window.__ModuleLoader__.load({
  id: 'dsh-kimi-tower',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const STYLE_ID = 'dsh-kimi-tower-dock-style'
    const CSS = `
.dkt-dock{display:flex;flex-direction:column;gap:8px;margin:0 0 8px;padding:10px 12px;border:1px solid var(--dsw-border-subtle,rgba(127,127,127,.2));border-radius:12px;background:var(--dsw-surface-raised,rgba(127,127,127,.06));font-size:12px;color:inherit}
.dkt-head{display:flex;align-items:center;gap:8px;min-height:18px;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;width:100%}
.dkt-chev{margin-left:4px;color:var(--dsw-text-faint,rgba(127,127,127,.7));font-size:12px;line-height:1}
.dkt-pill{display:inline-flex;align-items:center;gap:7px;margin:0 0 8px;padding:7px 11px;border:1px solid var(--dsw-border-subtle,rgba(127,127,127,.2));border-radius:999px;background:var(--dsw-surface-raised,rgba(127,127,127,.06));color:inherit;font:inherit;font-size:12px;cursor:pointer}
.dkt-pill:hover{background:var(--dsw-surface-hover,rgba(127,127,127,.15))}
.dkt-pill-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-success,#22c55e)}
.dkt-pill-count{min-width:16px;height:16px;padding:0 5px;border-radius:999px;background:var(--dsw-accent,#4f7cff);color:#fff;font-size:10px;line-height:16px;text-align:center;font-variant-numeric:tabular-nums}
.dkt-mark{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:5px;background:var(--dsw-accent,#4f7cff);color:#fff;font-size:10px;font-weight:700;letter-spacing:0}
.dkt-title{font-weight:600}
.dkt-count{color:var(--dsw-text-muted,rgba(127,127,127,.9))}
.dkt-base{margin-left:auto;color:var(--dsw-text-faint,rgba(127,127,127,.7));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:38%}
.dkt-error{color:var(--dsw-danger,#ef4444);font-size:11px;padding:2px 0 0}
.dkt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.dkt-card{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;padding:9px 10px;border:0;border-radius:10px;background:var(--dsw-surface,rgba(127,127,127,.09));color:inherit;text-align:left;font:inherit;cursor:default}
.dkt-card[data-open="1"]{cursor:pointer}
.dkt-card[data-open="1"]:hover{background:var(--dsw-surface-hover,rgba(127,127,127,.15))}
.dkt-card[data-state="running"]{box-shadow:inset 2px 0 0 var(--dsw-success,#22c55e)}
.dkt-card[data-state="blocked"]{box-shadow:inset 2px 0 0 var(--dsw-danger,#ef4444)}
.dkt-card[data-state="done"]{opacity:.72}
.dkt-top{display:flex;align-items:center;gap:8px;min-width:0;padding-right:18px}
.dkt-stop{flex:none;appearance:none;border:0;background:transparent;padding:0;display:inline-grid;place-items:center;width:16px;height:16px;border-radius:4px;color:var(--dsw-text-muted,rgba(127,127,127,.7));font-size:9px;line-height:1;cursor:pointer}
.dkt-stop:hover{background:var(--dsw-surface-hover,rgba(127,127,127,.15));color:var(--dsw-danger,#ef4444)}
.dkt-stop[data-stopping="1"]{opacity:.5;cursor:progress}
.dkt-card[data-fading="1"]{opacity:.35;transition:opacity .35s ease}
.dkt-num{flex:none;color:var(--dsw-text-faint,rgba(127,127,127,.7));font-variant-numeric:tabular-nums}
.dkt-id{flex:none;padding:0 4px;border-radius:4px;background:var(--dsw-surface-hover,rgba(127,127,127,.12));color:var(--dsw-text-muted,rgba(127,127,127,.85));font-size:10px;line-height:16px;font-variant-numeric:tabular-nums}
.dkt-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.dkt-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-text-muted,rgba(127,127,127,.85))}
.dkt-model{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-text-muted,rgba(127,127,127,.85));font-size:11px}
.dkt-foot{display:flex;align-items:center;gap:8px;justify-content:space-between;color:var(--dsw-text-muted,rgba(127,127,127,.85))}
.dkt-kind{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dkt-status{display:inline-flex;align-items:center;gap:4px;flex:none}
.dkt-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-text-faint,#999)}
.dkt-card[data-state="running"] .dkt-dot{background:var(--dsw-success,#22c55e);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-success,#22c55e) 18%,transparent)}
.dkt-card[data-state="blocked"] .dkt-dot{background:var(--dsw-danger,#ef4444)}
.dkt-card[data-state="done"] .dkt-dot{background:var(--dsw-success,#22c55e)}
.dkt-time{font-variant-numeric:tabular-nums;color:var(--dsw-text-faint,rgba(127,127,127,.75))}
.dkt-empty{display:none}
`
    function ensureStyle() {
      if (document.getElementById(STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
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
        title: mission.worktreePath,
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
          h('span', { className: 'dkt-id', key: 'id' }, mission.id),
          h('span', { className: 'dkt-name', key: 'name' }, mission.title),
          mission.state === 'running'
            ? h('button', {
              className: 'dkt-stop',
              key: 'stop',
              type: 'button',
              'aria-label': `停止 ${mission.id}`,
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
        h('div', { className: 'dkt-meta', key: 'meta' }, `Work in ${mission.worktreePath}`),
        mission.model ? h('div', { className: 'dkt-model', key: 'model' }, `${mission.model}${mission.effort ? ' · ' + mission.effort : ''}`) : null,
        h('div', { className: 'dkt-foot', key: 'foot' }, [
          h('span', { className: 'dkt-kind', key: 'kind' }, `${mission.owner ? mission.owner + ' · ' : ''}${mission.kind} · ${mission.tasksDone}/${mission.tasksTotal} 任务`),
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

    function TowerDock({ sessionId, openSession }) {
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
      if (collapsed) {
        return h('button', {
          className: 'dkt-pill',
          type: 'button',
          'data-testid': 'tower-dock-pill',
          'aria-label': running > 0 ? `后台 Agent ${count} 运行中，展开` : `后台 Agent ${count} 个子任务，展开`,
          onClick: () => setCollapsed(false),
        }, [
          h('span', { className: 'dkt-mark', key: 'mark', 'aria-hidden': 'true' }, 'T'),
          h('span', { key: 'label' }, '后台 Agent'),
          h('span', { className: 'dkt-pill-dot', key: 'dot', 'aria-hidden': 'true' }),
          h('span', { className: 'dkt-pill-count', key: 'count' }, String(count)),
        ])
      }
      return h('section', { className: 'dkt-dock', 'data-testid': 'tower-dock', 'aria-label': 'Tower 子任务' }, [
        h('button', { className: 'dkt-head', key: 'head', type: 'button', 'aria-expanded': 'true', onClick: () => setCollapsed(true) }, [
          h('span', { className: 'dkt-mark', key: 'mark', 'aria-hidden': 'true' }, 'T'),
          h('span', { className: 'dkt-title', key: 'title' }, '后台 Agent'),
          h('span', { className: 'dkt-count', key: 'count' }, countLabel),
          h('span', { className: 'dkt-base', key: 'base' }, `base ${snapshot.base}`),
          h('span', { className: 'dkt-chev', key: 'chev', 'aria-hidden': 'true' }, '⌄'),
        ]),
        stopError === null ? null : h('div', { className: 'dkt-error', key: 'error', role: 'alert' }, stopError),
        h('div', { className: 'dkt-grid', key: 'grid' }, visible.map((mission, index) =>
          h(Card, { key: mission.id, mission, index, now, openSession, sessionId, stopping, onStop: stop }))),
      ])
    }

    return {
      inject: ['slots', 'uiWorkspace'],
      apply(ctx) {
        ensureStyle()
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock',
          id: 'tower-progress',
          order: 30,
          inject: () => ({
            openSession: (id) => ctx.uiWorkspace.openSession(id),
          }),
        }, TowerDock))
      },
    }
  },
})
