import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pythonAvailable, zstdBinary } from './wiki-test-environment.ts'

const bridge = resolve('src/host/wiki-workflow.py')
const bundledEngine = resolve('src/host/wiki')
const zstdAvailable = spawnSync(zstdBinary, ['--version']).status === 0

/**
 * One synthetic DSH home with one main Session and one child Session.
 * @param home - temporary root.
 * @returns the DSH home the bridge scans.
 */
function syntheticHome(home: string): string {
  const dsh = join(home, 'dsh')
  for (const [id, parent] of [['main', null], ['child', 'main']] as const) {
    const directory = join(dsh, 'sessions', '--synthetic-project--', id)
    mkdirSync(directory, { recursive: true })
    const events = [{ type: 'session', id, ...(parent === null ? {} : { parentSession: parent }) }, { type: 'user/message', data: { content: [{ type: 'text', text: 'synthetic request' }] } }]
    const plain = join(home, `${id}.jsonl`)
    writeFileSync(plain, events.map(event => JSON.stringify(event)).join('\n'))
    execFileSync(zstdBinary, ['-q', '-f', plain, '-o', join(directory, 'session.v4.jsonl.zstd')])
  }
  return dsh
}

/**
 * Write one synthetic zstd transcript under a DSH home.
 * @param home - temporary root.
 * @param dsh - DSH home.
 * @param id - session id.
 * @param parent - parent session id, or null for a main session.
 */
function transcript(home: string, dsh: string, id: string, parent: string | null): void {
  const directory = join(dsh, 'sessions', '--synthetic-project--', id)
  mkdirSync(directory, { recursive: true })
  const events = [{ type: 'session', id, ...(parent === null ? {} : { parentSession: parent }) }]
  const plain = join(home, `${id}.jsonl`)
  writeFileSync(plain, events.map(event => JSON.stringify(event)).join('\n'))
  execFileSync(zstdBinary, ['-q', '-f', plain, '-o', join(directory, 'session.v4.jsonl.zstd')])
}

/**
 * Run the bridge with the same CLI shape the host uses.
 * @param home - temporary root.
 * @param dsh - DSH home.
 * @param operation - bridge operation.
 * @param value - `--value` payload.
 * @param extra - extra arguments.
 * @returns parsed JSON stdout.
 */
function run(home: string, dsh: string, operation: string, value: string, extra: readonly string[] = []): unknown {
  const output = execFileSync('/usr/bin/python3', [
    bridge, operation, '--wiki-root', join(home, 'wiki'), '--dsh-home', dsh,
    '--scripts-dir', bundledEngine, '--schema', join(home, 'wiki', 'SCHEMA.md'),
    '--python', '/usr/bin/python3', '--log', join(home, 'bridge.log'), '--value', value, ...extra,
  ], { encoding: 'utf8', env: { ...process.env, HOME: home } })
  return JSON.parse(output)
}

describe.skipIf(!pythonAvailable)('vendored wiki engine bridge', () => {
  it('reports the packaged engine without touching the Wiki', () => {
    const home = mkdtempSync(join(tmpdir(), 'board-bridge-status-'))
    mkdirSync(join(home, 'wiki'), { recursive: true })
    writeFileSync(join(home, 'wiki', 'SCHEMA.md'), '# Synthetic schema')
    const status = run(home, join(home, 'dsh'), 'status', '') as {
      ok: boolean
      engine: { dir: string; scripts: { name: string; exists: boolean; bytes: number }[] }
      schema: { bytes: number }
      python: string
    }
    expect(status.ok).toBe(true)
    expect(status.engine.dir).toBe(bundledEngine)
    expect(status.engine.scripts.map(script => script.name)).toEqual(['wiki-archive.py', 'wiki-synthesize.py', 'wiki-index.py'])
    expect(status.engine.scripts.every(script => script.exists && script.bytes > 0)).toBe(true)
    expect(status.schema.bytes).toBeGreaterThan(0)
    expect(status.python).not.toBe('')
  })

  it.skipIf(!zstdAvailable)('scopes sessions with the vendored engine and one transcript read', () => {
    const home = mkdtempSync(join(tmpdir(), 'board-bridge-scope-'))
    mkdirSync(join(home, 'wiki'), { recursive: true })
    writeFileSync(join(home, 'wiki', 'SCHEMA.md'), '# Synthetic schema')
    const dsh = syntheticHome(home)
    const scope = run(home, dsh, 'scope', '["main"]') as { entries: { session: string; parent: string | null }[]; missing: unknown[] }
    expect(scope.entries.map(entry => entry.session)).toEqual(['main', 'child'])
    expect(scope.entries[1]).toMatchObject({ parent: 'main' })
    expect(scope.missing).toEqual([])
    // stdout is exactly one JSON document: the log file carries diagnostics.
    const log = spawnSync('/bin/cat', [join(home, 'bridge.log')], { encoding: 'utf8' }).stdout
    expect(log).toContain('done')
  })

  it.skipIf(!zstdAvailable)('expands past the old 50 boundary up to the 200-session scope cap', () => {
    const home = mkdtempSync(join(tmpdir(), 'board-bridge-expand-'))
    mkdirSync(join(home, 'wiki'), { recursive: true })
    writeFileSync(join(home, 'wiki', 'SCHEMA.md'), '# Synthetic schema')
    const dsh = join(home, 'dsh')
    transcript(home, dsh, 'main', null)
    for (let index = 0; index < 60; index += 1) transcript(home, dsh, `child-${index}`, 'main')
    const scope = run(home, dsh, 'scope', '["main"]') as { entries: { session: string }[] }
    expect(scope.entries).toHaveLength(61)
  }, 60_000)

  it('creates the diagnostic log directory on demand', () => {
    const home = mkdtempSync(join(tmpdir(), 'board-bridge-log-'))
    mkdirSync(join(home, 'wiki'), { recursive: true })
    writeFileSync(join(home, 'wiki', 'SCHEMA.md'), '# Synthetic schema')
    const log = join(home, 'nested', 'deep', 'bridge.log')
    const status = run(home, join(home, 'dsh'), 'status', '', ['--log', log]) as { ok: boolean }
    expect(status.ok).toBe(true)
    expect(existsSync(log)).toBe(true)
  })

  it('reports ENGINE_UNAVAILABLE when the packaged engine directory is wrong', () => {
    const home = mkdtempSync(join(tmpdir(), 'board-bridge-missing-'))
    mkdirSync(join(home, 'wiki'), { recursive: true })
    writeFileSync(join(home, 'wiki', 'SCHEMA.md'), '# Synthetic schema')
    const missing = join(home, 'missing-engine')
    const out = spawnSync('/usr/bin/python3', [
      bridge, 'status', '--wiki-root', join(home, 'wiki'), '--dsh-home', join(home, 'dsh'),
      '--scripts-dir', missing, '--schema', join(home, 'wiki', 'SCHEMA.md'), '--log', join(home, 'bridge.log'),
    ], { encoding: 'utf8', env: { ...process.env, HOME: home } })
    const status = JSON.parse(out.stdout) as { ok: boolean; issues: string[] }
    expect(status.ok).toBe(false)
    expect(status.issues.join(' ')).toContain('missing engine script')

    const scope = spawnSync('/usr/bin/python3', [
      bridge, 'scope', '--wiki-root', join(home, 'wiki'), '--dsh-home', join(home, 'dsh'),
      '--scripts-dir', missing, '--schema', join(home, 'wiki', 'SCHEMA.md'), '--log', join(home, 'bridge.log'),
      '--value', '["id"]',
    ], { encoding: 'utf8', env: { ...process.env, HOME: home } })
    expect(scope.status).toBe(1)
    expect(JSON.parse(scope.stdout)).toMatchObject({ error: 'ENGINE_UNAVAILABLE' })
  })

  it('refuses every non-status operation without readable SCHEMA rules', () => {
    const home = mkdtempSync(join(tmpdir(), 'board-bridge-noschema-'))
    mkdirSync(join(home, 'wiki'), { recursive: true })
    const out = spawnSync('/usr/bin/python3', [
      bridge, 'scope', '--wiki-root', join(home, 'wiki'), '--dsh-home', join(home, 'dsh'),
      '--scripts-dir', bundledEngine, '--schema', join(home, 'wiki', 'SCHEMA.md'), '--log', join(home, 'bridge.log'),
      '--value', '["id"]',
    ], { encoding: 'utf8', env: { ...process.env, HOME: home } })
    expect(out.status).toBe(1)
    expect(JSON.parse(out.stdout)).toMatchObject({ error: 'SCHEMA_UNAVAILABLE' })
  })
})
