# DSH 插件开发交接文档

> 面向接手本仓库插件开发的同学（或 AI Agent）。读完应当能独立完成一次「改代码 → 验证 → 打包 → 发布 → 让用户升级」的闭环。
>
> 适用范围：`dsh-session-board`（本仓库主力插件），以及 `dsh-hide-empty-workspaces`、`dsh-workspace-autoregister`、`dsh-think-bounce-pet`。
>
> 最后更新：2026-10-20（`dsh-session-board` 0.3.6、`dsh-workspace-autoregister` 0.1.0）。

---

## 1. 项目是什么

本仓库是 **DeepSeek Harness（DSH）的社区插件集合**，公开在 `github.com/lxiol-star/deepseek-harness-plugins`，Apache-2.0。与 DeepSeek 官方无隶属关系。

| 插件 | 形态 | 维护要点 |
| --- | --- | --- |
| `dsh-session-board` | Host + Client（React） | 主力插件，功能多、测试最多；本文件大部分内容围绕它 |
| `dsh-hide-empty-workspaces` | 仅 Client | 按 Workspace 快照隐藏空工作区，纯展示 |
| `dsh-workspace-autoregister` | 仅 Host | 监听成功工具调用的参数，把新出现的工作区目录登记进工作区列表，并给新工作区建首个空白会话 |
| `dsh-think-bounce-pet` | 上游构建产物 | 收录社区插件（MIT），仓库里没有上游 `src/`，只在需要时打补丁/加回归测试 |

插件目录规范：`plugins/<npm 包名>/`，各自声明 `version`、入口、依赖、README、CHANGELOG。发布物是各插件独立的 `.tgz`，**版本号和 tag 按插件独立**（`dsh-session-board-v0.3.6` 这种格式）。

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
- Python 3（Wiki 集成测试与真实提炼用）。
- `zstd`（Wiki 原始归档压缩，`ZSTD_BIN=/opt/homebrew/bin/zstd` 或 PATH 内可用）。

### 2.2 本机的多个 DSH 环境

| 环境 | DSH_HOME | 用途 |
| --- | --- | --- |
| 正式版 App | `~/.dsh` | 用户日常使用；插件实际安装位置 `~/.dsh/profiles/desktop/node_modules/<包名>` |
| 开发/测试版 Dev2 | `~/.dsh-dev2`（或自建临时 home） | 验证新功能，避免污染正式数据 |
| 开发/测试版 Dev3 | `~/.dsh-dev3` | latest-code worktree 构建（`.worktrees/dev3-latest`），由 `.worktrees/install-dev3.sh` 安装；带 CDP：渲染进程 `127.0.0.1:9262`、Host 进程 `127.0.0.1:9270`，见 §5.3 |

**安装/升级后必须完全退出 DSH 再重开**：Host 与 Client 两半是分别加载的，只刷新页面不会加载新的 Host 代码。

### 2.3 用户环境事实（不要假设）

- 正式版 App 从 Finder 启动时，进程里**没有 `DSH_HOME` 环境变量**。插件里解析 DSH home 必须按「显式配置 → `$DSH_HOME` → `~/.dsh`」的顺序（已有 `resolveDshHome()`，别改回只读环境变量）。
- 正式版 App 的 DSH 版本可能是 `0.2.1-rc.2`，与源码 trunk (`0.2.1-alpha.1`) 存在差异。客户端插件 API 以**目标 App 的实际包**为准，必要时解包 `DeepSeek Harness.app/Contents/Resources/app.asar` 查证（见 §8.3）。
- 用户界面语言：中文；插件文案必须中英同步（`tests/locales.spec.ts` 会强制检查键集合、占位符、空串）。

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
├── tests/
└── lib/                  # 构建产物（提交进仓库，发布包只带它）
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

### 3.2 两个半边的职责边界

| | Host 半（`src/index.ts` / `src/host/*`） | Client 半（`src/client/index.tsx` / `src/client/*`） |
| --- | --- | --- |
| 运行环境 | DSH 主进程（Node） | 浏览器（Web / Electron renderer） |
| 能做什么 | 持久化存储域、注册 `/api` 路由与 SSE、读进程/文件、调子进程、调 `llm` 服务 | 读客户端服务（sessions/workspaces/uiWorkspace…）、注册 slot、渲染 React、fetch 插件自己的 `/api` 路由 |
| 不能做什么 | 直接操作 DOM/React | 读文件、调子进程、直接拿模型服务（只能经 Host 路由） |

判断一段逻辑放哪边：**需要跨进程/跨设备/持久化/子进程 → Host；纯展示与交互 → Client。** 共享的纯函数（分类、排序、指标、解析）放 `src/shared/`，两端都能 import，且不依赖任何 DSH 包。

### 3.3 Cordis 上下文、`inject` 与生命周期（最容易踩坑的部分）

插件导出的形状：

```ts
export const name = 'dsh-session-board'
export const inject = ['storageDomain', 'connection', 'webServer', 'llm'] // Host
export function apply(ctx: Context): void | (() => void) { ... }
```

- `inject` 里声明的服务**全部可用**后，Cordis 才调用 `apply`；任一服务消失，插件会被卸载。
- `ctx.effect(fn, label)` / `ctx.on(...)` 的清理随插件卸载自动执行。
- 客户端同样有 `export const inject`（本插件是 `['slots', 'locale']`）。注册 slot、设置页、渲染入口都在 `apply` 里完成。

**规则 1：需要某个服务，就把它加进 `inject`（或嵌套 `ctx.inject([...], cb)`），不要用 `ctx.get('服务名')` 抢读。**

`ctx.get` 只在「读取那一刻该服务的提供者已经 active」时有效。插件装配顺序取决于 bundle 顺序；如果插件先装配，`get` 拿到 `undefined` 并把它缓存进闭包，**该功能此后永久失效且没有任何报错**。0.3.5 修复的「点卡片不跳转会话」就是这个原因（`uiWorkspace` 被 `ctx.get` 抢读成 `undefined`）。

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

- Host 常用：`storageDomain`、`connection`（`connection.fetch` 注册已认证路由、`requestRejection` 做 Host/Origin + 浏览器会话校验）、`webServer`（裸路由，可挂 SSE，但**不会**自动做鉴权，必须自己调 `requestRejection`）、`llm`、`session/event` 事件。
- Client 常用：`slots`、`locale`、`sessions`、`uiSession`、`uiWorkspace`、`workspaces`、`jobs`、`remote.*`（typert 生成的远程命名空间）。

### 3.4 运行时依赖限制（硬性）

插件运行时**不能 import `@deepseek-ai/*`**（profile 里没有这些包，Node 解析会失败，插件直接加载不了）。做法：

- Host：需要 DSH 服务时，用**结构化 interface** 自己描述要用的成员，通过 `ctx.get()` / `inject` 拿实例（见 `src/host/model-service.ts`、`src/client/dsh.ts`）；DSH 类型只在 `import type {} from '@deepseek-ai/...'` 里补 ambient 声明，编译后擦除。
- Client：`lib/client.js` 只允许引用**平台冻结模块表**：`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`。其余依赖必须打进 bundle 或声明 `dsh.client.external`（本插件不需要）。

### 3.5 Client 半的两种挂载方式（session-board 都用了）

1. **Slot 贡献**（官方推荐）：`ctx.slots.register({...}, Component)`，由 `inject` 注入 props。本插件用了 `shell.overlay`（全屏看板）和 `settings.section`（设置页 → 会话看板）。
2. **DOM 停靠列**：侧栏右侧的看板列**不是 slot**——shell 的网格列位已经被占满。`src/client/dock-adapter.ts` 按 DOM 契约把根节点插进页面并跟随主题/断点/宽度变化；契约不识别时安静地不挂载，其它功能不受影响。改布局要同时看 `dock-adapter.ts`、`dock-layout.ts`、`css.ts`。

### 3.6 Host ↔ Client 通信

- 已认证 JSON 路由：`connection.fetch` 注册（自动做 Host/Origin + 浏览器登录校验），本插件有：
  - `GET  /api/session-board/board`（快照）
  - `POST /api/session-board/ack`（标已读）
  - `POST /api/session-board/wiki-archive`（预览/提交归档）
  - `POST /api/session-board/synthesis-model`（读/写提炼模型偏好；`action` = `read | write | catalog | capabilities`）
- 单向推送：`GET /dsh-session-board/stream`，SSE，每次变化推整份 `BoardFeed`。这是裸 `webServer` 路由，**handler 里第一件事必须是 `requestRejection(req)`**，否则任何能访问端口的进程都能读会话元数据。
- 客户端 `fetch` 用同源相对路径（`src/client/feed.ts`、`src/client/synthesis-settings.ts`）。

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

**Host（`src/index.ts` → `src/host/plugin.ts`）**

| 文件 | 职责 |
| --- | --- |
| `host/plugin.ts` | Host 入口：注入 `storageDomain/connection/webServer/llm`，打开 3 个存储域，装配 ledger + 路由 + 归档器 |
| `host/domain.ts` | 3 个存储域定义（见 §4.2）、记录校验（normalize-not-throw） |
| `host/ledger.ts` | 持久状态：ack 游标、turn 起止事件（`session/event`）、busy 统计；变更时 `broadcast()` |
| `host/routes.ts` | 4 条 `/api` JSON 路由 + 1 条 SSE 裸路由；偏好读写的校验与错误码 |
| `host/model-service.ts` | `llm` 服务的结构化视图：`listSynthesisCatalog`、`isKnownSynthesisModel`（返回 `ok/UNKNOWN_MODEL/UNKNOWN_EFFORT`）、`runSynthesisModel`（透传 `reasoningEffort`） |
| `host/wiki-archive.ts` | Wiki 归档器：preview/commit、超时与 TTL、错误分类、调用 `wiki-workflow.py` 桥、插件侧模型调用 |
| `host/wiki-workflow.py` | Python 桥：`scope/synthesize/prompt/write/index`，复用用户 `~/wiki/scripts/` 里 `wiki-archive.py`、`wiki-synthesize.py`、`wiki-index.py` 的解析/校验/状态逻辑 |

**Client（`src/client/index.tsx`）**

| 文件 | 职责 |
| --- | --- |
| `client/index.tsx` | 入口：注册字典/样式、设置页 slot、`shell.overlay` slot、dock DOM 挂载；装配 `BoardFeedClient` + `BoardModel` + `BatchController` |
| `client/feed.ts` | SSE 客户端（断线重连、可见性恢复、`revision` 栅栏）、归档预览/提交请求 |
| `client/source.ts` | 从 DSH 服务 + feed 组装 `BoardSessionInput[]` |
| `client/model.ts` | `BoardModel`：订阅 sessions/statuses/jobs/workspaces/feed，派生卡片与分组，管 ticker 与 job watcher |
| `client/batch.ts` | 批量选择/预览/确认/结果状态机（`BatchController`） |
| `client/native-archive.ts` | 提炼成功后调用 DSH 原生归档（`uiWorkspace.archiveSession`），带竞态保护 |
| `client/SessionCard.tsx` | 单卡渲染；点击打开会话；展开详情；标已读；勾选 |
| `client/BoardList.tsx` / `BoardDock.tsx` / `BoardOverlay.tsx` | 列表 / 停靠列 / 全屏看板 |
| `client/BatchToolbar.tsx` | 批量工具栏、确认框、结果面板（含「关闭结果」） |
| `client/BoardFilterBar.tsx` / `filters.ts` / `workspace-tree.ts` | 搜索、状态/工作区筛选、按状态/工作区/树分组 |
| `client/archive-marks.ts` | 客户端侧归档标记（与 DSH 归档状态合并） |
| `client/synthesis-settings.ts` | 设置页控制器：读偏好、取模型目录（走 Host 路由 `action:'catalog'`）、保存 |
| `client/SettingsPage.tsx` | 设置页 UI：提炼模型 + 思考等级 |
| `client/dsh.ts` | 客户端 DSH 服务的结构化 interface（唯一允许描述 DSH 服务形状的地方之一） |
| `client/locales.ts` | 中英字典（`NS = 'session-board'`） |
| `client/css.ts` | 全部样式（`sb-*` 类名） |
| `client/hooks.ts` / `store.ts` / `lifecycle.ts` | `useSnapshot`、可持久化 store、清理栈 |

**Tests**

- 24 个 spec 文件、326 个用例（0.3.6）：纯函数单测、Host 路由/归档器、React 组件 jsdom 测试（用 esbuild 现场打包真实组件）、真实 Python 的 Wiki 集成测试（缺 python/zstd 时跳过）。
- `tests/component-entry.tsx`：组件测试入口，用 esbuild 把真实 TSX 打成 CJS 再挂载；**不要**为测试另写一套 mock 组件。
- `tests/wiki-test-environment.ts`：真实 `wiki-archive.py` 的合成环境（临时 wiki 根、合成 DSH 会话）。

### 4.2 存储域（Host）

| 域 | version | 表 | key / 值 |
| --- | --- | --- | --- |
| `dsh_session_board` | 1 | `acks` | session id → `{ lastTurnEnd, lastTurnEndKind, lastTurnEndError, ackedAt }` |
| `dsh_session_board_turns` | 1 | `turn_stats` | session id → busy 统计 |
| `dsh_session_board_prefs` | 1 | `prefs` | `synthesis` → `{ model, provider, reasoningEffort }`（后加字段，旧记录解析为 null） |

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
```

### 4.4 设置页

- 位置：设置 →「会话看板」→「归档提炼」。
- 内容：提炼模型（选项来自 Host `action:'catalog'`，即 `llm.listProviders()` + `llm.listModels()` + `resolveModelInfo()`）、思考等级（模型披露的 `reasoning.efforts`，保存为 `reasoningEffort`）。
- 保存：`POST /api/session-board/synthesis-model` `{action:'write', model, provider, reasoningEffort}`；写入前校验，错误码 `UNKNOWN_MODEL` / `UNKNOWN_EFFORT` / `STORE_UNAVAILABLE`。
- 未选模型时回退到用户 Wiki 配置的 provider（默认 `stepx-terra`，可用 `~/.dsh-session-board.json` 的 `synthesisProvider` 覆盖，**不要**把账号相关 provider 写死进发布包）。

### 4.5 错误码表

| 码 | 含义 / 处理 |
| --- | --- |
| `INVALID_SELECTION` | 选择不是 1–50 个合法精确会话 ID；客户端先校验 |
| `BUSY` | 同一时间只允许一个归档请求；等前一个完成 |
| `PREVIEW_EXPIRED` | 预览 token 过期（5 分钟）或已用过；重新预览 |
| `SELECTION_MISMATCH` | 预览后会话集合/原文路径发生变化；重新预览 |
| `STATE_UNAVAILABLE` | Wiki 状态文件损坏或版本不支持（python exit 5） |
| `ARCHIVE_UNAVAILABLE` | 本地 Wiki 归档脚本不可用/超时（找不到脚本、python 缺失、SCHEMA 不可用等） |
| `SCHEMA_UNAVAILABLE` | `~/wiki/SCHEMA.md` 缺失或为空 |
| `SCOPE_FAILED` / `SYNTHESIS_FAILED` / `INDEX_FAILED` | 桥接脚本对应阶段失败；优先解析脚本 stdout 的 JSON `error` |
| `CATALOG_UNAVAILABLE` | Host 列表模型失败（看宿主日志 `model catalog read failed:`） |
| `HOST_OUTDATED` | 正在运行的 Host 比 Client bundle 旧（通常是升级后没重启），提示用户完全退出重开 |
| `UNKNOWN_MODEL` / `UNKNOWN_EFFORT` | 模型路由或思考档位已不存在，重新选择 |

---

## 5. 开发闭环（每次改动都走这一遍）

```sh
cd plugins/dsh-session-board
export DSH_REPO=/absolute/path/to/deepseek-harness
export ZSTD_BIN=/opt/homebrew/bin/zstd   # 或 PATH 里有 zstd
npm run check        # 严格 tsc + vitest（24 文件 / 326 用例）
npm run build        # 重新生成 lib/（index.js、client.js、types/、wiki-workflow.py）
npm pack --ignore-scripts --pack-destination ~/Downloads
```

要点：

- `lib/` 提交进仓库；**不要手改 `lib/`**，它由 `scripts/build.mjs` 生成。改了 `src/` 必须 `npm run build`。
- `check` 需要 DSH 检出提供 tsc/vitest/esbuild，且会做严格类型检查；先过 check 再 build。
- 前端改动改 `src/client/*` + `css.ts` + `locales.ts`；Host 改动改 `src/host/*`；两端共用逻辑放 `src/shared/`。
- 新增文案：中英两份都要加（`locales.spec.ts` 会验证键集合、占位符、非空）。
- 组件行为要有 jsdom 测试（`tests/components.spec.ts`）；纯逻辑要有单测。测试数据一律合成，不引用真实会话/截图/密钥。

### 5.1 安装验证（用户视角）

1. 设置 → 插件 → 添加插件 → 选 `.tgz`（或 `dsh plugin install <绝对路径>`）。
2. **完全退出 DSH，再重新打开**。
3. 打开看板，验证本次改动点。
4. 出问题看两处：宿主进程日志（`ctx.logger.warn` 输出，含 `dsh-session-board:` 前缀）和浏览器控制台（客户端 `console.warn`）。

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

### 5.3 在运行中的 dev 实例上验证 Host 插件（不消耗模型额度）

Dev3 这类 dev 构建带 CDP：渲染进程 `--remote-debugging-port=9262`、Host 进程 `--inspect=127.0.0.1:9270`。
可以像操作真实用户界面一样验证插件，而且**纯 Host 插件不需要模型调用**：

1. **看渲染结果**：`curl http://127.0.0.1:9262/json/list` 拿页面的 `webSocketDebuggerUrl`，用 CDP `Runtime.evaluate` 读 DOM/插件卡片状态、`Page.captureScreenshot` 截图。验证后把 GUI 恢复到原页面。
2. **拿活的 Cordis Loader（Host 进程）**：连 `127.0.0.1:9270`，在 `Runtime.evaluate` 里执行：
   ```js
   const { createRequire } = process.getBuiltinModule('module')
   const require2 = createRequire('/tmp/anchor.cjs')
   const { Loader } = require2('<目标构建>/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js')
   globalThis.__Loader = Loader
   ```
   再用 CDP 取 `__Loader.prototype` → `Runtime.queryObjects` 得到活的 loader 实例（`require(esm)` 与宿主共用 ESM 缓存，类身份一致）。
   `loader.root.ctx` 是根上下文，`loader.store` 里能拿到各 entry 的 `ctx`；也可以用 `Entry` 类 queryObjects 后按 `options.name` 找到某个插件行。
3. **断言与触发**：
   - 断言：`ctx.get('<service>')`、服务快照、注册表状态（只读，不要长期持有引用）。
   - 触发：`ctx.emit('<event>', payload)` 直接驱动插件监听器，适合验证「事件 → 副作用」这条链路，不必让 agent 真的跑一轮模型。
4. **清理**：用同一 Host API 删掉测试注册、归档临时会话、删测试目录；不要留下测试数据。dev 实例的本地存储与正式版隔离，但同样需要清理。

限制：只有 dev 构建有 CDP，正式版 App 没有；这验证的是 Host 行为，用户可见的渲染仍要截图或肉眼核对。

---

## 6. 发布流程（逐条照做）

版本号规则：**每发布一次必须递增，已发布的 tag/安装包永不覆盖**。功能 → minor/patch 按语义递增即可（本插件一直在 patch 位递增）；只有文档变更可以不发版。

1. 更新 `package.json` 的 `version`。
2. 更新 `CHANGELOG.md`：`## x.y.z — YYYY-MM-DD` + 条目（中文，说明用户可感知的变化与原因）。
3. 同步 UI 里的版本标记：`src/client/BoardDock.tsx`、`src/client/BoardOverlay.tsx` 的 `data-session-board-version`。
4. `npm run check`，`npm run build`。
5. `npm pack --ignore-scripts --pack-destination ~/Downloads`，确认生成的 tgz 包含：`lib/`、`cordis.patch.yml`、`README.md`、`LICENSE`、`CHANGELOG.md`，且**不含** `src/`、测试、密钥、个人路径。
6. 生成校验和：`shasum -a 256 dsh-session-board-x.y.z.tgz | tee SHA256SUMS-x.y.z`。
7. 提交 + 打 tag + 推送（先 `git fetch && git pull --rebase origin main`，远端可能被其他自动化抢先推送；冲突时先 rebase 再推）：
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
9. `lib/` 是生成物，改了源码必须重建；不要手改。
10. 中英文案同步；面向用户的报错要给稳定错误码 + 可操作提示，不吞异常。
11. 发布前必须跑 `npm run check` 且全绿（当前基线 24 文件 / 326 用例）。
12. 改动涉及用户数据（归档、标记、偏好）时，先备份、可回退；不要替用户删数据。

---

## 8. 排障手册

### 8.1 常见症状

| 症状 | 先查什么 | 典型原因 / 处理 |
| --- | --- | --- |
| 设置页「无法读取模型列表」 | 宿主日志 `model catalog read failed:` | Host `llm` 服务列表失败；不要回退到客户端 `remote.session`（在部分宿主构建里取不到），目录必须由 Host 路由提供 |
| 点卡片不跳转 | 浏览器控制台 `navigation-unavailable` / `open-session-failed` | 服务未注入/装配时机问题（§3.3）；已归档会话需先 unarchive；子代理会话要用 `{parentSessionId, childSessionId, mode:'continuable'}` |
| 正式版归档报「本地归档脚本不可用或超时」 | `resolveDshHome` 的结果 | Finder 启动无 `DSH_HOME`：必须显式配置 → `$DSH_HOME` → `~/.dsh` 兜底 |
| 「Wiki 工作流不可用，请检查本地脚本和 SCHEMA.md」 | `~/wiki/scripts/`、`~/wiki/SCHEMA.md` | 用户本地 Wiki 不完整；看宿主日志里的具体分类（`SCHEMA_UNAVAILABLE` / `SCOPE_FAILED` …） |
| 预览/归档长时间「处理中」 | 选择数量、Host 日志 | 预览已改为整批一次扫描；归档写入仍是逐会话 + 每页一次 LLM 提炼，批量大时慢属正常。期间可正常点卡片切会话（0.3.6 起） |
| 看板显示「待处理」但客户端里已归档 | `workspaces` 服务是否注入 | 未注入时拿不到 `archivedSessionIds`，卡片不知道已归档 |
| 升级后功能没变化 | 是否完全退出重开 | Host 与 Client 分别加载，刷新页面不够 |
| `HOST_OUTDATED` | Client bundle 比运行中 Host 新 | 重启；或确认安装的是同一个包 |

### 8.2 日志位置

- Host：DSH 进程 stdout/stderr（桌面版由 App 捕获）；代码里 `ctx.logger?.warn?.(...)`，统一加 `dsh-session-board:` 前缀便于 grep。
- Client：浏览器/Electron DevTools console；`console.warn` 也统一前缀。
- 归档失败时会保留用户选择并回显错误码；先在 UI 看码，再按 §8.3 查佐证。

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
| 会话导航 `openSession/unarchiveSession` | `packages/client/ui-workspace/src/client/navigation.ts` |
| `SessionTarget` / `subagentAddress` | `packages/api/session-controller/src/client/contract/sessions.ts` |
| Host 模型目录（`modelCatalog`） | `packages/api/session-controller/src/{index,catalog,types}.ts` |
| `llm` 服务：`listProviders/listModels/resolveModelInfo/stream` | `packages/llm/llm/src/{index,types}.ts` |
| 存储域 API | `packages/storage/storage-domain/src/index.ts` + `spec.ts` |
| `/api` 通道的信任栅栏 | `packages/client/connection/src/rpc.ts`（`requestRejection`） |
| 客户端插件可用的 `ctx.remote.*` 生成 | `packages/typert/*`、各 `@deepseek-ai/dsh-api-*/lib/typert.remote-client.js` |

> 这些路径在 `0.2.1-rc.2` / `0.2.1-alpha.1` 上核对过；升级目标 DSH 版本后要重新核对一次。

---

## 10. 已知风险与待办

- **平台覆盖**：目前主要在 macOS 验证。Windows/Linux 的路径、`zstd`、子进程与窗口拖拽行为未系统验证。
- **桌面版 vs Web 版**：正式版 App 的客户端组合（bundle 顺序、可用服务）与 `dsh web` 不完全相同，涉及新客户端服务的改动必须在正式版实测一次（0.3.5 的导航注入问题就是这么暴露的）。
- **批量耗时**：预览已批量，但归档写入仍逐会话串行；每页一次 LLM 提炼，大批量会慢。若要并行化，必须保持「单会话失败不影响其他」的语义。
- **Wiki 外部依赖**：依赖用户自己的 `~/wiki/scripts/*.py`、`SCHEMA.md`、provider 配置与密钥；这些不在插件包里，也不该写死。
- **子代理会话与归档边界**：子代理会话的打开/归档地址语义复杂（`SubagentAddress`），改动前先看 §9 的契约。
- **批量结果 UI**：结果面板可以关闭（0.3.4），但批量过程没有逐会话进度条；如要加，需要 Host 侧进度事件 + SSE 扩展。
- **测试环境**：组件测试依赖 jsdom + 现场 esbuild；真实 Python 集成测试需要 `python3`、`zstd` 与可用 Wiki 脚本，CI 上会跳过。

---

## 11. 接手第一周建议

**第一天**：按 §2 配好环境；`npm run check` 全绿；装一次当前版本到 `~/.dsh-dev2` 并重启验证看板能用。读 §3、§4。

**第二天**：挑一个小的展示层改动（例如卡片文案/排序）走完 §5 闭环，重点体会 `lib/` 生成物、`locales` 同步、组件测试。

**第三天**：改一个 Host 侧小改动（例如路由校验提示），验证存储域与错误码路径；读 `host/routes.ts` + `host/wiki-archive.ts`。

**第四天**：复现一次归档归档（用合成的测试 Wiki 环境，`tests/wiki-integration.spec.ts`），理解 preview/commit、python 桥、DSH 原生归档三段。

**第五天**：独立发布一次 patch 版本（§6），确认 tag/Release/SHA256SUMS/开发检出同步全部完成。

---

## 12. 快速命令卡

```sh
# 环境
export DSH_REPO=/absolute/path/to/deepseek-harness
export ZSTD_BIN=$(command -v zstd)

# 验证
cd plugins/dsh-session-board && npm run check

# 构建 + 打包
npm run build
npm pack --ignore-scripts --pack-destination ~/Downloads
shasum -a 256 ~/Downloads/dsh-session-board-*.tgz

# 发布（先 rebase）
git fetch && git pull --rebase origin main
git tag dsh-session-board-vX.Y.Z && git push origin main dsh-session-board-vX.Y.Z
gh release create dsh-session-board-vX.Y.Z ... ~/Downloads/dsh-session-board-X.Y.Z.tgz

# 本地起一个隔离的 web 实例验证（目标版 DSH CLI）
DSH_HOME=/tmp/dsh-test-home node <dsh>/lib/bin.js plugin --profile web add file:<tgz 绝对路径>
DSH_HOME=/tmp/dsh-test-home node <dsh>/lib/bin.js web --port 5399 --no-open
```
