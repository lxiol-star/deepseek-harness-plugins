# Vendored Wiki engine

These three scripts are byte-for-byte copies of the local Wiki checkout's
engine, shipped with the plugin so the session board no longer depends on a
user-maintained `~/wiki/scripts` that can drift out of contract.

| file | upstream | vendored |
| --- | --- | --- |
| `wiki-archive.py` | `~/wiki/scripts/wiki-archive.py` | 2026-10-22 |
| `wiki-synthesize.py` | `~/wiki/scripts/wiki-synthesize.py` | 2026-10-22 |
| `wiki-index.py` | `~/wiki/scripts/wiki-index.py` | 2026-10-22 |

## Contracts kept at runtime

- Wiki data stays user-owned: pages, `SCHEMA.md`, state files and locks always
  resolve under the configured wiki root (or their explicit override), never
  inside the installed package.
- `wiki-archive.py` state defaults to `<wiki-root>/scripts/.archive-state.json`
  through `WIKI_ARCHIVE_STATE_FILE`; the board host always sets that variable.
- `wiki-synthesize.py` writes `<wiki-root>/scripts/.synthesize-state.json` and
  takes its lock under `<wiki-root>/.locks/`, both derived from `--wiki-root`.
- `wiki-index.py` reads/writes `<wiki-root>/scripts/.index-desc-state.json`.

## Refreshing the vendored copy

Copy the three files from the upstream checkout, rerun
`node scripts/build.mjs`, and run `node scripts/typecheck.mjs --vitest`
(the bridge integration test in `tests/wiki-bridge.spec.ts` exercises the
vendored engine through the same CLI the host uses).
