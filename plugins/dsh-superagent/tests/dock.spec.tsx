// @vitest-environment jsdom
/** The task dock above the main Session's composer. */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import type { TaskView, TasksView } from '../src/client/api.ts'
import { askThroughComposer, dockDot, readCollapsed, TaskDock, taskProgress, taskQuestion, type DockInput, type DockInputActions } from '../src/client/dock.tsx'
import { zh } from '../src/client/locales.ts'
import { all, click, settle, translator, type as typeInto } from './fixtures/panel.tsx'
import { server, usePanelServer } from './fixtures/panel-server.ts'

const task = (id: string, fields: Partial<TaskView> = {}): TaskView => ({ id, title: `任务 ${id}`, stage: 'working', summary: '',
  sessionId: `worker-${id}`, createdAt: '2026-11-24T10:00:00.000Z', startedAt: '2026-11-24T10:05:00.000Z', updatedAt: '2026-11-24T10:06:00.000Z',
  live: false, ...fields })
const snapshot = (tasks: TaskView[], fields: Partial<TasksView> = {}): TasksView => ({ masterId: 'master', active: false, paused: false,
  maxWorkers: 2, running: tasks.filter(item => item.live).length, awaiting: tasks.filter(item => item.stage === 'person').length,
  queued: tasks.filter(item => item.action === 'queued').length, total: tasks.length, tasks, conversation: [], ...fields })
const running = (id: string) => task(id, { live: true, summary: '已改两个文件', todos: { done: 1, total: 3, current: '补测试' } })
const review = (id: string) => task(id, { stage: 'person', action: 'review', note: { text: 'PR #42 待验收', error: false } })
const queued = (id: string) => task(id, { action: 'queued', sessionId: '' })

// jsdom gives an opaque origin no storage: a Map stands in for it, so the dock remembers what the operator collapsed.
const stored = new Map<string, string>()
// The fake server unstubs every global after each test, so the storage is stubbed again before each one.
beforeEach(() => {
  stored.clear()
  vi.stubGlobal('localStorage', { getItem: (name: string) => stored.get(name) ?? null, setItem: (name: string, value: string) => { stored.set(name, value) } })
})
beforeEach(() => stored.clear())

interface Mount { sessionId?: string; input?: DockInput; inputActions?: DockInputActions; useInput?: () => DockInput | undefined
  openSession?: (id: string) => Promise<void>; openPanel?: () => void }
let root: Root | undefined, container: HTMLElement | undefined
const opened = vi.fn(async (_id: string) => {}), openPanel = vi.fn()
function unmount() { act(() => { root?.unmount() }); root = undefined; container?.remove() }
async function mount(overrides: Mount = {}) {
  unmount()
  container = document.createElement('div'); document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<TaskDock t={translator(zh)} intervalMs={60000} sessionId="master" openSession={opened} openPanel={openPanel} {...overrides} />) })
  await settle()
}
usePanelServer(unmount)

it('renders nothing in another Session, and nothing while no ticket is open', async () => {
  server.tasks = snapshot([running('a')])
  await mount({ sessionId: 'other' })
  expect(document.querySelector('.dt-dock')).toBeNull()
  expect(all('.dt-dock-card')).toEqual([])
  server.tasks = snapshot([])
  await mount()
  expect(document.querySelector('.dt-dock')).toBeNull()
})

it('lists the main Session\'s open tickets with their stage, progress and counts', async () => {
  server.tasks = snapshot([running('a'), review('b'), queued('c')], { running: 1, awaiting: 1, queued: 1, total: 3 })
  await mount()
  const cards = all('.dt-dock-list .dt-dock-card')
  expect(cards).toHaveLength(3)
  expect(document.querySelector('.dt-dock-count')?.textContent).toBe('3')
  expect(document.querySelector('.dt-dock-summary')?.textContent).toBe('1 个执行中1 个待你处理1 个排队')
  // A running worker: its checklist, its report and that it runs now.
  expect(cards[0]!.querySelector('.dt-dock-name')?.textContent).toBe('1. 任务 a')
  expect(cards[0]!.querySelector('.dt-dock-ratio')?.textContent).toBe('1/3')
  expect(cards[0]!.querySelector('.dt-dock-ellipsis')?.textContent).toBe('补测试')
  expect(cards[0]!.querySelector('.dt-dock-live')?.textContent).toBe('执行器运行中')
  expect(cards[0]!.querySelector('.dt-stage')?.textContent).toBe('执行中')
  // What waits for the person says what for.
  expect(cards[1]!.querySelector('.dt-stage')?.textContent).toBe('待验收')
  expect(cards[1]!.querySelector('.dt-dock-ellipsis')?.textContent).toBe('PR #42 待验收')
  expect(cards[2]!.querySelector('.dt-stage')?.textContent).toBe('排队中')
  expect(cards[2]!.querySelector('.dt-dock-meta')?.textContent).not.toContain('执行器')
  // Every card offers its worker's Session and the tick that selects it.
  expect(cards.map(card => card.querySelector('.dt-dock-open')?.textContent ?? null)).toEqual(['执行器会话', '执行器会话', null])
  expect(all('.dt-dock-check')).toHaveLength(3)
  expect(document.querySelector('.dt-dock-ask')).toBeNull()
})

it('collapses to its pill, remembers that, and expands again', async () => {
  server.tasks = snapshot([running('a')], { running: 1 })
  await mount()
  expect(readCollapsed()).toBe(false)
  await click('收起任务列表')
  expect(document.querySelector('.dt-dock')?.hasAttribute('data-collapsed')).toBe(true)
  expect(document.querySelector('.dt-dock-list')).toBeNull()
  expect(document.querySelector('.dt-dock-count')?.textContent).toBe('1')
  expect(readCollapsed()).toBe(true)
  await mount()
  // A new mount, as a reload or another opening of the Session makes, finds it as the operator left it.
  expect(document.querySelector('.dt-dock')?.hasAttribute('data-collapsed')).toBe(true)
  await click('展开任务列表')
  expect(document.querySelector('.dt-dock')?.hasAttribute('data-collapsed')).toBe(false)
  expect(all('.dt-dock-card')).toHaveLength(1)
  expect(readCollapsed()).toBe(false)
})

it('asks the main Session about the ticked ticket through its composer', async () => {
  server.tasks = snapshot([running('a'), review('b')])
  const actions = { captureInsertion: vi.fn(() => 'span'), insertText: vi.fn(() => true), submit: vi.fn() }
  await mount({ input: { draft: '', attachmentIds: [], phase: 'plain' }, inputActions: actions })
  await click(all('.dt-dock-check')[1]!)
  expect(document.querySelector('.dt-dock-target')?.textContent).toBe('就「任务 b」提问')
  expect(boxes().map(box => box.checked)).toEqual([false, true])
  // Nothing to send until there is a question.
  expect(findAsk().disabled).toBe(true)
  await typeInto(document.querySelector<HTMLInputElement>('.dt-dock-question input')!, '现在可以合并吗？')
  expect(findAsk().disabled).toBe(false)
  await click(findAsk())
  expect(actions.insertText).toHaveBeenCalledWith(taskQuestion('b', '任务 b', '现在可以合并吗？'), 'span')
  expect(actions.submit).toHaveBeenCalledOnce()
  // Asked: the tick and the question are gone.
  expect(document.querySelector('.dt-dock-ask')).toBeNull()
  expect(boxes().map(box => box.checked)).toEqual([false, false])
})

it('keeps the operator\'s own draft and attachments out of the question, and says why it did not ask', async () => {
  server.tasks = snapshot([running('a')])
  const actions = { captureInsertion: vi.fn(() => 'span'), insertText: vi.fn(() => true), submit: vi.fn() }
  await mount({ input: { draft: '还没写完的话', attachmentIds: [], phase: 'plain' }, inputActions: actions })
  await ask('a', '到哪一步了？')
  expect(actions.submit).not.toHaveBeenCalled()
  expect(document.querySelector('.dt-dock-notice')?.textContent).toBe(zh['dock.draftBusy'])
  await mount({ input: { draft: '', attachmentIds: ['file-1'], phase: 'plain' }, inputActions: actions })
  await ask('a', '到哪一步了？')
  expect(actions.submit).not.toHaveBeenCalled()
  expect(document.querySelector('.dt-dock-notice')?.textContent).toBe(zh['dock.draftBusy'])
  await mount({ input: { draft: '', attachmentIds: [], phase: 'sending' }, inputActions: actions })
  await ask('a', '到哪一步了？')
  expect(actions.submit).not.toHaveBeenCalled()
  expect(document.querySelector('.dt-dock-notice')?.textContent).toBe(zh['dock.sending'])
  // A composer that changed between the question and the insert asks for another press.
  await mount({ input: { draft: '', attachmentIds: [], phase: 'plain' }, inputActions: { ...actions, insertText: vi.fn(() => false) } })
  await ask('a', '到哪一步了？')
  expect(actions.submit).not.toHaveBeenCalled()
  expect(document.querySelector('.dt-dock-notice')?.textContent).toBe(zh['dock.changed'])
  expect(document.querySelector('.dt-dock-ask')).not.toBeNull()
  // Cancelling drops the tick.
  await click('取消')
  expect(document.querySelector('.dt-dock-ask')).toBeNull()
})

it('says when the host passes no composer actions, and opens the canvas and a worker\'s Session', async () => {
  server.tasks = snapshot([running('a')])
  await mount()
  await ask('a', '到哪一步了？')
  expect(document.querySelector('.dt-dock-notice')?.textContent).toBe(zh['dock.unsupported'])
  await click('打开画布')
  expect(openPanel).toHaveBeenCalledOnce()
  await click('执行器会话')
  expect(opened).toHaveBeenCalledWith('worker-a')
})

const boxes = () => all('.dt-dock-check') as HTMLInputElement[]
const findAsk = () => all('button').find(button => button.textContent?.trim() === '提问') as HTMLButtonElement
async function ask(id: string, question: string) {
  const index = all('.dt-dock-card').findIndex(card => card.textContent?.includes(`任务 ${id}`))
  await click(boxes()[index]!)
  await typeInto(document.querySelector<HTMLInputElement>('.dt-dock-question input')!, question)
  await click(findAsk())
  await settle()
}

it('writes a question into the composer only where it is safe to', () => {
  const idle = { draft: '', attachmentIds: [], phase: 'plain' }
  const span = vi.fn(() => 'span'), insert = vi.fn(() => true), submit = vi.fn()
  expect(askThroughComposer(idle, { captureInsertion: span, insertText: insert, submit }, 'hi')).toBe('sent')
  expect(insert).toHaveBeenCalledWith('hi', 'span')
  expect(submit).toHaveBeenCalledOnce()
  // Without a guarded insert, the draft is replaced; without either, nothing can be asked.
  const setDraft = vi.fn()
  expect(askThroughComposer(idle, { setDraft, submit }, 'hi')).toBe('sent')
  expect(setDraft).toHaveBeenCalledWith('hi')
  expect(askThroughComposer(idle, undefined, 'hi')).toBe('unsupported')
  expect(askThroughComposer(idle, { setDraft }, 'hi')).toBe('unsupported')
  // A composer whose state cannot be read may hold a draft: nothing is written into it.
  const draftsBefore = setDraft.mock.calls.length, submittedBefore = submit.mock.calls.length
  expect(askThroughComposer(undefined, { setDraft, submit }, 'hi')).toBe('unknown')
  expect(setDraft.mock.calls.length).toBe(draftsBefore)
  expect(submit.mock.calls.length).toBe(submittedBefore)
  // A command the operator typed is being handled: not a submission in flight, but not theirs to write over either.
  const settled = submit.mock.calls.length
  expect(askThroughComposer({ ...idle, phase: 'adjudicating' }, { captureInsertion: span, insertText: insert, submit }, 'hi')).toBe('busy')
  expect(askThroughComposer({ ...idle, phase: 'claimed' }, { captureInsertion: span, insertText: insert, submit }, 'hi')).toBe('busy')
  expect(askThroughComposer({ ...idle, phase: 'submitting' }, { captureInsertion: span, insertText: insert, submit }, 'hi')).toBe('sending')
  expect(askThroughComposer({ ...idle, phase: 'sending' }, { captureInsertion: span, insertText: insert, submit }, 'hi')).toBe('sending')
  expect(submit.mock.calls.length).toBe(settled)
  expect(insert.mock.calls.length).toBe(1)
})

it('reads the composer as it is when asking, not as it was when the dock rendered', async () => {
  server.tasks = snapshot([running('a')])
  const actions = { captureInsertion: vi.fn(() => 'span'), insertText: vi.fn(() => true), submit: vi.fn() }
  // The slot's snapshot says the composer is empty; the live hook says the operator is typing.
  const empty: DockInput = { draft: '', attachmentIds: [], phase: 'plain' }
  const typing: DockInput = { draft: '写到一半的话', attachmentIds: [], phase: 'plain' }
  await mount({ input: empty, inputActions: actions, useInput: () => typing })
  await ask('a', '到哪一步了？')
  expect(actions.submit).not.toHaveBeenCalled()
  expect(actions.insertText).not.toHaveBeenCalled()
  expect(document.querySelector('.dt-dock-notice')?.textContent).toBe(zh['dock.draftBusy'])
  // The draft is sent: now the live hook agrees with the snapshot, and the question goes.
  await mount({ input: empty, inputActions: actions, useInput: () => empty })
  await ask('a', '到哪一步了？')
  expect(actions.submit).toHaveBeenCalledOnce()
  expect(document.querySelector('.dt-dock-notice')).toBeNull()
})

it('says why it did not ask, and confirms when it did', async () => {
  server.tasks = snapshot([running('a')])
  const actions = { captureInsertion: vi.fn(() => 'span'), insertText: vi.fn(() => true), submit: vi.fn() }
  await mount({ inputActions: actions })
  await ask('a', '到哪一步了？')
  expect(document.querySelector('.dt-dock-notice')?.textContent).toBe(zh['dock.unknown'])
  // The hint says what the tick is for before anything is clicked.
  expect(document.querySelector('.dt-dock-hint')?.textContent).toBe(zh['dock.hint'])
})

it('summarizes a task list with one dot and names what a task is doing', () => {
  expect(dockDot([])).toBe('idle')
  expect(dockDot([queued('a')])).toBe('idle')
  expect(dockDot([task('a')])).toBe('ongoing')
  expect(dockDot([review('a'), running('b')])).toBe('warning')
  expect(dockDot([task('a', { stage: 'person', action: 'failed' })])).toBe('error')
  expect(taskProgress(translator(zh), running('a'))).toEqual({ ratio: '1/3', text: '补测试' })
  expect(taskProgress(translator(zh), task('a', { summary: '已改两个文件' }))).toEqual({ text: '已改两个文件' })
  expect(taskProgress(translator(zh), review('a'))).toEqual({ text: 'PR #42 待验收' })
  expect(taskProgress(translator(zh), task('a', { todos: { done: 2, total: 2, current: '' } }))).toEqual({ ratio: '2/2', text: '' })
  expect(taskQuestion('a', '任务 a', '到哪一步了？')).toBe('[ticket a · 任务 a]\n到哪一步了？')
})
