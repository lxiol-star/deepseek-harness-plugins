/**
 * The "Session board" settings page: one group, "Archive synthesis".
 *
 * The page owns no state; it renders the controller's snapshot and hands the
 * chosen row back through `save`. The model list is the running client's own
 * catalog (the composer's picker source), so a provider the user can chat with
 * is exactly a provider they can synthesize with.
 */
import { type ReactElement } from 'react';
import type { Translate } from './hooks.ts';
import type { SynthesisSettingsFace } from './synthesis-settings.ts';
/** Props the settings page receives from its slot registration. */
export interface SessionBoardSettingsPageProps {
    t: Translate;
    settings: SynthesisSettingsFace;
}
/**
 * Render the settings page.
 * @param props - locale copy and the synthesis-settings controller face.
 * @returns the page content.
 */
export declare function SessionBoardSettingsPage({ t, settings }: SessionBoardSettingsPageProps): ReactElement;
