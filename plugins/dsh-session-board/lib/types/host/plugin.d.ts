import type { Context } from '@deepseek-ai/cordis';
import { type WikiConfig } from '../shared/wiki.ts';
/** Cordis plugin name; mirrors the row id in `cordis.patch.yml`. */
export declare const name = "dsh-session-board";
/**
 * The services the host half cannot work without: the durable domain facility,
 * the authenticated `/api` transport, and the raw route carrier the SSE stream
 * needs. Cordis runs `apply` only once all three are present, and unloads this
 * plugin if one disappears.
 */
export declare const inject: string[];
/** One config validation issue in Standard Schema form. */
interface WikiConfigIssue {
    message: string;
    path: readonly (string | number)[];
}
/** Result of {@link Config} validation. */
type WikiConfigValidation = {
    value: WikiConfig;
    issues?: undefined;
} | {
    issues: WikiConfigIssue[];
    value?: undefined;
};
export declare const Config: {
    '~standard': {
        version: 1;
        vendor: string;
        /**
         * Validate one raw row config and fill deployment defaults.
         * @param value - raw `config` value from the Loader row.
         * @returns the complete config, or Standard Schema issues.
         */
        validate(value?: unknown): WikiConfigValidation;
    };
};
/**
 * Wire the ledger, the JSON routes, and the SSE stream.
 * @param ctx - Host plugin context; already carries the injected services.
 * @returns teardown ending every held stream (Cordis owns the rest: the route
 * registrations, the `session/event` listener, and both domains close through
 * their own effects, in reverse registration order).
 */
export declare function apply(ctx: Context, config?: unknown): () => void;
export {};
