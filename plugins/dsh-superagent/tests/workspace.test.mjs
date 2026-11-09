/** Workspace source: filesystem event → Trigger mapping and the ambient admission row. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { workspaceTrigger, workspaceTopic, workspaceKind, outermost, SOURCE } from '../lib/workspaces-watch.js'

const config = { roots: [{ path: '/work/tree' }, { path: '/work/tree/project-a' }] }

describe('workspace source', () => {
  it('maps one file event to one Trigger on the workspace thread', () => {
    const t = workspaceTrigger({ root: '/work/tree', file: 'docs/readme.md', kind: 'change', at: '2026-11-08T10:00:00.000Z' }, config)
    assert.ok(t)
    assert.equal(t.source, SOURCE)
    assert.equal(t.threads[0].id, workspaceTopic)
    assert.equal(t.at, '2026-11-08T10:00:00.000Z')
    assert.equal(t.meta.workspaceFile, 'docs/readme.md')
    assert.match(t.text, /docs\/readme\.md/)
  })

  it('attributes a file to the deepest configured root', () => {
    const t = workspaceTrigger({ root: '/work/tree', file: '/work/tree/project-a/src/x.ts', kind: 'change' }, config)
    assert.equal(t.meta.workspaceRoot, '/work/tree/project-a')
    assert.equal(t.meta.workspaceFile, 'src/x.ts')
  })

  it('drops events outside every configured root', () => {
    assert.equal(workspaceTrigger({ root: '/work/tree', file: '/elsewhere/x.ts', kind: 'change' }, config), undefined)
  })

  it('treats workspace activity as senderless, not as a person asking', () => {
    const t = workspaceTrigger({ root: '/work/tree', file: 'a', kind: 'rename' }, config)
    assert.equal(t.human, false)
    assert.equal(t.actor.id, '', 'senderless: no one is asking for work')
    assert.equal(t.addressed, undefined)
  })

  it('drops nested roots so a parent and its children do not watch twice', () => {
    assert.deepEqual(outermost(['/tree', '/tree/a', '/tree/a/b', '/other']), ['/tree', '/other'])
  })

  it('exposes workspace tree labels for the panel picker and persists them', async () => {
    const written = []
    const host = { context: () => ({ state: { set: (_key, value) => written.push(value) } }) }
    const labels = await workspaceKind.refreshLabels(host, undefined)
    assert.equal(typeof labels, 'object')
    assert.equal(written.length, 1, 'labels are written to the Source KV so the settings view can render the picker')
  })

  it('keeps the ambient admission row and no channel adapter', () => {
    assert.equal(workspaceKind.scope({ meta: {} }, { roots: [] }).row, 'ambient')
    assert.equal(workspaceKind.channel, undefined)
  })
})

// 执行落点：工作区触发 → 工单目录落在该工作区内的私有目录；其它触发仍走执行根。
import { ticketDirectory } from '../lib/index.js'

describe('workspace execution target', () => {
  const settings = { executor: { directory: '' } }
  it('keeps the configured execution root for non-workspace triggers', () => {
    assert.equal(ticketDirectory(settings, '/state', 'fix-a', undefined), '/state/work/fix-a')
  })

  it('places a workspace ticket inside that workspace', () => {
    const root = process.cwd()
    const dir = ticketDirectory(settings, '/state', 'fix-a', root)
    assert.equal(dir, `${root}/.dsh-superagent/work/fix-a`)
  })

  it('falls back when the workspace root no longer exists', () => {
    assert.equal(ticketDirectory(settings, '/state', 'fix-a', '/nonexistent/root'), '/state/work/fix-a')
  })
})

// 主会话任务：操作者本人下达的一句话 → Trigger（explicit / direct，带工作区根）。
import { sessionTrigger, OPERATOR } from '../lib/session-watch.js'

describe('session source', () => {
  it('marks the operator request as an explicit direct message', () => {
    const t = sessionTrigger({ sessionId: 'session-abc', text: '把 README 的安装步骤补全', workspaceRoot: '/work/ws', at: '2026-11-09T01:00:00.000Z' })
    assert.equal(t.source, 'session')
    assert.equal(t.human, true)
    assert.equal(t.addressed, 'direct')
    assert.equal(t.actor.id, OPERATOR)
    assert.equal(t.meta.workspaceRoot, '/work/ws')
    assert.equal(t.threads[0].id, 'session.session-abc')
    assert.equal(t.at, '2026-11-09T01:00:00.000Z')
  })
})
