/**
 * The synthesis-model preference shared by both halves.
 *
 * The host half persists `{ model, provider }` (both null means "fall back to
 * the Wiki provider"), the client half renders the current client model
 * catalog as picker rows, and the wire parser is small enough to live here so
 * neither half needs a DSH import to read it.
 *
 * Nothing in this module trusts a wire value: the client parses the saved
 * preference out of an HTTP response and out of the served model catalog, so
 * both are normalized here instead of at the call site.
 */

/**
 * The verdict of checking one saved selection against the live registry.
 *
 * `UNKNOWN_EFFORT` is distinct from `UNKNOWN_MODEL` so the page can say that
 * the model still exists but no longer offers the saved reasoning level.
 */
export type SynthesisModelVerdict = 'ok' | 'UNKNOWN_MODEL' | 'UNKNOWN_EFFORT'

/** One adapter-owned reasoning effort of an exact model route. */
export interface SynthesisModelReasoningEffort {
  id: string
  name: string
}

/** One exact provider/model route selected for knowledge synthesis. */
export interface SynthesisModelSelection {
  provider: string
  model: string
  /** Adapter-owned effort id; null or absent lets the model apply its own default. */
  reasoningEffort?: string | null
}

/**
 * The stored preference value.
 *
 * Both fields are null together (fall back to `wiki-synthesize.py --provider`);
 * a half-filled value is normalized back to the fallback rather than trusted.
 */
export interface SynthesisModelPref {
  model: string | null
  provider: string | null
  /** Selected reasoning effort of the route; null keeps the model's default. */
  reasoningEffort: string | null
}

/** Storage table key of the one preference record in the `prefs` domain. */
export const SYNTHESIS_PREFS_KEY = 'synthesis'

/** Authenticated route reading and writing the preference. */
export const SYNTHESIS_MODEL_PATH = '/api/session-board/synthesis-model'

/**
 * Host capability advertising the synthesis-model route and the plugin-side
 * model call. The browser bundle may be newer than the running host after an
 * upgrade, so the settings page probes this before offering to save.
 *
 * 2 adds the host-served model catalog (`action: 'catalog'`): the picker no
 * longer depends on another plugin's browser-side remote namespace.
 * 3 adds per-model reasoning efforts: the catalog discloses them and the write
 * route accepts `reasoningEffort`.
 */
export const SYNTHESIS_MODEL_CAPABILITY = 3

/** Longest accepted route part; real provider ids and model ids are far shorter. */
const ROUTE_PART_MAX = 200

/** One provider/model row as the host catalog advertises it. */
export interface SynthesisModelCatalogModel {
  id: string
  name: string
  /** Combined request and response context, when the serving catalog discloses it. */
  contextWindow?: number
  /** Adapter-owned selectable reasoning efforts, when the route exposes them. */
  reasoning?: {
    efforts: readonly SynthesisModelReasoningEffort[]
    defaultEffort?: string
  }
}

/** One provider group as the client catalog advertises it. */
export interface SynthesisModelCatalogGroup {
  id: string
  name: string
  models: readonly SynthesisModelCatalogModel[]
}

/** One selectable picker row. */
export interface SynthesisModelOption {
  /** Opaque row value: `provider\0model`; never parsed back into parts. */
  value: string
  provider: string
  providerName: string
  model: string
  modelName: string
  /** Context capacity when the serving catalog discloses it. */
  contextWindow: number | null
  /** Selectable reasoning efforts of this exact route, in catalog order. */
  reasoningEfforts: readonly SynthesisModelReasoningEffort[]
  /** Adapter-configured default effort, when disclosed. */
  defaultEffort: string | null
}

/** Narrow an unknown value to a record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Read one route part (provider id or model id).
 * @param value - raw wire value.
 * @returns the trimmed non-empty single-line value, or null.
 */
function routePart(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || trimmed.length > ROUTE_PART_MAX) return null
  // Route ids reach an HTTP body and a subprocess argument; control characters
  // never belong in one, and a newline would split a log line.
  return /[\u0000-\u001f\u007f]/u.test(trimmed) ? null : trimmed
}

/**
 * Normalize one stored preference value.
 * @param raw - record as read from storage or parsed from a route response.
 * @returns a complete value; half-filled or malformed records fall back to null/null.
 */
export function parseSynthesisPref(raw: unknown): SynthesisModelPref {
  const record = asRecord(raw)
  const model = routePart(record?.model)
  const provider = routePart(record?.provider)
  const reasoningEffort = routePart(record?.reasoningEffort)
  if (model === null || provider === null) return { model: null, provider: null, reasoningEffort: null }
  return { model, provider, reasoningEffort }
}

/**
 * Project a preference onto a concrete selection.
 * @param pref - normalized preference.
 * @returns the route to call, or null for the Wiki-provider fallback.
 */
export function selectionOf(pref: SynthesisModelPref): SynthesisModelSelection | null {
  if (pref.model === null || pref.provider === null) return null
  return { provider: pref.provider, model: pref.model, reasoningEffort: pref.reasoningEffort }
}

/**
 * Whether two preferences are the same route (or both the fallback).
 * @param left - first value.
 * @param right - second value.
 * @returns true when persisted bytes would not change.
 */
export function sameSynthesisPref(left: SynthesisModelPref, right: SynthesisModelPref): boolean {
  return left.provider === right.provider && left.model === right.model && left.reasoningEffort === right.reasoningEffort
}

/**
 * Parse the route response's `selection` field.
 * @param raw - decoded JSON body.
 * @returns the saved preference, or null when the body is not a route response.
 */
export function parseSynthesisModelResponse(raw: unknown): SynthesisModelPref | null {
  const record = asRecord(raw)
  if (record?.ok !== true) return null
  if (!('selection' in record)) return null
  return parseSynthesisPref(record.selection)
}

/** Parse one untrusted reasoning-effort list. */
function parseReasoningEfforts(raw: unknown): SynthesisModelReasoningEffort[] {
  const record = asRecord(raw)
  if (!Array.isArray(record?.efforts)) return []
  const efforts: SynthesisModelReasoningEffort[] = []
  const seen = new Set<string>()
  for (const entry of record.efforts) {
    const effort = asRecord(entry)
    const id = routePart(effort?.id)
    if (id === null || seen.has(id)) continue
    seen.add(id)
    const name = typeof effort?.name === 'string' && effort.name.trim() !== '' ? effort.name : id
    efforts.push({ id, name })
  }
  return efforts
}

/** One model row parsed out of an untrusted catalog snapshot. */
function parseCatalogModel(raw: unknown): SynthesisModelCatalogModel | null {
  const record = asRecord(raw)
  const id = routePart(record?.id)
  const name = typeof record?.name === 'string' && record.name.trim() !== '' ? record.name : id
  if (id === null || name === null) return null
  const direct = record?.contextWindow
  const nested = asRecord(record?.context)?.contextWindow
  const contextWindow = typeof direct === 'number' && Number.isSafeInteger(direct) && direct > 0
    ? direct
    : typeof nested === 'number' && Number.isSafeInteger(nested) && nested > 0
      ? nested
      : undefined
  const efforts = parseReasoningEfforts(record?.reasoning)
  const declaredDefault = routePart(asRecord(record?.reasoning)?.defaultEffort)
  const defaultEffort = declaredDefault !== null && efforts.some(effort => effort.id === declaredDefault) ? declaredDefault : undefined
  const reasoning = efforts.length === 0
    ? undefined
    : { efforts, ...(defaultEffort === undefined ? {} : { defaultEffort }) }
  return {
    id,
    name,
    ...(contextWindow === undefined ? {} : { contextWindow }),
    ...(reasoning === undefined ? {} : { reasoning }),
  }
}

/**
 * Parse the client model catalog into provider groups.
 *
 * The catalog arrives from another plugin's remote service, so every field is
 * re-checked here: a group without a usable provider id is dropped, and a model
 * without a usable id is dropped with it.
 * @param raw - `groups` array from the client's model catalog, or any untrusted value.
 * @returns parsed groups in their original order (empty for malformed input).
 */
export function parseCatalogGroups(raw: unknown): SynthesisModelCatalogGroup[] {
  if (!Array.isArray(raw)) return []
  const groups: SynthesisModelCatalogGroup[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    const id = routePart(record?.id)
    if (id === null) continue
    const name = typeof record?.name === 'string' && record.name.trim() !== '' ? record.name : id
    const models = Array.isArray(record?.models)
      ? record.models.map(parseCatalogModel).filter((model): model is SynthesisModelCatalogModel => model !== null)
      : []
    groups.push({ id, name, models })
  }
  return groups
}

/** Compare two strings by UTF-16 code unit: deterministic in every locale. */
function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

/**
 * Flatten the catalog into picker rows.
 *
 * Rows are deduplicated by exact route (a provider group repeated by a catalog
 * bug cannot render twice) and sorted by provider name, then model name, then
 * the exact ids, so the same catalog always produces the same order regardless
 * of adapter registration order.
 * @param groups - parsed provider groups.
 * @returns selectable rows, without the fallback row (the page adds that).
 */
export function synthesisModelOptions(groups: readonly SynthesisModelCatalogGroup[]): SynthesisModelOption[] {
  const seen = new Set<string>()
  const options: SynthesisModelOption[] = []
  for (const group of groups) {
    for (const model of group.models) {
      const value = `${group.id}\u0000${model.id}`
      if (seen.has(value)) continue
      seen.add(value)
      options.push({
        value,
        provider: group.id,
        providerName: group.name,
        model: model.id,
        modelName: model.name,
        contextWindow: model.contextWindow ?? null,
        reasoningEfforts: model.reasoning?.efforts ?? [],
        defaultEffort: model.reasoning?.defaultEffort ?? null,
      })
    }
  }
  options.sort((left, right) => compareText(left.providerName, right.providerName)
    || compareText(left.modelName, right.modelName)
    || compareText(left.provider, right.provider)
    || compareText(left.model, right.model))
  return options
}

/**
 * Encode one route as its picker row value.
 * @param selection - route to encode.
 * @returns the opaque row value used by the picker.
 */
export function selectionOptionValue(selection: SynthesisModelSelection): string {
  return `${selection.provider}\u0000${selection.model}`
}

/**
 * Find the picker row of one encoded route value.
 * @param options - rows from {@link synthesisModelOptions}.
 * @param value - row value (`provider\0model`) or '' for the fallback.
 * @returns the matching row, or null.
 */
export function optionByValue(options: readonly SynthesisModelOption[], value: string): SynthesisModelOption | null {
  return options.find(option => option.value === value) ?? null
}

/**
 * Find the picker value of one saved route.
 * @param options - rows from {@link synthesisModelOptions}.
 * @param selection - saved route.
 * @returns the matching row value, or null when the route is no longer advertised.
 */
export function optionValueOf(options: readonly SynthesisModelOption[], selection: SynthesisModelSelection | null): string | null {
  if (selection === null) return null
  const value = selectionOptionValue(selection)
  return options.some(option => option.value === value) ? value : null
}

/**
 * Format a context window for one picker row.
 * @param tokens - context capacity in tokens.
 * @returns a compact `131072` → `128K`, `1_048_576` → `1M` style label.
 */
export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_048_576) {
    const millions = tokens / 1_048_576
    return `${Number.isInteger(millions) ? String(millions) : millions.toFixed(1)}M`
  }
  if (tokens >= 1024) return `${Math.round(tokens / 1024)}K`
  return String(tokens)
}

/**
 * Split a picker row value back into its route.
 * @param value - row value produced by {@link synthesisModelOptions}, or '' for the fallback.
 * @returns the selected route, or null for the fallback row.
 */
export function selectionFromOptionValue(value: string): SynthesisModelSelection | null {
  const separator = value.indexOf('\u0000')
  if (separator <= 0 || separator === value.length - 1) return null
  return { provider: value.slice(0, separator), model: value.slice(separator + 1) }
}
