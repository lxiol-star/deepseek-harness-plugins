import type { Skin } from './skins.js';
/** Props the host slider passes once per render. */
export interface EffectsRailProps {
    /** Current thumb position, 0..1. */
    progress: number;
    /** Whether the host slider is being dragged. */
    dragging: boolean;
    /** Active energy skin. */
    skin: Skin;
    /** The appended Ultra tier is selected. */
    ultra: boolean;
    /** Lightning orchestration mode is on. */
    lightning: boolean;
    /** Normalized 0..1 glow strength from the host's tok/s sample. */
    rate: number;
    /** The thumb is at the model's real maximum level. */
    top: boolean;
}
/**
 * Render the effect stack inside the host effort slider.
 * @param props - progress, skin and effect state of the current session.
 * @returns the absolutely positioned effect layer.
 */
export declare function EffectsRail(props: EffectsRailProps): JSX.Element;
