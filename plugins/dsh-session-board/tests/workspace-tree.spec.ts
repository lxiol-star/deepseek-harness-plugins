import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildEntry } from '../src/shared/board.ts'
import { groupEntries } from '../src/shared/order.ts'
import { EMPTY_FEED, type BoardSessionInput } from '../src/shared/types.ts'
import { buildWorkspaceNodes, workspaceKey } from '../src/client/workspace-tree.ts'
import { createWorkspaceMeta } from '../src/client/workspace-meta.ts'
import { STYLESHEET } from '../src/client/css.ts'
import type { WorkspaceGitInfo } from '../src/shared/workspace-meta.ts'

const base: BoardSessionInput = {
  id: 's1', title: 'one', workspaceTitle: 'i-ai-gw', workspaceId: 'wa', workspacePath: '/repo/i-ai-gw',
  isSubagent: false, parentId: null, running: false, pendingInteraction: null, completionUnread: false,
  retainedMainView: false, updatedAt: 1_000, tokenUsage: null, sessionStats: null, turnOutline: null,
  runningSubagentCount: 0, liveJobCount: 0,
}
const build = (overrides: Partial<BoardSessionInput>) => buildEntry({ ...base, ...overrides }, { now: 10_000, feed: EMPTY_FEED })

const entries = [
  build({ id: 's1', title: 'gateway main', workspaceId: 'wa', workspaceTitle: 'i-ai-gw', workspacePath: '/repo/i-ai-gw' }),
  build({ id: 's2', title: 'tpm branch', workspaceId: 'wb', workspaceTitle: 'i-ai-gw-tpm', workspacePath: '/repo/i-ai-gw-tpm' }),
  build({ id: 's3', title: 'plain dir', workspaceId: 'wc', workspaceTitle: 'plain', workspacePath: '/repo/plain' }),
]
const groups = groupEntries(entries)

/** Two branches of one repository plus one non-git directory. */
const meta: Record<string, WorkspaceGitInfo> = {
  wa: {
    workspaceId: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', branch: 'feat/main',
    projectKey: 'git.zyql.com/it-eff-lab/i-ai-gw', projectLabel: 'i-ai-gw', remote: 'git@git.zyql.com:it-eff-lab/i-ai-gw.git',
  },
  wb: {
    workspaceId: 'wb', title: 'i-ai-gw-tpm', path: '/repo/i-ai-gw-tpm', branch: 'feat/tpm',
    projectKey: 'git.zyql.com/it-eff-lab/i-ai-gw', projectLabel: 'i-ai-gw', remote: 'git@git.zyql.com:it-eff-lab/i-ai-gw.git',
  },
}

describe('workspace tree', () => {
  it('keys a workspace by id, then path, then title', () => {
    const first = entries[0]
    if (first === undefined) throw new Error('fixture entry missing')
    expect(workspaceKey(first)).toBe('wa')
    const withoutId = { ...first }
    delete withoutId.workspaceId
    expect(workspaceKey(withoutId)).toBe('/repo/i-ai-gw')
    const pathOnly = { ...withoutId }
    delete pathOnly.workspacePath
    expect(workspaceKey(pathOnly)).toBe('i-ai-gw')
  })

  it('groups branches of one repository under their project', () => {
    const roots = buildWorkspaceNodes(groups, true, meta)
    const project = roots.find(node => node.kind === 'project')
    expect(project?.title).toBe('i-ai-gw')
    expect(project?.projectKey).toBe('git.zyql.com/it-eff-lab/i-ai-gw')
    expect(project?.path).toBe('git@git.zyql.com:it-eff-lab/i-ai-gw.git')
    expect(project?.children.map(child => child.title)).toEqual(['i-ai-gw', 'i-ai-gw-tpm'])
    expect(project?.children.map(child => child.subtitle)).toEqual(['feat/main', 'feat/tpm'])
    expect(project?.children.map(child => child.count)).toEqual([1, 1])
    expect(project?.count).toBe(2)
  })

  it('keeps branches without sessions in the project tree', () => {
    const metaWithIdle = {
      ...meta,
      wd: {
        workspaceId: 'wd', title: 'i-ai-gw-idle', path: '/repo/i-ai-gw-idle', branch: 'feat/idle',
        projectKey: 'git.zyql.com/it-eff-lab/i-ai-gw', projectLabel: 'i-ai-gw', remote: 'git@git.zyql.com:it-eff-lab/i-ai-gw.git',
      },
    }
    const roots = buildWorkspaceNodes(groups, true, metaWithIdle)
    const project = roots.find(node => node.kind === 'project')
    expect(project?.children.map(child => child.title)).toContain('i-ai-gw-idle')
    expect(project?.children.find(child => child.title === 'i-ai-gw-idle')?.count).toBe(0)
  })

  it('keeps non-git workspaces in the path fallback tree', () => {
    const roots = buildWorkspaceNodes(groups, true, meta)
    const pathRoot = roots.find(node => node.kind !== 'project')
    // A single non-git workspace compacts its one-child directory chain.
    expect(pathRoot?.title).toBe('repo/plain')
    expect(pathRoot?.count).toBe(1)
    expect(pathRoot?.entries.map(entry => entry.id)).toEqual(['s3'])
  })

  it('falls back to the path tree when no git metadata is available', () => {
    const roots = buildWorkspaceNodes(groups, true, {})
    expect(roots.map(node => node.kind)).toEqual(['path'])
    expect(roots[0]?.children.map(child => child.title)).toEqual(['i-ai-gw', 'i-ai-gw-tpm', 'plain'])
    expect(roots[0]?.count).toBe(3)
  })

  it('keeps the flat workspace grouping unchanged', () => {
    const roots = buildWorkspaceNodes(groups, false, meta)
    expect(roots.map(node => node.title)).toEqual(['i-ai-gw', 'i-ai-gw-tpm', 'plain'])
    expect(roots.every(node => node.children.length === 0)).toBe(true)
    expect(roots.map(node => node.count)).toEqual([1, 1, 1])
    // Git metadata only shapes the project tree, never the flat workspace view.
    expect(roots.every(node => node.projectKey === undefined)).toBe(true)
  })

  it('adds a session-less branch once, with its branch subtitle and zero count', () => {
    const metaWithIdle: Record<string, WorkspaceGitInfo> = {
      ...meta,
      wd: {
        workspaceId: 'wd', title: 'i-ai-gw-idle', path: '/repo/i-ai-gw-idle', branch: 'feat/idle',
        projectKey: 'git.zyql.com/it-eff-lab/i-ai-gw', projectLabel: 'i-ai-gw',
      },
    }
    const roots = buildWorkspaceNodes(groups, true, metaWithIdle)
    const project = roots.find(node => node.kind === 'project')
    expect(project?.children.map(child => child.key)).toEqual([
      'tree-workspace:wa', 'tree-workspace:wd', 'tree-workspace:wb',
    ])
    const idle = project?.children.find(child => child.key === 'tree-workspace:wd')
    expect(idle).toMatchObject({ title: 'i-ai-gw-idle', subtitle: 'feat/idle', count: 0, entries: [] })
    // A zero-count branch does not change the project's session count.
    expect(project?.count).toBe(2)
  })

  it('never lists a branch twice when the same workspace already has sessions', () => {
    const roots = buildWorkspaceNodes(groups, true, meta)
    const project = roots.find(node => node.kind === 'project')
    expect(project?.children).toHaveLength(2)
    expect(project?.count).toBe(2)
    const keys = project?.children.map(child => child.key) ?? []
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('renders the project hierarchy when the board has no sessions at all', () => {
    const roots = buildWorkspaceNodes([], true, meta)
    expect(roots.map(node => node.kind)).toEqual(['project'])
    const project = roots[0]
    expect(project?.count).toBe(0)
    expect(project?.children.map(child => [child.title, child.count, child.subtitle])).toEqual([
      ['i-ai-gw', 0, 'feat/main'],
      ['i-ai-gw-tpm', 0, 'feat/tpm'],
    ])
  })
})

/** A JSON route response double; the cache reads only `ok` and `json()`. */
function metaResponse(payload: unknown, ok = true): { ok: boolean; json: () => Promise<unknown> } {
  return { ok, json: async () => payload }
}

const gitRow = { workspaceId: 'wa', title: 'i-ai-gw', path: '/repo/i-ai-gw', branch: 'feat/main', projectKey: 'github.com/me/i-ai-gw' }

describe('workspace metadata cache', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('caches a successful load for the ttl window and refreshes only when forced', async () => {
    // The host clock is not the client cache clock: an old `generatedAt` must
    // not make a just-received map look stale.
    const fetch = vi.fn(async () => metaResponse({ ok: true, generatedAt: 0, workspaces: [gitRow] }))
    vi.stubGlobal('fetch', fetch)
    const workspaceMeta = createWorkspaceMeta()
    await workspaceMeta.load()
    expect(workspaceMeta.store.getSnapshot()).toMatchObject({ status: 'ready' })
    expect(workspaceMeta.store.getSnapshot().byId.wa?.branch).toBe('feat/main')
    await workspaceMeta.load()
    expect(fetch).toHaveBeenCalledTimes(1)
    await workspaceMeta.load(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('dedupes concurrent loads and retries immediately after a failed load', async () => {
    let rejectFirst: ((reason: unknown) => void) | undefined
    const fetch = vi.fn()
      .mockImplementationOnce(async () => await new Promise<never>((_resolve, reject) => { rejectFirst = reject }))
      .mockImplementation(async () => metaResponse({ ok: true, generatedAt: 0, workspaces: [gitRow] }))
    vi.stubGlobal('fetch', fetch)
    const workspaceMeta = createWorkspaceMeta()
    const first = workspaceMeta.load()
    const second = workspaceMeta.load()
    expect(fetch).toHaveBeenCalledTimes(1)
    rejectFirst?.(new Error('offline'))
    await Promise.all([first, second])
    expect(workspaceMeta.store.getSnapshot().status).toBe('error')
    // No successful load yet, so the failed route is retried without a force flag.
    await workspaceMeta.load()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(workspaceMeta.store.getSnapshot().status).toBe('ready')
  })

  it('keeps the last successful map when a forced refresh fails', async () => {
    const fetch = vi.fn()
      .mockImplementationOnce(async () => metaResponse({ ok: true, generatedAt: 0, workspaces: [gitRow] }))
      .mockImplementationOnce(async () => metaResponse({ ok: false }, false))
    vi.stubGlobal('fetch', fetch)
    const workspaceMeta = createWorkspaceMeta()
    await workspaceMeta.load()
    await workspaceMeta.load(true)
    const snapshot = workspaceMeta.store.getSnapshot()
    expect(snapshot.status).toBe('error')
    expect(snapshot.byId.wa?.projectKey).toBe('github.com/me/i-ai-gw')
  })
})

describe('project tree styles', () => {
  it('gives the project-session button a keyboard focus ring and disabled state', () => {
    expect(STYLESHEET).toMatch(/\.sb-workspace-action:focus-visible\s*\{[^}]*outline/)
    expect(STYLESHEET).toMatch(/\.sb-workspace-action:disabled\s*\{[^}]*opacity/)
  })

  it('removes the disclosure affordance from session-less branch rows', () => {
    expect(STYLESHEET).toMatch(/\.sb-group-head--static\s*\{[^}]*cursor:\s*default/)
  })
})
