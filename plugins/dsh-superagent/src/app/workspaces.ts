/**
 * The child workspaces dsh-superagent created for its ticket workers, which the main Session may list, archive and remove. Every
 * child worktree sits under a `.dsh-superagent/work/` directory, and that marker alone decides what this module may touch: a
 * workspace a person owns is never archived or removed from here, however close its path looks.
 *
 * Archiving writes the same durable archive set the DSH client writes, so a Session leaves every grouping surface without its
 * log being deleted, and removing a workspace drops only its registration — the directory and the Session logs stay.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { WorkspaceActiveSessionError, type SessionActivity, type Workspace } from '@deepseek-ai/dsh-workspace'
import { realpathSync } from 'node:fs'
import { basename, sep } from 'node:path'
import { UserError } from '../core/index.ts'
import type { Store } from './store.ts'

/** The directory segments between a child workspace's root and its own name; a path without them is not ours to manage. */
const MARKER = `${sep}.dsh-superagent${sep}work${sep}`
/** How many child workspaces one listing returns, so a long history of ended tickets stays out of the main Session's prompt. */
const LISTED = 50
/** How many activity items one Session's line names before it counts them instead. */
const NAMED_ITEMS = 2

/** Whether a canonical workspace path is a ticket worktree dsh-superagent created, rather than a workspace a person owns. */
export function isChildWorkspacePath(path: string): boolean {
  const at = path.lastIndexOf(MARKER)
  return at > 0 && at + MARKER.length < path.length
}

/** One Session of a child workspace: whether the client archived it, and what still runs in it. */
export interface ChildSession { session_id: string; archived: boolean; activity: string[] }
/** One child workspace, as the main Session reads it: the worktree, the ticket it serves, and its Sessions. */
export interface ChildWorkspace { workspace_id: string; path: string; title: string; ticket_id?: string; sessions: ChildSession[]; removable: boolean }
/** What archiving a child workspace did, session by session: archived now, already archived, and what refused. */
export interface ArchiveResult { workspace_id: string; path: string; archived: string[]; already_archived: string[]; blocked: { session_id: string; activity: string[] }[] }
/** What removing a child workspace did, or what a call without `confirm` reports it would do. */
export interface RemoveResult { workspace_id: string; path: string; removed: boolean; needs_confirmation?: true; sessions: number
  removable: boolean; blockers: string[]; directory_kept: true }
/** What a listing holds: the child workspaces newest first, how many there are, and how many the page left out. */
export interface WorkspaceList { workspaces: ChildWorkspace[]; total: number; omitted: number; more: boolean }

/** Host dependencies: the DSH context that owns the Workspace registry and its activity providers, and the tickets the worktrees serve. */
export interface ChildWorkspacesHost {
  readonly context: Context
  readonly store: Pick<Store, 'tickets'>
}

/** Renders one Session's activity families, naming the items of a family that carries them. */
function activityText(activity: readonly SessionActivity[]): string[] {
  return activity.map(item => {
    const items = item.items ?? []
    if (!items.length) return item.kind
    const named = items.slice(0, NAMED_ITEMS).map(entry => entry.label ?? entry.id)
    return `${item.kind}: ${named.join(', ')}${items.length > NAMED_ITEMS ? ` and ${items.length - NAMED_ITEMS} more` : ''}`
  })
}

/** The Sessions of a workspace that still run, and those the client has not archived yet, as the reasons a removal waits. */
function blockersOf(sessions: readonly ChildSession[]): string[] {
  return sessions.flatMap(session => session.activity.length
    ? [`${session.session_id} still runs (${session.activity.join('; ')})`]
    : session.archived ? [] : [`${session.session_id} is not archived`])
}

/** Lists, archives and removes the child workspaces of ticket workers, keeping every operation off the workspaces a person owns. */
export class ChildWorkspaces {
  constructor(private readonly host: ChildWorkspacesHost) {}

  /** The child workspaces registered now, newest first, each with its Sessions' archive state and what still runs in them. */
  async list(): Promise<WorkspaceList> {
    const tickets = new Map(this.host.store.tickets.list().flatMap(ticket =>
      ticket.execution ? [[ticket.execution.name, ticket.id] as const] : []))
    const archived = new Set(this.host.context.workspaceRegistry.archivedSessionIds.map(String))
    const found = this.host.context.workspaceRegistry.list().filter(workspace => isChildWorkspacePath(workspace.path))
      .sort((one, other) => other.createdAt.localeCompare(one.createdAt))
    const workspaces = await Promise.all(found.map(async workspace => {
      const sessions = await Promise.all(workspace.sessionIds.map(async id => ({
        session_id: String(id), archived: archived.has(String(id)), activity: activityText(await this.activity(String(id))),
      })))
      const ticketId = tickets.get(basename(workspace.path))
      return { workspace_id: String(workspace.id), path: workspace.path, title: workspace.title,
        ...ticketId ? { ticket_id: ticketId } : {}, sessions, removable: blockersOf(sessions).length === 0 }
    }))
    const page = workspaces.slice(0, LISTED)
    return { workspaces: page, total: workspaces.length, omitted: workspaces.length - page.length, more: workspaces.length > page.length }
  }

  /**
   * Archive every Session of one child workspace, as the client's archive does: the Session leaves the grouping surfaces and its
   * log stays. A Session that still runs refuses on its own unless `stopActive` asks the activity providers to stop it first, so
   * one call reports each Session's outcome instead of giving up on the workspace.
   * @param path - child workspace path, as the registry spells it or as the operator typed it.
   * @param options - whether running work is stopped instead of refused.
   */
  async archive(path: string, options: { stopActive?: boolean } = {}): Promise<ArchiveResult> {
    const workspace = this.workspace(path)
    const result: ArchiveResult = { workspace_id: String(workspace.id), path: workspace.path, archived: [], already_archived: [], blocked: [] }
    const registry = this.host.context.workspaceRegistry
    const archived = new Set(registry.archivedSessionIds.map(String))
    for (const id of workspace.sessionIds) {
      const sessionId = String(id)
      if (archived.has(sessionId)) { result.already_archived.push(sessionId); continue }
      try {
        await registry.archiveSession(id, { stopActivity: options.stopActive === true })
        result.archived.push(sessionId)
      } catch (error) {
        if (!(error instanceof WorkspaceActiveSessionError)) throw error
        result.blocked.push({ session_id: sessionId, activity: activityText(error.activity) })
      }
    }
    return result
  }

  /**
   * Remove one child workspace's registration from the client, leaving its directory and every Session log in place. Without
   * `confirm` nothing is written: the result reports whether a confirmed call would remove it and what it waits for. A confirmed
   * call refuses while any Session still runs, and while any Session is not archived, so a conversation never leaves the client
   * without a person's archive step.
   * @param path - child workspace path, as the registry spells it or as the operator typed it.
   * @param options - the explicit confirmation that turns the report into the removal.
   */
  async remove(path: string, options: { confirm?: boolean } = {}): Promise<RemoveResult> {
    const workspace = this.workspace(path)
    const sessionIds = workspace.sessionIds.map(String)
    const archived = new Set(this.host.context.workspaceRegistry.archivedSessionIds.map(String))
    const sessions = await Promise.all(sessionIds.map(async sessionId => ({
      session_id: sessionId, archived: archived.has(sessionId), activity: activityText(await this.activity(sessionId)),
    })))
    const blockers = blockersOf(sessions)
    const result: RemoveResult = { workspace_id: String(workspace.id), path: workspace.path, removed: false,
      sessions: sessionIds.length, removable: blockers.length === 0, blockers, directory_kept: true }
    if (options.confirm !== true) return { ...result, needs_confirmation: true }
    const running = sessions.filter(session => session.activity.length).map(session => session.session_id)
    if (running.length) throw new UserError('workspaceBusy', { sessions: running.join(', ') })
    const unarchived = sessions.filter(session => !session.archived).map(session => session.session_id)
    if (unarchived.length) throw new UserError('workspaceNotArchived', { sessions: unarchived.join(', ') })
    await this.host.context.workspaceRegistry.delete(workspace.id)
    return { ...result, removed: true }
  }

  /** The registered child workspace a path names, refusing one that is unknown or that a person owns. */
  private workspace(path: string): Workspace {
    const registry = this.host.context.workspaceRegistry
    const found = registry.list().find(workspace => workspace.path === path || workspace.path === this.canonical(path))
    if (!found) throw new UserError('unknownWorkspace')
    if (!isChildWorkspacePath(found.path)) throw new UserError('notChildWorkspace')
    return found
  }

  /** A path as the registry spells it; a path that no longer resolves stays as given, so a missing directory still names its record. */
  private canonical(path: string): string {
    try { return realpathSync(path) } catch { return path }
  }

  /** What still runs for one Session, as the archive admission asks it: the families of every provider, empty when it is idle. */
  private async activity(sessionId: string): Promise<readonly SessionActivity[]> {
    return await this.host.context.waterfall('workspace/session-activity', { sessionId: sessionId as SessionId }, () => Promise.resolve([]))
  }
}
