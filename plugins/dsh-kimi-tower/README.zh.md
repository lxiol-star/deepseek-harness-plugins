# dsh-kimi-tower

把 Kimi Code 的 **tower（塔台）模式**移植到 DeepSeek Harness 的 Host-only 插件。

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

## 限制

- 子代理继承塔台的模型，没有 Kimi 的 secondary model pool。
- worktree 是隔离不是安全沙箱，worker 使用当前 DSH 权限。
- bash 守卫只保留保护协议状态的那部分（不是 Kimi 的完整 AST 守卫）。
- `/tower` 依赖 DSH 的命令面板（Web 等交互端）。

## 开发

```sh
npm install
npm run build
npm test
npm run typecheck
```

协议层 `src/protocol/` 近乎原样移植自 `kimi-code` 的 tower 实现（MIT，见
`NOTICE`）；DSH 接入层、命令、工具注册、子代理编排、投递与守卫为本仓库实现。
