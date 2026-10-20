/**
 * Browser half of dsh-hide-empty-workspaces.
 *
 * A Workspace is hidden when it has no visible sessions: sessions count when
 * they are not in the Workspace Controller's archive set. Emptiness comes from
 * the snapshot (`items[].sessionIds` minus `archivedSessionIds`), never from
 * rendered rows: a collapsed group renders no session rows, so counting the DOM
 * would hide working directories.
 *
 * The same bundle contributes a Settings -> Plugins tab that reports status,
 * compares the loaded and installed versions, exposes both toggles, and offers
 * "re-apply" and "reload page" actions.
 */
window.__ModuleLoader__.load({
  id: 'dsh-hide-empty-workspaces',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const module = { exports: {} }
    const exports = module.exports

    /** Client services: slot registry, locale dictionaries, Workspace snapshot. */
    const inject = ['slots', 'locale', 'workspaces']

    /** Attribute carried by a hidden group section. */
    const ATTR = 'data-dsh-hide-empty'
    /** Row-key prefix emitted by ui-workspace for one Workspace group. */
    const ROW_PREFIX = 'workspace:'
    /** Setting `0` shows empty Workspaces again without uninstalling. */
    const STORAGE_KEY = 'dsh.hideEmptyWorkspaces'
    /** Setting `1` also counts archived sessions as visible. */
    const INCLUDE_ARCHIVED_KEY = 'dsh.hideEmptyWorkspaces.includeArchived'
    /** Host route that reports loaded and installed versions. */
    const STATUS_PATH = '/hide-empty-workspaces/status'
    /** Locale namespace owned by this plugin. */
    const NS = 'hideEmptyWorkspaces'
    /** Version stamped into this client bundle. */
    const VERSION = '0.2.0'

    /** Chinese copy. */
    const zh = {
      tab: '隐藏空工作区',
      status: '状态',
      stateReady: '运行中',
      stateWaiting: '等待工作区快照',
      stateError: '异常',
      hidden: '已隐藏工作区',
      versions: '版本',
      clientVersion: '客户端（已加载）',
      hostVersion: '服务端（已加载）',
      installedVersion: '磁盘（已安装）',
      unknown: '未知',
      staleClient: '客户端 bundle 已过期：刷新页面即可加载新客户端。',
      staleHost: '服务端仍是旧版本：需要完全退出应用后重新打开。',
      upToDate: '已安装版本与已加载版本一致。',
      flags: '开关',
      enabled: '启用过滤',
      includeArchived: '归档会话也算作有会话',
      actions: '操作',
      reapply: '重新应用',
      reload: '刷新页面',
      refreshVersions: '重新检查版本',
      diagnostics: '诊断',
      loadError: '读取版本失败',
    }

    /** English copy. */
    const en = {
      tab: 'Hide empty workspaces',
      status: 'Status',
      stateReady: 'Running',
      stateWaiting: 'Waiting for the workspace snapshot',
      stateError: 'Error',
      hidden: 'Hidden workspaces',
      versions: 'Versions',
      clientVersion: 'Client (loaded)',
      hostVersion: 'Host (loaded)',
      installedVersion: 'On disk (installed)',
      unknown: 'Unknown',
      staleClient: 'The client bundle is stale: reload the page to load the new client.',
      staleHost: 'The host still runs an old version: fully quit and reopen the app.',
      upToDate: 'Loaded versions match the installed package.',
      flags: 'Options',
      enabled: 'Enable the filter',
      includeArchived: 'Count archived sessions as visible',
      actions: 'Actions',
      reapply: 'Re-apply',
      reload: 'Reload page',
      refreshVersions: 'Check versions again',
      diagnostics: 'Diagnostics',
      loadError: 'Failed to read versions',
    }

    /** Inline styles keep the tab readable without shipping a stylesheet. */
    const styles = {
      root: { display: 'grid', gap: '14px', padding: '4px 2px', fontSize: '14px', lineHeight: '1.5' },
      card: { border: '1px solid var(--dsw-alias-border-default, rgba(128,128,128,.28))', borderRadius: '10px', padding: '12px 14px', display: 'grid', gap: '10px' },
      sectionTitle: { fontSize: '12px', opacity: 0.65, letterSpacing: '.04em', textTransform: 'uppercase', margin: 0 },
      row: { display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' },
      label: { minWidth: '150px', opacity: 0.72 },
      value: { fontVariantNumeric: 'tabular-nums' },
      warn: { color: 'var(--dsw-alias-warning-fg, #b45309)' },
      error: { color: 'var(--dsw-alias-danger-fg, #b3261e)' },
      ok: { opacity: 0.72 },
      check: { display: 'flex', gap: '8px', alignItems: 'center' },
      buttons: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
      button: { border: '1px solid var(--dsw-alias-border-default, rgba(128,128,128,.4))', background: 'transparent', color: 'inherit', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '13px' },
      pre: { margin: 0, padding: '10px', borderRadius: '8px', background: 'rgba(128,128,128,.08)', overflowX: 'auto', fontSize: '12px' },
    }

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

    /**
     * Persist one flag using the encoding its default requires.
     * @param name - `enabled` or `includeArchived`.
     * @param value - desired boolean.
     */
    function writeFlag(name, value) {
      try {
        if (name === 'includeArchived') {
          if (value) localStorage.setItem(INCLUDE_ARCHIVED_KEY, '1')
          else localStorage.removeItem(INCLUDE_ARCHIVED_KEY)
          return
        }
        if (value) localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, '0')
      } catch {
        /* Storage unavailable: the filter keeps its in-memory default. */
      }
    }

    /**
     * Build one label/value row.
     * @param label - localized label text.
     * @param value - rendered value.
     * @param style - optional value style.
     * @returns the row element.
     */
    function row(label, value, style) {
      return h('div', { style: styles.row },
        h('span', { style: styles.label }, label),
        h('span', { style: { ...styles.value, ...(style || {}) } }, value))
    }

    /**
     * Settings tab component: reports filter state and version skew, and owns
     * both toggles plus the re-apply/reload actions.
     * @param props - owner props plus locale and injected values.
     * @returns the tab element.
     */
    function SettingsTab(props) {
      const { t } = props
      const [, forceRender] = React.useState(0)
      const [versions, setVersions] = React.useState({ status: 'loading' })

      React.useEffect(() => props.subscribe(() => forceRender((value) => value + 1)), [])

      const loadVersions = React.useCallback(() => {
        let alive = true
        setVersions({ status: 'loading' })
        props.versions().then(
          (value) => { if (alive) setVersions({ status: 'ready', value }) },
          (error) => { if (alive) setVersions({ status: 'error', message: String(error) }) },
        )
        return () => { alive = false }
      }, [])

      React.useEffect(loadVersions, [loadVersions])

      const status = props.status()
      const flags = props.getFlags()
      const stateText = status.state === 'error'
        ? t('stateError')
        : status.state === 'ready' ? t('stateReady') : t('stateWaiting')
      const shown = versions.status === 'ready' ? versions.value : undefined
      const clientVersion = props.clientVersion
      const hostVersion = shown === undefined ? undefined : shown.loadedVersion
      const installedVersion = shown === undefined ? undefined : shown.installedVersion
      const hostStale = hostVersion !== undefined && installedVersion !== undefined && hostVersion !== installedVersion
      const clientStale = installedVersion !== undefined && clientVersion !== installedVersion

      return h('div', { style: styles.root },
        h('div', { style: styles.card },
          h('h3', { style: styles.sectionTitle }, t('status')),
          row(t('status'), stateText, status.state === 'error' ? styles.error : undefined),
          row(t('hidden'), String(status.hidden.length)),
          status.state === 'error' && status.error !== null
            ? row(t('diagnostics'), status.error, styles.error)
            : null),

        h('div', { style: styles.card },
          h('h3', { style: styles.sectionTitle }, t('versions')),
          row(t('clientVersion'), clientVersion),
          row(t('hostVersion'), hostVersion === undefined ? t('unknown') : hostVersion),
          row(t('installedVersion'), installedVersion === undefined ? t('unknown') : installedVersion),
          versions.status === 'error'
            ? h('div', { style: styles.error }, `${t('loadError')}: ${versions.message}`)
            : null,
          hostStale ? h('div', { style: styles.warn }, t('staleHost')) : null,
          !hostStale && clientStale ? h('div', { style: styles.warn }, t('staleClient')) : null,
          !hostStale && !clientStale && versions.status === 'ready'
            ? h('div', { style: styles.ok }, t('upToDate'))
            : null,
          h('div', { style: styles.buttons },
            h('button', { type: 'button', style: styles.button, onClick: loadVersions }, t('refreshVersions')))),

        h('div', { style: styles.card },
          h('h3', { style: styles.sectionTitle }, t('flags')),
          h('label', { style: styles.check },
            h('input', {
              type: 'checkbox',
              checked: flags.enabled,
              onChange: (event) => { props.setFlag('enabled', event.target.checked) },
            }),
            t('enabled')),
          h('label', { style: styles.check },
            h('input', {
              type: 'checkbox',
              checked: flags.includeArchived,
              onChange: (event) => { props.setFlag('includeArchived', event.target.checked) },
            }),
            t('includeArchived'))),

        h('div', { style: styles.card },
          h('h3', { style: styles.sectionTitle }, t('actions')),
          h('div', { style: styles.buttons },
            h('button', { type: 'button', style: styles.button, onClick: props.reapply }, t('reapply')),
            h('button', { type: 'button', style: styles.button, onClick: props.reload }, t('reload')))),

        h('details', null,
          h('summary', null, t('diagnostics')),
          h('pre', { style: styles.pre }, JSON.stringify(status, null, 2))))
    }

    /**
     * Mount the filter and the settings tab.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hide-empty-workspaces: dictionaries')
      const t = ctx.locale.bind(NS)

      let workspaces
      try {
        workspaces = ctx.get('workspaces')
      } catch (error) {
        window.__dshHideEmptyWorkspaces = { version: VERSION, state: 'error', error: String(error) }
        throw error
      }

      const listeners = new Set()
      const emit = () => { for (const listener of listeners) listener() }

      const diagnostics = {
        version: VERSION,
        state: 'loading',
        hidden: [],
        includeArchived: false,
        error: null,
      }
      window.__dshHideEmptyWorkspaces = diagnostics

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
            emit()
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
          for (const workspaceRow of document.querySelectorAll(`[data-row-key^="${ROW_PREFIX}"]`)) {
            const key = (workspaceRow.getAttribute('data-row-key') || '').slice(ROW_PREFIX.length)
            const target = sectionOf(workspaceRow)
            if (empty.has(key)) target.setAttribute(ATTR, '')
            else target.removeAttribute(ATTR)
          }
          emit()
        } catch (error) {
          diagnostics.state = 'error'
          diagnostics.error = String(error)
          emit()
        }
      }

      /** Coalesce snapshot and DOM bursts into one frame. */
      function schedule() {
        if (frame !== 0) return
        frame = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(refresh)
          : setTimeout(refresh, 16)
      }

      /** Clear marks and recompute immediately. */
      function reapply() {
        clearMarks()
        refresh()
      }

      const injected = () => ({
        clientVersion: VERSION,
        status: () => ({ ...diagnostics, hidden: [...diagnostics.hidden] }),
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        getFlags: () => ({
          enabled: readFlag(STORAGE_KEY, true),
          includeArchived: readFlag(INCLUDE_ARCHIVED_KEY, false),
        }),
        setFlag: (name, value) => {
          writeFlag(name, value === true)
          reapply()
        },
        reapply,
        reload: () => { window.location.reload() },
        versions: async () => {
          const response = await fetch(STATUS_PATH, { cache: 'no-store' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return await response.json()
        },
      })

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
          listeners.clear()
        }
      }, 'hide-empty-workspaces: filter')

      ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'hide-empty-workspaces',
        order: 60,
        label: () => t('tab'),
        locale: NS,
        inject: injected,
      }, SettingsTab))
    }

    /** Drop every hide mark, used while the snapshot is not ready or on dispose. */
    function clearMarks() {
      for (const element of document.querySelectorAll(`[${ATTR}]`)) element.removeAttribute(ATTR)
    }

    /**
     * Resolve what to hide for one row: its group section when that section
     * holds this single Workspace row, otherwise the row itself.
     * @param workspaceRow - the Workspace row element.
     * @returns the element that carries the hide attribute.
     */
    function sectionOf(workspaceRow) {
      const parent = workspaceRow.parentElement
      if (parent === null) return workspaceRow
      const own = parent.querySelectorAll(`:scope > [data-row-key^="${ROW_PREFIX}"]`)
      return own.length === 1 ? parent : workspaceRow
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
