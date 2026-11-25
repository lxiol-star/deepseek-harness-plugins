/**
 * The task canvas: a page of its own where the main Session, its tickets and their workers lie as cards on a plane the operator
 * pans, zooms and rearranges, joined by lines that say which Session dispatched a ticket and which worker runs it. The Composer
 * card sends the operator's question to the main Session about the one ticket they tick. It reads `GET tasks` and writes only
 * through `POST tasks/:id/ask`, so the canvas holds no state of its own beyond where the operator put the cards.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { usePoll, type TaskView, type TasksView } from './api.ts'
import { Button, Icon, StateDot, Tag } from './controls.tsx'
import { dockDot, started, taskProgress } from './dock.tsx'
import { ticketMark } from './marks.ts'
import { useAction, usePanel } from './provider.tsx'
import { fullTime, when } from './text.ts'
import { StageMark } from './widgets.tsx'

/** A card's place on the plane, in the plane's own pixels. */
export interface Rect { x: number; y: number; w: number; h: number }
/** A file the operator attached, as the Host stored it; `preview` is a blob URL for an image, revoked when the file is dropped. */
export interface Attached { path: string; name: string; bytes: number; preview?: string }
/** The largest file the canvas offers to upload; the Host refuses more, and the panel says so before spending the upload. */
const ATTACH_MAX = 12 * 1024 * 1024
/** Reads a file as a data URL, which the Host accepts in place of plain base64. */
const dataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result ?? ''))
  reader.onerror = () => reject(reader.error ?? new Error('The file could not be read'))
  reader.readAsDataURL(file)
})
/** A byte count as a person reads it. */
export const fileSize = (bytes: number): string => bytes < 1024 ? `${bytes} B`
  : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
/** The key the lanes are measured under; a card's key never starts with it. */
const LANE = 'lane:'
/** What fitting the plane has to hold: the lanes when they are laid out, else the cards alone. */
export const frame = (rects: Record<string, Rect>): Rect[] => {
  const lanes = Object.entries(rects).filter(([id]) => id.startsWith(LANE)).map(([, rect]) => rect)
  return lanes.length ? lanes : Object.values(rects)
}
/** Where the plane sits in its viewport: `x` and `y` are the plane's origin, `scale` how much a plane pixel takes on screen. */
export interface View { x: number; y: number; scale: number }
/** How far the operator can zoom out and in. */
export const MIN_SCALE = 0.3, MAX_SCALE = 2
/** The storage key of the cards the operator moved. */
const LAYOUT = 'dsh-superagent.canvas.layout.v1'
/** How often the canvas reads the tasks. */
const POLL_MS = 2000
/** The lanes of the plane, left to right, each as wide as its cards. */
const LANE_WIDTH = 360, LANE_GAP = 80
const LANES = ['master', 'tasks', 'workers'] as const
/** The three cards that are not a ticket: the main Session, the Composer, and the note that no ticket is open. */
const MASTER = 'master', COMPOSER = 'composer', EMPTY = 'empty'

/**
 * The view that shows every rect with `padding` around it, centered in a viewport of `width` × `height`, never zoomed in past 1.
 * `reserve` is the height of what covers the top of the viewport (the legend): the rects are fitted into the part below it, so
 * what the plane holds is never under it.
 */
export function fitView(rects: readonly Rect[], width: number, height: number, padding = 48, reserve = 0): View {
  if (!rects.length || width <= padding * 2 || height - reserve <= padding * 2) return { x: 24, y: 24, scale: 1 }
  const left = Math.min(...rects.map(rect => rect.x)), top = Math.min(...rects.map(rect => rect.y))
  const right = Math.max(...rects.map(rect => rect.x + rect.w)), bottom = Math.max(...rects.map(rect => rect.y + rect.h))
  const room = height - reserve
  const scale = Math.max(MIN_SCALE, Math.min(1, (width - padding * 2) / (right - left), (room - padding * 2) / (bottom - top)))
  return { scale, x: (width - (right - left) * scale) / 2 - left * scale, y: reserve + (room - (bottom - top) * scale) / 2 - top * scale }
}
/** Zooms by `factor` about the viewport point (`px`, `py`), which stays where it is. */
export function zoomAbout(view: View, factor: number, px: number, py: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor)), ratio = scale / view.scale
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio }
}
/** The vertical edge a line leaves a card by, or arrives at it by. */
export type Side = 'left' | 'right'
/**
 * The curve that joins the `out` edge of `from` to the `in` edge of `to`. A line to a card that lies to the left leaves by the
 * left edge and arrives at the right, instead of bulging out and sweeping back through the cards between.
 *
 * The curve bends at most to the middle of the gap between the two edges, so it stays between them however close the cards are;
 * where the edges touch or overlap (a card the operator dragged onto another) it is a straight run, which cannot loop over a card.
 */
export function edgePath(from: Rect, to: Rect, fromShare = 0.5, toShare = 0.5, out: Side = 'right', into: Side = 'left'): string {
  const sx = out === 'right' ? from.x + from.w : from.x, sy = from.y + from.h * fromShare
  const tx = into === 'left' ? to.x : to.x + to.w, ty = to.y + to.h * toShare
  // Out of the right edge the line runs rightward (towards `to`), out of the left edge leftward; likewise as it arrives.
  const outward = out === 'right' ? 1 : -1, inward = into === 'left' ? 1 : -1
  const bend = Math.max(0, Math.min(40, (tx - sx) * outward / 2, (tx - sx) * inward / 2))
  return `M ${sx} ${sy} C ${sx + bend * outward} ${sy}, ${tx - bend * inward} ${ty}, ${tx} ${ty}`
}
/** The one rect that covers every rect, with `padding` around it. */
export function union(rects: readonly Rect[], padding = 0): Rect {
  const left = Math.min(...rects.map(rect => rect.x)), top = Math.min(...rects.map(rect => rect.y))
  return { x: left - padding, y: top - padding, w: Math.max(...rects.map(rect => rect.x + rect.w)) - left + padding * 2,
    h: Math.max(...rects.map(rect => rect.y + rect.h)) - top + padding * 2 }
}
/** The cards the operator moved last, by node; a storage that cannot be read moves none. */
export function readLayout(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): Record<string, { x: number; y: number }> {
  try {
    const value = JSON.parse(storage?.getItem(LAYOUT) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(value).filter(([, point]) => {
      const { x, y } = (point ?? {}) as { x?: unknown; y?: unknown }
      return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    })) as Record<string, { x: number; y: number }>
  } catch { return {} }
}
const same = (one: Record<string, Rect>, other: Record<string, Rect>): boolean => Object.keys(one).length === Object.keys(other).length
  && Object.entries(other).every(([id, rect]) => { const before = one[id]; return before && Math.abs(before.x - rect.x) < 0.5
    && Math.abs(before.y - rect.y) < 0.5 && Math.abs(before.w - rect.w) < 0.5 && Math.abs(before.h - rect.h) < 0.5 })

/** The page: the plane with its lanes, cards and lines, the legend, the zoom controls, the minimap and the bottom bar. */
export function CanvasPage({ intervalMs = POLL_MS }: { intervalMs?: number }) {
  const { t, call, notify, openSession } = usePanel()
  const { data, error, reload } = usePoll<TasksView>(() => call('GET tasks'), [call], intervalMs)
  const [selected, setSelected] = useState<string>()
  const [question, setQuestion] = useState('')
  const [sent, setSent] = useState(false)
  // The operator's files stay here until the message goes: each is already on disk, so a failed send loses no upload.
  const [files, setFiles] = useState<Attached[]>([])
  const [uploading, setUploading] = useState(0)
  const [fileNote, setFileNote] = useState<string>()
  // Set while a file is dragged over the Composer, so it shows where the file will land.
  const [dropping, setDropping] = useState(false)
  const picking = useRef<HTMLInputElement>(null)
  const previews = useRef<string[]>([])
  const [moved, setMoved] = useState(readLayout)
  const [view, setView] = useState<View>({ x: 24, y: 24, scale: 1 })
  const [rects, setRects] = useState<Record<string, Rect>>({})
  const [size, setSize] = useState({ w: 0, h: 0, top: 0 })
  const viewport = useRef<HTMLDivElement>(null)
  const pan = useRef<{ px: number; py: number; x: number; y: number } | undefined>(undefined)
  const drag = useRef<{ id: string; px: number; py: number; x: number; y: number } | undefined>(undefined)
  const layout = useRef(moved)
  layout.current = moved
  const fitted = useRef(0)
  /** Set once the operator pans, zooms or drags, which ends the automatic fitting of the plane to its cards. */
  const movedByHand = useRef(false)

  // Where each card lies on the plane, read back from the DOM once the cards and their offsets settle.
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const measure = () => {
      const box = element.getBoundingClientRect()
      const next: Record<string, Rect> = {}
      // The lanes are the plane's frame and the cards what lies in them: an empty lane (no ticket has an Executor yet) still
      // takes its place, so both are read, and the lanes decide what "fitting the plane" has to hold.
      for (const node of element.querySelectorAll<HTMLElement>('[data-node], .dt-canvas-lane')) {
        const rect = node.getBoundingClientRect()
        next[node.dataset.node ?? `lane:${node.querySelector('.dt-canvas-lane-title')?.textContent ?? ''}`] = {
          x: (rect.left - box.left - view.x) / view.scale, y: (rect.top - box.top - view.y) / view.scale,
          w: rect.width / view.scale, h: rect.height / view.scale }
      }
      // The legend lies over the top left of the viewport: fitting leaves its place free (and a little air below it).
      const legend = element.querySelector('.dt-canvas-legend')?.getBoundingClientRect()
      const top = legend && legend.height > 0 ? Math.ceil(legend.bottom - box.top) + 12 : 0
      setSize(previous => previous.w === box.width && previous.h === box.height && previous.top === top ? previous : { w: box.width, h: box.height, top })
      setRects(previous => same(previous, next) ? previous : next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
    // The view is read, not depended on: a card's place on the plane does not move when the plane does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, moved, selected, question, sent, t])

  // The first layout fills the viewport, and so does each later one that brings more cards into it: a plane fitted to the two
  // cards of an empty canvas would leave the tickets and the Executors below the fold once they arrive. Once the operator
  // moves or zooms the plane themselves it stays where they put it.
  const cards = Object.keys(rects).filter(id => !id.startsWith(LANE)).length
  const autoFit = useRef(true)
  useEffect(() => {
    if (!autoFit.current || size.w <= 0 || cards <= fitted.current) return
    fitted.current = cards
    setView(fitView(frame(rects), size.w, size.h, 48, size.top))
  }, [cards, size])
  // Any pan, zoom or drag of the operator's ends the automatic fitting.
  useEffect(() => { if (movedByHand.current && autoFit.current) autoFit.current = false }, [moved, view])

  // The wheel pans the plane; with ⌘ or Ctrl, or a trackpad pinch, it zooms about the pointer. Neither scrolls the page.
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      // A list or a text field inside a card scrolls itself: the plane takes the wheel only on its own background and cards.
      const target = event.target as HTMLElement | null
      const scrolls = target?.closest('[data-scroll]') ?? target?.closest('textarea, input, [contenteditable="true"]')
      if (scrolls && element.contains(scrolls) && !event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      movedByHand.current = true
      const box = element.getBoundingClientRect()
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-Math.max(-25, Math.min(25, event.deltaY)) * 0.01)
        setView(current => zoomAbout(current, factor, event.clientX - box.left, event.clientY - box.top))
      } else setView(current => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }))
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const fit = () => { autoFit.current = true; movedByHand.current = false; fitted.current = Object.keys(rects).length
    setView(fitView(frame(rects), size.w, size.h, 48, size.top)) }
  const tasks = data?.tasks ?? []
  const all = data?.conversation ?? []
  const recent = all.slice(-4).map((entry, index) => ({ entry, place: all.length - Math.min(4, all.length) + index }))
  // The newest answer is the one the operator asked for: the list follows it as it arrives, unless the operator has scrolled
  // up to read an older one (then it stays where they are).
  const thread = useRef<HTMLOListElement>(null)
  const following = useRef(true)
  useEffect(() => {
    const list = thread.current
    if (!list) return
    const onScroll = () => { following.current = list.scrollHeight - list.clientHeight - list.scrollTop < 8 }
    list.addEventListener('scroll', onScroll, { passive: true })
    return () => list.removeEventListener('scroll', onScroll)
  }, [])
  useLayoutEffect(() => {
    const list = thread.current
    if (list && following.current) list.scrollTop = list.scrollHeight
  }, [all.length, all[all.length - 1]?.at])
  const picked = tasks.find(task => task.id === selected)
  // With a ticket ticked the message is a question about it; with none it is what the operator states, which the main Session
  // may open a ticket from. Either way the files it names were written by this Host first.
  const ask = useAction(async (task: TaskView, text: string, paths: string[]) => {
    await call('POST tasks/:id/ask', { id: task.id, body: { question: text, ...paths.length ? { files: paths } : {} } })
  }, { reload })
  const say = useAction(async (text: string, paths: string[]) => {
    await call('POST session/say', { body: { text, ...paths.length ? { files: paths } : {} } })
  }, { reload })
  const dropFiles = () => setFiles(current => { for (const file of current) if (file.preview) URL.revokeObjectURL(file.preview); return [] })
  // A file is uploaded as it is picked, so the message that names it is written before it is sent and a slow upload never
  // holds the operator's text back.
  const attach = async (chosen: readonly File[]) => {
    if (chosen.length === 0) return
    setUploading(count => count + chosen.length)
    for (const file of chosen) {
      try {
        if (file.size > ATTACH_MAX) { setFileNote(t('canvas.fileTooLarge', { name: file.name, max: fileSize(ATTACH_MAX) })); continue }
        const uploaded = await call('POST uploads', { body: { name: file.name, data: await dataUrl(file) } })
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
        if (preview) previews.current.push(preview)
        setFiles(current => [...current, { ...uploaded, ...preview ? { preview } : {} }])
        setFileNote(undefined); setSent(false)
      } catch (failure) {
        setFileNote(t('canvas.attachFailed', { reason: failure instanceof Error ? failure.message : String(failure) }))
      } finally { setUploading(count => count - 1) }
    }
  }
  const drop = (path: string) => {
    setFiles(current => {
      const gone = current.find(file => file.path === path)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
      return current.filter(file => file.path !== path)
    })
  }
  // The blob URLs the previews use are released when the plane goes away.
  useEffect(() => () => { for (const url of previews.current) URL.revokeObjectURL(url) }, [])
  const send = async () => {
    const text = question.trim()
    if (!text || ask.busy || say.busy || uploading > 0) return
    const paths = files.map(file => file.path)
    const ok = picked ? await ask.run(picked, text, paths) : await say.run(text, paths)
    if (!ok) return
    setQuestion(''); setSelected(undefined); setSent(true); setFileNote(undefined); dropFiles()
    notify(t('canvas.sent'))
  }
  const submit = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void send()
  }
  /** Pressing a card's title moves that card; pressing anywhere else in the card is a click on what is there. */
  const handle = (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      // A click alone is not a move: nothing is stored until the pointer has actually travelled.
      const before = layout.current[id] ?? { x: 0, y: 0 }
      drag.current = { id, px: event.clientX, py: event.clientY, x: before.x, y: before.y }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const start = drag.current
      if (!start || start.id !== id) return
      movedByHand.current = true
      setMoved(previous => ({ ...previous, [id]: { x: start.x + (event.clientX - start.px) / view.scale,
        y: start.y + (event.clientY - start.py) / view.scale } }))
    },
    onPointerUp: () => {
      if (!drag.current) return
      drag.current = undefined
      // Keep only the cards that exist now, so tickets long ended do not pile up.
      const ids = new Set([MASTER, COMPOSER, ...tasks.flatMap(task => [`task:${task.id}`, ...task.sessionId ? [`worker:${task.sessionId}`] : []])])
      const kept = Object.fromEntries(Object.entries(layout.current).filter(([id]) => ids.has(id)))
      try { globalThis.localStorage?.setItem(LAYOUT, JSON.stringify(kept)) } catch { /* a storage that cannot be written keeps the layout for this mount */ }
    },
    // A cancelled pointer (a window switch, a system gesture) ends the drag as a release does.
    onPointerCancel: () => { drag.current = undefined },
  })
  const place = (id: string) => {
    const point = moved[id]
    return point ? { transform: `translate(${point.x}px, ${point.y}px)` } : undefined
  }
  const stop = (event: ReactPointerEvent) => event.stopPropagation()
  const node = (id: string): Rect | undefined => rects[id]
  const screen = (rect: Rect): Rect => ({ x: rect.x * view.scale + view.x, y: rect.y * view.scale + view.y,
    w: rect.w * view.scale, h: rect.h * view.scale })
  const lines = (() => {
    const out: { id: string; kind: 'dispatch' | 'run' | 'ask'; d: string; label?: { text: string; x: number; y: number } }[] = []
    const join = (id: string, kind: 'dispatch' | 'run' | 'ask', from: string, to: string, fromShare: number, toShare: number, label?: string) => {
      const a = node(from), b = node(to)
      if (!a || !b) return
      // The line leaves `from` towards `to`: by its right edge when `to` lies to the right, by its left edge otherwise.
      // The line leaves `from` by the edge that faces `to`: its right edge when `to` lies to the right, its left edge otherwise.
      const rightward = b.x + b.w / 2 >= a.x + a.w / 2
      const d = edgePath(screen(a), screen(b), fromShare, toShare, rightward ? 'right' : 'left', rightward ? 'left' : 'right')
      const at = curveMiddle(d)
      out.push({ id, kind, d, ...label ? { label: { text: label, ...at } } : {} })
    }
    for (const task of tasks) join(`dispatch:${task.id}`, 'dispatch', MASTER, `task:${task.id}`, 0.5, 0.3)
    for (const task of tasks) if (task.sessionId) join(`run:${task.id}`, 'run', `task:${task.id}`, `worker:${task.sessionId}`, 0.5, 0.5, t('canvas.edge.runLabel'))
    if (picked) join('ask', 'ask', `task:${picked.id}`, COMPOSER, 0.7, 0.5, t('canvas.edge.askLabel'))
    return out
  })()
  const cardsOf = Object.entries(rects).filter(([id]) => !id.startsWith(LANE)) as [string, Rect][]
  const lanesOf = Object.entries(rects).filter(([id]) => id.startsWith(LANE)) as [string, Rect][]
  const cover = Object.values(rects)
  const mini = cover.length ? fitInto(union(cover, 24), 176, 112) : undefined
  const needs = tasks.find(task => task.stage === 'person')
  const openMaster = () => { if (data) openSession(data.masterId).catch(failure => notify(failure instanceof Error ? failure.message : String(failure))) }

  return <div ref={viewport} className="dt-canvas" style={{ backgroundSize: `${20 * view.scale}px ${20 * view.scale}px`,
    backgroundPosition: `${view.x}px ${view.y}px` }} aria-label={t('canvas.title')}
    onPointerDown={event => {
      if (event.button !== 0) return
      pan.current = { px: event.clientX, py: event.clientY, x: view.x, y: view.y }
      event.currentTarget.setPointerCapture(event.pointerId)
    }}
    onPointerMove={event => {
      const start = pan.current
      if (!start) return
      movedByHand.current = true
      setView({ scale: view.scale, x: start.x + event.clientX - start.px, y: start.y + event.clientY - start.py })
    }}
    onPointerUp={() => { pan.current = undefined }} onPointerCancel={() => { pan.current = undefined }}>
    <div className="dt-canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      <section className="dt-canvas-lane" style={{ left: 0, width: LANE_WIDTH }}><h2 className="dt-canvas-lane-title">{t('canvas.lane.master')}</h2>
        <div className="dt-canvas-stack">
          <article className="dt-canvas-card" data-node={MASTER} style={place(MASTER)} onPointerDown={stop}>
            <header className="dt-canvas-card-head">
              <h3 className="dt-canvas-card-title dt-canvas-handle" tabIndex={0} {...handle(MASTER)}><Icon name="session" size={14} />{t('canvas.master')}</h3>
              <StateDot state={data?.active ? 'ongoing' : 'idle'} />
              <span className="dt-canvas-state">{t(data?.active ? 'canvas.masterActive' : 'canvas.masterIdle')}</span>
            </header>
            {data && <p className="dt-canvas-meta">{t('canvas.masterLoad', { total: String(data.total), awaiting: String(data.awaiting) })}</p>}
            <h4 className="dt-canvas-subhead">{t('canvas.conversation')}</h4>
            <ol ref={thread} className="dt-canvas-thread" data-scroll>
              {recent.map(({ entry, place }) => <li key={`${entry.at}:${place}`} data-role={entry.role}>
                <span className="dt-canvas-speaker">{t(entry.role === 'operator' ? 'canvas.operator' : 'canvas.master')}
                  <time dateTime={entry.at} title={fullTime(entry.at, t('lang'))}>{when(entry.at, t('lang'))}</time></span>
                <span className="dt-canvas-clamp">{entry.text}</span>
                {entry.files?.length ? <span className="dt-canvas-files-line">{t('canvas.filesLine', { count: String(entry.files.length) })}</span> : undefined}
              </li>)}
              {!data?.conversation.length && <li className="dt-canvas-quiet">{t('canvas.noReply')}</li>}
            </ol>
            <footer className="dt-canvas-card-foot">
              <Button variant="ghost" size="sm" icon={<Icon name="session" size={14} />}
                disabled={!data} onClick={openMaster}>
                {t('canvas.openConversation')}</Button>
            </footer>
          </article>
          <article className="dt-canvas-card" data-node={COMPOSER} style={place(COMPOSER)} onPointerDown={stop}
            data-picked={picked || files.length > 0 || question.trim() ? '1' : undefined}
            data-drop={dropping ? '1' : undefined}
            onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDropping(true) } }}
            onDragLeave={() => setDropping(false)}
            onDrop={event => { event.preventDefault(); setDropping(false); void attach([...event.dataTransfer.files]) }}>
            <header className="dt-canvas-card-head">
              <h3 className="dt-canvas-card-title dt-canvas-handle" tabIndex={0} {...handle(COMPOSER)}><Icon name="message" size={14} />{t('canvas.composer')}</h3>
            </header>
            <p className="dt-canvas-composer-about" data-none={picked ? undefined : '1'} title={picked?.title}>
              {picked ? t('canvas.composerAbout', { title: picked.title }) : t('canvas.composerNone')}</p>
            <div className="dt-canvas-composer-row">
              <Button variant="ghost" size="sm" icon={<Icon name="plus" size={14} />} aria-label={t('canvas.attach')} title={t('canvas.attach')}
                disabled={!data || uploading > 0} onClick={() => picking.current?.click()}>{t('canvas.attach')}</Button>
              <input ref={picking} type="file" multiple className="dt-canvas-picker" aria-label={t('canvas.attach')}
                onChange={event => { const chosen = [...event.target.files ?? []]; event.target.value = ''; void attach(chosen) }} />
            </div>
            <textarea className="dt-canvas-composer-input" rows={4} value={question} placeholder={t('canvas.placeholder')} aria-label={t('canvas.composer')}
              onChange={event => { setQuestion(event.target.value); setSent(false) }} onKeyDown={submit}
              onPaste={event => { const pasted = [...event.clipboardData?.files ?? []]; if (pasted.length > 0) void attach(pasted) }} />
            {files.length > 0 && <ul className="dt-canvas-files">
              {files.map(file => <li key={file.path} className="dt-canvas-file">
                {file.preview ? <img className="dt-canvas-file-preview" src={file.preview} alt="" /> : undefined}
                <span className="dt-canvas-file-name" title={file.name}>{file.name}</span>
                <span className="dt-canvas-quiet">{fileSize(file.bytes)}</span>
                <Button variant="ghost" size="sm" aria-label={t('canvas.removeFile', { name: file.name })} title={t('canvas.removeFile', { name: file.name })}
                  onClick={() => { drop(file.path); setSent(false) }}><Icon name="close" size={12} /></Button>
              </li>)}
            </ul>}
            {uploading > 0 && <p className="dt-canvas-quiet" role="status">{t('canvas.uploading', { count: String(uploading) })}</p>}
            {fileNote && <p className="dt-canvas-quiet" role="status">{fileNote}</p>}
            <p className="dt-canvas-quiet" role="status">{sent ? t('canvas.sent') : picked ? t('canvas.composerNote') : t('canvas.composerNoteBare')}</p>
            <footer className="dt-canvas-card-foot">
              <Button variant="ghost" size="sm" disabled={!data} onClick={openMaster}>
                {t('canvas.openConversation')}</Button>
              <Button variant="primary" size="sm" disabled={!question.trim() || ask.busy || say.busy || uploading > 0}
                onClick={() => { void send() }}>{t('canvas.send')}</Button>
            </footer>
          </article>
        </div>
      </section>
      <section className="dt-canvas-lane" style={{ left: LANE_WIDTH + LANE_GAP, width: LANE_WIDTH }}><h2 className="dt-canvas-lane-title">{t('canvas.lane.tasks')}</h2>
        <div className="dt-canvas-stack">
          {tasks.map((task, index) => {
            const id = `task:${task.id}`, mark = ticketMark(t, task), on = task.id === selected, progress = taskProgress(t, task)
            return <article key={task.id} className="dt-canvas-card" data-node={id} data-tone={mark.tone} data-picked={on ? '1' : undefined}
              style={place(id)} onPointerDown={stop}>
              <header className="dt-canvas-card-head">
                <input type="checkbox" className="dt-canvas-check" checked={on} aria-label={t('dock.select', { title: task.title })}
                  onChange={() => { setSelected(on ? undefined : task.id); setSent(false) }} />
                <h3 className="dt-canvas-card-title dt-canvas-handle" title={task.title} tabIndex={0} {...handle(id)}>{index + 1}. {task.title}</h3>
                <StageMark state={mark.dot} icon={mark.icon} label={mark.label} />
              </header>
              {(progress.text || progress.ratio) && <p className="dt-canvas-progress">
                {progress.ratio && <b className="dt-canvas-ratio">{progress.ratio}</b>}<span className="dt-canvas-clamp" title={progress.text}>{progress.text}</span>
              </p>}
              <p className="dt-canvas-meta">
                {task.stage === 'working' && task.action !== 'queued' && <span className="dt-canvas-live"><StateDot state={task.live ? 'ongoing' : 'idle'} />
                  {t(task.live ? 'dock.live' : 'dock.idle')}</span>}
                <time dateTime={started(task)} title={t('dock.started', { time: fullTime(started(task), t('lang')) })}>{when(started(task), t('lang'))}</time>
              </p>
            </article>
          })}
          {!tasks.length && <article className="dt-canvas-card dt-canvas-card-quiet" data-node={EMPTY} onPointerDown={stop}>
            <p className="dt-canvas-quiet">{t('canvas.empty')}</p>
            <Button variant="outline" size="sm" disabled={!data} onClick={openMaster}>
              {t('canvas.openConversation')}</Button>
          </article>}
        </div>
      </section>
      <section className="dt-canvas-lane" style={{ left: (LANE_WIDTH + LANE_GAP) * 2, width: LANE_WIDTH }}><h2 className="dt-canvas-lane-title">{t('canvas.lane.workers')}</h2>
        <div className="dt-canvas-stack">
          {tasks.filter(task => task.sessionId).map(task => {
            const id = `worker:${task.sessionId}`
            return <article key={id} className="dt-canvas-card" data-node={id} style={place(id)} onPointerDown={stop}>
              <header className="dt-canvas-card-head">
                <h3 className="dt-canvas-card-title dt-canvas-handle" tabIndex={0} {...handle(id)}><Icon name="running" size={14} />{t('canvas.worker')}</h3>
                <StateDot state={task.live ? 'ongoing' : 'idle'} />
              </header>
              <p className="dt-canvas-clamp" title={task.title}>{t('canvas.workerOf', { title: task.title })}</p>
              <p className="dt-canvas-meta">{t(task.live ? 'dock.live' : 'dock.idle')}</p>
              <footer className="dt-canvas-card-foot">
                <Button variant="ghost" size="sm" icon={<Icon name="session" size={14} />}
                  onClick={() => { openSession(task.sessionId ?? '').catch(failure => notify(failure instanceof Error ? failure.message : String(failure))) }}>
                  {t('dock.openWorker')}</Button>
              </footer>
            </article>
          })}
        </div>
      </section>
    </div>
    <svg className="dt-canvas-edges" width={size.w} height={size.h} aria-hidden="true">
      <defs>
        <marker id="dt-canvas-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker>
        <marker id="dt-canvas-arrow-ask" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker>
      </defs>
      {lines.map(line => <g key={line.id} className="dt-canvas-line" data-kind={line.kind}>
        <path className="dt-canvas-edge" d={line.d} markerEnd={line.kind === 'ask' ? 'url(#dt-canvas-arrow-ask)' : 'url(#dt-canvas-arrow)'} />
        {line.label && <text className="dt-canvas-edge-label" x={line.label.x} y={line.label.y - 5}>{line.label.text}</text>}
      </g>)}
    </svg>
    <aside className="dt-canvas-legend" onPointerDown={stop}>
      <h2 className="dt-canvas-legend-title">{t('canvas.legend')}</h2>
      <ul>
        <li><svg width="28" height="8" aria-hidden="true"><path className="dt-canvas-edge" d="M1 4 H21" markerEnd="url(#dt-canvas-arrow)" /></svg>{t('canvas.edge.dispatch')}</li>
        <li><svg width="28" height="8" aria-hidden="true"><path className="dt-canvas-edge" d="M1 4 H21" markerEnd="url(#dt-canvas-arrow)" /></svg>{t('canvas.edge.run')}</li>
        <li><svg width="28" height="8" aria-hidden="true"><path className="dt-canvas-edge dt-canvas-edge-ask" d="M1 4 H21" markerEnd="url(#dt-canvas-arrow-ask)" /></svg>{t('canvas.edge.ask')}</li>
      </ul>
      <p className="dt-canvas-quiet">{t('canvas.hint')}</p>
    </aside>
    <div className="dt-canvas-tools" role="group" onPointerDown={stop} aria-label={t('canvas.fit')}>
      <button type="button" className="dt-canvas-tool" title={t('canvas.zoomIn')} aria-label={t('canvas.zoomIn')}
        onClick={() => { movedByHand.current = true; setView(current => zoomAbout(current, 1.25, size.w / 2, size.h / 2)) }}><Icon name="plus" size={14} /></button>
      <button type="button" className="dt-canvas-tool" title={t('canvas.zoomOut')} aria-label={t('canvas.zoomOut')}
        onClick={() => { movedByHand.current = true; setView(current => zoomAbout(current, 0.8, size.w / 2, size.h / 2)) }}><Icon name="minus" size={14} /></button>
      <button type="button" className="dt-canvas-tool" title={t('canvas.fit')} aria-label={t('canvas.fit')} onClick={fit}><Icon name="fullscreen" size={14} /></button>
    </div>
    <p className="dt-canvas-load" role="status" onPointerDown={stop}>{error ? undefined : data && t('canvas.workers', { running: String(data.running), max: String(data.maxWorkers) })}</p>
    {mini && <div className="dt-canvas-minimap" role="button" tabIndex={0} aria-label={t('canvas.minimap')} onPointerDown={stop}
      onClick={event => {
        const box = event.currentTarget.getBoundingClientRect(), inside = union(cover, 24)
        setView({ scale: view.scale, x: size.w / 2 - ((event.clientX - box.left - mini.x) / mini.scale + inside.x) * view.scale,
          y: size.h / 2 - ((event.clientY - box.top - mini.y) / mini.scale + inside.y) * view.scale })
      }}>
      {lanesOf.map(([id, rect]) => <span key={id} className="dt-canvas-mini-lane"
        style={{ left: rect.x * mini.scale + mini.x, top: rect.y * mini.scale + mini.y, width: rect.w * mini.scale, height: rect.h * mini.scale }} />)}
      {cardsOf.map(([id, rect]) => <span key={id} className="dt-canvas-mini-node" data-picked={id === `task:${selected}` ? '1' : undefined}
        style={{ left: rect.x * mini.scale + mini.x, top: rect.y * mini.scale + mini.y, width: rect.w * mini.scale, height: rect.h * mini.scale }} />)}
      <span className="dt-canvas-mini-view" style={{ left: (-view.x / view.scale) * mini.scale + mini.x, top: (-view.y / view.scale) * mini.scale + mini.y,
        width: (size.w / view.scale) * mini.scale, height: (size.h / view.scale) * mini.scale }} />
    </div>}
    <nav className="dt-canvas-bar" aria-label={t('canvas.title')} onPointerDown={stop}>
      <span className="dt-canvas-bar-title">{t('canvas.title')}</span>
      <span className="dt-canvas-bar-lanes">{LANES.map(lane => t(`canvas.lane.${lane}`)).join(' / ')}</span>
      {error && <span className="dt-error" role="alert">{error.message}</span>}
      {data && data.paused && <Tag tone="quiet">{t('dock.paused')}</Tag>}
      {data && <span className="dt-canvas-bar-sum"><StateDot state={dockDot(tasks)} />{t('canvas.needsYou', { count: String(data.awaiting) })}</span>}
      <Button variant="ghost" size="sm" disabled={!needs} onClick={() => { setSelected(needs?.id); setSent(false) }}>{t('canvas.pickNeed')}</Button>
    </nav>
  </div>
}
/** How `inside` fits a box of `width` × `height`: where it starts, and how much of a plane pixel a box pixel is. */
function fitInto(inside: Rect, width: number, height: number): { x: number; y: number; scale: number } {
  const scale = Math.min(width / inside.w, height / inside.h)
  return { scale, x: (width - inside.w * scale) / 2 - inside.x * scale, y: (height - inside.h * scale) / 2 - inside.y * scale }
}
/** The middle of a cubic curve's path, where its label sits: a cubic bends within its ends, and its middle reads beside them. */
export function curveMiddle(path: string): { x: number; y: number } {
  const [sx, sy, c1x, c1y, c2x, c2y, tx, ty] = path.match(/-?[\d.]+/g)!.map(Number)
  // The point at t = 1/2 of a cubic Bézier.
  return { x: (sx! + 3 * c1x! + 3 * c2x! + tx!) / 8, y: (sy! + 3 * c1y! + 3 * c2y! + ty!) / 8 }
}
