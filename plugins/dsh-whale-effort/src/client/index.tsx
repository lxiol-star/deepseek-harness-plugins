/**
 * Session-scoped model and reasoning-effort control for the DSH composer model seat.
 *
 * Merged control: the native model selector's effort pane renders the
 * whale-girl slider with the sci-fi energy skins, the appended Ultra tier,
 * the lightning orchestration toggle and the live subagent tok/s readout.
 *
 * The control deliberately follows DSH's own session model-selection contract:
 * `sessions.models()` supplies the exact current route and its adapter-owned
 * effort metadata; `sessions.selectModel()` submits the complete selection for
 * the next assembled turn. The slider adapts to whatever effort levels the
 * current model exposes — their count and order are the adapter's, never
 * assumed here.
 *
 * @module dsh-whale-effort/client
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type {
  ModelDirectory,
  ModelDirectoryResolver,
  ModelDirectoryState,
} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import {
  en,
  NS,
  zh,
  type ReasoningEffortLocaleKey,
  type ReasoningEffortTranslate,
} from './locales.js'
import { CSS } from './styles.js'
import { positionModelMenu } from './menu-position.js'
import { wrapNativeSelector } from './native-selector.js'
import {
  clampIndex,
  currentModel,
  displayIndexFor,
  displayLevels,
  effortIdForDisplay,
  effortIndex,
  isUltraIndex,
  selectEffort,
  sliderLevels,
} from './effort-selection.js'
import {
  BoltToggle,
  EffectsRail,
  PolicyChip,
  RateReadout,
} from './effects/index.js'
import { EFFECTS_CSS } from './effects/css.js'
import { SKINS, type Skin } from './effects/skins.js'
import {
  EMPTY_TURBO,
  makeTurboService,
  RPC_CHANNEL,
  skinStore,
  type HostRpc,
  type TurboService,
  type TurboSnapshot,
} from './turbo.js'
// Agent briefs inlined as text at build time; the copied document picks one by
// the active locale.
import agentTutorialEn from './agent-tutorial.en.md'
import agentTutorialZh from './agent-tutorial.zh.md'

/** Host RPC result envelope (matches `@deepseek-ai/dsh-host-apiproxy`). */
type ReRpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } }

/** Module-level Host transport shared by the settings row (no session seat there). */
let turboService: TurboService | null = null

/** One guidance result from the Host half. */
interface AdaptGuidance {
  readonly provider: string
  readonly model: string
  readonly userDeclared: boolean
  readonly needsGuide: boolean
  readonly reason: 'missing' | 'mismatch' | 'none'
  readonly current: string[]
  readonly expected: string[]
  readonly matched: boolean
  readonly mode: 'replace' | 'insert'
  readonly noteKey: 'glm52' | 'kimiK3' | null
  readonly note: string | null
  readonly warning: 'developerRole' | null
  readonly entryHead: string | null
  readonly fieldBlock: string | null
  readonly entryLine: string
  readonly entryPath: string
  readonly modelIndent: number
  readonly settingsPath: string | null
}

/** The client-facing guidance service (Client→Host over the Connection RPC). */
interface AdaptationService {
  diagnose(provider: string, model: string): Promise<AdaptGuidance | null>
  subscribe(listener: () => void): () => void
  getSnapshot(): number
  invalidate(): void
}

const LEVEL_NAME_KEYS: Record<string, ReasoningEffortLocaleKey> = {
  off: 'level.off',
  minimal: 'level.minimal',
  low: 'level.low',
  medium: 'level.medium',
  high: 'level.high',
  xhigh: 'level.xhigh',
  max: 'level.max',
}

function levelName(level: string, t: ReasoningEffortTranslate): string {
  const key = LEVEL_NAME_KEYS[level]
  return key === undefined ? level : t(key)
}

function levelsText(levels: readonly string[], t: ReasoningEffortTranslate): string {
  return levels.length === 0 ? t('level.none') : levels.map((level) => levelName(level, t)).join(' / ')
}

/**
 * Localized field-block template for a model the knowledge base does not know.
 *
 * `compat` stays a commented example rather than a written block: a guessed
 * `thinkingFormat` is worse than none, because the endpoint then receives a
 * switch it does not read, while an absent `compat` lets the adapter apply its
 * own base-URL detection (which is what an unrecognized OpenAI-compatible
 * endpoint wants anyway, and the correct vendor format for a recognized one).
 */
function templateSnippet(t: ReasoningEffortTranslate, modelIndent: number): string {
  const fieldPrefix = ' '.repeat(modelIndent + 2)
  const valuePrefix = ' '.repeat(modelIndent + 4)
  return [
    `${fieldPrefix}reasoningEfforts:`,
    `${valuePrefix}low: "low"        # ${t('yaml.keyComment')}`,
    `${valuePrefix}high: "high"      # ${t('yaml.valueComment')}`,
    `${fieldPrefix}# ${t('yaml.compatComment')}`,
    `${fieldPrefix}# compat:`,
    `${fieldPrefix}#   thinkingFormat: "qwen"`,
    `${fieldPrefix}#   supportsReasoningEffort: false`,
    `${fieldPrefix}#   supportsDeveloperRole: false`,
  ].join('\n')
}

function configDocumentName(path: string | null): string {
  return path?.split(/[\\/]/u).at(-1) || 'settings.yaml'
}

function guidanceNote(guidance: AdaptGuidance, t: ReasoningEffortTranslate): string {
  if (guidance.note !== null) return guidance.note
  if (guidance.noteKey === 'glm52') return t('knowledge.glm52')
  if (guidance.noteKey === 'kimiK3') return t('knowledge.kimiK3')
  return t('knowledge.unknown')
}

function guidanceWarning(guidance: AdaptGuidance, t: ReasoningEffortTranslate): string | null {
  return guidance.warning === 'developerRole' ? t('warning.developerRole') : null
}

function guidanceSnippet(guidance: AdaptGuidance, t: ReasoningEffortTranslate): string {
  const block = guidance.fieldBlock ?? templateSnippet(t, guidance.modelIndent)
  return guidance.entryHead === null ? block : `${guidance.entryHead}\n${block}`
}

/**
 * Copy observed model/configuration facts and vendor-neutral declaration rules.
 * Knowledge-base suggestions are excluded: the recipient verifies the endpoint.
 * The rules themselves live in the markdown briefs so they can be reviewed and
 * revised as documents rather than as dictionary strings.
 */
function agentBrief(
  guidance: AdaptGuidance,
  tutorial: string,
  t: ReasoningEffortTranslate,
): string {
  const facts = t('agent.facts', {
    provider: guidance.provider,
    model: guidance.model,
    path: guidance.settingsPath ?? t('agent.configUnknown'),
    entryPath: guidance.entryPath,
    entryLine: guidance.entryLine,
    current: levelsText(guidance.current, t),
  })
  return [
    t('agent.intro'),
    '',
    t('agent.factsHeading'),
    facts,
    '',
    t('agent.task'),
    '',
    '---',
    '',
    tutorial.replace(/\r\n/gu, '\n')
      .replaceAll('{{CONFIG_FILE}}', guidance.settingsPath ?? t('agent.configUnknown'))
      .replaceAll('{{ENTRY_PATH}}', guidance.entryPath)
      .trim(),
    '',
  ].join('\n')
}

/** Wrap the Host RPC channel in typed helpers; null while the Host half is absent. */
function makeAdaptationService(rpc: HostRpc | undefined): AdaptationService | null {
  if (rpc === undefined) return null
  let revision = 0
  const listeners = new Set<() => void>()
  const call = async <T,>(endpoint: string, payload?: unknown): Promise<T | null> => {
    try {
      const result = (await rpc.call(RPC_CHANNEL, endpoint, payload)) as ReRpcResult<T>
      return result.ok ? result.value : null
    } catch {
      return null
    }
  }
  return {
    diagnose: (provider, model) => call<AdaptGuidance>('diagnose', { provider, model }),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => revision,
    invalidate: () => {
      revision += 1
      listeners.forEach((listener) => listener())
    },
  }
}

const noGuidanceSubscription = () => () => {}
const noGuidanceRevision = () => 0

/** Copy text to the clipboard, falling back to a transient textarea selection. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      textarea.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** The slice of the locale service this half reads: the active language id. */
interface LocaleRuntimeLike {
  getLocale(): { active: string }
}

interface ModelSeatInjectedProps {
  readonly locked: boolean
  readonly available: boolean
  readonly controller: ModelDirectory
  readonly directory: SnapshotStore<ModelDirectoryState>
  readonly load: () => void
  readonly select: (selection: ModelSelection) => Promise<boolean>
  readonly adapt: AdaptationService | null
  /** Session the native seat belongs to; absent on the fallback composer seat. */
  readonly sessionId?: SessionId
  /** Host transport for Ultra/lightning state and the fleet sample. */
  readonly turbo: TurboService | null
  /** Rules document for the active locale, read at copy time. */
  readonly agentTutorial: () => string
}

type ModelSeatProps = ModelSeatInjectedProps & PropsLocale<typeof NS>

const SLOT = 'conversation.input.model'
const SETTINGS_SLOT = 'settings.general.item'
const ENABLED_STORAGE_KEY = 'dsh-whale-effort.enabled'
const LEGACY_ENABLED_STORAGE_KEY = 'dsh-reasoning-effort.enabled'
const CHIBI_THUMB_STORAGE_KEY = 'dsh-whale-effort.chibi-thumb'
export const inject = ['slots', 'sessions', 'modelDirectories', 'connection', 'locale', 'remote', 'remote.session']

function readEnabledPreference(): boolean {
  try {
    const current = window.localStorage.getItem(ENABLED_STORAGE_KEY)
    const stored = current ?? window.localStorage.getItem(LEGACY_ENABLED_STORAGE_KEY)
    return stored !== 'false'
  } catch {
    return true
  }
}

let enabledPreference = readEnabledPreference()
const enabledListeners = new Set<() => void>()

const enabledStore = {
  getSnapshot: () => enabledPreference,
  subscribe: (listener: () => void) => {
    enabledListeners.add(listener)
    return () => enabledListeners.delete(listener)
  },
  set: (enabled: boolean, persist = true) => {
    if (enabledPreference === enabled) return
    enabledPreference = enabled
    if (persist) {
      try {
        window.localStorage.setItem(ENABLED_STORAGE_KEY, String(enabled))
      } catch {
        // The current page still follows the choice when storage is unavailable.
      }
    }
    enabledListeners.forEach((listener) => listener())
  },
}

function readChibiThumbPreference(): boolean {
  try {
    // Default on: only an explicit "false" disables the chibi thumb.
    return window.localStorage.getItem(CHIBI_THUMB_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

let chibiThumbPreference = readChibiThumbPreference()
const chibiThumbListeners = new Set<() => void>()

const chibiThumbStore = {
  getSnapshot: () => chibiThumbPreference,
  subscribe: (listener: () => void) => {
    chibiThumbListeners.add(listener)
    return () => chibiThumbListeners.delete(listener)
  },
  set: (enabled: boolean, persist = true) => {
    if (chibiThumbPreference === enabled) return
    chibiThumbPreference = enabled
    if (persist) {
      try {
        window.localStorage.setItem(CHIBI_THUMB_STORAGE_KEY, String(enabled))
      } catch {
        // The current page still follows the choice when storage is unavailable.
      }
    }
    chibiThumbListeners.forEach((listener) => listener())
  },
}

/** Full-scale token rate that maps to maximum glow (visual only; the readout stays exact). */
const RATE_FULL_SCALE = 20000
/** Poll period for the fleet sample while the effort pane is open. */
const TURBO_POLL_MS = 1000
/** Consecutive transport failures after which the chrome stops polling. */
const TURBO_MAX_FAILURES = 3

interface EffortSliderProps {
  directory: ModelDirectory
  t: ReasoningEffortTranslate
  locked?: boolean
  sessionId?: SessionId
  turbo: TurboService | null
}

/**
 * Reasoning-effort slider: the model's real levels plus the appended Ultra tier.
 *
 * Ultra is presentation-only — committing it writes the model's highest real
 * effort id — while the Host half remembers the session's Ultra/lightning
 * choice and the fleet throughput sampled for its subagents.
 */
function EffortSlider({ directory, t, locked = false, sessionId, turbo }: EffortSliderProps) {
  const directoryState = useSyncExternalStore(
    (notify) => directory.store.subscribe(notify),
    () => directory.store.getSnapshot(),
  )
  const levels = sliderLevels(directoryState)
  const display = displayLevels(levels)
  const count = display.length
  const skin = useSyncExternalStore(skinStore.subscribe, skinStore.getSnapshot)
  const available = directoryState.current !== null && count >= 2
  const [effort, setEffort] = useState(directoryState.current?.reasoningEffort ?? '')
  const [preview, setPreview] = useState(Math.max(0, displayIndexFor(levels, directoryState.current?.reasoningEffort, false)))
  const [committing, setCommitting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [turboNotice, setTurboNotice] = useState<string | null>(null)
  const [lightning, setLightning] = useState(false)
  const [turboState, setTurboState] = useState<TurboSnapshot>(EMPTY_TURBO)
  const [turboUnavailable, setTurboUnavailable] = useState(turbo === null)
  const ultraModeRef = useRef(false)
  const levelsRef = useRef(levels)
  levelsRef.current = levels
  const chibiThumb = useSyncExternalStore(chibiThumbStore.subscribe, chibiThumbStore.getSnapshot)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(directoryState.current?.reasoningEffort ?? '')
  const committingRef = useRef(false)
  const selectionAbortRef = useRef<AbortController | null>(null)
  const previewRef = useRef(preview)
  const draggingRef = useRef(false)
  const pointerActiveRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)
  const gestureCatalogRef = useRef('')
  const hydratedRef = useRef(false)
  const catalogKey = JSON.stringify([
    directoryState.current?.provider,
    directoryState.current?.model,
    directoryState.current?.reasoningEffort,
    levels.map((level) => level.id),
  ])
  const globalPointerMoveRef = useRef<((event: PointerEvent) => void) | null>(null)
  const globalPointerEndRef = useRef<((event: PointerEvent) => void) | null>(null)
  const globalPointerCancelRef = useRef<((event: PointerEvent) => void) | null>(null)
  const busy = locked || committing || directoryState.status === 'selecting' || directoryState.status === 'loading' || directoryState.pending !== null
  const error = localError ?? directoryState.error

  const [, setUltraModeState] = useState(false)
  /** Ultra mode is UI state plus the Host-side flag; keep the ref in step with React state. */
  const setUltraMode = useCallback((next: boolean) => {
    ultraModeRef.current = next
    setUltraModeState(next)
  }, [])

  useEffect(() => {
    if (!available || committingRef.current || draggingRef.current) return
    const next = directoryState.current?.reasoningEffort ?? ''
    const topId = levels[levels.length - 1]?.id
    const index = ultraModeRef.current && topId !== undefined && next === topId
      ? levels.length
      : Math.max(0, effortIndex(levels, next))
    committedRef.current = next
    previewRef.current = index
    setEffort(next)
    setPreview(index)
    // A previous model's Ultra selection cannot survive a route change: the
    // real MAX id differs per model, so the Host flag must stop injecting.
    if (ultraModeRef.current && (topId === undefined || next !== topId)) {
      setUltraMode(false)
      if (turbo !== null && sessionId !== undefined) {
        void turbo.update({ session: String(sessionId), ultra: false })
      }
    }
  }, [available, levels, directoryState, committing, dragging, setUltraMode, turbo, sessionId])

  useEffect(() => () => {
    selectionAbortRef.current?.abort()
    const input = inputRef.current
    const pointerId = activePointerIdRef.current
    if (input !== null && pointerId !== null && input.hasPointerCapture(pointerId)) {
      input.releasePointerCapture(pointerId)
    }
    pointerActiveRef.current = false
    activePointerIdRef.current = null
    draggingRef.current = false
  }, [directory, directoryState.current?.provider, directoryState.current?.model])

  useEffect(() => {
    directory.load().catch(() => undefined)
  }, [directory])

  useEffect(() => {
    previewRef.current = preview
  }, [preview])

  useEffect(() => {
    draggingRef.current = dragging
  }, [dragging])

  // Restore the session's Ultra/lightning choice, then keep the fleet sample
  // fresh while the pane stays open. Failures are silent and bounded: after
  // three dropped calls the chrome disappears instead of hammering the Host.
  useEffect(() => {
    if (turbo === null || sessionId === undefined) {
      setTurboUnavailable(turbo === null)
      return
    }
    // A new session (or a re-mounted Host transport) starts un-hydrated: the
    // persisted Ultra flag and lightning state must be read again, and the
    // previous session's Ultra display index must not leak across.
    hydratedRef.current = false
    setUltraMode(false)
    let cancelled = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const snapshot = await turbo.state(sessionId)
      if (cancelled) return
      if (snapshot === null) {
        failures += 1
        if (failures >= TURBO_MAX_FAILURES) {
          setTurboUnavailable(true)
          return
        }
      } else {
        failures = 0
        setTurboUnavailable(false)
        setTurboState(snapshot)
        if (!hydratedRef.current) {
          hydratedRef.current = true
          setLightning(snapshot.lightning)
          const topId = levelsRef.current[levelsRef.current.length - 1]?.id
          const current = directory.store.getSnapshot().current?.reasoningEffort
          if (snapshot.ultra && topId !== undefined && current === topId) {
            // Restore the Ultra display index, not just the flag: the persisted
            // session sits on the real MAX effort and the appended tier is what
            // the user last chose.
            setUltraMode(true)
            previewRef.current = levelsRef.current.length
            setPreview(levelsRef.current.length)
          } else if (snapshot.ultra && topId !== undefined) {
            // The route changed under the persisted flag; stop injecting.
            void turbo.update({ session: String(sessionId), ultra: false })
          }
        }
      }
      timer = setTimeout(() => { void tick() }, TURBO_POLL_MS)
    }
    timer = setTimeout(() => { void tick() }, Math.round(TURBO_POLL_MS / 2))
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [turbo, sessionId, directory, setUltraMode])

  const rollback = useCallback(() => {
    const input = inputRef.current
    const pointerId = activePointerIdRef.current
    if (input !== null && pointerId !== null && input.hasPointerCapture(pointerId)) {
      input.releasePointerCapture(pointerId)
    }
    const previous = committedRef.current
    const index = displayIndexFor(levels, previous, ultraModeRef.current)
    previewRef.current = Math.max(0, index)
    pointerActiveRef.current = false
    activePointerIdRef.current = null
    draggingRef.current = false
    setEffort(previous)
    setPreview(Math.max(0, index))
    setDragging(false)
  }, [levels])

  const cancelChangedGesture = useCallback(() => {
    if (gestureCatalogRef.current === catalogKey) return false
    rollback()
    setLocalError(t('effort.catalogChanged'))
    return true
  }, [catalogKey, rollback, t])

  useEffect(() => {
    if (pointerActiveRef.current) cancelChangedGesture()
  }, [cancelChangedGesture])

  const toggleLightning = useCallback(() => {
    if (turbo === null || sessionId === undefined || busy) return
    const next = !lightning
    setTurboNotice(null)
    setLightning(next)
    void turbo.update({ session: String(sessionId), lightning: next }).then((value) => {
      if (value !== null) return
      setLightning(!next)
      setTurboNotice(t('effort.turbo.failed'))
    })
  }, [turbo, sessionId, lightning, busy, t])

  const commit = useCallback(async (raw: number) => {
    if (committingRef.current || busy || directoryState.current === null) return
    const index = clampIndex(raw, count)
    const next = effortIdForDisplay(levels, index)
    if (next === undefined) return
    const target = {
      provider: directoryState.current.provider,
      model: directoryState.current.model,
      reasoningEffort: next,
    }
    const wantsUltra = isUltraIndex(levels, index)
    const previousUltra = ultraModeRef.current
    const operation = new AbortController()
    selectionAbortRef.current = operation
    committingRef.current = true
    setDragging(false)
    setCommitting(true)
    setLocalError(null)
    setTurboNotice(null)
    setUltraMode(wantsUltra)
    previewRef.current = index
    setPreview(index)
    setEffort(next)

    try {
      const confirmed = await selectEffort(directory, target, operation.signal, t)
      if (selectionAbortRef.current !== operation) return
      const confirmedIndex = displayIndexFor(sliderLevels(confirmed), next, wantsUltra)
      committedRef.current = next
      previewRef.current = confirmedIndex
      setEffort(next)
      setPreview(confirmedIndex)
      if (wantsUltra !== previousUltra && turbo !== null && sessionId !== undefined) {
        void turbo.update({ session: String(sessionId), ultra: wantsUltra }).then((value) => {
          if (value !== null) return
          setUltraMode(previousUltra)
          setTurboNotice(t('effort.turbo.failed'))
        })
      }
    } catch (cause) {
      setUltraMode(previousUltra)
      if (!operation.signal.aborted) {
        setLocalError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (selectionAbortRef.current === operation) {
        selectionAbortRef.current = null
        committingRef.current = false
        // Synchronization below resumes with the current directory, including
        // after a failed selection or a route change during the round-trip.
        if (!operation.signal.aborted) setCommitting(false)
      }
    }
  }, [directory, directoryState.current, levels, count, busy, t, setUltraMode, turbo, sessionId])

  useEffect(() => {
    if (selectionAbortRef.current?.signal.aborted) {
      selectionAbortRef.current = null
      committingRef.current = false
      setCommitting(false)
    }
    setDragging(false)
    setLocalError(null)
  }, [directory, directoryState.current?.provider, directoryState.current?.model])

  const rawFromPointer = (input: HTMLInputElement, clientX: number) => {
    const bounds = input.getBoundingClientRect()
    if (bounds.width <= 0 || count < 2) return previewRef.current
    return Math.max(
      0,
      Math.min(count - 1, (clientX - bounds.left) / bounds.width * (count - 1)),
    )
  }

  const showPointerPreview = (raw: number) => {
    previewRef.current = raw
    setPreview(raw)
    setEffort(levels[clampIndex(raw, levels.length)]?.id ?? '')
  }

  const beginDragging = (input: HTMLInputElement, pointerId: number, clientX: number) => {
    if (committingRef.current || busy) return
    gestureCatalogRef.current = catalogKey
    setLocalError(null)
    pointerActiveRef.current = true
    activePointerIdRef.current = pointerId
    draggingRef.current = true
    setDragging(true)
    showPointerPreview(rawFromPointer(input, clientX))
    try {
      if (!input.hasPointerCapture(pointerId)) input.setPointerCapture(pointerId)
    } catch {
      // The window-level pointer listeners below remain the reliable fallback.
    }
  }

  const moveDragging = (input: HTMLInputElement, pointerId: number, clientX: number) => {
    if (!pointerActiveRef.current || activePointerIdRef.current !== pointerId) return
    if (busy) { rollback(); return }
    if (cancelChangedGesture()) return
    showPointerPreview(rawFromPointer(input, clientX))
  }

  const stopDragging = (input: HTMLInputElement, pointerId?: number, clientX?: number) => {
    if (!pointerActiveRef.current) return
    if (pointerId !== undefined && activePointerIdRef.current !== pointerId) return
    if (busy) { rollback(); return }
    if (cancelChangedGesture()) return
    const raw = clientX === undefined ? previewRef.current : rawFromPointer(input, clientX)
    pointerActiveRef.current = false
    activePointerIdRef.current = null
    draggingRef.current = false
    if (pointerId !== undefined && input.hasPointerCapture(pointerId)) {
      input.releasePointerCapture(pointerId)
    }
    showPointerPreview(raw)
    void commit(raw)
  }

  globalPointerMoveRef.current = (event) => {
    const input = inputRef.current
    if (input !== null) moveDragging(input, event.pointerId, event.clientX)
  }
  globalPointerEndRef.current = (event) => {
    const input = inputRef.current
    if (input !== null) stopDragging(input, event.pointerId, event.clientX)
  }
  globalPointerCancelRef.current = (event) => {
    if (activePointerIdRef.current !== event.pointerId) return
    rollback()
  }

  useEffect(() => {
    const move = (event: PointerEvent) => globalPointerMoveRef.current?.(event)
    const end = (event: PointerEvent) => globalPointerEndRef.current?.(event)
    const cancel = (event: PointerEvent) => globalPointerCancelRef.current?.(event)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', cancel, true)
    return () => {
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', cancel, true)
    }
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (busy || committingRef.current) return
    const current = clampIndex(Number(event.currentTarget.value), count)
    let target: number | undefined
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown' || event.key === 'PageDown') {
      target = Math.max(0, current - 1)
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      target = Math.min(count - 1, current + 1)
    } else if (event.key === 'Home') {
      target = 0
    } else if (event.key === 'End') {
      target = count - 1
    }
    if (target === undefined) return
    event.preventDefault()
    void commit(target)
  }

  if (!available) return null

  const selectedIndex = clampIndex(preview, count)
  const selectedDisplay = display[selectedIndex]
  const selectedUltra = isUltraIndex(levels, selectedIndex)
  const effortName = selectedUltra
    ? t('effort.ultra')
    : selectedDisplay?.name ?? (effort || t('model.defaultEffort'))
  const savedEffort = directoryState.current?.reasoningEffort
  const notice = !dragging && !committing && !selectedUltra && effortIndex(levels, savedEffort) < 0
    ? savedEffort === undefined ? t('effort.unset') : t('effort.unsupported', { effort: savedEffort })
    : null
  const isTop = selectedIndex >= levels.length - 1
  const progress = count >= 2 ? selectedIndex / (count - 1) * 100 : 0
  const style = {
    '--re-progress': `${progress}%`,
    // EffectsRail's geometry reads the knob inset: the chibi thumb clamps at
    // 10px while the round thumb clamps at 14px (see styles.ts).
    '--we-inset': chibiThumb ? '10px' : '14px',
  } as CSSProperties
  const title = selectedUltra
    ? t('effort.ultra.description')
    : error === null
      ? t('effort.title', { effort: effortName })
      : t('effort.failed', { error })
  const turboAvailable = turbo !== null && !turboUnavailable
  const normalizedRate = Math.min(1, turboState.rate / RATE_FULL_SCALE)
  const policyText = turboState.policy

  return (
    <>
      {notice === null ? null : <div className="re-model-status" role="status">{notice}</div>}
      <div
        className={`re-effort${chibiThumb ? ' is-chibi' : ''}${dragging ? ' is-dragging' : ''}${busy ? ' is-busy' : ''}${error === null ? '' : ' is-error'}${selectedUltra ? ' is-ultra' : ''}`}
        title={title}
      >
        <div
          className="re-effort-slider"
          data-top={isTop ? 'true' : undefined}
          data-ultra={selectedUltra ? 'true' : undefined}
          data-lightning={lightning ? 'true' : undefined}
          data-we-skin={skin}
          style={style}
        >
          <div className="re-effort-track" aria-hidden="true" />
          <EffectsRail
            progress={progress / 100}
            dragging={dragging}
            skin={skin}
            ultra={selectedUltra}
            lightning={lightning}
            rate={normalizedRate}
            top={isTop}
          />
          <input
            ref={inputRef}
            className="re-effort-input"
            type="range"
            min="0"
            max={count - 1}
            step="0.01"
            value={preview}
            disabled={busy}
            aria-label={t('effort.label')}
            aria-valuetext={effortName}
            onChange={(event) => {
              if (pointerActiveRef.current || committingRef.current || busy) return
              const raw = Number(event.currentTarget.value)
              showPointerPreview(raw)
              void commit(raw)
            }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.currentTarget.focus()
              beginDragging(event.currentTarget, event.pointerId, event.clientX)
            }}
            onPointerMove={(event) => moveDragging(event.currentTarget, event.pointerId, event.clientX)}
            onPointerUp={(event) => stopDragging(event.currentTarget, event.pointerId, event.clientX)}
            onPointerCancel={(event) => {
              if (!pointerActiveRef.current || activePointerIdRef.current !== event.pointerId) return
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
              rollback()
            }}
            onBlur={(event) => {
              stopDragging(event.currentTarget)
            }}
            onKeyDown={onKeyDown}
          />
          {selectedIndex < 0 ? null : <span className="re-effort-knob" aria-hidden="true" />}
        </div>
        <div className="re-effort-ticks" aria-hidden="true">
          {display.map((level, index) => (
            <span key={level.id} className={`re-effort-tick${index === selectedIndex ? ' is-selected' : ''}${level.ultra ? ' is-ultra' : ''}`}
              style={{ left: `${index / Math.max(1, count - 1) * 100}%` }} title={level.ultra ? t('effort.ultra') : level.name}>{level.ultra ? 'Ultra' : '·'}</span>
          ))}
        </div>
        <div className="re-effort-name" role="status" aria-live="polite">{effortName}</div>
        {turboAvailable ? (
          <div className="re-effort-turbo" style={{ '--we-rate': normalizedRate } as CSSProperties}>
            <BoltToggle
              on={lightning}
              disabled={busy}
              label={t('effort.lightning.aria')}
              onToggle={toggleLightning}
            />
            <RateReadout
              total={turboState.rate}
              generating={turboState.generating || turboState.agents > 0}
              label={t('effort.rate')}
            />
          </div>
        ) : null}
        {turboNotice === null ? null : <div className="re-effort-turbo-note" role="status">{turboNotice}</div>}
        {policyText === '' ? null : (
          <div className="re-effort-policy">
            <PolicyChip text={policyText} title={t('effort.policy')} expandLabel={t('effort.policy')} />
          </div>
        )}
        {error === null ? null : <span className="re-effort-sr" role="status">{error}</span>}
      </div>
    </>
  )
}

function AdvancedModelSelect({
  locked,
  available,
  controller,
  directory,
  load,
  select,
  adapt,
  sessionId,
  turbo,
  agentTutorial,
  t,
  embedded = false,
}: ModelSeatProps & { embedded?: boolean }) {
  const state = useSyncExternalStore(
    (notify) => directory.subscribe(notify),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(embedded)
  const [modelsOpen, setModelsOpen] = useState(false)
  const revision = useSyncExternalStore(adapt?.subscribe ?? noGuidanceSubscription, adapt?.getSnapshot ?? noGuidanceRevision)
  const [guidanceResult, setGuidanceResult] = useState<{ value: AdaptGuidance; revision: number } | null>(null)
  const [guidanceBusy, setGuidanceBusy] = useState(false)
  // A native effort pane mounts on every opening. Models with usable levels
  // must not briefly show the generic tutorial before diagnosis completes.
  const [showCustomGuidance, setShowCustomGuidance] = useState(() => !embedded || sliderLevels(state).length < 2)
  const [guidanceFailed, setGuidanceFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [agentCopied, setAgentCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open || rootRef.current === null || menuRef.current === null) return
    return positionModelMenu(rootRef.current, menuRef.current)
  }, [open])
  const choice = currentModel(state)
  const levels = sliderLevels(state)
  const savedEffort = state.current?.reasoningEffort
  const effortName = savedEffort === undefined
    ? t('model.defaultEffort')
    : choice?.reasoning?.efforts.find((level) => level.id === savedEffort)?.name ?? savedEffort
  const modelLabel = choice?.name ?? state.current?.model ?? t('model.select')
  const busy = state.status === 'loading' || state.status === 'selecting' || state.pending !== null
  const provider = state.current?.provider
  const modelId = state.current?.model
  // Hide a previous model's result during the render before the effect clears it.
  const guidance = guidanceResult?.revision === revision && guidanceResult.value.provider === provider && guidanceResult.value.model === modelId
    ? guidanceResult.value
    : null
  // Keep the generic teaching and disclosure mounted while a new diagnosis runs.
  // Only a current result may render model-specific configuration or copy actions.
  const showGuidance = guidance?.needsGuide ?? showCustomGuidance
  const advancedBodyRef = useRef<HTMLDivElement>(null)
  const [advancedHeight, setAdvancedHeight] = useState(0)
  useLayoutEffect(() => {
    const body = advancedBodyRef.current
    if (guidance === null || body === null) return
    const observer = new ResizeObserver(() => setAdvancedHeight(body.offsetHeight))
    setAdvancedHeight(body.offsetHeight)
    observer.observe(body)
    return () => observer.disconnect()
  }, [guidance, open, modelsOpen])
  const localizedNote = guidance === null ? '' : guidanceNote(guidance, t)
  const localizedWarning = guidance === null ? null : guidanceWarning(guidance, t)
  const localizedSnippet = guidance === null ? '' : guidanceSnippet(guidance, t)

  useEffect(() => {
    if (!available) return
    load()
  }, [available, load])

  useEffect(() => {
    if (!open || embedded) return
    const closeOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setModelsOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open, embedded])

  useEffect(() => {
    // A brief belongs to the model it describes; never let a stale one be copied.
    setGuidanceResult(null)
    setCopied(false)
    setAgentCopied(false)
    if (!available || provider === undefined || modelId === undefined) {
      setGuidanceBusy(false)
      setGuidanceFailed(false)
      return
    }
    // Without a channel the diagnosis cannot run at all; saying so beats
    // rendering nothing, which reads as "this model needs no guidance".
    if (adapt === null) {
      setGuidanceBusy(false)
      setGuidanceFailed(true)
      return
    }
    let cancelled = false
    setGuidanceBusy(true)
    setGuidanceFailed(false)
    adapt.diagnose(provider, modelId).then((result) => {
      if (cancelled) return
      setGuidanceResult(result === null ? null : { value: result, revision })
      if (result !== null) setShowCustomGuidance(result.needsGuide)
      setGuidanceFailed(result === null)
      setGuidanceBusy(false)
    }, () => {
      if (cancelled) return
      setGuidanceResult(null)
      setGuidanceFailed(true)
      setGuidanceBusy(false)
    })
    return () => {
      cancelled = true
    }
  }, [adapt, available, provider, modelId, revision])

  if (!available) return null

  const close = (restoreFocus = false) => {
    setOpen(false)
    setModelsOpen(false)
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    if (modelsOpen) setModelsOpen(false)
    else close(true)
  }

  const chooseModel = async (provider: string, model: string, defaultEffort?: string) => {
    const live = directory.getSnapshot()
    if (live.status === 'loading' || live.status === 'selecting' || live.pending !== null) return
    if (live.current?.provider === provider && live.current.model === model) {
      setModelsOpen(false)
      return
    }
    const accepted = await select({
      provider,
      model,
      ...(defaultEffort === undefined ? {} : { reasoningEffort: defaultEffort }),
    })
    if (accepted) setModelsOpen(false)
  }

  const effortPanel = (
    <>
      {levels.length < 2 ? (
        <div className="re-effort-unavailable">{t('effort.unavailable')}</div>
      ) : null}
      {showGuidance ? (
        <div className="re-settings-guide">
          <strong>{t('guidance.settings.title')}</strong>
          <div className="re-settings-path">{t('guidance.settings.path')}</div>
          <div>{t('guidance.settings.note')}</div>
        </div>
      ) : null}
      {levels.length >= 2 ? (
        <div className="re-advanced">
          <EffortSlider directory={controller} t={t} locked={locked} sessionId={sessionId} turbo={turbo} />
        </div>
      ) : null}
      {showGuidance ? (
        <div className="re-adapt">
          <details className="re-adapt-advanced">
            <summary>{t('guidance.advanced')}</summary>
            <div className="re-adapt-warning" role="note">{t('guidance.manualRisk')}</div>
            <div ref={advancedBodyRef} style={guidance === null ? { minHeight: advancedHeight } : undefined} aria-busy={guidance === null && !guidanceFailed}>
              {guidance === null ? (
                <div className="re-adapt-desc" role="status">
                  {t(guidanceFailed ? 'guidance.unavailable' : 'guidance.checking')}
                </div>
              ) : guidance.needsGuide ? (
                <>
                  <div className="re-adapt-copy">
                    <div className="re-adapt-title">
                      {guidance.reason === 'missing' ? t('effort.unavailable') : t('guidance.mismatch')}
                    </div>
                    <div className="re-adapt-desc">
                      {guidance.matched
                        ? t('guidance.matched', {
                            expected: levelsText(guidance.expected, t),
                            current: levelsText(guidance.current, t),
                            note: localizedNote,
                          })
                        : t('guidance.unmatched', {
                            current: levelsText(guidance.current, t),
                            note: localizedNote,
                          })}
                    </div>
                  </div>
                  <div className="re-adapt-howto">{t('guidance.howto')}</div>
                  <div className="re-adapt-switch-intro">{t('guidance.switch.intro')}</div>
                  <ul className="re-adapt-switches">
                    <li>{t('guidance.switch.thinkingFormat')}</li>
                    <li>{t('guidance.switch.reasoningEffort')}</li>
                    <li>{t('guidance.switch.developerRole')}</li>
                    <li>{t('guidance.switch.replay')}</li>
                  </ul>
                  {localizedWarning === null ? null : (
                    <div className="re-adapt-warning">{localizedWarning}</div>
                  )}
                  <div className="re-adapt-label">{t('guidance.paste')}</div>
                  <pre className="re-adapt-yaml">{localizedSnippet}</pre>
                  <div className="re-adapt-steps">
                    <span>
                      {t('guidance.step1.open')}<code>{configDocumentName(guidance.settingsPath)}</code>
                      {guidance.settingsPath === null ? '' : t('guidance.step1.path', { path: guidance.settingsPath })}
                      {t('guidance.step1.find')}<code>{guidance.entryPath}</code>
                      {t('guidance.step1.list')}<code>{guidance.entryLine}</code>{t('guidance.step1.end')}
                    </span>
                    {guidance.mode === 'replace' ? (
                      <span>
                        {t('guidance.step2.replacePrefix')}<code>{guidance.entryLine}</code>
                        {t('guidance.step2.replaceSuffix')}
                      </span>
                    ) : (
                      <span>
                        {t('guidance.step2.insertPrefix')}<code>id</code>
                        {t('guidance.step2.insertSuffix')}
                      </span>
                    )}
                    <span>{t('guidance.step3')}</span>
                  </div>
                  <div className="re-adapt-actions">
                    <button
                      type="button"
                      className="re-adapt-apply"
                      disabled={busy || guidanceBusy}
                      onClick={() => {
                        void copyText(localizedSnippet).then((ok) => setCopied(ok))
                      }}
                    >
                      {copied ? t('guidance.copied') : t('guidance.copy')}
                    </button>
                    <button
                      type="button"
                      className="re-adapt-agent"
                      disabled={busy || guidanceBusy}
                      onClick={() => {
                        void copyText(agentBrief(guidance, agentTutorial(), t))
                          .then((ok) => setAgentCopied(ok))
                      }}
                    >
                      {agentCopied ? t('guidance.copied') : t('agent.copy')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="re-adapt-desc">{t('agent.customize')}</div>
                  <div className="re-adapt-actions">
                    <button
                      type="button"
                      className="re-adapt-agent"
                      disabled={busy || guidanceBusy}
                      onClick={() => {
                        void copyText(agentBrief(guidance, agentTutorial(), t))
                          .then((ok) => setAgentCopied(ok))
                      }}
                    >
                      {agentCopied ? t('guidance.copied') : t('agent.copy')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </details>
        </div>
      ) : null}
      {guidanceFailed && !showGuidance ? <div className="re-model-status" role="status">{t('guidance.unavailable')}</div> : null}
      {!embedded ? (<>
        <div className="re-menu-separator" />
        <button
          type="button"
          role="menuitem"
          className="re-model-row"
          disabled={busy}
          onClick={() => setModelsOpen(true)}
        >
          <span className="re-model-row-name">{modelLabel}</span>
          <span className="re-model-row-effort">{effortName}</span>
          <span className="re-row-chevron" aria-hidden="true">›</span>
        </button>
      </>) : null}
      {state.error === null ? null : <div className="re-model-error">{state.error}</div>}
    </>
  )

  if (embedded) return (
    <div className="re-native-effort" onKeyDown={(event) => {
      // Let the native shell handle Escape; range keys and Tab belong to this panel.
      if (event.key !== 'Escape') event.stopPropagation()
    }}>
      {effortPanel}
    </div>
  )

  return (
    <div ref={rootRef} className="re-model-root" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="re-model-trigger"
        aria-label={t('model.aria', { model: modelLabel, effort: effortName })}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${modelLabel} · ${effortName}`}
        disabled={locked}
        onClick={() => {
          if (open) close()
          else {
            setOpen(true)
            setModelsOpen(false)
            load()
          }
        }}
      >
        <svg className="re-model-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path d="M8 1.5 14 5 8 8.5 2 5 8 1.5ZM2 8l6 3.5L14 8M2 11l6 3.5 6-3.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        <span className="re-model-name">{modelLabel}</span>
        <span className="re-model-effort">{effortName}</span>
        <span className="re-model-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div ref={menuRef} className="re-model-menu" role="menu" aria-label={t('model.menuAria')} aria-busy={busy}>
          {modelsOpen ? (
            <div className="re-model-pane">
              <button type="button" className="re-model-back" onClick={() => setModelsOpen(false)}>
                <span aria-hidden="true">‹</span>
                <span>{t('model.select')}</span>
              </button>
              {state.status === 'loading' && state.groups.length === 0 ? (
                <div className="re-model-status">{t('model.loading')}</div>
              ) : null}
              {state.groups.map((group) => (
                <section key={group.id}>
                  <div className="re-model-group-title">{group.name}</div>
                  {group.models.map((model) => {
                    const selected = state.current?.provider === group.id && state.current.model === model.id
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className="re-model-option"
                        disabled={busy}
                        onClick={() => void chooseModel(group.id, model.id, model.reasoning?.defaultEffort)}
                      >
                        <span className="re-model-option-copy">
                          <span className="re-model-option-name">{model.name}</span>
                          {model.description === undefined ? null : (
                            <span className="re-model-option-desc">{model.description}</span>
                          )}
                        </span>
                        <span className="re-model-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                      </button>
                    )
                  })}
                </section>
              ))}
              {state.status === 'ready' && state.groups.every((group) => group.models.length === 0) ? (
                <div className="re-model-status">{t('model.none')}</div>
              ) : null}
              {state.error === null ? null : <div className="re-model-error">{state.error}</div>}
            </div>
          ) : (
            effortPanel
          )}
        </div>
      ) : null}
    </div>
  )
}

/** Render inside the host's native reasoning pane without a second trigger or menu. */
function NativeEffortPanel(props: ModelSeatProps) {
  return <AdvancedModelSelect {...props} embedded />
}

function ReasoningEffortSetting({ t }: PropsLocale<typeof NS>) {
  const enabled = useSyncExternalStore(enabledStore.subscribe, enabledStore.getSnapshot)

  return (
    <div className="re-setting-row">
      <div className="re-setting-copy">
        <div className="re-setting-title">{t('settings.effort.title')}</div>
        <div className="re-setting-description">{t('settings.effort.description')}</div>
      </div>
      <div className="re-setting-control">
        <span className="re-setting-state">{enabled ? t('settings.enabled') : t('settings.disabled')}</span>
        <button
          type="button"
          role="switch"
          aria-label={t('settings.effort.aria')}
          aria-checked={enabled}
          className={`re-setting-switch${enabled ? ' is-on' : ''}`}
          onClick={() => enabledStore.set(!enabled)}
        >
          <span className="re-setting-switch-knob" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function ChibiThumbSetting({ t }: PropsLocale<typeof NS>) {
  const sliderEnabled = useSyncExternalStore(enabledStore.subscribe, enabledStore.getSnapshot)
  const enabled = useSyncExternalStore(chibiThumbStore.subscribe, chibiThumbStore.getSnapshot)

  return (
    <div className="re-setting-row">
      <div className="re-setting-copy">
        <div className="re-setting-title">{t('settings.chibi.title')}</div>
        <div className="re-setting-description">{t('settings.chibi.description')}</div>
      </div>
      <div className="re-setting-control">
        <span className="re-setting-state">{enabled ? t('settings.enabled') : t('settings.disabled')}</span>
        <button
          type="button"
          role="switch"
          aria-label={t('settings.chibi.aria')}
          aria-checked={enabled}
          disabled={!sliderEnabled}
          className={`re-setting-switch${enabled ? ' is-on' : ''}`}
          onClick={() => chibiThumbStore.set(!enabled)}
        >
          <span className="re-setting-switch-knob" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/** Localized labels for the three energy skins. */
const SKIN_LABEL_KEYS: Record<Skin, ReasoningEffortLocaleKey> = {
  holo: 'skin.holo',
  chrome: 'skin.chrome',
  fluid: 'skin.fluid',
}

/**
 * Settings row that selects the slider's energy skin.
 *
 * The choice is applied instantly (local store) and persisted on the Host; a
 * failed write rolls the local store back so the next render matches the Host.
 */
function SkinSetting({ t }: PropsLocale<typeof NS>) {
  const sliderEnabled = useSyncExternalStore(enabledStore.subscribe, enabledStore.getSnapshot)
  const skin = useSyncExternalStore(skinStore.subscribe, skinStore.getSnapshot)
  const [busy, setBusy] = useState(false)
  const choose = (next: Skin) => {
    if (!sliderEnabled || busy || next === skin) return
    const previous = skin
    skinStore.set(next)
    if (turboService === null) return
    setBusy(true)
    void turboService.update({ skin: next }).then((value) => {
      setBusy(false)
      if (value === null) skinStore.set(previous)
    })
  }
  return (
    <div className="re-setting-row">
      <div className="re-setting-copy">
        <div className="re-setting-title">{t('settings.skin.title')}</div>
        <div className="re-setting-description">{t('settings.skin.description')}</div>
      </div>
      <div className="re-setting-control">
        <div className="re-skin-group" role="radiogroup" aria-label={t('settings.skin.aria')}>
          {SKINS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={skin === option}
              disabled={!sliderEnabled || busy}
              className={`re-skin-choice${skin === option ? ' is-active' : ''}`}
              onClick={() => choose(option)}
            >
              {t(SKIN_LABEL_KEYS[option])}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function apply(ctx: ClientContext) {
  const modelDirectories = ctx.get('modelDirectories') as ModelDirectoryResolver | undefined
  if (modelDirectories === undefined) return

  const connection = ctx.get('connection') as { rpc?: HostRpc } | undefined
  const adapt = makeAdaptationService(connection?.rpc)
  const turbo = makeTurboService(connection?.rpc)
  turboService = turbo
  // The persisted skin lives on the Host; the local cache only wins until the
  // first answer arrives (and when the Host half is absent).
  if (turbo !== null) {
    void turbo.state().then((snapshot) => {
      if (snapshot !== null) skinStore.set(snapshot.skin)
    })
  }
  if (adapt !== null) {
    ctx.effect(() => ctx.remote.$on('settings/document-updated', adapt.invalidate), 'whale-effort: settings updates')
    ctx.effect(() => ctx.remote.$on('llm/adapters-updated', adapt.invalidate), 'whale-effort: adapter updates')
    ctx.effect(() => ctx.remote.$on('credentials/record-updated', adapt.invalidate), 'whale-effort: credential updates')
    ctx.effect(() => ctx.remote.$on('credentials/reference-updated', adapt.invalidate), 'whale-effort: credential reference updates')
    ctx.on('connection/reset', adapt.invalidate)
  }
  const sessions = ctx.get('sessions') as { subagentAddress(sessionId: SessionId): unknown } | undefined
  if (sessions === undefined) return
  const locale = ctx.get('locale') as LocaleRuntimeLike | undefined

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'whale-effort: dictionaries')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-whale-effort'
    style.textContent = CSS + EFFECTS_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'whale-effort: styles')

  ctx.effect(() => {
    const syncStorage = (event: StorageEvent) => {
      if (event.key === ENABLED_STORAGE_KEY) {
        enabledStore.set(event.newValue !== 'false', false)
      } else if (event.key === CHIBI_THUMB_STORAGE_KEY) {
        chibiThumbStore.set(event.newValue === 'true', false)
      }
    }
    window.addEventListener('storage', syncStorage)
    return () => window.removeEventListener('storage', syncStorage)
  }, 'whale-effort: preference sync')

  ctx.slots.inject(SETTINGS_SLOT, () =>
    ctx.slots.register(
      { name: SETTINGS_SLOT, id: 'whale-effort-enabled', order: 15, locale: NS },
      ReasoningEffortSetting,
    ),
  )

  ctx.slots.inject(SETTINGS_SLOT, () =>
    ctx.slots.register(
      { name: SETTINGS_SLOT, id: 'whale-effort-chibi-thumb', order: 16, locale: NS },
      ChibiThumbSetting,
    ),
  )

  ctx.slots.inject(SETTINGS_SLOT, () =>
    ctx.slots.register(
      { name: SETTINGS_SLOT, id: 'whale-effort-skin', order: 17, locale: NS },
      SkinSetting,
    ),
  )

  ctx.slots.inject(SLOT, () => {
    const inject = (sessionId: string) => {
      const controller = modelDirectories.directoryFor(sessionId as SessionId)
      const canSelect = () => sessions.subagentAddress(sessionId as SessionId) === undefined
      return {
        available: canSelect(), controller, directory: controller.store,
        load: () => canSelect() ? controller.load().then(() => undefined, () => undefined) : undefined,
        select: (selection: ModelSelection) => canSelect()
          ? controller.select(selection).then(result => result.ok, () => false) : Promise.resolve(false),
        adapt,
        sessionId: sessionId as SessionId,
        turbo,
        agentTutorial: () => locale?.getLocale().active === 'zh' ? agentTutorialZh : agentTutorialEn,
      }
    }
    let restore: (() => void) | undefined
    let fallback: (() => void) | undefined
    let nativeEntry: ReturnType<typeof ctx.slots.entries>[number] | undefined
    let syncing = false
    let stopped = false
    // Register/dispose a lower-priority seat to publish the changed live entry
    // through the registry's normal version/subscription mechanism.
    const notify = () => ctx.slots.register({ name: SLOT, priority: 1_000_000 }, () => null)()
    const sync = () => {
      if (syncing || stopped) return
      syncing = true
      try {
        if (!enabledStore.getSnapshot()) {
          restore?.(); restore = undefined
          fallback?.(); fallback = undefined
          return
        }
        if (restore && nativeEntry && ctx.slots.entries(SLOT).includes(nativeEntry)) return
        restore?.(); restore = undefined
        nativeEntry = undefined
        const entry = ctx.slots.entries?.(SLOT).find(entry => entry.locale === 'model'
          && entry.children?.['conversation.input.model.label'] !== undefined
          && typeof entry.component === 'function')
        if (entry) {
          fallback?.(); fallback = undefined
          nativeEntry = entry
          const original = entry.component
          function BoundNativeEffortPanel(props: Parameters<Parameters<typeof wrapNativeSelector>[0]>[0]) {
            const sessionId = props.sessionId as string
            // Native directory snapshots rerender the wrapper. Keep callback
            // identities stable or the panel's load effect feeds back into it.
            const injected = useMemo(() => inject(sessionId), [sessionId, props.directory])
            return <NativeEffortPanel {...injected}
              available={sessions!.subagentAddress(sessionId as SessionId) === undefined}
              locked={props.locked} t={ctx.locale.bind(NS)} />
          }
          const wrapped = wrapNativeSelector(original as Parameters<typeof wrapNativeSelector>[0], props => (
            <BoundNativeEffortPanel {...props} />
          ))
          entry.component = wrapped
          restore = () => {
            if (entry.component === wrapped) { entry.component = original; notify() }
          }
          notify()
        } else if (!fallback) {
          fallback = ctx.slots.register({ name: SLOT, priority: -100, locale: NS, inject }, AdvancedModelSelect)
        }
      } finally { syncing = false }
    }
    const stopWatching = ctx.on('slots/changed', key => { if (key === SLOT) sync() })
    const unsubscribe = enabledStore.subscribe(sync)
    sync()
    return () => {
      stopped = true
      unsubscribe(); stopWatching()
      restore?.(); fallback?.()
    }
  })
}
