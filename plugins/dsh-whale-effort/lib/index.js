// src/host/knowledge.ts
var BUILTIN_ENTRIES = [
  {
    id: "glm-5.2",
    provider: "*",
    model: "glm-5.2",
    noteKey: "glm52",
    efforts: {
      minimal: "minimal",
      low: "low",
      medium: "medium",
      high: "high"
    },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true }
  },
  {
    id: "kimi-k3",
    provider: "*",
    model: "kimi/kimi-k3",
    noteKey: "kimiK3",
    efforts: {
      low: "low",
      high: "high",
      max: "max"
    },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true }
  },
  {
    id: "kimi-k3-plain",
    provider: "*",
    model: "kimi-k3",
    noteKey: "kimiK3",
    efforts: {
      low: "low",
      high: "high",
      max: "max"
    },
    compat: { thinkingFormat: "openai", supportsReasoningEffort: true }
  }
];
function patternRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*");
  return new RegExp(`^${escaped}$`, "u");
}
function matchEntry(entries, provider, model) {
  let best;
  let bestScore = -1;
  for (const entry of entries) {
    if (!patternRegExp(entry.provider).test(provider)) continue;
    if (!patternRegExp(entry.model).test(model)) continue;
    const score = (entry.provider.includes("*") ? 0 : 1) + (entry.model.includes("*") ? 0 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}
function displayLevels(entry) {
  return Object.entries(entry.efforts).filter(([, wire]) => wire !== null).map(([level]) => level);
}

// src/host/guidance.ts
var LLM_NS = "llm-pi-ai";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readConfig(value) {
  if (!isRecord(value)) return {};
  return {
    ...value["entries"] === void 0 ? {} : { entries: value["entries"] },
    ...value["statePath"] === void 0 ? {} : { statePath: value["statePath"] }
  };
}
function isUsableEntry(value) {
  if (!isRecord(value)) return false;
  if (typeof value["id"] !== "string" || typeof value["provider"] !== "string" || typeof value["model"] !== "string") return false;
  if (typeof value["note"] !== "string") return false;
  const noteKey = value["noteKey"];
  if (noteKey !== void 0 && noteKey !== "glm52" && noteKey !== "kimiK3") return false;
  const efforts = value["efforts"];
  if (!isRecord(efforts)) return false;
  for (const wire of Object.values(efforts)) {
    if (wire !== null && typeof wire !== "string") return false;
  }
  const compat = value["compat"];
  if (compat !== void 0) {
    if (!isRecord(compat)) return false;
    if (compat["thinkingFormat"] !== void 0 && typeof compat["thinkingFormat"] !== "string") return false;
    if (compat["supportsReasoningEffort"] !== void 0 && typeof compat["supportsReasoningEffort"] !== "boolean") return false;
  }
  return true;
}
function configuredEntries(config) {
  const raw = config.entries;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isUsableEntry);
}
function knowledgeOf(user) {
  return [...user, ...BUILTIN_ENTRIES];
}
function fieldBlock(entry, modelIndent) {
  const fieldPrefix = " ".repeat(modelIndent + 2);
  const valuePrefix = " ".repeat(modelIndent + 4);
  const lines = [`${fieldPrefix}reasoningEfforts:`];
  for (const [level, wire] of Object.entries(entry.efforts)) {
    lines.push(`${valuePrefix}${level}: ${wire === null ? "" : JSON.stringify(wire)}`);
  }
  if (entry.compat !== void 0 && Object.keys(entry.compat).length > 0) {
    lines.push(`${fieldPrefix}compat:`);
    if (entry.compat.thinkingFormat !== void 0) lines.push(`${valuePrefix}thinkingFormat: ${JSON.stringify(entry.compat.thinkingFormat)}`);
    if (entry.compat.supportsReasoningEffort !== void 0) {
      lines.push(`${valuePrefix}supportsReasoningEffort: ${String(entry.compat.supportsReasoningEffort)}`);
    }
  }
  return lines.join("\n");
}
var ENTRY_SCALAR_KEYS = /* @__PURE__ */ new Set(["id", "name", "contextWindow", "maxTokens"]);
function entryHead(existing, model, modelIndent) {
  const itemPrefix = " ".repeat(modelIndent);
  const fieldPrefix = " ".repeat(modelIndent + 2);
  if (existing === void 0) return { lines: [`${itemPrefix}- id: ${model}`], complete: true };
  const extra = Object.keys(existing).filter((key) => !ENTRY_SCALAR_KEYS.has(key));
  const lines = [`${itemPrefix}- id: ${typeof existing["id"] === "string" ? existing["id"] : model}`];
  const name2 = existing["name"];
  const contextWindow = existing["contextWindow"];
  const maxTokens = existing["maxTokens"];
  if (typeof name2 === "string" && name2.length > 0) lines.push(`${fieldPrefix}name: ${JSON.stringify(name2)}`);
  if (typeof contextWindow === "number") lines.push(`${fieldPrefix}contextWindow: ${String(contextWindow)}`);
  if (typeof maxTokens === "number") lines.push(`${fieldPrefix}maxTokens: ${String(maxTokens)}`);
  return { lines, complete: extra.length === 0 };
}
function createGuidance(options) {
  const userEntries = configuredEntries(options.config);
  const entries = knowledgeOf(userEntries);
  const usesProfileConfig = typeof options.settings?.register !== "function";
  let settingsPathPromise;
  const settingsPath = () => {
    const settings = options.settings;
    if (settings === void 0) return Promise.resolve(void 0);
    settingsPathPromise ??= settings.prepareDocument().catch(() => void 0);
    return settingsPathPromise;
  };
  async function currentLevels(provider, model) {
    const llm = options.llm;
    if (llm === void 0) throw new Error("model directory unavailable");
    try {
      const info = await llm.resolveModelInfo(provider, model);
      return (info.reasoning?.efforts ?? []).map((effort) => effort.id);
    } catch {
      return [];
    }
  }
  function userDeclaredModel(provider, model) {
    const settings = options.settings;
    if (settings === void 0) throw new Error("settings service unavailable");
    const descriptor = settings.describe().find((row) => row.ns === LLM_NS);
    const user = descriptor?.user;
    const providers = isRecord(user) && isRecord(user["providers"]) ? user["providers"] : {};
    const route = isRecord(providers[provider]) ? providers[provider] : void 0;
    const models = route !== void 0 && Array.isArray(route["models"]) ? route["models"] : void 0;
    const entry = models?.find((candidate) => isRecord(candidate) && candidate["id"] === model);
    const name2 = entry?.["name"];
    return {
      declared: entry !== void 0,
      entryLine: entry === void 0 ? `- id: ${model}` : `- id: ${model}${typeof name2 === "string" && name2.length > 0 ? `  # ${name2}` : ""}`,
      entry
    };
  }
  function endpointWarning(provider) {
    try {
      const settings = options.settings;
      if (settings === void 0) return null;
      const section = settings.describe().find((row) => row.ns === LLM_NS)?.value;
      if (!isRecord(section) || !isRecord(section["providers"])) return null;
      const route = section["providers"][provider];
      const baseURL = isRecord(route) && typeof route["baseURL"] === "string" ? route["baseURL"] : "";
      if (baseURL.includes("maas.aliyuncs.com") || baseURL.includes("dashscope.aliyuncs.com")) return "developerRole";
      return null;
    } catch {
      return null;
    }
  }
  async function diagnose(provider, model) {
    const entry = matchEntry(entries, provider, model);
    const current = await currentLevels(provider, model);
    const expected = entry === void 0 ? [] : displayLevels(entry);
    const { declared, entryLine, entry: userEntry } = userDeclaredModel(provider, model);
    const path = await settingsPath();
    let reason = "none";
    if (userEntry?.["reasoningEfforts"] !== false && current.length === 0) reason = "missing";
    const needsGuide = declared && reason !== "none";
    const modelIndent = usesProfileConfig ? 10 : 8;
    const block = entry === void 0 ? null : fieldBlock(entry, modelIndent);
    const head = entryHead(userEntry, model, modelIndent);
    const mode = head.complete ? "replace" : "insert";
    const builtIn = entry !== void 0 && BUILTIN_ENTRIES.includes(entry);
    const noteKey = builtIn ? entry.noteKey ?? null : null;
    const note = entry !== void 0 && !builtIn ? entry.note ?? null : null;
    return {
      provider,
      model,
      userDeclared: declared,
      needsGuide,
      reason,
      current,
      expected,
      matched: entry !== void 0,
      mode,
      noteKey,
      note,
      warning: endpointWarning(provider),
      entryHead: head.complete ? head.lines.join("\n") : null,
      fieldBlock: block,
      entryLine,
      entryPath: usesProfileConfig ? `[id: ${LLM_NS}].config.providers.${provider}.models` : `${LLM_NS}.providers.${provider}.models`,
      modelIndent,
      settingsPath: path ?? null
    };
  }
  return {
    entries: () => userEntries,
    diagnose
  };
}

// src/host/state.ts
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
var SKINS = Object.freeze(["holo", "chrome", "fluid"]);
var DEFAULT_SKIN = "fluid";
var STATE_VERSION = 1;
var STATE_FILE_NAME = "dsh-whale-effort.json";
var STORAGES_DIR_NAME = "storages";
var DSH_HOME_DIR_NAME = ".dsh";
var DSH_HOME_ENV = "DSH_HOME";
var MAX_TRACKED_SESSIONS = 40;
var MAX_SESSION_ID_LENGTH = 256;
var SESSION_ID_PATTERN = /^[^\u0000-\u001f\u007f]+$/u;
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function normalizeSkin(value) {
  return typeof value === "string" && SKINS.includes(value) ? value : DEFAULT_SKIN;
}
function isSessionId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_SESSION_ID_LENGTH && SESSION_ID_PATTERN.test(value);
}
function emptyState() {
  return { version: STATE_VERSION, skin: DEFAULT_SKIN, sessions: {} };
}
function boundSessions(sessions) {
  const entries = Object.entries(sessions);
  const kept = entries.length > MAX_TRACKED_SESSIONS ? entries.slice(-MAX_TRACKED_SESSIONS) : entries;
  const out = {};
  for (const [id, flags] of kept) out[id] = { lightning: flags.lightning, ultra: flags.ultra };
  return out;
}
function normalizeState(raw) {
  if (!isRecord2(raw)) return emptyState();
  const sessions = {};
  const source = raw["sessions"];
  if (isRecord2(source)) {
    for (const [id, value] of Object.entries(source)) {
      if (!isSessionId(id) || !isRecord2(value)) continue;
      sessions[id] = { lightning: value["lightning"] === true, ultra: value["ultra"] === true };
    }
  }
  return { version: STATE_VERSION, skin: normalizeSkin(raw["skin"]), sessions: boundSessions(sessions) };
}
function expandHomePath(value) {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}
function resolveDshHome(configured, env = process.env) {
  const explicit = typeof configured === "string" ? configured.trim() : "";
  const fromEnv = typeof env[DSH_HOME_ENV] === "string" ? env[DSH_HOME_ENV].trim() : "";
  const selected = explicit.length > 0 ? explicit : fromEnv.length > 0 ? fromEnv : join(homedir(), DSH_HOME_DIR_NAME);
  return resolve(expandHomePath(selected));
}
function resolveStatePath(configured, env = process.env) {
  const explicit = typeof configured === "string" ? configured.trim() : "";
  if (explicit.length > 0) {
    const expanded = resolve(expandHomePath(explicit));
    return expanded.endsWith(".json") ? expanded : join(expanded, STORAGES_DIR_NAME, STATE_FILE_NAME);
  }
  return join(resolveDshHome(void 0, env), STORAGES_DIR_NAME, STATE_FILE_NAME);
}
function readDocument(path, log) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    const code = error?.code;
    if (code !== "ENOENT") log(`state file unreadable, using defaults: ${describeError(error)}`);
    return emptyState();
  }
  try {
    return normalizeState(JSON.parse(text));
  } catch (error) {
    log(`state file is not valid JSON, using defaults: ${describeError(error)}`);
    return emptyState();
  }
}
function createStateFile(options) {
  const { path } = options;
  const log = options.log ?? (() => {
  });
  let chain = Promise.resolve();
  const serialize = (work) => {
    const result = chain.then(work);
    chain = result.then(() => void 0, () => void 0);
    return result;
  };
  const commit = (mutate) => serialize(() => {
    const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      const next = mutate(readDocument(path, log));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}
`, "utf8");
      renameSync(temporary, path);
      return true;
    } catch (error) {
      log(`state file write failed, kept in memory only: ${describeError(error)}`);
      try {
        unlinkSync(temporary);
      } catch {
      }
      return false;
    }
  });
  return {
    path,
    read: () => readDocument(path, log),
    writeSkin: (skin) => commit((current) => ({
      version: STATE_VERSION,
      skin: normalizeSkin(skin),
      sessions: current.sessions
    })),
    writeSession: (session, flags) => {
      if (!isSessionId(session)) return Promise.resolve(false);
      return commit((current) => {
        const sessions = {};
        for (const [id, value] of Object.entries(current.sessions)) {
          if (id !== session) sessions[id] = value;
        }
        sessions[session] = { lightning: flags.lightning, ultra: flags.ultra };
        return { version: STATE_VERSION, skin: current.skin, sessions: boundSessions(sessions) };
      });
    }
  };
}

// src/host/metrics.ts
var DEFAULT_WINDOW_MS = 1500;
var DEFAULT_GENERATING_MS = 800;
var MAX_EVENTS_PER_AGENT = 2048;
function isCjkCodePoint(codePoint) {
  return codePoint >= 12288 && codePoint <= 12543 || codePoint >= 13312 && codePoint <= 19903 || codePoint >= 19968 && codePoint <= 40959 || codePoint >= 63744 && codePoint <= 64255 || codePoint >= 65280 && codePoint <= 65519 || codePoint >= 131072;
}
function estimateTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  let cjk = 0;
  let other = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isCjkCodePoint(codePoint)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}
function toCount(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readWindowMs(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_WINDOW_MS;
}
function readGeneratingMs(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : DEFAULT_GENERATING_MS;
}
function readChunkDelta(chunk, includeCacheReads) {
  if (!isRecord3(chunk)) return null;
  const type = chunk["type"];
  if (type === "text-delta" || type === "reasoning-delta") {
    const gen = estimateTokens(chunk["text"]);
    return gen > 0 ? { gen, out: 0, input: 0 } : null;
  }
  if (type === "tool-call-delta") {
    const gen = estimateTokens(chunk["argumentsDelta"]);
    return gen > 0 ? { gen, out: 0, input: 0 } : null;
  }
  if (type === "usage") {
    const usage = chunk["usage"];
    if (!isRecord3(usage)) return null;
    const out = toCount(usage["outputTokens"]);
    const billed = toCount(usage["inputTokens"]);
    const cacheRead = includeCacheReads ? 0 : toCount(usage["cacheReadTokens"]);
    const input = Math.max(0, billed - cacheRead);
    return out > 0 || input > 0 ? { gen: 0, out, input } : null;
  }
  return null;
}
function createFleetMeter(options = {}) {
  const windowMs = readWindowMs(options.windowMs);
  const generatingMs = readGeneratingMs(options.generatingMs);
  const includeCacheReads = options.includeCacheReads === true;
  const readClock = typeof options.now === "function" ? options.now : () => Date.now();
  let states = /* @__PURE__ */ new Map();
  let members = /* @__PURE__ */ new Set();
  let retiredGen = 0;
  let retiredInput = 0;
  let disposed = false;
  function clockMs() {
    const now = Number(readClock());
    return Number.isFinite(now) ? now : Date.now();
  }
  function stateFor(agentId, atMs) {
    let state = states.get(agentId);
    if (state === void 0) {
      state = { estGen: 0, usageOut: 0, inputTotal: 0, events: [], lastGenAt: null, lastTouchedAt: atMs, unordered: false };
      states.set(agentId, state);
    }
    return state;
  }
  function pruneEvents(state, referenceMs) {
    const cutoff = referenceMs - windowMs;
    if (state.unordered) {
      state.events = state.events.filter((event) => event.t >= cutoff);
      state.unordered = false;
    } else {
      while (state.events.length > 0 && (state.events[0]?.t ?? 0) < cutoff) state.events.shift();
    }
    if (state.events.length > MAX_EVENTS_PER_AGENT) {
      state.events.splice(0, state.events.length - MAX_EVENTS_PER_AGENT);
    }
  }
  function retire(state) {
    retiredGen += Math.max(state.estGen, state.usageOut);
    retiredInput += state.inputTotal;
  }
  function sweepRetired(referenceMs) {
    const ttl = Math.max(windowMs, generatingMs);
    for (const [agentId, state] of states) {
      if (members.has(agentId)) continue;
      if (referenceMs - state.lastTouchedAt <= ttl) continue;
      retire(state);
      states.delete(agentId);
    }
  }
  function ingest(agentId, chunk, atMs) {
    if (disposed) return;
    if (typeof agentId !== "string" || !members.has(agentId)) return;
    const delta = readChunkDelta(chunk, includeCacheReads);
    if (delta === null) return;
    const at = typeof atMs === "number" && Number.isFinite(atMs) ? atMs : clockMs();
    const state = stateFor(agentId, at);
    pruneEvents(state, at);
    if (at < state.lastTouchedAt) state.unordered = true;
    state.lastTouchedAt = Math.max(state.lastTouchedAt, at);
    if (delta.gen > 0) {
      state.estGen += delta.gen;
      state.lastGenAt = at;
      state.events.push({ t: at, gen: delta.gen, input: 0 });
    }
    if (delta.out > 0) {
      state.usageOut += delta.out;
      state.lastGenAt = at;
    }
    if (delta.input > 0) {
      state.inputTotal += delta.input;
      state.events.push({ t: at, gen: 0, input: delta.input });
    }
  }
  function sample() {
    if (disposed) return { rate: 0, gen: 0, agents: 0, generating: 0, total: 0 };
    const at = clockMs();
    sweepRetired(at);
    let windowGenEst = 0;
    let windowInput = 0;
    let genTotal = 0;
    let inputTotal = 0;
    let generating = 0;
    for (const [agentId, state] of states) {
      pruneEvents(state, at);
      genTotal += Math.max(state.estGen, state.usageOut);
      inputTotal += state.inputTotal;
      if (!members.has(agentId)) continue;
      let est = 0;
      let input = 0;
      for (const event of state.events) {
        est += event.gen;
        input += event.input;
      }
      windowGenEst += est;
      windowInput += input;
      if (state.lastGenAt !== null && at - state.lastGenAt <= generatingMs) generating += 1;
    }
    const windowSeconds = windowMs / 1e3;
    return {
      rate: toCount((windowGenEst + windowInput) / windowSeconds),
      gen: toCount(windowGenEst / windowSeconds),
      agents: members.size,
      generating,
      total: toCount(retiredGen + retiredInput + genTotal + inputTotal)
    };
  }
  function setMembers(ids) {
    if (disposed) return;
    const next = /* @__PURE__ */ new Set();
    if (typeof ids === "string") {
      if (ids.length > 0) next.add(ids);
    } else if (ids !== null && ids !== void 0 && typeof ids[Symbol.iterator] === "function") {
      for (const value of ids) {
        if (typeof value === "string" && value.length > 0) next.add(value);
      }
    }
    members = next;
  }
  function reset() {
    if (disposed) return;
    states = /* @__PURE__ */ new Map();
    members = /* @__PURE__ */ new Set();
    retiredGen = 0;
    retiredInput = 0;
  }
  function dispose() {
    disposed = true;
    states = /* @__PURE__ */ new Map();
    members = /* @__PURE__ */ new Set();
    retiredGen = 0;
    retiredInput = 0;
  }
  return { setMembers, ingest, sample, reset, dispose };
}

// src/host/policy.ts
var PRECEDENCE = `## Mode policy \u2014 scope and precedence

The user's explicit instruction this turn outranks every rule below; the rules below outrank your default habits. If you had to deviate, say which rule you deviated from and why.`;
var ULTRA_POLICY = `## Ultra Mode (active) \u2014 maximum rigor, verified outcomes

Effort is already pinned at its ceiling for this session. What changes here is how work is planned, verified, and reported.

1. Define done before you start: state the acceptance criteria, and the exact check (command or observation) that proves each one. If an outcome-changing point is genuinely ambiguous, ask \u2014 unless the user has already told you to proceed without asking, in which case pick the reading you can defend and state it as an assumption.
2. Evidence over claims. Every completion claim carries: location, the raw evidence (paste real command output, never a paraphrase), a reproduction path, the impact, and a confidence of confirmed / plausible / unverified. Never present an unchecked claim as checked, and never treat a timeout, rate limit, or tool failure as a refutation.
3. Adversarial second pass. Before reporting, re-examine your own result assuming it is wrong: find the strongest counterexample, the boundary case, the failure path, the concurrency or timing case.
4. Root cause first. If you ship a symptom-level fix, label it as one and say what you could not determine.
5. Keep verified and inferred visibly separate. If something stays unverified, report it as unverified rather than smoothing it over.
6. Stop rule: stop when the definition of done is met and the evidence is in hand. Do not polish for its own sake \u2014 report the remaining uncertainty instead.
7. Fix the real problem, never the test. Relaxing an assertion, threshold, or expectation to make a failure disappear is a failed fix, not a fix.
8. For substantial work, load the \`verification-before-completion\` and \`systematic-debugging\` skills \u2014 they are the full playbook behind rules 2\u20134.`;
var LIGHTNING_POLICY = `## Lightning Mode (active) \u2014 you orchestrate, you do not do the work

The user has explicitly authorized standing fan-out delegation. This is a deliberate override of any default guidance that reserves workflow / ralph / subagent fan-out for explicitly requested use.

1. Manage, do not do. Plan, decompose, dispatch, review, integrate, report. Do not write or edit files yourself when a subagent can do it; keep your own context for coordination.
2. Split by method or boundary \u2014 never clone. Dispatch orthogonal lenses (local logic / call-site contracts / failure paths / security & trust boundaries / docs-vs-implementation), one concern per agent. Parallel copies of one vague prompt reproduce the same blind spot.
3. Dispatch in ONE assistant message. Several delegation calls in a single message run in parallel; split across messages they run serially. Prefer background runs and keep working while they run.
4. Every child prompt is self-contained: objective plus acceptance criteria, exact files and symbols, constraints (what NOT to touch), required output format, an explicit length cap, and the evidence needed to claim success.
5. Scale to complexity: fact lookup = 1 agent with 3\u201310 tool calls; comparison = 2\u20134 agents with 10\u201315 calls each; large engineering = more agents with clearly divided ownership. Never spawn a swarm for a small question, and never keep more than 6 children in flight at once \u2014 queue the rest in waves.
6. One writer per file. Never hand the same file to two children at the same time, and never let a child write a file another child is still reading for a decision. Partition write ownership by file (or directory); readers may overlap freely.
7. Children write artifacts to files and return a pointer plus a short summary. Never pipe their full output through your context.
8. Integrate before answering: read every summary, check for conflicts and duplicated work, run the combined verification yourself, and spot-check at least one claim per agent. The final answer is yours, not a concatenation.
9. When you are genuinely stuck \u2014 a decision you cannot settle from evidence, or the same failure surviving two attempts \u2014 ask the Astra route once via \`subagent_gpt6\`. Keep the question short (a few lines: the blocker, what you tried, what you need decided) and demand a short answer: that route does not accept long input and cannot produce long output. If no Astra model is available on this deployment, ignore this rule and proceed on your own.
10. Budget honestly: multi-agent work costs roughly 15\xD7 the tokens of a single agent. Fan out when the work is genuinely parallel or exceeds one context window \u2014 not by default.
11. Full playbook: load the \`dispatching-parallel-agents\` and \`subagent-driven-development\` skills (bundled in this plugin's \`skills/\` directory).`;
var SUBAGENT_GUARD = `If this text reached you as a delegated sub-agent: you are the executor, not the orchestrator. Ignore every rule above about fan-out, dispatching, or spawning further agents, and do the assigned task yourself. Every rigor rule still applies to you.`;
var OFF_NOTICE = "Ultra Mode and Lightning Mode are now OFF for this session. Disregard any earlier policy text from them in this conversation.";
function policyText(flags = {}) {
  const ultra = flags.ultra === true;
  const lightning = flags.lightning === true;
  if (!ultra && !lightning) return "";
  const parts = [PRECEDENCE];
  if (ultra) parts.push(ULTRA_POLICY);
  if (lightning) parts.push(LIGHTNING_POLICY);
  parts.push(SUBAGENT_GUARD);
  return parts.join("\n\n");
}
function resolveActivePolicy(flags, everEnabled) {
  if (flags.ultra === true || flags.lightning === true) return policyText(flags);
  return everEnabled ? OFF_NOTICE : "";
}
function currentPolicyText(flags) {
  return policyText(flags);
}

// src/host/inject.ts
import { randomUUID } from "node:crypto";
function instructionMessage(text) {
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "dsh-whale-effort", form: "instructions" }
  };
}
function shouldInject(lastInjected, text) {
  return text.length > 0 && lastInjected !== text;
}
function createPolicyInjector(ctx, options) {
  const log = options.log ?? (() => {
  });
  const lastInjected = /* @__PURE__ */ new Map();
  let disposed = false;
  const listener = async (payload, next) => {
    let decision;
    try {
      decision = await next();
    } catch (error) {
      log(`policy injection skipped: pre-step delegation failed (${describeError(error)})`);
      return { kind: "enter", messages: [...payload.messages] };
    }
    try {
      if (disposed || decision.kind !== "enter") return decision;
      if (decision.messages.length === 0) return decision;
      const sessionId = payload.agent.id;
      if (typeof sessionId !== "string" || sessionId.length === 0) return decision;
      const text = options.resolve(sessionId);
      if (!shouldInject(lastInjected.get(sessionId), text)) return decision;
      lastInjected.set(sessionId, text);
      return { ...decision, messages: [...decision.messages, instructionMessage(text)] };
    } catch (error) {
      log(`policy injection skipped: ${describeError(error)}`);
      return decision;
    }
  };
  const off = ctx.on("agent/pre-step", listener);
  return {
    lastInjected: (sessionId) => lastInjected.get(sessionId),
    dispose() {
      if (disposed) return;
      disposed = true;
      lastInjected.clear();
      try {
        off();
      } catch {
      }
    }
  };
}

// src/host/turbo.ts
var MAX_MEMBERS = 96;
var MAX_SESSION_HEADERS = 2048;
var MAX_ANCESTOR_DEPTH = 128;
function sessionFlagsOf(sessions, sessionId) {
  const flags = sessionId === void 0 ? void 0 : sessions[sessionId];
  return { lightning: flags?.lightning === true, ultra: flags?.ultra === true };
}
function applySessionPatch(sessions, sessionId, flags) {
  const next = {};
  for (const [id, value] of Object.entries(sessions)) {
    if (id !== sessionId) next[id] = value;
  }
  next[sessionId] = { lightning: flags.lightning, ultra: flags.ultra };
  return boundSessions(next);
}
var ZERO_SAMPLE = { rate: 0, gen: 0, agents: 0, generating: 0, total: 0 };
function buildSnapshot(flags, skin, sample, stamp, policy) {
  return {
    lightning: flags.lightning,
    ultra: flags.ultra,
    skin,
    rate: sample.rate,
    gen: sample.gen,
    agents: sample.agents,
    generating: sample.generating > 0,
    total: sample.total,
    stamp,
    policy
  };
}
function defaultSnapshot(stamp) {
  return buildSnapshot({ lightning: false, ultra: false }, DEFAULT_SKIN, ZERO_SAMPLE, stamp, "");
}
function createTurbo(ctx, options) {
  const log = options.log ?? (() => {
  });
  const clock = options.now ?? (() => Date.now());
  const initial = options.state.read();
  let skin = initial.skin;
  let sessions = { ...initial.sessions };
  let headers = /* @__PURE__ */ new Map();
  const everOn = /* @__PURE__ */ new Set();
  let tracked = /* @__PURE__ */ new Set();
  let members = /* @__PURE__ */ new Set();
  let disposed = false;
  const meter = createFleetMeter();
  const unsubscribes = [];
  let injector;
  let sessionsStore;
  function store() {
    if (sessionsStore !== void 0) return sessionsStore;
    try {
      sessionsStore = options.sessions?.();
    } catch (error) {
      log(`session store unavailable: ${describeError(error)}`);
      sessionsStore = void 0;
    }
    return sessionsStore;
  }
  function anyOn(sessionId) {
    const flags = sessionFlagsOf(sessions, sessionId);
    return flags.lightning || flags.ultra;
  }
  function activeText(sessionId) {
    if (anyOn(sessionId)) everOn.add(sessionId);
    return resolveActivePolicy(sessionFlagsOf(sessions, sessionId), everOn.has(sessionId));
  }
  function rememberSession(session) {
    if (session === void 0 || session === null) return false;
    if (typeof session.id !== "string" || session.id.length === 0) return false;
    headers.set(session.id, {
      id: session.id,
      parent: typeof session.header.parentSession === "string" ? session.header.parentSession : null,
      subagent: session.header.origin === "subagent",
      live: true
    });
    while (headers.size > MAX_SESSION_HEADERS) {
      const oldest = headers.keys().next();
      if (oldest.done === true) break;
      headers.delete(oldest.value);
    }
    return true;
  }
  function liveSession(sessionId) {
    const live = store();
    if (live === void 0) return void 0;
    try {
      return live.get(sessionId);
    } catch {
      return void 0;
    }
  }
  function isKnownSession(sessionId) {
    return headers.has(sessionId) || liveSession(sessionId) !== void 0;
  }
  function belongsToTrackedRoot(record) {
    if (!record.live || !record.subagent) return false;
    const seen = /* @__PURE__ */ new Set([record.id]);
    let parent = record.parent;
    for (let depth = 0; parent !== null && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
      if (seen.has(parent)) return false;
      if (tracked.has(parent)) return true;
      seen.add(parent);
      let ancestor = headers.get(parent);
      if (ancestor === void 0) {
        rememberSession(liveSession(parent));
        ancestor = headers.get(parent);
      }
      if (ancestor === void 0) return false;
      parent = ancestor.parent;
    }
    return false;
  }
  function refreshMembers() {
    if (disposed) return;
    try {
      tracked = new Set(Object.keys(sessions).filter((id) => anyOn(id)));
      const next = /* @__PURE__ */ new Set();
      for (const record of tracked.size > 0 ? [...headers.values()] : []) {
        if (next.size >= MAX_MEMBERS) break;
        if (belongsToTrackedRoot(record)) next.add(record.id);
      }
      members = next;
      meter.setMembers(members);
    } catch (error) {
      log(`fleet membership refresh failed, counting nobody this round: ${describeError(error)}`);
      members = /* @__PURE__ */ new Set();
      try {
        meter.setMembers(members);
      } catch {
      }
    }
  }
  function seedFromStore() {
    const live = store();
    if (live === void 0) return;
    try {
      for (const session of live.list()) rememberSession(session);
    } catch (error) {
      log(`reading live sessions failed, waiting for lifecycle events: ${describeError(error)}`);
    }
    refreshMembers();
  }
  try {
    unsubscribes.push(ctx.on("agent/assistant-stream", (payload) => {
      try {
        if (disposed) return;
        const frame = payload.frame;
        if (frame.type !== "chunk") return;
        const agentId = payload.agent.id;
        if (agentId.length === 0) return;
        if (!headers.has(agentId) && tracked.size > 0) {
          if (rememberSession(liveSession(agentId))) refreshMembers();
        }
        if (!members.has(agentId)) return;
        const chunk = frame.chunk;
        meter.ingest(agentId, chunk, frame.time);
      } catch {
      }
    }));
  } catch (error) {
    log(`subscribing to agent/assistant-stream failed: ${describeError(error)}`);
  }
  try {
    unsubscribes.push(ctx.on("session/created", (session) => {
      try {
        if (disposed) return;
        if (rememberSession(session)) refreshMembers();
      } catch {
      }
    }));
  } catch (error) {
    log(`subscribing to session/created failed: ${describeError(error)}`);
  }
  try {
    unsubscribes.push(ctx.on("session/disposed", (session) => {
      try {
        if (disposed) return;
        const record = headers.get(session.id);
        if (record === void 0) return;
        record.live = false;
        refreshMembers();
      } catch {
      }
    }));
  } catch (error) {
    log(`subscribing to session/disposed failed: ${describeError(error)}`);
  }
  seedFromStore();
  try {
    injector = createPolicyInjector(ctx, { resolve: activeText, log });
  } catch (error) {
    log(`policy injection unavailable: ${describeError(error)}`);
  }
  return {
    sample: () => meter.sample(),
    stateOf: (sessionId) => sessionFlagsOf(sessions, sessionId),
    snapshot: (sessionId) => {
      const stamp = clock();
      if (sessionId === void 0) {
        return buildSnapshot({ lightning: false, ultra: false }, skin, ZERO_SAMPLE, stamp, "");
      }
      if (!isKnownSession(sessionId)) return defaultSnapshot(stamp);
      const flags = sessionFlagsOf(sessions, sessionId);
      return buildSnapshot(flags, skin, meter.sample(), stamp, currentPolicyText(flags));
    },
    update: async (patch) => {
      const sessionId = patch.session;
      let flags = { lightning: false, ultra: false };
      if (isSessionId(sessionId)) {
        const previous = sessionFlagsOf(sessions, sessionId);
        flags = {
          lightning: typeof patch.lightning === "boolean" ? patch.lightning : previous.lightning,
          ultra: typeof patch.ultra === "boolean" ? patch.ultra : previous.ultra
        };
        sessions = applySessionPatch(sessions, sessionId, flags);
        await options.state.writeSession(sessionId, flags);
        refreshMembers();
      }
      if (patch.skin !== void 0) {
        skin = normalizeSkin(patch.skin);
        await options.state.writeSkin(skin);
      }
      return { lightning: flags.lightning, ultra: flags.ultra, skin };
    },
    policyOf: (sessionId) => currentPolicyText(sessionFlagsOf(sessions, sessionId)),
    refresh: () => {
      sessionsStore = void 0;
      seedFromStore();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        injector?.dispose();
      } catch {
      }
      injector = void 0;
      for (const off of unsubscribes.splice(0)) {
        try {
          off();
        } catch {
        }
      }
      headers = /* @__PURE__ */ new Map();
      tracked = /* @__PURE__ */ new Set();
      members = /* @__PURE__ */ new Set();
      everOn.clear();
      meter.dispose();
    }
  };
}

// src/host/rpc.ts
var RPC_CHANNEL = "/dsh-whale-effort";
var MAX_REQUEST_BYTES = 64 * 1024;
function okResult(value) {
  return { ok: true, value };
}
function failResult(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseEnvelope(value) {
  if (!isRecord4(value) || value["type"] !== "client-request") return void 0;
  const rpcId = value["rpcId"];
  const method = value["method"];
  if (typeof rpcId !== "string" || rpcId.length === 0) return void 0;
  if (typeof method !== "string" || method.length === 0) return void 0;
  return { rpcId, method, payload: value["payload"] };
}
function envelopeOf(rpcId, result) {
  return JSON.stringify({ type: "server-response", rpcId, result });
}
function endpointOf(url) {
  if (url === void 0) return void 0;
  const pathname = url.split("?")[0] ?? "";
  const prefix = `${RPC_CHANNEL}/`;
  if (!pathname.startsWith(prefix)) return void 0;
  const endpoint = pathname.slice(prefix.length);
  const segments = endpoint.split("/");
  const valid = segments.every((segment) => segment !== "" && segment !== "." && segment !== ".." && /^[A-Za-z0-9_$.-]+$/u.test(segment));
  return valid ? endpoint : void 0;
}
function readJsonBody(request) {
  return new Promise((resolve2, reject) => {
    const chunks = [];
    const decoder = new TextDecoder();
    let bytes = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("request stream failed"));
    };
    request.on("data", (chunk) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BYTES) {
        fail(new Error("body too large"));
        return;
      }
      chunks.push(decoder.decode(chunk, { stream: true }));
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        chunks.push(decoder.decode());
        resolve2(JSON.parse(chunks.join("")));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("body is not JSON"));
      }
    });
    request.on("error", fail);
  });
}
function sessionField(payload) {
  const session = payload["session"];
  return typeof session === "string" && session.length > 0 ? session : void 0;
}
function booleanField(payload, key) {
  const value = payload[key];
  if (value === void 0) return void 0;
  return typeof value === "boolean" ? value : "invalid";
}
function skinField(payload) {
  const value = payload["skin"];
  if (value === void 0) return void 0;
  if (typeof value !== "string" || !SKINS.includes(value)) return "invalid";
  return value;
}
async function dispatchEndpoint(deps, endpoint, payload) {
  const request = isRecord4(payload) ? payload : {};
  switch (endpoint) {
    case "diagnose": {
      const provider = request["provider"];
      const model = request["model"];
      if (typeof provider !== "string" || provider.length === 0 || typeof model !== "string" || model.length === 0) {
        return failResult("invalid-request", "provider and model are required");
      }
      const guidance = deps.guidance();
      if (guidance === void 0) return failResult("guidance-unavailable", "guide services are not mounted in this profile");
      try {
        return okResult(await guidance.diagnose(provider, model));
      } catch (error) {
        return failResult("diagnose-failed", `diagnose failed: ${describeError(error)}`);
      }
    }
    case "store": {
      const guidance = deps.guidance();
      return okResult({ entries: guidance === void 0 ? [] : [...guidance.entries()] });
    }
    case "session/state": {
      return okResult(deps.turbo().snapshot(sessionField(request)));
    }
    case "session/update": {
      const lightning = booleanField(request, "lightning");
      const ultra = booleanField(request, "ultra");
      const skin = skinField(request);
      if (lightning === "invalid" || ultra === "invalid" || skin === "invalid") {
        return failResult("invalid-request", "lightning/ultra must be booleans and skin must be holo, chrome, or fluid");
      }
      const rawSession = request["session"];
      if (rawSession !== void 0 && !isSessionId(rawSession)) {
        return failResult("invalid-session", "session must be a non-empty session id");
      }
      const patch = {
        ...typeof rawSession === "string" ? { session: rawSession } : {},
        ...lightning === void 0 ? {} : { lightning },
        ...ultra === void 0 ? {} : { ultra },
        ...skin === void 0 ? {} : { skin }
      };
      try {
        return okResult(await deps.turbo().update(patch));
      } catch (error) {
        return failResult("update-failed", `session update failed: ${describeError(error)}`);
      }
    }
    case "session/policy": {
      const session = sessionField(request);
      return okResult({ text: session === void 0 ? "" : deps.turbo().policyOf(session) });
    }
    default:
      return failResult("not-found", `unknown endpoint ${JSON.stringify(endpoint)}`);
  }
}
function createChannelHandler(options) {
  return async (request, response) => {
    const rejection = options.authorize(request);
    if (rejection !== void 0) {
      response.writeHead(rejection);
      response.end(rejection === 401 ? "unauthorized" : "forbidden");
      return;
    }
    const endpoint = endpointOf(request.url);
    if (request.method !== "POST" || endpoint === void 0) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    const mediaType = String(request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      response.writeHead(415);
      response.end("content type must be application/json");
      return;
    }
    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      response.writeHead(400);
      response.end("body is not JSON");
      return;
    }
    const message = parseEnvelope(body);
    if (message === void 0 || message.method !== endpoint) {
      response.writeHead(400);
      response.end("invalid client-request message");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    try {
      response.end(envelopeOf(message.rpcId, await dispatchEndpoint(options, endpoint, message.payload)));
    } catch (error) {
      response.end(envelopeOf(message.rpcId, failResult("channel-failed", `channel failed: ${describeError(error)}`)));
    }
  };
}

// src/index.ts
var name = "dsh-whale-effort";
function createLog(ctx) {
  let sink;
  try {
    sink = ctx.logger(name);
  } catch {
    sink = void 0;
  }
  return (message) => {
    const line = `[${name}] ${message}`;
    try {
      if (sink !== void 0 && typeof sink.warn === "function") {
        sink.warn(line);
        return;
      }
    } catch {
    }
    try {
      console.warn(line);
    } catch {
    }
  };
}
function setup(ctx, config) {
  const log = createLog(ctx);
  let state;
  try {
    state = createStateFile({ path: resolveStatePath(config.statePath), log });
  } catch (error) {
    log(`state file unavailable, toggles will not persist: ${describeError(error)}`);
  }
  let guidance;
  try {
    guidance = createGuidance({ config });
  } catch (error) {
    log(`guidance unavailable: ${describeError(error)}`);
  }
  let sessionsStore;
  let turbo;
  if (state !== void 0) {
    try {
      turbo = createTurbo(ctx, {
        state,
        log,
        sessions: () => sessionsStore
      });
      ctx.effect(() => () => {
        try {
          turbo?.dispose();
        } catch {
        }
      }, "whale-effort: session state and fleet meter");
    } catch (error) {
      log(`session state and fleet meter unavailable: ${describeError(error)}`);
      turbo = void 0;
    }
  }
  try {
    ctx.inject(["connection", "webServer"], (routeCtx) => {
      try {
        const connection = routeCtx.connection;
        const webServer = routeCtx.webServer;
        const handler = createChannelHandler({
          authorize: (request) => connection.requestRejection(request),
          guidance: () => guidance,
          turbo: () => {
            if (turbo === void 0) throw new Error("session state is unavailable in this profile");
            return turbo;
          }
        });
        routeCtx.effect(
          () => webServer.register({ kind: "prefix", path: RPC_CHANNEL, handler }),
          "whale-effort: rpc channel"
        );
      } catch (error) {
        log(`rpc channel registration failed: ${describeError(error)}`);
      }
    });
  } catch (error) {
    log(`rpc channel unavailable: ${describeError(error)}`);
  }
  try {
    ctx.inject(["settings", "llm"], (servicesCtx) => {
      try {
        guidance = createGuidance({ config, settings: servicesCtx.settings, llm: servicesCtx.llm });
      } catch (error) {
        log(`guidance services unavailable: ${describeError(error)}`);
      }
      return () => {
        try {
          guidance = createGuidance({ config });
        } catch (error) {
          log(`guidance reset failed: ${describeError(error)}`);
        }
      };
    });
  } catch (error) {
    log(`guidance services unavailable: ${describeError(error)}`);
  }
  try {
    ctx.inject(["sessions"], (sessionsCtx) => {
      try {
        sessionsStore = sessionsCtx.sessions;
        turbo?.refresh();
      } catch (error) {
        log(`live session store unavailable: ${describeError(error)}`);
      }
      return () => {
        sessionsStore = void 0;
        try {
          turbo?.refresh();
        } catch (error) {
          log(`session store reset failed: ${describeError(error)}`);
        }
      };
    });
  } catch (error) {
    log(`live session store unavailable: ${describeError(error)}`);
  }
}
function apply(ctx, config) {
  try {
    setup(ctx, readConfig(config));
  } catch (error) {
    try {
      console.error(`[${name}] initialization failed, skipped: ${describeError(error)}`);
    } catch {
    }
  }
}
export {
  apply,
  name
};
