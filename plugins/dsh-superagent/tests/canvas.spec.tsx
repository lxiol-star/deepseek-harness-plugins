// @vitest-environment jsdom
/** The task canvas: its geometry, its cards and lines, and the Composer that asks the main Session. */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import type { TaskView, TasksView } from '../src/client/api.ts'
import { CanvasPage, curveMiddle, edgePath, fitView, readLayout, union, zoomAbout } from '../src/client/canvas.tsx'
import { zh } from '../src/client/locales.ts'
import { PanelProvider } from '../src/client/provider.tsx'
import { all, click, settle, translator, type as typeInto } from './fixtures/panel.tsx'
import { server, usePanelServer } from './fixtures/panel-server.ts'

const task = (id: string, fields: Partial<TaskView> = {}): TaskView => ({ id, title: `任务 ${id}`, stage: 'working', summary: '正在处理',
  sessionId: `worker-${id}`, createdAt: '2026-11-24T10:00:00.000Z', startedAt: '2026-11-24T10:05:00.000Z', updatedAt: '2026-11-24T10:06:00.000Z',
  live: false, ...fields })
const snapshot = (tasks: TaskView[], fields: Partial<TasksView> = {}): TasksView => ({ masterId: 'master', active: true, paused: false,
  maxWorkers: 2, running: tasks.filter(item => item.live).length, awaiting: tasks.filter(item => item.stage === 'person').length,
  queued: 0, total: tasks.length, tasks, conversation: [{ at: '2026-11-24T10:09:00.000Z', role: 'operator', text: '到哪一步了？' },
    { at: '2026-11-24T10:10:00.000Z', role: 'orchestrator', text: '在补测试。' }], ...fields })

// jsdom gives an opaque origin no storage: a Map stands in for it, so the dock remembers what the operator collapsed.
const stored = new Map<string, string>()
// The fake server unstubs every global after each test, so the storage is stubbed again before each one.
beforeEach(() => {
  stored.clear()
  vi.stubGlobal('localStorage', { getItem: (name: string) => stored.get(name) ?? null, setItem: (name: string, value: string) => { stored.set(name, value) } })
})
beforeEach(() => stored.clear())

let root: Root | undefined, container: HTMLElement | undefined
const opened = vi.fn(async (_id: string) => {})
function unmount() { act(() => { root?.unmount() }); root = undefined; container?.remove() }
async function mount() {
  unmount()
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<PanelProvider t={translator(zh)} openSession={opened}><CanvasPage intervalMs={60000} /></PanelProvider>) })
  await settle()
}
usePanelServer(unmount)
const nodes = (prefix: string) => all(`[data-node^="${prefix}"]`)
const composer = () => document.querySelector<HTMLTextAreaElement>('.dt-canvas-composer-input')!
const send = () => all('button').find(button => button.textContent?.trim() === '发送') as HTMLButtonElement

it('fits every card in the viewport, zooms about a point that stays put, and joins two cards with one curve', () => {
  const cards = [{ x: 0, y: 0, w: 360, h: 200 }, { x: 440, y: 60, w: 360, h: 520 }, { x: 880, y: 300, w: 360, h: 180 }]
  // The cards cover 1240 × 580. A viewport too narrow for them scales the plane down to fit their width with its padding.
  const wide = fitView(cards, 800, 600)
  expect(wide.scale).toBeCloseTo((800 - 96) / 1240, 6)
  // The middle of what they cover lands in the middle of the viewport.
  expect(wide.x + 620 * wide.scale).toBeCloseTo(400, 6)
  expect(wide.y + 290 * wide.scale).toBeCloseTo(300, 6)
  // A viewport that holds the cards at their own size centers them without zooming in.
  expect(fitView(cards, 4000, 3000)).toEqual({ scale: 1, x: 1380, y: 1210 })
  // Nothing to show yet, or a viewport that is not laid out: the plane rests at its origin.
  expect(fitView([], 800, 600)).toEqual({ x: 24, y: 24, scale: 1 })
  expect(fitView(cards, 0, 0)).toEqual({ x: 24, y: 24, scale: 1 })
  // The viewport point (400, 300) stays where it is while the plane doubles about it.
  const zoomed = zoomAbout({ x: 24, y: 24, scale: 1 }, 2, 400, 300)
  expect(zoomed).toEqual({ scale: 2, x: -352, y: -252 })
  // The plane point under (400, 300) was 376 from the plane's origin, and still shows there.
  expect(376 * zoomed.scale + zoomed.x).toBe(400)
  expect(zoomAbout({ x: 0, y: 0, scale: 1.9 }, 2, 0, 0).scale).toBe(2)
  expect(zoomAbout({ x: 0, y: 0, scale: 0.4 }, 0.5, 0, 0).scale).toBeCloseTo(0.3, 6)
  const path = edgePath(cards[0]!, cards[1]!)
  // The curve leaves the right edge of the first card and enters the left edge of the second, bending by 40 at least.
  expect(path).toBe('M 360 100 C 400 100, 400 320, 440 320')
  expect(curveMiddle(path)).toEqual({ x: 400, y: 210 })
  // Far apart, the bend is capped at 40 rather than growing with the distance.
  expect(edgePath({ x: 0, y: 0, w: 100, h: 10 }, { x: 500, y: 0, w: 10, h: 10 })).toBe('M 100 5 C 140 5, 460 5, 500 5')
  expect(union(cards)).toEqual({ x: 0, y: 0, w: 1240, h: 580 })
  expect(union(cards, 24)).toEqual({ x: -24, y: -24, w: 1288, h: 628 })
  const storage = { getItem: vi.fn(() => JSON.stringify({ 'task:a': { x: 12.5, y: -3 }, broken: { x: '1', y: 2 }, 'task:b': null, bad: 7 })) }
  expect(readLayout(storage as unknown as Storage)).toEqual({ 'task:a': { x: 12.5, y: -3 } })
  expect(readLayout({ getItem: () => '{' } as unknown as Storage)).toEqual({})
  expect(readLayout(undefined)).toEqual({})
})

it('lays the main Session, the tickets and their workers out as cards joined by lines', async () => {
  server.tasks = snapshot([task('a', { live: true, todos: { done: 1, total: 4, current: '补测试' } }),
    task('b', { stage: 'person', action: 'answer', note: { text: '用哪种蓝？', error: false } }),
    task('c', { action: 'queued', sessionId: '', startedAt: undefined })], { running: 1, awaiting: 1 })
  await mount()
  expect(all('.dt-canvas-lane-title').map(title => title.textContent)).toEqual(['主会话', '任务', '执行器'])
  expect(nodes('task:')).toHaveLength(3)
  expect(nodes('worker:')).toHaveLength(2)
  expect(nodes('empty')).toEqual([])
  // The main Session says how it is and what it holds, and shows its latest exchanges.
  const main = nodes('master')[0]!
  expect(main.querySelector('.dt-canvas-state')?.textContent).toBe('运行中')
  expect(main.querySelector('.dt-canvas-meta')?.textContent).toBe('3 个工单 · 1 个待你处理')
  expect([...main.querySelectorAll('.dt-canvas-speaker')].map(speaker => speaker.textContent)).toEqual([expect.stringMatching(/^你/),
    expect.stringMatching(/^Superagent 主会话/)])
  expect(main.querySelector('.dt-canvas-clamp')?.textContent).toBe('到哪一步了？')
  // A ticket: its number, title, stage and progress.
  const first = nodes('task:')[0]!
  expect(first.querySelector('.dt-canvas-card-title')?.textContent).toBe('1. 任务 a')
  expect(first.querySelector('.dt-canvas-ratio')?.textContent).toBe('1/4')
  expect(first.querySelector('.dt-canvas-progress .dt-canvas-clamp')?.textContent).toBe('补测试')
  expect(first.querySelector('.dt-canvas-live')?.textContent).toBe('执行器运行中')
  expect(nodes('task:')[1]!.querySelector('.dt-canvas-progress .dt-canvas-clamp')?.textContent).toBe('用哪种蓝？')
  expect(nodes('task:')[2]!.querySelector('.dt-canvas-meta')?.textContent).not.toContain('执行器')
  // One line from the main Session to each ticket, one from each ticket to its worker, none to the Composer yet.
  expect(all('.dt-canvas-line[data-kind="dispatch"]')).toHaveLength(3)
  expect(all('.dt-canvas-line[data-kind="run"]')).toHaveLength(2)
  expect(all('.dt-canvas-line[data-kind="ask"]')).toEqual([])
  expect(all('.dt-canvas-edge-label').map(label => label.textContent)).toEqual(['执行', '执行'])
  expect(document.querySelector('.dt-canvas-load')?.textContent).toBe('执行器 1 / 2')
  expect(document.querySelector('.dt-canvas-bar-sum')?.textContent).toBe('需要你处理 1')
  expect(document.querySelector('.dt-canvas-legend')?.textContent).toContain('虚线：勾选的工单 → Composer（提问）')
})

it('asks the main Session about the ticked ticket, and only about one', async () => {
  server.tasks = snapshot([task('a'), task('b')])
  await mount()
  // Nothing is ticked: the Composer says so and sends nothing, by the button or by Enter.
  expect(document.querySelector('.dt-canvas-composer-about')?.textContent).toBe(zh['canvas.composerNone'])
  expect(send().disabled).toBe(true)
  await typeInto(composer(), '到哪一步了？')
  expect(send().disabled).toBe(true)
  await pressEnter()
  expect(asks()).toEqual([])
  await click(nodes('task:')[0]!.querySelector<HTMLInputElement>('.dt-canvas-check')!)
  expect(document.querySelector('.dt-canvas-composer-about')?.textContent).toBe('关于「任务 a」')
  expect(all('.dt-canvas-line[data-kind="ask"]')).toHaveLength(1)
  expect(nodes('task:')[0]!.dataset.picked).toBe('1')
  expect(send().disabled).toBe(false)
  await pressEnter()
  expect(asks()).toEqual([{ path: 'tasks/a/ask', body: { question: '到哪一步了？' } }])
  // Asked: the question and the tick are gone, and the line with them.
  expect(composer().value).toBe('')
  expect(all('.dt-canvas-line[data-kind="ask"]')).toEqual([])
  expect(nodes('task:')[0]!.dataset.picked).toBeUndefined()
  expect(textOfStatus()).toContain('已提交给主会话')
  // Ticking another ticket moves the line to it; ticking it again clears it.
  await click(nodes('task:')[1]!.querySelector<HTMLInputElement>('.dt-canvas-check')!)
  expect(document.querySelector('.dt-canvas-composer-about')?.textContent).toBe('关于「任务 b」')
  await click(nodes('task:')[1]!.querySelector<HTMLInputElement>('.dt-canvas-check')!)
  expect(all('.dt-canvas-line[data-kind="ask"]')).toEqual([])
})

it('shows why it did not ask, says so when no ticket is open, and opens the conversations', async () => {
  server.tasks = snapshot([task('a')])
  server.down = true
  await mount()
  expect(nodes('task:')).toEqual([])
  expect(document.querySelector('.dt-canvas-bar [role="alert"]')).not.toBeNull()
  server.down = false
  server.tasks = snapshot([])
  await mount()
  expect(nodes('empty')[0]!.textContent).toContain(zh['canvas.empty'])
  expect(all('svg.dt-canvas-edges .dt-canvas-edge')).toHaveLength(0)
  expect(document.querySelector('.dt-canvas-bar-sum')?.textContent).toBe('需要你处理 0')
  // A host that refuses the question: the Composer keeps it, and the bar says why.
  server.tasks = snapshot([task('a')])
  await mount()
  await click(nodes('task:')[0]!.querySelector<HTMLInputElement>('.dt-canvas-check')!)
  await typeInto(composer(), '到哪一步了？')
  server.down = true
  await click(send())
  expect(composer().value).toBe('到哪一步了？')
  expect(nodes('task:')[0]!.dataset.picked).toBe('1')
  expect(document.querySelector('.dt-toast')?.textContent).toBe(zh['hostNotRunning'])
  server.down = false
  await click(send())
  expect(asks()).toHaveLength(1)
  await click(all('button').find(button => button.textContent?.trim() === '在对话中打开')!)
  expect(opened).toHaveBeenLastCalledWith('master')
})

it('pans with the wheel and zooms with ⌘ or Ctrl held', async () => {
  server.tasks = snapshot([task('a')])
  await mount()
  const plane = document.querySelector<HTMLElement>('.dt-canvas-world')!, canvas = document.querySelector<HTMLElement>('.dt-canvas')!
  expect(plane.style.transform).toBe('translate(24px, 24px) scale(1)')
  await wheel(canvas, { deltaX: 30, deltaY: 70 })
  expect(plane.style.transform).toBe('translate(-6px, -46px) scale(1)')
  await wheel(canvas, { deltaY: -100, ctrlKey: true })
  // One wheel step zooms by at most e^0.25 about the pointer, in either direction.
  expect(scaleOf()).toBeCloseTo(Math.exp(0.25), 6)
  await wheel(canvas, { deltaY: 100, metaKey: true })
  expect(scaleOf()).toBeCloseTo(1, 6)
  await click('放大')
  expect(scaleOf()).toBeCloseTo(1.25, 6)
  await click('缩小')
  expect(scaleOf()).toBeCloseTo(1, 6)
  await click('适应画布')
  expect(plane.style.transform).toBe('translate(24px, 24px) scale(1)')
})
it('lets the thread list keep its own wheel, and pans the plane everywhere else', async () => {
  server.tasks = snapshot([task('a')])
  await mount()
  const plane = document.querySelector<HTMLElement>('.dt-canvas-world')!
  const thread = document.querySelector<HTMLElement>('.dt-canvas-thread')!
  const textarea = document.querySelector<HTMLElement>('.dt-canvas-composer-input')!
  await wheel(thread, { deltaY: 60 })
  await wheel(textarea, { deltaY: 60 })
  // Over the list or the text field the plane does not move: they scroll themselves.
  expect(plane.style.transform).toBe('translate(24px, 24px) scale(1)')
  await wheel(plane, { deltaY: 60 })
  expect(plane.style.transform).toBe('translate(24px, -36px) scale(1)')
  // ⌘ or Ctrl over the list still zooms the plane: a pinch has no other meaning there.
  await wheel(thread, { deltaY: -100, ctrlKey: true })
  expect(scaleOf()).toBeCloseTo(Math.exp(0.25), 6)
})

it('joins two cards on the sides that face each other, so a line to a card on the left never sweeps back through the lane', () => {
  const composer = { x: 0, y: 0, w: 360, h: 420 }, ticket = { x: 440, y: 0, w: 360, h: 120 }
  // Forward, the default: out of the right edge of the first, into the left edge of the second, bending at the middle of the gap.
  expect(edgePath(composer, ticket)).toBe('M 360 210 C 400 210, 400 60, 440 60')
  // Backward, as the question is drawn from a ticket to the Composer that lies to its left.
  const back = edgePath(ticket, composer, 0.7, 0.5, 'left', 'right')
  expect(back).toBe('M 440 84 C 400 84, 400 210, 360 210')
  // Either way every point of the curve stays in the gap between the two cards.
  const xs = (path: string) => path.match(/-?[\d.]+/g)!.filter((_, index) => index % 2 === 0).map(Number)
  expect(Math.max(...xs(back))).toBe(440)
  expect(Math.min(...xs(back))).toBe(360)
  expect(Math.min(...xs(edgePath(composer, ticket)))).toBe(360)
  expect(Math.max(...xs(edgePath(composer, ticket)))).toBe(440)
  // Far apart, the bend grows with the distance up to 40 instead of staying a short stub beside each card.
  expect(edgePath({ x: 0, y: 0, w: 100, h: 10 }, { x: 900, y: 0, w: 10, h: 10 })).toBe('M 100 5 C 140 5, 860 5, 900 5')
  // A card the operator dragged right beside another: the bend yields to the gap, and where the edges touch the line is straight.
  expect(edgePath({ x: 0, y: 0, w: 100, h: 40 }, { x: 112, y: 0, w: 10, h: 40 })).toBe('M 100 20 C 106 20, 106 20, 112 20')
  expect(edgePath({ x: 0, y: 0, w: 100, h: 40 }, { x: 100, y: 0, w: 10, h: 40 })).toBe('M 100 20 C 100 20, 100 20, 100 20')
  // Asked to leave by the right edge for a card that lies to the left, it runs straight to that card's left edge and never
  // runs further right than the edge it left. (The canvas does not ask this: it leaves by the edge that faces the other card.)
  const over = edgePath({ x: 0, y: 0, w: 100, h: 40 }, { x: 60, y: 0, w: 10, h: 40 })
  expect(over).toBe('M 100 20 C 100 20, 60 20, 60 20')
  expect(Math.max(...xs(over))).toBe(100)
})

it('fits a plane that holds more than the viewport can show at its own size', () => {
  // Fifteen tickets stacked in their lane, with a card each: far taller than the viewport.
  const lane = Array.from({ length: 15 }, (_, index) => ({ x: 440, y: 60 + index * 132, w: 360, h: 120 }))
  const view = fitView([...lane, { x: 0, y: 0, w: 360, h: 420 }, { x: 880, y: 0, w: 360, h: 120 }], 1200, 800)
  expect(view.scale).toBeLessThan(0.5)
  expect(view.scale).toBeGreaterThanOrEqual(0.3)
  // The bottom of the last card lands inside the viewport.
  const bottom = (60 + 14 * 132 + 120) * view.scale + view.y
  expect(bottom).toBeLessThanOrEqual(800)
})

it('shows every ticket, past the twelve the dock lists', async () => {
  server.tasks = snapshot(Array.from({ length: 15 }, (_, index) => task(`t${index}`)), { total: 15 })
  await mount()
  // jsdom lays nothing out, so geometry is not what this proves: it proves the canvas was given, and drew, all fifteen.
  expect(nodes('task:')).toHaveLength(15)
  expect(nodes('worker:')).toHaveLength(15)
  expect(all('.dt-canvas-line[data-kind="dispatch"]')).toHaveLength(15)
  expect(all('.dt-canvas-line[data-kind="run"]')).toHaveLength(15)
})

it('keeps fitting the plane to its cards as they arrive, until the operator moves it', async () => {
  server.tasks = snapshot([task('a')])
  await mount()
  const plane = document.querySelector<HTMLElement>('.dt-canvas-world')!
  // jsdom lays nothing out, so every fit lands on the same resting transform; what is observable is that a fit still happens
  // after new cards arrive, and stops once the operator has panned.
  const fitCount = () => void plane.style.transform
  server.tasks = snapshot([task('a'), task('b')])
  await settle()
  fitCount()
  await wheel(plane, { deltaY: 80 })
  const afterPan = plane.style.transform
  server.tasks = snapshot([task('a'), task('b'), task('c')])
  await settle()
  // A late ticket does not pull the plane back from where the operator left it.
  expect(plane.style.transform).toBe(afterPan)
})

async function wheel(target: Element, init: WheelEventInit) {
  await act(async () => { target.dispatchEvent(new WheelEvent('wheel', { ...init, bubbles: true, cancelable: true })) })
}
const scaleOf = () => Number(/scale\(([\d.]+)\)/.exec(document.querySelector<HTMLElement>('.dt-canvas-world')!.style.transform)![1])

const asks = () => server.requests.filter(request => request.method === 'POST' && request.path.endsWith('/ask'))
  .map(request => ({ path: request.path, body: request.body as { question: string } }))
async function pressEnter() {
  await act(async () => { composer().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
  await settle()
}
const textOfStatus = () => [...document.querySelectorAll('[role="status"]')].map(node => node.textContent).join()
