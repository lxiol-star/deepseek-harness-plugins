import type { ArchiveMode, ArchivePreview, ArchiveSummary } from '../shared/archive.ts';
export interface BatchState {
    selected: readonly string[];
    phase: 'idle' | 'previewing' | 'confirming' | 'archiving';
    /** Follow-up selected for the next confirmation: full synthesis or archive only. */
    mode: ArchiveMode;
    preview: ArchivePreview | null;
    result: ArchiveSummary | null;
    /** Stable error code for the localized message. */
    error: string | null;
    /** Host/bridge diagnostic behind that code, when it sent one. */
    errorDetail: string | null;
}
export interface ArchiveTransport {
    preview(ids: readonly string[], mode?: ArchiveMode): Promise<ArchivePreview>;
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
    readonly preview: (mode?: ArchiveMode) => Promise<void>;
    readonly confirm: () => Promise<void>;
    isBusy(): boolean;
    dispose(): void;
}
