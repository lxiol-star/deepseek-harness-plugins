/**
 * A minimal observable store, matching the `getSnapshot`/`subscribe` shape the
 * React layer consumes through `useSyncExternalStore`.
 *
 * Written by hand rather than taken from the harness store package so the
 * client half depends on nothing but React; the surface is three methods.
 */

/** A read-only observable snapshot. */
export interface ReadonlyStore<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

/** A store that can also be written and persisted. */
export interface Store<T> extends ReadonlyStore<T> {
  set(next: T | ((current: T) => T)): void
}

/** Options for {@link createStore}. */
export interface StoreOptions<T> {
  /** localStorage key. Absent means the store lives in memory only. */
  persist?: string | undefined
  /** Merge a parsed persisted value onto the initial one, defensively. */
  revive?: ((stored: unknown, initial: T) => T) | undefined
}

/**
 * Create a store, optionally backed by `localStorage`.
 *
 * Persistence failures (private mode, quota, disabled storage) are swallowed:
 * a panel that cannot remember its width must still render.
 */
export function createStore<T>(initial: T, options: StoreOptions<T> = {}): Store<T> {
  let state = initial
  let loaded = false
  const listeners = new Set<() => void>()

  const read = (): void => {
    if (loaded) return
    loaded = true
    if (options.persist === undefined) return
    try {
      const raw = globalThis.localStorage?.getItem(options.persist)
      if (raw === null || raw === undefined) return
      const parsed: unknown = JSON.parse(raw)
      state = options.revive === undefined ? { ...initial, ...(parsed as object) } : options.revive(parsed, initial)
    } catch {
      // Keep the initial state.
    }
  }

  const write = (): void => {
    if (options.persist === undefined) return
    try {
      globalThis.localStorage?.setItem(options.persist, JSON.stringify(state))
    } catch {
      // Ignore: persistence is a convenience here, not a correctness need.
    }
  }

  return {
    getSnapshot(): T {
      read()
      return state
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next: T | ((current: T) => T)): void {
      read()
      const value = typeof next === 'function' ? (next as (current: T) => T)(state) : next
      if (Object.is(value, state)) return
      state = value
      write()
      for (const listener of [...listeners]) listener()
    },
  }
}
