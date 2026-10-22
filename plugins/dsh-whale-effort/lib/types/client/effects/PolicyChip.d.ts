/** Props the host pane passes once per render. */
export interface PolicyChipProps {
    /** Exact policy body currently resolved for the session; empty means none. */
    text: string;
    /** Localized tooltip for the chip. */
    title: string;
    /** Localized chip label; it doubles as the expanded state's label. */
    expandLabel: string;
}
/**
 * Render the collapsible policy chip.
 * @param props - policy body and the localized labels.
 * @returns the chip plus its collapsible body.
 */
export declare function PolicyChip(props: PolicyChipProps): JSX.Element;
