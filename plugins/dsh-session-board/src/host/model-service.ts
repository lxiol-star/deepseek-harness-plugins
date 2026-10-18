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
import type {
  SynthesisModelCatalogGroup,
  SynthesisModelCatalogModel,
  SynthesisModelReasoningEffort,
  SynthesisModelSelection,
  SynthesisModelVerdict,
} from '../shared/synthesis.ts'

/** One registered provider route (`LlmProviderInfo`). */
export interface HostModelProvider {
  readonly id: string
  readonly name: string
}

/** One advertised model route (`LlmModelInfo`). */
export interface HostModelInfo {
  readonly provider: string
  readonly id: string
  readonly name: string
}

/** One adapter-owned reasoning effort (`LlmReasoningEffortInfo`). */
export interface HostReasoningEffortInfo {
  readonly id: string
  readonly name: string
}

/** Selectable reasoning efforts of one route (`LlmModelReasoningInfo`). */
export interface HostModelReasoningInfo {
  readonly efforts: readonly HostReasoningEffortInfo[]
  readonly defaultEffort?: string
}

/** Exact-route metadata resolved by its adapter (`LlmResolvedModelInfo`). */
export interface HostResolvedModelInfo {
  readonly reasoning?: HostModelReasoningInfo
}

/** One text block of a hand-built request. */
export interface HostTextBlock {
  readonly type: 'text'
  readonly text: string
}

/** One provider-neutral user message of a hand-built request. */
export interface HostRequestMessage {
  readonly role: 'user'
  readonly content: readonly HostTextBlock[]
}

/** Terminal reason of one streamed call (`StreamChunk`'s `finish` member). */
export interface HostFinishReason {
  readonly kind: string
  readonly failure?: { readonly code?: string; readonly message?: string }
}

/** The subset of a streamed chunk this plugin reads. */
export interface HostStreamChunk {
  readonly type: string
  /** Present on `text-delta`. */
  readonly text?: string
  /** Present on `block-end`. */
  readonly block?: { readonly type?: string; readonly text?: string }
  /** Present on `finish`. */
  readonly reason?: HostFinishReason
}

/** The slice of `GenerateOptions` a one-shot synthesis call needs. */
export interface HostGenerateOptions {
  readonly provider: string
  readonly model: string
  /** Adapter-owned reasoning effort selected for this exact model. */
  readonly reasoningEffort?: string
  readonly system?: string
  readonly messages: readonly HostRequestMessage[]
  readonly maxTokens?: number
  /**
   * Opaque session identity stamped for request routing; adapters may map it
   * to model-hidden transport metadata. It never reaches the model.
   */
  readonly sessionId?: string
  readonly signal?: AbortSignal
}

/** The slice of the `llm` service this plugin consumes. */
export interface HostLlmService {
  listProviders(): readonly HostModelProvider[]
  listModels(provider: string): Promise<readonly HostModelInfo[]>
  resolveModelInfo(provider: string, model: string): Promise<HostResolvedModelInfo>
  stream(options: HostGenerateOptions): AsyncIterable<HostStreamChunk>
}

/** One one-shot synthesis call requested by the archiver. */
export interface SynthesisModelRequest {
  readonly provider: string
  readonly model: string
  /** Reasoning effort of the saved route; null/absent keeps the model default. */
  readonly reasoningEffort?: string | null
  readonly system: string
  readonly prompt: string
  /**
   * Session whose archived text is being synthesized. DSH passes it to adapters
   * as model-hidden routing metadata (some gateway routes refuse a request
   * without one); it is not part of the prompt.
   */
  readonly sessionId: string
  readonly signal: AbortSignal
}

/** One model call's text output, or a failure the archiver records per session. */
export type SynthesisModelRunner = (request: SynthesisModelRequest) => Promise<string>

/**
 * Output cap of one synthesis call, matching `wiki-synthesize.py`'s own
 * `max_tokens` for the provider path so both paths ask for the same budget.
 */
export const SYNTHESIS_MAX_TOKENS = 8192

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
export async function isKnownSynthesisModel(
  llm: HostLlmService,
  selection: SynthesisModelSelection,
): Promise<SynthesisModelVerdict> {
  let providers: readonly HostModelProvider[]
  try {
    providers = llm.listProviders()
  } catch {
    return 'UNKNOWN_MODEL'
  }
  if (!providers.some(provider => provider.id === selection.provider)) return 'UNKNOWN_MODEL'
  try {
    const models = await llm.listModels(selection.provider)
    if (!models.some(model => model.id === selection.model)) return 'UNKNOWN_MODEL'
  } catch {
    return 'UNKNOWN_MODEL'
  }
  const effort = selection.reasoningEffort
  if (effort === undefined || effort === null || effort === '') return 'ok'
  try {
    const resolved = await llm.resolveModelInfo(selection.provider, selection.model)
    const efforts = sanitizeReasoningEfforts(resolved.reasoning)
    return efforts.some(candidate => candidate.id === effort) ? 'ok' : 'UNKNOWN_EFFORT'
  } catch {
    return 'UNKNOWN_EFFORT'
  }
}

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
export async function listSynthesisCatalog(llm: HostLlmService): Promise<SynthesisModelCatalogGroup[]> {
  const providers = llm.listProviders()
  const groups: SynthesisModelCatalogGroup[] = []
  for (const provider of providers) {
    let models: readonly HostModelInfo[] = []
    try {
      models = await llm.listModels(provider.id)
    } catch {
      models = []
    }
    const rows = await Promise.all(models
      .filter(model => typeof model.id === 'string' && model.id !== '')
      .map(async (model): Promise<SynthesisModelCatalogModel> => {
        const row: SynthesisModelCatalogModel = { id: model.id, name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id }
        let resolved: HostResolvedModelInfo
        try {
          resolved = await llm.resolveModelInfo(provider.id, model.id)
        } catch {
          return row
        }
        const efforts = sanitizeReasoningEfforts(resolved.reasoning)
        if (efforts.length === 0) return row
        const declared = typeof resolved.reasoning?.defaultEffort === 'string' ? resolved.reasoning.defaultEffort : null
        const defaultEffort = declared !== null && efforts.some(effort => effort.id === declared) ? declared : undefined
        return { ...row, reasoning: { efforts, ...(defaultEffort === undefined ? {} : { defaultEffort }) } }
      }))
    groups.push({ id: provider.id, name: typeof provider.name === 'string' && provider.name !== '' ? provider.name : provider.id, models: rows })
  }
  return groups
}

/**
 * Normalize one adapter's effort list: non-empty unique ids, display names
 * falling back to the id, original adapter order preserved.
 * @param reasoning - adapter-disclosed reasoning info, if any.
 * @returns sanitized efforts (empty when the route discloses none).
 */
function sanitizeReasoningEfforts(reasoning: HostModelReasoningInfo | undefined): SynthesisModelReasoningEffort[] {
  if (reasoning === undefined || !Array.isArray(reasoning.efforts)) return []
  const efforts: SynthesisModelReasoningEffort[] = []
  const seen = new Set<string>()
  for (const effort of reasoning.efforts) {
    if (typeof effort.id !== 'string' || effort.id.trim() === '' || seen.has(effort.id)) continue
    seen.add(effort.id)
    efforts.push({ id: effort.id, name: typeof effort.name === 'string' && effort.name.trim() !== '' ? effort.name : effort.id })
  }
  return efforts
}

/** Re-export for the host half's own imports. */
export type { SynthesisModelVerdict }

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
export async function runSynthesisModel(llm: HostLlmService, request: SynthesisModelRequest): Promise<string> {
  const options: HostGenerateOptions = {
    provider: request.provider,
    model: request.model,
    system: request.system,
    messages: [{ role: 'user', content: [{ type: 'text', text: request.prompt }] }],
    maxTokens: SYNTHESIS_MAX_TOKENS,
    sessionId: request.sessionId,
    signal: request.signal,
    ...(request.reasoningEffort === undefined || request.reasoningEffort === null || request.reasoningEffort === ''
      ? {}
      : { reasoningEffort: request.reasoningEffort }),
  }
  let streamed = ''
  let finished: string | undefined
  const blockText: string[] = []
  for await (const chunk of llm.stream(options)) {
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') streamed += chunk.text
    else if (chunk.type === 'block-end' && chunk.block?.type === 'text' && typeof chunk.block.text === 'string') blockText.push(chunk.block.text)
    else if (chunk.type === 'finish') finished = chunk.reason?.kind
  }
  if (finished === 'error' || finished === 'aborted' || finished === 'max-tokens' || finished === undefined) {
    throw new Error('SYNTHESIS_MODEL_FAILED')
  }
  const output = streamed.trim() === '' ? blockText.join('') : streamed
  if (output.trim() === '') throw new Error('SYNTHESIS_MODEL_EMPTY')
  return output
}
