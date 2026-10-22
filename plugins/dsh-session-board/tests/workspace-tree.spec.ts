import { describe, expect, it } from 'vitest'
import { buildEntry } from '../src/shared/board.ts'
import { groupEntries } from '../src/shared/order.ts'
import { EMPTY_FEED, type BoardSessionInput } from '../src/shared/types.ts'
import { buildWorkspaceNodes, workspaceKey } from '../src/client/workspace-tree.ts'
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
  })
})
