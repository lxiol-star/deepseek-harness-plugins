import { type ReactElement } from 'react';
import type { BoardGroup } from '../shared/types.ts';
import type { BatchController } from './batch.ts';
import { type Translate } from './hooks.ts';
export declare function BatchToolbar({ controller, groups, visibleGroups, t }: {
    controller: BatchController;
    groups: readonly BoardGroup[];
    visibleGroups?: readonly BoardGroup[];
    t: Translate;
}): ReactElement;
