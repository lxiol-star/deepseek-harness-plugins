/**
 * Form B: the fullscreen board.
 *
 * Mounted through the `shell.overlay` slot (the shell's additive, frame-wide
 * seat) but *rendered into `document.body`*. The portal is deliberate: on
 * macOS the Electron window's drag region is composed from element geometry
 * inside `#root`, so a full-window surface living there would swallow the
 * title-bar drag. A body-level layer is subtracted wholesale instead.
 *
 * Accessibility is handled here rather than inherited from a host dialog
 * component: the board is a full-bleed page-like surface, so it owns focus on
 * open, traps Tab inside its own controls, makes the rest of the page inert,
 * yields Escape/Tab to any newer dialog or menu, closes on Escape only while it
 * is the foreground layer, and restores the previously focused control on close.
 *
 * The header is also the window's drag surface. It carries the shell's own
 * `data-window-drag` mark — the one declaration in ui-web `base.css` turns into
 * `-webkit-app-region: drag` on darwin — plus `data-platform`, and it opens with
 * a passive `.sb-overlay-dragspace` gutter so the stylesheet can clear the macOS
 * traffic lights. Controls are explicitly `.sb-overlay-nodrag`, because the
 * window module's blanket subtraction of `body > :not(#root)` would otherwise
 * make the whole portalled surface undraggable.
 */
import { type ReactElement } from 'react';
import type { GroupingMode } from './workspace-tree.ts';
import type { BoardGroup } from '../shared/types.ts';
import type { WorkspaceGitInfo } from '../shared/workspace-meta.ts';
import { type Translate } from './hooks.ts';
/** Props of {@link BoardOverlay}. */
export interface BoardOverlayProps {
    open: boolean;
    grouping?: GroupingMode;
    groups: readonly BoardGroup[];
    t: Translate;
    density: 'compact' | 'full';
    online: boolean;
    onClose: () => void;
    onToggleDensity: () => void;
    onOpen: (id: string) => void;
    onAck: (id: string) => void;
    selected?: ReadonlySet<string>;
    onToggleSelect?: (id: string) => void;
    emptyKey?: string;
    toolbar?: ReactElement;
    selectionDisabled?: boolean;
    collapsedGroups: Readonly<Record<string, boolean>>;
    onToggleGroup: (group: string) => void;
    /** Workspace id → git facts, for the project tree. */
    workspaceMeta?: Readonly<Record<string, WorkspaceGitInfo>>;
    /** Open the coordinator session of one project. */
    onOpenCoordinator?: (projectKey: string) => void;
}
/** The fullscreen board, or null while closed. */
export declare function BoardOverlay(props: BoardOverlayProps): ReactElement | null;
