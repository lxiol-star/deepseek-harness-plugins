/**
 * Canvas snapshot (`/tower/state?detail=1`) over real git repositories and a
 * real TowerStore, so every inbox, finding, and review file has the format the
 * store itself writes. All content is synthetic: no session transcripts,
 * personal paths, or secrets.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { appendFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import {
  CANVAS_LIMITS,
  TowerStore,
  canvasSnapshot,
  inboxItemUnread,
  statusRouteDefinition,
} from '../lib/index.js'

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CARD_KEYS = [
  'id', 'title', 'kind', 'status', 'state', 'owner', 'agentId', 'model', 'effort', 'branch',
  'worktreePath', 'tasksDone', 'tasksTotal', 'startedAt', 'elapsedMs', 'live',
]
const DETAIL_KEYS = ['deps', 'scope', 'tasks', 'blockers', 'notes', 'context', 'keyArtifacts', 'review']
const MESSAGE_KEYS = ['id', 'from', 'to', 'subject', 'sentAt', 'action', 'scope', 'read', 'unreadBy']
const FINDING_KEYS = ['title', 'type', 'severity', 'location', 'summary', 'file', 'agent', 'missionId', 'createdAt']
const CONTEXT = '用户原话：“把登录做安全一点，\n\t不要明文存密码。”\n\n第二段：保留旧客户端兼容。'
const CONTEXT_FLAT = '用户原话：“把登录做安全一点， 不要明文存密码。” 第二段：保留旧客户端兼容。'

const tempDirs = new Set()

after(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true })
})

async function makeRepo(prefix) {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), prefix)))
  tempDirs.add(dir)
  const git = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  git(['init', '-q'])
  git(['config', 'user.name', 'Canvas Test'])
  git(['config', 'user.email', 'canvas@example.test'])
  await writeFile(join(dir, 'README.md'), '# canvas\n')
  git(['add', '-A'])
  git(['commit', '-q', '-m', 'init'])
  return { dir, base: git(['rev-parse', '--abbrev-ref', 'HEAD']) }
}

function commitAll(cwd, message) {
  execFileSync('git', ['add', '-A'], { cwd })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd })
}

function agent(id, cwd, extra = {}) {
  return { id, status: 'idle', session: { header: { cwd } }, ...extra }
}

/**
 * A Host model the way the real one is built: `current` is a prototype method
 * that reads `this`. An arrow function would never notice a lookup that
 * detaches the method from its object, so the canvas fixtures use this class.
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

async function spawnWorker(store, mission, name, agentId, spawnedAt = new Date().toISOString()) {
  await store.registerSpawnedAgent(
    {
      name,
      agentId,
      sessionId: 'session-main',
      kind: 'worker',
      missionId: mission.id,
      worktree: mission.worktree,
      branch: mission.branch,
      spawnedAt,
    },
    { id: mission.id, owner: name },
  )
}

/** What the tower_inbox tool does: return the unread page, then acknowledge exactly it. */
async function drainInbox(store, caller) {
  const items = await store.readUnreadInbox(caller, 1000)
  await store.ackInbox(caller, items.map((item) => item.messageId))
}

function makeResponse() {
  return {
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
}

async function callRoute(ctx, url) {
  const response = makeResponse()
  await statusRouteDefinition(ctx).handler({ url }, response)
  return { status: response.status, headers: response.headers, text: response.body }
}

/** What the client receives: the JSON round trip drops undefined fields, as on the wire. */
function wire(value) {
  return JSON.parse(JSON.stringify(value))
}

/** Every file under `root` with a content hash, so any write shows up. */
async function treeOf(root, prefix = '') {
  const entries = []
  for (const entry of (await readdir(root, { withFileTypes: true })).toSorted((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      entries.push(...(await treeOf(join(root, entry.name), rel)))
    } else {
      entries.push(`${rel} ${createHash('sha256').update(await readFile(join(root, entry.name))).digest('hex')}`)
    }
  }
  return entries
}

/** Count calls to store methods that write state or record reads; a misspelt name fails loudly. */
function spyStore(names) {
  const calls = []
  const originals = new Map()
  for (const name of names) {
    const original = TowerStore.prototype[name]
    if (typeof original !== 'function') throw new Error(`TowerStore.prototype.${name} is not a function`)
    originals.set(name, original)
    TowerStore.prototype[name] = function (...args) {
      calls.push(name)
      return original.apply(this, args)
    }
  }
  return {
    calls,
    restore() {
      for (const [name, original] of originals) TowerStore.prototype[name] = original
    },
  }
}

/**
 * A synthetic tower with one mission in every interesting state: M1 merged
 * after two review rounds, M2 blocked and depending on M1, M3 abandoned, M4
 * active but its worker died, M5 running. Plus a reviewer, a late joiner,
 * messages in every read state, and three findings.
 */
async function buildWorld() {
  const { dir, base } = await makeRepo('tower-canvas-world-')
  const store = new TowerStore(dir)
  await store.init('session-main')
  const [m1, m2, m3, m4, m5] = await store.plan([
    { title: 'Canvas login API', scope: ['src/auth/**'], tasks: ['add login endpoint', 'add logout endpoint'], context: CONTEXT },
    { title: 'Canvas auth docs', scope: ['docs/auth/**'], tasks: ['write auth guide'], deps: ['M1'] },
    { title: 'Canvas legacy cleanup', scope: ['src/legacy/**'], tasks: ['remove legacy shim'] },
    { title: 'Canvas auth tests', scope: ['test/auth/**'], tasks: ['cover login'], deps: ['M2'] },
    { title: 'Canvas rate limits', scope: ['src/ratelimit/**'], tasks: ['add limiter'] },
  ])

  // M1: build, complete, one rework round, complete again, clean round, merge.
  await store.addWorktree(m1.worktree, m1.branch, base)
  const worktree1 = store.abs(join('.tower/worktrees', m1.worktree))
  await mkdir(join(worktree1, 'src/auth'), { recursive: true })
  await writeFile(join(worktree1, 'src/auth/login.ts'), 'export const login = 1\n')
  commitAll(worktree1, 'feat: add login')
  await spawnWorker(store, m1, 'worker-1', 'session-w1')
  await store.updateMission('worker-1', m1.id, { taskDone: 'add login endpoint' })
  await store.updateMission('worker-1', m1.id, { note: 'login endpoint returns a session cookie' })
  await store.updateMission('worker-1', m1.id, { taskDrop: { text: 'add logout endpoint', reason: 'descope: logout ships later' } })
  await drainInbox(store, 'worker-1')
  await store.complete('worker-1', 'implemented login')
  await store.registerSpawnedAgent({
    name: 'reviewer-1',
    agentId: 'session-r1',
    sessionId: 'session-main',
    kind: 'reviewer',
    reviewTarget: m1.branch,
    reviewMissionId: m1.id,
    spawnedAt: new Date().toISOString(),
  })
  await store.submitReview('reviewer-1', {
    target: m1.branch,
    status: 'p1-1items',
    merge: 'fix-then-merge',
    findings: 'missing null check',
    decision: 'rework',
  })
  await drainInbox(store, 'worker-1')
  await store.complete('worker-1', 'implemented login with the null check')
  await store.submitReview('reviewer-1', {
    target: m1.branch,
    status: 'clean',
    merge: 'merge',
    findings: 'none',
    decision: 'approved',
  })
  assert.equal((await store.merge(m1.branch, { activeAgentIds: new Set() })).status, 'merged')

  // M2 blocked by its worker; M3 abandoned by the tower; M4's worker dies.
  await spawnWorker(store, m2, 'worker-2', 'session-w2')
  await store.updateMission('worker-2', m2.id, { blocker: 'waiting for the login contract from M1' })
  await store.updateMission('tower', m3.id, { status: 'abandoned' })
  await spawnWorker(store, m4, 'worker-4', 'session-w4')
  const died = await store.markAgentDied('session-w4', 'error', 'turn ended with a tool failure')
  assert.equal(died.diedAt !== undefined, true)

  // Direct messages to worker-2: it reads the newest one only, so the other stays unread.
  await store.send('tower', { to: 'worker-2', subject: 'status?', body: 'BODY-MUST-NOT-LEAK-1', scope: 'M2', action: 'ping' })
  await store.send('tower', { to: 'worker-2', subject: 'contract ready', body: 'BODY-MUST-NOT-LEAK-2', scope: 'M2' })
  const newest = await store.readUnreadInbox('worker-2', 1)
  assert.equal(newest.length, 1)
  assert.equal(newest[0].subject, 'contract ready')
  await store.ackInbox('worker-2', newest.map((item) => item.messageId))
  await store.send('worker-1', { to: 'tower', subject: 'question about tokens', body: 'BODY-MUST-NOT-LEAK-3' })

  // A broadcast: worker-2 is the sender, worker-4 is dead, worker-5 joins later.
  await store.send('worker-2', { to: 'all', subject: 'heads up', body: 'BODY-MUST-NOT-LEAK-4' })
  await drainInbox(store, 'worker-1')
  await drainInbox(store, 'reviewer-1')
  const later = new Date(Date.now() + 60_000).toISOString()
  await spawnWorker(store, m5, 'worker-5', 'session-w5', later)

  // Findings: with a location and a multi-paragraph summary; without a mission; over the summary cap.
  await store.fileFinding('worker-2', {
    type: 'bug',
    title: 'Null dereference on expired token',
    severity: 'high',
    summary: 'First paragraph line one.\nLine two of the first paragraph.\n\nSecond paragraph, left out.',
    location: 'src/auth/login.ts:12',
    details: 'details',
    suggestedFix: 'guard the lookup',
  })
  await store.fileFinding('reviewer-1', {
    type: 'idea',
    title: 'Rate limit header would help',
    summary: 'Single line summary.',
    details: 'details',
    suggestedFix: 'add the header',
  })
  await store.fileFinding('worker-1', {
    type: 'vuln',
    title: 'Token is logged in plain text',
    severity: 'critical',
    summary: 'x'.repeat(400),
    details: 'details',
    suggestedFix: 'redact the token',
  })

  const agents = new Map([
    ['session-main', agent('session-main', dir)],
    ['session-w1', agent('session-w1', worktree1, { model: selection('glm-test', 'high') })],
    ['session-r1', agent('session-r1', dir, { model: selection('kimi-test', 'medium') })],
    ['session-w2', agent('session-w2', dir, { status: 'running', model: selection('kimi-test', undefined) })],
    ['session-w5', agent('session-w5', dir, { status: 'running' })],
  ])
  const warnings = []
  const ctx = {
    agents: { get: (id) => agents.get(id) },
    logger: { warn: (...args) => warnings.push(args) },
  }
  return { dir, base, store, agents, ctx, warnings, m1, m2, m3, m4, m5, worktree1, diedAt: died.diedAt }
}

let worldPromise
function getWorld() {
  worldPromise ??= buildWorld().catch((error) => {
    worldPromise = undefined
    throw error
  })
  return worldPromise
}

test('canvas snapshot lists every mission with its detail, the roster, messages, findings, and the activity tail', async () => {
  const { dir, base, ctx, store, m1, diedAt } = await getWorld()
  const snapshot = wire(await canvasSnapshot(ctx, 'session-main'))
  assert.deepEqual(Object.keys(snapshot), ['active', 'sessionId', 'base', 'running', 'missions', 'agents', 'messages', 'findings', 'activity'])
  assert.equal(snapshot.active, true)
  assert.equal(snapshot.sessionId, 'session-main')
  assert.equal(snapshot.base, base)
  assert.equal(snapshot.running, 1)

  // Every mission is listed, merged and abandoned ones included, in plan order.
  assert.deepEqual(snapshot.missions.map((mission) => mission.id), ['M1', 'M2', 'M3', 'M4', 'M5'])
  const [c1, c2, c3, c4, c5] = snapshot.missions

  // M1: merged after two review rounds; one task done, one dropped.
  assert.deepEqual(Object.keys(c1), [...CARD_KEYS, ...DETAIL_KEYS])
  assert.equal(c1.title, 'Canvas login API')
  assert.equal(c1.kind, 'build')
  assert.equal(c1.status, 'merged')
  assert.equal(c1.state, 'done')
  assert.equal(c1.live, false)
  assert.equal(c1.branch, m1.branch)
  assert.equal(c1.worktreePath, join(dir, '.tower', 'worktrees', m1.worktree))
  assert.deepEqual(c1.deps, [])
  assert.deepEqual(c1.scope, ['src/auth/**'])
  assert.deepEqual(c1.tasks, [
    { text: 'add login endpoint', done: true },
    { text: 'add logout endpoint', done: false, dropped: true },
  ])
  assert.equal(c1.tasksDone, 2)
  assert.equal(c1.tasksTotal, 2)
  assert.deepEqual(c1.notes, [
    'login endpoint returns a session cookie',
    'dropped task "add logout endpoint": descope: logout ships later',
  ])
  assert.deepEqual(c1.blockers, [])
  assert.equal(c1.context, CONTEXT_FLAT)
  assert.deepEqual(c1.keyArtifacts, [])
  assert.deepEqual(Object.keys(c1.review), ['round', 'reviewer', 'status', 'merge', 'at'])
  assert.equal(c1.review.round, 2)
  assert.equal(c1.review.reviewer, 'reviewer-1')
  assert.equal(c1.review.status, 'clean')
  assert.equal(c1.review.merge, 'merge')
  assert.match(c1.review.at, INSTANT)

  // M2: blocked by its worker, depends on M1.
  assert.equal(c2.status, 'blocked')
  assert.equal(c2.state, 'blocked')
  assert.deepEqual(c2.deps, ['M1'])
  assert.deepEqual(c2.blockers, ['waiting for the login contract from M1'])
  assert.equal(c2.owner, 'worker-2')
  assert.equal(c2.agentId, 'session-w2')
  assert.equal(c2.model, 'kimi-test')
  assert.equal('effort' in c2, false)
  assert.equal('context' in c2, false)
  assert.equal('review' in c2, false)

  // M3: abandoned by the tower.
  assert.equal(c3.status, 'abandoned')
  assert.equal(c3.state, 'done')
  assert.deepEqual(c3.tasks, [{ text: 'remove legacy shim', done: false }])

  // M4: still active, but its worker died.
  assert.equal(c4.status, 'active')
  assert.equal(c4.state, 'stale')
  assert.equal(c4.live, false)
  assert.deepEqual(c4.deps, ['M2'])
  assert.equal(c4.agentId, 'session-w4')

  // M5: the only running mission.
  assert.equal(c5.state, 'running')
  assert.equal(c5.live, true)
  assert.equal('model' in c5, false)
  assert.equal('effort' in c5, false)

  // The whole roster, in registration order.
  assert.deepEqual(snapshot.agents.map((entry) => [entry.name, entry.kind, entry.live]), [
    ['worker-1', 'worker', false],
    ['reviewer-1', 'reviewer', false],
    ['worker-2', 'worker', true],
    ['worker-4', 'worker', false],
    ['worker-5', 'worker', true],
  ])
  const [w1, r1, w2, w4, w5] = snapshot.agents
  assert.equal(w1.missionId, 'M1')
  assert.equal(w1.agentId, 'session-w1')
  assert.match(w1.spawnedAt, INSTANT)
  assert.equal('diedAt' in w1, false)
  assert.equal('reviewTarget' in w1, false)
  assert.equal(r1.reviewTarget, m1.branch)
  assert.equal(r1.reviewMissionId, 'M1')
  assert.equal('missionId' in r1, false)
  // An idle reviewer is not live, but its model is still known.
  assert.equal(r1.model, 'kimi-test')
  assert.equal(r1.effort, 'medium')
  assert.equal(w2.model, 'kimi-test')
  assert.equal('effort' in w2, false)
  assert.equal(w4.missionId, 'M4')
  assert.equal(w4.diedAt, diedAt)
  assert.equal(w4.deathStatus, 'error')
  assert.equal(w4.deathReason, 'turn ended with a tool failure')
  assert.equal('model' in w4, false)
  assert.equal(w5.missionId, 'M5')
  assert.equal('model' in w5, false)

  // Messages: metadata only, oldest first, with per-recipient read state.
  // Nine in all: the five the protocol itself sent while M1 went through two
  // review rounds, plus the four the fixture sent by hand.
  assert.equal(snapshot.messages.length, 9)
  const sentAts = snapshot.messages.map((message) => message.sentAt)
  assert.deepEqual(sentAts, [...sentAts].sort((a, b) => a.localeCompare(b)))
  for (const message of snapshot.messages) {
    assert.deepEqual(Object.keys(message), MESSAGE_KEYS.filter((key) => key in message))
    assert.equal('body' in message, false)
    assert.match(message.sentAt, INSTANT)
  }
  assert.equal(JSON.stringify(snapshot).includes('BODY-MUST-NOT-LEAK'), false)

  // What the protocol sent for M1, in order: each completion a review request
  // to the tower; a rework verdict also reaching the worker, a clean one not.
  const shape = (message) => [message.from, message.to, message.subject, message.action, message.scope]
  const byText = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))
  const protocol = snapshot.messages.filter((message) => message.subject.startsWith('review-'))
  assert.deepEqual(protocol.map(shape).sort(byText), [
    ['worker-1', 'tower', 'review-request', 'complete', 'M1'],
    ['reviewer-1', 'tower', 'review-result', 'review-result', 'M1'],
    ['reviewer-1', 'worker-1', 'review-result', 'review-result', 'M1'],
    ['worker-1', 'tower', 'review-request', 'complete', 'M1'],
    ['reviewer-1', 'tower', 'review-result', 'review-result', 'M1'],
  ].sort(byText))
  // In time the phases cannot interleave: a completion, the verdicts of its
  // review, the next completion, the final verdict. Messages sent within one
  // phase may share a millisecond, and are then ordered by file name, so only
  // the phases are pinned here.
  const requests = protocol.filter((message) => message.subject === 'review-request')
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
  const results = protocol.filter((message) => message.subject === 'review-result')
  const [firstRequest, secondRequest] = requests
  assert.equal(requests.length, 2)
  assert.equal(results.length, 3)
  assert.ok(results.every((message) => message.sentAt >= firstRequest.sentAt))
  // A rework verdict also reaches the worker; a clean one goes to the tower only.
  assert.equal(results.filter((message) => message.sentAt <= secondRequest.sentAt).length, 2)
  assert.equal(results.filter((message) => message.sentAt >= secondRequest.sentAt).length, 1)
  // The tower never read its inbox; worker-1 read what it was sent.
  for (const message of protocol.filter((entry) => entry.to === 'tower')) {
    assert.deepEqual([message.read, message.unreadBy], [false, ['tower']])
  }
  assert.equal(results.find((message) => message.to === 'worker-1').read, true)

  const bySubject = (subject) => snapshot.messages.find((message) => message.subject === subject)
  const acked = bySubject('contract ready')
  assert.deepEqual(acked, {
    id: acked.id,
    from: 'tower',
    to: 'worker-2',
    subject: 'contract ready',
    sentAt: acked.sentAt,
    scope: 'M2',
    read: true,
  })
  const pending = bySubject('status?')
  assert.deepEqual(pending, {
    id: pending.id,
    from: 'tower',
    to: 'worker-2',
    subject: 'status?',
    sentAt: pending.sentAt,
    action: 'ping',
    scope: 'M2',
    read: false,
    unreadBy: ['worker-2'],
  })
  assert.deepEqual(bySubject('question about tokens').unreadBy, ['tower'])
  // Broadcast from worker-2: it never has to read its own message, worker-4 is
  // dead, worker-5 joined later; worker-1 and reviewer-1 read it, the tower did not.
  const broadcast = bySubject('heads up')
  assert.equal(broadcast.to, 'all')
  assert.equal(broadcast.read, false)
  assert.deepEqual(broadcast.unreadBy, ['tower'])

  // Findings, keyed by title because the sort key is their timestamp.
  assert.equal(snapshot.findings.length, 3)
  const findings = new Map(snapshot.findings.map((finding) => [finding.title, finding]))
  const bug = findings.get('Null dereference on expired token')
  const idea = findings.get('Rate limit header would help')
  const vuln = findings.get('Token is logged in plain text')
  assert.deepEqual(Object.keys(bug), FINDING_KEYS)
  assert.equal(bug.type, 'bug')
  assert.equal(bug.severity, 'high')
  assert.equal(bug.location, 'src/auth/login.ts:12')
  assert.equal(bug.summary, 'First paragraph line one. Line two of the first paragraph.')
  assert.equal(bug.agent, 'worker-2')
  assert.equal(bug.missionId, 'M2')
  assert.match(bug.file, /^\.tower\/comms\/findings\/\d{8}-worker-2-bug-[\w-]+\.md$/)
  assert.match(bug.createdAt, INSTANT)
  assert.equal(idea.severity, 'medium')
  assert.equal('location' in idea, false)
  assert.equal(idea.summary, 'Single line summary.')
  assert.equal('missionId' in idea, false)
  assert.equal(vuln.severity, 'critical')
  assert.equal(vuln.summary.length, 300)

  // Instants are the ones the activity log recorded.
  const log = await store.recentLog(1000)
  assert.equal(c1.review.at, log.find((line) => line.includes(' review.write ') && line.includes(' round=2 ')).split(' ')[0])
  assert.equal(bug.createdAt, log.find((line) => line.endsWith(` ref=${bug.file}`)).split(' ')[0])

  // The activity tail is the store's own view of it.
  assert.ok(log.length > 10)
  assert.deepEqual(snapshot.activity, log.slice(-50))

  // Another session never sees this tower.
  assert.equal((await canvasSnapshot(ctx, 'session-other')).active, false)
})

test('the canvas snapshot is strictly read-only: no store write, no lock, no acknowledged message', async () => {
  const { ctx, dir, store, warnings } = await getWorld()
  const comms = join(dir, '.tower/comms')
  const stateFile = join(comms, 'state.json')
  const readMarks = (state) => ({
    tower: state.inboxAckIds,
    roster: state.roster.agents.map((entry) => [entry.name, entry.lastInboxReadAt, entry.inboxAckIds]),
  })
  // There is unread mail, so a snapshot that acknowledged anything would change the marks.
  assert.ok((await store.readUnreadInbox('tower', 1000)).length > 0)
  assert.ok((await store.readUnreadInbox('worker-2', 1000)).length > 0)
  const treeBefore = await treeOf(comms)
  const stateBefore = await readFile(stateFile, 'utf8')
  const mtimeBefore = (await stat(stateFile)).mtimeMs
  const marksBefore = readMarks(await store.load())

  const spy = spyStore([
    'readInbox', 'readUnreadInbox', 'ackInbox',
    'save', 'appendLog', 'writeUnique',
    'withProtocolLock',
  ])
  try {
    assert.equal((await canvasSnapshot(ctx, 'session-main')).active, true)
    assert.equal((await callRoute(ctx, '/tower/state?sessionId=session-main&detail=1')).status, 200)
    assert.equal((await callRoute(ctx, '/tower/state?sessionId=session-main')).status, 200)
  } finally {
    spy.restore()
  }
  assert.deepEqual(spy.calls, [])
  assert.deepEqual(warnings, [])

  assert.deepEqual(await treeOf(comms), treeBefore)
  assert.equal(await readFile(stateFile, 'utf8'), stateBefore)
  assert.equal((await stat(stateFile)).mtimeMs, mtimeBefore)
  assert.deepEqual(readMarks(await store.load()), marksBefore)
})

test('per-recipient read state agrees with store.readUnreadInbox one to one', async () => {
  const { ctx, store } = await getWorld()
  const state = await store.load()
  const snapshot = await canvasSnapshot(ctx, 'session-main')
  const everyone = ['tower', ...state.roster.agents.map((entry) => entry.name)]

  // What the store itself answers for each recipient.
  const storeUnread = new Map()
  for (const name of everyone) {
    const items = await store.readUnreadInbox(name, 1000)
    storeUnread.set(name, new Set(items.map((item) => item.messageId)))
  }

  let compared = 0
  let unreadPairs = 0
  for (const message of snapshot.messages) {
    for (const name of everyone) {
      // The store lists a message for the tower, its addressee, and broadcasts.
      const visible = name === 'tower' || message.to === name || message.to === 'all'
      if (!visible) continue
      const unread = inboxItemUnread(state, name, { messageId: message.id, sentAt: message.sentAt })
      assert.equal(unread, storeUnread.get(name).has(message.id), `${name} and "${message.subject}"`)
      compared += 1
    }
    // Whoever the snapshot reports as not having read a message is unread in the store too.
    for (const name of message.unreadBy ?? []) {
      assert.equal(storeUnread.get(name).has(message.id), true, `${name} and "${message.subject}"`)
      unreadPairs += 1
    }
  }
  // Every unread pair is also a compared pair, and the comparison was not vacuous.
  assert.ok(compared > unreadPairs && unreadPairs >= 3, `compared ${String(compared)} pairs, ${String(unreadPairs)} of them unread`)
})

test('timestamps come from the log tail and fall back to the date on the document', async () => {
  const { dir, base } = await makeRepo('tower-canvas-tail-')
  const store = new TowerStore(dir)
  await store.init('session-main')
  const [mission] = await store.plan([{ title: 'Canvas tail', scope: ['src/tail/**'], tasks: ['ship'] }])
  await store.addWorktree(mission.worktree, mission.branch, base)
  const worktree = store.abs(join('.tower/worktrees', mission.worktree))
  await mkdir(join(worktree, 'src/tail'), { recursive: true })
  await writeFile(join(worktree, 'src/tail/a.ts'), 'export const a = 1\n')
  commitAll(worktree, 'feat: tail')
  await spawnWorker(store, mission, 'worker-1', 'session-w1')
  await store.updateMission('worker-1', mission.id, { taskDone: 'ship' })
  await store.complete('worker-1', 'shipped')
  await store.registerSpawnedAgent({
    name: 'reviewer-1',
    agentId: 'session-r1',
    sessionId: 'session-main',
    kind: 'reviewer',
    reviewTarget: mission.branch,
    spawnedAt: new Date().toISOString(),
  })
  await store.submitReview('reviewer-1', { target: mission.branch, status: 'clean', merge: 'merge', findings: 'none', decision: 'approved' })
  const filed = await store.fileFinding('worker-1', {
    type: 'bug',
    title: 'Tail finding',
    summary: 'summary',
    details: 'details',
    suggestedFix: 'fix',
  })
  const main = { agents: { get: (id) => (id === 'session-main' ? agent(id, dir) : undefined) } }

  // While the log lines are in the tail, both timestamps are full instants.
  const fresh = await canvasSnapshot(main, 'session-main')
  assert.match(fresh.missions[0].review.at, INSTANT)
  assert.match(fresh.findings[0].createdAt, INSTANT)

  // 1005 later lines push both out of the tail of the last 1000.
  const flood = Array.from({ length: 1005 }, (_, index) => `2026-01-01T00:00:00.000Z tower log.flood n=${String(index)}\n`).join('')
  await appendFile(join(dir, '.tower/comms/log/activity.log'), flood)

  const stale = await canvasSnapshot(main, 'session-main')
  const reviews = (await readdir(join(dir, '.tower/comms/reviews'))).filter((file) => file.endsWith('.md'))
  assert.equal(reviews.length, 1)
  const reviewDate = /^date: (\S+)$/m.exec(await readFile(join(dir, '.tower/comms/reviews', reviews[0]), 'utf8'))[1]
  assert.equal(stale.missions[0].review.round, 1)
  assert.match(stale.missions[0].review.at, DATE)
  assert.equal(stale.missions[0].review.at, reviewDate)
  const findingDate = /^\*\*Date\*\*: (\d{8})$/m.exec(await readFile(store.abs(stale.findings[0].file), 'utf8'))[1]
  assert.match(stale.findings[0].createdAt, DATE)
  assert.equal(stale.findings[0].createdAt, `${findingDate.slice(0, 4)}-${findingDate.slice(4, 6)}-${findingDate.slice(6, 8)}`)
  // The activity tail is now the flood, capped at 50 lines.
  assert.equal(stale.activity.length, 50)
  assert.ok(stale.activity.every((line) => line.includes(' log.flood ')))
  assert.equal(stale.findings[0].file, filed)
})

test('text is single-lined and every list is capped', async () => {
  const { dir } = await makeRepo('tower-canvas-limits-')
  const store = new TowerStore(dir)
  await store.init('session-main')
  const flat = (text, max) => text.replace(/\s+/g, ' ').trim().slice(0, max)
  const [mission] = await store.plan([{
    title: 'Canvas limits',
    scope: Array.from({ length: 50 }, (_, index) => `glob${String(index + 1)}/**`),
    tasks: Array.from({ length: 120 }, (_, index) => `task ${String(index + 1)}\n\tindented`),
    context: `${'甲'.repeat(1500)}\n\t${'乙'.repeat(1500)}`,
  }])
  await spawnWorker(store, mission, 'worker-1', 'session-w1')
  const notes = Array.from({ length: 25 }, (_, index) => `note ${String(index + 1)}\n\tsecond   line ${'x'.repeat(600)}`)
  const blockers = Array.from({ length: 25 }, (_, index) => `blocker ${String(index + 1)}\n\tsecond line ${'y'.repeat(600)}`)
  for (const note of notes) await store.updateMission('tower', mission.id, { note })
  for (const blocker of blockers) await store.updateMission('worker-1', mission.id, { blocker })

  // The contract's limits, exported for the client and the docs.
  assert.equal(CANVAS_LIMITS.subject, 160)
  assert.equal(CANVAS_LIMITS.context, 2000)
  assert.equal(CANVAS_LIMITS.line, 500)
  assert.equal(CANVAS_LIMITS.tasks, 100)
  assert.equal(CANVAS_LIMITS.scope, 40)
  assert.equal(CANVAS_LIMITS.notes, 20)
  assert.equal(CANVAS_LIMITS.blockers, 20)
  assert.equal(CANVAS_LIMITS.messages, 200)
  assert.equal(CANVAS_LIMITS.activity, 50)

  const main = { agents: { get: (id) => (id === 'session-main' ? agent(id, dir) : undefined) } }
  const snapshot = await canvasSnapshot(main, 'session-main')
  const [card] = snapshot.missions
  assert.equal(card.context, `${'甲'.repeat(1500)} ${'乙'.repeat(499)}`)
  assert.equal(card.context.length, 2000)
  assert.equal(card.tasks.length, 100)
  assert.equal(card.tasksTotal, 120)
  assert.deepEqual(card.tasks[0], { text: 'task 1 indented', done: false })
  assert.equal(card.tasks[99].text, 'task 100 indented')
  assert.equal(card.scope.length, 40)
  assert.equal(card.scope[0], 'glob1/**')
  assert.deepEqual(card.notes, notes.slice(5).map((note) => flat(note, 500)))
  assert.ok(card.notes.every((note) => note.length === 500 && note === note.trim() && !/\s{2,}/.test(note)))
  assert.deepEqual(card.blockers, blockers.slice(5).map((blocker) => flat(blocker, 500)))
  assert.equal(card.blockers.length, 20)
  assert.equal(snapshot.activity.length, 50)
})

test('inbox subjects are single-lined and cut at 160 without splitting a character; messages are capped at 200', async () => {
  const { dir } = await makeRepo('tower-canvas-inbox-')
  const store = new TowerStore(dir)
  await store.init('session-main')
  await store.registerAgent({
    name: 'worker-1',
    agentId: 'session-w1',
    sessionId: 'session-main',
    kind: 'worker',
    spawnedAt: new Date().toISOString(),
  })
  const subjects = Array.from({ length: 204 }, (_, index) => `subject ${String(index + 1)}`)
  for (const [index, subject] of subjects.entries()) {
    await store.send('tower', { to: 'worker-1', subject, body: 'BODY-MUST-NOT-LEAK' })
    // A clear gap after the seventh message makes "the newest 200" unambiguous,
    // even where other sends share a millisecond.
    if (index === 6) await new Promise((resolve) => setTimeout(resolve, 5))
  }
  const emojiId = (await store.sendDetailed('tower', {
    to: 'worker-1',
    subject: `smiley ${'😀'.repeat(300)}`,
    body: 'BODY-MUST-NOT-LEAK',
  })).item.messageId
  // A hand-written inbox file, the kind the store refuses to send itself: a
  // subject with tabs, wide gaps, and a no-break space inside one value.
  await writeFile(join(dir, '.tower/comms/inbox', 'hand-written.md'), [
    '---',
    'type: inbox',
    'message_id: hand-written-1',
    'from: tower',
    'to: worker-1',
    'subject: hand\twritten   subject \u00a0 with gaps',
    `sent_at: ${new Date(Date.now() + 1000).toISOString()}`,
    '---',
    '',
    'BODY-MUST-NOT-LEAK',
    '',
  ].join('\n'))
  // Another one addressed to a name that is not on the roster at all.
  await writeFile(join(dir, '.tower/comms/inbox', 'hand-written-ghost.md'), [
    '---',
    'type: inbox',
    'message_id: hand-written-2',
    'from: tower',
    'to: ghost-agent',
    'subject: to a name that is not on the roster',
    `sent_at: ${new Date(Date.now() + 2000).toISOString()}`,
    '---',
    '',
    'BODY-MUST-NOT-LEAK',
    '',
  ].join('\n'))

  const main = { agents: { get: (id) => (id === 'session-main' ? agent(id, dir) : undefined) } }
  const snapshot = wire(await canvasSnapshot(main, 'session-main'))
  // The newest 200 of 207, oldest first: subjects 1 to 7 are the ones dropped.
  assert.equal(snapshot.messages.length, 200)
  const numbers = snapshot.messages
    .map((message) => /^subject (\d+)$/.exec(message.subject)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b)
  assert.deepEqual(numbers, Array.from({ length: 197 }, (_, index) => index + 8))
  const sentAts = snapshot.messages.map((message) => message.sentAt)
  assert.deepEqual(sentAts, [...sentAts].sort((a, b) => a.localeCompare(b)))
  // An emoji is two UTF-16 code units. After the 7-character prefix a cut at
  // 160 would split a pair, so one more unit goes: 76 whole emoji, 159 units.
  const cut = snapshot.messages.find((message) => message.id === emojiId).subject
  assert.equal(cut.length, 159)
  assert.equal(cut.slice(7), '😀'.repeat(76))
  assert.equal(JSON.stringify(snapshot.messages).includes('BODY-MUST-NOT-LEAK'), false)
  const handWritten = snapshot.messages.find((message) => message.id === 'hand-written-1')
  assert.equal(handWritten.id, 'hand-written-1')
  assert.equal(handWritten.subject, 'hand written subject with gaps')
  assert.equal(handWritten.read, false)
  assert.deepEqual(handWritten.unreadBy, ['worker-1'])
  // Nobody has to read a message addressed to a name that is not on the roster.
  const ghost = snapshot.messages.at(-1)
  assert.deepEqual(ghost, {
    id: 'hand-written-2',
    from: 'tower',
    to: 'ghost-agent',
    subject: 'to a name that is not on the roster',
    sentAt: ghost.sentAt,
    read: true,
  })
})

test('a session without a tower gets the inactive canvas: five empty arrays and nothing read', async () => {
  let asked = 0
  const ctx = { agents: { get: () => { asked += 1; return undefined } } }
  assert.deepEqual(await canvasSnapshot(ctx, 'session-none'), {
    active: false,
    running: 0,
    missions: [],
    agents: [],
    messages: [],
    findings: [],
    activity: [],
  })
  assert.equal(asked, 1)
})
