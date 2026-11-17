import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import test from 'node:test'

const exec = promisify(execFile)
const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('skill installer supplies CLI copies, expands paths and backs up existing skills', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-notion-skills-test-'))
  try {
    const target = join(temporary, 'skills')
    await mkdir(join(target, 'notion-current-session'), { recursive: true })
    await writeFile(join(target, 'notion-current-session', 'old.txt'), 'keep me')
    const first = await exec('python3', [join(root, 'scripts', 'install_skills.py'), '--target', target])
    const output = JSON.parse(first.stdout)
    assert.equal(output.installed.length, 3)
    const names = await readdir(target)
    const backup = names.find(name => name.startsWith('notion-current-session.backup-'))
    assert.ok(backup)
    assert.equal(await readFile(join(target, backup, 'old.txt'), 'utf8'), 'keep me')
    for (const name of ['notion-current-session', 'notion-session-archive', 'notion-session-resume']) {
      const content = await readFile(join(target, name, 'SKILL.md'), 'utf8')
      assert.ok(!content.includes('{{PLUGIN_DIR}}'))
      assert.ok(!content.includes('__SKILL_DIR__'))
      assert.ok(content.includes(join(target, name, 'scripts', 'notion_session.py')))
      await readFile(join(target, name, 'scripts', 'notion_session.py'), 'utf8')
    }
    const second = await exec('python3', [join(root, 'scripts', 'install_skills.py'), '--target', target])
    assert.equal(JSON.parse(second.stdout).installed.length, 3)
  } finally { await rm(temporary, { recursive: true, force: true }) }
})
