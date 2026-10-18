import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { wikiArchiveScript, zstdBinary, wikiIntegrationAvailable } from './wiki-test-environment.ts'
import { createWikiArchiver } from '../src/host/wiki-archive.ts'

/** Real Python-to-TS contract test, using only synthetic temporary transcripts. */
describe.skipIf(!wikiIntegrationAvailable)('Wiki Python/Node integration', () => {
  it('previews and copies mixed good/empty sessions with consistent results and incremental retry', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sb-wiki-integration-'))
    const wiki = join(root, 'wiki'), script = join(wiki, 'scripts', 'wiki-archive.py'), dshHome = join(root, '.dsh-dev')
    mkdirSync(dirname(script), { recursive: true }); writeFileSync(join(wiki, 'SCHEMA.md'), '# Test Wiki'); copyFileSync(wikiArchiveScript, script)
    const state = join(root, 'archive-state.json')
    const zstd = zstdBinary
    for (const id of ['good-session', 'empty-session']) {
      const directory = join(dshHome, 'sessions', '--tmp-project--', id)
      mkdirSync(directory, { recursive: true })
      const content = id === 'good-session' ? [{ type: 'session', id }, { type: 'user/message', data: { content: [{ type: 'text', text: 'Synthetic request' }] } }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Synthetic response' }] } } }] : [{ type: 'session', id }]
      const plain = join(root, `${id}.jsonl`); writeFileSync(plain, content.map(row => JSON.stringify(row)).join('\n'))
      execFileSync(zstd, ['-q', '-f', plain, '-o', join(directory, 'session.v4.jsonl.zstd')])
    }
    const service = createWikiArchiver({ home: root, dshHome, workflow: async (operation, value) => operation === 'scope' ? JSON.parse(execFileSync('/usr/bin/python3', ['src/host/wiki-workflow.py', 'scope', '--wiki-root', wiki, '--dsh-home', dshHome, '--value', value], { encoding: 'utf8' })) : { status: 'skipped', pages: [] }, execute: async (args) => {
      try {
        return { stdout: execFileSync('/usr/bin/python3', [script, ...args], { encoding: 'utf8', env: { ...process.env, HOME: root, WIKI_ARCHIVE_STATE_FILE: state, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, stdio: ['ignore', 'pipe', 'pipe'] }) }
      } catch (error) {
        return { stdout: (error as { stdout: string }).stdout }
      }
    } })
    const plan = await service.preview(['good-session', 'empty-session'])
    expect(plan.summary.archived).toBe(2)
    const result = await service.commit(plan.token)
    expect(result).toMatchObject({ archived: 1, empty: 1, failed: 0 })
    const retry = await service.preview(['good-session'])
    expect(retry.summary.skipped).toBe(1)
    expect(readdirSync(join(wiki, 'raw', 'sessions')).length).toBeGreaterThan(0)
    service.close()
  })
})
