/**
 * Browser half of dsh-hide-empty-workspaces.
 *
 * Two surfaces, one bundle:
 *
 * 1. Sidebar views. A segmented control at the top of the native Workspace
 *    browser switches the region between `active` (进行中), `archived` (已归档)
 *    and `workspaces` (工作空间). The `active` view is the native session list
 *    with archived Sessions filtered out and Workspaces left without a visible
 *    Session hidden. The `archived` view renders the archive list itself: the
 *    native browser never renders archived rows (its own archived filter hides
 *    them, and the plugin must not mutate that persisted filter), so this view
 *    lists archived Sessions with their Workspace and an inline "取消归档"
 *    action. The `workspaces` view keeps every Workspace row and folds Session
 *    rows, so a historical Workspace can start a new Session from its native
 *    hover actions without being hunted down first.
 *
 * 2. Hide-empty rule (the original behaviour, now the `active` view's session
 *    visibility rule). A Session counts when the native browser would render a
 *    row for it: not in the Workspace Controller's archive set, not blank
 *    (unless opted in), and not a subagent child (child rows live in the parent
 *    header's catalog). Emptiness comes from the snapshots (`items[].sessionIds`
 *    plus the Session list), never from rendered rows: a collapsed group
 *    renders no session rows, so counting the DOM would hide working
 *    directories.
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
    /** Attribute on the list area while the archive list replaces the native tree. */
    const ARCHIVE_ATTR = 'data-dsh-hew-archive'
    /** Class of the injected archive panel and its rows. */
    const ARCHIVE_CLASS = 'dsh-hew-archive'
    /** Row-key prefix emitted by ui-workspace for one Workspace group. */
    const ROW_PREFIX = 'workspace:'
    /** Row-key prefix emitted by ui-workspace for one Session row. */
    const SESSION_PREFIX = 'session:'
    /** Row-key prefix emitted by ui-workspace for a folded group's "show more" row. */
    const OVERFLOW_PREFIX = 'overflow:'
    /** Setting `0` shows the native, unfiltered browser without uninstalling. */
    const STORAGE_KEY = 'dsh.hideEmptyWorkspaces'
    /** Setting `1` also counts blank sessions (created, never chatted) as visible. */
    const INCLUDE_BLANK_KEY = 'dsh.hideEmptyWorkspaces.includeBlank'
    /** Minutes a fresh blank session keeps its Workspace visible before counting as empty. */
    const BLANK_GRACE_KEY = 'dsh.hideEmptyWorkspaces.blankGraceMinutes'
    /** Default grace period for a newly created blank session. */
    const DEFAULT_BLANK_GRACE_MINUTES = 10
    /** Persisted sidebar view: `active`, `archived` or `workspaces`. */
    const MODE_KEY = 'dsh.hideEmptyWorkspaces.mode'
    /** Host route that reports loaded and installed versions. */
    const STATUS_PATH = '/hide-empty-workspaces/status'
    /** Locale namespace owned by this plugin. */
    const NS = 'hideEmptyWorkspaces'
    /** Version stamped into this client bundle. */
    const VERSION = '0.3.6'
    /** Sidebar views, in segment order. */
    const MODES = ['active', 'archived', 'workspaces']
    /** View shown on a fresh profile. */
    const DEFAULT_MODE = 'active'
    /** Values written by 0.3.0, folded into the active view. */
    const LEGACY_MODES = { running: 'active', done: 'active' }

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
      includeBlank: '空白会话也算作有会话',
      blankGrace: '空白会话宽限期（分钟）',
      blankGraceHint: '新建后多久内仍算作有会话；0 表示立即算空。',
      actions: '操作',
      reapply: '重新应用',
      reload: '刷新页面',
      refreshVersions: '重新检查版本',
      diagnostics: '诊断',
      loadError: '读取版本失败',
      modeLabel: '当前视图',
      defaultView: '默认视图',
      modesLabel: '会话视图',
      modeActive: '进行中',
      modeArchived: '已归档',
      modeWorkspaces: '工作空间',
      emptyActive: '暂无会话\n切到「已归档」看归档会话，或「工作空间」开新会话',
      emptyArchived: '暂无已归档会话',
      archiveCount: '已归档会话 · {n}',
      unarchive: '取消归档',
      openArchived: '取消归档并打开会话',
      collapseGroup: '折叠工作区',
      expandGroup: '展开工作区',
      unarchiveFailed: '取消归档失败',
      noHostActions: '当前宿主未提供工作区操作服务，只能查看。',
      sessionUntitled: '未命名',
      ungrouped: '未分组',
      timeNow: '刚刚',
      timeMinutes: '{n} 分钟前',
      timeHours: '{n} 小时前',
      timeDays: '{n} 天前',
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
      includeBlank: 'Count blank sessions as visible',
      blankGrace: 'Blank session grace (minutes)',
      blankGraceHint: 'How long a new blank session keeps its Workspace visible; 0 means immediately empty.',
      actions: 'Actions',
      reapply: 'Re-apply',
      reload: 'Reload page',
      refreshVersions: 'Check versions again',
      diagnostics: 'Diagnostics',
      loadError: 'Failed to read versions',
      modeLabel: 'Current view',
      defaultView: 'Default view',
      modesLabel: 'Session views',
      modeActive: 'Active',
      modeArchived: 'Archived',
      modeWorkspaces: 'Workspaces',
      emptyActive: 'No session here.\nSwitch to Archived for the archive, or Workspaces to start a new session.',
      emptyArchived: 'No archived sessions',
      archiveCount: 'Archived sessions · {n}',
      unarchive: 'Unarchive',
      openArchived: 'Unarchive and open',
      collapseGroup: 'Collapse workspace',
      expandGroup: 'Expand workspace',
      unarchiveFailed: 'Unarchive failed',
      noHostActions: 'This host exposes no Workspace actions; the list is read-only.',
      sessionUntitled: 'Untitled',
      ungrouped: 'Ungrouped',
      timeNow: 'now',
      timeMinutes: '{n} min ago',
      timeHours: '{n} h ago',
      timeDays: '{n} d ago',
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
      number: { width: '88px', color: 'inherit', background: 'transparent', border: '1px solid var(--dsw-alias-border-default, rgba(128,128,128,.4))', borderRadius: '8px', padding: '4px 8px' },
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
     * @param name - `enabled` or `includeBlank`.
     * @param value - desired boolean.
     */
    function writeFlag(name, value) {
      try {
        if (name === 'includeBlank') {
          if (value) localStorage.setItem(INCLUDE_BLANK_KEY, '1')
          else localStorage.removeItem(INCLUDE_BLANK_KEY)
          return
        }
        if (value) localStorage.removeItem(STORAGE_KEY)
        else localStorage.setItem(STORAGE_KEY, '0')
      } catch {
        /* Storage unavailable: the filter keeps its in-memory default. */
      }
    }

    /**
     * Read the persisted sidebar view, folding 0.3.0's running/done values.
     * @returns one of {@link MODES}.
     */
    function readMode() {
      try {
        const value = localStorage.getItem(MODE_KEY)
        if (MODES.includes(value)) return value
        const legacy = LEGACY_MODES[value]
        return legacy === undefined ? DEFAULT_MODE : legacy
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
      if (mode === 'active') return t('modeActive')
      if (mode === 'archived') return t('modeArchived')
      return t('modeWorkspaces')
    }

    /**
     * Compact relative time label.
     * @param t - locale translate bound to this plugin's namespace.
     * @param updatedAt - epoch milliseconds; absent or zero reads as now.
     * @returns the label.
     */
    function timeLabel(t, updatedAt) {
      const timestamp = typeof updatedAt === 'number' && updatedAt > 0 ? updatedAt : Date.now()
      const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60000)
      if (minutes < 1) return t('timeNow')
      if (minutes < 60) return t('timeMinutes', { n: String(minutes) })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('timeHours', { n: String(hours) })
      return t('timeDays', { n: String(Math.floor(hours / 24)) })
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
              checked: flags.includeBlank,
              onChange: (event) => { props.setFlag('includeBlank', event.target.checked) },
            }),
            t('includeBlank')),
          h('label', { style: styles.check },
            h('span', null, t('blankGrace')),
            h('input', {
              type: 'number',
              min: 0,
              step: 1,
              value: flags.blankGraceMinutes,
              style: styles.number,
              onChange: (event) => { props.setBlankGrace(Number(event.target.value)) },
            })),
          h('div', { style: styles.ok }, t('blankGraceHint')),
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
     * Locate the native sidebar browser root. Several plugins ship a
     * sectionLabel class, so the tree's rows are the anchor: the root is the
     * nearest ancestor with a direct sectionHeader child. Falling back to the
     * list area (only this browser uses that class) covers an empty or rail
     * chrome.
     * @returns the root element, or null when the browser is not mounted.
     */
    function browserRoot() {
      const row = document.querySelector('[data-row-key^="workspace:"], [data-row-key^="session:"], [data-row-key="empty"]')
      if (row !== null) {
        let element = row.parentElement
        for (let depth = 0; element !== null && depth < 20; depth += 1) {
          if (element.querySelector(':scope > [class*="sectionHeader"]') !== null) return element
          element = element.parentElement
        }
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

      /** The Workspace UI service; absent on hosts that do not ship the native browser. */
      const uiWorkspace = () => {
        try {
          return ctx.get('uiWorkspace')
        } catch {
          return undefined
        }
      }

      const listeners = new Set()
      const emit = () => { for (const listener of listeners) listener() }

      const diagnostics = {
        version: VERSION,
        state: 'loading',
        mode: readMode(),
        hidden: [],
        includeBlank: false,
        blankGraceMinutes: DEFAULT_BLANK_GRACE_MINUTES,
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
        `[class*="listArea"][${ARCHIVE_ATTR}] > :not(.${ARCHIVE_CLASS}){display:none !important}`,
        `.${ARCHIVE_CLASS}{display:flex;flex-direction:column;gap:2px;padding:6px 8px 12px;flex:1 1 auto;min-height:0;overflow:auto}`,
        `.${ARCHIVE_CLASS}-head{padding:4px 6px;color:var(--dsw-alias-label-tertiary, inherit);font-size:11px;line-height:16px}`,
        `.${ARCHIVE_CLASS}-group{display:flex;flex-direction:column;min-width:0;padding:2px 0}`,
        `.${ARCHIVE_CLASS}-group-header{display:flex;align-items:center;gap:6px;width:100%;min-width:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:6px;border-radius:6px;cursor:pointer}`,
        `.${ARCHIVE_CLASS}-group-header:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.10))}`,
        `.${ARCHIVE_CLASS}-group-header:focus-visible{outline:1px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4d6bfe));outline-offset:-1px}`,
        `.${ARCHIVE_CLASS}-caret{flex:none;width:10px;color:var(--dsw-alias-label-tertiary, inherit);font-size:10px;line-height:16px;transition:transform .12s ease}`,
        `.${ARCHIVE_CLASS}-group-header[aria-expanded="true"] .${ARCHIVE_CLASS}-caret{transform:rotate(90deg)}`,
        `.${ARCHIVE_CLASS}-group-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary, inherit);font-size:11px;line-height:16px;font-weight:600}`,
        `.${ARCHIVE_CLASS}-group-count{flex:none;color:var(--dsw-alias-label-tertiary, inherit);font-size:11px;line-height:16px}`,
        `.${ARCHIVE_CLASS}-group-rows{display:flex;flex-direction:column;gap:2px;padding-inline-start:16px}`,
        `.${ARCHIVE_CLASS}-group-rows[hidden]{display:none !important}`,
        `.${ARCHIVE_CLASS}-row:not(.${ARCHIVE_CLASS}-row-clickable){cursor:default}`,
        `.${ARCHIVE_CLASS}-row-clickable{cursor:pointer}`,
        `.${ARCHIVE_CLASS}-row-clickable:focus-visible{outline:1px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4d6bfe));outline-offset:-1px}`,
        `.${ARCHIVE_CLASS}-row{display:flex;align-items:center;gap:8px;padding:6px;border-radius:6px}`,
        `.${ARCHIVE_CLASS}-row:hover{background:var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.10))}`,
        `.${ARCHIVE_CLASS}-main{flex:1 1 auto;min-width:0}`,
        `.${ARCHIVE_CLASS}-title{color:var(--dsw-alias-label-primary, inherit);font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
        `.${ARCHIVE_CLASS}-meta{color:var(--dsw-alias-label-tertiary, inherit);font-size:11px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
        `.${ARCHIVE_CLASS}-btn{flex:none;border:1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35));background:transparent;color:var(--dsw-alias-label-secondary, inherit);border-radius:6px;padding:3px 8px;font:inherit;font-size:11px;line-height:16px;cursor:pointer}`,
        `.${ARCHIVE_CLASS}-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary, inherit);border-color:var(--dsw-alias-border-l3, rgba(127,127,127,.55))}`,
        `.${ARCHIVE_CLASS}-btn:disabled{cursor:default;opacity:.6}`,
        `.${ARCHIVE_CLASS}-empty{padding:12px 8px;color:var(--dsw-alias-label-tertiary, inherit);font-size:12px;line-height:1.6}`,
        `.${ARCHIVE_CLASS}-hint{padding:2px 6px 8px;color:var(--dsw-alias-label-tertiary, inherit);font-size:11px;line-height:16px}`,
      ].join('\n')
      document.head.appendChild(style)

      let frame = 0
      let control = null
      let archivePanel = null
      let archiveSignature = ''
      /** Workspace groups the user expanded in the archive view; collapsed by default. */
      const expandedGroups = new Set()

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
       * Classify one Session for the active view's toggles.
       * @param id - Session id from a Workspace membership or a rendered row.
       * @param archived - archive set from the Workspace snapshot.
       * @param summaries - Session summaries by id.
       * @param includeBlank - whether blank sessions count as visible.
       * @returns `subagent`, `archived`, `blank`, `visible` or `unknown`.
       */
      function stateOf(id, archived, summaries, includeBlank, graceMs, now) {
        const key = String(id)
        const summary = summaries[key]
        if (summary !== undefined && summary !== null && summary.origin === 'subagent') return 'subagent'
        // The archive set is authoritative even before its summary arrives.
        if (archived.has(key)) return 'archived'
        if (summary === undefined || summary === null) return 'unknown'
        if (summary.blank === true) {
          if (includeBlank) return 'visible'
          // Unknown age stays visible: missing data must not hide a Workspace.
          if (typeof summary.updatedAt !== 'number') return 'visible'
          return now - summary.updatedAt < graceMs ? 'visible' : 'blank'
        }
        return 'visible'
      }

      /**
       * Whether a Session row belongs to the active view.
       * @param state - classification from {@link stateOf}.
       * @returns true when the row stays visible.
       */
      function stateVisible(state) {
        return state === 'visible' || state === 'unknown'
      }

      /**
       * Archived Sessions rendered by the archive view, newest first.
       * @param snapshot - Workspace snapshot with the archive set.
       * @param summaries - Session summaries by id.
       * @returns display groups, newest Workspace first.
       */
      function archiveEntries(snapshot, summaries) {
        const workspaceOf = (sessionId) => {
          for (const item of snapshot.items) {
            if (item.sessionIds !== undefined && item.sessionIds.includes(sessionId)) return item
          }
          return undefined
        }
        const groups = new Map()
        for (const rawId of snapshot.archivedSessionIds || []) {
          const id = String(rawId)
          const summary = summaries[id]
          if (summary === undefined || summary === null) continue
          if (summary.origin === 'subagent') continue
          const workspace = workspaceOf(id)
          const key = workspace === undefined ? '' : String(workspace.workspaceId)
          let group = groups.get(key)
          if (group === undefined) {
            group = {
              key,
              title: workspace === undefined ? t('ungrouped') : workspaceTitle(workspace),
              rows: [],
            }
            groups.set(key, group)
          }
          group.rows.push({
            id,
            title: typeof summary.title === 'string' && summary.title.trim() !== ''
              ? summary.title.trim()
              : t('sessionUntitled'),
            updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : 0,
          })
        }
        const ordered = [...groups.values()]
        for (const group of ordered) group.rows.sort((left, right) => right.updatedAt - left.updatedAt)
        // The Workspace holding the most recently archived Session leads.
        ordered.sort((left, right) => (right.rows[0].updatedAt - left.rows[0].updatedAt)
          || left.title.localeCompare(right.title))
        return {
          // The panel is DOM the plugin owns; recreating it on every mutation
          // would feed the observer forever. This digest gates the rebuild.
          signature: `${snapshot.archivedSessionIds?.length ?? 0}#${ordered.map(group => `${group.key}:${group.title}:${group.rows
            .map(row => `${row.id}:${row.updatedAt}:${row.title}`)
            .join(',')}`).join('|')}`,
          groups: ordered.map(group => ({
            key: group.key,
            title: group.title,
            entries: group.rows.map(row => ({
              id: row.id,
              title: row.title,
              time: timeLabel(t, row.updatedAt),
            })),
          })),
        }
      }

      /** Remove the injected archive list and its native-content mask. */
      function removeArchivePanel() {
        if (archivePanel !== null) archivePanel.remove()
        archivePanel = null
        archiveSignature = ''
        const area = document.querySelector(`[${ARCHIVE_ATTR}]`)
        if (area !== null) area.removeAttribute(ARCHIVE_ATTR)
      }

      /**
       * Render the archive list over the native tree.
       * @param snapshot - Workspace snapshot with the archive set.
       * @param groups - display groups from {@link archiveEntries}.
       */
      function renderArchivePanel(snapshot, groups) {
        const area = document.querySelector('[class*="listArea"]')
        if (area === null) return
        const rowCount = groups.reduce((sum, group) => sum + group.entries.length, 0)
        const panel = document.createElement('div')
        panel.className = ARCHIVE_CLASS
        panel.setAttribute('role', 'list')
        panel.setAttribute('aria-label', t('modeArchived'))
        const head = document.createElement('div')
        head.className = `${ARCHIVE_CLASS}-head`
        head.textContent = t('archiveCount', { n: String(snapshot.archivedSessionIds?.length ?? rowCount) })
        panel.appendChild(head)
        if (rowCount === 0) {
          const empty = document.createElement('div')
          empty.className = `${ARCHIVE_CLASS}-empty`
          empty.textContent = t('emptyArchived')
          panel.appendChild(empty)
        }
        const service = uiWorkspace()
        if (service === undefined && rowCount > 0) {
          const hint = document.createElement('div')
          hint.className = `${ARCHIVE_CLASS}-hint`
          hint.textContent = t('noHostActions')
          panel.appendChild(hint)
        }
        for (const group of groups) {
          panel.appendChild(archiveGroup(group, service))
        }
        if (archivePanel !== null) archivePanel.remove()
        archivePanel = panel
        area.setAttribute(ARCHIVE_ATTR, '')
        area.appendChild(panel)
      }

      /**
       * One collapsible Workspace group in the archive list. Groups start
       * collapsed (the archive is browsed by Workspace first) and remember the
       * expanded state while the plugin lives.
       * @param group - display group from {@link archiveEntries}.
       * @param service - the Workspace UI service, when the host provides it.
       * @returns the group element.
       */
      function archiveGroup(group, service) {
        const groupElement = document.createElement('div')
        groupElement.className = `${ARCHIVE_CLASS}-group`
        groupElement.setAttribute('role', 'group')
        groupElement.dataset.workspaceKey = group.key
        const expanded = expandedGroups.has(group.key)
        const header = document.createElement('button')
        header.type = 'button'
        header.className = `${ARCHIVE_CLASS}-group-header`
        header.setAttribute('aria-expanded', expanded ? 'true' : 'false')
        header.setAttribute('aria-label', `${expanded ? t('collapseGroup') : t('expandGroup')}: ${group.title}`)
        header.title = group.title
        const caret = document.createElement('span')
        caret.className = `${ARCHIVE_CLASS}-caret`
        caret.setAttribute('aria-hidden', 'true')
        caret.textContent = '▸'
        const title = document.createElement('span')
        title.className = `${ARCHIVE_CLASS}-group-title`
        title.textContent = group.title
        const count = document.createElement('span')
        count.className = `${ARCHIVE_CLASS}-group-count`
        count.textContent = String(group.entries.length)
        header.append(caret, title, count)
        const rows = document.createElement('div')
        rows.className = `${ARCHIVE_CLASS}-group-rows`
        rows.hidden = !expanded
        for (const entry of group.entries) rows.appendChild(archiveRow(entry, service))
        header.addEventListener('click', () => {
          const next = !expandedGroups.has(group.key)
          if (next) expandedGroups.add(group.key)
          else expandedGroups.delete(group.key)
          header.setAttribute('aria-expanded', next ? 'true' : 'false')
          header.setAttribute('aria-label', `${next ? t('collapseGroup') : t('expandGroup')}: ${group.title}`)
          rows.hidden = !next
        })
        groupElement.append(header, rows)
        return groupElement
      }

      /**
       * One archive row: title, Workspace, time and the unarchive action.
       * @param entry - display row from {@link archiveEntries}.
       * @param service - the Workspace UI service, when the host provides it.
       * @returns the row element.
       */
      function archiveRow(entry, service) {
        const rowElement = document.createElement('div')
        rowElement.className = `${ARCHIVE_CLASS}-row`
        rowElement.setAttribute('role', 'listitem')
        rowElement.dataset.sessionId = entry.id
        if (service !== undefined) {
          rowElement.classList.add(`${ARCHIVE_CLASS}-row-clickable`)
          rowElement.tabIndex = 0
          rowElement.title = t('openArchived')
          const view = () => {
            if (rowElement.dataset.busy === '1') return
            rowElement.dataset.busy = '1'
            service.unarchiveSession(entry.id).then(
              () => {
                try {
                  service.openSession(entry.id)
                } catch (error) {
                  console.warn('dsh-hide-empty-workspaces: open archived session failed', error)
                }
                schedule()
              },
              () => { delete rowElement.dataset.busy },
            )
          }
          rowElement.addEventListener('click', (event) => {
            const target = event.target
            if (target instanceof window.Element && target.closest('button') !== null) return
            view()
          })
          rowElement.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            view()
          })
        }
        const main = document.createElement('div')
        main.className = `${ARCHIVE_CLASS}-main`
        const title = document.createElement('div')
        title.className = `${ARCHIVE_CLASS}-title`
        title.textContent = entry.title
        title.title = entry.title
        const meta = document.createElement('div')
        meta.className = `${ARCHIVE_CLASS}-meta`
        meta.textContent = entry.time
        main.append(title, meta)
        const button = document.createElement('button')
        button.type = 'button'
        button.className = `${ARCHIVE_CLASS}-btn`
        button.textContent = t('unarchive')
        button.disabled = service === undefined
        button.addEventListener('click', () => {
          if (service === undefined) return
          button.disabled = true
          service.unarchiveSession(entry.id).then(
            () => { schedule() },
            () => {
              button.disabled = false
              button.textContent = t('unarchiveFailed')
            },
          )
        })
        rowElement.append(main, button)
        return rowElement
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
          if (!enabled || snapshot === undefined || snapshot === null || diagnostics.state !== 'ready') {
            clearMarks()
            clearEmptyHint()
            removeArchivePanel()
            removeControl()
            diagnostics.hidden = []
            emit()
            return
          }

          const mode = readMode()
          const includeBlank = readFlag(INCLUDE_BLANK_KEY, false)
          diagnostics.mode = mode
          diagnostics.includeBlank = includeBlank
          const archived = new Set((snapshot.archivedSessionIds || []).map(String))
          const summaries = sessionSummaries(sessions)

          if (mode === 'archived') {
            clearMarks()
            clearEmptyHint()
            const root = browserRoot()
            if (root !== null && isRail(root)) {
              removeArchivePanel()
              ensureControl(mode)
              diagnostics.hidden = []
              emit()
              return
            }
            const archive = archiveEntries(snapshot, summaries)
            if (archivePanel === null || archiveSignature !== archive.signature) {
              renderArchivePanel(snapshot, archive.groups)
              archiveSignature = archive.signature
            }
            diagnostics.hidden = []
            ensureControl(mode)
            emit()
            return
          }
          removeArchivePanel()

          const hiddenWorkspaces = new Set()
          let visibleSessions = 0
          const graceMs = readGraceMinutes() * 60_000
          const now = Date.now()
          if (mode === 'active') {
            for (const item of snapshot.items) {
              const ids = item !== undefined && item !== null && item.sessionIds !== undefined
                ? item.sessionIds
                : []
              let visible = 0
              for (const id of ids) {
                if (stateVisible(stateOf(id, archived, summaries, includeBlank, graceMs, now))) visible += 1
              }
              visibleSessions += visible
              if (visible === 0) hiddenWorkspaces.add(String(item.workspaceId))
            }
          }

          for (const workspaceRow of document.querySelectorAll(`[data-row-key^="${ROW_PREFIX}"]`)) {
            const key = (workspaceRow.getAttribute('data-row-key') || '').slice(ROW_PREFIX.length)
            const target = sectionOf(workspaceRow)
            if (hiddenWorkspaces.has(key)) target.setAttribute(ATTR, '')
            else target.removeAttribute(ATTR)
          }
          for (const sessionRow of document.querySelectorAll(`[data-row-key^="${SESSION_PREFIX}"]`)) {
            const id = (sessionRow.getAttribute('data-row-key') || '').slice(SESSION_PREFIX.length)
            const keep = mode === 'active'
              && stateVisible(stateOf(id, archived, summaries, includeBlank, graceMs, now))
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
        if (mode !== 'active' || visibleSessions > 0 || workspaceCount === 0) {
          area.removeAttribute(EMPTY_ATTR)
          return
        }
        area.setAttribute(EMPTY_ATTR, t('emptyActive'))
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
          if (event.key === STORAGE_KEY || event.key === INCLUDE_BLANK_KEY || event.key === MODE_KEY) schedule()
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
          removeArchivePanel()
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
     * Display title of one Workspace item.
     * @param item - Workspace snapshot item.
     * @returns the stored title, the path's last segment, or empty.
     */
    function workspaceTitle(item) {
      if (typeof item.title === 'string' && item.title.trim() !== '') return item.title.trim()
      const path = typeof item.path === 'string' ? item.path : ''
      const segments = path.split(/[\\/]/u).filter(Boolean)
      return segments.length === 0 ? '' : segments[segments.length - 1]
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

    /**
     * Read the blank-session grace period.
     * @returns whole minutes, or the default when unset or invalid.
     */
    function readGraceMinutes() {
      try {
        const raw = localStorage.getItem(BLANK_GRACE_KEY)
        if (raw === null) return DEFAULT_BLANK_GRACE_MINUTES
        const value = Number(raw)
        return Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_BLANK_GRACE_MINUTES
      } catch {
        return DEFAULT_BLANK_GRACE_MINUTES
      }
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
