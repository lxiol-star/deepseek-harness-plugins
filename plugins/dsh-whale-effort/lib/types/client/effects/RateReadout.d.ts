/** Props the host pane passes once per render. */
export interface RateReadoutProps {
    /** Tokens per second as an integer, exactly as the Host sampled it. */
    total: number;
    /** Whether the fleet is currently producing tokens. */
    generating: boolean;
    /** Localized accessible label for the readout. */
    label: string;
}
/**
 * Render the tok/s readout.
 * @param props - sampled integer, generating flag and localized label.
 * @returns the readout element; CSS hides it when there is no data.
 */
export declare function RateReadout(props: RateReadoutProps): JSX.Element;
