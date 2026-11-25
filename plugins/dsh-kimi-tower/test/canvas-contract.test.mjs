/**
 * Host → client canvas contract.
 *
 * The two halves of the canvas live in different bundles: the Host builds the
 * `detail=1` snapshot (`src/canvas-snapshot.ts`, bundled into `lib/index.js`)
 * and the browser lays it out (`src/canvas/layout.js`, bundled into
 * `lib/client.js`). Each half has its own unit tests, and a green pair can
 * still disagree about a field name — which is exactly how a `model` once
 * vanished from every card without a single test noticing.
 *
 * This file closes that gap. It builds a synthetic tower repository with a
 * real `TowerStore`, asks the real `/tower/state?…&detail=1` route for the
 * body the browser would receive, and feeds that body to the real layout. The
 * assertions name concrete values rather than re-deriving them from the same
 * snapshot, so renaming a field on either side makes them fail.
 *
 * Everything is synthetic: no session transcripts, personal paths or secrets.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { TowerStore, statusRouteDefinition } from '../lib/index.js'
import { layoutCanvas } from '../src/canvas/layout.js'

const tempDirs = new Set()
let world

after(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------- fixture ---

async function makeRepo(prefix) {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), prefix)))
  tempDirs.add(dir)
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  git(['init', '-q'])
  git(['config', 'user.name', 'Canvas Contract'])
  git(['config', 'user.email', 'canvas-contract@example.test'])
  await writeFile(join(dir, 'README.md'), '# canvas contract\n')
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'init'])
  return { dir, base: git(['rev-parse', '--abbrev-ref', 'HEAD']) }
}

function commitAll(cwd, message) {
  execFileSync('git', ['add', '-A'], { cwd })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd })
}

/**
 * A Host model shaped like the real one: `current` is a prototype method that
 * reads `this`. An arrow function would never catch a lookup that detaches the
 * method from its object, which is how every model name once disappeared.
 */
class FakeModel {
  constructor(selection) {
    this.selection = selection
  }

  current() {
    return this.selection
  }
}

function selection(model, reasoningEffort) {
  return new FakeModel({ provider: 'test', model, reasoningEffort })
}

function agent(id, cwd, extra = {}) {
  return { id, status: 'idle', session: { header: { cwd } }, ...extra }
}

function makeResponse() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = body ?? ''
    },
  }
}

/** The body the browser receives for one snapshot request. */
async function fetchSnapshot(ctx, sessionId, detail) {
  const response = makeResponse()
  const query = detail ? `sessionId=${sessionId}&detail=1` : `sessionId=${sessionId}`
  await statusRouteDefinition(ctx).handler({ url: `/tower/state?${query}` }, response)
  assert.equal(response.status, 200)
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8')
  return JSON.parse(response.body)
}

async function spawn(store, mission, name, agentId, spawnedAt = new Date().toISOString()) {
  await store.registerSpawnedAgent({
    name,
    agentId,
    sessionId: 'session-main',
    kind: 'worker',
    missionId: mission.id,
    worktree: mission.worktree,
    branch: mission.branch,
    spawnedAt,
  }, { id: mission.id, owner: name })
}

/**
 * One mission per state the canvas paints — running, merged, blocked, paused,
 * abandoned, and active with a dead worker — plus a reviewer, dependencies,
 * inbox traffic in both directions, a broadcast, and a finding.
 */
async function buildWorld() {
  const { dir, base } = await makeRepo('tower-canvas-contract-')
  const store = new TowerStore(dir)
  await store.init('session-main')
  const missions = await store.plan([
    {
      title: 'Canvas login API',
      kind: 'build',
      scope: ['src/auth/**'],
      tasks: ['add login endpoint', 'add logout endpoint'],
      context: '用户原话：“登录先做最小闭环。”',
    },
    {
      title: 'Canvas auth guide',
      kind: 'build',
      scope: ['docs/auth/**'],
      tasks: ['write the auth guide'],
    },
    {
      title: 'Canvas legacy migration',
      kind: 'build',
      scope: ['src/legacy/**'],
      tasks: ['move the legacy shim'],
    },
    {
      title: 'Canvas cache cleanup',
      kind: 'survey',
      scope: [],
      tasks: ['count the stale keys'],
      deps: ['M2'],
    },
    {
      title: 'Canvas probe shelved',
      kind: 'build',
      scope: ['tools/probe/**'],
      tasks: ['probe the runtime'],
    },
    {
      title: 'Canvas stale refactor',
      kind: 'build',
      scope: ['src/core/**'],
      tasks: ['split the core module'],
      deps: ['M1'],
    },
  ])
  const [m1, m2, m3, m4, m5, m6] = missions

  // M1: running, its worker alive with a model and an effort.
  await spawn(store, m1, 'worker-1', 'session-w1')
  await store.updateMission('worker-1', m1.id, { taskDone: 'add login endpoint' })

  // M2: merged after one clean review round, so it carries review history.
  await store.addWorktree(m2.worktree, m2.branch, base)
  const worktree2 = store.abs(join('.tower/worktrees', m2.worktree))
  await mkdir(join(worktree2, 'docs/auth'), { recursive: true })
  await writeFile(join(worktree2, 'docs/auth/guide.md'), '# auth\n')
  commitAll(worktree2, 'docs: add the auth guide')
  await spawn(store, m2, 'worker-2', 'session-w2')
  await store.updateMission('worker-2', m2.id, { taskDone: 'write the auth guide' })
  await store.complete('worker-2', 'wrote the guide')
  await store.registerSpawnedAgent({
    name: 'reviewer-1',
    agentId: 'session-r1',
    sessionId: 'session-main',
    kind: 'reviewer',
    reviewTarget: m2.branch,
    reviewMissionId: m2.id,
    spawnedAt: new Date().toISOString(),
  })
  await store.submitReview('reviewer-1', {
    target: m2.branch,
    status: 'clean',
    merge: 'merge',
    findings: 'none',
    decision: 'approved',
  })
  assert.equal((await store.merge(m2.branch, { activeAgentIds: new Set() })).status, 'merged')

  // M3: blocked by its worker, which is still alive.
  await spawn(store, m3, 'worker-3', 'session-w3')
  await store.updateMission('worker-3', m3.id, { blocker: 'waiting for the M1 login contract' })

  // M4: paused by the tower.
  await spawn(store, m4, 'worker-4', 'session-w4')
  await store.updateMission('tower', m4.id, { status: 'paused' })

  // M5: abandoned.
  await store.updateMission('tower', m5.id, { status: 'abandoned' })

  // M6: active, but its worker died.
  await spawn(store, m6, 'worker-6', 'session-w6')
  const died = await store.markAgentDied('session-w6', 'error', 'turn ended with a tool failure')
  assert.ok(died.diedAt !== undefined)

  // Inbox traffic in both directions, one message the tower has not read, and
  // a broadcast that has no pair of endpoints and so must not become a wire.
  await store.send('tower', { to: 'worker-3', subject: 'check the scope first', body: 'synthetic' })
  await store.send('worker-1', { to: 'tower', subject: 'halfway there', body: 'synthetic', scope: 'M1' })
  await store.send('worker-3', { to: 'all', subject: 'status sync', body: 'synthetic' })

  await store.fileFinding('worker-3', {
    type: 'bug',
    title: 'Legacy shim double-counts',
    severity: 'medium',
    summary: 'The shim adds the same row twice.\nSecond line of the summary.',
    location: 'src/legacy/shim.ts:12',
    details: 'synthetic',
    suggestedFix: 'guard the second add',
  })

  const agents = new Map([
    ['session-main', agent('session-main', dir)],
    ['session-w1', agent('session-w1', dir, { status: 'running', model: selection('model-running', 'high') })],
    ['session-w2', agent('session-w2', dir, { status: 'idle', model: selection('model-merged', 'medium') })],
    ['session-r1', agent('session-r1', dir, { status: 'idle', model: selection('model-review', 'low') })],
    ['session-w3', agent('session-w3', dir, { status: 'running', model: selection('model-blocked', 'high') })],
    ['session-w4', agent('session-w4', dir, { status: 'running', model: selection('model-paused', 'medium') })],
    ['session-w6', agent('session-w6', dir, { status: 'error', model: selection('model-dead', 'low') })],
  ])
  const ctx = { agents: { get: (id) => agents.get(id) } }
  return { dir, base, store, ctx, missions, diedAt: died.diedAt }
}

before(async () => {
  world = await buildWorld()
})

// ------------------------------------------------------------------ tests ---

test('the detail route and the canvas layout agree on every mission, node and wire', async () => {
  const { dir, ctx, missions } = world
  const snapshot = await fetchSnapshot(ctx, 'session-main', true)

  // --- the Host half: the fields the client reads are all there -----------
  assert.equal(snapshot.active, true)
  assert.equal(snapshot.sessionId, 'session-main')
  assert.ok(snapshot.base.length > 0)
  assert.deepEqual(snapshot.missions.map((mission) => mission.id), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'])
  const byId = new Map(snapshot.missions.map((mission) => [mission.id, mission]))

  assert.deepEqual(byId.get('M1').tasks.map((task) => [task.text, task.done]), [
    ['add login endpoint', true],
    ['add logout endpoint', false],
  ])
  assert.equal(byId.get('M1').state, 'running')
  assert.equal(byId.get('M1').model, 'model-running')
  assert.equal(byId.get('M1').effort, 'high')
  assert.equal(byId.get('M2').status, 'merged')
  assert.deepEqual(byId.get('M2').deps, [])
  assert.deepEqual(byId.get('M2').review, {
    round: 1,
    reviewer: 'reviewer-1',
    status: 'clean',
    merge: 'merge',
    at: byId.get('M2').review.at,
  })
  assert.match(byId.get('M2').review.at, /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(byId.get('M3').state, 'blocked')
  assert.deepEqual(byId.get('M3').blockers, ['waiting for the M1 login contract'])
  assert.equal(byId.get('M4').state, 'paused')
  assert.equal(byId.get('M4').status, 'paused')
  assert.equal(byId.get('M5').status, 'abandoned')
  assert.equal(byId.get('M6').live, false)
  // The merged mission's worktree path is absolute, as the card needs it.
  assert.equal(byId.get('M2').worktreePath, join(dir, '.tower', 'worktrees', missions[1].worktree))

  // Every agent the roster holds, with its model and effort. This is the
  // regression the M3 review caught: a detached `current()` leaves the model
  // out of every card without failing anything.
  const agentNames = snapshot.agents.map((entry) => entry.name)
  assert.deepEqual(agentNames, ['worker-1', 'worker-2', 'reviewer-1', 'worker-3', 'worker-4', 'worker-6'])
  for (const entry of snapshot.agents) {
    assert.ok(typeof entry.model === 'string' && entry.model.length > 0, `${entry.name} model`)
    assert.ok(typeof entry.effort === 'string' && entry.effort.length > 0, `${entry.name} effort`)
  }
  const live = snapshot.agents.filter((entry) => entry.live).map((entry) => entry.name)
  assert.deepEqual(live, ['worker-1', 'worker-3', 'worker-4'])

  // --- the client half: the same tower, drawn -----------------------------
  const graph = layoutCanvas(snapshot, { density: 'detail', filter: 'all' })
  assert.equal(graph.active, true)
  assert.equal(graph.data.missions.length, snapshot.missions.length)
  assert.equal(graph.groups.length, snapshot.missions.length)
  // The rows are packed into two columns, so the group order is the layout's,
  // not the plan order; the set is what the Host's mission list decides.
  assert.deepEqual(graph.groups.map((group) => group.id).sort(), [
    'mission:M1', 'mission:M2', 'mission:M3', 'mission:M4', 'mission:M5', 'mission:M6',
  ])
  assert.deepEqual(graph.data.missions.map((mission) => mission.id), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'])

  // Every mission field the panel shows survives the crossing.
  for (const group of graph.groups) {
    const host = byId.get(group.missionId)
    const seen = group.mission
    assert.equal(seen.title, host.title)
    assert.equal(seen.kind, host.kind)
    assert.equal(seen.status, host.status)
    assert.equal(seen.state, host.state)
    assert.equal(seen.branch, host.branch)
    assert.equal(seen.worktreePath, host.worktreePath)
    assert.equal(seen.owner, host.owner ?? '')
    assert.equal(seen.model, host.model ?? '')
    assert.equal(seen.effort, host.effort ?? '')
    assert.equal(seen.live, host.live)
    assert.equal(seen.tasksDone, host.tasksDone)
    assert.equal(seen.tasksTotal, host.tasksTotal)
    assert.deepEqual(seen.tasks, host.tasks.map((task) => ({
      text: task.text,
      done: task.done === true,
      dropped: task.dropped === true,
    })))
    assert.deepEqual(seen.deps, [...host.deps].sort())
    assert.deepEqual(seen.scope, host.scope)
    assert.deepEqual(seen.blockers, host.blockers)
    assert.deepEqual(seen.notes, host.notes)
    assert.equal(seen.context, host.context)
    assert.deepEqual(seen.keyArtifacts, host.keyArtifacts)
    assert.equal(seen.review?.round, host.review?.round)
    assert.equal(seen.review?.reviewer, host.review?.reviewer)
    assert.equal(seen.review?.status, host.review?.status)
    assert.equal(seen.review?.merge, host.review?.merge)
    assert.equal(seen.review?.at, host.review?.at)
    assert.ok(group.w > 0 && group.h > 0)
  }

  // Concrete values, so a renamed Host field cannot pass by being absent on
  // both sides: these are the strings the user reads on the canvas.
  const merged = graph.groups.find((group) => group.missionId === 'M2').mission
  assert.equal(merged.title, 'Canvas auth guide')
  assert.equal(merged.owner, 'worker-2')
  assert.equal(merged.model, 'model-merged')
  assert.equal(merged.effort, 'medium')
  assert.deepEqual(merged.deps, [])
  assert.equal(merged.review.round, 1)
  assert.deepEqual(merged.tasks, [{ text: 'write the auth guide', done: true, dropped: false }])
  assert.equal(graph.groups.find((group) => group.missionId === 'M1').mission.context, '用户原话：“登录先做最小闭环。”')
  assert.deepEqual(
    graph.groups.find((group) => group.missionId === 'M3').mission.blockers,
    ['waiting for the M1 login contract'],
  )

  // Agents: one node each, in the roster order of the Host, with the model
  // and effort the dock and the panel show.
  const agentNodes = graph.nodes.filter((node) => node.type === 'agent')
  // Stack order inside a row is the layout's; the set is the roster's.
  assert.deepEqual(agentNodes.map((node) => node.name).sort(), [...agentNames].sort())
  const dead = agentNodes.find((node) => node.name === 'worker-6')
  assert.equal(dead.live, false)
  assert.equal(dead.diedAt, world.diedAt)
  assert.equal(dead.deathStatus, 'error')
  assert.equal(dead.deathReason, 'turn ended with a tool failure')
  assert.equal(dead.model, 'model-dead')
  assert.equal(dead.role, 'owner')
  const reviewer = agentNodes.find((node) => node.name === 'reviewer-1')
  assert.equal(reviewer.kind, 'reviewer')
  assert.equal(reviewer.role, 'reviewer')
  assert.equal(reviewer.model, 'model-review')
  assert.equal(reviewer.effort, 'low')

  // The card layout the overlay reads: a tower, one group per mission, the
  // task and scope cards of the detail density.
  assert.equal(graph.nodes[0].type, 'tower')
  for (const group of graph.groups) {
    assert.equal(group.cardIds.length, 2)
    const tasks = graph.nodes.find((node) => node.id === `tasks:${group.missionId}`)
    const scope = graph.nodes.find((node) => node.id === `scope:${group.missionId}`)
    assert.equal(tasks.type, 'tasks')
    assert.equal(scope.type, 'scope')
    // The card shows the mission's own task list, not an empty placeholder.
    assert.equal(tasks.empty, group.mission.tasks.length === 0)
    assert.equal(tasks.items.length, Math.min(7, group.mission.tasks.length))
  }
  const taskCard = graph.nodes.find((node) => node.id === 'tasks:M1')
  assert.deepEqual(taskCard.items.map((item) => item.lines.join(' ')), ['add login endpoint', 'add logout endpoint'])
  assert.deepEqual(taskCard.items.map((item) => item.done), [true, false])
  assert.deepEqual(graph.nodes.find((node) => node.id === 'tasks:M2').items.map((item) => item.lines[0]), ['write the auth guide'])

  // Wires: dispatch to every mission, ownership and review, the dependencies,
  // and one dashed wire per pair of message endpoints.
  const edgeIndex = new Map(graph.edges.map((edge) => [edge.id, edge]))
  for (const mission of snapshot.missions) {
    assert.ok(edgeIndex.has(`dispatch:${mission.id}`), `dispatch:${mission.id}`)
    assert.equal(edgeIndex.get(`dispatch:${mission.id}`).to, `mission:${mission.id}`)
  }
  assert.ok(graph.groups.every((group) => graph.edges.find((edge) => edge.id === `dispatch:${group.missionId}`)))
  assert.equal(edgeIndex.get('own:M1:worker-1').type, 'own')
  assert.equal(edgeIndex.get('own:M1:worker-1').from, 'agent:worker-1')
  assert.equal(edgeIndex.get('own:M2:worker-2').label, '拥有')
  assert.equal(edgeIndex.get('review:M2:reviewer-1').type, 'review')
  assert.equal(edgeIndex.get('review:M2:reviewer-1').label, '评审')
  assert.equal(edgeIndex.get('own:M6:worker-6').state, 'stale')
  assert.deepEqual(
    graph.edges.filter((edge) => edge.type === 'dep').map((edge) => edge.id).sort(),
    ['dep:M1:M6', 'dep:M2:M4'],
  )
  assert.equal(edgeIndex.get('dep:M1:M6').state, 'running')
  assert.equal(edgeIndex.get('dep:M2:M4').state, 'done')

  // A message wire's count, participants, latest subject and read state all
  // come from the Host's message metadata; a renamed field loses the wire.
  const messages = graph.edges.filter((edge) => edge.type === 'message')
  const towerToWorker3 = messages.find((edge) =>
    (edge.from === 'tower' && edge.to === 'agent:worker-3') || (edge.from === 'agent:worker-3' && edge.to === 'tower'))
  assert.ok(towerToWorker3 !== undefined)
  assert.equal(towerToWorker3.count, 1)
  assert.equal(towerToWorker3.latest.subject, 'check the scope first')
  assert.equal(towerToWorker3.latest.from, 'tower')
  assert.equal(towerToWorker3.latest.to, 'worker-3')
  assert.match(towerToWorker3.latest.sentAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  assert.equal(towerToWorker3.unread, true)
  assert.equal(towerToWorker3.label, '消息 ×1')

  // A broadcast has no pair of endpoints: it must not become a wire.
  assert.equal(messages.some((edge) => edge.from === 'agent:worker-3' && edge.to === 'agent:worker-1'), false)
  assert.equal(messages.some((edge) => edge.to === 'all' || edge.from === 'all'), false)

  // The bounding box holds every node and every wire.
  for (const node of graph.nodes) {
    assert.ok(node.x >= graph.bounds.x && node.y >= graph.bounds.y, node.id)
    assert.ok(node.x + node.w <= graph.bounds.x + graph.bounds.w, node.id)
    assert.ok(node.y + node.h <= graph.bounds.y + graph.bounds.h, node.id)
  }
})

test('the summary density drops the detail cards but keeps the mission data the panel reads', async () => {
  const { ctx } = world
  const snapshot = await fetchSnapshot(ctx, 'session-main', true)
  const graph = layoutCanvas(snapshot, { density: 'summary', filter: 'all' })
  assert.equal(graph.groups.length, snapshot.missions.length)
  assert.equal(graph.nodes.some((node) => node.type === 'tasks' || node.type === 'scope'), false)
  for (const group of graph.groups) {
    const host = snapshot.missions.find((mission) => mission.id === group.missionId)
    assert.equal(group.mission.title, host.title)
    assert.deepEqual(group.mission.tasks.map((task) => task.text), host.tasks.map((task) => task.text))
    assert.deepEqual(group.mission.deps, [...host.deps].sort())
  }
  // The same missions are drawn at both densities; only the cards differ.
  assert.deepEqual(
    graph.groups.map((group) => group.missionId),
    layoutCanvas(snapshot, { density: 'detail', filter: 'all' }).groups.map((group) => group.missionId),
  )
})

test('the toolbar filters select the missions the Host statuses describe', async () => {
  const { ctx } = world
  const snapshot = await fetchSnapshot(ctx, 'session-main', true)
  // Rows are packed per column, so compare the drawn set, not its order.
  const ids = (graph) => graph.groups.map((group) => group.missionId).sort()

  assert.deepEqual(ids(layoutCanvas(snapshot, { density: 'detail', filter: 'blocked' })), ['M3'])
  assert.deepEqual(ids(layoutCanvas(snapshot, { filter: 'open' })), ['M1', 'M3', 'M4', 'M6'])
  assert.deepEqual(ids(layoutCanvas(snapshot, { filter: 'all' })), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'])
  // An agent whose mission is filtered out is hidden with it; it does not
  // reappear as an unattached card.
  const blocked = layoutCanvas(snapshot, { density: 'detail', filter: 'blocked' })
  assert.deepEqual(blocked.nodes.filter((node) => node.type === 'agent').map((node) => node.name), ['worker-3'])
})

test('the dock snapshot stays a strict subset of the canvas snapshot', async () => {
  const { ctx } = world
  const dock = await fetchSnapshot(ctx, 'session-main', false)
  const canvas = await fetchSnapshot(ctx, 'session-main', true)
  assert.deepEqual(Object.keys(dock).sort(), ['active', 'base', 'missions', 'running', 'sessionId'])
  // Merged and abandoned missions are shown on the canvas only.
  assert.deepEqual(dock.missions.map((mission) => mission.id), ['M1', 'M3', 'M4', 'M6'])
  for (const card of dock.missions) {
    const detail = canvas.missions.find((mission) => mission.id === card.id)
    for (const key of Object.keys(card)) {
      // Elapsed time and its derived counts move between the two requests.
      if (key === 'tasksDone' || key === 'tasksTotal' || key === 'elapsedMs') continue
      assert.deepEqual(detail[key], card[key], `${card.id}.${key}`)
    }
    assert.equal(detail.model, card.model)
    assert.equal(detail.effort, card.effort)
  }
  // Both shapes are layout-safe: the canvas never sees a field the dock lacks
  // when it draws the same mission.
  assert.equal(layoutCanvas(canvas).groups.length, 6)
})
