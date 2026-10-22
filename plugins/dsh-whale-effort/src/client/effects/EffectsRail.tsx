/**
 * Presentation layer for the effort slider's sci-fi effects.
 *
 * The rail is mounted as a child of the host's `.re-effort-slider` and fills it
 * absolutely (`inset: 0`), so it never changes the slider's height or padding.
 * It stacks above the host track and below the host thumb: the chibi whale-girl
 * knob stays the host's element, this component only contributes the halo
 * behind it, the skinned fill, the leading-edge glow, the fluid/star canvases
 * and the Ultra white-hot core.
 *
 * Everything inside is decorative: the layer is `aria-hidden` and takes no
 * pointer events or focus. The host slider's range input keeps all semantics.
 *
 * @module dsh-whale-effort/client/effects/EffectsRail
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createFluidRenderer, readDocumentTheme, topTierActive, type FluidHandle } from './fluid.js'
import type { Skin } from './skins.js'

/** Host theme marker mirrored onto the effect layer for theme-specific CSS. */
type DocumentTheme = 'dark' | 'light'

/** Props the host slider passes once per render. */
export interface EffectsRailProps {
  /** Current thumb position, 0..1. */
  progress: number
  /** Whether the host slider is being dragged. */
  dragging: boolean
  /** Active energy skin. */
  skin: Skin
  /** The appended Ultra tier is selected. */
  ultra: boolean
  /** Lightning orchestration mode is on. */
  lightning: boolean
  /** Normalized 0..1 glow strength from the host's tok/s sample. */
  rate: number
  /** The thumb is at the model's real maximum level. */
  top: boolean
}

type EffectLayerStyle = CSSProperties & Record<'--we-pct' | '--we-rate', number>

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * Track the host theme marker without adding a global stylesheet selector.
 * @returns `dark` or `light`; updates when the marker on the document body changes.
 */
function useDocumentTheme(): DocumentTheme {
  const [theme, setTheme] = useState<DocumentTheme>(readDocumentTheme)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.MutationObserver !== 'function') return undefined
    if (typeof document === 'undefined' || document.body === null) return undefined
    const observer = new window.MutationObserver(() => setTheme(readDocumentTheme()))
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

/**
 * Render the effect stack inside the host effort slider.
 * @param props - progress, skin and effect state of the current session.
 * @returns the absolutely positioned effect layer.
 */
export function EffectsRail(props: EffectsRailProps): JSX.Element {
  const { progress, dragging, skin, ultra, lightning, rate, top } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<FluidHandle | null>(null)
  const theme = useDocumentTheme()
  const tier = topTierActive(ultra, top)
  const layerStyle: EffectLayerStyle = {
    '--we-pct': clamp01(progress),
    '--we-rate': clamp01(rate),
  }

  // The renderer owns its canvases and observers for the layer's whole lifetime;
  // prop changes flow through the sync effects below instead of remounting it.
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) return undefined
    const handle = createFluidRenderer(canvas, { skin })
    handleRef.current = handle
    handle.setProgress(progress)
    handle.setUltra(topTierActive(ultra, top))
    handle.setLightning(lightning)
    handle.setRate(rate)
    return () => {
      handleRef.current = null
      handle.dispose()
    }
    // Mount-only: the initial state is read synchronously above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    handleRef.current?.setProgress(progress)
  }, [progress])

  useEffect(() => {
    handleRef.current?.setSkin(skin)
  }, [skin])

  useEffect(() => {
    handleRef.current?.setUltra(tier)
  }, [tier])

  useEffect(() => {
    handleRef.current?.setLightning(lightning)
  }, [lightning])

  useEffect(() => {
    handleRef.current?.setRate(rate)
  }, [rate])

  return (
    <div
      className="we-layer"
      data-we-skin={skin}
      data-we-theme={theme}
      data-we-ultra={ultra ? '1' : undefined}
      data-we-top={top ? '1' : undefined}
      data-we-lightning={lightning ? '1' : undefined}
      data-we-dragging={dragging ? '1' : undefined}
      style={layerStyle}
      aria-hidden="true"
    >
      <div className="we-rail" />
      <div className="we-fill" />
      <canvas ref={canvasRef} className="we-fluid" />
      <canvas className="we-stars" />
      <div className="we-glow" />
      <div className="we-core">
        <span className="we-core__glow" />
        <span className="we-core__tint" />
        <span className="we-core__ember" />
      </div>
      <div className="we-knob-aura" />
    </div>
  )
}
