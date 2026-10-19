/**
 * Browser half of dsh-hide-empty-workspaces.
 *
 * Workspaces with no sessions are hidden from the native sidebar by marking
 * their group section. Emptiness comes from the Workspace Controller snapshot
 * (`sessionIds`), never from rendered rows: a collapsed group renders no
 * session rows, so counting the DOM would hide working directories.
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

    /**
     * Read the enabled flag.
     * @returns true when the filter should run; storage failures keep the default.
     */
    function enabled() {
      try {
        return localStorage.getItem(STORAGE_KEY) !== '0'
      } catch {
        return true
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
      const workspaces = ctx.get('workspaces')

      const style = document.createElement('style')
      style.setAttribute('data-dsh-hide-empty-style', '')
      style.textContent = `[${ATTR}]{display:none !important}`
      document.head.appendChild(style)

      let frame = 0

      /** Apply the current snapshot to the rendered Workspace rows. */
      function refresh() {
        frame = 0
        const snapshot = workspaces.list.getSnapshot()
        if (!snapshot || snapshot.phase !== 'ready' || !enabled()) {
          clearMarks()
          return
        }
        const empty = new Set()
        for (const item of snapshot.items) {
          const ids = item !== undefined && item !== null ? item.sessionIds : undefined
          if (ids === undefined || ids.length === 0) empty.add(String(item.workspaceId))
        }
        for (const row of document.querySelectorAll(`[data-row-key^="${ROW_PREFIX}"]`)) {
          const key = (row.getAttribute('data-row-key') || '').slice(ROW_PREFIX.length)
          const target = sectionOf(row)
          if (empty.has(key)) target.setAttribute(ATTR, '')
          else target.removeAttribute(ATTR)
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
          if (event.key === STORAGE_KEY) schedule()
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
