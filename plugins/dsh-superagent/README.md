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
github:lxiol-star/deepseek-harness-plugins#dsh-superagent-v0.2.0&path:/plugins/dsh-superagent
```

也可以从本地目录安装（`设置 → 插件 → 添加插件` 填本地路径）。

安装后启用并**完全退出重启 DSH**，侧栏出现 **Superagent**。

## 使用

1. 打开 **Superagent → 打开主 Session**（或侧栏 `dsh-superagent orchestrator` 会话）。
2. 在输入框左下角选择工作区——工单就开在这个工作区下的 `.dsh-superagent/work/` 里。
3. 直接说任务，例如「在当前工作区把 README 的安装步骤补全，做完告诉我」。
4. 主 Session 调 `orchestrator_task` 开单，worker 在子工作树里执行，完成后把结果回报到主 Session。

来源事件（MSP / 工作区树 / GitHub）到达后出现在面板「触发」，被接受后进入「执行」，每个工单一个 worker Session。

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
