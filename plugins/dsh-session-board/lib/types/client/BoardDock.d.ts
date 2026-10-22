/**
 * Form A: the docked column.
 *
 * It is a real flex sibling of the conversation, so it reserves space instead
 * of covering the chat. Collapse state and width belong to the caller (they
 * are persisted), while the drag gesture owns a local width so the store is
 * written once per gesture instead of once per frame.
 */
import { type ReactElement } from 'react';
import type { GroupingMode } from './workspace-tree.ts';
import type { BoardGroup } from '../shared/types.ts';
import type { WorkspaceGitInfo } from '../shared/workspace-meta.ts';
import type { Translate } from './hooks.ts';
/** Narrowest and widest the column may be dragged, in pixels. */
export declare const DOCK_MIN_WIDTH = 260;
export declare const DOCK_MAX_WIDTH = 480;
/** Width of the collapsed rail, in pixels. */
export declare const DOCK_RAIL_WIDTH = 40;
/** Clamp a requested width into the allowed range. */
export declare function clampDockWidth(width: number): number;
/** Props of {@link BoardDock}. */
export interface BoardDockProps {
    grouping?: GroupingMode;
    groups: readonly BoardGroup[];
    t: Translate;
    collapsed: boolean;
    width: number;
    density: 'compact' | 'full';
    /** Whether the host feed is live; false shows the local-only notice. */
    online: boolean;
    onToggleCollapse: () => void;
    onWidth: (width: number) => void;
    onToggleDensity: () => void;
    onOpenBoard: () => void;
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
}
/** The docked column. */
export declare function BoardDock(props: BoardDockProps): ReactElement;
