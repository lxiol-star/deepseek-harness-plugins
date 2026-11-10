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
/**
 * Workspace filter choices, keyed by the filter value the model compares.
 *
 * The label is the workspace title alone: the absolute path is long, repeats
 * every project's parent directory and made the dropdown unusable. Only
 * same-titled workspaces need a hint, and then the shortest distinct tail of
 * the path is enough to tell them apart.
 *
 * @param groups - board groups holding the entries to derive choices from.
 * @returns one `{ value, label }` per distinct workspace identity, sorted by label.
 */
export declare function workspaceChoices(groups: readonly BoardGroup[]): {
    value: string;
    label: string;
}[];
