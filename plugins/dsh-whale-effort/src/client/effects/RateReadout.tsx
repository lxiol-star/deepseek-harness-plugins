/**
 * Fleet token-rate readout.
 *
 * The host samples the tracked session's subagent throughput once per second;
 * this component renders that integer with grouped thousands (`12,840`, never
 * `12.8k`), using tabular figures and a reserved digit width so changing numbers
 * do not shift the surrounding controls. With no data the whole readout is
 * hidden through `data-idle`, which keeps the row's height stable.
 *
 * @module dsh-whale-effort/client/effects/RateReadout
 */
import { formatRateInteger, rateIsIdle } from './format.js'

/** Props the host pane passes once per render. */
export interface RateReadoutProps {
  /** Tokens per second as an integer, exactly as the Host sampled it. */
  total: number
  /** Whether the fleet is currently producing tokens. */
  generating: boolean
  /** Localized accessible label for the readout. */
  label: string
}

/**
 * Render the tok/s readout.
 * @param props - sampled integer, generating flag and localized label.
 * @returns the readout element; CSS hides it when there is no data.
 */
export function RateReadout(props: RateReadoutProps): JSX.Element {
  const { total, generating, label } = props
  return (
    <span
      className="we-rate"
      data-idle={rateIsIdle(total) ? '1' : '0'}
      data-generating={generating ? '1' : '0'}
      title={label}
      aria-label={label}
    >
      <span className="we-rate__num">{formatRateInteger(total)}</span>
      <span className="we-rate__unit" aria-hidden="true">tok/s</span>
    </span>
  )
}
