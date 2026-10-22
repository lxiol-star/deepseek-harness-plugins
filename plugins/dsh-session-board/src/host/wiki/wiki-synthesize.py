#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""wiki-synthesize.py — 把 ~/wiki/raw/sessions/**/*.md 原始会话提炼为知识层页面。

设计依据 WikiBar/docs/superpowers/specs/2026-06-25-wikibar-auto-synthesize-design.md，
简化为纯 Python 标准库单文件实现（不依赖 archiver/ts/claude CLI）：

- 状态文件 scripts/.synthesize-state.json：relpath → {sha256, status, reason, date}
  内容未变且已有最终结论 → 跳过；内容变了 → 重新提炼；
  相同 sha256 的不同文件直接复用首次结论（内容签名去重，不调 API）。
- 运行期状态（单实例锁 / 让位请求 / 批次冷却）在 <wiki-root>/.locks/ 下，位于 wiki
  根目录内：受限沙箱会话（只放行工作区 + 临时目录写入）因此无需申请工作区外权限。
- 提炼支持 OpenAI Chat Completions 与 Anthropic Messages 两种协议，
  配置读 ~/.wikibar/config.json；provider 的 ``apiType`` 决定端点与 SSE 解析。
- AI 输出二选一：单行 SKIP，或 1-3 个带 `file:` frontmatter 的知识页。
- 只许写 10 个知识层目录；写 notes/raw、非 kebab-case slug 一律拒绝该页。
- wikilink 死链治理（双层）：prompt 侧注入真实存在的候选 slug 白名单，
  落盘侧对白名单外的 [[链接]] 强制降级为纯文本；剩余出链不足 2 条时
  追加「待补充」标记，由 wiki-lint 的 review_flags 兜住交人工复核。

注意：日志/输出绝不打印 API key。
"""

import argparse
import base64
import datetime
import fcntl
import hashlib
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import date

# 知识层 10 个目录（与 SCHEMA.md 一一对应）；notes/raw 一律拒绝写入
KNOWLEDGE_DIRS = {
    "projects", "concepts", "experience", "patterns", "issues",
    "tools", "entities", "digests", "comparisons", "decisions",
}

# SCHEMA 的 type 枚举（单数）→ 知识层目录（复数）归一化表；
# validate_file_field 用它容纳模型按 type 写出的 file 目录。
SINGULAR_TO_DIR = {
    "project": "projects", "concept": "concepts", "pattern": "patterns",
    "issue": "issues", "tool": "tools", "entity": "entities",
    "digest": "digests", "comparison": "comparisons", "decision": "decisions",
    "skill": "concepts",  # SCHEMA：skill 落 concepts/
    "experience": "experience",  # 同名单复数，显式列出便于查阅
}

# kebab-case slug：小写字母/数字，单词间单连字符
KEBAB_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# 非最终结论：下次运行（内容未变也）允许重试
RETRYABLE_REASONS = {"api-error", "parse-error"}

# 单会话 API 调用总时长上限（秒）。API_TIMEOUT 只管单次 socket read，挡不住
# 「持续吐字节但迟迟不结束」的慢流；这个上限才是长尾的封顶。可用
# --session-timeout 覆盖。实测常态会话 6–40s（含 219KB/183KB 的大会话），
# 故 240s 对正常流量有充足余量。
SESSION_DEADLINE = 240


class StreamDeadlineError(Exception):
    """单会话流式读取超过总时长上限（可重试）。"""

# 429/5xx 指数退避：最多重试 3 次，间隔 10s→30s→90s
# （网关 504 多为上游短时过载，1s/2s/4s 的短退避会连续打满失败）
RETRY_DELAYS = [10, 30, 90]

API_TIMEOUT = 120  # 秒

# 超长会话处理（2026-08-23 加固，起因见 experience/wiki-synthesize-long-session-model-override）：
# 1.5MB 的 ZCode 会话让 deepseek-v4-flash 把归档原文当对话续写（输出"继续。
# 当前是 ZCode 会话…"），0 页解析记 parse-error；同一会话换 gpt-5.6-sol 一次
# 成功。故超过阈值的会话优先换 provider 配置的 longContextModel（
# ~/.wikibar/config.json 的 customDirectProviders[].longContextModel），未配置
# 则截断到 MAX_SESSION_CHARS（头 60% + 尾 40% —— 会话开头是背景/结尾是结论，
# 中段多为重复的工具输出）。
LONG_CONTEXT_THRESHOLD = 600_000  # 字符，超过即触发 longContextModel / 截断
MAX_SESSION_CHARS = 600_000       # 无 longContextModel 时的截断上限

TYPE_TO_DIR = {
    "project": "projects", "concept": "concepts", "experience": "experience",
    "pattern": "patterns", "issue": "issues", "tool": "tools",
    "entity": "entities", "digest": "digests", "comparison": "comparisons",
    "decision": "decisions", "skill": "concepts",
}

SYSTEM_PROMPT = """\
你是一个本地 Markdown 知识库的提炼助手。用户会给你一段 AI 会话归档原文，请你判断它是否有沉淀为知识的价值。

知识库有 10 个知识层目录，type 与目录一一对应：
- project → projects/：具体项目的部署、架构与运维记录
- concept → concepts/：技术概念、原理与领域知识
- experience → experience/：绑定具体上下文的实践与踩坑复盘
- pattern → patterns/：抽象出的可复用模式与最佳实践
- issue → issues/：未解决、跟踪中的故障与已知问题
- tool → tools/：某工具的使用/配置记录
- entity → entities/：产品/服务/系统等被讨论对象的实体卡片
- digest → digests/：外部文章/视频等的精读摘要
- comparison → comparisons/：方案横向对比与技术选型分析
- decision → decisions/：已拍板的技术决策记录（ADR）

你必须二选一输出，不要输出任何其他解释文字：

【选项一】如果会话是闲聊、纯执行操作、或无沉淀价值，只输出单行：
SKIP

【选项二】输出 1-3 个知识页，每页格式严格如下（页与页之间空行分隔）：
---
file: <目录>/<kebab-case-slug>.md
title: 页面标题
type: <上述 type 之一>
tags: [英文小写, kebab-case, 2到5个]
sources: [<会话相对路径>]
---

# 页面标题

正文……

要求：
1. file 的第一段目录必须是 10 个知识层目录之一，禁止写 notes/ 或 raw/；slug 必须 kebab-case。
2. tags 必须写成 flow 形式 `tags: [a, b]`，不要逐行 `- a`。
3. 正文按对应 type 的骨架组织（如 experience：背景/环境 → 经过 → 结论与修法 → 相关页面）。
4. 正文必须包含至少 2 条真实相关的 [[wikilink]] 出链（格式 [[slug]] 或 [[slug|别名]]，禁止目录前缀）。
   出链目标只能取自 user 消息里的「可链接页面白名单」，或本轮你同时新建的其他页面 slug。
   白名单里没有贴切的就宁可只链 2 条，禁止凭空编造 slug —— 编造的链接会被脚本自动剔除并标记待人工复核。
5. 引用会话中的关键要点，但不得照抄密钥、token 等敏感信息。
"""

# wikilink 目标：[[slug]] 或 [[slug|别名]]
WIKILINK_RE = re.compile(r"\[\[([^\[\]]+)\]\]")

# 候选白名单注入上限：全库 slug 数千条，全量注入会挤占会话正文的 token 预算
LINK_CANDIDATE_LIMIT = 80

# slug 词元切分（用于候选相关度打分）
TOKEN_RE = re.compile(r"[a-z0-9]+")


# ------------------------------------------------------------ wikilink 治理

def norm_slug(value):
    """slug 归一化：大小写不敏感，空格等价于连字符（与 SCHEMA wikilink 规则一致）。"""
    return re.sub(r"\s+", "-", str(value).strip().lower())


def collect_existing_slugs(wiki_root):
    """wikilink 可解析的目标集合 = 根目录顶层页 + 10 个知识层目录页 + 目录名自身。

    与 SCHEMA「解析范围」对齐：notes/、raw/ 下的页面解析不到，故不收录。
    """
    slugs = set(KNOWLEDGE_DIRS)
    for directory in [""] + sorted(KNOWLEDGE_DIRS):
        try:
            names = os.listdir(os.path.join(wiki_root, directory))
        except OSError:
            continue
        for name in names:
            if name.endswith(".md"):
                slugs.add(norm_slug(name[:-3]))
    return slugs


def suggest_link_candidates(session_text, existing_slugs,
                            limit=LINK_CANDIDATE_LIMIT):
    """按 slug 词元与会话原文的重叠度排序，挑出最可能相关的候选 slug。

    目的是给模型一份真实存在的可链接清单：不给清单它只会照语义编造 slug，
    而全量注入几千条又太贵，故按命中率取 top N。
    """
    tokens = set(TOKEN_RE.findall(session_text.lower()))
    scored = []
    for slug in existing_slugs:
        parts = [p for p in slug.split("-") if len(p) > 2]
        if not parts:
            continue
        hit = sum(1 for p in parts if p in tokens)
        if hit == 0:
            continue
        # 命中率优先，避免词多的长 slug 单靠基数取胜；同分时命中数多者在前
        scored.append((hit / len(parts), hit, slug))
    scored.sort(key=lambda x: (-x[0], -x[1], x[2]))
    return [slug for _rate, _hit, slug in scored[:limit]]


def sanitize_wikilinks(body, valid_slugs, own_slug=None, own_dir=None):
    """剔除指向不存在页面的 wikilink，返回 (正文, 被降级的 slug 列表, 有效出链数)。

    模型倾向于编造看似合理的 slug（[[gitlab-rest-api]] 之类），死链会污染全库
    （lint 的 missing_pages 大头即来自此）。白名单外的链接保留显示文字、去掉
    链接语法。代码块与行内 code 里的 [[slug]] 属语法示例，原样跳过。
    有效出链数按目标去重，并排除自链与指向本目录 index 的链接（与 lint 口径一致）。
    """
    dropped = []
    kept = set()
    excluded = {norm_slug(x) for x in (own_slug, own_dir) if x}

    def fix_segment(segment):
        def repl(m):
            slug, _sep, alias = m.group(1).partition("|")
            key = norm_slug(slug)
            if key in valid_slugs:
                if key not in excluded:
                    kept.add(key)
                return m.group(0)
            dropped.append(slug.strip())
            return (alias.strip() or slug.strip())
        return WIKILINK_RE.sub(repl, segment)

    out = []
    in_fence = False
    for line in body.split("\n"):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            out.append(line)
        elif in_fence:
            out.append(line)
        else:
            out.append("".join(
                part if part.startswith("`") else fix_segment(part)
                for part in re.split(r"(`[^`\n]*`)", line)))
    return "\n".join(out), dropped, len(kept)


# ---------------------------------------------------------------- 工具函数

def log(msg):
    """统一输出（绝不包含敏感信息）。"""
    print(msg, flush=True)


def sha256_text(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def today_str():
    return date.today().isoformat()


# ---------------------------------------------------------------- 状态文件

def load_state(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
    except (json.JSONDecodeError, OSError) as e:
        log(f"警告：状态文件损坏，按空状态继续：{e}")
    return {}


def save_state(path, state):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def is_final(entry):
    """状态条目是否为最终结论（api-error/parse-error 允许重跑）。"""
    return (
        isinstance(entry, dict)
        and entry.get("status") in ("synthesized", "skipped")
        and entry.get("reason") not in RETRYABLE_REASONS
    )


# ---------------------------------------------------------------- 配置与密钥

def load_provider(config_path, provider_id):
    """读取 ~/.wikibar/config.json，返回选定 provider 的连接信息（不含 key）。"""
    if not os.path.exists(config_path):
        log(f"错误：配置文件不存在：{config_path}")
        log("请先在 WikiBar App 设置里配置自定义直连服务商（customDirectProviders）。")
        sys.exit(2)
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        log(f"错误：配置文件解析失败：{e}")
        sys.exit(2)

    providers = config.get("customDirectProviders") or []
    if not providers:
        log("错误：配置中没有 customDirectProviders，请先在 App 设置里配置服务商。")
        sys.exit(2)

    if provider_id:
        provider = next((p for p in providers if p.get("id") == provider_id), None)
        if provider is None:
            ids = ", ".join(str(p.get("id")) for p in providers)
            log(f"错误：找不到 provider id={provider_id!r}，可用：{ids}")
            sys.exit(2)
    else:
        provider = providers[0]

    base_url = (provider.get("baseURL") or "").rstrip("/")
    if not base_url:
        log(f"错误：provider {provider.get('id')!r} 缺少 baseURL。")
        sys.exit(2)
    model = provider.get("defaultModel") or (provider.get("models") or [None])[0]
    if not model:
        log(f"错误：provider {provider.get('id')!r} 没有可用模型（defaultModel/models 均为空）。")
        sys.exit(2)

    api_key = None
    if provider.get("authMode", "bearer") != "none":
        api_key = resolve_key(provider, config.get("apiKeys") or {})
        if not api_key:
            log(f"错误：provider {provider.get('id')!r} 需要 API key，但 apiKeys 与 keyFile 均未提供。")
            log("请先在 App 设置里为该服务商配置 key。")
            sys.exit(2)

    api_type = str(provider.get("apiType") or provider.get("api_type") or "openai").strip().lower()
    if api_type not in {"openai", "anthropic"}:
        log(f"错误：provider {provider.get('id')!r} 的 apiType={api_type!r} 不受支持（仅 openai/anthropic）。")
        sys.exit(2)

    endpoint_suffix = "/messages" if api_type == "anthropic" else "/chat/completions"
    # baseURL 约定指向 /v1；也容忍用户把完整 endpoint 写进配置，避免重复拼接。
    if base_url.endswith(endpoint_suffix):
        endpoint = base_url
    else:
        endpoint = base_url + endpoint_suffix

    return {
        "id": provider.get("id"),
        "api_type": api_type,
        "endpoint": endpoint,
        "model": model,
        "long_context_model": provider.get("longContextModel"),
        "auth_mode": provider.get("authMode", "bearer"),
        "api_key": api_key,
        "extra_headers": provider.get("extraHeaders") or {},
    }


def resolve_key(provider, api_keys):
    """key 解析优先级：apiKeys（base64 decode，失败按明文兜底）> keyFile。"""
    pid = provider.get("id")
    raw = api_keys.get(pid)
    if raw:
        try:
            decoded = base64.b64decode(raw, validate=True).decode("utf-8").strip()
            if decoded:
                return decoded
        except Exception:
            pass  # decode 失败按明文兜底
        return raw.strip()
    key_file = provider.get("keyFile")
    if key_file:
        path = os.path.expanduser(key_file)
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read().strip()
        except OSError:
            return None
    return None


# ---------------------------------------------------------------- API 调用

def _text_from_content(value):
    """Extract text from either a string or provider content-block list."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for block in value:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "".join(parts)
    return ""


def _json_response_content(data, api_type):
    """Extract text from a non-stream response (some gateways ignore stream)."""
    if not isinstance(data, dict):
        return ""
    if api_type == "anthropic":
        return _text_from_content(data.get("content"))
    choices = data.get("choices") or []
    if choices and isinstance(choices[0], dict):
        choice = choices[0]
        message = choice.get("message") or {}
        return _text_from_content(message.get("content") or choice.get("text"))
    return ""


def read_sse_content(resp, api_type="openai", deadline=None):
    """Read either provider's SSE stream, or a JSON fallback response.

    OpenAI streams use ``choices[0].delta.content``; Anthropic streams use
    ``content_block_delta`` + ``delta.text``.  Empty output is considered a
    retryable parse error by the caller.

    ``deadline`` 是 ``time.monotonic()`` 口径的总时长截止点。socket 超时
    （``API_TIMEOUT``）只约束单次 read：网关每 120s 内吐任意字节（``:ping``、
    keepalive、慢速 reasoning token）就能把这个循环拖住数小时——2026-08-04
    那轮 55 个会话跑了 7h15m、单会话最长 3h15m 即由此而来。故每收到一行都
    检查总时长，超时抛 StreamDeadlineError 交给重试阶梯。
    """
    content_type = (resp.headers.get("Content-Type") or "").lower()
    if "json" in content_type and "event-stream" not in content_type:
        raw = resp.read()
        try:
            content = _json_response_content(json.loads(raw.decode("utf-8", "replace")), api_type)
        except (json.JSONDecodeError, UnicodeDecodeError):
            content = ""
        if not content:
            raise ValueError("JSON 响应中未找到文本内容")
        return content

    parts = []
    for raw in resp:
        if deadline is not None and time.monotonic() > deadline:
            raise StreamDeadlineError(
                f"单会话流式读取超过 {SESSION_DEADLINE}s 总时长上限，中断本次尝试")
        line = raw.decode("utf-8", "replace").strip()
        if not line.startswith("data:"):
            continue
        data = line[len("data:"):].strip()
        if data == "[DONE]":
            break
        try:
            event = json.loads(data)
        except json.JSONDecodeError:
            continue  # 忽略无法解析的分片（如 ping/注释）
        if api_type == "anthropic":
            event_type = event.get("type")
            delta = event.get("delta") or {}
            if event_type == "content_block_delta":
                piece = delta.get("text") or ""
            elif event_type == "message_start":
                piece = _text_from_content((event.get("message") or {}).get("content"))
            else:
                piece = ""
        else:
            try:
                delta = event["choices"][0].get("delta") or {}
            except (KeyError, IndexError, TypeError):
                delta = {}
            piece = _text_from_content(delta.get("content") or event.get("text"))
        if piece:
            parts.append(piece)
    content = "".join(parts)
    if not content:
        raise ValueError("SSE 流结束但未收到任何内容")
    return content


def truncate_session_text(text, limit=MAX_SESSION_CHARS):
    """超长会话截断：头 60% + 截断标记 + 尾 40%。

    会话开头是背景与任务定义、结尾是结论与验证，中段多为大量重复的
    工具调用输出，头尾保留对提炼损失最小。
    """
    head = int(limit * 0.6)
    tail = limit - head
    marker = "\n\n……（中间内容过长已截断，仅保留会话开头与结尾）……\n\n"
    return text[:head] + marker + text[-tail:]


def call_chat(provider, session_rel, session_text, mock_content,
              link_candidates=None):
    """调用选定 provider；mock_content 非 None 时直接返回（无 key 测试用）。"""
    if mock_content is not None:
        return mock_content

    # 超长会话：优先换 longContextModel；未配置则截断兜底。
    # （候选白名单仍按原文全文打分，不受截断影响。）
    model = provider["model"]
    if len(session_text) > LONG_CONTEXT_THRESHOLD:
        if provider.get("long_context_model"):
            model = provider["long_context_model"]
            log(f"  会话 {len(session_text)} 字符超 {LONG_CONTEXT_THRESHOLD}，"
                f"改用 longContextModel={model}")
        else:
            session_text = truncate_session_text(session_text)
            log(f"  会话 {len(session_text)} 字符超 {LONG_CONTEXT_THRESHOLD} 且未配 "
                f"longContextModel，已截断至 {MAX_SESSION_CHARS}（头尾保留）")

    whitelist = ""
    if link_candidates:
        whitelist = (
            "可链接页面白名单（库中真实存在的 slug，wikilink 只能从这里选，"
            "或链接你本轮同时新建的页面）：\n"
            + "、".join(link_candidates) + "\n\n"
        )
    user_prompt = (
        f"会话相对路径：{session_rel}\n\n"
        f"{whitelist}"
        f"以下是会话归档原文全文：\n\n{session_text}\n\n"
        f"——会话归档原文到此结束——\n"
        f"现在严格按 system 指令作答：无沉淀价值则只输出一行 SKIP；"
        f"否则输出 1-3 个知识页（每页以 --- frontmatter 开头）。"
        f"禁止续写、复述或摘录上面的会话原文。"
    )
    if provider["api_type"] == "anthropic":
        payload = {
            "model": model,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_prompt}],
            "max_tokens": 8192,
            "stream": True,
        }
    else:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": 8192,
            # 流式：提炼输出较长时非流式必然超过网关 60s 超时（HTTP 504）；
            # 实测同一会话非流式 60.1s 504，流式 133.2s 正常完成
            "stream": True,
        }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    last_err = None
    for attempt in range(len(RETRY_DELAYS) + 1):
        headers = {"Content-Type": "application/json"}
        headers.update(provider["extra_headers"])
        if provider["auth_mode"] != "none" and provider["api_key"]:
            # Anthropic 标准头是 x-api-key；StepCode 网关也接受 Bearer，
            # 两者同时带上可兼容旧网关而不把 key 写入日志。
            if provider["api_type"] == "anthropic":
                headers["x-api-key"] = provider["api_key"]
                headers["anthropic-version"] = "2023-06-01"
            headers["Authorization"] = "Bearer " + provider["api_key"]
        req = urllib.request.Request(provider["endpoint"], data=body, headers=headers)
        try:
            # 每次尝试独立计时：deadline 只封顶单次尝试，不吃掉重试预算
            deadline = time.monotonic() + SESSION_DEADLINE
            with urllib.request.urlopen(req, timeout=API_TIMEOUT) as resp:
                return read_sse_content(resp, provider["api_type"], deadline=deadline)
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
            retryable = e.code == 429 or e.code >= 500
            # 必须读取响应体避免连接泄漏。响应体可能回显请求内容，故只摘取
            # error 对象里的短字段（code/type/message），且 message 截断；
            # 非 JSON 响应一律不打印，避免把网关返回的 HTML 或回显正文写进日志。
            detail = ""
            try:
                raw_err = e.read().decode("utf-8", "replace")
            except Exception:
                raw_err = ""
            if raw_err:
                try:
                    err_obj = json.loads(raw_err).get("error") or {}
                    if isinstance(err_obj, dict):
                        parts = [str(err_obj[k])[:200] for k in ("code", "type", "message")
                                 if err_obj.get(k)]
                        if parts:
                            detail = "｜".join(parts)
                except (json.JSONDecodeError, AttributeError, TypeError):
                    detail = ""
            if detail:
                last_err = f"HTTP {e.code}（{detail}）"
            if not retryable:
                raise RuntimeError(f"API 返回不可重试错误：{last_err}")
        except (urllib.error.URLError, TimeoutError, OSError, ValueError,
                StreamDeadlineError) as e:
            last_err = str(e)
        if attempt < len(RETRY_DELAYS):
            delay = RETRY_DELAYS[attempt]
            log(f"  API 调用失败（{last_err}），{delay}s 后第 {attempt + 1} 次重试…")
            time.sleep(delay)
    raise RuntimeError(f"API 调用多次重试仍失败：{last_err}")


# ---------------------------------------------------------------- 输出解析

def parse_flow_or_block_list(value, block_items):
    """把 frontmatter 字段值解析成列表：优先 flow [a, b]，其次块列表。"""
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [x.strip().strip("'\"") for x in inner.split(",") if x.strip()]
    if block_items:
        return [x.strip().strip("'\"") for x in block_items if x.strip()]
    if value:
        return [value.strip().strip("'\"")]
    return []


def parse_frontmatter_block(fm_lines):
    """极简 YAML 子集解析：key: value、flow 列表、块列表。返回 dict（list/str）。"""
    result = {}
    i = 0
    while i < len(fm_lines):
        line = fm_lines[i]
        m = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if not m:
            i += 1
            continue
        key, value = m.group(1), m.group(2).strip()
        block_items = []
        if not value:
            j = i + 1
            while j < len(fm_lines) and re.match(r"^\s*-\s+", fm_lines[j]):
                block_items.append(re.sub(r"^\s*-\s+", "", fm_lines[j]))
                j += 1
            if block_items:
                result[key] = parse_flow_or_block_list("", block_items)
                i = j
                continue
        if value.startswith("["):  # flow 列表直接解析成 list，避免序列化出双方括号
            result[key] = parse_flow_or_block_list(value, [])
        else:
            result[key] = value.strip("'\"")
        i += 1
    return result


def looks_like_page_frontmatter(lines, start):
    """从 lines[start]（应为 '---'）尝试解析一个含 file: 的 frontmatter 块。"""
    if start >= len(lines) or lines[start].strip() != "---":
        return None
    for end in range(start + 1, len(lines)):
        if lines[end].strip() == "---":
            fm = parse_frontmatter_block(lines[start + 1:end])
            if "file" in fm:
                return fm, end
            return None
    return None


def parse_pages(text):
    """把 AI 输出切分为 [(frontmatter dict, 正文 str), ...]；整体 SKIP 返回 'SKIP'。"""
    stripped = text.strip()
    # 去掉可能的代码围栏包裹
    fence = re.match(r"^```(?:markdown|md|yaml)?\s*\n(.*)\n```\s*$", stripped, re.S)
    if fence:
        stripped = fence.group(1).strip()
    if stripped == "SKIP" or stripped.split("\n", 1)[0].strip().upper() == "SKIP":
        return "SKIP"

    lines = stripped.split("\n")
    pages = []
    i = 0
    while i < len(lines):
        found = looks_like_page_frontmatter(lines, i)
        if found is None:
            i += 1
            continue
        fm, fm_end = found
        # 正文直到下一个页面 frontmatter 或全文结束
        body_start = fm_end + 1
        body_end = len(lines)
        j = body_start
        while j < len(lines):
            if looks_like_page_frontmatter(lines, j):
                body_end = j
                break
            j += 1
        pages.append((fm, "\n".join(lines[body_start:body_end]).strip()))
        i = body_end
    return pages


def validate_file_field(file_value):
    """校验 file 字段：相对路径、无 ..、.md 后缀、首段目录在 10 个知识层目录内。
    返回 (目录, slug) 或 None。

    容纳单数形式（2026-08-19）：SCHEMA 的 type 枚举是单数（pattern/decision/…），
    知识层目录是复数（patterns/decisions/…）——模型照 type 写 `pattern/xxx.md`
    会被复数集合拒掉（真机踩过：pattern 页整页被弃）。这里把单数目录名归一化到
    对应复数目录，不依赖 prompt 提醒。"""
    if not isinstance(file_value, str):
        return None
    rel = file_value.strip()
    if not rel or rel.startswith("/") or "\\" in rel:
        return None
    parts = rel.split("/")
    if len(parts) != 2 or any(p in ("", ".", "..") for p in parts):
        return None
    directory, filename = parts
    if directory not in KNOWLEDGE_DIRS:  # notes/raw 及其他目录一律拒绝
        directory = SINGULAR_TO_DIR.get(directory)
        if directory is None:
            return None
    if not filename.endswith(".md"):
        return None
    slug = filename[:-3]
    if not KEBAB_RE.match(slug):
        return None
    return directory, slug


def serialize_frontmatter(fm):
    """把 frontmatter dict 序列化回去；列表一律写成 flow 形式。"""
    lines = []
    for key, value in fm.items():
        if isinstance(value, list):
            lines.append(f"{key}: [{', '.join(str(v) for v in value)}]")
        else:
            lines.append(f"{key}: {value}")
    return "\n".join(lines)


def find_slug_anywhere(wiki_root, slug, skip_dir=None):
    """在 10 个知识层目录里找 `<slug>.md`，返回首个命中的相对路径，无则 None。

    为什么要跨目录找：slug 必须**全库唯一**（SCHEMA「命名规则」；App 解析同名 slug
    先到先得，重名是 lint 的 error 级 duplicate_slugs）。而提炼是由模型选 type、
    type 再决定目录的——同一个会话两轮提炼若选了不同 type（如 decision → project），
    落点目录就不同，只看本目录的话两边都「不存在」，于是各写一份、直接制造 duplicate_slugs。

    实证：log.md 2026-08-06T11:50 记录已清理过 `codux-task-header-create-menu` 的
    decisions/projects 重复，08-07 的提炼又把 projects/ 那份造回来了——正是这个缺口。
    """
    for d in KNOWLEDGE_DIRS:
        if skip_dir and d == skip_dir:
            continue
        rel = os.path.join(d, slug + ".md")
        if os.path.exists(os.path.join(wiki_root, rel)):
            return rel
    return None


def existing_has_chat_archive(path):
    """读已存在文件的 frontmatter，判断 tags 是否含 chat-archive（保护 App 归档页可覆盖）。"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.read().split("\n")
    except OSError:
        return False
    if not lines or lines[0].strip() != "---":
        return False
    for end in range(1, len(lines)):
        if lines[end].strip() == "---":
            fm = parse_frontmatter_block(lines[1:end])
            tags = fm.get("tags")
            if isinstance(tags, list):
                return "chat-archive" in tags
            return isinstance(tags, str) and "chat-archive" in tags
    return False


# `raw/sessions/<host>/…` 里的主机目录名会随换机、改用户名或 hostname 变化。历史上
# 同一台设备可能先后出现多个目录名（真实主机名、其 `.local` 形式、`localhost` 等），
# 同一会话因此存在多份归档路径。
_SESSION_HOST_RE = re.compile(r"raw/sessions/[^/\s,\]]+/")


def canonicalize_session_refs(text):
    """把 `raw/sessions/<host>/…` 归一为 `raw/sessions/…` 后再比较来源身份。

    起因（盘查）：`existing_sources_include()` 原为原始字符串子串匹配，同一会话在
    `localhost/` 与真实主机名目录各有一份归档时匹配失败，被误判为「目标 slug 属别的
    会话」，于是写出 `slug-2.md`；库中的部分 `-N` 副本由此产生，且历次人工清理后
    都会随下一轮提炼反弹。归一后该路径不再随主机名漂移。
    """
    return _SESSION_HOST_RE.sub("raw/sessions/", text)


def existing_sources_include(path, session_rel):
    """已存在页的 frontmatter `sources` 是否已引用该 raw 会话。

    用于区分两种「目标 slug 已存在」：
      - 同一会话被重复提炼（sources 已含本会话）→ 应跳过，不该再造 slug-N 副本；
      - 不同会话恰好撞名 → 仍走 slug-N，两页内容确实不同。
    只做子串匹配：sources 既可能是 flow 列表也可能是多行，且路径唯一性足够。
    匹配前先做主机目录归一（见 canonicalize_session_refs），否则同一会话在不同
    主机目录下会被判成「别的会话」。
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            head = f.read(4096)
    except OSError:
        return False
    if not head.startswith("---"):
        return False
    end = head.find("\n---", 3)
    fm_text = head[:end] if end != -1 else head
    return (canonicalize_session_refs(session_rel)
            in canonicalize_session_refs(fm_text))


def pick_target_path(wiki_root, directory, slug, session_rel=None):
    """选定落盘路径，返回 (相对路径, 说明文案)；说明为 None 表示无需特别解释。

    规则：目标不存在 → 直接写；目标存在但含 chat-archive 标签 → 原地覆盖；
    目标存在且 sources 已含本会话 → **判为重复提炼，跳过**（返回 ("", 原因)）；
    目标存在且属别的会话 → 不覆盖，依次尝试 slug-2、slug-3…

    为什么要有「跳过」这一档：2026-08-07 盘查发现库里积了 36 个 slug-N 副本，
    30 组的 base 与 -N 指向**同一个** raw 会话，即同一批会话被重复处理了 2–3 轮，
    每轮都因「目标已存在」另存一份。这些副本 90% 内容重复、`-N` 一律 0 入链，
    却要人工逐对比对才能安全删除。返回 "" 与 None 区分开：""=有意跳过（不算失败），
    None=后缀耗尽（真失败）。
    """
    orig_rel = os.path.join(directory, slug + ".md")
    orig_abs = os.path.join(wiki_root, orig_rel)

    # 先做跨目录检查：slug 全库唯一，别的目录已占用时不能在本目录再写一份
    if not os.path.exists(orig_abs):
        other = find_slug_anywhere(wiki_root, slug, skip_dir=directory)
        if other:
            other_abs = os.path.join(wiki_root, other)
            if session_rel and existing_sources_include(other_abs, session_rel):
                return "", (f"slug `{slug}` 已被 {other} 占用且其 sources 含本会话"
                            f"（本轮 type 选了 {directory}，与上轮不同）→ 判为重复提炼，跳过")
            return "", (f"slug `{slug}` 已被 {other} 占用（属别的会话）。"
                        f"slug 须全库唯一，跳过以避免 duplicate_slugs；"
                        f"如确需新页请人工换 slug")
        return orig_rel, None

    if existing_has_chat_archive(orig_abs):
        return orig_rel, f"目标 {orig_rel} 已存在但含 chat-archive 标签，原地覆盖"
    if session_rel and existing_sources_include(orig_abs, session_rel):
        return "", (f"目标 {orig_rel} 的 sources 已含本会话，判为重复提炼 → 跳过"
                    f"（如需更新该页请人工编辑，或先删除它再重跑）")
    for n in range(2, 100):
        rel = os.path.join(directory, f"{slug}-{n}.md")
        candidate = os.path.join(wiki_root, rel)
        if os.path.exists(candidate):
            if existing_has_chat_archive(candidate):
                return rel, (f"目标 {orig_rel} 已存在且非 chat-archive 页，改写为 {rel}"
                             f"（该页含 chat-archive 标签，将覆盖）")
            continue
        # 候选后缀名也要全库唯一
        if find_slug_anywhere(wiki_root, f"{slug}-{n}", skip_dir=directory):
            continue
        return rel, f"目标 {orig_rel} 已存在且非 chat-archive 页，改写为 {rel}"
    return None, None


# ---------------------------------------------------------------- 主流程

def collect_sessions(wiki_root):
    """枚举 raw/sessions/**/*.md，返回相对路径（posix 风格）排序列表。"""
    base = os.path.join(wiki_root, "raw", "sessions")
    results = []
    if not os.path.isdir(base):
        return results
    for dirpath, _dirnames, filenames in os.walk(base):
        for name in filenames:
            if name.endswith(".md"):
                full = os.path.join(dirpath, name)
                rel = os.path.relpath(full, wiki_root).replace(os.sep, "/")
                results.append(rel)
    results.sort()
    return results


def process_page(wiki_root, fm, body, session_rel, dry_run, valid_slugs=None):
    """校验并写入单个知识页，返回 (是否成功, 说明)。

    valid_slugs 为 wikilink 白名单（现存全库 slug + 本轮同批新建 slug）；
    传入时会剔除白名单外的死链，剩余出链不足 2 条则打「待补充」标记交 lint 兜住。
    """
    file_value = fm.get("file")
    checked = validate_file_field(file_value)
    if checked is None:
        return False, f"file 字段非法（{file_value!r}）：必须形如 <知识层目录>/<kebab-case-slug>.md"
    directory, _slug = checked

    title = fm.get("title")
    ptype = fm.get("type")
    tags = fm.get("tags")
    if isinstance(tags, str):  # AI 写成了单个字符串，兜底转列表
        tags = [tags]
    if not title or not ptype or not tags:
        return False, "frontmatter 缺少 title/type/tags"
    if ptype not in TYPE_TO_DIR:  # 合法枚举：10 个知识层 type + skill（落 concepts/）
        return False, (f"type 非法（{ptype!r}）：必须是 "
                       + "/".join(TYPE_TO_DIR) + " 之一")
    if TYPE_TO_DIR[ptype] != directory:
        log(f"  警告：type={ptype} 与目录 {directory}/ 不一致，仍以 file 目录为准")
    if not isinstance(body, str) or not body.strip():
        return False, "正文为空"

    # 死链治理：白名单外的 wikilink 一律降级为纯文本
    if valid_slugs is not None:
        body, dropped, outlinks = sanitize_wikilinks(
            body, valid_slugs, own_slug=_slug, own_dir=directory)
        if dropped:
            uniq = sorted(set(dropped))
            log("  ⚠︎ 剔除 %d 条编造死链：%s%s"
                % (len(dropped), "、".join(uniq[:5]),
                   "…" if len(uniq) > 5 else ""))
        if outlinks < 2:
            # 「待补充」是 lint 的 review_flags 标记词，用它把缺链交给人工复核
            body = body.rstrip() + (
                "\n\n待补充：有效出链不足 2 条（SCHEMA 要求 ≥2），"
                "需人工补真实 wikilink。\n")

    # 补全缺失的约定字段
    fm_out = dict(fm)
    fm_out.pop("file", None)
    fm_out["tags"] = tags
    fm_out.setdefault("created", today_str())
    fm_out["updated"] = today_str()  # 新建/覆盖写入当天即为 updated
    fm_out.setdefault("confidence", "medium")
    fm_out.setdefault("sources", [session_rel])

    # sources 硬保障：只保留本库真实存在的相对路径。
    # 模型转写会话路径时可能掉字符、多字符或把 host/tool 写反（2026-10-05 盘查：
    # 14 处 error 级 contradiction_ref 全部是这类转写错误），写下去就是 lint 的
    # error 级问题。与 sanitize_wikilinks() 同理，这一层不依赖模型听话。
    srcs = fm_out.get("sources") or []
    if isinstance(srcs, str):
        srcs = [srcs]
    kept, dropped = [], []
    for s in srcs:
        s = str(s).strip()
        if not s or s in kept:
            continue
        if s.startswith("raw/") and not os.path.exists(os.path.join(wiki_root, s)):
            dropped.append(s)
            continue
        kept.append(s)
    if session_rel not in kept and os.path.exists(os.path.join(wiki_root, session_rel)):
        kept.insert(0, session_rel)
    fm_out["sources"] = kept or [session_rel]
    if dropped:
        log(f"  丢弃 {len(dropped)} 条不存在的 sources 条目：{dropped[:2]}")

    target_rel, target_note = pick_target_path(wiki_root, directory, _slug, session_rel)
    if target_rel is None:
        return False, "无法找到可用的 slug 后缀（-2…-99 均被占用）"
    if target_rel == "":
        # 同源重复提炼：不是失败，也不该造副本
        return True, target_note
    if target_note:
        log(f"  {target_note}")

    content = "---\n" + serialize_frontmatter(fm_out) + "\n---\n\n" + body.strip() + "\n"
    if dry_run:
        return True, f"[dry-run] 将写入 {target_rel}"
    target_abs = os.path.join(wiki_root, target_rel)
    os.makedirs(os.path.dirname(target_abs), exist_ok=True)
    with open(target_abs, "w", encoding="utf-8") as f:
        f.write(content)
    return True, f"已写入 {target_rel}"


# 运行期状态（单实例锁 / 让位请求 / 批次冷却）统一放在 <wiki-root>/.locks/ 下，由
# main() 按 --wiki-root 决策后赋值。历史上放在 ~ 会在受限沙箱会话（只放行“工作区 +
# 临时目录”的写入）里于拿锁阶段被拒绝，详见
# experience/wiki-synthesis-lock-outside-workspace.md。
DEFAULT_LOCK_ROOT = os.path.join(os.path.expanduser("~/wiki"), ".locks")
LOCK_PATH = os.path.join(DEFAULT_LOCK_ROOT, "wiki-synthesize.lock")
# 让位请求文件：交互式 --session 运行放下它，批处理在会话之间看到就释放锁等它走。
YIELD_PATH = os.path.join(DEFAULT_LOCK_ROOT, "wiki-synthesize.yield")
YIELD_WAIT_SECONDS = 900      # 交互式运行最多等锁多久
YIELD_HOLD_SECONDS = 1800     # 批处理为让位最多暂停多久（防让位文件残留卡死批处理）


def acquire_lock(wait_seconds=0):
    """单实例锁：flock 防并发写页/写 state。

    锁文件 <wiki-root>/.locks/wiki-synthesize.lock（跑 wiki 根内的写入权限即可，
    不再需要用户目录写权限）；仅 --dry-run 豁免（只读不落盘，无竞态风险）。

    wait_seconds>0 时用于交互式 --session 运行：先放下让位请求文件，再轮询等锁。
    批处理每处理完一个会话就检查该文件并释放锁，故等待上界约等于「当前会话剩余
    时长」（已由 SESSION_DEADLINE 封顶），而不是整轮时长。
    """
    lock_fd = open(LOCK_PATH, "w")
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        if wait_seconds <= 0:
            log(f"另一个 wiki-synthesize 实例正在运行（锁文件 {LOCK_PATH}），本次退出。")
            sys.exit(3)
        log(f"锁被占用，已放下让位请求，最多等待 {wait_seconds}s（批处理会在当前"
            f"会话结束后让位）…")
        try:
            with open(YIELD_PATH, "w", encoding="utf-8") as f:
                f.write(str(os.getpid()))
        except OSError as e:
            log(f"警告：写入让位请求失败（{e}），退化为纯轮询等待。")
        deadline = time.monotonic() + wait_seconds
        got = False
        while time.monotonic() < deadline:
            time.sleep(3)
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                got = True
                break
            except OSError:
                continue
        clear_yield_request()
        if not got:
            log(f"等待 {wait_seconds}s 仍未拿到锁，本次退出（可稍后重试）。")
            sys.exit(3)
        log("已取得锁，继续。")
    lock_fd.write(str(os.getpid()))
    lock_fd.flush()
    return lock_fd


def clear_yield_request():
    """移除让位请求文件（拿到锁或放弃等待后调用）。"""
    try:
        os.remove(YIELD_PATH)
    except OSError:
        pass


def yield_if_requested(lock_fd):
    """批处理在会话之间调用：有让位请求就释放锁、等对方做完、再抢回来。

    没有请求时零开销。让位文件异常残留时最多等 YIELD_HOLD_SECONDS 后强行抢回，
    避免批处理被一个孤儿文件永久挂住。
    """
    if lock_fd is None or not os.path.exists(YIELD_PATH):
        return
    try:
        with open(YIELD_PATH, "r", encoding="utf-8") as f:
            requester = f.read().strip() or "未知"
    except OSError:
        requester = "未知"
    log(f"检测到交互式提炼的让位请求（请求方 pid={requester}），释放锁并等待其完成…")
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_UN)
    except OSError as e:
        log(f"警告：释放锁失败（{e}），继续本轮不让位。")
        return
    deadline = time.monotonic() + YIELD_HOLD_SECONDS
    while os.path.exists(YIELD_PATH) and time.monotonic() < deadline:
        time.sleep(3)
    if os.path.exists(YIELD_PATH):
        log(f"让位请求超过 {YIELD_HOLD_SECONDS}s 未消失（疑似残留），强行收回锁继续。")
        clear_yield_request()
    while True:
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except OSError:
            time.sleep(3)
    log("已收回锁，批处理继续。")


# 全量批次阈值与冷却窗口：limit≥BATCH_LIMIT_THRESHOLD 视为全量批次，
# 12 小时内只允许一次（防多个会话轮番触发全量提炼烧 API）。
BATCH_LIMIT_THRESHOLD = 50
BATCH_COOLDOWN_HOURS = 12
BATCH_COOLDOWN_FILE = os.path.join(DEFAULT_LOCK_ROOT, "wiki-synthesize-batch.json")


def enforce_batch_cooldown(force, limit):
    """全量批次冷却检查：--force / --session / --dry-run / limit<阈值 均放行。

    依据 <wiki-root>/.locks/wiki-synthesize-batch.json 中上次全量批次的启动时间；
    同进程自身的启动记录（pid 相同）不拦截。
    """
    if force or limit < BATCH_LIMIT_THRESHOLD:
        return
    try:
        with open(BATCH_COOLDOWN_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return
    started = data.get("started_at", "")
    if not started or data.get("pid") == os.getpid():
        return
    try:
        start_dt = datetime.datetime.fromisoformat(started)
        age_h = (datetime.datetime.now().astimezone() - start_dt.astimezone()).total_seconds() / 3600
    except (ValueError, TypeError):
        return
    if age_h < BATCH_COOLDOWN_HOURS:
        log(f"全量批次冷却中：{BATCH_COOLDOWN_HOURS} 小时内已运行过全量提炼"
            f"（{started}，{age_h:.1f}h 前）。如需立即执行请加 --force。")
        sys.exit(4)


def record_batch_start(limit):
    """全量批次启动时记录时间戳（冷却依据；--session/小批量不记录）。"""
    if limit < BATCH_LIMIT_THRESHOLD:
        return
    try:
        with open(BATCH_COOLDOWN_FILE, "w", encoding="utf-8") as f:
            json.dump({"started_at": datetime.datetime.now().astimezone().isoformat(),
                       "pid": os.getpid()}, f, ensure_ascii=False, indent=2)
    except OSError as e:
        log(f"警告：写入冷却记录失败（{e}），本次仍继续。")


def main():
    global SESSION_DEADLINE
    parser = argparse.ArgumentParser(
        description="把 ~/wiki/raw/sessions/**/*.md 原始会话提炼为知识层页面（仅标准库）。")
    parser.add_argument("--wiki-root", default=os.path.expanduser("~/wiki"),
                        help="wiki 库根目录（默认 ~/wiki）")
    parser.add_argument("--config", default=os.path.expanduser("~/.wikibar/config.json"),
                        help="WikiBar 配置文件路径")
    parser.add_argument("--provider", default=None,
                        help="customDirectProviders 中的 provider id（默认取第一个）")
    parser.add_argument("--limit", type=int, default=20,
                        help="本轮最多新处理的会话数（默认 20）")
    parser.add_argument("--session", default=None,
                        help="只提炼相对路径或文件名中包含此 session id/片段的会话")
    parser.add_argument("--dry-run", action="store_true",
                        help="只打印计划，不写入页面、不落状态")
    parser.add_argument("--mock-file", default=None,
                        help="注入假 API 响应文件（内容作为每次调用的返回，供无 key 测试）")
    parser.add_argument("--force", action="store_true",
                        help="绕过全量批次冷却限制（夜间调度任务使用）")
    parser.add_argument("--concurrency", type=int, default=4,
                        help="API 调用并发度（默认 4；落盘始终串行）")
    parser.add_argument("--session-timeout", type=int, default=SESSION_DEADLINE,
                        help=f"单会话单次 API 尝试的总时长上限，秒（默认 {SESSION_DEADLINE}）")
    args = parser.parse_args()

    SESSION_DEADLINE = max(30, args.session_timeout)

    # 运行期状态文件跟随 wiki 根：沙箱会话只被放行写“工作区 + 临时目录”，
    # 放在 ~ 会让工作区就是 wiki 的会话在拿锁阶段即失败。
    wiki_root = os.path.abspath(os.path.expanduser(args.wiki_root))
    global LOCK_PATH, YIELD_PATH, BATCH_COOLDOWN_FILE
    lock_root = os.path.join(wiki_root, ".locks")
    LOCK_PATH = os.path.join(lock_root, "wiki-synthesize.lock")
    YIELD_PATH = os.path.join(lock_root, "wiki-synthesize.yield")
    BATCH_COOLDOWN_FILE = os.path.join(lock_root, "wiki-synthesize-batch.json")

    if not args.dry_run:
        os.makedirs(lock_root, exist_ok=True)
        # 交互式 --session 运行可插队：批处理在会话之间让位（见 yield_if_requested）
        lock_fd = acquire_lock(
            wait_seconds=YIELD_WAIT_SECONDS if args.session else 0)
        enforce_batch_cooldown(args.force, args.limit)
        record_batch_start(args.limit)
    else:
        lock_fd = None

    state_path = os.path.join(wiki_root, "scripts", ".synthesize-state.json")
    state = load_state(state_path)

    mock_content = None
    if args.mock_file:
        with open(os.path.expanduser(args.mock_file), "r", encoding="utf-8") as f:
            mock_content = f.read()
        log(f"已加载 mock 响应：{args.mock_file}（本次不调用真实 API）")

    provider = None
    if mock_content is None:
        provider = load_provider(args.config, args.provider)
        log(f"使用 provider={provider['id']} model={provider['model']}")

    sessions = collect_sessions(wiki_root)
    if args.session:
        sessions = [rel for rel in sessions if args.session in rel]
        if not sessions:
            parser.error(f"未找到匹配会话：{args.session}")
    if not sessions:
        log("raw/sessions 下没有会话文件，队列为空，无事可做。")
        return

    # 内容签名 → 首次最终结论（用于跨文件去重，不调 API）
    sha_conclusion = {}
    for rel, entry in state.items():
        if is_final(entry) and entry.get("sha256"):
            sha_conclusion.setdefault(entry["sha256"], (rel, entry))

    # wikilink 白名单：本轮开始时的全库 slug，随建页增量累加
    existing_slugs = collect_existing_slugs(wiki_root)
    log(f"wikilink 白名单：{len(existing_slugs)} 个可链接 slug")

    stats = {"unchanged": 0, "dedup": 0, "synthesized": 0, "skipped": 0,
             "api-error": 0, "parse-error": 0}
    processed = 0

    def flush_state():
        """增量落盘：批处理中途被 kill 也不会丢已得结论。

        2026-08-04 教训：state 原先只在整轮结束后写一次，那轮跑了 7h15m、
        建了 22 个页，被 kill 后 55 个会话的结论全部丢失、下轮全部重跑。
        """
        if args.dry_run:
            return
        os.makedirs(os.path.dirname(state_path), exist_ok=True)
        save_state(state_path, state)

    def record(rel, conclusion, sha):
        state[rel] = conclusion
        if is_final(conclusion):
            sha_conclusion.setdefault(sha, (rel, conclusion))

    # ── 先把本轮要真正调 API 的会话挑出来（跳过/去重都不耗 API）────────────
    todo = []  # [(rel, text, sha)]
    for rel in sessions:
        try:
            with open(os.path.join(wiki_root, rel), "r", encoding="utf-8") as f:
                text = f.read()
        except OSError as e:
            log(f"跳过 {rel}：读取失败（{e}）")
            continue
        sha = sha256_text(text)
        old = state.get(rel)

        # 内容未变且已有最终结论 → 跳过
        if old and old.get("sha256") == sha and is_final(old):
            stats["unchanged"] += 1
            continue

        if processed >= args.limit:
            log(f"已达 --limit {args.limit}，剩余会话留待下轮。")
            break
        processed += 1

        # 相同 sha256 的不同文件直接复用首次结论
        dup = sha_conclusion.get(sha)
        if dup is not None and not (old and old.get("sha256") == sha):
            first_rel, first_entry = dup
            conclusion = {
                "sha256": sha,
                "status": first_entry.get("status"),
                "reason": f"dup-of {first_rel}（{first_entry.get('reason')}）",
                "date": today_str(),
            }
            log(f"{rel}：内容与 {first_rel} 相同，复用结论（{conclusion['status']}）")
            stats["dedup"] += 1
            if not args.dry_run:
                state[rel] = conclusion
            continue

        todo.append((rel, text, sha))

    # ── 按 chunk 并发调 API，落盘仍严格串行 ─────────────────────────────
    # 只把 call_chat（纯网络等待）放进线程池；解析/写页/写 state 全部回主线程
    # 按原顺序执行，从而保住 existing_slugs 的累加语义与 state 的单写者约束。
    # chunk 边界同时是让位检查点与 state 落盘点。
    workers = max(1, args.concurrency)
    if workers > 1 and len(todo) > 1:
        log(f"并发度 {workers}（API 调用并发，落盘串行）")

    for start in range(0, len(todo), workers):
        chunk = todo[start:start + workers]
        # 同 chunk 内 sha 相同只调一次 API，其余复用
        first_of_sha = {}
        for idx, (rel, _text, sha) in enumerate(chunk):
            first_of_sha.setdefault(sha, idx)

        for rel, _text, _sha in chunk:
            log(f"处理 {rel} …")

        # chunk 起点快照白名单：同 chunk 内的会话看不到彼此新建的页（sanitize
        # 兜底层仍会拦死链），换取并发；chunk 之间照旧增量可见。
        snapshot = set(existing_slugs)
        outputs = [None] * len(chunk)
        errors = [None] * len(chunk)

        def run_one(i, rel, text):
            try:
                outputs[i] = call_chat(
                    provider, rel, text, mock_content,
                    link_candidates=suggest_link_candidates(text, snapshot))
            except RuntimeError as e:
                errors[i] = e

        if workers == 1 or len(chunk) == 1:
            for i, (rel, text, sha) in enumerate(chunk):
                if first_of_sha[sha] == i:
                    run_one(i, rel, text)
        else:
            threads = []
            for i, (rel, text, sha) in enumerate(chunk):
                if first_of_sha[sha] != i:
                    continue
                t = threading.Thread(target=run_one, args=(i, rel, text),
                                     daemon=True)
                t.start()
                threads.append(t)
            for t in threads:
                t.join()

        for i, (rel, text, sha) in enumerate(chunk):
            lead = first_of_sha[sha]
            if lead != i:
                lead_rel = chunk[lead][0]
                lead_entry = state.get(lead_rel)
                if isinstance(lead_entry, dict):
                    conclusion = {
                        "sha256": sha,
                        "status": lead_entry.get("status"),
                        "reason": f"dup-of {lead_rel}（{lead_entry.get('reason')}）",
                        "date": today_str(),
                    }
                    log(f"{rel}：与本批 {lead_rel} 内容相同，复用结论"
                        f"（{conclusion['status']}）")
                    stats["dedup"] += 1
                    if not args.dry_run:
                        record(rel, conclusion, sha)
                continue

            if errors[i] is not None:
                log(f"  {errors[i]}，标记 api-error 继续下一个。")
                stats["api-error"] += 1
                if not args.dry_run:
                    record(rel, {"sha256": sha, "status": "skipped",
                                 "reason": "api-error", "date": today_str()}, sha)
                continue

            output = outputs[i]
            parsed = parse_pages(output)
            if parsed == "SKIP":
                log(f"  {rel}：AI 判定 SKIP（无沉淀价值）。")
                stats["skipped"] += 1
                conclusion = {"sha256": sha, "status": "skipped",
                              "reason": "ai-no-value", "date": today_str()}
            else:
                # 同批新建页之间允许互链，故先收齐本轮 slug 再逐页落盘
                batch_slugs = set()
                for fm, _body in parsed:
                    checked = validate_file_field(fm.get("file"))
                    if checked:
                        batch_slugs.add(norm_slug(checked[1]))
                valid_slugs = existing_slugs | batch_slugs

                written, rejected = [], []
                for fm, body in parsed:
                    ok, msg = process_page(wiki_root, fm, body, rel, args.dry_run,
                                           valid_slugs=valid_slugs)
                    (written if ok else rejected).append(msg)
                    log(f"  {'✓' if ok else '✗'} {msg}")
                if written and not args.dry_run:
                    # 新页已落盘，后续会话可以链到它们
                    existing_slugs |= batch_slugs
                if not written:
                    log("  未能从 API 输出解析出任何合法页，标记 parse-error。")
                    stats["parse-error"] += 1
                    conclusion = {"sha256": sha, "status": "skipped",
                                  "reason": "parse-error", "date": today_str()}
                else:
                    stats["synthesized"] += 1
                    conclusion = {"sha256": sha, "status": "synthesized",
                                  "reason": f"建页 {len(written)} 个"
                                            + (f"，拒绝 {len(rejected)} 个" if rejected else ""),
                                  "date": today_str()}

            if not args.dry_run:
                record(rel, conclusion, sha)

        # chunk 收尾：先落盘（防 kill 丢结论），再看有没有人要插队
        flush_state()
        yield_if_requested(lock_fd)

    flush_state()
    log("")
    log("—— 本轮摘要 ——")
    log(f"会话总数 {len(sessions)}；本轮新处理 {processed}"
        f"（建页 {stats['synthesized']}，SKIP {stats['skipped']}，"
        f"去重复用 {stats['dedup']}，api-error {stats['api-error']}，"
        f"parse-error {stats['parse-error']}）；已有结论跳过 {stats['unchanged']}"
        + ("（dry-run，未写入任何内容）" if args.dry_run else ""))


if __name__ == "__main__":
    main()
