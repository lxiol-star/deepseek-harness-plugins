/**
 * Assemble the panel's session inputs from DSH client snapshots.
 *
 * This is the only place that knows which DSH field feeds which card, and it
 * is deliberately defensive: every read tolerates a missing projection or an
 * absent optional snapshot, because projections arrive asynchronously and the
 * panel must render a partial card rather than nothing.
 */
import type { BoardSessionInput } from '../shared/types.ts';
import { type JobView, type SessionListState, type SessionStatusSnapshot, type WorkspaceSnapshot } from './dsh.ts';
/** Everything the assembler reads, already snapshotted. */
export interface AssembleInput {
    list: SessionListState;
    statuses: SessionStatusSnapshot;
    /** `ctx.jobs.state.rows`, keyed by session id. */
    jobRows: Readonly<Record<string, readonly JobView[]>>;
    /** Workspace rows, for the card's workspace label. */
    workspaces: WorkspaceSnapshot | null;
}
/** The session currently displayed in the main view, or null. */
export declare function currentSessionId(list: SessionListState): string | null;
/** Assemble every card input, in host list order. */
export declare function assembleInputs(input: AssembleInput): BoardSessionInput[];
