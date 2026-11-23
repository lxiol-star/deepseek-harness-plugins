import { copyFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

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
await copyFile('src/client.js', 'lib/client.js')
console.log('  lib/client.js  copied')
