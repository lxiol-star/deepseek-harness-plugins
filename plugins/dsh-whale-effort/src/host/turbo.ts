/**
 * Per-session Host state plus fleet membership for the live tok/s readout.
 *
 * Responsibilities:
 * - own the in-memory mirror of the persisted session toggles and global skin;
 * - keep the fleet meter's member set equal to the sub-agent descendants of
 *   every session with a mode on;
 * - resolve the policy text for one session (injection and the UI chip);
 * - answer the session-scoped RPC snapshots.
 *
 * Membership rules: only sessions whose header says `origin: 'subagent'` and
 * whose ancestor chain (through `header.parentSession`) reaches a tracked
 * session are counted. The tracked session itself is not a member — the readout
 * is about delegated work. State retention is bounded
 * ({@link MAX_MEMBERS}, {@link MAX_SESSION_HEADERS}) and the meter is disposed
 * with the plugin fiber; nothing here owns a timer.
 *
 * @module dsh-whale-effort/host/turbo
 */

import type { Context } from '@deepseek-ai/cordis'
// Activate the host-side agent and session event declarations (type-only).
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-session'
import { createFleetMeter, type FleetMeter, type FleetSample } from './metrics.js'
import { currentPolicyText, resolveActivePolicy } from './policy.js'
import { createPolicyInjector, type PolicyInjector } from './inject.js'
import {
  DEFAULT_SKIN,
  boundSessions,
  describeError,
  isSessionId,
  normalizeSkin,
  type SessionFlags,
  type Skin,
  type StateFile,
} from './state.js'

/** Largest fleet counted at once. */
export const MAX_MEMBERS = 96

/** Largest session-header index retained (small records, no history). */
export const MAX_SESSION_HEADERS = 2_048

/** Deepest ancestor chain walked before membership is declined. */
export const MAX_ANCESTOR_DEPTH = 128

/** The slice of one live session this module reads. */
export interface SessionLike {
  /** Session identity. */
  readonly id: string
  /** Creation metadata used to derive sub-agent membership. */
  readonly header: {
    /** Direct parent session, present on sub-agent children. */
    readonly parentSession?: string
    /** Coarse creator classification; `'subagent'` marks delegated children. */
    readonly origin?: 'subagent'
  }
}

/** The slice of the session store this module reads. */
export interface SessionStoreLike {
  /** Every live session. */
  list(): readonly SessionLike[]
  /** One live session by identity. */
  get(id: string): SessionLike | undefined
}

/** One retained header record. */
interface HeaderRecord {
  readonly id: string
  readonly parent: string | null
  readonly subagent: boolean
  live: boolean
}

/** The session-scoped snapshot returned by `session/state`. */
export interface SessionSnapshot extends SessionFlags {
  /** Global skin preference. */
  readonly skin: Skin
  /** Generated plus input tokens per second across counted sub-agents. */
  readonly rate: number
  /** Generated-only tokens per second across counted sub-agents. */
  readonly gen: number
  /** Number of counted sub-agents. */
  readonly agents: number
  /** Whether any counted sub-agent generated recently. */
  readonly generating: boolean
  /** Accumulated tokens since the plugin loaded. */
  readonly total: number
  /** Host clock at sampling time. */
  readonly stamp: number
  /** Policy body currently resolved for the session (empty when both modes are off). */
  readonly policy: string
}

/** One accepted `session/update` payload. */
export interface TurboUpdate {
  /** Session whose toggles change; omitted for a skin-only update. */
  readonly session?: string
  /** New Lightning mode value. */
  readonly lightning?: boolean
  /** New Ultra mode value. */
  readonly ultra?: boolean
  /** New global skin preference. */
  readonly skin?: Skin
}

/** Result of one `session/update`. */
export interface TurboUpdateResult extends SessionFlags {
  /** Global skin after the update. */
  readonly skin: Skin
}

/** Options accepted by {@link createTurbo}. */
export interface TurboOptions {
  /** Durable state document. */
  readonly state: StateFile
  /** Optional diagnostic sink. */
  readonly log?: (message: string) => void
  /** Live session store, resolved lazily so a late-arriving service is picked up. */
  readonly sessions?: () => SessionStoreLike | undefined
  /** Clock injection for tests. */
  readonly now?: () => number
}

/** The session state and fleet meter capability. */
export interface Turbo {
  /** Current fleet sample. */
  readonly sample: () => FleetSample
  /** Current toggles for one session, defaulted when unknown. */
  readonly stateOf: (sessionId: string) => SessionFlags
  /** Contract snapshot for `session/state`. */
  readonly snapshot: (sessionId?: string) => SessionSnapshot
  /** Apply one `session/update` payload and persist it. */
  readonly update: (patch: TurboUpdate) => Promise<TurboUpdateResult>
  /** Policy body the UI chip shows for one session. */
  readonly policyOf: (sessionId: string) => string
  /** Resolve the live session store once it becomes available, then reseed membership. */
  refresh(): void
  /** Remove listeners and clear retained state. */
  dispose(): void
}

/**
 * Read one session's toggles with the default when it has none.
 * @param sessions - current session map.
 * @param sessionId - session to read, if any.
 * @returns the session's flags, defaulted to both off.
 */
export function sessionFlagsOf(
  sessions: Readonly<Record<string, SessionFlags>>,
  sessionId: string | undefined,
): SessionFlags {
  const flags = sessionId === undefined ? undefined : sessions[sessionId]
  return { lightning: flags?.lightning === true, ultra: flags?.ultra === true }
}

/**
 * Apply one toggle patch, moving the session to the most-recently-touched end.
 * @param sessions - current session map.
 * @param sessionId - session to touch.
 * @param flags - complete next flags for that session.
 * @returns a new map, bounded to the newest entries.
 */
export function applySessionPatch(
  sessions: Readonly<Record<string, SessionFlags>>,
  sessionId: string,
  flags: SessionFlags,
): Record<string, SessionFlags> {
  const next: Record<string, SessionFlags> = {}
  for (const [id, value] of Object.entries(sessions)) {
    if (id !== sessionId) next[id] = value
  }
  next[sessionId] = { lightning: flags.lightning, ultra: flags.ultra }
  return boundSessions(next)
}

/** The empty fleet sample used before any metered traffic and for unknown sessions. */
const ZERO_SAMPLE: FleetSample = { rate: 0, gen: 0, agents: 0, generating: 0, total: 0 }

/**
 * Assemble the contract `session/state` snapshot.
 * @param flags - the session's toggles, defaulted when unknown.
 * @param skin - current global skin.
 * @param sample - current fleet sample.
 * @param stamp - host clock at sampling time.
 * @param policy - policy body resolved for the session, if one was asked for.
 * @returns the snapshot the browser half parses.
 */
export function buildSnapshot(
  flags: SessionFlags,
  skin: Skin,
  sample: FleetSample,
  stamp: number,
  policy: string,
): SessionSnapshot {
  return {
    lightning: flags.lightning,
    ultra: flags.ultra,
    skin,
    rate: sample.rate,
    gen: sample.gen,
    agents: sample.agents,
    generating: sample.generating > 0,
    total: sample.total,
    stamp,
    policy,
  }
}

/**
 * Assemble the default snapshot: both modes off, the default skin, a zero
 * sample, and no policy.
 * @param stamp - host clock at sampling time.
 * @returns the default snapshot, used when no session identifies the caller.
 */
export function defaultSnapshot(stamp: number): SessionSnapshot {
  return buildSnapshot({ lightning: false, ultra: false }, DEFAULT_SKIN, ZERO_SAMPLE, stamp, '')
}

/**
 * Create the session-state capability and its fleet meter.
 * @param ctx - plugin context; listeners are disposed with it.
 * @param options - state file, lazy session store access, clock, and diagnostics.
 * @returns the capability handle.
 */
export function createTurbo(ctx: Context, options: TurboOptions): Turbo {
  const log = options.log ?? (() => {})
  const clock = options.now ?? (() => Date.now())
  const initial = options.state.read()
  let skin: Skin = initial.skin
  let sessions: Record<string, SessionFlags> = { ...initial.sessions }
  let headers = new Map<string, HeaderRecord>()
  /** Sessions that enabled a mode in this process (drives the one-off off-notice). */
  const everOn = new Set<string>()
  let tracked = new Set<string>()
  let members = new Set<string>()
  let disposed = false
  const meter: FleetMeter = createFleetMeter()
  const unsubscribes: Array<() => unknown> = []
  let injector: PolicyInjector | undefined
  let sessionsStore: SessionStoreLike | undefined

  /** Live session store, resolved lazily through the injected callback. */
  function store(): SessionStoreLike | undefined {
    if (sessionsStore !== undefined) return sessionsStore
    try {
      sessionsStore = options.sessions?.()
    } catch (error) {
      log(`session store unavailable: ${describeError(error)}`)
      sessionsStore = undefined
    }
    return sessionsStore
  }

  /** Whether the session currently has a mode enabled. */
  function anyOn(sessionId: string): boolean {
    const flags = sessionFlagsOf(sessions, sessionId)
    return flags.lightning || flags.ultra
  }

  /** Text that should currently be in effect for the pre-step injector. */
  function activeText(sessionId: string): string {
    if (anyOn(sessionId)) everOn.add(sessionId)
    return resolveActivePolicy(sessionFlagsOf(sessions, sessionId), everOn.has(sessionId))
  }

  /** Record one live session's header; the ancestor chain is all we retain. */
  function rememberSession(session: SessionLike | undefined | null): boolean {
    if (session === undefined || session === null) return false
    if (typeof session.id !== 'string' || session.id.length === 0) return false
    headers.set(session.id, {
      id: session.id,
      parent: typeof session.header.parentSession === 'string' ? session.header.parentSession : null,
      subagent: session.header.origin === 'subagent',
      live: true,
    })
    while (headers.size > MAX_SESSION_HEADERS) {
      const oldest = headers.keys().next()
      if (oldest.done === true) break
      headers.delete(oldest.value)
    }
    return true
  }

  /** Look one session up in the live store (never the persistence layer). */
  function liveSession(sessionId: string): SessionLike | undefined {
    const live = store()
    if (live === undefined) return undefined
    try {
      return live.get(sessionId)
    } catch {
      return undefined
    }
  }

  /**
   * Whether this process has ever observed the session. Only observed sessions
   * may report the persisted skin and live fleet numbers; a stale id from a
   * previous run degrades to the default snapshot.
   */
  function isKnownSession(sessionId: string): boolean {
    return headers.has(sessionId) || liveSession(sessionId) !== undefined
  }

  /** Whether one recorded session is a sub-agent descendant of a tracked session. */
  function belongsToTrackedRoot(record: HeaderRecord): boolean {
    if (!record.live || !record.subagent) return false
    const seen = new Set<string>([record.id])
    let parent = record.parent
    for (let depth = 0; parent !== null && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
      if (seen.has(parent)) return false
      if (tracked.has(parent)) return true
      seen.add(parent)
      let ancestor = headers.get(parent)
      if (ancestor === undefined) {
        rememberSession(liveSession(parent))
        ancestor = headers.get(parent)
      }
      if (ancestor === undefined) return false
      parent = ancestor.parent
    }
    return false
  }

  /** Recompute tracked sessions and the member set, then hand both to the meter. */
  function refreshMembers(): void {
    if (disposed) return
    try {
      tracked = new Set(Object.keys(sessions).filter((id) => anyOn(id)))
      const next = new Set<string>()
      // Fixed snapshot: resolving ancestors may evict index entries.
      for (const record of tracked.size > 0 ? [...headers.values()] : []) {
        if (next.size >= MAX_MEMBERS) break
        if (belongsToTrackedRoot(record)) next.add(record.id)
      }
      members = next
      meter.setMembers(members)
    } catch (error) {
      log(`fleet membership refresh failed, counting nobody this round: ${describeError(error)}`)
      members = new Set()
      try {
        meter.setMembers(members)
      } catch {
        // A meter that cannot be told about the empty set must not fail the refresh.
      }
    }
  }

  /** Reindex every live session, then recompute membership. */
  function seedFromStore(): void {
    const live = store()
    if (live === undefined) return
    try {
      for (const session of live.list()) rememberSession(session)
    } catch (error) {
      log(`reading live sessions failed, waiting for lifecycle events: ${describeError(error)}`)
    }
    refreshMembers()
  }

  try {
    unsubscribes.push(ctx.on('agent/assistant-stream', (payload) => {
      try {
        if (disposed) return
        const frame = payload.frame
        if (frame.type !== 'chunk') return
        const agentId: string = payload.agent.id
        if (agentId.length === 0) return
        // A late-loaded plugin can rebuild one header from its own stream frame.
        if (!headers.has(agentId) && tracked.size > 0) {
          if (rememberSession(liveSession(agentId))) refreshMembers()
        }
        if (!members.has(agentId)) return
        const chunk: unknown = frame.chunk
        meter.ingest(agentId, chunk, frame.time)
      } catch {
        // Metering must never disturb the agent turn that emitted the frame.
      }
    }))
  } catch (error) {
    log(`subscribing to agent/assistant-stream failed: ${describeError(error)}`)
  }

  try {
    unsubscribes.push(ctx.on('session/created', (session) => {
      try {
        if (disposed) return
        if (rememberSession(session)) refreshMembers()
      } catch {
        // Creation listeners are synchronous and veto publication: contain everything.
      }
    }))
  } catch (error) {
    log(`subscribing to session/created failed: ${describeError(error)}`)
  }

  try {
    unsubscribes.push(ctx.on('session/disposed', (session) => {
      try {
        if (disposed) return
        const record = headers.get(session.id)
        if (record === undefined) return
        // Keep the small ancestor chain: grandchildren may outlive the parent.
        record.live = false
        refreshMembers()
      } catch {
        // Disposal notification failures are contained by design.
      }
    }))
  } catch (error) {
    log(`subscribing to session/disposed failed: ${describeError(error)}`)
  }

  seedFromStore()

  try {
    injector = createPolicyInjector(ctx, { resolve: activeText, log })
  } catch (error) {
    log(`policy injection unavailable: ${describeError(error)}`)
  }

  return {
    sample: () => meter.sample(),
    stateOf: (sessionId) => sessionFlagsOf(sessions, sessionId),
    snapshot: (sessionId) => {
      // No session (the settings row) answers with the persisted global skin and
      // a zero fleet; the live fleet is only reported for a tracked session. A
      // stale id this process has never observed degrades to the default snapshot.
      const stamp = clock()
      if (sessionId === undefined) {
        return buildSnapshot({ lightning: false, ultra: false }, skin, ZERO_SAMPLE, stamp, '')
      }
      if (!isKnownSession(sessionId)) return defaultSnapshot(stamp)
      const flags = sessionFlagsOf(sessions, sessionId)
      return buildSnapshot(flags, skin, meter.sample(), stamp, currentPolicyText(flags))
    },
    update: async (patch) => {
      const sessionId = patch.session
      let flags: SessionFlags = { lightning: false, ultra: false }
      if (isSessionId(sessionId)) {
        const previous = sessionFlagsOf(sessions, sessionId)
        flags = {
          lightning: typeof patch.lightning === 'boolean' ? patch.lightning : previous.lightning,
          ultra: typeof patch.ultra === 'boolean' ? patch.ultra : previous.ultra,
        }
        sessions = applySessionPatch(sessions, sessionId, flags)
        await options.state.writeSession(sessionId, flags)
        refreshMembers()
      }
      if (patch.skin !== undefined) {
        skin = normalizeSkin(patch.skin)
        await options.state.writeSkin(skin)
      }
      return { lightning: flags.lightning, ultra: flags.ultra, skin }
    },
    policyOf: (sessionId) => currentPolicyText(sessionFlagsOf(sessions, sessionId)),
    refresh: () => {
      sessionsStore = undefined
      seedFromStore()
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      try {
        injector?.dispose()
      } catch {
        // Unloading an already-gone listener is not an error.
      }
      injector = undefined
      for (const off of unsubscribes.splice(0)) {
        try {
          off()
        } catch {
          // Unload failures of individual listeners must not block the rest.
        }
      }
      headers = new Map()
      tracked = new Set()
      members = new Set()
      everOn.clear()
      meter.dispose()
    },
  }
}
