# dsh-workspace-autoregister

DeepSeek Harness 社区插件：在会话里新建的工作区目录会被自动加入工作区列表，并按需创建首个空会话，省去在侧栏手动点 **+** 的步骤。

> 独立社区插件，与 DeepSeek 官方没有隶属关系。
> 日常使用、配置与排错见 [USAGE.md](USAGE.md)（安装方式、触发规则、常见问题、清理与卸载）。

## 功能

- **自动收录工作区**：会话中的工具调用结束后，如果本次调用的参数里出现了具备工作区特征的目录（默认：至少一个 `AGENTS.md` / `AGENTS.local.md`，加上 `README.md`，再加上 `plans/` 和 `reports/` 目录），就把该目录注册进 Workspace 列表。
- **无需侧栏手动操作**：注册走宿主权威的 Workspace registry；侧栏工作区列表通过宿主已有的实时 feed 更新，插件本身不操作 DOM、不注入界面。
- **首个空会话**：注册成功后，默认通过 `ctx.sessionController.create({ workspaceId })` 为新工作区创建并挂载第一个空白会话，使新工作区不会空着，可以直接开始对话。
- **幂等**：同一目录只注册一次；并发场景下注册与建会话串行执行，不会重复创建会话。已注册的目录保持原样，不重复登记。
- **可配置**：工作区特征、向上查找层数、是否创建首个会话等都可以在 `cordis.patch.yml` 中调整。
- **Host-only**：插件没有客户端半侧，不增加设置页或侧栏按钮；卸载后已注册的工作区和已有会话原样保留。

## 工作原理

1. 插件是只含 Host 半侧的 Cordis bundle，`cordis.patch.yml` 以 id `workspace-autoregister` 插入一行；激活时注入 `workspaceRegistry`，并监听 Host 的 `tools/result` 事件。
2. 每次工具调用结束后，`tools/result` 给出该调用的参数和结果。插件只处理成功结束的调用（`result.isError === true` 的调用直接忽略），然后从参数中收集绝对路径候选：以 `/` 开头的字符串参数本身，以及更长的字符串（例如 bash 命令）里出现的绝对路径片段。
3. 对每个候选路径，检查候选目录本身及其最多 `scanAncestors` 层父目录（默认 3 层）。判断依据只有目录列表：文件名命中 `promptFiles` 中至少一个、同时包含 `requiredFiles` 的全部文件、以及 `requiredDirectories` 的全部子目录；不读取任何文件内容。
4. 命中后先调用 `ctx.workspaceRegistry.resolveByPath(path)`：已注册的目录直接跳过；未注册的调用 `ctx.workspaceRegistry.create(path)` 写入权威 Workspace registry。这与 GUI 新增工作区走的是同一组 registry 调用（先解析、后创建），新工作区标题默认取目录名。注册完成后，打开的侧栏通过 registry 的实时 feed 看到新行，无需点击。
5. 若被收录目录是项目仓库内的嵌套 worktree（`git rev-parse --git-common-dir` 指向主检出、且路径位于主检出之下），先把主检出根目录也注册为父工作区（不建会话）；这样原生侧栏「按工作区树」会按路径把分支嵌到项目节点下。同级 worktree 不触发，`registerProjectRoot: false` 可关闭。
6. 若 `createSession` 为 `true` 且宿主组装了 `sessionController` 服务，接着调用 `sessionController.create({ workspaceId })` 创建第一个空白会话，并把会话挂到该工作区；这和使用 GUI 新建工作区后连接空白会话是同一个 Host 命令。
7. 任何失败（registry 调用被拒绝、建会话失败等）都只写 `warn` 日志，监听器本身不会抛错；目录不可读则视为“不匹配”，静默跳过。成功收录会写一条 `info` 日志，格式为 `dsh-workspace-autoregister: added workspace <路径>`，日志前缀统一为 `dsh-workspace-autoregister:`。

## 安装

插件通过 DSH 的插件管理器安装。**安装或升级后请完全退出 DSH 再重新打开**：Host 半在重启时加载，插件管理器显示 `applied` 只表示 bundle 已合入，不能替代重启（只刷新页面也不够）。

### 本地目录（link 安装）

```sh
dsh plugin --profile desktop add /absolute/path/to/deepseek-harness-plugins/plugins/dsh-workspace-autoregister
```

本地目录安装是 **link 安装**：profile 的记录指向这个目录，而不是复制或打包；修改 `lib/` 后重新打开 DSH 即可生效。也可以在 **设置 → 插件 → 添加插件** 中填入该绝对路径。Web profile 把 `desktop` 换成 `web`。

### tgz 发布包

从 [Releases](https://github.com/lxiol-star/deepseek-harness-plugins/releases) 下载 `dsh-workspace-autoregister-0.1.2.tgz`；或在插件目录执行 `npm pack --ignore-scripts` 自行打包，再把生成的 tgz 交给插件管理器：

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-workspace-autoregister-0.1.2.tgz
```

也可以在 **设置 → 插件 → 添加插件** 里选择本地 tgz 文件。

### GitHub 子目录

```text
github:lxiol-star/deepseek-harness-plugins#dsh-workspace-autoregister-v0.1.0&path:/plugins/dsh-workspace-autoregister
```

或使用 CLI：

```sh
dsh plugin --profile desktop add "github:lxiol-star/deepseek-harness-plugins#dsh-workspace-autoregister-v0.1.0&path:/plugins/dsh-workspace-autoregister"
```

## 配置项

配置来自插件的 `Config` schema，激活时校验：类型不符会报出错误，而不是被静默忽略。未写出的字段使用下表默认值。

| 字段 | 类型 | 默认值 | 作用 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 总开关。`false` 时插件不注册 `tools/result` 监听，完全不做事。 |
| `promptFiles` | string[] | `['AGENTS.md', 'AGENTS.local.md']` | 提示词文件名。目录里至少存在其中一个，才可能被判定为工作区。 |
| `requiredFiles` | string[] | `['README.md']` | 必需的文件名。列出的文件必须全部存在。 |
| `requiredDirectories` | string[] | `['plans', 'reports']` | 必需的子目录名。列出的目录必须全部存在。 |
| `createSession` | boolean | `true` | 收录成功后是否创建首个空白会话。`false` 时只注册工作区。 |
| `skipSessionDirectory` | boolean | `true` | 是否跳过“与当前会话工作目录相同”的候选目录，避免把正在使用的项目再次注册；工作目录未知时不跳过。 |
| `scanAncestors` | integer（`0`–`8`） | `3` | 每个候选目录向上检查的父目录层数。默认 3 表示检查候选目录本身 + 最多 3 层父目录。 |
| `registerProjectRoot` | boolean | `true` | 当被收录目录是项目仓库内的嵌套 worktree 时，同时把主检出根目录注册为父工作区，供原生「按工作区树」归组。 |

### `cordis.patch.yml` 覆写示例

在所用 profile 的用户 patch 层里按行 id `workspace-autoregister` 覆写，例如桌面端是 `~/.dsh/profiles/desktop/cordis.patch.yml`（`$DSH_HOME/profiles/<profile>/cordis.patch.yml`；`$DSH_HOME` 默认 `~/.dsh`）。`$DSH_HOME/cordis.patch.yml` 是作用于所有 profile 的 home 层，也可以放在那里。

```yaml
# 只需写出要改的字段；未写字段由插件自身默认值补全
- id: workspace-autoregister
  config:
    createSession: false
    scanAncestors: 1
    requiredDirectories: ['plans', 'reports', 'docs']
```

Loader 按 id 覆写时会整体替换该行的 `config`，再交由插件校验并补默认值，所以不需要重复上表的全部字段。改完配置后完全退出并重新打开 DSH 生效。

插件的 `Config` 是自带的 Standard Schema（无运行时依赖），DSH 的配置投影不识别这种 schema（inspector 显示 `unsupported`）。这不影响激活时的校验，但插件没有客户端半侧，因此**插件管理器里也没有图形化配置表单**，请按上面的方式直接覆写 patch 文件。类型不合法或出现未知字段时插件激活失败并报错，不会静默忽略。

## 与 dsh-hide-empty-workspaces 的关系

[dsh-hide-empty-workspaces](../dsh-hide-empty-workspaces/) 会按 Workspace 快照的会话状态隐藏“没有未归档会话”的工作区。本插件默认 `createSession: true`，收录成功后立即创建一个未归档的空白会话并挂到该工作区，所以新收录的工作区在侧栏里不会被它判为空而隐藏。若把 `createSession` 设为 `false`，或宿主没有组装 `sessionController`，新工作区可能暂时没有会话，此时会按 hide-empty 自己的规则显示或隐藏。两个插件可以同时安装。

## 行为边界与已知限制

- **只在成功工具调用之后触发**：`result.isError === true` 的调用被忽略；插件不轮询文件系统，也不会在完全没有工具调用的会话里触发。如果一次调用时工作区特征还不完整（例如 `reports/` 尚未创建），这次不会收录，需要之后的成功调用再次提到该目录。
- **路径只来自工具参数**：插件只扫描工具调用的参数（字符串本身及其中的绝对路径片段），不读取工具输出、会话正文或磁盘全量扫描。相对路径、以及含空格、引号、`$` 等特殊字符的路径可能提取不到。
- **匹配任何位置的目录**：只要参数里出现的绝对路径目录满足签名，无论它是否在当前项目内，都可能被注册；向上检查父目录也意味着最终注册的可能是候选路径的祖先目录。一次调用里如果有多个目录同时满足签名，会分别注册。
- **有数量上限**：单次工具调用最多收集 32 个候选路径、最多检查 32 个目录；超长字符串（超过 32 KiB）不作为路径来源。这是为了防止一次调用的大参数带来无界的文件系统访问。
- **首个空会话是尽力而为**：只有宿主组装了 `sessionController` 服务时才会创建；创建失败只记录 `warn` 日志，工作区仍然保留，本次运行不会为同一目录重试。若需要该会话，可稍后在 DSH 中为这个工作区手动新建。
- **不导航 GUI**：插件只写入 Workspace registry，侧栏列表通过宿主现有 feed 更新；它不会自动选中、打开或滚动到新工作区/新会话，也不会在前台弹出提示。
- **Host-only，没有设置页**：所有开关都通过 `cordis.patch.yml` 配置，插件不提供客户端界面。
- **仅支持 POSIX 绝对路径**：路径候选只从以 `/` 开头的字符串和文本中的 `/a/b` 片段提取；Windows 的盘符反斜杠路径（`C:\...`）不会被识别，`C:/Users/...` 这类写法可能被截成 `/Users/...` 而得到不可靠结果。插件未在 Windows 上验证。
- **窗口级视觉验证未做**：Host 侧已做真实会话的端到端验证（见下节），但没有在窗口里读取 DOM 核对侧栏渲染结果。

## 验证

```sh
cd plugins/dsh-workspace-autoregister
node --test test/autoregister.test.mjs
```

测试使用 `node:test` 和 `node:assert/strict`，只依赖 Node 内置模块：在临时目录里构造工作区目录、模拟 Host context 与工具调用事件，不访问网络、不需要安装依赖，也不会写入真实 profile 或真实工作区。

真实环境（desktop profile，DSH 0.2.1-rc.2）的 Host 侧端到端验证记录：

1. 通过插件管理器安装本插件，返回 `application: applied`，Host 已加载该行。
2. 在运行中的会话里用工具调用 scaffold 一个目录（`AGENTS.md` + `README.md` + `plans/` + `reports/`）。
3. 无需任何额外操作，Workspace registry 出现该目录的新记录（标题取目录名，路径为 realpath），并挂载了一个自动创建的首个空白会话；`~/.dsh/storages/workspace.json` 和 `~/.dsh/sessions/` 中都有对应持久化数据。
4. 验证后已通过同一 Host API 删除测试记录并归档测试会话；窗口内的侧栏渲染没有做 DOM 级核对。

此后的代码做过一轮加固（dispose 守卫、重复建会话守卫、严格配置校验、路径规范化比较），由 Node 测试覆盖；已安装的运行实例需要下次启动 DSH 才加载该加固版本。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-workspace-autoregister
```

也可以在 **设置 → 插件** 中移除。卸载只移除插件本身；它此前注册的工作区和创建过的会话都会保留，侧栏列表不会回滚。卸载后完全退出并重新打开 DSH。

## 许可

MIT，见 [LICENSE](LICENSE)。
