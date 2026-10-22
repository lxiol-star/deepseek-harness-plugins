/**
 * dsh-whale-effort — host half.
 *
 * The plugin's Host side owns everything the browser half cannot know on its
 * own:
 *
 * - **Guidance** (`diagnose`, `store`): read-only reasoning-effort diagnostics
 *   for custom-provider models, computed from the live model directory and the
 *   active configuration document. It never writes configuration.
 * - **Session state** (`session/state`, `session/update`, `session/policy`):
 *   the per-session Ultra / lightning toggles, the global energy skin, and the
 *   fleet token-rate sample, persisted as one JSON document under the harness
 *   home.
 * - **Policy injection**: a contiguous policy body injected into exactly the
 *   session that enabled it, through the `agent/pre-step` waterfall, only when
 *   the resolved text changes.
 * - **Metrics**: `agent/assistant-stream` frames from sub-agent descendants of
 *   tracked sessions feed a pure fleet meter; no timers and no fabricated
 *   numbers.
 *
 * One authenticated loopback prefix route (`POST /dsh-whale-effort/<endpoint>`)
 * exposes the capabilities to the client half through the same
 * `requestRejection` fence as the shared Host API.
 *
 * The plugin is deliberately fail-open: every optional capability is wired
 * through a nested `ctx.inject`, every host service is read structurally, and
 * neither `apply` nor the pre-step listener can throw into the host. All
 * `@deepseek-ai/*` imports are type-only, erased at build time, so the
 * published bundle has no harness package dependency.
 *
 * @module dsh-whale-effort
 */
import type { Context } from '@deepseek-ai/cordis';
import { type WhaleConfig } from './host/guidance.js';
/** Cordis plugin name used by loader diagnostics and log lines. */
export declare const name = "dsh-whale-effort";
/**
 * Plugin configuration (validated structurally in {@link apply}).
 *
 * Declared as a type only: the published package must not import a config
 * schema library, and rc.2 passes the row's `config` object through unchanged
 * when no runtime `Config` export exists.
 */
export interface Config extends WhaleConfig {
}
/**
 * Start the Host half.
 *
 * Never throws: a failure here must not fail the plugin entry, because the
 * slider itself still works with the native effort pane when the Host extras
 * are unavailable.
 * @param ctx - plugin context.
 * @param config - raw row config from the composition.
 */
export declare function apply(ctx: Context, config?: unknown): void;
