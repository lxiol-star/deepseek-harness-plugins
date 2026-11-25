/**
 * What the dock, the header toggle and the canvas share.
 *
 * The three live in different slots of the shell, so they cannot pass state
 * through props. This store is the one place that knows:
 *
 *  - whether the canvas is open, and for which session it was opened;
 *  - what the dock last heard from the Host about the tower of each session.
 *
 * The second point is what lets the header toggle show itself only while the
 * tower mode is on, without polling on its own: the dock already polls
 * `/tower/state` once a second and reports what it learns here. The toggle
 * only reads.
 *
 * The store is a tiny external store for `useSyncExternalStore`: every getter
 * returns the same value until something changed.
 */

const sessionKey = value => (typeof value === 'string' ? value : '')

/**
 * Create the store.
 *
 * @returns `{ subscribe, isOpen, openedFor, open, close, report, towerOf }`.
 */
export function createCanvasStore() {
  const listeners = new Set()
  const towers = new Map()
  let open = false
  let openedFor = ''

  const emit = () => {
    for (const listener of [...listeners]) listener()
  }

  return {
    /** Listen; returns the unsubscribe. */
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /** Whether the canvas is open. */
    isOpen: () => open,

    /** The session the canvas was opened for; empty when it was never opened. */
    openedFor: () => openedFor,

    /**
     * Open the canvas for a session.
     *
     * @param sessionId - the tower's session.
     */
    open(sessionId) {
      if (open) return
      openedFor = sessionKey(sessionId)
      open = true
      emit()
    },

    /** Close the canvas. */
    close() {
      if (!open) return
      open = false
      emit()
    },

    /**
     * Record what a poll of `/tower/state` learnt about one session's tower.
     *
     * A snapshot counts as active only when the Host says so and names the
     * same session that was asked about. A session that had no tower and
     * still has none does not wake the listeners.
     *
     * @param sessionId - the session that was asked about.
     * @param snapshot - the parsed body, or null when the dock has none.
     */
    report(sessionId, snapshot) {
      const key = sessionKey(sessionId)
      if (key === '') return
      const active = snapshot !== null && typeof snapshot === 'object'
        && snapshot.active === true && snapshot.sessionId === key
      const missions = active && Array.isArray(snapshot.missions) ? snapshot.missions.length : 0
      const previous = towers.get(key)
      if (previous !== undefined && previous.active === active && previous.missions === missions) return
      towers.set(key, { sessionId: key, active, missions })
      emit()
    },

    /**
     * What was last learnt about one session's tower.
     *
     * @param sessionId - the session.
     * @returns `{ sessionId, active, missions }`, or null when nothing was
     *   heard about it yet.
     */
    towerOf(sessionId) {
      return towers.get(sessionKey(sessionId)) ?? null
    },
  }
}
