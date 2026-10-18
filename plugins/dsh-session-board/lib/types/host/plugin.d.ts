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
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name; mirrors the row id in `cordis.patch.yml`. */
export declare const name = "dsh-session-board";
/**
 * The services the host half cannot work without: the durable domain facility,
 * the authenticated `/api` transport, and the raw route carrier the SSE stream
 * needs. Cordis runs `apply` only once all three are present, and unloads this
 * plugin if one disappears.
 */
export declare const inject: string[];
/**
 * Wire the ledger, the JSON routes, and the SSE stream.
 * @param ctx - Host plugin context; already carries the injected services.
 * @returns teardown ending every held stream (Cordis owns the rest: the route
 * registrations, the `session/event` listener, and both domains close through
 * their own effects, in reverse registration order).
 */
export declare function apply(ctx: Context): () => void;
