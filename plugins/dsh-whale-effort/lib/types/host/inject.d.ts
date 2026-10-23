/**
 * Policy injection into one exactly identified session.
 *
 * The durable-injection channel is the documented `agent/pre-step` waterfall:
 * a listener may append user messages to the admitted step, and the loop
 * commits each one as a durable `user/message` event (model-visible means
 * logged). Three disciplines make that safe:
 *
 * - **Changed text only.** One step per injection: the loop appends committed
 *   messages on every step, so injecting the same text again would fill the
 *   history with duplicates.
 * - **Delegate first.** `next()` computes the framework's own decision; this
 *   listener only appends to it and never drops an earlier listener's choice.
 * - **Fail open.** A session-scoped debug aid must never fail a step: the
 *   listener contains its own failures and always returns a valid decision.
 *
 * The message is a `user`-role message whose source declares the producing
 * plugin: rc.2 has no catch-all "plugin" source kind, so the declaration below
 * adds one through the merge-extensible {@link MessageSourceMap}.
 *
 * @module dsh-whale-effort/host/inject
 */
import type { PreStepDecision } from '@deepseek-ai/dsh-agent';
import type { ContextFormed, UserMessage } from '@deepseek-ai/dsh-llm';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        /**
         * Policy text dsh-whale-effort appends through `agent/pre-step`.
         *
         * Session format v4 requires a producer-owned source kind and rejects the
         * retired `kind: 'plugin'` wrapper (`format v4 message requires a
         * producer-owned source kind`). Each producer declares its own kind, so the
         * stable middle dot here is the plugin id itself.
         */
        'dsh-whale-effort': {
            readonly kind: 'dsh-whale-effort';
        } & ContextFormed;
    }
}
/** Stable producer id used by logs and the durable message source kind. */
export declare const PLUGIN_ID = "dsh-whale-effort";
/**
 * Build one instruction message carrying the policy body.
 * @param text - non-empty policy or off-notice text.
 * @returns a durable user message with plugin-attributed source.
 */
export declare function instructionMessage(text: string): UserMessage;
/**
 * Decide whether the resolved text must be injected.
 * @param lastInjected - text injected for this session previously, if any.
 * @param text - text that should currently be in effect.
 * @returns whether a new durable message is required.
 */
export declare function shouldInject(lastInjected: string | undefined, text: string): boolean;
/** The pre-step payload fields this listener reads. */
export interface PreStepPayload {
    /** Agent whose session is about to take a step; its id is the session id. */
    readonly agent: {
        readonly id: string;
    };
    /** Messages the framework admitted for this step. */
    readonly messages: UserMessage[];
}
/** One `agent/pre-step` waterfall listener. */
export type PreStepListener = (payload: PreStepPayload, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>;
/** The narrow Cordis surface this injector needs (one `ctx.on` registration). */
export interface PolicyListenerHost {
    /**
     * Register the pre-step listener for the lifetime of the owning fiber.
     * @param name - the waterfall event name.
     * @param listener - the listener to register.
     * @returns the disposer removing the listener.
     */
    on(name: 'agent/pre-step', listener: PreStepListener): () => boolean;
}
/** Sink for contained injection failures. */
export type InjectLog = (message: string) => void;
/** Options accepted by {@link createPolicyInjector}. */
export interface PolicyInjectorOptions {
    /**
     * Resolve the text that should currently be in effect for one session.
     * Deduplication stays here; the resolver may be called on every step.
     */
    readonly resolve: (sessionId: string) => string;
    /** Optional diagnostic sink for contained failures. */
    readonly log?: InjectLog;
}
/** Handle for the registered pre-step listener. */
export interface PolicyInjector {
    /** Last text actually injected for one session. */
    readonly lastInjected: (sessionId: string) => string | undefined;
    /** Remove the listener and clear retained state. */
    dispose(): void;
}
/**
 * Register the per-session policy listener for the lifetime of `ctx`.
 * @param ctx - plugin context; the listener is disposed with it.
 * @param options - session text resolver and diagnostic sink.
 * @returns the injector handle.
 */
export declare function createPolicyInjector(ctx: PolicyListenerHost, options: PolicyInjectorOptions): PolicyInjector;
