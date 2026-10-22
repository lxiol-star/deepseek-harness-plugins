#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""wiki-archive.py — 把本机各 agent 工具的会话原文归档进 ~/wiki/raw/sessions/。

来源（均为工具原生 transcript，hook 运行日志不收录）：
  - stepcode：~/.stepgo/config/agent/sessions/*/*.jsonl 或
    ~/.stepcode/agent/sessions/*/*.jsonl（已核实的原生 version 3，首行 ID 与文件名一致）
  - claude：~/.claude/projects/<project>/<session-uuid>.jsonl
    （只收主会话；<session>/subagents/ 下的子 agent transcript 属会话内嵌工作，不收）
  - codex：~/.codex/sessions/**/*.jsonl
  - kimi：~/.kimi-code/sessions/<wd>/session_<uuid>/agents/<agent-id>/wire.jsonl
    （main 保留原 UUID；state.json 身份与父链可追溯到 main 的子 agent 独立归档，
    选择 ID 为 <uuid>--<agent-id>，元数据不可靠时保留 main、忽略子 agent 并告警）
  - dsh：~/.dsh/sessions/<project>/<会话目录>/session*.jsonl.zstd
    （DeepSeek Harness 会话；会话目录旧版 session-<uuid>、中间一段为裸 uuid，
    文件名 v4 起由 session.jsonl.zstd 改为 session.v4.jsonl.zstd，通配兼容两者；
    zstd 压缩，优先 zstandard 库、回退 zstd CLI，CLI 会补 PATH 之外的标准安装路径）

落盘结构（与 SCHEMA.md 约定一致）：
  raw/sessions/<host>/<tool>/[<project>/]<session-id>.md

增量与续跑（resume）约定：
  - 状态文件 scripts/.archive-state.json：源路径 → {mtime_ns, size[, identity]}；
    Kimi 的身份变化也触发重渲染，既有无身份状态兼容读取。
  - 源文件有变化就整体重渲染该会话，覆盖同名 .md——同会话 id 永远只留一份最新原文，
    断开 resume 续跑不会产生递增副本。
  - 源文件被删除时保留已归档的 .md（归档层只增不改）。

渲染口径：
  - 只渲染对话（user/assistant 文本）与工具调用摘要（工具名 + 截断参数）；
    控制记录、token 统计、快照、思考流（reasoning/thinking）一律不渲染。
  - dsh 会话：user/message 为用户输入（过滤 system-reminder / runtime context /
    后台任务通知 / skill 内容等框架注入）；assistant/message 的 text 块为助手正文
    （text-chunks 是流式片段、与之重复，不另收）；tool/call 与 tool/result 为工具摘要。
  - 仅对实际渲染文本在内存中脱敏，工具参数/结果在 snip 截断前脱敏；不扫描
    被过滤的思考流/控制快照。覆盖结构化凭证字段、Authorization/Bearer 与独立长
    混合大小写数字令牌行（含 JSON 字符串工具参数），不改源 wire；不保证识别任意
    短裸密钥、纯 hex 或正文里的无标记令牌，可能误遮类似长随机串。
  - 日志只打印路径与计数，绝不回显会话内容（原文可能含密钥等敏感信息）。

用法：
  wiki-archive.py              # 增量归档（默认，全量发现）
  wiki-archive.py --full       # 无视状态文件，全部重渲染
  wiki-archive.py --dry-run    # 只列出将归档的会话，不写盘
  wiki-archive.py --wiki-root ~/wiki

精确选择（宿主插件集成用，新）：
  --exact-session ID           可重复；每个值是一个**完整**会话 ID，不做片段匹配。
                               必须全部命中：任一 ID 缺失或歧义都整体失败、不写任何
                               归档页；空 ID 列表不会退化为全量扫描。
  --dsh-home DIR               只扫描该 DSH home（绝对路径或 ~ 开头），用于只归档
                               Harness Dev（~/.dsh-dev）而不碰生产 ~/.dsh。
                               不传时保持历史行为：同时扫描 ~/.dsh 与 ~/.dsh-dev。

dsh 源发现：同一物理会话目录内可能并存 session.jsonl.zstd（unversioned）、
session.v3.jsonl.zstd、session.v4.jsonl.zstd 多代；发现阶段只取最新一代（v4 > v3 >
unversioned），再进入选择，避免同 ID 多源互相覆盖。

并发与状态安全（新）：
  - 整个「读状态 → 合并 → 写状态」区间由 fcntl flock 排他锁定（--list/--dry-run
    用共享锁）；bounded acquire 上限默认 300 秒，可用环境变量
    WIKI_ARCHIVE_LOCK_TIMEOUT 覆盖。
  - 状态写盘走同目录唯一临时文件 + fsync + os.replace；归档页同样用唯一临时文件。
  - 状态文件损坏/版本不符时拒绝运行且不覆盖（非零退出）。
  - failed/empty/不可读的源不会被记成已成功归档。
  - 状态文件路径可用环境变量 WIKI_ARCHIVE_STATE_FILE 覆盖（测试/多实例隔离用）。

退出码：0 正常；1 有 failed 行 / 精确点名的会话渲染为空（exact+empty）/
  状态写盘失败（摘要里 state_error=true、status_error="STATE_WRITE_FAILED"）；
  2 用法或环境错误（库根/参数/--dsh-home 非法/--exact-session 空列表）；
  3 选择失败（片段无匹配；精确 ID 缺失或歧义）；
  4 获取状态锁超时；5 状态文件损坏或版本不受支持（拒绝覆盖）。

输出契约（--json，宿主按 action 逐行复算时必须一致）：
  results 里每一行恰好有一个 action ∈ archived / skipped / empty / failed /
  would-archive；摘要计数由这些行逐行重算，一一对应、彼此 disjoint：
    archived      = action=archived 行数
    skipped       = action=skipped 行数
    empty         = action=empty 行数（真·空会话；不含解压失败）
    failed        = action=failed 行数（损坏/不可读/写页失败；不含空会话，
                    也不含状态写盘失败）
    would_archive = action=would-archive 行数（仅 --dry-run）
  state_error（bool）与 status_error（"STATE_WRITE_FAILED"/null）单独标记状态写盘
  失败，不污染 failed 计数；此状态下退出码仍为 1，且原状态文件保持不变。
  exact+empty 的退出码为 1，但 empty=1、failed=0。
  每行 page 为完整 raw 相对路径（预演/跳过同样提供），project_dir 为其落盘
  目录段；project 只是显示名——dsh 的 `--Users-a-project--` 会被 `-`→`/`
  还原成有损形式（如 `Users/a/project`），不可反解，也不能拿来拼路径。
  Kimi 行及页头提供 root_session_uuid、agent_id、agent_type、parent_agent_id、
  parent_archive_id。子 agent 的 session 是派生归档 ID，不是独立 session UUID。

zstd 解压：优先 zstandard 库，缺失/失败时回退 zstd CLI；CLI 路径先 shutil.which，
再显式回退标准安装位置（/opt/homebrew/bin/zstd、/usr/local/bin/zstd，需可执行），
以适配 launchd 的极简 PATH。不安装工具、不改 PATH/launchd/profile。解压能力缺失或
数据损坏/截断一律抛错并按 failed 行计（真·空 zstd 流仍是 empty），绝不静默当空会话。

仅使用 Python3 标准库。
"""

import argparse
import contextlib
import glob
import hashlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          ".archive-state.json")

# 单行参数截断长度（工具调用摘要）
ARG_SNIP = 120
# 状态文件版本，结构不兼容时整体重来
STATE_VERSION = 1
# 状态文件路径覆盖（测试/多实例隔离；不设时用脚本同目录的 .archive-state.json）
STATE_FILE_ENV = "WIKI_ARCHIVE_STATE_FILE"
# 状态锁：bounded acquire 上限（秒）与轮询间隔，环境变量可覆盖超时
LOCK_TIMEOUT_ENV = "WIKI_ARCHIVE_LOCK_TIMEOUT"
LOCK_TIMEOUT_DEFAULT = 300.0
LOCK_POLL_SECONDS = 0.05


# ---------------------------------------------------------------------------
# 通用工具
# ---------------------------------------------------------------------------

def parse_jsonl_lines(lines):
    """把 jsonl 文本行解析成 entries，坏行跳过。"""
    entries = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entries.append(json.loads(line))
        except ValueError:
            continue
    return entries


def load_jsonl(path):
    """逐行解析 jsonl，坏行跳过；文件读不到按空处理。"""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return parse_jsonl_lines(f)
    except OSError:
        return []


class ZstdUnavailable(RuntimeError):
    """zstd 解压能力缺失（zstandard 库与 zstd CLI 都不可用）。"""


class ZstdDecodeError(RuntimeError):
    """dsh 源文件不是完整、合法的 zstd 数据（损坏/截断/非 zstd）。"""


# zstd CLI 的标准安装位置：launchd 启动的 job PATH 极简
# （通常是 /usr/bin:/bin:/usr/sbin:/sbin），Homebrew 的 zstd 不在 PATH 里。
# 只靠 `subprocess.run(["zstd", ...])` 会 FileNotFoundError；旧实现把它按空会话
# 吞掉，于是一整批 dsh 会话在 launchd 下被静默计成 empty 而不是 failed。
ZSTD_FALLBACK_PATHS = ("/opt/homebrew/bin/zstd", "/usr/local/bin/zstd")


def resolve_zstd_binary():
    """解析 zstd CLI：PATH（shutil.which）→ 标准安装路径（需可执行）→ None。

    只做解析：不安装工具、不改 PATH、不动 launchd/profile 配置。
    """
    found = shutil.which("zstd")
    if found:
        return found
    for candidate in ZSTD_FALLBACK_PATHS:
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def load_dsh_jsonl(path):
    """dsh 会话为 zstd 压缩的 jsonl：优先 zstandard 库，缺失/失败时回退 zstd CLI。

    与「空会话」的分界（review 要求）：解压能力缺失或数据损坏/截断一律**抛异常**
    （ZstdUnavailable / ZstdDecodeError），绝不返回 []。返回 [] 会把损坏的源伪装成
    「真·空会话」而计成 empty；调用方把异常计为 failed 行并保持非零退出。
    真正合法的空 zstd 流（解压出 0 行）仍按 empty 处理。
    """
    errors = []
    try:
        import zstandard  # 可选：未安装时走 zstd CLI
    except ImportError:
        errors.append("zstandard 库不可用")
    else:
        try:
            with open(path, "rb") as f:
                payload = f.read()
        except OSError as e:
            raise ZstdDecodeError("无法读取 dsh 源文件 %s：%s" % (path, e))
        try:
            dobj = zstandard.ZstdDecompressor().decompressobj()
            raw = dobj.decompress(payload)
            if not getattr(dobj, "eof", True):
                raw += dobj.flush()
            if not getattr(dobj, "eof", True):
                raise ZstdDecodeError("zstd 数据不完整（截断）：%s" % path)
        except ZstdDecodeError:
            raise
        except Exception as e:
            errors.append("zstandard 解压失败：%s" % e)  # 损坏/截断：交给 CLI 复核
        else:
            return parse_jsonl_lines(
                raw.decode("utf-8", "replace").splitlines())

    binary = resolve_zstd_binary()
    if binary is None:
        raise ZstdUnavailable(
            "无法解压 dsh 会话 %s：zstandard 库与 zstd CLI 均不可用（%s）；"
            "请把 zstd 放进 PATH，或安装到 %s 之一"
            % (path, "；".join(errors) or "无可用解压器",
               " / ".join(ZSTD_FALLBACK_PATHS)))
    try:
        proc = subprocess.run([binary, "-d", "-c", path], capture_output=True)
    except OSError as e:
        raise ZstdUnavailable("zstd CLI 无法执行（%s）：%s" % (binary, e))
    if proc.returncode != 0:
        detail = snip(proc.stderr.decode("utf-8", "replace").strip(), 200)
        raise ZstdDecodeError(
            "zstd 解压失败（%s），源文件可能损坏或截断：%s%s"
            % (binary, path, "（%s）" % detail if detail else ""))
    return parse_jsonl_lines(proc.stdout.decode("utf-8", "replace").splitlines())


def load_src(tool, src):
    """按工具选择读取器（dsh 的源文件是 zstd 压缩的 jsonl）。"""
    return load_dsh_jsonl(src) if tool == "dsh" else load_jsonl(src)


REDACTED = "[REDACTED]"
_CREDENTIAL_KEYS = {
    "accesstoken", "refreshtoken", "idtoken", "apikey", "xapikey", "secret",
    "clientsecret", "apisecret", "secretkey", "password", "passwd", "pwd",
    "authorization", "proxyauthorization", "cookie", "setcookie", "token",
}
_CREDENTIAL_FIELD_RE = re.compile(
    r'''(?i)(["']?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|'''
    r'''x-api-key|client[_-]?secret|api[_-]?secret|secret[_-]?key|secret|'''
    r'''password|passwd|pwd|token)["']?\s*[:=]\s*)'''
    r'''(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)''')
_AUTHORIZATION_RE = re.compile(
    r'''(?i)(["']?(?:proxy-)?authorization["']?\s*[:=]\s*)'''
    r'''(?:"[^"\n]*"|'[^'\n]*'|[^\r\n,;}]+)''')
_BEARER_RE = re.compile(r"(?i)\b(Bearer)[ \t]+[A-Za-z0-9._~+/=-]+")
# Credential-shaped tokens are recognised by their issuer prefix anywhere in a
# string. This is what catches a key embedded in escaped text (`\nKEY = 'sk-…'`),
# where `\bkey` cannot help: the preceding character is a word character from the
# escape sequence. The 10-character minimum keeps `sk-learn` / `task-runner-…`
# style words out.
_PREFIXED_SECRET_RE = re.compile(
    r"(?i)(?<![A-Za-z0-9])(?:sk|rk|pk|ghp|gho|ghu|glpat|xox[abpor]|dpat|hf|npm|pypi)[-_][A-Za-z0-9][A-Za-z0-9_-]{10,}")
# `-` belongs in the token class: modern keys look like `sk-…` / `sk-proj-…`,
# and without it a bare key line never matched and stayed in cleartext.
_BARE_TOKEN_RE = re.compile(r"(?m)^([ \t]*`?)([A-Za-z0-9+/=_-]{16,256})(`?[ \t]*)$")
# Some gateway/admin personal keys are base64-shaped and appear embedded in
# shell commands rather than as a bare line or named credential field. Redact
# padded base64 values containing '/' or '+'; this may conservatively hide a
# long encoded sample, which is preferable to persisting an opaque access key.
_PADDED_BASE64_RE = re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{20,}={1,2}(?![A-Za-z0-9+/=])")
# Some issuer keys are stored without their prefix: a shell assignment such as
# `SK='<48 mixed-case alnum chars>'` embeds the key body mid-line, so neither the
# prefixed rule (no `sk-`) nor the bare-line rule (not the whole line) sees it.
# A long mixed-case alphanumeric run is the evidence; pure hex (hashes, trace
# ids, etags) and separator-bearing identifiers stay untouched.
_OPAQUE_KEY_RE = re.compile(r"(?<![A-Za-z0-9+/=])[A-Za-z0-9+/]{32,128}(?![A-Za-z0-9+/=])")


def _redact_opaque_key(match):
    token = match.group(0)
    if (re.search(r"[a-z]", token) and re.search(r"[A-Z]", token)
            and re.search(r"[0-9]", token)
            and not re.fullmatch(r"[0-9a-fA-F]+", token)):
        return REDACTED
    return token
# Browser/gateway session cookies appear as `a=1; session=<base64url>` inside a shell
# `-b '…'` argument or an escaped JSON header, i.e. mid-line and with no nearby word
# like "token"/"key", so neither the field rule nor the bare-line rule can see them.
# The cookie name itself is the evidence, hence this runs unconditionally, and the name
# must end at `=` so metadata such as `sessionUUID=…` is left alone. Values are
# base64url (`-`/`_`), which the padded-base64 rule above does not cover, and may be
# wrapped in a quote (`session='…'`) once the tool-call argument is JSON-escaped.
_COOKIE_PAIR_RE = re.compile(
    r'''(?i)((?<![A-Za-z0-9_-])(?:session|sessionid|session[_-]id|sid|sess|jwt|'''
    r'''csrf[_-]?token|remember[_-]?token)\s*=\s*)(["']?)([A-Za-z0-9+/=_-]{12,})''')


def redact_credentials(value):
    """在内存中脱敏；裸令牌仅识别独立、非纯 hex 的长混合大小写数字串（含 `-`）。"""
    if isinstance(value, dict):
        return {
            key: REDACTED if re.sub(r"[^a-z0-9]", "", str(key).lower())
            in _CREDENTIAL_KEYS else redact_credentials(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_credentials(item) for item in value]
    if not isinstance(value, str):
        return value
    stripped = value.strip()
    if stripped.startswith(("{", "[", '"')):
        try:
            decoded = json.loads(value)
        except ValueError:
            pass
        else:
            if isinstance(decoded, (dict, list, str)):
                cleaned = redact_credentials(decoded)
                return (json.dumps(cleaned, ensure_ascii=False)
                        if cleaned != decoded else value)
    lowered = value.lower() if value.isascii() else None
    text = value
    if lowered is None or any(word in lowered for word in (
            "token", "key", "secret", "password", "passwd", "pwd")):
        text = _CREDENTIAL_FIELD_RE.sub(lambda m: m.group(1) + REDACTED, text)
    if lowered is None or "authorization" in lowered:
        text = _AUTHORIZATION_RE.sub(lambda m: m.group(1) + REDACTED, text)
    if lowered is None or "bearer" in lowered:
        text = _BEARER_RE.sub(lambda m: m.group(1) + " " + REDACTED, text)
    text = _COOKIE_PAIR_RE.sub(lambda m: m.group(1) + m.group(2) + REDACTED, text)
    # Unconditional: the issuer prefix is the evidence, so this does not depend on
    # a nearby word like "key"/"token" (an escaped `\nKEY = …` never has one).
    text = _PREFIXED_SECRET_RE.sub(REDACTED, text)
    text = _OPAQUE_KEY_RE.sub(_redact_opaque_key, text)
    text = _PADDED_BASE64_RE.sub(
        lambda m: REDACTED if "/" in m.group(0) or "+" in m.group(0) else m.group(0),
        text)

    def redact_bare(match):
        token = match.group(2)
        if (re.search(r"[a-z]", token) and re.search(r"[A-Z]", token)
                and re.search(r"[0-9]", token)
                and not re.fullmatch(r"[0-9a-fA-F]+", token)):
            return match.group(1) + REDACTED + match.group(3)
        return match.group(0)

    return _BARE_TOKEN_RE.sub(redact_bare, text)


def snip(text, limit=ARG_SNIP):
    text = re.sub(r"\s+", " ", str(redact_credentials(text))).strip()
    return text if len(text) <= limit else text[:limit] + "…"


def md_escape_fence(text):
    """正文中出现的 ``` 会顶破围栏，统一换成全角，避免渲染出的 md 自坏。"""
    return str(text).replace("```", "‵‵‵")


def ts_short(value):
    """把常见时间字段（ISO 字符串或 epoch 秒/毫秒）格式化成 YYYY-MM-DD HH:MM。"""
    if value is None:
        return ""
    if isinstance(value, (int, float)):
        v = value / 1000 if value > 1e12 else value
        try:
            return datetime.fromtimestamp(v).strftime("%Y-%m-%d %H:%M")
        except (OverflowError, OSError, ValueError):
            return ""
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")) \
                         .strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return ""


# ---------------------------------------------------------------------------
# 三个来源的渲染器：jsonl entries → [(role, text)] 序列
# role ∈ user / assistant / tool
# ---------------------------------------------------------------------------

def render_claude(entries):
    """claude transcript：type=user/assistant 为对话，跳过 sidechain 与控制记录。"""
    turns = []
    for d in entries:
        t = d.get("type")
        if t not in ("user", "assistant") or d.get("isSidechain"):
            continue
        msg = d.get("message") or {}
        content = msg.get("content")
        ts = ts_short(d.get("timestamp"))
        if isinstance(content, str):
            if content.strip():
                turns.append((t, ts, content))
            continue
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            bt = block.get("type")
            if bt == "text" and block.get("text", "").strip():
                turns.append((t, ts, block["text"]))
            elif bt == "tool_use":
                turns.append(("tool", ts, "🔧 %s(%s)" % (
                    block.get("name", "?"), snip(json.dumps(
                        block.get("input", {}), ensure_ascii=False)))))
            elif bt == "tool_result":
                c = block.get("content")
                if isinstance(c, list):
                    c = " ".join(x.get("text", "") for x in c if isinstance(x, dict))
                if c and str(c).strip():
                    turns.append(("tool", ts, "↩︎ 结果: " + snip(c, 200)))
    return turns


def render_codex(entries):
    """codex rollout：response_item/message 为对话，function_call* 为工具。"""
    turns = []
    for d in entries:
        if d.get("type") != "response_item":
            continue
        p = d.get("payload") or {}
        pt = p.get("type")
        ts = ts_short(d.get("timestamp"))
        if pt == "message":
            role = p.get("role", "assistant")
            if role not in ("user", "assistant"):
                continue  # developer/system 指令块属框架噪声，不入原文
            texts = [c.get("text", "") for c in p.get("content") or []
                     if isinstance(c, dict)]
            body = "\n".join(t for t in texts if t.strip())
            if body.strip():
                turns.append((role, ts, body))
        elif pt == "function_call":
            turns.append(("tool", ts, "🔧 %s(%s)" % (
                p.get("name", "?"), snip(p.get("arguments", "")))))
        elif pt == "function_call_output":
            out = p.get("output", "")
            if isinstance(out, dict):
                out = out.get("output", "")
            if str(out).strip():
                turns.append(("tool", ts, "↩︎ 结果: " + snip(out, 200)))
    return turns


def kimi_text(value):
    """kimi 的 input/content 三种形态：纯字符串、单个 content block、block 列表。"""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get("text", ""))
    if isinstance(value, list):
        parts = []
        for b in value:
            if isinstance(b, str):
                parts.append(b)
            elif isinstance(b, dict) and b.get("type") in (None, "text"):
                parts.append(str(b.get("text", "")))
        return "\n".join(p for p in parts if p.strip())
    return ""


def render_kimi(entries):
    """kimi wire.jsonl：用户输入在 turn.prompt，助手回复与工具调用在
    context.append_loop_event（content.part / tool.call / tool.result）。

    注意：context.append_message 记录的是被追加进上下文的用户侧消息，与
    turn.prompt 重复，且混有 system-reminder 与后台任务通知等框架噪声，
    故只收 assistant 角色（当前版本不产生，留作前向兼容）。
    """
    turns = []
    # 助手文本按 stepUuid 聚合：同一 step 内的多个 text part 属同一段回复。
    buf_key = None
    buf_ts = ""
    buf = []

    def flush():
        if buf:
            body = "\n".join(buf).strip()
            if body:
                turns.append(("assistant", buf_ts, body))
        return None, "", []

    for d in entries:
        t = d.get("type")
        ts = ts_short(d.get("time"))

        if t in ("turn.prompt", "turn.steer"):
            # origin.kind 区分真人输入与框架注入；后台任务完成通知不算用户发言。
            kind = (d.get("origin") or {}).get("kind")
            if kind == "background_task":
                continue
            body = kimi_text(d.get("input", ""))
            if body.strip():
                buf_key, buf_ts, buf = flush()
                turns.append(("user", ts, body))

        elif t == "context.append_message":
            m = d.get("message") or {}
            if m.get("role") != "assistant":
                continue
            body = kimi_text(m.get("content"))
            if body.strip():
                buf_key, buf_ts, buf = flush()
                turns.append(("assistant", ts, body))
            for call in m.get("toolCalls") or []:
                if isinstance(call, dict):
                    fn = call.get("function") or {}
                    turns.append(("tool", ts, "🔧 %s(%s)" % (
                        fn.get("name", call.get("name", "?")),
                        snip(fn.get("arguments", "")))))

        elif t == "context.append_loop_event":
            e = d.get("event") or {}
            et = e.get("type")
            if et == "content.part":
                p = e.get("part") or {}
                if p.get("type") != "text":
                    continue  # think 部分属思考流，按渲染口径不收录
                text = str(p.get("text", ""))
                if not text.strip():
                    continue
                key = e.get("stepUuid") or e.get("uuid")
                if key != buf_key:
                    buf_key, buf_ts, buf = flush()
                    buf_key, buf_ts = key, ts
                buf.append(text)
            elif et == "tool.call":
                buf_key, buf_ts, buf = flush()
                turns.append(("tool", ts, "🔧 %s(%s)" % (
                    e.get("name", "?"),
                    snip(json.dumps(e.get("args", {}), ensure_ascii=False)))))
            elif et == "tool.result":
                buf_key, buf_ts, buf = flush()
                res = e.get("result")
                if isinstance(res, dict):
                    flag = "⚠︎ " if res.get("isError") else ""
                    res = flag + str(res.get("output", ""))
                if res and str(res).strip():
                    turns.append(("tool", ts, "↩︎ 结果: " + snip(res, 200)))
    flush()
    return turns


def zcode_content(value):
    """zcode 消息 content：字符串或 content block 列表。"""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for b in value:
            if isinstance(b, dict) and b.get("type") in (None, "text"):
                parts.append(str(b.get("text", "")))
            elif isinstance(b, str):
                parts.append(b)
        return "\n".join(p for p in parts if p.strip())
    return ""


def zcode_msg_fingerprint(m):
    """窗口拼接用的消息指纹：role + content + toolCalls 的稳定序列化。"""
    if not isinstance(m, dict):
        return repr(m)
    try:
        return json.dumps(
            [m.get("role"), m.get("content"), m.get("toolCalls")],
            ensure_ascii=False, sort_keys=True)
    except (TypeError, ValueError):
        return repr(m)


def merge_zcode_windows(entries):
    """把各 entry 的 request.messages 拼成完整对话。

    request.messages 不是 append-only 全量快照，而是**定长滑动窗口**（本机实测
    每条恒为 64）。长会话里窗口会把早期消息挤出去，因此单取任意一条都不完整；
    尤其所有窗口等长时 max(len) 会退化成取第一条（最旧），归档就会丢掉整个后
    半段——现象是原文停在某条用户提问处，后续问答全无，进而让提炼把未完成的
    请求写成结论。

    做法：按时间序遍历窗口，用「已合并序列的后缀 == 新窗口的前缀」求最大重叠后
    追加增量。找不到重叠说明窗口跳跃或上下文被压缩重写，整段追加（宁可留缺口
    也不丢内容）。
    """
    merged = []
    merged_fp = []
    for e in entries:
        win = (e.get("request") or {}).get("messages") or []
        win = [m for m in win if isinstance(m, dict)]
        if not win:
            continue
        win_fp = [zcode_msg_fingerprint(m) for m in win]
        if not merged:
            merged, merged_fp = list(win), win_fp
            continue
        overlap = 0
        for k in range(min(len(merged_fp), len(win_fp)), 0, -1):
            if merged_fp[-k:] == win_fp[:k]:
                overlap = k
                break
        merged.extend(win[overlap:])
        merged_fp.extend(win_fp[overlap:])
    return merged


def render_zcode(entries):
    """zcode rollout（~/.zcode/cli/rollout/model-io-*.jsonl）：每条 entry 是一次模型
    请求快照，request.messages 是定长滑动窗口（非全量），故先用
    merge_zcode_windows 把各窗口拼成完整对话。

    只收 user/assistant/tool 三类（system 属框架指令不入原文），跳过 isError 的
    工具结果（错误细节属排障噪声）。response 不再单独收取：助手回复会出现在下一
    个请求的窗口里，合并后已覆盖。
    """
    if not entries:
        return []
    msgs = merge_zcode_windows(entries)
    turns = []
    for m in msgs:
        if not isinstance(m, dict):
            continue
        role = m.get("role")
        if role not in ("user", "assistant", "tool"):
            continue
        if role == "tool":
            if m.get("isError"):
                continue
            out = zcode_content(m.get("content"))
            if out and out.strip():
                turns.append(("tool", "", "↩︎ 结果: " + snip(out, 200)))
            continue
        body = zcode_content(m.get("content"))
        if body.strip():
            turns.append((role, "", body))
        if role == "assistant":
            for call in m.get("toolCalls") or []:
                if isinstance(call, dict):
                    turns.append(("tool", "", "🔧 %s(%s)" % (
                        call.get("name", "?"),
                        snip(json.dumps(call.get("input", {}), ensure_ascii=False)))))
    return turns


def render_pi(entries):
    """pi（~/.pi/agent/sessions/<project-dir>/*.jsonl）：
    - type=message 且 role=user：用户输入（text 块；image 块是附件，不收录）。
    - role=assistant：连续 text 块聚合成一段回复（thinking 块属思考流，按渲染
      口径不收录）；toolCall 块记工具调用摘要（工具名 + 截断参数）。
    - role=toolResult：工具结果摘要（isError 加 ⚠︎ 标记）。
    - session / model_change / thinking_level_change 等属控制记录，不收录。
    """
    def block_text(block):
        if isinstance(block, dict) and block.get("type") == "text":
            return str(block.get("text", ""))
        return ""

    turns = []
    buf_ts = ""
    buf = []

    def flush():
        if buf:
            body = "\n".join(buf).strip()
            if body:
                turns.append(("assistant", buf_ts, body))
        return "", []

    for d in entries:
        if d.get("type") != "message":
            continue
        m = d.get("message") or {}
        ts = ts_short(d.get("timestamp") or m.get("timestamp"))
        role = m.get("role")
        content = m.get("content") or []

        if role == "user":
            buf_ts, buf = flush()
            body = "\n".join(block_text(b) for b in content)
            if body.strip():
                turns.append(("user", ts, body))
        elif role == "assistant":
            for b in content:
                bt = b.get("type")
                if bt == "text":
                    text = block_text(b)
                    if text.strip():
                        if not buf:
                            buf_ts = ts
                        buf.append(text)
                elif bt == "toolCall":
                    buf_ts, buf = flush()
                    turns.append(("tool", ts, "🔧 %s(%s)" % (
                        b.get("name", "?"),
                        snip(json.dumps(b.get("arguments", {}),
                                        ensure_ascii=False)))))
        elif role == "toolResult":
            buf_ts, buf = flush()
            body = "\n".join(block_text(b) for b in content)
            flag = "⚠︎ " if m.get("isError") else ""
            if body.strip():
                turns.append(("tool", ts, "↩︎ 结果: " + flag + snip(body, 200)))
    flush()
    return turns


def render_dsh(entries):
    """dsh 会话（~/.dsh/sessions/**/session*.jsonl.zstd，含 v4 的 session.v4.jsonl.zstd）：
    - user/message：用户输入；过滤 system-reminder / runtime context / 后台任务
      通知 / skill 内容等框架注入；连续重复只留一条。
    - assistant/message：text 块为助手最终正文（text-chunks 是流式片段、与之重复，
      不另收）；reasoning 块属思考流，按渲染口径不收录。
    - tool/call 与 tool/result：工具调用摘要（工具名 + 截断参数 / 截断结果）。
    其余类型（request/*、chunk、reasoning-chunks、turn/step 标记、goal/todo 等）
    属控制记录，不收录。
    """
    def block_text(block):
        if isinstance(block, dict) and block.get("type") == "text":
            return str(block.get("text", ""))
        return ""

    turns = []
    last_user = None
    for d in entries:
        t = d.get("type")
        ts = ts_short(d.get("time"))
        if t == "user/message":
            dd = d.get("data") or {}
            parts = [block_text(b) for b in (dd.get("content") or [])]
            body = "\n".join(x for x in parts if x.strip())
            if not body.strip():
                continue
            head = body[:120].lstrip()
            if (body.startswith("<system-reminder>") or body.startswith("<skill_content")
                    or body.startswith("Current runtime context")
                    or head.startswith("background job ")):
                continue
            if body != last_user:  # 连续重复（同一输入多 surface）只留一条
                turns.append(("user", ts, body))
                last_user = body
        elif t == "assistant/message":
            msg = (d.get("data") or {}).get("message") or {}
            body = "\n".join(block_text(b) for b in (msg.get("content") or []))
            if body.strip():
                turns.append(("assistant", ts, body))
        elif t == "tool/call":
            dd = d.get("data") or {}
            turns.append(("tool", ts, "🔧 %s(%s)" % (
                dd.get("name", "?"), snip(str(dd.get("arguments", ""))))))
        elif t == "tool/result":
            dd = d.get("data") or {}
            msg = dd.get("message") or {}
            texts = []
            for b in (msg.get("content") or []):
                if isinstance(b, dict) and b.get("type") == "tool-result":
                    for inner in (b.get("content") or []):
                        if isinstance(inner, dict) and inner.get("type") == "text":
                            texts.append(str(inner.get("text", "")))
            out = "\n".join(texts)
            if out.strip():
                turns.append(("tool", ts, "↩︎ 结果: " + snip(out, 200)))
    return turns


# ---------------------------------------------------------------------------
# 来源发现
# ---------------------------------------------------------------------------

# dsh 会话文件代际：session.jsonl.zstd（unversioned=0）→ session.v3.jsonl.zstd（3）
# → session.v4.jsonl.zstd（4）。同一物理会话目录里可能并存多代，归档必须**先**只取
# 最新一代，否则一次发现会产生多条同 ID 源、互相覆盖，状态键也会指向被覆盖的旧代。
_DSH_SESSION_FILE_RE = re.compile(r"^session(?:\.v(\d+))?\.jsonl\.zstd$")


def dsh_session_generation(filename):
    """返回 dsh 会话文件代际（unversioned=0，vN=N）；文件名不匹配返回 None。"""
    m = _DSH_SESSION_FILE_RE.match(filename)
    if not m:
        return None
    return int(m.group(1)) if m.group(1) is not None else 0


def pick_canonical_dsh_file(session_dir):
    """在一个物理会话目录里选最新一代会话文件；没有匹配返回 None。"""
    try:
        names = os.listdir(session_dir)
    except OSError:
        return None
    best_name = None
    best_key = None
    for name in names:
        gen = dsh_session_generation(name)
        if gen is None:
            continue
        key = (gen, name)
        if best_key is None or key > best_key:
            best_key, best_name = key, name
    if best_name is None:
        return None
    return os.path.join(session_dir, best_name)


def discover_dsh_sources(dsh_home):
    """扫描**单个** DSH home，每个 <project>/<会话目录>/ 只产出最新一代源。

    会话 ID 仍取会话目录名（与文件首行 header 的 id 一致，保持历史归档命名）。
    """
    found = []
    sessions_root = os.path.join(dsh_home, "sessions")
    try:
        project_dirs = sorted(n for n in os.listdir(sessions_root)
                              if not n.startswith("."))
    except OSError:
        return found
    for project_dir in project_dirs:
        project_path = os.path.join(sessions_root, project_dir)
        if not os.path.isdir(project_path):
            continue
        project = re.sub(r"^-+|-+$", "", project_dir).replace("-", "/")
        try:
            session_dirs = sorted(n for n in os.listdir(project_path)
                                  if not n.startswith("."))
        except OSError:
            continue
        for session_dir in session_dirs:
            session_path = os.path.join(project_path, session_dir)
            if not os.path.isdir(session_path):
                continue
            canonical = pick_canonical_dsh_file(session_path)
            if canonical is None:
                continue
            found.append(("dsh", project, session_dir, canonical))
    return found


_KIMI_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
_KIMI_AGENT_RE = re.compile(r"agent-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*")


def kimi_safe_path(path, home):
    home = os.path.abspath(home)
    path = os.path.abspath(path)
    if os.path.commonpath((home, path)) != home or os.path.islink(home):
        return False
    current = home
    for part in os.path.relpath(path, home).split(os.sep):
        current = os.path.join(current, part)
        if os.path.islink(current):
            return False
    return True


def emit_kimi_warnings(warnings, exact_ids=None):
    roots = {sid.split("--", 1)[0] for sid in exact_ids or []}
    grouped = {}
    for warning in warnings:
        root = warning["root_session_uuid"]
        if exact_ids is not None and root is not None and root not in roots:
            continue
        key = (warning["project"], tuple(warning["reasons"]))
        grouped.setdefault(key, []).append(root or "unknown")
    for (project, reasons), affected in sorted(grouped.items()):
        sample = sorted(set(affected))
        shown = sample if exact_ids is not None else sample[:3]
        suffix = "，另 %d 个" % (len(sample) - len(shown)) if len(shown) < len(sample) else ""
        print("警告：Kimi 忽略不可靠来源；project=%s；root=%s%s；数量=%d；原因=%s"
              % (project, ",".join(shown), suffix, len(affected), "、".join(reasons)),
              file=sys.stderr)


def discover_kimi_sources(home, identities=None, warnings=None):
    found = []
    collected = warnings if warnings is not None else []
    root = os.path.join(home, ".kimi-code", "sessions")
    if not kimi_safe_path(root, home):
        collected.append({"root_session_uuid": None, "project": "unknown",
                          "reasons": ["来源根路径不安全"]})
        if warnings is None:
            emit_kimi_warnings(collected)
        return found
    session_dirs = []
    for project_dir in sorted(glob.glob(os.path.join(root, "*"))):
        if not kimi_safe_path(project_dir, home):
            collected.append({"root_session_uuid": None,
                              "project": safe_segment(os.path.basename(project_dir)),
                              "reasons": ["项目路径不安全"]})
            continue
        if os.path.isdir(project_dir):
            session_dirs.extend(glob.glob(os.path.join(project_dir, "session_*")))
    for session_dir in sorted(session_dirs):
        reasons = set()
        session = os.path.basename(session_dir)[len("session_"):]
        project = os.path.basename(os.path.dirname(session_dir))
        valid_uuid = bool(_KIMI_UUID_RE.fullmatch(session))
        if (not valid_uuid or not kimi_safe_path(session_dir, home)
                or not os.path.isdir(session_dir)):
            reasons.add("会话目录身份或路径非法")
        else:
            main_wire = os.path.join(session_dir, "agents", "main", "wire.jsonl")
            if kimi_safe_path(main_wire, home) and os.path.isfile(main_wire):
                found.append(("kimi", project, session, main_wire))
                if identities is not None:
                    identities[main_wire] = {
                        "root_session_uuid": session, "agent_id": "main",
                        "agent_type": "main", "parent_agent_id": None,
                        "parent_archive_id": None,
                    }
            elif os.path.lexists(main_wire):
                reasons.add("主 wire 路径不安全或非文件")
            state_path = os.path.join(session_dir, "state.json")
            state = None
            if not kimi_safe_path(state_path, home):
                reasons.add("state 路径不安全")
            else:
                try:
                    with open(state_path, encoding="utf-8") as f:
                        state = json.load(f)
                except FileNotFoundError:
                    reasons.add("state 缺失")
                except (OSError, ValueError, UnicodeError):
                    reasons.add("state 不可读或解析失败")
            agents = state.get("agents") if isinstance(state, dict) else None
            if not isinstance(state, dict):
                if not reasons:
                    reasons.add("state 顶层结构非法")
            elif state.get("id") != "session_" + session:
                reasons.add("state 会话身份不匹配")
            elif not isinstance(agents, dict):
                reasons.add("agents 结构非法")
            else:
                valid_nodes = {}
                for agent_id, node in agents.items():
                    if (not isinstance(agent_id, str)
                            or (agent_id != "main"
                                and not _KIMI_AGENT_RE.fullmatch(agent_id))
                            or not isinstance(node, dict)):
                        reasons.add("agent 身份或结构非法")
                        continue
                    expected = os.path.join(session_dir, "agents", agent_id)
                    parent = node.get("parentAgentId")
                    valid_parent = (parent is None if agent_id == "main" else
                                    isinstance(parent, str) and
                                    (parent == "main" or
                                     bool(_KIMI_AGENT_RE.fullmatch(parent))))
                    node_reasons = set()
                    if node.get("type") != ("main" if agent_id == "main" else "sub"):
                        node_reasons.add("agent 类型非法")
                    if (node.get("homedir") != expected
                            or not kimi_safe_path(expected, home)
                            or not os.path.isdir(expected)):
                        node_reasons.add("agent 目录身份或路径非法")
                    if not valid_parent:
                        node_reasons.add("agent 父级身份非法或缺失")
                    if node_reasons:
                        reasons.update(node_reasons)
                        continue
                    valid_nodes[agent_id] = parent
                for agent_id, parent in valid_nodes.items():
                    if agent_id == "main":
                        continue
                    current, seen = agent_id, set()
                    while current != "main" and current in valid_nodes and current not in seen:
                        seen.add(current)
                        current = valid_nodes[current]
                    if current != "main" or "main" not in valid_nodes:
                        reasons.add("父链循环或无法到达有效 main")
                        continue
                    wire = os.path.join(session_dir, "agents", agent_id, "wire.jsonl")
                    if not kimi_safe_path(wire, home):
                        reasons.add("子 wire 路径不安全")
                        continue
                    if not os.path.isfile(wire):
                        continue
                    archive_id = session + "--" + agent_id
                    found.append(("kimi", project, archive_id, wire))
                    if identities is not None:
                        identities[wire] = {
                            "root_session_uuid": session, "agent_id": agent_id,
                            "agent_type": "sub", "parent_agent_id": parent,
                            "parent_archive_id": session if parent == "main"
                            else session + "--" + parent,
                        }
        if reasons:
            collected.append({"root_session_uuid": session if valid_uuid else None,
                              "project": safe_segment(project),
                              "reasons": sorted(reasons)})
    if warnings is None:
        emit_kimi_warnings(collected)
    return found


def stepcode_header(header, source):
    """只接受已核实的原生 v3 session；不把 hook 日志当会话。"""
    if not isinstance(header, dict) or header.get("type") != "session" \
            or header.get("version") != 3:
        raise ValueError("StepCode 原生 session 头缺失或版本不支持")
    session = header.get("id")
    filename_id = os.path.splitext(os.path.basename(source))[0].split("_")[-1]
    if not isinstance(session, str) or not re.fullmatch(
            r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", session) \
            or session != filename_id:
        raise ValueError("StepCode 会话 ID 与来源文件名不一致")
    project = header.get("cwd")
    if not isinstance(project, str) or not project.strip():
        raise ValueError("StepCode session 头缺少工作目录")
    return session, project


def discover_stepcode_sources(home):
    found = []
    for layout in (".stepgo/config/agent", ".stepcode/agent"):
        pattern = os.path.join(home, layout, "sessions", "*", "*.jsonl")
        for source in glob.glob(pattern):
            try:
                with open(source, encoding="utf-8") as stream:
                    header = json.loads(next(line for line in stream if line.strip()))
                session, project = stepcode_header(header, source)
            except (OSError, ValueError, StopIteration):
                continue
            found.append(("stepcode", project, session, source))
    return found


def render_stepcode(entries):
    if not entries or not isinstance(entries[0], dict) \
            or entries[0].get("type") != "session" or entries[0].get("version") != 3:
        raise ValueError("StepCode 原生 session 头缺失或版本不支持")
    return render_pi(entries)


def discover_sources(dsh_homes=None, tools=None, identities=None, warnings=None):
    """返回 [(tool, project, session_id, src_path)]，project 可为 ''。

    dsh_homes 为 None 时保持历史行为：同时扫描 ~/.dsh（正式）与 ~/.dsh-dev
    （Harness Dev）。显式传入 home 列表时只扫这些 home —— 宿主只调
    `--dsh-home ~/.dsh-dev` 就能只归档开发宿主、完全不碰生产 ~/.dsh。

    tools 非空时只走被点名工具的目录树（例如 `--tool dsh` 不再去 walk
    ~/.claude / ~/.codex / ~/.pi …）：选择结果不变，只是少做无用 IO。
    identities 可接收 src_path → Kimi 身份；warnings 接收安全的 root UUID、
    project 与固定拒绝原因，展示时聚合，精确选择仅展示对应 root 和全局路径告警。
    两者均不改变返回的四元组契约。
    """
    home = os.path.expanduser("~")
    if dsh_homes is None:
        dsh_homes = [os.path.join(home, ".dsh"), os.path.join(home, ".dsh-dev")]
    wanted = set(tools) if tools else None

    def want(tool):
        return wanted is None or tool in wanted

    found = []
    if want("stepcode"):
        found.extend(discover_stepcode_sources(home))
    if want("claude"):
        for p in glob.glob(os.path.join(home, ".claude/projects/*/*.jsonl")):
            project = os.path.basename(os.path.dirname(p))
            session = os.path.splitext(os.path.basename(p))[0]
            found.append(("claude", project, session, p))
    if want("codex"):
        for p in glob.glob(os.path.join(home, ".codex/sessions/**/*.jsonl"),
                           recursive=True):
            session = os.path.splitext(os.path.basename(p))[0]
            found.append(("codex", "", session, p))
    if want("kimi"):
        found.extend(discover_kimi_sources(home, identities, warnings))
    if want("zcode"):
        for p in glob.glob(os.path.join(
                home, ".zcode/cli/rollout/model-io-*.jsonl")):
            # ZCode（Kimi Code）rollout：文件名含 sessionId，entry 里也有 sessionId
            # 字段。取 entry 的 sessionId（去掉 sess_ 前缀），与 kimi 同项目目录
            # 无法从 rollout 反推（workDir 不在 rollout 里），project 置空。
            session = os.path.splitext(os.path.basename(p))[0].replace(
                "model-io-", "", 1).replace("sess_", "", 1)
            found.append(("zcode", "", session, p))
    if want("dsh"):
        for dsh_home in dsh_homes:
            # DeepSeek Harness：目录名 <project>/<会话目录>/，project 目录是工作路径的
            # 脱敏编码（`--Users-me-project--` 形），尽力还原成路径。会话目录旧版是
            # session-<uuid>、中间一段为裸 uuid；文件名 v4 起从 session.jsonl.zstd 改成
            # session.v4.jsonl.zstd —— 每个会话目录只取最新一代（见
            # discover_dsh_sources / pick_canonical_dsh_file）。
            found.extend(discover_dsh_sources(dsh_home))
    if want("pi"):
        for p in glob.glob(os.path.join(home, ".pi/agent/sessions/*/*.jsonl")):
            # pi：目录名是工作路径的编码（`--Users-me-project-code-example--` 形），
            # 按 dsh 同款方式还原；会话 ID 取文件名最后一段（<时间戳>_<uuid>.jsonl）。
            project_dir = os.path.basename(os.path.dirname(p))
            project = re.sub(r"^-+|-+$", "", project_dir).replace("-", "/")
            session = os.path.splitext(os.path.basename(p))[0].split("_")[-1]
            found.append(("pi", project, session, p))
    if want("omp"):
        for p in glob.glob(os.path.join(home, ".omp/agent/sessions/*/*.jsonl")):
            # omp（Oh My Pi，pi 同源的 version 3 NDJSON）：目录/文件名规则与 pi
            # 一致，复用 render_pi；omp 特有的 title / title_change /
            # custom_message 等记录在渲染器里被 type!=message 统一过滤。
            project_dir = os.path.basename(os.path.dirname(p))
            project = re.sub(r"^-+|-+$", "", project_dir).replace("-", "/")
            session = os.path.splitext(os.path.basename(p))[0].split("_")[-1]
            found.append(("omp", project, session, p))
    # 同一物理文件可能被多个 home（软链，或调用方重复指定 home）扫到：按 realpath
    # 去重，保持排序稳定。注意只按物理文件去重，不按 session ID 去重——不同目录下
    # 同 ID 的歧义要留给 select_exact 拒绝，不能在这里静默吞掉一个。
    deduped = []
    seen = set()
    for entry in sorted(found):
        key = os.path.realpath(entry[3])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(entry)
    return deduped


RENDERERS = {"claude": render_claude, "codex": render_codex, "kimi": render_kimi,
             "zcode": render_zcode, "dsh": render_dsh, "pi": render_pi,
             "omp": render_pi, "stepcode": render_stepcode}

# 结果行的 action → 摘要计数器。**每个 action 恰好对应一个计数器**：计数永远由
# results 逐行重算（见 _run_archive_locked 尾部），宿主按 action 复算时必须完全相等。
# 这是 review 卡住的点：精确模式下空会话曾同时 +empty 和 +failed，而行只有一条，
# 逐 action 解析器算出 failed=0 与摘要冲突 → 判输出不自洽。
ACTION_COUNTERS = {
    "archived": "archived",
    "skipped": "skipped",
    "empty": "empty",
    "failed": "failed",
    "would-archive": "would_archive",
}


# ---------------------------------------------------------------------------
# 归档
# ---------------------------------------------------------------------------

def safe_segment(name):
    """目录/文件名片段：只留安全字符，避免源路径里的怪字符污染 raw 结构。"""
    return re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-.") or "unknown"


def resolve_host():
    """确定 raw/sessions 的 host 目录名，保证**同一设备跨运行环境得到同一个名字**。

    起因（本机实例）：launchd 环境里 `socket.gethostname()` 可能返回 `localhost`
    （同一时刻终端里是真实主机名）。归档 job 因此把同一批会话写进了
    `raw/sessions/localhost/`，与真实主机名目录下的副本形成双归档，再次触发
    「同一会话两份归档路径 → 提炼判为不同会话 → 生成 slug-N 副本」的老问题。

    解析顺序：
      1. macOS `scutil --get LocalHostName`（系统持久配置，不随网络/DNS 漂移）；
      2. `socket.gethostname()` 短名（历史行为，非 localhost 时保留）；
      3. macOS `scutil --get ComputerName`（sanitize 后，可能含非 ASCII）；
      4. 兜底 `unknown-host`。
    任何来源得到 `localhost`（或空）都视为无效——那不是设备名，而是"没解析出来"。
    """
    def via_scutil(key):
        try:
            out = subprocess.run(["scutil", "--get", key],
                                 capture_output=True, text=True, timeout=5)
            if out.returncode == 0:
                v = safe_segment(out.stdout.strip())
                if v and v.lower() != "localhost":
                    return v
        except Exception:
            pass
        return None

    local = via_scutil("LocalHostName")
    if local:
        return local
    raw_hn = socket.gethostname().split(".")[0]
    if raw_hn and raw_hn.lower() != "localhost":
        return safe_segment(raw_hn)
    computer = via_scutil("ComputerName")
    if computer:
        return computer
    return "unknown-host"


def render_markdown(tool, project, session, src_path, turns, identity=None):
    lines = [
        "# 会话原文 · %s · %s" % (tool, session),
        "",
        "- 工具：%s%s" % (tool, " / 项目：%s" % project if project else ""),
        "- 来源：%s" % src_path,
        "- 归档时间：%s" % datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "- 渲染口径：仅对话与工具调用摘要；控制记录/快照/思考流未收录",
    ]
    for key, value in (identity or {}).items():
        lines.append("- %s: %s" % (key, value if value is not None else "null"))
    lines.extend(["", "---", ""])
    icon = {"user": "## 👤 用户", "assistant": "## 🤖 助手", "tool": "## 🛠 工具"}
    for role, ts, text in turns:
        head = icon.get(role, "## %s" % role)
        lines.append("%s%s" % (head, " · %s" % ts if ts else ""))
        lines.append("")
        if role == "tool":
            lines.append("`%s`" % md_escape_fence(text).replace("`", "ˋ"))
        else:
            lines.append(md_escape_fence(text))
        lines.append("")
    return "\n".join(lines)


def parse_since(value):
    """把 --since 解析成本地时间戳；空值返回 None，非法值抛 ValueError。"""
    text = (value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).timestamp()
        except ValueError:
            continue
    raise ValueError(text)


def select_sources(sources, fragments, tools, since_ts, limit):
    """按批量条件挑出目标会话，返回 (选中列表, 是否为部分选择)。

    「部分选择」这个信号很关键：状态文件是增量归档的记忆，只从**本次选中**的
    会话重建它，会把没选中的会话全部遗忘——那样下一次全量就会把整库重渲染一遍。
    历史上每次 `--session` 都在制造这个问题，所以这里显式把它传出去，由写盘处
    决定是「合并」还是「重算」。
    """
    candidates = [entry for entry in sources if not tools or entry[0] in tools]
    exact_tokens = {token for token in fragments
                    if any(entry[2] == token for entry in candidates)}
    picked = []
    for tool, project, session, src in candidates:
        if fragments and not any(
                session == token if token in exact_tokens else
                token in session or token in os.path.basename(src)
                for token in fragments):
            continue
        if since_ts is not None:
            try:
                if os.stat(src).st_mtime < since_ts:
                    continue
            except OSError:
                continue
        picked.append((tool, project, session, src))

    partial = bool(fragments) or bool(tools) or since_ts is not None \
        or limit is not None
    if limit is not None and len(picked) > limit:
        def mtime(item):
            try:
                return os.stat(item[3]).st_mtime
            except OSError:
                return 0.0
        picked.sort(key=mtime, reverse=True)  # 批量归档通常先要最近的一批
        picked = picked[:limit]
        picked.sort()                         # 输出顺序仍保持稳定可复现
    return picked, partial


def select_exact(sources, exact_ids):
    """按**完整**会话 ID 选择，返回 (picked, missing, ambiguous)。

    - 每个请求 ID 必须命中：missing 非空即整体失败，不做静默部分选择。
    - 同一 ID 命中多个不同物理来源（不同目录/项目/home）判为 ambiguous，整体拒绝
      ——否则只能随便挑一个写，可能覆盖错的源。
    """
    by_id = {}
    for entry in sources:
        by_id.setdefault(entry[2], []).append(entry)
    picked, missing, ambiguous = [], [], []
    for sid in exact_ids:
        uniq, seen = [], set()
        for entry in by_id.get(sid, []):
            key = os.path.realpath(entry[3])
            if key in seen:
                continue
            seen.add(key)
            uniq.append(entry)
        if not uniq:
            missing.append(sid)
        elif len(uniq) > 1:
            ambiguous.append((sid, uniq))
        else:
            picked.append(uniq[0])
    picked.sort()
    return picked, missing, ambiguous


def emit_error(json_out, code, message):
    """统一错误出口：--json 时 stdout 仍是一段可解析 JSON，其余走 stderr。"""
    if json_out:
        print(json.dumps({"error": message, "exit_code": code},
                         ensure_ascii=False, indent=2))
    print("错误：%s" % message, file=sys.stderr)
    return code


# ---------------------------------------------------------------------------
# 状态文件：跨进程锁 + 原子写 + 损坏保护
# ---------------------------------------------------------------------------

class LockTimeout(RuntimeError):
    """在 bounded acquire 上限内没拿到状态锁。"""


def state_file_path():
    """状态文件路径：WIKI_ARCHIVE_STATE_FILE 可覆盖（测试/多实例隔离）。"""
    override = (os.environ.get(STATE_FILE_ENV) or "").strip()
    if override:
        return os.path.abspath(os.path.expanduser(override))
    return STATE_FILE


def lock_file_path(state_path):
    """锁文件放在系统临时目录，避免在 wiki 仓库里落一个会被 autocommit 收走的文件。

    路径由状态文件绝对路径哈希决定，同一状态文件在所有进程里得到同一把锁。
    """
    digest = hashlib.sha1(
        os.path.abspath(state_path).encode("utf-8")).hexdigest()
    return os.path.join(tempfile.gettempdir(),
                        "wiki-archive-%s.lock" % digest)


def lock_timeout_seconds():
    raw = (os.environ.get(LOCK_TIMEOUT_ENV) or "").strip()
    if raw:
        try:
            value = float(raw)
            if value >= 0:
                return value
        except ValueError:
            pass
    return LOCK_TIMEOUT_DEFAULT


@contextlib.contextmanager
def state_lock(state_path, shared=False):
    """对状态文件加 fcntl flock（跨进程），带 bounded acquire。

    shared=True 用于只读场景（--list/--dry-run）；其余场景用排他锁把「读状态 →
    合并 → 写状态」整段串行化，避免并发运行互相覆盖。超时抛 LockTimeout。
    """
    lock_path = lock_file_path(state_path)
    try:
        os.makedirs(os.path.dirname(lock_path) or ".", exist_ok=True)
    except OSError:
        pass
    try:
        import fcntl
    except ImportError:  # 非 POSIX：退化为无锁，仍靠原子写兜底
        yield
        return
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o644)
    try:
        mode = fcntl.LOCK_SH if shared else fcntl.LOCK_EX
        timeout = lock_timeout_seconds()
        deadline = time.monotonic() + timeout
        while True:
            try:
                fcntl.flock(fd, mode | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise LockTimeout(
                        "获取状态锁超时（%.0f 秒）：%s；另一归档进程可能正在运行"
                        % (timeout, lock_path))
                time.sleep(LOCK_POLL_SECONDS)
        try:
            yield
        finally:
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass
    finally:
        os.close(fd)


def read_state(state_path):
    """读取状态文件，返回 (files_dict, error_message)。

    error_message 非 None 表示状态文件存在但损坏/版本不符：调用方必须拒绝覆盖并以
    非零退出。绝不能把坏状态当空状态重写——那会静默丢掉全部增量记忆。
    """
    if not os.path.exists(state_path):
        return {}, None
    try:
        with open(state_path, encoding="utf-8") as f:
            data = json.load(f)
    except (ValueError, OSError) as e:
        return None, "状态文件无法解析，拒绝覆盖：%s（%s）" % (state_path, e)
    if not isinstance(data, dict):
        return None, "状态文件结构非法（顶层不是对象），拒绝覆盖：%s" % state_path
    files = data.get("files", {})
    if not isinstance(files, dict):
        return None, "状态文件结构非法（files 不是对象），拒绝覆盖：%s" % state_path
    if data.get("version") != STATE_VERSION:
        return None, ("状态文件版本不受支持（version=%r，期望 %d），拒绝覆盖：%s"
                      % (data.get("version"), STATE_VERSION, state_path))
    return files, None


def write_state_atomic(state_path, files):
    """原子写状态：同目录唯一临时文件 + fsync + os.replace。"""
    directory = os.path.dirname(state_path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".archive-state.", suffix=".json.tmp",
                               dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"version": STATE_VERSION, "files": files},
                      f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        try:  # 沿用既有权限，避免 mkstemp 的 0600 改掉既有约定
            os.chmod(tmp, os.stat(state_path).st_mode & 0o777)
        except OSError:
            pass
        os.replace(tmp, state_path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_page_atomic(out_dir, out_path, body):
    """原子写归档页：目标目录内唯一临时文件 + fsync + os.replace。"""
    os.makedirs(out_dir, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="." + os.path.basename(out_path) + ".",
                               suffix=".tmp", dir=out_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(body)
            f.flush()
            os.fsync(f.fileno())
        try:
            os.chmod(tmp, 0o644)
        except OSError:
            pass
        os.replace(tmp, out_path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def archive_out_path(raw_root, host, tool, project, session):
    """一个会话的归档目标路径（列清单与写入共用，避免两处口径漂移）。

    project 是显示名（dsh 还原后可能含 `/`），这里统一过 safe_segment 压成
    单段目录名，所以 out_dir 永远只比 raw_root 深 host/tool/project 三层。
    """
    out_dir = os.path.join(raw_root, host, tool,
                           safe_segment(project) if project else "")
    return out_dir, os.path.join(out_dir, safe_segment(session) + ".md")


def run_archive(wiki_root, full=False, dry_run=False, session=None, sessions=None,
                tools=None, since=None, limit=None, list_only=False,
                json_out=False, exact_sessions=None, dsh_homes=None):
    """归档入口：先拿状态锁，再进入「读状态 → 合并 → 写状态」临界区。"""
    state_path = state_file_path()
    shared = bool(list_only or dry_run)
    try:
        with state_lock(state_path, shared=shared):
            return _run_archive_locked(
                state_path=state_path, wiki_root=wiki_root, full=full,
                dry_run=dry_run, session=session, sessions=sessions,
                tools=tools, since=since, limit=limit, list_only=list_only,
                json_out=json_out, exact_sessions=exact_sessions,
                dsh_homes=dsh_homes)
    except LockTimeout as e:
        return emit_error(json_out, 4, str(e))


def _run_archive_locked(state_path, wiki_root, full, dry_run, session, sessions,
                        tools, since, limit, list_only, json_out,
                        exact_sessions, dsh_homes):
    raw_root = os.path.join(wiki_root, "raw", "sessions")
    host = resolve_host()
    home = os.path.expanduser("~")
    exact_mode = exact_sessions is not None

    # --json 的约定是 stdout 只输出 JSON：人类可读的进度改走 stderr，
    # 否则 `... --json | python -m json.tool` 这类消费方式会被进度行打断。
    def say(message):
        print(message, file=sys.stderr if json_out else sys.stdout)

    fragments = []
    for value in (sessions or []):
        fragments.extend(x for x in re.split(r"[,\s]+", value) if x)
    if session:
        fragments.extend(x for x in re.split(r"[,\s]+", session) if x)

    exact_ids = []
    if exact_mode:
        for value in exact_sessions:
            for token in re.split(r"[,\s]+", value or ""):
                if token and token not in exact_ids:
                    exact_ids.append(token)
        if not exact_ids:
            return emit_error(
                json_out, 2,
                "--exact-session 未给出会话 ID（空列表不会退化为全量扫描）")
        conflict = None
        if fragments:
            conflict = "--session/--sessions"
        elif since:
            conflict = "--since"
        elif limit is not None:
            conflict = "--limit"
        if conflict:
            return emit_error(
                json_out, 2,
                "--exact-session 不能与 %s 同时使用：精确请求必须整体命中，"
                "不做静默部分选择" % conflict)

    try:
        since_ts = parse_since(since)
    except ValueError as e:
        return emit_error(
            json_out, 2,
            "--since 需要 YYYY-MM-DD 或 YYYY-MM-DDTHH:MM，收到：%s" % e)

    # 状态始终在锁内读取：--full 只决定「是否跳过未变化会话」，不再决定合并基底，
    # 否则 `--full --sessions X` 会把其余会话的增量记录一并清掉。损坏/版本不符时
    # 拒绝运行，绝不覆盖。
    state, state_error = read_state(state_path)
    if state_error:
        return emit_error(json_out, 5, state_error)

    # tools 一并下传：`--tool dsh` 这类调用不再去 walk 其它工具的目录树。
    identities, discovery_warnings = {}, []
    sources = discover_sources(dsh_homes=dsh_homes, tools=tools,
                               identities=identities, warnings=discovery_warnings)
    emit_kimi_warnings(discovery_warnings, exact_ids if exact_mode else None)

    if exact_mode:
        candidates = [s for s in sources if not tools or s[0] in tools]
        picked, missing, ambiguous = select_exact(candidates, exact_ids)
        if missing or ambiguous:
            problems = []
            if missing:
                problems.append("未找到精确会话 ID：%s" % ", ".join(missing))
            for sid, hits in ambiguous:
                problems.append(
                    "精确会话 ID 歧义，拒绝覆盖（%d 个来源）：%s → %s"
                    % (len(hits), sid, " | ".join(h[3] for h in hits)))
            return emit_error(json_out, 3, "；".join(problems))
        partial = True
    else:
        picked, partial = select_sources(sources, fragments, tools, since_ts,
                                         limit)
        if fragments and not picked:
            return emit_error(json_out, 3,
                              "未找到匹配会话：%s" % ", ".join(fragments))

    if list_only:
        print("%-7s %-30s %-44s %-16s %s"
              % ("TOOL", "PROJECT", "SESSION", "MTIME", "STATUS"))
        for tool, project, session_id, src in picked:
            try:
                st = os.stat(src)
            except OSError:
                continue
            rel = os.path.relpath(src, home)
            _, out_path = archive_out_path(raw_root, host, tool, project,
                                           session_id)
            sig = {"mtime_ns": st.st_mtime_ns, "size": st.st_size}
            if identities.get(src):
                sig["identity"] = identities[src]
            if not os.path.exists(out_path):
                status = "new"
            elif state.get(rel) == sig:
                status = "up-to-date"
            else:
                status = "changed"
            print("%-7s %-30s %-44s %-16s %s"
                  % (tool, (project or "-")[:30], session_id,
                     datetime.fromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%M"),
                     status))
        print("共 %d 个会话（%s）"
              % (len(picked), "部分选择" if partial else "全量"))
        return 0

    valid_state = {}      # 只有真正成功（已归档或确认未变化）的条目才进状态
    invalid_rels = set()  # failed/empty：不得记成已归档，并清掉旧记录以便重试
    results = []          # 唯一的计数事实来源：计数一律由 results 逐行重算
    state_error = False   # 状态写盘失败：非零退出，但不伪装成一条 failed 行
    status_error = None

    for tool, project, session_id, src in picked:
        rel = os.path.relpath(src, home)
        out_dir, out_path = archive_out_path(raw_root, host, tool, project,
                                             session_id)
        identity = identities.get(src, {})
        # project 是显示名（dsh 会把目录名的 `-` 还原成 `/`，有损、不可反解）；
        # project_dir 是实际落盘的目录段，page 是完整磁盘路径——拼路径一律用后两者。
        row = {"tool": tool, "project": project,
               "project_dir": safe_segment(project) if project else "",
               "session": session_id,
               "source": rel, "page": os.path.relpath(out_path, wiki_root),
               **identity}
        try:
            if tool == "kimi" and not kimi_safe_path(src, home):
                raise OSError("Kimi 来源路径不安全")
            st = os.stat(src)
        except OSError as e:
            invalid_rels.add(rel)
            results.append({**row, "action": "failed", "error": str(e)})
            print("失败 %s：%s" % (rel, e), file=sys.stderr)
            continue
        sig = {"mtime_ns": st.st_mtime_ns, "size": st.st_size}
        if identity:
            sig["identity"] = identity

        if not full and state.get(rel) == sig and os.path.exists(out_path):
            valid_state[rel] = sig
            results.append({**row, "action": "skipped"})
            continue

        if dry_run:
            say("[dry-run] 将归档 %s → %s" % (rel, row["page"]))
            results.append({**row, "action": "would-archive"})
            continue

        try:
            entries = load_src(tool, src)
            if tool == "stepcode":
                actual_id, actual_project = stepcode_header(entries[0] if entries else None, src)
                if (actual_id, actual_project) != (session_id, project):
                    raise ValueError("StepCode 会话身份在发现后发生变化")
            turns = RENDERERS[tool](entries)
            turns = [(role, ts, redact_credentials(text)) for role, ts, text in turns]
        except Exception as e:  # 损坏/不可读的源：算失败，绝不记成功
            invalid_rels.add(rel)
            results.append({**row, "action": "failed", "error": str(e)})
            print("失败 %s：%s" % (rel, e), file=sys.stderr)
            continue
        if not turns:
            # 真·空会话只计 empty；精确点名为空由 exact+empty 组合表达非零退出。
            invalid_rels.add(rel)
            results.append({**row, "action": "empty"})
            continue
        try:
            write_page_atomic(out_dir, out_path,
                              render_markdown(tool, project, session_id, rel,
                                              turns, identity))
        except Exception as e:
            invalid_rels.add(rel)
            results.append({**row, "action": "failed", "error": str(e)})
            print("失败 %s：%s" % (rel, e), file=sys.stderr)
            continue
        valid_state[rel] = sig
        results.append({**row, "action": "archived", "turns": len(turns)})
        say("归档 %s/%s/%s（%d 条）"
            % (tool, project or "-", session_id, len(turns)))

    # 计数由 results 逐行重算：每个 action 恰好落进一个计数器，摘要与行天然自洽。
    counts = {"archived": 0, "skipped": 0, "empty": 0, "failed": 0,
              "would_archive": 0}
    for row in results:
        key = ACTION_COUNTERS.get(row.get("action"))
        if key:
            counts[key] += 1
    archived = counts["archived"]
    skipped = counts["skipped"]
    empty = counts["empty"]
    failed = counts["failed"]

    # 状态合并：部分选择时以既有记录为基底，只覆盖本次成功访问到的会话，否则按
    # 本次全量发现重算（顺带清掉源文件已消失的条目）。failed/empty 的条目显式剔除，
    # 保证它们下次会被重试，而不是被当成已成功归档。
    merged = dict(state) if partial else {}
    merged.update(valid_state)
    for rel in invalid_rels:
        merged.pop(rel, None)
    for rel in list(merged):
        if not os.path.exists(os.path.join(home, rel)):
            del merged[rel]

    if not dry_run and merged != state:
        try:
            write_state_atomic(state_path, merged)
        except Exception as e:
            # 状态没落盘 = 本次的增量记忆丢失：必须非零退出。但它不是一条
            # 会话归档失败，不能凭空 +failed（那样计数就与 results 行对不上）；
            # 改用独立的 state_error / status_error 标记，且 write_state_atomic
            # 的临时文件 + os.replace 语义保证原状态文件保持不变。
            state_error = True
            status_error = "STATE_WRITE_FAILED"
            print("警告：状态文件写入失败（原状态文件保持不变）：%s" % e,
                  file=sys.stderr)

    # 退出码契约：1 = 有 failed 行，或精确点名的会话渲染为空（exact+empty），
    # 或状态写盘失败；0 = 其余全部成功（archived/skipped/would-archive）。
    exit_code = 1 if (failed or state_error or (exact_mode and empty)) else 0
    summary = {"archived": archived, "skipped": skipped, "empty": empty,
               "failed": failed, "would_archive": counts["would_archive"],
               "selected": len(picked),
               "partial": partial, "state_entries": len(merged),
               "state_error": state_error, "status_error": status_error,
               "dry_run": dry_run, "exact": exact_mode,
               "exit_code": exit_code, "results": results}
    if json_out:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    else:
        if dry_run:
            print("完成（dry-run）：将归档 %d，跳过（未变化）%d，空会话 %d，失败 %d%s"
                  % (counts["would_archive"], skipped, empty, failed,
                     "；状态写盘失败" if state_error else ""))
        else:
            print("完成：归档 %d，跳过（未变化）%d，空会话 %d，失败 %d；"
                  "状态记录 %d 条（%s）%s"
                  % (archived, skipped, empty, failed, len(merged),
                     "部分选择·已合并" if partial else "全量·已重算",
                     "；状态写盘失败" if state_error else ""))
    return exit_code


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="把本机 agent 会话原文归档进 ~/wiki/raw/sessions/")
    parser.add_argument("--full", action="store_true", help="全部重渲染，无视状态文件")
    parser.add_argument("--dry-run", action="store_true", help="只列出将归档的会话，不写盘")
    parser.add_argument("--wiki-root", default="~/wiki", help="知识库根目录，默认 ~/wiki")
    parser.add_argument("--session", default=None,
                        help="只归档 session id（或其唯一片段）匹配的会话")
    # ---- 批量选择：这些开关都构成「部分选择」，状态文件会与既有记录合并 ----
    parser.add_argument("--sessions", action="append", default=None,
                        metavar="ID[,ID…]",
                        help="批量归档多个会话，逗号或空格分隔，可重复")
    parser.add_argument("--exact-session", dest="exact_session",
                        action="append", default=None, metavar="ID",
                        help="按完整会话 ID 精确归档（可重复；不做片段匹配，"
                             "全部 ID 必须命中且无歧义，否则整体失败不写盘）")
    parser.add_argument("--dsh-home", dest="dsh_home", default=None, metavar="DIR",
                        help="只扫描该 DSH home（绝对路径或 ~ 开头）；默认同时"
                             "扫描 ~/.dsh 与 ~/.dsh-dev")
    parser.add_argument("--tool", action="append", default=None,
                        metavar="NAME",
                        help="限定工具（dsh/claude/codex/kimi/zcode/pi/omp/stepcode），可重复")
    parser.add_argument("--since", default=None, metavar="YYYY-MM-DD[THH:MM]",
                        help="只归档源文件修改时间不早于该时刻的会话")
    parser.add_argument("--limit", type=int, default=None, metavar="N",
                        help="最多归档 N 个会话（按修改时间从新到旧取）")
    parser.add_argument("--list", dest="list_only", action="store_true",
                        help="只列出候选会话及其归档状态，不写盘")
    parser.add_argument("--json", dest="json_out", action="store_true",
                        help="以 JSON 输出结果摘要（供脚本消费）")
    args = parser.parse_args(argv)

    wiki_root = os.path.abspath(os.path.expanduser(args.wiki_root))
    if not os.path.isdir(wiki_root):
        return emit_error(args.json_out, 2, "库根目录不存在：%s" % wiki_root)
    if args.limit is not None and args.limit < 0:
        return emit_error(args.json_out, 2, "--limit 不能为负数")

    dsh_homes = None
    if args.dsh_home is not None:
        expanded = os.path.expanduser(args.dsh_home)
        if not os.path.isabs(expanded):
            return emit_error(
                args.json_out, 2,
                "--dsh-home 必须是绝对路径（可用 ~ 开头）：%s" % args.dsh_home)
        dsh_homes = [os.path.abspath(expanded)]
        if not os.path.isdir(dsh_homes[0]):
            return emit_error(args.json_out, 2,
                              "--dsh-home 目录不存在：%s" % dsh_homes[0])

    return run_archive(wiki_root, full=args.full, dry_run=args.dry_run,
                       session=args.session, sessions=args.sessions,
                       tools=args.tool, since=args.since, limit=args.limit,
                       list_only=args.list_only, json_out=args.json_out,
                       exact_sessions=args.exact_session, dsh_homes=dsh_homes)


def _serve_ondemand_after_run(argv, exit_code):
    """归档跑完后代为处理受限沙箱会话放入 /tmp 的单会话提炼请求。

    背景与协议见 scripts/wiki_ondemand_job.py：DSH 等 Agent 的 workspace-write
    沙箱只允许写“工作区 + 临时目录”，工作区不是 ~/wiki 时无法直接跑 wiki 脚本；
    会话侧把请求写进 /tmp/wiki-ondemand 并用 launchctl kickstart 触发本作业，
    本作业（在沙箱外）在例行增量归档结束后认领并执行这些请求，结果写回 /tmp。

    只在“完整且成功的运行”里执行：--dry-run / --list / --json 属于预览或机读
    调用，不碰队列；归档本身失败（exit_code != 0）时也不碰——失败通常说明当前
    进程同样写不了 wiki，代跑只会制造假失败结果。队列目录不存在或无请求时零开销；
    任何队列异常都不影响归档本身的退出码。
    """
    if os.environ.get("WIKI_ONDEMAND_DISABLE"):
        return
    if exit_code != 0:
        return
    if any(flag in argv for flag in ("--dry-run", "--list", "--json")):
        return
    queue_dir = os.environ.get("WIKI_ONDEMAND_DIR") or "/tmp/wiki-ondemand"
    try:
        if not glob.glob(os.path.join(queue_dir, "synth-*.json")):
            return
        here = os.path.dirname(os.path.abspath(__file__))
        if here not in sys.path:
            sys.path.insert(0, here)
        import wiki_ondemand_job
        wiki_ondemand_job.serve_pending(wiki_ondemand_job.wiki_root_from_argv(argv))
    except Exception as exc:  # 队列只是附加能力，绝不拖垮归档主流程
        print("[ondemand] 跳过：%r" % (exc,), file=sys.stderr, flush=True)


if __name__ == "__main__":
    _exit_code = 0
    try:
        _exit_code = main()
    finally:
        _serve_ondemand_after_run(sys.argv[1:], _exit_code)
    sys.exit(_exit_code)
