import type { ArchivePreview, ArchiveSummary } from '../shared/archive.ts';
export interface BatchState {
    selected: readonly string[];
    phase: 'idle' | 'previewing' | 'confirming' | 'archiving';
    preview: ArchivePreview | null;
    result: ArchiveSummary | null;
    error: string | null;
}
export interface ArchiveTransport {
    preview(ids: readonly string[]): Promise<ArchivePreview>;
    commit(token: string): Promise<ArchiveSummary>;
}
/** One shared, explicit preview/confirm/write state machine for both views. */
export declare class BatchController {
    private readonly transport;
    private readonly state;
    private disposed;
    constructor(transport: ArchiveTransport);
    readonly getSnapshot: () => BatchState;
    readonly subscribe: (listener: () => void) => () => void;
    readonly toggle: (id: string) => void;
    readonly selectAll: (ids: readonly string[]) => void;
    readonly reconcile: (ids: readonly string[]) => void;
    readonly clear: () => void;
    readonly cancel: () => void;
    /**
     * Drop a finished batch result (counts, synthesis rows, native-archive rows)
     * and any error, so the panel stops occupying space once it has been read.
     */
    readonly dismissResult: () => void;
    readonly preview: () => Promise<void>;
    readonly confirm: () => Promise<void>;
    isBusy(): boolean;
    dispose(): void;
}
