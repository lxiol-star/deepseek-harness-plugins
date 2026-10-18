/**
 * React binding helpers.
 *
 * The panel consumes plain observable sources and writes no state of its own,
 * so a single `useSyncExternalStore` wrapper covers every data source and the
 * ticker covers the one thing that must advance without a push: elapsed time.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReadonlyStore } from './store.ts'

/** Translate one dictionary key, interpolating `{name}` placeholders. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * Subscribe to a projection of a store.
 *
 * The selected value is cached so a selector that builds a fresh object on
 * every read cannot make `useSyncExternalStore` loop.
 */
export function useSnapshot<T, S>(
  source: ReadonlyStore<T>,
  selector: (value: T) => S,
  equal?: ((left: S, right: S) => boolean) | undefined,
): S {
  const cache = useRef<{ value: S } | null>(null)
  const get = useCallback((): S => {
    const next = selector(source.getSnapshot())
    const previous = cache.current
    if (previous === null) {
      cache.current = { value: next }
      return next
    }
    const same = equal === undefined ? Object.is(previous.value, next) : equal(previous.value, next)
    if (!same) cache.current = { value: next }
    return cache.current?.value ?? next
  }, [source, selector, equal])
  // Wrap rather than pass `source.subscribe` by reference: DSH's stores expose
  // `subscribe` as a prototype method that reads `this.listeners`, so handing
  // React the bare function loses `this` and every read throws
  // "Cannot read properties of undefined (reading 'listeners')".
  const subscribe = useCallback(
    (listener: () => void) => source.subscribe(listener),
    [source],
  )
  return useSyncExternalStore(subscribe, get, get)
}

/**
 * A millisecond clock that only runs while it is needed.
 *
 * Elapsed-time text is the one figure no snapshot pushes, so it needs a timer;
 * gating that timer on "is anything actually running" keeps an idle panel at
 * zero wakeups.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const handle = globalThis.setInterval(() => { if (globalThis.document?.hidden !== true) setNow(Date.now()) }, intervalMs)
    return () => { globalThis.clearInterval(handle) }
  }, [active, intervalMs])
  return now
}

/** Whether the document is currently hidden. */
export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => globalThis.document?.hidden === true)
  useEffect(() => {
    const doc = globalThis.document
    if (doc === undefined || doc === null) return
    const update = (): void => setHidden(doc.hidden)
    doc.addEventListener('visibilitychange', update)
    return () => { doc.removeEventListener('visibilitychange', update) }
  }, [])
  return hidden
}

/** Whether the user asked for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (query === undefined) return
    setReduced(query.matches)
    const update = (): void => setReduced(query.matches)
    query.addEventListener?.('change', update)
    return () => { query.removeEventListener?.('change', update) }
  }, [])
  return reduced
}

/** Track whether an element is scrolled away from its top. */
export function useAwayFromTop(ref: { current: HTMLElement | null }, threshold = 200): boolean {
  const [away, setAway] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const update = (): void => setAway(element.scrollTop > threshold)
    update()
    element.addEventListener('scroll', update, { passive: true })
    return () => { element.removeEventListener('scroll', update) }
  }, [ref, threshold])
  return away
}

/** Group and format a count for display. */
export function formatCount(value: number): string {
  return value.toLocaleString()
}
