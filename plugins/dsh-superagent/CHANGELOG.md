# Changelog

## 0.2.7 — 2026-11-25

一次独立的 UI/UX 评审（读代码，未看运行中的页面）之后的修正版。没有新功能。

- **任务条不再可能覆盖你没发出去的话**：此前它靠槽位传入的输入框快照判断「输入框是否为空」，而那份快照是否随每次击键更新由宿主决定——如果是旧的，你正在写的话会被问题盖掉。现在优先用槽位提供的实时钩子 `useInput` 读，并且**读不到输入框状态时一律不发**（回一句说明），因为未知的输入框里可能有你的草稿。输入框在处理你输入的斜杠命令时也不发（此前会被说成「正在发送」）。
- **画布上的工单不再被截到 12 张**：此前宿主对任务条和画布都用同一个上限，第 13 张起在画布上直接看不见、也不提示。现在宿主返回全部未结束工单，由任务条自己只列前 12 张并计数「还有 N 个」。
- **提问连线画反了**：任务在中间一列、Composer 在左边，线却从任务的右缘出发再绕回来，穿过任务列。现在从面向目标的那条边出发。顺带修了 `edgePath` 里方向参数正负号语义自相矛盾的问题，以及两张卡贴得很近时控制点落到卡片外面的问题。
- **画布上的列表能滚动**：问答列表和输入框上的滚轮此前一律被拿去平移画布，最新的回答沉在列表下面看不到。现在这些地方各滚各的，⌘/Ctrl + 滚轮仍然是缩放。
- **打开画布时不再只对着空骨架适配**：此前只适配一次（那时还没有工单），真实工单到达后下面和右边的列跑到屏幕外。现在卡片增多时会重新适配，直到你手动平移或缩放过为止。
- 小处：拖动卡片时切走窗口不再让拖动「粘住」；卡片标题可以用键盘够到；没勾选工单时按 Enter 会提示「先勾选一张工单」；任务条在勾选前就说明勾选的用途，提交后有确认提示；英文文案统一用插件既有的 "Executor" 而不是 "Worker"。
- 仍未做（评审提出、留待有真实页面可看时再定）：图例遮住左上角的卡片标题；任务条里的卡片会因执行器开始/结束而重排；画布相对时间不随时间刷新。

## 0.2.6 — 2026-11-24

- **任务列表与任务画布**：主会话现在有两个看任务的地方，都不经过桌面 UI 自动化。
  - **输入框上方的任务条（dock）**：挂在 `conversation.input.dock` 槽位（DSH `0.2.2-rc.5` 起由 `dsh-client-ui-conversation` 声明），只在主会话里出现。列出每张未结束工单的阶段、进度和执行器是否在跑，可收起成一颗带计数的药丸并记住收起状态，没有未结束工单时不渲染。
  - **任务画布**：侧栏独立入口「Superagent 画布」。主会话、任务、执行器三列卡片，可拖动空白处平移、⌘/Ctrl + 滚轮缩放、拖动卡片标题移动位置（记在本地），主会话 → 工单、工单 → 执行器用实线箭头相连，右下小地图、左上图例、底部状态栏。
  - **勾选任务后向主会话提问**：勾选一张工单，画布上的 Composer 或任务条里的提问框就能就它提问。画布走新路由 `POST tasks/:id/ask`，由宿主经 `Effects` 的 relay 送达主会话（有序、重试、每个 `requestId` 至多一次）；任务条则把问题写进输入框并像点「发送」一样提交，输入框里有未发送的草稿、附件或正在发送时一律不写。
  - 问题带一行 `[ticket <id> · <title>]`，主会话提示词据此识别「这是关于该工单的提问」，按工单记录回答，不开新单。
  - **进度口径**：worker 最近一次 `todo/write` 的 `已完成/总数` 与当前项；没有待办时显示最近一次汇报；等人处理时显示等人做什么。重启后待办要等 worker 下一次写入才有。
- 新增只读路由 `GET tasks`（任务条与画布共用的快照）与 `POST tasks/:id/ask`。
- 主会话提示词末尾重写为三句（原「不要等」「不要走桌面 UI」「不要自己做」三句合并进同一预算）：`masterPrompt` 仍 < 1400 字符。
- 单测：`tests/tasks.spec.ts`（排序、列表、ticket 行、待办与回复读取、两条路由）、`tests/dock.spec.tsx`、`tests/canvas.spec.tsx`、`tests/installed-bundle.spec.tsx`（加载 **profile 里实际安装的** `lib/client.js`，而不是源码）。
- 兼容：`dsh.client.inject` 增加 `@deepseek-ai/dsh-client-ui-conversation`。宿主半边在真实 DSH `0.2.2-rc.5` 上热重载后 `GET tasks` 返回 200；客户端半边在 jsdom 中对着已安装产物验证了加载、注册、渲染与提问请求——**真实页面里的视觉效果尚未人工确认**。

## 0.2.5 — 2026-11-18

- **主会话可以直接管理自己创建的子级工作区了**：新工具 `orchestrator_workspaces`（`op=list|archive|delete`），此前这类清理只能靠桌面 UI 自动化（osascript 盲点 DevTools 控制台粘 IIFE，实测把脚本粘进了别的会话和侧栏终端）。
  - `op=list`：只列本插件为工单执行器创建的工作区（路径里带 `.dsh-superagent/work/` 的那些），带对应 ticket、每个 Session 的归档状态和仍在运行的工作（`turn`/`job`/`subagent`/`schedule` 按族列出）。
  - `op=archive`：按 DSH 客户端的归档语义写同一份 durable archive set——会话离开分组视图、日志保留；仍在跑的 Session 默认报成 `blocked`，`stop_active=true` 才先停再归档。
  - `op=delete`：**默认不删**，只返回「按 confirm 会发生什么」；`confirm=true` 时也只删这条**工作区注册**（目录与全部 Session 日志都在），且只要有 Session 在跑、或有 Session 尚未归档就拒绝。
  - 越界保护：不是子级工作区的路径（操作者自己的工作区）一律 `notChildWorkspace` 拒绝，`confirm` 也不放行。
- 主会话提示词加一条硬规则：子级工作区只用这些工具管，**不要走桌面 UI**。
- 模型可见面预算（`tests/model-surface.spec.ts`）59_000 → 60_500，只因为多了这一个工具；worker 面不变。
- 单测：`tests/workspaces.spec.ts` 覆盖路径标记、分页列表、归档集、无活跃会话/未归档/未确认三类拒绝；`tests/tools.spec.ts` 覆盖工具层接线与「默认不删」。

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
