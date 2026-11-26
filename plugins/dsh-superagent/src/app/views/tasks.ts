/**
 * The tasks of the main Session as its views show them: every open ticket with its stage, its worker's latest report and todo
 * list, and whether that worker holds a slot right now, beside the main Session's own state. A read model over the store and
 * the executor's live state: it writes nothing, so the composer dock and the task canvas poll it.
 */
import { latestAssignment, type Ticket, type TicketStage } from '../../core/index.ts'
import { ticketLine } from '../../core/questions.ts'
import type { Exchange, Todos } from '../sessions.ts'
import { ticketSummary } from './records.ts'

/** How many tasks the composer dock lists; the canvas and the panel show them all. */
export const DOCK_TASKS = 12
/** The longest question about a ticket that the task views send, in characters. */
export const ASK_MAX = 4000

/** The action a ticket's stage names: what waits for a person, or a place in the queue. */
export type StageAction = Extract<TicketStage, { stage: 'person' }>['action'] | 'queued'
/**
 * One open ticket as the task views show it: the fields of its summary that the composer dock and the task canvas read, with a
 * stage that reads without narrowing, beside whether its worker holds a slot and the todo list it last wrote.
 */
/**
 * A Session the main Session started for itself, as opposed to an executor a ticket owns. `origin` is the Host's word for how
 * it was started (`subagent`, or whatever a teammate or tower sets), and `live` is its turn running now.
 */
export interface ChildSession {
  id: string
  /** The Session that started it: the main Session, or an executor whose own helpers this is. */
  parentId: string
  title?: string
  origin?: string
  live: boolean
}
export interface TaskView {
  id: string
  title: string
  stage: TicketStage['stage']
  action?: StageAction
  /** What waits for the person, while the stage is one of theirs. */
  note?: { text: string; error: boolean }
  /** The worker's latest report, empty before its first. */
  summary: string
  /** The worker Session's id, once an Assignment started; every later one runs in that same Session. */
  sessionId: string
  createdAt: string
  /** When the worker of the latest Assignment started; a ticket still waiting for one has none. */
  startedAt?: string
  updatedAt: string
  /** The worker's turn, or a shell job or subagent of its turn, runs now. */
  live: boolean
  /** Present once the worker wrote a todo list; empty (`total` 0) once it cleared it. */
  todos?: Todos
  /** The tool its worker runs at this moment, which changes faster than any report. */
  tool?: { name: string; since: string }
}
export interface TasksView {
  /** The main Session's id: the dock belongs to the conversation of that Session and no other. */
  masterId: string
  /** The main Session's turn runs now. */
  active: boolean
  paused: boolean
  /** Executor Sessions an open ticket's worker may hold at once. */
  maxWorkers: number
  /** Open tickets whose worker holds a slot. */
  running: number
  /** Open tickets that wait for a person: a review, an answer, a blocked or failed worker, an undelivered input. */
  awaiting: number
  /** Open tickets waiting for a worker slot. */
  queued: number
  total: number
  /** Every open ticket, a running worker first, then what waits for a person, then the queue, newest first within a rank. */
  tasks: TaskView[]
  /** The tool the main Session runs now, which is what it is busy with between turns of its own. */
  masterTool?: { name: string; since: string }
  /** The main Session's child Sessions that no ticket owns, oldest first: what it started for itself. */
  children: readonly ChildSession[]
  /** The main Session's latest exchanges, oldest first: the operator's questions from the task canvas and the replies that ended its turns. */
  conversation: readonly Exchange[]
}
/** What the task views read: the open tickets, the main Session's state, the executor's live state, and each managed Session's last todo list. */
export interface TasksHost {
  readonly masterId: string
  readonly active: boolean
  readonly paused: boolean
  readonly maxWorkers: number
  /** Every open ticket, dismissed or not. */
  openTickets(): Ticket[]
  /** Whether `ticket`'s worker holds a worker slot now. */
  live(ticket: Ticket): boolean
  /** The todo list the Session last wrote, if it wrote one. */
  todos(sessionId: string): Todos | undefined
  /** The tool the Session runs now, with the moment it started, or undefined when it runs none. */
  tool(sessionId: string): { name: string; since: string } | undefined
  /**
   * Every child Session this plugin knows of — started by the main Session or by an executor — so the canvas can show which card
   * grew them. A ticket's executor is not one of them: a ticket runs its own top-level Session.
   */
  children(): readonly ChildSession[]
  /** The main Session's latest exchanges, oldest first. */
  conversation(): readonly Exchange[]
}

/**
 * Orders tasks as the operator reads them: a worker that runs now, then what waits for a person, then the queue, then a worker
 * between turns, then a ticket waiting for a Trigger.
 */
export function taskRank(task: { stage: string; action?: string; live: boolean }): number {
  if (task.stage === 'working' && task.action !== 'queued') return task.live ? 0 : 3
  if (task.stage === 'person') return 1
  if (task.stage === 'working') return 2
  return 4
}

/** Builds the task list: the open tickets that are not dismissed, ranked, newest first within a rank. */
export function tasksView(host: TasksHost): TasksView {
  const tasks = host.openTickets().filter(ticket => ticket.dismissed !== true)
    .map((ticket): TaskView => {
      const summary = ticketSummary(ticket), startedAt = latestAssignment(ticket)?.startedAt
      // Every started Assignment of a Ticket runs in its one shared worker Session.
      const todos = summary.sessionId ? host.todos(summary.sessionId) : undefined
      const tool = summary.sessionId ? host.tool(summary.sessionId) : undefined
      return { id: summary.id, title: summary.title, stage: summary.stage,
        ...'action' in summary ? { action: summary.action } : {}, ...'note' in summary ? { note: summary.note } : {},
        summary: summary.summary, sessionId: summary.sessionId, createdAt: summary.createdAt,
        ...startedAt ? { startedAt } : {}, updatedAt: summary.updatedAt, live: host.live(ticket),
        ...todos ? { todos } : {}, ...tool ? { tool } : {} }
    })
    .sort((one, other) => taskRank(one) - taskRank(other) || other.updatedAt.localeCompare(one.updatedAt))
  const count = (rank: number) => tasks.filter(task => taskRank(task) === rank).length
  const masterTool = host.tool(host.masterId)
  return { masterId: host.masterId, active: host.active, paused: host.paused, maxWorkers: host.maxWorkers,
    running: count(0), awaiting: count(1), queued: count(2), total: tasks.length, tasks,
    ...masterTool ? { masterTool } : {}, children: host.children(), conversation: host.conversation() }
}

/**
 * The message that carries the operator's question about one ticket from the task canvas to the main Session. It names the
 * ticket on the line the prompt tells the model to read, after a line that says who asks.
 */
export const operatorQuestion = (ticketId: string, title: string, question: string): string =>
  `The operator asks from the Superagent task canvas; answer here.\n${ticketLine(ticketId, title)}\n${question}`
