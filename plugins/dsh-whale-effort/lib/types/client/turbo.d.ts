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
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client';
import { type Skin } from './effects/skins.js';
/** The slice of the client Connection service this module reads. */
export interface HostRpc {
    call(channel: string, endpoint: string, payload?: unknown): Promise<unknown>;
}
/** Prefix the Host half registers its endpoints on. */
export declare const RPC_CHANNEL = "/dsh-whale-effort";
/** One snapshot of the tracked session's turbo state plus the fleet sample. */
export interface TurboSnapshot {
    readonly lightning: boolean;
    readonly ultra: boolean;
    readonly skin: Skin;
    /** Generation + input tokens per second across the tracked session's subagents. */
    readonly rate: number;
    /** Generation-only tokens per second. */
    readonly gen: number;
    readonly agents: number;
    readonly generating: boolean;
    /** Cumulative tokens observed for the current fleet. */
    readonly total: number;
    /** Host clock at sampling time, for stale-sample checks. */
    readonly stamp: number;
    /** Policy body the Host would inject for this session right now. */
    readonly policy: string;
}
/** Snapshot used before the Host has answered, or when it cannot answer. */
export declare const EMPTY_TURBO: TurboSnapshot;
/** Fields a caller may change through {@link TurboService.update}. */
export interface TurboPatch {
    readonly session?: string;
    readonly lightning?: boolean;
    readonly ultra?: boolean;
    readonly skin?: Skin;
}
/** Typed facade over the Host channel; `null` while the Host half is absent. */
export interface TurboService {
    /** Read the session snapshot; `session` may be omitted for the global skin. */
    state(session?: SessionId | string): Promise<TurboSnapshot | null>;
    /** Change session-scoped toggles and/or the global skin. */
    update(patch: TurboPatch): Promise<Partial<TurboSnapshot> | null>;
    /** Read the policy body resolved for one session. */
    policy(session: string): Promise<string | null>;
}
/**
 * Build the typed facade.
 * @param rpc - the Connection RPC service, when the client exposes one.
 * @returns the facade, or `null` when no RPC transport exists.
 */
export declare function makeTurboService(rpc: HostRpc | undefined): TurboService | null;
/** Module-level skin store shared by the settings row and the slider. */
export declare const skinStore: {
    getSnapshot: () => Skin;
    subscribe: (listener: () => void) => (() => void);
    /**
     * Publish a new skin and remember it in local storage.
     * @param skin - one of the supported skins.
     * @param persist - whether the value should be written to local storage.
     */
    set: (skin: Skin, persist?: boolean) => void;
};
