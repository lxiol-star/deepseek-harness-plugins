/**
 * Settings-page controller for the synthesis-model preference.
 *
 * Three collaborators, all optional so the page degrades instead of throwing:
 * the preference route (host half), the client model catalog (the same
 * `ctx.remote.session.modelCatalog()` surface the composer's model picker
 * uses), and nothing else. The page renders this snapshot and calls `save`.
 *
 * A browser bundle can be newer than the running host, so a 404 on the read is
 * reported as `HOST_OUTDATED` rather than as a network failure.
 */
import type { ReadonlyStore } from './store.ts';
import { type SynthesisModelOption, type SynthesisModelSelection } from '../shared/synthesis.ts';
/** What the settings page observes. */
export interface SynthesisSettingsState {
    /** Read phase of the saved preference. */
    status: 'loading' | 'ready' | 'error';
    /** Currently saved route, or null for the Wiki-provider fallback. */
    selection: SynthesisModelSelection | null;
    /** Picker rows from the client catalog, sorted and deduplicated. */
    options: readonly SynthesisModelOption[];
    /** Client model-catalog load phase. */
    catalogStatus: 'idle' | 'loading' | 'ready' | 'unavailable';
    /** A write is in flight. */
    saving: boolean;
    /** The last write succeeded; cleared when the next save starts. */
    saved: boolean;
    /** Stable error code for the page's copy, or null. */
    error: string | null;
}
/** Surface the page receives through slot injection. */
export interface SynthesisSettingsFace {
    readonly store: ReadonlyStore<SynthesisSettingsState>;
    /** Load the saved preference and the model catalog once. */
    start(): void;
    /**
     * Persist one picker row.
     * @param value - row value; '' selects the Wiki-provider fallback.
     */
    save(value: string): Promise<void>;
    /** Reload the client model catalog after it failed to load. */
    reloadCatalog(): Promise<void>;
    /** Detach subscribers; the plugin unload path. */
    dispose(): void;
}
/** Raw model-catalog groups as any client catalog shape exposes them. */
export type SynthesisCatalogSource = () => Promise<unknown>;
/** Collaborators of {@link createSynthesisSettings}. */
export interface SynthesisSettingsOptions {
    /** Reads `groups` from the client model catalog; absent disables the picker. */
    catalog?: SynthesisCatalogSource;
}
/**
 * Create the settings controller.
 * @param options - optional client model-catalog reader.
 * @returns the page-facing surface.
 */
export declare function createSynthesisSettings(options?: SynthesisSettingsOptions): SynthesisSettingsFace;
/**
 * The fallback row's identity, shared by controller and page.
 */
export declare const FALLBACK_OPTION_VALUE = "";
