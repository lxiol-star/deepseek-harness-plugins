import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../lib/index.js'

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

async function makeRepo() {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), 'tower-harness-')))
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.name', 'Tower Harness'])
  git(dir, ['config', 'user.email', 'tower@example.test'])
  await writeFile(join(dir, 'README.md'), '# harness\n')
  git(dir, ['add', '-A'])
  git(dir, ['commit', '-q', '-m', 'init'])
  return dir
}

/**
 * A structural stand-in for the DSH Host context, limited to the services the
 * plugin touches. It records registrations so the test can drive them the way
 * the real dispatcher would.
 */
function makeHarness({ cwd }) {
  const agents = new Map()
  const listeners = new Map()
  const tools = new Map()
  const whens = new Map()
  const guards = new Map()
  const restrictions = new Map()
  const sections = []
  const commands = new Map()
  const restricted = []
  const interrupted = []
  let activationCount = 0

  const ctx = {
    tools: {
      register(definition, options) {
        tools.set(definition.name, definition)
        whens.set(definition.name, options?.when)
        return () => tools.delete(definition.name)
      },
      get(name) {
        return tools.get(name)
      },
      restrict(filter) {
        restricted.push(filter)
        return () => {}
      },
      guard(guard) {
        guards.set(`${guard}#${guards.size}`, guard)
        return () => {}
      },
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
        return () => {}
      },
      getSectionOrder() {
        return 500
      },
    },
    agents: {
      get(id) {
        return agents.get(id)
      },
      list() {
        return [...agents.values()]
      },
    },
    subagents: {
      async startActivation(spec) {
        activationCount += 1
        const child = makeAgent({
          id: spec.childId,
          cwd: spec.cwd,
          parentSession: spec.parent.id,
          origin: 'subagent',
          events: [],
        })
        agents.set(spec.childId, child)
        // The real runtime publishes the child before resolving the activation.
        for (const listener of listeners.get('agent/created') ?? []) {
          await listener({ agent: child })
        }
        return {
          childId: spec.childId,
          name: spec.name,
          result: Promise.resolve({ output: [] }),
          dispose: async () => {},
        }
      },
      async sendMessage(sender, targetId, content) {
        const target = agents.get(targetId)
        if (target === undefined) throw new Error(`no child ${targetId}`)
        target.received.push(...content)
        return 'message-1'
      },
      interrupt(targetId) {
        interrupted.push(targetId)
      },
    },
    commands: {
      register(definition) {
        commands.set(definition.name, definition)
        return () => commands.delete(definition.name)
      },
    },
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return () => {}
    },
    inject(_services, callback) {
      callback(ctx)
      return { dispose: async () => {} }
    },
    effect(register) {
      return register()
    },
    get(name) {
      return name === 'planMode' ? { set() {} } : undefined
    },
    logger: {
      info() {},
      warn(...args) {
        if (process.env.TOWER_HARNESS_VERBOSE === '1') console.warn(...args)
      },
      debug() {},
    },
  }

  function makeAgent({ id, cwd: agentCwd, parentSession, origin, events }) {
    const record = { steer: [], followup: [], inject: [], received: [] }
    const agent = {
      id,
      status: 'idle',
      session: {
        id,
        header: { id, cwd: agentCwd, parentSession, origin },
        snapshotEvents: () => events,
      },
      ctx: {
        tools: {
          register() {
            return () => {}
          },
          get(name) {
            return tools.get(name)
          },
          restrict(filter) {
            restricted.push(filter)
            return () => {}
          },
          guard(guard) {
            const list = guards.get(id) ?? []
            list.push(guard)
            guards.set(id, list)
            return () => {}
          },
        },
        systemPrompt: {
          section(section) {
            sections.push({ ...section, agentId: id })
            return () => {}
          },
        },
      },
      steer(message) {
        record.steer.push(message)
      },
      followup(message) {
        record.followup.push(message)
      },
      inject(message) {
        record.inject.push(message)
      },
      async whenIdle() {},
      record,
    }
    return agent
  }

  const main = makeAgent({ id: 'session-main', cwd, events: [] })
  agents.set(main.id, main)
  return {
    ctx,
    main,
    agents,
    listeners,
    tools,
    whens,
    guards,
    sections,
    commands,
    restricted,
    interrupted,
    get activationCount() {
      return activationCount
    },
  }
}

function execution(agent, args, name) {
  return { agent, arguments: args, signal: new AbortController().signal, name, callId: `call-${name}` }
}

test('tower_activate lets a workspace main agent enter the mode, only where the profile allows it', async () => {
  const dir = await makeRepo()
  try {
    // Off by default: a profile that installs the plugin does not hand agents the key to unrestricted orchestration. The tool is
    // registered like every other tower tool and stays hidden through its `when` rule, which is what the Host filters on.
    const closed = makeHarness({ cwd: dir })
    apply(closed.ctx, {})
    const closedWhen = closed.whens.get('tower_activate')
    assert.equal(typeof closedWhen, 'function', 'registered, so its visibility rule is what decides')
    assert.equal(closedWhen({ agent: closed.main }), false, 'hidden without the flag')

    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, { agentCanEnable: true })
    const tool = harness.tools.get('tower_activate')
    const when = harness.whens.get('tower_activate')
    assert.ok(tool && when, 'flag registers tower_activate with a visibility rule')
    assert.equal(when({ agent: harness.main }), true, 'offered to a workspace main agent while tower is off')
    const child = { id: 'child', session: { header: { id: 'child', cwd: dir, parentSession: 'session-main', origin: 'subagent' } } }
    assert.equal(when({ agent: child }), false, 'never offered to a subagent')

    const result = await tool.execute({}, execution(harness.main, {}, 'tower_activate'))
    assert.match(result.text, /Tower mode: ON/)
    const state = JSON.parse(await readFile(join(dir, '.tower/comms/state.json'), 'utf8'))
    assert.equal(state.sessionId, 'session-main')
    assert.equal(when({ agent: harness.main }), false, 'withdrawn once tower is active')

    const again = await tool.execute({}, execution(harness.main, {}, 'tower_activate'))
    assert.match(again.text, /already active/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the /tower command activates the mode and the tool set', async () => {
  const dir = await makeRepo()
  try {
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    const command = harness.commands.get('tower')
    assert.ok(command, '/tower command registered')

    const before = await harness.tools.get('tower_plan').execute({ missions: [] }, execution(harness.main, {}, 'tower_plan')).catch((error) => error)
    assert.match(String(before.message ?? before), /not active/, 'inactive main cannot plan')

    const result = await command.handler({ agent: harness.main, rawInput: ' on' })
    assert.equal(result.kind, 'success', result.text)
    assert.match(result.text, /Tower mode on/)
    assert.equal(harness.tools.get('tower_plan') != null, true)

    const state = JSON.parse(await readFile(join(dir, '.tower/comms/state.json'), 'utf8'))
    assert.equal(state.sessionId, 'session-main')
    assert.equal(state.base, git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']))

    const status = await command.handler({ agent: harness.main, rawInput: ' status' })
    assert.match(status.text, /Tower mode: ON/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('plan → spawn worker → complete → review → merge works through the tool surface', async () => {
  const dir = await makeRepo()
  try {
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    const command = harness.commands.get('tower')
    await command.handler({ agent: harness.main, rawInput: 'on' })

    const plan = await harness.tools.get('tower_plan').execute(
      {
        missions: [
          {
            title: 'M1 harness feature',
            scope: ['src/feature/**'],
            tasks: ['add the feature'],
          },
        ],
      },
      execution(harness.main, {}, 'tower_plan'),
    )
    assert.match(plan.text, /\| M1 \|/)
    const worktree = join(dir, '.tower/worktrees/wt-1')

    const spawn = await harness.tools.get('tower_spawn').execute(
      { name: 'worker-1', kind: 'worker', mission_id: 'M1' },
      execution(harness.main, {}, 'tower_spawn'),
    )
    assert.match(spawn.text, /status: running/)
    assert.equal(harness.activationCount, 1)

    const worker = [...harness.agents.values()].find((agent) => agent.id !== 'session-main')
    assert.ok(worker, 'worker agent exists')
    assert.equal(worker.session.header.cwd, worktree)
    const workerSections = harness.sections.filter((section) => section.agentId === worker.id)
    assert.ok(workerSections.some((section) => section.name === 'tower:worker'), 'worker overlay installed')
    const restrict = harness.restricted.at(-1)
    assert.ok(restrict.allow.includes('tower_complete'))

    await mkdir(join(worktree, 'src/feature'), { recursive: true })
    await writeFile(join(worktree, 'src/feature/a.ts'), 'export const a = 1\n')
    git(worktree, ['add', '-A'])
    git(worktree, ['commit', '-q', '-m', 'feat: a'])

    await harness.tools.get('tower_mission').execute(
      { id: 'M1', task_done: 'add the feature' },
      execution(worker, {}, 'tower_mission'),
    )
    const complete = await harness.tools.get('tower_complete').execute(
      { report: 'implemented the feature' },
      execution(worker, {}, 'tower_complete'),
    )
    assert.match(complete.text, /mission M1 persisted as completed/)

    const reviewSpawn = await harness.tools.get('tower_spawn').execute(
      { name: 'reviewer-1', kind: 'reviewer', review_target: 'feat/m1-harness-feature' },
      execution(harness.main, {}, 'tower_spawn'),
    )
    assert.match(reviewSpawn.text, /review_target/)
    const reviewer = [...harness.agents.values()].find((agent) => agent.id !== 'session-main' && agent !== worker)

    const review = await harness.tools.get('tower_review').execute(
      {
        target: 'feat/m1-harness-feature',
        status: 'clean',
        merge: 'merge',
        findings: 'none',
        decision: 'matches the mission',
      },
      execution(reviewer, {}, 'tower_review'),
    )
    assert.match(review.text, /review submitted/)

    const merge = await harness.tools.get('tower_merge').execute(
      { branch: 'feat/m1-harness-feature' },
      execution(harness.main, {}, 'tower_merge'),
    )
    assert.match(merge.text, /merged feat\/m1-harness-feature/)
    assert.match(await readFile(join(dir, 'src/feature/a.ts'), 'utf8'), /export const a/)

    const after = JSON.parse(await readFile(join(dir, '.tower/comms/state.json'), 'utf8'))
    assert.equal(after.missions[0].status, 'merged')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('guards keep the tower in control: todo_write is denied and worker writes stay in the worktree', async () => {
  const dir = await makeRepo()
  try {
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})

    const mainGuards = harness.guards.get('session-main') ?? []
    const inactiveReset = mainGuards
      .map((guard) => guard({ name: 'bash', arguments: { command: 'git reset --hard' } }))
      .find(Boolean)
    assert.equal(inactiveReset, undefined, 'bash guard is inert while tower mode is off')

    await harness.commands.get('tower').handler({ agent: harness.main, rawInput: 'on' })
    const denial = mainGuards.map((guard) => guard({ name: 'todo_write', arguments: {} })).find(Boolean)
    assert.match(denial, /todo_write is not available/)
    const activeReset = mainGuards
      .map((guard) => guard({ name: 'bash', arguments: { command: 'git reset --hard' } }))
      .find(Boolean)
    assert.match(activeReset, /git reset --hard is refused/)

    await harness.tools.get('tower_plan').execute(
      { missions: [{ title: 'M1 guarded', scope: ['src/**'] }] },
      execution(harness.main, {}, 'tower_plan'),
    )
    await harness.tools.get('tower_spawn').execute(
      { name: 'worker-1', kind: 'worker', mission_id: 'M1' },
      execution(harness.main, {}, 'tower_spawn'),
    )
    const worker = [...harness.agents.values()].find((agent) => agent.id !== 'session-main')
    const workerGuards = harness.guards.get(worker.id) ?? []
    const outside = workerGuards
      .map((guard) => guard({ name: 'write', arguments: { file_path: join(dir, 'README.md') } }))
      .find(Boolean)
    assert.match(outside, /only write inside their own worktree/)
    const inside = workerGuards
      .map((guard) => guard({ name: 'write', arguments: { file_path: join(dir, '.tower/worktrees/wt-1/a.ts') } }))
      .find(Boolean)
    assert.equal(inside, undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('/tower off releases the mode and injects the exit notice', async () => {
  const dir = await makeRepo()
  try {
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    const command = harness.commands.get('tower')
    await command.handler({ agent: harness.main, rawInput: 'on' })
    const off = await command.handler({ agent: harness.main, rawInput: 'off' })
    assert.equal(off.kind, 'success')
    assert.match(off.text, /Tower mode off/)
    assert.equal(harness.main.record.inject.length, 1)

    const state = JSON.parse(await readFile(join(dir, '.tower/comms/state.json'), 'utf8'))
    assert.equal(state.sessionId, undefined)
    const plan = await harness.tools.get('tower_plan').execute({ missions: [] }, execution(harness.main, {}, 'tower_plan')).catch((error) => error)
    assert.match(String(plan.message ?? plan), /not active/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('empty optional mission arguments from a model do not become scope changes', async () => {
  const dir = await makeRepo()
  try {
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    await harness.commands.get('tower').handler({ agent: harness.main, rawInput: 'on' })
    await harness.tools.get('tower_plan').execute(
      { missions: [{ title: 'M1 empties', scope: ['src/**'], tasks: ['do it'] }] },
      execution(harness.main, {}, 'tower_plan'),
    )
    await harness.tools.get('tower_spawn').execute(
      { name: 'worker-1', kind: 'worker', mission_id: 'M1' },
      execution(harness.main, {}, 'tower_spawn'),
    )
    const worker = [...harness.agents.values()].find((agent) => agent.id !== 'session-main')
    const updated = await harness.tools.get('tower_mission').execute(
      {
        id: 'M1',
        status: 'active',
        note: 'done reading',
        blocker: '',
        clear_blockers: false,
        task_done: 'do it',
        task_drop: '',
        task_drop_reason: '',
        scope: [],
      },
      execution(worker, {}, 'tower_mission'),
    )
    assert.match(updated.text, /open tasks: 0/)
    const state = JSON.parse(await readFile(join(dir, '.tower/comms/state.json'), 'utf8'))
    assert.deepEqual(state.missions[0].tasks, [{ text: 'do it', done: true }])
    assert.deepEqual(state.missions[0].scope, ['src/**'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})


test('the /tower stop command interrupts the mission worker', async () => {
  const dir = await makeRepo()
  try {
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    const command = harness.commands.get('tower')
    await command.handler({ agent: harness.main, rawInput: ' on' })
    await harness.tools.get('tower_plan').execute(
      { missions: [{ title: 'M1 stop', scope: ['src/**'], tasks: ['work'] }] },
      execution(harness.main, {}, 'tower_plan'),
    )
    await harness.tools.get('tower_spawn').execute(
      { name: 'worker-1', kind: 'worker', mission_id: 'M1' },
      execution(harness.main, {}, 'tower_spawn'),
    )
    const worker = [...harness.agents.values()].find((candidate) => candidate.id !== 'session-main')
    worker.status = 'running'
    const stopped = await command.handler({ agent: harness.main, rawInput: ' stop M1' })
    assert.equal(stopped.kind, 'success', stopped.text)
    assert.match(stopped.text, /Stop requested for worker-1 on M1/)
    assert.deepEqual(harness.interrupted, [worker.id])
    const state = JSON.parse(await readFile(join(dir, '.tower/comms/state.json'), 'utf8'))
    assert.equal(state.missions[0].status, 'paused')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a successful /tower stop does not reactivate the mode on replay', async () => {
  const dir = await makeRepo()
  try {
    const harness = makeHarness({ cwd: dir })
    const events = harness.main.session.snapshotEvents()
    events.push(
      { type: 'command/run', data: { commandId: 'c1', name: 'tower', args: ' on' } },
      { type: 'command/done', data: { commandId: 'c1', kind: 'success' } },
      { type: 'command/run', data: { commandId: 'c2', name: 'tower', args: ' off' } },
      { type: 'command/done', data: { commandId: 'c2', kind: 'success' } },
      { type: 'command/run', data: { commandId: 'c3', name: 'tower', args: ' stop M1' } },
      { type: 'command/done', data: { commandId: 'c3', kind: 'success' } },
    )
    apply(harness.ctx, {})
    const status = await harness.commands.get('tower').handler({ agent: harness.main, rawInput: ' status' })
    assert.match(status.text, /Tower mode: OFF/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('activating twice on a clean checkout adds no empty commit', async () => {
  const dir = await makeRepo()
  try {
    const head = git(dir, ['rev-parse', 'HEAD'])
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    const turnOn = async () => harness.commands.get('tower').handler({ agent: harness.main, rawInput: ' on' })
    await turnOn()
    await harness.commands.get('tower').handler({ agent: harness.main, rawInput: ' off' })
    await turnOn()
    // Activation used to leave one blank `tower: init` commit per run on the operator's own branch.
    assert.equal(git(dir, ['rev-parse', 'HEAD']), head)
    assert.equal(git(dir, ['rev-list', '--count', 'HEAD']), '1')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('tower_init refuses an empty repository before staging files', async () => {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), 'tower-empty-')))
  try {
    git(dir, ['init', '-q'])
    await writeFile(join(dir, '.DS_Store'), 'x')
    await mkdir(join(dir, 'node_modules'))
    await writeFile(join(dir, 'node_modules', 'x.js'), 'x')
    const before = git(dir, ['symbolic-ref', '--short', 'HEAD'])
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    const result = await harness.commands.get('tower').handler({ agent: harness.main, rawInput: ' on' })
    assert.equal(result.kind, 'error')
    assert.match(result.text, /no commits/i)
    assert.equal(git(dir, ['symbolic-ref', '--short', 'HEAD']), before)
    assert.equal((await readFile(join(dir, '.tower/comms/state.json'), 'utf8').catch(() => null)), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('tower_init refuses a base checkout with too many dirty entries', async () => {
  const dir = await makeRepo()
  try {
    for (let i = 0; i < 201; i += 1) await writeFile(join(dir, `dirty-${String(i)}.txt`), 'x')
    const before = git(dir, ['symbolic-ref', '--short', 'HEAD'])
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    const result = await harness.commands.get('tower').handler({ agent: harness.main, rawInput: ' on' })
    assert.equal(result.kind, 'error')
    assert.match(result.text, /uncommitted entries/i)
    assert.equal(git(dir, ['symbolic-ref', '--short', 'HEAD']), before)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('text after /tower on is rejected instead of becoming a base branch', async () => {
  const dir = await makeRepo()
  try {
    const before = git(dir, ['symbolic-ref', '--short', 'HEAD'])
    const harness = makeHarness({ cwd: dir })
    apply(harness.ctx, {})
    const result = await harness.commands.get('tower').handler({
      agent: harness.main,
      rawInput: ' on 创建两个tower子任务我看下',
    })
    assert.equal(result.kind, 'error')
    assert.match(result.text, /Usage: \/tower on/)
    assert.equal(git(dir, ['symbolic-ref', '--short', 'HEAD']), before)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
