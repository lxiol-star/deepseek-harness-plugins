import { readFileSync } from 'node:fs'
import vm from 'node:vm'
// Minimal React stub: the smoke test exercises registration and injected
// actions, never renders the Settings tab.
const React = {
  createElement: () => null,
  useState: () => [0, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
}
import { JSDOM } from 'jsdom'

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
let failures = 0

function check(name, condition) {
  if (condition) {
    console.log(`ok   ${name}`)
    return
  }
  failures += 1
  console.error(`FAIL ${name}`)
}

function boot({ phase = 'ready', items, stored = null, includeArchived = null, includeBlank = null, archivedSessionIds = [], sessionsById = {} }) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div id="sidebar">
      <section class="group" data-group="a">
        <div data-row-key="workspace:ws-a" role="treeitem"></div>
        <div data-row-key="session:s1"></div>
      </section>
      <section class="group" data-group="b">
        <div data-row-key="workspace:ws-b" role="treeitem"></div>
      </section>
      <section class="group" data-group="c">
        <div data-row-key="workspace:ws-c" role="treeitem"></div>
      </section>
    </div></body></html>`, { url: 'http://127.0.0.1/', runScripts: 'outside-only' })
  const { window } = dom
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0)
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle)
  if (stored !== null) window.localStorage.setItem('dsh.hideEmptyWorkspaces', stored)
  if (includeArchived !== null) window.localStorage.setItem('dsh.hideEmptyWorkspaces.includeArchived', includeArchived)
  if (includeBlank !== null) window.localStorage.setItem('dsh.hideEmptyWorkspaces.includeBlank', includeBlank)

  let snapshot = { phase, items, archivedSessionIds }
  const listeners = new Set()
  const service = {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  }
  const sessionService = {
    list: {
      getSnapshot: () => ({ ids: Object.keys(sessionsById), byId: sessionsById, phase: 'ready' }),
      subscribe: () => () => {},
    },
  }
  const dispose = []
  const registrations = []
  const ctx = {
    get: (name) => {
      if (name === 'workspaces') return service
      if (name === 'sessions') return sessionService
      throw new Error(`unexpected service ${name}`)
    },
    effect: (factory) => {
      const cleanup = factory()
      if (typeof cleanup === 'function') dispose.push(cleanup)
      return cleanup
    },
    slots: {
      inject: (_name, callback) => callback(),
      register: (options, component) => {
        registrations.push({ options, component })
        return () => {}
      },
    },
    locale: {
      register: () => () => {},
      bind: (namespace) => (key) => `${namespace}.${key}`,
    },
  }

  let exported = null
  window.__ModuleLoader__ = {
    load: ({ factory }) => {
      exported = factory((name) => {
        if (name === 'react') return React
        throw new Error(`unexpected module ${name}`)
      })
    },
  }
  window.fetch = async () => ({
    ok: true,
    json: async () => ({ loadedVersion: '0.2.0', installedVersion: '0.2.1' }),
  })
  vm.runInContext(source, dom.getInternalVMContext())
  return {
    window,
    dom,
    ctx,
    registrations,
    dispose: () => { for (const cleanup of dispose) cleanup() },
    get exported() { return exported },
    update(next) {
      snapshot = next
      for (const listener of listeners) listener()
    },
    hidden(selector) {
      return window.document
        .querySelector(`[data-row-key="workspace:${selector}"]`)
        .parentElement.hasAttribute('data-dsh-hide-empty')
    },
    styleCount: () => window.document.querySelectorAll('style[data-dsh-hide-empty-style]').length,
  }
}

const items = [
  { workspaceId: 'ws-a', sessionIds: ['s1'] },
  { workspaceId: 'ws-b', sessionIds: [] },
  { workspaceId: 'ws-c', sessionIds: ['s2'] },
]
const wait = () => new Promise((resolve) => setTimeout(resolve, 5))

// 1. Empty Workspaces are hidden, non-empty ones stay visible.
{
  const world = boot({ items })
  check('client bundle exports apply and inject', typeof world.exported.apply === 'function'
    && Array.isArray(world.exported.inject) && world.exported.inject.includes('workspaces'))
  world.exported.apply(world.ctx)
  await wait()
  check('empty Workspace section is hidden', world.hidden('ws-b'))
  check('non-empty Workspace section stays visible', !world.hidden('ws-a') && !world.hidden('ws-c'))

  // 2. Snapshot updates re-evaluate emptiness.
  world.update({ phase: 'ready', items: [
    { workspaceId: 'ws-a', sessionIds: [] },
    { workspaceId: 'ws-b', sessionIds: ['s3'] },
    { workspaceId: 'ws-c', sessionIds: ['s2'] },
  ] })
  await wait()
  check('newly empty Workspace becomes hidden', world.hidden('ws-a'))
  check('no-longer-empty Workspace becomes visible', !world.hidden('ws-b'))

  // 3. A re-render that replaces the rows is marked again.
  const section = world.window.document.querySelector('[data-group="c"]')
  section.innerHTML = '<div data-row-key="workspace:ws-c" role="treeitem"></div>'
  await wait()
  check('re-rendered row is re-evaluated', !world.hidden('ws-c'))

  // 4. Dispose removes marks and stylesheet.
  world.dispose()
  check('dispose removes the hide attribute', world.window.document.querySelectorAll('[data-dsh-hide-empty]').length === 0)
  check('dispose removes the injected stylesheet', world.styleCount() === 0)
  world.window.close()
}

// 5. Pending snapshots never hide anything.
{
  const world = boot({ phase: 'pending', items })
  world.exported.apply(world.ctx)
  await wait()
  check('pending snapshot hides nothing', !world.hidden('ws-a') && !world.hidden('ws-b') && !world.hidden('ws-c'))
  world.dispose()
  world.window.close()
}

// 6. Workspaces whose sessions are all archived are hidden too.
{
  const world = boot({ items: [
    { workspaceId: 'ws-a', sessionIds: ['s1'] },
    { workspaceId: 'ws-b', sessionIds: ['s2', 's3'] },
    { workspaceId: 'ws-c', sessionIds: ['s4'] },
  ], archivedSessionIds: ['s2', 's3'] })
  world.exported.apply(world.ctx)
  await wait()
  check('archived-only Workspace is hidden', world.hidden('ws-b'))
  check('Workspaces with visible sessions stay', !world.hidden('ws-a') && !world.hidden('ws-c'))
  const diag = world.window.__dshHideEmptyWorkspaces
  check('diagnostics publish version and state', diag !== undefined && diag.version === '0.2.1' && diag.state === 'ready')
  check('diagnostics report the hidden id', Array.isArray(diag.hidden) && diag.hidden.includes('ws-b'))
  world.dispose()
  world.window.close()
}

// 7. includeArchived=1 restores the original "zero sessions" rule.
{
  const world = boot({ items: [
    { workspaceId: 'ws-a', sessionIds: ['s1'] },
    { workspaceId: 'ws-b', sessionIds: ['s2'] },
    { workspaceId: 'ws-c', sessionIds: [] },
  ], archivedSessionIds: ['s2'], includeArchived: '1' })
  world.exported.apply(world.ctx)
  await wait()
  check('includeArchived keeps archived-only Workspace visible', !world.hidden('ws-b'))
  check('includeArchived still hides zero-session Workspace', world.hidden('ws-c'))
  world.dispose()
  world.window.close()
}

// 8. localStorage opt-out disables the filter without uninstalling.
{
  const world = boot({ items, stored: '0' })
  world.exported.apply(world.ctx)
  await wait()
  check('opt-out keeps every Workspace visible', !world.hidden('ws-a') && !world.hidden('ws-b') && !world.hidden('ws-c'))
  world.dispose()
  world.window.close()
}

// 9. The Settings tab registers and its injected actions drive the filter.
{
  const world = boot({ items: [
    { workspaceId: 'ws-a', sessionIds: ['s1'] },
    { workspaceId: 'ws-b', sessionIds: ['s2'] },
    { workspaceId: 'ws-c', sessionIds: ['s3'] },
  ], archivedSessionIds: ['s2'] })
  world.exported.apply(world.ctx)
  await wait()
  const registration = world.registrations.find(entry => entry.options.name === 'settings.plugins.tab')
  check('settings tab registers into settings.plugins.tab', registration !== undefined)
  check('settings tab id and order', registration.options.id === 'hide-empty-workspaces'
    && registration.options.order === 60)
  check('settings tab label resolves through the locale namespace',
    registration.options.label() === 'hideEmptyWorkspaces.tab')
  const injected = registration.options.inject()
  check('injected status reports the hidden Workspace', injected.status().hidden.includes('ws-b'))
  check('injected flags expose the defaults', injected.getFlags().enabled === true
    && injected.getFlags().includeArchived === false)
  injected.setFlag('includeArchived', true)
  await wait()
  check('includeArchived toggle un-hides the archived-only Workspace', !world.hidden('ws-b'))
  check('includeArchived toggle persists to localStorage',
    world.window.localStorage.getItem('dsh.hideEmptyWorkspaces.includeArchived') === '1')
  injected.setFlag('includeArchived', false)
  await wait()
  check('disabling includeArchived hides it again', world.hidden('ws-b'))
  const versions = await injected.versions()
  check('versions fetch returns loaded and installed versions',
    versions.loadedVersion === '0.2.0' && versions.installedVersion === '0.2.1')
  injected.setFlag('enabled', false)
  await wait()
  check('enabled toggle shows every Workspace', !world.hidden('ws-b'))
  world.dispose()
  world.window.close()
}

// 10. A Workspace holding only a blank Session counts as empty.
{
  const world = boot({
    items: [
      { workspaceId: 'ws-a', sessionIds: ['s1'] },
      { workspaceId: 'ws-b', sessionIds: ['blank-1'] },
      { workspaceId: 'ws-c', sessionIds: ['unknown-1'] },
    ],
    sessionsById: {
      s1: { id: 's1', blank: false },
      'blank-1': { id: 'blank-1', blank: true },
    },
  })
  world.exported.apply(world.ctx)
  await wait()
  check('blank-only Workspace is hidden', world.hidden('ws-b'))
  check('Workspace with a real Session stays visible', !world.hidden('ws-a'))
  check('unknown Session summary stays visible', !world.hidden('ws-c'))
  const registration = world.registrations.find(entry => entry.options.name === 'settings.plugins.tab')
  const injected = registration.options.inject()
  check('includeBlank defaults to false', injected.getFlags().includeBlank === false)
  injected.setFlag('includeBlank', true)
  await wait()
  check('includeBlank reveals the blank-only Workspace', !world.hidden('ws-b'))
  check('includeBlank persists to localStorage',
    world.window.localStorage.getItem('dsh.hideEmptyWorkspaces.includeBlank') === '1')
  world.dispose()
  world.window.close()
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nall checks passed')
}
