/**
 * Reveal a Session row in the host's native workspace sidebar.
 *
 * Opening a Session from the board switches the chat, but the host's session
 * tree keeps its own scroll position: the newly active row can sit below the
 * fold. The tree marks real session rows with `data-row-key="session:<id>"`
 * (and only renders a row once its workspace group is expanded), so after a
 * programmatic open we look for that exact row and ask the browser to scroll
 * it into view. A few animation frames of retry cover the React render that
 * follows the navigation; if the row never mounts (collapsed group, archived
 * session, a host that renamed the attribute) this is a no-op rather than an
 * error.
 */
/**
 * Scroll the native workspace row for `sessionId` into view when it exists.
 * @param sessionId - the Session whose row should be revealed.
 * @param maxFrames - test seam; production callers omit it.
 */
export declare function revealSessionRow(sessionId: string, maxFrames?: number): void;
