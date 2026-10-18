/** Attribute marking our own column, used for idempotent re-attachment. */
export declare const DOCK_ATTR = "data-dsh-session-board";
/** The frame element, or null when the shell is not recognisable. */
export declare function resolveFrame(doc: Document): HTMLElement | null;
/**
 * The centre column: the frame's direct child that hosts the conversation.
 * @returns the column element, or null when the conversation is not mounted.
 */
export declare function resolveCentreColumn(frame: HTMLElement): HTMLElement | null;
/** Options for {@link attachDock}. */
export interface AttachDockOptions {
    /** Document to operate on; defaults to the ambient one. */
    document?: Document;
    /** Called once per distinct failure reason, for a single diagnostic line. */
    onWarn?: (reason: string) => void;
}
/** A live attachment. */
export interface DockAttachment {
    /** Remove the dock and restore the original template. Idempotent. */
    dispose(): void;
    /** Whether the dock is currently placed in the shell. */
    isAttached(): boolean;
}
/**
 * Place `host` as a frame track before the centre column, and keep it there
 * across the app's own template rewrites and shell re-mounts.
 *
 * @param host - the dock element to place. Ownership stays with the caller.
 * @param options - document and diagnostics.
 * @returns the attachment, or null when the shell is not a recognisable grid —
 *          in which case nothing is inserted, no style is touched, and the
 *          fullscreen board remains available.
 */
export declare function attachDock(host: HTMLElement, options?: AttachDockOptions): DockAttachment | null;
