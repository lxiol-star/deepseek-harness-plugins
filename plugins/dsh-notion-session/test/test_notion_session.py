#!/usr/bin/env python3
"""Offline unit tests for notion_session.py (unittest + in-memory Fake Notion)."""

import contextlib
import copy
import importlib.util
import io
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.dont_write_bytecode = True
SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "notion_session.py"
SPEC = importlib.util.spec_from_file_location("dsh_notion_session", SCRIPT)
ns = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ns)

UUID = "123e4567-e89b-42d3-a456-426614174000"
# Assembled at runtime so the repository contains no credential-shaped literal.
FAKE_SECRET = "sk-" + "a" * 16


def metadata(slug="dsh/" + UUID, **overrides):
    value = {
        "schema": "dsh-notion-session/v1",
        "slug": slug,
        "state": "active",
        "sourceTool": "dsh",
        "sourceSessionId": "session-1",
        "workspacePath": "/work/project",
        "summary": "a summary",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-02T00:00:00Z",
        "archivedAt": None,
        "resumedSessionId": None,
    }
    value.update(overrides)
    return value


def properties(slug, title="A page", tool="dsh", project="project", archived=None):
    result = {
        "标题": {"title": [{"plain_text": title}]},
        "slug": {"rich_text": [{"plain_text": slug}]},
        "host": {"rich_text": [{"plain_text": "test-host"}]},
        "tool": {"rich_text": [{"plain_text": tool}]},
        "project": {"rich_text": [{"plain_text": project}]},
        "updated": {"date": {"start": "2026-01-02"}},
        "archived": {"date": {"start": archived}},
    }
    return result


class FakeNotion:
    """Small in-memory implementation of exactly the endpoints used by the CLI."""

    def __init__(self):
        self.database_id = ns.DB_ID
        self.data_source_id = ns.DS_ID
        self.pages = []
        self.calls = []
        self.next_id = 1

    def add_page(self, slug, markdown, title="A page", **property_overrides):
        page_id = "page-%d" % self.next_id
        self.next_id += 1
        page = {
            "id": page_id,
            "url": "https://notion.test/" + page_id,
            "created_time": "2025-12-31T00:00:00Z",
            "last_edited_time": "2026-01-02T00:00:00Z",
            "properties": properties(slug, title, **property_overrides),
            "_markdown": markdown,
        }
        self.pages.append(page)
        return page

    @staticmethod
    def _public(page):
        return {key: copy.deepcopy(value) for key, value in page.items() if not key.startswith("_")}

    def _page(self, page_id):
        for page in self.pages:
            if page["id"] == page_id:
                return page
        raise AssertionError("unknown fake page: " + page_id)

    def call(self, method, path, payload=None):
        self.calls.append((method, path, copy.deepcopy(payload)))
        if method == "GET" and path == "/v1/data_sources/%s" % self.data_source_id:
            return {"id": self.data_source_id, "object": "data_source", "properties": {
                "标题": {"type": "title"}, "slug": {"type": "rich_text"},
                "host": {"type": "rich_text"}, "tool": {"type": "rich_text"},
                "project": {"type": "rich_text"}, "archived": {"type": "date"},
            }}
        if method == "POST" and path == "/v1/data_sources/%s/query" % self.data_source_id:
            selected = self.pages
            filter_spec = (payload or {}).get("filter") or {}
            if filter_spec.get("property") == "slug":
                slug = filter_spec["rich_text"]["equals"]
                selected = []
                for page in self.pages:
                    part = page["properties"]["slug"]["rich_text"][0]
                    page_slug = part.get("plain_text") or part.get("text", {}).get("content")
                    if page_slug == slug:
                        selected.append(page)
            start = int((payload or {}).get("start_cursor", "0"))
            size = (payload or {}).get("page_size", 100)
            chunk = selected[start:start + size]
            return {
                "results": [self._public(page) for page in chunk],
                "has_more": start + size < len(selected),
                "next_cursor": str(start + size) if start + size < len(selected) else None,
            }
        if method == "GET" and path.startswith("/v1/pages/") and path.endswith("/markdown"):
            page_id = path[len("/v1/pages/"):-len("/markdown")]
            return {"markdown": self._page(page_id)["_markdown"]}
        if method == "PATCH" and path.startswith("/v1/pages/") and path.endswith("/markdown"):
            page_id = path[len("/v1/pages/"):-len("/markdown")]
            page = self._page(page_id)
            # Mirror the real 2026-03-11 API: the replacement field is new_str.
            if "content" in payload["replace_content"] or "new_str" not in payload["replace_content"]:
                raise AssertionError("markdown replacement must use replace_content.new_str")
            page["_markdown"] = payload["replace_content"]["new_str"]
            return {"markdown": page["_markdown"]}
        if method == "PATCH" and path.startswith("/v1/pages/"):
            page_id = path[len("/v1/pages/"):]
            page = self._page(page_id)
            page["properties"].update(copy.deepcopy(payload["properties"]))
            return self._public(page)
        if method == "POST" and path == "/v1/pages":
            page_id = "page-%d" % self.next_id
            self.next_id += 1
            page = {
                "id": page_id,
                "url": "https://notion.test/" + page_id,
                "created_time": "2026-01-03T00:00:00Z",
                "last_edited_time": "2026-01-03T00:00:00Z",
                "properties": copy.deepcopy(payload["properties"]),
                "_markdown": payload["markdown"],
            }
            self.pages.append(page)
            return self._public(page)
        raise AssertionError("unexpected fake Notion call: %s %s" % (method, path))


def args(argv):
    return ns.build_parser().parse_args(argv)


def run_main(argv, client):
    stdout = io.StringIO()
    stderr = io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        code = ns.main(argv, client_factory=lambda _args: client)
    return code, stdout.getvalue(), stderr.getvalue()


class MetadataTests(unittest.TestCase):
    def test_metadata_roundtrip_and_exact_strip(self):
        original = "# 会话\n\n中文🙂 content\n"
        meta = metadata(unknownExtension={"keep": True})
        wrapped = ns.with_metadata(original, meta)
        self.assertLessEqual(len(wrapped.encode("utf-8")), ns.MAX_BYTES)
        self.assertEqual(ns.parse_metadata(wrapped), meta)
        self.assertEqual(ns.strip_metadata(wrapped), original)
        # Re-wrapping does not accumulate separators or duplicate blocks.
        rewrapped = ns.with_metadata(wrapped, meta)
        self.assertEqual(ns.strip_metadata(rewrapped), original)
        self.assertEqual(rewrapped.count("## DSH session metadata"), 1)

    def test_bad_or_legacy_metadata_is_empty(self):
        self.assertEqual(ns.parse_metadata("plain old markdown"), {})
        self.assertEqual(ns.strip_metadata("plain old markdown"), "plain old markdown")
        malformed = "body\n\n## DSH session metadata\n```json\nnot-json\n```\n"
        self.assertEqual(ns.parse_metadata(malformed), {})
        self.assertEqual(ns.strip_metadata(malformed), "body")

    def test_slug_safety_allows_dsh_uuid_and_rejects_traversal(self):
        self.assertEqual(ns.validate_slug("dsh/" + UUID), "dsh/" + UUID)
        self.assertEqual(ns.validate_slug("raw/sessions/host/tool/project/id"),
                         "raw/sessions/host/tool/project/id")
        # Legacy pages contain CJK, full-width punctuation and inner spaces.
        for legacy in (
            "raw/sessions/wyjdeMacBook-Pro/dsh（DeepSeek/无/session-1",
            "raw/sessions/lxiol-Mac-mini/dsh/superagent 子工作区/worker-1",
        ):
            self.assertEqual(ns.validate_slug(legacy), legacy)
        for unsafe in ("../x", "dsh//x", "dsh/./x", " a", "a ", "a\\b", "/x", "x/"):
            with self.subTest(unsafe=unsafe):
                with self.assertRaises(ns.CliError):
                    ns.validate_slug(unsafe)


class SecretAndTokenTests(unittest.TestCase):
    def test_scan_reuses_strict_patterns_and_allows_placeholders(self):
        secret = FAKE_SECRET
        self.assertTrue(ns.scan("token: " + secret))
        self.assertTrue(ns.scan('password = "a-real-long-password"'))
        self.assertFalse(ns.scan('password = "your-example-password"'))
        self.assertFalse(ns.scan("ordinary markdown"))

    def test_push_secret_exits_4_before_client_or_requests(self):
        secret = FAKE_SECRET
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "session.md"
            path.write_text("# safe title\n" + secret, encoding="utf-8")
            fake = FakeNotion()
            factory_calls = []
            stdout = io.StringIO()
            stderr = io.StringIO()

            def factory(_args):
                factory_calls.append(True)
                return fake

            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = ns.main([
                    "push", "--file", str(path), "--slug", "dsh/" + UUID,
                ], client_factory=factory)
            self.assertEqual(code, 4)
            self.assertEqual(factory_calls, [])
            self.assertEqual(fake.calls, [])
            self.assertEqual(stdout.getvalue(), "")
            self.assertNotIn(secret, stderr.getvalue())

    def test_push_secret_in_title_is_blocked_before_client(self):
        secret = FAKE_SECRET
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "session.md"
            path.write_text("safe body", encoding="utf-8")
            code, out, err = run_main([
                "push", "--file", str(path), "--slug", "dsh/" + UUID,
                "--title", secret,
            ], FakeNotion())
            self.assertEqual(code, 4)
            self.assertEqual(out, "")
            self.assertNotIn(secret, err)

    def test_final_merged_body_is_scanned_before_any_write(self):
        fake = FakeNotion()
        old = ns.with_metadata("old body", metadata(sourceSessionId=FAKE_SECRET))
        page = fake.add_page("dsh/" + UUID, old)
        fake.calls.clear()
        command = args(["push", "--file", "new.md", "--slug", "dsh/" + UUID])
        with self.assertRaises(ns.SecretFound):
            ns.cmd_push(command, fake, "new safe body")
        writes = [call for call in fake.calls
                  if call[0] in ("POST", "PATCH") and not call[1].endswith("/query")]
        self.assertEqual(writes, [])
        self.assertEqual(fake._page(page["id"])["_markdown"], old)

    def test_ntn_child_environment_removes_notion_overrides(self):
        process = types.SimpleNamespace(returncode=0, stdout="memory-only-token\n", stderr="")
        environment = {
            "NOTION_API_TOKEN": "must-not-reach-child",
            "NOTION_API_BASE_URL": "https://attacker.invalid",
            "NOTION_WORKSPACE_ID": "other-workspace",
            "SAFE_VALUE": "kept",
        }
        with mock.patch.dict(os.environ, environment, clear=True), \
                mock.patch.object(ns.subprocess, "run", return_value=process) as run:
            token = ns.obtain_token("/fake/ntn")
        self.assertEqual(token, "memory-only-token")
        child_env = run.call_args.kwargs["env"]
        for name in ("NOTION_API_TOKEN", "NOTION_API_BASE_URL", "NOTION_WORKSPACE_ID"):
            self.assertNotIn(name, child_env)
        self.assertEqual(child_env["SAFE_VALUE"], "kept")
        self.assertEqual(run.call_args.args[0], ["/fake/ntn", "auth", "token"])

    def test_ntn_uses_last_nonempty_line_and_auth_failure_exit_3(self):
        process = types.SimpleNamespace(
            returncode=0, stdout="login status: ok\nactual-token\n\n", stderr="",
        )
        with mock.patch.object(ns.subprocess, "run", return_value=process):
            self.assertEqual(ns.obtain_token("/fake/ntn"), "actual-token")
        failed = types.SimpleNamespace(returncode=1, stdout="not logged in\n", stderr="")
        with mock.patch.object(ns.subprocess, "run", return_value=failed):
            with self.assertRaises(ns.AuthRequired) as caught:
                ns.obtain_token("/fake/ntn")
        self.assertEqual(caught.exception.exit_code, 3)
        self.assertEqual(ns.NotFound.exit_code, 1)

    def test_http_error_is_bounded_and_token_is_redacted(self):
        token = "secret_abcdefghijklmnopqrstuvwxyz"
        message = ns.sanitize_error("Bearer %s\n%s\n%s" % (token, token, "x" * 500), token)
        self.assertNotIn(token, message)
        self.assertLessEqual(len(message), 300)


class SummarizeTests(unittest.TestCase):
    def test_legacy_page_defaults_active_and_derives_properties(self):
        fake = FakeNotion()
        page = fake.add_page(
            "legacy/slug", "legacy markdown", title="Legacy",
            tool="codex", project="old-project", archived="2025-01-01",
        )
        record = ns.summarize_page(fake._public(page), "legacy markdown")
        # This is plugin visibility only, not a DSH Workspace lifecycle claim.
        self.assertEqual(record["state"], "active")
        self.assertEqual(record["slug"], "legacy/slug")
        self.assertEqual(record["title"], "Legacy")
        self.assertEqual(record["sourceTool"], "codex")
        self.assertIsNone(record["workspacePath"])
        self.assertEqual(record["archivedAt"], "2025-01-01")
        self.assertIsNone(record["resumedSessionId"])

    def test_explicit_null_archived_at_does_not_revive_property_date(self):
        fake = FakeNotion()
        page = fake.add_page(
            "dsh/" + UUID,
            ns.with_metadata("body", metadata(archivedAt=None)),
            archived="2025-01-01",
        )
        record = ns.summarize_page(fake._public(page), page["_markdown"])
        self.assertIsNone(record["archivedAt"])


class StateTests(unittest.TestCase):
    def test_state_switches_only_metadata_and_preserves_body(self):
        fake = FakeNotion()
        original = "# fixed body\n\nDo not change this.\n"
        wrapped = ns.with_metadata(original, metadata(extension="preserved"))
        page = fake.add_page("dsh/" + UUID, wrapped)
        command = args(["state", "--slug", "dsh/" + UUID, "--state", "archived"])
        with mock.patch.object(ns, "utc_now", return_value="2026-02-03T04:05:06Z"):
            result = ns.cmd_state(command, fake)
        self.assertEqual(result["record"]["state"], "archived")
        self.assertEqual(result["record"]["archivedAt"], "2026-02-03T04:05:06Z")
        current = fake._page(page["id"])["_markdown"]
        self.assertEqual(ns.strip_metadata(current), original)
        self.assertEqual(ns.parse_metadata(current)["extension"], "preserved")
        self.assertEqual(ns.parse_metadata(current)["updatedAt"], "2026-02-03T04:05:06Z")

        command = args(["state", "--slug", "dsh/" + UUID, "--state", "active"])
        result = ns.cmd_state(command, fake)
        self.assertIsNone(result["record"]["archivedAt"])
        self.assertEqual(result["record"]["state"], "active")
        self.assertEqual(ns.strip_metadata(fake._page(page["id"])["_markdown"]), original)

        command = args(["state", "--slug", "dsh/" + UUID, "--state", "hidden"])
        with mock.patch.object(ns, "utc_now", return_value="2026-02-04T00:00:00Z"):
            result = ns.cmd_state(command, fake)
        self.assertEqual(result["record"]["state"], "hidden")
        self.assertEqual(result["record"]["archivedAt"], "2026-02-04T00:00:00Z")
        property_writes = [call for call in fake.calls
                           if call[0] == "PATCH" and not call[1].endswith("/markdown")]
        self.assertEqual(property_writes, [])

    def test_mark_resumed_preserves_other_fields_and_content(self):
        fake = FakeNotion()
        original = "resume body\n"
        page = fake.add_page("dsh/" + UUID, ns.with_metadata(original, metadata()))
        command = args(["mark-resumed", "--slug", "dsh/" + UUID, "--session-id", "new-session"])
        result = ns.cmd_mark_resumed(command, fake)
        self.assertEqual(result["record"]["resumedSessionId"], "new-session")
        current = fake._page(page["id"])["_markdown"]
        self.assertEqual(ns.strip_metadata(current), original)
        self.assertEqual(ns.parse_metadata(current)["createdAt"], "2026-01-01T00:00:00Z")
        self.assertNotEqual(ns.parse_metadata(current)["updatedAt"], "2026-01-02T00:00:00Z")

    def test_state_and_mark_resumed_gate_final_content_before_write_or_stdout(self):
        secret = FAKE_SECRET
        for argv in (
            ["state", "--slug", "dsh/" + UUID, "--state", "archived"],
            ["mark-resumed", "--slug", "dsh/" + UUID, "--session-id", "next"],
        ):
            with self.subTest(argv=argv):
                fake = FakeNotion()
                original = ns.with_metadata("safe body", metadata(summary=secret))
                page = fake.add_page("dsh/" + UUID, original)
                fake.calls.clear()
                code, out, err = run_main(argv, fake)
                self.assertEqual(code, 4)
                self.assertEqual(out, "")
                self.assertNotIn(secret, err)
                self.assertEqual(fake._page(page["id"])["_markdown"], original)
                self.assertFalse(any(call[0] == "PATCH" for call in fake.calls))

    def test_missing_page_uses_not_found_exit_1(self):
        code, out, _err = run_main(["show", "--slug", "dsh/" + UUID], FakeNotion())
        self.assertEqual(code, 1)
        self.assertEqual(out, "")

    def test_duplicate_slug_is_a_conflict_not_first_page_wins(self):
        fake = FakeNotion()
        fake.add_page("dsh/" + UUID, "one")
        fake.add_page("dsh/" + UUID, "two")
        with self.assertRaisesRegex(ns.CliError, "conflict"):
            ns.find_by_slug(fake, "dsh/" + UUID)

    def test_identical_duplicates_converge_on_one_canonical_page(self):
        fake = FakeNotion()
        body = ns.with_metadata("same body", metadata())
        first = fake.add_page("dsh/" + UUID, body)
        second = fake.add_page("dsh/" + UUID, body)
        resolved = ns.resolve_slug(fake, "dsh/" + UUID)
        self.assertEqual(resolved["canonical"]["id"], first["id"])
        self.assertEqual([page["id"] for page in resolved["duplicates"]], [second["id"]])
        command = args(["show", "--slug", "dsh/" + UUID])
        result = ns.cmd_show(command, fake)
        self.assertEqual(result["record"]["slug"], "dsh/" + UUID)
        self.assertEqual(result["duplicatePageIds"], [second["id"]])

    def test_list_collapses_identical_duplicate_rows_and_reports_group(self):
        fake = FakeNotion()
        body = ns.with_metadata("same body", metadata())
        fake.add_page("dsh/" + UUID, body)
        fake.add_page("dsh/" + UUID, body)
        result = ns.cmd_list(args(["list", "--status", "all", "--limit", "100"]), fake)
        self.assertEqual(result["count"], 1)
        self.assertEqual(len(result["duplicates"]), 1)
        self.assertEqual(result["duplicates"][0]["slug"], "dsh/" + UUID)
        self.assertEqual(len(result["duplicates"][0]["pageIds"]), 2)

    def test_dedupe_renames_and_hides_extra_pages_without_touching_canonical(self):
        fake = FakeNotion()
        body = ns.with_metadata("same body", metadata())
        first = fake.add_page("dsh/" + UUID, body, title="Original")
        second = fake.add_page("dsh/" + UUID, body, title="Original")
        preview = ns.cmd_dedupe(args(["dedupe", "--slug", "dsh/" + UUID]), fake)
        self.assertFalse(preview["applied"])
        self.assertEqual(preview["duplicatePageIds"], [second["id"]])
        applied_args = args(["dedupe", "--slug", "dsh/" + UUID, "--apply"])
        result = ns.cmd_dedupe(applied_args, fake)
        self.assertTrue(result["applied"])
        self.assertEqual(len(result["renamed"]), 1)
        renamed = result["renamed"][0]
        self.assertTrue(renamed["slug"].startswith("dsh/" + UUID + "-duplicate-"))
        self.assertEqual(renamed["state"], "hidden")
        self.assertEqual(fake._page(first["id"])["_markdown"], body)
        duplicate = fake._page(second["id"])
        self.assertEqual(duplicate["properties"]["slug"]["rich_text"][0]["text"]["content"], renamed["slug"])
        self.assertTrue(duplicate["properties"]["标题"]["title"][0]["text"]["content"].startswith("[duplicate] "))
        self.assertEqual(ns.parse_metadata(duplicate["_markdown"])["state"], "hidden")
        resolved = ns.resolve_slug(fake, "dsh/" + UUID)
        self.assertEqual(resolved["duplicates"], [])


class TruncationTests(unittest.TestCase):
    def test_utf8_truncation_preserves_head_tail_and_final_limit(self):
        original = "BEGIN🙂\n" + ("中文🙂" * 70000) + "\nTAIL🙂"
        wrapped = ns.with_metadata(original, metadata())
        self.assertLessEqual(len(wrapped.encode("utf-8")), ns.MAX_BYTES)
        body = ns.strip_metadata(wrapped)
        self.assertTrue(body.startswith("BEGIN🙂\n"))
        self.assertTrue(body.endswith("\nTAIL🙂"))
        self.assertIn("truncated", body)
        self.assertEqual(ns.parse_metadata(wrapped)["slug"], "dsh/" + UUID)
        # Successful string encoding/decoding itself proves no partial code point.
        body.encode("utf-8").decode("utf-8", "strict")

    def test_push_reports_when_body_was_truncated(self):
        fake = FakeNotion()
        command = args(["push", "--file", "large.md", "--slug", "dsh/" + UUID])
        result = ns.cmd_push(command, fake, "HEAD\n" + "中" * 100000 + "\nTAIL")
        self.assertTrue(result["truncated"])
        self.assertEqual(result["action"], "created")
        stored = fake._page(result["record"]["pageId"])["_markdown"]
        self.assertLessEqual(len(stored.encode("utf-8")), ns.MAX_BYTES)
        self.assertIn("truncated", ns.strip_metadata(stored))


class PushTests(unittest.TestCase):
    def test_repeat_push_merges_state_resume_created_and_optional_fields(self):
        fake = FakeNotion()
        slug = "dsh/" + UUID
        first_args = args([
            "push", "--file", "first.md", "--slug", slug,
            "--session-id", "origin", "--tool", "dsh", "--workspace", "/work/my-project",
            "--summary", "keep summary", "--state", "archived", "--title", "Original title",
        ])
        with mock.patch.object(ns, "utc_now", return_value="2026-03-01T01:02:03Z"):
            first = ns.cmd_push(first_args, fake, "# Original title\nfirst body")
        self.assertEqual(first["action"], "created")
        self.assertFalse(first["truncated"])
        self.assertNotIn("created", first)
        self.assertEqual(len(fake.pages), 1)
        page_id = first["record"]["pageId"]
        first_meta = ns.parse_metadata(fake._page(page_id)["_markdown"])
        self.assertEqual(first_meta["archivedAt"], "2026-03-01T01:02:03Z")

        resumed_args = args(["mark-resumed", "--slug", slug, "--session-id", "resumed-id"])
        ns.cmd_mark_resumed(resumed_args, fake)
        fake.calls.clear()

        second_args = args(["push", "--file", "second.md", "--slug", slug])
        with mock.patch.object(ns, "utc_now", return_value="2026-03-02T03:04:05Z"):
            second = ns.cmd_push(second_args, fake, "# A different H1\nsecond body")
        self.assertEqual(second["action"], "updated")
        self.assertFalse(second["truncated"])
        self.assertEqual(len(fake.pages), 1)
        second_meta = ns.parse_metadata(fake._page(page_id)["_markdown"])
        self.assertEqual(second_meta["state"], "archived")
        self.assertEqual(second_meta["resumedSessionId"], "resumed-id")
        self.assertEqual(second_meta["createdAt"], first_meta["createdAt"])
        self.assertEqual(second_meta["updatedAt"], "2026-03-02T03:04:05Z")
        self.assertEqual(second_meta["sourceSessionId"], "origin")
        self.assertEqual(second_meta["workspacePath"], "/work/my-project")
        self.assertEqual(second_meta["summary"], "keep summary")
        self.assertEqual(second["record"]["title"], "Original title")
        property_patch = next(call[2] for call in fake.calls
                              if call[0] == "PATCH" and call[1] == "/v1/pages/" + page_id)
        self.assertNotIn("archived", property_patch["properties"])
        self.assertNotIn("updated", property_patch["properties"])

    def test_all_property_text_segments_are_safely_truncated_to_1900_chars(self):
        fake = FakeNotion()
        long_title = "🙂" * 2005
        long_tool = "t" * 2005
        command = args([
            "push", "--file", "properties.md", "--slug", "dsh/" + UUID,
            "--title", long_title, "--tool", long_tool,
        ])
        result = ns.cmd_push(command, fake, "safe body")
        props = fake._page(result["record"]["pageId"])["properties"]
        for name, kind in (("标题", "title"), ("slug", "rich_text"),
                           ("host", "rich_text"), ("tool", "rich_text"),
                           ("project", "rich_text")):
            with self.subTest(property=name):
                content = props[name][kind][0]["text"]["content"]
                self.assertLessEqual(len(content), 1900)
        self.assertEqual(props["标题"]["title"][0]["text"]["content"], "🙂" * 1900)
        self.assertEqual(props["tool"]["rich_text"][0]["text"]["content"], "t" * 1900)

    def test_explicit_active_overrides_state_and_clears_archived_at(self):
        fake = FakeNotion()
        slug = "dsh/" + UUID
        fake.add_page(slug, ns.with_metadata("body", metadata(
            state="hidden", archivedAt="2026-01-01T00:00:00Z", resumedSessionId="keep",
        )))
        command = args(["push", "--file", "new.md", "--slug", slug, "--state", "active"])
        result = ns.cmd_push(command, fake, "new body")
        self.assertEqual(result["record"]["state"], "active")
        self.assertIsNone(result["record"]["archivedAt"])
        self.assertEqual(result["record"]["resumedSessionId"], "keep")


class ListAndShowTests(unittest.TestCase):
    def setUp(self):
        self.fake = FakeNotion()
        self.fake.add_page(
            "dsh/active", ns.with_metadata("active body", metadata(
                slug="dsh/active", state="active", summary="Hello WORLD", sourceTool="dsh",
            )), title="Alpha",
        )
        self.fake.add_page(
            "dsh/archived", ns.with_metadata("archived body", metadata(
                slug="dsh/archived", state="archived", sourceTool="Codex",
                workspacePath="/work/SpecialProject", archivedAt="2026-01-02T00:00:00Z",
            )), title="Beta", tool="Codex", project="SpecialProject",
        )
        self.fake.add_page(
            "dsh/hidden", ns.with_metadata("hidden body", metadata(
                slug="dsh/hidden", state="hidden", summary="nothing relevant",
            )), title="Gamma",
        )

    def test_list_filters_after_metadata_parse_and_never_returns_markdown(self):
        command = args(["list", "--status", "all", "--query", "world", "--limit", "100"])
        result = ns.cmd_list(command, self.fake)
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["records"][0]["slug"], "dsh/active")
        self.assertNotIn("markdown", result["records"][0])

        command = args(["list", "--status", "archived", "--query", "codex"])
        result = ns.cmd_list(command, self.fake)
        self.assertEqual([record["slug"] for record in result["records"]], ["dsh/archived"])

        command = args(["list", "--status", "all", "--query", "specialproject"])
        result = ns.cmd_list(command, self.fake)
        self.assertEqual(result["count"], 1)
        query_call = next(call for call in self.fake.calls
                          if call[0] == "POST" and call[1].endswith("/query"))
        # Active pages carry no archived date, so recency must be the only sort.
        self.assertEqual(query_call[2]["sorts"], [
            {"timestamp": "last_edited_time", "direction": "descending"},
        ])

    def test_list_limit_applies_after_filtering(self):
        command = args(["list", "--status", "hidden", "--limit", "1"])
        result = ns.cmd_list(command, self.fake)
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["records"][0]["state"], "hidden")

    def test_show_returns_record_and_stripped_markdown(self):
        command = args(["show", "--slug", "dsh/active"])
        result = ns.cmd_show(command, self.fake)
        self.assertEqual(result["markdown"], "active body")
        self.assertEqual(result["record"]["slug"], "dsh/active")
        self.assertNotIn("## DSH session metadata", result["markdown"])

    def test_list_skips_secret_page_but_show_still_blocks(self):
        secret = FAKE_SECRET
        self.fake.pages.insert(0, self.fake.pages.pop(0))
        self.fake._page("page-1")["_markdown"] = ns.with_metadata(
            "contains " + secret, metadata(slug="dsh/active"),
        )
        code, out, err = run_main(["list", "--status", "all"], self.fake)
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        result = json.loads(out)
        self.assertEqual(result["count"], 2)
        self.assertEqual(
            [record["slug"] for record in result["records"]],
            ["dsh/archived", "dsh/hidden"],
        )
        self.assertEqual(result["errors"], [{
            "pageId": "page-1", "slug": "dsh/active", "code": "SECRET_BLOCKED",
        }])
        self.assertNotIn(secret, out)
        self.fake.calls.clear()

        code, out, err = run_main(["show", "--slug", "dsh/active"], self.fake)
        self.assertEqual(code, 4)
        self.assertEqual(out, "")
        self.assertNotIn(secret, err)

    def test_list_secret_errors_are_bounded_and_contain_no_content(self):
        fake = FakeNotion()
        secret = FAKE_SECRET
        for index in range(ns.MAX_LIST_ERRORS + 5):
            slug = "dsh/blocked-%d" % index
            fake.add_page(slug, ns.with_metadata(
                "secret body " + secret, metadata(slug=slug),
            ))
        command = args(["list", "--status", "all", "--limit", "100"])
        result = ns.cmd_list(command, fake)
        self.assertEqual(result["records"], [])
        self.assertEqual(result["count"], 0)
        self.assertEqual(len(result["errors"]), ns.MAX_LIST_ERRORS)
        self.assertTrue(all(set(error) == {"pageId", "slug", "code"}
                            for error in result["errors"]))
        self.assertTrue(all(error["code"] == "SECRET_BLOCKED"
                            for error in result["errors"]))
        self.assertNotIn(secret, json.dumps(result))

    def test_check_outputs_only_public_ids(self):
        code, out, err = run_main(["check"], self.fake)
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        self.assertEqual(json.loads(out), {
            "ok": True, "databaseId": ns.DB_ID, "dataSourceId": ns.DS_ID,
        })
        self.assertNotIn("token", out.lower())

    def test_check_rejects_missing_or_mistyped_properties(self):
        original = self.fake.call
        def invalid_schema(method, path, payload=None):
            if method == "GET" and path == "/v1/data_sources/%s" % self.fake.data_source_id:
                return {"properties": {"标题": {"type": "title"}, "slug": {"type": "select"}}}
            return original(method, path, payload)
        with mock.patch.object(self.fake, "call", side_effect=invalid_schema):
            code, out, err = run_main(["check"], self.fake)
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn("slug", err)
        self.assertIn("archived", err)


if __name__ == "__main__":
    unittest.main()
