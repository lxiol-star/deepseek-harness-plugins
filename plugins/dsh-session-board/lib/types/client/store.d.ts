/**
 * A minimal observable store, matching the `getSnapshot`/`subscribe` shape the
 * React layer consumes through `useSyncExternalStore`.
 *
 * Written by hand rather than taken from the harness store package so the
 * client half depends on nothing but React; the surface is three methods.
 */
/** A read-only observable snapshot. */
export interface ReadonlyStore<T> {
    getSnapshot(): T;
    subscribe(listener: () => void): () => void;
}
/** A store that can also be written and persisted. */
export interface Store<T> extends ReadonlyStore<T> {
    set(next: T | ((current: T) => T)): void;
}
/** Options for {@link createStore}. */
export interface StoreOptions<T> {
    /** localStorage key. Absent means the store lives in memory only. */
    persist?: string | undefined;
    /** Merge a parsed persisted value onto the initial one, defensively. */
    revive?: ((stored: unknown, initial: T) => T) | undefined;
}
/**
 * Create a store, optionally backed by `localStorage`.
 *
 * Persistence failures (private mode, quota, disabled storage) are swallowed:
 * a panel that cannot remember its width must still render.
 */
export declare function createStore<T>(initial: T, options?: StoreOptions<T>): Store<T>;
