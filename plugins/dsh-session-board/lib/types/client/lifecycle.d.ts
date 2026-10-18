/** Own every activation resource before the next operation can throw. */
export declare class CleanupStack {
    private readonly entries;
    private closed;
    add(cleanup: () => void): void;
    dispose(): void;
}
