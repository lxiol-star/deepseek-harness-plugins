/**
 * Durable declarations of the board's two fact stores, plus the one text rule
 * that belongs to the storage boundary.
 *
 * ## Why this file declares its own spec vocabulary
 *
 * A plugin installed into a profile is loaded from its own directory, and Node
 * resolves its bare imports from there. The `@deepseek-ai/*` packages are not
 * installed into the profile — that is deliberate, since a second copy would be
 * a version-skew hazard — so a runtime
 * `import { defineDomain } from '@deepseek-ai/dsh-storage-domain'` fails to
 * resolve and the whole plugin never loads. That failure is not hypothetical:
 * it is exactly what the first install of this plugin hit.
 *
 * The storage-domain contract is small and stable enough to satisfy directly.
 * `open()` reads `name`, `version`, `layout`, `compatibleVersions`,
 * `invalidRecords` and `tables`, and the only thing it ever asks of a table is
 * `valueSchema.parse(record)`. So a domain spec is a plain object and a
 * "schema" is anything with a `parse` method. Declaring them here keeps the
 * host half free of runtime imports, which is what makes a `link:` install
 * work at all.
 *
 * The peer range on `@deepseek-ai/dsh-storage-domain` in `package.json` is a
 * *contract* gate — it records which host shape this package is written
 * against — not a runtime import.
 *
 * ## Versioning
 *
 * `dsh-storage-domain` has no migration: a stored `version` that does not match
 * the descriptor makes `open()` reject. Both domains therefore start at
 * `version: 1`, and any later shape change must arrive as a new domain rather
 * than a bump on these.
 */

/** The host's domain/table name rule; a mismatch would reject the spec host-side. */
const UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/

/**
 * The slice of a schema object the storage layer actually uses.
 *
 * `parse` receives a raw stored record and returns the value callers see;
 * throwing is what marks a record invalid. The implementations below normalize
 * instead of throwing, because these records are derived facts: a corrupt
 * record costs one card's badge, never the domain's availability.
 */
export interface RecordSchema<T> {
  parse(value: unknown): T
}

/** One table declaration, matching `DomainTableSpec` structurally. */
export interface DomainTableSpec<V> {
  readonly valueSchema: RecordSchema<V>
}

/** One domain declaration, matching `DomainSpec` structurally. */
export interface DomainSpec {
  readonly name: string
  readonly version: number
  readonly invalidRecords: 'backup-and-skip'
  readonly tables: Record<string, DomainTableSpec<unknown>>
}

/** Declare one table. */
export function domainTable<V>(schema: RecordSchema<V>): DomainTableSpec<V> {
  return { valueSchema: schema }
}

/**
 * Validate a domain declaration at module load, mirroring the checks the host's
 * own `defineDomain` performs, so a misconfiguration fails loudly here rather
 * than as an `invalid-record` or `version-mismatch` later at `open()`.
 * @param spec - the declaration.
 * @returns the same declaration.
 */
export function defineDomain<S extends DomainSpec>(spec: S): S {
  if (!UNIT_NAME_RE.test(spec.name)) {
    throw new Error(`domain name '${spec.name}' must match ${UNIT_NAME_RE}`)
  }
  if (!Number.isInteger(spec.version) || spec.version < 0) {
    throw new Error(`domain '${spec.name}' version must be a non-negative integer`)
  }
  const tables = Object.keys(spec.tables)
  if (tables.length === 0) throw new Error(`domain '${spec.name}' declares no tables`)
  for (const table of tables) {
    if (!UNIT_NAME_RE.test(table)) {
      throw new Error(`domain '${spec.name}' table '${table}' must match ${UNIT_NAME_RE}`)
    }
  }
  return spec
}

/** Domain holding per-session turn-end facts and the acknowledged cursor. */
export const ACK_DOMAIN_NAME = 'dsh_session_board'
/** Domain holding per-session busy accounting. */
export const TURN_DOMAIN_NAME = 'dsh_session_board_turns'
/** Domain holding board-wide preferences (independent from the session fact stores). */
export const PREFS_DOMAIN_NAME = 'dsh_session_board_prefs'
/** Table of {@link ACK_DOMAIN_NAME}: session id → turn-end facts + ack cursor. */
export const ACK_TABLE_NAME = 'acks'
/** Table of {@link TURN_DOMAIN_NAME}: session id → busy accounting. */
export const TURN_TABLE_NAME = 'turn_stats'
/** Table of {@link PREFS_DOMAIN_NAME}: preference key → stored value. */
export const PREFS_TABLE_NAME = 'prefs'

/**
 * Truncation budget for a stored error note, counted in Unicode code points.
 * A provider error can be thousands of characters of stack-adjacent prose; the
 * card shows one line, and the durable record must stay proportional to that.
 */
export const ERROR_NOTE_MAX = 160

/** Appended to a truncated note; intentionally NOT counted against the budget. */
const ELLIPSIS = '…'

/**
 * Collapse one error message into a single-line note of at most `max` code
 * points, appending `…` when anything was dropped.
 *
 * Whitespace runs collapse because the note renders on one card line, and the
 * cut walks code points (not UTF-16 units) so it can never split a surrogate
 * pair — which is also why the ellipsis is appended outside the budget.
 * @param text - Raw error text as it appeared on the event.
 * @param max - Code-point budget; defaults to {@link ERROR_NOTE_MAX}.
 * @returns The collapsed, bounded note.
 */
export function truncateErrorNote(text: string, max: number = ERROR_NOTE_MAX): string {
  const collapsed = text.replace(/\s+/gu, ' ').trim()
  let note = ''
  let points = 0
  for (const point of collapsed) {
    if (points >= max) return `${note}${ELLIPSIS}`
    note += point
    points += 1
  }
  return note
}

/** A finite number, or null for anything else (absent, wrong type, NaN). */
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A non-empty string, or null for anything else. */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * A non-empty array of non-empty strings, or null.
 *
 * Only strings are kept: the array is an externally keyed fact set, and a
 * non-string element is a corrupt record rather than a reason to reject the
 * whole row. An empty result collapses to null, the same "no open set" the
 * field reads as when it is absent entirely.
 * @param value - raw stored field.
 * @returns the sanitized key list, or null.
 */
function stringArrayOrNull(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const keys: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string' && entry !== '') keys.push(entry)
  }
  return keys.length > 0 ? keys : null
}

/** Read one field off a raw record, tolerating a non-object. */
function fieldOf(raw: unknown, key: string): unknown {
  if (typeof raw !== 'object' || raw === null) return undefined
  return (raw as Record<string, unknown>)[key]
}

/**
 * Stored turn-end record shape.
 *
 * Every field is written on every write and read back through `?? null`, so the
 * shape handed to the client is always complete. Structurally compatible with
 * the shared `BoardAckRecord` (whose fields are optional on the wire).
 */
export interface StoredAckRecord {
  lastTurnEnd: number | null
  lastTurnEndKind: string | null
  lastTurnEndError: string | null
  ackedAt: number | null
}

/**
 * Stored busy-accounting shape; see the shared `BoardTurnStats` for semantics.
 *
 * `openWaitKeys` and `lastEventAt` were added after the first release. A record
 * written before they existed parses with both as null, and the ledger treats
 * that as "no known open set" / "no known activity bound" rather than as an
 * error, so the domain never needs a version bump for the extension.
 */
export interface StoredTurnRecord {
  busyMs: number | null
  openTurnStart: number | null
  waitedMs: number | null
  openWaitStart: number | null
  openWaitKind: string | null
  openWaitId: string | null
  openWaitKeys: string[] | null
  lastEventAt: number | null
}

/**
 * Stored synthesis preference.
 *
 * Both fields are either a route part or null together; a half-filled or
 * malformed record normalizes to the null/null fallback instead of failing the
 * domain open. This is a preference, not a durable fact: losing it costs one
 * re-selection, never a card.
 */
export interface StoredSynthesisPrefRecord {
  model: string | null
  provider: string | null
  /** Saved reasoning effort of the route; absent in 0.3.2 records parses as null. */
  reasoningEffort: string | null
}

/** Ack record validator; see {@link RecordSchema} for the normalize-not-throw policy. */
const ackRecordSchema: RecordSchema<StoredAckRecord> = {
  parse(raw: unknown): StoredAckRecord {
    return {
      lastTurnEnd: numberOrNull(fieldOf(raw, 'lastTurnEnd')),
      lastTurnEndKind: stringOrNull(fieldOf(raw, 'lastTurnEndKind')),
      lastTurnEndError: stringOrNull(fieldOf(raw, 'lastTurnEndError')),
      ackedAt: numberOrNull(fieldOf(raw, 'ackedAt')),
    }
  },
}

/** Busy-accounting validator; see {@link RecordSchema}. */
const turnRecordSchema: RecordSchema<StoredTurnRecord> = {
  parse(raw: unknown): StoredTurnRecord {
    return {
      busyMs: numberOrNull(fieldOf(raw, 'busyMs')),
      openTurnStart: numberOrNull(fieldOf(raw, 'openTurnStart')),
      waitedMs: numberOrNull(fieldOf(raw, 'waitedMs')),
      openWaitStart: numberOrNull(fieldOf(raw, 'openWaitStart')),
      openWaitKind: stringOrNull(fieldOf(raw, 'openWaitKind')),
      openWaitId: stringOrNull(fieldOf(raw, 'openWaitId')),
      openWaitKeys: stringArrayOrNull(fieldOf(raw, 'openWaitKeys')),
      lastEventAt: numberOrNull(fieldOf(raw, 'lastEventAt')),
    }
  },
}

/**
 * Preference validator; see {@link RecordSchema}. A value that is not exactly
 * two non-empty strings is stored as the null/null fallback.
 */
const prefsRecordSchema: RecordSchema<StoredSynthesisPrefRecord> = {
  parse(raw: unknown): StoredSynthesisPrefRecord {
    const model = stringOrNull(fieldOf(raw, 'model'))
    const provider = stringOrNull(fieldOf(raw, 'provider'))
    const reasoningEffort = stringOrNull(fieldOf(raw, 'reasoningEffort'))
    if (model === null || provider === null) return { model: null, provider: null, reasoningEffort: null }
    return { model, provider, reasoningEffort }
  },
}

/**
 * Authoritative facts: small, written on every turn boundary.
 *
 * `backup-and-skip` is the right policy for records whose loss costs one card's
 * badge rather than the domain's availability; the normalizing validators above
 * mean it should rarely be reached at all.
 */
export const ackDomainSpec = defineDomain({
  name: ACK_DOMAIN_NAME,
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: {
    [ACK_TABLE_NAME]: domainTable(ackRecordSchema),
  },
})

/**
 * Busy accounting lives in its own domain so a future shape change (extra
 * timers, `per-record` layout) never touches the authoritative acks medium.
 */
export const turnDomainSpec = defineDomain({
  name: TURN_DOMAIN_NAME,
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: {
    [TURN_TABLE_NAME]: domainTable(turnRecordSchema),
  },
})

/**
 * Preferences live in their own domain so a future preference shape (or a
 * write-heavy table) never touches the authoritative session fact stores.
 */
export const prefsDomainSpec = defineDomain({
  name: PREFS_DOMAIN_NAME,
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: {
    [PREFS_TABLE_NAME]: domainTable(prefsRecordSchema),
  },
})

/** One table handle as the storage layer exposes it (only the members used here). */
export interface KvTableLike<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<boolean>
}

/** Handle on the `acks` table; keys are session ids. */
export type BoardAckTable = KvTableLike<StoredAckRecord>
/** Handle on the `turn_stats` table; keys are session ids. */
export type BoardTurnTable = KvTableLike<StoredTurnRecord>
/** Handle on the `prefs` table; keys are preference names. */
export type BoardPrefsTable = KvTableLike<StoredSynthesisPrefRecord>
