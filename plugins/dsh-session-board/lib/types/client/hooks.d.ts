import type { ReadonlyStore } from './store.ts';
/** Translate one dictionary key, interpolating `{name}` placeholders. */
export type Translate = (key: string, params?: Record<string, string | number>) => string;
/**
 * Subscribe to a projection of a store.
 *
 * The selected value is cached so a selector that builds a fresh object on
 * every read cannot make `useSyncExternalStore` loop.
 */
export declare function useSnapshot<T, S>(source: ReadonlyStore<T>, selector: (value: T) => S, equal?: ((left: S, right: S) => boolean) | undefined): S;
/**
 * A millisecond clock that only runs while it is needed.
 *
 * Elapsed-time text is the one figure no snapshot pushes, so it needs a timer;
 * gating that timer on "is anything actually running" keeps an idle panel at
 * zero wakeups.
 */
export declare function useTicker(active: boolean, intervalMs?: number): number;
/** Whether the document is currently hidden. */
export declare function useDocumentHidden(): boolean;
/** Whether the user asked for reduced motion. */
export declare function usePrefersReducedMotion(): boolean;
/** Track whether an element is scrolled away from its top. */
export declare function useAwayFromTop(ref: {
    current: HTMLElement | null;
}, threshold?: number): boolean;
/** Group and format a count for display. */
export declare function formatCount(value: number): string;
