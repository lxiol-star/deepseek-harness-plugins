/**
 * Reproducible strict typecheck (and, with `--vitest`, scoped test run) for a
 * checkout that has no dependencies installed.
 *
 * The plugin's own `node_modules` is intentionally empty: `react`, `react-dom`,
 * `vitest`, and the `@deepseek-ai/*` packages are never installed next to the
 * source, so a bare `tsc -p tsconfig.json` from a bare checkout cannot resolve
 * any of them. The compiler, the test runner, and the DSH packages do exist
 * inside a DSH source checkout, and those packages publish built declarations
 * under `lib/types/**\/*.d.ts` — the same surface an installed plugin sees.
 *
 * This script therefore:
 *
 *   1. locates the DSH checkout (`DSH_REPO`, else a sibling checkout),
 *   2. resolves every module the plugin imports — DSH workspace packages,
 *      react, react-dom, vitest — to a declaration file through the
 *      workspace's own package manifests (`exports`/`types`, subpaths too),
 *   3. writes a temporary tsconfig that extends the plugin's committed
 *      `tsconfig.json` and overrides only that resolution, then
 *   4. runs the checkout's `tsc` (or, with `--vitest`, its `vitest`).
 *
 * pnpm intentionally does not hoist workspace packages to the repo root, so
 * Node resolution cannot find them from a bare checkout; reading the manifests
 * is what makes `@deepseek-ai/dsh-api-session-controller/types` and friends
 * resolve exactly.
 *
 * Nothing is written inside the repository (the generated config goes to the OS
 * temp directory) and no network access is required. `paths` is used for
 * *resolution only*: strictness comes from the committed config, so no type
 * error is hidden. There is deliberately no hardcoded user path — set
 * `DSH_REPO=/path/to/deepseek-harness` when no sibling checkout exists.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const SCAN_DIRS = [join(root, 'src'), join(root, 'tests')]
const SOURCE_RE = /\.[cm]?[jt]sx?$/
/** `@types` peers that stand in for a runtime package's missing declarations. */
const TYPE_PEERS = { react: '@types/react', 'react-dom': '@types/react-dom' }
/** Workspace families that hold DSH packages, relative to the checkout. */
const WORKSPACE_ROOTS = ['packages', 'apps', 'vendor', 'native']

/** Fail loudly with one actionable line instead of a wall of TS2307. */
function fail(message) {
  process.stderr.write(`typecheck: ${message}\n`)
  process.exit(2)
}

/** Resolve the DSH checkout from `DSH_REPO`, else from a sibling layout. */
function findRepo() {
  const configured = process.env.DSH_REPO
  if (configured !== undefined && configured !== '') {
    const explicit = resolve(configured)
    if (!existsSync(join(explicit, 'tsconfig.base.json'))) {
      fail(`DSH_REPO does not look like a DSH checkout: ${explicit}`)
    }
    return explicit
  }
  const sibling = resolve(root, '..', '..', '..', 'deepseek-harness')
  if (existsSync(join(sibling, 'tsconfig.base.json'))) return sibling
  fail('cannot locate a DSH checkout; set DSH_REPO=/path/to/deepseek-harness')
}

/** Walk a directory tree, yielding every module file under it. */
function* walk(dir) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (SOURCE_RE.test(entry)) yield full
  }
}

/** Every bare specifier the plugin's own sources import, deduplicated. */
function collectSpecifiers() {
  const specifiers = new Set()
  const importRe = /(?:from\s*|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
      for (const match of source.matchAll(importRe)) {
        const specifier = match[1]
        if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier.startsWith('#')) continue
        specifiers.add(specifier)
      }
    }
  }
  return [...specifiers].sort()
}

/** The package part of a specifier: `@scope/name`, or the bare name. */
function packageOf(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

/** Read one directory's `package.json`, or null when absent or unparsable. */
function manifestOf(dir) {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/** Every directory directly under `family` that holds a `package.json`. */
function* packageDirs(repo, family) {
  const base = join(repo, family)
  if (!existsSync(base)) return
  for (const group of readdirSync(base)) {
    const groupDir = join(base, group)
    if (!statSync(groupDir).isDirectory()) continue
    if (existsSync(join(groupDir, 'package.json'))) yield groupDir
    for (const leaf of readdirSync(groupDir)) {
      const leafDir = join(groupDir, leaf)
      if (statSync(leafDir).isDirectory() && existsSync(join(leafDir, 'package.json'))) yield leafDir
    }
  }
}

/** Locate a workspace package by its manifest name, or null. */
function findPackageDir(name, repo) {
  const linked = join(repo, 'node_modules', ...name.split('/'))
  if (manifestOf(linked)?.name === name) return linked
  for (const family of WORKSPACE_ROOTS) {
    for (const dir of packageDirs(repo, family)) {
      if (manifestOf(dir)?.name === name) return dir
    }
  }
  return null
}

/** The declaration target named by one `exports` value, or null. */
function typesFromExport(value) {
  if (typeof value === 'string') return value.endsWith('.d.ts') ? value : null
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = typesFromExport(entry)
      if (found !== null) return found
    }
    return null
  }
  if (typeof value !== 'object' || value === null) return null
  for (const key of ['types', 'import', 'default', 'require']) {
    if (key in value) {
      const found = typesFromExport(value[key])
      if (found !== null) return found
    }
  }
  return null
}

/** The declaration file one specifier maps to, or null. */
function declarationFor(specifier, repo) {
  const name = packageOf(specifier)
  const subpath = specifier === name ? '.' : `.${specifier.slice(name.length)}`
  const dir = findPackageDir(name, repo)
  if (dir === null) return null
  const manifest = manifestOf(dir) ?? {}
  const entry = typeof manifest.exports === 'object' && manifest.exports !== null
    ? manifest.exports[subpath]
    : undefined
  if (entry !== undefined) {
    const target = typesFromExport(entry)
    if (target !== null && existsSync(join(dir, target))) return join(dir, target)
  }
  if (subpath === '.' && typeof manifest.types === 'string' && existsSync(join(dir, manifest.types))) {
    return join(dir, manifest.types)
  }
  const guessed = join(dir, 'lib', 'types', subpath === '.' ? 'index.d.ts' : `${subpath.slice(2)}.d.ts`)
  return existsSync(guessed) ? guessed : null
}

/** Locate `@types/<name>` in the checkout's hoisted tree or its pnpm store. */
function resolveTypePackage(typeName, repo) {
  const local = join(repo, 'node_modules', typeName, 'index.d.ts')
  if (existsSync(local)) return local
  const store = join(repo, 'node_modules', '.pnpm')
  if (!existsSync(store)) return null
  // pnpm encodes the scope separator: `@types/react-dom` -> `@types+react-dom@`.
  const encoded = typeName.replace('/', '+')
  for (const entry of readdirSync(store).filter(name => name.startsWith(`${encoded}@`)).sort()) {
    const candidate = join(store, entry, 'node_modules', ...typeName.split('/'), 'index.d.ts')
    if (existsSync(candidate)) return candidate
  }
  return null
}

const repo = findRepo()
const paths = {}

// One mapping per imported specifier, so `exports` subpaths are respected
// exactly; a package-root wildcard keeps later subpath additions working.
for (const specifier of collectSpecifiers()) {
  const name = packageOf(specifier)
  const typeName = TYPE_PEERS[name]
  let target
  if (typeName === undefined) {
    target = declarationFor(specifier, repo)
    if (target === null) fail(`cannot resolve ${specifier} inside ${repo}`)
  } else {
    // react ships no bundled declarations: map the main entry *and* every
    // subpath (`react/jsx-runtime`, `react-dom/client`) onto the @types peer.
    const types = resolveTypePackage(typeName, repo)
    if (types === null) fail(`cannot resolve ${typeName} inside ${repo}`)
    const typesDir = dirname(types)
    target = specifier === name ? types : join(typesDir, `${specifier.slice(name.length + 1)}.d.ts`)
    if (!existsSync(target)) target = types
  }
  paths[specifier] = [target]
  if (specifier === name) paths[`${name}/*`] = [`${dirname(target)}/*`]
}

const temporary = mkdtempSync(join(tmpdir(), 'dsh-whale-effort-'))
const generated = join(temporary, 'tsconfig.json')
const declarations = process.argv.includes('--declarations')
writeFileSync(generated, `${JSON.stringify({
  extends: join(root, 'tsconfig.json'),
  compilerOptions: {
    noEmit: !declarations,
    emitDeclarationOnly: declarations,
    declaration: declarations,
    declarationMap: false,
    outDir: join(temporary, 'types'),
    rootDir: declarations ? join(root, 'src') : root,
    composite: false,
    incremental: false,
    paths,
    typeRoots: [join(root, 'node_modules', '@types'), join(repo, 'node_modules', '@types')],
  },
  ...(declarations ? { include: [join(root, 'src', '**', '*.ts'), join(root, 'src', '**', '*.tsx')] } : {}),
}, null, 2)}\n`)

const override = (name, fallback) => {
  const value = process.env[name]
  return value === undefined || value === '' ? fallback : resolve(value)
}

if (process.argv.includes('--vitest')) {
  const binary = override('DSH_VITEST', join(repo, 'node_modules', '.bin', 'vitest'))
  if (!existsSync(binary)) fail(`cannot find vitest at ${binary}; set DSH_VITEST=/path/to/vitest`)
  const result = spawnSync(binary, ['run', ...process.argv.slice(2).filter(arg => arg !== '--vitest')], { cwd: root, stdio: 'inherit' })
  if (result.error !== undefined) fail(String(result.error))
  process.exit(result.status ?? 1)
}

const tsc = override('DSH_TSC', join(repo, 'node_modules', '.bin', 'tsc'))
if (!existsSync(tsc)) fail(`cannot find the TypeScript compiler at ${tsc}; set DSH_TSC=/path/to/tsc`)

const result = spawnSync(tsc, ['-p', generated, '--pretty', 'false'], { cwd: root, stdio: 'inherit' })
if (result.error !== undefined) fail(String(result.error))
if (declarations && result.status === 0) {
  mkdirSync(join(root, 'lib', 'types'), { recursive: true })
  cpSync(join(temporary, 'types'), join(root, 'lib', 'types'), { recursive: true })
}
process.exit(result.status ?? 1)
