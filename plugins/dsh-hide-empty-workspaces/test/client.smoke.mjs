import { readFileSync } from 'node:fs'
import vm from 'node:vm'
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

function boot({ phase = 'ready', items, stored = null, includeArchived = null, archivedSessionIds = [] }) {
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
  const dispose = []
  const ctx = {
    get: (name) => {
      if (name !== 'workspaces') throw new Error(`unexpected service ${name}`)
      return service
    },
    effect: (factory) => {
      const cleanup = factory()
      if (typeof cleanup === 'function') dispose.push(cleanup)
      return cleanup
    },
  }

  let exported = null
  window.__ModuleLoader__ = {
    load: ({ factory }) => {
      exported = factory()
    },
  }
  vm.runInContext(source, dom.getInternalVMContext())
  return {
    window,
    dom,
    ctx,
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
  check('diagnostics publish version and state', diag !== undefined && diag.version === '0.1.1' && diag.state === 'ready')
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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nall checks passed')
}
