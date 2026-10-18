// src/shared/types.ts
var EMPTY_FEED = { acks: {}, turns: {} };

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
var ACK_TABLE_NAME = "acks";
var TURN_TABLE_NAME = "turn_stats";
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
    const envelope = asRecord(event);
    if (envelope === null) return;
    const type = envelope["type"];
    const sessionId = readSessionId(session);
    if (sessionId === null) return;
    const time = readEventTime(envelope["time"]);
    if (time === null) return;
    const data = asRecord(envelope["data"]);
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
  const envelope = asRecord(session);
  return envelope === null ? null : readString(envelope["id"]);
}
function readEventTime(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function readTurnEndFacts(time, reason) {
  const envelope = asRecord(reason);
  const kind = envelope === null ? null : readString(envelope["kind"]);
  const error = envelope === null ? null : asRecord(envelope["error"]);
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
  const message = asRecord(data["message"]);
  if (message === null) return null;
  const source = asRecord(message["source"]);
  const fromSource = source === null ? null : readString(source["callId"]);
  return fromSource ?? readString(message["toolCallId"]);
}
function asRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function readString(value) {
  return typeof value === "string" && value !== "" ? value : null;
}
function emptySection() {
  return /* @__PURE__ */ Object.create(null);
}

// src/host/wiki-archive.ts
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// src/shared/archive.ts
var MAX_ARCHIVE_SELECTION = 50;
var WIKI_WORKFLOW_CAPABILITY = 1;
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

// src/host/wiki-archive.ts
var exec = promisify(execFile);
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
var PREVIEW_TTL_MS = 5 * 6e4;
var WikiArchiveError = class extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
  code;
};
function resolveDshHome(configured, fromEnv) {
  const chosen = configured ?? (fromEnv === void 0 || fromEnv.trim() === "" ? void 0 : fromEnv) ?? join(homedir(), ".dsh");
  if (chosen.trim() === "") return null;
  try {
    return resolve(chosen);
  } catch {
    return null;
  }
}
function validateWikiIds(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ARCHIVE_SELECTION || raw.some((id) => typeof id !== "string" || !SAFE_ID.test(id) || id === "." || id === "..")) {
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
function createWikiArchiver(options = {}) {
  const home = resolve(options.home ?? homedir());
  const dshHome = resolveDshHome(options.dshHome, process.env.DSH_HOME);
  const unavailableHome = dshHome === null;
  const now = options.now ?? Date.now;
  const script = join(home, "wiki", "scripts", "wiki-archive.py");
  const execute = options.execute ?? (async (args, signal) => {
    try {
      return await exec("/usr/bin/python3", [script, ...args], { timeout: 12e4, maxBuffer: 4 * 1024 * 1024, signal, env: { ...process.env, WIKI_ARCHIVE_LOCK_TIMEOUT: "10" } });
    } catch (error) {
      const stdout = error.stdout;
      if (typeof stdout === "string" && stdout.trim().startsWith("{")) return { stdout };
      throw new WikiArchiveError(signal.aborted ? "CANCELLED" : "ARCHIVE_UNAVAILABLE");
    }
  });
  const workflow = options.workflow ?? (async (operation, value, signal) => {
    if (unavailableHome) throw new WikiArchiveError("ARCHIVE_UNAVAILABLE");
    try {
      const result = await exec(
        "/usr/bin/python3",
        [
          fileURLToPath(new URL("./wiki-workflow.py", import.meta.url)),
          operation,
          "--wiki-root",
          join(home, "wiki"),
          "--dsh-home",
          dshHome,
          "--value",
          value
        ],
        { timeout: operation === "synthesize" ? 185e4 : 12e4, maxBuffer: 4 * 1024 * 1024, signal }
      );
      const parsed = JSON.parse(result.stdout);
      if (typeof parsed === "object" && parsed !== null && "error" in parsed && !("status" in parsed)) throw new WikiArchiveError(String(parsed.error));
      return parsed;
    } catch (error) {
      if (error instanceof WikiArchiveError) throw error;
      throw new WikiArchiveError(signal.aborted ? "CANCELLED" : "WORKFLOW_UNAVAILABLE");
    }
  });
  const previews = /* @__PURE__ */ new Map();
  const controller = new AbortController();
  let busy = false;
  let closed = false;
  const perform = async (ids, dryRun) => {
    if (unavailableHome) throw new WikiArchiveError("ARCHIVE_UNAVAILABLE");
    const args = [
      "--wiki-root",
      join(home, "wiki"),
      "--tool",
      "dsh",
      "--dsh-home",
      dshHome,
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
  return {
    preview: async (raw) => exclusive(async () => {
      const requested = validateWikiIds(raw);
      const scope = parseArchiveScope(await workflow("scope", JSON.stringify(requested), controller.signal));
      const ids = validateWikiIds(scope.entries.map((entry) => entry.session));
      if (requested.some((id) => !ids.includes(id))) throw new WikiArchiveError("SELECTION_MISMATCH");
      for (const [key, value] of previews) if (value.expiresAt <= now()) previews.delete(key);
      if (previews.size >= 20) previews.delete(previews.keys().next().value);
      const summary = { archived: 0, skipped: 0, empty: 0, failed: 0, selected: ids.length, dry_run: true, results: [], scope };
      for (const id of ids) {
        const part = await perform([id], true);
        summary.archived += part.archived;
        summary.skipped += part.skipped;
        summary.empty += part.empty;
        summary.failed += part.failed;
        summary.results.push(...part.results);
      }
      if (closed) throw new WikiArchiveError("CANCELLED");
      const token = randomUUID(), expiresAt = now() + PREVIEW_TTL_MS;
      previews.set(token, { ids, expiresAt, sources: summary.results.map((row) => row.source), scope });
      return { token, expiresAt, summary };
    }),
    commit: async (token) => exclusive(async () => {
      const plan = previews.get(token);
      if (plan === void 0 || plan.expiresAt <= now()) throw new WikiArchiveError("PREVIEW_EXPIRED");
      previews.delete(token);
      const currentScope = parseArchiveScope(await workflow("scope", JSON.stringify(plan.ids), controller.signal));
      if (JSON.stringify(currentScope.entries.map(({ snapshot: _snapshot, ...entry }) => entry)) !== JSON.stringify(plan.scope.entries.map(({ snapshot: _snapshot, ...entry }) => entry))) throw new WikiArchiveError("SELECTION_MISMATCH");
      const currentRows = [];
      for (const id of plan.ids) currentRows.push(...(await perform([id], true)).results);
      if (currentRows.some((row, index2) => row.source !== plan.sources[index2])) throw new WikiArchiveError("SELECTION_MISMATCH");
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
      for (const row of summary.results) {
        if (!row.page || !["archived", "skipped"].includes(row.action)) continue;
        try {
          const response = await workflow("synthesize", row.page, controller.signal);
          const parsed = parseWikiWorkflow({ synthesis: [{ ...typeof response === "object" && response !== null ? response : {}, session: row.session, page: row.page }], index: "not-needed" });
          synthesis.push(...parsed.synthesis);
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
    fetch: async () => jsonResponse(200, readFeed())
  };
  const ackRoute = {
    path: BOARD_ACK_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      const sessionId = readSessionId2(await readJsonBody(request));
      if (sessionId === null) {
        return jsonResponse(400, { ok: false, error: "sessionId must be a non-empty string" });
      }
      const durable = await options.ack(sessionId);
      if (!durable) {
        return jsonResponse(500, { ok: false, error: "acknowledgement could not be stored" });
      }
      broadcast();
      return jsonResponse(200, { ok: true });
    }
  };
  const archiveOperations = /* @__PURE__ */ new Map();
  const wikiArchiveRoute = {
    path: BOARD_WIKI_ARCHIVE_PATH,
    methods: ["POST"],
    requestBody: "buffered",
    fetch: async (request) => {
      const body = await readJsonBody(request);
      if (typeof body !== "object" || body === null || Array.isArray(body)) return jsonResponse(400, { ok: false, error: "INVALID_SELECTION" });
      const value = body;
      try {
        if (value.action === "capabilities") return jsonResponse(200, { ok: true, capabilities: { workflow: WIKI_WORKFLOW_CAPABILITY } });
        if (value.action === "preview") {
          const preview = await options.wikiArchive.preview(validateWikiIds(value.sessionIds));
          return jsonResponse(200, { ok: true, preview });
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
                archiveOperations.set(token, { state: "failed", error: error instanceof WikiArchiveError ? error.code : "ARCHIVE_UNAVAILABLE" });
              }
            );
            operation = archiveOperations.get(token);
          }
          if (operation === void 0) throw new WikiArchiveError("PREVIEW_EXPIRED");
          return jsonResponse(200, { ok: true, operation });
        }
        if (value.action === "commit" && typeof value.token === "string" && value.token.length <= 100) {
          const result = await options.wikiArchive.commit(value.token);
          return jsonResponse(200, { ok: true, result });
        }
        return jsonResponse(400, { ok: false, error: "INVALID_SELECTION" });
      } catch (error) {
        options.warn(`dsh-session-board: wiki archive failed: ${describeError2(error)}`);
        const code = error instanceof WikiArchiveError ? error.code : "ARCHIVE_UNAVAILABLE";
        const status = code === "INVALID_SELECTION" ? 400 : code === "BUSY" ? 429 : 409;
        return jsonResponse(status, { ok: false, error: code });
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
    fetchRoutes: [snapshotRoute, ackRoute, wikiArchiveRoute],
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
function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
async function readJsonBody(request) {
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
var inject = ["storageDomain", "connection", "webServer"];
function connectionOf(ctx) {
  return Reflect.get(ctx, "connection");
}
function webServerOf(ctx) {
  return Reflect.get(ctx, "webServer");
}
function storageDomainOf(ctx) {
  return Reflect.get(ctx, "storageDomain");
}
function apply(ctx) {
  const warn = (message) => {
    ctx.logger?.warn?.(message);
  };
  const storageDomain = storageDomainOf(ctx);
  const connection = connectionOf(ctx);
  const webServer = webServerOf(ctx);
  let ledger = null;
  const wikiArchive = createWikiArchiver();
  const routes = createBoardRoutes({
    snapshot: () => ledger?.snapshot() ?? EMPTY_FEED,
    ack: async (sessionId) => {
      const ready = await ledgerReady;
      return ready === null ? false : await ready.ack(sessionId);
    },
    requestRejection: (request) => connection.requestRejection(request),
    wikiArchive,
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
  for (const route of routes.fetchRoutes) {
    ctx.effect(() => connection.fetch.register(route), `dsh-session-board: ${route.path}`);
  }
  ctx.effect(() => webServer.register(routes.streamRoute), "dsh-session-board: SSE stream");
  subscribeBoardLedger(ctx, ledgerReady);
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
