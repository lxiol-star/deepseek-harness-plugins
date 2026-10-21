# dsh-hide-empty-workspaces

Give the native DeepSeek Harness sidebar a small view switch — **进行中 / 已归档 / 工作空间** — with an archive list that restores Sessions in one click, and keep Workspaces that have no visible Sessions out of the active list.

> 独立社区插件，与 DeepSeek 官方没有隶属关系。

## 功能

- **侧栏视图切换**：原生侧栏会话区顶部多一条分段：`进行中`、`已归档`、`工作空间`，点一下直接切换，不用进设置。
- **进行中（active）**：原生会话列表去掉已归档会话；没有可见会话的工作区自动隐藏。可见会话 = 未归档、非空白、且**不是子代理会话**（子代理行只出现在父会话的目录里）。新建的空白会话默认有 **10 分钟宽限期**（可配，`0` 表示立即算空），刚建/自动注册的工作区不会立刻消失。
- **已归档（archived）**：原生浏览器本身不渲染归档行（它自己的归档筛选默认隐藏，插件也不去改那份持久化设置），所以这一档直接渲染归档列表，**按工作区分类**：每个工作区一个分组标题（带数量），**默认折叠**，点标题展开查看该工作区的归档会话；组内按更新时间倒序，工作区按最近归档时间倒序排列，不属于任何工作区的会话归入「未分组」。展开后可点会话行「取消归档并打开」（取消归档后直接进入会话），或点行尾「取消归档」只恢复到进行中列表。
- **工作空间（workspaces）**：列出**全部工作区**（包括平时被隐藏、没有可见会话的历史/空工作区），会话行收起；在行上 hover 出现原生的「+ 新会话」，直接在那个目录开新会话，历史工作区不用再翻会话列表去找。
- **只读判断**：按 Workspace Controller 与 Session 快照计算，不依赖 DOM 里渲染了几行——折叠的工作区不会因为“看不见会话行”被误判为空。
- 不删除工作区注册、不移动或归档会话、不改 profile；卸载后立即恢复原生侧栏。
- 跟随 React 重渲染：折叠分组、重命名、切会话、搜索后仍保持正确。
- 卸载时移除注入样式、分段控件、归档列表、隐藏标记和监听，无残留。

## 安装

在 DSH 插件管理器中填入下面的 GitHub 地址（需支持 `path:` 子目录的版本）：

```text
github:lxiol-star/deepseek-harness-plugins#dsh-hide-empty-workspaces-v0.3.5&path:/plugins/dsh-hide-empty-workspaces
```

或者使用 CLI：

```sh
dsh plugin --profile desktop add "github:lxiol-star/deepseek-harness-plugins#dsh-hide-empty-workspaces-v0.3.5&path:/plugins/dsh-hide-empty-workspaces"
```

Web profile 把 `desktop` 换成 `web`。安装后**完全退出并重新打开 DSH**（客户端 bundle 在启动时加载）；只升级客户端时刷新页面即可。

也可以从 [Releases](https://github.com/lxiol-star/deepseek-harness-plugins/releases) 下载 `dsh-hide-empty-workspaces-0.3.5.tgz`，在设置 → 插件 → 添加插件里选择本地包。

## 侧栏视图

| 视图 | 内容 | 用途 |
| --- | --- | --- |
| 进行中 | 原生会话列表（不含归档）；没有可见会话的工作区隐藏 | 日常看未归档会话 |
| 已归档 | 插件渲染的归档列表，按工作区分组、默认折叠；展开后点行取消归档并打开，或只取消归档 | 找回、查看并恢复归档会话 |
| 工作空间 | 全部工作区行（含空/历史工作区），会话行收起 | 挑工作区开新会话 |

视图选择持久化在 `localStorage['dsh.hideEmptyWorkspaces.mode']`（`active` / `archived` / `workspaces`）；首次安装默认「进行中」，可在设置页改默认视图。0.3.0 写入的 `running` / `done` 会自动折叠成 `active`。

## 设置页

**设置 → 插件 → 侧栏筛选** 有一个页签：

- **状态**：运行中 / 等待快照 / 异常，当前视图，以及进行中视图里隐藏了几个工作区。
- **版本对比**：客户端已加载、服务端已加载、磁盘已安装三个版本。
  - 客户端旧于磁盘 → 提示“刷新页面即可加载新客户端”。
  - 服务端旧于磁盘 → 提示“需要完全退出应用后重开”。
- **开关**：启用侧栏筛选；空白会话是否也算作有会话；空白会话宽限期（分钟）；默认视图（进行中 / 已归档 / 工作空间）。
- **操作**：「重新应用」立刻重算并重贴标记；「刷新页面」重新加载浏览器端。
- **诊断**：展开可看快照状态、视图、隐藏 ID 列表与最近错误。

## 开关

默认开启。想临时恢复原生侧栏（不隐藏、不筛视图）而不卸载：

```js
localStorage.setItem('dsh.hideEmptyWorkspaces', '0') // 关闭
localStorage.removeItem('dsh.hideEmptyWorkspaces')   // 恢复默认

// 空白会话也算作有会话（只在“进行中”视图生效）
localStorage.setItem('dsh.hideEmptyWorkspaces.includeBlank', '1')
localStorage.removeItem('dsh.hideEmptyWorkspaces.includeBlank')

// 新建空白会话的宽限期（分钟，默认 10；0 = 立即算空）
localStorage.setItem('dsh.hideEmptyWorkspaces.blankGraceMinutes', '10')

// 直接指定视图
localStorage.setItem('dsh.hideEmptyWorkspaces.mode', 'archived') // active / archived / workspaces
```

## 诊断

加载后可在控制台查看：

```js
window.__dshHideEmptyWorkspaces
// { version: '0.3.5', state: 'ready', mode: 'active', hidden: ['ws-...'], includeBlank: false, error: null }
```

`state: 'waiting'` 表示工作区快照还没就绪；`state: 'error'` 时 `error` 给出原因。`hidden` 是当前视图里被判空并隐藏的 Workspace ID 列表。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-hide-empty-workspaces
```

## 行为边界

- 分段控件注入在原生侧栏工作区浏览器的顶部；只在该区域是宽栏（非折叠 rail）时出现，折叠侧栏后自动收起。
- 「已归档」视图需要宿主的 `uiWorkspace` 客户端服务（原生侧栏自带）来执行「取消归档」；没有该服务时列表只读并给出提示。
- 侧栏搜索激活时按原生搜索结果展示，本插件的行过滤不介入；清空搜索后恢复。
- 判定标准默认是“**没有未归档、非空白、非子代理的会话**”。子代理会话在宿主侧栏里从不单独成行，因此始终不算可见会话，没有对应开关。
- 不处理“未分组”桶，也不影响搜索结果与平铺视图。
- 依赖公开客户端契约与少量结构标记：`workspaces` 服务（`list.getSnapshot()` / `list.subscribe()`、`phase`、`items[].sessionIds`、`archivedSessionIds`）、`sessions` 服务（`byId[*].title/updatedAt/blank/origin`）、`uiWorkspace` 服务（`unarchiveSession`）、侧栏行的 `data-row-key="workspace:<id>"` / `"session:<id>"`，以及 `sectionHeader` / `listArea` 两个 CSS Module 类名片段。若宿主大版本改结构，插件会退化为“不隐藏、无分段”，不会误删数据。
- 已验证：`node --check` + jsdom 冒烟（三视图、归档列表渲染与取消归档、默认视图、切换持久化、工作空间视图、空视图提示、rail 不注入、空/归档/空白/子代理判定、未知摘要、快照更新、重渲染、dispose、开关、诊断、页签与注入动作）+ host 路由冒烟（GET/405、版本对比）。

## 验证

```sh
cd plugins/dsh-hide-empty-workspaces
node --check lib/index.js
node --check lib/client.js
node test/client.smoke.mjs
node test/host.smoke.mjs
```

## 许可

MIT，见 [LICENSE](LICENSE)。
