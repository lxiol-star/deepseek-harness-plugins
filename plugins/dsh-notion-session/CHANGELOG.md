# Changelog

## 0.1.3

- Tolerate identical duplicate pages for one slug: list collapses them, show/state/push resolve a canonical page, divergent copies still conflict.
- Add `dedupe` (CLI, agent tool and panel repair action): rename extra identical pages to `*-duplicate-<id>` and set them hidden, without deleting content.
- Serialize archival per session to prevent in-process query-then-create races.

## 0.1.2

- Rename the save skill to `notion-session-save` so it cannot be shadowed by an existing local `notion-current-session` skill.
- Saving is resumable by default (`active`); only visibility needs an explicit 保存并归档/隐藏.
- Keep the legacy `notion-current-session` untouched; it may still write `raw/sessions/...` pages.

## 0.1.1

- Clarify that `notion-session-archive` can manage any listed record slug, including legacy `raw/sessions/...` pages, not only the current session.
- Document that legacy pages without plugin metadata default to active and have no generated summary.

## 0.1.0

- Add slug-idempotent Notion session archives with secret gating.
- Add active, archived and hidden visibility states and restoration.
- Add automatic/manual pull, bounded previews and real new-session continuation.
- Add the `notion_session` agent tool and three user-invocable skills.
- Add a self-contained Python CLI and skill installer for other agent hosts.
- Support legacy `raw/sessions/...` slugs, including CJK and inner spaces, for preview, state changes and continuation.
- Use the current Notion markdown replacement field (`new_str`), verified against the live API.
- Order records by edit time so a just-saved active page is never pushed behind the list limit.
- Keep continuation user-only in the GUI; the agent tool can archive/list/show/set state but cannot spawn a model from archived text.
- Surface partial success (session created, Notion write failed) with a retry-open action instead of silently failing.
