// src/host/plugin.ts
import { homedir as homedir3 } from "node:os";
import { dirname as dirname2, join as join3, resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/shared/types.ts
var EMPTY_FEED = { acks: {}, turns: {} };

// src/shared/synthesis.ts
var SYNTHESIS_PREFS_KEY = "synthesis";
var SYNTHESIS_MODEL_PATH = "/api/session-board/synthesis-model";
var SYNTHESIS_MODEL_CAPABILITY = 3;
var ROUTE_PART_MAX = 200;
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function routePart(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > ROUTE_PART_MAX) return null;
  return /[\u0000-\u001f\u007f]/u.test(trimmed) ? null : trimmed;
}
function parseSynthesisPref(raw) {
  const record2 = asRecord(raw);
  const model = routePart(record2?.model);
  const provider = routePart(record2?.provider);
  const reasoningEffort = routePart(record2?.reasoningEffort);
  if (model === null || provider === null) return { model: null, provider: null, reasoningEffort: null };
  return { model, provider, reasoningEffort };
}
function selectionOf(pref) {
  if (pref.model === null || pref.provider === null) return null;
  return { provider: pref.provider, model: pref.model, reasoningEffort: pref.reasoningEffort };
}

// src/shared/wiki.ts
var WIKI_DEFAULT_TIMEOUT_SECONDS = 300;
var WIKI_CONFIG_PATH = "/api/session-board/wiki-config";
var WIKI_CONFIG_CAPABILITY = 1;
var DEFAULT_WIKI_CONFIG = {
  wikiRoot: "",
  schemaPath: "",
  scriptsMode: "bundled",
  scriptsDir: "",
  python: "",
  stateFile: "",
  timeoutSeconds: 0,
  provider: "",
  synthConfig: ""
};
var PATH_MAX = 4096;
var PROVIDER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function wikiDefaults(home) {
  return {
    wikiRoot: `${home}/wiki`,
    schemaPath: `${home}/wiki/SCHEMA.md`,
    scriptsDir: `${home}/wiki/scripts`,
    stateFile: `${home}/wiki/scripts/.archive-state.json`,
    python: "/usr/bin/python3",
    provider: "stepx-terra",
    synthConfig: `${home}/.wikibar/config.json`,
    timeoutSeconds: WIKI_DEFAULT_TIMEOUT_SECONDS
  };
}
function orDefault(value, fallback) {
  return value === "" ? fallback : value;
}
function resolveWikiPaths(config, home, storedProvider) {
  const defaults = wikiDefaults(home);
  const wikiRoot = orDefault(config.wikiRoot, defaults.wikiRoot);
  const schemaPath = orDefault(config.schemaPath, `${wikiRoot}/SCHEMA.md`);
  const scriptsDir = config.scriptsMode === "local" ? orDefault(config.scriptsDir, `${wikiRoot}/scripts`) : "";
  return {
    wikiRoot,
    schemaPath,
    scriptsDir,
    stateFile: orDefault(config.stateFile, `${wikiRoot}/scripts/.archive-state.json`),
    python: orDefault(config.python, defaults.python),
    timeoutSeconds: config.timeoutSeconds > 0 ? config.timeoutSeconds : defaults.timeoutSeconds,
    provider: orDefault(config.provider, storedProvider ?? defaults.provider),
    synthConfig: orDefault(config.synthConfig, defaults.synthConfig)
  };
}
function isAbsolutePath(value) {
  return value.length <= PATH_MAX && value.startsWith("/") && !value.includes("\0");
}
function validateWikiConfig(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { config: null, errors: ["INVALID_CONFIG"] };
  }
  const value = raw;
  const errors = [];
  const path = (key, label) => {
    const entry = value[key];
    if (entry === void 0) return "";
    if (typeof entry !== "string" || entry !== "" && !isAbsolutePath(entry)) {
      errors.push(`INVALID_${label}`);
      return "";
    }
    return entry;
  };
  const wikiRoot = path("wikiRoot", "WIKI_ROOT");
  const schemaPath = path("schemaPath", "SCHEMA_PATH");
  const scriptsDir = path("scriptsDir", "SCRIPTS_DIR");
  const python = path("python", "PYTHON");
  const stateFile = path("stateFile", "STATE_FILE");
  const synthConfig = path("synthConfig", "SYNTH_CONFIG");
  const scriptsMode = value.scriptsMode === void 0 ? "bundled" : value.scriptsMode;
  if (scriptsMode !== "bundled" && scriptsMode !== "local") errors.push("INVALID_SCRIPTS_MODE");
  const timeout = value.timeoutSeconds === void 0 ? 0 : value.timeoutSeconds;
  if (typeof timeout !== "number" || !Number.isInteger(timeout) || timeout < 0 || timeout > 86400) errors.push("INVALID_TIMEOUT");
  const provider = value.provider === void 0 ? "" : value.provider;
  if (typeof provider !== "string" || provider !== "" && !PROVIDER_RE.test(provider)) errors.push("INVALID_PROVIDER");
  if (errors.length > 0) return { config: null, errors };
  return {
    config: {
      wikiRoot,
      schemaPath,
      scriptsMode,
      scriptsDir,
      python,
      stateFile,
      timeoutSeconds: timeout,
      provider,
      synthConfig
    },
    errors
  };
}
function parseWikiConfig(raw) {
  const parsed = validateWikiConfig(raw);
  return parsed.config ?? { ...DEFAULT_WIKI_CONFIG };
}
function parseEnvironmentStatus(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw;
  if (typeof value.ok !== "boolean" || typeof value.python !== "string" || typeof value.pythonExecutable !== "string") return null;
  const engine = value.engine;
  const schema = value.schema;
  const wikiRoot = value.wikiRoot;
  const state = value.state;
  if (engine === null || typeof engine !== "object" || schema === null || typeof schema !== "object" || wikiRoot === null || typeof wikiRoot !== "object" || state === null || typeof state !== "object") return null;
  const scripts = Array.isArray(engine.scripts) ? engine.scripts.filter((entry) => {
    if (typeof entry !== "object" || entry === null) return false;
    const script = entry;
    return typeof script.name === "string" && typeof script.path === "string" && typeof script.exists === "boolean" && typeof script.bytes === "number";
  }) : [];
  return {
    ok: value.ok,
    issues: Array.isArray(value.issues) ? value.issues.filter((entry) => typeof entry === "string") : [],
    python: value.python,
    pythonExecutable: value.pythonExecutable,
    engine: { dir: typeof engine.dir === "string" ? engine.dir : "", scripts },
    schema: { path: typeof schema.path === "string" ? schema.path : "", bytes: typeof schema.bytes === "number" ? schema.bytes : 0 },
    wikiRoot: { path: typeof wikiRoot.path === "string" ? wikiRoot.path : "", exists: wikiRoot.exists === true },
    state: { path: typeof state.path === "string" ? state.path : "" },
    operations: Array.isArray(value.operations) ? value.operations.filter((entry) => typeof entry === "string") : []
  };
}

// src/host/domain.ts
var UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/;
function domainTable(schema) {
  return { valueSchema: schema };
}
function defineDomain(spec) {
  if (!UNIT_NAME_RE.test(spec.name)) {
    throw new Error(`domain name '${spec.name}' must match ${UNIT_NAME_RE}`);
  }
  if (!Number.isInteger(spec.version) || spec.version < 0) {
    throw new Error(`domain '${spec.name}' version must be a non-negative integer`);
  }
  const tables = Object.keys(spec.tables);
  if (tables.length === 0) throw new Error(`domain '${spec.name}' declares no tables`);
  for (const table of tables) {
    if (!UNIT_NAME_RE.test(table)) {
      throw new Error(`domain '${spec.name}' table '${table}' must match ${UNIT_NAME_RE}`);
    }
  }
  return spec;
}
var ACK_DOMAIN_NAME = "dsh_session_board";
var TURN_DOMAIN_NAME = "dsh_session_board_turns";
var PREFS_DOMAIN_NAME = "dsh_session_board_prefs";
var ACK_TABLE_NAME = "acks";
var TURN_TABLE_NAME = "turn_stats";
var PREFS_TABLE_NAME = "prefs";
var WIKI_DOMAIN_NAME = "dsh_session_board_wiki";
var WIKI_TABLE_NAME = "config";
var ERROR_NOTE_MAX = 160;
var ELLIPSIS = "\u2026";
function truncateErrorNote(text, max = ERROR_NOTE_MAX) {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  let note = "";
  let points = 0;
  for (const point of collapsed) {
    if (points >= max) return `${note}${ELLIPSIS}`;
    note += point;
    points += 1;
  }
  return note;
}
function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function stringOrNull(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function stringArrayOrNull(value) {
  if (!Array.isArray(value)) return null;
  const keys = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry !== "") keys.push(entry);
  }
  return keys.length > 0 ? keys : null;
}
function fieldOf(raw, key) {
  if (typeof raw !== "object" || raw === null) return void 0;
  return raw[key];
}
var ackRecordSchema = {
  parse(raw) {
    return {
      lastTurnEnd: numberOrNull(fieldOf(raw, "lastTurnEnd")),
      lastTurnEndKind: stringOrNull(fieldOf(raw, "lastTurnEndKind")),
      lastTurnEndError: stringOrNull(fieldOf(raw, "lastTurnEndError")),
      ackedAt: numberOrNull(fieldOf(raw, "ackedAt"))
    };
  }
};
var turnRecordSchema = {
  parse(raw) {
    return {
      busyMs: numberOrNull(fieldOf(raw, "busyMs")),
      openTurnStart: numberOrNull(fieldOf(raw, "openTurnStart")),
      waitedMs: numberOrNull(fieldOf(raw, "waitedMs")),
      openWaitStart: numberOrNull(fieldOf(raw, "openWaitStart")),
      openWaitKind: stringOrNull(fieldOf(raw, "openWaitKind")),
      openWaitId: stringOrNull(fieldOf(raw, "openWaitId")),
      openWaitKeys: stringArrayOrNull(fieldOf(raw, "openWaitKeys")),
      lastEventAt: numberOrNull(fieldOf(raw, "lastEventAt"))
    };
  }
};
var prefsRecordSchema = {
  parse(raw) {
    const model = stringOrNull(fieldOf(raw, "model"));
    const provider = stringOrNull(fieldOf(raw, "provider"));
    const reasoningEffort = stringOrNull(fieldOf(raw, "reasoningEffort"));
    if (model === null || provider === null) return { model: null, provider: null, reasoningEffort: null };
    return { model, provider, reasoningEffort };
  }
};
var ackDomainSpec = defineDomain({
  name: ACK_DOMAIN_NAME,
  version: 1,
  invalidRecords: "backup-and-skip",
  tables: {
    [ACK_TABLE_NAME]: domainTable(ackRecordSchema)
  }
});
var turnDomainSpec = defineDomain({
  name: TURN_DOMAIN_NAME,
  version: 1,
  invalidRecords: "backup-and-skip",
  tables: {
    [TURN_TABLE_NAME]: domainTable(turnRecordSchema)
  }
});
var prefsDomainSpec = defineDomain({
  name: PREFS_DOMAIN_NAME,
  version: 1,
  invalidRecords: "backup-and-skip",
  tables: {
    [PREFS_TABLE_NAME]: domainTable(prefsRecordSchema)
  }
});
var wikiRecordSchema = {
  parse(raw) {
    return parseWikiConfig(raw);
  }
};
var wikiDomainSpec = defineDomain({
  name: WIKI_DOMAIN_NAME,
  version: 1,
  invalidRecords: "backup-and-skip",
  tables: {
    [WIKI_TABLE_NAME]: domainTable(wikiRecordSchema)
  }
});

// src/host/ledger.ts
var QUESTION_TOOLS = /* @__PURE__ */ new Set([
  "ask_user_question",
  "request_user_input",
  "exit_plan_mode",
  "question"
]);
var WAIT_KEY_SEP = ":";
function encodeWaitKey(kind, id) {
  return `${kind}${WAIT_KEY_SEP}${id ?? ""}`;
}
function decodeWaitKey(key) {
  const at = key.indexOf(WAIT_KEY_SEP);
  if (at < 0) return { kind: key, id: null };
  const id = key.slice(at + 1);
  return { kind: key.slice(0, at), id: id === "" ? null : id };
}
function openWaitKeysOf(record2) {
  const stored = record2?.openWaitKeys;
  if (Array.isArray(stored)) return stored.filter((key) => typeof key === "string" && key !== "");
  const start = record2?.openWaitStart;
  const kind = record2?.openWaitKind;
  if (start !== null && start !== void 0 && kind !== null && kind !== void 0) {
    return [encodeWaitKey(kind, record2?.openWaitId ?? null)];
  }
  return [];
}
function legacyWaitFields(keys) {
  const first = keys[0];
  if (first === void 0) return { openWaitKind: null, openWaitId: null };
  const decoded = decodeWaitKey(first);
  return { openWaitKind: decoded.kind, openWaitId: decoded.id };
}
function touchLastEventAt(record2, time) {
  const previous = record2?.lastEventAt ?? null;
  return previous === null ? time : Math.max(previous, time);
}
function waitedThrough(record2, time) {
  const settled = Math.max(0, record2?.waitedMs ?? 0);
  const openStart = record2?.openWaitStart;
  if (openStart === null || openStart === void 0) return settled;
  return settled + Math.max(0, time - openStart);
}
var BoardLedger = class {
  acks;
  turns;
  onChange;
  warn;
  now;
  /** Tail of each session's write chain; entries are dropped once settled. */
  chains = /* @__PURE__ */ new Map();
  /** @param options - table handles, change hook, containment sink, clock. */
  constructor(options) {
    this.acks = options.acks;
    this.turns = options.turns;
    this.onChange = options.onChange;
    this.warn = options.warn;
    this.now = options.now ?? Date.now;
  }
  /**
   * Record a closed turn. Preserves an existing `ackedAt`: a new turn end must
   * move `lastTurnEnd` past the cursor (so the card reads as unacknowledged),
   * not clear the cursor itself.
   *
   * Always settles any open turn into `busyMs` and clears the wait state — a
   * turn boundary cannot leave a wait interval open, because the wait belonged
   * to the turn that just ended. A duplicate `turn/end` (no open turn) adds no
   * busy time a second time, but still clears stray wait state and advances the
   * activity bound.
   * @param sessionId - Session the event belongs to.
   * @param facts - Turn-end facts off the event.
   */
  recordTurnEnd(sessionId, facts) {
    void this.enqueue(sessionId, async () => {
      const currentAck = this.acks.get(sessionId);
      await this.acks.put(sessionId, {
        lastTurnEnd: facts.time,
        lastTurnEndKind: facts.kind,
        lastTurnEndError: facts.errorMessage === null ? null : truncateErrorNote(facts.errorMessage),
        ackedAt: currentAck?.ackedAt ?? null
      });
      const currentTurn = this.turns.get(sessionId);
      const openTurnStart = currentTurn?.openTurnStart ?? null;
      const busyMs = openTurnStart === null ? currentTurn?.busyMs ?? null : Math.max(0, currentTurn?.busyMs ?? 0) + Math.max(0, facts.time - openTurnStart - waitedThrough(currentTurn, facts.time));
      await this.turns.put(sessionId, {
        busyMs,
        openTurnStart: null,
        waitedMs: null,
        openWaitStart: null,
        openWaitKind: null,
        openWaitId: null,
        openWaitKeys: null,
        lastEventAt: touchLastEventAt(currentTurn, facts.time)
      });
      this.onChange();
    }, "turn/end");
  }
  /**
   * Open a turn's clock. `busyMs` is preserved across turns; `waitedMs` resets
   * because it accumulates only inside the current turn, and `openWaitStart` is
   * cleared because a wait interval cannot outlive the turn that opened it.
   *
   * A repeated `turn/start` while one is already open settles the turn it
   * replaces first, so the earlier interval is not silently dropped. When the
   * new event is older than the open start (a replayed log), the open record is
   * left untouched rather than moving the clock backwards.
   * @param sessionId - Session the event belongs to.
   * @param time - Event time (epoch ms).
   */
  recordTurnStart(sessionId, time) {
    void this.enqueue(sessionId, async () => {
      const current = this.turns.get(sessionId);
      const lastEventAt = touchLastEventAt(current, time);
      if (current !== void 0 && current.openTurnStart !== null && time < current.openTurnStart) {
        await this.turns.put(sessionId, { ...current, lastEventAt });
        this.onChange();
        return;
      }
      const openTurnStart = current?.openTurnStart ?? null;
      const busyMs = openTurnStart === null ? current?.busyMs ?? null : Math.max(0, current?.busyMs ?? 0) + Math.max(0, time - openTurnStart - waitedThrough(current, time));
      await this.turns.put(sessionId, {
        busyMs,
        openTurnStart: time,
        waitedMs: null,
        openWaitStart: null,
        openWaitKind: null,
        openWaitId: null,
        openWaitKeys: null,
        lastEventAt
      });
      this.onChange();
    }, "turn/start");
  }
  /**
   * Open one blocking wait. The union interval is anchored at the first open
   * wait and stays open until every key is released, so a second, overlapping
   * wait is recorded in `openWaitKeys` without restarting the clock.
   *
   * A wait outside an open turn is not charged to any turn; only the activity
   * bound moves, so a later restart still bounds itself by a real event.
   * @param sessionId - Session the event belongs to.
   * @param facts - Wait kind and id off the event.
   */
  recordWaitStart(sessionId, facts) {
    void this.enqueue(sessionId, async () => {
      const current = this.turns.get(sessionId);
      if (current === void 0) return;
      const lastEventAt = touchLastEventAt(current, facts.time);
      if ((current.openTurnStart ?? null) === null) {
        await this.turns.put(sessionId, { ...current, lastEventAt });
        this.onChange();
        return;
      }
      const keys = openWaitKeysOf(current);
      const key = encodeWaitKey(facts.kind, facts.id);
      if (keys.includes(key)) {
        await this.turns.put(sessionId, { ...current, lastEventAt });
        this.onChange();
        return;
      }
      const existingStart = current.openWaitStart ?? null;
      const openWaitStart = keys.length === 0 || existingStart === null ? facts.time : Math.min(existingStart, facts.time);
      const nextKeys = [...keys, key];
      const legacy = legacyWaitFields(nextKeys);
      await this.turns.put(sessionId, {
        busyMs: current.busyMs,
        openTurnStart: current.openTurnStart,
        waitedMs: current.waitedMs,
        openWaitStart,
        openWaitKind: legacy.openWaitKind,
        openWaitId: legacy.openWaitId,
        openWaitKeys: nextKeys,
        lastEventAt
      });
      this.onChange();
    }, "wait/start");
  }
  /**
   * Release one blocking wait. Only the matching key (same kind *and* id) is
   * removed; a result for another tool, a second decision, or an end whose id
   * the record never opened changes nothing but the activity bound.
   *
   * The union interval is folded into `waitedMs` only when the last open key is
   * released, which is what prevents overlapping waits from being counted
   * twice.
   * @param sessionId - Session the event belongs to.
   * @param facts - Wait kind and id off the event.
   */
  recordWaitEnd(sessionId, facts) {
    void this.enqueue(sessionId, async () => {
      const current = this.turns.get(sessionId);
      if (current === void 0) return;
      const lastEventAt = touchLastEventAt(current, facts.time);
      const keys = openWaitKeysOf(current);
      const key = encodeWaitKey(facts.kind, facts.id);
      if (!keys.includes(key)) {
        await this.turns.put(sessionId, { ...current, lastEventAt });
        this.onChange();
        return;
      }
      const remaining = keys.filter((open) => open !== key);
      if (remaining.length > 0) {
        const legacy = legacyWaitFields(remaining);
        await this.turns.put(sessionId, {
          busyMs: current.busyMs,
          openTurnStart: current.openTurnStart,
          waitedMs: current.waitedMs,
          openWaitStart: current.openWaitStart ?? null,
          openWaitKind: legacy.openWaitKind,
          openWaitId: legacy.openWaitId,
          openWaitKeys: remaining,
          lastEventAt
        });
        this.onChange();
        return;
      }
      const openWaitStart = current.openWaitStart ?? null;
      const waitedMs = openWaitStart === null ? Math.max(0, current.waitedMs ?? 0) : Math.max(0, current.waitedMs ?? 0) + Math.max(0, facts.time - openWaitStart);
      await this.turns.put(sessionId, {
        busyMs: current.busyMs,
        openTurnStart: current.openTurnStart,
        waitedMs,
        openWaitStart: null,
        openWaitKind: null,
        openWaitId: null,
        openWaitKeys: null,
        lastEventAt
      });
      this.onChange();
    }, "wait/end");
  }
  /**
   * Move the acknowledged cursor to now, preserving the turn facts.
   *
   * The route that calls this pushes the resulting state frame itself (the
   * caller owns the response it caused), which is why this write does not go
   * through {@link BoardLedgerOptions.onChange}.
   * @param sessionId - Session being acknowledged.
   * @returns true only once the write is durable; false when it failed.
   */
  async ack(sessionId) {
    let durable = false;
    await this.enqueue(sessionId, async () => {
      const current = this.acks.get(sessionId);
      await this.acks.put(sessionId, {
        lastTurnEnd: current?.lastTurnEnd ?? null,
        lastTurnEndKind: current?.lastTurnEndKind ?? null,
        lastTurnEndError: current?.lastTurnEndError ?? null,
        ackedAt: this.now()
      });
      durable = true;
    }, "ack");
    return durable;
  }
  /**
   * Whole durable state as one wire snapshot. Synchronous and total: absent
   * fields (a record written before a field existed) read as null.
   * @returns the feed pushed to clients.
   */
  snapshot() {
    const acks = emptySection();
    for (const [sessionId, record2] of this.acks.entries()) {
      acks[sessionId] = {
        lastTurnEnd: record2?.lastTurnEnd ?? null,
        lastTurnEndKind: record2?.lastTurnEndKind ?? null,
        lastTurnEndError: record2?.lastTurnEndError ?? null,
        ackedAt: record2?.ackedAt ?? null
      };
    }
    const turns = emptySection();
    for (const [sessionId, record2] of this.turns.entries()) {
      turns[sessionId] = {
        busyMs: record2?.busyMs ?? null,
        openTurnStart: record2?.openTurnStart ?? null,
        waitedMs: record2?.waitedMs ?? null,
        openWaitStart: record2?.openWaitStart ?? null,
        openWaitKind: record2?.openWaitKind ?? null,
        openWaitId: record2?.openWaitId ?? null,
        openWaitKeys: record2?.openWaitKeys ?? null,
        lastEventAt: record2?.lastEventAt ?? null
      };
    }
    return { acks, turns };
  }
  /**
   * Close the turns a previous process left open.
   *
   * This process just started, so no recorded open turn can still be running.
   * The fold stops at the record's {@link StoredTurnRecord.lastEventAt} — the
   * last instant this installation is known to have observed activity — rather
   * than at `now`, so the time the process spent down is never charged as busy
   * time. A record written before `lastEventAt` existed carries no such bound;
   * see {@link restartCloseAt} for the conservative fallback.
   * @returns true when at least one record was actually rewritten.
   */
  async reconcileOpenTurns() {
    const now = this.now();
    let rewrote = false;
    for (const [sessionId, record2] of this.turns.entries()) {
      if ((record2?.openTurnStart ?? null) === null) continue;
      let closed = false;
      await this.enqueue(sessionId, async () => {
        const current = this.turns.get(sessionId);
        const openTurnStart = current?.openTurnStart ?? null;
        if (current === void 0 || openTurnStart === null) return;
        const closeAt = this.restartCloseAt(sessionId, current, openTurnStart, now);
        await this.turns.put(sessionId, {
          busyMs: (current.busyMs ?? 0) + Math.max(0, closeAt - openTurnStart - waitedThrough(current, closeAt)),
          openTurnStart: null,
          waitedMs: null,
          openWaitStart: null,
          openWaitKind: null,
          openWaitId: null,
          openWaitKeys: null,
          lastEventAt: current.lastEventAt ?? null
        });
        closed = true;
        this.onChange();
      }, "reconciliation");
      if (closed) rewrote = true;
    }
    return rewrote;
  }
  /**
   * The instant a stale open turn may be charged through on restart.
   *
   * Never `now`: the process may have been down for days. A record with a
   * recorded activity bound closes there (clamped to `now` so a skewed future
   * timestamp cannot over-charge). An older record has no bound, so the newest
   * fact that is at least the open start — the ack cursor's `lastTurnEnd` when
   * it is later, else the open start itself — is used. Both fallbacks yield a
   * non-negative interval and therefore charge zero downtime rather than
   * guessing.
   * @param sessionId - Session being reconciled.
   * @param record - Current stored record (open turn).
   * @param openTurnStart - Start of the open turn.
   * @param now - Reconciliation clock reading.
   * @returns the epoch ms to close at.
   */
  restartCloseAt(sessionId, record2, openTurnStart, now) {
    const lastEventAt = record2.lastEventAt ?? null;
    if (lastEventAt !== null) return Math.min(lastEventAt, now);
    const ackEnd = this.acks.get(sessionId)?.lastTurnEnd ?? null;
    const bounded = ackEnd === null ? openTurnStart : Math.max(openTurnStart, ackEnd);
    return Math.min(bounded, now);
  }
  /**
   * Run one durable write in this session's submission order.
   *
   * A failed predecessor is already reported by this method's own guard, so it
   * must not strand the writes queued behind it (`then(job, job)`).
   * @param sessionId - Session owning the write.
   * @param job - The durable write and its follow-up.
   * @param label - Failure label for the log line.
   * @returns a promise that never rejects, settling once the write finished.
   */
  enqueue(sessionId, job, label) {
    const tail = this.chains.get(sessionId) ?? Promise.resolve();
    const pending = tail.then(job, job).catch((error) => {
      this.warn(`dsh-session-board: ${label} write failed for session ${sessionId}: ${describeError(error)}`);
    });
    this.chains.set(sessionId, pending);
    void pending.then(() => {
      if (this.chains.get(sessionId) === pending) this.chains.delete(sessionId);
    });
    return pending;
  }
};
function subscribeBoardLedger(ctx, ledgerReady) {
  ctx.on("session/event", (session, event) => {
    const envelope = asRecord2(event);
    if (envelope === null) return;
    const type = envelope["type"];
    const sessionId = readSessionId(session);
    if (sessionId === null) return;
    const time = readEventTime(envelope["time"]);
    if (time === null) return;
    const data = asRecord2(envelope["data"]);
    if (type === "turn/start") {
      void ledgerReady.then((ledger) => {
        ledger?.recordTurnStart(sessionId, time);
      });
      return;
    }
    if (type === "turn/end") {
      const facts = readTurnEndFacts(time, data === null ? null : data["reason"]);
      void ledgerReady.then((ledger) => {
        ledger?.recordTurnEnd(sessionId, facts);
      });
      return;
    }
    const wait = readWaitEvent(type, time, data);
    if (wait === null) return;
    void ledgerReady.then((ledger) => {
      if (wait.start) ledger?.recordWaitStart(sessionId, wait.facts);
      else ledger?.recordWaitEnd(sessionId, wait.facts);
    });
  });
}
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function readSessionId(session) {
  const envelope = asRecord2(session);
  return envelope === null ? null : readString(envelope["id"]);
}
function readEventTime(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function readTurnEndFacts(time, reason) {
  const envelope = asRecord2(reason);
  const kind = envelope === null ? null : readString(envelope["kind"]);
  const error = envelope === null ? null : asRecord2(envelope["error"]);
  const message = error === null ? null : readString(error["message"]);
  return { time, kind, errorMessage: kind === "error" ? message : null };
}
function readWaitEvent(type, time, data) {
  if (type === "approval/asked") {
    return { start: true, facts: { time, kind: "approval", id: data === null ? null : readString(data["id"]) } };
  }
  if (type === "approval/decided") {
    return { start: false, facts: { time, kind: "approval", id: data === null ? null : readString(data["id"]) } };
  }
  if (type === "tool/call") {
    const name2 = data === null ? null : readString(data["name"]);
    if (name2 !== null && QUESTION_TOOLS.has(name2)) {
      return { start: true, facts: { time, kind: "question", id: data === null ? null : readString(data["callId"]) } };
    }
    return null;
  }
  if (type === "tool/result") {
    return { start: false, facts: { time, kind: "question", id: readQuestionResultId(data) } };
  }
  return null;
}
function readQuestionResultId(data) {
  if (data === null) return null;
  const message = asRecord2(data["message"]);
  if (message === null) return null;
  const source = asRecord2(message["source"]);
  const fromSource = source === null ? null : readString(source["callId"]);
  return fromSource ?? readString(message["toolCallId"]);
}
function asRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function readString(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function emptySection() {
  return /* @__PURE__ */ Object.create(null);
}

// src/shared/manager.ts
var MANAGER_STATE_PATH = "/api/session-board/manager/state";
var MANAGER_SELECTION_PATH = "/api/session-board/manager/selection";
var MANAGER_TASK_PATH = "/api/session-board/manager/task";
var MANAGER_TASK_STATUSES = [
  "pending",
  "assigned",
  "running",
  "blocked",
  "done",
  "failed",
  "orphaned"
];
var EMPTY_SELECTION = Object.freeze({ workspaceIds: [], sessionIds: [] });
function isManagerTaskStatus(value) {
  return typeof value === "string" && MANAGER_TASK_STATUSES.includes(value);
}
var MANAGER_ID_MAX = 200;
var MANAGER_TITLE_MAX = 160;
var MANAGER_NOTE_MAX = 2e3;
var MANAGER_SELECTION_MAX = 500;
function isManagerId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MANAGER_ID_MAX && !value.includes("\0");
}
function normalizeSelection(value) {
  const source = typeof value === "object" && value !== null ? value : {};
  const collect = (input) => {
    if (!Array.isArray(input)) return [];
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const entry of input) {
      if (!isManagerId(entry) || seen.has(entry)) continue;
      seen.add(entry);
      out.push(entry);
      if (out.length >= MANAGER_SELECTION_MAX) break;
    }
    return out;
  };
  return { workspaceIds: collect(source.workspaceIds), sessionIds: collect(source.sessionIds) };
}
function truncateCodePoints(text, max) {
  const points = Array.from(text);
  return points.length <= max ? text : `${points.slice(0, Math.max(0, max - 1)).join("")}\u2026`;
}
function previewText(text, max = 120) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return truncateCodePoints(collapsed, max);
}

// src/host/manager/domain.ts
var MANAGER_DOMAIN_NAME = "dsh_session_board_manager";
var MANAGER_STATE_TABLE = "manager_state";
var MANAGER_TASK_TABLE = "manager_tasks";
var MANAGER_STATE_KEY = "state";
function emptyManagerState() {
  return { selection: { workspaceIds: [], sessionIds: [] }, wakeEnabled: false, revision: 0 };
}
var managerStateSchema = {
  parse(value) {
    const source = typeof value === "object" && value !== null ? value : {};
    return {
      ...typeof source.managerSessionId === "string" && source.managerSessionId !== "" ? { managerSessionId: source.managerSessionId } : {},
      ...typeof source.managerWorkspaceId === "string" && source.managerWorkspaceId !== "" ? { managerWorkspaceId: source.managerWorkspaceId } : {},
      selection: normalizeSelection(source.selection),
      wakeEnabled: source.wakeEnabled === true,
      revision: Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
      ...typeof source.lastProgress === "string" && source.lastProgress !== "" ? { lastProgress: source.lastProgress.slice(0, 2e3) } : {}
    };
  }
};
var managerTaskSchema = {
  parse(value) {
    const source = typeof value === "object" && value !== null ? value : {};
    const id = typeof source.id === "string" ? source.id : "";
    const title = typeof source.title === "string" && source.title !== "" ? source.title : "task";
    const status = isManagerTaskStatus(source.status) ? source.status : "pending";
    const now = Date.now();
    return {
      id,
      title,
      status,
      ...typeof source.workspaceId === "string" ? { workspaceId: source.workspaceId } : {},
      ...typeof source.sessionId === "string" ? { sessionId: source.sessionId } : {},
      ...typeof source.note === "string" ? { note: source.note } : {},
      createdAt: typeof source.createdAt === "number" ? source.createdAt : now,
      updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : now
    };
  }
};
var managerDomainSpec = defineDomain({
  name: MANAGER_DOMAIN_NAME,
  version: 1,
  invalidRecords: "backup-and-skip",
  tables: {
    [MANAGER_STATE_TABLE]: domainTable(managerStateSchema),
    [MANAGER_TASK_TABLE]: domainTable(managerTaskSchema)
  }
});

// src/host/manager/mux.ts
var MUX_LIMITS = {
  /** Edges kept per source. */
  perSource: 8,
  /** Edges kept overall. */
  global: 64,
  /** Longest stored error/preview text. */
  textMax: 160
};
var PRIORITY_RANK = {
  "needs-input": 0,
  error: 1,
  completed: 2,
  progress: 3
};
function clip(text, max = MUX_LIMITS.textMax) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const points = Array.from(collapsed);
  return points.length <= max ? collapsed : `${points.slice(0, Math.max(0, max - 1)).join("")}\u2026`;
}
function assistantPreview(event) {
  if (event.type !== "assistant/message") return "";
  const parts = [];
  for (const block of event.data.message.content) {
    if (block.type === "text") parts.push(block.text);
  }
  return clip(parts.join(" "));
}
function statusAfterTurn(reason) {
  if (reason === "error" || reason === "max-tokens" || reason === "interrupted") return "error";
  if (reason === "aborted" || reason === "blocked") return "waiting";
  return "done";
}
var EventMux = class {
  levels = /* @__PURE__ */ new Map();
  edges = [];
  revision = 0;
  seq = 0;
  dropped = 0;
  /** Drops accumulated since the last drain; reported once, then reset. */
  droppedSinceDrain = 0;
  /**
   * Fold one committed session event into its source level and edges.
   * @param sessionId - source session id.
   * @param event - the committed durable event.
   * @param now - injectable clock for tests.
   */
  record(sessionId, event, now = Date.now()) {
    const current = this.levels.get(sessionId);
    const base = current ?? { status: "idle", lastAt: now };
    const touch = (next) => {
      this.levels.set(sessionId, next);
      this.revision += 1;
    };
    switch (event.type) {
      case "turn/start": {
        touch({ ...base, status: "running", turn: event.data.turn, lastAt: now });
        this.pushEdge({
          key: `${sessionId}:turn-start:${event.data.turn}`,
          sourceId: sessionId,
          kind: "turn-start",
          priority: "progress",
          at: now,
          summary: `turn ${event.data.turn} started`
        });
        return;
      }
      case "turn/end": {
        const reason = event.data.reason.kind;
        const status = statusAfterTurn(reason);
        touch({
          ...base,
          status,
          turn: event.data.turn,
          lastAt: now,
          lastKind: reason,
          ...status === "error" ? { lastError: base.preview ?? "turn failed" } : {}
        });
        this.pushEdge({
          key: `${sessionId}:turn-end:${event.data.turn}`,
          sourceId: sessionId,
          kind: "turn-end",
          priority: status === "error" ? "error" : "completed",
          at: now,
          summary: `turn ${event.data.turn} ended (${reason})`
        });
        return;
      }
      case "assistant/message": {
        const preview = assistantPreview(event);
        touch({ ...base, lastAt: now, ...preview === "" ? {} : { preview } });
        return;
      }
      case "tool/result": {
        if (event.data.message.isError !== true) {
          touch({ ...base, lastAt: now });
          return;
        }
        const detail = clip(String(event.data.error?.reason ?? event.data.error?.code ?? "tool failed"));
        touch({ ...base, lastAt: now, lastError: detail });
        this.pushEdge({
          key: `${sessionId}:tool-error:${event.data.turn}:${event.data.step}`,
          sourceId: sessionId,
          kind: "tool-error",
          priority: "error",
          at: now,
          summary: `tool error: ${detail}`
        });
        return;
      }
      case "user/message": {
        touch({ ...base, lastAt: now });
        return;
      }
      default:
        return;
    }
  }
  /**
   * Fold one agent status flip. Agent status is live-only; a later session
   * event still wins because it carries the durable truth.
   * @param sessionId - source session id.
   * @param status - agent status.
   * @param now - injectable clock.
   */
  agentStatus(sessionId, status, now = Date.now()) {
    const current = this.levels.get(sessionId);
    if (current !== void 0 && current.status === "error") return;
    const next = { ...current ?? { lastAt: now }, status, lastAt: now };
    this.levels.set(sessionId, next);
    this.revision += 1;
  }
  /** Drop one source (session disposed) together with its queued edges. */
  remove(sessionId) {
    const hadEdges = this.edges.some((edge) => edge.sourceId === sessionId);
    if (hadEdges) this.removeBySeq(new Set(this.edges.filter((edge) => edge.sourceId === sessionId).map((edge) => edge.seq)));
    if (!this.levels.delete(sessionId) && !hadEdges) return;
    this.revision += 1;
  }
  /** Read the level-triggered truth plus the current edge list. */
  snapshot() {
    const sources = {};
    for (const [id, level] of this.levels) sources[id] = level;
    return {
      revision: this.revision,
      sources,
      edges: this.edges.map(({ key, sourceId, kind, priority, at, summary }) => ({ key, sourceId, kind, priority, at, summary }))
    };
  }
  /**
   * Drain ready edges for one manager digest (EPOLLONESHOT): the caller gets
   * the highest-priority items in reverse-age order and the list is cleared.
   * @param maxItems - upper bound of returned edges.
   * @returns up to `maxItems` edges, urgent first.
   */
  consumeEdges(maxItems = 20) {
    return this.drain(maxItems).edges;
  }
  /**
   * Drain the bounded edge list (EPOLLONESHOT) and report what the queue had
   * to drop since the previous drain. The surplus beyond `maxItems` is a real
   * loss too: it is counted in `stats().dropped` instead of vanishing.
   */
  drain(maxItems) {
    const limit = Math.max(1, maxItems);
    if (this.edges.length === 0) {
      const dropped2 = this.droppedSinceDrain;
      this.droppedSinceDrain = 0;
      return { edges: [], dropped: dropped2 };
    }
    const sorted = [...this.edges].sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] || right.at - left.at);
    const picked = sorted.slice(0, limit);
    const surplus = Math.max(0, this.edges.length - limit);
    this.edges.length = 0;
    this.dropped += surplus;
    const dropped = this.droppedSinceDrain + surplus;
    this.droppedSinceDrain = 0;
    return {
      edges: picked.map(({ key, sourceId, kind, priority, at, summary }) => ({ key, sourceId, kind, priority, at, summary })),
      dropped
    };
  }
  /** Manager digest text for the edges drained by one wakeup. */
  digest(maxItems = 20) {
    const { edges, dropped } = this.drain(maxItems);
    if (edges.length === 0) return "";
    const lines = edges.map((edge) => `- [${edge.priority}] ${edge.sourceId}: ${edge.summary}`);
    return [
      "[\u81EA\u52A8\u5524\u9192] \u5DE5\u4F5C\u533A/\u4F1A\u8BDD\u51FA\u73B0\u9700\u8981\u5904\u7406\u7684\u53D8\u5316\uFF1A",
      ...lines,
      ...dropped > 0 ? [`\uFF08\u6709 ${dropped} \u6761\u4F4E\u4F18\u5148\u7EA7\u4E8B\u4EF6\u56E0\u961F\u4F0D\u4E0A\u9650\u88AB\u4E22\u5F03\uFF09`] : []
    ].join("\n");
  }
  /** Per-source edge budget: drop the oldest progress edges of that source. */
  trimSource(sourceId) {
    const own = this.edges.filter((edge) => edge.sourceId === sourceId);
    if (own.length <= MUX_LIMITS.perSource) return;
    const excess = own.length - MUX_LIMITS.perSource;
    own.sort((left, right) => PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority] || left.at - right.at);
    const drop = new Set(own.slice(0, excess).map((edge) => edge.seq));
    this.removeBySeq(drop);
    this.dropped += drop.size;
    this.droppedSinceDrain += drop.size;
  }
  /** Global edge budget: drop the oldest lowest-priority edges. */
  trimGlobal() {
    if (this.edges.length <= MUX_LIMITS.global) return;
    const excess = this.edges.length - MUX_LIMITS.global;
    const order = [...this.edges].sort((left, right) => PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority] || left.at - right.at);
    const drop = new Set(order.slice(0, excess).map((edge) => edge.seq));
    this.removeBySeq(drop);
    this.dropped += drop.size;
    this.droppedSinceDrain += drop.size;
  }
  removeBySeq(drop) {
    let write = 0;
    for (let read = 0; read < this.edges.length; read += 1) {
      const edge = this.edges[read];
      if (edge === void 0 || drop.has(edge.seq)) continue;
      this.edges[write] = edge;
      write += 1;
    }
    this.edges.length = write;
  }
  /** Append one bounded edge, deduping an identical live key. */
  pushEdge(input) {
    if (this.edges.some((edge) => edge.key === input.key)) return;
    this.seq += 1;
    this.edges.push({ ...input, seq: this.seq });
    this.trimSource(input.sourceId);
    this.trimGlobal();
  }
  /** Observability: counts for tests, logs and the panel footer. */
  stats() {
    return { sources: this.levels.size, edges: this.edges.length, dropped: this.dropped, revision: this.revision };
  }
};

// src/host/manager/service.ts
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// src/host/manager/tools.ts
var LINE_OUTPUT = {
  schema: { type: "array", items: { type: "string" } },
  render: (_args, value) => {
    if (!Array.isArray(value)) return [];
    return value.map((line) => ({ type: "text", text: typeof line === "string" ? line : JSON.stringify(line) }));
  }
};
function argObject(args, tool) {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new Error(`${tool}: arguments must be an object`);
  }
  return args;
}
function argString(args, name2, tool) {
  const value = args[name2];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${tool}: "${name2}" must be a non-empty string`);
  }
  return value.trim();
}
function optionalStatus(args, name2, tool) {
  const value = args[name2];
  if (value === void 0) return void 0;
  if (!isManagerTaskStatus(value)) {
    throw new Error(`${tool}: "${name2}" must be one of pending, assigned, running, blocked, done, failed, orphaned`);
  }
  return value;
}
function optionalString(args, name2, tool) {
  const value = args[name2];
  if (value === void 0) return void 0;
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${tool}: "${name2}" must be a non-empty string when present`);
  }
  return value.trim();
}
function taskLine(task) {
  const links = [
    task.workspaceId === void 0 ? "" : `workspace=${task.workspaceId}`,
    task.sessionId === void 0 ? "" : `session=${task.sessionId}`
  ].filter((part) => part !== "").join(" ");
  return `- ${task.id} [${task.status}] ${task.title}${links === "" ? "" : ` (${links})`}` + (task.note === void 0 ? "" : ` \u2014 ${previewText(task.note, 120)}`);
}
function managerToolDefinitions(context) {
  return [
    {
      name: "workspace_overview",
      description: "List every DSH workspace with its title, path, session count and task count.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        argObject(args, "workspace_overview");
        return await context.overview();
      }
    },
    {
      name: "workspace_sessions",
      description: "List the sessions of one workspace with status, title and last activity time.",
      parameters: {
        type: "object",
        properties: { workspaceId: { type: "string", description: "Workspace id from workspace_overview." } },
        required: ["workspaceId"],
        additionalProperties: false
      },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        const input = argObject(args, "workspace_sessions");
        return await context.workspaceSessions(argString(input, "workspaceId", "workspace_sessions"));
      }
    },
    {
      name: "session_status",
      description: "Read one session status: running state, last turn result, last error and last assistant preview.",
      parameters: {
        type: "object",
        properties: { sessionId: { type: "string", description: "Session id." } },
        required: ["sessionId"],
        additionalProperties: false
      },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        const input = argObject(args, "session_status");
        return await context.sessionStatus(argString(input, "sessionId", "session_status"));
      }
    },
    {
      name: "read_selection",
      description: "Read the workspaces and sessions the user currently has checked in the manager panel.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        argObject(args, "read_selection");
        const selection = context.selection();
        if (selection.workspaceIds.length === 0 && selection.sessionIds.length === 0) {
          return ["- (panel selection is empty)"];
        }
        return [
          ...selection.workspaceIds.map((id) => `- workspace ${id}`),
          ...selection.sessionIds.map((id) => `- session ${id}`)
        ];
      }
    },
    {
      name: "assign_task",
      description: "Create a task in one workspace: starts a session there with the brief and records the task. Use it for any concrete work item the user asks for.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short task title for the panel." },
          brief: { type: "string", description: "The prompt sent into the new session: goal, context, acceptance." },
          workspaceId: { type: "string", description: "Workspace id the task belongs to; the new session is created there." }
        },
        required: ["title", "brief", "workspaceId"],
        additionalProperties: false
      },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        const input = argObject(args, "assign_task");
        const result = await context.assignTask({
          title: argString(input, "title", "assign_task"),
          brief: argString(input, "brief", "assign_task"),
          workspaceId: argString(input, "workspaceId", "assign_task")
        });
        return [
          `- task ${result.task.id} [${result.task.status}] ${result.task.title}`,
          ...result.sessionId === void 0 ? ["- session: (creation failed; task recorded only)"] : [`- session ${result.sessionId}`]
        ];
      }
    },
    {
      name: "list_tasks",
      description: "List the manager task board with status, links and the latest progress note.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        argObject(args, "list_tasks");
        const tasks = context.tasks();
        return tasks.length === 0 ? ["- (task board is empty)"] : tasks.map(taskLine);
      }
    },
    {
      name: "update_task",
      description: "Update one task status and/or note. Valid statuses: pending, assigned, running, blocked, done, failed, orphaned.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Task id from list_tasks." },
          status: {
            type: "string",
            enum: ["pending", "assigned", "running", "blocked", "done", "failed", "orphaned"],
            description: "New status."
          },
          note: { type: "string", description: "Progress note shown in the panel (evidence, blocker, next step)." }
        },
        required: ["id"],
        additionalProperties: false
      },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        const input = argObject(args, "update_task");
        const status = optionalStatus(input, "status", "update_task");
        const note = optionalString(input, "note", "update_task");
        const task = await context.updateTask({
          id: argString(input, "id", "update_task"),
          ...status === void 0 ? {} : { status },
          ...note === void 0 ? {} : { note }
        });
        return [taskLine(task)];
      }
    },
    {
      name: "report_progress",
      description: "Write a short progress note the panel shows next to the task (does not start a model turn).",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "One or two lines of progress/evidence." },
          taskId: { type: "string", description: "Optional task id this note belongs to." }
        },
        required: ["text"],
        additionalProperties: false
      },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        const input = argObject(args, "report_progress");
        await context.reportProgress({
          text: argString(input, "text", "report_progress"),
          ...optionalString(input, "taskId", "report_progress") === void 0 ? {} : { taskId: optionalString(input, "taskId", "report_progress") }
        });
        return ["- progress recorded"];
      }
    },
    {
      name: "set_auto_wake",
      description: "Enable or disable event-driven wakeups. When enabled the panel may wake you with a digest when tracked sessions need input, fail, or finish; keep it off unless the user asks for supervision.",
      parameters: {
        type: "object",
        properties: { enabled: { type: "boolean", description: "Whether automatic wakeups are allowed." } },
        required: ["enabled"],
        additionalProperties: false
      },
      output: LINE_OUTPUT,
      async execute(args, _exec) {
        const input = argObject(args, "set_auto_wake");
        if (typeof input.enabled !== "boolean") throw new Error('set_auto_wake: "enabled" must be a boolean');
        const enabled = await context.setAutoWake(input.enabled);
        return [`- auto wake ${enabled ? "enabled" : "disabled"}`];
      }
    }
  ];
}

// src/host/manager/service.ts
var MANAGER_SESSION_TITLE = "DSH \u7BA1\u7406\u53F0";
var AUTO_WAKE_MIN_INTERVAL_MS = 6e4;
var MANAGER_PROMPT_TIMEOUT_MS = 3e4;
var MANAGER_SECTION_ORDER = 900;
var MANAGER_CONTEXT_ORDER = 950;
var MANAGER_POLICY = [
  "You are the DSH workspace manager. You are the only agent that can see the",
  "manager panel state, hand out tasks to workspaces, and report progress.",
  "",
  "Tools: workspace_overview, workspace_sessions, session_status, read_selection,",
  "assign_task, list_tasks, update_task, report_progress, set_auto_wake.",
  "Use assign_task only for concrete work the user asked for; create one task and",
  "one session per work item, then track it with update_task. Never archive, delete",
  "or stop sessions or jobs; ask the user to do it in the main UI.",
  "The user may hand you a selection block; the durable selection is also visible",
  "below. Keep task notes short and evidence-based."
].join("\n");
var ManagerService = class {
  /** @param deps - nested host context plus the durable tables. */
  constructor(deps) {
    this.deps = deps;
    this.state = deps.state.get(MANAGER_STATE_KEY) ?? emptyManagerState();
    this.managerSessionId = this.state.managerSessionId === void 0 ? void 0 : this.state.managerSessionId;
  }
  deps;
  state;
  managerSessionId;
  provisioning;
  installed = /* @__PURE__ */ new Map();
  lastWakeAt = 0;
  lastError;
  /** Current session id, when provisioned. */
  get sessionId() {
    return this.managerSessionId;
  }
  /** Project the durable state into the wire view. */
  view() {
    return {
      ...this.managerSessionId === void 0 ? {} : { managerSessionId: this.managerSessionId },
      ...this.state.managerWorkspaceId === void 0 ? {} : { managerWorkspaceId: this.state.managerWorkspaceId },
      selection: normalizeSelection(this.state.selection),
      tasks: this.taskViews(),
      wakeEnabled: this.state.wakeEnabled,
      muxRevision: this.deps.mux.snapshot().revision,
      ...this.lastError === void 0 ? {} : { error: this.lastError }
    };
  }
  /**
   * Provision the manager workspace/session once. Idempotent and serialized;
   * the session id is persisted before creation so an `agent/created` listener
   * can recognize the very first manager Agent.
   */
  ensure() {
    if (this.managerSessionId !== void 0) {
      return Promise.resolve({
        managerSessionId: this.managerSessionId,
        ...this.state.managerWorkspaceId === void 0 ? {} : { managerWorkspaceId: this.state.managerWorkspaceId }
      });
    }
    this.provisioning ??= this.provision().finally(() => {
      this.provisioning = void 0;
    });
    return this.provisioning;
  }
  /**
   * Install tools/prompt context on the manager Agent, whether it was just
   * created or resumed from disk. Non-manager agents are ignored.
   * @param agent - every published Agent.
   */
  installAgent(agent) {
    if (agent.id !== this.managerSessionId || this.installed.has(agent.id)) return;
    const disposers = [];
    try {
      const context = this.toolContext();
      for (const definition of managerToolDefinitions(context)) {
        disposers.push(agent.ctx.tools.register(definition));
      }
      disposers.push(agent.ctx.systemPrompt.section({
        name: "session-board:manager-policy",
        order: MANAGER_SECTION_ORDER,
        text: MANAGER_POLICY
      }));
      disposers.push(agent.ctx.systemPrompt.context({
        name: "session-board:manager-context",
        order: MANAGER_CONTEXT_ORDER,
        required: true,
        text: () => this.promptContextText()
      }));
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose();
      this.deps.warn(`dsh-session-board: manager tools failed to install: ${describe(error)}`);
      return;
    }
    this.installed.set(agent.id, () => {
      for (const dispose of disposers.reverse()) dispose();
    });
  }
  /** Drop one Agent's scoped registrations when it is disposed. */
  disposeAgent(agentId) {
    const dispose = this.installed.get(agentId);
    if (dispose === void 0) return;
    this.installed.delete(agentId);
    dispose();
  }
  /** Release every scoped registration; called on plugin unload. */
  dispose() {
    for (const dispose of [...this.installed.values()]) dispose();
    this.installed.clear();
  }
  /** Current durable selection. */
  selection() {
    return normalizeSelection(this.state.selection);
  }
  /**
   * Persist one selection mirror write.
   * @param raw - untrusted wire value.
   * @returns the normalized selection and new revision.
   */
  async writeSelection(raw) {
    const selection = normalizeSelection(raw);
    const next = { ...this.state, selection, revision: this.state.revision + 1 };
    await this.deps.state.put(MANAGER_STATE_KEY, next);
    this.state = next;
    return { selection, revision: next.revision };
  }
  /**
   * Apply one task-board mutation.
   * @param request - wire request (`create` or `update`).
   * @returns the resulting task view.
   */
  async task(request) {
    if (request.action === "create") {
      const title = typeof request.task.title === "string" ? request.task.title.trim() : "";
      if (title === "") throw new Error("task create requires a title");
      const now = this.now();
      const record2 = {
        id: randomUUID(),
        title: title.slice(0, MANAGER_TITLE_MAX),
        status: request.task.status ?? "pending",
        ...typeof request.task.workspaceId === "string" ? { workspaceId: request.task.workspaceId } : {},
        ...typeof request.task.sessionId === "string" ? { sessionId: request.task.sessionId } : {},
        ...typeof request.task.note === "string" ? { note: request.task.note.slice(0, MANAGER_NOTE_MAX) } : {},
        createdAt: now,
        updatedAt: now
      };
      await this.deps.tasks.put(record2.id, record2);
      return { task: this.deriveTask(record2) };
    }
    const id = typeof request.task.id === "string" ? request.task.id : "";
    const current = this.deps.tasks.get(id);
    if (current === void 0) throw new Error(`unknown task "${id}"`);
    const status = request.task.status;
    const note = request.task.note;
    const next = {
      ...current,
      ...status === void 0 ? {} : { status },
      ...note === void 0 ? {} : { note: note.slice(0, MANAGER_NOTE_MAX) },
      updatedAt: this.now()
    };
    await this.deps.tasks.put(id, next);
    return { task: this.deriveTask(next) };
  }
  /**
   * Turn newly drained mux edges into at most one manager digest. The wake
   * policy is deliberately conservative: opted-in, manager idle, one wake per
   * minute, and edges only (never one prompt per event).
   * @param now - injectable clock.
   */
  noteEdges(now = this.now()) {
    if (!this.state.wakeEnabled) return;
    const sessionId = this.managerSessionId;
    if (sessionId === void 0) return;
    if (this.deps.ctx.agents.get(sessionId)?.status === "running") return;
    if (now - this.lastWakeAt < AUTO_WAKE_MIN_INTERVAL_MS) return;
    const digest = this.deps.mux.digest();
    if (digest === "") return;
    this.lastWakeAt = now;
    this.prompt(sessionId, `[\u7CFB\u7EDF] ${digest}

\u8BF7\u67E5\u770B\u5F53\u524D\u72B6\u6001\u5E76\u7528\u5DE5\u5177\u5904\u7406\u6216\u5411\u7528\u6237\u6C47\u62A5\u3002`).catch(
      (error) => this.deps.warn(`dsh-session-board: auto wake failed: ${describe(error)}`)
    );
  }
  /** The tool/prompt content projection installed on the manager Agent. */
  toolContext() {
    return {
      selection: () => this.selection(),
      tasks: () => this.taskViews(),
      overview: async () => this.overview(),
      workspaceSessions: async (workspaceId) => this.workspaceSessions(workspaceId),
      sessionStatus: async (sessionId) => this.sessionStatus(sessionId),
      assignTask: async (input) => await this.assignTask(input),
      updateTask: async (input) => (await this.task({
        action: "update",
        task: {
          id: input.id,
          ...input.status === void 0 ? {} : { status: input.status },
          ...input.note === void 0 ? {} : { note: input.note }
        }
      })).task,
      reportProgress: async (input) => {
        await this.reportProgress(input);
      },
      setAutoWake: async (enabled) => await this.setAutoWake(enabled)
    };
  }
  /** Dynamic prompt context: selection, tasks and last progress line. */
  promptContextText() {
    const selection = this.selection();
    const tasks = this.taskViews();
    const lines = [
      `[manager panel] selection: workspaces=[${selection.workspaceIds.join(", ")}] sessions=[${selection.sessionIds.join(", ")}]`
    ];
    if (this.state.lastProgress !== void 0) lines.push(`[last progress] ${this.state.lastProgress}`);
    lines.push(...tasks.length === 0 ? ["[tasks] (empty)"] : ["[tasks]", ...tasks.map((task) => `- ${task.id} [${task.status}] ${task.title}` + (task.sessionId === void 0 ? "" : ` session=${task.sessionId}`))]);
    return lines.join("\n");
  }
  async provision() {
    try {
      await mkdir(this.deps.managerDir, { recursive: true });
      let workspace = await this.deps.ctx.workspaceRegistry.resolveByPath(this.deps.managerDir);
      workspace ??= await this.deps.ctx.workspaceRegistry.create(this.deps.managerDir);
      const sessionId = randomUUID();
      const pending = {
        ...this.state,
        managerSessionId: sessionId,
        managerWorkspaceId: workspace.id,
        revision: this.state.revision + 1
      };
      await this.deps.state.put(MANAGER_STATE_KEY, pending);
      this.state = pending;
      this.managerSessionId = sessionId;
      const created = await this.deps.ctx.sessionController.create({ sessionId, workspaceId: workspace.id });
      const createdId = created.sessionId;
      if (createdId !== sessionId) {
        const corrected = {
          ...this.state,
          managerSessionId: createdId,
          revision: this.state.revision + 1
        };
        await this.deps.state.put(MANAGER_STATE_KEY, corrected);
        this.state = corrected;
        this.managerSessionId = createdId;
      }
      try {
        await this.deps.ctx.sessionController.rename({ sessionId: createdId, title: MANAGER_SESSION_TITLE });
      } catch (error) {
        this.deps.warn(`dsh-session-board: manager session rename failed: ${describe(error)}`);
      }
      this.lastError = void 0;
      return {
        managerSessionId: createdId,
        ...this.state.managerWorkspaceId === void 0 ? {} : { managerWorkspaceId: this.state.managerWorkspaceId }
      };
    } catch (error) {
      this.lastError = describe(error);
      this.deps.warn(`dsh-session-board: manager provisioning failed: ${describe(error)}`);
      throw error;
    }
  }
  taskViews() {
    const views = [];
    for (const [, record2] of this.deps.tasks.entries()) views.push(this.deriveTask(record2));
    views.sort((left, right) => right.updatedAt - left.updatedAt);
    return views;
  }
  /** Derive a task's running/blocked state from the session event mux. */
  deriveTask(record2) {
    const level = record2.sessionId === void 0 ? void 0 : this.deps.mux.snapshot().sources[record2.sessionId];
    if (level === void 0 || record2.status === "done" || record2.status === "failed" || record2.status === "orphaned") {
      return record2;
    }
    if (level.status === "running" && record2.status !== "running") {
      return { ...record2, status: "running", updatedAt: Math.max(record2.updatedAt, level.lastAt) };
    }
    if ((level.status === "error" || level.status === "waiting") && record2.status !== "blocked") {
      return { ...record2, status: "blocked", updatedAt: Math.max(record2.updatedAt, level.lastAt) };
    }
    return record2;
  }
  async overview() {
    const tasks = this.taskViews();
    return this.deps.ctx.workspaceRegistry.list().map((workspace) => `- ${workspace.id} "${workspace.title}" ${workspace.path} sessions=${workspace.sessionIds.length} tasks=${tasks.filter((task) => task.workspaceId === workspace.id).length}`);
  }
  async listSessions() {
    try {
      const response = await this.deps.ctx.sessionController.list({}, AbortSignal.timeout(5e3));
      return response.items.map((item) => {
        const title = item.projections?.values.title;
        return {
          sessionId: item.sessionId,
          ...typeof title === "string" && title !== "" ? { title } : {},
          running: item.running
        };
      });
    } catch (error) {
      this.deps.warn(`dsh-session-board: manager session list failed: ${describe(error)}`);
      return [];
    }
  }
  async workspaceSessions(workspaceId) {
    const workspace = this.deps.ctx.workspaceRegistry.get(workspaceId);
    if (workspace === void 0) throw new Error(`unknown workspace "${workspaceId}"`);
    const rows = await this.listSessions();
    const byId = new Map(rows.map((row) => [row.sessionId, row]));
    const sources = this.deps.mux.snapshot().sources;
    return workspace.sessionIds.map((sessionId) => {
      const row = byId.get(sessionId);
      const state = sources[sessionId];
      const title = row?.title ?? sessionId;
      return `- ${sessionId} ${state?.status ?? (row?.running === true ? "running" : "idle")} "${previewText(title, 80)}"`;
    });
  }
  async sessionStatus(sessionId) {
    const level = this.deps.mux.snapshot().sources[sessionId];
    const agent = this.deps.ctx.agents.get(sessionId);
    const rows = await this.listSessions();
    const row = rows.find((candidate) => candidate.sessionId === sessionId);
    if (level === void 0 && agent === void 0 && row === void 0) {
      throw new Error(`unknown session "${sessionId}"`);
    }
    return [
      `- session ${sessionId}`,
      `- status ${level?.status ?? agent?.status ?? "unknown"}`,
      ...row?.title === void 0 ? [] : [`- title ${previewText(row.title, 120)}`],
      ...level?.turn === void 0 ? [] : [`- last turn ${level.turn}`],
      ...level?.lastKind === void 0 ? [] : [`- last turn end ${level.lastKind}`],
      ...level?.lastError === void 0 ? [] : [`- last error ${level.lastError}`],
      ...level?.preview === void 0 ? [] : [`- last assistant ${level.preview}`]
    ];
  }
  async assignTask(input) {
    const workspace = this.deps.ctx.workspaceRegistry.get(input.workspaceId);
    if (workspace === void 0) throw new Error(`unknown workspace "${input.workspaceId}"`);
    const now = this.now();
    const record2 = {
      id: randomUUID(),
      title: input.title.slice(0, MANAGER_TITLE_MAX),
      status: "assigned",
      workspaceId: workspace.id,
      createdAt: now,
      updatedAt: now
    };
    await this.deps.tasks.put(record2.id, record2);
    try {
      const created = await this.deps.ctx.sessionController.create({ workspaceId: workspace.id });
      const withSession = { ...record2, sessionId: created.sessionId, updatedAt: this.now() };
      await this.deps.tasks.put(record2.id, withSession);
      await this.prompt(created.sessionId, input.brief);
      return { task: this.deriveTask(withSession), sessionId: created.sessionId };
    } catch (error) {
      const failed = {
        ...record2,
        status: "failed",
        note: `task dispatch failed: ${describe(error)}`.slice(0, MANAGER_NOTE_MAX),
        updatedAt: this.now()
      };
      await this.deps.tasks.put(record2.id, failed);
      this.deps.warn(`dsh-session-board: assign_task dispatch failed: ${describe(error)}`);
      return { task: this.deriveTask(failed) };
    }
  }
  async reportProgress(input) {
    const note = input.text.slice(0, MANAGER_NOTE_MAX);
    if (input.taskId === void 0) {
      const next2 = { ...this.state, lastProgress: note, revision: this.state.revision + 1 };
      await this.deps.state.put(MANAGER_STATE_KEY, next2);
      this.state = next2;
      return;
    }
    const current = this.deps.tasks.get(input.taskId);
    if (current === void 0) throw new Error(`unknown task "${input.taskId}"`);
    const next = { ...current, note: note.slice(0, MANAGER_NOTE_MAX), updatedAt: this.now() };
    await this.deps.tasks.put(input.taskId, next);
  }
  async setAutoWake(enabled) {
    const next = { ...this.state, wakeEnabled: enabled, revision: this.state.revision + 1 };
    await this.deps.state.put(MANAGER_STATE_KEY, next);
    this.state = next;
    return next.wakeEnabled;
  }
  async prompt(sessionId, text) {
    const request = {
      requestId: randomUUID(),
      sessionId,
      mode: "queue",
      content: [{ type: "text", text }]
    };
    await this.deps.ctx.sessionController.prompt(request, AbortSignal.timeout(MANAGER_PROMPT_TIMEOUT_MS));
  }
  now() {
    return this.deps.now?.() ?? Date.now();
  }
};
function describe(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
function defaultManagerDir() {
  return process.env.DSH_SESSION_BOARD_MANAGER_DIR ?? join(homedir(), "Documents", "deepseek-harness", "dsh-console");
}

// src/host/manager/routes.ts
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
async function readJsonBody(request) {
  try {
    const text = await request.text();
    if (text.trim() === "") return void 0;
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function describe2(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
function createManagerRoutes(handlers) {
  const stateRoute = {
    path: MANAGER_STATE_PATH,
    methods: ["GET"],
    requestBody: "buffered",
    fetch: async () => {
      try {
        return jsonResponse(200, { ok: true, state: await handlers.state() });
      } catch (error) {
        handlers.warn(`dsh-session-board: manager state failed: ${describe2(error)}`);
        return jsonResponse(500, { ok: false, error: "MANAGER_STATE_UNAVAILABLE" });
      }
    }
  };
  const selectionRoute = {
    path: MANAGER_SELECTION_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      try {
        const result = await handlers.selection(await readJsonBody(request));
        return jsonResponse(200, { ok: true, ...result });
      } catch (error) {
        handlers.warn(`dsh-session-board: manager selection failed: ${describe2(error)}`);
        return jsonResponse(400, { ok: false, error: "SELECTION_INVALID" });
      }
    }
  };
  const taskRoute = {
    path: MANAGER_TASK_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      try {
        const result = await handlers.task(await readJsonBody(request));
        return jsonResponse(200, { ok: true, ...result });
      } catch (error) {
        handlers.warn(`dsh-session-board: manager task failed: ${describe2(error)}`);
        return jsonResponse(400, { ok: false, error: "TASK_INVALID" });
      }
    }
  };
  return [stateRoute, selectionRoute, taskRoute];
}

// src/host/manager/wiring.ts
function startManager(options) {
  const { ctx, storageDomain, connection, warn } = options;
  const mux = new EventMux();
  void (async () => {
    let service;
    try {
      const domain = await storageDomain.open(managerDomainSpec);
      ctx.effect(() => () => domain.close(), "dsh-session-board: manager domain");
      const stateTable = domain.table(MANAGER_STATE_TABLE);
      const taskTable = domain.table(MANAGER_TASK_TABLE);
      service = new ManagerService({
        ctx,
        state: stateTable,
        tasks: taskTable,
        mux,
        managerDir: options.managerDir ?? defaultManagerDir(),
        warn
      });
      ctx.effect(() => () => service.dispose(), "dsh-session-board: manager service");
    } catch (error) {
      warn(`dsh-session-board: manager store unavailable, manager panel disabled: ${describe3(error)}`);
      return;
    }
    const routes = createManagerRoutes({
      state: async () => {
        try {
          await service.ensure();
        } catch {
        }
        return service.view();
      },
      selection: async (raw) => await service.writeSelection(raw),
      task: async (raw) => await service.task(readTaskRequest(raw)),
      warn
    });
    for (const route of routes) {
      ctx.effect(() => connection.fetch.register(route), `dsh-session-board: ${route.path}`);
    }
    ctx.on("session/event", (session, event) => {
      mux.record(session.id, event);
      service.noteEdges();
    });
    ctx.on("agent/status", ({ agent, status }) => {
      mux.agentStatus(agent.id, status);
    });
    ctx.on("agent/created", ({ agent }) => {
      service.installAgent(agent);
    });
    ctx.on("agent/disposed", ({ agent }) => {
      service.disposeAgent(agent.id);
      mux.remove(agent.id);
    });
  })();
}
function readTaskRequest(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("task body must be an object");
  const body = raw;
  const action = body.action;
  if (action !== "create" && action !== "update") throw new Error("task.action must be create or update");
  const task = body.task;
  if (typeof task !== "object" || task === null || Array.isArray(task)) throw new Error("task.task must be an object");
  const fields = task;
  const string = (name2) => {
    const value = fields[name2];
    if (value === void 0) return void 0;
    if (typeof value !== "string" || value === "") throw new Error(`task.${name2} must be a non-empty string`);
    return value;
  };
  const status = fields.status;
  if (status !== void 0) {
    const allowed = ["pending", "assigned", "running", "blocked", "done", "failed", "orphaned"];
    if (typeof status !== "string" || !allowed.includes(status)) throw new Error("task.status is invalid");
  }
  const id = string("id");
  const title = string("title");
  const workspaceId = string("workspaceId");
  const sessionId = string("sessionId");
  const note = string("note");
  return {
    action,
    task: {
      ...id === void 0 ? {} : { id },
      ...title === void 0 ? {} : { title },
      ...status === void 0 ? {} : { status },
      ...workspaceId === void 0 ? {} : { workspaceId },
      ...sessionId === void 0 ? {} : { sessionId },
      ...note === void 0 ? {} : { note }
    }
  };
}
function describe3(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

// src/host/model-service.ts
var SYNTHESIS_MAX_TOKENS = 8192;
async function isKnownSynthesisModel(llm, selection) {
  let providers;
  try {
    providers = llm.listProviders();
  } catch {
    return "UNKNOWN_MODEL";
  }
  if (!providers.some((provider) => provider.id === selection.provider)) return "UNKNOWN_MODEL";
  try {
    const models = await llm.listModels(selection.provider);
    if (!models.some((model) => model.id === selection.model)) return "UNKNOWN_MODEL";
  } catch {
    return "UNKNOWN_MODEL";
  }
  const effort = selection.reasoningEffort;
  if (effort === void 0 || effort === null || effort === "") return "ok";
  try {
    const resolved = await llm.resolveModelInfo(selection.provider, selection.model);
    const efforts = sanitizeReasoningEfforts(resolved.reasoning);
    return efforts.some((candidate) => candidate.id === effort) ? "ok" : "UNKNOWN_EFFORT";
  } catch {
    return "UNKNOWN_EFFORT";
  }
}
async function listSynthesisCatalog(llm) {
  const providers = llm.listProviders();
  const groups = [];
  for (const provider of providers) {
    let models = [];
    try {
      models = await llm.listModels(provider.id);
    } catch {
      models = [];
    }
    const rows = await Promise.all(models.filter((model) => typeof model.id === "string" && model.id !== "").map(async (model) => {
      const row = { id: model.id, name: typeof model.name === "string" && model.name !== "" ? model.name : model.id };
      let resolved;
      try {
        resolved = await llm.resolveModelInfo(provider.id, model.id);
      } catch {
        return row;
      }
      const efforts = sanitizeReasoningEfforts(resolved.reasoning);
      if (efforts.length === 0) return row;
      const declared = typeof resolved.reasoning?.defaultEffort === "string" ? resolved.reasoning.defaultEffort : null;
      const defaultEffort = declared !== null && efforts.some((effort) => effort.id === declared) ? declared : void 0;
      return { ...row, reasoning: { efforts, ...defaultEffort === void 0 ? {} : { defaultEffort } } };
    }));
    groups.push({ id: provider.id, name: typeof provider.name === "string" && provider.name !== "" ? provider.name : provider.id, models: rows });
  }
  return groups;
}
function sanitizeReasoningEfforts(reasoning) {
  if (reasoning === void 0 || !Array.isArray(reasoning.efforts)) return [];
  const efforts = [];
  const seen = /* @__PURE__ */ new Set();
  for (const effort of reasoning.efforts) {
    if (typeof effort.id !== "string" || effort.id.trim() === "" || seen.has(effort.id)) continue;
    seen.add(effort.id);
    efforts.push({ id: effort.id, name: typeof effort.name === "string" && effort.name.trim() !== "" ? effort.name : effort.id });
  }
  return efforts;
}
async function runSynthesisModel(llm, request) {
  const options = {
    provider: request.provider,
    model: request.model,
    system: request.system,
    messages: [{ role: "user", content: [{ type: "text", text: request.prompt }] }],
    maxTokens: SYNTHESIS_MAX_TOKENS,
    sessionId: request.sessionId,
    signal: request.signal,
    ...request.reasoningEffort === void 0 || request.reasoningEffort === null || request.reasoningEffort === "" ? {} : { reasoningEffort: request.reasoningEffort }
  };
  let streamed = "";
  let finished;
  const blockText = [];
  for await (const chunk of llm.stream(options)) {
    if (chunk.type === "text-delta" && typeof chunk.text === "string") streamed += chunk.text;
    else if (chunk.type === "block-end" && chunk.block?.type === "text" && typeof chunk.block.text === "string") blockText.push(chunk.block.text);
    else if (chunk.type === "finish") finished = chunk.reason?.kind;
  }
  if (finished === "error" || finished === "aborted" || finished === "max-tokens" || finished === void 0) {
    throw new Error("SYNTHESIS_MODEL_FAILED");
  }
  const output = streamed.trim() === "" ? blockText.join("") : streamed;
  if (output.trim() === "") throw new Error("SYNTHESIS_MODEL_EMPTY");
  return output;
}

// src/host/wiki-archive.ts
import { execFile as execFile2 } from "node:child_process";
import { randomUUID as randomUUID2 } from "node:crypto";
import { homedir as homedir2 } from "node:os";
import { dirname, join as join2, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify as promisify2 } from "node:util";

// src/shared/archive.ts
var MAX_ARCHIVE_SELECTION = 50;
var WIKI_WORKFLOW_CAPABILITY = 2;
var WIKI_ARCHIVE_PATH = "/api/session-board/wiki-archive";
function parseArchiveSummary(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Invalid archive summary");
  const v = raw;
  const planned = v.dry_run === true && v.would_archive !== void 0 ? v.would_archive : v.archived;
  if (!Number.isSafeInteger(planned) || planned < 0) throw new Error("Invalid archive planned count");
  const counts = ["archived", "skipped", "empty", "failed", "selected"];
  for (const key of counts) {
    if (!Number.isSafeInteger(v[key]) || v[key] < 0) throw new Error("Invalid archive counts");
  }
  if (typeof v.dry_run !== "boolean" || !Array.isArray(v.results)) throw new Error("Invalid archive rows");
  const actions = /* @__PURE__ */ new Set(["would-archive", "archived", "skipped", "empty", "failed"]);
  const results = v.results.map((row) => {
    if (typeof row !== "object" || row === null) throw new Error("Invalid archive row");
    const r = row;
    if (typeof r.session !== "string" || r.session === "" || typeof r.source !== "string" || r.source === "" || typeof r.action !== "string" || !actions.has(r.action)) throw new Error("Invalid archive row");
    if (r.page !== void 0 && typeof r.page !== "string") throw new Error("Invalid archive page");
    return { session: r.session, source: r.source, action: r.action, ...r.page === void 0 ? {} : { page: r.page } };
  });
  if (results.length !== v.selected || results.length > MAX_ARCHIVE_SELECTION) throw new Error("Inconsistent archive rows");
  const totals = results.reduce((n, row) => {
    const key = row.action === "would-archive" || row.action === "archived" ? "archived" : row.action;
    n[key]++;
    return n;
  }, { archived: 0, skipped: 0, empty: 0, failed: 0 });
  if (Object.entries(totals).some(([key, value]) => (key === "archived" ? planned : v[key]) !== value)) throw new Error("Inconsistent archive counts");
  return { archived: planned, skipped: v.skipped, empty: v.empty, failed: v.failed, selected: v.selected, dry_run: v.dry_run, results, ...v.scope === void 0 ? {} : { scope: parseArchiveScope(v.scope) }, ...v.workflow === void 0 ? {} : { workflow: parseWikiWorkflow(v.workflow) } };
}
function record(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Invalid workflow result");
  return raw;
}
function safeRawPage(raw) {
  if (typeof raw !== "string" || !raw.startsWith("raw/sessions/") || !raw.endsWith(".md") || raw.includes("\\") || raw.split("/").some((part) => part === ".." || part === ".")) throw new Error("Invalid raw page");
  return raw;
}
function parseArchiveScope(raw) {
  const scope = record(raw);
  if (!Array.isArray(scope.entries) || scope.entries.length > MAX_ARCHIVE_SELECTION || !Array.isArray(scope.missing)) throw new Error("Invalid scope");
  const entries = scope.entries.map((item) => {
    const row = record(item);
    if (typeof row.session !== "string" || typeof row.source !== "string" || row.parent !== null && typeof row.parent !== "string" || !["main", "child"].includes(String(row.role)) || typeof row.evidence !== "string" || typeof row.snapshot !== "boolean") throw new Error("Invalid scope row");
    return { session: row.session, source: row.source, parent: row.parent, role: row.role, evidence: row.evidence, snapshot: row.snapshot };
  });
  const missing = scope.missing.map((item) => {
    const row = record(item);
    if (typeof row.session !== "string" || typeof row.parent !== "string") throw new Error("Invalid missing child");
    return { session: row.session, parent: row.parent };
  });
  return { entries, missing };
}
function parseWikiWorkflow(raw) {
  const value = record(raw);
  if (!Array.isArray(value.synthesis) || !["updated", "not-needed", "failed"].includes(String(value.index))) throw new Error("Invalid workflow");
  const synthesis = value.synthesis.map((item) => {
    const row = record(item);
    if (typeof row.session !== "string" || !["synthesized", "skipped", "failed", "sensitive"].includes(String(row.status)) || !Array.isArray(row.pages) || row.pages.some((page) => typeof page !== "string" || !/^(?:projects|concepts|experience|patterns|issues|tools|entities|digests|comparisons|decisions)\/[a-z0-9-]+\.md$/.test(page)) || row.error !== void 0 && typeof row.error !== "string") throw new Error("Invalid synthesis row");
    return { session: row.session, page: safeRawPage(row.page), status: row.status, pages: row.pages, ...row.error === void 0 ? {} : { error: row.error } };
  });
  return { synthesis, index: value.index };
}

// src/host/wiki-config.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var exec = promisify(execFile);
var WikiConfigError = class extends Error {
  /**
   * @param errors - stable codes such as `INVALID_WIKI_ROOT`.
   */
  constructor(errors) {
    super(errors[0] ?? "INVALID_CONFIG");
    this.errors = errors;
  }
  errors;
};
var ENGINE_SCRIPTS = ["wiki-archive.py", "wiki-synthesize.py", "wiki-index.py"];
function mergeWikiConfig(pluginConfig, stored) {
  return stored === null ? { ...pluginConfig } : { ...stored };
}
function buildWikiRuntime(input) {
  const home = input.home ?? "";
  const pluginConfig = input.pluginConfig ?? DEFAULT_WIKI_CONFIG;
  const config = mergeWikiConfig(pluginConfig, input.stored ?? null);
  const paths = resolveWikiPaths(config, home, input.storedProvider);
  const engineDir = config.scriptsMode === "local" ? paths.scriptsDir : input.engineDir;
  return {
    home,
    dshHome: input.dshHome ?? null,
    paths,
    engineDir,
    bridgePath: input.bridgePath,
    logPath: input.logPath ?? `${home}/.dsh-session-board/wiki.log`
  };
}
function wikiConfigResponse(config, home, status, provider) {
  const defaults = wikiDefaults(home);
  return { config: { ...config }, defaults: provider === void 0 ? defaults : { ...defaults, provider }, status };
}
async function appendWikiLog(runtime, message) {
  try {
    const { appendFile, mkdir: mkdir2, stat, writeFile } = await import("node:fs/promises");
    const { dirname: dirname3 } = await import("node:path");
    await mkdir2(dirname3(runtime.logPath), { recursive: true });
    const LOG_LIMIT = 2 * 1024 * 1024;
    const info = await stat(runtime.logPath).catch(() => null);
    if (info !== null && info.size > LOG_LIMIT) await writeFile(runtime.logPath, "", "utf8");
    await appendFile(runtime.logPath, `${(/* @__PURE__ */ new Date()).toISOString()}	${message.replace(/\n+/g, " \u23CE ").slice(0, 6e3)}
`, "utf8");
  } catch {
  }
}
function failedStatus(runtime, issues) {
  return {
    ok: false,
    issues,
    python: "",
    pythonExecutable: runtime.paths.python,
    engine: { dir: runtime.engineDir, scripts: ENGINE_SCRIPTS.map((name2) => ({ name: name2, path: `${runtime.engineDir}/${name2}`, exists: false, bytes: 0 })) },
    schema: { path: runtime.paths.schemaPath, bytes: 0 },
    wikiRoot: { path: runtime.paths.wikiRoot, exists: false },
    state: { path: runtime.paths.stateFile },
    operations: []
  };
}
async function probeWikiEnvironment(runtime) {
  const script = runtime.engineDir === "" ? "" : `${runtime.engineDir}/wiki-archive.py`;
  if (script === "" || runtime.dshHome === null) {
    return failedStatus(runtime, ["Wiki scripts directory is not configured", ...runtime.dshHome === null ? ["DSH_HOME is unknown"] : []]);
  }
  try {
    const result = await exec(runtime.paths.python, [
      runtime.bridgePath,
      "status",
      "--wiki-root",
      runtime.paths.wikiRoot,
      "--dsh-home",
      runtime.dshHome,
      "--scripts-dir",
      runtime.engineDir,
      "--schema",
      runtime.paths.schemaPath,
      "--python",
      runtime.paths.python,
      "--log",
      runtime.logPath
    ], { timeout: 3e4, maxBuffer: 1024 * 1024 });
    const parsed = parseEnvironmentStatus(JSON.parse(result.stdout));
    return parsed ?? failedStatus(runtime, ["Wiki bridge returned an unreadable status report"]);
  } catch (error) {
    const stdout = error.stdout;
    if (typeof stdout === "string") {
      try {
        const parsed = parseEnvironmentStatus(JSON.parse(stdout));
        if (parsed !== null) return parsed;
      } catch {
      }
    }
    const detail = error instanceof Error ? error.message : String(error);
    void appendWikiLog(runtime, `probe failed: ${detail}`);
    return failedStatus(runtime, [`Wiki bridge probe failed: ${detail.slice(0, 400)}`]);
  }
}
function validateWikiWrite(raw) {
  return validateWikiConfig(raw);
}

// src/host/wiki-archive.ts
var exec2 = promisify2(execFile2);
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var PREVIEW_TTL_MS = 5 * 6e4;
var WikiArchiveError = class extends Error {
  /**
   * @param code - stable machine code the client maps to localized copy.
   * @param detail - optional one-line diagnostic for the panel (no transcript text).
   */
  constructor(code, detail) {
    super(code);
    this.code = code;
    this.detail = detail;
  }
  code;
  detail;
};
function resolveSynthesisProvider(home) {
  try {
    const raw = JSON.parse(readFileSync(join2(home, ".dsh-session-board.json"), "utf8"));
    if (typeof raw === "object" && raw !== null && "synthesisProvider" in raw) {
      const value = raw.synthesisProvider;
      if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) return value;
    }
  } catch {
  }
  return DEFAULT_SYNTHESIS_PROVIDER;
}
var DEFAULT_SYNTHESIS_PROVIDER = "stepx-terra";
function resolveDshHome(configured, fromEnv) {
  const chosen = configured ?? (fromEnv === void 0 || fromEnv.trim() === "" ? void 0 : fromEnv) ?? join2(homedir2(), ".dsh");
  if (chosen.trim() === "") return null;
  try {
    return resolve(chosen);
  } catch {
    return null;
  }
}
function validateWikiIds(raw, max = MAX_ARCHIVE_SELECTION) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > max || raw.some((id) => typeof id !== "string" || !SAFE_ID.test(id) || id === "." || id === "..")) {
    throw new WikiArchiveError("INVALID_SELECTION");
  }
  return [...new Set(raw)];
}
function validateResult(raw, ids, dryRun) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WikiArchiveError("INVALID_RESULT");
  }
  if (typeof parsed === "object" && parsed !== null && "exit_code" in parsed && "error" in parsed && !("status" in parsed)) {
    const code = parsed.exit_code;
    throw new WikiArchiveError(code === 3 ? "SELECTION_MISMATCH" : code === 4 ? "BUSY" : code === 5 ? "STATE_UNAVAILABLE" : "ARCHIVE_UNAVAILABLE");
  }
  let summary;
  try {
    summary = parseArchiveSummary(parsed);
  } catch {
    throw new WikiArchiveError("INVALID_RESULT");
  }
  if (typeof parsed === "object" && parsed !== null && "status_error" in parsed && parsed.status_error) throw new WikiArchiveError("STATE_UNAVAILABLE");
  const returned = summary.results.map((row) => row.session);
  if (summary.dry_run !== dryRun || returned.length !== ids.length || new Set(returned).size !== ids.length || ids.some((id) => !returned.includes(id))) {
    throw new WikiArchiveError("SELECTION_MISMATCH");
  }
  for (const row of summary.results) {
    if (row.page !== void 0 && (!row.page.startsWith("raw/sessions/") || row.page.split("/").includes("..") || row.page.includes("\\"))) throw new WikiArchiveError("INVALID_RESULT");
  }
  return summary;
}
function parsePreparedPrompt(raw, session, page) {
  const value = typeof raw === "object" && raw !== null ? raw : {};
  const status = value.status;
  if (status === "sensitive" || status === "skipped") {
    const parsed = parseWikiWorkflow({
      synthesis: [{ status, pages: Array.isArray(value.pages) ? value.pages : [], ...status === "sensitive" ? { error: "SENSITIVE_CONTENT" } : {}, session, page }],
      index: "not-needed"
    });
    return { terminal: parsed.synthesis[0] };
  }
  const prompt = typeof value.prompt === "object" && value.prompt !== null ? value.prompt : null;
  if (prompt === null || typeof prompt.system !== "string" || typeof prompt.user !== "string") throw new WikiArchiveError("INVALID_RESULT");
  return { prompt: { system: prompt.system, user: prompt.user } };
}
function parseWrittenRow(raw, session, page) {
  const value = typeof raw === "object" && raw !== null ? { ...raw } : {};
  const parsed = parseWikiWorkflow({ synthesis: [{ ...value, session, page }], index: "not-needed" });
  return parsed.synthesis[0];
}
function createWikiArchiver(options = {}) {
  const home = resolve(options.home ?? homedir2());
  const dshHome = resolveDshHome(options.dshHome, process.env.DSH_HOME);
  const unavailableHome = dshHome === null;
  const now = options.now ?? Date.now;
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const runtimeOf = options.runtime ?? (() => buildWikiRuntime({
    home,
    dshHome,
    pluginConfig: DEFAULT_WIKI_CONFIG,
    stored: null,
    engineDir: join2(packageDir, "wiki"),
    bridgePath: join2(packageDir, "wiki-workflow.py"),
    storedProvider: resolveSynthesisProvider(home)
  }));
  const failureDetail = (error) => {
    const stderr = error.stderr;
    const stdout = error.stdout;
    const text = typeof stderr === "string" && stderr.trim() !== "" ? stderr : typeof stdout === "string" ? stdout : error instanceof Error ? error.message : String(error);
    return text.replace(/\s+/gu, " ").trim().slice(-400);
  };
  const execute = options.execute ?? (async (args, signal) => {
    const runtime = runtimeOf();
    const script = join2(runtime.engineDir, "wiki-archive.py");
    try {
      return await exec2(runtime.paths.python, [script, ...args], {
        timeout: runtime.paths.timeoutSeconds * 1e3,
        maxBuffer: 4 * 1024 * 1024,
        signal,
        env: { ...process.env, WIKI_ARCHIVE_STATE_FILE: runtime.paths.stateFile, WIKI_ARCHIVE_LOCK_TIMEOUT: "10" }
      });
    } catch (error) {
      const stdout = error.stdout;
      if (typeof stdout === "string" && stdout.trim().startsWith("{")) return { stdout };
      const detail = failureDetail(error);
      void appendWikiLog(runtime, `archive batch failed: ${detail}`);
      throw new WikiArchiveError(signal.aborted ? "CANCELLED" : "ARCHIVE_UNAVAILABLE", detail);
    }
  });
  const workflow = options.workflow ?? (async (operation, value, signal) => {
    const runtime = runtimeOf();
    if (runtime.dshHome === null) throw new WikiArchiveError("ARCHIVE_UNAVAILABLE", "DSH_HOME is unknown");
    const providerArguments = operation === "synthesize" ? ["--provider", runtime.paths.provider, ...runtime.paths.synthConfig === "" ? [] : ["--synth-config", runtime.paths.synthConfig]] : [];
    try {
      const result = await exec2(
        runtime.paths.python,
        [
          runtime.bridgePath,
          operation,
          "--wiki-root",
          runtime.paths.wikiRoot,
          "--dsh-home",
          runtime.dshHome,
          "--scripts-dir",
          runtime.engineDir,
          "--schema",
          runtime.paths.schemaPath,
          "--value",
          value,
          "--python",
          runtime.paths.python,
          "--log",
          runtime.logPath,
          ...providerArguments
        ],
        { timeout: operation === "synthesize" ? 185e4 : runtime.paths.timeoutSeconds * 1e3, maxBuffer: 4 * 1024 * 1024, signal }
      );
      const parsed = JSON.parse(result.stdout);
      if (typeof parsed === "object" && parsed !== null && "error" in parsed && !("status" in parsed)) {
        const entry = parsed;
        throw new WikiArchiveError(String(entry.error), typeof entry.detail === "string" ? entry.detail : void 0);
      }
      return parsed;
    } catch (error) {
      if (error instanceof WikiArchiveError) throw error;
      if (signal.aborted) throw new WikiArchiveError("CANCELLED");
      const stdout = error.stdout;
      if (typeof stdout === "string") {
        try {
          const parsed = JSON.parse(stdout);
          if (typeof parsed === "object" && parsed !== null && "error" in parsed && typeof parsed.error === "string") {
            const entry = parsed;
            throw new WikiArchiveError(entry.error, typeof entry.detail === "string" ? entry.detail : void 0);
          }
        } catch (inner) {
          if (inner instanceof WikiArchiveError) throw inner;
        }
      }
      const detail = failureDetail(error);
      void appendWikiLog(runtime, `${operation} failed: ${detail}`);
      throw new WikiArchiveError(operation === "scope" ? "SCOPE_FAILED" : operation === "index" ? "INDEX_FAILED" : "SYNTHESIS_FAILED", detail);
    }
  });
  const models = options.models;
  const previews = /* @__PURE__ */ new Map();
  const controller = new AbortController();
  let busy = false;
  let closed = false;
  const perform = async (ids, dryRun) => {
    if (unavailableHome) throw new WikiArchiveError("ARCHIVE_UNAVAILABLE");
    const runtime = runtimeOf();
    const args = [
      "--wiki-root",
      runtime.paths.wikiRoot,
      "--tool",
      "dsh",
      "--dsh-home",
      runtime.dshHome ?? "",
      "--json",
      ...ids.flatMap((id) => ["--exact-session", id]),
      ...dryRun ? ["--dry-run"] : ["--full"]
    ];
    return validateResult((await execute(args, controller.signal)).stdout, ids, dryRun);
  };
  const exclusive = async (work) => {
    if (closed) throw new WikiArchiveError("CANCELLED");
    if (busy) throw new WikiArchiveError("BUSY");
    busy = true;
    try {
      return await work();
    } finally {
      busy = false;
    }
  };
  const synthesizeOne = async (session, page) => {
    let selected = null;
    if (models !== void 0) {
      try {
        selected = models.read();
      } catch {
        selected = null;
      }
    }
    if (selected === null || models === void 0) {
      const response = await workflow("synthesize", page, controller.signal);
      const parsed = parseWikiWorkflow({ synthesis: [{ ...typeof response === "object" && response !== null ? response : {}, session, page }], index: "not-needed" });
      return parsed.synthesis[0];
    }
    const prepared = parsePreparedPrompt(await workflow("prompt", page, controller.signal), session, page);
    if ("terminal" in prepared) return prepared.terminal;
    const output = await models.complete({
      provider: selected.provider,
      model: selected.model,
      reasoningEffort: selected.reasoningEffort ?? null,
      system: prepared.prompt.system,
      prompt: prepared.prompt.user,
      sessionId: session,
      signal: controller.signal
    });
    return parseWrittenRow(await workflow("write", JSON.stringify({ page, output }), controller.signal), session, page);
  };
  return {
    preview: async (raw, mode = "full") => exclusive(async () => {
      const requested = validateWikiIds(raw);
      const scope = parseArchiveScope(await workflow("scope", JSON.stringify(requested), controller.signal));
      const ids = validateWikiIds(scope.entries.map((entry) => entry.session));
      if (ids.length !== requested.length || requested.some((id) => !ids.includes(id))) throw new WikiArchiveError("SELECTION_MISMATCH");
      for (const [key, value] of previews) if (value.expiresAt <= now()) previews.delete(key);
      if (previews.size >= 20) previews.delete(previews.keys().next().value);
      const previewed = await perform(ids, true);
      if (closed) throw new WikiArchiveError("CANCELLED");
      const rows = new Map(previewed.results.map((row) => [row.session, row]));
      const summary = { ...previewed, selected: ids.length, scope };
      const token = randomUUID2(), expiresAt = now() + PREVIEW_TTL_MS;
      previews.set(token, { ids, expiresAt, sources: ids.map((id) => rows.get(id)?.source ?? ""), scope, mode });
      return { token, expiresAt, summary, mode };
    }),
    commit: async (token) => exclusive(async () => {
      const plan = previews.get(token);
      if (plan === void 0 || plan.expiresAt <= now()) throw new WikiArchiveError("PREVIEW_EXPIRED");
      previews.delete(token);
      const currentScope = parseArchiveScope(await workflow("scope", JSON.stringify(plan.ids), controller.signal));
      if (JSON.stringify(currentScope.entries.map(({ snapshot: _snapshot, ...entry }) => entry)) !== JSON.stringify(plan.scope.entries.map(({ snapshot: _snapshot, ...entry }) => entry))) throw new WikiArchiveError("SELECTION_MISMATCH");
      const currentRows = new Map((await perform(plan.ids, true)).results.map((row) => [row.session, row]));
      if (plan.ids.some((id, index) => (currentRows.get(id)?.source ?? "") !== plan.sources[index])) throw new WikiArchiveError("SELECTION_MISMATCH");
      if (closed) throw new WikiArchiveError("CANCELLED");
      const summary = { archived: 0, skipped: 0, empty: 0, failed: 0, selected: plan.ids.length, dry_run: false, results: [], scope: currentScope };
      const synthesis = [];
      for (const id of plan.ids) {
        try {
          const part = await perform([id], false);
          summary.archived += part.archived;
          summary.skipped += part.skipped;
          summary.empty += part.empty;
          summary.failed += part.failed;
          summary.results.push(...part.results);
        } catch {
          if (closed) throw new WikiArchiveError("CANCELLED");
          summary.failed++;
          summary.results.push({ session: id, action: "failed", source: plan.sources[plan.ids.indexOf(id)] ?? "" });
        }
      }
      if (plan.mode === "full") {
        for (const row of summary.results) {
          if (!row.page || !["archived", "skipped"].includes(row.action)) continue;
          try {
            synthesis.push(await synthesizeOne(row.session, row.page));
          } catch {
            if (closed) throw new WikiArchiveError("CANCELLED");
            synthesis.push({ session: row.session, page: row.page, status: "failed", pages: [], error: "SYNTHESIS_FAILED" });
          }
        }
        let index = "not-needed";
        if (synthesis.some((row) => row.pages.length > 0 || row.status === "synthesized")) {
          try {
            const response = await workflow("index", "", controller.signal);
            index = typeof response === "object" && response !== null && "status" in response && response.status === "updated" ? "updated" : "failed";
          } catch {
            index = "failed";
          }
        }
        summary.workflow = { synthesis, index };
      }
      return summary;
    }),
    close: () => {
      closed = true;
      previews.clear();
      controller.abort();
    }
  };
}

// src/host/routes.ts
var BOARD_API_PREFIX = "/api/session-board";
var BOARD_SNAPSHOT_PATH = `${BOARD_API_PREFIX}/board`;
var BOARD_ACK_PATH = `${BOARD_API_PREFIX}/ack`;
var BOARD_WIKI_ARCHIVE_PATH = WIKI_ARCHIVE_PATH;
var BOARD_SYNTHESIS_MODEL_PATH = SYNTHESIS_MODEL_PATH;
var BOARD_WIKI_CONFIG_PATH = WIKI_CONFIG_PATH;
var BOARD_STREAM_PREFIX = "/dsh-session-board";
var BOARD_STREAM_PATH = `${BOARD_STREAM_PREFIX}/stream`;
var SESSION_ID_MAX = 200;
function createBoardRoutes(options) {
  const held = /* @__PURE__ */ new Set();
  const frame = (feed) => `event: state
data: ${JSON.stringify(feed)}

`;
  const readFeed = () => {
    try {
      return options.snapshot();
    } catch (error) {
      options.warn(`dsh-session-board: snapshot read failed: ${describeError2(error)}`);
      return EMPTY_FEED;
    }
  };
  const write = (res, chunk) => {
    if (res.writableEnded || res.destroyed) return false;
    try {
      res.write(chunk, (error) => {
        if (error) held.delete(res);
      });
      return true;
    } catch {
      return false;
    }
  };
  const broadcast = () => {
    if (held.size === 0) return;
    const chunk = frame(readFeed());
    for (const res of held) {
      if (!write(res, chunk)) held.delete(res);
    }
  };
  const snapshotRoute = {
    path: BOARD_SNAPSHOT_PATH,
    methods: ["GET"],
    requestBody: "buffered",
    // Never awaits the domain: before it is ready this answers with an empty
    // feed, and the connecting stream delivers the first real snapshot.
    fetch: async () => jsonResponse2(200, readFeed())
  };
  const ackRoute = {
    path: BOARD_ACK_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      const sessionId = readSessionId2(await readJsonBody2(request));
      if (sessionId === null) {
        return jsonResponse2(400, { ok: false, error: "sessionId must be a non-empty string" });
      }
      const durable = await options.ack(sessionId);
      if (!durable) {
        return jsonResponse2(500, { ok: false, error: "acknowledgement could not be stored" });
      }
      broadcast();
      return jsonResponse2(200, { ok: true });
    }
  };
  const archiveOperations = /* @__PURE__ */ new Map();
  const wikiArchiveRoute = {
    path: BOARD_WIKI_ARCHIVE_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      const body = await readJsonBody2(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonResponse2(400, { ok: false, error: "INVALID_SELECTION" });
      const value = body;
      try {
        if (value.action === "capabilities") return jsonResponse2(200, { ok: true, capabilities: { workflow: WIKI_WORKFLOW_CAPABILITY, synthesisModel: SYNTHESIS_MODEL_CAPABILITY, wikiConfig: WIKI_CONFIG_CAPABILITY } });
        if (value.action === "preview") {
          const mode = value.mode === "archive" ? "archive" : "full";
          const preview = await options.wikiArchive.preview(validateWikiIds(value.sessionIds), mode);
          return jsonResponse2(200, { ok: true, preview });
        }
        if ((value.action === "start" || value.action === "status") && typeof value.token === "string" && value.token.length <= 100) {
          let operation = archiveOperations.get(value.token);
          if (value.action === "start" && operation === void 0) {
            if ([...archiveOperations.values()].some((item) => item.state === "running")) throw new WikiArchiveError("BUSY");
            if (archiveOperations.size >= 20) archiveOperations.delete(archiveOperations.keys().next().value);
            const token = value.token;
            archiveOperations.set(token, { state: "running" });
            void options.wikiArchive.commit(token).then(
              (result) => {
                archiveOperations.set(token, { state: "completed", result });
              },
              (error) => {
                const detail = error instanceof WikiArchiveError ? error.detail : void 0;
                archiveOperations.set(token, { state: "failed", error: error instanceof WikiArchiveError ? error.code : "ARCHIVE_UNAVAILABLE", ...detail === void 0 ? {} : { detail } });
              }
            );
            operation = archiveOperations.get(token);
          }
          if (operation === void 0) throw new WikiArchiveError("PREVIEW_EXPIRED");
          return jsonResponse2(200, { ok: true, operation });
        }
        if (value.action === "commit" && typeof value.token === "string" && value.token.length <= 100) {
          const result = await options.wikiArchive.commit(value.token);
          return jsonResponse2(200, { ok: true, result });
        }
        return jsonResponse2(400, { ok: false, error: "INVALID_SELECTION" });
      } catch (error) {
        options.warn(`dsh-session-board: wiki archive failed: ${describeError2(error)}`);
        const code = error instanceof WikiArchiveError ? error.code : "ARCHIVE_UNAVAILABLE";
        const detail = error instanceof WikiArchiveError ? error.detail : void 0;
        const status = code === "INVALID_SELECTION" ? 400 : code === "BUSY" ? 429 : 409;
        return jsonResponse2(status, { ok: false, error: code, ...detail === void 0 || detail === "" ? {} : { detail } });
      }
    }
  };
  const synthesisModelRoute = {
    path: BOARD_SYNTHESIS_MODEL_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      const store = options.synthesisModel;
      if (store === void 0) return jsonResponse2(503, { ok: false, error: "STORE_UNAVAILABLE" });
      const body = await readJsonBody2(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonResponse2(400, { ok: false, error: "INVALID_SELECTION" });
      const value = body;
      if (value.action === "read") {
        const pref2 = readStoredPref(store, options.warn);
        return jsonResponse2(200, { ok: true, selection: selectionOf(pref2) });
      }
      if (value.action === "catalog") {
        try {
          const groups = await store.catalog();
          return jsonResponse2(200, { ok: true, groups });
        } catch (error) {
          options.warn(`dsh-session-board: model catalog read failed: ${describeError2(error)}`);
          return jsonResponse2(500, { ok: false, error: "CATALOG_UNAVAILABLE" });
        }
      }
      if (value.action !== "write") return jsonResponse2(400, { ok: false, error: "INVALID_SELECTION" });
      const pref = readSynthesisPrefBody(value);
      if (pref === null) return jsonResponse2(400, { ok: false, error: "INVALID_SELECTION" });
      const selection = selectionOf(pref);
      if (selection !== null) {
        let verdict = "UNKNOWN_MODEL";
        try {
          verdict = await store.validate(selection);
        } catch {
          verdict = "UNKNOWN_MODEL";
        }
        if (verdict !== "ok") return jsonResponse2(400, { ok: false, error: verdict });
      }
      try {
        await store.write(pref);
      } catch {
        return jsonResponse2(500, { ok: false, error: "STORE_UNAVAILABLE" });
      }
      return jsonResponse2(200, { ok: true, selection });
    }
  };
  const wikiConfigRoute = {
    path: BOARD_WIKI_CONFIG_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      const settings = options.wikiSettings;
      if (settings === void 0) return jsonResponse2(503, { ok: false, error: "HOST_OUTDATED" });
      const body = await readJsonBody2(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonResponse2(400, { ok: false, error: "INVALID_CONFIG" });
      const value = body;
      try {
        if (value.action === "read") return jsonResponse2(200, { ok: true, ...await settings.read() });
        if (value.action === "probe") return jsonResponse2(200, { ok: true, status: await settings.probe() });
        if (value.action === "reset") return jsonResponse2(200, { ok: true, ...await settings.reset() });
        if (value.action === "write") {
          try {
            return jsonResponse2(200, { ok: true, ...await settings.write(value.config) });
          } catch (error) {
            if (error instanceof WikiConfigError) return jsonResponse2(400, { ok: false, error: "INVALID_CONFIG", errors: error.errors });
            throw error;
          }
        }
        return jsonResponse2(400, { ok: false, error: "INVALID_CONFIG" });
      } catch (error) {
        options.warn(`dsh-session-board: wiki config failed: ${describeError2(error)}`);
        return jsonResponse2(500, { ok: false, error: "STORE_UNAVAILABLE" });
      }
    }
  };
  const streamRoute = {
    kind: "prefix",
    path: BOARD_STREAM_PREFIX,
    handler: (req, res) => {
      const rejection = options.requestRejection(req);
      if (rejection !== void 0) {
        res.writeHead(rejection, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("unauthorized");
        return;
      }
      const url = new URL(req.url ?? "/", "http://dsh-session-board");
      if (req.method !== "GET" || url.pathname !== BOARD_STREAM_PATH) {
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: false, error: "not found" }));
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        // `no-transform` keeps intermediaries from buffering or rewriting the
        // frames; the web server's gzip filter already skips this media type.
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      held.add(res);
      if (!write(res, frame(readFeed()))) held.delete(res);
      const remove = () => {
        held.delete(res);
      };
      req.on("close", remove);
      res.on("close", remove);
    }
  };
  return {
    fetchRoutes: [snapshotRoute, ackRoute, wikiArchiveRoute, synthesisModelRoute, wikiConfigRoute],
    streamRoute,
    broadcast,
    close: () => {
      for (const res of held) {
        try {
          res.end();
        } catch {
        }
      }
      held.clear();
    }
  };
}
function readStoredPref(store, warn) {
  try {
    return parseSynthesisPref(store.read());
  } catch (error) {
    warn(`dsh-session-board: synthesis preference read failed: ${describeError2(error)}`);
    return { model: null, provider: null, reasoningEffort: null };
  }
}
function readSynthesisPrefBody(body) {
  const model = body.model;
  const provider = body.provider;
  if (model === null && provider === null) return { model: null, provider: null, reasoningEffort: null };
  if (typeof model !== "string" || typeof provider !== "string") return null;
  const effort = body.reasoningEffort;
  if (effort !== void 0 && effort !== null && typeof effort !== "string") return null;
  const pref = parseSynthesisPref({ model, provider, reasoningEffort: effort ?? null });
  return pref.model === null || pref.provider === null ? null : pref;
}
function jsonResponse2(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
async function readJsonBody2(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
function readSessionId2(body) {
  if (typeof body !== "object" || body === null) return null;
  const value = body.sessionId;
  if (typeof value !== "string") return null;
  const sessionId = value.trim();
  if (sessionId === "" || sessionId.length > SESSION_ID_MAX) return null;
  return sessionId;
}
function describeError2(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/host/plugin.ts
var name = "dsh-session-board";
var inject = ["storageDomain", "connection", "webServer", "llm"];
var KNOWN_WIKI_CONFIG_FIELDS = /* @__PURE__ */ new Set([
  "wikiRoot",
  "schemaPath",
  "scriptsMode",
  "scriptsDir",
  "python",
  "stateFile",
  "timeoutSeconds",
  "provider",
  "synthConfig"
]);
var Config = {
  "~standard": {
    version: 1,
    vendor: "dsh-session-board",
    /**
     * Validate one raw row config and fill deployment defaults.
     * @param value - raw `config` value from the Loader row.
     * @returns the complete config, or Standard Schema issues.
     */
    validate(value) {
      const input = value ?? {};
      if (typeof input !== "object" || Array.isArray(input)) {
        return { issues: [{ message: "config must be an object", path: [] }] };
      }
      const unknown = Object.keys(input).filter((key) => !KNOWN_WIKI_CONFIG_FIELDS.has(key));
      if (unknown.length > 0) {
        return { issues: unknown.map((key) => ({ message: `unknown config field '${key}'`, path: [key] })) };
      }
      const parsed = validateWikiConfig(input);
      if (parsed.config === null) {
        return { issues: parsed.errors.map((message) => ({ message, path: [] })) };
      }
      return { value: parsed.config };
    }
  }
};
function resolvePluginConfig(raw) {
  const result = Config["~standard"].validate(raw);
  if (result.issues !== void 0) {
    const detail = result.issues.map((issue) => issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`dsh-session-board: invalid config: ${detail}`);
  }
  return result.value;
}
function connectionOf(ctx) {
  return Reflect.get(ctx, "connection");
}
function webServerOf(ctx) {
  return Reflect.get(ctx, "webServer");
}
function storageDomainOf(ctx) {
  return Reflect.get(ctx, "storageDomain");
}
function llmOf(ctx) {
  return Reflect.get(ctx, "llm");
}
function apply(ctx, config) {
  const warn = (message) => {
    ctx.logger?.warn?.(message);
  };
  const wikiPluginConfig = resolvePluginConfig(config);
  const storageDomain = storageDomainOf(ctx);
  const connection = connectionOf(ctx);
  const webServer = webServerOf(ctx);
  const llm = llmOf(ctx);
  const home = resolve2(homedir3());
  const packageDir = dirname2(fileURLToPath2(import.meta.url));
  let ledger = null;
  let prefs = null;
  let wikiTable = null;
  const readSynthesisPref = () => prefs?.get(SYNTHESIS_PREFS_KEY) ?? { model: null, provider: null, reasoningEffort: null };
  const WIKI_RECORD_KEY = "config";
  const readStoredWiki = () => {
    try {
      return wikiTable?.get(WIKI_RECORD_KEY) ?? null;
    } catch {
      return null;
    }
  };
  const runtimeOf = () => buildWikiRuntime({
    home,
    dshHome: resolveDshHome(void 0, process.env.DSH_HOME),
    pluginConfig: wikiPluginConfig,
    stored: readStoredWiki(),
    engineDir: join3(packageDir, "wiki"),
    bridgePath: join3(packageDir, "wiki-workflow.py"),
    storedProvider: resolveSynthesisProvider(home)
  });
  const wikiSettings = {
    read: async () => wikiConfigResponse(mergeWikiConfig(wikiPluginConfig, readStoredWiki()), home, await probeWikiEnvironment(runtimeOf()), resolveSynthesisProvider(home)),
    write: async (raw) => {
      const validated = validateWikiWrite(raw);
      if (validated.config === null) throw new WikiConfigError(validated.errors);
      const table = wikiTable;
      if (table === null) throw new Error("STORE_UNAVAILABLE");
      await table.put(WIKI_RECORD_KEY, validated.config);
      return wikiConfigResponse(mergeWikiConfig(wikiPluginConfig, validated.config), home, await probeWikiEnvironment(runtimeOf()), resolveSynthesisProvider(home));
    },
    reset: async () => {
      if (wikiTable !== null) await wikiTable.delete(WIKI_RECORD_KEY);
      return wikiConfigResponse(mergeWikiConfig(wikiPluginConfig, null), home, await probeWikiEnvironment(runtimeOf()), resolveSynthesisProvider(home));
    },
    probe: async () => probeWikiEnvironment(runtimeOf())
  };
  const wikiArchive = createWikiArchiver({
    runtime: runtimeOf,
    models: {
      read: () => selectionOf(readSynthesisPref()),
      complete: (request) => runSynthesisModel(llm, request)
    }
  });
  const routes = createBoardRoutes({
    snapshot: () => ledger?.snapshot() ?? EMPTY_FEED,
    ack: async (sessionId) => {
      const ready = await ledgerReady;
      return ready === null ? false : await ready.ack(sessionId);
    },
    requestRejection: (request) => connection.requestRejection(request),
    wikiArchive,
    synthesisModel: {
      read: readSynthesisPref,
      write: async (pref) => {
        const table = prefs;
        if (table === null) throw new Error("STORE_UNAVAILABLE");
        await table.put(SYNTHESIS_PREFS_KEY, pref);
      },
      validate: (selection) => isKnownSynthesisModel(llm, selection),
      catalog: () => listSynthesisCatalog(llm)
    },
    wikiSettings,
    warn
  });
  const ledgerReady = (async () => {
    let ackDomain = null;
    try {
      ackDomain = await storageDomain.open(ackDomainSpec);
      const turnDomain = await storageDomain.open(turnDomainSpec);
      const openedAcks = ackDomain;
      ctx.effect(() => () => openedAcks.close(), "dsh-session-board: acks domain");
      ctx.effect(() => () => turnDomain.close(), "dsh-session-board: turns domain");
      const created = new BoardLedger({
        acks: ackDomain.table(ACK_TABLE_NAME),
        turns: turnDomain.table(TURN_TABLE_NAME),
        onChange: () => {
          routes.broadcast();
        },
        warn
      });
      ledger = created;
      await created.reconcileOpenTurns();
      return created;
    } catch (error) {
      if (ackDomain !== null) void ackDomain.close().catch((closeError) => warn(`dsh-session-board: acks domain close failed: ${String(closeError)}`));
      warn(
        "dsh-session-board: durable store unavailable, acks and turn facts are disabled: " + describeError(error)
      );
      return null;
    }
  })();
  void (async () => {
    try {
      const domain = await storageDomain.open(prefsDomainSpec);
      ctx.effect(() => () => domain.close(), "dsh-session-board: prefs domain");
      prefs = domain.table(PREFS_TABLE_NAME);
    } catch (error) {
      warn(`dsh-session-board: synthesis preference store unavailable, using the Wiki provider: ${describeError(error)}`);
    }
  })();
  void (async () => {
    try {
      const domain = await storageDomain.open(wikiDomainSpec);
      ctx.effect(() => () => domain.close(), "dsh-session-board: wiki domain");
      wikiTable = domain.table(WIKI_TABLE_NAME);
    } catch (error) {
      warn(`dsh-session-board: wiki configuration store unavailable, using ~/wiki defaults: ${describeError(error)}`);
    }
  })();
  for (const route of routes.fetchRoutes) {
    ctx.effect(() => connection.fetch.register(route), `dsh-session-board: ${route.path}`);
  }
  ctx.effect(() => webServer.register(routes.streamRoute), "dsh-session-board: SSE stream");
  subscribeBoardLedger(ctx, ledgerReady);
  ctx.inject(
    ["storageDomain", "connection", "sessionController", "workspaceRegistry", "agents"],
    (managerCtx) => {
      try {
        startManager({
          ctx: managerCtx,
          storageDomain: storageDomainOf(managerCtx),
          connection: connectionOf(managerCtx),
          warn
        });
      } catch (error) {
        warn(`dsh-session-board: manager unavailable: ${String(error)}`);
      }
    }
  );
  return () => {
    wikiArchive.close();
    routes.close();
  };
}
export {
  apply,
  inject,
  name
};
