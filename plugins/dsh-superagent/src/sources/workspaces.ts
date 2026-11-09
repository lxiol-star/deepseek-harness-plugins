/**
 * Workspace Source：本地工作区树就是部署的工作范围。
 *
 * 远端 Source 都需要账号与凭据；本地工作区树两者都没有。这个 kind 把配置的
 * 根目录（工作区树的上层目录，或单个工作区）枚举出来，把其中的文件活动变成
 * Trigger，于是工单可以由本地工作发起，而不是某个 GitHub 仓库。
 *
 * 与 MSP 的区别：MSP 听的是别的软件主动推来的信号；这里由本插件自己盯着目录。
 * 两者都是 senderless 的机器事件，Policy 按 `inferred` 候选处理。
 */
import { readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'

import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'

import type { Trigger } from '../core/index.ts'
import { KV } from '../kv.ts'
import { health, sourceContext, type SourceContext, type SourceHost } from './host.ts'
import type { Localized, SourceKind } from './kind.ts'

export const SOURCE = 'workspace'

/** 目录名里出现这些片段就不看（默认忽略；可在面板里按行覆盖）。 */
const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'lib', '.pnpm-store', '.cache', 'tmp']

/** DSH 工作区注册表的最小结构；插件跑在 DSH 里时由 apply 注入。没有它也能用：那就只能手填路径。 */
interface WorkspaceRegistryLike { list(): ReadonlyArray<{ id: string; path: string; title: string }> }
let registry: WorkspaceRegistryLike | undefined

/** 去掉被其它根目录包含的路径，避免父子目录同时递归监听造成重复事件。 */
export function outermost(paths: readonly string[]): string[] {
  const sorted = [...new Set(paths)].sort((left, right) => left.length - right.length)
  const kept: string[] = []
  for (const path of sorted) {
    if (kept.some(parent => path === parent || path.startsWith(parent.endsWith('/') ? parent : `${parent}/`))) continue
    kept.push(path)
  }
  return kept
}

/** DSH 把工作区表存在 `$DSH_HOME/storages/workspace.json`；服务拿不到时直接读它。 */
export function dshWorkspaces(): Array<{ path: string; title: string }> {
  const home = process.env.DSH_HOME ?? `${homedir()}/.dsh`
  for (const file of [`${home}/storages/workspace.json`]) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { tables?: { workspaces?: Record<string, { path?: string; title?: string }> } }
      const rows = Object.values(raw.tables?.workspaces ?? {})
      return rows.flatMap(row => typeof row.path === 'string' && row.path !== ''
        ? [{ path: row.path, title: row.title ?? row.path.split('/').filter(Boolean).pop() ?? row.path }]
        : [])
    } catch { /* 没有这份存储就退回手动路径 */ }
  }
  return []
}

export const WorkspaceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** 要盯的工作区树根目录；一行一个路径。 */
  roots: z.array(z.object({ path: z.string() })).default([]),
  /** 忽略的目录名片段（不是 glob，命中片段即跳过）。 */
  ignore: z.array(z.object({ pattern: z.string() })).default(DEFAULT_IGNORE.map(pattern => ({ pattern }))),
  /** 同一文件的连续事件合并窗口。 */
  debounceMs: z.number().int().min(200).max(60_000).default(1500),
})
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>

/** 一个文件事件的主题固定为 path 前两段，同主题的后续会路由到同一 Worker。 */
export const workspaceTopic = 'workspace.file'

/** 把一次文件活动变成 Trigger；导出让测试直接验证映射。 */
export function workspaceTrigger(event: { root: string; file: string; kind: string; at?: string }, config: Pick<WorkspaceConfig, 'roots'>): Trigger | undefined {
  const absolute = event.file.startsWith('/') ? event.file : join(event.root, event.file)
  const root = (config.roots ?? []).map(entry => entry.path).filter(Boolean)
    .filter(path => absolute === path || absolute.startsWith(`${path}/`))
    .sort((left, right) => right.length - left.length)[0]
  if (root === undefined) return undefined
  const at = typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at)) ? event.at : new Date().toISOString()
  const file = relative(root, absolute) || '.'
  return {
    id: `workspace:${root}:${file}:${at}`,
    source: SOURCE,
    threads: [{ source: SOURCE, id: workspaceTopic }],
    // 机器事件没有发送者：空 actor 让 Policy 按 inferred 候选处理，而不是假装有人下了指令。
    actor: { source: SOURCE, id: '' },
    human: false,
    at,
    text: `${file}\n${event.kind}`,
    meta: { workspaceRoot: root, workspaceFile: file, workspaceEvent: event.kind, topic: workspaceTopic },
  }
}

export const workspaceKind: SourceKind<WorkspaceConfig> = {
  kind: SOURCE,
  title: { zh: '本地工作区树', en: 'Local workspace tree' },
  description: {
    zh: '把本地工作区树里的文件活动变成事件：不依赖 GitHub，也没有账号与凭据。',
    en: 'Turns activity inside local workspace roots into events; no GitHub account, no credentials.',
  },
  schema: WorkspaceConfigSchema,
  fields: [
    { key: 'roots', label: { zh: '工作区树根目录', en: 'Workspace roots' }, hint: { zh: '留空则自动接入 DSH 的工作区树；也可以只列几个目录', en: 'Leave empty to use the DSH workspace tree; or list a few roots' }, type: 'rows', columns: [{ key: 'path', label: { zh: '路径', en: 'Path' }, type: 'text', choose: { zh: '选择本机工作区', en: 'Choose a workspace' }, refresh: { zh: '刷新工作区列表', en: 'Refresh workspaces' } }] },
    { key: 'ignore', label: { zh: '忽略的目录', en: 'Ignored segments' }, hint: { zh: '命中片段即跳过', en: 'A matching segment is skipped' }, type: 'rows', advanced: true, columns: [{ key: 'pattern', label: { zh: '片段', en: 'Segment' }, type: 'text' }] },
    { key: 'debounceMs', label: { zh: '合并窗口（毫秒）', en: 'Debounce (ms)' }, hint: { zh: '同一文件的连续事件合并', en: 'Merges consecutive events for one file' }, type: 'number', min: 200, max: 60_000, advanced: true },
  ],
  health: ['workspace'],
  /** 机器事件全部在范围内、也被观察到；`row` 指向 Policy 的 ambient 行。 */
  scope: () => ({ listened: true, observed: true, row: 'ambient' }),
  /** 把本机工作区树暴露给面板的“选择本机工作区”下拉框：值为路径，标签为工作区标题。 */
  refreshLabels: (host: SourceHost) => {
    const rows = registry?.list() ?? dshWorkspaces()
    const labels: Record<string, string> = {}
    for (const workspace of rows) {
      const title = workspace.title || workspace.path.split('/').filter(Boolean).pop() || workspace.path
      labels[workspace.path] = title
    }
    // 面板的“选择本机工作区”下拉读的是这份 KV：kind 自己写入，否则刷新按钮只会算一遍又丢掉。
    sourceContext(host, workspaceKind).state.set(KV.sources.labels(SOURCE), labels)
    return Promise.resolve(labels)
  },
  environment: {
    variables: [
      { key: 'DSH_SUPERAGENT_WORKSPACE_ROOT', description: { zh: '触发本工单的工作区根目录', en: 'The workspace root that started this ticket' } },
      { key: 'DSH_SUPERAGENT_WORKSPACE_FILE', description: { zh: '触发本工单的文件（相对根目录）', en: 'The file (relative to the root) that started this ticket' } },
    ],
    values: ({ trigger }) => ({
      DSH_SUPERAGENT_WORKSPACE_ROOT: trigger?.source === SOURCE ? String(trigger.meta.workspaceRoot ?? '') : '',
      DSH_SUPERAGENT_WORKSPACE_FILE: trigger?.source === SOURCE ? String(trigger.meta.workspaceFile ?? '') : '',
    }),
  },
}

const available = (ctx: SourceContext): WorkspaceConfig | undefined => {
  const config = ctx.config<WorkspaceConfig>(SOURCE)
  if (!config || config.enabled === false) {
    ctx.report('workspace', health('paused', 'sourceOff'))
    return undefined
  }
  return config
}

const ignored = (path: string, config: WorkspaceConfig): boolean => {
  const segments = path.split(/[\\/]/u).filter(Boolean)
  const patterns = (config.ignore ?? []).map(entry => entry.pattern).filter(Boolean)
  return patterns.some(pattern => segments.includes(pattern))
}

/** 盯住配置的工作区根目录，把文件活动送进 Engine。 */
export async function runWorkspaces(ctx: SourceContext, signal: AbortSignal): Promise<unknown> {
  const config = available(ctx)
  if (!config) return
  const configured = (config.roots ?? []).map(entry => entry.path).filter(Boolean)
  // 没填根目录就自动接入 DSH 的工作区树：这就是“本地工作区树”本身。
  // 自动接入时排除 DSH 自己的家目录与插件状态目录：否则会盯上自己的会话/数据库，
  // 每次写入又产生新事件，形成自激循环。
  const home = (process.env.DSH_HOME ?? `${homedir()}/.dsh`).replace(/\/+$/, '')
  const stateDir = (ctx.deployment?.stateDir ?? '').replace(/\/+$/, '')
  const safe = (path: string): boolean => {
    const under = (parent: string): boolean => parent !== '' && (path === parent || path.startsWith(`${parent}/`))
    return !under(home) && !under(stateDir)
  }
  const discovered = configured.length > 0 ? [] : (registry?.list()?.map(workspace => workspace.path) ?? dshWorkspaces().map(workspace => workspace.path)).filter(safe)
  const roots = outermost(configured.length > 0 ? configured : discovered)
  const auto = configured.length === 0 && roots.length > 0
  if (roots.length === 0) {
    ctx.report('workspace', health('paused', 'workspaceNoRoots'))
    return
  }
  const watchers: FSWatcher[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let watching = 0
  for (const root of roots) {
    try {
      if (!statSync(root).isDirectory()) {
        ctx.report('workspace', health('error', 'workspaceRootMissing', { path: root }))
        continue
      }
    } catch {
      ctx.report('workspace', health('error', 'workspaceRootMissing', { path: root }))
      continue
    }
    try {
      // macOS 的 fs.watch 支持 recursive；其它平台递归不可用时会抛错，这里按根目录退化成单层。
      const watcher = watch(root, { recursive: process.platform !== 'linux' }, (event, filename) => {
        if (filename === null || ignored(String(filename), config)) return
        const file = String(filename)
        const key = `${root}:${file}`
        const timer = timers.get(key)
        if (timer !== undefined) clearTimeout(timer)
        timers.set(key, setTimeout(() => {
          timers.delete(key)
          const trigger = workspaceTrigger({ root, file, kind: String(event) }, config)
          if (trigger === undefined) return
          void Promise.resolve(ctx.receive(trigger)).catch(error => {
            ctx.report('workspace', { state: 'error', detail: `receive failed: ${String(error).slice(0, 200)}` })
          })
        }, config.debounceMs))
      })
      watchers.push(watcher)
      watching += 1
    } catch (error) {
      ctx.report('workspace', { state: 'error', detail: `watch failed: ${String(error).slice(0, 200)}` })
    }
  }
  if (watching === 0) return
  ctx.report('workspace', health('ready', 'workspaceWatching', { count: String(watching) }))
  if (auto) ctx.report('workspace', { state: 'ready', detail: `DSH workspace tree: ${watching} workspace(s)` })
  signal.addEventListener('abort', () => {
    for (const timer of timers.values()) clearTimeout(timer)
    for (const watcher of watchers) { try { watcher.close() } catch { /* 已经关了 */ } }
  }, { once: true })
  return undefined
}

export const name = 'dsh-superagent-workspaces'
export const inject = ['orchestrator']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(workspaceKind), 'workspace: source kind')
  let current: { controller: AbortController; running: Promise<unknown> } | undefined
  const start = (): void => {
    const controller = new AbortController()
    current = { controller, running: runWorkspaces(sourceContext(ctx.orchestrator, workspaceKind), controller.signal) }
  }
  start()
  ctx.effect(() => () => {
    current?.controller.abort()
    void current?.running
  }, 'workspace: stop')
  // DSH 的工作区注册表可能晚于本插件就绪：它一到就重启一次监听，把工作区树接进来。
  ctx.inject(['workspaceRegistry'], (scoped: Context) => {
    const candidate = (scoped as unknown as { get?: (name: string) => unknown }).get?.('workspaceRegistry')
    if (candidate === undefined || candidate === null) return
    if (typeof (candidate as WorkspaceRegistryLike).list !== 'function') return
    registry = candidate as WorkspaceRegistryLike
    current?.controller.abort()
    start()
  })
}

export type { Localized }
