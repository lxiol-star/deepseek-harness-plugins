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
/** One exact provider/model route selected for knowledge synthesis. */
export interface SynthesisModelSelection {
    provider: string;
    model: string;
}
/**
 * The stored preference value.
 *
 * Both fields are null together (fall back to `wiki-synthesize.py --provider`);
 * a half-filled value is normalized back to the fallback rather than trusted.
 */
export interface SynthesisModelPref {
    model: string | null;
    provider: string | null;
}
/** Storage table key of the one preference record in the `prefs` domain. */
export declare const SYNTHESIS_PREFS_KEY = "synthesis";
/** Authenticated route reading and writing the preference. */
export declare const SYNTHESIS_MODEL_PATH = "/api/session-board/synthesis-model";
/**
 * Host capability advertising the synthesis-model route and the plugin-side
 * model call. The browser bundle may be newer than the running host after an
 * upgrade, so the settings page probes this before offering to save.
 */
export declare const SYNTHESIS_MODEL_CAPABILITY = 1;
/** One provider/model row as the client catalog advertises it. */
export interface SynthesisModelCatalogModel {
    id: string;
    name: string;
    /** Combined request and response context, when the serving catalog discloses it. */
    contextWindow?: number;
}
/** One provider group as the client catalog advertises it. */
export interface SynthesisModelCatalogGroup {
    id: string;
    name: string;
    models: readonly SynthesisModelCatalogModel[];
}
/** One selectable picker row. */
export interface SynthesisModelOption {
    /** Opaque row value: `provider\0model`; never parsed back into parts. */
    value: string;
    provider: string;
    providerName: string;
    model: string;
    modelName: string;
    /** Context capacity when the serving catalog discloses it. */
    contextWindow: number | null;
}
/**
 * Normalize one stored preference value.
 * @param raw - record as read from storage or parsed from a route response.
 * @returns a complete value; half-filled or malformed records fall back to null/null.
 */
export declare function parseSynthesisPref(raw: unknown): SynthesisModelPref;
/**
 * Project a preference onto a concrete selection.
 * @param pref - normalized preference.
 * @returns the route to call, or null for the Wiki-provider fallback.
 */
export declare function selectionOf(pref: SynthesisModelPref): SynthesisModelSelection | null;
/**
 * Whether two preferences are the same route (or both the fallback).
 * @param left - first value.
 * @param right - second value.
 * @returns true when persisted bytes would not change.
 */
export declare function sameSynthesisPref(left: SynthesisModelPref, right: SynthesisModelPref): boolean;
/**
 * Parse the route response's `selection` field.
 * @param raw - decoded JSON body.
 * @returns the saved preference, or null when the body is not a route response.
 */
export declare function parseSynthesisModelResponse(raw: unknown): SynthesisModelPref | null;
/**
 * Parse the client model catalog into provider groups.
 *
 * The catalog arrives from another plugin's remote service, so every field is
 * re-checked here: a group without a usable provider id is dropped, and a model
 * without a usable id is dropped with it.
 * @param raw - `groups` array from the client's model catalog, or any untrusted value.
 * @returns parsed groups in their original order (empty for malformed input).
 */
export declare function parseCatalogGroups(raw: unknown): SynthesisModelCatalogGroup[];
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
export declare function synthesisModelOptions(groups: readonly SynthesisModelCatalogGroup[]): SynthesisModelOption[];
/**
 * Encode one route as its picker row value.
 * @param selection - route to encode.
 * @returns the opaque row value used by the picker.
 */
export declare function selectionOptionValue(selection: SynthesisModelSelection): string;
/**
 * Find the picker value of one saved route.
 * @param options - rows from {@link synthesisModelOptions}.
 * @param selection - saved route.
 * @returns the matching row value, or null when the route is no longer advertised.
 */
export declare function optionValueOf(options: readonly SynthesisModelOption[], selection: SynthesisModelSelection | null): string | null;
/**
 * Format a context window for one picker row.
 * @param tokens - context capacity in tokens.
 * @returns a compact `131072` → `128K`, `1_048_576` → `1M` style label.
 */
export declare function formatContextWindow(tokens: number): string;
/**
 * Split a picker row value back into its route.
 * @param value - row value produced by {@link synthesisModelOptions}, or '' for the fallback.
 * @returns the selected route, or null for the fallback row.
 */
export declare function selectionFromOptionValue(value: string): SynthesisModelSelection | null;
