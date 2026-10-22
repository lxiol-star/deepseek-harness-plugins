/**
 * Read-only reasoning-effort guidance.
 *
 * The slider can only offer what the DSH model directory exposes, and the
 * request path validates every submitted effort against that same directory
 * (`UNSUPPORTED_REASONING_EFFORT` otherwise). This module therefore never
 * invents levels and never writes configuration: it diagnoses custom-provider
 * models the directory under-describes and returns copy-ready
 * `reasoningEfforts` declarations (exact when the knowledge base knows the
 * model, a filled template otherwise) for the user to paste into the active
 * DSH configuration document. Built-in catalog models are trusted as-is and
 * never flagged.
 *
 * User-extensible knowledge entries come from the plugin's own Config (there
 * is no settings schema registration in rc.2); every entry is validated
 * structurally before it can affect matching.
 *
 * @module dsh-whale-effort/host/guidance
 */

import { BUILTIN_ENTRIES, displayLevels, matchEntry, type KnowledgeEntry } from './knowledge.js'

/** The DSH namespace holding per-provider model declarations. */
const LLM_NS = 'llm-pi-ai'

/** One guidance result handed to the browser half. */
export interface Guidance {
  /** Provider route asked about. */
  provider: string
  /** Model id asked about. */
  model: string
  /** Whether the model is declared in the user's llm-pi-ai settings. */
  userDeclared: boolean
  /** Whether guidance should be shown. */
  needsGuide: boolean
  /** Why the directory under-describes the model. */
  reason: 'missing' | 'mismatch' | 'none'
  /** Level ids the directory currently exposes. */
  current: string[]
  /** Level ids the knowledge base suggests (empty when unmatched). */
  expected: string[]
  /** Whether a knowledge-base entry matched. */
  matched: boolean
  /** `replace` includes an entry head; `insert` contributes only the field block. */
  mode: 'replace' | 'insert'
  /** Built-in note key localized by the browser half. */
  noteKey: KnowledgeEntry['noteKey'] | null
  /** User-authored note shown verbatim; null for built-ins and unknown models. */
  note: string | null
  /** Stable endpoint caveat code localized by the browser half. */
  warning: 'developerRole' | null
  /** Existing entry head for replace mode; null for insert mode. */
  entryHead: string | null
  /** Locale-neutral exact declaration; null selects the localized generic template. */
  fieldBlock: string | null
  /** The existing model line to find in the active configuration document. */
  entryLine: string
  /** Where that model entry lives in the active configuration document. */
  entryPath: string
  /** Leading spaces of the model list item in that document. */
  modelIndent: number
  /** Absolute configuration document path, when DSH can name one. */
  settingsPath: string | null
}

/** A plain JSON object as it crosses the settings/document boundary. */
type JsonObject = Record<string, unknown>

/** @returns a plain object test usable for field validation. */
function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The plugin config subset this module reads. */
export interface WhaleConfig {
  /** User-extensible knowledge entries; validated structurally before use. */
  readonly entries?: unknown
  /** Explicit state-file path or harness-home directory override. */
  readonly statePath?: unknown
}

/**
 * Narrow the loader-provided plugin config to the fields this plugin defines.
 * @param value - raw `apply` config of any shape.
 * @returns the config subset; absent fields stay absent.
 */
export function readConfig(value: unknown): WhaleConfig {
  if (!isRecord(value)) return {}
  return {
    ...(value['entries'] === undefined ? {} : { entries: value['entries'] }),
    ...(value['statePath'] === undefined ? {} : { statePath: value['statePath'] }),
  }
}

/** One settings namespace descriptor, as far as this module reads it. */
export interface SettingsDescriptorLike {
  /** Loader entry id of the namespace. */
  readonly ns: string
  /** User section, when the namespace has persisted overrides. */
  readonly user?: unknown
  /** Live value of the namespace. */
  readonly value?: unknown
}

/** The settings service slice used for reading the active configuration document. */
export interface HostSettingsService {
  /** Whether the active profile accepts form edits. */
  readonly writable: boolean
  /** Legacy namespace registration; absent on rc.2, kept for its indent heuristic. */
  readonly register?: unknown
  /** Read active plugin schemas and their live values. */
  describe(options?: { readonly redactSecrets?: boolean }): readonly SettingsDescriptorLike[]
  /** Locate the active profile patch for native editing. */
  prepareDocument(): Promise<string>
}

/** One selectable reasoning-effort level. */
export interface ReasoningEffortLike {
  /** Opaque stable effort id. */
  readonly id: string
}

/** Exact-route model metadata resolved by an adapter. */
export interface ResolvedModelInfoLike {
  /** Adapter-owned selectable levels, when exposed. */
  readonly reasoning?: {
    /** Supported efforts, least to greatest. */
    readonly efforts: readonly ReasoningEffortLike[]
  }
}

/** The model-directory service slice used for current level sets. */
export interface HostLlmService {
  /**
   * Resolve all metadata available for one exact model.
   * @param provider - provider route.
   * @param model - model id.
   * @returns resolved model metadata.
   */
  resolveModelInfo(provider: string, model: string): Promise<ResolvedModelInfoLike>
}

/** The guidance capability handed to the RPC channel. */
export interface GuidanceApi {
  /** Validated user-configured entries (built-ins stay internal). */
  readonly entries: () => readonly KnowledgeEntry[]
  /** Diagnose one model; rejects only when the host services are unavailable. */
  readonly diagnose: (provider: string, model: string) => Promise<Guidance>
}

/**
 * Accept only well-formed user entries so one typo cannot break matching.
 * @param value - one candidate entry from the plugin config.
 * @returns whether the value carries every field the matcher and snippet writer use.
 */
export function isUsableEntry(value: unknown): value is KnowledgeEntry {
  if (!isRecord(value)) return false
  if (typeof value['id'] !== 'string' || typeof value['provider'] !== 'string' || typeof value['model'] !== 'string') return false
  if (typeof value['note'] !== 'string') return false
  const noteKey = value['noteKey']
  if (noteKey !== undefined && noteKey !== 'glm52' && noteKey !== 'kimiK3') return false
  const efforts = value['efforts']
  if (!isRecord(efforts)) return false
  for (const wire of Object.values(efforts)) {
    if (wire !== null && typeof wire !== 'string') return false
  }
  const compat = value['compat']
  if (compat !== undefined) {
    if (!isRecord(compat)) return false
    if (compat['thinkingFormat'] !== undefined && typeof compat['thinkingFormat'] !== 'string') return false
    if (compat['supportsReasoningEffort'] !== undefined && typeof compat['supportsReasoningEffort'] !== 'boolean') return false
  }
  return true
}

/**
 * Read the validated user entries out of the plugin config.
 * @param config - narrowed plugin config.
 * @returns usable user entries in declaration order.
 */
export function configuredEntries(config: WhaleConfig): readonly KnowledgeEntry[] {
  const raw = config.entries
  if (!Array.isArray(raw)) return []
  return raw.filter(isUsableEntry)
}

/** The full ordered knowledge base: user entries first, built-ins after. */
function knowledgeOf(user: readonly KnowledgeEntry[]): readonly KnowledgeEntry[] {
  return [...user, ...BUILTIN_ENTRIES]
}

/**
 * Field block carrying the declared levels and compat under a `models` entry.
 * @param entry - matched knowledge entry.
 * @param modelIndent - leading spaces of the document's model list item.
 * @returns the YAML field block, indented for insertion under an entry.
 */
function fieldBlock(entry: KnowledgeEntry, modelIndent: number): string {
  const fieldPrefix = ' '.repeat(modelIndent + 2)
  const valuePrefix = ' '.repeat(modelIndent + 4)
  const lines: string[] = [`${fieldPrefix}reasoningEfforts:`]
  for (const [level, wire] of Object.entries(entry.efforts)) {
    lines.push(`${valuePrefix}${level}: ${wire === null ? '' : JSON.stringify(wire)}`)
  }
  if (entry.compat !== undefined && Object.keys(entry.compat).length > 0) {
    lines.push(`${fieldPrefix}compat:`)
    if (entry.compat.thinkingFormat !== undefined) lines.push(`${valuePrefix}thinkingFormat: ${JSON.stringify(entry.compat.thinkingFormat)}`)
    if (entry.compat.supportsReasoningEffort !== undefined) {
      lines.push(`${valuePrefix}supportsReasoningEffort: ${String(entry.compat.supportsReasoningEffort)}`)
    }
  }
  return lines.join('\n')
}

/** Scalar fields a `models` entry may carry that this plugin round-trips. */
const ENTRY_SCALAR_KEYS = new Set(['id', 'name', 'contextWindow', 'maxTokens'])

/**
 * Serialize the existing entry's scalar fields at the document's indentation.
 * @param existing - the declared entry, when the model is declared.
 * @param model - model id being diagnosed.
 * @param modelIndent - leading spaces of the document's model list item.
 * @returns the head lines and whether every existing field round-trips.
 */
function entryHead(
  existing: JsonObject | undefined,
  model: string,
  modelIndent: number,
): { lines: string[]; complete: boolean } {
  const itemPrefix = ' '.repeat(modelIndent)
  const fieldPrefix = ' '.repeat(modelIndent + 2)
  if (existing === undefined) return { lines: [`${itemPrefix}- id: ${model}`], complete: true }
  const extra = Object.keys(existing).filter((key) => !ENTRY_SCALAR_KEYS.has(key))
  const lines: string[] = [`${itemPrefix}- id: ${typeof existing['id'] === 'string' ? existing['id'] : model}`]
  const name = existing['name']
  const contextWindow = existing['contextWindow']
  const maxTokens = existing['maxTokens']
  if (typeof name === 'string' && name.length > 0) lines.push(`${fieldPrefix}name: ${JSON.stringify(name)}`)
  if (typeof contextWindow === 'number') lines.push(`${fieldPrefix}contextWindow: ${String(contextWindow)}`)
  if (typeof maxTokens === 'number') lines.push(`${fieldPrefix}maxTokens: ${String(maxTokens)}`)
  return { lines, complete: extra.length === 0 }
}

/** Options accepted by {@link createGuidance}. */
export interface GuidanceOptions {
  /** Narrowed plugin config (user knowledge entries). */
  readonly config: WhaleConfig
  /** Settings service; absent until the profile provides it. */
  readonly settings?: HostSettingsService
  /** Model directory service; absent until the profile provides it. */
  readonly llm?: HostLlmService
}

/**
 * Create the read-only guidance capability.
 *
 * All service access is optional and resolved per call, so this object can be
 * created before the Web profile finishes mounting `settings` and `llm`.
 * @param options - config and optional host services.
 * @returns the guidance capability.
 */
export function createGuidance(options: GuidanceOptions): GuidanceApi {
  const userEntries = configuredEntries(options.config)
  const entries = knowledgeOf(userEntries)
  const usesProfileConfig = typeof options.settings?.register !== 'function'

  /** The active configuration document path, memoized; null when unavailable. */
  let settingsPathPromise: Promise<string | undefined> | undefined
  const settingsPath = (): Promise<string | undefined> => {
    const settings = options.settings
    if (settings === undefined) return Promise.resolve(undefined)
    settingsPathPromise ??= settings.prepareDocument().catch(() => undefined)
    return settingsPathPromise
  }

  /** Current directory levels for one model; [] when the model offers none. */
  async function currentLevels(provider: string, model: string): Promise<string[]> {
    const llm = options.llm
    if (llm === undefined) throw new Error('model directory unavailable')
    try {
      const info = await llm.resolveModelInfo(provider, model)
      return (info.reasoning?.efforts ?? []).map((effort) => effort.id)
    } catch {
      return []
    }
  }

  /** Whether the model appears in the user's own llm-pi-ai models list. */
  function userDeclaredModel(
    provider: string,
    model: string,
  ): { declared: boolean; entryLine: string; entry: JsonObject | undefined } {
    const settings = options.settings
    if (settings === undefined) throw new Error('settings service unavailable')
    const descriptor = settings.describe().find((row) => row.ns === LLM_NS)
    const user = descriptor?.user
    const providers = isRecord(user) && isRecord(user['providers']) ? user['providers'] : {}
    const route = isRecord(providers[provider]) ? providers[provider] : undefined
    const models = route !== undefined && Array.isArray(route['models']) ? route['models'] : undefined
    const entry = models?.find((candidate): candidate is JsonObject => isRecord(candidate) && candidate['id'] === model)
    const name = entry?.['name']
    return {
      declared: entry !== undefined,
      entryLine: entry === undefined
        ? `- id: ${model}`
        : `- id: ${model}${typeof name === 'string' && name.length > 0 ? `  # ${name}` : ''}`,
      entry,
    }
  }

  /**
   * Caveat for gateways whose OpenAI-compatible endpoint rejects the
   * `developer` message role. DSH's pi-ai detection treats a base URL it does
   * not recognize as standard OpenAI (developer role enabled, and overridable
   * through `compat.supportsDeveloperRole`), so an agent request carrying a
   * system prompt can fail with `invalid_parameter_error`. The two Aliyun MaaS
   * hosts below are the ones observed to answer that way; the code stays
   * endpoint-shaped so widening it is a new base URL, not new copy.
   * @param provider - provider route to inspect.
   * @returns the caveat code, or null.
   */
  function endpointWarning(provider: string): Guidance['warning'] {
    try {
      const settings = options.settings
      if (settings === undefined) return null
      const section = settings.describe().find((row) => row.ns === LLM_NS)?.value
      if (!isRecord(section) || !isRecord(section['providers'])) return null
      const route = section['providers'][provider]
      const baseURL = isRecord(route) && typeof route['baseURL'] === 'string' ? route['baseURL'] : ''
      if (baseURL.includes('maas.aliyuncs.com') || baseURL.includes('dashscope.aliyuncs.com')) return 'developerRole'
      return null
    } catch {
      return null
    }
  }

  /** Compute the guidance result for one model. */
  async function diagnose(provider: string, model: string): Promise<Guidance> {
    const entry = matchEntry(entries, provider, model)
    const current = await currentLevels(provider, model)
    const expected = entry === undefined ? [] : displayLevels(entry)
    const { declared, entryLine, entry: userEntry } = userDeclaredModel(provider, model)
    const path = await settingsPath()

    let reason: Guidance['reason'] = 'none'
    // Explicitly disabling reasoning is intentional. Trust every nonempty
    // catalog level set, even when it differs from our knowledge base.
    if (userEntry?.['reasoningEfforts'] !== false && current.length === 0) reason = 'missing'

    // Guidance targets custom-provider declarations only; the built-in
    // catalog's data — including deliberately sparse level sets — is trusted.
    const needsGuide = declared && reason !== 'none'

    const modelIndent = usesProfileConfig ? 10 : 8
    const block = entry === undefined ? null : fieldBlock(entry, modelIndent)
    const head = entryHead(userEntry, model, modelIndent)
    const mode: Guidance['mode'] = head.complete ? 'replace' : 'insert'
    const builtIn = entry !== undefined && BUILTIN_ENTRIES.includes(entry)
    const noteKey = builtIn ? entry.noteKey ?? null : null
    const note = entry !== undefined && !builtIn ? entry.note ?? null : null

    return {
      provider,
      model,
      userDeclared: declared,
      needsGuide,
      reason,
      current,
      expected,
      matched: entry !== undefined,
      mode,
      noteKey,
      note,
      warning: endpointWarning(provider),
      entryHead: head.complete ? head.lines.join('\n') : null,
      fieldBlock: block,
      entryLine,
      entryPath: usesProfileConfig
        ? `[id: ${LLM_NS}].config.providers.${provider}.models`
        : `${LLM_NS}.providers.${provider}.models`,
      modelIndent,
      settingsPath: path ?? null,
    }
  }

  return {
    entries: () => userEntries,
    diagnose,
  }
}
