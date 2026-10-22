/**
 * Canvas fluid-particle renderer ported from `dsh-effort-slider` (the `fluid`
 * skin's `FLUID_STOPS` / `FLUID_PRESET` / `mountFluid`).
 *
 * The port keeps the upstream tuning constants, the multi-scale curl noise,
 * the random vortices, the `destination-out` fade, the per-pixel particle
 * density and the top-tier star stream. It adapts the plugin environment in
 * five places:
 *
 * - progress arrives through {@link FluidHandle.setProgress} instead of being
 *   read from computed style, so React rendering and the animation frame are
 *   decoupled;
 * - the lit region follows the host thumb's `clamp(inset, pct, 100% - inset)`
 *   positions instead of the upstream rail's inner inset, so the fluid edge
 *   sits under the thumb; the inset itself comes from the `--we-inset` custom
 *   property the effect CSS uses;
 * - only the `fluid` skin animates, and reduced motion freezes a still frame;
 * - the star layer is a `.we-stars` canvas sibling, drawn separately so the
 *   fluid's smear does not blur it;
 * - the star palette follows the document theme marker, because the upstream
 *   star colours were white-only and this host also runs a light theme.
 *
 * The renderer never throws to its caller: a missing window, context, canvas
 * or frame hook degrades to an inert handle, and a failed frame stops the
 * animation without affecting the slider.
 *
 * @module dsh-whale-effort/client/effects/fluid
 */
import type { Skin } from './skins.js'

/** Colour band of the fluid source: blue → indigo → violet → pink. */
export const FLUID_STOPS: readonly (readonly [number, readonly [number, number, number]])[] = [
  [0.0, [120, 150, 255]],
  [0.32, [95, 112, 255]],
  [0.62, [168, 92, 255]],
  [0.86, [214, 106, 208]],
  [1.0, [255, 158, 214]],
]

/** Tuning constants of the upstream `fluid=a` preset. */
export interface FluidPreset {
  /** Per-frame `destination-out` fade of the accumulated canvas. */
  readonly fade: number
  /** Base flow speed in px/frame. */
  readonly vel: number
  /** Per-particle speed multiplier range. */
  readonly speed: readonly [number, number]
  /** Spatial scale of the curl noise (larger = larger clumps). */
  readonly curlScale: number
  /** Particle lifetime used for the soft age fade. */
  readonly life: number
  /** Particle radius range in CSS pixels. */
  readonly r: readonly [number, number]
  /** Base spawn alpha. */
  readonly alpha: number
  /** Composite mode of the particle pass. */
  readonly blend: 'source-over'
  /** Vertical jitter in px/frame. */
  readonly jitter: number
  /** Flow-speed multiplier while the top tier is active. */
  readonly topSpeedMul: number
  /** Number of star streaks at the top tier. */
  readonly starCount: number
  /** Star streak speed range in px/frame. */
  readonly starSpeed: readonly [number, number]
  /** Ramp-up time after entering the top tier, in ms. */
  readonly starRampMs: number
  /** Fraction of full star speed at the moment the top tier starts. */
  readonly starRampStart: number
  /** How strongly the local flow field dominates the forward direction. */
  readonly swirl: number
  /** Particles per CSS pixel of lit width. */
  readonly density: number
  /** Minimum particle count (must not exceed `density` × the smallest lit width). */
  readonly countMin: number
  /** Maximum particle count. */
  readonly countMax: number
  /** Round-trip period of the source colour, in ms. */
  readonly hueCycle: number
}

const preset = {
  fade: 0.018,
  vel: 0.43,
  speed: [0.35, 2.1],
  curlScale: 0.026,
  life: 9000,
  r: [5.5, 13],
  alpha: 0.03,
  blend: 'source-over',
  jitter: 1.8,
  topSpeedMul: 2,
  starCount: 20,
  starSpeed: [4, 15],
  starRampMs: 2600,
  starRampStart: 0.16,
  swirl: 0.9,
  density: 1.0,
  countMin: 16,
  countMax: 1400,
  hueCycle: 30000,
} satisfies FluidPreset

/** Immutable upstream tuning preset. */
export const FLUID_PRESET: FluidPreset = Object.freeze(preset)

/** Upstream rail inset: the 30px `es-knob` sits 17px inside either end. */
export const FLUID_INSET = 17

/**
 * Inset used by the merged layout when the host does not set `--we-inset`.
 *
 * The host thumb clamps its centre 10px (chibi sprite) or 14px (28px ball)
 * inside the rail; 12px is the middle of those two clamps, so the fluid edge is
 * at most 2px away from the thumb centre at the two extreme levels.
 */
export const DEFAULT_EFFECT_INSET = 12

/**
 * Clamp a device pixel ratio the way the upstream engine does.
 * @param value - `window.devicePixelRatio`, or anything the environment exposes.
 * @returns the ratio capped at 2, with unusable values treated as 1.
 */
export function clampDevicePixelRatio(value: number): number {
  const ratio = Number.isFinite(value) && value > 0 ? value : 1
  return Math.min(2, ratio)
}

/**
 * Read the host's theme marker.
 *
 * DSH stamps `data-ds-dark-theme` on the document body; the effects use that
 * marker instead of a media query because the GUI theme is a product setting,
 * not the operating-system preference.
 * @returns `dark` when the marker is present (also when there is no document,
 *   matching the upstream dark-only palette), else `light`.
 */
export function readDocumentTheme(): 'dark' | 'light' {
  try {
    if (typeof document === 'undefined') return 'dark'
    const body = document.body
    if (body === null) return 'dark'
    return body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
  } catch {
    return 'dark'
  }
}

/**
 * Whether the platform asks for reduced motion.
 * @returns `false` when `matchMedia` is unavailable.
 */
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

/**
 * Whether the top-tier flow and star stream apply.
 *
 * The upstream engine applies them to the model's real maximum level and to the
 * appended Ultra tier alike, so both flags select the same physics.
 * @param ultra - the appended Ultra tier is selected.
 * @param top - the thumb is at the model's real maximum level.
 * @returns `true` when either flag is set.
 */
export function topTierActive(ultra: boolean, top: boolean): boolean {
  return ultra || top
}

/** Linear interpolation over {@link FLUID_STOPS}. */
function colorAt(progress: number): readonly [number, number, number] {
  const t = clamp01(progress)
  for (let index = 1; index < FLUID_STOPS.length; index += 1) {
    const stop = FLUID_STOPS[index]
    const previous = FLUID_STOPS[index - 1]
    if (t <= stop[0]) {
      const span = stop[0] - previous[0] || 1
      const k = (t - previous[0]) / span
      return [
        Math.round(previous[1][0] + (stop[1][0] - previous[1][0]) * k),
        Math.round(previous[1][1] + (stop[1][1] - previous[1][1]) * k),
        Math.round(previous[1][2] + (stop[1][2] - previous[1][2]) * k),
      ]
    }
  }
  return FLUID_STOPS[FLUID_STOPS.length - 1][1]
}

/**
 * Sample the source colour band.
 * @param progress - position on the band, 0..1.
 * @returns the rounded `[r, g, b]` colour at that position.
 */
export function fluidColorAt(progress: number): readonly [number, number, number] {
  return colorAt(progress)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** Imperative surface the slider drives; all methods are safe before layout. */
export interface FluidHandle {
  /** Set the lit fraction, 0..1. */
  setProgress(progress: number): void
  /** Switch the energy skin; only `fluid` animates. */
  setSkin(skin: Skin): void
  /** Toggle top-tier physics (×2 flow speed and the star stream). */
  setUltra(on: boolean): void
  /** Record the lightning state; its visuals are CSS-owned, not canvas-owned. */
  setLightning(on: boolean): void
  /** Record the normalized 0..1 rate glow; its visuals are CSS-owned. */
  setRate(normalized: number): void
  /** Stop the animation frame, observers and listeners, then clear the canvases. */
  dispose(): void
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  /** Source colour parameter captured at spawn time. */
  ct: number
  a: number
  /** Flow-response strength. */
  s: number
  /** Persistent speed multiplier. */
  sp: number
  ph: number
  age: number
  life: number
}

interface Star {
  x: number
  y: number
  v: number
  w: number
  tw: number
  a: number
}

interface Vortex {
  x: number
  y: number
  r: number
  s: number
  born: number
  ttl: number
}

const INERT_HANDLE: FluidHandle = Object.freeze({
  setProgress: () => undefined,
  setSkin: () => undefined,
  setUltra: () => undefined,
  setLightning: () => undefined,
  setRate: () => undefined,
  dispose: () => undefined,
})

/**
 * Mount the fluid engine on a canvas.
 *
 * The canvas must be absolutely positioned to fill the effect layer; the engine
 * sizes it from its own bounding box and finds the `.we-stars` sibling itself.
 * @param canvas - the `.we-fluid` canvas the effect layer renders.
 * @param options - initial skin; the engine only animates for `fluid`.
 * @returns the imperative handle; an inert one when the environment cannot paint.
 */
export function createFluidRenderer(
  canvas: HTMLCanvasElement,
  options: { skin: Skin },
): FluidHandle {
  if (typeof window === 'undefined') return INERT_HANDLE
  const win = window
  if (canvas === null || typeof canvas.getContext !== 'function') return INERT_HANDLE

  let context: CanvasRenderingContext2D | null = null
  try {
    context = canvas.getContext('2d')
  } catch {
    context = null
  }
  if (context === null) return INERT_HANDLE
  const draw = context

  const state = {
    progress: 1,
    skin: options.skin,
    ultra: false,
  }

  const dpr = clampDevicePixelRatio(win.devicePixelRatio)
  const motionQuery = typeof win.matchMedia === 'function'
    ? win.matchMedia('(prefers-reduced-motion: reduce)')
    : null
  let isDark = readDocumentTheme() === 'dark'
  let inset = DEFAULT_EFFECT_INSET

  /* ── star layer: a sibling canvas rendered by the effect layer ─────────── */
  let starCanvas: HTMLCanvasElement | null = null
  let starContext: CanvasRenderingContext2D | null = null
  let starWidth = 0
  let starHeight = 0
  try {
    const candidate = canvas.parentElement?.querySelector<HTMLCanvasElement>('.we-stars') ?? null
    if (candidate !== null && typeof candidate.getContext === 'function') {
      const found = candidate.getContext('2d')
      if (found !== null) {
        starCanvas = candidate
        starContext = found
      }
    }
  } catch {
    starCanvas = null
    starContext = null
  }

  let width = 0
  let height = 0
  let particles: Particle[] = []
  let stars: Star[] = []
  let vortices: Vortex[] = []
  let raf = 0
  let stopped = false
  let running = false
  let resizeObserver: ResizeObserver | null = null
  let themeObserver: MutationObserver | null = null
  let startedAt = 0
  let sourceT = 0
  let starEnterAt = -1
  let lastLitW = 0
  let litWCurrent = 0
  let timeNow = 0

  const seeds: { p: number; f: number; a: number }[] = []
  for (let index = 0; index < 6; index += 1) {
    seeds.push({ p: Math.random() * Math.PI * 2, f: 0.6 + Math.random() * 1.4, a: 0.6 + Math.random() * 0.8 })
  }

  function clock(): number {
    try {
      if (typeof win.performance.now === 'function') return win.performance.now()
    } catch {
      // Fall through to the wall clock; only frame ordering depends on it.
    }
    return Date.now()
  }

  function requestFrame(callback: FrameRequestCallback): number {
    return typeof win.requestAnimationFrame === 'function' ? win.requestAnimationFrame(callback) : 0
  }

  function cancelFrame(handle: number): void {
    if (handle === 0) return
    try {
      if (typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(handle)
    } catch {
      // A cancelled frame that already ran is harmless.
    }
  }

  /** Measure the layer; `display:none` yields 0 and the caller skips the frame. */
  function measure(): { w: number; h: number } {
    try {
      const rect = canvas.getBoundingClientRect()
      return {
        w: Math.max(0, Math.round(rect.width || 0)),
        h: Math.max(0, Math.round(rect.height || 0)),
      }
    } catch {
      return { w: 0, h: 0 }
    }
  }

  /** Lit-region inset shared with the effect CSS; keeps fill and fluid aligned. */
  function readInset(): number {
    try {
      const layer = canvas.parentElement
      if (layer === null || typeof win.getComputedStyle !== 'function') return DEFAULT_EFFECT_INSET
      const raw = win.getComputedStyle(layer).getPropertyValue('--we-inset').trim()
      const parsed = Number.parseFloat(raw)
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 40 ? parsed : DEFAULT_EFFECT_INSET
    } catch {
      return DEFAULT_EFFECT_INSET
    }
  }

  function currentPct(): number {
    return clamp01(state.progress)
  }

  /* ── star streak layer (top tier only) ─────────────────────────────────── */

  function spawnStar(atX?: number): Star {
    const rightEdge = Math.max(2, width) + 4
    const speedFloor = FLUID_PRESET.starSpeed[0]
    const speedSpan = FLUID_PRESET.starSpeed[1] - speedFloor
    return {
      x: atX ?? rightEdge + Math.random() * 36,
      y: Math.random() * height,
      v: speedFloor + speedSpan * Math.random() * Math.random(),
      w: 1.6 + Math.random() * 1.8,
      tw: Math.random() * Math.PI * 2,
      a: 0.55 + Math.random() * 0.45,
    }
  }

  function ensureStars(litW: number): void {
    const want = Math.max(0, Math.min(
      FLUID_PRESET.starCount,
      Math.round(FLUID_PRESET.starCount * Math.min(1, litW / Math.max(1, width))),
    ))
    if (stars.length > want) stars.length = want
    while (stars.length < want) stars.push(spawnStar())
  }

  function clearStars(): void {
    if (starContext === null) return
    if (stars.length > 0) stars.length = 0
    try {
      starContext.clearRect(0, 0, Math.max(1, starWidth), Math.max(1, starHeight))
    } catch {
      // Clearing a detached canvas is not actionable; the next frame retries.
    }
  }

  /**
   * Head/trail colours of one streak. The upstream layer is white on a dark
   * surface; the light theme needs deep blue streaks to stay visible, matching
   * the approved visual baseline ("radiation remains blue on a light surface").
   */
  function starHead(alpha: number): string {
    return isDark ? `rgba(255,255,255,${alpha.toFixed(3)})` : `rgba(20,64,168,${alpha.toFixed(3)})`
  }

  function starMid(alpha: number): string {
    return isDark ? `rgba(214,232,255,${alpha.toFixed(3)})` : `rgba(38,102,206,${alpha.toFixed(3)})`
  }

  function starTail(): string {
    return isDark ? 'rgba(150,190,255,0)' : 'rgba(38,102,206,0)'
  }

  function drawStars(): void {
    if (starContext === null) return
    const litW = litWCurrent
    ensureStars(litW)
    const maxSpeed = FLUID_PRESET.starSpeed[1] || 1
    const ramp = starEnterAt < 0
      ? 0
      : Math.min(1, Math.max(0, (timeNow - starEnterAt) / FLUID_PRESET.starRampMs))
    const scale = FLUID_PRESET.starRampStart + (1 - FLUID_PRESET.starRampStart) * (ramp * ramp)
    try {
      starContext.clearRect(0, 0, starWidth, starHeight)
      starContext.lineCap = 'round'
      for (let index = 0; index < stars.length; index += 1) {
        const star = stars[index]
        const visualSpeed = star.v * scale
        star.x -= visualSpeed
        if (star.x < -6) {
          stars[index] = spawnStar()
          continue
        }
        star.y += Math.sin(timeNow * 0.0025 + star.tw) * 0.1
        if (star.y < 1) star.y = 1
        if (star.y > height - 1) star.y = height - 1
        if (star.x > litW + 4) continue
        const length = Math.min(96, 10 + visualSpeed * 5.2)
        const alpha = star.a * (0.4 + 0.6 * Math.min(1, visualSpeed / maxSpeed))
        const headX = star.x
        const tailX = Math.min(headX + length, litW + 4)
        const gradient = starContext.createLinearGradient(headX, 0, tailX, 0)
        gradient.addColorStop(0, starHead(alpha))
        gradient.addColorStop(0.35, starMid(alpha * 0.55))
        gradient.addColorStop(1, starTail())
        starContext.strokeStyle = gradient
        starContext.lineWidth = star.w
        starContext.beginPath()
        starContext.moveTo(headX, star.y)
        starContext.lineTo(tailX, star.y)
        starContext.stroke()
        if (visualSpeed > maxSpeed * 0.55) {
          starContext.beginPath()
          starContext.fillStyle = starHead(Math.min(1, alpha * 1.15))
          starContext.arc(headX, star.y, star.w * 0.85, 0, Math.PI * 2)
          starContext.fill()
        }
      }
    } catch {
      // A broken star layer must not stop the fluid; drop it for this renderer.
      starContext = null
    }
  }

  /* ── fluid particles ───────────────────────────────────────────────────── */

  function spawnVortex(): void {
    vortices.push({
      x: width * (0.02 + Math.random() * 0.96),
      y: height * (0.1 + Math.random() * 0.8),
      r: height * (0.9 + Math.random() * 2.1),
      s: (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.1),
      born: clock(),
      ttl: 1800 + Math.random() * 2600,
    })
  }

  function spawn(atX?: number): Particle {
    return {
      x: atX ?? Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      r: FLUID_PRESET.r[0] + Math.random() * (FLUID_PRESET.r[1] - FLUID_PRESET.r[0]),
      ct: clamp01(sourceT + (Math.random() - 0.5) * 0.06),
      a: FLUID_PRESET.alpha * (0.6 + Math.random() * 0.8),
      s: 0.35 + Math.random() * 1.1,
      sp: FLUID_PRESET.speed[0] + Math.random() * (FLUID_PRESET.speed[1] - FLUID_PRESET.speed[0]),
      ph: Math.random() * Math.PI * 2,
      age: 0,
      life: FLUID_PRESET.life * (0.6 + Math.random() * 0.9),
    }
  }

  /** Multi-scale curl noise: low scales give large eddies, high scales fine threads. */
  function curl(x: number, y: number, t: number): [number, number] {
    let vx = 0
    let vy = 0
    for (const seed of seeds) {
      const f = seed.f * FLUID_PRESET.curlScale * 8
      vx += Math.sin(y * f + t * 0.00072 * seed.f + seed.p) * seed.a
      vy += Math.cos(x * f + t * 0.00061 * seed.f + seed.p * 1.7) * seed.a
      vx += Math.sin(y * f * 3.7 + t * 0.0011 + seed.p * 2.3) * seed.a * 0.35
      vy += Math.cos(x * f * 3.1 + t * 0.0009 + seed.p * 3.1) * seed.a * 0.35
    }
    return [vx, vy]
  }

  /** Constant per-pixel density: the particle count follows the lit width. */
  function targetCount(litW: number): number {
    let want = Math.round(FLUID_PRESET.density * litW)
    if (!(want > FLUID_PRESET.countMin)) want = FLUID_PRESET.countMin
    if (want > FLUID_PRESET.countMax) want = FLUID_PRESET.countMax
    return want
  }

  function syncCount(litW: number): void {
    const want = targetCount(litW)
    if (particles.length === want) return
    if (!(want > 0)) return
    if (want > particles.length) {
      while (particles.length < want) particles.push(spawn(Math.random() * litW))
      return
    }
    particles.sort((left, right) => left.x - right.x)
    particles.length = want
  }

  /**
   * Lit-width geometry shared with the effect CSS: the host thumb centre is
   * clamped between the two inset edges, so the fluid edge tracks the thumb
   * instead of the upstream rail's inner-width mapping.
   */
  function thumbCenter(fullWidth: number, pct: number, edge: number): number {
    return Math.min(fullWidth - edge, Math.max(edge, fullWidth * pct))
  }

  function seedCount(): number {
    const lit = thumbCenter(width, currentPct(), inset)
    return targetCount(Math.min(Math.max(lit, 2), Math.max(2, width)))
  }

  /**
   * Resize the backing stores only when the layer size actually changed.
   * Reassigning `canvas.width` clears the canvas, so a per-frame write would
   * make the fluid vanish.
   * @returns `false` when the layer has no layout yet; the frame must be skipped.
   */
  function resizeIfNeeded(): boolean {
    const size = measure()
    if (size.w <= 0 || size.h <= 0) return false
    if (size.w === width && size.h === height && canvas.width > 0) return true
    width = size.w
    height = size.h
    inset = readInset()
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    draw.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (starCanvas !== null && starContext !== null) {
      try {
        starWidth = width
        starHeight = height
        starCanvas.width = Math.round(width * dpr)
        starCanvas.height = Math.round(height * dpr)
        starContext.setTransform(dpr, 0, 0, dpr, 0, 0)
        stars.length = 0
      } catch {
        starCanvas = null
        starContext = null
      }
    }
    particles = []
    const seedTotal = seedCount()
    for (let index = 0; index < seedTotal; index += 1) particles.push(spawn())
    lastLitW = 0
    return true
  }

  /** One simulation+draw frame; the upstream `frame()` body without its rAF bootstrap. */
  function step(now: number): void {
    if (!resizeIfNeeded()) return
    const stamp = Number.isFinite(now) ? now : clock()
    const t = stamp - startedAt
    timeNow = t

    const huePhase = (t % FLUID_PRESET.hueCycle) / FLUID_PRESET.hueCycle
    sourceT = huePhase < 0.5 ? huePhase * 2 : (1 - huePhase) * 2

    const targetPct = currentPct()
    const litW = Math.min(width, Math.max(2, thumbCenter(width, targetPct, inset)))
    litWCurrent = litW

    // Re-anchor the whole cloud when the tier jumps, otherwise the source region
    // starves while the cloud slides right (upstream regression fix d).
    if (lastLitW > 0 && Math.abs(litW - lastLitW) > 0.01) {
      const scale = litW / lastLitW
      for (const particle of particles) particle.x *= scale
    }
    syncCount(litW)
    lastLitW = litW

    // Pulling the thumb left must erase the pixels the lit region no longer covers.
    if (litW < width - 1) {
      draw.globalCompositeOperation = 'source-over'
      draw.clearRect(litW, 0, width - litW, height)
    }
    for (let index = 0; index < particles.length; index += 1) {
      if (particles[index].x > litW - 1) {
        particles[index] = spawn(Math.random() * Math.min(26, litW * 0.35) - 4)
      }
    }

    draw.save()
    draw.beginPath()
    if (typeof draw.roundRect === 'function') draw.roundRect(0, 0, litW, height, height / 2)
    else draw.rect(0, 0, litW, height)
    draw.clip()

    // Real erase, never a dark overlay: an overlay accumulates into an opaque
    // smear (upstream regression fix a).
    draw.globalCompositeOperation = 'destination-out'
    draw.fillStyle = `rgba(0,0,0,${FLUID_PRESET.fade.toFixed(3)})`
    draw.fillRect(0, 0, width, height)
    draw.globalCompositeOperation = 'source-over'

    if (vortices.length < 6 && Math.random() < 0.05) spawnVortex()
    vortices = vortices.filter((vortex) => stamp - vortex.born < vortex.ttl)

    draw.globalCompositeOperation = FLUID_PRESET.blend
    const speed = FLUID_PRESET.vel * (state.ultra ? FLUID_PRESET.topSpeedMul : 1)
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index]
      const flow = curl(particle.x, particle.y + particle.ph, t)
      let dirX = 1 + flow[0] * FLUID_PRESET.swirl * particle.s
      let dirY = flow[1] * FLUID_PRESET.swirl * particle.s
      dirY += Math.sin(t * 0.0016 + particle.ph) * 0.34 * particle.s
      for (const vortex of vortices) {
        const dx = particle.x - vortex.x
        const dy = particle.y - vortex.y
        const distanceSquared = dx * dx + dy * dy
        const pull = vortex.s * (vortex.r * vortex.r) / (distanceSquared + vortex.r * vortex.r * 0.6)
        dirX += -dy * pull * 0.012
        dirY += dx * pull * 0.012
      }
      const length = Math.sqrt(dirX * dirX + dirY * dirY) || 1
      particle.vx = particle.vx * 0.8 + (dirX / length) * 0.2
      particle.vy = particle.vy * 0.8 + (dirY / length) * 0.2
      particle.x += speed * particle.sp * (1 + particle.vx * 0.6)
      particle.y += speed * particle.vy * 1.6 + (Math.random() - 0.5) * FLUID_PRESET.jitter * 0.35
      if (particle.y < -4) particle.y = height + 3
      if (particle.y > height + 4) particle.y = -3
      particle.age += 16.7
      if (particle.x > litW - 2 || particle.x < -6) {
        particles[index] = spawn(Math.random() * Math.min(26, litW * 0.35) - 4)
        continue
      }
      const color = colorAt(particle.ct)
      const alpha = particle.a * (1 - 0.15 * Math.min(1, particle.age / particle.life))
      draw.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha.toFixed(3)})`
      draw.beginPath()
      draw.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2)
      draw.fill()
    }
    draw.globalCompositeOperation = 'source-over'
    draw.restore()

    // The star layer is drawn after the fluid so its streaks stay crisp, and it
    // only exists at the top tier (the upstream `isTop` reward).
    if (starContext !== null) {
      if (state.ultra) {
        if (starEnterAt < 0) starEnterAt = t
        drawStars()
      } else {
        starEnterAt = -1
        clearStars()
      }
    }
  }

  function frame(now: number): void {
    raf = 0
    if (stopped || !running) return
    try {
      step(now)
    } catch {
      stopLoop()
      return
    }
    raf = requestFrame(frame)
  }

  function startLoop(): void {
    if (stopped || running) return
    running = true
    try {
      resizeIfNeeded()
    } catch {
      // The next frame retries when the layer gains a size.
    }
    raf = requestFrame(frame)
  }

  function stopLoop(): void {
    running = false
    cancelFrame(raf)
    raf = 0
  }

  function stillMode(): boolean {
    return motionQuery !== null && motionQuery.matches === true
  }

  /**
   * Draw once at the frozen timeline origin. Reduced motion must not animate,
   * so a progress or theme change re-seeds and paints a single still frame.
   */
  function drawStill(): void {
    if (stopped) return
    try {
      width = 0
      step(startedAt)
    } catch {
      // A still frame that cannot paint leaves the rail background visible.
    }
  }

  function clearCanvases(): void {
    try {
      draw.clearRect(0, 0, Math.max(1, width), Math.max(1, height))
    } catch {
      // Nothing to clear when the canvas has no backing store yet.
    }
    try {
      if (starContext !== null) {
        starContext.clearRect(0, 0, Math.max(1, starWidth), Math.max(1, starHeight))
      }
    } catch {
      // The star layer is optional; a failed clear only risks a stale streak.
    }
  }

  /* ── lifecycle ─────────────────────────────────────────────────────────── */

  function onMotionChange(): void {
    syncActivity()
  }

  function syncActivity(): void {
    if (stopped) return
    if (state.skin !== 'fluid') {
      stopLoop()
      clearCanvases()
      return
    }
    if (stillMode()) {
      stopLoop()
      drawStill()
      return
    }
    startLoop()
  }

  function resume(): void {
    if (stopped) return
    startedAt = clock()
    width = 0
    clearCanvases()
    syncActivity()
  }

  function onResize(): void {
    try {
      resizeIfNeeded()
      if (!running) drawStill()
    } catch {
      // A layout that cannot be measured is retried on the next observer event.
    }
  }

  function handle(): FluidHandle {
    return {
      setProgress(next: number): void {
        state.progress = clamp01(next)
        if (!stopped && !running && state.skin === 'fluid') drawStill()
      },
      setSkin(next: Skin): void {
        if (state.skin === next) return
        state.skin = next
        if (stopped) return
        if (state.skin === 'fluid') resume()
        else {
          stopLoop()
          clearCanvases()
        }
      },
      setUltra(on: boolean): void {
        if (state.ultra === on) return
        state.ultra = on
        if (!stopped && !running && state.skin === 'fluid') drawStill()
      },
      setLightning(_on: boolean): void {
        // The canvas has no lightning layer upstream: the bolt and its rate glow
        // are CSS-owned, so the handle records nothing.
      },
      setRate(_normalized: number): void {
        // Rate only drives CSS glow intensity upstream; the canvas is unaffected.
      },
      dispose(): void {
        if (stopped) return
        stopped = true
        stopLoop()
        try {
          if (motionQuery !== null && typeof motionQuery.removeEventListener === 'function') {
            motionQuery.removeEventListener('change', onMotionChange)
          }
        } catch {
          // A media query that cannot be unsubscribed is released with the page.
        }
        if (themeObserver !== null) {
          try {
            themeObserver.disconnect()
          } catch {
            // The observer is discarded below even when disconnect fails.
          }
          themeObserver = null
        }
        if (resizeObserver !== null) {
          try {
            resizeObserver.disconnect()
          } catch {
            // The observer is discarded below even when disconnect fails.
          }
          resizeObserver = null
        }
        try {
          win.removeEventListener('resize', onResize)
        } catch {
          // Window teardown may already have removed the listener.
        }
        particles = []
        stars = []
        vortices = []
        clearCanvases()
        starCanvas = null
        starContext = null
      },
    }
  }

  // Observers and listeners are installed once; a failure here degrades to a
  // static first frame instead of an exception into React.
  try {
    if (typeof win.ResizeObserver === 'function') {
      resizeObserver = new win.ResizeObserver(onResize)
      resizeObserver.observe(canvas)
    }
    win.addEventListener('resize', onResize)
  } catch {
    resizeObserver = null
  }
  try {
    if (typeof win.MutationObserver === 'function' && typeof document !== 'undefined' && document.body !== null) {
      themeObserver = new win.MutationObserver(() => {
        isDark = readDocumentTheme() === 'dark'
        if (!running) drawStill()
      })
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    }
  } catch {
    themeObserver = null
  }
  try {
    if (motionQuery !== null && typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', onMotionChange)
    }
  } catch {
    // Without a motion listener the initial preference still applies.
  }

  startedAt = clock()
  try {
    resizeIfNeeded()
  } catch {
    // The frame loop retries sizing when layout becomes measurable.
  }
  syncActivity()
  return handle()
}
