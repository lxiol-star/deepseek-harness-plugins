---
name: notion-session-archive
description: 管理 Notion 会话记录状态：对当前会话或列表中的任意记录切换 active/archived/hidden 并恢复，不删除源会话或 Notion 页面。
---

# 管理 Notion 会话记录状态

先确定用户要的状态：

| 状态 | 含义 |
|---|---|
| `active` | 默认“可续接”列表可见；不表示源进程正在运行 |
| `archived` | 从 active 列表收起，可在“已归档/全部”找到 |
| `hidden` | 仅在“已隐藏/全部”显示；可从面板恢复 |

`resumed` 不是可见性状态。状态切换只改 Notion 记录元数据，不删除页面，也不原生归档 DSH Workspace 会话。

## 先确定操作对象

1. **当前 DSH 会话**：slug 为 `dsh/<当前 session-id>`。只有这种对象适合先 `archive` 再改状态。
2. **列表/面板中的任意记录**：使用该记录返回的 `slug`，它可能是新的 `dsh/...`，也可能是旧格式 `raw/sessions/<host>/<tool>/<project>/<id>`。
3. **不要从标题或会话 ID 猜 slug**。先用 `notion_session` 的 `list`，或看面板记录里的 slug。

旧格式页面通常没有插件元数据，因此默认按 `active` 显示，并提示“旧记录没有续接摘要”。第一次 `set_state` 会给它补写元数据，但不会凭空生成历史摘要。

## DSH 插件路径

有 `notion_session` 工具时：

- 切换任意已有记录：`{"action":"set_state","slug":"<记录自身 slug>","state":"archived"}`，`state` 可为 `active` / `archived` / `hidden`。
- 保存并顺带设置当前会话状态：`{"action":"archive","state":"archived"}`。`archive` 只操作当前会话；旧记录不要用 `archive`，否则会给当前会话新建/更新一条不同 slug 的记录。
- 用户明确说隐藏时用 `hidden`，恢复时用 `active`。

面板上的“归档 / 隐藏 / 恢复 active”按钮等价于 `set_state`，不需要经过模型。

## 其他 agent / CLI

```bash
"{{PYTHON}}" "{{PLUGIN_DIR}}/scripts/notion_session.py" state \
  --slug "<记录自身 slug>" --state archived
```

把 `--state` 换成 `hidden` 或 `active` 即可；`--slug` 必须是列表返回的完整 slug，旧记录中的中文、空格和括号也可以。CLI 原地更新元数据并保留正文。

汇报时给出最终状态、slug 与 Notion URL；不要声称已删除或已原生归档源会话。
