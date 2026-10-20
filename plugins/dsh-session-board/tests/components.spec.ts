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
  BoardOverlay: unknown
  BoardList: unknown
  BoardFilterBar: unknown
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
afterEach(async () => {
  await React.act(async () => { for (const root of roots.splice(0)) root.unmount() })
  document.body.innerHTML = ''; vi.restoreAllMocks()
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
})
