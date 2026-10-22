/**
 * The authenticated loopback RPC channel shared with the browser half.
 *
 * One prefix route, `POST /dsh-whale-effort/<endpoint>`, carrying the same
 * envelope the shared Connection transport uses:
 *
 * - request: `{ type: 'client-request', rpcId, method, payload? }`
 * - response: `{ type: 'server-response', rpcId, result }` where `result` is
 *   `{ ok: true, value }` or `{ ok: false, error: { code, message, details } }`.
 *
 * The handler answers requests only after `requestRejection` (Host/Origin plus
 * browser-session authentication) admits them, and nothing here throws to the
 * server: every failure becomes an error envelope.
 *
 * @module dsh-whale-effort/host/rpc
 */
import type { GuidanceApi } from './guidance.js';
import type { Turbo } from './turbo.js';
/** Prefix the browser half posts to. */
export declare const RPC_CHANNEL = "/dsh-whale-effort";
/** Largest request body this channel accepts, in bytes. */
export declare const MAX_REQUEST_BYTES: number;
/** A plain JSON object (the only envelope body the browser half parses). */
export type JsonObject = Record<string, unknown>;
/** The node request surface one prefix route owns. */
export interface RouteRequest {
    /** HTTP method, if present. */
    readonly method?: string;
    /** Request target, if present. */
    readonly url?: string;
    /** Request headers. */
    readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
    /** Register one request stream listener. */
    on(event: 'data', listener: (chunk: Uint8Array) => void): void;
    /** Register the end-of-stream listener. */
    on(event: 'end', listener: () => void): void;
    /** Register the stream-failure listener. */
    on(event: 'error', listener: (error: unknown) => void): void;
}
/** The node response surface one prefix route owns. */
export interface RouteResponse {
    /** Write the status line and headers. */
    writeHead(status: number, headers?: Record<string, string>): unknown;
    /** Complete the response. */
    end(body?: string): unknown;
}
/** One decoded `client-request` envelope posted by the browser half. */
export interface ClientRequestEnvelope {
    /** Caller-chosen correlation id, echoed on the response. */
    readonly rpcId: string;
    /** Endpoint the envelope addresses. */
    readonly method: string;
    /** Endpoint-specific body. */
    readonly payload?: unknown;
}
/** @returns a success result envelope body. */
export declare function okResult(value: unknown): JsonObject;
/**
 * @param code - stable machine code for the browser half.
 * @param message - human-readable summary.
 * @returns a failure result envelope body; `details` is always an object.
 */
export declare function failResult(code: string, message: string): JsonObject;
/**
 * Parse one `client-request` envelope.
 * @param value - decoded JSON body of any shape.
 * @returns the envelope, or undefined when it is not a well-formed request.
 */
export declare function parseEnvelope(value: unknown): ClientRequestEnvelope | undefined;
/**
 * Serialize one `server-response` envelope.
 * @param rpcId - correlation id being answered.
 * @param result - result body from {@link okResult} / {@link failResult}.
 * @returns the JSON response body.
 */
export declare function envelopeOf(rpcId: string, result: JsonObject): string;
/**
 * Extract the endpoint segment of a channel URL.
 * @param url - request target, possibly carrying a query string.
 * @returns the endpoint name, or undefined when the path is not this channel's.
 */
export declare function endpointOf(url: string | undefined): string | undefined;
/**
 * Read one JSON request body, refusing anything past {@link MAX_REQUEST_BYTES}.
 * @param request - request stream.
 * @returns the parsed JSON value.
 */
export declare function readJsonBody(request: RouteRequest): Promise<unknown>;
/** What the endpoint dispatcher may call. */
export interface EndpointDeps {
    /** Current guidance capability (replaced when the settings/model services mount). */
    readonly guidance: () => GuidanceApi | undefined;
    /** Current session-state capability. */
    readonly turbo: () => Turbo;
}
/**
 * Answer one endpoint with the result envelope body the browser half parses.
 * @param deps - current guidance and session capabilities.
 * @param endpoint - addressed endpoint name.
 * @param payload - decoded request payload.
 * @returns the result body; never rejects for endpoint-level failures.
 */
export declare function dispatchEndpoint(deps: EndpointDeps, endpoint: string, payload: unknown): Promise<JsonObject>;
/** What the channel route needs from its owner. */
export interface ChannelOptions extends EndpointDeps {
    /**
     * Apply the deployment's Host/Origin and browser-session fence.
     * @param request - incoming request headers.
     * @returns a rejection status, or undefined when the request may proceed.
     */
    readonly authorize: (request: RouteRequest) => 401 | 403 | undefined;
}
/**
 * Build the HTTP handler for the channel's prefix route.
 * @param options - authorization fence plus the endpoint capabilities.
 * @returns the request handler; it answers every path without throwing.
 */
export declare function createChannelHandler(options: ChannelOptions): (request: RouteRequest, response: RouteResponse) => Promise<void>;
