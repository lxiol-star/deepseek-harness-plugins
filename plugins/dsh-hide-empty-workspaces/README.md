# dsh-hide-empty-workspaces

Give the native DeepSeek Harness sidebar a small view switch — **进行中 / 已完成 / 工作空间** — and keep Workspaces that have no visible Sessions out of the session views.

> 独立社区插件，与 DeepSeek 官方没有隶属关系。

## 功能

- **侧栏视图切换**：原生侧栏会话区顶部多一条分段：`进行中`、`已完成`、`工作空间`，点一下直接切换，不用进设置。
- **工作空间视图**：列出**全部工作区**（包括平时被隐藏、没有可见会话的历史/空工作区），会话行收起；在行上 hover 出现原生的「+ 新会话」，直接在那个目录开新会话，历史工作区不用再翻会话列表去找。
- **进行中 / 已完成**：按会话状态过滤会话行；过滤后没有匹配会话的工作区行一并隐藏，并在列表区给出对应视图的空状态提示。
- **隐藏空工作区**（原有行为，保留在会话视图里）：没有可见会话的工作区自动隐藏。可见会话 = 原生侧栏会渲染成行的会话：未归档、非空白、且**不是子代理会话**（子代理行只出现在父会话的目录里）。
- **只读判断**：按 Workspace Controller 与 Session 快照计算，不依赖 DOM 里渲染了几行——折叠的工作区不会因为“看不见会话行”被误判为空。
- 不删除工作区注册、不移动或归档会话、不改 profile；卸载后立即恢复原生侧栏。
- 跟随 React 重渲染：折叠分组、重命名、切会话、搜索后仍保持正确。
- 卸载时移除注入样式、分段控件、隐藏标记和监听，无残留。

## 安装

在 DSH 插件管理器中填入下面的 GitHub 地址（需支持 `path:` 子目录的版本）：

```text
github:lxiol-star/deepseek-harness-plugins#dsh-hide-empty-workspaces-v0.3.0&path:/plugins/dsh-hide-empty-workspaces
```

或者使用 CLI：

```sh
dsh plugin --profile desktop add "github:lxiol-star/deepseek-harness-plugins#dsh-hide-empty-workspaces-v0.3.0&path:/plugins/dsh-hide-empty-workspaces"
```

Web profile 把 `desktop` 换成 `web`。安装后**完全退出并重新打开 DSH**（客户端 bundle 在启动时加载）；只升级客户端时刷新页面即可。

也可以从 [Releases](https://github.com/lxiol-star/deepseek-harness-plugins/releases) 下载 `dsh-hide-empty-workspaces-0.3.0.tgz`，在设置 → 插件 → 添加插件里选择本地包。

## 侧栏视图

| 视图 | 会话行 | 工作区行 | 用途 |
| --- | --- | --- | --- |
| 进行中 | 只显示 `running` 的会话 | 有进行中会话才显示 | 看正在跑的对话 |
| 已完成 | 显示已完成会话（默认排除归档/空白） | 有已完成会话才显示 | 日常翻历史 |
| 工作空间 | 全部收起 | **全部显示**（含空/历史工作区） | 挑工作区开新会话 |

视图选择持久化在 `localStorage['dsh.hideEmptyWorkspaces.mode']`；首次安装默认「进行中」，可在设置页改默认视图。

## 设置页

**设置 → 插件 → 侧栏筛选** 有一个页签：

- **状态**：运行中 / 等待快照 / 异常，当前视图，以及当前隐藏了几个工作区。
- **版本对比**：客户端已加载、服务端已加载、磁盘已安装三个版本。
  - 客户端旧于磁盘 → 提示“刷新页面即可加载新客户端”。
  - 服务端旧于磁盘 → 提示“需要完全退出应用后重开”。
- **开关**：启用侧栏筛选；归档会话是否也算作有会话；空白会话是否也算作有会话；默认视图（进行中 / 已完成 / 工作空间）。
- **操作**：「重新应用」立刻重算并重贴标记；「刷新页面」重新加载浏览器端。
- **诊断**：展开可看快照状态、视图、隐藏 ID 列表与最近错误。

## 开关

默认开启。想临时恢复原生侧栏（不隐藏、不筛视图）而不卸载：

```js
localStorage.setItem('dsh.hideEmptyWorkspaces', '0') // 关闭
localStorage.removeItem('dsh.hideEmptyWorkspaces')   // 恢复默认

// 把“归档会话”也算作有会话（只在会话视图里生效）
localStorage.setItem('dsh.hideEmptyWorkspaces.includeArchived', '1')
localStorage.removeItem('dsh.hideEmptyWorkspaces.includeArchived')

// 直接指定视图
localStorage.setItem('dsh.hideEmptyWorkspaces.mode', 'workspaces') // running / done / workspaces
```

## 诊断

加载后可在控制台查看：

```js
window.__dshHideEmptyWorkspaces
// { version: '0.3.0', state: 'ready', mode: 'running', hidden: ['ws-...'], includeArchived: false, error: null }
```

`state: 'waiting'` 表示工作区快照还没就绪；`state: 'error'` 时 `error` 给出原因。`hidden` 是当前视图中被判空并隐藏的 Workspace ID 列表。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-hide-empty-workspaces
```

## 行为边界

- 分段控件注入在原生侧栏工作区浏览器的顶部；只在该区域是宽栏（非折叠 rail）时出现，折叠侧栏后自动收起。
- 侧栏搜索激活时按原生搜索结果展示，本插件的行过滤不介入；清空搜索后恢复。
- 判定标准默认是“**没有未归档、非空白、非子代理的会话**”。子代理会话在宿主侧栏里从不单独成行，因此始终不算可见会话，没有对应开关。
- 不处理“未分组”桶，也不影响搜索结果与平铺视图。
- 依赖公开客户端契约与少量结构标记：`workspaces` 服务（`list.getSnapshot()` / `list.subscribe()`、`phase`、`items[].sessionIds`）、`sessions` 服务（`byId[*].running/blank/origin`）、侧栏行的 `data-row-key="workspace:<id>"` / `"session:<id>"`，以及 `sectionLabel` / `listArea` 两个 CSS Module 类名片段。若宿主大版本改结构，插件会退化为“不隐藏、无分段”，不会误删数据。
- 已验证：`node --check` + jsdom 冒烟（三视图过滤、默认视图、视图切换持久化、工作空间视图、空视图提示、rail 不注入、空/非空、归档判定、空白会话判定、子代理会话判定、未知摘要保守显示、快照更新、重渲染、dispose、pending、开关、诊断、页签注册与注入动作）+ host 路由冒烟（GET/405、版本对比）。

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
