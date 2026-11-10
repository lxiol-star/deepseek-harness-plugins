/**
 * Path formatting for the manager navigator.
 *
 * Workspace paths identify their folder by the tail, not the head, so a long
 * absolute path is shortened from the left. Doing it here keeps the rendered
 * text honest (a real ellipsis plus a real path suffix) instead of relying on
 * right-to-left text direction, which reorders the leading slash.
 */

/** Default maximum rendered length of a workspace path. */
export const PATH_MAX_LENGTH = 46

/**
 * Keep the identifying tail of a path.
 * @param path - absolute workspace path.
 * @param max - maximum rendered characters, ellipsis included.
 * @returns the tail of the path, or the path itself when it already fits.
 */
export function shortenPath(path: string, max = PATH_MAX_LENGTH): string {
  if (path.length <= max) return path
  // Reserve one character for the ellipsis, then start at a segment boundary
  // when one exists so the fragment does not begin mid-segment.
  const tail = path.slice(path.length - (max - 1))
  const boundary = tail.indexOf('/')
  return `…${boundary <= 0 ? tail : tail.slice(boundary)}`
}
