# dsh-hide-empty-workspaces

Hide DeepSeek Harness Workspaces that have **no sessions** from the native sidebar, without deleting their registration or files.

> 独立社区插件，与 DeepSeek 官方没有隶属关系。

## 功能

- 侧栏里**没有可见会话行**的工作区自动隐藏：只剩归档会话、只剩新建未聊过的空白会话、或只剩子代理（subagent）会话的工作区都会隐藏。子代理会话的行只出现在父会话的目录里，本来就不算工作区里的会话。
- 只读判断：按 Workspace Controller 快照的 `sessionIds` 是否为空，不依赖 DOM 里渲染了几行——折叠的工作区不会因为“看不见会话行”被误判为空。
- 不删除工作区注册、不移动或归档会话、不改 profile；卸载后立即恢复原生列表。
- 跟随 React 重渲染：折叠分组、重命名、切会话后仍保持正确。
- 卸载时移除注入样式、隐藏标记和监听，无残留。

## 安装

在 DSH 插件管理器中填入下面的 GitHub 地址（需支持 `path:` 子目录的版本）：

```text
github:lxiol-star/deepseek-harness-plugins#dsh-hide-empty-workspaces-v0.2.2&path:/plugins/dsh-hide-empty-workspaces
```

或者使用 CLI：

```sh
dsh plugin --profile desktop add "github:lxiol-star/deepseek-harness-plugins#dsh-hide-empty-workspaces-v0.2.2&path:/plugins/dsh-hide-empty-workspaces"
```

Web profile 把 `desktop` 换成 `web`。安装后**完全退出并重新打开 DSH**（只刷新页面不够，客户端 bundle 在启动时加载）。

也可以从 [Releases](https://github.com/lxiol-star/deepseek-harness-plugins/releases) 下载 `dsh-hide-empty-workspaces-0.2.2.tgz`，在设置 → 插件 → 添加插件里选择本地包。

## 设置页

安装 0.2.0 后，**设置 → 插件 → 隐藏空工作区** 有一个页签：

- **状态**：运行中 / 等待快照 / 异常，以及当前隐藏了几个工作区。
- **版本对比**：客户端已加载、服务端已加载、磁盘已安装三个版本。
  - 客户端旧于磁盘 → 提示“刷新页面即可加载新客户端”。
  - 服务端旧于磁盘 → 提示“需要完全退出应用后重开”。
- **开关**：启用过滤；归档会话是否也算作有会话；空白会话是否也算作有会话。
- **操作**：「重新应用」立刻重算并重贴标记；「刷新页面」重新加载浏览器端。
- **诊断**：展开可看快照状态、隐藏 ID 列表与最近错误。

> 「刷新页面」不能把**新安装的代码**加载进正在运行的服务端；它只重新加载浏览器端。服务端是否更新，看页签里的版本提示。

## 开关

默认开启。想临时显示空工作区而不卸载，在 DevTools 控制台执行后刷新：

```js
localStorage.setItem('dsh.hideEmptyWorkspaces', '0') // 关闭
localStorage.removeItem('dsh.hideEmptyWorkspaces')   // 恢复默认

// 把“归档会话”也算作有会话（只隐藏真正零会话的工作区）
localStorage.setItem('dsh.hideEmptyWorkspaces.includeArchived', '1')
localStorage.removeItem('dsh.hideEmptyWorkspaces.includeArchived')
```

## 诊断

加载后可在控制台查看：

```js
window.__dshHideEmptyWorkspaces
// { version: '0.2.2', state: 'ready', hidden: ['ws-...'], includeArchived: false, error: null }
```

`state: 'waiting'` 表示工作区快照还没就绪；`state: 'error'` 时 `error` 给出原因。`hidden` 是当前被判空并隐藏的 Workspace ID 列表。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-hide-empty-workspaces
```

## 行为边界

- 若把侧栏切换到“仅归档”视图，被隐藏的工作区不会出现；需要看它们时用上面的开关临时关闭过滤。

- 判定标准默认是“**没有未归档、非空白、非子代理的会话**”。想让归档会话算作有会话，设 `dsh.hideEmptyWorkspaces.includeArchived=1`；想让空白会话算作有会话，设 `dsh.hideEmptyWorkspaces.includeBlank=1`。子代理会话在宿主侧栏里从不单独成行，因此始终不算作可见会话，没有对应开关。
- 不处理“未分组”桶，也不影响搜索结果与平铺视图。
- 依赖两个公开客户端契约：`workspaces` 服务（`list.getSnapshot()` / `list.subscribe()`、`phase`、`items[].sessionIds`）和侧栏行的 `data-row-key="workspace:<id>"`。若未来宿主重命名其中之一，插件会**失效为“全部显示”**，不会误隐藏其他行。
- 已验证：`node --check` + jsdom 冒烟（空/非空、归档判定、空白会话判定、子代理会话判定、未知摘要保守显示、快照更新、重渲染、dispose、pending、开关、诊断、页签注册与注入动作）+ host 路由冒烟（GET/405、版本对比）。

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
