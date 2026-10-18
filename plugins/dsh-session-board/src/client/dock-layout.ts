/**
 * Pure layout grammar for the dock adapter.
 *
 * Two decisions keep the docked column safe, and both are pure:
 *
 *  - *Recognition*: is this frame the shell's three-track grid, and may the
 *    dock be inserted between two of the columns? The template grammar below
 *    answers that from the string alone, including nested functions
 *    (`minmax(0px, min(400px, 20%))`) and bracketed line names
 *    (`[content-start] 1fr`).
 *  - *Budget*: how wide may the dock be before the conversation drops below
 *    the width the shell itself protects? The budget reserves the numeric
 *    sidebar/rightbar tracks plus `CHAT_MIN_PX` and spends only the rest.
 *
 * Nothing here touches the DOM, so both can be tested without a browser.
 * The adapter (`dock-adapter.ts`) is the only DOM half.
 */

/**
 * The dock's track, exactly as the adapter has always injected it. Kept
 * verbatim: it is the fallback inside {@link EFFECTIVE_TRACK}, so a frame left
 * over from an older build still resolves its width.
 */
export const MY_TRACK = 'var(--sb-dock-track, 341px)'

/** Custom property the client half writes on `documentElement`. */
export const DOCK_TRACK_VAR = '--sb-dock-track'

/**
 * Custom property the adapter writes on the *frame* when the budget narrows
 * the dock. Scoped to the frame so no global CSS and no view store is touched.
 */
export const EFFECTIVE_TRACK_VAR = '--sb-dock-track-effective'

/** Marker every injected track carries, so a restore is exact. */
export const DOCK_TRACK_MARKER = '--sb-dock-track'

/**
 * The track injected into the frame: the responsive cap when the adapter has
 * set one, the user's width otherwise.
 */
export const EFFECTIVE_TRACK = `var(${EFFECTIVE_TRACK_VAR}, ${MY_TRACK})`

/** Width the app's centre track protects (`CENTER_MIN` upstream). */
export const CHAT_MIN_PX = 400
/** Narrowest usable expanded dock (mirrors `BoardDock.DOCK_MIN_WIDTH`). */
export const DOCK_MIN_PX = 260
/** Collapsed rail (mirrors `BoardDock.DOCK_RAIL_WIDTH`; the dock is border-box). */
export const DOCK_RAIL_PX = 40
/** Desired width assumed when the CSS variable cannot be read. */
export const DOCK_FALLBACK_PX = 340

/** A track's resolved px extent: `minmax(0px, 320px)` is `{min:0,max:320}`. */
export interface TrackExtent {
  min: number
  max: number
}

/** The numeric widths the frame's own tracks must be reserved for. */
export interface NativeColumns {
  sidebar: number
  rightbar: number
}

/** How the dock fits the frame after the budget is applied. */
export type DockFitMode = 'full' | 'shrunk' | 'rail' | 'declined' | 'unknown'

/** One budget decision. */
export interface DockFit {
  mode: DockFitMode
  width: number
}

/** Inputs of {@link fitDockTrack}. `null` means "not px-resolvable". */
export interface DockBudgetInput {
  /** Measured frame width in px; `<= 0` when it cannot be measured. */
  frameWidth: number
  /** Resolved sidebar track, or null when the template is not numeric. */
  sidebar: number | null
  /** Resolved rightbar track, or null when the template is not numeric. */
  rightbar: number | null
  /** The user's dock width in px. */
  desired: number
  /** Conversation width the shell protects. */
  chatMin?: number
  /** Narrowest expanded dock. */
  min?: number
  /** Collapsed rail width. */
  rail?: number
}

const PX_RE = /^(\d+(?:\.\d+)?)px$/i
const NUMBER_RE = /^\d+(?:\.\d+)?$/
const FUNCTION_RE = /^([a-z-]+)\((.*)\)$/is

/**
 * Split a value on top-level separators: separators inside parentheses,
 * brackets, or quotes are part of the segment. `minmax(0px, 1fr)` and
 * `[full-start] 1fr [full-end]` both survive intact.
 */
function splitTop(value: string, isSeparator: (ch: string) => boolean): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ''
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i)
    if (quote !== null) {
      current += ch
      if (ch === '\\') {
        current += value.charAt(i + 1)
        i += 1
        continue
      }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '(' || ch === '[') {
      depth += 1
      current += ch
      continue
    }
    if (ch === ')' || ch === ']') {
      depth = Math.max(0, depth - 1)
      current += ch
      continue
    }
    if (depth === 0 && isSeparator(ch)) {
      if (current !== '') parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current !== '') parts.push(current)
  return parts
}

/** Split a `grid-template-columns` value into raw tokens. */
export function splitTrackTokens(template: string): string[] {
  return splitTop(template, ch => /\s/.test(ch))
}

/** Split a function's argument list on top-level commas, trimming each part. */
function splitArgs(inner: string): string[] {
  return splitTop(inner, ch => ch === ',').map(part => part.trim())
}

/**
 * Track sizes only: bracketed line names are not tracks, and a fixed
 * `repeat(<n>, ...)` is expanded so it counts as `<n>` tracks. Unresolvable
 * repeats (`repeat(auto-fill, ...)`) stay one token.
 */
export function trackSizes(template: string): string[] {
  const sizes: string[] = []
  for (const token of splitTrackTokens(template)) {
    if (token.startsWith('[')) continue
    const fn = FUNCTION_RE.exec(token)
    if (fn !== null && fn[1]?.toLowerCase() === 'repeat') {
      const args = splitArgs(fn[2] ?? '')
      const count = Number(args[0])
      if (Number.isInteger(count) && count > 0 && count <= 64 && args.length >= 2) {
        const inner = trackSizes(args.slice(1).join(' '))
        for (let n = 0; n < count; n += 1) sizes.push(...inner)
        continue
      }
    }
    sizes.push(token)
  }
  return sizes
}

/** Whether a track token is one this adapter injected. */
export function isDockTrack(track: string): boolean {
  return track.includes(DOCK_TRACK_MARKER)
}

/** Cheap check: does this template already carry the dock's track? */
export function hasDockTrack(template: string): boolean {
  return template.includes(DOCK_TRACK_MARKER)
}

/** How many of the template's tracks belong to the shell itself. */
export function countOriginalTracks(template: string): number {
  return trackSizes(template).filter(track => !isDockTrack(track)).length
}

/**
 * Resolve one track token to a px extent, or null when it is not
 * px-resolvable (`1fr`, `auto`, `20%`, `calc(...)`, a bare `var(...)`). Nested
 * `minmax`/`min`/`max`/`clamp` are understood because that is the shape the
 * shell emits.
 */
export function parseTrackExtent(token: string): TrackExtent | null {
  const value = token.trim()
  if (value === '') return null
  const px = PX_RE.exec(value)
  if (px !== null) {
    const resolved = Number(px[1])
    return Number.isFinite(resolved) ? { min: resolved, max: resolved } : null
  }
  if (NUMBER_RE.test(value)) return value === '0' ? { min: 0, max: 0 } : null
  const fn = FUNCTION_RE.exec(value)
  if (fn === null) return null
  const name = (fn[1] ?? '').toLowerCase()
  const args = splitArgs(fn[2] ?? '')
  if (name === 'minmax') {
    if (args.length !== 2) return null
    const lower = parseTrackExtent(args[0] ?? '')
    const upper = parseTrackExtent(args[1] ?? '')
    if (lower === null || upper === null) return null
    return { min: lower.min, max: upper.max }
  }
  if (name === 'min' || name === 'max') {
    const extents = args.map(parseTrackExtent)
    if (extents.length === 0 || extents.some(extent => extent === null)) return null
    const resolved = extents as TrackExtent[]
    const pick = name === 'min' ? Math.min : Math.max
    return {
      min: pick(...resolved.map(extent => extent.min)),
      max: pick(...resolved.map(extent => extent.max)),
    }
  }
  if (name === 'clamp') {
    if (args.length !== 3) return null
    const lower = parseTrackExtent(args[0] ?? '')
    const upper = parseTrackExtent(args[2] ?? '')
    if (lower === null || upper === null) return null
    return { min: lower.min, max: upper.max }
  }
  return null
}

/**
 * The numeric widths the frame's own sidebar and rightbar tracks claim.
 *
 * Returns null unless the template is exactly the shell's three tracks and
 * both side tracks are px-resolvable: when the budget cannot be trusted, the
 * adapter keeps the user's width instead of guessing.
 */
export function resolveNativeColumns(template: string): NativeColumns | null {
  const sizes = trackSizes(template).filter(track => !isDockTrack(track))
  if (sizes.length !== 3) return null
  const sidebar = parseTrackExtent(sizes[0] ?? '')
  const rightbar = parseTrackExtent(sizes[2] ?? '')
  if (sidebar === null || rightbar === null) return null
  return { sidebar: sidebar.max, rightbar: rightbar.max }
}

/** Read a dock width from a CSS custom-property value, or null. */
export function parseDockTrackValue(raw: string): number | null {
  const value = raw.trim()
  if (value === '') return null
  const px = PX_RE.exec(value)
  if (px !== null) {
    const resolved = Number(px[1])
    return Number.isFinite(resolved) && resolved > 0 ? resolved : null
  }
  if (!NUMBER_RE.test(value)) return null
  const resolved = Number(value)
  return resolved > 0 ? resolved : null
}

/**
 * Fit the dock into the frame without pushing the conversation below the
 * width the shell protects.
 *
 * The ladder is deliberately conservative: the dock keeps its desired width
 * while that fits; otherwise it shrinks as far as the frame allows; then it
 * falls back to the collapsed rail; and when even the rail would eat into the
 * conversation, the dock declines entirely and the adapter takes its track
 * back out. `unknown` means the frame could not be measured or its side tracks
 * are not numeric, in which case the user's width is left alone.
 */
export function fitDockTrack(input: DockBudgetInput): DockFit {
  const chatMin = input.chatMin ?? CHAT_MIN_PX
  const min = input.min ?? DOCK_MIN_PX
  const rail = input.rail ?? DOCK_RAIL_PX
  const desired = Number.isFinite(input.desired) && input.desired > 0 ? input.desired : DOCK_FALLBACK_PX
  if (!Number.isFinite(input.frameWidth) || input.frameWidth <= 0 || input.sidebar === null || input.rightbar === null) {
    return { mode: 'unknown', width: desired }
  }
  const available = Math.floor(input.frameWidth - input.sidebar - input.rightbar - chatMin)
  if (available >= desired) return { mode: 'full', width: desired }
  if (available >= min) return { mode: 'shrunk', width: available }
  if (available >= rail) return { mode: 'rail', width: rail }
  return { mode: 'declined', width: 0 }
}
