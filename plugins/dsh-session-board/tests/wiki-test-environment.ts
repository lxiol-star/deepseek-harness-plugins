import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const wikiArchiveScript = process.env.WIKI_ARCHIVE_SCRIPT ?? join(homedir(), 'wiki/scripts/wiki-archive.py')
export const wikiSynthesizeScript = process.env.WIKI_SYNTHESIZE_SCRIPT ?? join(homedir(), 'wiki/scripts/wiki-synthesize.py')
export const zstdBinary = process.env.ZSTD_BIN ?? 'zstd'
/** The interpreter every Python fixture needs; synthetic fixtures need nothing else. */
export const pythonAvailable = spawnSync('/usr/bin/python3', ['--version']).status === 0
/** Integration fixtures only run when their explicitly external dependencies exist. */
export const wikiIntegrationAvailable = existsSync(wikiArchiveScript)
  && pythonAvailable
  && spawnSync(zstdBinary, ['--version']).status === 0
/** Real-script write-path fixture: additionally needs the synthesizer script. */
export const wikiWriteIntegrationAvailable = wikiIntegrationAvailable && existsSync(wikiSynthesizeScript)
