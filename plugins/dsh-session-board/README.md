# dsh-session-board

DeepSeek Harness 的会话看板插件。提供贴边栏和全屏看板，集中查看需要处理、运行中和已完成的会话。

## 功能

- 按状态、工作区或工作区路径树分组，支持展开与折叠。
- 按标题、预览、工作区和状态搜索筛选。
- 默认简洁卡片，展开后查看指令、Token、缓存、后台任务和长预览。
- 直接读取 DSH 工作区快照的 `archivedSessionIds`：在客户端归档的会话，插件也显示“DSH 中已归档”，默认隐藏；客户端恢复后随快照更新。
- 支持“隐藏已归档 / 查看已归档 / 全部会话”，筛选栏还有「仅归档」按钮可一键切换。Wiki 完成标记与 DSH 原生归档是两种不同来源，分别显示。
- 归档成功的 Wiki 标记记录当时观察到的内容版本；会话重新运行或出现新内容后重新显示。
- 中英双语、键盘操作、独立滚动、触控板滚动传递和减少动态效果支持。
- 设置 → 会话看板提供两组配置：「归档提炼」选择提炼模型（选项来自宿主当前可用的模型列表，模型支持时可单独选择思考等级）；「Wiki 归档引擎」配置 Wiki 根目录、SCHEMA 规则、引擎来源、Python、超时与 provider，并可直接「检查环境」。

## 管理中心（0.4.0+）

会话头部新增「管理中心」按钮，点开是一个右侧抽屉：

- **上半屏是工作区看板**：列出所有工作区及其会话数/运行状态；点一个工作区，下方列出它的会话，可勾选会话或整个工作区。
- **「发送选区」**：把当前勾选变成一条普通用户消息发给管理 Agent（走宿主官方 `session.prompt`，可在会话日志里审计）；勾选本身只更新宿主的选区镜像，不产生模型调用。
- **下半屏是管理 Agent 的官方聊天**：输入框、模型选择、流式输出、工具卡片全部复用主界面会话，不是另写的一套 UI；也可以点「在主界面打开」继续。
- **管理 Agent**：一个普通 DSH 会话（标题「DSH 管理台」，懒创建在工作区 `~/Documents/deepseek-harness/dsh-console`，可用环境变量 `DSH_SESSION_BOARD_MANAGER_DIR` 覆盖目录）。它可随时冷恢复，空闲不消耗 token；只有它拥有下面这些工具，普通会话看不到。
- **管理工具**：`workspace_overview`、`workspace_sessions`、`session_status`、`read_selection`、`assign_task`、`list_tasks`、`update_task`、`report_progress`、`set_auto_wake`。
- **任务板**：`assign_task` 在目标工作区新建会话、投递任务说明并登记任务；任务状态由会话事件派生（运行中 / 出错 / 等待），也可由管理 Agent 显式更新。抽屉里的任务行点击可直接打开对应会话。
- **自动唤醒**：默认关闭。管理 Agent 用 `set_auto_wake` 打开后，宿主用 epoll 风格的事件多路复用器（`session/event` + `agent/status` → 全量状态 + 有界就绪队列）在管理员空闲时投递 digest，每分钟最多一次。
- **依赖**：需要宿主提供 `sessionController`、`workspaceRegistry`、`agents` 服务；缺失时只隐藏管理中心，原看板不受影响。管理会话沿用 profile 默认模型；未选模型时聊天会提示先选模型。

## 安装与兼容性

从本仓库 Releases 下载 `dsh-session-board-0.5.2.tgz`，在 **DSH 设置 → 插件 → 添加插件** 中安装。

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-session-board-0.5.2.tgz
```

升级后请**完全退出并重开 DSH**，单纯刷新页面可能出现新客户端搭配旧服务端的情况。插件会检查 Wiki 后台协议，版本不一致时要求重启。

本插件处于实验阶段：开发验证环境为 macOS arm64、Harness Dev `0.2.1-alpha.1`。早期实现参考 `0.2.0-rc.2`；当前发布没有覆盖所有正式版、Windows、Linux 或独立 Web 部署。贴边栏依赖版本敏感的宿主布局适配，未知布局会拒绝挂载；全屏看板使用 DSH 插槽。安装前请确认版本兼容并备份重要会话数据。

归档并提炼成功后会调用 DSH 原生归档，将会话移出客户端工作区（保留记录，可在归档列表恢复）。空会话跳过提炼后同样归档；仍在运行、有后台任务、等待你处理，或在确认后又收到新内容的会话保留在工作区并说明原因；Wiki 提炼失败、敏感内容或索引失败时不归档。插件不会停止运行中的任务，也不会删除会话。Wiki 标记、分组和筛选偏好保存在当前客户端本地存储，重启保留但不跨设备同步，也不会自动补标历史 Wiki 归档。

## 可选：归档并提炼到 Wiki

基础看板不要求 Wiki 环境。使用“归档并提炼”时需要一份本地 Wiki 数据（默认复用 `~/wiki`），归档引擎**随插件自带**，不再要求 `~/wiki/scripts` 里存在可用的 Python 脚本。

### 引擎与规则

- 引擎（`wiki-archive.py` / `wiki-synthesize.py` / `wiki-index.py`）打包在插件 `lib/wiki/` 中，升级插件即升级引擎；来源与不含外部依赖的约定见 [`src/host/wiki/UPSTREAM.md`](src/host/wiki/UPSTREAM.md)。
- Wiki **数据**始终由你所有：页面、状态文件与锁都放在 wiki 根目录下，不会写进插件安装目录。
- 默认配置复用当前本地 Wiki：`wiki 根目录 = ~/wiki`、`SCHEMA 规则 = <wiki 根目录>/SCHEMA.md`、`归档状态 = <wiki 根目录>/scripts/.archive-state.json`（与 CLI 归档流程共用，增量归档不会重复）。
- 如果你想继续用自己维护的脚本，可在设置里把「引擎脚本来源」切到「本地 wiki scripts」并指定目录；这等价于旧行为。
- `/usr/bin/python3`，以及 Python `zstandard` 或 `zstd` 可执行程序（引擎解压 DSH transcript 需要）。

### 设置项（设置 → 会话看板 → Wiki 归档引擎）

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| Wiki 根目录 | `~/wiki` | 归档页与知识层的数据根目录 |
| SCHEMA 规则 | `<wiki 根目录>/SCHEMA.md` | 引擎校验与提炼提示所依据的规则文件 |
| 引擎脚本来源 | 插件内置 | 或「本地 wiki scripts」复用你维护的脚本目录 |
| 脚本目录 | `<wiki 根目录>/scripts` | 仅本地模式使用 |
| Python | `/usr/bin/python3` | 运行引擎的解释器 |
| 超时（秒） | 300 | 单次归档/提炼操作上限；0 表示默认 |
| Wiki provider | 本地默认（`stepx-terra`） | 未选择提炼模型时使用的 Wiki 合成 provider |
| 归档状态文件 | `<wiki 根目录>/scripts/.archive-state.json` | 高级项，与 CLI 归档共用 |
| provider 配置文件 | `~/.wikibar/config.json` | 高级项，传给 `wiki-synthesize.py` |

配置保存在宿主插件存储（非 localStorage），保存后下一次归档即生效，无需重启。设置页的「检查环境」会报告引擎目录、每个脚本是否存在、Python 版本、SCHEMA 是否可读与状态文件路径。也可以在 `cordis.patch.yml` 里给部署写默认值（用户保存过的配置优先）：

```yaml
- id: dsh-session-board
  config:
    wikiRoot: /Users/me/wiki
    scriptsMode: bundled
    timeoutSeconds: 600
```

### 提炼模型

- 未选择模型时：逐条执行内置 `wiki-synthesize.py --provider <provider> --session <raw/.../完整页.md> --limit 1`，凭证配置来自 `~/.wikibar/config.json`（可用设置页高级项覆盖），provider 默认 `stepx-terra`，也可在 `~/.dsh-session-board.json` 写入 `{"synthesisProvider": "<provider id>"}` 覆盖。
- 选择模型时：由插件宿主通过 DSH 的 `llm` 服务调用模型，模型输出交给 `wiki-synthesize.py` 的 `parse_pages` / `process_page` / 状态文件逻辑落盘（SKIP、slug 唯一、sources 与写入校验与脚本一致），不再使用 provider 配置。

### 操作流程

1. 勾选会话，点击“预览归档与提炼”。
2. 预览核对精确会话 ID、源路径、明确的 `parentSession` 父子归属，以及缺失子会话和进行中快照。仅扫描当前实际 `DSH_HOME`；一次最多勾选 50 个会话，连同它们的子会话最多 200 个（超过会提示分批归档）。
3. “确认归档并提炼”授权原文归档及向所选模型或 provider 发送脱敏后的归档文本。取消不写原文、不调用模型。
4. 每条会话单独执行内置 `wiki-archive.py --exact-session <完整ID> --full --json`，要求精确命中一个来源。
5. 提炼按上一节的两条路径之一执行；提炼前再次检查可识别凭证；SKIP 视为正常结论。
6. 批次结束统一更新索引，面板显示原文路径、知识页路径、SKIP、失败和索引状态。模型报错、输出无法解析或写入被拒时保留原文归档并标记失败，不伪报成功。

失败时面板会显示宿主/引擎返回的具体原因（如 `ENGINE_UNAVAILABLE`、`SCHEMA_UNAVAILABLE` 或超时），完整诊断追加在 `~/.dsh-session-board/wiki.log`；不再只给一句“请检查本地 Wiki 脚本”。

脱敏采用启发式，无法保证识别任意秘密。归档会保留敏感的本地原文内容，不应直接公开。确认框会明确说明模型外发，不依赖模型自行隐去密钥。

## 开发

交接与完整开发说明见仓库根目录 [插件开发交接文档](../../docs/plugin-development-handoff.md)。

DSH 源码仓库提供构建工具和已构建的类型声明：

```sh
export DSH_REPO=/absolute/path/to/deepseek-harness
npm run check
npm run build
npm pack --ignore-scripts
```

公开构建验证使用 DSH commit `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。仓库中的 `lib/` 是从源码生成的可安装产物；修改 `src/` 后应重新构建。插件运行时不会复制 DSH 的核心包，也不会修改官方源码。

大部分测试使用合成数据。可选 Python 集成测试可通过 `WIKI_ARCHIVE_SCRIPT` 指定归档脚本；压缩工具通过 `ZSTD_BIN` 指定。未安装对应依赖时明确跳过，而不是触碰用户真实会话或密钥。

## 限制

- Wiki 标记属于客户端状态；DSH 原生归档由宿主集合决定，插件只读取并调用宿主归档动作，不自行维护归档集合。
- 子会话只按明确父子元数据纳入，不凭相似标题或时间猜测。
- 进行中会话仅归档执行时已落盘内容，不承诺未来内容。
- 中断的多会话归档可能留下已完成的原文页，重试需重新预览。
- 目前未提供脱离本地 Wiki 脚本体系的通用知识库后端。

## License

[Apache-2.0](LICENSE)。
