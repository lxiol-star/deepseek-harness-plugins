import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const wikiArchiveScript = process.env.WIKI_ARCHIVE_SCRIPT ?? join(homedir(), 'wiki/scripts/wiki-archive.py')
export const zstdBinary = process.env.ZSTD_BIN ?? 'zstd'
/** Integration fixtures only run when their explicitly external dependencies exist. */
export const wikiIntegrationAvailable = existsSync(wikiArchiveScript)
  && spawnSync('/usr/bin/python3', ['--version']).status === 0
  && spawnSync(zstdBinary, ['--version']).status === 0
