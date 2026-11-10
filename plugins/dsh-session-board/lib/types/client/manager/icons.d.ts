/**
 * Inline icon set for the manager drawer.
 *
 * The plugin ships no icon dependency: the shell's frozen module table has no
 * icon library, and pulling one into the bundle would cost more than the dozen
 * glyphs the drawer needs. Every glyph is a stroked 24×24 path drawn in
 * `currentColor`, so it follows the theme tokens like text does.
 */
import type { ReactElement } from 'react';
/** Props shared by every icon. */
export interface ManagerIconProps {
    /** Rendered square size in CSS pixels; defaults to the 16px control size. */
    size?: number;
    /** Extra class for alignment tweaks at call sites. */
    className?: string;
}
/** Hide the navigator: a panel whose left column collapses. */
export declare function IconPanelLeftClose(props: ManagerIconProps): ReactElement;
/** Show the navigator. */
export declare function IconPanelLeftOpen(props: ManagerIconProps): ReactElement;
/** Fill the viewport with the panel. */
export declare function IconMaximize(props: ManagerIconProps): ReactElement;
/** Restore the floating panel size. */
export declare function IconRestore(props: ManagerIconProps): ReactElement;
/** Re-read host state. */
export declare function IconRefresh(props: ManagerIconProps): ReactElement;
/** Open the manager in the main chat. */
export declare function IconExternal(props: ManagerIconProps): ReactElement;
/** Close the panel. */
export declare function IconClose(props: ManagerIconProps): ReactElement;
/** Expand a section. */
export declare function IconChevronDown(props: ManagerIconProps): ReactElement;
/** Collapsed section marker. */
export declare function IconChevronRight(props: ManagerIconProps): ReactElement;
/** Workspace filter input. */
export declare function IconSearch(props: ManagerIconProps): ReactElement;
/** Confirmation and checked rows. */
export declare function IconCheck(props: ManagerIconProps): ReactElement;
/** Send the selection to the manager. */
export declare function IconSend(props: ManagerIconProps): ReactElement;
/** Automatic wakeups. */
export declare function IconBell(props: ManagerIconProps): ReactElement;
/** Workspace section. */
export declare function IconFolder(props: ManagerIconProps): ReactElement;
/** Session section. */
export declare function IconLayers(props: ManagerIconProps): ReactElement;
/** Task section. */
export declare function IconTasks(props: ManagerIconProps): ReactElement;
/** Project paths are visible. */
export declare function IconEye(props: ManagerIconProps): ReactElement;
/** Project paths are hidden. */
export declare function IconEyeOff(props: ManagerIconProps): ReactElement;
/** Board overview: four tiles. */
export declare function IconLayoutGrid(props: ManagerIconProps): ReactElement;
/** Empty-state mark for a pane with nothing to show. */
export declare function IconSparkle(props: ManagerIconProps): ReactElement;
/** Inline hint affordance. */
export declare function IconInfo(props: ManagerIconProps): ReactElement;
