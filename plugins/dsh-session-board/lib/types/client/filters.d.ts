import type { BoardGroup } from '../shared/types.ts';
export type StatusFilter = 'all' | 'blocked' | 'running';
export type ArchiveFilter = 'all' | 'active' | 'archived';
export interface BoardFilters {
    query: string;
    status: StatusFilter;
    workspace: string;
    archive?: ArchiveFilter;
}
export declare const DEFAULT_FILTERS: BoardFilters;
/** Filter without changing the model's state classification or ordering. */
export declare function filterGroups(groups: readonly BoardGroup[], filters: BoardFilters): BoardGroup[];
export declare function workspaceOptions(groups: readonly BoardGroup[]): string[];
export declare function workspaceChoices(groups: readonly BoardGroup[]): {
    value: string;
    label: string;
}[];
