/**
 * Lightning-mode toggle: an inline SVG bolt with an on/off visual language.
 *
 * The glyph is the Feather `zap` path (MIT, credited in THIRD-PARTY.md) drawn as
 * a stroked SVG rather than a clip-path, so the outline is geometrically exact
 * at any size. While lightning is on, the stroke becomes a flowing gradient
 * driven by the registered `--we-bolt-x1` / `--we-bolt-x2` custom properties and
 * a short "current pack" travels along the same path. The rate glow reuses the
 * `--we-rate` custom property the host sets from the fleet tok/s sample.
 *
 * @module dsh-whale-effort/client/effects/BoltToggle
 */
import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from './fluid.js'

/** Feather `zap`, 24×24 viewBox. */
const BOLT_PATH = 'M13 2 L3 14 h9 l-1 8 10-12 h-9 l1-8 z'

/** Stabilised id: `EFFECTS_CSS` styles the on-state stroke through it. */
const BOLT_GRADIENT_ID = 'we-bolt-flow'

/** Props the host pane passes once per render. */
export interface BoltToggleProps {
  /** Lightning orchestration mode is on. */
  on: boolean
  /** The pane cannot persist a change right now. */
  disabled?: boolean
  /** Localized accessible label and tooltip. */
  label: string
  /** Toggle handler; the component owns no state. */
  onToggle(): void
}

/**
 * Render the lightning toggle.
 * @param props - current mode, disabled flag, localized label and toggle handler.
 * @returns a native toggle button carrying the bolt SVG.
 */
export function BoltToggle(props: BoltToggleProps): JSX.Element {
  const { on, disabled = false, label, onToggle } = props
  const buttonRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = prefersReducedMotion()

  // The current-pack dash animation needs the real path length in pixels.
  useEffect(() => {
    const button = buttonRef.current
    if (button === null) return
    try {
      const path = button.querySelector<SVGPathElement>('.we-bolt__line')
      if (path !== null && typeof path.getTotalLength === 'function') {
        const length = path.getTotalLength()
        if (Number.isFinite(length) && length > 0) {
          button.style.setProperty('--we-bolt-len', `${length.toFixed(2)}px`)
        }
      }
    } catch {
      // Without a measured length the CSS fallback keeps the pack visible.
    }
  }, [])

  return (
    <button
      ref={buttonRef}
      type="button"
      className="we-bolt"
      data-on={on ? '1' : '0'}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <svg className="we-bolt__svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient
            id={BOLT_GRADIENT_ID}
            x1="var(--we-bolt-x1, 0)"
            y1="0"
            x2="var(--we-bolt-x2, 24)"
            y2="24"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="currentColor" />
            <stop offset="45%" stopColor="var(--we-bolt-a, #e8efff)" />
            <stop offset="100%" stopColor="var(--we-bolt-b, #8fb4ff)" />
          </linearGradient>
        </defs>
        <path className="we-bolt__line" d={BOLT_PATH} />
        {reduceMotion ? null : <path className="we-bolt__glowline" d={BOLT_PATH} />}
      </svg>
    </button>
  )
}
