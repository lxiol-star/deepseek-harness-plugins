/** Own every activation resource before the next operation can throw. */
export class CleanupStack {
  private readonly entries: Array<() => void> = []
  private closed = false
  add(cleanup: () => void): void {
    if (this.closed) { cleanup(); return }
    this.entries.push(cleanup)
  }
  dispose(): void {
    if (this.closed) return
    this.closed = true
    for (const cleanup of this.entries.reverse()) {
      try { cleanup() } catch { /* One teardown must not strand the others. */ }
    }
    this.entries.length = 0
  }
}
