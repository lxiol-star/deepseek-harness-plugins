/**
 * Build both halves.
 *
 *   src/index.ts   -> lib/index.js   (host: self-contained ESM with Node builtins external)
 *   src/client.js  -> lib/client.js  (browser: one file wrapped in the
 *                                     `window.__ModuleLoader__.load` envelope;
 *                                     see ./build-client.mjs)
 */
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

import { buildClient } from './build-client.mjs'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
  loader: { '.md': 'text' },
  logLevel: 'info',
})

await mkdir('lib', { recursive: true })
const client = await buildClient()
console.log(`  lib/client.js  built  ${client.bytes} bytes`)
