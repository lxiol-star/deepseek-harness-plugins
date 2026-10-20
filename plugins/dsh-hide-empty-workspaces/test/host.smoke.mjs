import { readFileSync } from 'node:fs'
import { apply, readInstalledVersion, statusPayload } from '../lib/index.js'

let failures = 0
function check(name, condition) {
  if (condition) {
    console.log(`ok   ${name}`)
    return
  }
  failures += 1
  console.error(`FAIL ${name}`)
}

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

// 1. The manifest next to the entry is readable and matches the package.
check('readInstalledVersion reads the shipped manifest', readInstalledVersion() === manifest.version)
check('statusPayload pairs loaded and installed versions',
  JSON.stringify(statusPayload('0.1.0')) === JSON.stringify({
    loadedVersion: '0.1.0',
    installedVersion: manifest.version,
  }))

// 2. apply registers exactly one exact GET route.
const routes = []
const cleanups = []
apply({
  effect: (factory) => { cleanups.push(factory()) },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
})
check('registers one route', routes.length === 1)
check('route path and kind', routes[0].path === '/hide-empty-workspaces/status' && routes[0].kind === 'exact')

function request(method) {
  const headers = {}
  let body = ''
  const res = {
    statusCode: 0,
    setHeader: (name, value) => { headers[name.toLowerCase()] = value },
    end: (chunk) => { body = chunk === undefined ? '' : String(chunk) },
  }
  routes[0].handler({ method }, res)
  return { status: res.statusCode, headers, body }
}

const get = request('GET')
check('GET answers 200 JSON', get.status === 200 && get.headers['content-type'].startsWith('application/json'))
const payload = JSON.parse(get.body)
check('GET reports both versions', payload.loadedVersion === manifest.version
  && payload.installedVersion === manifest.version)
check('GET disables caching', get.headers['cache-control'] === 'no-store')

const post = request('POST')
check('non-GET answers 405', post.status === 405 && post.headers.allow === 'GET')

// 3. Disposal runs the registered cleanup.
check('one cleanup registered', cleanups.length === 1 && typeof cleanups[0] === 'function')

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nall checks passed')
}
