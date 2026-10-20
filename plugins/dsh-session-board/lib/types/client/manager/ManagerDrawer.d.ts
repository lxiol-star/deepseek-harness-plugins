/**
 * The manager drawer: workspace/session selection on the left, the embedded
 * official manager chat on the right.
 *
 * The drawer is an additive `shell.overlay` list entry, so it never competes
 * for a layout seat with the official UI and simply does not render if the
 * seat disappears upstream. It is a fixed right-hand surface over the frame
 * (the overlay layer itself ignores pointer events).
 *
 * All data is read from snapshots the plugin already maintains: the board
 * model for workspaces/sessions, the uiSession status map for the manager
 * phase, the workspaces service for titles, and the manager controller for
 * the host mirror (selection, tasks, retained chat reference).
 */
import { type ReactElement, type ReactNode } from 'react';
import type { SessionReference } from '../dsh.ts';
import { type Translate } from '../hooks.ts';
import type { ManagerController } from './controller.ts';
import type { BoardFace } from '../index.tsx';
/** Props supplied to the drawer's overlay entry. */
export interface ManagerDrawerProps {
    face: BoardFace;
    manager: ManagerController;
    t: Translate;
    /** Session scope seat supplied for a child slot declared with session scope. */
    SessionProvider?: ((props: {
        session: SessionReference;
        children: ReactNode;
    }) => ReactNode) | undefined;
    /** Child-slot renderer supplied for the declared chat slot. */
    renderSlot?: ((key: string, owner: object) => ReactNode) | undefined;
    /** Present for the declared child slot; the drawer itself does not call it. */
    renderFactorySlot?: ((name: string, props: object, options?: object) => ReactNode) | undefined;
}
/**
 * The manager drawer.
 * @param props - face, controller, translator and the slot-provided render seats.
 * @returns the drawer, or null while closed.
 */
export declare function ManagerDrawer({ face, manager, t, SessionProvider, renderSlot }: ManagerDrawerProps): ReactElement | null;
/** Props of the drawer toggle, shared by the conversation header and sidebar foot. */
export interface ManagerToggleProps {
    manager: ManagerController;
    t: Translate;
    /**
     * Sidebar column width flag supplied by the `sidebar.footer.action` seat.
     * Absent in the conversation-header seat, which always renders the compact
     * icon button.
     */
    wide?: boolean | undefined;
}
/**
 * The button that opens and closes the manager drawer.
 * @param props - controller, translator and the optional sidebar width flag.
 * @returns the toggle button with its pressed state.
 */
export declare function ManagerToggle({ manager, t, wide }: ManagerToggleProps): ReactElement;
