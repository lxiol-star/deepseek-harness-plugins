/**
 * The browser half.
 *
 * Responsibilities, in order: publish the dictionaries, install the
 * stylesheet, subscribe to the host feed, register the two slot contributions
 * (the fullscreen board and the header toggle), and mount the docked column
 * through the DOM adapter.
 *
 * Design notes worth keeping in view:
 *  - the dock is NOT a slot contribution. The shell's three grid tracks are
 *    computed inside `AppFrame` and every column seat is a `single` slot that
 *    is already occupied, so adding a sibling column means placing an element
 *    by DOM contract. When that contract is not recognised the dock declines
 *    to mount and nothing else changes.
 *  - the board IS a slot contribution (`shell.overlay`, an additive `list`
 *    seat), so a renamed or removed slot simply never runs its callback.
 *  - both forms render the same component tree, so grouping, ordering and the
 *    state rules cannot drift apart.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type ArchiveMarks } from './archive-marks.ts';
import type { GroupingMode } from './workspace-tree.ts';
import { type BoardFilters } from './filters.ts';
import { BoardFeedClient } from './feed.ts';
import { BatchController } from './batch.ts';
import { BoardModel } from './model.ts';
import { type ReadonlyStore, type Store } from './store.ts';
import { type Translate } from './hooks.ts';
import type { JobsService, SessionListState, SessionStatusSnapshot, SubagentAddress, WorkspacesService } from './dsh.ts';
/** Plugin name, shared by both halves. */
export declare const name = "dsh-session-board";
/**
 * Services required before the browser half runs at all. The nested
 * {@link CORE_SERVICES} injection below adds the session, navigation and job
 * services the panel reads before it registers anything.
 */
export declare const inject: string[];
/** The locale service slice this plugin uses. */
interface LocaleService {
    getSnapshot(): {
        revision: number;
        active: string;
    };
    subscribe(listener: () => void): () => void;
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void;
    bind(namespace: string): Translate;
}
/** Persisted view state. */
interface ViewState {
    dock: {
        collapsed: boolean;
        width: number;
    };
    board: {
        open: boolean;
    };
    archiveMarks: ArchiveMarks;
    grouping: GroupingMode;
    filters: BoardFilters;
    density: 'compact' | 'full';
    collapsedGroups: Record<string, boolean>;
}
/** Everything the React tree needs, handed through slot inject faces. */
export interface BoardFace {
    feed: BoardFeedClient;
    view: Store<ViewState>;
    t: Translate;
    locale: LocaleService;
    sessions: {
        list: ReadonlyStore<SessionListState>;
        subagentAddress?: (sessionId: string) => SubagentAddress | undefined;
    } | null;
    uiSession: {
        sessionStatus: ReadonlyStore<SessionStatusSnapshot>;
    } | null;
    jobs: JobsService | null;
    workspaces: WorkspacesService | null;
    openSession: (id: string) => void;
    ack: (id: string) => void;
    batch: BatchController;
    model: BoardModel;
}
/**
 * Activate the browser half.
 * @param ctx - client root context.
 */
export declare function apply(ctx: Context): void;
export {};
