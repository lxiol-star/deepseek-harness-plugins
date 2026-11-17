# Design: Notion session handoff

## Goal and non-goals

Goal: a user explicitly saves an agent session to Notion; DSH discovers that record automatically or on demand, then opens a real new Session with bounded historical context.

Non-goals: continuous upload of every session, lossless DSH event replay, Notion-native deletion/trash, automatic window opening from a background timer, or treating archived text as authority.

## Components

```text
DSH skill / other-agent skill
           |
           v
notion_session tool or Python CLI --- secret gate --- Notion wiki-sessions
           |                                            ^
DSH sessionQuery.readSession -> bounded renderer            | auto/manual pull
                                                        v
DSH authenticated /api/notion-session <- React dock + overlay manager
           |
           v
show -> continuation wrapper -> sessionController.create -> prompt
                                     |
                                     v
                        sessions.refresh + uiWorkspace.openSession
```

The Python core is the single owner of Notion payload format and state merges. Host, UI and other-agent skills do not implement separate upsert algorithms.

## Record model

Existing page properties preserve the original `wiki-sessions` contract. A versioned JSON fence at the end adds:

- `schema = dsh-notion-session/v1`
- `slug`, `state`, `sourceTool`, `sourceSessionId`, `workspacePath`
- `summary`, `createdAt`, `updatedAt`, `archivedAt`
- `resumedSessionId` (relationship evidence; not a visibility state)

Visibility is deliberately independent from DSH Workspace lifecycle:

| State | Default list | Meaning |
|---|---|---|
| `active` | yes | Available for continuation; says nothing about whether the source is running |
| `archived` | no | Filed away; visible under Archived/All |
| `hidden` | no | Suppressed except Hidden/All |

List order is `last_edited_time` descending. An archived-date sort would push newly saved active pages (no archived date) behind the limit, which was observed in integration.

`restore active` changes only this Notion record. `resumed` is intentionally not a fourth visibility state.

## Idempotency and failures

- `dsh/<source-session-id>` is the idempotency key. Legacy `raw/sessions/...` pages (including CJK and spaces) remain readable and continuable.
- The markdown replacement uses the installed API's `replace_content.new_str`; `content` is rejected with HTTP 400.
- Repeat push updates the same page and preserves state/resume lineage unless explicitly overridden.
- Duplicate slug query results are a conflict, not an arbitrary choice.
- In-process resume locks deduplicate concurrent clicks for one slug; a persisted `resumedSessionId` makes later retries open the same continuation rather than create another.
- Create → prompt → mark-resumed. If the last write fails, return the new session ID plus a warning; do not create another session silently.
- Refresh overlap shares one Promise. On refresh failure, a previous cache can be served with `stale=true` and an error.
- Temporary Markdown uses a private `mkdtemp` and 0600 file, with `finally` cleanup.

## Context and trust boundaries

Only direct user messages, assistant text and bounded tool call/result summaries enter the archive. Synthetic system/context injections, reasoning streams and control records do not.

Continuation is not replay. The prompt labels the archive as untrusted data, includes source provenance, limits bytes, preserves both head and tail, and requires the new agent to reverify the workspace before acting.

Token ownership stays in `ntn` keychain. The Host strips ambient `NOTION_API_TOKEN`, `NOTION_API_BASE_URL`, and `NOTION_WORKSPACE_ID` overrides before invoking the CLI. Tokens never enter config, tool arguments, canonical tool results, page content or logs.

## DSH APIs verified for 0.2.2-rc.3

- `ctx.sessionQuery.readSession()` / `readTitleSnapshot()` for committed source data.
- `ctx.sessionController.create({ cwd, sessionId })` and `prompt()` for continuation.
- `ctx.connection.fetch.register()` for the authenticated Host/UI route.
- `agent.ctx.tools.register()` for one agent-scoped `notion_session` tool.
- `ctx.skills.register()` for user/model-invocable runtime skills.
- Client `sessions.refresh()` and `uiWorkspace.openSession()` for navigation.
- `conversation.input.dock` and `shell.overlay` slots; all resources are effect-owned.

## Deliberate v0.1 tradeoffs

The plugin does not mutate the user's Notion schema. Consequently state filtering happens after reading bounded page metadata instead of a Notion `select` property. A future high-frequency/multiwriter version should add a dedicated `dsh-session-index` database with structured status, revision, content hash and handoff fields, while keeping full archives in `wiki-sessions`.
