import { describe, expect, it } from 'vitest'
import {
  MAX_ARCHIVE_SELECTION,
  WIKI_ARCHIVE_PATH,
  parseArchiveSummary,
  type ArchiveRow,
  type ArchiveSummary,
} from '../src/shared/archive.ts'

/**
 * The four per-row outcomes, plus `would-archive` — the action a dry run
 * reports, which the wire format counts as `archived` internally.
 */
const ACTIONS = ['would-archive', 'archived', 'skipped', 'empty', 'failed'] as const

/** One durable row, as the archiver script writes it. */
function row(session: string, action: ArchiveRow['action'], source = 'dsh', page?: string): ArchiveRow {
  return page === undefined ? { session, action, source } : { session, action, source, page }
}

/** The exact object the parser must accept for one row. */
function wireRow(row: ArchiveRow): Record<string, unknown> {
  return row.page === undefined
    ? { session: row.session, action: row.action, source: row.source }
    : { session: row.session, action: row.action, source: row.source, page: row.page }
}

/**
 * A wire payload whose counts agree with its rows, exactly as the host route
 * serializes a preview or commit result.
 */
function summary(results: readonly ArchiveRow[], dryRun = false): Record<string, unknown> {
  const totals = { archived: 0, skipped: 0, empty: 0, failed: 0 }
  for (const entry of results) {
    const key = entry.action === 'would-archive' || entry.action === 'archived' ? 'archived' : entry.action
    totals[key] += 1
  }
  return {
    ...totals,
    selected: results.length,
    dry_run: dryRun,
    results: results.map(wireRow),
  }
}

/** `count` rows with unique session ids, all archived. */
function bulk(count: number): ArchiveRow[] {
  return Array.from({ length: count }, (_, index) => row(`session-${index}`, 'archived'))
}

/** Apply one mutation and expect the parser to reject the payload. */
function expectRejected(mutate: (payload: Record<string, unknown>) => void): void {
  const payload = summary([row('s1', 'archived'), row('s2', 'skipped')])
  mutate(payload)
  expect(() => parseArchiveSummary(payload)).toThrow()
}

describe('parseArchiveSummary', () => {
  it('accepts a well-formed preview and preserves it', () => {
    const payload = summary([row('s1', 'would-archive', 'dsh', 'raw/sessions/s1.md')], true)
    const parsed: ArchiveSummary = parseArchiveSummary(payload)
    expect(parsed).toEqual({
      archived: 1,
      skipped: 0,
      empty: 0,
      failed: 0,
      selected: 1,
      dry_run: true,
      results: [{ session: 's1', action: 'would-archive', source: 'dsh', page: 'raw/sessions/s1.md' }],
    })
  })

  it('preserves row order and the optional page field', () => {
    const parsed = parseArchiveSummary(summary([
      row('later', 'empty', 'kimi'),
      row('earlier', 'archived', 'dsh', 'raw/sessions/earlier.md'),
    ]))
    expect(parsed.results.map(entry => entry.session)).toEqual(['later', 'earlier'])
    expect(parsed.results[0]?.page).toBeUndefined()
    expect(parsed.results[1]?.page).toBe('raw/sessions/earlier.md')
  })

  it('does not echo the wire object', () => {
    const payload = summary([row('s1', 'archived')])
    const parsed = parseArchiveSummary(payload)
    expect(parsed).not.toBe(payload)
    expect(parsed.results).not.toBe(payload.results)
  })

  it('counts `would-archive` as archived, like the wire format', () => {
    const parsed = parseArchiveSummary(summary([
      row('s1', 'would-archive'),
      row('s2', 'would-archive'),
      row('s3', 'skipped'),
      row('s4', 'empty'),
      row('s5', 'failed'),
    ], true))
    expect(parsed.archived).toBe(2)
    expect(parsed.skipped).toBe(1)
    expect(parsed.empty).toBe(1)
    expect(parsed.failed).toBe(1)
    expect(parsed.selected).toBe(5)
  })

  it('rejects a payload that is not a plain object', () => {
    for (const bogus of [null, undefined, 'summary', 42, true, [], [summary([row('s1', 'archived')])]]) {
      expect(() => parseArchiveSummary(bogus)).toThrow('Invalid archive summary')
    }
  })

  it('rejects a count that is negative, non-integer, or missing', () => {
    for (const key of ['archived', 'skipped', 'empty', 'failed', 'selected'] as const) {
      expectRejected(payload => { payload[key] = -1 })
      expectRejected(payload => { payload[key] = 1.5 })
      expectRejected(payload => { payload[key] = '1' })
      expectRejected(payload => { delete payload[key] })
    }
  })

  it('rejects a missing or non-boolean dry_run flag', () => {
    expectRejected(payload => { payload.dry_run = 'true' })
    expectRejected(payload => { payload.dry_run = undefined })
    expectRejected(payload => { delete payload.dry_run })
  })

  it('rejects rows that are not objects', () => {
    for (const bogus of ['s1', 42, null, []]) {
      expectRejected(payload => { payload.results = [bogus] })
    }
  })

  it('rejects a row with a missing session or source', () => {
    expectRejected(payload => { payload.results = [{ action: 'archived', source: 'dsh' }] })
    expectRejected(payload => { payload.results = [{ session: 's1', action: 'archived' }] })
    expectRejected(payload => { payload.results = [{ session: 7, action: 'archived', source: 'dsh' }] })
  })

  it('rejects an unknown action', () => {
    expectRejected(payload => { payload.results = [{ session: 's1', action: 'deleted', source: 'dsh' }] })
    expectRejected(payload => { payload.results = [{ session: 's1', action: null, source: 'dsh' }] })
    for (const action of ACTIONS) {
      expect(() => parseArchiveSummary(summary([row('s1', action)]))).not.toThrow()
    }
  })

  it('rejects a non-string page when the field is present', () => {
    expectRejected(payload => {
      payload.results = [{ session: 's1', action: 'archived', source: 'dsh', page: 7 }]
    })
  })

  it('rejects a row count that disagrees with selected', () => {
    expectRejected(payload => { payload.selected = 3 })
    expectRejected(payload => { payload.selected = 1 })
  })

  it('rejects per-action totals that disagree with the rows', () => {
    expectRejected(payload => { payload.archived = 2 })
    expectRejected(payload => { payload.skipped = 0 })
    expectRejected(payload => { payload.failed = 1 })
  })

  it('bounds one batch at MAX_ARCHIVE_SELECTION rows', () => {
    expect(parseArchiveSummary(summary(bulk(MAX_ARCHIVE_SELECTION))).selected).toBe(MAX_ARCHIVE_SELECTION)
    const over = summary(bulk(MAX_ARCHIVE_SELECTION + 1))
    expect(() => parseArchiveSummary(over)).toThrow('Inconsistent archive rows')
    expect(MAX_ARCHIVE_SELECTION).toBe(50)
  })

  it('keeps the wire path the client posts to', () => {
    expect(WIKI_ARCHIVE_PATH).toBe('/api/session-board/wiki-archive')
    expect(WIKI_ARCHIVE_PATH.startsWith('/api/')).toBe(true)
  })
})
