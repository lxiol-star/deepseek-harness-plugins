import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const root = new URL('..', import.meta.url).pathname

test('bundle manifest, patch, locale, icon, and build output are present and valid', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.main, 'lib/index.js')
  assert.ok(pkg.files.includes('lib'))
  assert.ok(pkg.files.includes('cordis.patch.yml'))
  assert.ok(pkg.files.includes('locale/*.json'))
  assert.ok(pkg.files.includes('docs'))
  assert.ok(pkg.files.includes('icon.svg'))

  const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /id: kimi-tower/)
  assert.match(patch, /name: dsh-kimi-tower/)

  for (const locale of ['en', 'zh']) {
    const meta = JSON.parse(await readFile(join(root, `locale/${locale}.json`), 'utf8')).meta
    assert.equal(typeof meta.title, 'string')
    assert.ok(meta.title.length > 0)
    assert.equal(typeof meta.description, 'string')
    assert.ok(meta.description.length > 0)
    assert.equal(meta.detail, 'docs/DETAIL.md')
  }

  const icon = await readFile(join(root, 'icon.svg'), 'utf8')
  assert.match(icon, /^<svg[\s>]/)
  assert.ok((await stat(join(root, 'icon.svg'))).size < 256 * 1024)

  const lib = await import(join(root, 'lib/index.js'))
  assert.equal(typeof lib.apply, 'function')
  assert.ok(lib.inject.includes('subagents'))
  assert.ok(lib.inject.includes('tools'))
  assert.equal(typeof lib.TowerStore, 'function')
})
