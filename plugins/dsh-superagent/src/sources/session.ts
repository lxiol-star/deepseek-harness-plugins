/**
 * Session Source：操作者在主会话里直接下达的任务。
 *
 * 其它 Source 的请求来自外部平台，要过发送者名单与准入表；这里的一句话由部署的所有者本人说出，
 * 授权来自这段对话本身。本 kind 只做登记与映射，真正的建单由主会话工具 `orchestrator_task`
 * 走 `Engine.operatorTask`（见 src/core/evals.ts 的 operatorRequest）。
 */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'

import type { Trigger } from '../core/index.ts'
import type { SourceKind } from './kind.ts'
import { health, sourceContext } from './host.ts'

export const SOURCE = 'session'

/** 操作者的固定 actor id：它只由主会话工具写入，不来自任何外部输入。 */
export const OPERATOR = 'operator'

export const SessionConfigSchema = z.object({ enabled: z.boolean().default(true) })
export type SessionConfig = z.infer<typeof SessionConfigSchema>

/** 把主会话里的一句任务变成 Trigger；导出让测试直接验证映射。 */
export function sessionTrigger(input: { sessionId: string; text: string; workspaceRoot?: string; at?: string }): Trigger {
  const at = typeof input.at === 'string' && !Number.isNaN(Date.parse(input.at)) ? input.at : new Date().toISOString()
  return {
    id: `session:${input.sessionId}:${at}:${input.text.slice(0, 80)}`,
    source: SOURCE,
    threads: [{ source: SOURCE, id: `session.${input.sessionId}` }],
    actor: { source: SOURCE, id: OPERATOR },
    human: true,
    addressed: 'direct',
    at,
    text: input.text,
    meta: { workspaceRoot: input.workspaceRoot ?? '', sessionId: input.sessionId, topic: 'session.task' },
  }
}

export const sessionKind: SourceKind<SessionConfig> = {
  kind: SOURCE,
  title: { zh: '主会话任务', en: 'Main Session request' },
  description: {
    zh: '你在主会话里直接下达的任务；先记一条事件再开单，不需要外部平台。',
    en: 'Work you ask for in the main Session; recorded as an event, then opened as a ticket, with no external platform.',
  },
  schema: SessionConfigSchema,
  fields: [{ key: 'enabled', type: 'switch', label: { zh: '启用', en: 'Enabled' } }],
  health: ['session'],
  scope: () => ({ listened: true, observed: true, row: 'ambient' }),
}

export const name = 'dsh-superagent-session'
export const inject = ['orchestrator']
export function apply(ctx: Context): void {
  // 这个 Source 没有循环：它由主会话工具写入。注册完就报就绪，否则面板会一直显示“启动中”。
  ctx.effect(() => {
    const dispose = ctx.orchestrator.sources.register(sessionKind)
    sourceContext(ctx.orchestrator, sessionKind).report('session', health('ready', 'sessionReady'))
    return dispose
  }, 'session: source kind')
}
