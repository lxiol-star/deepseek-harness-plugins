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
import type { Context } from '@deepseek-ai/cordis';
import { type FleetSample } from './metrics.js';
import { type SessionFlags, type Skin, type StateFile } from './state.js';
/** Largest fleet counted at once. */
export declare const MAX_MEMBERS = 96;
/** Largest session-header index retained (small records, no history). */
export declare const MAX_SESSION_HEADERS = 2048;
/** Deepest ancestor chain walked before membership is declined. */
export declare const MAX_ANCESTOR_DEPTH = 128;
/** The slice of one live session this module reads. */
export interface SessionLike {
    /** Session identity. */
    readonly id: string;
    /** Creation metadata used to derive sub-agent membership. */
    readonly header: {
        /** Direct parent session, present on sub-agent children. */
        readonly parentSession?: string;
        /** Coarse creator classification; `'subagent'` marks delegated children. */
        readonly origin?: 'subagent';
    };
}
/** The slice of the session store this module reads. */
export interface SessionStoreLike {
    /** Every live session. */
    list(): readonly SessionLike[];
    /** One live session by identity. */
    get(id: string): SessionLike | undefined;
}
/** The session-scoped snapshot returned by `session/state`. */
export interface SessionSnapshot extends SessionFlags {
    /** Global skin preference. */
    readonly skin: Skin;
    /** Generated plus input tokens per second across counted sub-agents. */
    readonly rate: number;
    /** Generated-only tokens per second across counted sub-agents. */
    readonly gen: number;
    /** Number of counted sub-agents. */
    readonly agents: number;
    /** Whether any counted sub-agent generated recently. */
    readonly generating: boolean;
    /** Accumulated tokens since the plugin loaded. */
    readonly total: number;
    /** Host clock at sampling time. */
    readonly stamp: number;
    /** Policy body currently resolved for the session (empty when both modes are off). */
    readonly policy: string;
}
/** One accepted `session/update` payload. */
export interface TurboUpdate {
    /** Session whose toggles change; omitted for a skin-only update. */
    readonly session?: string;
    /** New Lightning mode value. */
    readonly lightning?: boolean;
    /** New Ultra mode value. */
    readonly ultra?: boolean;
    /** New global skin preference. */
    readonly skin?: Skin;
}
/** Result of one `session/update`. */
export interface TurboUpdateResult extends SessionFlags {
    /** Global skin after the update. */
    readonly skin: Skin;
}
/** Options accepted by {@link createTurbo}. */
export interface TurboOptions {
    /** Durable state document. */
    readonly state: StateFile;
    /** Optional diagnostic sink. */
    readonly log?: (message: string) => void;
    /** Live session store, resolved lazily so a late-arriving service is picked up. */
    readonly sessions?: () => SessionStoreLike | undefined;
    /** Clock injection for tests. */
    readonly now?: () => number;
}
/** The session state and fleet meter capability. */
export interface Turbo {
    /** Current fleet sample. */
    readonly sample: () => FleetSample;
    /** Current toggles for one session, defaulted when unknown. */
    readonly stateOf: (sessionId: string) => SessionFlags;
    /** Contract snapshot for `session/state`. */
    readonly snapshot: (sessionId?: string) => SessionSnapshot;
    /** Apply one `session/update` payload and persist it. */
    readonly update: (patch: TurboUpdate) => Promise<TurboUpdateResult>;
    /** Policy body the UI chip shows for one session. */
    readonly policyOf: (sessionId: string) => string;
    /** Resolve the live session store once it becomes available, then reseed membership. */
    refresh(): void;
    /** Remove listeners and clear retained state. */
    dispose(): void;
}
/**
 * Read one session's toggles with the default when it has none.
 * @param sessions - current session map.
 * @param sessionId - session to read, if any.
 * @returns the session's flags, defaulted to both off.
 */
export declare function sessionFlagsOf(sessions: Readonly<Record<string, SessionFlags>>, sessionId: string | undefined): SessionFlags;
/**
 * Apply one toggle patch, moving the session to the most-recently-touched end.
 * @param sessions - current session map.
 * @param sessionId - session to touch.
 * @param flags - complete next flags for that session.
 * @returns a new map, bounded to the newest entries.
 */
export declare function applySessionPatch(sessions: Readonly<Record<string, SessionFlags>>, sessionId: string, flags: SessionFlags): Record<string, SessionFlags>;
/**
 * Assemble the contract `session/state` snapshot.
 * @param flags - the session's toggles, defaulted when unknown.
 * @param skin - current global skin.
 * @param sample - current fleet sample.
 * @param stamp - host clock at sampling time.
 * @param policy - policy body resolved for the session, if one was asked for.
 * @returns the snapshot the browser half parses.
 */
export declare function buildSnapshot(flags: SessionFlags, skin: Skin, sample: FleetSample, stamp: number, policy: string): SessionSnapshot;
/**
 * Assemble the default snapshot: both modes off, the default skin, a zero
 * sample, and no policy.
 * @param stamp - host clock at sampling time.
 * @returns the default snapshot, used when no session identifies the caller.
 */
export declare function defaultSnapshot(stamp: number): SessionSnapshot;
/**
 * Create the session-state capability and its fleet meter.
 * @param ctx - plugin context; listeners are disposed with it.
 * @param options - state file, lazy session store access, clock, and diagnostics.
 * @returns the capability handle.
 */
export declare function createTurbo(ctx: Context, options: TurboOptions): Turbo;
