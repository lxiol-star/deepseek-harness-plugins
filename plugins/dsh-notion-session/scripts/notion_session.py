#!/usr/bin/env python3
"""Store DSH session Markdown in Notion, using only the Python standard library."""

import argparse
import datetime as _datetime
import http.client
import json
import os
import pathlib
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.parse

NOTION_VERSION = "2026-03-11"
DB_ID = "faa56226-d71c-4b2c-bb4a-859bf8381f4e"
DS_ID = "a5af25e2-3146-49e4-9bc2-c2ae31513b36"
TITLE_PROP = "标题"
MAX_BYTES = 240000
PROPERTY_TEXT_MAX = 1900
MAX_LIST_ERRORS = 20
METADATA_SCHEMA = "dsh-notion-session/v1"
STATES = ("active", "archived", "hidden")

# Keep these patterns in sync with notion-current-session/session_push.py.
HIGH_PATTERNS = [
    ("openai/deepseek sk-", re.compile(r"\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}")),
    ("github token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}")),
    ("gitlab token", re.compile(r"\bglpat-[A-Za-z0-9_-]{18,}")),
    ("slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("aws key id", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("deploy dpat_", re.compile(r"\bdpat_[A-Za-z0-9]{16,}")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}")),
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
]
GENERIC = re.compile(
    r"(?i)\b(api[_-]?key|apikey|access[_-]?token|secret|passwd|password|pwd)\b"
    r"[\"']?\s*[:=]\s*[\"']([^\"'\n]{10,})[\"']"
)
PLACEHOLDERS = (
    "xxxx", "your", "<", "${", "{{", "example", "...", "…",
    "redacted", "脱敏", "占位", "fake", "xxx",
)

METADATA_RE = re.compile(
    r"\n{0,2}^## DSH session metadata[ \t]*\n"
    r"```json[ \t]*\n(?P<json>.*?)\n```[ \t]*(?:\n)?\Z",
    re.MULTILINE | re.DOTALL,
)
SLUG_FORBIDDEN = re.compile(r"[\x00-\x1f\x7f-\x9f\\]")


class CliError(Exception):
    """An expected, concise command-line failure."""

    exit_code = 1


class SecretFound(CliError):
    exit_code = 4


class AuthRequired(CliError):
    exit_code = 3


class NotFound(CliError):
    exit_code = 1


def scan(text):
    """Return secret findings as safe labels, never returning matched values."""
    hits = []
    for line_number, line in enumerate(text.splitlines(), 1):
        for name, pattern in HIGH_PATTERNS:
            if pattern.search(line):
                hits.append("line %d: %s" % (line_number, name))
        for match in GENERIC.finditer(line):
            value = match.group(2).strip()
            if any(placeholder in value.lower() for placeholder in PLACEHOLDERS):
                continue
            hits.append("line %d: possible credential (%s)" % (line_number, match.group(1)))
    return hits


def validate_slug(slug):
    """Allow legacy CJK slugs while rejecting traversal and control characters."""
    if not isinstance(slug, str) or not 1 <= len(slug) <= 500:
        raise CliError("slug must be a safe Notion record slug")
    segments = slug.split("/")
    if len(segments) > 12 or any(
        len(segment) == 0 or len(segment) > 200 or segment in (".", "..")
        or segment.strip() != segment or SLUG_FORBIDDEN.search(segment)
        for segment in segments
    ):
        raise CliError("unsafe slug: empty, '.', '..', control or oversized segments are not allowed")
    return slug


def utc_now():
    return (
        _datetime.datetime.now(_datetime.timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def _today():
    return utc_now()[:10]


def _metadata_json(metadata):
    return json.dumps(metadata, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def parse_metadata(markdown):
    """Parse the trailing DSH metadata block; return {} for legacy/bad blocks."""
    if not isinstance(markdown, str):
        return {}
    match = METADATA_RE.search(markdown)
    if not match:
        return {}
    try:
        value = json.loads(match.group("json"))
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def strip_metadata(markdown):
    """Remove only the trailing metadata block and its inserted separator."""
    if not isinstance(markdown, str):
        return markdown
    match = METADATA_RE.search(markdown)
    return markdown[:match.start()] if match else markdown


def _utf8_prefix(text, size):
    if size <= 0:
        return ""
    return text.encode("utf-8")[:size].decode("utf-8", "ignore")


def _utf8_suffix(text, size):
    if size <= 0:
        return ""
    return text.encode("utf-8")[-size:].decode("utf-8", "ignore")


def truncate_utf8(text, max_bytes=MAX_BYTES):
    """Preserve the head and tail without splitting a UTF-8 code point."""
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    marker = (
        "\n\n---\n> truncated: middle omitted from original %d UTF-8 bytes\n---\n\n"
        % len(encoded)
    )
    available = max_bytes - len(marker.encode("utf-8"))
    if available < 0:
        raise CliError("metadata leaves no room for Markdown content")
    head_size = available // 2
    tail_size = available - head_size
    result = _utf8_prefix(text, head_size) + marker + _utf8_suffix(text, tail_size)
    # Decoding with ignore can only make the result smaller than the budgets.
    return result


def with_metadata(markdown, metadata, max_bytes=MAX_BYTES):
    """Return Markdown with one trailing metadata block, bounded in UTF-8 bytes."""
    base = strip_metadata(markdown)
    suffix = "\n\n## DSH session metadata\n```json\n%s\n```\n" % _metadata_json(metadata)
    budget = max_bytes - len(suffix.encode("utf-8"))
    if budget < 0:
        raise CliError("metadata alone exceeds the %d-byte page limit" % max_bytes)
    return truncate_utf8(base, budget) + suffix


def replace_metadata(markdown, metadata):
    """Replace only metadata JSON, preserving every other byte of the page body."""
    match = METADATA_RE.search(markdown)
    encoded = _metadata_json(metadata)
    if match:
        return markdown[:match.start("json")] + encoded + markdown[match.end("json"):]
    suffix = "\n\n## DSH session metadata\n```json\n%s\n```\n" % encoded
    return markdown + suffix


def _property_text(properties, name, kind="rich_text"):
    prop = properties.get(name) or {}
    values = prop.get(kind) or []
    if not isinstance(values, list):
        return ""
    result = []
    for value in values:
        if not isinstance(value, dict):
            continue
        result.append(
            value.get("plain_text")
            or (value.get("text") or {}).get("content", "")
            or ""
        )
    return "".join(result)


def _property_date(properties, name):
    date = (properties.get(name) or {}).get("date") or {}
    return date.get("start")


def summarize_page(page, markdown=""):
    """Convert a Notion page plus its Markdown into the public record shape."""
    properties = page.get("properties") or {}
    metadata = parse_metadata(markdown)
    # Legacy visibility defaults to active in this plugin only; it says nothing
    # about the lifecycle state of a DSH Workspace or its live sessions.
    state = metadata.get("state", "active") if metadata else "active"
    if state not in STATES:
        state = "active"
    updated_at = (
        metadata.get("updatedAt")
        or _property_date(properties, "updated")
        or page.get("last_edited_time")
    )
    return {
        "pageId": page.get("id"),
        "slug": metadata.get("slug") or _property_text(properties, "slug"),
        "title": _property_text(properties, TITLE_PROP, "title"),
        "url": page.get("url") or "",
        "state": state,
        "sourceTool": metadata.get("sourceTool") or _property_text(properties, "tool") or None,
        "sourceSessionId": metadata.get("sourceSessionId"),
        # A Notion project name is not a filesystem path.
        "workspacePath": metadata.get("workspacePath"),
        "summary": metadata.get("summary") or "",
        "updatedAt": updated_at,
        # Explicit JSON null must remain null instead of resurrecting old dates.
        "archivedAt": (
            metadata.get("archivedAt") if "archivedAt" in metadata
            else _property_date(properties, "archived")
        ),
        "resumedSessionId": metadata.get("resumedSessionId"),
    }


def sanitize_error(text, token=None):
    """Bound and redact remote error text before it can reach stderr."""
    value = str(text or "")
    if token:
        value = value.replace(token, "<redacted>")
    value = re.sub(r"(?i)Bearer\s+[^\s,;]+", "Bearer <redacted>", value)
    value = re.sub(r"\b(?:ntn|secret)_[A-Za-z0-9_-]{8,}", "<redacted>", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:300]


def obtain_token(ntn):
    """Read the token into memory via ntn; never print or persist it."""
    executable = os.path.expanduser(ntn)
    if not os.path.isabs(executable) and os.sep not in executable:
        executable = shutil.which(executable) or executable
    child_env = os.environ.copy()
    for name in ("NOTION_API_TOKEN", "NOTION_API_BASE_URL", "NOTION_WORKSPACE_ID"):
        child_env.pop(name, None)
    try:
        process = subprocess.run(
            [executable, "auth", "token"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
            check=False,
            env=child_env,
        )
    except (OSError, subprocess.SubprocessError):
        raise CliError("could not run ntn auth token; check --ntn and ntn login")
    lines = [line.strip() for line in process.stdout.splitlines() if line.strip()]
    token = lines[-1] if lines else ""
    if process.returncode != 0 or not token:
        raise AuthRequired("ntn auth token failed; run ntn login first")
    return token


class NotionClient:
    """Small rate-limited Notion API client with bounded transient retries."""

    def __init__(self, token, database_id=DB_ID, data_source_id=DS_ID,
                 min_interval=0.35, max_attempts=6):
        self._token = token
        self.database_id = database_id
        self.data_source_id = data_source_id
        self.min_interval = min_interval
        self.max_attempts = max_attempts
        self._last_request = 0.0

    def __repr__(self):
        return "NotionClient(database_id=%r, data_source_id=%r)" % (
            self.database_id, self.data_source_id,
        )

    def _rate_limit(self):
        elapsed = time.monotonic() - self._last_request
        if self._last_request and elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request = time.monotonic()

    @staticmethod
    def _retry_delay(response, payload, attempt):
        value = response.getheader("Retry-After")
        if value is None and isinstance(payload, dict):
            value = payload.get("retry_after")
        try:
            if value is not None:
                return min(30.0, max(0.0, float(value)))
        except (TypeError, ValueError):
            pass
        return min(8.0, 0.5 * (2 ** attempt))

    def call(self, method, path, payload=None):
        body = None
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {
            "Authorization": "Bearer " + self._token,
            "Notion-Version": NOTION_VERSION,
            "Accept": "application/json",
        }
        if body is not None:
            headers["Content-Type"] = "application/json"

        for attempt in range(self.max_attempts):
            self._rate_limit()
            connection = http.client.HTTPSConnection("api.notion.com", timeout=30)
            try:
                connection.request(method, path, body=body, headers=headers)
                response = connection.getresponse()
                status = response.status
                transient = status == 429 or 500 <= status <= 599
                raw = response.read() if 200 <= status < 300 else response.read(65536)
                response_headers = response
            except OSError as error:
                connection.close()
                if attempt + 1 < self.max_attempts:
                    time.sleep(min(8.0, 0.5 * (2 ** attempt)))
                    continue
                raise CliError("Notion network error: %s" % sanitize_error(error, self._token))
            finally:
                connection.close()

            text = raw.decode("utf-8", "replace")
            if 200 <= status < 300:
                if not text.strip():
                    return {}
                try:
                    return json.loads(text)
                except ValueError:
                    raise CliError("Notion returned invalid JSON")

            try:
                error_payload = json.loads(text) if text.strip() else {}
            except ValueError:
                error_payload = {}
            if transient and attempt + 1 < self.max_attempts:
                time.sleep(self._retry_delay(response_headers, error_payload, attempt))
                continue
            detail = ""
            if isinstance(error_payload, dict):
                detail = error_payload.get("message") or ""
            if not detail:
                detail = text
            detail = sanitize_error(detail, self._token)
            message = "Notion HTTP %d" % status
            if detail:
                message += ": " + detail
            raise CliError(message)
        raise CliError("Notion request failed after bounded retries")


def _quoted(value):
    return urllib.parse.quote(str(value), safe="")


def _data_source_query(client, payload):
    path = "/v1/data_sources/%s/query" % _quoted(client.data_source_id)
    return client.call("POST", path, payload)


def find_by_slug(client, slug):
    response = _data_source_query(client, {
        "filter": {"property": "slug", "rich_text": {"equals": slug}},
        "page_size": 2,
    })
    results = response.get("results") or []
    if len(results) > 1:
        raise CliError("conflict: multiple wiki-session pages have slug: %s" % slug)
    return results[0] if results else None


def get_markdown(client, page_id):
    response = client.call("GET", "/v1/pages/%s/markdown" % _quoted(page_id))
    markdown = response.get("markdown", "")
    return markdown if isinstance(markdown, str) else ""


def patch_markdown(client, page_id, markdown):
    return client.call(
        "PATCH",
        "/v1/pages/%s/markdown" % _quoted(page_id),
        # The 2026-03-11 markdown endpoint names the replacement `new_str`.
        {"type": "replace_content", "replace_content": {"new_str": markdown}},
    )


def _property_content(value):
    # Keep one Notion text segment comfortably below its 2000-character limit.
    return str(value or "")[:PROPERTY_TEXT_MAX]


def _rich_text(value):
    return {"rich_text": [{"text": {"content": _property_content(value)}}]}


def _title(value):
    return {"title": [{"text": {"content": _property_content(value)}}]}


def _date(value):
    return {"date": {"start": value}}


def _infer_title(markdown, path, slug):
    match = re.search(r"^#[ \t]+(.+?)[ \t]*$", markdown, re.MULTILINE)
    if match:
        return match.group(1)
    stem = pathlib.Path(path).stem
    return stem or slug


def _secret_gate(text, context):
    findings = scan(text or "")
    if findings:
        raise SecretFound(
            "secret scan blocked %s: %s" % (context, "; ".join(findings))
        )


def _scan_push_inputs(args, markdown):
    """Gate all user-controlled fields before client creation or API reads."""
    _secret_gate(markdown, "push body")
    inferred_title = args.title or _infer_title(markdown, args.file, args.slug)
    fields = {
        "title": inferred_title,
        "host": socket.gethostname() or "unknown-host",
        "tool": args.tool or "dsh",
        "project": _project_name(args.workspace),
        "slug": args.slug,
        "summary": args.summary or "",
        "workspace": args.workspace or "",
        "session id": args.session_id or "",
    }
    for name, value in fields.items():
        _secret_gate(value, "push " + name)


def _project_name(workspace):
    if not workspace:
        return "无"
    return pathlib.Path(workspace).name or workspace


def _legacy_metadata(page, markdown):
    record = summarize_page(page, markdown)
    return {
        "schema": METADATA_SCHEMA,
        "slug": record["slug"],
        "state": record["state"],
        "sourceTool": record["sourceTool"],
        "sourceSessionId": record["sourceSessionId"],
        "workspacePath": record["workspacePath"],
        "summary": record["summary"],
        "createdAt": page.get("created_time") or record["updatedAt"] or utc_now(),
        "updatedAt": record["updatedAt"] or utc_now(),
        "archivedAt": record["archivedAt"],
        "resumedSessionId": record["resumedSessionId"],
    }


def cmd_push(args, client, markdown):
    validate_slug(args.slug)
    _scan_push_inputs(args, markdown)
    page = find_by_slug(client, args.slug)
    old_markdown = get_markdown(client, page["id"]) if page else ""
    old_metadata = parse_metadata(old_markdown) if page else {}
    old_record = summarize_page(page, old_markdown) if page else {}

    now = utc_now()
    state = args.state or old_metadata.get("state") or old_record.get("state") or "active"
    if state not in STATES:
        state = "active"
    source_tool = (
        args.tool if args.tool is not None
        else old_metadata.get("sourceTool") or old_record.get("sourceTool") or "dsh"
    )
    session_id = (
        args.session_id if args.session_id is not None
        else old_metadata.get("sourceSessionId", old_record.get("sourceSessionId"))
    )
    workspace = (
        args.workspace if args.workspace is not None
        else old_metadata.get("workspacePath", old_record.get("workspacePath"))
    )
    summary = (
        args.summary if args.summary is not None
        else old_metadata.get("summary", old_record.get("summary", ""))
    )
    title = args.title or (old_record.get("title") if page else None) or _infer_title(
        markdown, args.file, args.slug,
    )
    if args.workspace is not None or workspace:
        project = _project_name(workspace)
    elif page:
        project = _property_text(page.get("properties") or {}, "project") or "无"
    else:
        project = "无"
    created_at = (
        old_metadata.get("createdAt")
        or (page.get("created_time") if page else None)
        or now
    )
    archived_at = old_metadata.get("archivedAt", old_record.get("archivedAt"))
    if args.state is not None:
        archived_at = None if args.state == "active" else now

    metadata = dict(old_metadata)
    metadata.update({
        "schema": METADATA_SCHEMA,
        "slug": args.slug,
        "state": state,
        "sourceTool": source_tool,
        "sourceSessionId": session_id,
        "workspacePath": workspace,
        "summary": summary or "",
        "createdAt": created_at,
        "updatedAt": now,
        "archivedAt": archived_at,
        "resumedSessionId": old_metadata.get(
            "resumedSessionId", old_record.get("resumedSessionId")
        ),
    })
    content = with_metadata(markdown, metadata)
    truncated = (
        len(strip_metadata(content).encode("utf-8"))
        < len(strip_metadata(markdown).encode("utf-8"))
    )
    # Scan the exact final outbound body and every derived property as well.
    _secret_gate(content, "final push body")
    for name, value in (
        ("title", title), ("host", socket.gethostname() or "unknown-host"),
        ("tool", source_tool or ""), ("project", project),
        ("slug", args.slug), ("summary", summary or ""),
    ):
        _secret_gate(value, "final push " + name)
    properties = {
        TITLE_PROP: _title(title),
        "slug": _rich_text(args.slug),
        "host": _rich_text(socket.gethostname() or "unknown-host"),
        "tool": _rich_text(source_tool or ""),
        "project": _rich_text(project),
        # The live wiki-sessions schema has no `updated` property. The page's
        # last_edited_time and metadata.updatedAt carry update time instead.
    }
    # Deliberately omit archived for every case except explicit state=archived.
    if args.state == "archived":
        properties["archived"] = _date(_today())

    if page:
        updated_page = client.call("PATCH", "/v1/pages/%s" % _quoted(page["id"]), {
            "properties": properties,
        })
        patch_markdown(client, page["id"], content)
        created = False
    else:
        updated_page = client.call("POST", "/v1/pages", {
            "parent": {"database_id": client.database_id},
            "properties": properties,
            "markdown": content,
        })
        created = True
    return {
        "record": summarize_page(updated_page, content),
        "action": "created" if created else "updated",
        "truncated": truncated,
    }


def cmd_list(args, client):
    records = []
    errors = []
    cursor = None
    while len(records) < args.limit:
        payload = {
            "page_size": 100,
            # Recency must lead: active pages have no `archived` date, so an
            # archived-first sort can push a just-saved record past the limit.
            "sorts": [{"timestamp": "last_edited_time", "direction": "descending"}],
        }
        if cursor:
            payload["start_cursor"] = cursor
        response = _data_source_query(client, payload)
        for page in response.get("results") or []:
            markdown = get_markdown(client, page["id"])
            try:
                _secret_gate(markdown, "list output")
            except SecretFound:
                if len(errors) < MAX_LIST_ERRORS:
                    slug = _property_text(page.get("properties") or {}, "slug")
                    errors.append({
                        "pageId": page.get("id"),
                        "slug": None if scan(slug) else slug,
                        "code": "SECRET_BLOCKED",
                    })
                continue
            record = summarize_page(page, markdown)
            if args.status != "all" and record["state"] != args.status:
                continue
            if args.query:
                query = args.query.casefold()
                haystack = "\n".join(str(record[key] or "") for key in (
                    "title", "slug", "summary", "sourceTool", "workspacePath",
                )).casefold()
                if query not in haystack:
                    continue
            records.append(record)
            if len(records) >= args.limit:
                break
        if not response.get("has_more") or len(records) >= args.limit:
            break
        cursor = response.get("next_cursor")
        if not cursor:
            break
    return {"records": records, "count": len(records), "errors": errors}


def _find_page_and_markdown(client, slug):
    validate_slug(slug)
    page = find_by_slug(client, slug)
    if not page:
        raise NotFound("no wiki-session found for slug: %s" % slug)
    return page, get_markdown(client, page["id"])


def cmd_show(args, client):
    page, markdown = _find_page_and_markdown(client, args.slug)
    _secret_gate(markdown, "show output")
    return {"record": summarize_page(page, markdown), "markdown": strip_metadata(markdown)}


def cmd_state(args, client):
    page, markdown = _find_page_and_markdown(client, args.slug)
    metadata = parse_metadata(markdown) or _legacy_metadata(page, markdown)
    metadata["schema"] = METADATA_SCHEMA
    metadata["slug"] = args.slug
    metadata["state"] = args.state
    now = utc_now()
    metadata["updatedAt"] = now
    metadata["archivedAt"] = None if args.state == "active" else now
    updated = replace_metadata(markdown, metadata)
    _secret_gate(updated, "state output")
    patch_markdown(client, page["id"], updated)
    return {"record": summarize_page(page, updated)}


def cmd_mark_resumed(args, client):
    page, markdown = _find_page_and_markdown(client, args.slug)
    metadata = parse_metadata(markdown) or _legacy_metadata(page, markdown)
    metadata["schema"] = METADATA_SCHEMA
    metadata["slug"] = args.slug
    metadata["resumedSessionId"] = args.session_id
    metadata["updatedAt"] = utc_now()
    updated = replace_metadata(markdown, metadata)
    _secret_gate(updated, "mark-resumed output")
    patch_markdown(client, page["id"], updated)
    return {"record": summarize_page(page, updated)}


def cmd_check(args, client):
    schema = client.call("GET", "/v1/data_sources/%s" % _quoted(client.data_source_id))
    expected = {TITLE_PROP: "title", "slug": "rich_text", "host": "rich_text", "tool": "rich_text", "project": "rich_text", "archived": "date"}
    properties = schema.get("properties") or {}
    invalid = [name for name, kind in expected.items() if (properties.get(name) or {}).get("type") != kind]
    if invalid:
        raise CliError("data source is missing required properties or types: %s" % ", ".join(invalid))
    return {
        "ok": True,
        "databaseId": client.database_id,
        "dataSourceId": client.data_source_id,
    }


def execute(args, client, markdown=None):
    if args.command == "push":
        return cmd_push(args, client, markdown)
    if args.command == "list":
        return cmd_list(args, client)
    if args.command == "show":
        return cmd_show(args, client)
    if args.command == "state":
        return cmd_state(args, client)
    if args.command == "mark-resumed":
        return cmd_mark_resumed(args, client)
    if args.command == "check":
        return cmd_check(args, client)
    raise CliError("unknown command")


def _limit(value):
    try:
        number = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError("limit must be an integer from 1 to 100")
    if not 1 <= number <= 100:
        raise argparse.ArgumentTypeError("limit must be from 1 to 100")
    return number


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-id", default=DB_ID)
    parser.add_argument("--data-source-id", default=DS_ID)
    parser.add_argument("--ntn", default="ntn", help="ntn executable (default: PATH lookup)")
    commands = parser.add_subparsers(dest="command", required=True)

    push = commands.add_parser("push")
    push.add_argument("--file", required=True)
    push.add_argument("--slug", required=True)
    push.add_argument("--session-id")
    push.add_argument("--tool")
    push.add_argument("--workspace")
    push.add_argument("--summary")
    push.add_argument("--state", choices=STATES)
    push.add_argument("--title")

    listing = commands.add_parser("list")
    listing.add_argument("--status", choices=STATES + ("all",), default="active")
    listing.add_argument("--query", default="")
    listing.add_argument("--limit", type=_limit, default=20)

    show = commands.add_parser("show")
    show.add_argument("--slug", required=True)

    state = commands.add_parser("state")
    state.add_argument("--slug", required=True)
    state.add_argument("--state", choices=STATES, required=True)

    resumed = commands.add_parser("mark-resumed")
    resumed.add_argument("--slug", required=True)
    resumed.add_argument("--session-id", required=True)

    commands.add_parser("check")
    return parser


def _default_client_factory(args):
    token = obtain_token(args.ntn)
    return NotionClient(token, args.database_id, args.data_source_id)


def _preflight_push(args):
    validate_slug(args.slug)
    try:
        markdown = pathlib.Path(args.file).read_text(encoding="utf-8")
    except (OSError, UnicodeError) as error:
        raise CliError("cannot read Markdown file: %s" % sanitize_error(error))
    _scan_push_inputs(args, markdown)
    return markdown


def main(argv=None, client_factory=None):
    args = build_parser().parse_args(argv)
    try:
        markdown = _preflight_push(args) if args.command == "push" else None
        factory = client_factory or _default_client_factory
        client = factory(args)
        result = execute(args, client, markdown)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
        return 0
    except CliError as error:
        sys.stderr.write("error: %s\n" % sanitize_error(error))
        return error.exit_code
    except (OSError, UnicodeError, ValueError) as error:
        sys.stderr.write("error: %s\n" % sanitize_error(error))
        return 1


if __name__ == "__main__":
    sys.exit(main())
