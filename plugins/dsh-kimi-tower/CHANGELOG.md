# Changelog

## 0.1.2 — 2026-11-25

塔台可视化：会话上方的进度 dock + 全屏只读画布。用户能第一次在界面里看到整支
worker 队伍的进度，并从画布直接跳进某个 worker 的会话。

- **进度 dock**：会话输入框上方按未结束任务出卡片，显示任务号/标题、worktree、
  worker 的实时 `模型 · 推理档`、任务进度、状态和已运行时长；点卡片打开 worker
  会话；运行中的卡片可以把 `/tower stop <mission>` 送进命令面板；任务完成或消失
  后卡片停留 4 秒再淡出。
- **塔台画布**：两个入口——dock 头部的「画布」按钮，以及会话头部的塔台图标按钮
  （零任务、刚 `/tower on` 时也能进）。画布画塔台、任务分组（详情密度含任务清单与
  范围卡）、worker/reviewer 卡片，以及派发 / 拥有 / 评审 / 依赖 / 消息连线；提供
  摘要/详情两种密度、全部/未完成/被阻塞筛选、拖拽平移、滚轮与按钮缩放、百分比复位、
  适应窗口、小地图、图例；右侧面板显示选中任务或 Agent 的清单/范围/依赖/阻塞/
  备注/最近评审/用户原话，另有消息流、评审历史、活动日志三个只读列表。
- **画布交互**：点 Agent 卡片的「打开会话」或双击卡片，切到该 Agent 的会话并关闭
  画布；Esc 关闭；Tab 焦点限制在画布内；关闭后焦点还原；打开期间页面其余部分
  `inert`；打开时立即轮询一次、之后约每 3 秒，页面隐藏或手势期间暂停，关闭后停止。
- **Host 快照**：新增只读 `GET /tower/state?sessionId=…&detail=1`，返回所有任务
  （含已合并/已放弃）的依赖、范围、任务、阻塞、备注、用户原话、关键产物与最近
  评审，以及 roster、消息元数据（含未读状态）、finding 和活动日志尾部。字段单行化
  并设硬上限（200 条消息、50 行日志、100 个任务等），不读消息正文、不加锁、不写入。
- **模型名修复**：`model.current` 按方法接收者调用（`current.call(model)`），
  并让一次成功的查找清除失败去重；dock 与画布上的模型名/推理档在真实 DSH 实例里
  不再整体丢失，失败只在 warn 级按 agent+消息去重记录。
- **测试**：新增 `test/canvas-contract.test.mjs`，从合成塔台仓库走真实 detail 路由
  再进真实 `layoutCanvas`，逐字段断言两端契约（含真实 `AgentModel` 形状），任意
  一端改字段名都会失败；`npm run check` 共 120 个测试全绿。
- **真实实例验证**：在独立 `dsh web` 0.2.2-rc.5 实例（临时 DSH home、临时 git
  仓库、合成塔台数据）里核对 dock、两个画布入口、节点/连线数量、筛选与密度、
  平移/缩放/适应窗口、小地图、图例、详情面板与三个列表、会话跳转、Esc/焦点/inert、
  轮询节奏，并留下浅色与深色截图（截图与日志只在 `/tmp`，不随包提交）。
- 文档：README 中英补「进度 dock / 塔台画布」章节与入口说明，`docs/DETAIL.md`
  补快照契约、布局、交互与可达性说明。

## 0.1.1 — 2026-11-23

从独立仓库收编进本仓库 `plugins/dsh-kimi-tower/`（来源 commit `4f3f07a`）；源码、提示词与构建产物保持不变，仅按本仓库约定调整包元数据。

- `package.json`：`version` 0.1.0 → 0.1.1；新增 `check` 脚本（`npm run typecheck && npm test`）；`files` 补 `CHANGELOG.md`；`dsh.manifestVersion` 设为 `1`。
- 新增 [UPSTREAM.md](UPSTREAM.md) 记录来源、迁入范围与差异；根 README 插件目录表与安装示例补上本插件。
- 验证：`npm run check` 通过（`tsc --noEmit` 零错误，`node --test` 21 个测试全部通过）；`npm pack --dry-run --ignore-scripts` 确认包内不含 `src/`、`test/`、`scripts/`、`tsconfig.json`、`package-lock.json`。

## 0.1.0

独立仓库初始版本，也是本仓库的收编基线；完整历史见来源仓库。
