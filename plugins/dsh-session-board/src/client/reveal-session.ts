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

/** How many frames to wait for the navigation's row to mount. */
const REVEAL_FRAME_BUDGET = 60

/**
 * Scroll the native workspace row for `sessionId` into view when it exists.
 * @param sessionId - the Session whose row should be revealed.
 * @param maxFrames - test seam; production callers omit it.
 */
export function revealSessionRow(sessionId: string, maxFrames = REVEAL_FRAME_BUDGET): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return
  const target = `session:${sessionId}`
  let frames = 0
  const tick = (): void => {
    const rows = document.querySelectorAll<HTMLElement>('[data-row-key^="session:"]')
    for (const row of rows) {
      if (row.dataset.rowKey !== target) continue
      row.scrollIntoView({ block: 'nearest' })
      return
    }
    frames += 1
    if (frames < maxFrames) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
