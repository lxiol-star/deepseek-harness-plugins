import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { ModelDirectory, ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client';
import type { ReasoningEffortTranslate } from './locales.js';
export interface EffortLevel {
    readonly id: string;
    readonly name: string;
}
export type EffortSelection = ModelSelection & {
    readonly reasoningEffort: string;
};
export declare function currentModel(state: ModelDirectoryState): import("@deepseek-ai/dsh-api-session-controller/types").ModelCatalogModel | undefined;
export declare function sliderLevels(state: ModelDirectoryState): readonly EffortLevel[];
export declare function effortIndex(levels: readonly EffortLevel[], id: string | undefined): number;
export declare function clampIndex(value: number, count: number): number;
/** Revalidate a captured route and effort ID, never a position in a new catalog. */
export declare function selectEffort(directory: ModelDirectory, target: EffortSelection, signal: AbortSignal, t: ReasoningEffortTranslate, timeoutMs?: number): Promise<ModelDirectoryState>;
/** Display-only tier appended after the model's real levels. */
export declare const ULTRA_DISPLAY_ID = "ultra";
/** One entry of the slider's display scale: a real level or the appended Ultra tier. */
export interface DisplayLevel {
    readonly id: string;
    readonly name: string;
    readonly ultra: boolean;
}
/**
 * Build the display scale: the model's real levels plus a trailing Ultra entry.
 *
 * Ultra is presentation-only. Committing it writes the model's highest real
 * effort id (see {@link effortIdForDisplay}); it never reaches the model
 * directory as an effort value of its own.
 * @param levels - the model's real effort levels, in directory order.
 * @returns the display scale; identical to `levels` when fewer than two exist.
 */
export declare function displayLevels(levels: readonly EffortLevel[]): readonly DisplayLevel[];
/** Whether the display scale carries the appended Ultra tier. */
export declare function hasUltra(levels: readonly EffortLevel[]): boolean;
/**
 * Map a persisted real effort id (plus the session's Ultra flag) to a display index.
 * @param levels - the model's real effort levels.
 * @param id - the session's committed real effort id.
 * @param ultra - whether the session is in Ultra mode.
 * @returns the display index, or -1 when the id is not in the scale.
 */
export declare function displayIndexFor(levels: readonly EffortLevel[], id: string | undefined, ultra: boolean): number;
/**
 * Resolve the real effort id a display index commits.
 * @param levels - the model's real effort levels.
 * @param index - a display index (0 .. displayLevels(levels).length - 1).
 * @returns the real effort id, or undefined when the index is out of range.
 */
export declare function effortIdForDisplay(levels: readonly EffortLevel[], index: number): string | undefined;
/** Whether a display index is the appended Ultra tier. */
export declare function isUltraIndex(levels: readonly EffortLevel[], index: number): boolean;
