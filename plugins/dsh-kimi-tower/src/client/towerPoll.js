/**
 * The canvas's poller for `/tower/state?sessionId=…&detail=1`.
 *
 * The canvas is a read-only view of a full snapshot, so it polls gently and
 * only while someone can see it:
 *
 *  - it fetches at once when it starts, then every `interval` ms;
 *  - it pauses while the document is hidden and while the user is panning or
 *    zooming (so a new snapshot never re-lays the diagram under a gesture
 *    in progress), and fetches at once when the last pause is lifted;
 *  - a failure backs off (interval, ×2, ×4 … up to `maxBackoff`) instead of
 *    retrying at full speed; a success returns to the normal rhythm;
 *  - an aborted or superseded request counts as nothing.
 *
 * Pauses are keyed by reason, so "hidden" and "gesture" can overlap freely.
 * Nothing here touches `document`, timers being the only platform dependency,
 * which keeps the behaviour testable in node with small intervals.
 */

/** Fetch at once, then this often. The dock polls every second; a full snapshot does not need that. */
export const CANVAS_POLL_INTERVAL = 3000
/** The longest the poller waits between failed attempts. */
export const CANVAS_POLL_MAX_BACKOFF = 30000

/**
 * Whether an error is the fetch being cancelled rather than failing.
 *
 * @param error - what the load rejected with.
 * @returns true for a DOMException abort.
 */
function isAbort(error) {
  return error !== null && typeof error === 'object' && error.name === 'AbortError'
}

/**
 * Create a poller.
 *
 * @param options - `{ load, interval, maxBackoff, onSuccess, onFailure }`.
 *   `load(signal)` returns the next value; `onFailure(error, failures)` is
 *   told how many attempts failed in a row.
 * @returns `{ start, stop, pause, resume, retry, inFlight, paused }`.
 */
export function createPoller(options) {
  const load = options.load
  const interval = Math.max(1, options.interval ?? CANVAS_POLL_INTERVAL)
  const maxBackoff = Math.max(interval, options.maxBackoff ?? CANVAS_POLL_MAX_BACKOFF)
  const pauses = new Set()
  let timer = null
  let started = false
  let running = false
  let catchUp = false
  let generation = 0
  let controller = null
  let failures = 0

  const cancelTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const schedule = delay => {
    if (!started || timer !== null) return
    timer = setTimeout(() => {
      timer = null
      void tick()
    }, delay)
  }

  const tick = async () => {
    // Not started, already busy, or paused: nothing to do now. A pause that is
    // lifted calls `resume`, which fetches at once.
    if (!started || running || pauses.size > 0) return
    running = true
    const mine = generation
    controller = new AbortController()
    try {
      const value = await load(controller.signal)
      if (mine === generation && started) {
        failures = 0
        options.onSuccess?.(value)
      }
    } catch (error) {
      // A pause aborts the request in flight; that is not a failure.
      if (mine === generation && started && !isAbort(error)) {
        failures += 1
        options.onFailure?.(error, failures)
      }
    } finally {
      if (mine === generation) {
        running = false
        controller = null
      }
    }
    if (mine !== generation || !started) return
    // Someone lifted a pause while this request was finishing: catch up now.
    if (catchUp) {
      catchUp = false
      if (pauses.size === 0) {
        void tick()
        return
      }
    }
    if (pauses.size > 0) return
    schedule(failures === 0 ? interval : Math.min(maxBackoff, interval * 2 ** Math.min(failures - 1, 5)))
  }

  return {
    /** Fetch at once and keep polling until stopped. */
    start() {
      if (started) return
      started = true
      void tick()
    },

    /** Stop for good: no timer and no late delivery. */
    stop() {
      started = false
      generation += 1
      cancelTimer()
      controller?.abort()
      controller = null
      running = false
      catchUp = false
    },

    /**
     * Pause for a reason. A request in flight is cancelled.
     *
     * @param reason - a key; the same key must be passed to `resume`.
     */
    pause(reason) {
      pauses.add(reason)
      cancelTimer()
      if (running) controller?.abort()
    },

    /**
     * Lift a pause. When no other reason remains, fetch at once.
     *
     * Resuming a reason that is not pausing does nothing, so an effect that
     * runs twice cannot fetch twice.
     *
     * @param reason - the key passed to `pause`.
     */
    resume(reason) {
      if (!pauses.delete(reason)) return
      if (!started || pauses.size > 0) return
      if (running) {
        catchUp = true
        return
      }
      void tick()
    },

    /**
     * Ask for a request now, ahead of the timer.
     *
     * Does nothing while stopped, busy or paused.
     */
    retry() {
      cancelTimer()
      if (!started || running || pauses.size > 0) return
      void tick()
    },

    /** Whether a request is in flight. */
    inFlight() {
      return running
    },

    /** Whether at least one reason is pausing the poller. */
    paused() {
      return pauses.size > 0
    },
  }
}
