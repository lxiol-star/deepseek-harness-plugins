/**
 * Platform metadata the board echoes on its own surfaces.
 *
 * The shell marks `<html data-platform>` (`darwin` on the macOS desktop app) and
 * the board stylesheets key their window-drag rules off that marker. Echoing the
 * raw marker on the element that owns a platform-specific behavior keeps those
 * rules inspectable from the DOM and independent of stylesheet load order.
 */

/**
 * The shell's platform marker, echoed on board surfaces that carry
 * platform-specific behavior.
 *
 * The value is the shell's own marker rather than a normalized name, so it
 * matches every other `data-platform` rule in the host and the plugin. The
 * fullscreen board is portalled outside `#root`, so its echoed marker also lets
 * the stylesheet scope the macOS traffic-light clearance to the overlay itself
 * instead of reaching back to the document element.
 *
 * @returns the shell's raw marker, or undefined when the shell is plain web.
 */
export function boardPlatformMarker(): string | undefined {
  const marker = globalThis.document?.documentElement?.dataset?.platform
  return marker === undefined || marker === '' ? undefined : marker
}
