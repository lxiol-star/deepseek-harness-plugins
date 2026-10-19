/**
 * Host half of dsh-hide-empty-workspaces.
 *
 * The filter itself runs in the browser half; this entry exists so the bundle
 * row loads and the Web client loader picks up `./client`.
 */

/** Plugin name used by the loader row. */
export const name = 'hide-empty-workspaces'

/** No host-side behavior. */
export function apply() {}
