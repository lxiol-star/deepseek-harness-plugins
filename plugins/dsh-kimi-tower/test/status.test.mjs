import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'

import { TowerStore, canvasSnapshot, statusRouteDefinition, towerSnapshot } from '../lib/index.js'

async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'tower-status-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# test\n')
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
  return dir
}

function agent(id, cwd, extra = {}) {
  return { id, status: 'idle', session: { header: { cwd } }, ...extra }
}

/**
 * A Host model the way the real one is built: `current` is a prototype method
 * that reads `this`. An arrow function would never notice a lookup that
 * detaches the method from its object, so the dock fixtures use this class.
 */
class FakeModel {
  constructor(selection) {
    this.selection = selection
  }

  current() {
    return this.selection
  }
}

/** A Host logger that records each level separately, as the route sees it. */
function makeLogger() {
  const log = { debug: [], warn: [] }
  return {
    log,
    logger: {
      debug: (...args) => log.debug.push(args),
      warn: (...args) => log.warn.push(args),
    },
  }
}

test('tower snapshot lists open missions with worker model, progress, and liveness', async () => {
  const dir = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [mission] = await store.plan([{ title: 'M1 status', scope: ['src/**'], tasks: ['do it'] }])
    await store.registerSpawnedAgent(
      {
        name: 'worker-1',
        agentId: 'session-w1',
        sessionId: 'session-main',
        kind: 'worker',
        missionId: mission.id,
        worktree: mission.worktree,
        branch: mission.branch,
        spawnedAt: new Date().toISOString(),
      },
      { id: mission.id, owner: 'worker-1' },
    )

    const main = agent('session-main', dir)
    const worker = agent('session-w1', join(dir, '.tower/worktrees/wt-1'), {
      status: 'running',
      model: new FakeModel({ provider: 'test', model: 'gpt-test', reasoningEffort: 'max' }),
    })
    const agents = new Map([['session-main', main], ['session-w1', worker]])
    const ctx = { agents: { get: (id) => agents.get(id) } }

    const snapshot = await towerSnapshot(ctx, 'session-main')
    assert.equal(snapshot.active, true)
    assert.equal(snapshot.running, 1)
    assert.equal(snapshot.missions.length, 1)
    assert.deepEqual(snapshot.missions[0], {
      id: 'M1',
      title: 'M1 status',
      kind: 'build',
      status: 'active',
      state: 'running',
      owner: 'worker-1',
      agentId: 'session-w1',
      model: 'gpt-test',
      effort: 'max',
      branch: mission.branch,
      worktreePath: join(await realpath(dir), '.tower', 'worktrees', mission.worktree),
      tasksDone: 0,
      tasksTotal: 1,
      startedAt: snapshot.missions[0].startedAt,
      elapsedMs: snapshot.missions[0].elapsedMs,
      live: true,
    })

    worker.status = 'idle'
    const idle = await towerSnapshot(ctx, 'session-main')
    assert.equal(idle.missions[0].state, 'stale')
    assert.equal(idle.running, 0)

    agents.delete('session-w1')
    const stale = await towerSnapshot(ctx, 'session-main')
    assert.equal(stale.missions[0].state, 'stale')
    assert.equal(stale.running, 0)

    assert.equal((await towerSnapshot(ctx, 'session-other')).active, false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

const CARD_KEYS = [
  'id', 'title', 'kind', 'status', 'state', 'owner', 'agentId', 'model', 'effort', 'branch',
  'worktreePath', 'tasksDone', 'tasksTotal', 'startedAt', 'elapsedMs', 'live',
]
const CANVAS_KEYS = ['active', 'sessionId', 'base', 'running', 'missions', 'agents', 'messages', 'findings', 'activity']
// Exactly what the route answered before `detail` existed, dock and 500 alike.
const INACTIVE_DOCK = '{"active":false,"running":0,"missions":[]}'
const INACTIVE_CANVAS = '{"active":false,"running":0,"missions":[],"agents":[],"messages":[],"findings":[],"activity":[]}'

/** A tower with one spawned worker, and a Host context that records warnings. */
async function makeTower() {
  const dir = await makeRepo()
  const store = new TowerStore(dir)
  await store.init('session-main')
  const [mission] = await store.plan([{ title: 'M1 route', scope: ['src/route/**'], tasks: ['do it'] }])
  await store.registerSpawnedAgent(
    {
      name: 'worker-1',
      agentId: 'session-w1',
      sessionId: 'session-main',
      kind: 'worker',
      missionId: mission.id,
      worktree: mission.worktree,
      branch: mission.branch,
      spawnedAt: new Date().toISOString(),
    },
    { id: mission.id, owner: 'worker-1' },
  )
  // The worker is live with a model, so every optional card key is present.
  const agents = new Map([
    ['session-main', agent('session-main', dir)],
    ['session-w1', agent('session-w1', dir, {
      status: 'running',
      model: new FakeModel({ provider: 'test', model: 'gpt-test', reasoningEffort: 'max' }),
    })],
  ])
  const warnings = []
  const ctx = { agents: { get: (id) => agents.get(id) }, logger: { warn: (...args) => warnings.push(args) } }
  return { dir, ctx, warnings }
}

async function get(ctx, url) {
  const response = {
    status: 0,
    headers: {},
    body: undefined,
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end(body) {
      this.body = body
    },
  }
  await statusRouteDefinition(ctx).handler({ url }, response)
  return { status: response.status, headers: response.headers, text: response.body, json: JSON.parse(response.body) }
}

/** elapsedMs is measured per request; everything else in a snapshot must be identical. */
function stable(snapshot) {
  const copy = structuredClone(snapshot)
  for (const mission of copy.missions) delete mission.elapsedMs
  return copy
}

test('the status route stays auth-required and answers the dock shape unless detail is the literal 1', async () => {
  const { dir, ctx } = await makeTower()
  try {
    const route = statusRouteDefinition(ctx)
    assert.equal(route.kind, 'exact')
    assert.equal(route.path, '/tower/state')
    assert.equal(route.auth, 'required')

    const dock = await get(ctx, '/tower/state?sessionId=session-main')
    assert.equal(dock.status, 200)
    assert.deepEqual(dock.headers, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    assert.deepEqual(Object.keys(dock.json), ['active', 'sessionId', 'base', 'running', 'missions'])
    assert.deepEqual(Object.keys(dock.json.missions[0]), CARD_KEYS)
    assert.deepEqual(stable(dock.json), stable(await towerSnapshot(ctx, 'session-main')))

    // Any other detail value leaves the dock answer unchanged.
    for (const query of ['detail=0', 'detail=true', 'detail=01', 'detail=', 'details=1']) {
      assert.deepEqual(stable((await get(ctx, `/tower/state?sessionId=session-main&${query}`)).json), stable(dock.json), query)
    }
    assert.deepEqual(stable((await get(ctx, '/tower/state?sessionId=session-main')).json), stable(dock.json))
    // With the parameter repeated the first value wins, so a later `detail=1` is ignored.
    assert.deepEqual(stable((await get(ctx, '/tower/state?sessionId=session-main&detail=0&detail=1')).json), stable(dock.json))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('detail=1 answers the canvas snapshot: the dock fields unchanged plus roster, messages, findings, and activity', async () => {
  const { dir, ctx } = await makeTower()
  try {
    const dock = await get(ctx, '/tower/state?sessionId=session-main')
    const canvas = await get(ctx, '/tower/state?sessionId=session-main&detail=1')
    assert.equal(canvas.status, 200)
    assert.deepEqual(canvas.headers, dock.headers)
    assert.deepEqual(Object.keys(canvas.json), CANVAS_KEYS)
    assert.deepEqual(stable(canvas.json), stable(await canvasSnapshot(ctx, 'session-main')))

    // Everything the dock answered is still there, field for field. Only
    // elapsedMs moves, because it is measured when the request is served.
    const { missions: dockMissions, ...dockRest } = dock.json
    const { missions, agents, messages, findings, activity, ...canvasRest } = canvas.json
    assert.deepEqual(canvasRest, dockRest)
    assert.equal(missions.length, dockMissions.length)
    for (const [index, card] of dockMissions.entries()) {
      for (const [key, value] of Object.entries(card)) {
        if (key === 'elapsedMs') continue
        assert.deepEqual(missions[index][key], value, key)
      }
    }
    assert.deepEqual(agents.map((entry) => [entry.name, entry.kind, entry.missionId, entry.live]), [['worker-1', 'worker', 'M1', true]])
    assert.deepEqual(messages, [])
    assert.deepEqual(findings, [])
    assert.ok(activity.length > 0 && activity.length <= 50)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a session without a tower, a failing Host, and a failing canvas read all degrade to the inactive body', async () => {
  const { dir, ctx, warnings } = await makeTower()
  try {
    // No tower for that session: 200 with the body the route has always answered.
    const dockOff = await get(ctx, '/tower/state?sessionId=session-other')
    assert.equal(dockOff.status, 200)
    assert.equal(dockOff.text, INACTIVE_DOCK)
    const canvasOff = await get(ctx, '/tower/state?sessionId=session-other&detail=1')
    assert.equal(canvasOff.status, 200)
    assert.equal(canvasOff.text, INACTIVE_CANVAS)

    // The Host surface itself fails: 500, the same bodies, one warning each.
    const broken = {
      agents: { get() { throw new Error('host down') } },
      logger: { warn: (...args) => warnings.push(args) },
    }
    const dockDown = await get(broken, '/tower/state?sessionId=session-main')
    assert.equal(dockDown.status, 500)
    assert.equal(dockDown.text, INACTIVE_DOCK)
    const canvasDown = await get(broken, '/tower/state?sessionId=session-main&detail=1')
    assert.equal(canvasDown.status, 500)
    assert.equal(canvasDown.text, INACTIVE_CANVAS)
    assert.deepEqual(warnings.map((args) => args[0]), ['dsh-kimi-tower: status route failed', 'dsh-kimi-tower: status route failed'])

    // Only the canvas read fails: it degrades by itself and the dock keeps working.
    const original = TowerStore.prototype.reviewsFor
    TowerStore.prototype.reviewsFor = async () => {
      throw new Error('reviews unreadable')
    }
    try {
      const canvasFailed = await get(ctx, '/tower/state?sessionId=session-main&detail=1')
      assert.equal(canvasFailed.status, 500)
      assert.equal(canvasFailed.text, INACTIVE_CANVAS)
      const dockUp = await get(ctx, '/tower/state?sessionId=session-main')
      assert.equal(dockUp.status, 200)
      assert.equal(dockUp.json.active, true)
    } finally {
      TowerStore.prototype.reviewsFor = original
    }
    assert.equal(warnings.length, 3)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a worker whose Host model has no callable current() costs its own model name only, on both routes', async () => {
  const dir = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [healthy, broken] = await store.plan([
      { title: 'M1 healthy model', scope: ['src/healthy/**'], tasks: ['do it'] },
      { title: 'M2 broken model', scope: ['src/broken/**'], tasks: ['do it'] },
    ])
    for (const [mission, name, id] of [[healthy, 'worker-1', 'session-w1'], [broken, 'worker-2', 'session-w2']]) {
      await store.registerSpawnedAgent(
        {
          name,
          agentId: id,
          sessionId: 'session-main',
          kind: 'worker',
          missionId: mission.id,
          worktree: mission.worktree,
          branch: mission.branch,
          spawnedAt: new Date().toISOString(),
        },
        { id: mission.id, owner: name },
      )
    }
    const warnings = []
    const ctx = { agents: { get: (id) => agents.get(id) }, logger: { warn: (...args) => warnings.push(args) } }
    const setWorker2Model = (model) => {
      agents.set('session-w2', agent('session-w2', dir, { status: 'running', ...(model === 'absent' ? {} : { model }) }))
    }
    const agents = new Map([
      ['session-main', agent('session-main', dir)],
      ['session-w1', agent('session-w1', dir, {
        status: 'running',
        model: { current: () => ({ model: 'healthy-model', reasoningEffort: 'high' }) },
      })],
    ])

    // Every shape of a model the Host may hand out without a usable selection.
    // These are the shapes the baseline already survived; the regression this
    // test pins is the optional call `current?.()` that a refactor dropped.
    for (const [label, model] of [
      ['current missing', {}],
      ['current null', { current: null }],
      ['current undefined', { current: undefined }],
      ['model itself absent', 'absent'],
    ]) {
      setWorker2Model(model)
      const dock = await get(ctx, '/tower/state?sessionId=session-main')
      assert.equal(dock.status, 200, `${label}: the dock stays up`)
      assert.equal(dock.json.active, true, label)
      const [healthyCard, brokenCard] = dock.json.missions
      // The healthy neighbour is untouched, field for field.
      assert.deepEqual(Object.keys(healthyCard), CARD_KEYS, label)
      assert.equal(healthyCard.model, 'healthy-model', label)
      assert.equal(healthyCard.effort, 'high', label)
      assert.equal(healthyCard.live, true, label)
      // The broken card loses only its model name; the card itself is intact.
      assert.deepEqual(Object.keys(brokenCard), CARD_KEYS.filter((key) => key !== 'model' && key !== 'effort'), label)
      assert.equal(brokenCard.id, 'M2', label)
      assert.equal(brokenCard.owner, 'worker-2', label)
      assert.equal(brokenCard.agentId, 'session-w2', label)
      assert.equal(brokenCard.live, true, label)
      assert.equal(brokenCard.state, 'running', label)

      const canvas = await get(ctx, '/tower/state?sessionId=session-main&detail=1')
      assert.equal(canvas.status, 200, `${label}: the canvas stays up`)
      assert.equal(canvas.json.active, true, label)
      assert.equal(canvas.json.missions.length, 2, label)
      assert.equal(canvas.json.missions[1].model, undefined, label)
      assert.equal('model' in canvas.json.missions[1], false, label)
      assert.equal(canvas.json.missions[1].id, 'M2', label)
      assert.deepEqual(canvas.json.agents.map((entry) => [entry.name, entry.live]), [['worker-1', true], ['worker-2', true]], label)
      assert.equal('model' in canvas.json.agents[1], false, label)
      assert.equal(canvas.json.agents[0].model, 'healthy-model', label)
      assert.equal(canvas.json.agents[0].effort, 'high', label)
    }
    // None of this is an error worth a warning.
    assert.deepEqual(warnings, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a worker whose Host model current is present but unusable costs its own model name only, on both routes', async () => {
  const dir = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [healthy, broken] = await store.plan([
      { title: 'M1 healthy model two', scope: ['src/healthy2/**'], tasks: ['do it'] },
      { title: 'M2 broken model two', scope: ['src/broken2/**'], tasks: ['do it'] },
    ])
    for (const [mission, name, id] of [[healthy, 'worker-1', 'session-w1'], [broken, 'worker-2', 'session-w2']]) {
      await store.registerSpawnedAgent(
        {
          name,
          agentId: id,
          sessionId: 'session-main',
          kind: 'worker',
          missionId: mission.id,
          worktree: mission.worktree,
          branch: mission.branch,
          spawnedAt: new Date().toISOString(),
        },
        { id: mission.id, owner: name },
      )
    }
    const warnings = []
    const agents = new Map([
      ['session-main', agent('session-main', dir)],
      ['session-w1', agent('session-w1', dir, {
        status: 'running',
        model: { current: () => ({ model: 'healthy-model', reasoningEffort: 'high' }) },
      })],
    ])
    const ctx = { agents: { get: (id) => agents.get(id) }, logger: { warn: (...args) => warnings.push(args) } }

    // Unlike a missing `current`, these shapes were never survived before: the
    // optional call `current?.()` still tries to call a value that is present.
    // This is the hardening, and it fails against the baseline bundle.
    const throws = () => { throw new Error('model selection unavailable') }
    for (const [label, model] of [
      ['current is a string', { current: 'glm-test' }],
      ['current is a number', { current: 42 }],
      ['current is an object', { current: {} }],
      ['current throws', { current: throws }],
      ['current returns nothing', { current: () => undefined }],
      ['current returns null', { current: () => null }],
    ]) {
      agents.set('session-w2', agent('session-w2', dir, { status: 'running', model }))
      const dock = await get(ctx, '/tower/state?sessionId=session-main')
      assert.equal(dock.status, 200, `${label}: the dock stays up`)
      assert.equal(dock.json.active, true, label)
      const [healthyCard, brokenCard] = dock.json.missions
      // The healthy neighbour is untouched, field for field.
      assert.deepEqual(Object.keys(healthyCard), CARD_KEYS, label)
      assert.equal(healthyCard.model, 'healthy-model', label)
      assert.equal(healthyCard.effort, 'high', label)
      assert.equal(healthyCard.live, true, label)
      // The broken card loses only its model name; the card itself is intact.
      assert.deepEqual(Object.keys(brokenCard), CARD_KEYS.filter((key) => key !== 'model' && key !== 'effort'), label)
      assert.equal(brokenCard.id, 'M2', label)
      assert.equal(brokenCard.owner, 'worker-2', label)
      assert.equal(brokenCard.agentId, 'session-w2', label)
      assert.equal(brokenCard.live, true, label)
      assert.equal(brokenCard.state, 'running', label)
      assert.equal(brokenCard.tasksTotal, 1, label)

      const canvas = await get(ctx, '/tower/state?sessionId=session-main&detail=1')
      assert.equal(canvas.status, 200, `${label}: the canvas stays up`)
      assert.equal(canvas.json.active, true, label)
      assert.equal(canvas.json.missions.length, 2, label)
      assert.equal('model' in canvas.json.missions[1], false, label)
      assert.equal('effort' in canvas.json.missions[1], false, label)
      assert.equal(canvas.json.missions[1].id, 'M2', label)
      assert.equal(canvas.json.missions[1].live, true, label)
      assert.deepEqual(canvas.json.agents.map((entry) => [entry.name, entry.live]), [['worker-1', true], ['worker-2', true]], label)
      assert.equal('model' in canvas.json.agents[1], false, label)
      assert.equal('effort' in canvas.json.agents[1], false, label)
      assert.equal(canvas.json.agents[0].model, 'healthy-model', label)
      assert.equal(canvas.json.agents[0].effort, 'high', label)
    }
    // A broken model on one agent is not an error worth a warning either.
    assert.deepEqual(warnings, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

/** A tower with one worker, whose Host object is set by the test. */
async function makeWorkerTower(title, agentId = 'session-w1') {
  const dir = await makeRepo()
  const store = new TowerStore(dir)
  await store.init('session-main')
  const [mission] = await store.plan([{ title, scope: ['src/receiver/**'], tasks: ['do it'] }])
  await store.registerSpawnedAgent(
    {
      name: 'worker-1',
      agentId,
      sessionId: 'session-main',
      kind: 'worker',
      missionId: mission.id,
      worktree: mission.worktree,
      branch: mission.branch,
      spawnedAt: new Date().toISOString(),
    },
    { id: mission.id, owner: 'worker-1' },
  )
  const agents = new Map([['session-main', agent('session-main', dir)]])
  return {
    dir,
    agentId,
    agents,
    setWorker(model) {
      agents.set(agentId, agent(agentId, dir, { status: 'running', model }))
    },
  }
}

test('current is called as a method of its model, so a model whose current reads this still reports its selection', async () => {
  // The real Host model is a class whose `current` is a prototype method that
  // reads `this`. Looking it up and calling it bare throws, and the snapshot
  // then silently lost every model name and effort. This fails against 71bcbef.
  class HostModel {
    constructor(selection) {
      this.selection = selection
    }

    current() {
      if (this === undefined) throw new TypeError("Cannot read properties of undefined (reading 'selection')")
      return this.selection
    }
  }
  const { dir, agents, setWorker } = await makeWorkerTower('M1 receiver')
  try {
    setWorker(new HostModel({ provider: 'test', model: 'host-model', reasoningEffort: 'max' }))

    const dock = await get({ agents: { get: (id) => agents.get(id) } }, '/tower/state?sessionId=session-main')
    assert.equal(dock.status, 200)
    assert.deepEqual(Object.keys(dock.json.missions[0]), CARD_KEYS)
    assert.equal(dock.json.missions[0].model, 'host-model')
    assert.equal(dock.json.missions[0].effort, 'max')
    assert.equal(dock.json.missions[0].live, true)

    const canvas = await get({ agents: { get: (id) => agents.get(id) } }, '/tower/state?sessionId=session-main&detail=1')
    assert.equal(canvas.status, 200)
    assert.equal(canvas.json.missions[0].model, 'host-model')
    assert.equal(canvas.json.missions[0].effort, 'max')
    // The roster entry goes through the same lookup.
    assert.equal(canvas.json.agents[0].model, 'host-model')
    assert.equal(canvas.json.agents[0].effort, 'max')

    // A class-built model still takes every unusable shape gracefully.
    class Unusable {
      constructor(current) {
        this.current = current
      }
    }
    for (const [label, current] of [['a string', 'glm-test'], ['undefined', undefined]]) {
      setWorker(new Unusable(current))
      const unusable = await get({ agents: { get: (id) => agents.get(id) } }, '/tower/state?sessionId=session-main')
      assert.equal(unusable.status, 200, label)
      assert.equal('model' in unusable.json.missions[0], false, label)
      assert.equal(unusable.json.missions[0].live, true, label)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a model lookup that throws is reported once per agent and message at debug level, never as a warning', async () => {
  // Throttling is kept per agent across requests, so this test uses an agent
  // id and messages of its own and cannot be confused with another test.
  const { dir, agents, agentId, setWorker } = await makeWorkerTower('M1 logged lookup', 'session-w1-logged-lookup')
  const { log, logger } = makeLogger()
  const ctx = { agents: { get: (id) => agents.get(id) }, logger }
  try {
    let message = 'selection backend unreachable'
    class Failing {
      current() {
        throw new Error(message)
      }
    }
    setWorker(new Failing())

    // The dock polls and the canvas looks a card and a roster entry up: all of
    // that is one line, carrying the agent and the reason.
    await get(ctx, '/tower/state?sessionId=session-main')
    await get(ctx, '/tower/state?sessionId=session-main')
    await get(ctx, '/tower/state?sessionId=session-main&detail=1')
    await get(ctx, '/tower/state?sessionId=session-main&detail=1')
    assert.equal(log.debug.length, 1)
    assert.match(log.debug[0].join(' '), /model selection unavailable/)
    assert.ok(log.debug[0].includes(agentId), 'the agent id is in the line')
    assert.ok(log.debug[0].includes(message), 'the error message is in the line')
    assert.deepEqual(log.warn, [])

    // A different failure for the same agent is a new fact and is reported.
    message = 'selection backend returned garbage'
    setWorker(new Failing())
    await get(ctx, '/tower/state?sessionId=session-main')
    await get(ctx, '/tower/state?sessionId=session-main')
    assert.equal(log.debug.length, 2)
    assert.ok(log.debug[1].includes(message))
    assert.deepEqual(log.warn, [])

    // Once the model works again nothing else is logged.
    setWorker(new FakeModel({ model: 'recovered' }))
    const recovered = await get(ctx, '/tower/state?sessionId=session-main')
    assert.equal(recovered.json.missions[0].model, 'recovered')
    assert.equal(log.debug.length, 2)

    // A logger that cannot take the line must not take the snapshot down.
    setWorker(new Failing())
    for (const broken of [undefined, {}, { debug: 'not a function' }, { debug() { throw new Error('sink closed') } }]) {
      const status = await get({ agents: ctx.agents, logger: broken }, '/tower/state?sessionId=session-main')
      assert.equal(status.status, 200, `logger ${JSON.stringify(broken)}`)
      assert.equal(status.json.active, true)
      assert.equal('model' in status.json.missions[0], false)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
