/**
 * The side panel of the tower canvas: the details of whatever is selected, and
 * three read-only lists — the message stream, the latest review of each
 * mission, and the activity log.
 *
 * Everything shown here comes from the snapshot and is rendered as plain text.
 * The panel never writes to the tower: its only actions are selecting another
 * thing on the canvas, and handing an agent to `onOpenAgent`.
 */
import { Children, cloneElement, createElement as h, isValidElement, useEffect, useRef } from 'react'
import {
  KIND_LABEL, MERGE_LABEL, deathLabel, elapsedSince, formatClock, formatElapsed, formatStamp, missionLabel, missionTone,
  reviewLabel,
} from '../canvas/labels.js'
import { ProgressBar, Tag } from './canvasNodes.js'

/** The tabs, left to right. */
export const TABS = Object.freeze(['detail', 'messages', 'reviews', 'log'])
const TAB_LABEL = Object.freeze({ detail: '详情', messages: '消息', reviews: '评审', log: '日志' })

/** How a finding's type reads. Anything else is shown as sent. */
const FINDING_TYPE = Object.freeze({ bug: '缺陷', improve: '改进', vuln: '漏洞', idea: '想法' })

const findingTone = severity => (severity === 'critical' || severity === 'high' ? 'danger'
  : severity === 'medium' ? 'warn' : severity === 'low' ? 'plain' : 'info')

const code = text => h('code', { className: 'dkc-code' }, text)
const plain = text => h('span', {}, text)

/** A word that selects something on the canvas when clicked. */
function Link({ onSelect, id, children }) {
  return h('button', { type: 'button', className: 'dkc-link', onClick: () => onSelect(id), title: '在画布上查看' }, children)
}

/** A titled block of the detail view. `aside` is a quiet note at the end of its heading. */
function Section({ title, aside = null, children }) {
  return h('section', { className: 'dkc-section' }, [
    h('h5', { key: 'head' }, [
      h('span', { key: 'title' }, title),
      isValidElement(aside) ? cloneElement(aside, { key: 'aside' }) : aside,
    ]),
    Children.toArray(children),
  ])
}

/** Several things side by side, keyed so React can tell them apart. */
function inline(children) {
  return Children.toArray(children)
}

/** A definition list of `label → value` rows. */
function Facts({ rows }) {
  return h('dl', { className: 'dkc-kv' }, rows.filter(row => row[1] !== null && row[1] !== undefined).flatMap(([label, value]) => [
    h('dt', { key: `${label}-dt` }, label),
    h('dd', { key: `${label}-dd` }, Array.isArray(value) ? inline(value) : value),
  ]))
}

const agentId = name => `agent:${name}`
const missionId = id => `mission:${id}`

/** How a message's sender or recipient reads. */
const endpoint = (name, data) => {
  if (name === 'tower') return '塔台'
  if (name === 'all') return '所有人'
  return data.agents.some(agent => agent.name === name) ? name : `${name}（不在画布上）`
}

/** How a node id reads when it stands for a wire's end. */
const labelOf = id => (id === 'tower' ? '塔台' : id.slice(id.indexOf(':') + 1))

/** The tower as a whole: what the snapshot holds. */
function Overview({ graph, towerSelected }) {
  const data = graph.data
  const stats = graph.stats
  return h('div', { className: 'dkc-detail' }, [
    h('h4', { key: 'title' }, towerSelected ? '塔台' : '全局'),
    h(Facts, {
      key: 'facts',
      rows: [
        ['基线分支', data.base === '' ? plain('（未知）') : code(data.base)],
        ['任务', plain(`${stats.missions} 个，${stats.open} 个未完成`)],
        ['进行中', plain(`${stats.running} 个运行中，${stats.blocked} 个被阻塞`)],
        ['Agent', plain(`${stats.agents} 个，${stats.live} 个在线`)],
        ['消息', plain(`${stats.messages} 条，${stats.unread} 条未读`)],
        ['发现', plain(`${stats.findings.length} 条`)],
        ['活动日志', plain(`${stats.activity.length} 行`)],
      ],
    }),
    towerSelected ? null : h('p', { key: 'hint', className: 'dkc-hint' }, '点击画布上的任务、Agent 或连线，这里会显示它的详情。'),
    data.findings.length === 0
      ? null
      : h(Section, { key: 'findings', title: '发现', aside: plain(`${data.findings.length} 条`) },
        h('ul', { className: 'dkc-list' }, data.findings.map((finding, index) => h('li', { key: index }, [
          h('span', { key: 'tag', className: 'dkc-list-tag' }, [
            h(Tag, { key: 'severity', tone: findingTone(finding.severity) }, finding.severity || '发现'),
          ]),
          h('span', { key: 'main', className: 'dkc-main' }, [
            h('span', { key: 'title' }, [
              finding.title,
              FINDING_TYPE[finding.type] ? `（${FINDING_TYPE[finding.type]}）` : '',
            ].join('')),
            h('span', { key: 'where', className: 'dkc-sub' }, inline([
              finding.location === '' ? null : code(finding.location),
              finding.missionId === '' ? null : plain(` · ${finding.missionId}`),
              finding.agent === '' ? null : plain(` · ${finding.agent}`),
              formatClock(finding.createdAt) === '' ? null : plain(` · ${formatClock(finding.createdAt)}`),
            ])),
            finding.summary === '' ? null : h('span', { key: 'summary', className: 'dkc-sub dkc-wrap' }, finding.summary),
          ]),
        ])))),
  ])
}

/** One mission: its checklist, scope, dependencies, blockers, notes, review and the user's own words. */
function MissionDetail({ graph, mission, now, onSelect, onOpenAgent }) {
  const data = graph.data
  const group = graph.groups.find(candidate => candidate.missionId === mission.id)
  // The agents beside the mission, without repeats: a snapshot that lists a
  // name twice is one agent, and two rows with one key would lose one.
  const agents = data.agents.filter((agent, index, all) => group !== undefined && group.agents.includes(agent.name)
    && all.findIndex(other => other.name === agent.name) === index)
  const tone = missionTone(mission)
  const findings = data.findings.filter(finding => finding.missionId === mission.id)
  return h('div', { className: 'dkc-detail' }, [
    h('h4', { key: 'title' }, `${mission.id} ${mission.title}`),
    h('div', { className: 'dkc-detail-tags', key: 'tags' }, [
      h(Tag, { key: 'state', tone }, missionLabel(mission)),
      mission.kind === 'build' ? null : h(Tag, { key: 'kind', tone: 'plain', dot: false }, KIND_LABEL[mission.kind]),
      mission.review === undefined ? null : h(Tag, { key: 'review', tone: 'info', dot: false }, `评审 第${Math.max(1, mission.review.round)}轮`),
    ]),
    h(Facts, {
      key: 'facts',
      rows: [
        ['分支', mission.branch === '' ? null : code(mission.branch)],
        ['工作树', mission.worktreePath === '' ? null : code(mission.worktreePath)],
        ['负责人', mission.owner === '' ? plain('尚未派发给任何 agent')
          : h('span', { key: 'owner' }, inline([
            h(Link, { onSelect, id: agentId(mission.owner) }, mission.owner),
            mission.live ? null : plain('（已离线）'),
          ]))],
        ['模型', mission.model === '' ? null : plain([mission.model, mission.effort].filter(part => part !== '').join(' · '))],
        ['进度', h('span', { key: 'progress', className: 'dkc-progress-line' }, inline([
          h(ProgressBar, { done: mission.tasksDone, total: mission.tasksTotal, large: true }),
          plain(`${mission.tasksDone}/${mission.tasksTotal} 任务`),
        ]))],
        ['开始', mission.startedAt === undefined
          ? (mission.elapsedMs > 0 ? plain(`累计 ${formatElapsed(mission.elapsedMs)}`) : null)
          : plain(`${formatStamp(mission.startedAt)}${mission.live && elapsedSince(mission.startedAt, now) !== '' ? ` · 已运行 ${elapsedSince(mission.startedAt, now)}` : ''}`)],
      ],
    }),
    h(Section, { key: 'tasks', title: '任务清单', aside: plain(`${mission.tasks.filter(task => task.done).length}/${mission.tasks.length}`) },
      mission.tasks.length === 0
        ? h('p', { className: 'dkc-hint' }, '尚无任务清单。')
        : h('ul', { className: 'dkc-list dkc-checklist' }, mission.tasks.map((task, index) => h('li', { key: index, 'data-done': task.done ? '1' : '0' }, [
          h('span', { key: 'box', className: 'dkc-box', 'data-done': task.done ? '1' : '0', 'aria-hidden': 'true' }),
          h('span', { key: 'text', className: 'dkc-main dkc-wrap' }, task.text),
          task.dropped ? h(Tag, { key: 'dropped', tone: 'plain', dot: false }, '已砍掉') : null,
        ])))),
    h(Section, { key: 'scope', title: '范围', aside: plain(`${mission.scope.length} 项`) },
      mission.scope.length === 0
        ? h('p', { className: 'dkc-hint' }, '不预留文件。')
        : h('ul', { className: 'dkc-plain dkc-globs' }, mission.scope.map((glob, index) => h('li', { key: index }, code(glob))))),
    h(Section, { key: 'deps', title: '依赖' }, mission.deps.length === 0
      ? h('p', { className: 'dkc-hint' }, '不依赖其他任务。')
      : h('ul', { className: 'dkc-plain' }, mission.deps.map((dep, index) => {
        const prerequisite = data.missions.find(candidate => candidate.id === dep)
        // A Host may list a dependency twice; the position keeps the keys apart.
        return h('li', { key: `${dep}#${index}` }, prerequisite === undefined
          ? plain(dep)
          : inline([h(Link, { onSelect, id: missionId(dep) }, dep), plain(` · ${missionLabel(prerequisite)}`)]))
      }))),
    h(Section, { key: 'blockers', title: '阻塞' }, mission.blockers.length === 0
      ? null
      : h('div', { className: 'dkc-callout', 'data-tone': 'danger', role: 'note' },
        h('ul', { className: 'dkc-plain' }, mission.blockers.map((blocker, index) => h('li', { key: index }, blocker))))),
    mission.notes.length === 0 ? null : h(Section, { key: 'notes', title: '备注', aside: plain(`${mission.notes.length} 条`) },
      h('ul', { className: 'dkc-plain' }, mission.notes.map((note, index) => h('li', { key: index }, note)))),
    mission.keyArtifacts.length === 0 ? null : h(Section, { key: 'artifacts', title: '关键产物' },
      h('ul', { className: 'dkc-plain dkc-globs' }, mission.keyArtifacts.map((artifact, index) => h('li', { key: index }, code(artifact))))),
    mission.review === undefined ? null : h(Section, { key: 'review', title: '最近评审' }, h(Facts, { rows: [
      ['轮次', plain(`第 ${Math.max(1, mission.review.round)} 轮`)],
      ['评审人', mission.review.reviewer === '' ? null : h(Link, { onSelect, id: agentId(mission.review.reviewer) }, mission.review.reviewer)],
      ['结论', plain(reviewLabel(mission.review.status))],
      ['合并建议', MERGE_LABEL[mission.review.merge] ?? mission.review.merge],
      ['时间', mission.review.at === '' ? null : plain(formatStamp(mission.review.at))],
    ] })),
    mission.context === undefined ? null : h(Section, { key: 'context', title: '用户原话' },
      h('blockquote', { className: 'dkc-quote' }, mission.context)),
    agents.length === 0 ? null : h(Section, { key: 'agents', title: '相关 Agent', aside: plain(`${agents.length} 个`) },
      h('ul', { className: 'dkc-list' }, agents.map(agent => h('li', { key: agent.name }, [
        h('span', { key: 'main', className: 'dkc-main' }, inline([
          h(Link, { onSelect, id: agentId(agent.name) }, agent.name),
          plain(` · ${agent.kind === 'reviewer' ? '评审' : 'Worker'}${agent.model === '' ? '' : ` · ${agent.model}`}`),
        ])),
        agent.agentId === ''
          ? h(Tag, { key: 'offline', tone: 'plain', dot: false }, '无会话')
          : h('button', {
            key: 'open',
            type: 'button',
            className: 'dkc-open-session',
            'aria-label': `打开 ${agent.name} 的会话`,
            onClick: () => onOpenAgent(agent),
          }, '打开会话'),
      ])))),
    findings.length === 0 ? null : h(Section, { key: 'findings', title: '发现', aside: plain(`${findings.length} 条`) },
      h('ul', { className: 'dkc-list' }, findings.map((finding, index) => h('li', { key: index }, [
        h('span', { key: 'tag', className: 'dkc-list-tag' }, h(Tag, { tone: findingTone(finding.severity) }, finding.severity || '发现')),
        h('span', { key: 'main', className: 'dkc-main' }, [
          h('span', { key: 'title' }, finding.title),
          h('span', { key: 'where', className: 'dkc-sub' }, inline([
            finding.location === '' ? null : code(finding.location),
            formatClock(finding.createdAt) === '' ? null : plain(` · ${formatClock(finding.createdAt)}`),
          ])),
        ]),
      ])))),
  ])
}

/** One agent: what it is, what it runs, and the way to its session. */
function AgentDetail({ graph, node, now, onSelect, onOpenAgent }) {
  const role = node.role === 'owner' ? '负责'
    : node.role === 'former' ? '曾负责'
      : node.role === 'reviewer' ? '评审' : null
  const uptime = elapsedSince(node.spawnedAt, now)
  return h('div', { className: 'dkc-detail' }, [
    h('h4', { key: 'title' }, node.name),
    h('div', { className: 'dkc-detail-tags', key: 'tags' }, [
      h(Tag, { key: 'kind', tone: node.kind === 'reviewer' ? 'warn' : 'info', dot: false }, node.kind === 'reviewer' ? '评审' : 'Worker'),
      h(Tag, { key: 'live', tone: node.live ? 'running' : 'stale' }, node.live ? '在线' : '已离线'),
    ]),
    h(Facts, {
      key: 'facts',
      rows: [
        ['任务', node.missionId === '' ? plain('未关联任何任务')
          : inline([plain(`${role ?? ''} `), h(Link, { onSelect, id: missionId(node.missionId) }, node.missionId)])],
        ['模型', [node.model, node.effort].every(part => part === '') ? null : plain([node.model, node.effort].filter(part => part !== '').join(' · '))],
        ['会话', node.agentId === '' ? plain('没有可打开的会话') : code(node.agentId)],
        ['派生', node.spawnedAt === '' ? null : plain(`${formatStamp(node.spawnedAt)}${node.live && uptime !== '' ? ` · 已运行 ${uptime}` : ''}`)],
        ['结束', node.live || (node.diedAt === '' && node.deathStatus === '') ? null
          : plain(`${deathLabel(node.deathStatus)}${node.diedAt === '' ? '' : ` · ${formatStamp(node.diedAt)}`}`)],
      ],
    }),
    node.live || node.deathReason === '' ? null : h('div', { key: 'reason', className: 'dkc-callout', 'data-tone': 'danger', role: 'note' }, node.deathReason),
    h('div', { key: 'actions', className: 'dkc-actions' }, h('button', {
      key: 'open',
      type: 'button',
      className: 'dkc-open-session dkc-open-session-primary',
      disabled: node.agentId === '',
      'aria-label': `打开 ${node.name} 的会话`,
      onClick: () => onOpenAgent(node),
    }, node.agentId === '' ? '没有可打开的会话' : '打开会话')),
  ])
}

/** One wire: what joins what. */
function EdgeDetail({ graph, edge, onSelect, onTab }) {
  const data = graph.data
  const title = h('h4', { key: 'title' }, edge.type === 'message'
    ? `消息：${labelOf(edge.from)} ↔ ${labelOf(edge.to)}`
    : `${edge.label}：${labelOf(edge.from)} → ${labelOf(edge.to)}`)
  const missionLink = id => (id.startsWith('mission:') ? h(Link, { onSelect, id }, id.slice(8)) : plain(labelOf(id)))
  const both = [
    h(Facts, { key: 'ends', rows: [['起点', missionLink(edge.from)], ['终点', missionLink(edge.to)]] }),
  ]
  if (edge.type === 'message') {
    const pair = [edge.from, edge.to]
    return h('div', { className: 'dkc-detail' }, [
      title,
      h(Facts, { key: 'facts', rows: [
        ['往来', plain(`${edge.count} 条`)],
        ['方向', plain(edge.bidirectional ? '双方都发过' : `${labelOf(edge.from)} → ${labelOf(edge.to)}`)],
        ['未读', plain(edge.unread ? '有未读' : '都已读')],
        ['最新', plain(`${formatClock(edge.latest.sentAt) || ''} ${edge.latest.subject}`)],
      ] }),
      h('div', { key: 'actions', className: 'dkc-actions' }, h('button', {
        key: 'show',
        type: 'button',
        className: 'dkc-open-session',
        onClick: () => onTab('messages', pair),
      }, '在消息流中只看这两方')),
    ])
  }
  if (edge.type === 'dep') {
    const from = data.missions.find(mission => missionId(mission.id) === edge.from)
    const to = data.missions.find(mission => missionId(mission.id) === edge.to)
    return h('div', { className: 'dkc-detail' }, [
      title,
      h(Facts, { key: 'facts', rows: [
        ['前提', from === undefined ? null : inline([h(Link, { onSelect, id: edge.from }, from.id), plain(` ${from.title} · ${missionLabel(from)}`)])],
        ['后续', to === undefined ? null : inline([h(Link, { onSelect, id: edge.to }, to.id), plain(` ${to.title} · ${missionLabel(to)}`)])],
        ['含义', plain('后一个任务依赖前一个任务的产出。')],
      ] }),
      ...both,
    ])
  }
  const mission = data.missions.find(candidate => edge.to.startsWith('mission:') && missionId(candidate.id) === edge.to)
  return h('div', { className: 'dkc-detail' }, [
    title,
    mission === undefined ? null : h(Facts, { key: 'facts', rows: [['任务状态', h(Tag, { key: 'tag', tone: missionTone(mission) }, missionLabel(mission))]] }),
    ...both,
  ])
}

/** Whether a message ran between the two ends of a pair, either way. */
function between(message, pair) {
  const [a, b] = pair
  const key = name => (name === 'tower' ? 'tower' : agentId(name))
  const from = key(message.from)
  const to = key(message.to)
  return (from === a && to === b) || (from === b && to === a)
}

/** The message stream, newest first. */
function Messages({ graph, pair, onClearPair, onSelect }) {
  const data = graph.data
  const messages = pair === null ? data.messages : data.messages.filter(message => between(message, pair))
  // The card a row leads to: who it was sent to, else who sent it, else the tower.
  const pick = message => {
    const to = message.to === 'tower' ? 'tower' : agentId(message.to)
    if (to === 'tower' || graph.nodes.some(node => node.id === to)) return to
    const from = message.from === 'tower' ? 'tower' : agentId(message.from)
    if (from === 'tower' || graph.nodes.some(node => node.id === from)) return from
    return undefined
  }
  return h('div', { className: 'dkc-detail' }, [
    h('div', { key: 'bar', className: 'dkc-list-bar' }, [
      h('span', { key: 'count' }, `${messages.length} 条 · 最新在前`),
      pair === null ? null : h('button', {
        key: 'clear',
        type: 'button',
        className: 'dkc-chip',
        'aria-label': '取消筛选，查看全部消息',
        onClick: onClearPair,
      }, [`${labelOf(pair[0])} ↔ ${labelOf(pair[1])}`, ' ✕']),
    ]),
    messages.length === 0
      ? h('div', { key: 'empty', className: 'dkc-empty-panel' }, h('b', {}, pair === null ? '暂无消息' : '这两方之间没有消息'))
      : h('ul', { key: 'list', className: 'dkc-list' }, messages.slice().reverse().map(message => {
        const target = pick(message)
        return h('li', {
          key: message.id === '' ? `${message.sentAt}${message.subject}` : message.id,
          'data-href': '1',
          'data-unread': message.unread ? '1' : '0',
          onClick: () => onSelect(target ?? 'tower'),
        }, [
          h('span', { key: 'time', className: 'dkc-time' }, formatClock(message.sentAt)),
          h('span', { key: 'unread', className: 'dkc-dot', 'data-unread': message.unread ? '1' : '0', 'aria-label': message.unread ? '未读' : '已读' }),
          h('span', { key: 'main', className: 'dkc-main' }, [
            h('span', { key: 'route', className: 'dkc-sub' }, `${endpoint(message.from, data)} → ${endpoint(message.to, data)}`),
            h('span', { key: 'subject' }, message.subject === '' ? '（无主题）' : message.subject),
            message.action === '' && message.scope === '' ? null : h('span', { key: 'tags', className: 'dkc-sub' },
              [message.action, message.scope].filter(part => part !== '').join(' · ')),
          ]),
        ])
      })),
  ])
}

/** The latest review of every mission that has one. */
function Reviews({ graph, onSelect }) {
  const reviewed = graph.data.missions.filter(mission => mission.review !== undefined)
  return h('div', { className: 'dkc-detail' }, [
    h('div', { key: 'bar', className: 'dkc-list-bar' }, h('span', {}, `${reviewed.length} 个任务有评审记录`)),
    reviewed.length === 0
      ? h('div', { key: 'empty', className: 'dkc-empty-panel' }, h('b', {}, '暂无评审记录'), '任务完成后，评审结果会出现在这里。')
      : h('ul', { key: 'list', className: 'dkc-list' }, reviewed.map(mission => h('li', {
          key: mission.id,
          'data-href': '1',
          onClick: () => onSelect(missionId(mission.id)),
        }, [
          h('span', { key: 'main', className: 'dkc-main' }, [
            h('span', { key: 'title' }, `${mission.id} ${mission.title}`),
            h('span', { key: 'sub', className: 'dkc-sub' }, [
              `第 ${Math.max(1, mission.review.round)} 轮`,
              reviewLabel(mission.review.status),
              MERGE_LABEL[mission.review.merge] ?? mission.review.merge,
              mission.review.reviewer,
              formatStamp(mission.review.at),
            ].filter(part => part !== '' && part !== undefined).join(' · ')),
          ]),
          h('span', { key: 'tone', className: 'dkc-list-tag' }, h(Tag, {
            key: 'tag',
            tone: mission.review.status === 'clean' ? 'running' : mission.review.status === '' ? 'plain' : 'warn',
          }, reviewLabel(mission.review.status))),
        ]))),
  ])
}

/** The activity log, in the order the tower wrote it. */
function Activity({ graph }) {
  const lines = graph.data.activity
  return h('div', { className: 'dkc-detail' }, [
    h('div', { key: 'bar', className: 'dkc-list-bar' }, h('span', {}, `${lines.length} 行 · 最早在前`)),
    lines.length === 0
      ? h('div', { key: 'empty', className: 'dkc-empty-panel' }, h('b', {}, '暂无活动日志'))
      : h('ol', { key: 'list', className: 'dkc-activity' }, lines.map((line, index) => h('li', { key: index }, [
          h('span', { key: 'n', className: 'dkc-idx' }, String(index + 1)),
          h('span', { key: 'line' }, line),
        ]))),
  ])
}

/**
 * The panel.
 *
 * @param props - `{ graph, selectedId, tab, onTab, messagePair, onClearPair,
 *   onSelect, onOpenAgent, now }`. `messagePair` narrows the message stream to
 *   two endpoints; `onTab(id, pair?)` switches tabs; `now` is the current time
 *   in ms, for the running durations.
 * @returns the panel element.
 */
export function CanvasPanel(props) {
  const { graph, selectedId, tab, onTab, messagePair, onClearPair, onSelect, onOpenAgent, now } = props
  const counts = {
    messages: graph.stats.unread,
    reviews: graph.data.missions.filter(mission => mission.review !== undefined).length,
    log: graph.data.activity.length,
  }
  const active = TABS.includes(tab) ? tab : 'detail'

  const onTabKey = event => {
    const index = TABS.indexOf(active)
    let next = null
    if (event.key === 'ArrowRight') next = TABS[(index + 1) % TABS.length]
    else if (event.key === 'ArrowLeft') next = TABS[(index + TABS.length - 1) % TABS.length]
    else if (event.key === 'Home') next = TABS[0]
    else if (event.key === 'End') next = TABS[TABS.length - 1]
    if (next === null) return
    event.preventDefault()
    onTab(next)
    event.currentTarget.querySelector(`#dkc-tab-${next}`)?.focus()
  }

  // Missions are drawn as groups, everything else as a node.
  const node = selectedId === null ? undefined
    : graph.nodes.find(candidate => candidate.id === selectedId) ?? graph.groups.find(candidate => candidate.id === selectedId)
  const edge = selectedId === null || node !== undefined ? undefined : graph.edges.find(candidate => candidate.id === selectedId)
  const body = active === 'messages'
    ? h(Messages, { key: 'messages', graph, pair: messagePair, onClearPair, onSelect })
    : active === 'reviews'
      ? h(Reviews, { key: 'reviews', graph, onSelect })
      : active === 'log'
        ? h(Activity, { key: 'log', graph })
        : node === undefined && edge === undefined
          ? h(Overview, { key: 'overview', graph, towerSelected: selectedId === 'tower' })
          : node === undefined
            ? h(EdgeDetail, { key: 'edge', graph, edge, onSelect, onTab })
            : node.type === 'agent'
              ? h(AgentDetail, { key: 'agent', graph, node, now, onSelect, onOpenAgent })
              : node.type === 'mission'
                ? h(MissionDetail, { key: 'mission', graph, mission: node.mission, now, onSelect, onOpenAgent })
                : h(Overview, { key: 'overview', graph, towerSelected: selectedId === 'tower' })

  // The lists are re-read from the top whenever another tab is opened.
  const bodyRef = useRef(null)
  const opened = useRef(active)
  useEffect(() => {
    if (opened.current === active) return
    opened.current = active
    if (bodyRef.current !== null) bodyRef.current.scrollTop = 0
  }, [active])

  return h('aside', { className: 'dkc-panel', 'aria-label': '详情面板' }, [
    h('div', {
      key: 'tabs',
      className: 'dkc-panel-tabs',
      role: 'tablist',
      'aria-label': '面板内容',
      onKeyDown: onTabKey,
    }, TABS.map(id => h('button', {
      key: id,
      type: 'button',
      role: 'tab',
      id: `dkc-tab-${id}`,
      'aria-selected': active === id ? 'true' : 'false',
      'aria-controls': 'dkc-tabpanel',
      tabIndex: active === id ? 0 : -1,
      onClick: () => onTab(id),
    }, [
      TAB_LABEL[id],
      counts[id] > 0 && (id !== 'messages' || messagePair === null)
        ? h('span', { key: 'count', className: 'dkc-tab-count' }, counts[id] > 99 ? '99+' : String(counts[id]))
        : null,
    ]))),
    h('div', {
      key: 'body',
      ref: bodyRef,
      className: 'dkc-panel-body',
      role: 'tabpanel',
      id: 'dkc-tabpanel',
      'aria-labelledby': `dkc-tab-${active}`,
    }, body),
  ])
}
