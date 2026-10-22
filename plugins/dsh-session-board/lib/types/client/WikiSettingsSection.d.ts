/**
 * "Wiki engine" settings section.
 *
 * The section edits the configuration the host resolves per archive run: the
 * Wiki data root, the SCHEMA rules file, where the engine scripts come from,
 * the Python interpreter and the advanced state/timeout/provider fields.
 *
 * Defaults stay visible as placeholders instead of being written into the
 * inputs, so the page can honestly say "reuse the local Wiki" while the host
 * still resolves concrete paths.
 */
import { type ReactElement } from 'react';
import type { Translate } from './hooks.ts';
import type { WikiSettingsFace } from './wiki-settings.ts';
/** Props the section receives from the settings page. */
export interface WikiSettingsSectionProps {
    t: Translate;
    wiki: WikiSettingsFace;
}
/**
 * Render the Wiki engine settings section.
 * @param props - locale copy and the Wiki settings controller face.
 * @returns the section content.
 */
export declare function WikiSettingsSection({ t, wiki }: WikiSettingsSectionProps): ReactElement;
