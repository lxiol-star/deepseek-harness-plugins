window.__ModuleLoader__.load({
  id: 'dsh-notion-session',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState, useSyncExternalStore } = React
    const API = '/api/notion-session'
    const STYLE_ID = 'dsh-notion-session-style'

    const CSS = `
.ns-button{font:inherit;font-size:12px;line-height:1;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:7px 10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}
.ns-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2))}
.ns-button:focus-visible,.ns-icon-button:focus-visible,.ns-tab:focus-visible,.ns-search:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ns-button:disabled{opacity:.55;cursor:wait}.ns-primary{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted);border-color:transparent}
.ns-danger{color:var(--dsw-alias-state-error-primary)}.ns-icon-button{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:22px;cursor:pointer;padding:4px 8px;border-radius:6px}
.ns-icon-button:hover{background:var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2))}.ns-backdrop{position:fixed;inset:0;z-index:900;background:color-mix(in srgb, var(--dsw-alias-label-primary) 32%, transparent);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
.ns-dialog{width:min(980px,100%);height:min(760px,100%);display:flex;flex-direction:column;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 20px 70px color-mix(in srgb, var(--dsw-alias-label-primary) 28%, transparent);overflow:hidden;font:inherit}
.ns-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 22px 14px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.ns-title{font-size:18px;font-weight:650;margin:0 0 5px}.ns-subtitle{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0;line-height:1.5}
.ns-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 22px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.ns-tabs{display:flex;gap:4px;margin-right:auto}.ns-tab{font:inherit;font-size:12px;border:0;border-radius:6px;padding:7px 10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.ns-tab[data-active="true"]{background:var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);font-weight:600}
.ns-search{font:inherit;font-size:12px;min-width:180px;flex:1;max-width:260px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:7px 9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
.ns-status{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 22px;font-size:11px;color:var(--dsw-alias-label-tertiary);border-bottom:1px solid var(--dsw-alias-border-l2)}
.ns-error{margin:10px 22px 0;padding:10px 12px;border:1px solid var(--dsw-alias-state-error-primary);border-radius:8px;color:var(--dsw-alias-state-error-primary);font-size:12px;white-space:pre-wrap}
.ns-notice{margin:10px 22px 0;padding:10px 12px;border:1px solid var(--dsw-alias-state-success-primary);border-radius:8px;color:var(--dsw-alias-state-success-primary);font-size:12px;white-space:pre-wrap}
.ns-list{overflow:auto;padding:12px 22px 22px;display:flex;flex-direction:column;gap:10px;flex:1}
.ns-empty{margin:auto;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.8;padding:40px 12px}
.ns-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-2);padding:14px;display:flex;flex-direction:column;gap:9px}
.ns-card-main{display:flex;align-items:flex-start;gap:12px}.ns-card-copy{min-width:0;flex:1}.ns-card-title{font-size:14px;font-weight:620;margin:0 0 5px;overflow-wrap:anywhere}
.ns-summary{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary);margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.ns-meta{display:flex;gap:6px 12px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:7px}.ns-meta span{overflow-wrap:anywhere}
.ns-badge{flex-shrink:0;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:3px 7px;font-size:10px;color:var(--dsw-alias-label-secondary)}
.ns-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.ns-actions .ns-button{font-size:11px;padding:6px 9px}
.ns-link{color:var(--dsw-alias-label-secondary);font-size:11px;text-decoration:none}.ns-link:hover{text-decoration:underline;color:var(--dsw-alias-label-primary)}
.ns-preview{max-height:260px;overflow:auto;margin:0;padding:12px;border-radius:7px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);font:11px/1.55 monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}
@media(max-width:700px){.ns-backdrop{padding:0}.ns-dialog{height:100%;height:100dvh;border-radius:0}.ns-header,.ns-toolbar,.ns-list{padding-left:14px;padding-right:14px}.ns-header{padding-top:calc(14px + env(safe-area-inset-top))}.ns-list{padding-bottom:calc(22px + env(safe-area-inset-bottom))}.ns-status{padding-left:14px;padding-right:14px}.ns-search{max-width:none}.ns-tabs{width:100%;margin-right:0}.ns-card-main{flex-wrap:wrap}}
@media(pointer:coarse){.ns-button,.ns-tab{min-height:44px;padding-inline:14px}.ns-icon-button{min-width:44px;min-height:44px}.ns-link{display:inline-flex;align-items:center;min-height:44px}}
`

    async function request(action, body = {}) {
      const response = await fetch(API, {
        method: action === 'list' ? 'GET' : 'POST',
        headers: action === 'list' ? undefined : { 'Content-Type': 'application/json' },
        body: action === 'list' ? undefined : JSON.stringify({ action, ...body }),
      })
      const payload = await response.json().catch(() => ({ ok: false, message: `HTTP ${response.status}` }))
      if (!response.ok || payload.ok === false) {
        const error = new Error(payload.message ?? `HTTP ${response.status}`)
        error.code = payload.code ?? 'REQUEST_FAILED'
        throw error
      }
      return payload
    }

    function currentSessionId(sessions) {
      const snapshot = sessions?.list?.getSnapshot?.()
      if (!snapshot?.byId) return null
      for (const row of Object.values(snapshot.byId)) {
        if ((row.retainedBy?.mainView ?? 0) > 0) return row.id
      }
      return null
    }

    function createStore(sessions) {
      let state = {
        open: false, status: 'active', query: '', records: [], loading: false, refreshing: false,
        error: null, notice: null, busy: '', lastSync: null, syncError: null, syncWarnings: [], duplicates: [],
        autoSync: true, syncIntervalSeconds: 300, stale: false,
        createdSessionId: null, createdWarning: null, noticeAction: null,
      }
      const listeners = new Set()
      let loadSeq = 0
      let returnFocus = null
      const emit = () => { for (const listener of listeners) listener() }
      const set = patch => { state = { ...state, ...patch }; emit() }
      const load = async (refresh = false, background = false) => {
        const seq = ++loadSeq
        if (!background) set({ loading: true, error: null })
        else set({ refreshing: true })
        try {
          const params = new URLSearchParams({ status: state.status, query: state.query, limit: '50' })
          if (refresh) params.set('refresh', '1')
          const response = await fetch(`${API}?${params}`, { cache: 'no-store' })
          const payload = await response.json().catch(() => ({ ok: false, message: `HTTP ${response.status}` }))
          if (!response.ok || payload.ok === false) {
            const error = new Error(payload.message ?? `HTTP ${response.status}`)
            error.code = payload.code
            throw error
          }
          if (seq !== loadSeq) return
          set({ records: payload.records ?? [], loading: false, refreshing: false, error: null, lastSync: payload.lastSync,
            syncError: payload.syncError, syncWarnings: payload.syncWarnings ?? [], duplicates: payload.duplicates ?? [], autoSync: payload.autoSync, syncIntervalSeconds: payload.syncIntervalSeconds, stale: payload.stale })
        } catch (error) {
          if (seq !== loadSeq) return
          set({ loading: false, refreshing: false, error: `${error.code ? `${error.code}: ` : ''}${error.message}` })
        }
      }
      const run = async (key, action, body, success) => {
        if (state.busy) return null
        set({ busy: key, error: null, notice: null, noticeAction: null })
        try {
          const result = await request(action, body)
          // A 30-record pull takes tens of seconds; show the affected record at
          // once and reconcile in the background.
          const record = result?.record
          if (record?.slug) {
            const visible = state.status === 'all' || record.state === state.status
            const records = visible
              ? [record, ...state.records.filter(item => item.slug !== record.slug)]
              : state.records.filter(item => item.slug !== record.slug)
            set({ busy: '', records, notice: success(result) ?? null })
            void load(false, true)
          } else {
            set({ busy: '', notice: success(result) ?? null })
            await load(false, true)
          }
          return result
        } catch (error) {
          set({ busy: '', error: `${error.code ? `${error.code}: ` : ''}${error.message}` })
          throw error
        }
      }
      const close = () => {
        set({ open: false })
        const target = returnFocus
        returnFocus = null
        queueMicrotask(() => { if (target?.isConnected) target.focus() })
      }
      const openCreated = async navigation => {
        const sessionId = state.createdSessionId
        if (!sessionId || state.busy) return
        set({ busy: `open:${sessionId}`, error: null })
        try {
          await sessions.refresh()
          navigation.openSession(sessionId)
          const warning = state.createdWarning
          set({ busy: '', createdSessionId: null, createdWarning: null, notice: warning ? `新会话已打开，但需注意：${warning}` : null })
          if (!warning) close()
        } catch (error) {
          set({ busy: '', error: `续接会话已创建（${sessionId}），但目录刷新或打开失败：${error.message}。请用“重试打开”，不要重新创建。` })
        }
      }
      return {
        getSnapshot: () => state,
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
        set, load, close, openCreated,
        open: () => {
          returnFocus = document.activeElement
          set({ open: true, error: null, notice: null, noticeAction: null })
          // Serve the host cache immediately when present, then refresh in the
          // background. A cold first pull still takes 20–30 seconds.
          void load(false)
          setTimeout(() => { if (state.open) void load(true, true) }, 800)
        },
        setStatus: status => { set({ status, records: [], error: null, notice: null, noticeAction: null }); void load(false) },
        setQuery: query => set({ query }),
        archiveCurrent: async stateName => {
          const sessionId = currentSessionId(sessions)
          if (!sessionId) { set({ error: 'NO_CURRENT_SESSION: 请先打开一个已有用户消息的会话' }); return }
          try {
            await run('current', 'archive', { sessionId, state: stateName }, result =>
              `${result.action === 'created' ? '已创建' : '已更新'} Notion 归档${stateName === 'active' ? '' : '，并从 active 列表隐藏'}${result.truncated ? '（正文有截断）' : ''}`)
          } catch { /* The visible error is already in state. */ }
        },
        setRecordState: async (slug, stateName) => {
          try {
            const result = await run(slug, 'state', { slug, state: stateName }, () =>
              stateName === 'active' ? '记录已恢复为 active' : stateName === 'archived' ? '记录已归档；可从“已归档”查看' : '记录已隐藏；可从“已隐藏”查看或恢复')
            if (result) set({ noticeAction: stateName })
          } catch { /* no-op */ }
        },
        dedupe: async slug => {
          if (state.busy) return
          set({ busy: `dedupe:${slug}`, error: null, notice: null })
          try {
            const result = await request('dedupe', { slug })
            set({ busy: '', notice: `已重命名 ${result.renamed?.length ?? 0} 条重复页并置为 hidden` })
            void load(false, true)
          } catch (error) {
            set({ busy: '', error: `${error.code ? `${error.code}: ` : ''}${error.message}` })
          }
        },
        show: slug => request('show', { slug }),
        resume: async (slug, navigation) => {
          let result
          try { result = await run(slug, 'resume', { slug, requesterSessionId: currentSessionId(sessions) ?? undefined }, () => null) }
          catch { return }
          if (!result) return
          // Creation and navigation are separate failure domains. From here on,
          // retries only open this ID and never call the resume endpoint again.
          set({ createdSessionId: result.sessionId, createdWarning: result.warning })
          await openCreated(navigation)
        },
      }
    }

    function formatTime(value) {
      if (!value) return '未知'
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false })
    }

    function RecordRow({ record, store, navigation }) {
      const [expanded, setExpanded] = useState(false)
      const [preview, setPreview] = useState(null)
      const [previewError, setPreviewError] = useState(null)
      const currentBusy = store.getSnapshot().busy
      const thisBusy = currentBusy === record.slug
      const busy = currentBusy !== ''
      const loadPreview = async () => {
        setPreviewError(null)
        try { const result = await store.show(record.slug); setPreview(result); setPreviewError(null) }
        catch (error) { setPreviewError(error.message) }
      }
      const toggle = async () => {
        if (expanded) { setExpanded(false); return }
        setExpanded(true)
        if (preview === null) await loadPreview()
      }
      const stateLabel = record.state === 'archived' ? '已归档' : record.state === 'hidden' ? '已隐藏' : '可续接'
      return h('article', { className: 'ns-card' },
        h('div', { className: 'ns-card-main' },
          h('div', { className: 'ns-card-copy' },
            h('h3', { className: 'ns-card-title' }, record.title || record.slug),
            h('p', { className: 'ns-summary' }, record.summary || '旧记录没有续接摘要；可展开预览后再决定。'),
            h('div', { className: 'ns-meta' },
              h('span', null, `${record.sourceTool || 'unknown'} · ${record.slug}`),
              record.workspacePath ? h('span', null, `目录：${record.workspacePath}`) : null,
              h('span', null, `更新：${formatTime(record.updatedAt)}`),
              record.resumedSessionId ? h('span', null, `已续接：${record.resumedSessionId}`) : null)),
          h('span', { className: 'ns-badge' }, stateLabel)),
        expanded ? (previewError
          ? h('div', { className: 'ns-error' }, previewError, ' ', h('button', { className: 'ns-button', onClick: loadPreview }, '重试预览'))
          : h('pre', { className: 'ns-preview', tabIndex: 0, role: 'region', 'aria-label': `${record.title || record.slug} 的有界正文预览` }, preview ? `${preview.markdown || '（空正文）'}${preview.truncated ? '\n\n[预览仅显示前 20,000 字符]' : ''}` : '正在读取正文…')) : null,
        h('div', { className: 'ns-actions' },
          h('button', { className: 'ns-button ns-primary', disabled: busy, onClick: () => store.resume(record.slug, navigation) }, thisBusy ? '处理中…' : record.resumedSessionId ? '打开续接会话' : '续接到新会话'),
          h('button', { className: 'ns-button', disabled: busy, onClick: toggle }, expanded ? '收起预览' : '预览'),
          record.state !== 'active' ? h('button', { className: 'ns-button', disabled: busy, onClick: () => store.setRecordState(record.slug, 'active') }, '恢复 active') : null,
          record.state !== 'archived' ? h('button', { className: 'ns-button', disabled: busy, onClick: () => store.setRecordState(record.slug, 'archived') }, '归档') : null,
          record.state !== 'hidden' ? h('button', { className: 'ns-button ns-danger', disabled: busy, onClick: () => store.setRecordState(record.slug, 'hidden') }, '隐藏') : null,
          record.url ? h('a', { className: 'ns-link', href: record.url, target: '_blank', rel: 'noreferrer' }, 'Notion 原文 ↗') : null))
    }

    function Panel({ store, sessions, navigation }) {
      const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
      const searchTimer = useRef(null)
      const closeRef = useRef(null)
      const dialogRef = useRef(null)
      const close = useCallback(() => store.close(), [store])
      useEffect(() => {
        if (!state.open) return undefined
        closeRef.current?.focus()
        const keydown = event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            close()
            return
          }
          if (event.key !== 'Tab' || !dialogRef.current) return
          const focusable = Array.from(dialogRef.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]'))
            .filter(element => element.getClientRects().length > 0)
          if (focusable.length === 0) { event.preventDefault(); closeRef.current?.focus(); return }
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
            event.preventDefault(); last.focus()
          } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
            event.preventDefault(); first.focus()
          }
        }
        document.addEventListener('keydown', keydown, true)
        const timer = setInterval(() => {
          const snapshot = store.getSnapshot()
          if (document.visibilityState === 'visible' && !snapshot.busy && !snapshot.loading && !snapshot.refreshing) {
            void store.load(false, true)
          }
        }, 5000)
        return () => { document.removeEventListener('keydown', keydown, true); clearInterval(timer); if (searchTimer.current) clearTimeout(searchTimer.current) }
      }, [state.open, store, close])
      if (!state.open) return null
      const queryChange = event => {
        const query = event.target.value
        store.setQuery(query)
        if (searchTimer.current) clearTimeout(searchTimer.current)
        searchTimer.current = setTimeout(() => { void store.load(false) }, 250)
      }
      const filters = [['active', '可续接'], ['archived', '已归档'], ['hidden', '已隐藏'], ['all', '全部']]
      return h('div', { className: 'ns-backdrop', onMouseDown: event => { if (event.target === event.currentTarget) close() } },
        h('section', { className: 'ns-dialog', ref: dialogRef, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ns-title' },
          h('header', { className: 'ns-header' },
            h('div', null,
              h('h2', { className: 'ns-title', id: 'ns-title' }, 'Notion 会话续接'),
              h('p', { className: 'ns-subtitle' }, '归档是可续接的历史快照，不会删除或原生归档源 DSH 会话。正文仅在有界预览或续接时读取。')),
            h('button', { className: 'ns-icon-button', ref: closeRef, onClick: close, 'aria-label': '关闭 Notion 会话管理' }, '×')),
          h('div', { className: 'ns-toolbar' },
            h('div', { className: 'ns-tabs', role: 'group', 'aria-label': '记录状态筛选' }, filters.map(([value, label]) =>
              h('button', { key: value, className: 'ns-tab', 'aria-pressed': state.status === value, 'data-active': state.status === value, onClick: () => store.setStatus(value) }, label))),
            h('input', { className: 'ns-search', value: state.query, onChange: queryChange, placeholder: '搜索标题、摘要、目录…', 'aria-label': '搜索归档' }),
            h('button', { className: 'ns-button', disabled: state.loading || state.refreshing, onClick: () => store.load(true) }, state.refreshing ? '拉取中…' : '立即拉取'),
            h('button', { className: 'ns-button', disabled: !!state.busy, onClick: () => store.archiveCurrent('active') }, '保存当前'),
            h('button', { className: 'ns-button', disabled: !!state.busy, onClick: () => store.archiveCurrent('archived') }, '保存并归档')),
          h('div', { className: 'ns-status' },
            h('span', null, `${state.autoSync ? `后台每 ${Math.round(state.syncIntervalSeconds / 60)} 分钟自动拉取` : '后台自动拉取已停用'} · 上次同步 ${formatTime(state.lastSync)}${state.stale ? ' · 当前显示缓存' : ''}${state.loading || state.refreshing ? ' · 正在刷新…' : ''}`),
            h('span', null, `${state.records.length} 条记录`)),
          state.error ? h('div', { className: 'ns-error', role: 'alert' }, state.error, ' ',
            h('button', { className: 'ns-button', onClick: () => state.createdSessionId ? store.openCreated(navigation) : store.load(true) }, state.createdSessionId ? '重试打开' : '重试拉取')) : null,
          state.createdSessionId && !state.error ? h('div', { className: 'ns-notice', role: 'status' }, `续接会话已创建：${state.createdSessionId} `,
            h('button', { className: 'ns-button', onClick: () => store.openCreated(navigation) }, '打开会话')) : null,
          state.notice ? h('div', { className: 'ns-notice', role: 'status' }, state.notice, ' ', state.noticeAction ?
            h('button', { className: 'ns-button', onClick: () => store.setStatus(state.noticeAction) }, '查看该状态') : null) : null,
          state.syncError && !state.error ? h('div', { className: 'ns-error', role: 'alert' }, `后台同步失败：${state.syncError.message}`) : null,
          state.syncWarnings.length ? h('div', { className: 'ns-error', role: 'alert' }, `${state.syncWarnings.length} 条记录因 secret 门控未显示；可在 Notion 脱敏后重新拉取。`) : null,
          state.duplicates.length ? h('div', { className: 'ns-error', role: 'alert' },
            `${state.duplicates.length} 组重复记录（同 slug 多条页面）。仅当正文完全一致时可安全合并。 `,
            state.duplicates.map(group => h('button', {
              key: group.slug,
              className: 'ns-button',
              disabled: !!state.busy,
              onClick: () => store.dedupe(group.slug),
            }, `修复 ${group.slug.length > 36 ? `${group.slug.slice(0, 36)}…` : group.slug}`))) : null,
          h('div', { className: 'ns-list' },
            state.loading && state.records.length === 0 ? h('div', { className: 'ns-empty' }, null, '正在从 Notion 拉取…', h('br'), '首次拉取需要逐页读取记录状态，约 20–30 秒；之后会先用缓存打开。') : null,
            !state.loading && !state.error && state.records.length === 0 ? h('div', { className: 'ns-empty' }, null, '这个筛选下暂无记录。', h('br'), '可切换到“全部”，或先保存当前会话。') : null,
            state.records.map(record => h(RecordRow, { key: record.pageId || record.slug, record, store, navigation }))))
      )
    }

    function apply(ctx) {
      const store = createStore(ctx.sessions)
      const navigation = ctx.get('uiWorkspace')
      if (!navigation?.openSession) throw new Error('dsh-notion-session requires uiWorkspace.openSession')
      ctx.effect(() => {
        const previous = document.getElementById(STYLE_ID)
        if (!previous) {
          const style = document.createElement('style')
          style.id = STYLE_ID
          style.textContent = `${CSS}\n.ns-dock-button{margin-inline:4px}`
          document.head.appendChild(style)
          return () => style.remove()
        }
        return () => {}
      }, 'dsh-notion-session: base style')
      ctx.slots.inject('conversation.input.dock', function* () {
        yield ctx.slots.register({ name: 'conversation.input.dock', id: 'dsh-notion-session', order: 60, label: 'Notion 会话续接' }, () =>
          h('button', { className: 'ns-button ns-dock-button', onClick: store.open, title: '打开 Notion 会话归档与续接' }, 'Notion'))
      })
      ctx.slots.inject('shell.overlay', function* () {
        yield ctx.slots.register({ name: 'shell.overlay', id: 'dsh-notion-session', order: 80, label: 'Notion 会话续接' }, () =>
          h(Panel, { store, sessions: ctx.sessions, navigation }))
      })
    }

    module.exports = { apply, inject: ['slots', 'sessions', 'uiWorkspace'], name: 'dsh-notion-session' }
    return module.exports
  },
})
