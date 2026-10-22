/**
 * Settings-page controller for the self-contained Wiki engine.
 *
 * The page edits one configuration record and asks the host to persist it; the
 * host validates, stores it in its own domain and returns the effective
 * config together with a read-only environment probe (engine, schema, paths).
 *
 * A browser bundle can be newer than the running host, so a 404 on the read is
 * reported as `HOST_OUTDATED` rather than as a network failure.
 */
import type { ReadonlyStore } from './store.ts';
import { type WikiConfig, type WikiDefaults, type WikiEnvironmentStatus } from '../shared/wiki.ts';
/** What the settings page observes. */
export interface WikiSettingsState {
    /** Read phase of the saved configuration. */
    status: 'idle' | 'loading' | 'ready' | 'error';
    /** Saved configuration as the host reports it ('' fields mean "default"). */
    config: WikiConfig;
    /** Concrete defaults for the placeholders. */
    defaults: WikiDefaults;
    /** Last probe of the running environment, or null before the first read. */
    report: WikiEnvironmentStatus | null;
    /** A write or reset is in flight. */
    saving: boolean;
    /** The last write succeeded; cleared when the next write starts. */
    saved: boolean;
    /** Stable error code for the page's copy, or null. */
    error: string | null;
    /** Field-level validation codes from the last rejected write. */
    fieldErrors: readonly string[];
    /** A probe is in flight. */
    probing: boolean;
}
/** Surface the settings page receives through slot injection. */
export interface WikiSettingsFace {
    readonly store: ReadonlyStore<WikiSettingsState>;
    /** Load the saved configuration and probe the environment once. */
    start(): void;
    /**
     * Persist the edited configuration.
     * @param config - draft from the settings form.
     * @returns a promise that settles after the host answered.
     */
    save(config: WikiConfig): Promise<void>;
    /** Drop the saved record and return to the deployment defaults. */
    reset(): Promise<void>;
    /** Re-probe the environment without changing the configuration. */
    probe(): Promise<void>;
    /** Detach subscribers; the plugin unload path. */
    dispose(): void;
}
/**
 * Create the Wiki settings controller.
 * @returns the controller face the settings page consumes.
 */
export declare function createWikiSettings(): WikiSettingsFace;
