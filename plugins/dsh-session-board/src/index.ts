/**
 * `dsh-session-board` host entry point — the module the bundle row in
 * `cordis.patch.yml` loads (and, after the build, `lib/index.js`).
 *
 * It is deliberately a re-export: the plugin surface lives in `./host/plugin.ts`
 * so this file cannot drift from the declaration the loader reads.
 */
export { apply, inject, name } from './host/plugin.ts'
