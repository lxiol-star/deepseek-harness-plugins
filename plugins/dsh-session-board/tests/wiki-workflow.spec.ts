import { describe, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { pythonAvailable, wikiArchiveScript, wikiSynthesizeScript, wikiWriteIntegrationAvailable, zstdBinary, wikiIntegrationAvailable } from './wiki-test-environment.ts'

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

describe.skipIf(!wikiWriteIntegrationAvailable)('real wiki-synthesize.py write path (synthetic Wiki)', () => {
  it('parses model output with the real parser, writes the page, and records state', () => {
    const home = mkdtempSync(join(tmpdir(), 'board-real-write-'))
    const wiki = join(home, 'wiki'), scripts = join(wiki, 'scripts'), dsh = join(home, 'dev')
    mkdirSync(scripts, { recursive: true })
    mkdirSync(join(wiki, 'raw', 'sessions', 'host', 'dsh'), { recursive: true })
    mkdirSync(join(wiki, 'experience'), { recursive: true })
    writeFileSync(join(wiki, 'SCHEMA.md'), '# Synthetic Wiki schema')
    writeFileSync(join(wiki, 'raw/sessions/host/dsh/one.md'), 'Synthetic decision: use a fixed port for tests.')
    copyFileSync(wikiArchiveScript, join(scripts, 'wiki-archive.py'))
    copyFileSync(wikiSynthesizeScript, join(scripts, 'wiki-synthesize.py'))
    const run = (operation: string, value: string) => JSON.parse(execFileSync('/usr/bin/python3', [bridge, operation, '--wiki-root', wiki, '--dsh-home', dsh, '--value', value], { encoding: 'utf8', env: { ...process.env, HOME: home } }))
    const page = 'raw/sessions/host/dsh/one.md'
    const prepared = run('prompt', page)
    expect(prepared.prompt.system.length).toBeGreaterThan(100)
    expect(prepared.prompt.user).toContain(page)
    const output = '---\nfile: experience/synthetic-board-write.md\ntitle: Synthetic board write\ntype: experience\ntags: [synthetic]\nsources: [raw/sessions/host/dsh/one.md]\n---\n\n固定端口让测试可控。\n'
    expect(run('write', JSON.stringify({ page, output }))).toEqual({ status: 'synthesized', pages: ['experience/synthetic-board-write.md'] })
    expect(readFileSync(join(wiki, 'experience/synthetic-board-write.md'), 'utf8')).toContain('Synthetic board write')
    const state = JSON.parse(readFileSync(join(scripts, '.synthesize-state.json'), 'utf8')) as Record<string, { status?: string; sha256?: string }>
    expect(state[page]?.status).toBe('synthesized')
    expect(state[page]?.sha256).toHaveLength(64)
  })
})

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

/**
 * Synthetic `wiki-synthesize.py` implementing the exact helper contract the
 * bridge calls for `prompt`/`write`. Using a fixture instead of the user's
 * real script keeps these assertions about the bridge independent of a local
 * Wiki installation, and keeps every byte synthetic.
 */
const SYNTHETIC_SYNTHESIZE = String.raw`
import hashlib
import json
import os
from pathlib import Path

SYSTEM_PROMPT = 'SYNTHETIC SYSTEM INSTRUCTIONS'
LONG_CONTEXT_THRESHOLD = 10 ** 9
LOCK_PATH = os.path.join(os.path.expanduser('~'), '.synthetic-write.lock')

def sha256_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def today_str():
    return '2026-10-19'

def load_state(path):
    return json.loads(Path(path).read_text()) if Path(path).is_file() else {}

def save_state(path, state):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(state))

def is_final(entry):
    return isinstance(entry, dict) and entry.get('reason') not in ('api-error', 'parse-error')

def collect_sessions(root):
    base = Path(root) / 'raw' / 'sessions'
    return sorted(str(path.relative_to(root)).replace(os.sep, '/') for path in base.rglob('*.md'))

def collect_existing_slugs(root):
    return {'existing-page'}

def suggest_link_candidates(text, slugs):
    return ['existing-page']

def norm_slug(value):
    return str(value).strip().lower()

def truncate_session_text(text, limit=1000):
    return text[:limit]

def parse_pages(text):
    if text.strip() == 'SKIP':
        return 'SKIP'
    pages = []
    for chunk in text.split('\n@@\n'):
        head, _, body = chunk.partition('\n')
        pages.append(({'file': head.strip()}, body.strip()))
    return pages

def validate_file_field(value):
    if not isinstance(value, str):
        return None
    parts = value.split('/')
    if len(parts) != 2 or not parts[1].endswith('.md'):
        return None
    slug = parts[1][:-3]
    if not slug or any(char not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for char in slug):
        return None
    return (parts[0], slug)

def process_page(root, fm, body, session_rel, dry_run, valid_slugs=None):
    checked = validate_file_field(fm.get('file'))
    if checked is None:
        return False, 'invalid file'
    directory, slug = checked
    allowed = {'experience', 'projects', 'concepts', 'patterns', 'issues', 'tools', 'entities', 'digests', 'comparisons', 'decisions'}
    if directory not in allowed:
        return False, 'invalid directory'
    target = Path(root) / directory / (slug + '.md')
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('---\nsources: [' + session_rel + ']\n---\n\n' + body + '\n')
    return True, '已写入 ' + directory + '/' + slug + '.md'
`

const SYNTHETIC_ARCHIVE = String.raw`
def redact_credentials(text):
    if 'SECRET' in text:
        return text.replace('SECRET', '[redacted]')
    return text
`

describe.skipIf(!pythonAvailable)('Python workflow bridge write operation (synthetic Wiki)', () => {
  const page = 'raw/sessions/host/dsh/one.md'
  function fixture(rawText = 'Synthetic session body') {
    const home = mkdtempSync(join(tmpdir(), 'board-write-'))
    const wiki = join(home, 'wiki'), scripts = join(wiki, 'scripts'), dsh = join(home, 'dev')
    mkdirSync(scripts, { recursive: true })
    mkdirSync(join(wiki, 'raw', 'sessions', 'host', 'dsh'), { recursive: true })
    writeFileSync(join(wiki, 'SCHEMA.md'), '# Synthetic Wiki schema')
    writeFileSync(join(wiki, page), rawText)
    writeFileSync(join(scripts, 'wiki-archive.py'), SYNTHETIC_ARCHIVE)
    writeFileSync(join(scripts, 'wiki-synthesize.py'), SYNTHETIC_SYNTHESIZE)
    const run = (operation: string, value: string) => JSON.parse(execFileSync('/usr/bin/python3', [bridge, operation, '--wiki-root', wiki, '--dsh-home', dsh, '--value', value], { encoding: 'utf8', env: { ...process.env, HOME: home } }))
    const state = () => JSON.parse(readFileSync(join(scripts, '.synthesize-state.json'), 'utf8')) as Record<string, Record<string, unknown>>
    return { home, wiki, scripts, run, state }
  }
  const write = (pagePath: string, output: string) => JSON.stringify({ page: pagePath, output })

  it('prepares the prompt from the script prompt and page text without calling a model', () => {
    const f = fixture()
    const prepared = f.run('prompt', page)
    expect(prepared.page).toBe(page)
    expect(prepared.prompt.system).toBe('SYNTHETIC SYSTEM INSTRUCTIONS')
    expect(prepared.prompt.user).toContain(page)
    expect(prepared.prompt.user).toContain('Synthetic session body')
    expect(prepared.prompt.user).toContain('existing-page')
    expect(existsSync(join(f.scripts, '.synthesize-state.json'))).toBe(false)
  })

  it('records a SKIP conclusion without writing pages', () => {
    const f = fixture()
    expect(f.run('write', write(page, 'SKIP'))).toEqual({ status: 'skipped', pages: [] })
    const entry = f.state()[page]!
    expect(entry).toMatchObject({ status: 'skipped', reason: 'ai-no-value', date: '2026-10-19' })
    expect(typeof entry.sha256).toBe('string')
  })

  it('writes a valid page through process_page, returns it, and records state', () => {
    const f = fixture()
    const result = f.run('write', write(page, 'experience/example.md\nReal body'))
    expect(result).toEqual({ status: 'synthesized', pages: ['experience/example.md'] })
    const written = readFileSync(join(f.wiki, 'experience', 'example.md'), 'utf8')
    expect(written).toContain('sources: [raw/sessions/host/dsh/one.md]')
    expect(written).toContain('Real body')
    const entry = f.state()[page]!
    expect(entry).toMatchObject({ status: 'synthesized', reason: '建页 1 个' })
    expect(entry.sha256).toBe(createHash('sha256').update('Synthetic session body').digest('hex'))
  })

  it('rejects every invalid page and records a retryable parse-error', () => {
    const f = fixture()
    const result = f.run('write', write(page, 'raw/escape.md\nBody'))
    expect(result).toEqual({ status: 'failed', pages: [], error: 'PARSE_ERROR' })
    expect(f.state()[page]).toMatchObject({ status: 'skipped', reason: 'parse-error' })
    expect(existsSync(join(f.wiki, 'raw', 'escape.md'))).toBe(false)
  })

  it('does not rewrite a page whose content already has a final conclusion', () => {
    const f = fixture()
    expect(f.run('write', write(page, 'experience/example.md\nReal body')).status).toBe('synthesized')
    expect(f.run('write', write(page, 'experience/other.md\nAnother body'))).toEqual({ status: 'skipped', pages: ['experience/example.md'] })
    expect(existsSync(join(f.wiki, 'experience', 'other.md'))).toBe(false)
  })

  it('refuses unrecognizable credentials before any prompt leaves the bridge', () => {
    const f = fixture('Synthetic session with a SECRET token')
    expect(f.run('prompt', page)).toEqual({ status: 'sensitive', pages: [], error: 'SENSITIVE_CONTENT' })
  })

  it('rejects an invalid payload and a page outside raw/sessions', () => {
    const f = fixture()
    for (const value of ['not-json', JSON.stringify({ page, output: '   ' })]) {
      const run = spawnSync('/usr/bin/python3', [bridge, 'write', '--wiki-root', f.wiki, '--dsh-home', join(f.home, 'dev'), '--value', value], { encoding: 'utf8', env: { ...process.env, HOME: f.home } })
      expect(run.status).toBe(1)
      expect(JSON.parse(run.stdout)).toEqual({ error: 'INVALID_RESULT' })
    }
    const outside = spawnSync('/usr/bin/python3', [bridge, 'write', '--wiki-root', f.wiki, '--dsh-home', join(f.home, 'dev'), '--value', write('../outside.md', 'projects/x.md\nBody')], { encoding: 'utf8', env: { ...process.env, HOME: f.home } })
    expect(outside.status).toBe(1)
    expect(JSON.parse(outside.stdout)).toEqual({ error: 'INVALID_RESULT' })
  })
})
