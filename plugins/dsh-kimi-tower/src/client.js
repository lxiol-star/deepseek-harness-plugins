/**
 * dsh-kimi-tower browser half — the entry `scripts/build.mjs` bundles.
 *
 * The dock above the composer used to live in this one file. It now lives with
 * the fullscreen canvas under `./client/` (and the canvas's layout under
 * `./canvas/`), as ES modules that `scripts/build-client.mjs` bundles into the
 * single `lib/client.js`. This file stays the entry, so the path is unchanged:
 * `src/client.js` → `lib/client.js`.
 *
 * Nothing here or below imports `@deepseek-ai/*`; at runtime the bundle only
 * asks the platform's module loader for `react` and `react-dom`.
 */
export { apply, inject } from './client/index.js'
