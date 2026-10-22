#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""wiki-index.py — 重建 ~/wiki 目录级 index.md 与根 index.md 目录表。

行为（merge 模式）：
  - 目录 index：保留已有条目的手写描述；新页面用首段自动摘要占位（可人工润色）；
    已删除页面的条目自动移除；条目按页面 `updated` 倒序排列。
  - 根 index：仅替换 <!-- AUTO:DIRS --> ... <!-- /AUTO:DIRS --> 标记块内的目录表，
    块外内容（快速入口、维护设施等）为手动维护区，不触碰。
  - 描述时效状态：把每条条目的「描述内容哈希 + 当时页面 updated」记入
    scripts/.index-desc-state.json。描述文本变了就刷新记录；描述没变而页面
    updated 前进，说明正文改过但索引描述没跟着改（可能停留在已被推翻的旧结论），
    由 wiki-lint.py 的 stale_index_desc 检查项报出。此文件只读写状态，不影响索引输出。

用法：
  wiki-index.py                      # 重建全部索引
  wiki-index.py --dry-run            # 只打印变更，不写文件
  wiki-index.py --wiki-root ~/wiki   # 指定库根（默认 ~/wiki）

仅使用 Python3 标准库。目录元数据与 ~/wiki/SCHEMA.md 保持一致。
"""

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date

# ---------------------------------------------------------------------------
# 目录元数据（与 SCHEMA.md「目录布局」一致：用途列文案同步维护）
# 顺序即根 index 目录表的行序。
# ---------------------------------------------------------------------------

DIRS = [
    # (目录, 中文名, 英文名, 简介, 用途)
    ("concepts",    "概念",     "Concepts",    "技术概念、原理与领域知识", "技术概念、原理、领域知识"),
    ("projects",    "项目记录", "Projects",    "具体项目的部署、架构与运维记录", "项目部署、架构、运维"),
    ("experience",  "实践复盘", "Experience",  "绑定具体上下文的实践与踩坑复盘", "实践经验、踩坑复盘"),
    ("patterns",    "可复用模式", "Patterns",  "抽象出的可复用模式与最佳实践", "可复用模式、最佳实践"),
    ("tools",       "工具用法", "Tools",       "我使用/配置某工具的用法记录", "工具使用与配置"),
    ("entities",    "实体卡片", "Entities",    "产品/服务/系统等被讨论对象的实体卡片", "产品/服务/系统实体卡片"),
    ("issues",      "问题跟踪", "Issues",      "未解决、跟踪中的故障与已知问题", "故障复盘、已知问题"),
    ("digests",     "精读摘要", "Digests",     "外部文章/视频等的精读摘要", "文章/视频精读摘要"),
    ("comparisons", "方案对比", "Comparisons", "方案横向对比与技术选型分析", "方案对比、技术选型"),
    ("decisions",   "技术决策", "Decisions",   "已拍板的技术决策记录（ADR）", "技术决策记录（ADR）"),
]

AUTO_BEGIN = "<!-- AUTO:DIRS"
AUTO_END = "<!-- /AUTO:DIRS -->"

ENTRY_RE = re.compile(r"^- \[\[([a-z0-9-]+)(?:\|[^\]]*)?\]\](.*)$")

SUMMARY_MAX = 60

# 条目描述时效状态文件（与 .archive-state.json / .synthesize-state.json 同类）
DESC_STATE_FILE = ".index-desc-state.json"


def entry_desc(line):
    """从条目行里取出描述部分（`- [[slug|标题]] — 描述` 的描述），无描述返回空串。"""
    m = ENTRY_RE.match(line.strip())
    if not m:
        return ""
    rest = m.group(2).strip()
    return rest[1:].strip() if rest.startswith("—") else ""


def desc_hash(desc):
    return hashlib.md5(desc.encode("utf-8")).hexdigest()[:12]


def load_desc_state(scripts_dir):
    path = os.path.join(scripts_dir, DESC_STATE_FILE)
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_desc_state(scripts_dir, state):
    path = os.path.join(scripts_dir, DESC_STATE_FILE)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1, sort_keys=True)


# ---------------------------------------------------------------------------
# 页面解析
# ---------------------------------------------------------------------------

def parse_page(path):
    """读页面，返回 (title, updated, summary)。frontmatter 简易解析，不用 yaml 库。"""
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None, "", ""

    title, updated = "", ""
    body = text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            fm = text[3:end]
            body = text[end + 4:]
            m = re.search(r"^title:\s*(.+?)\s*$", fm, re.M)
            if m:
                title = m.group(1)
            m = re.search(r"^updated:\s*(\d{4}-\d{2}-\d{2})", fm, re.M)
            if m:
                updated = m.group(1)

    return title, updated, extract_summary(body)


def extract_summary(body):
    """取正文首个非标题、非列表/表格的段落行，清洗后截断为占位摘要。"""
    for line in body.splitlines():
        s = line.strip()
        # Images and embeds are presentation-only; they make poor index
        # summaries and often point to intentionally excluded legacy assets.
        if (not s or s.startswith(("#", "- ", "* ", "|", ">", "```", "![", "![["))
                or re.match(r"^!\[[^\]]*\]\(", s)):
            continue
        s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)  # [[slug|别名]] → 别名
        s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)            # [[slug]] → slug
        s = s.replace("**", "").strip()
        if len(s) > SUMMARY_MAX:
            s = s[:SUMMARY_MAX].rstrip("，、；：。,.;:!?！？ ") + "…"
        return s
    return ""


def iter_page_files(dirpath):
    """递归列出目录下知识页；排除所有层级 index.md 与隐藏目录。"""
    if not os.path.isdir(dirpath):
        return []
    result = []
    for cur, dirs, files in os.walk(dirpath):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for fn in sorted(files):
            if fn.endswith(".md") and fn != "index.md":
                result.append(os.path.join(cur, fn))
    return result


# ---------------------------------------------------------------------------
# 目录 index 重建
# ---------------------------------------------------------------------------

def build_dir_index(wiki_root, dirname, zh, en, intro, today, desc_state=None):
    """重建单个目录 index 内容，返回 (新内容, 页数, 新增数, 移除数)。

    desc_state 非 None 时，顺带更新条目描述的时效状态（原地修改传入的 dict）。
    """
    dirpath = os.path.join(wiki_root, dirname)
    index_path = os.path.join(dirpath, "index.md")

    # 现有条目：slug → 原始行（保留手写描述）
    old_entries = {}
    created = today
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            old_text = f.read()
        m = re.search(r"^created:\s*(\d{4}-\d{2}-\d{2})", old_text, re.M)
        if m:
            created = m.group(1)
        for line in old_text.splitlines():
            m = ENTRY_RE.match(line.strip())
            if m:
                old_entries[m.group(1)] = line.strip()
            # Legacy/generated indexes may use path links; keep their hand-written
            # description under the normalized flattened slug as well.
            pm = re.match(r"^- \[[\[]([^\]|]+)(?:\|[^\]]*)?\]\](.*)$", line.strip())
            if pm and "/" in pm.group(1):
                legacy_slug = pm.group(1).rsplit("/", 1)[-1].replace(".md", "").lower()
                old_entries.setdefault(legacy_slug, line.strip().replace("[[%s]]" % pm.group(1), "[[%s]]" % legacy_slug))

    # 当前页面
    pages = []  # (slug, title, updated, summary)
    if os.path.isdir(dirpath):
        for page_path in iter_page_files(dirpath):
            rel = os.path.relpath(page_path, dirpath)
            slug = os.path.splitext(rel)[0].replace(os.sep, "-").lower()
            title, updated, summary = parse_page(page_path)
            pages.append((slug, title or slug, updated, summary))
    # updated 倒序（缺失排最后），同日期按 slug
    pages.sort(key=lambda p: (p[2] or "0000-00-00", p[0]), reverse=True)

    entries, added = [], 0
    for slug, title, _updated, summary in pages:
        if slug in old_entries:
            entries.append(old_entries[slug])
        else:
            added += 1
            line = "- [[%s|%s]]" % (slug, title)
            if summary:
                line += " — " + summary
            entries.append(line)
        # 描述时效状态：描述文本变了就把记录刷成页面当前 updated；
        # 没变则保留旧记录，让 lint 能看出「正文更新了、描述没跟上」。
        if desc_state is not None:
            key = "%s/%s" % (dirname, slug)
            h = desc_hash(entry_desc(entries[-1]))
            prev = desc_state.get(key)
            if not isinstance(prev, dict) or prev.get("desc_hash") != h:
                desc_state[key] = {"desc_hash": h, "page_updated": _updated or ""}
    removed = len([s for s in old_entries if s not in {p[0] for p in pages}])

    body_list = "\n".join(entries) if entries else "（暂无页面）"
    content = """---
title: %s Index
type: index
created: %s
updated: %s
tags: [index]
confidence: medium
---

# %s（%s）

%s，规范见 [[SCHEMA]]。

## 页面列表

%s
""" % (en, created, today, zh, en, intro, body_list)
    return content, len(pages), added, removed


# ---------------------------------------------------------------------------
# 根 index 目录表
# ---------------------------------------------------------------------------

def build_root_table(counts):
    """counts: {目录: 页数}，返回 AUTO 块完整文本（含标记行）。"""
    lines = [
        AUTO_BEGIN + " 由 scripts/wiki-index.py 重建，请勿手改 -->",
        "| 目录 | 页数 | 用途 |",
        "|------|------|------|",
    ]
    for dirname, _zh, _en, _intro, purpose in DIRS:
        lines.append("| [[%s]] | %d | %s |" % (dirname, counts.get(dirname, 0), purpose))
    lines.append(AUTO_END)
    return "\n".join(lines)


def update_root_index(wiki_root, counts):
    index_path = os.path.join(wiki_root, "index.md")
    with open(index_path, encoding="utf-8") as f:
        text = f.read()
    begin = text.find(AUTO_BEGIN)
    end = text.find(AUTO_END)
    if begin == -1 or end == -1 or end < begin:
        print("error: 根 index.md 缺少 %s ... %s 标记块，跳过" % (AUTO_BEGIN, AUTO_END),
              file=sys.stderr)
        return None
    new_block = build_root_table(counts)
    head = text[:begin]
    tail = text[end + len(AUTO_END):]
    # 更新 frontmatter updated 字段
    head = re.sub(r"^updated:\s*\d{4}-\d{2}-\d{2}",
                  "updated: " + date.today().isoformat(), head, count=1, flags=re.M)
    return head + new_block + tail


# ---------------------------------------------------------------------------

def write_if_changed(path, content, dry_run, label):
    old = None
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = f.read()
    if old == content:
        print("%s: 无变化" % label)
        return False
    if dry_run:
        print("%s: 有变更（dry-run 未写入）" % label)
        return True
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("%s: 已写入" % label)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki-root", default=os.path.expanduser("~/wiki"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    root = args.wiki_root
    today = date.today().isoformat()
    scripts_dir = os.path.join(root, "scripts")
    desc_state = load_desc_state(scripts_dir)
    state_before = json.dumps(desc_state, sort_keys=True)

    counts = {}
    for dirname, zh, en, intro, _purpose in DIRS:
        content, n, added, removed = build_dir_index(root, dirname, zh, en, intro, today,
                                                     desc_state=desc_state)
        counts[dirname] = n
        write_if_changed(os.path.join(root, dirname, "index.md"), content,
                         args.dry_run,
                         "%s/index.md (%d 页, +%d -%d)" % (dirname, n, added, removed))

    # 移除已不存在条目的状态记录
    alive = set()
    for dirname, _zh, _en, _intro, _purpose in DIRS:
        d = os.path.join(root, dirname)
        if os.path.isdir(d):
            alive |= {"%s/%s" % (dirname, os.path.splitext(os.path.relpath(p, d))[0].replace(os.sep, "-").lower())
                      for p in iter_page_files(d)}
    for key in [k for k in desc_state if k not in alive]:
        del desc_state[key]

    if args.dry_run:
        print("%s: 有变更（dry-run 未写入）" % DESC_STATE_FILE
              if json.dumps(desc_state, sort_keys=True) != state_before
              else "%s: 无变化" % DESC_STATE_FILE)
    elif json.dumps(desc_state, sort_keys=True) != state_before:
        save_desc_state(scripts_dir, desc_state)
        print("%s: 已写入（%d 条）" % (DESC_STATE_FILE, len(desc_state)))
    else:
        print("%s: 无变化" % DESC_STATE_FILE)

    root_content = update_root_index(root, counts)
    if root_content is not None:
        write_if_changed(os.path.join(root, "index.md"), root_content,
                         args.dry_run, "index.md (目录表)")


if __name__ == "__main__":
    main()
