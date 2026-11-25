/**
 * The cards and wires of the tower canvas.
 *
 * Everything here is a pure function of the graph (from `src/canvas/layout.js`)
 * and the selection. Cards are absolutely positioned inside the world layer and
 * show the lines the layout pre-broke, so what is on screen is what was
 * measured. Every piece of a snapshot is rendered as plain text.
 *
 * Clicks mean the same thing everywhere: a click (or Enter / Space) selects
 * the thing and the side panel shows its details. The only way off the canvas
 * is the `打开会话` button on an agent card, or a double-click on the card.
 * Nothing here writes to the tower.
 */
import { createElement as h } from 'react'
import { AGENT_KIND_LABEL, KIND_LABEL, agentMeta, agentUptime, deathLabel, formatStamp, missionLabel, missionTone } from '../canvas/labels.js'
import { wireGeometry } from '../canvas/wires.js'

/** The tone of a wire: the state of the mission it is about. */
const TONE = { running: 'running', blocked: 'blocked', paused: 'paused', stale: 'stale', waiting: 'waiting', done: 'done' }
const toneOf = state => TONE[state] ?? 'idle'
const box = node => ({ left: node.x, top: node.y, width: node.w, height: node.h })

/** Fire on Enter or Space, as a button does, without letting the key bubble. */
export function onActivate(action) {
  return event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    action(event)
  }
}

/** Stop a click on a control inside a card from also selecting the card. */
export function stop(event) {
  event.stopPropagation()
}

/** A small status chip. */
export function Tag({ tone = 'plain', dot = true, children }) {
  return h('span', { className: 'dkc-tag', 'data-tone': tone }, [
    dot ? h('i', { key: 'dot', 'aria-hidden': 'true' }) : null,
    h('span', { key: 'text' }, children),
  ])
}

/** A progress bar; `done` and `total` are task counts. */
export function ProgressBar({ done, total, large = false }) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0
  return h('span', { className: large ? 'dkc-bar dkc-bar-lg' : 'dkc-bar' }, h('i', { style: { width: `${Math.round(ratio * 100)}%` } }))
}

/** The tower at the centre of the canvas. */
export function TowerCard({ node, graph, selected, onSelect }) {
  const stats = graph.stats
  const base = graph.data.base
  return h('div', {
    className: `dkc-card dkc-tower${selected ? ' dkc-selected' : ''}`,
    style: box(node),
    role: 'button',
    tabIndex: 0,
    'data-id': node.id,
    'data-type': 'tower',
    'aria-label': '塔台，查看全局概览',
    'aria-pressed': selected ? 'true' : 'false',
    onClick: () => onSelect(node.id),
    onKeyDown: onActivate(() => onSelect(node.id)),
  }, [
    h('div', { className: 'dkc-brand', key: 'brand' }, [
      h('span', { className: 'dkc-tower-mark', key: 'mark', 'aria-hidden': 'true' }, 'T'),
      h('span', { className: 'dkc-tower-name', key: 'name' }, 'Tower 塔台'),
    ]),
    h('div', { className: 'dkc-tower-meta', key: 'meta' }, [
      h('span', { key: 'mode' }, graph.active
        ? (stats.running > 0 ? `${stats.running} 个任务运行中` : '塔台模式已开启')
        : '塔台模式未开启'),
      h('span', { key: 'agents' }, `${stats.live} / ${stats.agents} 个 agent 在线`),
      h('span', { key: 'missions' }, `${stats.open} 个未完成 · 共 ${stats.missions} 个任务`),
      base === '' ? null : h('span', { key: 'base', className: 'dkc-tower-base', title: `base ${base}` }, `base ${base}`),
    ]),
  ])
}

function TaskRow({ item, last }) {
  return h('div', {
    className: 'dkc-task',
    'data-done': item.done ? '1' : '0',
    'data-dropped': item.dropped ? '1' : '0',
    'data-last': last ? '1' : '0',
  }, [
    h('span', { key: 'box', className: 'dkc-box', 'data-done': item.done ? '1' : '0', 'aria-hidden': 'true' }),
    h('span', { key: 'text', className: 'dkc-task-text' }, item.lines.map((line, index) => h('span', { key: index }, line))),
  ])
}

/** The task-list card or the scope card inside a mission group. */
function SubCard({ node, group, mission, onSelect }) {
  const tasks = node.type === 'tasks'
  const count = tasks ? mission.tasks.length : mission.scope.length
  const items = tasks
    ? node.items.map((item, index) => h(TaskRow, { key: index, item, last: index === node.items.length - 1 }))
    : node.items.map((glob, index) => h('span', { key: index, className: 'dkc-glob', title: glob }, glob))
  return h('div', {
    className: 'dkc-card dkc-subcard dkc-open',
    style: { left: node.x - group.x, top: node.y - group.y, width: node.w, height: node.h },
    role: 'button',
    tabIndex: 0,
    'data-id': node.id,
    'data-type': node.type,
    'aria-label': `${mission.id} ${tasks ? '任务清单' : '范围'}，查看详情`,
    onClick: event => {
      event.stopPropagation()
      onSelect(group.id)
    },
    onKeyDown: onActivate(() => onSelect(group.id)),
  }, [
    h('div', { className: 'dkc-subhead', key: 'head' }, [
      h('b', { key: 'title' }, tasks ? '任务清单' : '范围'),
      tasks
        ? h('span', { className: 'dkc-progress', key: 'progress' }, [
          h(ProgressBar, { key: 'bar', done: mission.tasksDone, total: mission.tasksTotal }),
          h('span', { key: 'count' }, `${mission.tasksDone}/${mission.tasksTotal}`),
        ])
        : h('span', { className: 'dkc-progress', key: 'count' }, `${count} 项`),
    ]),
    ...(node.empty
      ? [h('div', { key: 'empty', className: 'dkc-empty' }, tasks ? '尚无任务清单' : '不预留文件（调研任务）')]
      : items),
    node.more > 0
      ? h('div', { key: 'more', className: 'dkc-more' }, `另有 ${node.more} ${tasks ? '项任务' : '条范围'}，见右侧详情`)
      : null,
  ])
}

/** One mission: the dashed frame, its header, and in 详情 density its two cards. */
export function MissionGroup({ group, graph, nodes, selected, onSelect }) {
  const mission = group.mission
  const density = graph.density
  const tone = missionTone(mission)
  const label = missionLabel(mission)
  const flags = density === 'detail' && group.flags !== null ? group.flags.lines : []
  return h('div', {
    className: `dkc-card dkc-group dkc-open${selected ? ' dkc-selected' : ''}`,
    style: box(group),
    'data-id': group.id,
    'data-type': 'mission',
    'data-tone': tone,
    'data-density': density,
    'data-selected': selected ? 'true' : 'false',
    onClick: () => onSelect(group.id),
  }, [
    h('div', {
      className: 'dkc-group-head',
      key: 'head',
      role: 'button',
      tabIndex: 0,
      'aria-label': `${mission.id} ${mission.title}，${label}，查看详情`,
      'aria-pressed': selected ? 'true' : 'false',
      onClick: event => {
        event.stopPropagation()
        onSelect(group.id)
      },
      onKeyDown: onActivate(() => onSelect(group.id)),
    }, [
      h('div', { className: 'dkc-group-title', key: 'title' }, [
        h('span', { className: 'dkc-group-id', key: 'id' }, mission.id),
        h('div', { className: 'dkc-group-name', key: 'name', title: mission.title },
          group.title.lines.map((line, index) => h('span', { key: index }, line))),
      ]),
      h('div', { className: 'dkc-group-meta', key: 'meta', title: group.meta }, group.meta),
      flags.length === 0 ? null : h('div', {
        className: 'dkc-group-flags',
        key: 'flags',
        title: group.flags.lines.join(' '),
      }, flags.map((line, index) => h('span', { key: index }, line))),
    ]),
    h('div', { className: 'dkc-group-badges', key: 'badges' }, [
      h(Tag, { key: 'state', tone }, label),
      mission.kind === 'build' ? null : h(Tag, { key: 'kind', tone: 'plain', dot: false }, KIND_LABEL[mission.kind]),
    ]),
    ...(density === 'detail'
      ? group.cardIds.map(id => h(SubCard, { key: id, node: nodes.get(id), group, mission, onSelect }))
      : []),
  ])
}

const ARROW = 'M3 8h8M7.5 3.5L12 8l-4.5 4.5'

/** One agent: a worker or a reviewer, and how to reach its session. */
export function AgentCard({ node, graph, now, selected, onSelect, onOpen }) {
  const detail = graph.density === 'detail'
  const openable = node.agentId !== ''
  const open = event => {
    event.stopPropagation()
    if (openable) onOpen(node)
  }
  const uptime = agentUptime(node, now)
  return h('div', {
    className: `dkc-card dkc-agent dkc-open${selected ? ' dkc-selected' : ''}`,
    style: box(node),
    role: 'button',
    tabIndex: 0,
    'data-id': node.id,
    'data-type': 'agent',
    'data-role': node.role,
    'data-live': node.live ? '1' : '0',
    'aria-label': `${node.name}，${AGENT_KIND_LABEL[node.kind]}，${node.live ? '在线' : '已离线'}，查看详情`,
    'aria-pressed': selected ? 'true' : 'false',
    onClick: () => onSelect(node.id),
    onDoubleClick: open,
    onKeyDown: onActivate(() => onSelect(node.id)),
  }, [
    h('div', { className: 'dkc-agent-top', key: 'top' }, [
      h('span', { className: 'dkc-avatar', key: 'avatar', 'aria-hidden': 'true' }, node.name.slice(0, 1).toUpperCase() || '?'),
      h('span', { className: 'dkc-agent-name', key: 'name', title: node.name }, node.name),
      h('span', {
        className: 'dkc-live',
        key: 'live',
        'data-live': node.live ? '1' : '0',
        role: 'img',
        'aria-label': node.live ? '在线' : '已离线',
      }),
    ]),
    h('div', { className: 'dkc-agent-meta', key: 'meta', title: agentMeta(node) }, [
      h('span', { key: 'text' }, agentMeta(node)),
      detail ? null : h('button', {
        key: 'open',
        type: 'button',
        className: 'dkc-agent-open',
        disabled: !openable,
        'aria-label': `打开 ${node.name} 的会话`,
        title: openable ? '打开会话' : '没有可打开的会话',
        onClick: open,
        onDoubleClick: stop,
      }, h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        h('path', { d: ARROW, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
    ]),
    detail ? h('div', { className: 'dkc-agent-foot', key: 'foot' }, [
      h('span', { key: 'time' }, node.live
        ? (uptime === '' ? '在线' : `已运行 ${uptime}`)
        : `${deathLabel(node.deathStatus)}${node.diedAt === '' ? '' : ` · ${formatStamp(node.diedAt)}`}`),
      h('button', {
        key: 'open',
        type: 'button',
        className: 'dkc-agent-open',
        disabled: !openable,
        'aria-label': `打开 ${node.name} 的会话`,
        title: openable ? '打开会话' : '没有可打开的会话',
        onClick: open,
        onDoubleClick: stop,
      }, '打开会话'),
    ]) : null,
    detail && !node.live && node.deathReason !== '' ? h('div', { className: 'dkc-agent-dead', key: 'dead', title: node.deathReason }, node.deathReason) : null,
  ])
}

/** The wires, one group of paths per wire. */
export function Wires({ edges, related, onSelect }) {
  return h('svg', { className: 'dkc-wires', width: 1, height: 1 }, edges.map(edge => {
    const { path, head } = wireGeometry(edge.points)
    const dim = related !== null && !related.edges.has(edge.id)
    return h('g', {
      key: edge.id,
      className: 'dkc-wire-g',
      'data-type': edge.type,
      'data-tone': edge.type === 'message' ? 'message' : toneOf(edge.state),
      'data-unread': edge.type === 'message' && edge.unread ? '1' : '0',
      'data-dim': dim ? '1' : '0',
    }, [
      h('path', {
        key: 'hit',
        className: 'dkc-wire-hit',
        d: path,
        tabIndex: -1,
        role: 'button',
        'aria-label': `${edge.label}，查看详情`,
        onClick: event => {
          event.stopPropagation()
          onSelect(edge.id)
        },
      }),
      h('path', { key: 'line', className: 'dkc-wire', d: path }),
      h('path', { key: 'head', className: 'dkc-wire-head', d: head }),
    ])
  }))
}

/** The label chips of the wires, drawn in screen space so they stay legible at any zoom. */
export function WireLabels({ edges, view, selectedId, onSelect, compact }) {
  const chips = []
  for (const edge of edges) {
    // Far out, only the wires that carry a count keep their label.
    if (compact && edge.type !== 'dep' && edge.type !== 'message') continue
    const focusable = edge.type === 'dep' || edge.type === 'message'
    chips.push(h('button', {
      key: edge.id,
      type: 'button',
      className: 'dkc-label',
      'data-type': edge.type,
      'data-tone': edge.type === 'message' ? 'message' : toneOf(edge.state),
      'data-unread': edge.type === 'message' && edge.unread ? '1' : '0',
      'data-selected': edge.id === selectedId ? 'true' : 'false',
      tabIndex: focusable ? 0 : -1,
      'aria-label': `${edge.label}，查看详情`,
      title: edge.type === 'message' && edge.latest !== undefined ? edge.latest.subject : edge.label,
      style: {
        left: Math.round(edge.labelAt[0] * view.zoom + view.x),
        top: Math.round(edge.labelAt[1] * view.zoom + view.y),
      },
      onClick: event => {
        event.stopPropagation()
        onSelect(edge.id)
      },
      onDoubleClick: stop,
    }, edge.label))
  }
  return h('div', { className: 'dkc-labels' }, chips)
}
