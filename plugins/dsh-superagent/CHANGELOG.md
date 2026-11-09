# Changelog

## 0.2.4 — 2026-11-09

- **修复主会话仍能等待子 agent**：装了 Agent Teams 的 profile 把 `wait_agent`/`spawn_teammate`/`team_task_*` 注册在**会话自己的 scope**，而 `tools.restrict` 只过滤继承来的全局工具，白名单管不到它们——于是主会话拿到 `wait_agent` 后会阻塞（实测一次会话 17:11–17:22 连续 `wait_agent` 180s/240s）。
- 现在 guard 按名字拒绝会「等别的 agent」的工具：`wait_agent`、`subagent`、`subagent_fork`、`ralph`、`workflow`，并回一句「对方的报告会自己作为消息到达，结束本轮」。只派发/发消息的工具（`spawn_teammate`、`send_message`、`interrupt_agent`、`list_agents`、`team_task_*`）不受影响。
- 单测覆盖：主会话拒绝上述 5 个工具、放行派发类工具；worker 行为不变。

## 0.2.3 — 2026-11-09

- 主会话提示词增加一条硬规则：**不要在会话里等待或轮询**——开一张工单或一个后台任务，结束本轮，结果会以消息的形式回来触发下一次处理（I/O 多路复用的写法）。配合既定 preset（无 wait/poll 工具、前台命令 5 秒转后台、禁写文件），主会话只接请求与答问。

## 0.2.2 — 2026-11-09

- 修复「清除」在部分行不出现：工单列表行只有在传入 `onChanged` 时才渲染动作区，执行页的普通行（已结束/等待触发等）没传，所以看不到清除按钮。现在每行都传刷新回调，失败/阻塞/已结束工单都能直接清除。

## 0.2.1 — 2026-11-09

- **工单记录可以清除了**：新增「清除」动作（面板工单行与工单详情页），把失败/阻塞/已结束的工单从列表里移走；仍在运行的会先按「人停止」结束，记录保留在历史里、不删除数据。
- 新增 `POST tickets/:id/dismiss` 与主会话工具 `orchestrator_ticket_dismiss`，`Ticket.dismissed` 字段用于列表过滤（概览、工单列表）。
- 修复：来源为另一台设备时，模型配置错误造成的失败工单此前没有任何清理入口，只能一直挂在「待处理失败」。
- 测试：新增 dismiss 单测；`docs/007-architecture.md` 补上 workspace/session 源；主线 prompt 预算内。

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
