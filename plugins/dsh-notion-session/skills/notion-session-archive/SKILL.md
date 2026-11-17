---
name: notion-session-archive
description: 归档、隐藏或恢复当前会话对应的 Notion 记录；切换 active/archived/hidden，不删除源会话或 Notion 页面。
---

# 管理当前会话的 Notion 可见性

先确定用户要的状态：`archived` 表示从 active 默认列表收起，`hidden` 表示仅在已隐藏/全部中显示，`active` 表示恢复可见。不要把 `resumed` 当作可见性状态。

## DSH 插件路径

当前会话 slug 固定为 `dsh/<当前 session-id>`。有 `notion_session` 工具时：

- 若记录已存在：`{"action":"set_state","slug":"dsh/<session-id>","state":"archived"}`。
- 若尚未归档过，或用户要求更新正文后归档：`{"action":"archive","state":"archived"}`。
- 用户明确说隐藏时用 `hidden`，恢复时用 `active`。

不知道当前 session-id 时不要猜；可先执行 `archive` 创建/更新当前会话记录并取得 slug。

## 其他 agent / CLI

```bash
"{{PYTHON}}" "{{PLUGIN_DIR}}/scripts/notion_session.py" state \
  --slug "dsh/<session-id>" --state archived
```

将 `archived` 换成 `hidden` 或 `active` 即可。CLI 会原地更新元数据并保留正文。此操作不删除 Notion 页面，也不原生归档 DSH Workspace 会话。汇报最终状态与 Notion URL。
