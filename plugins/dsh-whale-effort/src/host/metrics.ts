/**
 * Token-rate statistics for a fleet of agents.
 *
 * Pure computation: no timers, no I/O, no module-level mutable state.
 *
 * What is measured
 * - `gen`: estimated generated tokens per second over the recent window, rounded.
 * - `rate`: generated plus billable input tokens per second over the window.
 * - `total`: generated-plus-input tokens accumulated since `reset()`.
 * - `agents`: current member count.
 * - `generating`: members that produced a generated delta within the breath window.
 *
 * Why the accounting works this way (read before changing it)
 *
 * 1. Streaming chunks carry characters, not token counts, so generation rate is
 *    estimated: one CJK code point is about one token, four other characters are
 *    about one token. A `usage` frame carries exact counts but arrives once per
 *    call without a window timestamp. So rates only consume timestamped
 *    estimates, while `total` is calibrated per agent with
 *    `max(estimate, sum of usage.outputTokens)` — taking the max instead of
 *    adding prevents double counting the same tokens.
 * 2. `rate` includes billable input tokens: that is what the user pays for in a
 *    given second. Cached reads are excluded by default (`includeCacheReads`
 *    restores them); cache writes are already inside `inputTokens`.
 * 3. Only members are measured. Non-member chunks are dropped at ingest without
 *    creating state, so they never reach any counter.
 * 4. No timers: window expiry is pruned lazily during ingest and sample. Each
 *    agent keeps only windowed events (bounded by {@link MAX_EVENTS_PER_AGENT}),
 *    and departing members fold their totals into retired buckets, so memory
 *    does not grow with time and `total` still means "since reset()".
 * 5. No path returns NaN, Infinity, or a negative number: every outward count
 *    passes through the same integer coercion.
 *
 * @module dsh-whale-effort/host/metrics
 */

/** Rate window: short enough to react, long enough not to flicker. */
const DEFAULT_WINDOW_MS = 1_500

/** Breath-light window: slightly shorter than the rate window so it drops early. */
const DEFAULT_GENERATING_MS = 800

/**
 * Hard cap on windowed events per agent. Healthy streaming never produces
 * hundreds of chunks inside one window; under pathological frequency, prefer an
 * undercounted rate over unbounded memory.
 */
const MAX_EVENTS_PER_AGENT = 2_048

/** @returns whether one code point counts as a CJK token. */
function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3000 && codePoint <= 0x30ff)
    || (codePoint >= 0x3400 && codePoint <= 0x4dbf)
    || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xff00 && codePoint <= 0xffef)
    || codePoint >= 0x20000
  )
}

/**
 * Estimate the token count of one text fragment.
 *
 * CJK code points count one token each; every other character costs a quarter
 * token, rounded up per fragment. Iteration is by code point, so surrogate
 * pairs are one character.
 * @param text - model-visible fragment, of any runtime shape.
 * @returns a non-negative integer token estimate.
 */
export function estimateTokens(text: unknown): number {
  if (typeof text !== 'string' || text.length === 0) return 0
  let cjk = 0
  let other = 0
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0
    if (isCjkCodePoint(codePoint)) cjk += 1
    else other += 1
  }
  return cjk + Math.ceil(other / 4)
}

/** Coerce one outward count to a finite non-negative integer. */
function toCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
}

/** Narrow a stream chunk (opaque runtime data) to a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `windowMs` must be a finite positive number or rates divide by zero. */
function readWindowMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : DEFAULT_WINDOW_MS
}

/** `generatingMs` also accepts zero (meaning "exactly now"). */
function readGeneratingMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : DEFAULT_GENERATING_MS
}

/** One chunk's contribution to the counters. */
interface ChunkDelta {
  /** Estimated generated tokens. */
  readonly gen: number
  /** Exact output tokens from a usage frame. */
  readonly out: number
  /** Billable input tokens from a usage frame. */
  readonly input: number
}

/**
 * Parse one stream chunk into its counter contribution.
 * @param chunk - chunk value from the assistant stream.
 * @param includeCacheReads - whether cached input counts toward input tokens.
 * @returns the delta, or `null` for unknown/malformed/empty frames.
 */
export function readChunkDelta(chunk: unknown, includeCacheReads: boolean): ChunkDelta | null {
  if (!isRecord(chunk)) return null
  const type = chunk['type']

  if (type === 'text-delta' || type === 'reasoning-delta') {
    const gen = estimateTokens(chunk['text'])
    return gen > 0 ? { gen, out: 0, input: 0 } : null
  }

  if (type === 'tool-call-delta') {
    const gen = estimateTokens(chunk['argumentsDelta'])
    return gen > 0 ? { gen, out: 0, input: 0 } : null
  }

  if (type === 'usage') {
    const usage = chunk['usage']
    if (!isRecord(usage)) return null
    const out = toCount(usage['outputTokens'])
    const billed = toCount(usage['inputTokens'])
    const cacheRead = includeCacheReads ? 0 : toCount(usage['cacheReadTokens'])
    const input = Math.max(0, billed - cacheRead)
    return out > 0 || input > 0 ? { gen: 0, out, input } : null
  }

  return null
}

/** One timestamped window event. */
interface WindowEvent {
  readonly t: number
  readonly gen: number
  readonly input: number
}

/** Per-agent accumulated state. */
interface AgentState {
  /** Sum of estimated generated tokens. */
  estGen: number
  /** Sum of exact usage output tokens. */
  usageOut: number
  /** Sum of billable input tokens. */
  inputTotal: number
  /** Windowed events only. */
  events: WindowEvent[]
  /** Time of the most recent generated delta, for the breath light. */
  lastGenAt: number | null
  /** Greatest observed activity time, used to reclaim retired state. */
  lastTouchedAt: number
  /** Set after a time reversal, so the next prune filters the whole list. */
  unordered: boolean
}

/** One outward fleet sample. */
export interface FleetSample {
  /** Generated plus input tokens per second over the window. */
  readonly rate: number
  /** Generated tokens per second over the window. */
  readonly gen: number
  /** Current member count. */
  readonly agents: number
  /** Members that generated within the breath window. */
  readonly generating: number
  /** Accumulated tokens since the last reset. */
  readonly total: number
}

/** Meter construction options. */
export interface FleetMeterOptions {
  /** Rate window in milliseconds. @default 1500 */
  readonly windowMs?: number
  /** Breath-light window in milliseconds. @default 800 */
  readonly generatingMs?: number
  /** Count cached input tokens. @default false */
  readonly includeCacheReads?: boolean
  /** Clock injection for tests. @default Date.now */
  readonly now?: () => number
}

/** A fleet meter; one instance owns all of its state. */
export interface FleetMeter {
  /** Replace the member set; ids may be a string, number, or iterable of either. */
  setMembers(ids: Iterable<unknown> | unknown): void
  /** Record one stream chunk for a member agent; non-members and unknown frames are dropped. */
  ingest(agentId: unknown, chunk: unknown, atMs?: number): void
  /** Sample the counters, pruning expired window state first. */
  sample(): FleetSample
  /** Drop all state, including members and retired totals. */
  reset(): void
  /** Release state; later calls are no-ops and `sample()` returns zeros. */
  dispose(): void
}

/**
 * Create a fleet meter.
 * @param options - window lengths, cache-read inclusion, and clock injection.
 * @returns the meter.
 */
export function createFleetMeter(options: FleetMeterOptions = {}): FleetMeter {
  const windowMs = readWindowMs(options.windowMs)
  const generatingMs = readGeneratingMs(options.generatingMs)
  const includeCacheReads = options.includeCacheReads === true
  const readClock = typeof options.now === 'function' ? options.now : () => Date.now()

  let states = new Map<string, AgentState>()
  let members = new Set<string>()
  // Totals of members that left: they stay part of "since reset" without keeping state alive.
  let retiredGen = 0
  let retiredInput = 0
  let disposed = false

  /** Read the clock, coercing a broken injected clock to a finite value. */
  function clockMs(): number {
    const now = Number(readClock())
    return Number.isFinite(now) ? now : Date.now()
  }

  /** Get or create the state for one member. */
  function stateFor(agentId: string, atMs: number): AgentState {
    let state = states.get(agentId)
    if (state === undefined) {
      state = { estGen: 0, usageOut: 0, inputTotal: 0, events: [], lastGenAt: null, lastTouchedAt: atMs, unordered: false }
      states.set(agentId, state)
    }
    return state
  }

  /** Keep only events inside the window, bounded in count. */
  function pruneEvents(state: AgentState, referenceMs: number): void {
    const cutoff = referenceMs - windowMs
    if (state.unordered) {
      state.events = state.events.filter((event) => event.t >= cutoff)
      state.unordered = false
    } else {
      while (state.events.length > 0 && (state.events[0]?.t ?? 0) < cutoff) state.events.shift()
    }
    if (state.events.length > MAX_EVENTS_PER_AGENT) {
      state.events.splice(0, state.events.length - MAX_EVENTS_PER_AGENT)
    }
  }

  /** Fold one departing state into the retired totals without changing `total`. */
  function retire(state: AgentState): void {
    retiredGen += Math.max(state.estGen, state.usageOut)
    retiredInput += state.inputTotal
  }

  /** Reclaim non-member states whose last activity left every window. */
  function sweepRetired(referenceMs: number): void {
    const ttl = Math.max(windowMs, generatingMs)
    for (const [agentId, state] of states) {
      if (members.has(agentId)) continue
      if (referenceMs - state.lastTouchedAt <= ttl) continue
      retire(state)
      states.delete(agentId)
    }
  }

  function ingest(agentId: unknown, chunk: unknown, atMs?: number): void {
    if (disposed) return
    if (typeof agentId !== 'string' || !members.has(agentId)) return
    const delta = readChunkDelta(chunk, includeCacheReads)
    if (delta === null) return
    const at = typeof atMs === 'number' && Number.isFinite(atMs) ? atMs : clockMs()
    const state = stateFor(agentId, at)
    pruneEvents(state, at)
    if (at < state.lastTouchedAt) state.unordered = true
    state.lastTouchedAt = Math.max(state.lastTouchedAt, at)

    if (delta.gen > 0) {
      state.estGen += delta.gen
      state.lastGenAt = at
      state.events.push({ t: at, gen: delta.gen, input: 0 })
    }
    if (delta.out > 0) {
      state.usageOut += delta.out
      state.lastGenAt = at
    }
    if (delta.input > 0) {
      state.inputTotal += delta.input
      state.events.push({ t: at, gen: 0, input: delta.input })
    }
  }

  function sample(): FleetSample {
    if (disposed) return { rate: 0, gen: 0, agents: 0, generating: 0, total: 0 }
    const at = clockMs()
    sweepRetired(at)

    let windowGenEst = 0
    let windowInput = 0
    let genTotal = 0
    let inputTotal = 0
    let generating = 0

    for (const [agentId, state] of states) {
      pruneEvents(state, at)
      genTotal += Math.max(state.estGen, state.usageOut)
      inputTotal += state.inputTotal
      if (!members.has(agentId)) continue
      let est = 0
      let input = 0
      for (const event of state.events) {
        est += event.gen
        input += event.input
      }
      windowGenEst += est
      windowInput += input
      if (state.lastGenAt !== null && at - state.lastGenAt <= generatingMs) generating += 1
    }

    const windowSeconds = windowMs / 1000
    return {
      rate: toCount((windowGenEst + windowInput) / windowSeconds),
      gen: toCount(windowGenEst / windowSeconds),
      agents: members.size,
      generating,
      total: toCount(retiredGen + retiredInput + genTotal + inputTotal),
    }
  }

  function setMembers(ids: Iterable<unknown> | unknown): void {
    if (disposed) return
    const next = new Set<string>()
    if (typeof ids === 'string') {
      if (ids.length > 0) next.add(ids)
    } else if (ids !== null && ids !== undefined && typeof (ids as Iterable<unknown>)[Symbol.iterator] === 'function') {
      for (const value of ids as Iterable<unknown>) {
        if (typeof value === 'string' && value.length > 0) next.add(value)
      }
    }
    members = next
  }

  function reset(): void {
    if (disposed) return
    states = new Map()
    members = new Set()
    retiredGen = 0
    retiredInput = 0
  }

  function dispose(): void {
    disposed = true
    states = new Map()
    members = new Set()
    retiredGen = 0
    retiredInput = 0
  }

  return { setMembers, ingest, sample, reset, dispose }
}
