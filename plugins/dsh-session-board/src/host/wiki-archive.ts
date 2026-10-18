import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parseArchiveScope, parseWikiWorkflow, parseArchiveSummary, MAX_ARCHIVE_SELECTION, type ArchiveScope, type SynthesisResult, type ArchivePreview, type ArchiveSummary } from '../shared/archive.ts'

const exec = promisify(execFile)
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const PREVIEW_TTL_MS = 5 * 60_000
export class WikiArchiveError extends Error {
  constructor(readonly code: string) { super(code) }
}
export interface WikiArchiver {
  preview(ids: readonly string[]): Promise<ArchivePreview>
  commit(token: string): Promise<ArchiveSummary>
  close(): void
}
export interface WikiArchiverOptions {
  home?: string
  dshHome?: string
  now?: () => number
  workflow?: (operation: 'scope' | 'synthesize' | 'index', value: string, signal: AbortSignal) => Promise<unknown>
  execute?: (args: readonly string[], signal: AbortSignal) => Promise<{ stdout: string }>
}

/** Explicit IDs only; never a selector fragment or a shell command. */
export function validateWikiIds(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ARCHIVE_SELECTION || raw.some(id => typeof id !== 'string' || !SAFE_ID.test(id) || id === '.' || id === '..')) {
    throw new WikiArchiveError('INVALID_SELECTION')
  }
  return [...new Set(raw as string[])]
}
function validateResult(raw: string, ids: readonly string[], dryRun: boolean): ArchiveSummary {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new WikiArchiveError('INVALID_RESULT') }
  if (typeof parsed === 'object' && parsed !== null && 'exit_code' in parsed && 'error' in parsed && !('status' in parsed)) {
    const code = (parsed as { exit_code: unknown }).exit_code
    throw new WikiArchiveError(code === 3 ? 'SELECTION_MISMATCH' : code === 4 ? 'BUSY' : code === 5 ? 'STATE_UNAVAILABLE' : 'ARCHIVE_UNAVAILABLE')
  }
  let summary: ArchiveSummary
  try { summary = parseArchiveSummary(parsed) } catch { throw new WikiArchiveError('INVALID_RESULT') }
  if (typeof parsed === 'object' && parsed !== null && 'status_error' in parsed && parsed.status_error) throw new WikiArchiveError('STATE_UNAVAILABLE')
  const returned = summary.results.map(row => row.session)
  if (summary.dry_run !== dryRun || returned.length !== ids.length || new Set(returned).size !== ids.length || ids.some(id => !returned.includes(id))) {
    throw new WikiArchiveError('SELECTION_MISMATCH')
  }
  for (const row of summary.results) {
    if (row.page !== undefined && (!row.page.startsWith('raw/sessions/') || row.page.split('/').includes('..') || row.page.includes('\\'))) throw new WikiArchiveError('INVALID_RESULT')
  }
  return summary
}

/** Preview is read-only. A short-lived, single-use token authorizes a fixed set. */
export function createWikiArchiver(options: WikiArchiverOptions = {}): WikiArchiver {
  const home = resolve(options.home ?? homedir())
  // Only this running host's transcripts; never enumerate production by default.
  const explicitHome = options.dshHome ?? process.env.DSH_HOME
  const dshHome = explicitHome === undefined ? null : resolve(explicitHome)
  const now = options.now ?? Date.now
  const script = join(home, 'wiki', 'scripts', 'wiki-archive.py')
  const execute = options.execute ?? (async (args, signal) => {
    try {
      return await exec('/usr/bin/python3', [script, ...args], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024, signal, env: { ...process.env, WIKI_ARCHIVE_LOCK_TIMEOUT: '10' } })
    } catch (error) {
      // Script may have committed a partial batch. Return a valid summary so
      // the UI can keep failed IDs rather than claiming an all-or-nothing write.
      const stdout = (error as { stdout?: unknown }).stdout
      if (typeof stdout === 'string' && stdout.trim().startsWith('{')) return { stdout }
      throw new WikiArchiveError(signal.aborted ? 'CANCELLED' : 'ARCHIVE_UNAVAILABLE')
    }
  })
  const workflow = options.workflow ?? (async (operation, value, signal) => {
    if (dshHome === null) throw new WikiArchiveError('ARCHIVE_UNAVAILABLE')
    try {
      const result = await exec('/usr/bin/python3', [fileURLToPath(new URL('./wiki-workflow.py', import.meta.url)), operation,
        '--wiki-root', join(home, 'wiki'), '--dsh-home', dshHome, '--value', value],
        { timeout: operation === 'synthesize' ? 1_850_000 : 120_000, maxBuffer: 4 * 1024 * 1024, signal })
      const parsed: unknown = JSON.parse(result.stdout)
      if (typeof parsed === 'object' && parsed !== null && 'error' in parsed && !('status' in parsed)) throw new WikiArchiveError(String(parsed.error))
      return parsed
    } catch (error) {
      if (error instanceof WikiArchiveError) throw error
      throw new WikiArchiveError(signal.aborted ? 'CANCELLED' : 'WORKFLOW_UNAVAILABLE')
    }
  })
  const previews = new Map<string, { ids: readonly string[]; expiresAt: number; sources: readonly string[]; scope: ArchiveScope }>()
  const controller = new AbortController()
  let busy = false
  let closed = false
  const perform = async (ids: readonly string[], dryRun: boolean): Promise<ArchiveSummary> => {
    if (dshHome === null) throw new WikiArchiveError('ARCHIVE_UNAVAILABLE')
    const args = ['--wiki-root', join(home, 'wiki'), '--tool', 'dsh', '--dsh-home', dshHome, '--json',
      ...ids.flatMap(id => ['--exact-session', id]), ...(dryRun ? ['--dry-run'] : ['--full'])]
    return validateResult((await execute(args, controller.signal)).stdout, ids, dryRun)
  }
  const exclusive = async <T>(work: () => Promise<T>): Promise<T> => {
    if (closed) throw new WikiArchiveError('CANCELLED')
    if (busy) throw new WikiArchiveError('BUSY')
    busy = true
    try { return await work() } finally { busy = false }
  }
  return {
    preview: async (raw) => exclusive(async () => {
      const requested = validateWikiIds(raw)
      const scope = parseArchiveScope(await workflow('scope', JSON.stringify(requested), controller.signal))
      const ids = validateWikiIds(scope.entries.map(entry => entry.session))
      if (requested.some(id => !ids.includes(id))) throw new WikiArchiveError('SELECTION_MISMATCH')
      for (const [key, value] of previews) if (value.expiresAt <= now()) previews.delete(key)
      // Dropped/cancelled previews must not permanently exhaust the map.
      if (previews.size >= 20) previews.delete(previews.keys().next().value as string)
      const summary: ArchiveSummary = { archived: 0, skipped: 0, empty: 0, failed: 0, selected: ids.length, dry_run: true, results: [], scope }
      for (const id of ids) {
        const part = await perform([id], true)
        summary.archived += part.archived; summary.skipped += part.skipped; summary.empty += part.empty; summary.failed += part.failed
        summary.results.push(...part.results)
      }
      if (closed) throw new WikiArchiveError('CANCELLED')
      const token = randomUUID(), expiresAt = now() + PREVIEW_TTL_MS
      previews.set(token, { ids, expiresAt, sources: summary.results.map(row => row.source), scope })
      return { token, expiresAt, summary }
    }),
    commit: async (token) => exclusive(async () => {
      const plan = previews.get(token)
      if (plan === undefined || plan.expiresAt <= now()) throw new WikiArchiveError('PREVIEW_EXPIRED')
      previews.delete(token)
      const currentScope = parseArchiveScope(await workflow('scope', JSON.stringify(plan.ids), controller.signal))
      if (JSON.stringify(currentScope.entries.map(({ snapshot: _snapshot, ...entry }) => entry)) !== JSON.stringify(plan.scope.entries.map(({ snapshot: _snapshot, ...entry }) => entry))) throw new WikiArchiveError('SELECTION_MISMATCH')
      const currentRows = []
      for (const id of plan.ids) currentRows.push(...(await perform([id], true)).results)
      if (currentRows.some((row, index) => row.source !== plan.sources[index])) throw new WikiArchiveError('SELECTION_MISMATCH')
      if (closed) throw new WikiArchiveError('CANCELLED')
      const summary: ArchiveSummary = { archived: 0, skipped: 0, empty: 0, failed: 0, selected: plan.ids.length, dry_run: false, results: [], scope: currentScope }
      const synthesis: SynthesisResult[] = []
      for (const id of plan.ids) {
        try {
          const part = await perform([id], false)
          summary.archived += part.archived; summary.skipped += part.skipped; summary.empty += part.empty; summary.failed += part.failed
          summary.results.push(...part.results)
        } catch {
          if (closed) throw new WikiArchiveError('CANCELLED')
          summary.failed++
          summary.results.push({ session: id, action: 'failed', source: plan.sources[plan.ids.indexOf(id)] ?? '' })
        }
      }
      for (const row of summary.results) {
        if (!row.page || !['archived', 'skipped'].includes(row.action)) continue
        try {
          const response = await workflow('synthesize', row.page, controller.signal)
          const parsed = parseWikiWorkflow({ synthesis: [{ ...(typeof response === 'object' && response !== null ? response : {}), session: row.session, page: row.page }], index: 'not-needed' })
          synthesis.push(...parsed.synthesis)
        } catch {
          if (closed) throw new WikiArchiveError('CANCELLED')
          synthesis.push({ session: row.session, page: row.page, status: 'failed', pages: [], error: 'SYNTHESIS_FAILED' })
        }
      }
      let index: 'updated' | 'not-needed' | 'failed' = 'not-needed'
      if (synthesis.some(row => row.pages.length > 0 || row.status === 'synthesized')) {
        try {
          const response = await workflow('index', '', controller.signal)
          index = typeof response === 'object' && response !== null && 'status' in response && response.status === 'updated' ? 'updated' : 'failed'
        } catch { index = 'failed' }
      }
      summary.workflow = { synthesis, index }
      return summary
    }),
    close: () => { closed = true; previews.clear(); controller.abort() },
  }
}
