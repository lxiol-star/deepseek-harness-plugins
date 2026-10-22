/**
 * Durable plugin state: one JSON document under the harness home.
 *
 * The document carries the global energy-skin preference and the per-session
 * Ultra / lightning toggles:
 *
 * ```json
 * { "version": 1, "skin": "fluid", "sessions": { "<sessionId>": { "lightning": false, "ultra": true } } }
 * ```
 *
 * Reading is normalize-not-throw: a missing file, unreadable file, malformed
 * JSON, or wrong field types degrade to the default state, because a broken
 * preference file must never disable the slider itself. Writing is a
 * read-modify-write serialized in-process and committed through a unique temp
 * file plus rename, so a concurrent reader never observes a truncated
 * document and a skin change never erases the session toggles.
 *
 * @module dsh-whale-effort/host/state
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** Energy-skin identifiers; the Host is authoritative for the persisted value. */
export type Skin = 'holo' | 'chrome' | 'fluid'

/** Supported skins in picker order. */
export const SKINS: readonly Skin[] = Object.freeze(['holo', 'chrome', 'fluid'])

/** Skin used when nothing valid is persisted. */
export const DEFAULT_SKIN: Skin = 'fluid'

/** Current on-disk schema version. */
export const STATE_VERSION = 1

/** File name of the plugin's state document inside `<home>/storages/`. */
export const STATE_FILE_NAME = 'dsh-whale-effort.json'

/** Directory name inside the harness home that holds plugin documents. */
export const STORAGES_DIR_NAME = 'storages'

/** Default harness home directory name under the OS home. */
export const DSH_HOME_DIR_NAME = '.dsh'

/** Environment variable that overrides the default harness home. */
export const DSH_HOME_ENV = 'DSH_HOME'

/** Upper bound on retained session toggles (most recently touched win). */
export const MAX_TRACKED_SESSIONS = 40

/** Longest session id accepted as a state key. */
const MAX_SESSION_ID_LENGTH = 256

/** Session ids are opaque, but never control characters or empty. */
const SESSION_ID_PATTERN = /^[^\u0000-\u001f\u007f]+$/u

/** One session's Ultra / lightning toggles. */
export interface SessionFlags {
  /** Whether Lightning orchestration mode is on for the session. */
  readonly lightning: boolean
  /** Whether Ultra mode is on for the session. */
  readonly ultra: boolean
}

/** The complete persisted document. */
export interface WhaleState {
  /** Schema version written on every commit. */
  readonly version: typeof STATE_VERSION
  /** Global skin preference. */
  readonly skin: Skin
  /** Session toggles, in most-recently-touched order. */
  readonly sessions: Readonly<Record<string, SessionFlags>>
}

/** @returns a plain object test usable for field validation. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Render one caught value for a log line. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Narrow one persisted skin value to a supported skin. */
export function normalizeSkin(value: unknown): Skin {
  return typeof value === 'string' && (SKINS as readonly string[]).includes(value) ? value as Skin : DEFAULT_SKIN
}

/** Whether one value can key the session map. */
export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_SESSION_ID_LENGTH
    && SESSION_ID_PATTERN.test(value)
}

/** @returns the default state document. */
export function emptyState(): WhaleState {
  return { version: STATE_VERSION, skin: DEFAULT_SKIN, sessions: {} }
}

/**
 * Keep at most {@link MAX_TRACKED_SESSIONS} entries, dropping the ones touched
 * longest ago (object insertion order is touch order).
 * @param sessions - candidate session map.
 * @returns the bounded session map.
 */
export function boundSessions(
  sessions: Readonly<Record<string, SessionFlags>>,
): Record<string, SessionFlags> {
  const entries = Object.entries(sessions)
  const kept = entries.length > MAX_TRACKED_SESSIONS ? entries.slice(-MAX_TRACKED_SESSIONS) : entries
  const out: Record<string, SessionFlags> = {}
  for (const [id, flags] of kept) out[id] = { lightning: flags.lightning, ultra: flags.ultra }
  return out
}

/**
 * Coerce one parsed document into a usable state value.
 *
 * Malformed members are dropped rather than thrown: an unusable skin falls
 * back to {@link DEFAULT_SKIN}, non-record session values and unusable ids are
 * skipped, and the retained order is capped. The version field is advisory on
 * read; every write stamps the current one.
 * @param raw - parsed JSON value of any shape.
 * @returns the normalized state document.
 */
export function normalizeState(raw: unknown): WhaleState {
  if (!isRecord(raw)) return emptyState()
  const sessions: Record<string, SessionFlags> = {}
  const source = raw['sessions']
  if (isRecord(source)) {
    for (const [id, value] of Object.entries(source)) {
      if (!isSessionId(id) || !isRecord(value)) continue
      sessions[id] = { lightning: value['lightning'] === true, ultra: value['ultra'] === true }
    }
  }
  return { version: STATE_VERSION, skin: normalizeSkin(raw['skin']), sessions: boundSessions(sessions) }
}

/** Expand a leading `~` or `~/` against the OS home. */
export function expandHomePath(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

/**
 * Resolve the harness home for plugin storage.
 *
 * Precedence, highest first: an explicitly configured directory (the plugin
 * config's `statePath`), a non-blank `$DSH_HOME`, then `~/.dsh` — the same
 * precedence the harness itself uses for user data.
 * @param configured - explicit harness-home directory from plugin configuration.
 * @param env - environment mapping to read `DSH_HOME` from.
 * @returns the normalized absolute harness home.
 */
export function resolveDshHome(
  configured?: unknown,
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = typeof configured === 'string' ? configured.trim() : ''
  const fromEnv = typeof env[DSH_HOME_ENV] === 'string' ? env[DSH_HOME_ENV].trim() : ''
  const selected = explicit.length > 0 ? explicit : fromEnv.length > 0 ? fromEnv : join(homedir(), DSH_HOME_DIR_NAME)
  return resolve(expandHomePath(selected))
}

/**
 * Resolve the absolute state-document path.
 * @param configured - explicit override: a JSON file path, or a harness-home directory.
 * @param env - environment mapping used for `$DSH_HOME`.
 * @returns the normalized absolute state-file path.
 */
export function resolveStatePath(
  configured?: unknown,
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = typeof configured === 'string' ? configured.trim() : ''
  if (explicit.length > 0) {
    const expanded = resolve(expandHomePath(explicit))
    return expanded.endsWith('.json') ? expanded : join(expanded, STORAGES_DIR_NAME, STATE_FILE_NAME)
  }
  return join(resolveDshHome(undefined, env), STORAGES_DIR_NAME, STATE_FILE_NAME)
}

/** Sink for degraded-read/write diagnostics (never throws). */
export type StateLog = (message: string) => void

/** The plugin's durable state document operations. */
export interface StateFile {
  /** Absolute document path. */
  readonly path: string
  /** Read and normalize the document; never throws. */
  read(): WhaleState
  /** Persist the global skin, preserving the session map. @returns whether the commit reached disk. */
  writeSkin(skin: Skin): Promise<boolean>
  /** Persist one session's toggles as the most recently touched entry. @returns whether the commit reached disk. */
  writeSession(session: string, flags: SessionFlags): Promise<boolean>
}

/** Options accepted by {@link createStateFile}. */
export interface StateFileOptions {
  /** Absolute state-document path. */
  readonly path: string
  /** Optional diagnostic sink for degraded reads and writes. */
  readonly log?: StateLog
}

/** Read and parse the document, degrading any failure to the default state. */
function readDocument(path: string, log: StateLog): WhaleState {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code !== 'ENOENT') log(`state file unreadable, using defaults: ${describeError(error)}`)
    return emptyState()
  }
  try {
    return normalizeState(JSON.parse(text))
  } catch (error) {
    log(`state file is not valid JSON, using defaults: ${describeError(error)}`)
    return emptyState()
  }
}

/**
 * Open the state document.
 *
 * Commits are serialized in-process: each one reads the current document,
 * applies its mutation, and atomically replaces the file. A failed commit is
 * logged and reported as `false`; it never throws.
 * @param options - document path and optional diagnostic sink.
 * @returns the state-file operations.
 */
export function createStateFile(options: StateFileOptions): StateFile {
  const { path } = options
  const log = options.log ?? (() => {})
  let chain: Promise<unknown> = Promise.resolve()

  /** Queue one operation behind every earlier one, isolating failures. */
  const serialize = <T>(work: () => Promise<T> | T): Promise<T> => {
    const result = chain.then(work)
    chain = result.then(() => undefined, () => undefined)
    return result
  }

  type StateMutation = (current: WhaleState) => WhaleState

  /** Read-modify-write one atomic commit. */
  const commit = (mutate: StateMutation): Promise<boolean> => serialize(() => {
    const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
    try {
      const next = mutate(readDocument(path, log))
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      renameSync(temporary, path)
      return true
    } catch (error) {
      log(`state file write failed, kept in memory only: ${describeError(error)}`)
      try {
        unlinkSync(temporary)
      } catch {
        // A stale temp file is harmless; never let cleanup mask the write failure.
      }
      return false
    }
  })

  return {
    path,
    read: () => readDocument(path, log),
    writeSkin: (skin) => commit((current) => ({
      version: STATE_VERSION,
      skin: normalizeSkin(skin),
      sessions: current.sessions,
    })),
    writeSession: (session, flags) => {
      if (!isSessionId(session)) return Promise.resolve(false)
      return commit((current) => {
        const sessions: Record<string, SessionFlags> = {}
        for (const [id, value] of Object.entries(current.sessions)) {
          if (id !== session) sessions[id] = value
        }
        sessions[session] = { lightning: flags.lightning, ultra: flags.ultra }
        return { version: STATE_VERSION, skin: current.skin, sessions: boundSessions(sessions) }
      })
    },
  }
}
