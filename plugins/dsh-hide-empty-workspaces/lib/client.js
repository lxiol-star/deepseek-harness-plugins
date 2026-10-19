/**
 * Browser half of dsh-hide-empty-workspaces.
 *
 * A Workspace is hidden when it has no *visible* sessions: sessions count when
 * they are not in the Workspace Controller's archive set. Emptiness comes from
 * the snapshot (`items[].sessionIds` minus `archivedSessionIds`), never from
 * rendered rows: a collapsed group renders no session rows, so counting the DOM
 * would hide working directories.
 *
 * Diagnostics are published at `window.__dshHideEmptyWorkspaces` so a running
 * app can confirm the bundle loaded and which Workspaces it hid.
 */
window.__ModuleLoader__.load({
  id: 'dsh-hide-empty-workspaces',
  factory: () => {
    const module = { exports: {} }
    const exports = module.exports

    /** Client service that owns the Host-authoritative Workspace snapshot. */
    const inject = ['workspaces']

    /** Attribute carried by a hidden group section. */
    const ATTR = 'data-dsh-hide-empty'
    /** Row-key prefix emitted by ui-workspace for one Workspace group. */
    const ROW_PREFIX = 'workspace:'
    /** Setting `0` shows empty Workspaces again without uninstalling. */
    const STORAGE_KEY = 'dsh.hideEmptyWorkspaces'
    /** Setting `1` also counts archived sessions as visible. */
    const INCLUDE_ARCHIVED_KEY = 'dsh.hideEmptyWorkspaces.includeArchived'
    /** Plugin version reported by the diagnostics object. */
    const VERSION = '0.1.1'

    /**
     * Read a boolean localStorage flag.
     * @param key - storage key.
     * @param fallback - value used when storage is unavailable.
     * @returns the stored boolean, or the fallback.
     */
    function readFlag(key, fallback) {
      try {
        const value = localStorage.getItem(key)
        return value === null ? fallback : value !== '0'
      } catch {
        return fallback
      }
    }

    /** Drop every hide mark, used while the snapshot is not ready or on dispose. */
    function clearMarks() {
      for (const element of document.querySelectorAll(`[${ATTR}]`)) element.removeAttribute(ATTR)
    }

    /**
     * Resolve what to hide for one row: its group section when that section
     * holds this single Workspace row, otherwise the row itself.
     * @param row - the Workspace row element.
     * @returns the element that carries the hide attribute.
     */
    function sectionOf(row) {
      const parent = row.parentElement
      if (parent === null) return row
      const own = parent.querySelectorAll(`:scope > [data-row-key^="${ROW_PREFIX}"]`)
      return own.length === 1 ? parent : row
    }

    /**
     * Mount the filter and keep it applied across React re-renders.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      const diagnostics = {
        version: VERSION,
        state: 'loading',
        hidden: [],
        includeArchived: false,
        error: null,
      }
      window.__dshHideEmptyWorkspaces = diagnostics

      let workspaces
      try {
        workspaces = ctx.get('workspaces')
      } catch (error) {
        diagnostics.state = 'error'
        diagnostics.error = String(error)
        throw error
      }

      const style = document.createElement('style')
      style.setAttribute('data-dsh-hide-empty-style', '')
      style.textContent = `[${ATTR}]{display:none !important}`
      document.head.appendChild(style)

      let frame = 0

      /** Apply the current snapshot to the rendered Workspace rows. */
      function refresh() {
        frame = 0
        try {
          const snapshot = workspaces.list.getSnapshot()
          diagnostics.state = snapshot !== undefined && snapshot !== null && snapshot.phase === 'ready'
            ? 'ready'
            : 'waiting'
          if (diagnostics.state !== 'ready' || !readFlag(STORAGE_KEY, true)) {
            clearMarks()
            diagnostics.hidden = []
            return
          }
          const includeArchived = readFlag(INCLUDE_ARCHIVED_KEY, false)
          const archived = new Set((snapshot.archivedSessionIds || []).map(String))
          const empty = new Set()
          for (const item of snapshot.items) {
            const ids = item !== undefined && item !== null && item.sessionIds !== undefined
              ? item.sessionIds
              : []
            const visible = includeArchived
              ? ids.length
              : ids.filter((id) => !archived.has(String(id))).length
            if (visible === 0) empty.add(String(item.workspaceId))
          }
          diagnostics.includeArchived = includeArchived
          diagnostics.hidden = [...empty]
          for (const row of document.querySelectorAll(`[data-row-key^="${ROW_PREFIX}"]`)) {
            const key = (row.getAttribute('data-row-key') || '').slice(ROW_PREFIX.length)
            const target = sectionOf(row)
            if (empty.has(key)) target.setAttribute(ATTR, '')
            else target.removeAttribute(ATTR)
          }
        } catch (error) {
          diagnostics.state = 'error'
          diagnostics.error = String(error)
        }
      }

      /** Coalesce snapshot and DOM bursts into one frame. */
      function schedule() {
        if (frame !== 0) return
        frame = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(refresh)
          : setTimeout(refresh, 16)
      }

      ctx.effect(() => {
        const unsubscribe = workspaces.list.subscribe(schedule)
        const observer = new MutationObserver(schedule)
        observer.observe(document.body === null ? document.documentElement : document.body, {
          childList: true,
          subtree: true,
        })
        const onStorage = (event) => {
          if (event.key === STORAGE_KEY || event.key === INCLUDE_ARCHIVED_KEY) schedule()
        }
        window.addEventListener('storage', onStorage)
        schedule()
        return () => {
          unsubscribe()
          observer.disconnect()
          window.removeEventListener('storage', onStorage)
          if (frame !== 0) cancelAnimationFrame(frame)
          style.remove()
          clearMarks()
        }
      }, 'hide-empty-workspaces: filter')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
