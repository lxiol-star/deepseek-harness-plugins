import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import type { ModelDirectory, ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { ReasoningEffortTranslate } from './locales.js'

export interface EffortLevel {
  readonly id: string
  readonly name: string
}

export type EffortSelection = ModelSelection & { readonly reasoningEffort: string }

export function currentModel(state: ModelDirectoryState) {
  const current = state.current
  return state.groups.find((group) => group.id === current?.provider)
    ?.models.find((model) => model.id === current?.model)
}

export function sliderLevels(state: ModelDirectoryState): readonly EffortLevel[] {
  const efforts = currentModel(state)?.reasoning?.efforts
  return efforts !== undefined && efforts.length >= 2 ? efforts : []
}

export function effortIndex(levels: readonly EffortLevel[], id: string | undefined): number {
  return levels.findIndex((level) => level.id === id)
}

export function clampIndex(value: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.round(value)))
}

function sameModel(current: ModelSelection | null, target: ModelSelection): boolean {
  return current?.provider === target.provider && current.model === target.model
}

/** Stop waiting locally; the directory API cannot cancel an already-sent RPC. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value) },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(error) },
    )
    if (signal.aborted) {
      signal.removeEventListener('abort', abort)
      abort()
    }
  })
}

/** An RPC acknowledgement can arrive before the durable selection projection. */
function waitForSelection(
  directory: ModelDirectory,
  target: EffortSelection,
  signal: AbortSignal,
  t: ReasoningEffortTranslate,
  timeoutMs: number,
): Promise<ModelDirectoryState> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = (state?: ModelDirectoryState, error?: unknown) => {
      if (settled) return
      settled = true
      unsubscribe()
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      if (state !== undefined) resolve(state)
      else reject(error)
    }
    const abort = () => finish(undefined, signal.reason)
    const check = () => {
      if (signal.aborted) return abort()
      const state = directory.store.getSnapshot()
      if (state.pending !== null && (
        !sameModel(state.pending, target) || state.pending.reasoningEffort !== target.reasoningEffort
      )) {
        finish(undefined, new Error(t('effort.selectionChanged')))
      } else if (state.current !== null && !sameModel(state.current, target)) {
        finish(undefined, new Error(t('effort.modelChanged')))
      } else if (state.status === 'error') {
        finish(undefined, new Error(state.error ?? t('effort.unconfirmed')))
      } else if (sameModel(state.current, target) && state.status === 'ready' && state.pending === null) {
        if (effortIndex(currentModel(state)?.reasoning?.efforts ?? [], target.reasoningEffort) < 0) {
          finish(undefined, new Error(t('effort.unsupported', { effort: target.reasoningEffort })))
        } else if (state.current?.reasoningEffort === target.reasoningEffort) {
          finish(state)
        }
      }
    }
    unsubscribe = directory.store.subscribe(check)
    signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => finish(undefined, new Error(t('effort.unconfirmed'))), timeoutMs)
    check()
  })
}

/** Revalidate a captured route and effort ID, never a position in a new catalog. */
export async function selectEffort(
  directory: ModelDirectory,
  target: EffortSelection,
  signal: AbortSignal,
  t: ReasoningEffortTranslate,
  timeoutMs = 5000,
): Promise<ModelDirectoryState> {
  signal.throwIfAborted()
  const initial = directory.store.getSnapshot()
  const originalEffort = initial.current?.reasoningEffort
  if (!sameModel(initial.current, target)) throw new Error(t('effort.modelChanged'))
  if (initial.status === 'loading' || initial.status === 'selecting' || initial.pending !== null) {
    throw new Error(t('effort.busy'))
  }

  const fresh = await abortable(directory.load(), signal)
  signal.throwIfAborted()
  // load() returns a snapshot; a newer selection can start before this continuation.
  for (const state of [fresh, directory.store.getSnapshot()]) {
    if (!sameModel(state.current, target)) throw new Error(t('effort.modelChanged'))
    if (state.status === 'error') throw new Error(state.error ?? t('effort.unconfirmed'))
    if (state.status !== 'ready' || state.pending !== null) throw new Error(t('effort.busy'))
    if (state.current?.reasoningEffort !== originalEffort) {
      throw new Error(t('effort.selectionChanged'))
    }
    if (effortIndex(currentModel(state)?.reasoning?.efforts ?? [], target.reasoningEffort) < 0) {
      throw new Error(t('effort.unsupported', { effort: target.reasoningEffort }))
    }
  }

  const result = await abortable(directory.select(target), signal)
  signal.throwIfAborted()
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return waitForSelection(directory, target, signal, t, timeoutMs)
}

/** Display-only tier appended after the model's real levels. */
export const ULTRA_DISPLAY_ID = 'ultra'

/** One entry of the slider's display scale: a real level or the appended Ultra tier. */
export interface DisplayLevel {
  readonly id: string
  readonly name: string
  readonly ultra: boolean
}

/** Effort ids that denote a real ceiling tier Ultra can pin. */
const CEILING_EFFORTS: ReadonlySet<string> = new Set(['xhigh', 'max'])

/**
 * Whether a model's effort scale can carry the appended Ultra tier.
 *
 * Ultra is only offered when the model's highest real level is already a
 * ceiling tier (`xhigh` / `max`): then "Ultra" means "stay at the real MAX and
 * add the rigor policy". Models whose scale tops out lower (for example
 * `low`/`medium`/`high`) get a plain real-level slider with no Ultra entry, so
 * the track adapts to what the model actually exposes.
 * @param levels - the model's real effort levels, in directory order.
 * @returns whether the display scale appends Ultra.
 */
export function supportsUltra(levels: readonly EffortLevel[]): boolean {
  if (levels.length < 2) return false
  const top = levels[levels.length - 1]
  return top !== undefined && CEILING_EFFORTS.has(top.id.trim().toLowerCase())
}

/**
 * Build the display scale: the model's real levels plus, when the model can
 * carry it, a trailing Ultra entry.
 *
 * Ultra is presentation-only. Committing it writes the model's highest real
 * effort id (see {@link effortIdForDisplay}); it never reaches the model
 * directory as an effort value of its own.
 * @param levels - the model's real effort levels, in directory order.
 * @returns the display scale; identical to `levels` when Ultra does not apply.
 */
export function displayLevels(levels: readonly EffortLevel[]): readonly DisplayLevel[] {
  const real = levels.map((level) => ({ id: level.id, name: level.name, ultra: false }))
  if (!supportsUltra(levels)) return real
  return [...real, { id: ULTRA_DISPLAY_ID, name: 'Ultra', ultra: true }]
}

/** Whether the display scale carries the appended Ultra tier. */
export function hasUltra(levels: readonly EffortLevel[]): boolean {
  return supportsUltra(levels)
}

/**
 * Map a persisted real effort id (plus the session's Ultra flag) to a display index.
 * @param levels - the model's real effort levels.
 * @param id - the session's committed real effort id.
 * @param ultra - whether the session is in Ultra mode.
 * @returns the display index, or -1 when the id is not in the scale.
 */
export function displayIndexFor(levels: readonly EffortLevel[], id: string | undefined, ultra: boolean): number {
  const index = effortIndex(levels, id)
  if (index < 0) return -1
  return ultra && hasUltra(levels) && index === levels.length - 1 ? levels.length : index
}

/**
 * Resolve the real effort id a display index commits.
 * @param levels - the model's real effort levels.
 * @param index - a display index (0 .. displayLevels(levels).length - 1).
 * @returns the real effort id, or undefined when the index is out of range.
 */
export function effortIdForDisplay(levels: readonly EffortLevel[], index: number): string | undefined {
  const count = displayLevels(levels).length
  if (index < 0 || index >= count) return undefined
  return index === levels.length && hasUltra(levels) ? levels[levels.length - 1]?.id : levels[index]?.id
}

/** Whether a display index is the appended Ultra tier. */
export function isUltraIndex(levels: readonly EffortLevel[], index: number): boolean {
  return hasUltra(levels) && index === levels.length
}
