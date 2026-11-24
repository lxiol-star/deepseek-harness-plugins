// @vitest-environment jsdom
/**
 * The INSTALLED browser bundle, not the sources: whatever sits in this profile's node_modules/dsh-superagent/lib is what the
 * running DeepSeek Harness serves, so this proves the shipped artifact and not an earlier or later build of it. It loads the file
 * through the module-loader facade the way the app does, with a `require` that answers only the baseline modules.
 *
 * This is not the signed-in page: that page needs a token a session must not go looking for. It proves the artifact loads,
 * registers, renders and sends the documented request; how it is painted in the app stays to the eye.
 */
import { act } from 'react'
import * as Jsx from 'react/jsx-runtime'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
  /** The facade the app's `<head>` installs: a client bundle hands it one factory, and the loader calls that with `require`. */
  interface Window { __ModuleLoader__: { load(definition: { id: string; factory: (require: (name: string) => unknown) => unknown }): unknown } }
}
// As every component spec of this plugin does: without it React warns that act(...) is unsupported and leaves state unflushed.
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The profile under test is the running one: `DSH_HOME` and `DSH_PROFILE` name it, and the defaults are the standard home and
// the desktop profile. Another home's installed package is another artifact: point `DSH_HOME` at it to prove that one.
const HOME_DIR = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE = process.env.DSH_PROFILE ?? 'desktop'
const INSTALLED = join(HOME_DIR, 'profiles', PROFILE, 'node_modules', 'dsh-superagent')
const MASTER = 'orchestrator-403aaf2da5bdbf4ea9494bb42dcc40d9'
const TASK = { id: 'abc123', title: '修复登录跳转', stage: 'working', summary: 'changed two files', sessionId: 'worker-abc123',
  createdAt: '2026-11-24T11:00:00.000Z', startedAt: '2026-11-24T11:05:00.000Z', updatedAt: '2026-11-24T11:30:00.000Z', live: true,
  todos: { done: 1, total: 3, current: '补测试' } }
type Task = typeof TASK

interface Bundle { apply(ctx: unknown): void; inject: string[] }
interface Entry { options: { name: string; id?: string; key?: string; order?: number }; component: React.ComponentType<Record<string, unknown>> }

/** Load the installed `lib/client.js` through the module-loader facade; `require` answers the baseline modules and nothing else. */
function load(): { bundle: Bundle; manifest: { version: string; dsh: { client: { inject: string[] } } }; asked: string[] } {
  const source = readFileSync(join(INSTALLED, 'lib', 'client.js'), 'utf8')
  const manifest = JSON.parse(readFileSync(join(INSTALLED, 'package.json'), 'utf8'))
  let loaded: Bundle | undefined
  const asked: string[] = []
  window.__ModuleLoader__ = { load: definition => {
    loaded = definition.factory(name => {
      asked.push(name)
      if (name === 'react') return React
      if (name === 'react-dom') return ReactDOM
      if (name === 'react/jsx-runtime') return Jsx
      throw new Error(`the bundle requires a module outside the baseline: ${name}`)
    }) as Bundle
  } }
  new Function('window', source)(window)
  if (!loaded) throw new Error('the bundle registered no factory')
  return { bundle: loaded, manifest, asked }
}

const views: { root: Root; container: HTMLElement }[] = []
async function mount(component: React.ComponentType<Record<string, unknown>>, props: Record<string, unknown>) {
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(component, props)) })
  await settle()
  const view = { root, container }; views.push(view); return view
}
async function settle() { for (let i = 0; i < 8; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }

it('ships a task canvas and a composer dock that load from the installed bundle and ask the main Session about a ticket', async () => {
  const { bundle, manifest, asked } = load()
  expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-conversation')
  // Baseline modules only: the app's module table has these, and no package of this plugin's own.
  expect([...new Set(asked)].sort()).toEqual(['react', 'react-dom', 'react/jsx-runtime'])

  const slots = new Map<string, Entry>()
  const dictionaries: Record<string, { zh: Record<string, string> }> = {}
  const opened: string[] = []
  const ctx = {
    effect: (effect: () => unknown) => { effect() },
    locale: { register: (ns: string, value: unknown) => { dictionaries[ns] = value as typeof dictionaries[string]; return () => {} },
      bind: (ns: string) => (key: string, params?: Record<string, unknown>) => {
        const template = dictionaries[ns]?.zh[key] ?? key
        return params ? template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match) : template } },
    slots: { inject: (_name: string, register: () => void) => register(),
      register: (options: Entry['options'], component: Entry['component']) => {
        slots.set(`${options.name}#${options.key ?? options.id}`, { options, component }); return () => {} } },
    sessions: { list: { getSnapshot: () => ({ phase: 'ready', byId: Object.fromEntries([MASTER, TASK.sessionId].map(id => [id, {}])) }) },
      refresh: vi.fn(async () => {}) },
    // `openKnownSession` hands the Workspace UI the bare Session id.
    uiWorkspace: { openSession: (id: string) => { opened.push(id) } },
    get: () => undefined,
  }
  bundle.apply(ctx)
  expect([...slots.keys()]).toEqual(['main#dsh-superagent', 'sidebar.panellist#dsh-superagent', 'main#dsh-superagent-canvas',
    'sidebar.panellist#dsh-superagent-canvas', 'conversation.input.dock#dsh-superagent', 'plugins.row.config#dsh-superagent#dsh-superagent'])

  const posted: { id: string; body: { question: string }; marked: boolean }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = new URL(url, 'http://127.0.0.1').pathname.replace('/orchestrator/api/', '')
    if (init.method === 'POST') {
      posted.push({ id: path.split('/')[1]!, body: JSON.parse(String(init.body)), marked: new Headers(init.headers).has('x-orchestrator-request') })
      return Response.json({ delivered: 'queued' })
    }
    const tasks: Task[] = [TASK]
    if (path === 'tasks') return Response.json({ masterId: MASTER, active: false, paused: false, maxWorkers: 3, running: 1, awaiting: 0,
      queued: 0, total: 1, omitted: 0, conversation: [{ at: '2026-11-24T11:31:00.000Z', role: 'orchestrator', text: '在补测试。' }], tasks })
    if (path === 'state') return Response.json({ masterId: MASTER, paused: false, load: { running: 1, queued: 0, maxWorkers: 3 }, health: {},
      setup: { problem: null, feishuProblem: null } })
    return Response.json({})
  }))
  const t = ctx.locale.bind('dshSuperagent')

  // The canvas: three lanes, the main Session with its Composer, the ticket and its worker, joined by lines.
  const canvas = await mount(slots.get('main#dsh-superagent-canvas')!.component, { ctx, t })
  const page = canvas.container
  expect([...page.querySelectorAll('.dt-canvas-lane-title')].map(node => node.textContent)).toEqual(['主会话', '任务', '执行器'])
  expect([...page.querySelectorAll<HTMLElement>('[data-node]')].map(node => node.dataset.node))
    .toEqual(['master', 'composer', `task:${TASK.id}`, `worker:${TASK.sessionId}`])
  expect(page.querySelector('.dt-canvas-thread .dt-canvas-clamp')?.textContent).toBe('在补测试。')
  const lines = () => ['dispatch', 'run', 'ask'].map(kind => page.querySelectorAll(`.dt-canvas-line[data-kind="${kind}"]`).length)
  expect(lines()).toEqual([1, 1, 0])
  const send = () => [...page.querySelectorAll('button')].find(button => button.textContent?.trim() === '发送') as HTMLButtonElement
  expect(send().disabled).toBe(true)

  // Tick the ticket, type, send: the documented route, body and marker header.
  const box = page.querySelector<HTMLInputElement>('.dt-canvas-check')!
  await act(async () => { box.click() }); await settle()
  expect(page.querySelector('.dt-canvas-composer-about')?.textContent).toBe('关于「修复登录跳转」')
  expect(lines()).toEqual([1, 1, 1])
  expect(send().disabled).toBe(true)
  const textarea = page.querySelector<HTMLTextAreaElement>('.dt-canvas-composer-input')!
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
  await act(async () => { set.call(textarea, '到哪一步了？'); textarea.dispatchEvent(new Event('input', { bubbles: true })) }); await settle()
  expect(send().disabled).toBe(false)
  await act(async () => { send().click() }); await settle()
  expect(posted).toEqual([{ id: 'abc123', body: { question: '到哪一步了？' }, marked: true }])
  expect(textarea.value).toBe('')
  expect(box.checked).toBe(false)
  expect(lines()).toEqual([1, 1, 0])
  // Enter sends as well; Shift+Enter does not.
  await act(async () => { box.click() }); await settle()
  await act(async () => { set.call(textarea, '可以合并吗？'); textarea.dispatchEvent(new Event('input', { bubbles: true })) }); await settle()
  await act(async () => { textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })) })
  await settle()
  expect(posted).toHaveLength(1)
  await act(async () => { textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) }); await settle()
  expect(posted).toHaveLength(2)
  expect(textarea.value).toBe('')
  // The conversations open where the operator asks for them.
  const openMain = [...page.querySelectorAll('button')].filter(button => button.textContent?.trim() === '在对话中打开')
  await act(async () => { openMain[0]!.click() }); await settle()
  expect(opened).toEqual([MASTER])

  // The dock: in the main Session alone, and collapsible to its pill.
  const dock = await mount(slots.get('conversation.input.dock#dsh-superagent')!.component, { ctx, t, sessionId: MASTER,
    input: { draft: '', attachmentIds: [], phase: 'plain' } })
  const bar = dock.container
  expect(bar.querySelector('.dt-dock-count')?.textContent).toBe('1')
  expect(bar.querySelector('.dt-dock-summary')?.textContent).toBe('1 个执行中')
  expect(bar.querySelector('.dt-dock-ratio')?.textContent).toBe('1/3')
  await act(async () => { bar.querySelector<HTMLButtonElement>('.dt-dock-toggle')!.click() }); await settle()
  expect(bar.querySelector('.dt-dock-list')).toBeNull()
  expect(bar.querySelector('.dt-dock-count')?.textContent).toBe('1')
  const other = await mount(slots.get('conversation.input.dock#dsh-superagent')!.component, { ctx, t, sessionId: 'session-somebody-else' })
  expect(other.container.querySelector('.dt-dock')).toBeNull()

  // The stylesheet the bundle injects holds no raw color in the canvas and dock rules.
  const css = [...document.querySelectorAll('style')].map(node => node.textContent).join('\n')
  const mine = css.split('\n').filter(line => /^\.dt-(canvas|dock)|^#dt-canvas/.test(line))
  expect(mine.length).toBeGreaterThan(100)
  expect(mine.flatMap(line => line.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? [])).toEqual([])
  for (const view of views) { act(() => { view.root.unmount() }); view.container.remove() }
}, 30_000)
