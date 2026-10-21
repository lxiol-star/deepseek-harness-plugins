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

const DEFAULT_SECTIONS = [
  { ws: 'ws-a', sessions: ['s1'] },
  { ws: 'ws-b', sessions: [] },
  { ws: 'ws-c', sessions: [] },
]

function fixture(sections, rail) {
  const body = sections.map(section => `<section class="group">
        <div data-row-key="workspace:${section.ws}" role="treeitem"></div>
        ${section.sessions.map(id => `<div data-row-key="session:${id}"></div>`).join('\n        ')}
      </section>`).join('\n      ')
  return `<div class="${rail ? 'x_root_x x_rail_x' : 'x_root_x'}">
    <div class="x_sectionHeader_x"><span class="x_sectionLabel_x">sessions</span></div>
    <div class="x_listArea_x">
      <div id="sidebar">
      ${body}
      </div>
    </div>
  </div>`
}

function boot({
  phase = 'ready', items, stored = null, includeBlank = null,
  mode = null, archivedSessionIds = [], sessionsById = {}, sections = DEFAULT_SECTIONS,
  rail = false, workspaceService = true,
}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${fixture(sections, rail)}</body></html>`,
    { url: 'http://127.0.0.1/', runScripts: 'outside-only' })
  const { window } = dom
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0)
  window.cancelAnimationFrame = (handle) => window.clearTimeout(handle)
  if (stored !== null) window.localStorage.setItem('dsh.hideEmptyWorkspaces', stored)
  if (includeBlank !== null) window.localStorage.setItem('dsh.hideEmptyWorkspaces.includeBlank', includeBlank)
  if (mode !== null) window.localStorage.setItem('dsh.hideEmptyWorkspaces.mode', mode)

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
  const unarchived = []
  const workspaceUi = {
    unarchiveSession: async (sessionId) => { unarchived.push(sessionId) },
    openSession: () => {},
  }
  const dispose = []
  const registrations = []
  const ctx = {
    get: (name) => {
      if (name === 'workspaces') return service
      if (name === 'sessions') return sessionService
      if (name === 'uiWorkspace') return workspaceService ? workspaceUi : undefined
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
      bind: (namespace) => (key, variables) => (variables === undefined
        ? `${namespace}.${key}`
        : `${namespace}.${key}:${JSON.stringify(variables)}`),
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
    json: async () => ({ loadedVersion: '0.2.0', installedVersion: '0.3.1' }),
  })
  vm.runInContext(source, dom.getInternalVMContext())
  const world = {
    window,
    dom,
    ctx,
    registrations,
    unarchived,
    dispose: () => { for (const cleanup of dispose) cleanup() },
    get exported() { return exported },
    update(next) {
      snapshot = next
      for (const listener of listeners) listener()
    },
    row(key) {
      return window.document.querySelector(`[data-row-key="${key}"]`)
    },
    hidden(workspaceId) {
      const row = world.row(`workspace:${workspaceId}`)
      if (row === null) return false
      return row.hasAttribute('data-dsh-hide-empty') || row.parentElement.hasAttribute('data-dsh-hide-empty')
    },
    sessionHidden(sessionId) {
      const row = world.row(`session:${sessionId}`)
      return row !== null && row.hasAttribute('data-dsh-hide-empty')
    },
    control() {
      return window.document.querySelector('.dsh-hew-modes')
    },
    clickMode(mode) {
      world.control().querySelector(`button[data-mode="${mode}"]`).click()
    },
    activeMode() {
      const selected = world.control().querySelector('button[aria-selected="true"]')
      return selected === null ? null : selected.dataset.mode
    },
    listArea() {
      return window.document.querySelector('[class*="listArea"]')
    },
    archivePanel() {
      return window.document.querySelector('.dsh-hew-archive')
    },
    archiveRows() {
      return [...window.document.querySelectorAll('.dsh-hew-archive-row')]
    },
    archiveText() {
      const panel = world.archivePanel()
      return panel === null ? '' : panel.textContent
    },
    archiveGroups() {
      return [...window.document.querySelectorAll('.dsh-hew-archive-group-title')].map(element => element.textContent)
    },
    hint() {
      return world.listArea().getAttribute('data-dsh-hide-empty-hint')
    },
    storedMode() {
      return window.localStorage.getItem('dsh.hideEmptyWorkspaces.mode')
    },
    styleCount: () => window.document.querySelectorAll('style[data-dsh-hide-empty-style]').length,
  }
  return world
}

const items = [
  { workspaceId: 'ws-a', sessionIds: ['s1'], title: 'Workspace A', path: '/tmp/ws-a' },
  { workspaceId: 'ws-b', sessionIds: [], title: 'Workspace B', path: '/tmp/ws-b' },
  { workspaceId: 'ws-c', sessionIds: ['s2'], title: 'Workspace C', path: '/tmp/ws-c' },
]
const wait = () => new Promise((resolve) => setTimeout(resolve, 5))

// 1. The active view hides empty Workspaces and archived rows.
{
  const world = boot({
    items,
    archivedSessionIds: ['s2'],
    sessionsById: {
      s1: { id: 's1', blank: false, title: 'first', updatedAt: Date.now() },
      s2: { id: 's2', blank: false, title: 'archived one', updatedAt: Date.now() - 3600000 },
    },
    sections: [
      { ws: 'ws-a', sessions: ['s1'] },
      { ws: 'ws-b', sessions: [] },
      { ws: 'ws-c', sessions: ['s2'] },
    ],
  })
  check('client bundle exports apply and inject', typeof world.exported.apply === 'function'
    && Array.isArray(world.exported.inject) && world.exported.inject.includes('workspaces'))
  world.exported.apply(world.ctx)
  await wait()
  check('view switch mounts with three segments', world.control() !== null
    && world.control().querySelectorAll('button[data-mode]').length === 3)
  check('default view is active', world.activeMode() === 'active' && world.hidden('ws-b'))
  check('Workspace with a visible Session stays', !world.hidden('ws-a'))
  check('archived-only Workspace is hidden in the active view', world.hidden('ws-c'))
  check('active Session row stays visible', !world.sessionHidden('s1'))
  check('archived Session row is hidden in the active view', world.sessionHidden('s2'))
  check('archive list is absent in the active view', world.archivePanel() === null)

  // 2. Snapshot updates re-evaluate emptiness.
  world.update({ phase: 'ready', archivedSessionIds: [], items: [
    { workspaceId: 'ws-a', sessionIds: [] },
    { workspaceId: 'ws-b', sessionIds: ['s3'] },
    { workspaceId: 'ws-c', sessionIds: ['s2'] },
  ] })
  await wait()
  check('newly empty Workspace becomes hidden', world.hidden('ws-a'))
  check('no-longer-empty Workspace becomes visible', !world.hidden('ws-b'))

  // 3. A re-render that replaces the rows is marked again.
  const section = world.row('workspace:ws-c').parentElement
  section.innerHTML = '<div data-row-key="workspace:ws-c" role="treeitem"></div>'
  await wait()
  check('re-rendered row is re-evaluated', world.hidden('ws-c') === false)

  // 4. Dispose removes marks, the view switch and the stylesheet.
  world.dispose()
  check('dispose removes the hide attribute', world.window.document.querySelectorAll('[data-dsh-hide-empty]').length === 0)
  check('dispose removes the view switch', world.control() === null)
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

// 6. IncludeBlank decides whether a blank-only Workspace counts as visible.
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

// 7. A Workspace holding only subagent child Sessions counts as empty.
{
  const world = boot({
    items: [
      { workspaceId: 'ws-a', sessionIds: ['child-1'] },
      { workspaceId: 'ws-b', sessionIds: ['real-1', 'child-1'] },
      { workspaceId: 'ws-c', sessionIds: ['child-1', 'archived-1'] },
    ],
    archivedSessionIds: ['archived-1'],
    sessionsById: {
      'child-1': { id: 'child-1', blank: false, origin: 'subagent' },
      'real-1': { id: 'real-1', blank: false },
      'archived-1': { id: 'archived-1', blank: false },
    },
  })
  world.exported.apply(world.ctx)
  await wait()
  check('subagent-only Workspace is hidden', world.hidden('ws-a'))
  check('Workspace with a real Session stays visible', !world.hidden('ws-b'))
  check('subagent Session does not rescue an archived-only Workspace', world.hidden('ws-c'))
  world.dispose()
  world.window.close()
}

// 8. localStorage opt-out disables the filter without uninstalling.
{
  const world = boot({ items, stored: '0' })
  world.exported.apply(world.ctx)
  await wait()
  check('opt-out keeps every Workspace visible', !world.hidden('ws-a') && !world.hidden('ws-b') && !world.hidden('ws-c'))
  check('opt-out removes the view switch', world.control() === null)
  world.dispose()
  world.window.close()
}

// 9. The Settings tab registers and its injected actions drive the filter.
{
  const world = boot({ items: [
    { workspaceId: 'ws-a', sessionIds: ['s1'] },
    { workspaceId: 'ws-b', sessionIds: [] },
    { workspaceId: 'ws-c', sessionIds: ['s2'] },
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
  check('injected status reports the hidden Workspace', injected.status().hidden.includes('ws-b')
    && injected.status().mode === 'active')
  check('injected flags expose the defaults', injected.getFlags().enabled === true
    && injected.getFlags().includeBlank === false)
  const versions = await injected.versions()
  check('versions fetch returns loaded and installed versions',
    versions.loadedVersion === '0.2.0' && versions.installedVersion === '0.3.1')
  injected.setMode('archived')
  await wait()
  check('injected setMode switches and persists the view',
    world.activeMode() === 'archived' && world.storedMode() === 'archived')
  injected.setFlag('enabled', false)
  await wait()
  check('enabled toggle restores the native list', !world.hidden('ws-b')
    && world.control() === null && world.archivePanel() === null)
  world.dispose()
  world.window.close()
}

// 10. The archived view groups the archive by Workspace and unarchives in one click.
{
  const world = boot({
    items: [
      { workspaceId: 'ws-a', sessionIds: ['s1', 's10'], title: 'Workspace A', path: '/tmp/ws-a' },
      { workspaceId: 'ws-b', sessionIds: [], title: 'Workspace B', path: '/tmp/ws-b' },
      { workspaceId: 'ws-c', sessionIds: ['s2'], title: 'Workspace C', path: '/tmp/ws-c' },
    ],
    archivedSessionIds: ['s2', 's9', 's10'],
    sessionsById: {
      s1: { id: 's1', blank: false, title: 'first', updatedAt: Date.now() },
      s2: { id: 's2', blank: false, title: 'archived one', updatedAt: Date.now() - 3600000 },
      s9: { id: 's9', blank: false, title: 'archived two', updatedAt: Date.now() - 7200000 },
      s10: { id: 's10', blank: false, title: 'archived zero', updatedAt: Date.now() - 1800000 },
    },
    sections: [
      { ws: 'ws-a', sessions: ['s1', 's10'] },
      { ws: 'ws-b', sessions: [] },
      { ws: 'ws-c', sessions: ['s2'] },
    ],
  })
  world.exported.apply(world.ctx)
  await wait()
  world.clickMode('archived')
  await wait()
  check('archived view marks the list area', world.listArea().hasAttribute('data-dsh-hew-archive'))
  check('archived view groups Sessions by Workspace', world.archiveRows().length === 3
    && world.archiveGroups().length === 3)
  check('archive groups lead with the most recently archived Workspace',
    world.archiveGroups()[0] === 'Workspace A' && world.archiveGroups()[1] === 'Workspace C'
    && world.archiveGroups()[2].includes('ungrouped'))
  check('archive group counts are rendered', world.archiveText().includes('Workspace A'))
  check('archive rows carry their titles', world.archiveText().includes('archived zero')
    && world.archiveText().includes('archived one') && world.archiveText().includes('archived two'))
  check('archive head reports the archive count', world.archiveText().includes('archiveCount'))
  check('archive rows are outside the native tree marks', world.window.document
    .querySelectorAll('.dsh-hew-archive-row[data-dsh-hide-empty]').length === 0)
  // The panel is plugin-owned DOM: concurrent refreshes must not stack copies
  // or feed the mutation observer in a loop.
  await wait()
  await wait()
  check('archived view keeps exactly one panel', world.window.document.querySelectorAll('.dsh-hew-archive').length === 1)
  world.listArea().appendChild(world.window.document.createElement('div'))
  await wait()
  check('unrelated DOM churn keeps one panel and its rows', world.window.document.querySelectorAll('.dsh-hew-archive').length === 1
    && world.archiveRows().length === 3)
  const button = world.window.document
    .querySelector('.dsh-hew-archive-row[data-session-id="s2"] .dsh-hew-archive-btn')
  check('archive row offers unarchive', button !== null && button.textContent.includes('unarchive'))
  button.click()
  await wait()
  check('unarchive click calls the Workspace service', world.unarchived.includes('s2'))

  world.update({ phase: 'ready', archivedSessionIds: [], items: [
    { workspaceId: 'ws-a', sessionIds: ['s1', 's10'], title: 'Workspace A', path: '/tmp/ws-a' },
    { workspaceId: 'ws-b', sessionIds: [], title: 'Workspace B', path: '/tmp/ws-b' },
    { workspaceId: 'ws-c', sessionIds: ['s2'], title: 'Workspace C', path: '/tmp/ws-c' },
  ] })
  await wait()
  check('emptied archive shows its empty copy', world.archiveRows().length === 0
    && world.archiveText().includes('emptyArchived'))

  // 11. Switching to Workspaces restores the native list with every Workspace row.
  world.clickMode('workspaces')
  await wait()
  check('workspaces view drops the archive mask', !world.listArea().hasAttribute('data-dsh-hew-archive'))
  check('workspaces view keeps every Workspace row', !world.hidden('ws-a') && !world.hidden('ws-b') && !world.hidden('ws-c'))
  check('workspaces view hides Session rows', world.sessionHidden('s1'))
  world.dispose()
  world.window.close()
}

// 12. The active view with nothing visible shows its empty hint.
{
  const world = boot({ items: [
    { workspaceId: 'ws-a', sessionIds: [] },
    { workspaceId: 'ws-b', sessionIds: [] },
  ] })
  world.exported.apply(world.ctx)
  await wait()
  check('active view with no visible Session shows its hint', (world.hint() ?? '').includes('emptyActive'))
  world.clickMode('workspaces')
  await wait()
  check('workspaces view shows no empty hint', world.hint() === null)
  world.dispose()
  world.window.close()
}

// 13. The archive view stays read-only when the host exposes no Workspace service.
{
  const world = boot({
    items: [{ workspaceId: 'ws-c', sessionIds: ['s2'], title: 'Workspace C', path: '/tmp/ws-c' }],
    archivedSessionIds: ['s2'],
    sessionsById: { s2: { id: 's2', blank: false, title: 'archived one' } },
    sections: [{ ws: 'ws-c', sessions: ['s2'] }],
    workspaceService: false,
  })
  world.exported.apply(world.ctx)
  await wait()
  world.clickMode('archived')
  await wait()
  check('read-only archive lists its rows', world.archiveRows().length === 1)
  const button = world.archiveRows()[0].querySelector('.dsh-hew-archive-btn')
  check('read-only archive disables unarchive', button.disabled === true)
  check('read-only archive explains itself', world.archiveText().includes('noHostActions'))
  world.dispose()
  world.window.close()
}

// 14. The switch yields to the collapsed rail.
{
  const rail = boot({ items, rail: true })
  rail.exported.apply(rail.ctx)
  await wait()
  check('rail chrome mounts no view switch', rail.control() === null)
  rail.dispose()
  rail.window.close()
}

// 16. The archive view stays in the rail chrome without injecting a panel.
{
  const railArchive = boot({
    items: [{ workspaceId: 'ws-c', sessionIds: ['s2'], title: 'Workspace C', path: '/tmp/ws-c' }],
    archivedSessionIds: ['s2'],
    sessionsById: { s2: { id: 's2', blank: false, title: 'archived one' } },
    sections: [{ ws: 'ws-c', sessions: ['s2'] }],
    mode: 'archived',
    rail: true,
  })
  railArchive.exported.apply(railArchive.ctx)
  await wait()
  check('rail chrome injects no archive panel and no switch', railArchive.archivePanel() === null
    && railArchive.control() === null)
  railArchive.dispose()
  railArchive.window.close()
}

// 15. Stored 0.3.0 view values fold into the active view.
{
  const running = boot({ items, mode: 'running' })
  running.exported.apply(running.ctx)
  await wait()
  check('stored running folds into active', running.activeMode() === 'active')
  running.dispose()
  running.window.close()

  const done = boot({ items, mode: 'done' })
  done.exported.apply(done.ctx)
  await wait()
  check('stored done folds into active', done.activeMode() === 'active')
  done.dispose()
  done.window.close()
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nall checks passed')
}
