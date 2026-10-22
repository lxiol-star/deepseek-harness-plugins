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

- 不重造完整聊天 UI：优先嵌入官方 `conversation.content`（embedded variant）；契约不可用时降级为轻量 transcript，并始终提供「在主界面打开」。
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
│  管理中心面板（shell.overlay 抽屉；dock tab 仅降级）                                      │
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
│  ├ jobs / domain/changed┘ snapshot+delta  └ 动态 systemPrompt.context / 选区 mirror        │
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

下表由独立调研核对过源码（DSH `0.2.1-rc.2`），并区分「实时事件 / 可回放」两类——mux 的 LT 快照只能依赖可回放或可枚举的真相，不能依赖 live-only 事件。

| 源 | 事件 / API | 模式 | 可回放 | 证据 |
| --- | --- | --- | --- | --- |
| 会话生命周期 | `session/created`、`session/disposed` | emit（scope 过滤） | ❌ 仅活注册表 | `packages/core/session/src/index.ts:54,63` |
| **会话日志** | `session/event`（提交后 fire-and-forget，监听器异常被包含） | emit | ✅ 日志 + seq/time | `packages/core/session/src/index.ts:74` |
| turn/step | `turn/start`、`step/start`、`step/end`、`turn/end{reason}` | durable | ✅ | `packages/core/session/src/types.ts:289–298` |
| turn 结果 | `TurnEndReasonMap`：completed / aborted / blocked / error / max-tokens / interrupted / forked | durable | ✅ | `packages/core/session/src/types.ts:202–230` |
| 工具 | `tool/call`、`tool/result`（含 `error`、`meta`） | durable | ✅ | `packages/core/session/src/types.ts:362,376` |
| 用户输入 | `user/message`（`source.kind`：user / inject / schedule / goal…） | durable | ✅ | `packages/core/session/src/types.ts:310` |
| 模型输出 | `assistant/message`（+usage）、`assistant/attempt`、`llm/retry` | durable | ✅ | `packages/core/session/src/types.ts:339`；`packages/llm/llm-retry/src/types.ts:7` |
| 审批（审计） | `approval/asked`、`approval/decided`（log-only，不进模型面） | durable | ✅ | `packages/interaction/user-approval/src/types.ts:44,55` |
| 审批/提问（实时） | `approval/request`、`user-questions/request`（waterfall，agent 作用域） | waterfall | ❌ | `.../user-approval/src/types.ts:87`；`.../user-questions/src/types.ts:157` |
| 作业（审计） | `job/registered`、`job/settled`（log-only） | durable | ✅ | `packages/jobs/jobs/src/types.ts:59,64` |
| 作业（实时） | `ctx.jobs.events.subscribe({owner｜owners})` → registered / progress / stopping / settled / removed / output | emit（提交后） | ❌（settled 投影兜底） | `packages/jobs/jobs/src/types.ts:255,298`；注册表 `packages/jobs/jobs/src/index.ts:88,103,120` |
| 子代理（实时） | `subagent/start`、`subagent/end` | emit | ❌ | `packages/subagent/subagent/src/lifecycle.ts:49,50,68` |
| 子代理（可查） | `listChildren` / `listDescendants` / `list` | async 读 | 来自持久化 | `packages/subagent/subagent/src/index.ts:405,425,581` |
| api-session | `api-session/added｜removed｜status｜activity｜error` | emit | ❌（从 `session/*` 重derive） | `packages/api/session-controller/src/types.ts:609–636` |
| Agent | `agent/created`、`agent/disposed`、`agent/status{idle｜running}`、`agent/error` | emit | ❌ | `packages/core/agent/src/runtime-types.ts:261,270,280,393` |
| 投影 | `ctx.sessionProjections.onChanged(session,key,value,seq)` / `stateOf` | 同步 delta + baseline | 由日志折叠 | `packages/session/session-projection/src/index.ts:302,320` |
| 工作区域 | `domain/changed`（进程级、覆盖所有域） | emit（durable 后） | ✅ 域是真相 | `packages/storage/storage-domain/src/events.ts:46`；过滤先例 `packages/api/workspace-controller/src/feed.ts:102` |
| 工作区 feed | baseline + upsert/remove/order/archived/pinned/replace | 每 follower 异步生成 | ✅ | `packages/api/workspace-controller/src/feed.ts:75,88` |
| 归档准入 | `workspace/session-activity`（waterfall，必须 `next()`） | waterfall | 按需 | `packages/workspace/workspace/src/index.ts:129` |
| 目标 | `goal/change`（durable）/ `goal/changed`（scoped live） | 双轨 | durable 中继 | `packages/goal/goal/src/domain.ts:66,114` |
| 调度 | `schedule/change`（durable）/ `schedule/changed()`（无 payload，触发 refetch） | 双轨 | ✅ | `packages/schedule/schedule/src/types.ts:365,478` |
| 任务/待办 | `todo/write`；实验性 `team/task`、`team/member` | durable | ✅ | `packages/todo/tool-todo/src/types.ts:31`；`packages/experimental/agent-team/src/types.ts:230,232` |
| 会话协议 | `session/title`、`plan/mode`、`permission/preset`、`sandbox/mode`、`approval/policy`、`model/selection` | durable | ✅ | `packages/core/session/src/known-event-types.ts:49–84` |
| 唤醒面 | `agent.followup/send/steer/inject`、`whenIdle`、`runMaintenance` | API | 经 `agent/inbox/spliced` 持久化 | `packages/core/agent/src/runtime-types.ts:191–241` |

> 注意：**冷会话不会发 `session/event`**；面板的会话列表必须用现有 client 服务的列表/快照（`api-session` list + `session_controller.follow`），mux 只维护「活跃源」的 LT/ET 状态。

**调研订正（两条会影响实现计划）**

1. **现有 session-board feed 没有 revision 栅栏**：`src/host/routes.ts:134` 发的是裸的全量帧，`src/client/feed.ts:121` 无条件应用；当前唯一的顺序保证是 `ledger.ts:497` 的 per-session 写链。所以「revision 栅栏」是本设计新增的工作，不是复用。（此前以为已有，已按此修正 §6。）
2. **`approval/request`、`user-questions/request` 是 waterfall 而不是 emit**：mux 若要监听必须始终 `await next()`，否则会截断审批链。更安全的做法是从 durable 的 `approval/asked` / `approval/decided` 事件派生「等待输入」状态；面板同理。

## 6. EventMux 设计

### 6.1 数据结构（Host，内存；真相来自会话日志/域）

```ts
type SourceId = `session:${string}` | `agent:${string}` | `job:${string}`
              | `subagent:${string}` | `workspace:${string}` | `schedule:${string}` | `goal:${string}`
type Priority = 'needs-input' | 'error' | 'completed' | 'progress'   // 声明顺序即优先级
type EdgeKind = 'ask-open' | 'ask-close' | 'turn-end' | 'turn-start' | 'tool-result'
              | 'job-settled' | 'subagent-end' | 'workspace-change' | 'schedule-due'
              | 'goal-change' | 'title' | 'progress'

interface Edge { kind: EdgeKind; at: number; priority: Priority; key: string }  // key 用于去重

interface SourceState {
  id: SourceId
  interest: { progress: boolean; terminal: boolean; needsInput: boolean }  // epoll event mask
  level: unknown            // LT 真相：snapshot() 返回的内容
  seq: number               // 每源序号守卫：丢弃 seq <= this 的输入
  revision: number          // 最近改变 level 的 mux revision
  edges: Deque<Edge>        // ET 事件，单源上限 256，全局 4096
  dropped: number           // 溢出计数；>0 时下一个 digest 带 gaps:true
  lastEventAt: number
  oneshot?: EdgeKind        // 已武装 → 只唤醒一次，自动解除（EPOLLONESHOT）
  terminalTtlMs: number     // 终态源淘汰 TTL；活源为 Infinity
}
```

### 6.2 API

```ts
class EventMux {
  register<S>(source: SourceDescriptor<S>): () => void   // { id, priority, interest, apply(prev,input): S }
  unregister(id: SourceId): void                          // 幂等；session/disposed 自动触发
  touch(id: SourceId, edge: Edge): void                   // EPOLLIN：入边 + 标就绪
  setLevel(id: SourceId, level: unknown, seq: number): void // LT 真相替换，revision++
  armOneshot(id: SourceId, kind: EdgeKind): void
  disarm(id: SourceId): void
  snapshot(): { revision: number; at: number; sources: Record<SourceId, { priority; level }> }
  follow(signal: AbortSignal): AsyncIterable<MuxFrame>     // baseline 后 delta/removed/reset
  wait(signal: AbortSignal, opts?: { floor?: Priority; timeoutMs?: number }): Promise<Ready[]>
  stats(): { sources: number; queued: number; dropped: number; revisions: number }
  close(): void
}
type MuxFrame = { type: 'baseline'; revision: number; snapshot: Snapshot }
              | { type: 'delta'; revision: number; id: SourceId; level: unknown }
              | { type: 'removed'; revision: number; id: SourceId }
              | { type: 'reset'; revision: number; reason: 'gap' | 'overflow' | 'resync' }
```

### 6.3 epoll 映射

| epoll | EventMux |
| --- | --- |
| `epoll_create` | 每插件 fiber 一个 `EventMux`（`ctx.effect` 释放） |
| `epoll_ctl ADD/MOD/DEL` | `register` / `setLevel`+`armOneshot` / `unregister`（disposer 走 `ctx.effect`） |
| `epoll_wait` | `wait(signal,{floor})` → 就绪集合按 `(优先级, firstReadyAt)` 排序 |
| fd | `SourceId` 字符串（**不**存 Agent/Session 引用，避免陈旧引用） |
| `EPOLLIN`（水平） | `snapshot()`/`level`：条件持续成立就一直就绪（如一个未关闭的 ask） |
| `EPOLLET`（边缘） | `edges` 双端队列，只有读者游标推进才消费 |
| `EPOLLONESHOT` | `armOneshot` + 自动 `disarm`：一个 ask/error 只唤醒一次 |
| `EPOLLHUP/ERR` | `unregister` → `{type:'removed'}`，状态淘汰 |
| `EPOLLPRI` | needs-input > error > completed > progress |

### 6.4 唤醒策略（默认保守）

```ts
interface WakePolicy {
  minIntervalMs: number   // 15_000：两次唤醒的硬下限
  batchWindowMs: number   // 2_000：首个就绪边后合并窗口
  quietMs: number         // 5_000：completed 类需安静一段时间才唤醒
  wakeOn: Priority[]      // 默认 ['needs-input','error']
  digestMaxItems: number  // 20
  digestMaxBytes: number  // 4096
  dedupeTtlMs: number     // 300_000：同一个 Edge.key 不重复上报
  maxOutstanding: number  // 1：永不同时排队第二个 digest
}
```

规则：

1. 仅当 `ctx.agents.get(managerId)?.status === 'idle'` 时唤醒；运行中就把边留在有界队列里、**跳过**唤醒——绝不能「每事件一条 prompt」（每个 inbox 消息都会成为一个独立 turn）。
2. 一次唤醒只发**一个 digest**：按优先级取前 N 条 + `dropped/gaps` 计数 + 指向 `snapshot()` 的入口。
3. 投递方式：`sessionController.prompt`（与 GUI 发送同路径，`requestId` 幂等，内部 `resolveAgent` 自动冷恢复）。v1 里 digest 以 `[系统就绪摘要]` 前缀的普通用户消息投递（可审计）；若后续需要精确的 `source.kind='inject'`，再评估结构化构造 UserMessage（插件运行时不能 import `@deepseek-ai/dsh-llm`，见交接文档 §3.4）。
4. `needs-input`/`error` 用 oneshot：唤醒一次后自动解除，条件仍成立时靠下一轮 LT 快照重arm。
5. 用户消息永远直通唤醒，不受预算限制。

### 6.5 合并、去重、序号

- **同源合并**：每源每 `EdgeKind` 只保留一条待上报边（`level` 已存真相，边只表示「有新闻」）；50 个 `tool/result` 折叠成 1 条带 `count` 的边。
- **去重**：`Edge.key` = `ask:<id>` / `turn:<turn>` / `job:<id>:settled` / `subagent:<runId>` / `workspace:<id>:<op>`；`dedupeTtlMs` 内抑制，LRU 上限 1024。
- **序号守卫**：每源 `seq` 丢弃旧输入；mux revision 全局单调；follow 端拒绝 `revision <= lastSeen`，缺口时强制 `reset` + 全量 `snapshot()`。
- **强制过滤**：丢弃 job `output` 事件（参考 `packages/api/job-controller/src/rows.ts:37`）、丢弃 `assistant/*` 流正文、`tool/result` 只保留 `{callId,name,isError,bytes}` 元数据，绝不把大内容拷进边。

### 6.6 溢出与淘汰

- 上限：单源 256 条边、全局 4096 条；溢出时**先丢低优先级再丢最旧**，递增 `dropped`，向 follower 发 `{type:'reset', reason:'overflow'}`，并在下一个 digest 标 `gaps:true`（管理员先 `snapshot()` 再行动）。
- 终态源（settled job / ended subagent / 结束的 schedule）保留 `terminalTtlMs`（10 分钟）后淘汰；`session/disposed`/`job removed` 立即注销。

### 6.7 失败模式与对策

| 失败 | 对策 |
| --- | --- |
| 面板断线/重连，live 事件无重放 | 每代 `follow` 先发一份 baseline；revision 缺口 → `reset` + `snapshot()`；冷会话列表由现有 `api-session` 列表/`follow` 快照补齐 |
| 长工具输出 / job output 风暴 | 元数据边 + 过滤 `output` + 同源合并 + digest 字节上限 |
| 管理员忙 | `maxOutstanding=1`、skip-while-busy、下次空闲聚合；始终报告 `dropped/gaps` |
| 唤醒风暴/自震荡 | 默认只唤醒 needs-input/error；`minIntervalMs` 下限；管理员自己的源 `interest.progress=false` |
| waterfall 误用破坏审批链 | 审批/提问状态从 durable `approval/asked|decided` 派生；若监听 waterfall，必须 `await next()` |
| 持久化写交错 | 复用 ledger 的 per-session 写链（`ledger.ts:497`），mux 不直接碰域写 |
| 快照过大 | 一个合并窗口一帧；超过约 2k 源时改增量 + 周期性 baseline |
| 重复/乱序投递 | `domain/changed` 过滤 `domain==='workspace'`；每源 seq 守卫；`removed` 视为终局 |


## 7. 管理 Agent 设计

### 7.1 身份与生命周期

- 插件存储域里保存 `managerSessionId`（首次懒创建）。管理员会话是一个**普通 DSH Session**：固定标题（如「DSH 管理台」）、可审计、可 fork、可在主界面继续聊。
- 建议给它一个专用工作区（例如 `~/Documents/deepseek-harness/dsh-console`）或复用用户的默认工作区；工作区路径可配置。好处：侧栏可见、cwd 合理、能直接在工作区目录里读写。
- **常驻 = 可随时唤醒，不是一直跑模型**：
  - 面板发消息 → Host route → `sessionController.prompt(...)`；内部 `resolveAgent` 自动冷恢复并去重并发恢复（证据 `packages/api/session-controller/src/agent.ts:200`、`commands.ts:513`）。
  - 冷恢复同样会触发 `agent/created`（`source` 含 `resume`，证据 `packages/core/agent/src/runtime-types.ts:125,261`），插件据此在恢复出来的 Agent 作用域里重新注册管理工具/系统提示，所以「工具只在管理员会话里存在」在冷启动路径同样成立。
  - **现状没有 idle 回收**：调研确认 core/host/bundle 里没有任何 idle-timeout；`sessionController` 的 resume 路径还会丢弃 `AgentHandle`（`agent.ts:440-444`），因此 GUI 打开过的会话在本进程内一直保活。结论：`agents.get(managerId)` 大概率在线，但**绝不能假设**（重启后必为冷），一切以 `sessionController.prompt` 的自动恢复为准。
  - 空闲时管理员不运行，不产生 token 成本；会话本身持久化。
  - 插件不长期持有 Agent handle：`sessionController.create` 没有 setup 钩子，且 `AgentHandle` 是唯一的销毁能力（`packages/core/agent/src/index.ts:146-163`），拿别人的 handle 反而制造生命周期冲突；用 `agent/created` 做作用域注册即可。
- 插件卸载/重载：会话保留；重新加载后按需恢复。

### 7.1.1 上下文注入：用动态 system prompt context，而不是 inbox 消息

管理员需要「当前选区」「最近就绪项」「任务概览」这类滚动上下文。两种做法：

- ❌ 用 `agent.inject(UserMessage)` 往 inbox 塞消息：插件运行时不能 import `@deepseek-ai/dsh-llm`，只能手写 UserMessage 结构；而且会让上下文进入会话日志、需要去重。
- ✅ 用 `agent.ctx.systemPrompt.context({ name, order, text: () => formatContext() })` 注册**动态上下文**：每次组装系统提示时读取插件域里的最新选区/就绪项/任务概览，模型每次都看到当前值，不产生 inbox 消息、不唤醒、不重复。选区变化只改域状态，下一次模型调用自然生效。

`sessionController.prompt` 只用于「用户真的发了一句话」，`systemPrompt.context` 用于「上下文」；两者职责分开。

### 7.1.2 首次创建（懒创建流程）

1. 首次需要管理员时（面板打开 or 第一条消息），插件读域里的 `managerSessionId`；没有就创建：
   - 确保管理目录存在（Host 进程直接 `mkdir -p`，例如 `~/Documents/deepseek-harness/dsh-console`），经 `workspaceRegistry.resolveByPath` → `create` 注册成工作区（同 `dsh-workspace-autoregister` 的调用方式）；
   - `sessionController.create({ workspaceId })`（workspaceId 与 cwd 二选一，传 workspaceId 时 cwd 自动取工作区路径）得到会话 id；
   - 可选：调用会话重命名设置为「DSH 管理台」，并把 id 写回插件域（幂等，重试复用同一个 id）。
2. **创建后立即 prompt**：新建的空白会话在侧栏是隐藏的（`blank` 直到第一次 `turn/start`），而冷列表又要求 `header.cwd` 存在——所以「创建 → 立刻发第一条消息」既让会话可见，也避免用户看到一个空白管理员行。首次创建失败/未选模型时面板显示可重试错误。
3. 模型选择：管理员会话沿用 profile 默认模型；若 profile 没有默认模型，创建仍成功，但第一次 prompt 会报「未选模型」——面板要把这个错误显式展示并给「选择模型」入口（复用主界面模型选择）。
4. 并发保护：首次创建与冷恢复都串行化（插件内 promise 链），避免两个面板请求各建一个管理会话；`sessionController.create` 支持传入 `sessionId` 做幂等复用。
5. 失败：创建/注册失败只影响管理中心 tab（显示可重试错误），不影响看板。

### 7.2 工具集（只在管理员 Agent 的作用域注册）

注册机制：`ctx.on('agent/created', ({ agent }) => ...)` 里按 `agent.id === managerSessionId` 匹配，然后 `agent.ctx.tools.register(defineTool(...))`；`agent/disposed` 与插件卸载时释放。`agent/created` 在**创建和冷恢复两条路径**都会触发（`source` 分别是 `startup`/`resume`），这是 `sessionController.create` 没有 setup 钩子时唯一可靠的挂载点；模式照抄 agent-team（`packages/experimental/tool-agent-team/src/index.ts:169,423`）。

> 备选方案：用 `ctx.agentPresets.register({ id: 'manager', plugins: [...] })` 注册一个运行时预设，把管理工具打包进预设，`sessionController.create({ agentPreset: 'manager' })`。适合以后把「管理能力」做成可分发预设；M1 用 `agent/created` 更简单，也避免与 profile 预设命名冲突。

| 工具 | 作用 | 只读? |
| --- | --- | --- |
| `workspace_overview` | 工作区列表 + 聚合状态 + 会话数 + 任务数 | ✅ |
| `workspace_sessions` | 指定工作区的会话（标题、状态、最后活动、归档、任务） | ✅ |
| `session_status` | 单会话/任务会话的运行状态、最后结果、等待事项、冷进度（`sessionController.projections`：turnBoundary/sessionStats/goal） | ✅ |
| `read_selection` | 面板当前勾选的工作区/会话 | ✅ |
| `assign_task` | 在工作区创建会话并投递任务 brief，登记任务 → 会话映射 | ❌ |
| `list_tasks` / `update_task` | 任务看板维护（claim、blocked、done、notes） | ❌ |
| `report_progress` | 给面板写一条进度摘要（不投递模型） | ❌ |
| `watch` | 订阅某工作区/会话的唤醒策略 | ❌ |

配套 `systemPrompt.section`（角色、工具契约、选区协议、成本约束）+ `systemPrompt.context`（当前选区、最近就绪项、任务概览）。

**读取边界（调研结论）**：

- 其它会话的后台作业不能通过 `ctx.jobs` 读——`ctx.jobs.list/get/read` 的 `caller` 必须是该作业的属主会话；管理工具只能从**目标会话的 durable 事件**（`job/registered`/`job/settled`、`tool/result`）或 `sessionController.projections` 派生进度。
- `sessionController.cancel`、`ctx.goals.get(agent)`、`agents.get(id).status` 都是 live-only；冷会话要把 `sessionController.projections({sessionId})` 作为事实来源。
- `subagents.prompt` 只用于「有 live 直接父会话的 subagent 子会话」，不能给普通会话发消息；跨普通会话只能走 `sessionController.prompt`。

### 7.3 能力边界

- 管理员可创建会话、发消息、维护任务；**不可**归档/删除会话、停止他人任务——除非用户显式要求，且走 DSH 原有 approval 路径。
- 面板默认只把**结构化元数据**（id/标题/状态/耗时）放进管理员上下文；会话正文由管理员按需用只读工具拉取，并在面板标识「已读取正文」。
- 模型沿用 profile 默认选择，不写死 provider（交接文档 §7.3）；管理员会话的模型可单独选择（复用会话模型选择机制）。
- **API 边界（调研结论）**：`sessionController.prompt` 的 provenance 恒为 `user`（`packages/api/session-controller/src/index.ts:478-485`），自动 digest 只能以「用户消息」形态出现（v1 接受，前缀标明系统来源）；`cancel`/`goals.get`/`agent.status` 是 live-only；`subagents.prompt` 只对「有 live 直接父会话的 subagent 子会话」有效；没有 `agents.sendMessage`。因此管理员对普通会话的唯一写入口是 `sessionController.prompt`。
- 管理员会话由 `sessionController` 创建，插件**拿不到可销毁的 handle**（`AgentHandle` 是唯一销毁能力）；不假设能主动结束管理员会话，靠归档/用户操作或宿主退出。

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

- 状态机：`pending → assigned → running → blocked|done|failed`；`running` 与进度由 mux 从会话事件派生（turn 结束、错误、等待输入；作业事实取该会话日志里的 `job/registered|settled`/`tool/result`，或 `sessionController.projections`，**不能**直接读别人的 `ctx.jobs`），**不由模型口述**；`done/failed` 需要管理员显式标记（附证据摘要），面板显示模型声明与事件证据。
- 与 DSH 原生对象的关系：任务不是 `goal`，但可以带 `goalId` 关联（M4）；不复制 DSH 的真相（会话/作业状态仍以 DSH 服务为准）。
- 域打不开时降级为内存任务表（面板仍可用，重启丢任务记录），不阻塞插件（交接文档 §4.2/§7.7）。

## 9. 面板 UI 设计

### 9.1 位置与形态（调研结论：overlay 抽屉优先，dock tab 降级）

**主方案：新增一个 `shell.overlay` 列表条目 `session-board.manager`，画成右侧抽屉。** 理由（均为源码核对）：

- `shell.overlay` 是 additive list seat，跨主面板导航常驻（`packages/client/ui-layout/src/client/index.ts:105`、`AppFrame.tsx:249,292`）；
- overlay 层是 `position:absolute`，不会干扰现有 dock adapter 的 in-flow 列检测（`AppFrame.module.css:281-286`、`dock-adapter.ts:153`）；
- **它在 slot 树内**，因此可以用 `SessionProvider` + `renderFactorySlot('conversation.content', { variant: 'embedded' })` 嵌入**官方聊天**：输入框、模型选择、流式、工具卡全部白送，和 ui-subagent 侧栏聊天是同一套做法（`packages/client/ui-subagent/src/client/sidebar-chat/index.tsx:129-169`）；
- 现有 dock 列是手工 DOM 根、不在 slot 树内（`plugins/dsh-session-board/src/client/index.tsx:599-605`），**无法**嵌入官方聊天，只能自绘 transcript——所以 dock tab 只作为降级形态。

面板（抽屉）自上而下：

1. **工作区看板**：复用 `buildWorkspaceNodes`（`src/client/workspace-tree.ts:8-46`）与 `BoardModel.groups`，每个工作区一行/一 tile，显示聚合状态（运行中/等待输入/出错/任务数）；点击设置 `focusedWorkspaceId`。
2. **会话列表**：复用 `BoardList`/`SessionCard` 的只读部分（`BoardList.tsx:100-124`、`SessionCard.tsx:150-173`），过滤到 `focusedWorkspaceId`；checkbox + aria 已有现成结构（`SessionCard.tsx:160-171`），但**不复用 `BatchController`**（它带归档阶段与 50 条上限：`src/client/batch.ts:5-11,82`、`src/shared/archive.ts:51`）。
3. **官方聊天**：`<SessionProvider session={managerReference}>` + `renderFactorySlot('conversation.content', { variant:'embedded', phase, hero }, …)`（见 §9.3）。

响应式/无障碍：

- 抽屉覆盖内容而非挤压布局；处理 macOS 顶栏留白（沿用 `css.ts:675-677` 的既有偏移做法）、`pointer-events:auto`；
- **不**抢焦点（只有全屏看板用 `modal-focus.ts`）；窄屏变整屏抽屉；
- 新样式只用 `--dsw-*` 主题 token；新增 `:hover` 规则要包 `@media (hover:hover)`（现有样式有未 gating 的先例，`css.ts:167,231,341,540`）；
- 新文案必须 `en`+`zh` 同步（`tests/locales.spec.ts` 会校验键集合/占位符/空串）。

### 9.2 选区同步与「发给管理员」

**选区状态**

- 客户端 `ManagerController`（新 store，扩展现有 ViewState/localStorage：`src/client/index.tsx:105-127,444-462`）保存 `{managerSessionId?, focusedWorkspaceId, selected, wakeEnabled}`；
- 需要让管理 Agent 的工具看到选区时，才写 Host durable mirror（`POST /api/session-board/manager/selection`），由 `manager_state` 保存；纯前端勾选可以只留在本地（churn 不进 Host）。

**发送路径（关键决策）**

- 面板发消息**不新增 Host prompt 路由**，直接用客户端官方 remote 路径：`sessions.retain(managerSessionId, { source: 'sessionBoardManager' })` → `await reference.ready` → `reference.binding.session.prompt([{ type:'text', text }], 'queue')`（GUI 的发送就是这个路径：`packages/client/ui-conversation/src/client/service.ts:210-213` → `packages/api/session-controller/src/client/sessions/session.ts:271-277` → Host `@Remote('prompt')`）。
- 理由：消息本来就必须落到会话日志（模型可见 ⟺ 已记录），Host 再包一层只会重复实现并绕开现有鉴权/去重；`requestId` 去重、断线重试都由该路径保证。
- 「发送选区」是一个显式按钮（一次点击 = 一条排队消息）；可选的自动同步只在 ≥500ms 防抖后发一条摘要，并在 UI 标注「会消耗一次模型调用」。
- 选区的**动态上下文**仍由 Host 的 `systemPrompt.context` 提供（§7.1.1）：不需要每次勾选都发消息，管理员下次被唤醒时自动看到最新选区。

### 9.3 对话与回复渲染（三方案对比）

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **(a) 嵌入官方聊天（推荐）** | `SessionProvider` + `conversation.content` factory 的 `embedded` variant，子 slot `session-board.manager.chat`（single/session scope）提供 `SessionProvider` | 输入框、模型选择、流式、工具卡、审批提示全部复用官方实现；和侧栏子代理聊天同款 | 依赖 in-tree `conversation.content`/`embedded` 契约，版本漂移要探测降级 |
| (b) 轻量 transcript | `sessions.retain` → `binding.session.projections.faceOf('turnOutline')`（每轮 `{turn,seq,prompt,response≤120}`）或 `binding.eventSource`（durable + `assistant/live-chunk`） | 位置无关、数据有界、实现简单 | 自绘格式/滚动，预览截断，无审批 UI，按消息而非按 token 发布 |
| (c) 打开主界面 | `uiWorkspace.openSession(managerSessionId)` | 零重复 | 不是「面板内对话」 |

**推荐**：抽屉用 (a)；(b) 作为 `conversation.content` 不可用/契约变更时的降级；面板头部始终提供 (c) 的「在主界面打开」。管理员的 approval/待回答交互在面板里不可操作 → 显示 pending 状态 + 引导到主界面。

注册骨架（示意）：

```ts
scopedSlots.inject('shell.overlay', () => scopedSlots.register({
  name: 'shell.overlay',
  id: 'session-board.manager',
  order: 60,                    // 现有看板是 40
  locale: NS,
  children: { 'session-board.manager.chat': { kind: 'single', scope: 'session' } },
  inject: () => ({ face: managerFace }),
}, ManagerDrawerSlot))
```

### 9.4 任务/进度展示

- 任务卡：标题、状态色、关联工作区/会话、最近事件时间、进度摘要（来自 mux 派生的 turn/作业事实）。
- 点击任务 → `uiWorkspace.openSession(task.sessionId)`（复用现有导航路径，`src/client/index.tsx:507-553`）。
- 自动唤醒开关 + 预算剩余 + 「暂停自动管理」；每次自动唤醒在面板留痕（原因 + 摘要）。

### 9.5 新增客户端模块（建议）

1. `src/client/manager/controller.ts`：`ManagerController`（选区、focused workspace、managerSessionId、phase），沿用现有 store/hooks 模式；
2. `src/client/manager/session-link.ts`：`sessions.retain` 生命周期（`CleanupStack` 释放）、`ready`、`send`、状态；只把 `SessionReference` 交给 `SessionProvider`；
3. `src/shared/manager.ts`：纯函数 `buildSelectionMessage(...)`、`managerPhase(...)`，像 `batch.ts` 一样单测；
4. 可选 durable mirror（跨设备/给工具读）：复用现有 prefs 域的额外 key，不升域版本（normalize-not-throw，交接文档 §4.2）。

## 10. 协议草案

**大部分交互不需要新路由**：面板 → 管理员的消息走客户端 `session.prompt`（见 §9.2）；面板数据来自现有 client 服务（sessions/workspaces/jobs/uiSession）与 mux SSE。新增路由只承载**durable 事实**与 mux 快照/增量。

| 方法/路径 | 请求 | 响应 | 说明 |
| --- | --- | --- | --- |
| `GET /api/session-board/manager/state` | — | `{ managerSessionId?, selection, tasks, muxRevision, wakePolicy }` | 面板初始化 / 断线重连；`connection.fetch` 自带信任栅栏 |
| `POST /api/session-board/manager/selection` | `{ workspaceIds, sessionIds }` | `{ accepted, revision }` | durable 选区 mirror（给管理工具与动态上下文用） |
| `POST /api/session-board/manager/task` | `{ action: 'create'｜'update', task }` | `{ task }` | 面板任务卡操作；管理工具走同一域 |
| `GET /dsh-session-board/mux/stream` | — | SSE：`baseline` / `delta` / `removed` / `reset` + revision | 裸 `webServer` 路由必须自己调 `requestRejection`（交接文档 §7.6） |

选区消息格式（客户端在发送时组装进一条 user message，服务端无需再拼）：

```text
[选区] 工作区 A（3 会话，其中 1 个运行中）；会话 s1（等待输入）、s2（已完成）
[任务] t1「重构缓存层」→ s3 运行中（12 分钟）
[用户] 把 s1 卡住的问题整理一下，然后给工作区 B 建一个任务
```

（`[任务]` 段可选，由客户端从 `GET /manager/state` 拿到的任务快照组装；管理员也可以自己用工具查。）

## 11. 安全、成本与可靠性

- **写入边界**：管理员只做「建会话 / 发消息 / 任务记录 / 选区」；归档、删除、停止必须走用户显式指令与 DSH 原生 approval。面板按钮与工具提示明确标注。
- **数据最小化**：默认只同步结构化元数据；拉取会话正文要显式（工具调用记录 + 面板标记）。
- **成本控制**：自动唤醒默认关；预算、优先级、静默时段、`onlyWhenManagerIdle`；一次唤醒一个 digest；面板显示预算消耗。「发送选区」是显式动作（= 一条排队消息），勾选本身不发消息。
- **幂等**：消息带 `requestId`；任务更新带 revision（CAS）；重复的选区同步合并。
- **可观测**：所有自动唤醒、任务状态迁移、mux 丢弃计数写 `ctx.logger`（前缀 `dsh-session-board:`）+ 面板「最近活动」。
- **waterfall 安全**：`approval/request`、`user-questions/request`、`workspace/session-activity` 都是 waterfall；mux 不直接订阅它们，靠 durable 的 `approval/asked|decided` 派生；任何必须监听 waterfall 的场合都要 `await next()`，否则会破坏审批/归档链。
- **UI 生命周期**：抽屉持有 `sessions.retain` 的 manager 引用，必须在 CleanupStack 里 release（否则历史/流一直开着）；`conversation.content`/`embedded` 是 in-tree 契约，必须做能力探测 + 轻量 transcript 降级，不能假定永远存在。
- **卸载/降级**：任何新增域/路由/连接失败都降级（面板只读或隐藏管理中心入口），不阻塞现有看板（交接文档 §4.2）。

## 12. 里程碑

| 阶段 | 内容 | 产出/验收 |
| --- | --- | --- |
| **M0 技术验证**（1–2 天） | ① 客户端 `sessions.retain(manager)` + `session.prompt` 冷恢复并唤醒；② `agent/created` 作用域注册测试工具；③ 动态 `systemPrompt.context` 生效；④ overlay 抽屉里 `SessionProvider` + `conversation.content`（embedded）能渲染管理会话 | 合成数据单测/脚本通过；手测在抽屉原型里发消息能得到回复；§15 清单全绿 |
| **M1 只读 mux + 抽屉骨架**（3–5 天） | 纯 `EventMux`/`WakePolicy`（`src/host/mux/`）+ 单测；按顺序接 `session/event` + `agent/status` + `jobs.events`，面板 SSE 改 revision 增量（当前 feed 无栅栏，是新工作），再加 `subagent/*` / `domain.changed`；`shell.overlay` 抽屉 + 工作区看板 + 会话列表（只读，复用 BoardModel） | mux 单测（合并/去重/溢出/断线 reset）；抽屉组件测试；数据与现有 Board 一致 |
| **M2 对话 + 选区**（3–5 天） | 嵌入官方聊天（`SessionProvider` + `conversation.content`，带能力探测与轻量 transcript 降级）；「发送选区」= retain→`session.prompt`；选区 durable mirror + 动态 system prompt context；「在主界面打开」 | 选区/消息端到端手测；断线重连 resync；审批 pending 状态正确引导 |
| **M3 任务 + 管理工具**（5–8 天） | 任务域、`assign_task`/`update_task`/`report_progress`、任务卡与进度派生、watch | 任务状态机单测；派单→会话→进度→完成闭环 |
| **M4 自动化与打磨**（5 天+） | 自动唤醒预算/静默/暂停、面板留痕、i18n 完善、响应式与性能、回归、按 §6 发版 | 全量 `npm run check` 绿；版本 0.4.0 发布 |

每个阶段都按交接文档 §5 闭环（`npm run check` → `npm run build` → 安装到验证实例 → 完全重启 → 手测），并按 §6 发布（版本递增、CHANGELOG、SHA256SUMS）。

## 13. 风险与开放问题

**风险**

1. **成本失控**：自动唤醒是最容易失控的点 → 默认关闭 + 预算 + digest 合并；「发送选区」显式化；面板显著展示消耗。
2. **权限越界**：管理员若被赋予破坏性工具，误操作影响真实工作区 → 默认只读 + 建会话/发消息，破坏性动作走用户指令与 approval。
3. **依赖 in-tree 聊天契约**：`conversation.content`/`embedded` 是 DSH 内部契约，升级可能改名/改形状 → 能力探测 + 轻量 transcript 降级 + 主界面打开兜底（M0 先验证）。
4. **dock 契约版本敏感**：现有 dock adapter 认不出布局就整体不挂载 → 管理中心入口放 overlay，dock 只作为降级形态，不能只依赖 dock。
5. **宿主 API 漂移**：Host 请求/返回值类型必须由插件重新声明（不能 import），升级可能静默漂移 → 固定验证过的版本、fail loud（交接文档 §2.3）。
6. **事件语义缺口**：approval/user-question 的「等待输入」是 waterfall 且非 durable 事件；面板状态从 `approval/asked|decided` 派生，M0 核对覆盖度。
7. **任务完成判定**：模型自述完成不可信 → 进度/完成以 turn 结束、错误、作业事实为证据，面板并列显示。
8. **多实例**：桌面与 Dev3 各自有独立 store，管理员会话不跨实例；配置里需标明。
9. **长历史**：管理员会话会越来越长 → 摘要/分页、必要时 fork 新会话（保留审计）。

**开放问题**

1. 任务的最终归属：独立任务域 vs DSH `goal` vs 复用 Agent Teams 任务板？（建议：先独立域，后续把 task 投影成 goal/team task 二选一）
2. 是否需要「每个工作区一个管理员」？先做单例，多实例是 M5+。
3. 自动唤醒是否用 DSH `schedule` 计时器做「定时巡检」，而不是纯事件驱动？
4. 管理员是否应该默认拥有 `subagent` 工具（自己派子代理干活）？建议 M3 再放开。
5. 面板是否要支持「拖拽会话到任务区」的交互（更直观的派任务）？

## 14. 证据索引（写实现前复核）

| 结论 | 证据 |
| --- | --- |
| `sessionController.prompt` 自动 resolve/冷恢复，并发 resume 去重；`mode:'queue'` 走 `agent.followup` | `packages/api/session-controller/src/index.ts:461`、`commands.ts:319,513`、`agent.ts:200,278` |
| 普通会话创建/复用 + 工作区挂载；**没有 setup 钩子**；workspaceId XOR cwd | `packages/api/session-controller/src/commands.ts:104,111`、`agent.ts:387-401,563-580` |
| 无 idle 回收；`resumeObserved` 丢弃 handle；`AgentHandle.dispose` 是唯一销毁能力 | `packages/core/agent/src/index.ts:146-163`、`packages/api/session-controller/src/agent.ts:440-444` |
| Agent 作用域工具注册与清理；`agent/created` 在创建与冷恢复都触发；`tools.restrict` 只过滤继承工具 | `packages/experimental/tool-agent-team/src/index.ts:169,423`、`packages/core/agent/src/runtime-types.ts:125,261`、`packages/core/tools/src/index.ts:1105-1219` |
| 动态 system prompt context（`text` 可为函数） | `packages/core/system-prompt/src/index.ts:79` |
| 其它会话的后台作业不能跨属主读取（caller 必须是属主） | `packages/jobs/jobs/src/index.ts:120-163` |
| `session/event` 语义与类型；turn 结果枚举；审批 durability 与 waterfall 区别 | `packages/core/session/src/types.ts:202-230,282-376`、`packages/interaction/user-approval/src/types.ts:44,55,87` |
| 现有 Host/Client 分层、SSE feed（无 revision 栅栏）、storage 域、dock/overlay slot | `plugins/dsh-session-board/src/{host/plugin.ts,host/routes.ts,host/ledger.ts,client/index.tsx,client/dock-adapter.ts}`、`packages/api/workspace-controller/src/feed.ts:75-196` |
| 面板应放在 `shell.overlay`，可嵌入官方聊天；`session.prompt` 是客户端发送路径 | `packages/client/ui-layout/src/client/index.ts:105`、`packages/client/ui-subagent/src/client/sidebar-chat/index.tsx:129-169`、`packages/api/session-controller/src/client/contract/sessions.ts:58`、`packages/client/ui-conversation/src/client/service.ts:210-213` |
| 官方聊天 factory / SessionProvider 作用域 | `packages/client/ui-conversation/src/client/contract/slots.ts:303-318`、`packages/client/ui-renderer/src/client/scoped-slots.tsx:556,586-592` |
| `BatchController` 有归档阶段与 50 条上限，不能复用于管理选区 | `plugins/dsh-session-board/src/shared/archive.ts:51`、`src/client/batch.ts:5-11,82` |
| Agent Teams 的 Lead/任务板/消息先例 | `packages/experimental/agent-team/README.md`、`src/roster.ts`、`src/task-board.ts` |
| 插件运行时依赖/注入/重启/版本规则 | `docs/plugin-development-handoff.md` §3.3–§3.4、§6、§7 |

## 15. M0 验证清单（动手前逐项通过）

| # | 要验证的假设 | 做法 | 通过标准 |
| --- | --- | --- | --- |
| 1 | 客户端能 retain 管理员会话并冷恢复 | 面板原型：`sessions.retain` → `session.prompt` 向**未在线**的已持久化会话发消息 | 会话恢复并产生 turn；重复调用不重复恢复；错误码可展示 |
| 2 | 冷恢复触发 `agent/created`，可注册 scoped 工具 | 临时 Host 插件监听 `agent/created`，对固定 id 注册 echo 工具 | 恢复后的会话能看到并调用该工具 |
| 3 | 动态 `systemPrompt.context` 每次组装读域状态 | 注册 `text: () => 选区摘要`，改域状态后发下一轮 | 请求上下文随状态变化；无额外 inbox 消息 |
| 4 | 全局 `session/event` 订阅 + O(1) 折叠扛得住多会话 | 复用 session-board ledger 订阅，加 mux 折叠/coalesce | 无阻塞、无漏事件；繁忙时 CPU 可接受 |
| 5 | mux digest 质量与预算 | 合成事件流（等待输入/错误/完成/长跑）单测 | 就绪集合符合优先级、无重复、预算生效 |
| 6 | overlay 抽屉能嵌入官方聊天 | 注册 `shell.overlay` + 子 slot，`SessionProvider` + `conversation.content`（`embedded`）渲染管理会话 | 输入框/流式/工具卡可用；不可用时能探测并回退轻量 transcript |
| 7 | 在运行中的 Dev3 上无模型额度验证 | 交接文档 §5.3 的 CDP 方法（渲染 9262 / Host inspector 9270） | 不改用户数据即可触发并断言 |
| 8 | 目标 DSH 版本存在所需契约 | 对 `conversation.content`、`embedded` variant、`sessions.retain`、`session.prompt` 做运行时能力探测 | 缺失时面板降级而不是白屏 |

M0 通过后再开 M1，避免把「面板 UI」建在一个没验证的 Agent 通道/聊天契约上。

## 16. 实现状态（0.4.0，2026-10-20）

已按本设计落地首个可用版本：`dsh-session-board` 0.4.0（Host + Client），并在 **Harness Dev3**（隔离 `~/.dsh-dev3`，dev 构建 `0.2.1-rc.2-687f282`）完成实测。

**已实现**

- **Host**
  - `src/host/manager/mux.ts`：EventMux（`session/event` + `agent/status` 折叠为 level 状态 + 有界 edge 队列，优先级/去重/上限/dropped 计数/digest）。
  - `src/host/manager/domain.ts`：独立存储域 `dsh_session_board_manager` v1（manager 身份/选区/wake 偏好 + 任务表，normalize-not-throw）。
  - `src/host/manager/service.ts`：懒创建管理会话（先持久化 id 再创建，保证 `agent/created` 能识别首个 Agent）、冷恢复后重新安装工具/提示词、选区镜像、任务板、`assign_task`、自动唤醒（默认关闭、空闲 + 每分钟一次）。
  - `src/host/manager/tools.ts`：9 个管理工具（以 `ToolDefinition` 结构声明，运行时不导入 `@deepseek-ai/*`）。
  - `src/host/manager/routes.ts`：3 条已认证 JSON 路由（`/api/session-board/manager/{state,selection,task}`，沿用 `connection.fetch` 信任栅栏）。
  - `src/host/manager/wiring.ts`：嵌套 `ctx.inject` 装配；缺少 session/workspace/agent 服务时只隐藏管理中心。
- **Client**
  - `src/client/manager/{controller,ManagerDrawer,ManagerChat}.tsx`：右侧 `shell.overlay` 抽屉 + `sidebar.footer.action`/会话头部双入口；工作区看板 → 会话勾选 → 选区发送；官方 `conversation.content`（embedded）聊天，输入框/流式/工具卡/ask 全部复用；打开期间 4s 轮询宿主状态（勾选不会被覆盖）。
  - 选区发送走官方 `sessions.retain → binding.session.prompt(...,'queue')`，不新增 prompt 路由。
- **Tests**：`manager-mux/domain/shared/tools` 4 个 spec（88 个用例），插件全量 28 文件 / 414 用例通过；`vitest.config.ts` 让嵌套检出也能复现 `npm run check`。

**与设计稿的偏差（有意）**

- 面板**没有**新增 mux SSE：会话/工作区数据继续用现有 client model，任务/选区用 4s 轮询；mux 目前只服务管理工具与自动唤醒 digest。M4 可再切换为 revision 增量流。
- `needs-input` 优先级是**保留位**：0.4.0 未订阅 live waterfall 的审批/提问事件（避免截断链路），后续从 durable `approval/asked|decided` 派生。
- 自动唤醒没有独立开关路由；由管理工具 `set_auto_wake` / 持久化字段控制，面板只展示 `wakeEnabled` 未渲染开关。
- 管理目录默认 `~/Documents/deepseek-harness/dsh-console`，可用环境变量 `DSH_SESSION_BOARD_MANAGER_DIR` 覆盖（0.4.0 暂未走 `Config` schema）。

**Dev3 实测记录**

1. 安装（Dev3 插件管理器，本地目录 link）→ 重启 Dev3 → 插件页显示「运行中」，侧栏底部出现「管理面板」。
2. 打开抽屉：自动创建 `dsh-console` 工作区 + 「DSH 管理台」会话；工作区看板列出 default-workspace（2 会话）与 dsh-console（1 会话）。
3. 管理对话：`workspace_overview` 返回两个工作区的会话/任务计数（工具调用卡片可见）；`assign_task` 在 default-workspace 创建会话并登记任务，任务卡显示「已分配」；ask 提问选项在嵌入式聊天里正常渲染。
4. 勾选工作区/会话 →「发送选区给管理员」→ 管理会话收到 `[选区]` 消息并调用 `session_status` / `list_tasks` 后询问下一步。
5. 持久化核对：`~/.dsh-dev3/storages/workspace.json`（dsh-console 注册、default-workspace 2 会话）与 `dsh_session_board_manager.json`（manager_state + manager_tasks）符合预期。

**后续**

- M4：mux SSE 增量、自动唤醒预算/暂停 UI、`approval/asked` 派生 needs-input、空工作区也列在面板、发布 0.4.0（版本/CHANGELOG/Release/SHA256SUMS 按交接文档 §6）。

## 17. 项目树与项目协调会话（0.7–0.8）

管理 Agent 是全局的；同一个 git 仓库在不同分支上开多个工作区时，还需要**按项目**组织与派活。0.7/0.8 在其上追加：

- **项目发现**：Host 只对 `workspaceRegistry.list()` 的路径执行 3 条短 git 命令（remote/branch/root），按归一化的 `origin`（https/ssh/scp 同 key）分组；120s 缓存、6 并发、单条失败降级为路径树。认证路由 `GET /api/session-board/workspace-meta` 返回 `{workspaceId,title,path,branch,projectKey,projectLabel,remote,root}`，remote 中的 userinfo 凭据在返回前脱敏。
- **项目树**：客户端分组方式「项目树」使用元数据把同一仓库的分支工作区收进项目节点（分支名为副标题），没有会话的分支也以 0 计数静态行展示；非 git 工作区保持原路径树；项目/路径节点复用现有可折叠树。
- **项目协调会话**：项目节点「项目会话」懒创建一个普通 DSH 会话（主工作区、`项目协调台 · <label>`），映射持久化在独立域 `dsh_session_board_projects`。工具：`project_overview`、`project_assign_task`（只允许项目内工作区，建任务会话+首条 brief）、`project_message_session`（项目内会话排队消息）、`project_session_status`；项目内工作会话额外获得 `report_to_coordinator`（可带 taskId，更新本项目任务备注）。协调→worker、worker→协调都走官方 `session.prompt`，可审计；不删除会话/工作区/git 数据。
- **幂等与恢复**：`ensure()` 先合并 in-flight 再读持久记录；持久记录存在但没有会话时先校验（list/inspect）再重建；创建失败回滚记录，重试可恢复；controller 改写的 session id 全程以实际 id 为准。
- **安全边界**：taskId 只能命中本项目任务；brief/消息/汇报/ID 限长；项目 key 在路由与 ensure 双重校验；旧协调记录的 remote 在打开时懒迁移为脱敏值。

设计取舍：暂不实现 git worktree 自动建分支（需确认命名/基分支策略）；子会话之间不直连，由协调会话转发。

