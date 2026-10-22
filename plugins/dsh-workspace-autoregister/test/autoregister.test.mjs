/**
 * Host-side tests for dsh-workspace-autoregister.
 *
 * The plugin's `tools/result` listener is fire-and-forget, so positive effects
 * are awaited through `waitFor` polling. Negative cases pair the directory under
 * test with a sentinel Workspace in the same tool call: the sentinel's
 * registration proves the sequential scan finished, so the missing registration
 * is asserted deterministically instead of through a sleep. The fake context
 * runs `ctx.effect` disposers through `harness.dispose()`.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import {
  apply,
  candidateDirectories,
  collectPathCandidates,
  Config,
  inject,
  matchesWorkspaceSignature,
  name as pluginName,
  nestedProjectRoot,
} from '../lib/index.js'

const WAIT_TIMEOUT_MS = 2000
const POLL_INTERVAL_MS = 5
const CANDIDATE_CAP = 32
const DIRECTORY_CAP = 32

const EXPECTED_DEFAULT_CONFIG = {
  enabled: true,
  promptFiles: ['AGENTS.md', 'AGENTS.local.md'],
  requiredFiles: ['README.md'],
  requiredDirectories: ['plans', 'reports'],
  createSession: true,
  skipSessionDirectory: true,
  scanAncestors: 3,
  registerProjectRoot: true,
  sendHandoff: true,
  handoffFile: 'HANDOFF.md',
  handoffMaxBytes: 32768,
}

function delay(milliseconds) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
}

/** Poll a predicate until it is truthy, failing the test after the timeout. */
async function waitFor(predicate, description) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS
  for (;;) {
    if (await predicate()) return
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${WAIT_TIMEOUT_MS}ms waiting for ${description}`)
    }
    await delay(POLL_INTERVAL_MS)
  }
}

/** Drain the microtask queue so settled-but-unobserved work completes. */
async function flushEventLoop() {
  await new Promise(resolveFlush => setImmediate(resolveFlush))
  await new Promise(resolveFlush => setImmediate(resolveFlush))
}

async function createTempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-ws-auto-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

/** Build a real directory carrying (or deliberately missing) the signature. */
async function createWorkspaceDirectory(root, directoryName, options = {}) {
  const {
    promptFile = 'AGENTS.md',
    files = ['README.md'],
    directories = ['plans', 'reports'],
  } = options
  const directory = join(root, directoryName)
  await mkdir(directory, { recursive: true })
  if (promptFile !== null) await writeFile(join(directory, promptFile), '# prompt\n')
  for (const file of files) await writeFile(join(directory, file), '# file\n')
  for (const entry of directories) await mkdir(join(directory, entry), { recursive: true })
  return directory
}

function sessionAgent(cwd) {
  return { session: { header: { cwd } } }
}

function toolExec(args, options = {}) {
  const exec = { arguments: args }
  if (options.agent !== undefined) exec.agent = options.agent
  return exec
}

function successfulResult() {
  return { isError: false }
}

function validatedConfig(overrides = {}) {
  const outcome = Config['~standard'].validate(overrides)
  assert.equal(outcome.issues, undefined, `config validation failed: ${JSON.stringify(outcome.issues)}`)
  return outcome.value
}

/**
 * Fake Host context with a stateful Workspace registry, effect/dispose tracking,
 * service lookup, logger capture, and `tools/result` listener capture.
 */
function createHarness(options = {}) {
  const services = options.services ?? {}
  const listeners = []
  const effects = []
  const loggerCalls = { warn: [], info: [], debug: [], error: [] }
  const registryCalls = { resolve: [], create: [] }
  const workspacesByPath = new Map()
  const workspacesById = new Map()
  let nextWorkspaceNumber = 1

  const createImplementation = options.createWorkspace ?? (async (directory) => {
    const workspace = { id: `workspace-${nextWorkspaceNumber}`, path: directory, sessionIds: [] }
    nextWorkspaceNumber += 1
    return workspace
  })
  const resolveImplementation = options.resolveWorkspace
    ?? (async directory => workspacesByPath.get(directory))

  const workspaceRegistry = {
    async resolveByPath(directory) {
      registryCalls.resolve.push(directory)
      return resolveImplementation(directory)
    },
    async create(directory) {
      registryCalls.create.push(directory)
      const workspace = await createImplementation(directory)
      workspacesByPath.set(directory, workspace)
      workspacesById.set(workspace.id, workspace)
      return workspace
    },
  }

  const ctx = {
    workspaceRegistry,
    get(serviceName) {
      return services[serviceName]
    },
    effect(execute, label) {
      const disposer = execute()
      const entry = { disposer, label }
      effects.push(entry)
      return () => {
        const index = effects.indexOf(entry)
        if (index >= 0) effects.splice(index, 1)
        if (typeof disposer === 'function') disposer()
      }
    },
    on(eventName, handler) {
      listeners.push({ eventName, handler })
      return () => {
        const index = listeners.findIndex(entry => entry.handler === handler)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    logger: {
      warn(...args) {
        loggerCalls.warn.push(args)
      },
      info(...args) {
        loggerCalls.info.push(args)
      },
      debug(...args) {
        loggerCalls.debug.push(args)
      },
      error(...args) {
        loggerCalls.error.push(args)
      },
    },
  }

  return {
    ctx,
    listeners,
    effects,
    loggerCalls,
    registryCalls,
    workspacesByPath,
    workspacesById,
    effectLabels() {
      return effects.map(entry => entry.label)
    },
    /** Run every stored effect disposer, as fiber teardown would. */
    dispose() {
      for (const entry of effects.splice(0).reverse()) {
        if (typeof entry.disposer === 'function') entry.disposer()
      }
    },
    seedWorkspace(directory, workspace) {
      const seeded = workspace ?? {
        id: `workspace-${nextWorkspaceNumber++}`,
        path: directory,
        sessionIds: [],
      }
      workspacesByPath.set(directory, seeded)
      workspacesById.set(seeded.id, seeded)
      return seeded
    },
    handler() {
      assert.equal(listeners.length, 1, `expected exactly one listener, got ${listeners.length}`)
      return listeners[0].handler
    },
    fire(exec, result = successfulResult()) {
      return this.handler()(exec, result)
    },
  }
}

function createSessionControllerRecorder(options = {}) {
  const calls = []
  const prompts = []
  return {
    calls,
    prompts,
    async create(input) {
      calls.push(input)
      if (options.rejectWith !== undefined) throw options.rejectWith
      return { sessionId: `session-${calls.length}`, workspaceId: input.workspaceId }
    },
    async prompt(input) {
      prompts.push(input)
      if (options.rejectPromptWith !== undefined) throw options.rejectPromptWith
      return { accepted: true }
    },
  }
}

function createWorkingDirectoryRecorder(directory, options = {}) {
  const sessions = []
  return {
    sessions,
    get(session) {
      sessions.push(session)
      if (options.throws) throw new Error('working directory unavailable')
      return directory
    },
  }
}

test('exports the expected Host plugin surface', () => {
  assert.equal(pluginName, 'workspace-autoregister')
  assert.deepEqual(inject, ['workspaceRegistry'])
  assert.equal(typeof apply, 'function')
  assert.equal(Config['~standard'].version, 1)
  assert.equal(Config['~standard'].vendor, 'dsh-workspace-autoregister')
  assert.equal(typeof Config['~standard'].validate, 'function')
})

test('Config.validate fills defaults for omitted, null, and empty config', () => {
  for (const raw of [undefined, null, {}]) {
    const outcome = Config['~standard'].validate(raw)
    assert.equal(outcome.issues, undefined)
    assert.deepEqual(outcome.value, EXPECTED_DEFAULT_CONFIG)
  }

  const first = Config['~standard'].validate(undefined)
  first.value.promptFiles.push('MUTATED.md')
  first.value.requiredFiles.push('MUTATED.md')
  first.value.requiredDirectories.push('mutated')
  assert.deepEqual(Config['~standard'].validate({}).value, EXPECTED_DEFAULT_CONFIG)
})

test('Config.validate keeps every provided value', () => {
  const outcome = Config['~standard'].validate({
    enabled: false,
    promptFiles: ['PROMPT.md'],
    requiredFiles: [],
    requiredDirectories: [],
    createSession: false,
    skipSessionDirectory: false,
    scanAncestors: 0,
    registerProjectRoot: false,
    sendHandoff: false,
    handoffFile: 'HANDOFF.md',
    handoffMaxBytes: 1024,
  })
  assert.equal(outcome.issues, undefined)
  assert.deepEqual(outcome.value, {
    enabled: false,
    promptFiles: ['PROMPT.md'],
    requiredFiles: [],
    requiredDirectories: [],
    createSession: false,
    skipSessionDirectory: false,
    scanAncestors: 0,
    registerProjectRoot: false,
    sendHandoff: false,
    handoffFile: 'HANDOFF.md',
    handoffMaxBytes: 1024,
  })
})

test('Config.validate reports invalid values with issue paths', () => {
  for (const raw of ['not-an-object', 42, []]) {
    const outcome = Config['~standard'].validate(raw)
    assert.equal(outcome.value, undefined)
    assert.equal(outcome.issues.length, 1)
    assert.equal(outcome.issues[0].message, 'config must be an object')
    assert.deepEqual(outcome.issues[0].path, [])
  }

  const cases = [
    [{ enabled: 'yes' }, 'enabled', 'enabled must be a boolean'],
    [{ createSession: 1 }, 'createSession', 'createSession must be a boolean'],
    [{ skipSessionDirectory: 'no' }, 'skipSessionDirectory', 'skipSessionDirectory must be a boolean'],
    [{ scanAncestors: -1 }, 'scanAncestors', 'scanAncestors must be an integer between 0 and 8'],
    [{ scanAncestors: 9 }, 'scanAncestors', 'scanAncestors must be an integer between 0 and 8'],
    [{ scanAncestors: 1.5 }, 'scanAncestors', 'scanAncestors must be an integer between 0 and 8'],
    [{ registerProjectRoot: 'yes' }, 'registerProjectRoot', 'registerProjectRoot must be a boolean'],
    [{ promptFiles: [''] }, 'promptFiles', 'promptFiles must be an array of non-empty strings'],
    [{ promptFiles: 'AGENTS.md' }, 'promptFiles', 'promptFiles must be an array of non-empty strings'],
    [{ requiredFiles: [1] }, 'requiredFiles', 'requiredFiles must be an array of non-empty strings'],
    [{ requiredDirectories: null }, 'requiredDirectories', 'requiredDirectories must be an array of non-empty strings'],
    [{ unexpected: true }, 'unexpected', "unknown config field 'unexpected'"],
  ]
  for (const [raw, path, message] of cases) {
    const outcome = Config['~standard'].validate(raw)
    assert.equal(outcome.value, undefined)
    assert.equal(outcome.issues.length, 1)
    assert.deepEqual(outcome.issues[0].path, [path])
    assert.equal(outcome.issues[0].message, message)
  }

  const multiple = Config['~standard'].validate({
    enabled: 'yes',
    scanAncestors: 99,
    requiredFiles: [null],
  })
  assert.equal(multiple.issues.length, 3)
  assert.deepEqual(multiple.issues.map(issue => issue.path[0]), ['enabled', 'scanAncestors', 'requiredFiles'])

  const unknownFirst = Config['~standard'].validate({ enabled: 'yes', bogus: 1 })
  assert.equal(unknownFirst.issues.length, 2)
  assert.deepEqual(unknownFirst.issues.map(issue => issue.path[0]), ['bogus', 'enabled'])
})

test('candidateDirectories returns the candidate followed by bounded ancestors', () => {
  assert.deepEqual(candidateDirectories('/a/b/c/d/e', 0), ['/a/b/c/d/e'])
  assert.deepEqual(candidateDirectories('/a/b/c/d/e', 2), ['/a/b/c/d/e', '/a/b/c/d', '/a/b/c'])
  assert.deepEqual(candidateDirectories('/a', 3), ['/a'])
  assert.deepEqual(candidateDirectories('/', 3), [])
})

test('collectPathCandidates finds absolute paths, walks containers, and dedupes', () => {
  const candidates = collectPathCandidates({
    path: '/work/alpha',
    nested: { again: '/work/alpha' },
    command: 'cd /work/alpha && cat /work/alpha/notes.md',
    list: ['/work/beta', '/work/beta/', { deeper: '/work/gamma' }],
    padded: '  /work/gamma  ',
    scalars: [1, true, null],
    noPath: 'nothing-to-see',
  })
  assert.deepEqual(candidates, [
    '/work/alpha',
    '/work/alpha/notes.md',
    '/work/beta',
    '/work/beta/',
    '/work/gamma',
  ])
})

test('collectPathCandidates bounds candidates, path length, string length, and traversal', () => {
  const capped = collectPathCandidates(
    Array.from({ length: 40 }, (_, index) => `/cap/candidate-${index}`),
  )
  assert.equal(capped.length, CANDIDATE_CAP)
  assert.equal(capped[0], '/cap/candidate-0')
  assert.equal(capped[CANDIDATE_CAP - 1], '/cap/candidate-31')

  assert.deepEqual(collectPathCandidates({ path: `/${'a'.repeat(5000)}` }), [])
  assert.deepEqual(collectPathCandidates({ path: '/work/\0alpha' }), [])
  assert.deepEqual(collectPathCandidates({ text: `prefix ${'b'.repeat(40 * 1024)} /work/alpha` }), [])

  const manyStrings = Array.from({ length: 4100 }, () => 'filler')
  manyStrings.push('/work/too-late')
  assert.deepEqual(collectPathCandidates(manyStrings), [])

  assert.deepEqual(collectPathCandidates(undefined), [])
  assert.deepEqual(collectPathCandidates('/work/direct'), ['/work/direct'])
})

test('matchesWorkspaceSignature checks the configured directory signature', async t => {
  const root = await createTempRoot(t)
  const config = validatedConfig()

  const complete = await createWorkspaceDirectory(root, 'complete')
  assert.equal(await matchesWorkspaceSignature(complete, config), true)

  const localPrompt = await createWorkspaceDirectory(root, 'local-prompt', { promptFile: 'AGENTS.local.md' })
  assert.equal(await matchesWorkspaceSignature(localPrompt, config), true)

  const noPrompt = await createWorkspaceDirectory(root, 'no-prompt', { promptFile: null })
  assert.equal(await matchesWorkspaceSignature(noPrompt, config), false)

  const missingReadme = await createWorkspaceDirectory(root, 'missing-readme', { files: [] })
  assert.equal(await matchesWorkspaceSignature(missingReadme, config), false)

  const missingReports = await createWorkspaceDirectory(root, 'missing-reports', { directories: ['plans'] })
  assert.equal(await matchesWorkspaceSignature(missingReports, config), false)

  const fileNotDirectory = await createWorkspaceDirectory(root, 'file-not-directory', { directories: [] })
  await writeFile(join(fileNotDirectory, 'plans'), 'not a directory\n')
  assert.equal(await matchesWorkspaceSignature(fileNotDirectory, config), false)

  assert.equal(await matchesWorkspaceSignature(join(root, 'does-not-exist'), config), false)

  const custom = validatedConfig({
    promptFiles: ['CUSTOM.md'],
    requiredFiles: ['package.json'],
    requiredDirectories: [],
  })
  const customDirectory = await createWorkspaceDirectory(root, 'custom', {
    promptFile: 'CUSTOM.md',
    files: ['package.json'],
  })
  assert.equal(await matchesWorkspaceSignature(customDirectory, custom), true)
  assert.equal(await matchesWorkspaceSignature(complete, custom), false)
})

test('apply installs one tools/result listener and one dispose effect by default', () => {
  const harness = createHarness()
  apply(harness.ctx)
  assert.deepEqual(harness.listeners.map(entry => entry.eventName), ['tools/result'])
  assert.deepEqual(harness.effectLabels(), ['workspace-autoregister: dispose'])
  assert.equal(harness.registryCalls.resolve.length, 0)
  assert.equal(harness.registryCalls.create.length, 0)
})

test('apply with enabled:false installs neither a listener nor an effect', () => {
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ enabled: false }))
  assert.equal(harness.listeners.length, 0)
  assert.equal(harness.effects.length, 0)
})

test('apply rejects invalid direct config before installing anything', () => {
  const invalidType = createHarness()
  assert.throws(
    () => apply(invalidType.ctx, { enabled: 'yes' }),
    { message: /^dsh-workspace-autoregister: invalid config: enabled: enabled must be a boolean$/ },
  )
  assert.equal(invalidType.listeners.length, 0)
  assert.equal(invalidType.effects.length, 0)

  const unknownKey = createHarness()
  assert.throws(
    () => apply(unknownKey.ctx, { unexpected: true }),
    { message: /^dsh-workspace-autoregister: invalid config: unexpected: unknown config field 'unexpected'$/ },
  )
  assert.equal(unknownKey.listeners.length, 0)
  assert.equal(unknownKey.effects.length, 0)

  const disabledButInvalid = createHarness()
  assert.throws(
    () => apply(disabledButInvalid.ctx, { enabled: false, scanAncestors: 99 }),
    { message: /invalid config: scanAncestors: scanAncestors must be an integer between 0 and 8/ },
  )
  assert.equal(disabledButInvalid.listeners.length, 0)
  assert.equal(disabledButInvalid.effects.length, 0)
})

test('registers a signature Workspace and creates its first Session once', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'created-workspace')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({ services: { sessionController: sessions } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))

  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation')
  await waitFor(() => sessions.calls.length === 1, 'first Session creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.resolve, [workspaceDirectory])
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.deepEqual(sessions.calls, [{ workspaceId: 'workspace-1' }])
  assert.equal(harness.workspacesByPath.get(workspaceDirectory)?.id, 'workspace-1')
  assert.equal(harness.loggerCalls.info.length, 1)
  assert.match(harness.loggerCalls.info[0][0], /added workspace/)
  assert.deepEqual(harness.loggerCalls.warn, [])
})

test('a HANDOFF.md becomes the first Session prompt', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'handoff-workspace')
  await writeFile(join(workspaceDirectory, 'HANDOFF.md'), '# 交接\n\n把 gateway 的计费改动接过来。\n')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({ services: { sessionController: sessions } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => sessions.prompts.length === 1, 'handoff prompt')

  assert.equal(sessions.prompts[0].sessionId, 'session-1')
  assert.equal(sessions.prompts[0].mode, 'queue')
  assert.equal(typeof sessions.prompts[0].requestId, 'string')
  const text = sessions.prompts[0].content[0].text
  assert.match(text, /HANDOFF\.md/)
  assert.match(text, /gateway 的计费改动接过来/)
  assert.equal(harness.loggerCalls.warn.length, 0)
})

test('sendHandoff:false creates the first Session without a prompt', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'no-handoff')
  await writeFile(join(workspaceDirectory, 'HANDOFF.md'), 'should not be sent')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({ services: { sessionController: sessions } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1, sendHandoff: false }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => sessions.calls.length === 1, 'first Session creation')
  await flushEventLoop()

  assert.deepEqual(sessions.prompts, [])
})

test('createSession:false registers the Workspace without a first Session', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'no-session')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({ services: { sessionController: sessions } })
  apply(harness.ctx, validatedConfig({ createSession: false, scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.deepEqual(sessions.calls, [])
})

test('registration succeeds when no sessionController service is present', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'no-service')
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.equal(harness.loggerCalls.info.length, 1)
  assert.deepEqual(harness.loggerCalls.warn, [])
})

test('a directory without the full signature is not registered', async t => {
  const root = await createTempRoot(t)
  const incomplete = await createWorkspaceDirectory(root, 'incomplete', { directories: ['plans'] })
  const complete = await createWorkspaceDirectory(root, 'complete')
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  // The scan is sequential, so the sentinel registration proves `incomplete`
  // was inspected and rejected first.
  harness.fire(toolExec({ paths: [incomplete, complete] }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'sentinel workspace creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [complete])
  assert.deepEqual(harness.registryCalls.resolve, [complete])
})

test('errored tool results are ignored and later scans still work', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'errored-first')
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  assert.doesNotThrow(() => harness.fire(toolExec({ path: workspaceDirectory }), { isError: true }))
  await flushEventLoop()
  assert.deepEqual(harness.registryCalls.resolve, [])
  assert.deepEqual(harness.registryCalls.create, [])

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation after the errored result')
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
})

test('duplicate events register one Workspace and one Session', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'duplicate')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({ services: { sessionController: sessions } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'single workspace creation')
  await waitFor(() => sessions.calls.length === 1, 'single Session creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.equal(sessions.calls.length, 1)
  assert.ok(harness.registryCalls.resolve.length >= 1)

  const resolutionsAfterRegistration = harness.registryCalls.resolve.length
  harness.fire(toolExec({ path: workspaceDirectory }))
  await flushEventLoop()
  assert.equal(harness.registryCalls.resolve.length, resolutionsAfterRegistration)
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.equal(sessions.calls.length, 1)
})

test('a directory the registry already resolves is not created again', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'existing')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({ services: { sessionController: sessions } })
  harness.seedWorkspace(workspaceDirectory, { id: 'existing-workspace', path: workspaceDirectory })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => harness.registryCalls.resolve.includes(workspaceDirectory), 'registry resolution')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.resolve, [workspaceDirectory])
  assert.deepEqual(harness.registryCalls.create, [])
  assert.deepEqual(sessions.calls, [])
  assert.deepEqual(harness.loggerCalls.info, [])

  harness.fire(toolExec({ path: workspaceDirectory }))
  await flushEventLoop()
  assert.deepEqual(harness.registryCalls.resolve, [workspaceDirectory])
})

test('a workspace that already has Sessions gets no second blank Session', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'imported-workspace')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({
    services: { sessionController: sessions },
    createWorkspace: async (directory) => ({
      id: 'workspace-imported',
      path: directory,
      sessionIds: ['session-existing'],
    }),
  })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation')
  await waitFor(() => harness.loggerCalls.info.length === 1, 'registration log')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.deepEqual(sessions.calls, [])
  assert.equal(harness.loggerCalls.info.length, 1)
})

test('a returned canonical path suppresses later lookups for the same directory', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'canonical')
  const canonicalPath = resolve(workspaceDirectory)
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({
    services: { sessionController: sessions },
    createWorkspace: async () => ({ id: 'workspace-canonical', path: canonicalPath, sessionIds: [] }),
  })
  apply(harness.ctx, validatedConfig({ scanAncestors: 0 }))

  harness.fire(toolExec({ path: `${workspaceDirectory}/` }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'first registration')
  await waitFor(() => sessions.calls.length === 1, 'first Session creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [`${workspaceDirectory}/`])
  assert.equal(harness.registryCalls.resolve.length, 1)

  harness.fire(toolExec({ path: canonicalPath }))
  await flushEventLoop()
  assert.equal(harness.registryCalls.resolve.length, 1)
  assert.equal(harness.registryCalls.create.length, 1)

  harness.fire(toolExec({ path: `${workspaceDirectory}/` }))
  await flushEventLoop()
  assert.equal(harness.registryCalls.resolve.length, 1)
  assert.equal(harness.registryCalls.create.length, 1)
})

test('after dispose a later tool result registers and creates nothing', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'after-dispose')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({ services: { sessionController: sessions } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))
  assert.deepEqual(harness.effectLabels(), ['workspace-autoregister: dispose'])

  harness.dispose()
  harness.dispose()
  harness.fire(toolExec({ path: workspaceDirectory }))
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.resolve, [])
  assert.deepEqual(harness.registryCalls.create, [])
  assert.deepEqual(sessions.calls, [])
  assert.deepEqual(harness.loggerCalls.info, [])
  assert.deepEqual(harness.loggerCalls.warn, [])
})

test('disposal while a registration is in flight suppresses its first Session', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'dispose-during-create')
  const sessions = createSessionControllerRecorder()
  let harness
  harness = createHarness({
    services: { sessionController: sessions },
    createWorkspace: async (directory) => {
      harness.dispose()
      return { id: 'raced-workspace', path: directory, sessionIds: [] }
    },
  })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation to start')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.deepEqual(sessions.calls, [])
  assert.deepEqual(harness.loggerCalls.info, [])
})

test('skipSessionDirectory excludes the calling session cwd', async t => {
  const root = await createTempRoot(t)
  const sessionDirectory = await createWorkspaceDirectory(root, 'session-cwd')
  const otherDirectory = await createWorkspaceDirectory(root, 'other-workspace')
  const sessions = createSessionControllerRecorder()
  const harness = createHarness({ services: { sessionController: sessions } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec(
    { paths: [sessionDirectory, otherDirectory] },
    { agent: sessionAgent(sessionDirectory) },
  ))
  await waitFor(() => harness.registryCalls.create.length === 1, 'sentinel workspace creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [otherDirectory])
  assert.deepEqual(harness.registryCalls.resolve, [otherDirectory])
  assert.deepEqual(sessions.calls, [{ workspaceId: 'workspace-1' }])
})

test('skipSessionDirectory:false registers the calling session cwd', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'session-cwd')
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ skipSessionDirectory: false, scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }, { agent: sessionAgent(workspaceDirectory) }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation')
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
})

test('skipSessionDirectory compares canonical paths, not spellings', async t => {
  const root = await createTempRoot(t)
  const sessionDirectory = await createWorkspaceDirectory(root, 'canonical-session-cwd')
  const sentinelDirectory = await createWorkspaceDirectory(root, 'canonical-sentinel')
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ scanAncestors: 0 }))

  harness.fire(toolExec(
    {
      paths: [
        `${sessionDirectory}/`,
        join(sessionDirectory, 'nested', '..'),
        sentinelDirectory,
      ],
    },
    { agent: sessionAgent(sessionDirectory) },
  ))
  await waitFor(() => harness.registryCalls.create.length === 1, 'sentinel workspace creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [sentinelDirectory])
  assert.deepEqual(harness.registryCalls.resolve, [sentinelDirectory])
})

test('the workingDirectory service supplies the session directory', async t => {
  const root = await createTempRoot(t)
  const sessionDirectory = await createWorkspaceDirectory(root, 'service-session-cwd')
  const otherDirectory = await createWorkspaceDirectory(root, 'service-other')
  const workingDirectory = createWorkingDirectoryRecorder(sessionDirectory)
  const harness = createHarness({ services: { workingDirectory } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))
  const agent = sessionAgent('/header/cwd-is-not-used')

  harness.fire(toolExec({ paths: [sessionDirectory, otherDirectory] }, { agent }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'sentinel workspace creation')
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.create, [otherDirectory])
  assert.deepEqual(workingDirectory.sessions, [agent.session])
})

test('a workingDirectory lookup that throws disables the cwd skip', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'throwing-service')
  const workingDirectory = createWorkingDirectoryRecorder(undefined, { throws: true })
  const harness = createHarness({ services: { workingDirectory } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec(
    { path: workspaceDirectory },
    { agent: sessionAgent('/header/cwd-is-not-used-by-the-plugin') },
  ))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation')
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.equal(workingDirectory.sessions.length, 1)
})

test('a workingDirectory service returning undefined disables the cwd skip', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'undefined-working-directory')
  const workingDirectory = createWorkingDirectoryRecorder(undefined)
  const harness = createHarness({ services: { workingDirectory } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }, { agent: sessionAgent(workspaceDirectory) }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation')
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.equal(workingDirectory.sessions.length, 1)
})

test('absolute paths embedded in bash-style commands are discovered', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'bash-created')
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))
  const command = [
    `mkdir -p ${workspaceDirectory}/plans ${workspaceDirectory}/reports`,
    `&& cat ${workspaceDirectory}/AGENTS.md > ${workspaceDirectory}/README.md`,
  ].join(' ')

  harness.fire(toolExec({ command }))
  await waitFor(() => harness.registryCalls.create.length === 1, 'workspace creation from a command string')
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
})

test('scanAncestors bounds how far discovery walks from a candidate', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'projects/alpha')
  const sentinelDirectory = await createWorkspaceDirectory(root, 'sentinel')
  const candidate = join(workspaceDirectory, 'README.md')

  const shallowHarness = createHarness()
  apply(shallowHarness.ctx, validatedConfig({ scanAncestors: 0 }))
  shallowHarness.fire(toolExec({ paths: [candidate, sentinelDirectory] }))
  await waitFor(() => shallowHarness.registryCalls.create.length === 1, 'sentinel workspace creation')
  await flushEventLoop()
  assert.deepEqual(shallowHarness.registryCalls.create, [sentinelDirectory])

  const deeperHarness = createHarness()
  apply(deeperHarness.ctx, validatedConfig({ scanAncestors: 1 }))
  deeperHarness.fire(toolExec({ path: candidate }))
  await waitFor(() => deeperHarness.registryCalls.create.length === 1, 'workspace creation from an ancestor')
  assert.deepEqual(deeperHarness.registryCalls.create, [workspaceDirectory])
})

test('one tool call registers at most 32 matching directories', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectories = []
  for (let index = 0; index < DIRECTORY_CAP + 2; index += 1) {
    workspaceDirectories.push(await createWorkspaceDirectory(root, `cap-${index}`))
  }
  // The 32nd candidate is the sentinel: once it is registered the sequential
  // scan has reached the per-call bound.
  const sentinel = workspaceDirectories[DIRECTORY_CAP - 1]
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ scanAncestors: 0 }))

  harness.fire(toolExec({ paths: workspaceDirectories }))
  await waitFor(() => harness.registryCalls.create.includes(sentinel), 'sentinel workspace creation')
  await flushEventLoop()

  assert.equal(harness.registryCalls.create.length, DIRECTORY_CAP)
  assert.deepEqual(harness.registryCalls.create, workspaceDirectories.slice(0, DIRECTORY_CAP))
  assert.equal(harness.registryCalls.create.includes(workspaceDirectories[DIRECTORY_CAP]), false)
  assert.equal(harness.registryCalls.create.includes(workspaceDirectories[DIRECTORY_CAP + 1]), false)
})

test('the directory cap also bounds ancestor expansion from fewer candidates', async t => {
  const root = await createTempRoot(t)
  const outerDirectories = []
  const candidates = []
  for (let index = 0; index < 17; index += 1) {
    outerDirectories.push(await createWorkspaceDirectory(root, `chain-${index}`))
    candidates.push(await createWorkspaceDirectory(root, `chain-${index}/inner`))
  }
  // 17 candidates x (inner + outer ancestor) = 34 directories, so the scan
  // stops after the 32nd: chains 0..15, inner and outer.
  const expectedCreateOrder = []
  for (let index = 0; index < 16; index += 1) {
    expectedCreateOrder.push(candidates[index], outerDirectories[index])
  }
  const sentinel = outerDirectories[15]
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ paths: candidates }))
  await waitFor(() => harness.registryCalls.create.includes(sentinel), 'sentinel workspace creation')
  await flushEventLoop()

  assert.equal(harness.registryCalls.create.length, DIRECTORY_CAP)
  assert.deepEqual(harness.registryCalls.create, expectedCreateOrder)
  assert.equal(harness.registryCalls.create.includes(candidates[16]), false)
  assert.equal(harness.registryCalls.create.includes(outerDirectories[16]), false)
})

test('registry.create rejections are contained and logged', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'rejects')
  const sessions = createSessionControllerRecorder()
  const unhandled = []
  const onUnhandled = reason => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))
  const harness = createHarness({
    services: { sessionController: sessions },
    createWorkspace: async () => {
      throw new Error('disk full')
    },
  })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  assert.doesNotThrow(() => harness.fire(toolExec({ path: workspaceDirectory })))
  await waitFor(() => harness.loggerCalls.warn.length === 1, 'warning about the failed registration')
  await delay(25)

  assert.deepEqual(unhandled, [])
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.deepEqual(sessions.calls, [])
  assert.deepEqual(harness.loggerCalls.info, [])
  const warning = harness.loggerCalls.warn[0].map(String).join(' ')
  assert.match(warning, /could not add workspace/)
  assert.match(warning, /disk full/)
})

test('a first Session failure is logged and does not block registration', async t => {
  const root = await createTempRoot(t)
  const workspaceDirectory = await createWorkspaceDirectory(root, 'session-failure')
  const sessions = createSessionControllerRecorder({ rejectWith: new Error('session boom') })
  const unhandled = []
  const onUnhandled = reason => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  t.after(() => process.off('unhandledRejection', onUnhandled))
  const harness = createHarness({ services: { sessionController: sessions } })
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  harness.fire(toolExec({ path: workspaceDirectory }))
  await waitFor(() => harness.loggerCalls.warn.length === 1, 'warning about the failed first Session')
  await delay(25)

  assert.deepEqual(unhandled, [])
  assert.deepEqual(harness.registryCalls.create, [workspaceDirectory])
  assert.equal(sessions.calls.length, 1)
  assert.equal(harness.loggerCalls.info.length, 1)
  const warning = harness.loggerCalls.warn[0].map(String).join(' ')
  assert.match(warning, /first Session could not be created/)
  assert.match(warning, /session boom/)
})

test('tool results without absolute paths do not touch the registry', async t => {
  const harness = createHarness()
  apply(harness.ctx, validatedConfig({ scanAncestors: 1 }))

  assert.doesNotThrow(() => harness.fire(toolExec({ text: 'no paths here', count: 3 })))
  assert.doesNotThrow(() => harness.fire(toolExec(undefined)))
  await flushEventLoop()

  assert.deepEqual(harness.registryCalls.resolve, [])
  assert.deepEqual(harness.registryCalls.create, [])
  assert.deepEqual(harness.loggerCalls.warn, [])
})

/** Whether this machine can run the git-backed grouping tests. */
function hasGit() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Run git in a scratch repository, failing the test on a real error. */
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { stdio: 'ignore' })
}

/** Create a committed git project so worktrees can be added. */
async function createGitProject(root, name) {
  const repo = join(root, name)
  await mkdir(repo, { recursive: true })
  git(repo, ['init', '-q'])
  await writeFile(join(repo, 'README.md'), '# project\n')
  git(repo, ['add', 'README.md'])
  git(repo, ['-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'init'])
  return repo
}

/** Create a worktree and fill the workspace signature inside it. */
async function createWorktree(repo, path, branch) {
  await mkdir(dirname(path), { recursive: true })
  git(repo, ['worktree', 'add', '-q', path, '-b', branch])
  await writeFile(join(path, 'AGENTS.local.md'), '# prompt\n')
  await mkdir(join(path, 'plans'), { recursive: true })
  await mkdir(join(path, 'reports'), { recursive: true })
  return path
}

test('nestedProjectRoot finds the main checkout of a worktree inside it', async t => {
  if (!hasGit()) return t.skip('git unavailable')
  const root = await createTempRoot(t)
  const repo = await createGitProject(root, 'project')
  const worktree = await createWorktree(repo, join(repo, '.worktrees', 'feat-a'), 'feat-a')
  assert.equal(await nestedProjectRoot(worktree), await realpath(repo))
  assert.equal(await nestedProjectRoot(repo), undefined)
  const sibling = await createWorktree(repo, join(root, 'sibling-wt'), 'feat-b')
  assert.equal(await nestedProjectRoot(sibling), undefined)
})

test('registers the main checkout when a nested worktree is added', async t => {
  if (!hasGit()) return t.skip('git unavailable')
  const root = await createTempRoot(t)
  const repo = await createGitProject(root, 'project')
  const worktree = await createWorktree(repo, join(repo, '.worktrees', 'feat-a'), 'feat-a')
  const harness = createHarness({ services: { sessionController: createSessionControllerRecorder() } })
  apply(harness.ctx, validatedConfig())

  const canonicalRepo = await realpath(repo)
  harness.fire(toolExec({ path: worktree }))
  await waitFor(() => harness.workspacesByPath.has(worktree) && harness.workspacesByPath.has(canonicalRepo), 'nested worktree and project root')
  assert.ok(harness.registryCalls.create.includes(worktree))
  assert.ok(harness.registryCalls.create.includes(canonicalRepo))
  const sessions = harness.ctx.get('sessionController')
  assert.equal(sessions.calls.length, 1, 'only the branch workspace gets a first Session')
})

test('does not register a project root for sibling worktrees', async t => {
  if (!hasGit()) return t.skip('git unavailable')
  const root = await createTempRoot(t)
  const repo = await createGitProject(root, 'project')
  const sibling = await createWorktree(repo, join(root, 'sibling-wt'), 'feat-b')
  const harness = createHarness({ services: { sessionController: createSessionControllerRecorder() } })
  apply(harness.ctx, validatedConfig())

  const canonicalRepo = await realpath(repo)
  harness.fire(toolExec({ path: sibling }))
  await waitFor(() => harness.workspacesByPath.has(sibling), 'sibling worktree registration')
  await flushEventLoop()
  assert.equal(harness.workspacesByPath.has(canonicalRepo), false)
})

test('registerProjectRoot=false leaves the project root alone', async t => {
  if (!hasGit()) return t.skip('git unavailable')
  const root = await createTempRoot(t)
  const repo = await createGitProject(root, 'project')
  const worktree = await createWorktree(repo, join(repo, '.worktrees', 'feat-a'), 'feat-a')
  const harness = createHarness({ services: { sessionController: createSessionControllerRecorder() } })
  apply(harness.ctx, validatedConfig({ registerProjectRoot: false }))

  const canonicalRepo = await realpath(repo)
  harness.fire(toolExec({ path: worktree }))
  await waitFor(() => harness.workspacesByPath.has(worktree), 'worktree registration')
  await flushEventLoop()
  assert.equal(harness.workspacesByPath.has(canonicalRepo), false)
})
