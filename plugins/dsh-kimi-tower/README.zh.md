# dsh-kimi-tower

把 Kimi Code 的 **tower（塔台）模式**移植到 DeepSeek Harness 的插件：Host 侧提供
协议与工具，浏览器侧提供输入框上方的进度 dock 和全屏只读画布。

主 agent 变成塔台：把目标拆成任务单（mission），每个 worker 在独立 git worktree
和分支里执行，独立 reviewer 评审通过后才允许合并，所有协作消息落在
`.tower/comms/` 的文件收件箱里。

## 能力

- `/tower` 命令：`on`、`off`、`status`、`teardown`、`/tower <base-branch>`。
- 13 个模型工具：`tower_init`、`tower_plan`、`tower_spawn`、`tower_merge`、
  `tower_rebase`、`tower_teardown`、`tower_complete`、`tower_send`、
  `tower_inbox`、`tower_finding`、`tower_review`、`tower_mission`、
  `tower_status`。
- worker / reviewer 子代理：worker 的工作目录就是自己的 worktree，工具被限制；
  reviewer 只读审查分支。
- 合并门禁：build 需要 exact-tip 的 `clean + merge` 评审；artifact 需要人类对
  整个提交 tip 的显式验收；survey 零 diff 关闭。
- 守卫：塔台模式下禁用 `todo_write`、`subagent`、`subagent_fork`、`workflow`、
  `ralph`、`wait_agent`、`create_goal`；worker 不能写自己 worktree 之外的文件；
  bash 守卫拦下会毁掉 `.tower/comms/` 的 `rm -r`、`git reset --hard`、
  `git clean -fdx`。
- 模式状态从会话日志（`/tower` 的 `command/run`/`command/done`）折叠得到，
  重启、resume、fork 都能恢复。
- **进度 dock**：输入框上方按未结束任务出卡片，显示 worktree、worker 的
  `模型 · 推理档`、任务进度、状态和已运行时长；点卡片打开 worker 会话，运行中的
  卡片可停止，卡片刻完成后停留 4 秒再淡出。
- **塔台画布**：从 dock 头部的「画布」按钮或会话头部的塔台图标打开，全屏只读。
  任务分组 + Agent 卡片，派发 / 拥有 / 评审 / 依赖 / 消息连线；摘要与详情两种
  密度；全部 / 未完成 / 被阻塞筛选；平移、缩放、适应窗口、小地图、图例；右侧
  详情面板（清单、范围、依赖、阻塞、备注、最近评审、用户原话）和消息流 / 评审 /
  活动日志三个只读列表；点 Agent 的「打开会话」或双击卡片跳到该会话；Esc 关闭。

## 安装

在本目录执行：

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-kimi-tower
```

或在 DSH 的 **设置 → 插件 → 添加插件** 里选择本目录。

## 使用

1. 在 git 仓库里执行 `/tower on`（或 `/tower develop` 指定/创建本地基线分支）。
2. 用普通消息发送目标；塔台会 `tower_plan` 并 `tower_spawn`。
3. 用 `tower_status` 看板；普通消息可随时改需求。worker 完成和收件箱消息会自动唤醒塔台。
4. 只通过 `tower_merge` 合并；基线前进用 `tower_rebase`。
5. 所有任务单 merged/abandoned 后 `tower_teardown`，再 `/tower off`。

## 塔台画布

画布是浏览器侧的第二个入口，全部只读：

- **入口**：dock 头部的「画布」按钮；以及会话头部的塔台图标按钮——后者在塔台
  刚 `/tower on`、一个任务都还没有时也能打开画布。
- **图形**：中间是塔台卡片；两侧是任务分组（虚线框，详情密度里包含任务清单卡和
  范围卡）；外列是任务的 worker / reviewer。连线有「派发」「拥有 / 曾负责」
  「评审」「依赖」，以及按两点聚合的虚「消息」线（未读有单独色调）。
- **工具栏**：`摘要` / `详情` 两种密度，`全部` / `未完成` / `被阻塞` 三种筛选，
  拖拽（或方向键）平移、滚轮（或 `+`/`−`）缩放、百分比按钮恢复 100%、`0` 或
  按钮适应窗口、小地图、图例。
- **右侧面板**：选中任务或 Agent 后显示清单、范围、依赖、阻塞、备注、最近评审、
  用户原话；点消息线看该对端点的消息。三个只读列表：消息流、评审历史、活动日志。
- **模型与推理档**：Agent 卡片、详情面板、详情密度的任务头、dock 卡片都会显示
  Host 实时 `AgentModel` 的 `模型 · 推理档`（0.1.2 起按接收者调用 `current()`，
  真实 DSH 实例里不再丢失）。
- **会话跳转**：点 Agent 卡片上的「打开会话」（或双击卡片）切到该 Agent 的会话，
  画布同时关闭。
- **可达性**：打开时接管焦点、Tab 限制在画布内、页面其余部分 `inert`、Esc 只在
  画布是最上层时关闭，关闭后焦点还原到入口。
- **轮询**：打开时立即取一次快照，之后约每 3 秒一次；页面隐藏或正在平移/缩放时
  暂停，失败指数退避，关闭后停止。快照接口是只读的
  `GET /tower/state?sessionId=…&detail=1`，字段单行化并设硬上限，不返回消息正文。

> 路由定义里的 `auth: 'required'` 在 `dsh web` 的插件路由上并不生效：无页面 token
> 的本机 curl 也能拿到只读元数据（应用壳本身仍然 401）。数据是本机可读的只读元数据
> （无消息正文、无 CORS 头），不要把它当安全边界；0.1.2 验证时已作为 finding 上报。

## 限制

- 子代理继承塔台的模型，没有 Kimi 的 secondary model pool。
- worktree 是隔离不是安全沙箱，worker 使用当前 DSH 权限。
- bash 守卫只保留保护协议状态的那部分（不是 Kimi 的完整 AST 守卫）。
- `/tower` 依赖 DSH 的命令面板（Web 等交互端）。

## 开发

```sh
npm install
npm run build      # Host 侧 lib/index.js + 浏览器侧 lib/client.js
npm test           # 协议 + 集成 + dock/画布 + 契约测试
npm run check      # typecheck + test（0.1.2 时 120 个测试全绿）
```

`test/canvas-contract.test.mjs` 是从合成塔台仓库到真实 `detail=1` 路由、再到真实
`layoutCanvas` 的跨端契约测试：任意一端改字段名都会让它失败。

协议层 `src/protocol/` 近乎原样移植自 `kimi-code` 的 tower 实现（MIT，见
`NOTICE`）；DSH 接入层、命令、工具注册、子代理编排、投递与守卫、进度 dock 与
画布为本仓库实现。
