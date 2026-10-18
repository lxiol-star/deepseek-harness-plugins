/**
 * The host half's view of the DSH model services, in two operations:
 * answer whether one exact provider/model route is currently advertised, and
 * run one one-shot text completion for knowledge synthesis.
 *
 * As everywhere else in this plugin, the service is declared structurally and
 * reached through the context: an installed plugin cannot resolve the
 * `@deepseek-ai/llm` package at runtime. The fields below mirror the public
 * `llm` service of the DSH checkout this package is built against
 * (`packages/llm/llm/src/index.ts`): `listProviders()`, `listModels(provider)`
 * and `stream(GenerateOptions)`, whose ordinary text output arrives as
 * `text-delta` chunks and ends with a `finish` chunk.
 */
import type { SynthesisModelCatalogGroup, SynthesisModelSelection, SynthesisModelVerdict } from '../shared/synthesis.ts';
/** One registered provider route (`LlmProviderInfo`). */
export interface HostModelProvider {
    readonly id: string;
    readonly name: string;
}
/** One advertised model route (`LlmModelInfo`). */
export interface HostModelInfo {
    readonly provider: string;
    readonly id: string;
    readonly name: string;
}
/** One adapter-owned reasoning effort (`LlmReasoningEffortInfo`). */
export interface HostReasoningEffortInfo {
    readonly id: string;
    readonly name: string;
}
/** Selectable reasoning efforts of one route (`LlmModelReasoningInfo`). */
export interface HostModelReasoningInfo {
    readonly efforts: readonly HostReasoningEffortInfo[];
    readonly defaultEffort?: string;
}
/** Exact-route metadata resolved by its adapter (`LlmResolvedModelInfo`). */
export interface HostResolvedModelInfo {
    readonly reasoning?: HostModelReasoningInfo;
}
/** One text block of a hand-built request. */
export interface HostTextBlock {
    readonly type: 'text';
    readonly text: string;
}
/** One provider-neutral user message of a hand-built request. */
export interface HostRequestMessage {
    readonly role: 'user';
    readonly content: readonly HostTextBlock[];
}
/** Terminal reason of one streamed call (`StreamChunk`'s `finish` member). */
export interface HostFinishReason {
    readonly kind: string;
    readonly failure?: {
        readonly code?: string;
        readonly message?: string;
    };
}
/** The subset of a streamed chunk this plugin reads. */
export interface HostStreamChunk {
    readonly type: string;
    /** Present on `text-delta`. */
    readonly text?: string;
    /** Present on `block-end`. */
    readonly block?: {
        readonly type?: string;
        readonly text?: string;
    };
    /** Present on `finish`. */
    readonly reason?: HostFinishReason;
}
/** The slice of `GenerateOptions` a one-shot synthesis call needs. */
export interface HostGenerateOptions {
    readonly provider: string;
    readonly model: string;
    /** Adapter-owned reasoning effort selected for this exact model. */
    readonly reasoningEffort?: string;
    readonly system?: string;
    readonly messages: readonly HostRequestMessage[];
    readonly maxTokens?: number;
    /**
     * Opaque session identity stamped for request routing; adapters may map it
     * to model-hidden transport metadata. It never reaches the model.
     */
    readonly sessionId?: string;
    readonly signal?: AbortSignal;
}
/** The slice of the `llm` service this plugin consumes. */
export interface HostLlmService {
    listProviders(): readonly HostModelProvider[];
    listModels(provider: string): Promise<readonly HostModelInfo[]>;
    resolveModelInfo(provider: string, model: string): Promise<HostResolvedModelInfo>;
    stream(options: HostGenerateOptions): AsyncIterable<HostStreamChunk>;
}
/** One one-shot synthesis call requested by the archiver. */
export interface SynthesisModelRequest {
    readonly provider: string;
    readonly model: string;
    /** Reasoning effort of the saved route; null/absent keeps the model default. */
    readonly reasoningEffort?: string | null;
    readonly system: string;
    readonly prompt: string;
    /**
     * Session whose archived text is being synthesized. DSH passes it to adapters
     * as model-hidden routing metadata (some gateway routes refuse a request
     * without one); it is not part of the prompt.
     */
    readonly sessionId: string;
    readonly signal: AbortSignal;
}
/** One model call's text output, or a failure the archiver records per session. */
export type SynthesisModelRunner = (request: SynthesisModelRequest) => Promise<string>;
/**
 * Output cap of one synthesis call, matching `wiki-synthesize.py`'s own
 * `max_tokens` for the provider path so both paths ask for the same budget.
 */
export declare const SYNTHESIS_MAX_TOKENS = 8192;
/**
 * Check one route against the host's currently advertised model routes.
 *
 * The check is deliberately dynamic: a saved preference may survive an
 * adapter removal, and a route that is no longer advertised must be refused at
 * write time and fail one synthesis rather than reach an unknown adapter.
 * @param llm - the host `llm` service.
 * @param selection - provider/model route to verify.
 * @returns whether both the provider route and the exact model are advertised.
 */
export declare function isKnownSynthesisModel(llm: HostLlmService, selection: SynthesisModelSelection): Promise<SynthesisModelVerdict>;
/**
 * List the host's currently advertised routes as picker groups.
 *
 * The browser cannot rely on reading another plugin's remote namespace in
 * every host build, so the settings page asks this plugin's own route and the
 * host answers from the same `llm` service the archiver calls. Providers with
 * no advertised model are kept as empty groups for diagnostics; the picker
 * flattens them away.
 * @param llm - the host `llm` service.
 * @returns one group per provider, in provider order.
 */
export declare function listSynthesisCatalog(llm: HostLlmService): Promise<SynthesisModelCatalogGroup[]>;
/** Re-export for the host half's own imports. */
export type { SynthesisModelVerdict };
/**
 * Run one one-shot completion and return its visible text.
 *
 * Reasoning blocks are ignored, a terminal `error`/`aborted` finish throws,
 * and `max-tokens` also throws: a truncated knowledge page would otherwise be
 * written with a cut body, which is worse than keeping the raw archive and
 * reporting failure.
 * @param llm - the host `llm` service.
 * @param request - exact route, system prompt, user prompt, and cancellation.
 * @returns the model's complete visible text.
 * @throws Error with a stable code when the call fails or produces no text.
 */
export declare function runSynthesisModel(llm: HostLlmService, request: SynthesisModelRequest): Promise<string>;
