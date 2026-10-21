/**
 * Browser half of dsh-hide-empty-workspaces.
 *
 * Two surfaces, one bundle:
 *
 * 1. Sidebar views. A segmented control at the top of the native Workspace
 *    browser switches the session list between `running` (进行中), `done`
 *    (已完成) and `workspaces` (工作空间). The `workspaces` view lists every
 *    Workspace — including ones with no visible Sessions — so a historical
 *    Workspace can start a new Session from its row's native hover action
 *    without being hunted down first. `running` and `done` filter the Session
 *    rows and hide Workspaces left without a matching row.
 *
 * 2. Hide-empty rule (the original behaviour, now expressed as the session
 *    visibility rule). A Session counts when the native browser would render a
 *    row for it: not in the Workspace Controller's archive set (unless opted
 *    in), not blank (unless opted in), and not a subagent child (child rows
 *    live in the parent header's catalog). A Workspace with no visible Session
 *    disappears from the session views. Emptiness comes from the snapshots
 *    (`items[].sessionIds` plus the Session list), never from rendered rows: a
 *    collapsed group renders no session rows, so counting the DOM would hide
 *    working directories.
 *
 * The same bundle contributes a Settings -> Plugins tab that reports status,
 * compares the loaded and installed versions, exposes the toggles and the
 * default view, and offers "re-apply" and "reload page" actions.
 */
window.__ModuleLoader__.load({
  id: 'dsh-hide-empty-workspaces',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const module = { exports: {} }
    const exports = module.exports

    /** Client services: slot registry, locale dictionaries, Workspace and Session snapshots. */
    const inject = ['slots', 'locale', 'workspaces', 'sessions']

    /** Attribute carried by a hidden row or group section. */
    const ATTR = 'data-dsh-hide-empty'
    /** Attribute (and ::after content) carried by the list area when a view matches nothing. */
    const EMPTY_ATTR = 'data-dsh-hide-empty-hint'
    /** Row-key prefix emitted by ui-workspace for one Workspace group. */
    const ROW_PREFIX = 'workspace:'
    /** Row-key prefix emitted by ui-workspace for one Session row. */
    const SESSION_PREFIX = 'session:'
    /** Row-key prefix emitted by ui-workspace for a folded group's "show more" row. */
    const OVERFLOW_PREFIX = 'overflow:'
    /** Setting `0` shows the native, unfiltered browser without uninstalling. */
    const STORAGE_KEY = 'dsh.hideEmptyWorkspaces'
    /** Setting `1` also counts archived sessions as visible. */
    const INCLUDE_ARCHIVED_KEY = 'dsh.hideEmptyWorkspaces.includeArchived'
    /** Setting `1` also counts blank sessions (created, never chatted) as visible. */
    const INCLUDE_BLANK_KEY = 'dsh.hideEmptyWorkspaces.includeBlank'
    /** Persisted sidebar view: `running`, `done` or `workspaces`. */
    const MODE_KEY = 'dsh.hideEmptyWorkspaces.mode'
    /** Host route that reports loaded and installed versions. */
    const STATUS_PATH = '/hide-empty-workspaces/status'
    /** Locale namespace owned by this plugin. */
    const NS = 'hideEmptyWorkspaces'
    /** Version stamped into this client bundle. */
    const VERSION = '0.3.0'
    /** Sidebar views, in segment order. */
    const MODES = ['running', 'done', 'workspaces']
    /** View shown on a fresh profile. */
    const DEFAULT_MODE = 'running'

    /** Chinese copy. */
    const zh = {
      tab: '侧栏筛选',
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
      enabled: '启用侧栏筛选',
      includeArchived: '归档会话也算作有会话',
      includeBlank: '空白会话也算作有会话',
      actions: '操作',
      reapply: '重新应用',
      reload: '刷新页面',
      refreshVersions: '重新检查版本',
      diagnostics: '诊断',
      loadError: '读取版本失败',
      modeLabel: '当前视图',
      defaultView: '默认视图',
      modesLabel: '会话视图',
      modeRunning: '进行中',
      modeDone: '已完成',
      modeWorkspaces: '工作空间',
      emptyRunning: '暂无进行中的会话\n切到「已完成」看历史，或「工作空间」开新会话',
      emptyDone: '暂无已完成的会话\n切到「进行中」或「工作空间」',
    }

    /** English copy. */
    const en = {
      tab: 'Sidebar views',
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
      enabled: 'Enable the sidebar views',
      includeArchived: 'Count archived sessions as visible',
      includeBlank: 'Count blank sessions as visible',
      actions: 'Actions',
      reapply: 'Re-apply',
      reload: 'Reload page',
      refreshVersions: 'Check versions again',
      diagnostics: 'Diagnostics',
      loadError: 'Failed to read versions',
      modeLabel: 'Current view',
      defaultView: 'Default view',
      modesLabel: 'Session views',
      modeRunning: 'In progress',
      modeDone: 'Done',
      modeWorkspaces: 'Workspaces',
      emptyRunning: 'No session is in progress.\nSwitch to Done for history, or Workspaces to start a new session.',
      emptyDone: 'No finished session here.\nSwitch to In progress or Workspaces.',
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
      select: { border: '1px solid var(--dsw-alias-border-default, rgba(128,128,128,.4))', background: 'transparent', color: 'inherit', borderRadius: '8px', padding: '4px 8px', fontSize: '13px' },
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
     * @param name - `enabled`, `includeArchived` or `includeBlank`.
     * @param value - desired boolean.
     */
    function writeFlag(name, value) {
      try {
        if (name === 'includeArchived' || name === 'includeBlank') {
          const key = name === 'includeArchived' ? INCLUDE_ARCHIVED_KEY : INCLUDE_BLANK_KEY
          if (value) localStorage.setItem(key, '1')
          else localStorage.removeItem(key)
          return
        }
        if (value) localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, '0')
      } catch {
        /* Storage unavailable: the filter keeps its in-memory default. */
      }
    }

    /**
     * Read the persisted sidebar view.
     * @returns one of {@link MODES}, or {@link DEFAULT_MODE}.
     */
    function readMode() {
      try {
        const value = localStorage.getItem(MODE_KEY)
        return MODES.includes(value) ? value : DEFAULT_MODE
      } catch {
        return DEFAULT_MODE
      }
    }

    /**
     * Persist the sidebar view.
     * @param mode - one of {@link MODES}.
     */
    function writeMode(mode) {
      try {
        localStorage.setItem(MODE_KEY, mode)
      } catch {
        /* Storage unavailable: the view still switches for this page. */
      }
    }

    /**
     * Localized label of one view.
     * @param t - locale translate bound to this plugin's namespace.
     * @param mode - one of {@link MODES}.
     * @returns the label.
     */
    function modeLabel(t, mode) {
      if (mode === 'running') return t('modeRunning')
      if (mode === 'done') return t('modeDone')
      return t('modeWorkspaces')
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
     * the toggles, the default view and the re-apply/reload actions.
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
      const mode = status.mode === undefined ? flags.mode : status.mode

      return h('div', { style: styles.root },
        h('div', { style: styles.card },
          h('h3', { style: styles.sectionTitle }, t('status')),
          row(t('status'), stateText, status.state === 'error' ? styles.error : undefined),
          row(t('modeLabel'), modeLabel(t, mode)),
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
            t('includeArchived')),
          h('label', { style: styles.check },
            h('input', {
              type: 'checkbox',
              checked: flags.includeBlank,
              onChange: (event) => { props.setFlag('includeBlank', event.target.checked) },
            }),
            t('includeBlank')),
          h('label', { style: styles.check },
            h('span', null, t('defaultView')),
            h('select', {
              style: styles.select,
              value: mode,
              onChange: (event) => { props.setMode(event.target.value) },
            }, MODES.map(option => h('option', { key: option, value: option }, modeLabel(t, option)))))),

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
     * Locate the native sidebar browser root: the element owning both the
     * section label (wide chrome only) and the list area.
     * @returns the root element, or null when the browser is not mounted.
     */
    function browserRoot() {
      const label = document.querySelector('[class*="sectionLabel"]')
      if (label !== null && label.parentElement !== null) {
        const header = label.parentElement
        if (header.parentElement !== null) return header.parentElement
      }
      const area = document.querySelector('[class*="listArea"]')
      return area === null ? null : area.parentElement
    }

    /**
     * Whether the browser renders the collapsed rail instead of the wide column.
     * @param root - the native browser root.
     * @returns true when a rail class is present.
     */
    function isRail(root) {
      for (const name of root.classList) {
        if (name.includes('rail')) return true
      }
      return false
    }

    /**
     * Mount the filter, the sidebar view switch and the settings tab.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hide-empty-workspaces: dictionaries')
      const t = ctx.locale.bind(NS)

      let workspaces
      let sessions
      try {
        workspaces = ctx.get('workspaces')
        sessions = ctx.get('sessions')
      } catch (error) {
        window.__dshHideEmptyWorkspaces = { version: VERSION, state: 'error', error: String(error) }
        throw error
      }

      const listeners = new Set()
      const emit = () => { for (const listener of listeners) listener() }

      const diagnostics = {
        version: VERSION,
        state: 'loading',
        mode: readMode(),
        hidden: [],
        includeArchived: false,
        includeBlank: false,
        error: null,
      }
      window.__dshHideEmptyWorkspaces = diagnostics

      const style = document.createElement('style')
      style.setAttribute('data-dsh-hide-empty-style', '')
      style.textContent = [
        `[${ATTR}]{display:none !important}`,
        '.dsh-hew-modes{display:flex;flex:none;gap:2px;margin:8px 8px 4px;padding:3px;border-radius:8px;background:var(--dsw-alias-bg-layer-1, rgba(127,127,127,.10))}',
        '.dsh-hew-modes button{flex:1 1 0;min-width:0;border:0;background:transparent;color:var(--dsw-alias-label-secondary, inherit);font:inherit;font-size:12px;line-height:18px;padding:4px 6px;border-radius:6px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dsh-hew-modes button:hover{color:var(--dsw-alias-label-primary, inherit)}',
        '.dsh-hew-modes button[aria-selected="true"]{background:var(--dsw-alias-bg-base, #fff);color:var(--dsw-alias-label-primary, inherit);box-shadow:0 1px 2px rgba(0,0,0,.10)}',
        `[class*="listArea"][${EMPTY_ATTR}]::after{content:attr(${EMPTY_ATTR});display:block;padding:16px 12px;color:var(--dsw-alias-label-tertiary, inherit);font-size:12px;line-height:1.6;white-space:pre-line}`,
      ].join('\n')
      document.head.appendChild(style)

      let frame = 0
      let control = null

      /** Build the segmented view switch. */
      function buildControl() {
        const bar = document.createElement('div')
        bar.className = 'dsh-hew-modes'
        bar.setAttribute('role', 'tablist')
        bar.setAttribute('aria-label', t('modesLabel'))
        for (const mode of MODES) {
          const button = document.createElement('button')
          button.type = 'button'
          button.setAttribute('role', 'tab')
          button.dataset.mode = mode
          button.textContent = modeLabel(t, mode)
          button.addEventListener('click', () => { setMode(mode) })
          bar.appendChild(button)
        }
        return bar
      }

      /** Reflect the active view on the switch. */
      function syncControl(mode) {
        if (control === null) return
        for (const button of control.querySelectorAll('button[data-mode]')) {
          button.setAttribute('aria-selected', button.dataset.mode === mode ? 'true' : 'false')
        }
      }

      /** Remove the switch from the DOM (rail chrome, filter off, dispose). */
      function removeControl() {
        if (control !== null) control.remove()
      }

      /** Keep the switch mounted at the top of the wide browser. */
      function ensureControl(mode) {
        const root = browserRoot()
        if (root === null || isRail(root)) {
          removeControl()
          return
        }
        if (control === null) control = buildControl()
        if (!root.contains(control)) root.insertBefore(control, root.firstChild)
        syncControl(mode)
      }

      /** Switch the sidebar view and persist the choice. */
      function setMode(mode) {
        if (!MODES.includes(mode)) return
        writeMode(mode)
        diagnostics.mode = mode
        syncControl(mode)
        reapply()
      }

      /**
       * Classify one Session for the current toggles and views.
       * @param id - Session id from a Workspace membership or a rendered row.
       * @param archived - archive set from the Workspace snapshot.
       * @param summaries - Session summaries by id.
       * @param includeArchived - whether archived sessions count as visible.
       * @param includeBlank - whether blank sessions count as visible.
       * @returns `subagent`, `archived`, `blank`, `running`, `done` or `unknown`.
       */
      function stateOf(id, archived, summaries, includeArchived, includeBlank) {
        const key = String(id)
        const summary = summaries[key]
        if (summary !== undefined && summary !== null && summary.origin === 'subagent') return 'subagent'
        // The archive set is authoritative even before its summary arrives.
        if (!includeArchived && archived.has(key)) return 'archived'
        if (summary === undefined || summary === null) return 'unknown'
        if (summary.blank === true) return includeBlank ? 'done' : 'blank'
        return summary.running === true ? 'running' : 'done'
      }

      /**
       * Whether a Session row is visible in one view.
       * @param state - classification from {@link stateOf}.
       * @param mode - one of {@link MODES}.
       * @returns true when the view keeps that row.
       */
      function stateVisible(state, mode) {
        if (state === 'subagent' || state === 'archived' || state === 'blank') return false
        if (mode === 'running') return state === 'running'
        return state === 'done' || state === 'unknown'
      }

      /** Apply the current snapshots and view to the rendered rows. */
      function refresh() {
        frame = 0
        try {
          const snapshot = workspaces.list.getSnapshot()
          const enabled = readFlag(STORAGE_KEY, true)
          diagnostics.state = snapshot !== undefined && snapshot !== null && snapshot.phase === 'ready'
            ? 'ready'
            : 'waiting'
          if (!enabled || snapshot === undefined || snapshot === null) {
            clearMarks()
            clearEmptyHint()
            removeControl()
            diagnostics.hidden = []
            emit()
            return
          }
          if (diagnostics.state !== 'ready') {
            clearMarks()
            clearEmptyHint()
            diagnostics.hidden = []
            emit()
            return
          }

          const mode = readMode()
          const includeArchived = readFlag(INCLUDE_ARCHIVED_KEY, false)
          const includeBlank = readFlag(INCLUDE_BLANK_KEY, false)
          diagnostics.mode = mode
          diagnostics.includeArchived = includeArchived
          diagnostics.includeBlank = includeBlank

          const archived = new Set((snapshot.archivedSessionIds || []).map(String))
          const summaries = sessionSummaries(sessions)
          const hiddenWorkspaces = new Set()
          let visibleSessions = 0
          for (const item of snapshot.items) {
            const ids = item !== undefined && item !== null && item.sessionIds !== undefined
              ? item.sessionIds
              : []
            let visible = 0
            for (const id of ids) {
              if (stateVisible(stateOf(id, archived, summaries, includeArchived, includeBlank), mode)) visible += 1
            }
            visibleSessions += visible
            if (mode !== 'workspaces' && visible === 0) hiddenWorkspaces.add(String(item.workspaceId))
          }

          for (const workspaceRow of document.querySelectorAll(`[data-row-key^="${ROW_PREFIX}"]`)) {
            const key = (workspaceRow.getAttribute('data-row-key') || '').slice(ROW_PREFIX.length)
            const target = sectionOf(workspaceRow)
            if (hiddenWorkspaces.has(key)) target.setAttribute(ATTR, '')
            else target.removeAttribute(ATTR)
          }
          for (const sessionRow of document.querySelectorAll(`[data-row-key^="${SESSION_PREFIX}"]`)) {
            const id = (sessionRow.getAttribute('data-row-key') || '').slice(SESSION_PREFIX.length)
            const keep = mode !== 'workspaces' && stateVisible(stateOf(id, archived, summaries, includeArchived, includeBlank), mode)
            if (keep) sessionRow.removeAttribute(ATTR)
            else sessionRow.setAttribute(ATTR, '')
          }
          for (const overflowRow of document.querySelectorAll(`[data-row-key^="${OVERFLOW_PREFIX}"]`)) {
            if (mode === 'workspaces') overflowRow.setAttribute(ATTR, '')
            else overflowRow.removeAttribute(ATTR)
          }

          diagnostics.hidden = [...hiddenWorkspaces]
          updateEmptyHint(mode, visibleSessions, snapshot.items.length)
          ensureControl(mode)
          emit()
        } catch (error) {
          diagnostics.state = 'error'
          diagnostics.error = String(error)
          emit()
        }
      }

      /** Show the "nothing in this view" hint over the list area. */
      function updateEmptyHint(mode, visibleSessions, workspaceCount) {
        const area = document.querySelector('[class*="listArea"]')
        if (area === null) return
        if (mode === 'workspaces' || visibleSessions > 0 || workspaceCount === 0) {
          area.removeAttribute(EMPTY_ATTR)
          return
        }
        area.setAttribute(EMPTY_ATTR, t(mode === 'running' ? 'emptyRunning' : 'emptyDone'))
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
        clearEmptyHint()
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
          includeBlank: readFlag(INCLUDE_BLANK_KEY, false),
          mode: readMode(),
        }),
        setFlag: (name, value) => {
          if (name === 'mode') {
            setMode(String(value))
            return
          }
          writeFlag(name, value === true)
          reapply()
        },
        setMode,
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
        const unsubscribeSessions = sessions.list.subscribe(schedule)
        const observer = new MutationObserver(schedule)
        observer.observe(document.body === null ? document.documentElement : document.body, {
          childList: true,
          subtree: true,
        })
        const onStorage = (event) => {
          if (event.key === STORAGE_KEY || event.key === INCLUDE_ARCHIVED_KEY
            || event.key === INCLUDE_BLANK_KEY || event.key === MODE_KEY) schedule()
        }
        window.addEventListener('storage', onStorage)
        schedule()
        return () => {
          unsubscribe()
          unsubscribeSessions()
          observer.disconnect()
          window.removeEventListener('storage', onStorage)
          if (frame !== 0) cancelAnimationFrame(frame)
          removeControl()
          control = null
          style.remove()
          clearMarks()
          clearEmptyHint()
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

    /**
     * Session summaries from the client Session list snapshot.
     * @param sessions - the injected Sessions service.
     * @returns summaries by Session id, or an empty object while loading.
     */
    function sessionSummaries(sessions) {
      const list = sessions.list.getSnapshot()
      if (list === undefined || list === null || list.byId === undefined) return {}
      return list.byId
    }

    /** Drop every hide mark, used while the snapshots are not ready or on dispose. */
    function clearMarks() {
      for (const element of document.querySelectorAll(`[${ATTR}]`)) element.removeAttribute(ATTR)
    }

    /** Drop the list-area hint, used when the view has matches or on dispose. */
    function clearEmptyHint() {
      for (const element of document.querySelectorAll(`[${EMPTY_ATTR}]`)) element.removeAttribute(EMPTY_ATTR)
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
