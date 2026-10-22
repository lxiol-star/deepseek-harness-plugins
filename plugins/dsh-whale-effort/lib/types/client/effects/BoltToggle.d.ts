/** Props the host pane passes once per render. */
export interface BoltToggleProps {
    /** Lightning orchestration mode is on. */
    on: boolean;
    /** The pane cannot persist a change right now. */
    disabled?: boolean;
    /** Localized accessible label and tooltip. */
    label: string;
    /** Toggle handler; the component owns no state. */
    onToggle(): void;
}
/**
 * Render the lightning toggle.
 * @param props - current mode, disabled flag, localized label and toggle handler.
 * @returns a native toggle button carrying the bolt SVG.
 */
export declare function BoltToggle(props: BoltToggleProps): JSX.Element;
