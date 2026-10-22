/**
 * Read-only chip for the policy text the Host injects into the tracked session.
 *
 * The chip starts collapsed and expands in place on click, revealing the exact
 * policy body the Host resolves for this session (the same text the
 * `agent/pre-step` listener appends). It is deliberately read-only: the plugin's
 * settings rows are the only place a policy can be changed. The label comes from
 * the caller so the Latin version stays locale-owned; the body itself is the
 * Host's English policy text and is shown verbatim.
 *
 * @module dsh-whale-effort/client/effects/PolicyChip
 */
import { useId, useState } from 'react'

/** Props the host pane passes once per render. */
export interface PolicyChipProps {
  /** Exact policy body currently resolved for the session; empty means none. */
  text: string
  /** Localized tooltip for the chip. */
  title: string
  /** Localized chip label; it doubles as the expanded state's label. */
  expandLabel: string
}

/**
 * Render the collapsible policy chip.
 * @param props - policy body and the localized labels.
 * @returns the chip plus its collapsible body.
 */
export function PolicyChip(props: PolicyChipProps): JSX.Element {
  const { text, title, expandLabel } = props
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const expandable = text.trim() !== ''
  const expanded = expandable && open
  return (
    <div className="we-policy" data-open={expanded ? '1' : '0'}>
      <button
        type="button"
        className="we-policy__chip"
        aria-expanded={expanded}
        aria-controls={bodyId}
        title={title}
        disabled={!expandable}
        onClick={() => {
          if (!expandable) return
          setOpen(!open)
        }}
      >
        <span className="we-policy__dot" aria-hidden="true" />
        <span className="we-policy__label">{expandLabel}</span>
      </button>
      <pre className="we-policy__body" id={bodyId} aria-hidden={!expanded}>{text}</pre>
    </div>
  )
}
