/**
 * Browser-side transport for the plugin's Host RPC channel.
 *
 * The Host half owns three kinds of state the slider cannot derive on its own:
 * the per-session Ultra/lightning choice, the global energy-skin preference,
 * and the live fleet throughput sample. Everything here is best-effort: an
 * absent Host half, a dropped connection or a malformed envelope degrades to
 * "no extra state" instead of breaking the slider.
 *
 * @module dsh-whale-effort/client/turbo
 */

import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { DEFAULT_SKIN, SKINS, type Skin } from './effects/skins.js'

/** Host RPC result envelope (matches `@deepseek-ai/dsh-host-apiproxy`). */
type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

/** The slice of the client Connection service this module reads. */
export interface HostRpc {
  call(channel: string, endpoint: string, payload?: unknown): Promise<unknown>
}

/** Prefix the Host half registers its endpoints on. */
export const RPC_CHANNEL = '/dsh-whale-effort'

/** One snapshot of the tracked session's turbo state plus the fleet sample. */
export interface TurboSnapshot {
  readonly lightning: boolean
  readonly ultra: boolean
  readonly skin: Skin
  /** Generation + input tokens per second across the tracked session's subagents. */
  readonly rate: number
  /** Generation-only tokens per second. */
  readonly gen: number
  readonly agents: number
  readonly generating: boolean
  /** Cumulative tokens observed for the current fleet. */
  readonly total: number
  /** Host clock at sampling time, for stale-sample checks. */
  readonly stamp: number
  /** Policy body the Host would inject for this session right now. */
  readonly policy: string
}

/** Snapshot used before the Host has answered, or when it cannot answer. */
export const EMPTY_TURBO: TurboSnapshot = Object.freeze({
  lightning: false,
  ultra: false,
  skin: DEFAULT_SKIN,
  rate: 0,
  gen: 0,
  agents: 0,
  generating: false,
  total: 0,
  stamp: 0,
  policy: '',
})

/** Fields a caller may change through {@link TurboService.update}. */
export interface TurboPatch {
  readonly session?: string
  readonly lightning?: boolean
  readonly ultra?: boolean
  readonly skin?: Skin
}

/** Typed facade over the Host channel; `null` while the Host half is absent. */
export interface TurboService {
  /** Read the session snapshot; `session` may be omitted for the global skin. */
  state(session?: SessionId | string): Promise<TurboSnapshot | null>
  /** Change session-scoped toggles and/or the global skin. */
  update(patch: TurboPatch): Promise<Partial<TurboSnapshot> | null>
  /** Read the policy body resolved for one session. */
  policy(session: string): Promise<string | null>
}

function isSkin(value: unknown): value is Skin {
  return typeof value === 'string' && (SKINS as readonly string[]).includes(value)
}

/** Coerce one unknown Host value into a snapshot, dropping unusable fields. */
function normalizeSnapshot(value: unknown): TurboSnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const number = (field: unknown): number => (typeof field === 'number' && Number.isFinite(field) ? Math.max(0, Math.round(field)) : 0)
  return {
    lightning: record.lightning === true,
    ultra: record.ultra === true,
    skin: isSkin(record.skin) ? record.skin : DEFAULT_SKIN,
    rate: number(record.rate),
    gen: number(record.gen),
    agents: number(record.agents),
    generating: record.generating === true,
    total: number(record.total),
    stamp: number(record.stamp),
    policy: typeof record.policy === 'string' ? record.policy : '',
  }
}

/**
 * Build the typed facade.
 * @param rpc - the Connection RPC service, when the client exposes one.
 * @returns the facade, or `null` when no RPC transport exists.
 */
export function makeTurboService(rpc: HostRpc | undefined): TurboService | null {
  if (rpc === undefined) return null
  const call = async <T,>(endpoint: string, payload?: unknown): Promise<T | null> => {
    try {
      const result = (await rpc.call(RPC_CHANNEL, endpoint, payload)) as RpcResult<T>
      return result.ok ? result.value : null
    } catch {
      return null
    }
  }
  return {
    state: async (session) => normalizeSnapshot(await call<unknown>('session/state',
      session === undefined || session === '' ? {} : { session: String(session) })),
    update: (patch) => call<Partial<TurboSnapshot>>('session/update', patch),
    policy: async (session) => {
      const value = await call<{ text?: unknown }>('session/policy', { session })
      return value !== null && typeof value.text === 'string' ? value.text : null
    },
  }
}

/** Preference cache key for the energy skin (the Host file stays authoritative). */
const SKIN_STORAGE_KEY = 'dsh-whale-effort.skin'

function readCachedSkin(): Skin {
  try {
    const stored = window.localStorage.getItem(SKIN_STORAGE_KEY)
    return isSkin(stored) ? stored : DEFAULT_SKIN
  } catch {
    return DEFAULT_SKIN
  }
}

let currentSkin: Skin = readCachedSkin()
const skinListeners = new Set<() => void>()

/** Module-level skin store shared by the settings row and the slider. */
export const skinStore = {
  getSnapshot: (): Skin => currentSkin,
  subscribe: (listener: () => void): (() => void) => {
    skinListeners.add(listener)
    return () => skinListeners.delete(listener)
  },
  /**
   * Publish a new skin and remember it in local storage.
   * @param skin - one of the supported skins.
   * @param persist - whether the value should be written to local storage.
   */
  set: (skin: Skin, persist = true): void => {
    if (!isSkin(skin)) return
    if (persist) {
      try {
        window.localStorage.setItem(SKIN_STORAGE_KEY, skin)
      } catch {
        // The current page still follows the choice when storage is unavailable.
      }
    }
    if (currentSkin === skin) return
    currentSkin = skin
    skinListeners.forEach((listener) => listener())
  },
}
