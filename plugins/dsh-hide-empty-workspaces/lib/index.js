/**
 * Host half of dsh-hide-empty-workspaces.
 *
 * The filter runs in the browser half. This entry exists so the bundle row
 * loads, and it serves one read-only status route the settings tab uses to
 * compare the version on disk with the version this process loaded.
 */
import { readFileSync } from 'node:fs'

/** Plugin name used by the loader row. */
export const name = 'hide-empty-workspaces'

/** The WebServer service that owns HTTP routes. */
export const inject = ['webServer']

/** Exact path of the read-only version status route. */
const STATUS_PATH = '/hide-empty-workspaces/status'

/**
 * Read this package's version from the file shipped next to the loaded module.
 * @param url - module URL of the running entry.
 * @returns the version, or undefined when the manifest is unreadable.
 */
export function readInstalledVersion(url = import.meta.url) {
  try {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', url), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Build the JSON body for one status request.
 * @param loadedVersion - version this process loaded at boot.
 * @returns the version comparison payload.
 */
export function statusPayload(loadedVersion) {
  return { loadedVersion, installedVersion: readInstalledVersion() }
}

/**
 * Register the status route.
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
  // Captured at apply time: this is the code version the running process has,
  // while `readInstalledVersion()` re-reads the manifest on every request so a
  // reinstall without restart becomes visible.
  const loadedVersion = readInstalledVersion()

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: STATUS_PATH,
    handler: (req, res) => {
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.setHeader('allow', 'GET')
        res.end()
        return
      }
      res.statusCode = 200
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(statusPayload(loadedVersion)))
    },
  }), 'hide-empty-workspaces: status route')
}
