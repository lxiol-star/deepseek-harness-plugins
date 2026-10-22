import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  DEFAULT_WIKI_CONFIG,
  WIKI_DEFAULT_TIMEOUT_SECONDS,
  parseWikiConfig,
  parseWikiConfigResponse,
  resolveWikiPaths,
  validateWikiConfig,
  wikiDefaults,
} from '../src/shared/wiki.ts'
import { buildWikiRuntime, mergeWikiConfig, probeWikiEnvironment, validateWikiWrite, wikiConfigResponse } from '../src/host/wiki-config.ts'
import { pythonAvailable } from './wiki-test-environment.ts'

const HOME = '/home/tester'

describe('wiki configuration contract', () => {
  it('derives every concrete default from the local wiki checkout', () => {
    expect(wikiDefaults(HOME)).toEqual({
      wikiRoot: `${HOME}/wiki`,
      schemaPath: `${HOME}/wiki/SCHEMA.md`,
      scriptsDir: `${HOME}/wiki/scripts`,
      stateFile: `${HOME}/wiki/scripts/.archive-state.json`,
      python: '/usr/bin/python3',
      provider: 'stepx-terra',
      synthConfig: `${HOME}/.wikibar/config.json`,
      timeoutSeconds: WIKI_DEFAULT_TIMEOUT_SECONDS,
    })
    expect(resolveWikiPaths(DEFAULT_WIKI_CONFIG, HOME)).toMatchObject({ wikiRoot: `${HOME}/wiki`, timeoutSeconds: 300 })
  })

  it('honours explicit paths and the local scripts mode', () => {
    const config = {
      ...DEFAULT_WIKI_CONFIG,
      wikiRoot: '/data/wiki',
      schemaPath: '/rules/SCHEMA.md',
      scriptsMode: 'local' as const,
      scriptsDir: '/data/scripts',
      python: '/opt/python3',
      stateFile: '/state/archive.json',
      timeoutSeconds: 42,
      provider: 'custom-provider',
    }
    expect(resolveWikiPaths(config, HOME)).toEqual({
      wikiRoot: '/data/wiki',
      schemaPath: '/rules/SCHEMA.md',
      scriptsDir: '/data/scripts',
      stateFile: '/state/archive.json',
      python: '/opt/python3',
      timeoutSeconds: 42,
      provider: 'custom-provider',
      synthConfig: `${HOME}/.wikibar/config.json`,
    })
    expect(resolveWikiPaths({ ...config, scriptsDir: '' }, HOME).scriptsDir).toBe('/data/wiki/scripts')
  })

  it('rejects relative paths and malformed values without throwing', () => {
    const rejected = validateWikiConfig({ wikiRoot: 'wiki', scriptsMode: 'nope', timeoutSeconds: -1, provider: 'a b' })
    expect(rejected.config).toBeNull()
    expect(rejected.errors).toEqual(['INVALID_WIKI_ROOT', 'INVALID_SCRIPTS_MODE', 'INVALID_TIMEOUT', 'INVALID_PROVIDER'])
    expect(validateWikiConfig({ wikiRoot: '/ok', timeoutSeconds: 0 }).config).toMatchObject({ wikiRoot: '/ok', timeoutSeconds: 0 })
    expect(validateWikiWrite({})).toEqual({ config: DEFAULT_WIKI_CONFIG, errors: [] })
    expect(parseWikiConfig({ wikiRoot: 'relative' })).toEqual(DEFAULT_WIKI_CONFIG)
  })

  it('lets a saved record win over deployment config', () => {
    const deployment = { ...DEFAULT_WIKI_CONFIG, wikiRoot: '/deploy/wiki' }
    const saved = { ...DEFAULT_WIKI_CONFIG, wikiRoot: '/saved/wiki', scriptsMode: 'local' as const }
    expect(mergeWikiConfig(deployment, null)).toEqual(deployment)
    expect(mergeWikiConfig(deployment, saved)).toEqual(saved)
  })

  it('resolves the packaged engine in bundled mode and the scripts directory in local mode', () => {
    const bundled = buildWikiRuntime({
      home: HOME,
      dshHome: '/home/tester/.dsh',
      pluginConfig: DEFAULT_WIKI_CONFIG,
      stored: null,
      engineDir: '/plugin/lib/wiki',
      bridgePath: '/plugin/lib/wiki-workflow.py',
    })
    expect(bundled.engineDir).toBe('/plugin/lib/wiki')
    expect(bundled.logPath).toBe(`${HOME}/.dsh-session-board/wiki.log`)
    const local = buildWikiRuntime({
      home: HOME,
      dshHome: '/home/tester/.dsh',
      pluginConfig: DEFAULT_WIKI_CONFIG,
      stored: { ...DEFAULT_WIKI_CONFIG, scriptsMode: 'local' },
      engineDir: '/plugin/lib/wiki',
      bridgePath: '/plugin/lib/wiki-workflow.py',
    })
    expect(local.engineDir).toBe(`${HOME}/wiki/scripts`)
  })

  it('parses the route response defensively', () => {
    const status = {
      ok: true,
      issues: [],
      python: '3.9.6',
      pythonExecutable: '/usr/bin/python3',
      engine: { dir: '/plugin/lib/wiki', scripts: [{ name: 'wiki-archive.py', path: '/plugin/lib/wiki/wiki-archive.py', exists: true, bytes: 10 }] },
      schema: { path: '/wiki/SCHEMA.md', bytes: 20 },
      wikiRoot: { path: '/wiki', exists: true },
      state: { path: '/wiki/scripts/.archive-state.json' },
      operations: ['scope'],
    }
    const parsed = parseWikiConfigResponse({ config: DEFAULT_WIKI_CONFIG, defaults: wikiDefaults(HOME), status })
    expect(parsed?.defaults.wikiRoot).toBe(`${HOME}/wiki`)
    expect(parsed?.status?.engine.scripts[0]?.name).toBe('wiki-archive.py')
    expect(wikiConfigResponse(DEFAULT_WIKI_CONFIG, HOME, null).config).toEqual(DEFAULT_WIKI_CONFIG)
    expect(parseWikiConfigResponse({ config: DEFAULT_WIKI_CONFIG })).toBeNull()
    expect(parseWikiConfigResponse('nope')).toBeNull()
  })
})

describe.skipIf(!pythonAvailable)('wiki environment probe', () => {
  it('reports the packaged engine and a readable SCHEMA as ready', async () => {
    const home = mkdtempSync(join(tmpdir(), 'board-wiki-config-'))
    mkdirSync(join(home, 'wiki'), { recursive: true })
    writeFileSync(join(home, 'wiki', 'SCHEMA.md'), '# Test schema')
    const runtime = buildWikiRuntime({
      home,
      dshHome: join(home, '.dsh'),
      pluginConfig: DEFAULT_WIKI_CONFIG,
      stored: null,
      engineDir: resolve('src/host/wiki'),
      bridgePath: resolve('src/host/wiki-workflow.py'),
      logPath: join(home, 'wiki.log'),
    })
    const report = await probeWikiEnvironment(runtime)
    expect(report.ok).toBe(true)
    expect(report.engine.scripts.map(script => script.name)).toEqual(['wiki-archive.py', 'wiki-synthesize.py', 'wiki-index.py'])
    expect(report.schema.bytes).toBeGreaterThan(0)
    expect(report.python).not.toBe('')
  })

  it('reports a missing schema and engine as issues instead of throwing', async () => {
    const home = mkdtempSync(join(tmpdir(), 'board-wiki-config-bad-'))
    mkdirSync(join(home, 'wiki'), { recursive: true })
    const runtime = buildWikiRuntime({
      home,
      dshHome: join(home, '.dsh'),
      pluginConfig: DEFAULT_WIKI_CONFIG,
      stored: null,
      engineDir: join(home, 'missing-engine'),
      bridgePath: resolve('src/host/wiki-workflow.py'),
      logPath: join(home, 'wiki.log'),
    })
    const report = await probeWikiEnvironment(runtime)
    expect(report.ok).toBe(false)
    expect(report.issues.length).toBeGreaterThan(0)
    expect(report.engine.dir).toContain('missing-engine')
  })
})
