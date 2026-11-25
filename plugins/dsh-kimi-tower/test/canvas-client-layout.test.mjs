/**
 * Canvas layout: the pure snapshot → nodes / groups / edges function.
 *
 * These tests pin what the overlay relies on and cannot check itself:
 *
 *  - the layout is deterministic (order of the snapshot never matters),
 *  - what is drawn for each kind of mission, agent and message,
 *  - the geometry: no two cards overlap, cards sit inside their group, and no
 *    wire or wire label passes through a card.
 *
 * The snapshots are synthetic. Paths are relative and no session content is
 * real.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { compareNatural, formatClock, formatStamp, reviewLabel } from '../src/canvas/labels.js'
import { CANVAS_DENSITIES, CANVAS_FILTERS, layoutCanvas } from '../src/canvas/layout.js'
import { fitLine, textWidth, wrapLines } from '../src/canvas/measure.js'

// ---------------------------------------------------------------- fixture ---

const T0 = '2026-11-24T10:00:00.000Z'

function mission(id, extra) {
  return {
    id,
    title: `任务 ${id}`,
    kind: 'build',
    status: 'active',
    state: 'running',
    owner: '',
    agentId: '',
    branch: `feat/${id.toLowerCase()}`,
    worktreePath: `.tower/worktrees/wt-${id.slice(1)}`,
    tasksDone: 0,
    tasksTotal: 0,
    startedAt: T0,
    elapsedMs: 0,
    live: false,
    deps: [],
    scope: [],
    tasks: [],
    blockers: [],
    notes: [],
    keyArtifacts: [],
    ...extra,
  }
}

function agent(name, extra) {
  return {
    name,
    kind: 'worker',
    agentId: `session-${name}`,
    spawnedAt: T0,
    live: true,
    model: 'model-a',
    effort: 'high',
    ...extra,
  }
}

function message(id, from, to, extra) {
  // One message per second, in id order.
  return { id: String(id), from, to, subject: `消息 ${id}`, sentAt: `2026-11-24T10:00:${String(id % 60).padStart(2, '0')}.000Z`, read: true, ...extra }
}

const TASKS = [
  { text: '布局纯函数模块', done: true },
  { text: '节点单测覆盖依赖、归属、消息边、已合并/已放弃与空状态', done: true },
  { text: '全屏视图：portal、焦点陷阱、小地图、图例', done: false },
  { text: '右侧详情面板与三个只读列表', done: false, dropped: false },
  { text: '已砍掉的一项', done: false, dropped: true },
]

/**
 * A fleet that covers every state the canvas has to draw.
 *
 * Running, offline, blocked, paused, merged and abandoned missions; a
 * dependency chain and a fan-in; a worker replaced after it died; a reviewer;
 * a reviewer whose mission is not on the canvas; tower, peer and broadcast
 * messages.
 */
function fleetSnapshot() {
  return {
    active: true,
    sessionId: 'session-tower',
    base: 'feat/tower-import',
    running: 2,
    missions: [
      mission('M1', { title: '导入 dsh-kimi-tower 0.1.1', status: 'merged', state: 'done', owner: 'worker-import', agentId: 'session-worker-import', tasksDone: 3, tasksTotal: 3, scope: ['plugins/dsh-kimi-tower/**'], tasks: TASKS.slice(0, 3).map(task => ({ ...task, done: true })) }),
      mission('M2', { title: '对齐发布日期', status: 'abandoned', state: 'done', tasksTotal: 2, tasks: TASKS.slice(0, 2) }),
      mission('M3', { title: '塔台快照 detail=1 数据', owner: 'worker-host', agentId: 'session-worker-host', live: true, tasksDone: 2, tasksTotal: 4, tasks: TASKS.slice(0, 4), scope: ['src/status.ts', 'src/index.ts', 'test/status.test.mjs'], notes: ['字段名以契约为准'], review: { round: 1, reviewer: 'reviewer-host', status: 'p1-2items', merge: 'fix-then-merge', at: '2026-11-24' } }),
      mission('M4', { title: '塔台画布客户端视图', state: 'blocked', status: 'blocked', owner: 'worker-client', agentId: 'session-worker-client', live: true, deps: ['M3'], tasksDone: 3, tasksTotal: 5, tasks: TASKS, scope: ['src/client.js', 'src/client/**', 'src/canvas/**', 'lib/client.js'], blockers: ['等待 M3 的 detail=1 契约字段确认'], context: '参考这个做个独立的ui查看界面' }),
      mission('M5', { title: '集成验证、文档与升版本', status: 'planned', state: 'waiting', deps: ['M4', 'M3'], kind: 'artifact' }),
      mission('M6', { title: '通用画布插件调研', kind: 'survey', owner: 'worker-survey', agentId: 'session-worker-survey', state: 'stale' }),
      mission('M7', { title: '发版检查', kind: 'artifact', status: 'paused', state: 'paused', owner: 'worker-release', agentId: 'session-worker-release', deps: ['M5'] }),
    ],
    agents: [
      agent('worker-import', { missionId: 'M1', live: false, diedAt: '2026-11-24T10:30:00.000Z', deathStatus: 'completed' }),
      agent('worker-host', { missionId: 'M3', model: 'model-b' }),
      agent('reviewer-host', { kind: 'reviewer', reviewMissionId: 'M3', reviewTarget: 'feat/m3' }),
      agent('worker-client', { missionId: 'M4' }),
      agent('worker-client-1', { missionId: 'M4', live: false, diedAt: '2026-11-24T11:00:00.000Z', deathStatus: 'error', deathReason: '上下文超限，已由 worker-client 接替' }),
      agent('worker-survey', { missionId: 'M6', live: false, diedAt: '2026-11-24T11:30:00.000Z', deathStatus: 'error', deathReason: '进程退出' }),
      agent('worker-release', { missionId: 'M7', live: false }),
      agent('reviewer-unknown', { kind: 'reviewer', reviewTarget: 'feat/not-on-canvas' }),
    ],
    messages: [
      message(1, 'tower', 'worker-host', { subject: 'contract-update: findings fields', action: 'contract-update' }),
      message(2, 'worker-host', 'tower', { subject: 'clarify-request: review.at 的格式' }),
      message(3, 'tower', 'worker-host', { subject: 're: clarify-request', read: false, unreadBy: ['worker-host'] }),
      message(4, 'worker-client', 'tower', { subject: 'M4 进度' }),
      message(5, 'tower', 'all', { subject: 'broadcast: 统一用相对路径', read: false }),
      message(6, 'reviewer-host', 'tower', { subject: 'review-result: M3 第 1 轮' }),
      message(7, 'worker-client', 'reviewer-host', { subject: 'peer: 画布契约' }),
      message(8, 'tower', 'someone-else', { subject: 'to a name that is not on the canvas' }),
      message(9, 'worker-release', 'worker-client', { subject: 'peer: 发版依赖画布' }),
      message(10, 'reviewer-host', 'worker-client', { subject: 're: peer: 画布契约' }),
      message(11, 'tower', 'worker-client', { subject: 'steer: 先交布局模块', read: false }),
    ],
    findings: [
      { title: '旧快照过滤掉了已合并任务', type: 'bug', severity: 'low', location: 'src/status.ts', missionId: 'M3', createdAt: '2026-11-24' },
      { title: '停止按钮没有防重复点击', type: 'improve', severity: 'medium', location: 'src/client.js', createdAt: '2026-11-24T11:00:00.000Z' },
    ],
    activity: ['tower: init', 'M3 worker-host spawned', 'M4 blocked by contract'],
  }
}

/** An active tower with no mission at all. */
function emptySnapshot() {
  return { active: true, sessionId: 'session-tower', base: 'main', running: 0, missions: [], agents: [], messages: [], findings: [], activity: [] }
}

/** A seeded PRNG, so the stress fleet is the same on every run. */
function prng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** A larger fleet: ten missions, extra agents, sixty messages. */
function stressSnapshot(seed = 7) {
  const random = prng(seed)
  const pick = list => list[Math.floor(random() * list.length)]
  const statuses = ['active', 'active', 'blocked', 'paused', 'completed', 'merged', 'abandoned', 'planned']
  const missions = []
  const agents = []
  for (let index = 1; index <= 10; index += 1) {
    const id = `M${index}`
    const status = pick(statuses)
    const deps = []
    for (let dep = 1; dep < index; dep += 1) if (random() < 0.25) deps.push(`M${dep}`)
    const live = status === 'active'
    missions.push(mission(id, {
      title: `压力测试任务 ${id} ${'画布布局与连线路由'.repeat(index % 3)}`,
      status,
      state: status === 'planned' ? 'waiting' : status === 'active' ? (live ? 'running' : 'stale')
        : status === 'blocked' ? 'blocked' : status === 'paused' ? 'paused' : 'done',
      owner: live ? `worker-${id}` : '',
      live,
      deps,
      scope: ['src/**', 'test/**', 'docs/**'].slice(0, 1 + Math.floor(random() * 3)),
      tasks: TASKS.slice(0, 1 + Math.floor(random() * TASKS.length)),
      blockers: random() < 0.3 ? ['等待依赖'] : [],
      notes: random() < 0.3 ? ['一条备注'] : [],
    }))
    if (live) agents.push(agent(`worker-${id}`, { missionId: id }))
    if (random() < 0.5) agents.push(agent(`worker-${id}-old`, { missionId: id, live: false, deathReason: '被接替' }))
    if (random() < 0.5) agents.push(agent(`reviewer-${id}`, { kind: 'reviewer', reviewMissionId: id, live: random() < 0.7 }))
  }
  const names = ['tower', ...agents.map(entry => entry.name)]
  const messages = []
  for (let index = 1; index <= 60; index += 1) {
    messages.push(message(index, pick(names), pick(names), { read: random() < 0.7 }))
  }
  return { ...emptySnapshot(), missions, agents, messages }
}

/**
 * Every unordered list of the snapshot in reverse order: the layout must not
 * notice. The activity log, a mission's tasks, scope, blockers and notes are
 * ordered content and stay as written.
 */
function shuffled(snapshot) {
  const copy = JSON.parse(JSON.stringify(snapshot))
  for (const key of ['missions', 'agents', 'messages', 'findings']) copy[key].reverse()
  for (const mission of copy.missions) mission.deps.reverse()
  return copy
}

// -------------------------------------------------------------- geometry ----


function rectsOverlap(a, b) {
  const eps = 0.01
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps
}

/** Liang–Barsky: does the segment p0→p1 meet the rectangle inset by `inset`? */
function segmentMeetsRect(p0, p1, rect, inset) {
  const minX = rect.x + inset
  const maxX = rect.x + rect.w - inset
  const minY = rect.y + inset
  const maxY = rect.y + rect.h - inset
  let t0 = 0
  let t1 = 1
  const dx = p1[0] - p0[0]
  const dy = p1[1] - p0[1]
  const edges = [[-dx, p0[0] - minX], [dx, maxX - p0[0]], [-dy, p0[1] - minY], [dy, maxY - p0[1]]]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
  }
  return t0 <= t1
}

function pointInRect(point, rect, inset = 0) {
  return point[0] > rect.x + inset && point[0] < rect.x + rect.w - inset
    && point[1] > rect.y + inset && point[1] < rect.y + rect.h - inset
}

const label = (name, snapshot, density, filter) => `${name} [${density}/${filter}]`

/** Run the geometry invariants over every density and filter of a snapshot. */
function assertGeometry(name, snapshot) {
  for (const density of CANVAS_DENSITIES) {
    for (const filter of CANVAS_FILTERS) {
      const where = label(name, snapshot, density, filter)
      const graph = layoutCanvas(snapshot, { density, filter })
      const cards = graph.nodes
      const frames = [...graph.groups, { ...graph.tower, id: 'tower' }]

      for (let i = 0; i < cards.length; i += 1) {
        const card = cards[i]
        assert.ok(card.w > 0 && card.h > 0, `${where}: ${card.id} has a size`)
        assert.ok(Number.isFinite(card.x) && Number.isFinite(card.y), `${where}: ${card.id} is placed`)
        for (let j = i + 1; j < cards.length; j += 1) {
          assert.ok(!rectsOverlap(card, cards[j]), `${where}: ${card.id} overlaps ${cards[j].id}`)
        }
      }
      for (const group of graph.groups) {
        const cardsOfGroup = group.cardIds.map(id => cards.find(card => card.id === id))
        for (const card of cardsOfGroup) {
          assert.ok(pointInRect([card.x, card.y], group, -0.01) && pointInRect([card.x + card.w, card.y + card.h], group, -0.01),
            `${where}: ${card.id} sits outside its group ${group.id}`)
        }
        for (const other of graph.groups) {
          if (other !== group) assert.ok(!rectsOverlap(group, other), `${where}: groups ${group.id} and ${other.id} overlap`)
        }
        assert.ok(!rectsOverlap(group, graph.tower), `${where}: ${group.id} overlaps the tower`)
      }
      for (const card of cards) {
        if (card.type === 'agent') assert.ok(!rectsOverlap(card, graph.tower), `${where}: ${card.id} overlaps the tower`)
      }
      // The bounding box contains everything that is drawn.
      for (const card of cards) {
        assert.ok(pointInRect([card.x, card.y], graph.bounds) && pointInRect([card.x + card.w, card.y + card.h], graph.bounds),
          `${where}: bounds miss ${card.id}`)
      }

      const ids = new Set()
      for (const edge of graph.edges) {
        assert.ok(!ids.has(edge.id), `${where}: edge id ${edge.id} is unique`)
        ids.add(edge.id)
        for (let i = 1; i < edge.points.length; i += 1) {
          const [p0, p1] = [edge.points[i - 1], edge.points[i]]
          assert.ok(Number.isFinite(p0[0]) && Number.isFinite(p1[0]), `${where}: ${edge.id} has finite points`)
          assert.ok(p0[0] !== p1[0] || p0[1] !== p1[1], `${where}: ${edge.id} has a zero-length leg`)
          for (const card of cards) {
            assert.ok(!segmentMeetsRect(p0, p1, card, 2), `${where}: ${edge.id} crosses ${card.id} on ${JSON.stringify([p0, p1])}`)
          }
          assert.ok(graph.bounds && pointInRect(p0, graph.bounds) && pointInRect(p1, graph.bounds), `${where}: bounds miss ${edge.id}`)
        }
        for (const frame of frames) {
          assert.ok(!pointInRect(edge.labelAt, frame), `${where}: label of ${edge.id} sits on ${frame.id}`)
        }
        assert.ok(pointInRect(edge.labelAt, graph.bounds), `${where}: bounds miss the label of ${edge.id}`)
      }
    }
  }
}

const edgeIndex = graph => new Map(graph.edges.map(edge => [edge.id, edge]))
const nodeIndex = graph => new Map(graph.nodes.map(node => [node.id, node]))

/** Whether each column's groups are stacked top to bottom, in row order. */
function graphInOrder(graph) {
  return ['left', 'right'].every(side => {
    const groups = graph.groups.filter(group => group.side === side)
    return groups.every((group, index) => {
      const above = groups[index - 1]
      return above === undefined || (group.row === above.row + 1 && group.y >= above.y + above.h)
    })
  })
}

// ---------------------------------------------------------------- tests -----

test('canvas layout is deterministic and blind to the order of the snapshot', () => {
  const snapshot = fleetSnapshot()
  for (const density of CANVAS_DENSITIES) {
    const first = layoutCanvas(snapshot, { density })
    const again = layoutCanvas(JSON.parse(JSON.stringify(snapshot)), { density })
    assert.deepEqual(again, first)
    assert.deepEqual(layoutCanvas(shuffled(snapshot), { density }), first)
    assert.deepEqual(layoutCanvas(snapshot, { density: 'nope', filter: 'nope' }), layoutCanvas(snapshot))
  }
  assert.notDeepEqual(layoutCanvas(snapshot, { density: 'detail' }), layoutCanvas(snapshot, { density: 'summary' }))
})

test('a mission with no state gets one from its status and liveness', () => {
  const snapshot = {
    ...emptySnapshot(),
    missions: [
      mission('M1', { status: 'planned' }),
      mission('M2', { status: 'active', live: true }),
      mission('M3', { status: 'active', live: false }),
      mission('M4', { status: 'completed' }),
    ],
  }
  delete snapshot.missions[0].state
  for (const entry of snapshot.missions) delete entry.state
  const states = Object.fromEntries(layoutCanvas(snapshot).groups.map(group => [group.missionId, group.mission.state]))
  assert.deepEqual(states, { M1: 'waiting', M2: 'running', M3: 'stale', M4: 'done' })
})

test('dependency wires follow dependency order and never leave one column', () => {
  const snapshot = fleetSnapshot()
  const graph = layoutCanvas(snapshot)
  const groups = new Map(graph.groups.map(group => [group.missionId, group]))
  const edges = edgeIndex(graph)

  const deps = graph.edges.filter(edge => edge.type === 'dep')
  assert.deepEqual(deps.map(edge => `${edge.from}→${edge.to}`).sort(), [
    'mission:M3→mission:M4', 'mission:M3→mission:M5', 'mission:M4→mission:M5', 'mission:M5→mission:M7',
  ])
  for (const edge of deps) {
    const from = groups.get(edge.from.slice(8))
    const to = groups.get(edge.to.slice(8))
    assert.equal(from.side, to.side, `${edge.id} stays in one column`)
    assert.ok(to.row > from.row, `${edge.id} points down the column`)
    assert.ok(from.y + from.h <= to.y, `${edge.id}: the prerequisite is above the dependent`)
    // The arrow leaves the bottom of the prerequisite and enters the top of the dependent.
    const [start, end] = [edge.points[0], edge.points[edge.points.length - 1]]
    assert.ok(Math.abs(start[1] - (from.y + from.h)) < 0.01)
    assert.ok(Math.abs(end[1] - to.y) < 0.01)
  }
  // The chain M3 → M4 → M5 → M7 is one column, in that order.
  assert.deepEqual(['M3', 'M4', 'M5', 'M7'].map(id => [groups.get(id).side, groups.get(id).row].join(':')),
    Array.from({ length: 4 }, (_, index) => `${groups.get('M3').side}:${groups.get('M3').row + index}`))

  // A merged prerequisite reads as satisfied, an abandoned one as blocking.
  assert.equal(edges.get('dep:M4:M5').state, 'blocked')
  assert.equal(edgeIndex(layoutCanvas({ ...snapshot, missions: snapshot.missions.map(entry => (entry.id === 'M4' ? { ...entry, status: 'merged' } : entry)) })).get('dep:M4:M5').state, 'done')
})

test('every mission is dispatched from the tower, coloured by its state', () => {
  const graph = layoutCanvas(fleetSnapshot())
  const dispatch = graph.edges.filter(edge => edge.type === 'dispatch')
  assert.equal(dispatch.length, 7)
  for (const edge of dispatch) {
    assert.equal(edge.from, 'tower')
    assert.equal(edge.label, '派发')
    const group = graph.groups.find(candidate => `mission:${candidate.missionId}` === edge.to)
    assert.equal(edge.state, group.mission.state)
    assert.ok(Math.abs(edge.points[0][0]) === graph.tower.w / 2, `${edge.id} starts on the tower edge`)
    assert.ok(edge.points[edge.points.length - 1][0] === (group.side === 'left' ? group.x + group.w : group.x),
      `${edge.id} ends on the group's inner edge`)
    assert.ok(group.side === 'left' ? edge.points[0][0] < 0 : edge.points[0][0] > 0)
  }
  assert.deepEqual(graph.edges.filter(edge => edge.type === 'dispatch').map(edge => edge.state).sort(),
    ['blocked', 'done', 'done', 'paused', 'running', 'stale', 'waiting'])
})

test('workers and reviewers sit beside their mission, wired as 拥有 / 曾负责 / 评审', () => {
  const graph = layoutCanvas(fleetSnapshot())
  const nodes = nodeIndex(graph)
  const groups = new Map(graph.groups.map(group => [group.missionId, group]))
  const own = edgeIndex(graph)

  const m4 = groups.get('M4')
  assert.deepEqual(m4.agents, ['worker-client', 'worker-client-1'])
  assert.equal(nodes.get('agent:worker-client').role, 'owner')
  assert.equal(nodes.get('agent:worker-client-1').role, 'former')
  assert.equal(own.get('own:M4:worker-client').state, 'blocked')
  assert.equal(own.get('own:M4:worker-client').label, '拥有')
  assert.equal(own.get('former:M4:worker-client-1').label, '曾负责')
  assert.equal(own.get('former:M4:worker-client-1').state, 'stale')
  // The current owner is stacked above the agent that held the mission before.
  assert.ok(nodes.get('agent:worker-client').y < nodes.get('agent:worker-client-1').y)

  assert.equal(nodes.get('agent:reviewer-host').role, 'reviewer')
  // Bound through reviewMissionId, but shown beside the mission it reviews.
  assert.equal(nodes.get('agent:reviewer-host').missionId, 'M3')
  assert.equal(own.get('review:M3:reviewer-host').label, '评审')
  assert.equal(own.get('review:M3:reviewer-host').from, 'agent:reviewer-host')
  assert.equal(own.get('review:M3:reviewer-host').to, 'mission:M3')
  assert.equal(own.get('review:M3:reviewer-host').state, 'running')
  assert.equal(own.has('own:M3:reviewer-host'), false)

  // Every attached agent is in its mission's row, on the outer side of the group.
  for (const node of graph.nodes.filter(candidate => candidate.type === 'agent')) {
    if (!groups.has(node.missionId) && node.reviewMissionId === '' && node.name !== 'reviewer-unknown') {
      assert.fail(`${node.id} lost its mission`)
    }
    const group = [...groups.values()].find(candidate => candidate.agents.includes(node.name))
    if (group === undefined) {
      assert.equal(node.name, 'reviewer-unknown')
      continue
    }
    assert.equal(node.side, group.side)
    assert.equal(node.row, group.row)
    assert.ok(node.side === 'left' ? node.x + node.w < group.x : node.x > group.x + group.w, `${node.id} sits outside its group`)
    const wire = graph.edges.find(edge => edge.type !== 'dispatch' && edge.type !== 'dep' && edge.type !== 'message' && edge.from === node.id)
    assert.ok(wire !== undefined, `${node.id} is wired to its mission`)
    assert.equal(wire.to, group.id)
  }
})

test('a reviewer is bound by its branch when it names no mission', () => {
  const snapshot = fleetSnapshot()
  const graph = layoutCanvas({
    ...snapshot,
    agents: snapshot.agents.map(entry => (entry.name === 'reviewer-host' ? { ...entry, reviewMissionId: '', reviewTarget: 'feat/m3' } : entry)),
  })
  assert.ok(graph.groups.find(group => group.missionId === 'M3').agents.includes('reviewer-host'))
})

test('message wires aggregate per pair and skip broadcasts and unknown names', () => {
  const graph = layoutCanvas(fleetSnapshot())
  const wires = graph.edges.filter(edge => edge.type === 'message')
  const byId = edgeIndex(graph)
  /** The id of the wire between two endpoints (the tower or agent names). */
  const key = (a, b) => `message:${[a, b].map(name => (name === 'tower' ? 'tower' : `agent:${name}`)).sort().join('|')}`

  // worker-host ↔ tower is three messages over one wire, pointing at the worker
  // (it received two, sent one) and carrying the latest, unread message.
  const host = byId.get(key('tower', 'worker-host'))
  assert.ok(host !== undefined, 'the tower ↔ worker-host wire exists')
  assert.equal(host.count, 3)
  assert.equal(host.label, '消息 ×3')
  assert.equal(host.from, 'tower')
  assert.equal(host.to, 'agent:worker-host')
  assert.equal(host.bidirectional, true)
  assert.equal(host.unread, true)
  assert.equal(host.latest.subject, 're: clarify-request')
  assert.equal(host.state, 'message')

  // worker-client → reviewer-host and the reply share one wire, both ways.
  const peer = byId.get(key('worker-client', 'reviewer-host'))
  assert.equal(peer.count, 2)
  assert.equal(peer.bidirectional, true)

  // A one-way message points at its receiver.
  const release = byId.get(key('worker-release', 'worker-client'))
  assert.equal(release.from, 'agent:worker-release')
  assert.equal(release.to, 'agent:worker-client')
  assert.equal(release.bidirectional, false)
  assert.equal(release.unread, false)

  const ids = wires.map(edge => edge.id).sort()
  assert.deepEqual(ids, [host.id, peer.id, release.id, byId.get(key('tower', 'worker-client')).id, byId.get(key('tower', 'reviewer-host')).id].sort())
  assert.equal(wires.length, 5, 'five pairs, five wires')
  // The broadcast and the unknown recipient drew nothing.
  assert.equal(byId.has('message:tower|all'), false)
  assert.equal(wires.some(edge => edge.id.includes('someone-else')), false)
  // Every wire starts and ends on a card, and both ends are drawn.
  const nodes = nodeIndex(graph)
  for (const wire of wires) {
    for (const [end, point] of [[wire.from, wire.points[0]], [wire.to, wire.points[wire.points.length - 1]]]) {
      const node = end === 'tower' ? graph.tower : nodes.get(end)
      assert.ok(node !== undefined, `${wire.id} ends on ${end}`)
      const onEdge = Math.abs(point[0] - node.x) < 0.01 || Math.abs(point[0] - (node.x + node.w)) < 0.01
      assert.ok(onEdge && point[1] > node.y && point[1] < node.y + node.h, `${wire.id} touches the edge of ${end}`)
    }
  }
  assert.equal(graph.stats.unread, 3)
})

test('unreadBy is optional and wins over read when the Host sends it', () => {
  const base = emptySnapshot()
  const snapshot = {
    ...base,
    missions: [mission('M1', { live: true, owner: 'w' })],
    agents: [agent('w', { missionId: 'M1' })],
    messages: [message(1, 'tower', 'w', { read: false, unreadBy: [] })],
  }
  assert.equal(layoutCanvas(snapshot).edges.find(edge => edge.type === 'message').unread, false)
  const legacy = { ...snapshot, messages: [message(1, 'tower', 'w', { read: false })] }
  assert.equal(layoutCanvas(legacy).edges.find(edge => edge.type === 'message').unread, true)
})

test('merged and abandoned missions are drawn under 全部 and dropped under 未完成', () => {
  const snapshot = fleetSnapshot()
  const all = layoutCanvas(snapshot, { filter: 'all' })
  const open = layoutCanvas(snapshot, { filter: 'open' })
  // Groups come in reading order of the picture (left column, then right).
  const ids = graph => graph.groups.map(group => group.missionId).sort(compareNatural)
  assert.deepEqual(ids(all), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7'])
  assert.deepEqual(ids(open), ['M3', 'M4', 'M5', 'M6', 'M7'])
  assert.ok(graphInOrder(all), 'groups of a column stack top to bottom')
  for (const side of ['left', 'right']) {
    const rows = all.rows.filter(row => row.side === side)
    assert.deepEqual(rows.map(row => row.index), rows.map((_, index) => index))
    for (let index = 1; index < rows.length; index += 1) assert.ok(rows[index].top >= rows[index - 1].bottom)
  }
  for (const id of ['M1', 'M2']) {
    const group = all.groups.find(candidate => candidate.missionId === id)
    assert.equal(group.mission.state, 'done')
  }
  assert.equal(all.groups.find(group => group.missionId === 'M1').mission.status, 'merged')
  assert.equal(all.groups.find(group => group.missionId === 'M2').mission.status, 'abandoned')
  assert.equal(all.stats.missions, 7)
  assert.equal(all.stats.shown, 7)
  assert.equal(open.stats.shown, 5)
  assert.deepEqual(open.edges.filter(edge => edge.type === 'dep').map(edge => edge.id), ['dep:M3:M4', 'dep:M3:M5', 'dep:M4:M5', 'dep:M5:M7'])
  // The dead worker of a merged mission is still on the canvas, as 已离线.
  assert.ok(nodeIndex(all).has('agent:worker-import'))
  assert.equal(nodeIndex(all).get('agent:worker-import').live, false)
})

test('被阻塞 keeps the blocked missions and the agents beside them', () => {
  const graph = layoutCanvas(fleetSnapshot(), { filter: 'blocked' })
  assert.deepEqual(graph.groups.map(group => group.missionId), ['M4'])
  // The agents of hidden missions are hidden with them, so their wires go too.
  assert.deepEqual(graph.nodes.filter(node => node.type === 'agent').map(node => node.name), ['worker-client', 'worker-client-1'])
  assert.deepEqual(graph.edges.map(edge => edge.id).sort(), [
    'dispatch:M4', 'former:M4:worker-client-1', 'message:agent:worker-client|tower', 'own:M4:worker-client',
  ])
  assert.equal(graph.stats.shown, 1)
  assert.equal(graph.stats.missions, 7)
})

test('an active tower with no mission is the tower alone', () => {
  for (const density of CANVAS_DENSITIES) {
    const graph = layoutCanvas(emptySnapshot(), { density })
    assert.equal(graph.active, true)
    assert.deepEqual(graph.nodes.map(node => node.id), ['tower'])
    assert.deepEqual(graph.groups, [])
    assert.deepEqual(graph.rows, [])
    assert.deepEqual(graph.edges, [])
    assert.deepEqual(graph.tower.ports, { left: [], right: [] })
    assert.ok(graph.bounds.w >= graph.tower.w && graph.bounds.h >= graph.tower.h)
    assert.ok(graph.bounds.x < graph.tower.x && graph.bounds.x + graph.bounds.w > graph.tower.x + graph.tower.w)
    assert.equal(graph.stats.missions, 0)
  }
  // No filter change and no density change turns that into something else.
  assert.equal(layoutCanvas(emptySnapshot(), { filter: 'blocked' }).nodes.length, 1)
})

test('a filter that matches nothing draws the tower alone, under a full snapshot', () => {
  const snapshot = { ...emptySnapshot(), missions: [mission('M1', { status: 'merged', state: 'done', owner: 'w' })], agents: [agent('w', { missionId: 'M1' })] }
  const graph = layoutCanvas(snapshot, { filter: 'blocked' })
  assert.deepEqual(graph.nodes.map(node => node.id), ['tower'])
  assert.deepEqual(graph.edges, [])
  assert.equal(graph.stats.missions, 1)
})

test('an inactive or missing snapshot still lays out a lone tower', () => {
  for (const snapshot of [null, undefined, {}, { active: false }, { active: true, missions: 'nope' }]) {
    const graph = layoutCanvas(snapshot)
    assert.deepEqual(graph.nodes.map(node => node.id), ['tower'])
    assert.deepEqual(graph.edges, [])
    assert.ok(Number.isFinite(graph.bounds.w))
  }
  assert.equal(layoutCanvas({ active: false }).active, false)
})

test('detail density adds the task and scope cards with their lines pre-broken', () => {
  const summary = layoutCanvas(fleetSnapshot(), { density: 'summary' })
  const detail = layoutCanvas(fleetSnapshot(), { density: 'detail' })
  assert.equal(summary.nodes.some(node => node.type === 'tasks' || node.type === 'scope'), false)
  assert.equal(detail.nodes.filter(node => node.type === 'tasks').length, 7)
  assert.equal(detail.nodes.filter(node => node.type === 'scope').length, 7)
  const nodes = nodeIndex(detail)
  const m4 = detail.groups.find(group => group.missionId === 'M4')
  assert.deepEqual(m4.cardIds, ['tasks:M4', 'scope:M4'])
  const tasks = nodes.get('tasks:M4')
  assert.equal(tasks.items.length, 5)
  assert.deepEqual(tasks.items.map(item => item.done), [true, true, false, false, false])
  assert.equal(tasks.items[4].dropped, true)
  assert.equal(tasks.more, 0)
  assert.ok(tasks.items[1].lines.length >= 2, 'a long task text wraps')
  for (const item of tasks.items) {
    for (const line of item.lines) assert.ok(textWidth(line, 12) <= tasks.w - 20 - 22 + 0.5, `"${line}" fits the task card`)
  }
  const scope = nodes.get('scope:M4')
  assert.deepEqual(scope.items, ['src/client.js', 'src/client/**', 'src/canvas/**', 'lib/client.js'])
  assert.ok(m4.title.lines.length >= 1 && m4.title.lines.length <= 2)
  assert.ok(m4.flags.lines.join(' ').includes('阻塞 1'))
  assert.ok(m4.flags.lines.join(' ').includes('评审') === false)
  // A survey mission reserves nothing and says so.
  assert.equal(nodes.get('scope:M6').empty, true)
  // Detail cards are taller than summary groups, and nothing collides.
  assert.ok(m4.h > summary.groups.find(group => group.missionId === 'M4').h)
})

test('a long list of tasks or globs is cut and counted on the card', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({ text: `任务 ${index}`, done: index < 3 }))
  const snapshot = { ...emptySnapshot(), missions: [mission('M1', { tasks: many, scope: Array.from({ length: 12 }, (_, index) => `dir${index}/**`) })] }
  const nodes = nodeIndex(layoutCanvas(snapshot, { density: 'detail' }))
  assert.equal(nodes.get('tasks:M1').items.length, 7)
  assert.equal(nodes.get('tasks:M1').more, 5)
  assert.equal(nodes.get('scope:M1').items.length, 7)
  assert.equal(nodes.get('scope:M1').more, 5)
})

test('agents that resolve to no mission get a row of their own', () => {
  const graph = layoutCanvas(fleetSnapshot())
  const node = nodeIndex(graph).get('agent:reviewer-unknown')
  assert.ok(node !== undefined)
  assert.equal(node.role, 'reviewer')
  const row = graph.rows.find(candidate => candidate.agentIds.includes(node.id))
  assert.equal(row.groupId, null)
  assert.deepEqual(row.agentIds, [node.id])
  assert.equal(row.side, 'right')
  assert.equal(graph.edges.some(edge => edge.from === node.id || edge.to === node.id), false)
})

test('the tower grows to give every wire its own port', () => {
  const graph = layoutCanvas(stressSnapshot(), { density: 'detail' })
  for (const side of ['left', 'right']) {
    const ports = graph.tower.ports[side]
    assert.equal(new Set(ports.map(port => port.edgeId)).size, ports.length)
    const ys = ports.map(port => port.y).sort((a, b) => a - b)
    for (let i = 1; i < ys.length; i += 1) assert.ok(ys[i] - ys[i - 1] >= 7.99, `${side} ports ${ys.join(',')} are distinct`)
    for (const y of ys) assert.ok(y > graph.tower.y && y < graph.tower.y + graph.tower.h)
  }
  const edges = new Set(graph.edges.map(edge => edge.id))
  for (const port of [...graph.tower.ports.left, ...graph.tower.ports.right]) assert.ok(edges.has(port.edgeId))
})

test('no card overlaps another and no wire crosses a card', () => {
  assertGeometry('fleet', fleetSnapshot())
  assertGeometry('empty', emptySnapshot())
  assertGeometry('single', { ...emptySnapshot(), missions: [mission('M1', { live: true, owner: 'w' })], agents: [agent('w', { missionId: 'M1' })], messages: [message(1, 'tower', 'w')] })
  // A short wide stack beside a short summary group, which used to push the
  // agent centres past the ends of the group's edge.
  assertGeometry('tall stack', {
    ...emptySnapshot(),
    missions: [mission('M1'), mission('M2', { deps: ['M1'] }), mission('M3', { deps: ['M2'] })],
    agents: [
      agent('w1', { missionId: 'M1' }), agent('w2', { missionId: 'M1' }), agent('w3', { missionId: 'M1' }),
      agent('w4', { missionId: 'M1' }), agent('r5', { kind: 'reviewer', reviewMissionId: 'M1' }),
      agent('w6', { missionId: 'M3' }), agent('w7', { missionId: 'M3' }),
    ],
    messages: [1, 2, 3, 4, 5, 6, 7].map(index => message(index, 'tower', `w${index}`)),
  })
  for (const seed of [1, 7, 42, 2026]) assertGeometry(`stress ${seed}`, stressSnapshot(seed))
})

test('a dependency cycle still lays out, with every mission placed once', () => {
  const snapshot = { ...emptySnapshot(), missions: [mission('M1', { deps: ['M2'] }), mission('M2', { deps: ['M1'] })] }
  const graph = layoutCanvas(snapshot)
  assert.equal(graph.groups.length, 2)
  assert.deepEqual(graph.edges.filter(edge => edge.type === 'dep').length, 2)
  assertGeometry('cycle', snapshot)
})

test('duplicate agents and dangling dependencies are tolerated', () => {
  const snapshot = {
    ...emptySnapshot(),
    missions: [mission('M1', { deps: ['M9', 'M1'], owner: 'w' }), mission('M2', { deps: ['M1', 'M1'] })],
    agents: [agent('w', { missionId: 'M1' }), agent('w', { missionId: 'M2', live: false })],
    messages: [message(1, 'w', 'tower'), message(2, 'w', 'w'), message(3, '', 'tower')],
  }
  const graph = layoutCanvas(snapshot)
  assert.equal(graph.nodes.filter(node => node.type === 'agent').length, 1)
  assert.deepEqual(graph.edges.filter(edge => edge.type === 'dep').map(edge => edge.id), ['dep:M1:M2'])
  // A dependency named twice is one wire, and one entry where it is listed.
  assert.equal(graph.groups.find(group => group.missionId === 'M2').mission.deps.length, 1)
  assert.equal(nodeIndex(graph).get('agent:w').missionId, 'M1')
  assert.equal(graph.edges.filter(edge => edge.type === 'message').length, 1)
})

// ---------------------------------------------------------------- text ------

test('wrapLines breaks between words and between full-width characters', () => {
  assert.deepEqual(wrapLines('a short line', 200, 12), { lines: ['a short line'], more: 0 })
  const wrapped = wrapLines('alpha beta gamma delta epsilon zeta', textWidth('alpha beta gamma', 12) + 1, 12)
  assert.deepEqual(wrapped.lines, ['alpha beta gamma', 'delta epsilon zeta'])
  // Chinese breaks anywhere; an opening bracket sticks to what follows it and
  // a closing one to what precedes it.
  const cjk = wrapLines('画布布局纯函数模块', 36, 12)
  assert.deepEqual(cjk.lines, ['画布布', '局纯函', '数模块'])
  const mixed = wrapLines('先交付（canvas layout）再说', 72, 12)
  assert.deepEqual(mixed.lines, ['先交付', '（canvas', 'layout）再说'])
  // Two openers in a row both stick to the one word after them.
  assert.deepEqual(wrapLines('结果（（done））好了', 80, 12).lines, ['结果', '（（done））', '好了'])
  // One over-wide token is split by character rather than overflowing.
  const path = wrapLines('plugins/dsh-kimi-tower/src/canvas/layout.js', 96, 12, 0, true)
  assert.ok(path.lines.length > 1)
  for (const line of path.lines) assert.ok(textWidth(line, 12, true) <= 96.5)
  assert.equal(path.more, 0)
})

test('wrapLines honours maxLines and reports what it cut', () => {
  const cut = wrapLines('one two three four five six', 40, 12, 2)
  assert.equal(cut.lines.length, 2)
  assert.ok(cut.more >= 2)
  assert.deepEqual(wrapLines('', 100, 12), { lines: [], more: 0 })
  assert.deepEqual(wrapLines(undefined, 100, 12), { lines: [], more: 0 })
  assert.deepEqual(wrapLines('   ', 100, 12), { lines: [], more: 0 })
})

test('fitLine shortens with an ellipsis and never overflows', () => {
  assert.equal(fitLine('short', 200, 12), 'short')
  const fitted = fitLine('plugins/dsh-kimi-tower/src/canvas/layout.js', 120, 11, true)
  assert.ok(fitted.endsWith('…'))
  assert.ok(textWidth(fitted, 11, true) <= 120.5)
  assert.equal(fitLine('', 120, 11), '')
})

test('a text is never measured as NaN', () => {
  for (const value of ['', 'a', '中文', 'emoji 🐳 test', 'ünïcödé']) {
    assert.ok(Number.isFinite(textWidth(value, 12)))
    assert.ok(Number.isFinite(textWidth(value, 11, true, 1.04)))
  }
  assert.ok(textWidth('中文', 12) > textWidth('ab', 12))
  assert.ok(textWidth('W', 12) > textWidth('i', 12))
  assert.ok(textWidth('mmmmmmmm', 12) < textWidth('中中中中中中', 12) * 2)
})

// --------------------------------------------------------------- labels -----

test('timestamps may be instants or dates only and never render as Invalid Date', () => {
  assert.equal(formatClock('2026-11-24'), '11-24')
  assert.equal(formatStamp('2026-11-24'), '2026-11-24')
  assert.ok(/^\d{2}-\d{2} \d{2}:\d{2}$/.test(formatClock('2026-11-24T11:00:00.000Z')))
  assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(formatStamp('2026-11-24T11:00:00.000Z')))
  for (const bad of ['not a date', '2026-13-45', 42, null, undefined, '']) {
    const rendered = `${formatClock(bad)} ${formatStamp(bad)}`
    assert.ok(!rendered.includes('Invalid Date'), `"${bad}" → ${rendered}`)
  }
  assert.equal(formatClock(undefined), '')
  assert.equal(formatClock('not a date'), 'not a date')
  assert.equal(formatStamp(42), '')
})

test('review verdicts and merge recommendations read in Chinese', () => {
  assert.equal(reviewLabel('clean'), '通过')
  assert.equal(reviewLabel('p1-2items'), 'P1 问题 ×2')
  assert.equal(reviewLabel('something-else'), 'something-else')
})

test('ids sort the way a person reads them', () => {
  assert.deepEqual(['M10', 'M2', 'M1', 'worker-b', 'worker-a', 'M1-2'].sort(compareNatural), ['M1', 'M1-2', 'M2', 'M10', 'worker-a', 'worker-b'])
})
