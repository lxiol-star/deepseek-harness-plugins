/**
 * The host half's HTTP surface: two authenticated JSON routes on the shared
 * `/api` channel and one raw SSE route.
 *
 * The split is deliberate. Ack and snapshot go through `connection.fetch`,
 * which applies the Host/Origin trust fence and browser authentication for the
 * caller. The stream needs to hold a response open, which the Fetch form cannot
 * express, so it registers directly on `webServer` — and pays for that by
 * asking `connection.requestRejection` itself (see the handler).
 *
 * Every dependency is injected rather than reached through a context, so the
 * whole module is exercisable without a harness.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BoardFeed } from '../shared/types.ts';
import { type SynthesisModelPref, type SynthesisModelSelection } from '../shared/synthesis.ts';
import { type WikiArchiver } from './wiki-archive.ts';
/**
 * Physical request paths. `ConnectionFetchRoute.path` is matched against the
 * full request pathname and must start with `/api/`, so these are the exact
 * URLs the browser calls — not paths relative to the channel.
 */
export declare const BOARD_API_PREFIX = "/api/session-board";
/** `GET` → the whole durable snapshot. */
export declare const BOARD_SNAPSHOT_PATH = "/api/session-board/board";
/** `POST { sessionId }` → move that session's acknowledged cursor. */
export declare const BOARD_ACK_PATH = "/api/session-board/ack";
/** POST { sessionIds } → archive selected sessions into the local Wiki raw layer. */
export declare const BOARD_WIKI_ARCHIVE_PATH = "/api/session-board/wiki-archive";
/** POST { action } → read or write the saved synthesis-model preference. */
export declare const BOARD_SYNTHESIS_MODEL_PATH = "/api/session-board/synthesis-model";
/** Prefix owned by the raw SSE route. */
export declare const BOARD_STREAM_PREFIX = "/dsh-session-board";
/** `GET` → `text/event-stream`, one `state` frame per change. */
export declare const BOARD_STREAM_PATH = "/dsh-session-board/stream";
/** One exact Fetch route on the shared `/api` channel. */
export interface BoardFetchRoute {
    readonly path: string;
    readonly methods: readonly ('GET' | 'HEAD' | 'POST')[];
    readonly requestBody: 'buffered';
    readonly fetch: (request: Request) => Promise<Response>;
}
/** One raw prefix route on the web server. */
export interface BoardWebRoute {
    readonly kind: 'prefix';
    readonly path: string;
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
}
/** Trust-fence input: the headers of one incoming request. */
export interface BoardTrustRequest {
    readonly headers: IncomingMessage['headers'];
}
/**
 * The synthesis-model preference store and route validation.
 *
 * `read` is synchronous because the durable table is, and because the archiver
 * reads the current route per session; `write` resolves only once the value is
 * durable; `validate` answers whether one route is currently advertised, which
 * is what makes an unknown value a 400 instead of a saved dead route.
 */
export interface SynthesisModelStore {
    read(): SynthesisModelPref;
    write(pref: SynthesisModelPref): Promise<void>;
    validate(selection: SynthesisModelSelection): Promise<boolean>;
}
/** Collaborators of {@link createBoardRoutes}. */
export interface BoardRoutesOptions {
    /** Whole durable state. Must be synchronous and must not throw. */
    readonly snapshot: () => BoardFeed;
    /** Persist one ack; resolves true only once the write is durable. */
    readonly ack: (sessionId: string) => Promise<boolean>;
    /** Archive exact selected DSH IDs into the local Wiki raw layer. */
    readonly wikiArchive: WikiArchiver;
    /** Synthesis-model preference; absent means the route answers 503. */
    readonly synthesisModel?: SynthesisModelStore;
    /** Connection's Host/Origin + browser-session fence. */
    readonly requestRejection: (request: BoardTrustRequest) => 401 | 403 | undefined;
    /** Containment sink for request-time failures. */
    readonly warn: (message: string) => void;
}
/** The registered routes plus the fan-out they share. */
export interface BoardRoutes {
    /** Exact Fetch routes; register each inside its own effect scope. */
    readonly fetchRoutes: readonly BoardFetchRoute[];
    /** The SSE prefix route; register inside an effect scope. */
    readonly streamRoute: BoardWebRoute;
    /** Push the current snapshot to every held stream. */
    broadcast(): void;
    /** End every held stream; the plugin's unload path. */
    close(): void;
}
/**
 * Build the board's routes over injected state readers.
 * @param options - snapshot/ack readers plus the trust fence and log sink.
 * @returns the routes, the broadcaster, and the teardown for held streams.
 */
export declare function createBoardRoutes(options: BoardRoutesOptions): BoardRoutes;
