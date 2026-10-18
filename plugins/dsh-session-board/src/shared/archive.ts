export interface ArchiveRow {
  session: string
  action: 'would-archive' | 'archived' | 'skipped' | 'empty' | 'failed'
  source: string
  page?: string
}

export interface ScopeEntry {
  session: string
  source: string
  parent: string | null
  role: 'main' | 'child'
  evidence: string
  snapshot: boolean
}
export interface ArchiveScope {
  entries: ScopeEntry[]
  missing: { session: string; parent: string }[]
}
export interface SynthesisResult {
  session: string
  page: string
  status: 'synthesized' | 'skipped' | 'failed' | 'sensitive'
  pages: string[]
  error?: string
}
export interface WikiWorkflowResult {
  synthesis: SynthesisResult[]
  index: 'updated' | 'not-needed' | 'failed'
}

export interface ArchiveSummary {
  archived: number
  skipped: number
  empty: number
  failed: number
  selected: number
  dry_run: boolean
  results: ArchiveRow[]
  nativeArchive?: { session: string; status: 'archived' | 'already-archived' | 'empty-archived' | 'active' | 'changed' | 'unavailable' | 'wiki-failed' | 'failed' }[]
  scope?: ArchiveScope
  workflow?: WikiWorkflowResult
}

export interface ArchivePreview {
  token: string
  expiresAt: number
  summary: ArchiveSummary
}

export const MAX_ARCHIVE_SELECTION = 50
/** Capability level the browser half requires from the running host half. */
export const WIKI_WORKFLOW_CAPABILITY = 1
export const WIKI_ARCHIVE_PATH = '/api/session-board/wiki-archive'

/** Do not trust a subprocess or HTTP response to satisfy a TypeScript cast. */
export function parseArchiveSummary(raw: unknown): ArchiveSummary {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Invalid archive summary')
  const v = raw as Record<string, unknown>
  // New Python contract has a separate would_archive count. Normalize its
  // read-only preview into the UI's planned-copy count; keep legacy summaries
  // accepted without weakening the per-row consistency check.
  const planned = v.dry_run === true && v.would_archive !== undefined ? v.would_archive : v.archived
  if (!Number.isSafeInteger(planned) || (planned as number) < 0) throw new Error('Invalid archive planned count')
  const counts = ['archived', 'skipped', 'empty', 'failed', 'selected'] as const
  for (const key of counts) {
    if (!Number.isSafeInteger(v[key]) || (v[key] as number) < 0) throw new Error('Invalid archive counts')
  }
  if (typeof v.dry_run !== 'boolean' || !Array.isArray(v.results)) throw new Error('Invalid archive rows')
  const actions = new Set(['would-archive', 'archived', 'skipped', 'empty', 'failed'])
  const results = v.results.map((row: unknown): ArchiveRow => {
    if (typeof row !== 'object' || row === null) throw new Error('Invalid archive row')
    const r = row as Record<string, unknown>
    if (typeof r.session !== 'string' || r.session === '' || typeof r.source !== 'string' || r.source === '' || typeof r.action !== 'string' || !actions.has(r.action)) throw new Error('Invalid archive row')
    if (r.page !== undefined && typeof r.page !== 'string') throw new Error('Invalid archive page')
    return { session: r.session, source: r.source, action: r.action as ArchiveRow['action'], ...(r.page === undefined ? {} : { page: r.page as string }) }
  })
  if (results.length !== v.selected || results.length > MAX_ARCHIVE_SELECTION) throw new Error('Inconsistent archive rows')
  const totals = results.reduce((n, row) => {
    const key = row.action === 'would-archive' || row.action === 'archived' ? 'archived' : row.action
    n[key]++
    return n
  }, { archived: 0, skipped: 0, empty: 0, failed: 0 })
  if (Object.entries(totals).some(([key, value]) => (key === 'archived' ? planned : v[key]) !== value)) throw new Error('Inconsistent archive counts')
  return { archived: planned as number, skipped: v.skipped as number, empty: v.empty as number, failed: v.failed as number, selected: v.selected as number, dry_run: v.dry_run, results, ...(v.scope === undefined ? {} : { scope: parseArchiveScope(v.scope) }), ...(v.workflow === undefined ? {} : { workflow: parseWikiWorkflow(v.workflow) }) }
}

function record(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Invalid workflow result')
  return raw as Record<string, unknown>
}
function safeRawPage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.startsWith('raw/sessions/') || !raw.endsWith('.md') || raw.includes('\\') || raw.split('/').some(part => part === '..' || part === '.')) throw new Error('Invalid raw page')
  return raw
}
export function parseArchiveScope(raw: unknown): ArchiveScope {
  const scope = record(raw)
  if (!Array.isArray(scope.entries) || scope.entries.length > MAX_ARCHIVE_SELECTION || !Array.isArray(scope.missing)) throw new Error('Invalid scope')
  const entries = scope.entries.map((item: unknown): ScopeEntry => {
    const row = record(item)
    if (typeof row.session !== 'string' || typeof row.source !== 'string' || (row.parent !== null && typeof row.parent !== 'string') || !['main', 'child'].includes(String(row.role)) || typeof row.evidence !== 'string' || typeof row.snapshot !== 'boolean') throw new Error('Invalid scope row')
    return { session: row.session, source: row.source, parent: row.parent as string | null, role: row.role as ScopeEntry['role'], evidence: row.evidence, snapshot: row.snapshot }
  })
  const missing = scope.missing.map((item: unknown) => {
    const row = record(item)
    if (typeof row.session !== 'string' || typeof row.parent !== 'string') throw new Error('Invalid missing child')
    return { session: row.session, parent: row.parent }
  })
  return { entries, missing }
}
export function parseWikiWorkflow(raw: unknown): WikiWorkflowResult {
  const value = record(raw)
  if (!Array.isArray(value.synthesis) || !['updated', 'not-needed', 'failed'].includes(String(value.index))) throw new Error('Invalid workflow')
  const synthesis = value.synthesis.map((item: unknown): SynthesisResult => {
    const row = record(item)
    if (typeof row.session !== 'string' || !['synthesized', 'skipped', 'failed', 'sensitive'].includes(String(row.status)) || !Array.isArray(row.pages) || row.pages.some(page => typeof page !== 'string' || !/^(?:projects|concepts|experience|patterns|issues|tools|entities|digests|comparisons|decisions)\/[a-z0-9-]+\.md$/.test(page)) || (row.error !== undefined && typeof row.error !== 'string')) throw new Error('Invalid synthesis row')
    return { session: row.session, page: safeRawPage(row.page), status: row.status as SynthesisResult['status'], pages: row.pages as string[], ...(row.error === undefined ? {} : { error: row.error as string }) }
  })
  return { synthesis, index: value.index as WikiWorkflowResult['index'] }
}
