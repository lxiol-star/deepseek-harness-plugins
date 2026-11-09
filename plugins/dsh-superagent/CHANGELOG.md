# Changelog

## 0.2.0 — 2026-11-09

从 `hxh230802/dsh-superagent-prototype` 的 fork 收编进本仓库，并加上「本地工作区 + 主会话任务」两条不依赖 GitHub 的链路。

### 新增

- **本地工作区树 Source**（`src/sources/workspaces.ts`）：枚举本机工作区并监听其中文件活动，事件转 Trigger；根目录留空时自动接入 DSH 工作区树，显式配置时只盯配置目录。带嵌套去重与「排除 DSH 家目录 / 插件状态目录」的自激保护。
- **主会话任务 Source**（`src/sources/session.ts`）：操作者在主 Session 里直接下达的任务；由 `Engine.operatorTask` 直通授权（不需要发送者名单或准入表），每个任务开一张工单。
- **主会话工具 `orchestrator_task`**（`src/app/tools/main.ts`）：主 Session 按操作者的任务开单，提示词同步说明「不要自己动手」。
- **工单执行落点**（`src/executor/dsh.ts`）：触发携带 `workspaceRoot` 时，工单目录为 `<工作区>/.dsh-superagent/work/<工单>`；否则沿用配置的执行根。
- 面板：来源页展示新 Source 健康状态；「本地工作区树」设置里可用「刷新工作区列表」拉取本机工作区（kind 写入 Source KV labels）。

### 变更

- 面板设置页的工作区下拉需要 kind 自己持久化 labels；`refreshLabels` 现在会写入。
- 新增健康码与中英文案：`sessionReady`、`workspaceNoRoots`、`workspaceRootMissing`、`workspaceWatching`。

### 兼容

- DSH `^0.2.1-alpha.2`；已在 Harness Dev 0.2.2-alpha.3 与 DSH 0.2.2-rc.1 上验证「主会话下任务 → 工单 → 子工作树执行」全链路。
