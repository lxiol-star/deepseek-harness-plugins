# dsh-session-board：常驻管理 Agent 面板（Agent Multiplexer）设计

> 状态：设计稿（未实现）· 2026-10-20
> 目标：`dsh-session-board` 0.4.x（Host + Client），不新增独立插件
> 参考：Linux epoll/select 多路复用；DSH 现有 Agent / Lead / 子代理能力
> 前置阅读：[插件开发交接文档](plugin-development-handoff.md)（§3 机制、§5 闭环、§6 发布、§7 硬规则）

---

## 1. 一句话

在 session-board 里增加一个**常驻管理中心**面板：上半屏工作区看板（点开看会话、勾选条目），下半屏与一个**常驻管理 Agent** 对话；Host 侧用一个 epoll 式事件多路复用器把 N 个会话/作业/任务的事件收敛成「就绪队列 + 全量快照」，只在值得的时候唤醒管理 Agent，由它查看状态、给指定工作区/会话派任务、跟踪进度。

## 2. 目标与非目标

**目标**

- 面板常驻：dock 列内新增「管理中心」视图（后续可加全屏 overlay），不打断现有看板。
- 工作区看板在上：复用现有 BoardModel（sessions / statuses / jobs / workspaces / feed）的数据，工作区行显示聚合状态（运行中、等待输入、出错、任务数）。
- 点击工作区 → 下方列出会话（状态点、耗时、是否归档），支持 checkbox 多选。
- 勾选信息同步给管理 Agent：结构化选区（工作区/会话 id + 标题 + 状态）持久化在 Host；Agent 在线时以 `inject`（不唤醒）送达，下一次对话自然可见。
- 与管理员对话：面板内输入框发消息 → Host 权威通道 → 管理员会话；回复在面板内轻量渲染，可一键切到主界面完整聊天。
- 管理员能力：列工作区/会话、查状态与进度、在工作区新建会话并派任务、维护任务记录、读取当前选区、显式 @ 某个工作区/会话。
- 常驻但省钱：管理员会话持久化，冷恢复即可唤醒；**自动唤醒默认关闭**，开启后带预算与优先级。
- 所有写操作可审计：任务、选区、唤醒记录落在插件存储域；不替用户删除/归档数据。

**非目标**

- 不把完整 DSH 聊天 UI 塞进面板（轻量 transcript + 跳转主界面）。
- 不代替用户做归档、删除、停止等破坏性动作（除显式指令 + DSH 原生 approval 路径）。
- 不改官方 bundle 行为；不引入运行时 `@deepseek-ai/*` 依赖（交接文档 §3.4）。
- 不做跨设备/跨实例同步（桌面、Dev3 各自独立）。

## 3. 为什么参考 IO 多路复用

### 3.1 类比

| Linux epoll/select 概念 | 本设计对应物 | 说明 |
| --- | --- | --- |
| fd（文件描述符） | `session:<id>`、`job:<id>`、`subagent:<id>`、`workspace:<id>`、`task:<id>` | 需要被观察的事件源 |
| `epoll_create` | Host `EventMux` 单例 | 全插件唯一聚合器 |
| `epoll_ctl(ADD/DEL)` | 首次见到会话/任务时注册；`agent/disposed`、任务完成、会话归档时注销 | 生命周期跟随 |
| `epoll_wait` | mux 的 coalesce 窗口（200–500ms）产出一批「就绪项」 | 批量、去重、排序 |
| 水平触发（LT） | `snapshot()`：任何时刻给面板全量状态 | 面板/SSE 断线重连友好 |
| 边缘触发（ET） | `follow()`：只给「变了且值得看」的增量 | 管理员只看变化，省 token |
| `EPOLLONESHOT` | 一次唤醒只投递一个 digest，处理完再 arm | 防止一个事件风暴触发 N 次模型调用 |
| `EPOLLERR / EPOLLHUP` | `turn/end` 的 error/cancel 原因、会话归档、子代理结束 | 错误与结束是最高优先级就绪项 |
| 事件合并 + 背压 | 同源去重、优先级队列、有界队列、丢弃低优先级并计数 | 管理员忙时不积压 |
| `select` 的固定 fd 集合 | 面板侧：BoardModel 的 1s tick + 各 client store 快照 | 客户端原本就是「轮询式多路复用」 |

### 3.2 为什么非做不可

DSH 里每个会话都有自己的事件流（`session/event`：turn/step 边界、assistant 消息、工具调用/结果、错误）。若有 N 个会话：

- 让管理员直接订阅所有会话 = 每个事件一次模型调用或一次上下文注入 → token 不可控、且大多数事件不值得看；
- 正确的做法是把「事件流」折叠成「就绪集合」：只有需要判断/行动的状态（等待输入、需要 approval、turn 出错、任务完成/阻塞）才进入管理员上下文；其余只进面板快照。

**所以 mux 是成本控制器，不是性能优化**：它决定「什么时候值得唤醒一个 LLM」。

## 4. 总体架构

```text
┌──────────────────────────── Client（浏览器/Electron renderer）────────────────────────────┐
│  管理中心面板（dock tab / overlay）                                                       │
│   ┌ 工作区看板（复用 BoardModel 数据，聚合状态）                                          │
│   ├ 选中工作区的会话列表（checkbox、状态、耗时）                                          │
│   ├ 任务/进度卡（来自 manager task 域 + mux 派生）                                        │
│   └ 输入框（发送给管理员；选区随消息附带）                                                │
│        │ JSON routes / SSE（全部经 connection 信任栅栏）          ▲ mux 快照+增量、任务     │
└────────┼──────────────────────────────────────────────────────────┼───────────────────────┘
         ▼                                                          │
┌──────────────────────────── Host（插件主进程）───────────────────┴───────────────────────┐
│  routes：/manager/state /manager/selection /manager/prompt /manager/task /mux/stream      │
│                                                                                           │
│  EventMux（epoll 式）                    ManagerRuntime                  TaskLedger        │
│  ├ 订阅 session/event ─┐                 ├ 确保管理员会话存在            ├ 任务表（域 v1）  │
│  ├ agent/created|disposed                 ├ 投递消息/唤醒（预算）          ├ 任务-会话映射   │
│  ├ subagent/start|end   ├→ 就绪队列 ────→ ├ 注册 agent 作用域工具          └ 进度派生        │
│  ├ jobs / domain/changed┘  snapshot+delta └ agent.inject 选区上下文                         │
└──────────────────────────────────────────┬────────────────────────────────────────────────┘
                                           │ sessionController.prompt / agent.inject
                                           ▼
                          ┌────────────────────────────────┐
                          │ 管理员会话（普通 DSH Session）  │
                          │ 固定标题、可审计、可 fork       │
                          │ + 插件注册的管理工具            │
                          └────────────────────────────────┘
```

关键点：**管理员就是一个普通 DSH 会话**。会话日志、冷恢复、模型选择、可审计性全部复用 DSH 已有能力；插件只负责「给它加工具 + 什么时候叫醒它 + 面板前端」。

## 5. 事件源清单（Host）

| 源 | 事件 / API | 模式 | 用途 | 证据 |
| --- | --- | --- | --- | --- |
| 会话 | `session/event`（`turn/start`、`turn/end`、`step/start`、`step/end`、`assistant/message`、`tool/call`、`tool/result`、`user/message`） | 实时、可回放（会话日志） | 忙碌/完成/出错/最后活动 | `packages/core/session/src/types.ts:282`；现有订阅示例 `plugins/dsh-session-board/src/host/ledger.ts:522` |
| 会话状态 | `agent/status`、`agent/error`、`agent/created`、`agent/disposed` | 实时 | 运行中/空闲/退出 | `packages/core/agent-loop/src/agent.ts:140`、`packages/core/agent/src/index.ts:245` |
| 会话列表 | `api-session/added|removed|status|activity|error` | 实时 | 面板会话行增量 | `packages/api/session-controller` |
| 子代理 | `subagent/start`、`subagent/end` | 实时 | 任务会话的子代理进度 | `packages/subagent/subagent` |
| 作业 | jobs 服务（客户端已用 `jobs` 快照） | 快照 | 后台任务数、进度 | `plugins/dsh-session-board/src/client/model.ts` 的 `jobs` |
| 工作区 | `domain/changed`（workspace 域）、`workspace/session-activity`、`workspace/session-stop` | 实时 | 工作区增删改、归档前活动判定 | `packages/api/workspace-controller/src/feed.ts`、`packages/workspace/workspace/src/index.ts` |
| 调度/目标 | `schedule/changed`、`goal/changed` | 实时 | 任务与定时/目标关联（后续） | `packages/schedule`、`packages/goal` |
| 面板 UI | 选区 POST、消息 POST | 请求 | 用户显式动作 | 本文 §9 |

> 已确认可复用：session-board 的 Host/Client 分层、SSE feed + revision 栅栏、storage 域（normalize-not-throw）、`ctx.sessionProjections`。

## 6. EventMux 设计

### 6.1 数据结构（Host，内存 + 由会话日志派生）

```ts
type SourceId = `session:${string}` | `job:${string}` | `subagent:${string}` | `workspace:${string}` | `task:${string}`

interface SourceState {
  readonly id: SourceId
  seq: number                       // 最后折叠的 session seq / 事件序号，防乱序
  lastAt: number
  phase: 'idle' | 'running' | 'waiting' | 'error' | 'done' | 'archived'
  attention: readonly Attention[]   // needs-input / approval / error / task-done…
  facts: JsonValue                  // 折叠后的事实（耗时、工具、最后预览）
}

interface MuxSnapshot { revision: number; sources: Record<SourceId, SourceState> }
interface MuxDelta { revision: number; upserts: SourceState[]; removes: SourceId[] }
```

### 6.2 API

```ts
class EventMux {
  snapshot(): MuxSnapshot
  follow(signal: AbortSignal): AsyncIterable<MuxDelta>   // 给面板 SSE/测验用
  readiness(): readonly ReadyItem[]                      // 给管理员 digest 用（按优先级排序）
  arm(sourceId: SourceId): void                          // EPOLLONESHOT 重新武装
  dispose(): Promise<void>
}
```

- **注册**：插件启动时对 `ctx.agents.list()` 与 `agent/created` 建立源；`session/event` 首次见到新会话自动注册；`domain/changed`/`agent/disposed` 触发注销。
- **折叠**：一个 `session/event` 监听器内同步更新 `SourceState`（O(1)），不 await 任何 I/O；持久化事实（任务进度、最后 turn 结果）经 TaskLedger 异步落库。
- **发布**：变更标脏，`setTimeout(200–500ms)` 合并后广播一次；同源只保留最新；revision 单调递增，客户端过期 delta 丢弃并走全量 resync。
- **就绪优先级**：`needs-input/approval` > `error/cancel` > `task-done/task-blocked` > `long-running` > `progress`。
- **有界**：每源保留最近 K 条 attention、全局队列上限（例如 200）并记录丢弃计数；丢弃只影响「值得自动唤醒」的提示，不影响面板 LT 快照。

### 6.3 唤醒策略（默认保守）

```ts
interface WakePolicy {
  enabled: false                      // 默认关闭；面板开关打开才启用
  maxAutoWakesPerMinute: 1
  maxAutoWakesPerHour: 6              // 可配
  minPriority: 'needs-input' | 'error' // 只在这些就绪项上自动唤醒
  quietHours?: { start: string; end: string }
  onlyWhenManagerIdle: true
  budgetRemaining(): number
}
```

- 用户发消息永远直接唤醒（不受预算限制）。
- `watch` 工具可以让管理员对某个工作区/会话显式订阅更高优先级（例如「任务会话结束/失败时叫我」）。
- 所有自动唤醒都投递**一个 digest**（就绪项摘要 + 选区 + 自上次唤醒以来的变化），而不是逐事件投递。
- 每次唤醒在任务/事件流里留痕，面板显示「最近自动唤醒原因」。

### 6.4 失败模式与对策

| 失败 | 对策 |
| --- | --- |
| 面板断线/重连 | `snapshot()` 全量 + revision；客户端丢弃过期 delta |
| 事件风暴（长工具输出、并行会话） | 同源合并、每源 folding 不带 I/O、全局丢弃计数 |
| 管理员忙 | 就绪队列不投递；`onlyWhenManagerIdle` 保证不重入 |
| 会话被归档/删除 | 注销源；任务标记 `orphaned` 并提示管理员 |
| 插件卸载 | mux 的订阅、SSE 流、定时器全部走 `ctx.effect` 释放 |
| 宿主重启 | 内存状态丢弃，从会话日志/任务域重建；管理员会话命令式冷恢复 |

## 7. 管理 Agent 设计

### 7.1 身份与生命周期

- 插件存储域里保存 `managerSessionId`（首次懒创建）。管理员会话是一个**普通 DSH Session**：固定标题（如「DSH 管理台」）、可审计、可 fork、可在主界面继续聊。
- 建议给它一个专用工作区（例如 `~/Documents/deepseek-harness/dsh-console`）或复用用户的默认工作区；工作区路径可配置。好处：侧栏可见、cwd 合理、能直接在工作区目录里读写。
- **常驻 = 可随时唤醒，不是一直跑模型**：
  - 面板发消息 → Host route → `sessionController.prompt(...)`；内部 `resolveAgent` 自动冷恢复并去重并发恢复（证据 `packages/api/session-controller/src/agent.ts:200`、`commands.ts:513`）。
  - 冷恢复同样会触发 `agent/created`（带 `source`），插件据此在恢复出来的 Agent 作用域里重新注册管理工具/系统提示，所以「工具只在管理员会话里存在」在冷启动路径同样成立。
  - 空闲时管理员不运行，不产生 token 成本；会话本身持久化。
  - 插件不长期持有 Agent handle（避免和 GUI/归档的生命周期打架）；需要在线注入时用 `ctx.agents.get(id)` 判断。
- 插件卸载/重载：会话保留；重新加载后按需恢复。

### 7.1.1 上下文注入：用动态 system prompt context，而不是 inbox 消息

管理员需要「当前选区」「最近就绪项」「任务概览」这类滚动上下文。两种做法：

- ❌ 用 `agent.inject(UserMessage)` 往 inbox 塞消息：插件运行时不能 import `@deepseek-ai/dsh-llm`，只能手写 UserMessage 结构；而且会让上下文进入会话日志、需要去重。
- ✅ 用 `agent.ctx.systemPrompt.context({ name, order, text: () => formatContext() })` 注册**动态上下文**：每次组装系统提示时读取插件域里的最新选区/就绪项/任务概览，模型每次都看到当前值，不产生 inbox 消息、不唤醒、不重复。选区变化只改域状态，下一次模型调用自然生效。

`sessionController.prompt` 只用于「用户真的发了一句话」，`systemPrompt.context` 用于「上下文」；两者职责分开。

### 7.2 工具集（只在管理员 Agent 的作用域注册）

注册模式照抄 agent-team：`agent/created` 时按 `agent.id === managerSessionId` 匹配，`agent.ctx.tools.register(defineTool(...))`，`agent/disposed`/插件卸载时释放（证据 `packages/experimental/tool-agent-team/src/index.ts:169,423`）。

| 工具 | 作用 | 只读? |
| --- | --- | --- |
| `workspace_overview` | 工作区列表 + 聚合状态 + 会话数 + 任务数 | ✅ |
| `workspace_sessions` | 指定工作区的会话（标题、状态、最后活动、归档、任务） | ✅ |
| `session_status` | 单会话/任务会话的运行状态、最后结果、等待事项、后台作业 | ✅ |
| `read_selection` | 面板当前勾选的工作区/会话 | ✅ |
| `assign_task` | 在工作区创建会话并投递任务 brief，登记任务 → 会话映射 | ❌ |
| `list_tasks` / `update_task` | 任务看板维护（claim、blocked、done、notes） | ❌ |
| `report_progress` | 给面板写一条进度摘要（不投递模型） | ❌ |
| `watch` | 订阅某工作区/会话的唤醒策略 | ❌ |

配套 `systemPrompt.section`（角色、工具契约、选区协议、成本约束）+ `systemPrompt.context`（当前选区、最近就绪项、任务概览）。

### 7.3 能力边界

- 管理员可创建会话、发消息、维护任务；**不可**归档/删除会话、停止他人任务——除非用户显式要求，且走 DSH 原有 approval 路径。
- 面板默认只把**结构化元数据**（id/标题/状态/耗时）放进管理员上下文；会话正文由管理员按需用只读工具拉取，并在面板标识「已读取正文」。
- 模型沿用 profile 默认选择，不写死 provider（交接文档 §7.3）；管理员会话的模型可单独选择（复用会话模型选择机制）。

## 8. 任务模型（插件新存储域 v1）

```ts
// 域：dsh_session_board_manager，version 1
manager_state: Map<'state', {
  managerSessionId?: string
  managerWorkspacePath?: string
  selection: { workspaceIds: string[]; sessionIds: string[]; capturedAt: number }
  watch: WakePolicy
  revision: number
}>
manager_tasks: Map<taskId, {
  title: string
  brief: string
  workspaceId?: string
  sessionId?: string        // assign_task 创建的会话
  status: 'pending' | 'assigned' | 'running' | 'blocked' | 'done' | 'failed' | 'orphaned'
  note?: string
  createdAt: number
  updatedAt: number
  lastSeq?: number
}>
```

- 状态机：`pending → assigned → running → blocked|done|failed`；`running` 与进度由 mux 从会话事件派生（turn 结束、错误、等待输入），**不由模型口述**；`done/failed` 需要管理员显式标记（附证据摘要），面板显示模型声明与事件证据。
- 与 DSH 原生对象的关系：任务不是 `goal`，但可以带 `goalId` 关联（M4）；不复制 DSH 的真相（会话/作业状态仍以 DSH 服务为准）。
- 域打不开时降级为内存任务表（面板仍可用，重启丢任务记录），不阻塞插件（交接文档 §4.2/§7.7）。

## 9. 面板 UI 设计

### 9.1 位置与形态

- **M1–M3**：dock 列增加 tab：「看板」/「管理中心」。复用现有 `attachDock` DOM 契约与 CSS 变量，不新开列。
- **M4**：管理中心可另开全屏 overlay（复用 `shell.overlay` 注册模式，参考 `BoardOverlay`）。
- 面板三段式（纵向）：工作区看板（可折叠）→ 选中工作区的会话列表（checkbox）→ 任务/进度 + 输入框。
- 响应式：窄屏只保留选中会话列表与输入框；工作区看板折叠为下拉。

### 9.2 选区同步

1. 勾选变化 → 客户端 store 乐观更新（本地持久化）；
2. debounce 300ms → `POST /api/session-board/manager/selection`，body：`{ workspaceIds, sessionIds, capturedAt }`；
3. Host 校验工作区/会话存在 → 保存到 `manager_state`（只改域状态，**不影响**管理员会话日志，也不唤醒模型）；
4. 管理员下一次被唤醒时，`systemPrompt.context` 动态渲染最新选区（见 §7.1.1），无需 inbox 消息；
5. 面板显示「选区已同步」状态与「清空选区」。

### 9.3 对话与回复渲染

- 发送：面板 composer → `POST /api/session-board/manager/prompt { text, requestId }`；Host 组装「选区块 + 任务上下文 + 用户文本」→ `sessionController.prompt`（queue 模式）。与 GUI 发送路径一致，保证持久化/审计一致。
- 渲染（推荐方案）：客户端 `sessions.retain(managerSessionId)`，用 `binding.session` + `eventSource` 渲染**轻量 transcript**：用户消息、assistant 文本（流式片段合并）、工具调用摘要（一行）、错误一行；不上完整 markdown/工具卡片。超出 N 条折叠为「查看更早」。
- 兜底：面板顶部「在主界面打开」→ `uiWorkspace.openSession(managerSessionId)`，完整聊天/工具卡片都在主界面。
- 备选方案（不推荐首发）：直接把官方聊天节点嵌进面板（`uiConversation` 内部结构复杂、版本敏感）。
- 流式：订阅 `assistant-stream`（会话事件的高频帧）做打字机效果，终态以 `session/event` 为准。

### 9.4 任务/进度展示

- 任务卡：标题、状态色、关联工作区/会话、最近事件时间、进度摘要（来自 mux 派生的 turn/作业事实）。
- 点击任务 → 打开关联会话（复用现有 `uiWorkspace.openSession` 路径）。
- 自动唤醒开关 + 预算剩余 + 「暂停自动管理」。

### 9.5 文案与无障碍

- 中英双语（`locales.ts` 键集合同步，交接文档 §7.10）；键盘可达、focus 管理；减少动态效果；不使用硬编码颜色（用主题 token）。

## 10. 协议草案（Host routes）

全部走 `connection.fetch`（自动 Host/Origin + 浏览器会话校验）；mux 的 SSE 若用裸 `webServer.register` 必须自己调 `requestRejection`（交接文档 §7.6）。

| 方法/路径 | 请求 | 响应 |
| --- | --- | --- |
| `GET /api/session-board/manager/state` | — | `{ managerSessionId, selection, tasks, muxRevision, wakePolicy }` |
| `POST /api/session-board/manager/selection` | `{ workspaceIds, sessionIds }` | `{ accepted, revision }` |
| `POST /api/session-board/manager/prompt` | `{ requestId, text }` | `{ accepted }` / 结构化错误 |
| `POST /api/session-board/manager/task` | `{ action: 'create'｜'update', task }` | `{ task }` |
| `GET /dsh-session-board/mux/stream` | — | SSE：`{ type: 'snapshot'｜'delta', revision, ... }` |

管理员收到的 user message 示例（Host 组装）：

```text
[选区] 工作区 A（3 会话，其中 1 个运行中）；会话 s1（等待输入）、s2（已完成）
[任务] 任务 t1「重构缓存层」→ 会话 s3 运行中（12 分钟）
[用户] 把 s1 卡住的问题整理一下，然后给工作区 B 建一个任务
```

## 11. 安全、成本与可靠性

- **写入边界**：管理员只做「建会话 / 发消息 / 任务记录 / 选区」；归档、删除、停止必须走用户显式指令与 DSH 原生 approval。面板按钮与工具提示明确标注。
- **数据最小化**：默认只同步结构化元数据；拉取会话正文要显式（工具调用记录 + 面板标记）。
- **成本控制**：自动唤醒默认关；预算、优先级、静默时段、`onlyWhenManagerIdle`；一次唤醒一个 digest；面板显示预算消耗。
- **幂等**：消息带 `requestId`；任务更新带 revision（CAS）；重复的选区同步合并。
- **可观测**：所有自动唤醒、任务状态迁移、mux 丢弃计数写 `ctx.logger`（前缀 `dsh-session-board:`）+ 面板「最近活动」。
- **卸载/降级**：任何新增域/路由/连接失败都降级（面板只读或隐藏管理中心 tab），不阻塞现有看板（交接文档 §4.2）。

## 12. 里程碑

| 阶段 | 内容 | 产出/验收 |
| --- | --- | --- |
| **M0 技术验证**（1–2 天） | Host route → `sessionController.prompt` 冷恢复并唤醒管理员会话；`agent/created` 注册一个测试工具；单会话事件折叠进 mux snapshot | 合成数据脚本/单测通过；手测可在面板原型上发一条消息得到回复 |
| **M1 只读 mux + 面板骨架**（3–5 天） | EventMux + snapshot/delta + SSE；dock tab；工作区看板与会话列表（只读，复用 BoardModel） | 组件测试 + Host 路由测试；看板数据与现有 Board 一致 |
| **M2 对话 + 选区**（3–5 天） | prompt route、轻量 transcript、选区同步（inject 不唤醒）、打开主会话 | 选区/消息端到端手测；断线重连 resync |
| **M3 任务 + 管理工具**（5–8 天） | 任务域、`assign_task`/`update_task`/`report_progress`、任务卡与进度派生、watch | 任务状态机单测；派单→会话→进度→完成闭环 |
| **M4 自动化与打磨**（5 天+） | 自动唤醒预算/静默/暂停、overlay 形态、i18n 完善、性能与回归、按 §6 发版 | 全量 `npm run check` 绿；版本 0.4.0 发布 |

每个阶段都按交接文档 §5 闭环（`npm run check` → `npm run build` → 安装到验证实例 → 完全重启 → 手测），并按 §6 发布（版本递增、CHANGELOG、SHA256SUMS）。

## 13. 风险与开放问题

**风险**

1. **成本失控**：自动唤醒是最容易失控的点 → 默认关闭 + 预算 + digest 合并；面板显著展示。
2. **权限越界**：管理员若被赋予破坏性工具，误操作影响真实工作区 → 默认只读 + 建会话/发消息，破坏性动作走用户指令与 approval。
3. **宿主版本差异**：客户端聊天/流式接口在 0.2.1-rc.2 与 alpha 之间有差异（交接文档 §2.3）→ 先做轻量 transcript，避免依赖内部聊天节点。
4. **事件语义缺口**：approval/user-question 的「等待输入」是否都有 durable session 事件需要 M0 核对；没有的话要靠客户端快照补充。
5. **任务完成判定**：模型自述完成不可信 → 进度/完成以 turn 结束、错误、作业事实为证据，面板并列显示。
6. **多实例**：桌面与 Dev3 各自有独立 store，管理员会话不跨实例；配置里需标明。
7. **长历史**：管理员会话会越来越长 → 摘要/分页、必要时 fork 新会话（保留审计）。

**开放问题**

1. 任务的最终归属：独立任务域 vs DSH `goal` vs 复用 Agent Teams 任务板？（建议：先独立域，后续把 task 投影成 goal/team task 二选一）
2. 是否需要「每个工作区一个管理员」？先做单例，多实例是 M5+。
3. 自动唤醒是否用 DSH `schedule` 计时器来做「定时巡检」，而不是纯事件驱动？
4. 管理员是否应该默认拥有 `subagent` 工具（自己派子代理干活）？建议 M3 再放开。
5. 面板是否要支持「拖拽会话到任务区」的交互（更直观的派任务）？

## 14. 证据索引（写实现前复核）

| 结论 | 证据 |
| --- | --- |
| `sessionController.prompt` 自动 resolve/冷恢复，且并发 resume 去重 | `packages/api/session-controller/src/index.ts:461`、`commands.ts:319,513`、`agent.ts:200,278` |
| 普通会话创建/复用 + 工作区挂载 | `packages/api/session-controller/src/commands.ts:111` |
| Agent 作用域工具注册与清理 | `packages/experimental/tool-agent-team/src/index.ts:169,423` |
| Agent 生命周期事件、冷恢复也触发 `agent/created`（`source` 含 `resume`） | `packages/core/agent/src/runtime-types.ts:125,261`、`packages/core/agent/src/index.ts:539` |
| 动态 system prompt context（`text` 可为函数，每次组装读取最新值） | `packages/core/system-prompt/src/index.ts:79` |
| 后台作业 Host 侧只读（`ctx.jobs.list(caller?)` + 事件） | `packages/jobs/jobs/src/index.ts:88` |
| `session/event` 语义与类型 | `packages/core/session/src/types.ts:282`；现有订阅 `plugins/dsh-session-board/src/host/ledger.ts:522` |
| 现有 Host/Client 分层、SSE feed、storage 域、dock/overlay slot | `plugins/dsh-session-board/src/{host/plugin.ts,host/routes.ts,host/ledger.ts,client/index.tsx,client/dock-adapter.ts}` |
| 客户端保留会话并渲染/发送 | `packages/api/session-controller/src/client/contract/sessions.ts`、`packages/client/ui-conversation/src/client/service.ts:211,286` |
| Agent Teams 的 Lead/任务板/消息先例 | `packages/experimental/agent-team/README.md`、`src/roster.ts`、`src/task-board.ts` |
| 插件运行时依赖/注入/重启/版本规则 | `docs/plugin-development-handoff.md` §3.3–§3.4、§6、§7 |

## 15. M0 验证清单（动手前逐项通过）

| # | 要验证的假设 | 做法 | 通过标准 |
| --- | --- | --- | --- |
| 1 | Host 插件能直接调 `sessionController.prompt` 冷恢复管理员会话 | 临时脚本/测试：向一个**未在线**的已持久化会话 prompt | 会话恢复并产生 turn；重复调用不重复恢复 |
| 2 | 冷恢复会触发 `agent/created`，可据此注册 scoped 工具 | 临时 Host 插件监听 `agent/created`，对固定 id 注册一个 echo 工具 | 恢复后的会话能看到并调用该工具 |
| 3 | 动态 `systemPrompt.context` 每次组装读域状态 | 注册 `text: () => 选区摘要`，改域状态后发下一轮 | 模型请求里的上下文随状态变化；无额外 inbox 消息 |
| 4 | 全局 `session/event` 订阅 + O(1) 折叠扛得住多会话 | 复用 session-board ledger 既有订阅，加 mux 折叠与 coalesce | 无阻塞、无漏事件；繁忙时 CPU 可接受 |
| 5 | mux digest 质量：只把「值得管理」的状态变化算就绪 | 合成事件流（等待输入/错误/完成/长跑）跑单测 | 就绪集合符合优先级、无重复、预算生效 |
| 6 | 面板能保留管理员会话、发送消息、渲染轻量 transcript | client 原型用 `sessions.retain` + `binding.session.prompt` + eventSource | 发消息/流式回复/错误显示正常；断线重连正常 |
| 7 | 在运行中的 Dev3 上无模型额度验证 | 交接文档 §5.3 的 CDP 方法（渲染 9262 / Host inspector 9270） | 不改用户数据即可触发并断言 |

M0 通过后再开 M1，避免把「面板 UI」建在一个没验证的 Agent 通道上。

