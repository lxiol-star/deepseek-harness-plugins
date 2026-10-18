/**
 * One session card.
 *
 * The card is pure: everything it shows was derived by the shared board model,
 * and it computes nothing itself except text formatting. It is memoized on the
 * content key in `card-key.ts`, so the one-second clock that advances elapsed
 * time re-renders only the running cards whose displayed second actually
 * changed — a list of fifty idle cards costs nothing per tick.
 *
 * Cards show a short summary by default. Expanded cards reveal the instruction,
 * detailed metrics and a scrollable preview while keeping header and footer fixed. Each thing a user can do
 * is a genuine control — the title is a real `<button>`, selection is a real
 * `<input type="checkbox">` — and no parent key handler intercepts their keys.
 * Clicking the card's dead space still opens the session, but only when the
 * click hit no control and selected no text.
 */
import { type ReactElement } from 'react';
import type { BoardEntry } from '../shared/types.ts';
import { type Translate } from './hooks.ts';
/** Props of {@link SessionCard}. */
export interface SessionCardProps {
    entry: BoardEntry;
    t: Translate;
    onOpen: (id: string) => void;
    onAck: (id: string) => void;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
    /** True while a batch write owns the selection: the checkbox is disabled. */
    interactionDisabled?: boolean;
}
/** The card body. */
declare function SessionCardBody({ entry, t, onOpen, onAck, selected, onToggleSelect, interactionDisabled, }: SessionCardProps): ReactElement;
/**
 * Content-addressed memo boundary.
 *
 * The translator and the open/ack callbacks are compared by identity here; the
 * entry and the selection props go through `sameCard`, which is unit-tested on
 * its own.
 */
export declare const SessionCard: import("react").MemoExoticComponent<typeof SessionCardBody>;
export {};
