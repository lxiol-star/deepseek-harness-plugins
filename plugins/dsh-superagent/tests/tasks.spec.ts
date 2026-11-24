/** The task views of the main Session: the ticket line, the ranking, the list, the todo and reply readers, and the routes that read and ask. */
import { expect, it, vi } from 'vitest'
import { registerHttp, type HttpHost } from '../src/app/http.ts'
import { EXCHANGES, replyText, todosOf } from '../src/app/sessions.ts'
import { ticketLine } from '../src/core/questions.ts'
import type { Mandate, Ticket } from '../src/core/index.ts'
import { DOCK_TASKS, operatorQuestion, taskRank, tasksView, type TasksHost } from '../src/app/views/tasks.ts'

const at = (minute: number) => `2026-11-24T10:${String(minute).padStart(2, '0')}:00.000Z`
/** An open ticket as the store holds it, with whatever the test adds. */
function ticket(id: string, fields: Partial<Ticket> = {}): Ticket {
  return { id, title: `Ticket ${id}`, decisionId: '', mandate: { strength: 'explicit' } as Mandate, channels: [], assignments: [],
    inputs: [], undelivered: [], createdAt: at(0), updatedAt: at(1), origin: { triggerId: '', triggerIds: [] }, ...fields }
}
const started = { id: 'a1', state: 'running' as const, createdAt: at(4), startedAt: at(5),
  report: { state: 'progress' as const, summary: 'changed two files', at: at(6) } }
const review = { id: 'a1', state: 'running' as const, createdAt: at(4), startedAt: at(5),
  report: { state: 'ready' as const, summary: 'ready for review', at: at(6) } }
const waiting = { id: 'a1', state: 'ended' as const, createdAt: at(4), startedAt: at(5), endedAt: at(7),
  report: { state: 'waiting' as const, summary: 'waits for CI', at: at(6) } }
const running: Ticket[] = [
  ticket('run', { title: '修复回归', assignments: [started] }),
  ticket('review', { title: '待验收', updatedAt: at(2), assignments: [review] }),
  ticket('queue', { title: '排队中' }),
  ticket('idle', { title: '等待触发', assignments: [waiting] }),
  ticket('answer', { title: '待回答', updatedAt: at(3), assignments: [started],
    attention: { id: 'q1', question: '用哪种蓝？' } as unknown as Ticket['attention'] }),
  ticket('gone', { title: '已清除', assignments: [started], dismissed: true }),
]
const live = new Set(['run', 'review'])
const todos = new Map([['worker-run', { done: 1, total: 3, current: '补测试' }]])
const conversation = [{ at: at(9), role: 'operator' as const, text: '到哪一步了？' }, { at: at(10), role: 'orchestrator' as const, text: '在补测试。' }]
const host = (tickets: Ticket[], overrides: Partial<TasksHost> = {}): TasksHost => ({ masterId: 'master', active: true, paused: false,
  maxWorkers: 2, openTickets: () => tickets, live: item => live.has(item.id), todos: sessionId => todos.get(sessionId),
  conversation: () => conversation, ...overrides })

it('orders a running worker first, then what waits for a person, then the queue, then a worker between turns, then a ticket waiting for a Trigger', () => {
  expect([0, 3, 2, 1, 4]).toEqual([
    taskRank({ stage: 'working', live: true }), taskRank({ stage: 'working', live: false }),
    taskRank({ stage: 'working', action: 'queued', live: false }), taskRank({ stage: 'person', action: 'review', live: true }),
    taskRank({ stage: 'idle', live: false })])
})

it('lists the open tickets that are not dismissed in that order, each with its worker Session, start, report and todo list, and counts the rest', () => {
  const view = tasksView(host(running))
  expect(view.tasks.map(task => task.id)).toEqual(['run', 'answer', 'review', 'queue', 'idle'])
  expect(view).toMatchObject({ masterId: 'master', active: true, paused: false, maxWorkers: 2, running: 1, awaiting: 2, queued: 1,
    total: 5, omitted: 0, conversation })
  // A worker that runs keeps its start, its latest report and the todo list it last wrote; the panel's own fields stay with the panel.
  expect(view.tasks[0]).toEqual({ id: 'run', title: '修复回归', stage: 'working', summary: 'changed two files', sessionId: 'worker-run',
    createdAt: at(0), startedAt: at(5), updatedAt: at(1), live: true, todos: { done: 1, total: 3, current: '补测试' } })
  // A ticket still waiting for a worker has no Session and no start.
  expect(view.tasks[3]).toMatchObject({ id: 'queue', stage: 'working', action: 'queued', sessionId: '', summary: '', live: false })
  expect('startedAt' in view.tasks[3]!).toBe(false)
  // What waits for the person says what they must do.
  expect(view.tasks[1]).toMatchObject({ id: 'answer', stage: 'person', action: 'answer', note: { text: '用哪种蓝？', error: false } })
})

it('counts the tickets beyond the first page, and reads the main Session as idle when it is', () => {
  const many = Array.from({ length: DOCK_TASKS + 3 }, (_, index) => ticket(`t${index}`, { updatedAt: at(index + 2) }))
  const view = tasksView(host(many, { active: false }))
  expect(view).toMatchObject({ active: false, total: DOCK_TASKS + 3, omitted: 3 })
  expect(view.tasks).toHaveLength(DOCK_TASKS)
  // Newest first within a rank.
  expect(view.tasks[0]!.id).toBe(`t${DOCK_TASKS + 2}`)
})

it('writes the ticket line without the characters that would close or break it', () => {
  expect(ticketLine('abc', '修复登录')).toBe('[ticket abc · 修复登录]')
  // One run of such characters becomes one space.
  expect(ticketLine('abc', '修复[登录]\n跳转')).toBe('[ticket abc · 修复 登录 跳转]')
  expect(operatorQuestion('abc', '修复登录', '到哪一步了？')).toBe(
    'The operator asks from the Superagent task canvas; answer here.\n[ticket abc · 修复登录]\n到哪一步了？')
})

it('reads a todo list and the reply that ended a turn, and nothing else', () => {
  expect(todosOf({ todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'pending' }] }))
    .toEqual({ done: 1, total: 3, current: 'b' })
  expect(todosOf({ todos: [{ content: 'a', status: 'pending' }] })).toEqual({ done: 0, total: 1, current: '' })
  expect(todosOf({ todos: [] })).toEqual({ done: 0, total: 0, current: '' })
  expect(todosOf({ todos: 'none' })).toBeUndefined()
  expect(todosOf(undefined)).toBeUndefined()
  const message = (content: unknown) => ({ type: 'assistant/message', data: { message: { role: 'assistant', content } } })
  expect(replyText(message([{ type: 'text', text: '在补测试。' }]))).toBe('在补测试。')
  expect(replyText(message([{ type: 'reasoning', text: 'thinking' }, { type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }])))
    .toBe('第一段\n\n第二段')
  // A step that calls tools goes on: its text is not the reply.
  expect(replyText(message([{ type: 'text', text: '先看一眼' }, { type: 'tool-call', id: 'c1', name: 'bash' }]))).toBeUndefined()
  expect(replyText(message([{ type: 'tool-call', id: 'c1', name: 'bash' }]))).toBeUndefined()
  expect(replyText(message([]))).toBeUndefined()
  expect(replyText({ type: 'user/message', data: { content: [{ type: 'text', text: 'hi' }] } })).toBeUndefined()
  expect(EXCHANGES).toBeGreaterThan(4)
})

type Handler = (req: unknown, res: unknown) => Promise<void>
/** Mount management HTTP routes on a fake web server, as `tests/http.spec.ts` does, and return a request helper. */
function serve(runtime: Partial<Record<keyof HttpHost, unknown>>) {
  let handler: Handler = async () => {}
  const ctx = { webServer: { host: '127.0.0.1', port: 3082, register: (route: { handler: Handler }) => { handler = route.handler; return () => {} } } }
  registerHttp(ctx as never, { ready: Promise.resolve(), ...runtime } as unknown as HttpHost)
  return async (method: string, path: string, body?: unknown) => {
    let status = 0, text = ''
    const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
    const req = { method, url: `/orchestrator/api/${path}`, headers: { host: '127.0.0.1:3082', 'x-orchestrator-request': '1' },
      async *[Symbol.asyncIterator]() { yield* chunks } }
    await handler(req, { writeHead: (code: number) => { status = code }, end: (data: string) => { text = data } })
    return { status, body: JSON.parse(text) as Record<string, unknown> }
  }
}

it('answers the task list from the store, the executor and the sessions, and carries a question to the main Session', async () => {
  const ask = vi.fn(), stored = ticket('abc', { title: '修复登录', assignments: [started] })
  const call = serve({ masterId: 'master', store: { tickets: { open: () => [stored], get: (id: string) => id === 'abc' ? stored : undefined },
    settings: () => ({ paused: true, executor: { maxWorkers: 3 } }) }, executor: { running: (item: Ticket) => item.id === 'abc' },
    sessions: { active: () => false, todoList: () => undefined, conversation: () => [], ask } })
  const read = await call('GET', 'tasks')
  expect(read.status).toBe(200)
  expect(read.body).toMatchObject({ masterId: 'master', active: false, paused: true, maxWorkers: 3, running: 1, awaiting: 0, total: 1,
    tasks: [{ id: 'abc', title: '修复登录', live: true, sessionId: 'worker-abc' }], conversation: [] })
  const asked = await call('POST', 'tasks/abc/ask', { question: '  到哪一步了？ ' })
  expect(asked).toEqual({ status: 200, body: { delivered: 'queued' } })
  expect(ask).toHaveBeenCalledOnce()
  const [requestId, text, question] = ask.mock.calls[0]! as [string, string, string]
  expect(requestId).toMatch(/^ask:abc:\d+$/)
  expect(text).toBe(operatorQuestion('abc', '修复登录', '到哪一步了？'))
  expect(question).toBe('到哪一步了？')
  // An unknown ticket, a blank question and a body that is not the question's are refused, and carry nothing.
  expect((await call('POST', 'tasks/zzz/ask', { question: 'hi' })).status).toBe(404)
  expect((await call('POST', 'tasks/abc/ask', { question: '   ' })).status).toBe(400)
  expect((await call('POST', 'tasks/abc/ask', { text: 'hi' })).status).toBe(400)
  expect(ask).toHaveBeenCalledOnce()
})
