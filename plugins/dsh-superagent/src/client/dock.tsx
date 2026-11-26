/**
 * The task dock above the main Session's composer: every open ticket with its stage and progress, their number in a collapsed
 * pill, and a question box for the one the operator ticks. It reads `GET tasks` and writes nothing of its own: a question goes
 * into the composer and is sent the way the Send button sends it, so the main Session answers it as a turn of the operator.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ticketLine } from '../core/questions.ts'
import { caller, usePoll, type TaskView, type TasksView } from './api.ts'
import STYLES from './client.css?raw'
import { Button, Icon, Input, StateDot, Tag, type DotState } from './controls.tsx'
import { ticketMark, toolText } from './marks.ts'
import { messages } from './provider.tsx'
import { errorText, fullTime, readableMarkers, when, type T } from './text.ts'
import { StageMark } from './widgets.tsx'

/**
 * The public actions over the composer that DeepSeek Harness 0.2.2-rc.5 passes every entry of `conversation.input.dock`
 * (`InputActions`); each is optional here, because the dock reads them defensively from the slot rather than from a typed import.
 */
export interface DockInputActions {
  /** A revision-guarded copy of the editor selection, the handle `insertText` inserts at. */
  captureInsertion?: () => unknown
  /** Inserts plain text in one undo step; false when the draft changed or submission locked the editor. */
  insertText?: (text: string, span: unknown) => boolean
  /** Replaces the whole draft with plain text. */
  setDraft?: (text: string) => void
  /** Enters submission, as the Send button does. */
  submit?: () => void
}
/** The composer state the dock reads before it writes to the draft. */
export interface DockInput { draft: string; attachmentIds: readonly unknown[]; phase: string }
/**
 * What the dock slot passes this entry: the Session it sits in, its composer, and the public actions over that composer. The
 * slot also provides `useInput`, a selector hook over the live input machine: the snapshot in `input` is fresh on every
 * keystroke or not as the host decides, so the state is read from the hook when the slot has one.
 */
export interface DockSlotProps { sessionId: string; input?: DockInput; inputActions?: DockInputActions; useInput?: UseInput }
/**
 * The slot's `useInput`, a React hook over the live input machine: `useInput(state => state)` in a component's body returns the
 * state as of this render and renders the component again when it changes. Like any hook it is not callable from an event
 * handler, and it takes the selector: the built-in input bar reads it as `useInput(s => s)`.
 */
export type UseInput = <T>(select: (state: DockInput) => T) => T

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * The full-width entries above a conversation's composer card, which `dsh-client-ui-conversation` declares since DeepSeek
     * Harness 0.2.2-rc.5.
     */
    'conversation.input.dock': { kind: 'list'; scope: 'session'; owner: DockSlotProps }
  }
}

/** What stands in for the slot's input hook where there is none: it reads nothing, and is called as often as the real one. */
const NO_INPUT_HOOK = (_select: (state: DockInput) => DockInput): DockInput | undefined => undefined

/**
 * How many cards the dock lists; the rest are counted. The canvas shows every ticket. Declared here and not imported
 * from the host's view: that module reads the store, and none of that belongs in the browser bundle.
 */
const DOCK_TASKS = 12

/** The storage key and value that remember a collapsed dock across Sessions and reloads. */
const COLLAPSED = 'dsh-superagent.dock.collapsed'
/** How often the dock reads the task list; a hidden page polls six times more slowly. */
const POLL_MS = 2000
/** How often the relative start time of a task is re-read, between two unchanged polls. */
const TICK_MS = 30_000
/** How long a refusal to ask stays visible before it clears itself. */
const NOTICE_MS = 6000

/** Whether the operator collapsed the dock, as they last left it; a storage that cannot be read leaves it expanded. */
export function readCollapsed(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): boolean {
  try { return storage?.getItem(COLLAPSED) === '1' } catch { return false }
}

/** The message the main Session receives for a question about one ticket: a first line naming the ticket, then the question. */
export const taskQuestion = (ticketId: string, title: string, question: string): string => `${ticketLine(ticketId, title)}\n${question}`

export type AskOutcome = 'sent' | 'unsupported' | 'unknown' | 'draftBusy' | 'sending' | 'busy' | 'changed'
/** The composer phases in which the operator's own submission is under way, and a question must wait. */
const SUBMITTING = new Set(['submitting', 'sending'])
/**
 * Puts `text` into the composer and submits it, as the Send button does. Nothing is sent while the composer holds a draft of
 * the operator's, or an attachment of theirs, or is busy with a submission or a command of theirs; and nothing is sent while
 * its state is unknown, because an unknown composer may hold a draft.
 * @param input - the composer's state read now, or undefined when it could not be read.
 */
export function askThroughComposer(input: DockInput | undefined, actions: DockInputActions | undefined, text: string): AskOutcome {
  const insert = actions?.captureInsertion && actions.insertText
  if (!actions?.submit || !(insert || actions.setDraft)) return 'unsupported'
  if (!input) return 'unknown'
  if (input.draft.trim() !== '' || input.attachmentIds.length > 0) return 'draftBusy'
  if (SUBMITTING.has(input.phase)) return 'sending'
  if (input.phase !== 'plain') return 'busy'
  if (insert) { if (!actions.insertText!(text, actions.captureInsertion!())) return 'changed' } else actions.setDraft!(text)
  actions.submit()
  return 'sent'
}

/** The one dot that summarizes a task list: what failed, then what else waits for a person, then what runs, then nothing. */
export function dockDot(tasks: readonly Pick<TaskView, 'stage' | 'action' | 'live'>[]): DotState {
  if (tasks.some(task => task.stage === 'person' && (task.action === 'failed' || task.action === 'delivery'))) return 'error'
  if (tasks.some(task => task.stage === 'person')) return 'warning'
  if (tasks.some(task => task.stage === 'working' && (task.live || task.action !== 'queued'))) return 'ongoing'
  return 'idle'
}

/** What a task's progress line says: what waits for the person, else the worker's checklist, else its latest report. */
export function taskProgress(t: T, task: Pick<TaskView, 'stage' | 'note' | 'todos' | 'summary'>): { ratio?: string; text: string } {
  if (task.stage === 'person' && task.note) return { text: readableMarkers(t, task.note.text) }
  if (task.todos && task.todos.total > 0) return { ratio: `${task.todos.done}/${task.todos.total}`, text: task.todos.current }
  return { text: task.summary ?? '' }
}
/** The moment a task's progress counts from: when its worker started, else when the ticket opened. */
export const started = (task: TaskView): string => task.startedAt ?? task.createdAt
/** Whether a ticket has a worker whose state is worth naming: one that was assigned, and is not waiting for a slot. */
const hasWorker = (task: TaskView): boolean => task.stage === 'working' && task.action !== 'queued'

export interface TaskDockProps extends DockSlotProps {
  t: T
  /** Opens a worker's Session in the Workspace UI. */
  openSession: (sessionId: string) => Promise<void>
  /** Opens the Superagent panel, which lists every ticket. */
  openPanel: () => void
  intervalMs?: number
}

/** The dock of the main Session: nothing in any other Session, and nothing while no ticket is open. */
export function TaskDock({ t, sessionId, input, inputActions, useInput, openSession, openPanel, intervalMs = POLL_MS }: TaskDockProps) {
  const copy = useRef(t)
  copy.current = t
  // The composer's state as of this render, read the way the built-in input bar reads it: the hook is called here, in the body,
  // with its selector, and the dock renders again whenever the composer changes. A slot without the hook gets a stand-in that is
  // called just as often, since the number of hooks a component calls must not change between renders.
  const composerNow: DockInput | undefined = (useInput ?? NO_INPUT_HOOK)(state => state) ?? input
  const { data, error } = usePoll<TasksView>(() => caller(() => messages(copy.current))('GET tasks'), [], intervalMs)
  const [collapsed, setCollapsed] = useState(() => readCollapsed())
  const [selected, setSelected] = useState<string>()
  const [question, setQuestion] = useState('')
  const [notice, setNotice] = useState<string>()
  const [tick, setTick] = useState(0)
  useEffect(() => { const timer = setInterval(() => setTick(now => now + 1), TICK_MS); return () => clearInterval(timer) }, [])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(undefined), NOTICE_MS); return () => clearTimeout(timer) },
    [notice])
  // Only the main Session shows the dock: the tasks are its tickets, and a question here is a turn of that Session.
  const shown = data && data.masterId === sessionId ? data : undefined
  if (!shown || shown.total === 0) return null

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try { globalThis.localStorage?.setItem(COLLAPSED, next ? '1' : '0') } catch { /* a storage that cannot be written keeps the dock as it is for this mount */ }
  }
  // The dock lists the first `DOCK_TASKS` and counts the rest; the canvas shows every one.
  const listed = shown.tasks.slice(0, DOCK_TASKS), omitted = shown.tasks.length - listed.length
  const picked = listed.find(task => task.id === selected)
  const ask = (event: FormEvent) => {
    event.preventDefault()
    if (!picked) return
    const text = question.trim()
    if (!text) return
    const outcome = askThroughComposer(composerNow, inputActions, taskQuestion(picked.id, picked.title, text))
    if (outcome !== 'sent') { setNotice(t(`dock.${outcome}`)); return }
    setQuestion('')
    setSelected(undefined)
    setNotice(undefined)
  }
  const counts = ([[shown.running, 'dock.running'], [shown.awaiting, 'dock.awaiting'], [shown.queued, 'dock.queued']] as const)
    .filter(([count]) => count > 0)
  return <section className="dt-dock" data-collapsed={collapsed ? '1' : undefined} data-tick={tick} aria-label={t('dock.title')}>
    <style>{STYLES}</style>
    <div className="dt-dock-head">
      <button type="button" className="dt-dock-toggle" aria-expanded={!collapsed} aria-label={t(collapsed ? 'dock.expand' : 'dock.collapse')}
        title={error ? errorText(error) : undefined} onClick={toggle}>
        <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={14} />
        <span className="dt-dock-title">{t('dock.title')}</span>
        <StateDot state={dockDot(shown.tasks)} />
        <span className="dt-dock-count">{shown.total}</span>
      </button>
      {!collapsed && <>
        <span className="dt-dock-summary">{counts.map(([count, key]) => <span key={key}>{t(key, { count: String(count) })}</span>)}
          {omitted > 0 && <span>{t('dock.omitted', { count: String(omitted) })}</span>}</span>
        <span className="dt-dock-hint">{t('dock.hint')}</span>
        <span className="dt-dock-spacer" />
        {shown.paused && <Tag tone="quiet">{t('dock.paused')}</Tag>}
        <Button variant="ghost" size="sm" onClick={openPanel}>{t('dock.openCanvas')}<Icon name="chevron-right" size={12} /></Button>
      </>}
    </div>
    {!collapsed && <ul className="dt-dock-list">
      {listed.map((task, index) => {
        const mark = ticketMark(t, task), on = task.id === selected, progress = taskProgress(t, task), start = started(task)
        return <li key={task.id} className="dt-dock-card" data-tone={mark.tone} data-selected={on ? '1' : undefined}>
          <div className="dt-dock-top">
            <input type="checkbox" className="dt-dock-check" checked={on} aria-label={t('dock.select', { title: task.title })}
              onChange={() => { setSelected(on ? undefined : task.id); setNotice(undefined) }} />
            <span className="dt-dock-name" title={task.title}>{index + 1}. {task.title}</span>
            <StageMark state={task.live && mark.dot === 'ongoing' ? 'ongoing' : mark.dot} icon={mark.icon} label={mark.label} />
          </div>
          {(progress.text || progress.ratio) && <div className="dt-dock-line">
            {progress.ratio && <span className="dt-dock-ratio">{progress.ratio}</span>}
            <span className="dt-dock-ellipsis" title={progress.text}>{progress.text}</span>
          </div>}
          {task.tool && <div className="dt-dock-tool"><StateDot state="ongoing" />{toolText(t, task.tool)}</div>}
          <div className="dt-dock-meta">
            {hasWorker(task) && <span className="dt-dock-live"><StateDot state={task.live ? 'ongoing' : 'idle'} />
              {t(task.live ? 'dock.live' : 'dock.idle')}</span>}
            <time dateTime={start} title={t('dock.started', { time: fullTime(start, t('lang')) })}>{when(start, t('lang'))}</time>
            {task.sessionId && <button type="button" className="dt-dock-open"
              onClick={() => { openSession(task.sessionId).catch(failure => setNotice(errorText(failure))) }}>{t('dock.openWorker')}</button>}
          </div>
        </li>
      })}
    </ul>}
    {!collapsed && picked && <form className="dt-dock-ask" onSubmit={ask}>
      <span className="dt-dock-target" title={picked.title}>{t('dock.askAbout', { title: picked.title })}</span>
      <Input className="dt-dock-question" aria-label={t('dock.askAbout', { title: picked.title })} placeholder={t('dock.askPlaceholder')}
        value={question} onChange={event => setQuestion(event.target.value)} autoFocus />
      <Button variant="primary" size="sm" type="submit" disabled={!question.trim()}>{t('dock.ask')}</Button>
      <Button variant="ghost" size="sm" onClick={() => { setSelected(undefined); setQuestion(''); setNotice(undefined) }}>{t('cancel')}</Button>
      {notice && <span className="dt-dock-notice" role="status">{notice}</span>}
    </form>}
  </section>
}
