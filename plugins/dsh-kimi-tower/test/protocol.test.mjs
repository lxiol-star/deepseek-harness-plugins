import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { TowerStore } from '../lib/index.js'

async function makeRepo() {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), 'tower-test-')))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Tower Test'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'tower@example.test'], { cwd: dir })
  await writeFile(join(dir, 'README.md'), '# demo\n')
  execFileSync('git', ['add', '-A'], { cwd: dir })
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir })
  const base = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
  return { dir, base }
}

function isAncestor(cwd, ancestor, ref) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, ref], { cwd, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function commitAll(cwd, message) {
  execFileSync('git', ['add', '-A'], { cwd })
  execFileSync('git', ['commit', '-q', '-m', message], { cwd })
}

test('init creates the workspace, plan validates titles, and main session is the tower', async () => {
  const { dir, base } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    const init = await store.init('session-main')
    assert.equal(init.created, true)
    assert.equal(init.base, base)
    assert.equal(await store.isInitialized(), true)
    const exclude = await readFile(join(dir, '.git/info/exclude'), 'utf8')
    assert.match(exclude, /\.tower/)

    const state = await store.load()
    assert.equal(state.sessionId, 'session-main')
    assert.equal(store.resolveCallerName(state, 'session-main'), 'tower')

    const planned = await store.plan([
      { title: 'B010100 API surface', scope: ['src/api/**'], tasks: ['add endpoint'] },
      { title: 'B010200 Docs', scope: ['docs/**'], tasks: ['write docs'] },
    ])
    assert.equal(planned.length, 2)
    assert.equal(planned[0].id, 'M1')
    assert.equal(planned[0].branch, 'feat/b010100-api-surface')
    assert.equal(planned[0].worktree, 'wt-1')

    await assert.rejects(
      store.plan([{ title: '中文任务', scope: ['src/cn/**'] }]),
      /printable ASCII/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('scope overlap auto-adds a merge dependency; survey reserves nothing', async () => {
  const { dir, base } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const planned = await store.plan([
      { title: 'M1 shared', scope: ['src/shared/**'] },
      { title: 'M2 shared too', scope: ['src/shared/api/**'] },
      { title: 'M3 survey', scope: ['src/shared/**'], kind: 'survey' },
    ])
    const state = await store.load()
    const m2 = state.missions.find((mission) => mission.id === planned[1].id)
    assert.deepEqual(m2.deps, ['M1'])
    const m3 = state.missions.find((mission) => mission.id === planned[2].id)
    assert.deepEqual(m3.deps, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('worker completes, reviewer approves, merge lands on base, teardown removes the worktree', async () => {
  const { dir, base } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [mission] = await store.plan([
      { title: 'M1 feature', scope: ['src/feature/**'], tasks: ['write feature'] },
    ])

    const added = await store.addWorktree(mission.worktree, mission.branch, base)
    assert.equal(added.spawnBase, undefined)
    const worktree = store.abs(join('.tower/worktrees', mission.worktree))
    await mkdir(join(worktree, 'src/feature'), { recursive: true })
    await writeFile(join(worktree, 'src/feature/a.ts'), 'export const a = 1\n')
    commitAll(worktree, 'feat: add a')

    await store.registerSpawnedAgent(
      {
        name: 'worker-1',
        agentId: 'session-worker-1',
        sessionId: 'session-main',
        kind: 'worker',
        missionId: mission.id,
        worktree: mission.worktree,
        branch: mission.branch,
        spawnedAt: new Date().toISOString(),
      },
      { id: mission.id, owner: 'worker-1' },
    )
    await store.updateMission('worker-1', mission.id, { taskDone: 'write feature' })

    const before = await store.missionGate(await store.load(), (await store.load()).missions[0], { activeAgentIds: new Set() })
    assert.equal(before.ready, false)
    assert.ok(before.blocks.some((block) => block.reason === 'not-completed'))

    const completion = await store.complete('worker-1', 'implemented feature a')
    assert.equal(completion.mission.status, 'completed')
    assert.equal(completion.message.item.subject.startsWith('review-request'), true)

    await store.registerSpawnedAgent({
      name: 'reviewer-1',
      agentId: 'session-reviewer-1',
      sessionId: 'session-main',
      kind: 'reviewer',
      reviewTarget: mission.branch,
      spawnedAt: new Date().toISOString(),
    })
    const review = await store.submitReview('reviewer-1', {
      target: mission.branch,
      status: 'clean',
      merge: 'merge',
      findings: 'none',
      decision: 'diff matches the mission',
    })
    assert.equal(review.review.status, 'clean')
    assert.equal(review.review.merge, 'merge')

    const merged = await store.merge(mission.branch, { activeAgentIds: new Set() })
    assert.equal(merged.status, 'merged')
    assert.equal((await readFile(join(dir, 'src/feature/a.ts'), 'utf8')).includes('export const a'), true)
    const after = await store.load()
    assert.equal(after.missions[0].status, 'merged')

    const report = await store.teardown({})
    assert.ok(report.some((line) => line.includes('wt-1')))
    await assert.rejects(readFile(join(worktree, 'README.md')), /ENOENT/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('merge gate refuses an out-of-scope diff and a stale base', async () => {
  const { dir, base } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [mission] = await store.plan([{ title: 'M1 scoped', scope: ['src/only/**'] }])
    await store.addWorktree(mission.worktree, mission.branch, base)
    const worktree = store.abs(join('.tower/worktrees', mission.worktree))
    await mkdir(join(worktree, 'src/other'), { recursive: true })
    await writeFile(join(worktree, 'src/other/out.ts'), 'export const out = 1\n')
    commitAll(worktree, 'out of scope')

    await store.registerSpawnedAgent(
      {
        name: 'worker-1',
        agentId: 'session-worker-1',
        sessionId: 'session-main',
        kind: 'worker',
        missionId: mission.id,
        worktree: mission.worktree,
        branch: mission.branch,
        spawnedAt: new Date().toISOString(),
      },
      { id: mission.id, owner: 'worker-1' },
    )
    await store.complete('worker-1', 'did it')
    await store.registerSpawnedAgent({
      name: 'reviewer-1',
      agentId: 'session-reviewer-1',
      sessionId: 'session-main',
      kind: 'reviewer',
      reviewTarget: mission.branch,
      spawnedAt: new Date().toISOString(),
    })
    await store.submitReview('reviewer-1', {
      target: mission.branch,
      status: 'clean',
      merge: 'merge',
      findings: 'none',
      decision: 'ok',
    })
    await assert.rejects(store.merge(mission.branch, { activeAgentIds: new Set() }), /scope/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a lost state file is reported and recovered minimally by send', async () => {
  const { dir, base } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    await rm(join(dir, '.tower/comms/state.json'))
    assert.equal(await store.isStateLost(), true)
    const recovered = await store.loadOrRecover()
    assert.equal(typeof recovered.recoveredAt, 'string')
    assert.equal(recovered.base, base)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('rebase moves a stale mission onto the advanced base and refuses while the worker is busy', async () => {
  const { dir, base } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [mission] = await store.plan([{ title: 'M1 rebase me', scope: ['src/**'] }])
    await store.addWorktree(mission.worktree, mission.branch, base)
    const worktree = store.abs(join('.tower/worktrees', mission.worktree))
    await mkdir(join(worktree, 'src'), { recursive: true })
    await writeFile(join(worktree, 'src/a.ts'), 'export const a = 1\n')
    commitAll(worktree, 'feat: a')
    await store.registerSpawnedAgent(
      {
        name: 'worker-1',
        agentId: 'session-worker-1',
        sessionId: 'session-main',
        kind: 'worker',
        missionId: mission.id,
        worktree: mission.worktree,
        branch: mission.branch,
        spawnedAt: new Date().toISOString(),
      },
      { id: mission.id, owner: 'worker-1' },
    )

    await writeFile(join(dir, 'base.txt'), 'base moved\n')
    commitAll(dir, 'chore: move base')

    await assert.rejects(
      store.rebaseMission('tower', mission.id, { activeAgentIds: new Set(['session-worker-1']) }),
      /mid-turn/,
    )
    const result = await store.rebaseMission('tower', mission.id, { activeAgentIds: new Set() })
    assert.equal(result.status, 'rebased')
    assert.equal(isAncestor(dir, base, mission.branch), true)
    assert.equal((await readFile(join(worktree, 'base.txt'), 'utf8')).includes('base moved'), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a stale base blocks merge until the mission is rebased', async () => {
  const { dir, base } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [mission] = await store.plan([{ title: 'M1 stale', scope: ['src/**'], tasks: ['ship'] }])
    await store.addWorktree(mission.worktree, mission.branch, base)
    const worktree = store.abs(join('.tower/worktrees', mission.worktree))
    await mkdir(join(worktree, 'src'), { recursive: true })
    await writeFile(join(worktree, 'src/a.ts'), 'export const a = 1\n')
    commitAll(worktree, 'feat: a')

    await store.registerSpawnedAgent(
      {
        name: 'worker-1',
        agentId: 'session-worker-1',
        sessionId: 'session-main',
        kind: 'worker',
        missionId: mission.id,
        worktree: mission.worktree,
        branch: mission.branch,
        spawnedAt: new Date().toISOString(),
      },
      { id: mission.id, owner: 'worker-1' },
    )
    await store.updateMission('worker-1', mission.id, { taskDone: 'ship' })
    await store.complete('worker-1', 'shipped')
    await store.registerSpawnedAgent({
      name: 'reviewer-1',
      agentId: 'session-reviewer-1',
      sessionId: 'session-main',
      kind: 'reviewer',
      reviewTarget: mission.branch,
      spawnedAt: new Date().toISOString(),
    })
    await store.submitReview('reviewer-1', {
      target: mission.branch,
      status: 'clean',
      merge: 'merge',
      findings: 'none',
      decision: 'ok',
    })

    await writeFile(join(dir, 'base.txt'), 'moved\n')
    commitAll(dir, 'chore: move base')

    await assert.rejects(store.merge(mission.branch, { activeAgentIds: new Set() }), /stale/)
    const rebased = await store.rebaseMission('tower', mission.id, { activeAgentIds: new Set() })
    assert.equal(rebased.status, 'rebased')
    const merged = await store.merge(mission.branch, { activeAgentIds: new Set() })
    assert.equal(merged.status, 'merged')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a non-clean review reopens a completed mission and only the assigned reviewer may submit', async () => {
  const { dir, base } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [mission] = await store.plan([{ title: 'M1 reopen', scope: ['src/**'], tasks: ['ship'] }])
    await store.addWorktree(mission.worktree, mission.branch, base)
    const worktree = store.abs(join('.tower/worktrees', mission.worktree))
    await mkdir(join(worktree, 'src'), { recursive: true })
    await writeFile(join(worktree, 'src/a.ts'), 'export const a = 1\n')
    commitAll(worktree, 'feat: a')

    await store.registerSpawnedAgent(
      {
        name: 'worker-1',
        agentId: 'session-worker-1',
        sessionId: 'session-main',
        kind: 'worker',
        missionId: mission.id,
        worktree: mission.worktree,
        branch: mission.branch,
        spawnedAt: new Date().toISOString(),
      },
      { id: mission.id, owner: 'worker-1' },
    )
    await store.updateMission('worker-1', mission.id, { taskDone: 'ship' })
    await store.complete('worker-1', 'shipped')

    await store.registerSpawnedAgent({
      name: 'reviewer-1',
      agentId: 'session-reviewer-1',
      sessionId: 'session-main',
      kind: 'reviewer',
      reviewTarget: mission.branch,
      spawnedAt: new Date().toISOString(),
    })
    await assert.rejects(
      store.submitReview('worker-1', {
        target: mission.branch,
        status: 'clean',
        merge: 'merge',
        findings: 'none',
        decision: 'self review',
      }),
      /not an assigned reviewer/,
    )

    await store.submitReview('reviewer-1', {
      target: mission.branch,
      status: 'p1-1items',
      merge: 'fix-then-merge',
      findings: 'fix the edge case',
      decision: 'rework',
    })
    const state = await store.load()
    assert.equal(state.missions[0].status, 'active')
    assert.equal(state.missions[0].owner, 'worker-1')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('pauseMissionForStop is a one-way, session-bound transition', async () => {
  const { dir } = await makeRepo()
  try {
    const store = new TowerStore(dir)
    await store.init('session-main')
    const [mission] = await store.plan([{ title: 'M1 stop', scope: ['src/**'], tasks: ['work'] }])
    await store.updateMission('tower', mission.id, { status: 'active', owner: 'worker-1' })
    assert.equal(await store.pauseMissionForStop(mission.id, 'other-session'), false)
    assert.equal(await store.pauseMissionForStop(mission.id, 'session-main'), true)
    let state = await store.load()
    assert.equal(state.missions[0].status, 'paused')
    assert.equal(await store.pauseMissionForStop(mission.id, 'session-main'), false)
    state = await store.load()
    assert.equal(state.missions[0].status, 'paused')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
