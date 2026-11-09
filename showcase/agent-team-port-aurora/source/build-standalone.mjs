#!/usr/bin/env node
/* ============================================================================
 * build-standalone.mjs — inline the whole exhibit into one shareable HTML file.
 *
 *   node build-standalone.mjs
 *   → aurora-harbour-standalone.html  (double-click, fully offline)
 * ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('index.html');

// ---- inline stylesheet + fonts as data URIs ------------------------------
let css = read('style.css');
const fontRe = /url\(['"]?\.\/vendor\/fonts\/([^)'"]+)['"]?\)/g;
css = css.replace(fontRe, (m, file) => {
  const buf = fs.readFileSync(path.join(ROOT, 'vendor/fonts', file));
  return `url(data:font/woff2;base64,${buf.toString('base64')})`;
});
html = html.replace(
  /  <link rel="stylesheet" href="\.\/style\.css" \/>/,
  `  <style>\n${css}\n  </style>`
);

// ---- inline every local script, preserving order ------------------------
const scriptRe = /  <script src="\.\/([^"]+)"><\/script>/g;
html = html.replace(scriptRe, (m, file) => {
  let src = read(file).replace(/<\/script>/gi, '<\\/script>');
  return `  <script data-src="${file}">\n${src}\n  </script>`;
});

const out = path.join(ROOT, 'aurora-harbour-standalone.html');
fs.writeFileSync(out, html);
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`wrote ${path.basename(out)} (${kb} kB)`);
