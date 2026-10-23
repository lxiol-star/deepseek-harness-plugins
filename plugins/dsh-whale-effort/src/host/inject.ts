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

import { randomUUID } from 'node:crypto'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { ContextFormed, MessageId, UserMessage } from '@deepseek-ai/dsh-llm'
import { describeError } from './state.js'

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
    'dsh-whale-effort': { readonly kind: 'dsh-whale-effort' } & ContextFormed
  }
}

/** Stable producer id used by logs and the durable message source kind. */
export const PLUGIN_ID = 'dsh-whale-effort'

/**
 * Build one instruction message carrying the policy body.
 * @param text - non-empty policy or off-notice text.
 * @returns a durable user message with plugin-attributed source.
 */
export function instructionMessage(text: string): UserMessage {
  return {
    id: randomUUID() as MessageId,
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'dsh-whale-effort', form: 'instructions' },
  }
}

/**
 * Decide whether the resolved text must be injected.
 * @param lastInjected - text injected for this session previously, if any.
 * @param text - text that should currently be in effect.
 * @returns whether a new durable message is required.
 */
export function shouldInject(lastInjected: string | undefined, text: string): boolean {
  return text.length > 0 && lastInjected !== text
}

/** The pre-step payload fields this listener reads. */
export interface PreStepPayload {
  /** Agent whose session is about to take a step; its id is the session id. */
  readonly agent: { readonly id: string }
  /** Messages the framework admitted for this step. */
  readonly messages: UserMessage[]
}

/** One `agent/pre-step` waterfall listener. */
export type PreStepListener = (payload: PreStepPayload, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>

/** The narrow Cordis surface this injector needs (one `ctx.on` registration). */
export interface PolicyListenerHost {
  /**
   * Register the pre-step listener for the lifetime of the owning fiber.
   * @param name - the waterfall event name.
   * @param listener - the listener to register.
   * @returns the disposer removing the listener.
   */
  on(name: 'agent/pre-step', listener: PreStepListener): () => boolean
}

/** Sink for contained injection failures. */
export type InjectLog = (message: string) => void

/** Options accepted by {@link createPolicyInjector}. */
export interface PolicyInjectorOptions {
  /**
   * Resolve the text that should currently be in effect for one session.
   * Deduplication stays here; the resolver may be called on every step.
   */
  readonly resolve: (sessionId: string) => string
  /** Optional diagnostic sink for contained failures. */
  readonly log?: InjectLog
}

/** Handle for the registered pre-step listener. */
export interface PolicyInjector {
  /** Last text actually injected for one session. */
  readonly lastInjected: (sessionId: string) => string | undefined
  /** Remove the listener and clear retained state. */
  dispose(): void
}

/**
 * Register the per-session policy listener for the lifetime of `ctx`.
 * @param ctx - plugin context; the listener is disposed with it.
 * @param options - session text resolver and diagnostic sink.
 * @returns the injector handle.
 */
export function createPolicyInjector(ctx: PolicyListenerHost, options: PolicyInjectorOptions): PolicyInjector {
  const log = options.log ?? (() => {})
  const lastInjected = new Map<string, string>()
  let disposed = false

  const listener: PreStepListener = async (payload, next) => {
    let decision: PreStepDecision
    try {
      // The framework's own decision (runtime-context projection) must be
      // computed first; this listener only appends to it.
      decision = await next()
    } catch (error) {
      log(`policy injection skipped: pre-step delegation failed (${describeError(error)})`)
      return { kind: 'enter', messages: [...payload.messages] }
    }
    try {
      if (disposed || decision.kind !== 'enter') return decision
      // An empty admitted batch means this proposed step spends no model call
      // (the loop closes the turn instead), so appending context here would
      // only manufacture a request. Leave such a decision untouched.
      if (decision.messages.length === 0) return decision
      const sessionId: unknown = payload.agent.id
      if (typeof sessionId !== 'string' || sessionId.length === 0) return decision
      const text = options.resolve(sessionId)
      if (!shouldInject(lastInjected.get(sessionId), text)) return decision
      lastInjected.set(sessionId, text)
      return { ...decision, messages: [...decision.messages, instructionMessage(text)] }
    } catch (error) {
      log(`policy injection skipped: ${describeError(error)}`)
      return decision
    }
  }

  const off = ctx.on('agent/pre-step', listener)
  return {
    lastInjected: (sessionId) => lastInjected.get(sessionId),
    dispose(): void {
      if (disposed) return
      disposed = true
      lastInjected.clear()
      try {
        off()
      } catch {
        // Unloading a listener that is already gone is not an error.
      }
    },
  }
}
