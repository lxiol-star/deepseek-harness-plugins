import { type ReactElement } from 'react';
import type { BoardGroup } from '../shared/types.ts';
import type { GroupingMode } from './workspace-tree.ts';
import type { Translate } from './hooks.ts';
import { type BoardFilters } from './filters.ts';
export declare function BoardFilterBar({ groups, filters, onChange, shown, t, grouping, onGrouping }: {
    groups: readonly BoardGroup[];
    filters: BoardFilters;
    onChange: (filters: BoardFilters) => void;
    shown: number;
    t: Translate;
    grouping?: GroupingMode;
    onGrouping?: (mode: GroupingMode) => void;
}): ReactElement;
