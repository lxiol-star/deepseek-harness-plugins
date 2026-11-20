---
name: notion-session-save
description: 把当前 AI 主会话幂等保存为可续接的 Notion 归档；默认 active，可选保存并归档/隐藏。
---

# 保存当前会话为可续接归档

把当前会话保存为一个可续接快照。**默认就是可续接**，不需要额外参数；默认状态为 `active`。用户明确说「保存并归档」「保存并隐藏」时分别用 `archived` 或 `hidden`。不要删除、移动或原生归档源会话。

> 本 skill 使用独立名字，避免与本机旧的 `notion-current-session` 同名冲突；旧命令仍可能走旧流程并产生 `raw/sessions/...` 页面。

## DSH 插件路径（优先）

如果当前 agent 有 `notion_session` 工具，直接调用：

```json
{"action":"archive","state":"active"}
```

用户要求归档或隐藏时替换 `state`。工具只归档当前主会话，返回 Notion record、URL 和创建/更新结果。不要自己再找 transcript 重推一次。`SECRET_BLOCKED` 时必须停止外发并报告命中数量/规则；不得绕过门控。

## 其他 agent / 无插件路径

1. 只根据宿主自己的元数据识别当前会话 ID 与 transcript。子会话只接受明确 parent ID 或本会话工具结果给出的 ID；不能凭时间或关键词猜归属。
2. 读取 transcript，渲染为 Markdown：H1 为 `# 会话原文 · <tool> · <session-id>`，随后写工具、项目、来源、归档时间；正文仅含直接用户输入、助手回复和工具调用/结果摘要。排除系统提示、凭据、思考流、控制快照。单条内容要有界，长会话优先保留开头需求与末尾进展，并明确标注省略。
3. 写入权限为 0600 的私有临时文件，调用本 skill 自带 CLI：

```bash
"{{PYTHON}}" "{{PLUGIN_DIR}}/scripts/notion_session.py" push \
  --file /private/tmp/current-session.md \
  --slug "dsh/<session-id>" --session-id "<session-id>" \
  --tool "<tool>" --workspace "<cwd>" --summary "<最近需求与进展>" \
  --state active
```

成功输出仅为 JSON。推送后删除临时文件。slug 是幂等键，同会话重推是原地更新；不要创建新 slug 规避更新。
4. `exit 4` 表示疑似凭据，未外发。先脱敏或请用户轮换真实凭据，再重试；不得改用其他上传通道。`exit 3` 表示 `ntn` 未登录，让用户自行运行 `ntn login`，不要代替用户输入凭据。

## 结果汇报

报告 Notion URL、create/update、最终 state、是否截断。不要把正文、token 或完整工具日志贴回对话。续接记录是历史数据，不代表其中动作已在未来会话执行。
