/**
 * The shared grouped list.
 *
 * Both forms render through this component: the docked column stacks groups
 * vertically in a narrow scroll area, the fullscreen board lays the same cards
 * out in a grid. Only CSS differs, so grouping, collapse and ordering have a
 * single implementation.
 */
import { type ReactElement } from 'react';
import type { BoardGroup, BoardGroupId } from '../shared/types.ts';
import { type GroupingMode } from './workspace-tree.ts';
import type { WorkspaceGitInfo } from '../shared/workspace-meta.ts';
import type { Translate } from './hooks.ts';
/** Props of {@link BoardList}. */
export interface BoardListProps {
    grouping?: GroupingMode | undefined;
    groups: readonly BoardGroup[];
    t: Translate;
    /** Groups the user has collapsed, keyed by group id. */
    collapsed?: Readonly<Record<string, boolean>> | undefined;
    onToggleGroup?: ((group: string) => void) | undefined;
    onOpen: (id: string) => void;
    onAck: (id: string) => void;
    selectionDisabled?: boolean | undefined;
    selected?: ReadonlySet<string> | undefined;
    onToggleSelect?: ((id: string) => void) | undefined;
    /** i18n key for the whole-list empty state. */
    emptyKey: string;
    /** Render the back-to-top affordance. */
    backToTop?: boolean;
    /** Workspace id → git facts; the project tree uses it, path fallback ignores it. */
    workspaceMeta?: Readonly<Record<string, WorkspaceGitInfo>> | undefined;
    /** Open (creating on first use) a project's coordinator session. */
    onOpenCoordinator?: ((projectKey: string) => void) | undefined;
}
/** The list itself, without its scroll container. */
export declare function BoardList({ groups, t, collapsed, onToggleGroup, onOpen, onAck, selected, onToggleSelect, selectionDisabled, emptyKey, grouping, workspaceMeta, onOpenCoordinator, }: BoardListProps): ReactElement;
/** Props of {@link BoardScroll}. */
export interface BoardScrollProps extends BoardListProps {
    /** Class applied to the scroll container. */
    className?: string | undefined;
}
/**
 * The scroll container plus its back-to-top control.
 *
 * The button appears only once the list is genuinely scrolled away from the
 * top, and honours reduced motion by jumping instantly.
 */
export declare function BoardScroll({ className, backToTop, ...list }: BoardScrollProps): ReactElement;
/** Local collapse state for a list that does not persist elsewhere. */
export declare function useGroupCollapse(initial?: Record<string, boolean>): [
    Record<string, boolean>,
    (group: BoardGroupId) => void
];
