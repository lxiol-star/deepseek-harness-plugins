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

import type { Context } from '@deepseek-ai/cordis'
// Type-only imports activate service and event declarations; they are erased at build time.
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-settings'
import { createGuidance, readConfig, type GuidanceApi, type WhaleConfig } from './host/guidance.js'
import {
  createStateFile,
  describeError,
  resolveStatePath,
  type StateFile,
} from './host/state.js'
import { createTurbo, type SessionStoreLike, type Turbo } from './host/turbo.js'
import { createChannelHandler, RPC_CHANNEL } from './host/rpc.js'

/** Cordis plugin name used by loader diagnostics and log lines. */
export const name = 'dsh-whale-effort'

/**
 * Plugin configuration (validated structurally in {@link apply}).
 *
 * Declared as a type only: the published package must not import a config
 * schema library, and rc.2 passes the row's `config` object through unchanged
 * when no runtime `Config` export exists.
 */
export interface Config extends WhaleConfig {}

/** Sink for plugin diagnostics. */
type Log = (message: string) => void

/**
 * Build a diagnostic sink that never throws.
 *
 * `ctx.logger` is a Context built-in rather than a service, so it is read
 * directly; every call is contained because logging must not be able to
 * disable the feature it is describing.
 * @param ctx - plugin context.
 * @returns a function writing one prefixed line per message.
 */
function createLog(ctx: Context): Log {
  let sink: { warn?: (message: string) => void } | undefined
  try {
    sink = ctx.logger(name)
  } catch {
    sink = undefined
  }
  return (message: string): void => {
    const line = `[${name}] ${message}`
    try {
      if (sink !== undefined && typeof sink.warn === 'function') {
        sink.warn(line)
        return
      }
    } catch {
      // Fall through to the console fallback.
    }
    try {
      console.warn(line)
    } catch {
      // A missing console is not worth another failure.
    }
  }
}

/**
 * Wire every capability for one plugin fiber.
 * @param ctx - plugin context.
 * @param config - structurally narrowed plugin config.
 */
function setup(ctx: Context, config: WhaleConfig): void {
  const log = createLog(ctx)

  let state: StateFile | undefined
  try {
    state = createStateFile({ path: resolveStatePath(config.statePath), log })
  } catch (error) {
    log(`state file unavailable, toggles will not persist: ${describeError(error)}`)
  }

  let guidance: GuidanceApi | undefined
  try {
    guidance = createGuidance({ config })
  } catch (error) {
    log(`guidance unavailable: ${describeError(error)}`)
  }

  let sessionsStore: SessionStoreLike | undefined
  let turbo: Turbo | undefined
  if (state !== undefined) {
    try {
      turbo = createTurbo(ctx, {
        state,
        log,
        sessions: () => sessionsStore,
      })
      ctx.effect(() => () => {
        try {
          turbo?.dispose()
        } catch {
          // Disposal is already best-effort inside the capability.
        }
      }, 'whale-effort: session state and fleet meter')
    } catch (error) {
      log(`session state and fleet meter unavailable: ${describeError(error)}`)
      turbo = undefined
    }
  }

  // The RPC channel exists only in Web profiles; mount it without blocking the
  // plugin row in terminal profiles. The route asks the connection service for
  // the same Host/Origin + browser-session fence the shared `/api` transport uses.
  try {
    ctx.inject(['connection', 'webServer'], (routeCtx) => {
      try {
        const connection = routeCtx.connection
        const webServer = routeCtx.webServer
        const handler = createChannelHandler({
          authorize: (request) => connection.requestRejection(request),
          guidance: () => guidance,
          turbo: () => {
            if (turbo === undefined) throw new Error('session state is unavailable in this profile')
            return turbo
          },
        })
        routeCtx.effect(
          () => webServer.register({ kind: 'prefix', path: RPC_CHANNEL, handler }),
          'whale-effort: rpc channel',
        )
      } catch (error) {
        log(`rpc channel registration failed: ${describeError(error)}`)
      }
    })
  } catch (error) {
    log(`rpc channel unavailable: ${describeError(error)}`)
  }

  // Guidance needs the settings document and the model directory. They are
  // optional: on profiles without them `diagnose` returns a stable error code.
  try {
    ctx.inject(['settings', 'llm'], (servicesCtx) => {
      try {
        guidance = createGuidance({ config, settings: servicesCtx.settings, llm: servicesCtx.llm })
      } catch (error) {
        log(`guidance services unavailable: ${describeError(error)}`)
      }
      return () => {
        try {
          guidance = createGuidance({ config })
        } catch (error) {
          log(`guidance reset failed: ${describeError(error)}`)
        }
      }
    })
  } catch (error) {
    log(`guidance services unavailable: ${describeError(error)}`)
  }

  // Fleet membership needs the live session store for the initial index and
  // for ancestors created before this plugin loaded.
  try {
    ctx.inject(['sessions'], (sessionsCtx) => {
      try {
        sessionsStore = sessionsCtx.sessions
        turbo?.refresh()
      } catch (error) {
        log(`live session store unavailable: ${describeError(error)}`)
      }
      return () => {
        sessionsStore = undefined
        try {
          turbo?.refresh()
        } catch (error) {
          log(`session store reset failed: ${describeError(error)}`)
        }
      }
    })
  } catch (error) {
    log(`live session store unavailable: ${describeError(error)}`)
  }
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
export function apply(ctx: Context, config?: unknown): void {
  try {
    setup(ctx, readConfig(config))
  } catch (error) {
    try {
      console.error(`[${name}] initialization failed, skipped: ${describeError(error)}`)
    } catch {
      // Nothing further can be reported.
    }
  }
}
