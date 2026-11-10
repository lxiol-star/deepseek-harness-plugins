import { type ReactElement } from 'react';
import type { BoardGroup } from '../shared/types.ts';
import type { GroupingMode } from './workspace-tree.ts';
import type { Translate } from './hooks.ts';
import { type BoardFilters } from './filters.ts';
/**
 * Search, filters, grouping and the match count.
 *
 * Layout is one row on a board-width panel and two rows (search + count, then
 * the controls) on a narrow panel: the dock and a split window stay readable
 * instead of stretching every select to an unreadable width.
 */
export declare function BoardFilterBar({ groups, filters, onChange, shown, t, grouping, onGrouping }: {
    groups: readonly BoardGroup[];
    filters: BoardFilters;
    onChange: (filters: BoardFilters) => void;
    shown: number;
    t: Translate;
    grouping?: GroupingMode;
    onGrouping?: (mode: GroupingMode) => void;
}): ReactElement;
