# dsh-workspace-autoregister 使用方式

> 独立社区插件，与 DeepSeek 官方没有隶属关系。
> 仓库：<https://github.com/lxiol-star/deepseek-harness-plugins> · 版本：0.1.0

## 一句话

**在会话里新建出来的工作区目录，会自动进入 DSH 的「工作区」列表，并带上一个空白会话，不用再去侧栏点 +。**

## 安装

三选一，安装后插件页里会出现「工作区自动收录」，状态为 **运行中**（首次安装可即时生效；升级已安装的 Host 插件需重启 DSH）。

### 方式 A：GitHub 子目录（推荐，自包含、锁版本）

插件管理器 →「添加插件」里粘贴：

```text
github:lxiol-star/deepseek-harness-plugins#dsh-workspace-autoregister-v0.1.0&path:/plugins/dsh-workspace-autoregister
```

或用 CLI（profile 按需换 `desktop` / `web`）：

```sh
dsh plugin --profile desktop add "github:lxiol-star/deepseek-harness-plugins#dsh-workspace-autoregister-v0.1.0&path:/plugins/dsh-workspace-autoregister"
```

### 方式 B：Release 安装包

下载 <https://github.com/lxiol-star/deepseek-harness-plugins/releases/download/dsh-workspace-autoregister-v0.1.0/dsh-workspace-autoregister-0.1.0.tgz>，
在插件管理器里选择「本地包」，或：

```sh
dsh plugin --profile desktop add /绝对路径/dsh-workspace-autoregister-0.1.0.tgz
```

### 方式 C：本地目录（开发用，link 安装）

```sh
dsh plugin --profile desktop add /绝对路径/deepseek-harness-plugins/plugins/dsh-workspace-autoregister
```

link 安装修改 `lib/` 后重启 DSH 即生效；正式使用建议 A 或 B，不依赖本地源码目录。

## 日常用法

### 场景 1：用 `workspace-create` skill 建工作区（最主要用法）

对话里直接说：

```text
用 workspace-create 给「<任务名>」建个工作区
```

skill 按标准流程写出 `AGENTS.md`（自动加载的提示词）+ `README.md` + `plans/` + `reports/` 之后，
插件自动把该目录收录进工作区列表：

- 侧栏出现新的工作区行（标题 = 目录名，如 `repo-topic-20261020`）；
- 工作区下自动有一条空白「新会话」，点开就能开始，不用手动新建；
- 全程不需要点「+」、不需要改配置、不需要重启。

### 场景 2：任意方式 scaffold 出工作区目录

不限于 skill。只要一次**成功结束的工具调用**（`bash`、`write`、`edit`、PTC `run_code`、终端工具等）的
**参数里出现该目录的绝对路径**，且目录已具备工作区签名，就会被收录：

```bash
W=/Users/you/projects/demo-ws-20261020
mkdir -p "$W"/{docs,scripts,plans,reports}
```

然后写入 `AGENTS.md` 和 `README.md`。触发发生在最后一次相关工具调用之后（通常就是写完 `README.md` 时）。

### 场景 3：临时停用

- 在 profile 的 `cordis.patch.yml` 里给行 id `workspace-autoregister` 加 `enabled: false`（重启生效）；
- 或直接在插件页卸载。

### 不需要做的事

- ❌ 不用在侧栏点「+」添加工作区；
- ❌ 不要手改 `~/.dsh/storages/workspace.json`（运行中会被内存状态覆盖）；
- ❌ 不用重启 DSH 等列表刷新（注册经宿主实时 feed 推送到侧栏）。

## 判定规则（什么目录会被收录）

1. 只处理**成功结束**的工具调用（失败调用直接忽略）。
2. 路径来源只有工具**调用参数**：参数中的绝对路径字符串，以及 bash 命令等长字符串里的绝对路径片段；
   不读工具输出、不读会话正文、不做磁盘全量扫描。
3. 对每个候选路径，检查**候选目录本身及其向上 `scanAncestors` 层（默认 3）父目录**。
4. 目录签名（默认，可配置）必须同时满足：
   - 至少存在一个 `AGENTS.md` 或 `AGENTS.local.md`；
   - 存在 `README.md`；
   - 存在 `plans/` 和 `reports/` 两个子目录。
5. 已注册的目录直接跳过（幂等）；单次调用最多收集 32 个候选路径、检查 32 个目录。
6. 收录成功后默认创建首个空白会话（`sessionController.create({ workspaceId })`），
   与 GUI「新增工作区」后的行为一致；工作区标题取目录名。

## 配置

所有开关都在 profile 的 `cordis.patch.yml` 中按行 id 覆写。常用字段：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | 总开关。`false` 时插件完全不做事。 |
| `promptFiles` | string[] | `['AGENTS.md', 'AGENTS.local.md']` | 至少存在其中一个才可能被判定为工作区。 |
| `requiredFiles` | string[] | `['README.md']` | 必须全部存在。 |
| `requiredDirectories` | string[] | `['plans', 'reports']` | 必须全部存在。 |
| `createSession` | boolean | `true` | 收录后是否创建首个空白会话。 |
| `skipSessionDirectory` | boolean | `true` | 跳过与当前会话工作目录相同的候选目录（避免把正在用的项目再注册一次）。 |
| `scanAncestors` | integer（0–8） | `3` | 候选路径向上检查的父目录层数。 |

覆写示例（桌面端：`~/.dsh/profiles/desktop/cordis.patch.yml`）：

```yaml
- id: workspace-autoregister
  config:
    createSession: false
    requiredDirectories: ['plans', 'reports', 'docs']
```

改完配置需要完全退出并重新打开 DSH 生效。未写出的字段自动取默认值。
注意：插件的 `Config` 是自带 Standard Schema，DSH 配置投影不识别它（inspector 显示 `unsupported`），
所以插件管理器里**没有图形化配置表单**，请按上面的方式直接改 patch 文件。

## 与 dsh-hide-empty-workspaces 的配合

`dsh-hide-empty-workspaces` 会隐藏「没有未归档会话」的工作区。
本插件默认 `createSession: true`，收录后立刻创建一个未归档的空白会话挂到该工作区，
因此新工作区**不会**被它判为空而隐藏。若你把 `createSession` 设为 `false`（或宿主没组装
`sessionController`），新工作区在第一次真正开会话之前可能被隐藏，这属于预期行为。

## 怎么确认生效

1. **最快**：看侧栏工作区列表，新目录名是否出现（带一条「新会话」）。
2. 插件页：插件状态应为「运行中」。
3. 查持久化（可选）：

```sh
python3 - <<'EOF'
import json, os
store = json.load(open(os.path.expanduser('~/.dsh/storages/workspace.json')))
for record in store['tables']['workspaces'].values():
    print(record['path'], '| sessions:', len(record['sessionIds']))
EOF
```

4. 宿主日志里成功收录会打印：`dsh-workspace-autoregister: added workspace <路径>`；失败只打印 `warn`，不影响其他功能。

## 常见问题（没生效时按顺序查）

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 侧栏没有新工作区 | 目录签名不全（缺 `README.md` / `plans/` / `reports/`） | 补齐后让对话里再发生一次提到该目录的成功工具调用 |
| 同上 | 目录路径没有出现在工具调用参数里（比如由脚本内部生成） | 在命令里显式写出绝对路径，或之后 `ls "$W"` 一次 |
| 同上 | 那次工具调用失败了 | 修正后重跑 |
| 同上 | 目录恰好是当前会话的工作目录 | `skipSessionDirectory: true` 会跳过；用别的目录或把该项设为 `false` |
| 同上 | Windows 盘符路径 | 本插件仅识别 POSIX 绝对路径，Windows 不可用 |
| 工作区出现了但没有会话 | `createSession: false`、宿主没有 `sessionController`、或建会话失败 | 在 DSH 里手动为该工作区新建会话；看日志里的 `warn` |
| 触发多次会不会重复 | 不会，注册幂等且串行 | 无需处理 |
| 标题太长/不好看 | 标题固定取目录名 | 用 `repo-topic-日期` 这类命名；或收录后在侧栏重命名 |

## 清理与卸载

- **删除测试/多余工作区**：侧栏工作区行的「⋯」→ 删除（只删注册，不删目录和会话）。
- **清理空白会话**：会话行的「⋯」→ 归档（DSH 不提供删除会话日志的入口）。
- **卸载插件**：插件页卸载，或
  ```sh
  dsh plugin --profile desktop remove dsh-workspace-autoregister
  ```
  卸载只移除插件本身，它此前收录的工作区和创建过的会话都会保留。

## 限制

- Host-only，没有客户端界面/设置页/侧栏按钮；所有配置走 `cordis.patch.yml`。
- 只识别 POSIX 绝对路径；Windows 未验证、实际不会触发。
- 只从工具调用参数里找路径，不轮询磁盘、不读工具输出。
- 只在成功工具调用之后触发；一次调用时签名不完整则本次不收录。
- 会收录任何满足签名的目录（不限于当前项目内），也允许把候选路径的祖先目录收录。
- 不会自动选中/打开新工作区或新会话。

## 验证记录

- 2026-10-20：重启后的 desktop 实例（插件经 GitHub tag 安装，状态运行中），在会话里 scaffold
  `dsh-autoregister-smoke-20261020` 后工作区数 29 → 30，新记录路径/标题正确，并自动创建挂载空白会话
  `session-c536637b-…`；Dev3 实例同样完成安装 + 触发 + 侧栏实时出现的验证。
