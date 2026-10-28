// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ArchivePreview, ArchiveSummary } from '../src/shared/archive.ts'

const require = createRequire(import.meta.url)
const repo = process.env.DSH_REPO ?? resolve(process.cwd(), '../../../deepseek-harness')
const store = join(repo, 'node_modules', '.pnpm')
function packagePath(prefix: string, packageName: string): string {
  const directory = readdirSync(store).find(name => name.startsWith(prefix))
  if (!directory) throw new Error(`missing ${packageName}`)
  return join(store, directory, 'node_modules', packageName)
}
const output = join(mkdtempSync(join(tmpdir(), 'sb-ui-tests-')), 'components.cjs')
execFileSync(join(repo, 'node_modules', '.bin', 'esbuild'), [
  'tests/component-entry.tsx', '--bundle', '--format=cjs', '--platform=node', '--jsx=automatic', `--outfile=${output}`,
  `--alias:react=${packagePath('react@18.', 'react')}`,
  `--alias:react-dom=${packagePath('react-dom@18.', 'react-dom')}`,
], { stdio: 'pipe' })
// The test bridge is compiled from the actual TSX entry, not a UI mock.
const components = require(output) as {
  createRoot: (element: Element) => { render(node: unknown): void; unmount(): void }
  SessionCard: unknown
  BoardDock: unknown
  BoardOverlay: unknown
  BoardList: unknown
  BoardFilterBar: unknown
  SessionBoardSettingsPage: unknown
  STYLESHEET: string
  DEFAULT_WIKI_CONFIG: Record<string, unknown>
  wikiDefaults: (home: string) => Record<string, unknown>
  BatchController: new (transport: object) => {
    toggle(id: string): void
    preview(): Promise<void>
    confirm(): Promise<void>
    dismissResult(): void
    getSnapshot(): { selected: readonly string[]; result: unknown }
  }
  BatchToolbar: unknown
  t: (key: string, args?: Record<string, string | number>) => string
}
const React = require(join(packagePath('react@18.', 'react'), 'index.js')) as { createElement: (component: unknown, props: object) => unknown; act: (fn: () => Promise<void> | void) => Promise<void> }
const roots: Array<ReturnType<typeof components.createRoot>> = []
const entry = {
  id: 'session-one', title: 'Session one', workspaceTitle: 'Workspace', isSubagent: false, isCurrent: false,
  state: 'unread', group: 'attention', attentionKind: 'unread', noteKey: 'note.unread', pendingKey: null,
  errorNote: null, waitSince: 1, runSince: null, lastActivityAt: 1,
  preview: { instruction: 'Requested work', activity: 'Produced work' },
  progress: { turnN: 1, stepM: 2, ratio: null },
  metrics: { elapsedMs: null, totalBusyMs: 1000, inputTokens: 20, outputTokens: 10, rateTokS: 5, cacheHitPct: '0', liveJobs: 0, runningSubagents: 0 },
}
function mount(component: unknown, _props: object) {
  const container = document.createElement('div'); document.body.append(container)
  const root = components.createRoot(container); roots.push(root)
  return { root, container, render: async (value: object) => React.act(async () => { root.render(React.createElement(component, value)) }) }
}

/** Props the docked column needs; features under test override these. */
function dockProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    groups: [], t: components.t, collapsed: false, width: 300, density: 'compact', online: true,
    onToggleCollapse: vi.fn(), onWidth: vi.fn(), onToggleDensity: vi.fn(), onOpenBoard: vi.fn(),
    onOpen: vi.fn(), onAck: vi.fn(), collapsedGroups: {}, onToggleGroup: vi.fn(), ...overrides,
  }
}

/** jsdom implements PointerEvent but not pointer capture. */
function capturePointer(element: Element): void {
  Object.assign(element, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
  })
}

/** Dispatch one mouse-pointer event at `element`. */
function pointer(element: Element, type: string, init: { clientX: number; pointerId: number }): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: init.clientX, clientY: 0,
    pointerId: init.pointerId, button: 0, buttons: 1,
  })
  element.dispatchEvent(event)
  return event
}
afterEach(async () => {
  await React.act(async () => { for (const root of roots.splice(0)) root.unmount() })
  document.body.innerHTML = ''; delete document.documentElement.dataset.platform; vi.restoreAllMocks()
})

describe('actual React components', () => {
  it('updates controlled checkbox and highlight with otherwise stable memo props', async () => {
    const props = { entry, t: components.t, onOpen: vi.fn(), onAck: vi.fn(), onToggleSelect: vi.fn(), selected: false }
    const view = mount(components.SessionCard, props); await view.render(props)
    const input = view.container.querySelector<HTMLInputElement>('input[type=checkbox]')!
    expect(input.checked).toBe(false)
    await view.render({ ...props, selected: true })
    expect(input.checked).toBe(true)
    expect(view.container.querySelector('.sb-card')?.getAttribute('data-selected')).toBe('true')
    await React.act(async () => { input.click() })
    expect(props.onToggleSelect).toHaveBeenCalledWith('session-one')
    expect(props.onOpen).not.toHaveBeenCalled()
  })
  it('inner keyboard events do not open the session and title opens once', async () => {
    const props = { entry, t: components.t, onOpen: vi.fn(), onAck: vi.fn(), onToggleSelect: vi.fn() }
    const view = mount(components.SessionCard, props); await view.render(props)
    const input = view.container.querySelector<HTMLInputElement>('input[type=checkbox]')!
    input.focus(); input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    expect(props.onOpen).not.toHaveBeenCalled()
    await React.act(async () => { (view.container.querySelector('.sb-card-title') as HTMLElement).click() })
    expect(props.onOpen).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('[role=button]')).toBeNull()
  })
  it('keeps summary concise and expands scrollable details without opening the session', async () => {
    const view = mount(components.SessionCard, {}); await view.render({ entry, t: components.t, onOpen: vi.fn(), onAck: vi.fn() })
    expect(view.container.querySelector('.sb-card-content')?.getAttribute('tabindex')).toBeNull()
    expect(view.container.textContent).not.toContain('tok/s')
    expect(view.container.textContent).not.toContain('Requested work')
    await React.act(async () => { (view.container.querySelector('.sb-card-details') as HTMLElement).click() })
    expect(view.container.querySelector('.sb-card-details')?.getAttribute('aria-expanded')).toBe('true')
    expect(view.container.querySelector('.sb-card-content')?.getAttribute('tabindex')).toBe('0')
    expect(view.container.textContent).toContain('tok/s')
    expect(view.container.textContent).toContain('Requested work')
    expect(view.container.querySelector('.sb-card-content .sb-metrics')).toBeNull()
    expect(view.container.querySelector('.sb-card-footer .sb-metrics')).not.toBeNull()
    expect(view.container.querySelector('.sb-card-footer .sb-ack')).not.toBeNull()
  })
  it('gives a session with no content its own empty style and hides details', async () => {
    const empty = { ...entry, preview: { instruction: '', activity: '' }, errorNote: null }
    const props = { entry: empty, t: components.t, onOpen: vi.fn(), onAck: vi.fn() }
    const view = mount(components.SessionCard, props); await view.render(props)
    const line = view.container.querySelector('.sb-line--empty')
    expect(line?.textContent).toBe('This session has no content yet')
    expect(view.container.querySelector('.sb-card-details')).toBeNull()
    // A session that has content but no preview keeps the ordinary placeholder and its details toggle.
    const busy = { ...entry, preview: { instruction: '', activity: '' }, metrics: { ...entry.metrics } }
    await view.render({ ...props, entry: { ...busy, preview: { instruction: 'Do work', activity: '' } } })
    expect(view.container.querySelector('.sb-line--empty')).toBeNull()
    expect(view.container.querySelector('.sb-card-details')).not.toBeNull()
  })
  it('unmounts collapsed cards and restores them when expanded', async () => {
    const props = { groups: [{ id: 'attention', entries: [entry] }], t: components.t, onOpen: vi.fn(), onAck: vi.fn(), emptyKey: 'empty.noSessions', collapsed: { attention: true } }
    const view = mount(components.BoardList, props); await view.render(props)
    expect(view.container.querySelector('.sb-card')).toBeNull()
    expect(view.container.querySelector('.sb-group-head')?.getAttribute('aria-expanded')).toBe('false')
    await view.render({ ...props, collapsed: {} })
    expect(view.container.querySelectorAll('.sb-card')).toHaveLength(1)
  })
  it('keeps session cards openable while a batch owns the selection', async () => {
    const open = vi.fn()
    const props = { groups: [{ id: 'attention', entries: [entry] }], t: components.t, onOpen: open, onAck: vi.fn(), onToggleSelect: vi.fn(), emptyKey: 'empty.noSessions', selected: new Set<string>(), selectionDisabled: true }
    const view = mount(components.BoardList, props); await view.render(props)
    const checkbox = view.container.querySelector<HTMLInputElement>('.sb-card-select')!
    expect(checkbox.disabled).toBe(true)
    const title = view.container.querySelector<HTMLButtonElement>('.sb-card-title')!
    expect(title.disabled).toBe(false)
    await React.act(async () => { title.click() })
    expect(open).toHaveBeenCalledWith('session-one')
  })
  it('filter controls expose status/workspace choices and reset all conditions', async () => {
    const change = vi.fn()
    const props = { groups: [{ id: 'attention', entries: [entry] }], t: components.t, filters: { query: 'work', status: 'blocked', workspace: 'Workspace' }, shown: 1, onChange: change }
    const view = mount(components.BoardFilterBar, props); await view.render(props)
    const select = view.container.querySelector<HTMLSelectElement>('select')!
    await React.act(async () => { select.value = 'running'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(change).toHaveBeenLastCalledWith({ ...props.filters, status: 'running' })
    await React.act(async () => { (view.container.querySelector('button') as HTMLElement).click() })
    expect(change).toHaveBeenLastCalledWith({ query: '', status: 'all', workspace: '', archive: 'active' })
    expect(view.container.querySelector('[role=status]')?.textContent).toBe('1 of 1 sessions')
  })
  it('settings page edits the self-contained Wiki configuration and saves the draft', async () => {
    const saveWiki = vi.fn(async (_config: unknown) => {})
    const stub = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} })
    const settings = {
      store: stub({
        status: 'ready', selection: null, options: [], catalogStatus: 'ready',
        saving: false, saved: false, error: null,
      }),
      start: vi.fn(), save: vi.fn(async () => {}), reloadCatalog: vi.fn(async () => {}), dispose: vi.fn(),
    }
    const defaults = components.wikiDefaults('/home/test')
    const wiki = {
      store: stub({
        status: 'ready', config: { ...components.DEFAULT_WIKI_CONFIG }, defaults,
        report: null, saving: false, saved: false, error: null, fieldErrors: [], probing: false,
      }),
      start: vi.fn(), save: saveWiki, reset: vi.fn(async () => {}), probe: vi.fn(async () => {}), dispose: vi.fn(),
    }
    const props = { t: components.t, settings, wiki }
    const view = mount(components.SessionBoardSettingsPage, props); await view.render(props)
    expect(view.container.textContent).toContain('Wiki engine')
    expect(view.container.textContent).toContain('Archive synthesis')
    const root = view.container.querySelector<HTMLInputElement>('#sb-wiki-root')!
    expect(root.placeholder).toBe('/home/test/wiki')
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    await React.act(async () => {
      setValue?.call(root, '/tmp/other-wiki')
      root.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const save = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Save')!
    await React.act(async () => { save.click() })
    expect(saveWiki).toHaveBeenCalledTimes(1)
    expect(saveWiki.mock.calls[0]?.[0]).toMatchObject({ wikiRoot: '/tmp/other-wiki', scriptsMode: 'bundled' })
    const mode = view.container.querySelector<HTMLSelectElement>('#sb-wiki-scripts')!
    await React.act(async () => {
      mode.value = 'local'
      mode.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(view.container.querySelector('#sb-wiki-scripts-dir')).not.toBeNull()
  })
  it('offers a separate archive-only action and confirms without synthesis copy', async () => {
    const summary: ArchiveSummary = {
      archived: 1, skipped: 0, empty: 0, failed: 0, selected: 1, dry_run: false,
      results: [{ session: 'session-one', source: 'raw/sessions/one.md', action: 'archived' }],
    }
    const plan: ArchivePreview = { token: 'token', expiresAt: Date.now() + 30_000, mode: 'archive', summary: { ...summary, dry_run: true, results: [{ session: 'session-one', source: 'raw/sessions/one.md', action: 'would-archive' }] } }
    const preview = vi.fn(async () => plan)
    const controller = new components.BatchController({ preview, commit: async () => summary })
    controller.toggle('session-one')
    const props = { controller, groups: [{ id: 'attention', entries: [entry] }], t: components.t }
    const view = mount(components.BatchToolbar, props); await view.render(props)
    const archiveOnly = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Archive only')!
    expect(archiveOnly).toBeDefined()
    await React.act(async () => { archiveOnly.click() })
    expect(preview).toHaveBeenCalledWith(['session-one'], 'archive')
    expect(controller.getSnapshot()).toMatchObject({ phase: 'confirming', mode: 'archive' })
    expect(view.container.textContent).toContain('Confirm archive only')
    expect(view.container.textContent).toContain('No model calls and no index update.')
  })
  it('project tree shows branch labels and opens the project coordinator', async () => {
    const workspaceEntry = { ...entry, workspaceId: 'wa', workspacePath: '/repo/i-ai-gw', workspaceTitle: 'i-ai-gw' }
    const meta = {
      wa: {
        workspaceId: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', branch: 'feat/main',
        projectKey: 'github.com/me/i-ai-gw', projectLabel: 'i-ai-gw',
      },
    }
    const open = vi.fn()
    const props = {
      groups: [{ id: 'attention', entries: [workspaceEntry] }], t: components.t, grouping: 'tree',
      workspaceMeta: meta, onOpenCoordinator: open, collapsed: {}, onToggleGroup: vi.fn(),
      onOpen: vi.fn(), onAck: vi.fn(), emptyKey: 'empty.noSessions',
    }
    const view = mount(components.BoardList, props); await view.render(props)
    expect(view.container.textContent).toContain('i-ai-gw')
    expect(view.container.textContent).toContain('feat/main')
    const button = [...view.container.querySelectorAll('button')].find(candidate => candidate.textContent === 'Project session')!
    expect(button).toBeDefined()
    await React.act(async () => { button.click() })
    expect(open).toHaveBeenCalledWith('github.com/me/i-ai-gw')
  })
  it('archived-only button toggles the archive filter', async () => {
    const change = vi.fn()
    const filters = { query: '', status: 'all' as const, workspace: '' }
    const props = { groups: [{ id: 'attention', entries: [entry] }], t: components.t, filters, shown: 1, onChange: change }
    const view = mount(components.BoardFilterBar, props); await view.render(props)
    const button = [...view.container.querySelectorAll('button')].find(candidate => candidate.getAttribute('aria-pressed') !== null)!
    expect(button.textContent).toBe('Archived only')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    await React.act(async () => { button.click() })
    expect(change).toHaveBeenLastCalledWith({ ...filters, archive: 'archived' })
    const toggled = { ...props, filters: { ...filters, archive: 'archived' as const } }
    await view.render(toggled)
    const pressed = [...view.container.querySelectorAll('button')].find(candidate => candidate.getAttribute('aria-pressed') !== null)!
    expect(pressed.getAttribute('aria-pressed')).toBe('true')
    await React.act(async () => { pressed.click() })
    expect(change).toHaveBeenLastCalledWith({ ...filters, archive: 'active' })
  })
  it('drops archived sessions from the batch selection', async () => {
    const controller = new components.BatchController({ preview: vi.fn(), commit: vi.fn() })
    controller.toggle('session-one')
    const archived = { ...entry, archivedAt: 123 }
    const props = { controller, groups: [{ id: 'attention', entries: [archived] }], t: components.t }
    const view = mount(components.BatchToolbar, props); await view.render(props)
    expect(controller.getSnapshot().selected).toEqual([])
    expect(view.container.textContent).toContain('0 selected')
  })
  it('keeps hidden selection and selects only visible results', async () => {
    const controller = new components.BatchController({ preview: vi.fn(), commit: vi.fn() })
    controller.toggle('session-one')
    const other = { ...entry, id: 'other', title: 'Other' }
    const groups = [{ id: 'attention', entries: [entry, other] }]
    const props = { controller, groups, visibleGroups: [{ id: 'attention', entries: [other] }], t: components.t }
    const view = mount(components.BatchToolbar, props); await view.render(props)
    expect(controller.getSnapshot().selected).toEqual(['session-one'])
    expect(view.container.textContent).toContain('1 selected sessions are hidden')
    const all = [...view.container.querySelectorAll('button')].find(button => button.textContent?.includes('Select visible'))!
    await React.act(async () => { all.click() })
    expect(controller.getSnapshot().selected).toEqual(['other'])
  })
  it('closes a finished batch result from the toolbar', async () => {
    const summary: ArchiveSummary = {
      archived: 1, skipped: 0, empty: 0, failed: 0, selected: 1, dry_run: false,
      results: [{ session: 'session-one', source: 'raw/sessions/one.md', action: 'archived' }],
      nativeArchive: [{ session: 'session-one', status: 'archived' }],
    }
    const plan: ArchivePreview = {
      token: 'token',
      expiresAt: Date.now() + 30_000,
      mode: 'full',
      summary: { ...summary, dry_run: true, results: [{ session: 'session-one', source: 'raw/sessions/one.md', action: 'would-archive' }] },
    }
    const controller = new components.BatchController({ preview: async () => plan, commit: async () => summary })
    controller.toggle('session-one')
    await controller.preview(); await controller.confirm()
    const props = { controller, groups: [{ id: 'attention', entries: [entry] }], t: components.t }
    const view = mount(components.BatchToolbar, props); await view.render(props)
    expect(view.container.textContent).toContain('Copied 1')
    expect(view.container.querySelector('.sb-batch-result')).not.toBeNull()
    const close = view.container.querySelector<HTMLButtonElement>('.sb-batch-dismiss')!
    expect(close.getAttribute('aria-label')).toBe('Close results')
    await React.act(async () => { close.click() })
    expect(view.container.querySelector('.sb-batch-result')).toBeNull()
    expect(view.container.textContent).not.toContain('Copied 1')
  })
  it('renders workspace groups with independent collapse and archived badges', async () => {
    const toggle = vi.fn()
    const first = { ...entry, workspaceId: 'first', workspacePath: '/projects/first', archivedAt: 123 }
    const second = { ...entry, id: 'second', workspaceId: 'second', workspacePath: '/projects/second' }
    const props = { groups: [{ id: 'attention', entries: [first, second] }], grouping: 'workspace', t: components.t, onOpen: vi.fn(), onAck: vi.fn(), onToggleGroup: toggle, emptyKey: 'empty.noSessions', collapsed: { 'workspace:first': true } }
    const view = mount(components.BoardList, props); await view.render(props)
    expect(view.container.querySelectorAll('.sb-workspace-node')).toHaveLength(2)
    expect(view.container.querySelectorAll('.sb-card')).toHaveLength(1)
    await view.render({ ...props, collapsed: {} })
    expect(view.container.querySelectorAll('.sb-card')).toHaveLength(2)
    expect(view.container.textContent).toContain('Archived to Wiki')
    await view.render({ ...props, grouping: 'tree', collapsed: {} })
    expect(view.container.querySelectorAll('.sb-card')).toHaveLength(2)
    const head = view.container.querySelector<HTMLButtonElement>('.sb-workspace-node > button')!
    await React.act(async () => { head.click() })
    expect(toggle).toHaveBeenLastCalledWith('path:/projects')
  })
  it('real overlay traps tab, yields to newer dialog, restores inert and focus', async () => {
    const background = document.createElement('div'); background.id = 'root'; document.body.append(background)
    const opener = document.createElement('button'); background.append(opener); opener.focus()
    const close = vi.fn()
    const props = { open: true, groups: [], t: components.t, density: 'compact', online: true, onClose: close, onToggleDensity: vi.fn(), onOpen: vi.fn(), onAck: vi.fn(), collapsedGroups: {}, onToggleGroup: vi.fn() }
    const view = mount(components.BoardOverlay, props); await view.render(props)
    const panel = document.querySelector('.sb-overlay')!
    expect(background.hasAttribute('inert')).toBe(true)
    const controls = [...panel.querySelectorAll<HTMLButtonElement>('button')]
    controls.at(-1)!.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(controls[0])
    const top = document.createElement('div'); top.setAttribute('role', 'dialog'); top.setAttribute('aria-modal', 'true'); document.body.append(top)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(close).not.toHaveBeenCalled(); top.remove()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(close).toHaveBeenCalledTimes(1)
    await view.render({ ...props, open: false })
    expect(background.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(opener)
  })
  it('names the branch for assistive tech and keeps both project-header actions independent', async () => {
    const workspaceEntry = { ...entry, workspaceId: 'wa', workspacePath: '/repo/i-ai-gw', workspaceTitle: 'i-ai-gw' }
    const meta = {
      wa: {
        workspaceId: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', branch: 'feat/main',
        projectKey: 'github.com/me/i-ai-gw', projectLabel: 'i-ai-gw',
      },
    }
    const openCoordinator = vi.fn()
    const toggle = vi.fn()
    const props = {
      groups: [{ id: 'attention', entries: [workspaceEntry] }], t: components.t, grouping: 'tree',
      workspaceMeta: meta, onOpenCoordinator: openCoordinator, collapsed: {}, onToggleGroup: toggle,
      onOpen: vi.fn(), onAck: vi.fn(), emptyKey: 'empty.noSessions',
    }
    const view = mount(components.BoardList, props); await view.render(props)
    const row = view.container.querySelector('.sb-workspace-head-row')!
    expect(row.querySelectorAll('button')).toHaveLength(2)
    const header = row.querySelectorAll('button')[0] as HTMLButtonElement
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(header.getAttribute('aria-label')).toBe('i-ai-gw, 1 sessions')
    // The branch subtitle must survive in the workspace leaf's accessible name:
    // an aria-label that only names the workspace hides it from assistive tech.
    const branchHeader = view.container.querySelector('.sb-workspace-node[data-kind="workspace"] > button')!
    expect(branchHeader.getAttribute('aria-label')).toContain('feat/main')
    await React.act(async () => { header.click() })
    expect(toggle).toHaveBeenLastCalledWith('project:github.com/me/i-ai-gw')
    expect(openCoordinator).not.toHaveBeenCalled()
    await React.act(async () => { (row.querySelectorAll('button')[1] as HTMLButtonElement).click() })
    expect(openCoordinator).toHaveBeenCalledWith('github.com/me/i-ai-gw')
  })
  it('shows session-less branches without a fake disclosure control or empty hint', async () => {
    const meta = {
      wa: {
        workspaceId: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', branch: 'feat/main',
        projectKey: 'github.com/me/i-ai-gw', projectLabel: 'i-ai-gw',
      },
      wd: {
        workspaceId: 'wd', title: 'i-ai-gw-idle', path: '/repo/i-ai-gw-idle', branch: 'feat/idle',
        projectKey: 'github.com/me/i-ai-gw', projectLabel: 'i-ai-gw',
      },
    }
    const props = {
      groups: [], t: components.t, grouping: 'tree', workspaceMeta: meta,
      onOpenCoordinator: vi.fn(), collapsed: {}, onToggleGroup: vi.fn(),
      onOpen: vi.fn(), onAck: vi.fn(), emptyKey: 'empty.noSessions',
    }
    const view = mount(components.BoardList, props); await view.render(props)
    expect(view.container.textContent).not.toContain('No sessions yet')
    expect(view.container.querySelector('.sb-workspace-node[data-kind="project"]')).not.toBeNull()
    const leaves = [...view.container.querySelectorAll('.sb-workspace-node[data-kind="workspace"]')]
    expect(leaves).toHaveLength(2)
    for (const leaf of leaves) {
      expect(leaf.querySelector('button')).toBeNull()
      expect(leaf.querySelector('.sb-group-head--static')?.getAttribute('aria-expanded')).toBeNull()
    }
    const idle = leaves.find(leaf => leaf.textContent?.includes('i-ai-gw-idle'))
    expect(idle?.textContent).toContain('feat/idle')
    expect(idle?.textContent).toContain('0')
  })
  it('keeps one coordinator request in flight and reports a failure inline', async () => {
    const workspaceEntry = { ...entry, workspaceId: 'wa', workspacePath: '/repo/i-ai-gw', workspaceTitle: 'i-ai-gw' }
    const meta = {
      wa: {
        workspaceId: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', branch: 'feat/main',
        projectKey: 'github.com/me/i-ai-gw', projectLabel: 'i-ai-gw',
      },
    }
    let resolveOpen: (() => void) | undefined
    const openCoordinator = vi.fn(() => new Promise<void>(resolve => { resolveOpen = resolve }))
    const props = {
      groups: [{ id: 'attention', entries: [workspaceEntry] }], t: components.t, grouping: 'tree',
      workspaceMeta: meta, onOpenCoordinator: openCoordinator, collapsed: {}, onToggleGroup: vi.fn(),
      onOpen: vi.fn(), onAck: vi.fn(), emptyKey: 'empty.noSessions',
    }
    const view = mount(components.BoardList, props); await view.render(props)
    const action = (): HTMLButtonElement =>
      [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Project session') as HTMLButtonElement
    await React.act(async () => { action().click() })
    expect(openCoordinator).toHaveBeenCalledTimes(1)
    expect(action().disabled).toBe(true)
    expect(action().getAttribute('aria-busy')).toBe('true')
    // A second click while the host is creating the session must not create another.
    await React.act(async () => { action().click() })
    expect(openCoordinator).toHaveBeenCalledTimes(1)
    await React.act(async () => { resolveOpen?.() })
    expect(action().disabled).toBe(false)
    expect(action().getAttribute('aria-busy')).toBeNull()
    // A failed request re-enables the button and leaves a retry message behind it.
    openCoordinator.mockImplementationOnce(async () => { throw new Error('offline') })
    await React.act(async () => { action().click() })
    expect(action().disabled).toBe(false)
    expect(view.container.querySelector('.sb-workspace-error')?.textContent).toContain('Try again')
    openCoordinator.mockImplementation(async () => {})
    await React.act(async () => { action().click() })
    expect(view.container.querySelector('.sb-workspace-error')).toBeNull()
  })
  it('marks the dock header as the window drag row instead of a width handle', async () => {
    document.documentElement.dataset.platform = 'darwin'
    const onWidth = vi.fn()
    const onOpenBoard = vi.fn()
    const props = dockProps({ onWidth, onOpenBoard })
    const view = mount(components.BoardDock, props); await view.render(props)
    const dock = view.container.querySelector<HTMLElement>('.sb-dock')!
    const head = view.container.querySelector<HTMLElement>('.sb-head')!
    expect(head.hasAttribute('data-window-drag')).toBe(true)
    expect(head.getAttribute('data-platform')).toBe('darwin')

    // The header is no longer a width surface: pressing it starts no dock drag.
    const title = head.querySelector('.sb-title')!
    await React.act(async () => { pointer(title, 'pointerdown', { clientX: 100, pointerId: 11 }) })
    await React.act(async () => { pointer(title, 'pointerup', { clientX: 100, pointerId: 11 }) })
    expect(dock.getAttribute('data-dragging')).toBeNull()
    expect(onWidth).not.toHaveBeenCalled()

    // Controls stay real controls; the stylesheet opts them out of the drag region.
    const controls = [...head.querySelectorAll<HTMLButtonElement>('.sb-btn')]
    expect(controls).toHaveLength(3)
    for (const [index, control] of controls.entries()) {
      let pressed: PointerEvent | undefined
      await React.act(async () => { pressed = pointer(control, 'pointerdown', { clientX: 120, pointerId: 20 + index }) })
      expect(pressed?.defaultPrevented).toBe(false)
      expect(dock.getAttribute('data-dragging')).toBeNull()
      await React.act(async () => { pointer(control, 'pointerup', { clientX: 120, pointerId: 20 + index }) })
    }
    expect(onWidth).not.toHaveBeenCalled()
    await React.act(async () => { controls[0]!.click() })
    expect(onOpenBoard).toHaveBeenCalledTimes(1)

    // The echo is the shell's raw marker: plain web leaves it absent.
    delete document.documentElement.dataset.platform
    await view.render(props)
    expect(head.hasAttribute('data-window-drag')).toBe(true)
    expect(head.hasAttribute('data-platform')).toBe(false)
  })
  it('declares the darwin window-drag contract on the header only', () => {
    const sheet = components.STYLESHEET
    expect(sheet).toContain("html[data-platform='darwin'] .sb-head { -webkit-app-region: drag; }")
    expect(sheet).toMatch(/html\[data-platform='darwin'\] \.sb-head :is\([^)]*\) \{[^}]*-webkit-app-region: no-drag;/)
    // The edge strip overlaps the header's last pixels; it must stay a width handle.
    expect(sheet).toContain("html[data-platform='darwin'] .sb-resize { -webkit-app-region: no-drag; }")
    // jsdom cannot compute -webkit-app-region, so the sheet text is the contract:
    // the header keeps an ordinary cursor and never becomes a touch trap.
    const headBlock = /\n\.sb-head \{([^}]*)\}/.exec(sheet)?.[1] ?? ''
    expect(headBlock).not.toContain('cursor')
    expect(headBlock).not.toContain('touch-action')
    // The column itself must never drag: that would swallow card clicks.
    expect(sheet).not.toMatch(/\.sb-dock[^{}]*\{[^}]*-webkit-app-region: drag/)
  })
  it('keeps the right edge strip a resize surface', async () => {
    const onWidth = vi.fn()
    const props = dockProps({ onWidth })
    const view = mount(components.BoardDock, props); await view.render(props)
    const dock = view.container.querySelector<HTMLElement>('.sb-dock')!
    const strip = view.container.querySelector<HTMLElement>('.sb-resize')!
    capturePointer(strip)
    await React.act(async () => { pointer(strip, 'pointerdown', { clientX: 400, pointerId: 31 }) })
    expect(dock.getAttribute('data-dragging')).toBe('true')
    await React.act(async () => { pointer(strip, 'pointermove', { clientX: 350, pointerId: 31 }) })
    await React.act(async () => { pointer(strip, 'pointerup', { clientX: 350, pointerId: 31 }) })
    expect(onWidth).toHaveBeenCalledTimes(1)
    expect(onWidth).toHaveBeenCalledWith(260)
  })
  it('plumbs the project coordinator action through the fullscreen board', async () => {
    const workspaceEntry = { ...entry, workspaceId: 'wa', workspacePath: '/repo/i-ai-gw', workspaceTitle: 'i-ai-gw' }
    const meta = {
      wa: {
        workspaceId: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', branch: 'feat/main',
        projectKey: 'github.com/me/i-ai-gw', projectLabel: 'i-ai-gw',
      },
    }
    const openCoordinator = vi.fn()
    const props = {
      open: true, groups: [{ id: 'attention', entries: [workspaceEntry] }], t: components.t,
      grouping: 'tree', density: 'compact', online: true, onClose: vi.fn(), onToggleDensity: vi.fn(),
      onOpen: vi.fn(), onAck: vi.fn(), collapsedGroups: {}, onToggleGroup: vi.fn(),
      workspaceMeta: meta, onOpenCoordinator: openCoordinator,
    }
    const view = mount(components.BoardOverlay, props); await view.render(props)
    const action = [...document.querySelectorAll('button')].find(candidate => candidate.textContent === 'Project session')
    expect(action).toBeDefined()
    await React.act(async () => { action?.click() })
    expect(openCoordinator).toHaveBeenCalledWith('github.com/me/i-ai-gw')
  })
})
