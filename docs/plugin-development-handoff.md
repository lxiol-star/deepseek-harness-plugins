# DSH 插件开发交接文档

> 面向接手本仓库插件开发的同学（或 AI Agent）。读完应当能独立完成一次「改代码 → 验证 → 打包 → 发布 → 让用户升级」的闭环。
>
> 适用范围：`dsh-session-board`（本仓库主力插件）、`dsh-whale-effort`（合并插件）、`dsh-hide-empty-workspaces`、`dsh-workspace-autoregister`、`dsh-think-bounce-pet`、`dsh-pet`。
>
> 最后更新：2026-10-23（`dsh-session-board` 0.8.4、`dsh-whale-effort` 0.2.4、`dsh-hide-empty-workspaces` 0.4.0、`dsh-workspace-autoregister` 0.1.2、`dsh-think-bounce-pet` 0.1.1、`dsh-pet` 0.3.8）。
>
> 阅读顺序：§0 是可直接粘贴给新会话的**交接提示词**；§1–§4 是现状与插件地图；§5–§6 是开发/发布闭环；§7–§12 是规则、排障、权威索引、风险与命令卡。

---

## 0. 交接提示词（可直接粘贴给新会话）

```text
你是 DeepSeek Harness（DSH）社区插件仓库的接手开发者。

仓库：github.com/lxiol-star/deepseek-harness-plugins（Apache-2.0，与 DeepSeek 官方无隶属关系）。
本地检出：<REPO>（README 在根目录；本交接文档在 docs/plugin-development-handoff.md，先读全文）。

当前状态（2026-10-22）
- main 与 origin 同步；四个插件都已发布 Release：
  - dsh-session-board 0.8.4（最新）：会话看板 + 批量归档提炼（Wiki 引擎自包含、设置页可配）+ 「管理中心」常驻管理 Agent + 项目树（按 git origin 归并多分支工作区）+ 项目协调会话（项目级派任务/会话间消息/worker 回报）+「仅归档」动作/视图。
  - dsh-hide-empty-workspaces 0.3.9：侧栏视图切换（进行中 / 已归档 / 工作空间）、归档按工作区分组、空白会话宽限期、设置页；「重新加载客户端插件」强制卸载并重挂载第三方客户端插件（旧标签页也会重建），不刷新页面、不重启、不丢会话。
  - dsh-workspace-autoregister 0.1.2：Host-only，自动把新工作区目录注册进列表；0.1.1 起把 HANDOFF.md 作为首个会话消息；0.1.2 起嵌套 worktree 会同时注册项目根，原生「按工作区树」可按路径归组。
  - dsh-think-bounce-pet 0.1.1：收录的上游构建产物，无本地 src，只在需要时打补丁。
  - dsh-pet 0.3.8：上游 PC2005-cloud/dsh-pet 的完整发布包 vendored 副本（MIT，含 src/lib/assets/Electron helper），以本仓库 `plugins/dsh-pet/` 为固定安装源；代码改动优先回上游。
- 先跑通闭环：cd plugins/dsh-session-board && DSH_REPO=<DSH 源码检出> npm run check
  （2026-10-22 基线：40 个 spec 文件 / 538 个用例全绿）。

必须遵守的硬规则（详见 §7）
- 每发布一次版本号必须递增；tag/安装包永不覆盖；只有文档变更可以不发版。
- 插件运行时不能 import @deepseek-ai/*（Host/Client 都是）；服务用 inject / 嵌套 ctx.inject，禁止 apply 时 ctx.get 抢读。
- 裸 webServer 路由必须自己调 connection.requestRejection；SSE 也不例外。
- 中英文案同步；发布包不含密钥、个人绝对路径、真实会话、截图；注释/文档/fixture 不写本机用户名、主机名、设备名、内部工具名。
- lib/ 是构建产物（不要手改）；改 src 后必须 npm run build。
- 管理面板的管理工具只能注册在 manager Agent 的 agent.ctx 上，不能全局 ctx.tools.register。

验证环境（见 §5）
- 优先在 Dev3 验证（隔离 home ~/.dsh-dev3，/Applications/Harness Dev3.app，来自 .worktrees/dev3-latest 的 dev 构建）。
- Dev3 的渲染进程 CDP 127.0.0.1:9262、Host inspector 127.0.0.1:9270，可无模型额度地做 DOM/截图/事件验证（§5.3）。
- 安装或升级后必须完全退出 Dev3 再重开：Host 与 Client 两半分别加载。
- 不要在 dev 实例正在刷新/重载客户端时重建插件（会读到半个 bundle，web boot 直接失败退出）；先构建，再重启 Dev3。

近期待办（§10）
1. 管理面板：mux 增量 SSE（当前 4s 轮询）、面板化自动唤醒预算/开关、needs-input 从 durable approval/asked|decided 派生、面板列出没有会话的空工作区、管理目录改走 Config。
2. Wiki 引擎：本地模式与内置模式的边界回归、provider 配置（~/.wikibar/config.json）、Python 3 + zstandard/zstd 平台覆盖。
3. dsh-workspace-autoregister 的 README/USAGE 已随 0.1.2 补齐 HANDOFF.md 首消息与项目根注册说明。
4. 平台覆盖：Windows/Linux 未系统验证；正式版 App 与 Dev3 的客户端组合差异要在正式版实测一次。

任务要求：先读 §1–§4 定位代码；按 §5 改代码并验证；按 §6 发布；完成后报告改了哪个插件、版本、验证命令与结果、Release 状态。不要替用户删数据、不要改 profile 或手写 profile 文件。
```

---

## 1. 项目是什么

本仓库是 **DeepSeek Harness（DSH）的社区插件集合**，公开在 `github.com/lxiol-star/deepseek-harness-plugins`，Apache-2.0。与 DeepSeek 官方无隶属关系。

| 插件 | 形态 | 当前版本 | 维护要点 |
| --- | --- | --- | --- |
| `dsh-session-board` | Host + Client（React） | 0.5.1 | 主力插件：看板/全屏浮层、归档与提炼、自包含 Wiki 引擎与设置、管理中心（常驻管理 Agent 面板）；本文件大部分内容围绕它 |
| `dsh-whale-effort` | Host + Client（TS 源码 + esbuild 构建） | 0.2.4 | 合并插件（MIT 上游）：原生模型选择器「推理等级」滑条 + 鲸鱼娘跑者 + 科幻能量皮肤 + Ultra/闪电 + 子代理 tok/s；Host 单条鉴权 RPC 通道 `POST /dsh-whale-effort/<endpoint>`，状态存 `$DSH_HOME/storages/dsh-whale-effort.json`；开发命令同 session-board（`npm run check/build`） |
| `dsh-hide-empty-workspaces` | 仅 Client（手写 `lib/client.js`，无 `src/`、无构建） | 0.4.0 | 原生侧栏视图切换（进行中/已归档/工作空间）、归档按工作区分组、空白会话宽限期、设置页；「重新加载客户端插件」强制卸载/重挂载第三方客户端插件（旧标签页也会重建），不刷新页面/不重启 |
| `dsh-workspace-autoregister` | 仅 Host（手写 `lib/index.js`，无构建） | 0.1.2 | 监听成功工具调用的参数，把新出现的工作区目录登记进列表、建首个空白会话、注入 `HANDOFF.md`；嵌套 worktree 同时注册项目主检出根，供原生工作区树归组 |
| `dsh-think-bounce-pet` | 上游构建产物 | 0.1.1 | 收录社区插件（MIT），仓库里没有上游 `src/`，只在需要时打补丁/加回归测试 |
| `dsh-pet` | 上游完整发布包（含 src/lib/assets/runtime） | 0.3.8 | vendored 自 `PC2005-cloud/dsh-pet`（MIT），固定安装/分发副本；上游是代码真源 |

插件目录规范：`plugins/<npm 包名>/`，各自声明 `version`、入口、依赖、README、CHANGELOG。发布物是各插件独立的 `.tgz`，**版本号和 tag 按插件独立**（`dsh-session-board-v0.5.1` 这种格式）。`dsh-session-board` 与 `dsh-whale-effort` 有 TS 源码与构建步骤；另外两个手写 JS 插件直接维护 `lib/`，`check` 只有 Node 测试（见 §5）。

---

## 2. 环境准备

### 2.1 必需

- Node.js `^22.19.0 || >=24.0.0`（与插件 `engines` 一致）。
- pnpm（发布/安装测试用；打包本身用 npm 也可以）。
- 一份 **DSH 源码检出**，用于类型声明、构建工具、客户端运行时测试：
  ```sh
  git clone https://github.com/deepseek-ai/deepseek-harness.git
  cd deepseek-harness && pnpm install && pnpm run build
  export DSH_REPO=/absolute/path/to/deepseek-harness
  ```
  插件自身**不安装依赖**，`check`/`build` 通过 `DSH_REPO` 找 `tsc`/`vitest`/`esbuild`。找不到时会回退到同级目录 `../../../deepseek-harness`。
- Python 3（`dsh-session-board` 的 Wiki 引擎与集成测试；内置引擎随插件走，无需 `~/wiki/scripts`）。
- `zstd` 或 Python `zstandard`（Wiki 原始归档解压；`ZSTD_BIN=/opt/homebrew/bin/zstd` 或 PATH 内可用）。

### 2.2 本机的多个 DSH 环境

| 环境 | DSH_HOME | 用途 |
| --- | --- | --- |
| 正式版 App | `~/.dsh` | 用户日常使用；插件安装位置 `~/.dsh/profiles/desktop/node_modules/<包名>` |
| 开发/测试版 Dev2 | `~/.dsh-dev2`（或自建临时 home） | 验证新功能，避免污染正式数据 |
| 开发/测试版 Dev3 | `~/.dsh-dev3` | latest-code worktree 构建（`.worktrees/dev3-latest`），由 `.worktrees/install-dev3.sh` 安装；带 CDP：渲染进程 `127.0.0.1:9262`、Host 进程 `127.0.0.1:9270`、主进程 `127.0.0.1:9269`，见 §5.3 |

**安装/升级后必须完全退出 DSH 再重开**：Host 与 Client 两半是分别加载的，只刷新页面不会加载新的 Host 代码。Dev3 是 `Harness Dev3.app`，用 `osascript -e 'tell application "Harness Dev3" to quit'` 后 `open -a '/Applications/Harness Dev3.app'` 重启，等 `curl http://127.0.0.1:9262/json/version` 恢复。

### 2.3 用户环境事实（不要假设）

- 正式版 App 从 Finder 启动时，进程里**没有 `DSH_HOME` 环境变量**。插件里解析 DSH home 必须按「显式配置 → `$DSH_HOME` → `~/.dsh`」的顺序（已有 `resolveDshHome()`，别改回只读环境变量）。
- 正式版 App 的 DSH 版本可能是 `0.2.1-rc.2`，与源码 trunk (`0.2.1-alpha.1`) 存在差异。客户端插件 API 以**目标 App 的实际包**为准，必要时解包 `DeepSeek Harness.app/Contents/Resources/app.asar` 查证（见 §8.3）。Dev3 当前是 `0.2.1-rc.2-687f282`。
- 用户界面语言：中文；插件文案必须中英同步（`tests/locales.spec.ts` 会强制检查键集合、占位符、空串）。
- 管理面板的管理会话目录默认 `~/Documents/deepseek-harness/dsh-console`，可用环境变量 `DSH_SESSION_BOARD_MANAGER_DIR` 覆盖（尚未走 `Config`）。
- Wiki 归档失败时完整诊断追加写入 `~/.dsh-session-board/wiki.log`；设置页「检查环境」可看引擎/Python/SCHEMA/状态文件路径。

---

## 3. DSH 插件机制速览

### 3.1 包结构与 manifest

```
plugins/<pkg>/
├── package.json          # 关键字段见下
├── cordis.patch.yml      # 把插件作为一个 bundle 行插进 DSH composition
├── src/
│   ├── index.ts          # Host 半入口（Node 侧 Cordis 插件）
│   ├── client/index.tsx  # Client 半入口（浏览器 Cordis 插件）
│   ├── host/             # 仅 Host
│   ├── client/           # 仅 Client
│   └── shared/           # 两端共用纯函数/类型（禁止 import DSH 包）
├── scripts/{build,typecheck}.mjs
├── vitest.config.ts      # 包内测试范围（避免嵌套检出时拾取 DSH 根配置）
├── tests/
└── lib/                  # 构建产物（提交进仓库，发布包只带它；含 lib/wiki/ 内置引擎）
```

`package.json` 必填要点：

```jsonc
{
  "type": "module",
  "main": "lib/index.js",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js" },
  "files": ["lib", "cordis.patch.yml", "README.md", "LICENSE", "CHANGELOG.md"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" },
    "manifestVersion": 1
  },
  "peerDependencies": { /* @deepseek-ai/* 与 react，全部 optional */ }
}
```

- `main` 是 Host 半；`exports["./client"]` 是浏览器半。`dsh.client` 存在时 DSH 的 Web App 会加载 `lib/client.js`。
- `cordis.patch.yml` 只做 `insert` 一行，**不要 patch 官方 bundle**。删除这一行 + 包依赖就是完整卸载。
- `peerDependencies` 全部标 `optional`，因为 profile 里不会安装这些包（见 §3.4）。
- `lib/wiki/` 是 `scripts/build.mjs` 从 `src/host/wiki/` 复制的内置 Python 引擎（含 `UPSTREAM.md` 来源说明）；发布包会带上它。

### 3.2 两个半边的职责边界

| | Host 半（`src/index.ts` / `src/host/*`） | Client 半（`src/client/index.tsx` / `src/client/*`） |
| --- | --- | --- |
| 运行环境 | DSH 主进程（Node） | 浏览器（Web / Electron renderer） |
| 能做什么 | 持久化存储域、注册 `/api` 路由与 SSE、读进程/文件、调子进程、调 `llm` 服务、管理 Agent 与会话 | 读客户端服务（sessions/workspaces/uiWorkspace…）、注册 slot、渲染 React、fetch 插件自己的 `/api` 路由、保留会话并复用官方聊天 |
| 不能做什么 | 直接操作 DOM/React | 读文件、调子进程、直接拿模型服务（只能经 Host 路由） |

判断一段逻辑放哪边：**需要跨进程/跨设备/持久化/子进程 → Host；纯展示与交互 → Client。** 共享的纯函数（分类、排序、指标、解析）放 `src/shared/`，两端都能 import，且不依赖任何 DSH 包。

### 3.3 Cordis 上下文、`inject` 与生命周期（最容易踩坑的部分）

插件导出的形状：

```ts
export const name = 'dsh-session-board'
export const inject = ['storageDomain', 'connection', 'webServer', 'llm'] // Host
export function apply(ctx: Context, config?: Config): void | (() => void) { ... }
```

- `inject` 里声明的服务**全部可用**后，Cordis 才调用 `apply`；任一服务消失，插件会被卸载。
- `ctx.effect(fn, label)` / `ctx.on(...)` 的清理随插件卸载自动执行。
- 客户端同样有 `export const inject`（本插件是 `['slots', 'locale']`）。注册 slot、设置页、渲染入口都在 `apply` 里完成。
- 可选能力用嵌套 `ctx.inject([...], cb)`：管理面板就是这样接 `sessionController`/`workspaceRegistry`/`agents` 的，缺服务时只隐藏管理中心（`src/host/manager/wiring.ts`）。

**规则 1：需要某个服务，就把它加进 `inject`（或嵌套 `ctx.inject([...], cb)`），不要用 `ctx.get('服务名')` 抢读。**

`ctx.get` 只在「读取那一刻该服务的提供者已经 active」时有效。插件装配顺序取决于 bundle 顺序；如果插件先装配，`get` 拿到 `undefined` 并把它缓存进闭包，**该功能此后永久失效且没有任何报错**。0.3.5 修复的「点卡片不跳转会话」就是这个原因（`uiWorkspace` 被 `ctx.get` 抢读成 `undefined`）。交互时再解析一次是兜底，不是替代 inject。

```ts
// 错误：装配时可能还没提供，拿到 undefined 就永久缓存
const navigation = ctx.get('uiWorkspace')

// 正确 A：声明依赖，等待可用
export const inject = ['slots', 'locale', 'uiWorkspace', 'sessions']
// 正确 B（按需、可降级）：嵌套注入
ctx.inject(['uiWorkspace'], (scoped) => {
  const navigation = scoped.get('uiWorkspace')
  // ... 注册只在 navigation 可用时生效的 UI
})
// 正确 C（兜底）：点击时再解析一次，防止服务实例被替换
const navigationOf = () => cachedNavigation ?? (ctx.get('uiWorkspace') as UiWorkspaceService | undefined)
```

判断服务名是否有提供者，最可靠的办法是查目标版本 App 的客户端包（§8.3）或源码中的 `super(ctx, 'name')` / `ctx.provide('name')`。

**规则 2：Host 与 Client 的服务不同，别混用。**

- Host 常用：`storageDomain`、`connection`（`connection.fetch` 注册已认证路由、`requestRejection` 做 Host/Origin + 浏览器会话校验）、`webServer`（裸路由，可挂 SSE，但**不会**自动做鉴权，必须自己调 `requestRejection`）、`llm`、`session/event` 事件、`sessionController`、`workspaceRegistry`、`agents`。
- Client 常用：`slots`、`locale`、`sessions`、`uiSession`、`uiWorkspace`、`workspaces`、`jobs`、`remote.*`（typert 生成的远程命名空间）。

### 3.4 运行时依赖限制（硬性）

插件运行时**不能 import `@deepseek-ai/*`**（profile 里没有这些包，Node 解析会失败，插件直接加载不了）。做法：

- Host：需要 DSH 服务时，用**结构化 interface** 自己在插件里描述要用的成员，通过 `ctx.get()` / `inject` 拿实例（见 `src/host/plugin.ts` 里的 `HostConnectionService`、`src/host/model-service.ts`）；DSH 类型只在 `import type {} from '@deepseek-ai/...'` 里补 ambient 声明，编译后擦除。
- Client：`lib/client.js` 只允许引用**平台冻结模块表**：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。其余依赖必须打进 bundle 或声明 `dsh.client.external`（本插件不需要）。
- 需要工具定义时：Host 侧可以直接用 `ToolDefinition` 的结构（`{ name, description, parameters, output: { schema, render }, execute }`），类型仅在 `import type` 中使用；`src/host/manager/tools.ts` 是示例。

### 3.5 Client 半的挂载方式（session-board 用了三种）

1. **Slot 贡献**：`shell.overlay`（全屏看板、管理中心抽屉）、`settings.section`（设置页）、`conversation.session.header.actions`（看板/管理中心开关）、`sidebar.footer.action`（管理中心常驻入口）。
2. **DOM 停靠列**：侧栏右侧的看板列**不是 slot**——shell 的网格列位已经被占满。`src/client/dock-adapter.ts` 按 DOM 契约把根节点插进页面并跟随主题/断点/宽度变化；契约不识别时安静地不挂载，其它功能不受影响。改布局要同时看 `dock-adapter.ts`、`dock-layout.ts`、`css.ts`。
3. **嵌入式官方聊天**：管理中心抽屉不自己画聊天，而是在 `shell.overlay` 条目里声明子 slot `session-board.manager.chat`（single/session），用 slot 提供的 `SessionProvider` 包住，再 `renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero })`；输入框、模型选择、流式、工具卡、ask 都来自宿主。可参考 `packages/client/ui-subagent/src/client/sidebar-chat/index.tsx`；细节见 `docs/session-board-manager-agent-design.md`。

### 3.6 Host ↔ Client 通信

- 已认证 JSON 路由：`connection.fetch` 注册（自动做 Host/Origin + 浏览器登录校验），本插件有：
  - `GET  /api/session-board/board`（快照）
  - `POST /api/session-board/ack`（标已读）
  - `POST /api/session-board/wiki-archive`（预览/提交归档提炼）
  - `POST /api/session-board/synthesis-model`（读/写提炼模型偏好；`action` = `read | write | catalog | capabilities`）
  - `POST /api/session-board/wiki-config`（`action` = `read | write | reset | probe`；`WIKI_CONFIG_CAPABILITY = 1`）
  - `GET  /api/session-board/manager/state`（懒创建/读取管理会话、选区、任务）
  - `POST /api/session-board/manager/selection`（持久化面板选区镜像）
  - `POST /api/session-board/manager/task`（创建/更新任务）
- 单向推送：`GET /dsh-session-board/stream`，SSE，每次变化推整份 `BoardFeed`。这是裸 `webServer` 路由，**handler 里第一件事必须是 `requestRejection(req)`**，否则任何能访问端口的进程都能读会话元数据。
- 面板→管理 Agent 的消息**不走**插件自己的路由：客户端用 `sessions.retain(managerSessionId, { source: 'sessionBoardManager' })` → `await reference.ready` → `reference.binding.session.prompt([...], 'queue')`，与 GUI 发送同一条 Host 路径（持久化、去重、鉴权一致）。
- 客户端 `fetch` 用同源相对路径（`src/client/feed.ts`、`src/client/synthesis-settings.ts`、`src/client/wiki-settings.ts`、`src/client/manager/controller.ts`）。

---

## 4. `dsh-session-board` 插件地图

### 4.1 目录与职责

**Shared（两端共用，纯函数）**

| 文件 | 职责 |
| --- | --- |
| `shared/types.ts` | `BoardFeed`、`BoardEntry`、分组/状态类型，`EMPTY_FEED` |
| `shared/board.ts` | 原始会话输入 → 卡片（`buildEntry` / `buildBoard`），不依赖 React |
| `shared/classify.ts` | 运行/等待/未读/结束状态判定 |
| `shared/order.ts` | 分组与组内排序 |
| `shared/metrics.ts` | 耗时、token/s、缓存命中率格式化 |
| `shared/preview.ts` | 指令/活动预览文本截断 |
| `shared/archive.ts` | 归档契约：`ArchiveScope`/`ArchiveSummary`/`WikiWorkflowResult`、解析与校验、`WIKI_WORKFLOW_CAPABILITY` |
| `shared/synthesis.ts` | 提炼模型偏好与目录：`SynthesisModelPref`、`SynthesisModelSelection`、`parseCatalogGroups`、`synthesisModelOptions`、思考档位解析 |
| `shared/wiki.ts` | Wiki 配置契约：`WikiConfig`、默认值/路径推导、`parseWikiConfigResponse`、`WIKI_CONFIG_PATH`、`WIKI_CONFIG_CAPABILITY` |
| `shared/manager.ts` | 管理中心 wire 契约与纯函数：路由常量、`ManagerStateView`/`ManagerTaskView`、`buildSelectionMessage`、`managerPhase`、`normalizeSelection` |

**Host（`src/index.ts` → `src/host/plugin.ts`）**

| 文件 | 职责 |
| --- | --- |
| `host/plugin.ts` | Host 入口：注入 `storageDomain/connection/webServer/llm`；打开 acks/turns/prefs/wiki 域；装配 ledger + 路由 + 归档器 + Wiki 配置 + 管理面板（嵌套 inject） |
| `host/domain.ts` | 存储域定义（§4.2）、记录校验（normalize-not-throw） |
| `host/ledger.ts` | 持久状态：ack 游标、turn 起止事件（`session/event`）、busy 统计；变更时 `broadcast()` |
| `host/routes.ts` | 5 条 `/api` JSON 路由 + 1 条 SSE 裸路由；偏好/Wiki 配置读写校验与错误码 |
| `host/model-service.ts` | `llm` 服务的结构化视图：`listSynthesisCatalog`、`isKnownSynthesisModel`（`ok/UNKNOWN_MODEL/UNKNOWN_EFFORT`）、`runSynthesisModel`（透传 `reasoningEffort`） |
| `host/wiki-config.ts` | 保存/校验/检查 Wiki 配置（引擎来源、路径、Python、超时、provider）；写 `wiki-config` 路由；`WIKI_CONFIG_CAPABILITY` |
| `host/wiki-archive.ts` | Wiki 归档器：preview/commit、超时与 TTL、错误分类、调用 `wiki-workflow.py`、插件侧模型调用 |
| `host/wiki-workflow.py` | Python 桥：`scope/synthesize/prompt/write/index`，调用引擎脚本的解析/校验/状态逻辑 |
| `host/wiki/` | **内置引擎**：`wiki-archive.py`、`wiki-synthesize.py`、`wiki-index.py` 与 `UPSTREAM.md`（来源/无外部依赖约定）；构建时复制到 `lib/wiki/` |
| `host/manager/` | 管理中心 Host 半（见 §4.6）：`mux.ts`、`domain.ts`、`service.ts`、`tools.ts`、`routes.ts`、`wiring.ts` |

**Client（`src/client/index.tsx`）**

| 文件 | 职责 |
| --- | --- |
| `client/index.tsx` | 入口：字典/样式、设置页 slot、`shell.overlay` slot（看板 + 管理中心）、会话头部与侧栏底部入口、dock DOM 挂载；装配 `BoardFeedClient` + `BoardModel` + `BatchController` + `ManagerController` |
| `client/feed.ts` | SSE 客户端（断线重连、可见性恢复）、归档预览/提交请求 |
| `client/source.ts` | 从 DSH 服务 + feed 组装 `BoardSessionInput[]` |
| `client/model.ts` | `BoardModel`：订阅 sessions/statuses/jobs/workspaces/feed，派生卡片与分组，管 ticker 与 job watcher |
| `client/batch.ts` | 批量选择/预览/确认/结果状态机（`BatchController`） |
| `client/native-archive.ts` | 提炼成功后调用 DSH 原生归档（`uiWorkspace.archiveSession`），带竞态保护 |
| `client/SessionCard.tsx` | 单卡渲染；点击打开会话；展开详情；标已读；勾选 |
| `client/BoardList.tsx` / `BoardDock.tsx` / `BoardOverlay.tsx` | 列表 / 停靠列 / 全屏看板 |
| `client/BatchToolbar.tsx` | 批量工具栏、确认框、结果面板 |
| `client/BoardFilterBar.tsx` / `filters.ts` / `workspace-tree.ts` | 搜索、状态/工作区筛选（含「仅归档」按钮）、按状态/工作区/树分组 |
| `client/archive-marks.ts` | 客户端侧归档标记（与 DSH 归档状态合并） |
| `client/synthesis-settings.ts` | 「归档提炼」设置控制器：读偏好、取模型目录（Host 路由 `action:'catalog'`）、保存 |
| `client/wiki-settings.ts` / `WikiSettingsSection.tsx` | 「Wiki 归档引擎」设置控制器与 UI：读写配置、检查环境、展示默认路径 |
| `client/SettingsPage.tsx` | 设置页容器：归档提炼 + Wiki 引擎两个分组 |
| `client/manager/controller.ts` | 管理中心控制器：宿主 state 轮询（打开期间 4s）、选区镜像、任务 CRUD、保留管理会话并发送选区消息 |
| `client/manager/ManagerDrawer.tsx` | 右侧抽屉：工作区看板 → 会话勾选 → 任务卡 → 选区发送；header/footer 两个入口 |
| `client/manager/ManagerChat.tsx` | 子 slot 内容：`SessionProvider` + 官方 `conversation.content`（embedded） |
| `client/dsh.ts` | 客户端 DSH 服务的结构化 interface（唯一允许描述 DSH 服务形状的地方之一） |
| `client/locales.ts` | 中英字典（`NS = 'session-board'`） |
| `client/css.ts` | 全部样式（`sb-*` 类名） |
| `client/hooks.ts` / `store.ts` / `lifecycle.ts` | `useSnapshot`、可持久化 store、清理栈 |

**Tests**

- 32 个 spec 文件、440 个用例（0.5.1）：纯函数单测、Host 路由/归档器/Wiki 配置、React 组件 jsdom 测试（用 esbuild 现场打包真实组件）、真实 Python 的 Wiki 集成测试（缺 python/zstd 时跳过）、管理中心 mux/domain/tools/shared 单测。
- `tests/component-entry.tsx`：组件测试入口，用 esbuild 把真实 TSX 打成 CJS 再挂载；**不要**为测试另写一套 mock 组件。
- `tests/wiki-test-environment.ts`：真实 `wiki-archive.py` 的合成环境（临时 wiki 根、合成 DSH 会话）；`tests/wiki-integration.spec.ts` 需要 python/zstd。
- `tests/manager-*.spec.ts`：管理中心 Host 半（mux 折叠/优先级/上限/digest、域解析、wire 契约、工具参数校验）。

### 4.2 存储域（Host）

| 域 | version | 表 | key / 值 |
| --- | --- | --- | --- |
| `dsh_session_board` | 1 | `acks` | session id → `{ lastTurnEnd, lastTurnEndKind, lastTurnEndError, ackedAt }` |
| `dsh_session_board_turns` | 1 | `turn_stats` | session id → busy 统计 |
| `dsh_session_board_prefs` | 1 | `prefs` | `synthesis` → `{ model, provider, reasoningEffort }` |
| `dsh_session_board_wiki` | 1 | `config` | 单条 `WikiConfig`（引擎来源、wiki 根、SCHEMA、python、超时、provider…） |
| `dsh_session_board_manager` | 1 | `manager_state` / `manager_tasks` | `state` → `{ managerSessionId, managerWorkspaceId, selection, wakeEnabled, revision, lastProgress? }`；task id → `{ id, title, status, workspaceId?, sessionId?, note?, createdAt, updatedAt }` |

规则：**版本 1 内做向后兼容的字段新增**（旧记录按缺省解析）；不兼容的 shape 变更要开新域。域打不开时 Host 降级为「无持久事实」，Client 仍可渲染，不允许整个插件挂掉。

### 4.3 核心数据流

```
用户点击卡片
  └─ SessionCard.onOpen → face.openSession(id)
       └─ uiWorkspace.openSession(id | 子代理地址)
            ├─ 成功：主界面切到该会话
            └─ 失败：依次尝试子代理地址 → 已归档则 unarchive 后重开 → 记日志

会话事件 / 客户端状态变化
  ├─ Host：session/event → BoardLedger（turn 起止、错误摘要），变更 → SSE broadcast
  └─ Client：sessions/statuses/jobs/workspaces 订阅 + SSE feed → BoardModel 派生卡片 → 渲染

批量归档提炼
  └─ BatchToolbar → BatchController.preview/confirm
       └─ POST /api/session-board/wiki-archive
            └─ WikiArchiver.preview/commit
                 ├─ workflow('scope')            Python：解析会话范围
                 ├─ perform(ids, dry-run)         Python：批量扫描/归档原文
                 ├─ synthesizeOne(per session)    已选模型 → prompt → llm.stream → write
                 └─ workflow('index')              Python：统一更新 Wiki 索引
       └─ 成功后 native-archive.ts → uiWorkspace.archiveSession(id)（DSH 原生归档）

管理中心（0.4+）
  └─ 面板打开 → GET /manager/state → 懒创建 dsh-console 工作区 + 「DSH 管理台」会话
       ├─ 选中工作区/会话 → 勾选 → 「发送选区给管理员」
       │    ├─ POST /manager/selection（持久化选区镜像，不唤醒模型）
       │    └─ 客户端官方 prompt（sessions.retain → session.prompt）把 [选区] 消息交给管理 Agent
       ├─ 管理 Agent → 工具（workspace_overview / assign_task / update_task …）
       │    ├─ assign_task：workspaceRegistry 取工作区 → sessionController.create → 投递 brief → 任务表
       │    └─ 工具只在管理 Agent 的 agent.ctx 上注册（agent/created 时安装，冷恢复重装）
       └─ Host EventMux：session/event + agent/status → 全量状态 + 有界就绪队列
            └─ 自动唤醒默认关；开启后仅空闲、每分钟最多一次、投递一条 digest
```

### 4.4 设置页

- 位置：设置 →「会话看板」，两组设置。
- **归档提炼**：提炼模型（选项来自 Host `action:'catalog'`，即 `llm.listProviders()` + `llm.listModels()` + `resolveModelInfo()`）、思考等级（模型披露的 `reasoning.efforts`，保存为 `reasoningEffort`）。保存：`POST /api/session-board/synthesis-model` `{action:'write', model, provider, reasoningEffort}`；错误码 `UNKNOWN_MODEL` / `UNKNOWN_EFFORT` / `STORE_UNAVAILABLE`。未选模型时回退 Wiki provider（默认 `stepx-terra`，`~/.dsh-session-board.json` 的 `synthesisProvider` 可覆盖，**不要**把账号相关 provider 写死进发布包）。
- **Wiki 归档引擎**（0.5+）：Wiki 根目录、SCHEMA 规则、引擎来源（内置/本地）、脚本目录、Python、超时、Wiki provider、归档状态文件、provider 配置文件；保存走 `POST /api/session-board/wiki-config`（`action`：`read` 读、`write` 写、`reset` 恢复默认、`probe` 检查环境），写入前校验，保存后下一次归档生效；「检查环境」报告引擎脚本/Python/SCHEMA/状态文件。默认复用 `~/wiki`，数据/状态/锁都写在 wiki 根目录，不写插件安装目录。部署默认值可写在 `cordis.patch.yml` 的插件行 `config`（字段：`wikiRoot`、`schemaPath`、`scriptsMode`、`scriptsDir`、`python`、`stateFile`、`timeoutSeconds`、`provider`、`synthConfig`；用户保存过的配置优先）。详见插件 README。
- 管理中心没有设置页；管理目录用环境变量覆盖（§2.3）。

### 4.5 错误码表

| 码 | 含义 / 处理 |
| --- | --- |
| `INVALID_SELECTION` | 归档/设置请求体不合法，或选择不是 1–50 个合法精确会话 ID；客户端先校验 |
| `INVALID_RESULT` / `INVALID_CONFIG` | 引擎/脚本返回的结构不合契约、Wiki 配置写入校验失败；看 `detail` 与 wiki.log |
| `BUSY` | 同一时间只允许一个归档请求；等前一个完成 |
| `PREVIEW_EXPIRED` | 预览 token 过期（5 分钟）或已用过；重新预览 |
| `SELECTION_MISMATCH` | 预览后会话集合/原文路径发生变化；重新预览 |
| `STATE_UNAVAILABLE` | Wiki 状态文件损坏或版本不支持（python exit 5） |
| `ENGINE_UNAVAILABLE` | 引擎脚本/Python 不可用或启动失败（内置引擎缺失、本地模式目录不对、python 缺失、ImportError/FileNotFoundError） |
| `SCHEMA_UNAVAILABLE` | SCHEMA 规则文件缺失或为空 |
| `WORKFLOW_UNAVAILABLE` | 桥接脚本其它未分类失败；看 wiki.log 的 traceback |
| `SCOPE_FAILED` / `SYNTHESIS_FAILED` / `INDEX_FAILED` | 桥接脚本对应阶段失败；优先解析脚本 stdout 的 JSON `error`，`detail` 里有诊断 |
| `SYNTHESIS_TIMEOUT` | 单会话提炼超过引擎内部上限；拆小/重试 |
| `ARCHIVE_UNAVAILABLE` / `CANCELLED` | 进程超时被杀、DSH_HOME 未知等不可用情况 / 调用取消；`timeoutSeconds` 可调（默认 300） |
| `CATALOG_UNAVAILABLE` | Host 列表模型失败（看宿主日志 `model catalog read failed:`） |
| `UNKNOWN_MODEL` / `UNKNOWN_EFFORT` | 模型路由或思考档位已不存在，重新选择 |
| `STORE_UNAVAILABLE` | 偏好/Wiki 配置存储域未打开；看宿主日志 |
| `HOST_OUTDATED` | 正在运行的 Host 比 Client bundle 旧（通常是升级后没重启），提示用户完全退出重开 |
| `MANAGER_STATE_UNAVAILABLE` | 管理中心 state 读取/懒创建失败；面板显示错误并提供重试 |
| `SELECTION_INVALID` / `TASK_INVALID` | 管理中心选区/任务请求体不合法；客户端先校验 |

### 4.6 管理中心（0.4+）设计摘要

- 目标：会话里新建/管理的工作区、会话与任务，在一个常驻面板里可视、可勾选、可派任务给常驻管理 Agent。
- 形态：`shell.overlay` 右侧抽屉（`src/client/manager/ManagerDrawer.tsx`），入口在侧栏底部常驻 + 会话头部；上下两栏嵌官方聊天。
- Host：`src/host/manager/` 六个模块（epoll 风格 EventMux、manager 域、ManagerService、管理工具、路由、嵌套 inject 装配）；管理工具只在管理 Agent 的 `agent.ctx` 上注册，冷恢复时由 `agent/created` 重装。
- 管理 Agent 是普通 DSH 会话（标题「DSH 管理台」），懒创建在 `~/Documents/deepseek-harness/dsh-console` 工作区；用 `sessionController.prompt` 冷恢复；选区/任务上下文用动态 `systemPrompt.context`。
- 完整设计与实现状态见 [`docs/session-board-manager-agent-design.md`](session-board-manager-agent-design.md)（含 epoll 映射、路线图、已知缺口、Dev3 实测记录）。

---

## 5. 开发闭环（每次改动都走这一遍）

```sh
cd plugins/dsh-session-board
export DSH_REPO=/absolute/path/to/deepseek-harness
export ZSTD_BIN=/opt/homebrew/bin/zstd   # 或 PATH 里有 zstd
npm run check        # 严格 tsc + vitest（32 文件 / 440 用例）
npm run build        # 重新生成 lib/（index.js、client.js、types/、wiki-workflow.py、wiki/）
npm pack --ignore-scripts --pack-destination ~/Downloads
```

要点：

- `lib/` 提交进仓库；**不要手改 `lib/`**，它由 `scripts/build.mjs` 生成。改了 `src/` 必须 `npm run build`。`hide-empty` 与 `autoregister` 是例外：它们没有构建步骤，`lib/` 就是源码（见 §5.4）。
- `check` 需要 DSH 检出提供 tsc/vitest/esbuild，且会做严格类型检查；先过 check 再 build。包里的 `vitest.config.ts` 用来固定测试范围（嵌套在 DSH 源码树里时，否则会拾取 DSH 根 vitest 配置）。
- 前端改动改 `src/client/*` + `css.ts` + `locales.ts`；Host 改动改 `src/host/*`；两端共用逻辑放 `src/shared/`；管理中心的契约在 `src/shared/manager.ts`。
- 新增文案：中英两份都要加（`locales.spec.ts` 会验证键集合、占位符、非空）。
- 组件行为要有 jsdom 测试（`tests/components.spec.ts`）；纯逻辑要有单测；Host 路由/域要有对应 spec。测试数据一律合成，不引用真实会话/截图/密钥。
- 不要提交 `*.tgz`、`node_modules/`、`.npm-cache/`、真实 DSH_HOME 数据（`.gitignore` 已覆盖）。

### 5.1 安装验证（用户视角）

1. 设置 → 插件 → 添加插件 → 选 `.tgz`（或 `dsh plugin install <绝对路径>`）。
2. **完全退出 DSH，再重新打开**。
3. 打开看板 / 管理中心 / 设置页，验证本次改动点。
4. 出问题看两处：宿主进程日志（`ctx.logger.warn` 输出，含 `dsh-session-board:` 前缀）和浏览器控制台（客户端 `console.warn`）。Wiki 归档失败另有 `~/.dsh-session-board/wiki.log`。

### 5.2 本地复现/自动化验证（进阶）

用一份临时 DSH home 起一个独立的 web 实例，不碰用户数据：

```sh
# 1) 准备临时 home（可从真实 home 复制 profiles + 少量会话，或直接用空 home）
TMP_HOME=/tmp/dsh-test-home

# 2) 用目标版本的 DSH CLI 把插件装进该 home 的 web profile
DSH_HOME=$TMP_HOME node dsh/node_modules/@deepseek-ai/dsh/lib/bin.js \
  plugin --profile web add file:/absolute/path/to/dsh-session-board-x.y.z.tgz

# 3) 起服务（会打印带 token 的访问 URL）
DSH_HOME=$TMP_HOME node dsh/node_modules/@deepseek-ai/dsh/lib/bin.js web --port 5399 --no-open
```

然后可用 `ego-browser`（或任意浏览器）打开打印出的 URL，用 `page.evaluate` 注入 console 收集器、真实鼠标点击卡片，检查 `localStorage['dsh.sessions.current']` 是否切换。要测正式版的真实行为，可从 `DeepSeek Harness.app/Contents/Resources/app.asar` 解包出同一版本的 DSH 运行时再跑（见 §8.3）。

### 5.3 在运行中的 dev 实例上验证（Dev3 + CDP）

Dev3 这类 dev 构建带 CDP：渲染进程 `--remote-debugging-port=9262`、Host 进程 `--inspect=127.0.0.1:9270`、主进程 `--inspect=127.0.0.1:9269`。可以像操作真实用户界面一样验证插件，**纯 Host 插件不需要模型额度**（管理中心聊天第一次需要先给会话选一次模型）。

推荐流程：

1. **构建**：`npm run check && npm run build`（先在本地完成，再动 Dev3）。
2. **安装到 Dev3**：在 Dev3 窗口里 设置 → 插件 → 添加插件 → 填插件目录绝对路径（本地目录是 link 安装，方便反复重建）。卡片 `data-plugin-status="running"` 即 Host 半已激活；装完**重启 Dev3** 让新客户端 bundle 生效。
3. **重启**：`osascript -e 'tell application "Harness Dev3" to quit'`；`open -a '/Applications/Harness Dev3.app'`；等 `curl -s http://127.0.0.1:9262/json/version` 恢复。
4. **看渲染结果**：`curl http://127.0.0.1:9262/json/list` 拿页面 `webSocketDebuggerUrl`，用 CDP `Runtime.evaluate` 读 DOM/插件状态、`Page.captureScreenshot` 截图。验证后把 GUI 恢复到原页面。
5. **拿活的 Cordis Loader（Host 进程）**：连 `127.0.0.1:9270`，在 `Runtime.evaluate` 里执行：
   ```js
   const { createRequire } = process.getBuiltinModule('module')
   const require2 = createRequire('/tmp/anchor.cjs')
   const { Loader } = require2('<目标构建>/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js')
   globalThis.__Loader = Loader
   ```
   再用 CDP 取 `__Loader.prototype` → `Runtime.queryObjects` 得到活的 loader 实例（`require(esm)` 与宿主共用 ESM 缓存，类身份一致）。`loader.root.ctx` 是根上下文，`loader.store` 里能拿到各 entry 的 `ctx`；也可以用 `Entry` 类 queryObjects 后按 `options.name` 找到某个插件行。
6. **断言与触发**：断言 `ctx.get('<service>')`、服务快照、注册表状态（只读，不要长期持有引用）；触发 `ctx.emit('<event>', payload)` 直接驱动插件监听器，适合验证「事件 → 副作用」链路，不必让 agent 真的跑一轮模型。
7. **清理**：用同一 Host API 删掉测试注册、归档临时会话、删测试目录；不要留下测试数据。dev 实例的本地存储与正式版隔离，但同样需要清理。

管理中心的手工验收清单（Dev3）：

- 侧栏底部「管理面板」/ 会话头部按钮能打开抽屉；首次打开会自动创建 `dsh-console` 工作区与「DSH 管理台」会话。
- 工作区看板显示会话数/运行数；点工作区后会话列表出现且可勾选；「发送选区给管理员」后管理聊天里出现 `[选区]` 消息。
- 让管理 Agent 调 `workspace_overview`（回答里应出现真实工作区/会话计数）；`assign_task` 后任务卡出现并可在之后刷新为 running/blocked/done。
- 任务/选区状态在面板打开期间会 4s 轮询刷新；关闭抽屉后停止轮询。

**两个坑**（都踩过）：

- **不要在 Dev3 正在重载页面/客户端时重建插件**：重建会替换 `lib/client.js`，半写状态被客户端加载会让 web boot 直接失败、应用退出。顺序永远是「先构建，后重启 Dev3」；万一已经发生，重启 Dev3 即可恢复。
- Dev3 默认没有选模型：管理中心聊天第一次发消息前，先在聊天输入区的模型选择器选一个模型；之后 profile 会记住默认模型。

限制：只有 dev 构建有 CDP，正式版 App 没有；这验证的是 Host/客户端行为，最终用户可见的渲染仍要在正式版截图或肉眼核对。

### 5.4 手写 JS 插件（hide-empty / autoregister / think-bounce）

- **`dsh-hide-empty-workspaces`**：没有 `src/`、没有构建步骤，直接编辑 `lib/client.js` / `lib/index.js`；测试是 `node test/client.smoke.mjs` 与 `node test/host.smoke.mjs`（jsdom 冒烟），发布前再装进 Dev2/Dev3 实际点一遍视图切换。
- **`dsh-workspace-autoregister`**：没有构建步骤，直接编辑 `lib/index.js`；测试 `node --test test/autoregister.test.mjs`（41 个用例）。改完同样要在 Dev3 里真实 scaffold 一个目录验证注册+首个会话；0.1.1 起还会把工作区 `HANDOFF.md` 作为首个会话消息。
- **`dsh-think-bounce-pet`**：上游构建产物；补丁直接改 `lib/`，回归测试用仓库内脚本（见插件 README）。
- 这三个插件发布时同样走 §6（版本递增、CHANGELOG、tag、Release、SHA256SUMS），但没有 `npm run check`；用各自的 Node 测试 + 实机验证代替。

---

## 6. 发布流程（逐条照做）

版本号规则：**每发布一次必须递增，已发布的 tag/安装包永不覆盖**。功能 → minor/patch 按语义递增即可（session-board 在 0.3.x/0.4.x/0.5.x 上持续 patch/minor 递增；hide-empty 0.2→0.3 为功能升级）；只有文档变更可以不发版。

1. 更新 `package.json` 的 `version`。
2. 更新 `CHANGELOG.md`：`## x.y.z — YYYY-MM-DD` + 条目（中文，说明用户可感知的变化与原因）。
3. 同步 UI 里的版本标记：`src/client/BoardDock.tsx`、`src/client/BoardOverlay.tsx` 的 `data-session-board-version`（当前 `0.5.1`；hide-empty 没有该标记）。
4. `npm run check`，`npm run build`（hide-empty/autoregister 跳过 build，改为跑各自 Node 测试）。
5. `npm pack --ignore-scripts --pack-destination ~/Downloads`，确认生成的 tgz 包含：`lib/`（含 `lib/wiki/`）、`cordis.patch.yml`、`README.md`、`LICENSE`、`CHANGELOG.md`，且**不含** `src/`、测试、密钥、个人路径。0.5.1 起注释与 fixture 也做过脱敏检查。
6. 生成校验和：`shasum -a 256 dsh-session-board-x.y.z.tgz | tee SHA256SUMS-x.y.z`。
7. 提交 + 打 tag + 推送（先 `git fetch && git pull --rebase origin main`，远端可能被其他自动化/其它会话抢先推送；冲突时先 rebase 再推）：
   ```sh
   git add plugins/dsh-session-board
   git commit -m "..."
   git tag dsh-session-board-vx.y.z
   git push origin main dsh-session-board-vx.y.z
   ```
8. 发布 Release 并上传校验和：
   ```sh
   gh release create dsh-session-board-vx.y.z --title "dsh-session-board x.y.z" \
     --notes "..." ~/Downloads/dsh-session-board-x.y.z.tgz
   gh release upload dsh-session-board-vx.y.z ~/Downloads/SHA256SUMS-x.y.z --clobber
   ```
9. 同步到本机「开发检出」并重建（用户用来验证的工作副本，**不要**用 rsync 空变量路径）：
   ```sh
   rsync -a --delete \
     --exclude node_modules --exclude '*.tgz' --exclude .git --exclude DESIGN.md \
     /path/to/repo/plugins/dsh-session-board/ \
     /path/to/default-workspace/dsh-session-board/ \
   && cd /path/to/default-workspace/dsh-session-board && DSH_REPO=... npm run build
   ```
10. 告诉用户：装哪个包、SHA256、Release 链接、**完全退出重开**，以及本次修复点怎么验证。
11. 所有插件都发布后，确认最新 Release 的 tag 与 `package.json` 版本一致（`gh release list` 的 Latest 应为最新一次发布）。

> 教训：不要把路径写进变量后跨 `&&`/`;` 复用——一条命令里变量未赋值就执行 `rsync "$SRC"/ "$DST"/` 会变成 `rsync / /`。用完整路径或独立 shell 调用。

---

## 7. 硬规则与用户偏好（评审时逐条检查）

1. **版本号必须递增**，tag/安装包不覆盖；用户重复遇到过版本号不变的问题。
2. **发布包不含密钥、个人绝对路径、真实会话内容、截图**；测试数据全部合成。
3. **不把账号相关的 provider/模型写死**：默认 provider 保持 `stepx-terra`，本地通过 `~/.dsh-session-board.json` 覆盖。
4. 插件运行时**不能 import `@deepseek-ai/*`**（Host 与 Client 都是），只能用结构化 interface。
5. **不要用 `ctx.get` 抢读服务**；用 `inject` 或嵌套 `ctx.inject`，并在交互时再做一次兜底解析（§3.3）。
6. 裸 `webServer` 路由必须自己调 `connection.requestRejection`；SSE 也不能例外。
7. 存储记录解析采用 normalize-not-throw；域打不开时降级，不阻塞插件其它功能。
8. `cordis.patch.yml` 只 insert 本插件；不修改官方 bundle 行为。
9. `lib/` 是生成物（session-board），改了源码必须重建；不要手改。手写 JS 插件（hide-empty/autoregister）相反：`lib/` 就是源码，改完直接跑 Node 测试。
10. 中英文案同步；面向用户的报错要给稳定错误码 + 可操作提示，不吞异常。
11. 发布前必须跑对应检查且全绿（session-board 基线 32 文件 / 440 用例；hide-empty 两个 smoke；autoregister 37 个 node:test）。
12. 改动涉及用户数据（归档、标记、偏好、Wiki 配置、任务）时，先备份、可回退；不要替用户删数据。
13. **注释、文档、测试 fixture 不含本机用户名、主机名、真实设备名、内部工具名**（0.5.1 已清理过一轮；新增注释/样例遵循同样的脱敏要求）。
14. **管理中心的管理工具只能注册在 manager Agent 的 `agent.ctx` 上**，不能全局 `ctx.tools.register`，也不要在 `apply` 时静默降级成「所有会话都能用」。
15. **内置 Wiki 引擎（`src/host/wiki/*.py`）是上游副本**：不要手改行为而不更新 `UPSTREAM.md`；引擎行为用合成 wiki 环境的集成测试验证（`tests/wiki-integration.spec.ts`），缺 python/zstd 时明确跳过。
16. 新增 Host→Client 能力时，先加能力号（如 `WIKI_CONFIG_CAPABILITY`），客户端探测后再启用，避免升级后「新 Client 配旧 Host」。

---

## 8. 排障手册

### 8.1 常见症状

| 症状 | 先查什么 | 典型原因 / 处理 |
| --- | --- | --- |
| 设置页「无法读取模型列表」 | 宿主日志 `model catalog read failed:` | Host `llm` 服务列表失败；不要回退到客户端 `remote.session`（在部分宿主构建里取不到），目录必须由 Host 路由提供 |
| 点卡片不跳转 | 浏览器控制台 `navigation-unavailable` / `open-session-failed` | 服务未注入/装配时机问题（§3.3）；已归档会话需先 unarchive；子代理会话要用 `{parentSessionId, childSessionId, mode:'continuable'}` |
| 升级后设置页提示重启 / `HOST_OUTDATED` | Client bundle 与运行中 Host 版本 | Host 与 Client 分别加载，完全退出重开；确认装的是同一个包 |
| Wiki 归档报「引擎不可用」 | 设置页「检查环境」、`~/.dsh-session-board/wiki.log` | 内置引擎缺失/本地模式目录不对/python 不可用；错误码 `ENGINE_UNAVAILABLE`，`detail` 有诊断 |
| Wiki 归档报「SCHEMA 不可用」或「状态文件损坏」 | `<wiki 根>/SCHEMA.md`、状态文件路径 | 规则文件缺失/为空；状态文件版本不支持（`STATE_UNAVAILABLE`） |
| Wiki 归档超时 | 设置页超时值、wiki.log | scope 扫描整个 `DSH_HOME`，历史大会慢；调大 `timeoutSeconds`（默认 300） |
| 管理中心入口消失 | 是否缺少 `sessionController`/`workspaceRegistry`/`agents` 服务 | 嵌套 inject 未满足时管理中心整体隐藏，原看板不受影响；看宿主日志 `dsh-session-board: manager ...` |
| 管理中心「聊天不可用」 | 管理会话是否创建、客户端会话目录是否刷新 | `/manager/state` 失败或返回的会话还没进客户端列表；面板会 `sessions.refresh()` 一次，仍失败则重试；看 `MANAGER_STATE_UNAVAILABLE` |
| 管理中心发消息没反应 | 管理会话是否选了模型 | Dev3/新 profile 没有默认模型；先在聊天输入区选模型，或给管理员设默认模型 |
| 管理中心任务列表不更新 | 抽屉是否打开 | 只在打开期间 4s 轮询；关闭后不刷新，重开即刷新（后续可换 mux SSE） |
| 归档并提炼成功但客户端没归档 | `archivedSessionIds` 快照、`native-archive.ts` 日志 | 仍在运行/有后台任务/等待处理的会话按设计保留；看批次结果面板的原因 |
| 看板显示「待处理」但客户端里已归档 | `workspaces` 服务是否注入 | 未注入时拿不到 `archivedSessionIds`，卡片不知道已归档 |
| Dev3 启动后立刻退出 | `~/Library/Logs/Harness Dev3/` 的 `crash-*-web-boot.log` | 通常是重建插件时正在重载客户端（半个 bundle）；重启 Dev3，且以后先构建后重启 |
| `dsh-session-board: import failed` | 同上 | 同上；确认 `lib/index.js`、`lib/client.js` 是完整构建产物（`npm run build` 原子写失败时重跑） |

### 8.2 日志位置

- Host：DSH 进程 stdout/stderr（桌面版由 App 捕获）；代码里 `ctx.logger?.warn?.(...)`，统一加 `dsh-session-board:` 前缀便于 grep。
- Client：浏览器/Electron DevTools console；`console.warn` 也统一前缀（`client-activation-failed`、`dock-seat-unresolved` 等）。
- Wiki 归档失败：`~/.dsh-session-board/wiki.log`（完整 traceback/stderr），面板同时显示错误码与原因。
- Dev3 崩溃：`~/Library/Logs/Harness Dev3/crash-*.log`（含 web boot 与 renderer console）。

### 8.3 查证目标版本 App 的真实客户端 API

当「源码里有、用户机器上没有」或行为不一致时，直接从安装包确认：

```bash
# 列出 asar 内文件
node -e "const a=require('<DSH_REPO>/node_modules/.pnpm/@electron+asar@*/node_modules/@electron/asar'); console.log(a.listPackage('<app>/Contents/Resources/app.asar').filter(p=>/client\.js$/.test(p)).slice(0,20))"
# 解出某个客户端包，grep 服务名/方法
node -e "const a=require(...asar); process.stdout.write(a.extractFile('<app>/Contents/Resources/app.asar','dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js').toString())" | grep -n "openSession\|uiWorkspace"
```

---

## 9. 权威定义索引（DSH 源码，相对 DSH 仓库根）

| 想查什么 | 去哪看 |
| --- | --- |
| Cordis 上下文/服务/注入语义 | `vendor/cordis/src/{reflect,registry,service,context}.ts` |
| Client 插件加载器、可用服务目录 | `packages/extensions/cordis-client-runner/src/client/api-catalog.ts` |
| 设置页 slot 契约 | `packages/client/ui-settings/src/client/contract/slots.ts` |
| 通用 slot 契约（`shell.overlay` 等） | `packages/client/ui-slots/src/client/contract/slots.ts` |
| 侧栏底部/面板入口 slot（`sidebar.footer.action`、`sidebar.panellist`） | `packages/client/ui-sidebar/src/client/contract/slots.ts` |
| 会话导航 `openSession/unarchiveSession` | `packages/client/ui-workspace/src/client/navigation.ts` |
| `SessionTarget` / `subagentAddress` / `sessions.retain` | `packages/api/session-controller/src/client/contract/sessions.ts` |
| 嵌入式官方聊天（`conversation.content` factory、`SessionProvider`） | `packages/client/ui-conversation/src/client/contract/slots.ts`、`packages/client/ui-subagent/src/client/sidebar-chat/index.tsx` |
| Host `sessionController.prompt`（冷恢复/去重）与 `create` | `packages/api/session-controller/src/{index,commands,agent}.ts` |
| Host 模型目录（`modelCatalog`） | `packages/api/session-controller/src/{index,catalog,types}.ts` |
| `llm` 服务：`listProviders/listModels/resolveModelInfo/stream` | `packages/llm/llm/src/{index,types}.ts` |
| Agent 作用域工具注册 / 系统提示上下文 | `packages/experimental/tool-agent-team/src/index.ts`（`agent/created` + `agent.ctx.tools.register`）、`packages/core/system-prompt/src/index.ts` |
| 存储域 API | `packages/storage/storage-domain/src/index.ts` + `spec.ts` |
| `/api` 通道的信任栅栏 | `packages/client/connection/src/rpc.ts`（`requestRejection`） |
| 客户端插件可用的 `ctx.remote.*` 生成 | `packages/typert/*`、各 `@deepseek-ai/dsh-api-*/lib/typert.remote-client.js` |
| Wiki 引擎上游与约定 | 本仓库 `plugins/dsh-session-board/src/host/wiki/UPSTREAM.md` |

> 这些路径在 `0.2.1-rc.2` / `0.2.1-alpha.1` 上核对过；升级目标 DSH 版本后要重新核对一次。

---

## 10. 已知风险与待办

**管理中心（0.4/0.5 已上线，仍有缺口）**

- 面板状态用 4s 轮询，不是 mux SSE 增量流；mux 目前只服务管理工具与自动唤醒 digest。下一步可把 `EventMux.follow` 接到 `/dsh-session-board/mux/stream`。
- 自动唤醒没有面板开关/预算 UI；只能由管理工具 `set_auto_wake` 打开（默认关，空闲 + 每分钟最多一次）。审计与预算展示仍待补。
- `needs-input` 优先级是保留位：审批/提问是 live waterfall，本版未订阅（避免截断链路）；应从 durable `approval/asked|decided` 派生。
- 面板只列出「有会话的工作区」；没有可见会话的空工作区不显示。
- 管理目录只能通过环境变量 `DSH_SESSION_BOARD_MANAGER_DIR` 覆盖，尚未进 `Config`；管理会话标题/预设不可配置。
- 管理工具的能力边界：不能归档/删除/停止；任务完成需要管理 Agent 显式标记，面板并列显示模型声明与事件证据。

**Wiki（0.5 自包含引擎）**

- 仍然需要 `python3` 与 `zstandard`/`zstd`；Windows/Linux 未系统验证。
- 默认复用 `~/wiki`、`<wiki 根>/scripts/.archive-state.json`（与 CLI 归档共用状态）。本地模式与内置模式的边界回归、provider 配置（`~/.wikibar/config.json`）与 state schema 兼容性要继续盯。
- 引擎是上游副本：行为改动必须更新 `UPSTREAM.md` 并用合成环境集成测试；不要在发布包中写入用户 wiki 数据。

**hide-empty（0.3.9）**

- 依赖原生侧栏 DOM 契约与客户端 Workspace/Session 快照；宿主改版会降级为「不注入」，不会误删数据，但需要重新核对 DOM 契约。
- 视图选择存 `localStorage['dsh.hideEmptyWorkspaces.mode']`；空白会话宽限期可配（默认 10 分钟，`0` 恢复立即隐藏）。

**autoregister（0.1.1）**

- README/USAGE 仍停在 0.1.0，未记录 `sendHandoff` / `handoffFile` / `handoffMaxBytes` 与「HANDOFF.md 作为首个会话消息」；下次发版时补齐。
- 只在 POSIX 绝对路径下工作；Windows 盘符路径不识别。

**通用**

- **平台覆盖**：目前主要在 macOS 验证。Windows/Linux 的路径、`zstd`、子进程与窗口拖拽行为未系统验证。
- **桌面版 vs Web 版**：正式版 App 的客户端组合（bundle 顺序、可用服务）与 `dsh web` 不完全相同，涉及新客户端服务的改动必须在正式版实测一次（0.3.5 的导航注入问题就是这么暴露的）。
- **批量耗时**：预览已批量，但归档写入仍逐会话串行；每页一次 LLM 提炼，大批量会慢。若要并行化，必须保持「单会话失败不影响其他」的语义。
- **子代理会话与归档边界**：子代理会话的打开/归档地址语义复杂（`SubagentAddress`），改动前先看 §9 的契约。
- **批量结果 UI**：结果面板可以关闭，但没有逐会话进度条；如要加，需要 Host 侧进度事件 + SSE 扩展。
- **测试环境**：组件测试依赖 jsdom + 现场 esbuild；真实 Python 集成测试需要 `python3`、`zstd` 与合成 wiki 环境，CI 上会跳过。

---

## 11. 接手第一周建议

**第一天**：按 §2 配好环境；`plugins/dsh-session-board` 跑 `npm run check` 全绿；在 Dev3 装当前版本并重启，验证看板、设置页、管理中心能打开。读 §3、§4、`docs/session-board-manager-agent-design.md`。

**第二天**：挑一个小的展示层改动（例如卡片文案/排序/筛选）走完 §5 闭环，重点体会 `lib/` 生成物、`locales` 同步、组件测试。

**第三天**：改一个 Host 侧小改动（例如路由校验提示、Wiki 设置校验），验证存储域与错误码路径；读 `host/routes.ts` + `host/wiki-config.ts`。

**第四天**：用合成的 Wiki 环境跑一次归档（`tests/wiki-integration.spec.ts`），理解 preview/commit、内置引擎桥、DSH 原生归档三段；再用 Dev3 的 CDP（§5.3）走一遍管理中心验收清单。

**第五天**：独立发布一次 patch 版本（§6），确认 tag/Release/SHA256SUMS/开发检出同步全部完成；若发布的是 session-board，确认 Latest Release 与 `package.json` 一致。

---

## 12. 快速命令卡

```sh
# 环境
export DSH_REPO=/absolute/path/to/deepseek-harness
export ZSTD_BIN=$(command -v zstd)

# 验证（session-board，32 文件 / 440 用例）
cd plugins/dsh-session-board && npm run check

# 构建 + 打包
npm run build
npm pack --ignore-scripts --pack-destination ~/Downloads
shasum -a 256 ~/Downloads/dsh-session-board-*.tgz

# 手写 JS 插件的检查
cd plugins/dsh-hide-empty-workspaces && node test/client.smoke.mjs && node test/host.smoke.mjs
cd plugins/dsh-workspace-autoregister && node --test test/autoregister.test.mjs

# 发布（先 rebase）
git fetch && git pull --rebase origin main
git tag dsh-session-board-vX.Y.Z && git push origin main dsh-session-board-vX.Y.Z
gh release create dsh-session-board-vX.Y.Z ... ~/Downloads/dsh-session-board-X.Y.Z.tgz

# Dev3 验证
osascript -e 'tell application "Harness Dev3" to quit'
open -a '/Applications/Harness Dev3.app'
curl -s http://127.0.0.1:9262/json/version      # 渲染进程 CDP 就绪
curl -s http://127.0.0.1:9270/json/list         # Host inspector（Node 目标）
tail -n 50 ~/.dsh-session-board/wiki.log        # Wiki 归档诊断

# 本地起一个隔离的 web 实例验证（目标版 DSH CLI）
DSH_HOME=/tmp/dsh-test-home node <dsh>/lib/bin.js plugin --profile web add file:<tgz 绝对路径>
DSH_HOME=/tmp/dsh-test-home node <dsh>/lib/bin.js web --port 5399 --no-open
```
