# dsh-superagent

一个作为 **DSH Bundle** 运行的主动式 Agent（Super-agent）：事件进入 **Source**，按 **Policy** 评估，通过则成为 **Ticket**，由独立的 **Executor Session** 在**对应的本地工作区**里执行。

本目录是 [hxh230802/dsh-superagent-prototype](https://github.com/hxh230802/dsh-superagent-prototype) 的 fork 收编版，并补上了两条**不依赖 GitHub** 的链路：本地工作区树 Source 与主会话任务直通。

## 触发方式

| 方式 | 说明 | 默认状态 |
| --- | --- | --- |
| **主会话对话** | 在 Super-agent 的主 Session 里直接说任务；`orchestrator_task` 开单，工单落在该会话当前工作区下的 `.dsh-superagent/work/<工单>` | 启用，**无需允许名单** |
| 本地工作区树 | 监听本机工作区目录内的文件活动；根目录留空时自动接入 DSH 工作区树 | 启用，未配置根目录时待配置 |
| 本机 MSP 节点 | 订阅 MSP 信号（`msp-ts`，进程内驱动，无轮询） | 启用 |
| GitHub | Issue / PR / 评论 / CI | 启用，未配置仓库时待处理 |
| 飞书 | 群/私聊消息（需 lark-cli 机器人） | 关闭 |

来源事件需要过 Policy：默认只评估、不建单；要让它们自动开工单，需在「评估 → 设置」里配置规则，或给来源加允许名单。主会话路径由操作者本人授权，不经名单。

## 安装

DSH 插件管理器里安装指定版本（需要 DSH `^0.2.1-alpha.2`）：

```
github:lxiol-star/deepseek-harness-plugins#dsh-superagent-v0.2.17&path:/plugins/dsh-superagent
```

也可以从本地目录安装（`设置 → 插件 → 添加插件` 填本地路径）。

安装后启用并**完全退出重启 DSH**，侧栏出现 **Superagent**。

0.2.6 起，输入框上方的**任务条**挂在对应对话框的 `conversation.input.dock` 槽位上，该槽位自 DSH `0.2.2-rc.5` 起提供（已在 rc.5 上验证）。更早的 DSH 没有这个槽位，任务条不会出现；那种环境下本版本未经测试。

## 使用

1. 打开 **Superagent → 打开主 Session**（或侧栏 `dsh-superagent orchestrator` 会话）。
2. 在输入框左下角选择工作区——工单就开在这个工作区下的 `.dsh-superagent/work/` 里。
3. 直接说任务，例如「在当前工作区把 README 的安装步骤补全，做完告诉我」。
4. 主 Session 调 `orchestrator_task` 开单，worker 在子工作树里执行，完成后把结果回报到主 Session。
5. 看进度：主会话输入框上方的**任务条**列出每张工单的阶段和进度，可收起成一颗带计数的药丸；侧栏的 **Superagent 画布** 把主会话、任务、执行器画成三列卡片，可平移、缩放、拖动。勾选一张工单，就能就它向主会话提问，回答出现在主会话的对话里。
   - 执行器「此刻在跑哪个工具」直接显示在卡上（读文件 / 跑命令 / 看图…）。
   - **子会话**分两类且分得清：主会话自己开的（分组「其他子会话」，虚线边框、人形图标），和执行器长出来的（画在**那张执行器卡内部**，缩进列表并标出来源）。
6. 收拾子工作区也交给主 Session：`orchestrator_workspaces` 的 `op=list` 列出来，`op=archive` 按 DSH 客户端语义归档其中的会话，`op=delete`+`confirm=true` 才删工作区注册（默认不删，目录与会话日志保留；有会话在跑或未归档一律拒绝）。不要再让它去点 DevTools。

来源事件（MSP / 工作区树 / GitHub）到达后出现在面板「触发」，被接受后进入「执行」，每个工单一个 worker Session。

**执行器的工作区**：建目录时若这里还不是 git 仓库，会用临时身份 `git init` 并留一个空提交——需要底座 commit 的工具（例如 tower 模式）才能起来；已经是仓库的原样不动，没有 git 的宿主保持普通目录。

**tower 模式**：装了 `dsh-kimi-tower` 且其 bundle patch 设置了 `agentCanEnable: true` 时，执行器可以用 `tower_activate` 在自己的工作区里自行进入 tower 模式（默认关闭，需要人敲 `/tower on`）。

## 配置

- **设置 → 来源**：每个 Source 的开关与字段（GitHub 仓库、MSP 信号路径、工作区根目录、节点名等）。
- **设置 → 评估**：规则与准入（来源事件是否允许开工单）。
- **设置 → 执行**：worker 模型、并发、执行根目录、prepare 命令等。
- 工单目录：触发携带工作区时落在 `<工作区>/.dsh-superagent/work/<工单>`，否则落在配置的执行根。

## 开发

```sh
pnpm install
pnpm run build      # tsdown → lib/（index、client、各 source 独立入口）
pnpm run typecheck
pnpm run test       # node --test tests/
```

`lib/` 已随仓库提交，安装时无需构建；改了源码要重新 build 并重启 DSH。

## 许可

MIT，见 [LICENSE](LICENSE)。
