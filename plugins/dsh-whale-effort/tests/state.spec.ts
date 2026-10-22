import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SKIN,
  MAX_TRACKED_SESSIONS,
  STATE_FILE_NAME,
  STATE_VERSION,
  STORAGES_DIR_NAME,
  boundSessions,
  createStateFile,
  emptyState,
  isSessionId,
  normalizeSkin,
  normalizeState,
  resolveDshHome,
  resolveStatePath,
} from '../src/host/state.js'

/** Synthetic fixture directory, removed after every test. */
let directory: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'whale-effort-state-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

/** Absolute path of the fixture's state document. */
function statePath(): string {
  return join(directory, STORAGES_DIR_NAME, STATE_FILE_NAME)
}

describe('skin normalization', () => {
  it('accepts the supported skins', () => {
    expect(normalizeSkin('holo')).toBe('holo')
    expect(normalizeSkin('chrome')).toBe('chrome')
    expect(normalizeSkin('fluid')).toBe('fluid')
  })

  it('falls back to the default for anything else', () => {
    expect(DEFAULT_SKIN).toBe('fluid')
    expect(normalizeSkin(undefined)).toBe(DEFAULT_SKIN)
    expect(normalizeSkin(null)).toBe(DEFAULT_SKIN)
    expect(normalizeSkin('nebula')).toBe(DEFAULT_SKIN)
    expect(normalizeSkin(3)).toBe(DEFAULT_SKIN)
  })
})

describe('state normalization', () => {
  it('defaults every field for unusable input', () => {
    expect(normalizeState(undefined)).toEqual(emptyState())
    expect(normalizeState(null)).toEqual(emptyState())
    expect(normalizeState([])).toEqual(emptyState())
    expect(normalizeState('nope')).toEqual(emptyState())
  })

  it('keeps valid members and drops malformed ones', () => {
    const state = normalizeState({
      version: STATE_VERSION,
      skin: 'chrome',
      sessions: {
        'session-a': { lightning: true, ultra: false },
        'session-b': { lightning: 'yes', ultra: true },
        'session-c': 7,
        '': { lightning: true },
      },
    })
    expect(state.skin).toBe('chrome')
    expect(state.version).toBe(STATE_VERSION)
    expect(state.sessions['session-a']).toEqual({ lightning: true, ultra: false })
    expect(state.sessions['session-b']).toEqual({ lightning: false, ultra: true })
    expect(state.sessions['session-c']).toBeUndefined()
    expect(Object.keys(state.sessions)).toHaveLength(2)
  })

  it('treats the version field as advisory on read', () => {
    const state = normalizeState({ version: 99, skin: 'holo', sessions: {} })
    expect(state.skin).toBe('holo')
    expect(state.version).toBe(STATE_VERSION)
  })

  it('bounds retained sessions to the newest entries', () => {
    const sessions: Record<string, { lightning: boolean; ultra: boolean }> = {}
    for (let index = 0; index < MAX_TRACKED_SESSIONS + 5; index += 1) {
      sessions[`session-${String(index)}`] = { lightning: false, ultra: false }
    }
    const bounded = boundSessions(sessions)
    const keys = Object.keys(bounded)
    expect(keys).toHaveLength(MAX_TRACKED_SESSIONS)
    expect(keys[0]).toBe('session-5')
    expect(keys.at(-1)).toBe(`session-${String(MAX_TRACKED_SESSIONS + 4)}`)
  })
})

describe('session id validation', () => {
  it('accepts non-empty opaque ids', () => {
    expect(isSessionId('session-1')).toBe(true)
    expect(isSessionId('custom:route/../x')).toBe(true)
  })

  it('rejects empty, non-string, over-long, and control-character ids', () => {
    expect(isSessionId('')).toBe(false)
    expect(isSessionId(3)).toBe(false)
    expect(isSessionId(undefined)).toBe(false)
    expect(isSessionId('a'.repeat(257))).toBe(false)
    expect(isSessionId('session\u0000')).toBe(false)
  })
})

describe('harness home resolution', () => {
  it('prefers an explicit directory, then $DSH_HOME, then ~/.dsh', () => {
    const explicit = resolve('/tmp/whale-effort-explicit')
    const fromEnv = resolve('/tmp/whale-effort-env')
    expect(resolveDshHome('/tmp/whale-effort-explicit', { DSH_HOME: '/tmp/whale-effort-env' })).toBe(explicit)
    expect(resolveDshHome(undefined, { DSH_HOME: '/tmp/whale-effort-env' })).toBe(fromEnv)
    expect(resolveDshHome(undefined, {})).toBe(resolve(join(process.env['HOME'] ?? '', '.dsh')))
  })

  it('ignores blank overrides and expands a leading tilde', () => {
    expect(resolveDshHome('   ', { DSH_HOME: '  ' })).toBe(resolve(join(process.env['HOME'] ?? '', '.dsh')))
    expect(resolveDshHome('~/fixture', {})).toBe(resolve(join(process.env['HOME'] ?? '', 'fixture')))
  })

  it('derives the state document path', () => {
    expect(resolveStatePath(undefined, { DSH_HOME: '/tmp/whale-effort-env' }))
      .toBe(join(resolve('/tmp/whale-effort-env'), STORAGES_DIR_NAME, STATE_FILE_NAME))
    expect(resolveStatePath('/tmp/whale-effort-explicit', { DSH_HOME: '/tmp/whale-effort-env' }))
      .toBe(join(resolve('/tmp/whale-effort-explicit'), STORAGES_DIR_NAME, STATE_FILE_NAME))
    expect(resolveStatePath('/tmp/whale-effort-explicit/own.json', {}))
      .toBe(resolve('/tmp/whale-effort-explicit/own.json'))
  })
})

describe('state document', () => {
  it('reads defaults when the document is missing', () => {
    const state = createStateFile({ path: statePath() })
    expect(state.read()).toEqual(emptyState())
  })

  it('persists the skin and the session toggles without overwriting each other', async () => {
    const file = createStateFile({ path: statePath() })
    expect(await file.writeSkin('holo')).toBe(true)
    expect(await file.writeSession('session-a', { lightning: true, ultra: false })).toBe(true)
    expect(await file.writeSkin('chrome')).toBe(true)

    const stored = JSON.parse(readFileSync(statePath(), 'utf8')) as unknown
    expect(normalizeState(stored)).toEqual({
      version: STATE_VERSION,
      skin: 'chrome',
      sessions: { 'session-a': { lightning: true, ultra: false } },
    })
    expect(file.read().sessions['session-a']).toEqual({ lightning: true, ultra: false })
  })

  it('serializes concurrent commits instead of truncating the document', async () => {
    const file = createStateFile({ path: statePath() })
    await Promise.all([
      file.writeSkin('holo'),
      file.writeSession('session-a', { lightning: true, ultra: false }),
      file.writeSession('session-b', { lightning: false, ultra: true }),
    ])
    const state = file.read()
    expect(state.skin).toBe('holo')
    expect(state.sessions['session-a']).toEqual({ lightning: true, ultra: false })
    expect(state.sessions['session-b']).toEqual({ lightning: false, ultra: true })
  })

  it('normalizes malformed JSON instead of throwing', () => {
    mkdirSync(dirname(statePath()), { recursive: true })
    writeFileSync(statePath(), '{ not json', 'utf8')
    const file = createStateFile({ path: statePath() })
    expect(file.read()).toEqual(emptyState())
  })

  it('bounds the persisted session map and keeps the newest touched entries', async () => {
    const file = createStateFile({ path: statePath() })
    for (let index = 0; index < MAX_TRACKED_SESSIONS + 3; index += 1) {
      await file.writeSession(`session-${String(index)}`, { lightning: true, ultra: false })
    }
    const keys = Object.keys(file.read().sessions)
    expect(keys).toHaveLength(MAX_TRACKED_SESSIONS)
    expect(keys[0]).toBe('session-3')
    expect(keys.at(-1)).toBe(`session-${String(MAX_TRACKED_SESSIONS + 2)}`)
  })

  it('re-touching a session moves it to the newest end', async () => {
    const file = createStateFile({ path: statePath() })
    await file.writeSession('session-a', { lightning: true, ultra: false })
    await file.writeSession('session-b', { lightning: true, ultra: false })
    await file.writeSession('session-a', { lightning: false, ultra: true })
    const keys = Object.keys(file.read().sessions)
    expect(keys).toEqual(['session-b', 'session-a'])
  })

  it('skips unusable session ids without throwing', async () => {
    const file = createStateFile({ path: statePath() })
    expect(await file.writeSession('', { lightning: true, ultra: true })).toBe(false)
    expect(file.read().sessions).toEqual({})
  })
})
