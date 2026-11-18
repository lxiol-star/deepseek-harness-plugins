/** Child workspaces of ticket workers: the marker that bounds them, the archive set, and every refusal before a removal. */
import { Context } from '@deepseek-ai/cordis'
import type { SessionActivity } from '@deepseek-ai/dsh-workspace'
import { WorkspaceActiveSessionError } from '@deepseek-ai/dsh-workspace'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChildWorkspaces, isChildWorkspacePath, type ChildWorkspacesHost } from '../src/app/workspaces.ts'
import { UserError } from '../src/core/index.ts'

const WORK = '/work/operator/.dsh-superagent/work'
const turn = (kind: string): SessionActivity => ({ kind }) as unknown as SessionActivity
const job = (id: string, label: string): SessionActivity => ({ kind: 'job', items: [{ id, label }] }) as unknown as SessionActivity

interface FakeWorkspace { id: string; path: string; title: string; createdAt: string; sessionIds: string[] }

/** A context whose Workspace registry is the given records, and whose activity providers report what the test recorded. */
function setup(options: { workspaces?: FakeWorkspace[]; archived?: string[]; activity?: Record<string, SessionActivity[]> } = {}) {
  const workspaces = options.workspaces ?? []
  const archived = new Set(options.archived ?? [])
  const activity = options.activity ?? {}
  const deleted: string[] = []
  const registry = {
    list: () => workspaces.map(workspace => ({ ...workspace, id: workspace.id as never, sessionIds: workspace.sessionIds as never })),
    get: (id: string) => workspaces.find(workspace => workspace.id === id) as never,
    create: vi.fn(),
    delete: vi.fn(async (id: string) => { deleted.push(id); return true }),
    archiveSession: vi.fn(async (id: string, choices?: { stopActivity?: boolean }) => {
      if (choices?.stopActivity !== true && activity[id]?.length) throw new WorkspaceActiveSessionError(id as never, activity[id]!)
      archived.add(id)
    }),
    unarchiveSession: vi.fn(async (id: string) => { archived.delete(id) }),
    get archivedSessionIds() { return [...archived] as never },
  }
  const ctx = new Context()
  ctx.reflect.provide('workspaceRegistry', registry as never)
  ctx.on('workspace/session-activity', async ({ sessionId }, next) => [...(activity[String(sessionId)] ?? []), ...await next()])
  const host = { context: ctx, store: { tickets: { list: () => [] as { id: string; execution?: { name: string; directory: string; assignment: string } }[] } } }
  return { workspaces: new ChildWorkspaces(host as unknown as ChildWorkspacesHost), registry, deleted, archived, host }
}

const workspace = (id: string, name: string, sessions: string[], createdAt = '2026-11-18T10:00:00.000Z'): FakeWorkspace =>
  ({ id, path: `${WORK}/${name}`, title: name, createdAt, sessionIds: sessions })

afterEach(() => { vi.restoreAllMocks() })

describe('what counts as a child workspace', () => {
  it('accepts only a path under a ticket worktree directory', () => {
    expect(isChildWorkspacePath(`${WORK}/fix-abc123`)).toBe(true)
    expect(isChildWorkspacePath(`${WORK}/fix-abc123/nested-project`)).toBe(true)
    expect(isChildWorkspacePath('/work/operator')).toBe(false)
    expect(isChildWorkspacePath('/work/operator/.dsh-superagent')).toBe(false)
    expect(isChildWorkspacePath('/work/operator/.dsh-superagent/work')).toBe(false)
    expect(isChildWorkspacePath('/work/operator/.dsh-superagent/work/')).toBe(false)
    expect(isChildWorkspacePath('.dsh-superagent/work/fix')).toBe(false)
    expect(isChildWorkspacePath('/data/.dsh-superagent/workspace/fix')).toBe(false)
  })
})

describe('listing', () => {
  it('lists child workspaces newest first, with their Sessions, archive state and activity, and leaves the operator workspace out', async () => {
    const { workspaces } = setup({
      workspaces: [workspace('w1', 'fix-old', ['s1'], '2026-11-17T10:00:00.000Z'), workspace('w2', 'fix-new', ['s2', 's3'], '2026-11-18T10:00:00.000Z'),
        { id: 'own', path: '/work/operator', title: 'operator', createdAt: '2026-11-18T11:00:00.000Z', sessionIds: ['main'] }],
      archived: ['s1'],
      activity: { s2: [turn('turn')], s3: [{ kind: 'job', items: [{ id: 'j1', label: 'test run' }, { id: 'j2', label: 'lint' },
        { id: 'j3', label: 'build' }] } as unknown as SessionActivity] },
    })
    const page = await workspaces.list()
    expect(page).toMatchObject({ total: 2, omitted: 0, more: false })
    expect(page.workspaces.map(item => item.workspace_id)).toEqual(['w2', 'w1'])
    expect(page.workspaces[1]).toMatchObject({ path: `${WORK}/fix-old`, removable: true,
      sessions: [{ session_id: 's1', archived: true, activity: [] }] })
    expect(page.workspaces[0]).toMatchObject({ removable: false, sessions: [
      { session_id: 's2', archived: false, activity: ['turn'] },
      { session_id: 's3', archived: false, activity: ['job: test run, lint and 1 more'] }] })
  })

  it('names the ticket whose worktree a child workspace is, by the worktree name the ticket recorded', async () => {
    const { host } = setup({ workspaces: [workspace('w1', 'fix-abc123', [])] })
    const tickets = [{ id: 'abc123', execution: { name: 'fix-abc123', directory: `${WORK}/fix-abc123`, assignment: '' } },
      { id: 'other', execution: undefined }]
    expect((await new ChildWorkspaces(host as unknown as ChildWorkspacesHost).list()).workspaces[0]!.ticket_id).toBeUndefined()
    const withTickets = { ...host, store: { tickets: { list: () => tickets } } } as unknown as ChildWorkspacesHost
    expect((await new ChildWorkspaces(withTickets).list()).workspaces[0]!.ticket_id).toBe('abc123')
  })

  it('returns the first page of a long history and counts what it left out', async () => {
    const many = Array.from({ length: 55 }, (_, index) => workspace(`w${index}`, `fix-${index}`, [],
      `2026-11-${String((index % 9) + 1).padStart(2, '0')}T10:00:00.000Z`))
    const page = await setup({ workspaces: many }).workspaces.list()
    expect(page).toMatchObject({ total: 55, omitted: 5, more: true })
    expect(page.workspaces).toHaveLength(50)
  })
})

describe('archiving', () => {
  it('archives the idle Sessions of a child workspace and reports the ones already archived', async () => {
    const { workspaces, registry } = setup({ workspaces: [workspace('w1', 'fix-abc', ['s1', 's2'])], archived: ['s2'] })
    expect(await workspaces.archive(`${WORK}/fix-abc`)).toEqual({ workspace_id: 'w1', path: `${WORK}/fix-abc`,
      archived: ['s1'], already_archived: ['s2'], blocked: [] })
    expect(registry.archiveSession).toHaveBeenCalledWith('s1', { stopActivity: false })
    expect(registry.archiveSession).toHaveBeenCalledTimes(1)
  })

  it('reports a Session that still runs as blocked, and stops it first only when asked', async () => {
    const { workspaces, registry } = setup({ workspaces: [workspace('w1', 'fix-abc', ['s1'])], activity: { s1: [turn('turn')] } })
    expect(await workspaces.archive(`${WORK}/fix-abc`)).toMatchObject({ archived: [], blocked: [{ session_id: 's1', activity: ['turn'] }] })
    expect(registry.archiveSession).toHaveBeenCalledWith('s1', { stopActivity: false })
    expect(await workspaces.archive(`${WORK}/fix-abc`, { stopActive: true })).toMatchObject({ archived: ['s1'], blocked: [] })
    expect(registry.archiveSession).toHaveBeenLastCalledWith('s1', { stopActivity: true })
  })

  it('refuses a workspace that is not a ticket worktree, and one that is not registered', async () => {
    const { workspaces, registry } = setup({ workspaces: [{ id: 'own', path: '/work/operator', title: 'operator',
      createdAt: '2026-11-18T10:00:00.000Z', sessionIds: [] }] })
    await expect(workspaces.archive('/work/operator')).rejects.toThrow(new UserError('notChildWorkspace'))
    await expect(workspaces.archive(`${WORK}/gone`)).rejects.toThrow(new UserError('unknownWorkspace'))
    expect(registry.archiveSession).not.toHaveBeenCalled()
  })
})

describe('removal', () => {
  it('writes nothing without confirm, and reports every reason a confirmed call would wait', async () => {
    const { workspaces, registry } = setup({ workspaces: [workspace('w1', 'fix-abc', ['s1', 's2'])], activity: { s2: [turn('turn')] } })
    expect(await workspaces.remove(`${WORK}/fix-abc`)).toEqual({ workspace_id: 'w1', path: `${WORK}/fix-abc`, removed: false,
      needs_confirmation: true, sessions: 2, removable: false,
      blockers: ['s1 is not archived', 's2 still runs (turn)'], directory_kept: true })
    expect(registry.delete).not.toHaveBeenCalled()
  })

  it('refuses a confirmed removal while a Session still runs, and names it', async () => {
    const { workspaces, registry } = setup({ workspaces: [workspace('w1', 'fix-abc', ['s1'])], archived: ['s1'],
      activity: { s1: [job('j1', 'test run')] } })
    await expect(workspaces.remove(`${WORK}/fix-abc`, { confirm: true })).rejects.toThrow(new UserError('workspaceBusy', { sessions: 's1' }))
    expect(registry.delete).not.toHaveBeenCalled()
  })

  it('refuses a confirmed removal while a Session is not archived, so no conversation leaves the client unarchived', async () => {
    const { workspaces, registry } = setup({ workspaces: [workspace('w1', 'fix-abc', ['s1', 's2'])], archived: ['s1'] })
    await expect(workspaces.remove(`${WORK}/fix-abc`, { confirm: true })).rejects.toThrow(new UserError('workspaceNotArchived', { sessions: 's2' }))
    expect(registry.delete).not.toHaveBeenCalled()
  })

  it('removes only the registration of an archived, idle workspace, leaving the directory and the logs in place', async () => {
    const { workspaces, registry, deleted } = setup({ workspaces: [workspace('w1', 'fix-abc', ['s1'])], archived: ['s1'] })
    expect(await workspaces.remove(`${WORK}/fix-abc`, { confirm: true })).toEqual({ workspace_id: 'w1', path: `${WORK}/fix-abc`,
      removed: true, sessions: 1, removable: true, blockers: [], directory_kept: true })
    expect(deleted).toEqual(['w1'])
    expect(registry.archiveSession).not.toHaveBeenCalled()
  })

  it('refuses the workspaces a person owns, and one no record names', async () => {
    const { workspaces } = setup({ workspaces: [{ id: 'own', path: '/work/operator', title: 'operator',
      createdAt: '2026-11-18T10:00:00.000Z', sessionIds: [] }] })
    await expect(workspaces.remove('/work/operator', { confirm: true })).rejects.toThrow(new UserError('notChildWorkspace'))
    await expect(workspaces.remove(`${WORK}/never`, { confirm: true })).rejects.toThrow(new UserError('unknownWorkspace'))
  })
})
