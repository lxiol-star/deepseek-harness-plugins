import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { execFileSync } from 'node:child_process'

import { TowerStore, towerSnapshot } from '../lib/index.js'

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
      model: { current: () => ({ provider: 'test', model: 'gpt-test', reasoningEffort: 'max' }) },
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
