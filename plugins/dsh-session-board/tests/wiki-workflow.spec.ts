import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { wikiArchiveScript, zstdBinary, wikiIntegrationAvailable } from './wiki-test-environment.ts'

const bridge = resolve('src/host/wiki-workflow.py')
function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'board-workflow-'))
  const wiki = join(home, 'wiki'), scripts = join(wiki, 'scripts'), dsh = join(home, 'dev')
  mkdirSync(scripts, { recursive: true }); mkdirSync(dsh)
  writeFileSync(join(wiki, 'SCHEMA.md'), '# Synthetic Wiki schema')
  copyFileSync(wikiArchiveScript, join(scripts, 'wiki-archive.py'))
  const run = (operation: string, value: string) => JSON.parse(execFileSync('/usr/bin/python3', [bridge, operation, '--wiki-root', wiki, '--dsh-home', dsh, '--value', value], { encoding: 'utf8', env: { ...process.env, HOME: home } }))
  return { home, wiki, scripts, dsh, run }
}

describe.skipIf(!wikiIntegrationAvailable)('real Python workflow bridge with synthetic inputs only', () => {
  it('includes verified children and grandchildren, excludes unrelated sessions and reports missing children', () => {
    const f = fixture()
    for (const [id, parent] of [['main', null], ['child', 'main'], ['grandchild', 'child'], ['unrelated', null]]) {
      const dir = join(f.dsh, 'sessions', 'project', id!)
      mkdirSync(dir, { recursive: true })
      const events = [{ type: 'session', id, ...(parent ? { parentSession: parent } : {}) }, ...(id === 'main' ? [{ type: 'subagent/catalog', data: { childId: 'missing' } }] : []), ...(id === 'child' ? [{ type: 'turn/start', seq: 2 }] : [])]
      const plain = join(f.home, `${id}.jsonl`)
      writeFileSync(plain, events.map(row => JSON.stringify(row)).join('\n'))
      execFileSync(zstdBinary, ['-q', '-f', plain, '-o', join(dir, 'session.v4.jsonl.zstd')])
    }
    const result = f.run('scope', '["main"]')
    expect(result.entries.map((entry: { session: string }) => entry.session)).toEqual(['main', 'child', 'grandchild'])
    expect(result.entries[1]).toMatchObject({ parent: 'main', role: 'child', snapshot: true })
    expect(result.missing).toEqual([{ session: 'missing', parent: 'main' }])
  })
  it('blocks recognizable credentials before launching any synthesis process', () => {
    const f = fixture(), page = 'raw/sessions/host/dsh/one.md'
    mkdirSync(join(f.wiki, 'raw/sessions/host/dsh'), { recursive: true })
    writeFileSync(join(f.wiki, page), 'api_key: sk-syntheticSecretForSafetyTesting123456789')
    writeFileSync(join(f.scripts, 'wiki-synthesize.py'), "def collect_sessions(root):\n    return ['raw/sessions/host/dsh/one.md']\nraise_if_started = False\nif __name__ == '__main__':\n    raise RuntimeError('must never start')\n")
    expect(f.run('synthesize', page)).toMatchObject({ status: 'sensitive', error: 'SENSITIVE_CONTENT' })
  })
  it('retries one API error, uses exact page/provider arguments and returns knowledge pages', () => {
    const f = fixture(), page = 'raw/sessions/host/dsh/one.md'
    mkdirSync(join(f.wiki, 'raw/sessions/host/dsh'), { recursive: true })
    writeFileSync(join(f.wiki, page), 'Synthetic decision and verified result')
    writeFileSync(join(f.scripts, 'wiki-synthesize.py'), `import argparse, json, hashlib\nfrom pathlib import Path\ndef collect_sessions(root):\n    return ['${page}']\nif __name__ == '__main__':\n    p=argparse.ArgumentParser()\n    p.add_argument('--wiki-root'); p.add_argument('--provider'); p.add_argument('--session'); p.add_argument('--limit')\n    a=p.parse_args(); root=Path(a.wiki_root)\n    assert a.provider=='stepx-terra' and a.session=='${page}' and a.limit=='1'\n    marker=root/'calls'; n=int(marker.read_text())+1 if marker.exists() else 1; marker.write_text(str(n))\n    text=(root/a.session).read_text()\n    state={a.session:{'sha256':hashlib.sha256(text.encode()).hexdigest(),'status':'skipped' if n==1 else 'synthesized','reason':'api-error' if n==1 else '建页 1 个'}}\n    (root/'scripts/.synthesize-state.json').write_text(json.dumps(state))\n    if n==2:\n        (root/'experience').mkdir(); (root/'experience/example.md').write_text('---\\nsources: [${page}]\\n---\\n# Example')\n        print('已写入 experience/example.md')\n`)
    expect(f.run('synthesize', page)).toEqual({ status: 'synthesized', pages: ['experience/example.md'] })
    expect(readFileSync(join(f.wiki, 'calls'), 'utf8')).toBe('2')
  })
})
