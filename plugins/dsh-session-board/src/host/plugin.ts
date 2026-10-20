/**
 * Host half of `dsh-session-board`.
 *
 * It does exactly the three things the browser half cannot: it persists the
 * acknowledged cursor, it registers turn-end facts (`lastTurnEnd`,
 * `lastTurnEndKind`, the truncated error note) and turn starts from
 * `session/event`, and it pushes the whole durable state to every client over
 * one SSE stream. Rendering, ordering, and classification all live in the
 * client half.
 *
 * @remarks
 * Everything here is additive: two private storage domains, two authenticated
 * `/api` routes, one raw route. Removing the bundle row is a complete
 * uninstall.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only import that completes the ambient surface used below: the
// `session/event` declaration. Erased at build time.
import type {} from '@deepseek-ai/dsh-session'
import { EMPTY_FEED } from '../shared/types.ts'
import { SYNTHESIS_PREFS_KEY, selectionOf, type SynthesisModelPref, type SynthesisModelSelection } from '../shared/synthesis.ts'
import { ACK_TABLE_NAME, PREFS_TABLE_NAME, TURN_TABLE_NAME, ackDomainSpec, prefsDomainSpec, turnDomainSpec } from './domain.ts'
import type { BoardPrefsTable, DomainSpec, DomainTableSpec, KvTableLike } from './domain.ts'
import { BoardLedger, describeError, subscribeBoardLedger } from './ledger.ts'
import { startManager } from './manager/wiring.ts'
import { isKnownSynthesisModel, listSynthesisCatalog, runSynthesisModel, type HostLlmService } from './model-service.ts'
import { createWikiArchiver } from './wiki-archive.ts'
import { createBoardRoutes } from './routes.ts'
import type { BoardFetchRoute, BoardTrustRequest, BoardWebRoute } from './routes.ts'

/** Cordis plugin name; mirrors the row id in `cordis.patch.yml`. */
export const name = 'dsh-session-board'

/**
 * The services the host half cannot work without: the durable domain facility,
 * the authenticated `/api` transport, and the raw route carrier the SSE stream
 * needs. Cordis runs `apply` only once all three are present, and unloads this
 * plugin if one disappears.
 */
export const inject = ['storageDomain', 'connection', 'webServer', 'llm']

/**
 * Structural views of the three host services consumed here.
 *
 * The services are published by `@deepseek-ai/dsh-storage-domain` and
 * `@deepseek-ai/dsh-client-connection` / `@deepseek-ai/dsh-host-webserver`,
 * none of which an installed plugin can resolve at runtime (see the note in
 * `domain.ts`); a type-only import of an undeclared-if-installed package would
 * also fail the typecheck. Each view therefore lists exactly the members used.
 * `@deepseek-ai/dsh-session-log-export` makes the same trade for `connection`.
 */
interface HostConnectionService {
  readonly fetch: { register(route: BoardFetchRoute): () => Promise<void> | void }
  /** Host/Origin fence plus browser authentication; 401/403 refuses. */
  requestRejection(request: BoardTrustRequest): 401 | 403 | undefined
}

/** Structural view of the composition's `webServer` service (see above). */
interface HostWebServerService {
  register(route: BoardWebRoute): () => void
}

/** Structural view of the composition's `storageDomain` service (see above). */
interface HostStorageDomainService {
  open<S extends DomainSpec>(spec: S): Promise<HostDomain<S>>
}

/** One open domain, as far as this plugin uses it. */
interface HostDomain<S extends DomainSpec> {
  table<N extends keyof S['tables'] & string>(name: N): KvTableLike<TableValueOf<S, N>>
  close(): Promise<void>
}

/** Value type of one declared table, recovered from its declaration. */
type TableValueOf<S extends DomainSpec, N extends keyof S['tables']> =
  S['tables'][N] extends DomainTableSpec<infer V> ? V : never

/** The composition's `connection` service (see {@link HostConnectionService}). */
function connectionOf(ctx: Context): HostConnectionService {
  return Reflect.get(ctx, 'connection') as HostConnectionService
}

/** The composition's `webServer` service (see {@link HostWebServerService}). */
function webServerOf(ctx: Context): HostWebServerService {
  return Reflect.get(ctx, 'webServer') as HostWebServerService
}

/** The composition's `storageDomain` service (see {@link HostStorageDomainService}). */
function storageDomainOf(ctx: Context): HostStorageDomainService {
  return Reflect.get(ctx, 'storageDomain') as HostStorageDomainService
}

/** The composition's `llm` service (see {@link HostLlmService}). */
function llmOf(ctx: Context): HostLlmService {
  return Reflect.get(ctx, 'llm') as HostLlmService
}

/**
 * Wire the ledger, the JSON routes, and the SSE stream.
 * @param ctx - Host plugin context; already carries the injected services.
 * @returns teardown ending every held stream (Cordis owns the rest: the route
 * registrations, the `session/event` listener, and both domains close through
 * their own effects, in reverse registration order).
 */
export function apply(ctx: Context): () => void {
  const warn = (message: string): void => { ctx.logger?.warn?.(message) }

  // `inject` above guarantees all three services for this plugin's whole life,
  // so the structural views are resolved once here.
  const storageDomain = storageDomainOf(ctx)
  const connection = connectionOf(ctx)
  const webServer = webServerOf(ctx)
  const llm = llmOf(ctx)

  /**
   * The ledger exists only once both domains are open, but the routes register
   * synchronously during `apply`. This cell and `ledgerReady` bridge the two:
   * the snapshot route reads the cell (never blocking, never rejecting), and
   * the ack route awaits the promise, which always settles.
   */
  let ledger: BoardLedger | null = null
  /** Open only once the preference domain is available; null keeps the fallback. */
  let prefs: BoardPrefsTable | null = null

  const readSynthesisPref = (): SynthesisModelPref => prefs?.get(SYNTHESIS_PREFS_KEY) ?? { model: null, provider: null, reasoningEffort: null }

  const wikiArchive = createWikiArchiver({
    models: {
      read: (): SynthesisModelSelection | null => selectionOf(readSynthesisPref()),
      complete: request => runSynthesisModel(llm, request),
    },
  })
  const routes = createBoardRoutes({
    snapshot: () => ledger?.snapshot() ?? EMPTY_FEED,
    ack: async (sessionId) => {
      const ready = await ledgerReady
      return ready === null ? false : await ready.ack(sessionId)
    },
    requestRejection: (request) => connection.requestRejection(request),
    wikiArchive,
    synthesisModel: {
      read: readSynthesisPref,
      write: async (pref) => {
        const table = prefs
        if (table === null) throw new Error('STORE_UNAVAILABLE')
        await table.put(SYNTHESIS_PREFS_KEY, pref)
      },
      validate: selection => isKnownSynthesisModel(llm, selection),
      catalog: () => listSynthesisCatalog(llm),
    },
    warn,
  })

  /**
   * Open both domains and hand their tables to a ledger. Never rejects: if the
   * durable store is unavailable the host half degrades to "no durable facts"
   * and the client half still renders from its own projections.
   */
  const ledgerReady: Promise<BoardLedger | null> = (async (): Promise<BoardLedger | null> => {
    let ackDomain: HostDomain<typeof ackDomainSpec> | null = null
    try {
      ackDomain = await storageDomain.open(ackDomainSpec)
      const turnDomain = await storageDomain.open(turnDomainSpec)
      // The opener owns each handle: closing is this fiber's effect.
      const openedAcks = ackDomain
      ctx.effect(() => () => openedAcks.close(), 'dsh-session-board: acks domain')
      ctx.effect(() => () => turnDomain.close(), 'dsh-session-board: turns domain')
      const created = new BoardLedger({
        acks: ackDomain.table(ACK_TABLE_NAME),
        turns: turnDomain.table(TURN_TABLE_NAME),
        onChange: () => { routes.broadcast() },
        warn,
      })
      ledger = created
      // Startup scan: no turn recorded as open survives a process restart.
      // Nothing is connected yet, so the frames this may push go nowhere.
      await created.reconcileOpenTurns()
      return created
    } catch (error) {
      if (ackDomain !== null) void ackDomain.close().catch((closeError: unknown) => warn(`dsh-session-board: acks domain close failed: ${String(closeError)}`))
      warn(
        'dsh-session-board: durable store unavailable, acks and turn facts are disabled: '
        + describeError(error),
      )
      return null
    }
  })()

  /**
   * The preference domain opens independently: a broken preference store must
   * not disable the durable acknowledgement and turn facts, and vice versa.
   * Failure leaves `prefs` null, which means "no saved route" (Wiki fallback).
   */
  void (async (): Promise<void> => {
    try {
      const domain = await storageDomain.open(prefsDomainSpec)
      ctx.effect(() => () => domain.close(), 'dsh-session-board: prefs domain')
      prefs = domain.table(PREFS_TABLE_NAME)
    } catch (error) {
      warn(`dsh-session-board: synthesis preference store unavailable, using the Wiki provider: ${describeError(error)}`)
    }
  })()

  // Connection applies the trust fence and browser authentication to these two
  // routes; registering through `fetch` is what keeps them off the raw carrier.
  for (const route of routes.fetchRoutes) {
    ctx.effect(() => connection.fetch.register(route), `dsh-session-board: ${route.path}`)
  }
  // The stream holds its response open, which the Fetch form cannot express, so
  // it registers on the web server and carries its own `requestRejection` call.
  ctx.effect(() => webServer.register(routes.streamRoute), 'dsh-session-board: SSE stream')

  // `ctx.on` is already effect-scoped; wrapping it again would double-dispose.
  subscribeBoardLedger(ctx, ledgerReady)

  // The manager panel needs the Session/Agent/Workspace services the board half
  // does not: wait for them in a nested injection so a profile without them
  // simply gets no manager panel instead of losing the whole plugin.
  ctx.inject(
    ['storageDomain', 'connection', 'sessionController', 'workspaceRegistry', 'agents'],
    (managerCtx: Context) => {
      try {
        startManager({
          ctx: managerCtx,
          storageDomain: storageDomainOf(managerCtx),
          connection: connectionOf(managerCtx),
          warn,
        })
      } catch (error) {
        warn(`dsh-session-board: manager unavailable: ${String(error)}`)
      }
    },
  )

  return () => { wikiArchive.close(); routes.close() }
}
