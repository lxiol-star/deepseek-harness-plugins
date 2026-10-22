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
import { type KnowledgeEntry } from './knowledge.js';
/** One guidance result handed to the browser half. */
export interface Guidance {
    /** Provider route asked about. */
    provider: string;
    /** Model id asked about. */
    model: string;
    /** Whether the model is declared in the user's llm-pi-ai settings. */
    userDeclared: boolean;
    /** Whether guidance should be shown. */
    needsGuide: boolean;
    /** Why the directory under-describes the model. */
    reason: 'missing' | 'mismatch' | 'none';
    /** Level ids the directory currently exposes. */
    current: string[];
    /** Level ids the knowledge base suggests (empty when unmatched). */
    expected: string[];
    /** Whether a knowledge-base entry matched. */
    matched: boolean;
    /** `replace` includes an entry head; `insert` contributes only the field block. */
    mode: 'replace' | 'insert';
    /** Built-in note key localized by the browser half. */
    noteKey: KnowledgeEntry['noteKey'] | null;
    /** User-authored note shown verbatim; null for built-ins and unknown models. */
    note: string | null;
    /** Stable endpoint caveat code localized by the browser half. */
    warning: 'developerRole' | null;
    /** Existing entry head for replace mode; null for insert mode. */
    entryHead: string | null;
    /** Locale-neutral exact declaration; null selects the localized generic template. */
    fieldBlock: string | null;
    /** The existing model line to find in the active configuration document. */
    entryLine: string;
    /** Where that model entry lives in the active configuration document. */
    entryPath: string;
    /** Leading spaces of the model list item in that document. */
    modelIndent: number;
    /** Absolute configuration document path, when DSH can name one. */
    settingsPath: string | null;
}
/** The plugin config subset this module reads. */
export interface WhaleConfig {
    /** User-extensible knowledge entries; validated structurally before use. */
    readonly entries?: unknown;
    /** Explicit state-file path or harness-home directory override. */
    readonly statePath?: unknown;
}
/**
 * Narrow the loader-provided plugin config to the fields this plugin defines.
 * @param value - raw `apply` config of any shape.
 * @returns the config subset; absent fields stay absent.
 */
export declare function readConfig(value: unknown): WhaleConfig;
/** One settings namespace descriptor, as far as this module reads it. */
export interface SettingsDescriptorLike {
    /** Loader entry id of the namespace. */
    readonly ns: string;
    /** User section, when the namespace has persisted overrides. */
    readonly user?: unknown;
    /** Live value of the namespace. */
    readonly value?: unknown;
}
/** The settings service slice used for reading the active configuration document. */
export interface HostSettingsService {
    /** Whether the active profile accepts form edits. */
    readonly writable: boolean;
    /** Legacy namespace registration; absent on rc.2, kept for its indent heuristic. */
    readonly register?: unknown;
    /** Read active plugin schemas and their live values. */
    describe(options?: {
        readonly redactSecrets?: boolean;
    }): readonly SettingsDescriptorLike[];
    /** Locate the active profile patch for native editing. */
    prepareDocument(): Promise<string>;
}
/** One selectable reasoning-effort level. */
export interface ReasoningEffortLike {
    /** Opaque stable effort id. */
    readonly id: string;
}
/** Exact-route model metadata resolved by an adapter. */
export interface ResolvedModelInfoLike {
    /** Adapter-owned selectable levels, when exposed. */
    readonly reasoning?: {
        /** Supported efforts, least to greatest. */
        readonly efforts: readonly ReasoningEffortLike[];
    };
}
/** The model-directory service slice used for current level sets. */
export interface HostLlmService {
    /**
     * Resolve all metadata available for one exact model.
     * @param provider - provider route.
     * @param model - model id.
     * @returns resolved model metadata.
     */
    resolveModelInfo(provider: string, model: string): Promise<ResolvedModelInfoLike>;
}
/** The guidance capability handed to the RPC channel. */
export interface GuidanceApi {
    /** Validated user-configured entries (built-ins stay internal). */
    readonly entries: () => readonly KnowledgeEntry[];
    /** Diagnose one model; rejects only when the host services are unavailable. */
    readonly diagnose: (provider: string, model: string) => Promise<Guidance>;
}
/**
 * Accept only well-formed user entries so one typo cannot break matching.
 * @param value - one candidate entry from the plugin config.
 * @returns whether the value carries every field the matcher and snippet writer use.
 */
export declare function isUsableEntry(value: unknown): value is KnowledgeEntry;
/**
 * Read the validated user entries out of the plugin config.
 * @param config - narrowed plugin config.
 * @returns usable user entries in declaration order.
 */
export declare function configuredEntries(config: WhaleConfig): readonly KnowledgeEntry[];
/** Options accepted by {@link createGuidance}. */
export interface GuidanceOptions {
    /** Narrowed plugin config (user knowledge entries). */
    readonly config: WhaleConfig;
    /** Settings service; absent until the profile provides it. */
    readonly settings?: HostSettingsService;
    /** Model directory service; absent until the profile provides it. */
    readonly llm?: HostLlmService;
}
/**
 * Create the read-only guidance capability.
 *
 * All service access is optional and resolved per call, so this object can be
 * created before the Web profile finishes mounting `settings` and `llm`.
 * @param options - config and optional host services.
 * @returns the guidance capability.
 */
export declare function createGuidance(options: GuidanceOptions): GuidanceApi;
