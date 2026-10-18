/**
 * Focus containment, background inerting and return-focus resolution for the
 * fullscreen board.
 *
 * The board is page-like rather than a host dialog: it is portalled to
 * `document.body` so the Electron window-drag region composed inside `#root` is
 * subtracted wholesale. Escaping `#root` also means the board cannot inherit the
 * shell's own modal layer, so this module reproduces the guarantees that matter:
 *
 *  - Tab / Shift+Tab loop across the board's own controls,
 *  - Escape is owned by the board only while no newer dialog or menu sits above
 *    it (the shell's convention is "last modal in document order is foreground",
 *    and every official dialog and menu is portalled to `body` too),
 *  - the rest of the page is inert while the board covers it, and the previous
 *    `inert` state is restored exactly,
 *  - focus returns to the opener when it is still connected, else to the board
 *    toggle (marked `data-session-board-toggle`, else a labelled toggle button).
 *
 * The decision functions are deliberately separated from the DOM walks so the
 * tricky parts are pinned without a browser.
 */
/** Foreground owners, matching the shell modal layer's own selector. */
export declare const MODAL_LAYER_SELECTOR = "[role=\"dialog\"][aria-modal=\"true\"], [role=\"menu\"]";
/** Attribute an app-level board toggle may carry so return focus can find it. */
export declare const BOARD_TOGGLE_ATTRIBUTE = "data-session-board-toggle";
/** Selector for the marked board toggle. */
export declare const BOARD_TOGGLE_SELECTOR = "[data-session-board-toggle]";
/**
 * Candidates for a Tab press, in document order.
 *
 * This is a superset: `focusableIn` drops negative-`tabindex` controls, since
 * they are focusable only programmatically and must not join the Tab loop.
 */
export declare const FOCUSABLE_SELECTOR: string;
/** Every foreground layer in the document, in document order. */
export declare function modalLayers(doc: Document): Element[];
/**
 * Whether the board is the foreground layer.
 *
 * Document order is the shell's own arbitration rule, so the board yields to any
 * newer dialog or menu and to any foreground layer nested inside the board (a
 * menu opened from the toolbar).
 *
 * @param panel - the board's own dialog element.
 * @param layers - foreground layers in document order (see {@link modalLayers}).
 * @returns true when the last layer is the board or lives inside it.
 */
export declare function isTopmostModal(panel: Element | null, layers: readonly Element[]): boolean;
/** Whether focus sits inside a menu, which owns its own Tab traversal. */
export declare function isInsideMenu(active: Element | null): boolean;
/** The tabbable controls inside a container, in document order. */
export declare function focusableIn(root: Element): HTMLElement[];
/**
 * The element a Tab press must move to, or null when the browser's default
 * traversal already stays inside the container.
 *
 * @param items - focusable controls in document order.
 * @param active - the element that currently has focus.
 * @param shift - whether the press was Shift+Tab.
 */
export declare function trapTabTarget(items: readonly HTMLElement[], active: Element | null, shift: boolean): HTMLElement | null;
/**
 * Make every body child other than the board inert, returning the release.
 *
 * The board is a direct child of `body` (the portal), so its siblings are the
 * whole page. Nodes that were already inert keep their exact previous value, and
 * a node that was not gets the attribute removed again on release: the board
 * never widens or narrows a caller's own inert state.
 *
 * @param doc - the product document.
 * @param panel - the board element to leave interactive.
 * @returns the release; a no-op when there is no body or no board to protect.
 */
export declare function inertBackground(doc: Document, panel: Element | null): () => void;
/** Quote a value for a double-quoted attribute selector. */
export declare function escapeAttributeValue(value: string): string;
/** Inputs for {@link resolveRestoreTarget}. */
export interface RestoreQuery {
    /** The element focused when the board opened. */
    saved?: HTMLElement | null;
    doc: Document;
    /** Accessible names of the board's toggle controls, in preference order. */
    labels?: readonly string[];
}
/**
 * Resolve where focus goes when the board closes.
 *
 * The opener wins while it is still connected; a board opened from a control
 * that has since unmounted falls back to the marked toggle, then to the first
 * toggle button named by the caller's own wording.
 *
 * @param query - saved opener, document, and fallback toggle labels.
 * @returns the element to focus, or null when nothing suitable remains.
 */
export declare function resolveRestoreTarget(query: RestoreQuery): HTMLElement | null;
