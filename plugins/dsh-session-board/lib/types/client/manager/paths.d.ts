/**
 * Path formatting for the manager navigator.
 *
 * Workspace paths identify their folder by the tail, not the head, so a long
 * absolute path is shortened from the left. Doing it here keeps the rendered
 * text honest (a real ellipsis plus a real path suffix) instead of relying on
 * right-to-left text direction, which reorders the leading slash.
 */
/** Default maximum rendered length of a workspace path. */
export declare const PATH_MAX_LENGTH = 46;
/**
 * Keep the identifying tail of a path.
 * @param path - absolute workspace path.
 * @param max - maximum rendered characters, ellipsis included.
 * @returns the tail of the path, or the path itself when it already fits.
 */
export declare function shortenPath(path: string, max?: number): string;
