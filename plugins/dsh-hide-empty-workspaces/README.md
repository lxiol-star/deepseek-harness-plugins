# dsh-hide-empty-workspaces

Hide DeepSeek Harness Workspaces that have **no sessions** from the native sidebar, without deleting their registration or files.

> 独立社区插件，与 DeepSeek 官方没有隶属关系。

## 功能

- 侧栏里**没有任何会话**的工作区自动隐藏，其余工作区照常显示。
- 只读判断：按 Workspace Controller 快照的 `sessionIds` 是否为空，不依赖 DOM 里渲染了几行——折叠的工作区不会因为“看不见会话行”被误判为空。
- 不删除工作区注册、不移动或归档会话、不改 profile；卸载后立即恢复原生列表。
- 跟随 React 重渲染：折叠分组、重命名、切会话后仍保持正确。
- 卸载时移除注入样式、隐藏标记和监听，无残留。

## 安装

在 DSH 插件管理器中填入下面的 GitHub 地址（需支持 `path:` 子目录的版本）：

```text
github:lxiol-star/deepseek-harness-plugins#dsh-hide-empty-workspaces-v0.1.0&path:/plugins/dsh-hide-empty-workspaces
```

或者使用 CLI：

```sh
dsh plugin --profile desktop add "github:lxiol-star/deepseek-harness-plugins#dsh-hide-empty-workspaces-v0.1.0&path:/plugins/dsh-hide-empty-workspaces"
```

Web profile 把 `desktop` 换成 `web`。安装后**完全退出并重新打开 DSH**（只刷新页面不够，客户端 bundle 在启动时加载）。

也可以从 [Releases](https://github.com/lxiol-star/deepseek-harness-plugins/releases) 下载 `dsh-hide-empty-workspaces-0.1.0.tgz`，在设置 → 插件 → 添加插件里选择本地包。

## 开关

默认开启。想临时显示空工作区而不卸载，在 DevTools 控制台执行后刷新：

```js
localStorage.setItem('dsh.hideEmptyWorkspaces', '0') // 关闭
localStorage.removeItem('dsh.hideEmptyWorkspaces')   // 恢复默认
```

## 卸载

```sh
dsh plugin --profile desktop remove dsh-hide-empty-workspaces
```

## 行为边界

- 判定标准是“**零会话**”。只有归档会话的工作区仍算有会话，会继续显示；如果希望归档后也隐藏，需要改判定规则。
- 不处理“未分组”桶，也不影响搜索结果与平铺视图。
- 依赖两个公开客户端契约：`workspaces` 服务（`list.getSnapshot()` / `list.subscribe()`、`phase`、`items[].sessionIds`）和侧栏行的 `data-row-key="workspace:<id>"`。若未来宿主重命名其中之一，插件会**失效为“全部显示”**，不会误隐藏其他行。
- 已验证：`node --check` 与 jsdom 冒烟测试（空/非空、快照更新、重渲染、dispose、pending 快照、开关）。**尚未在运行中的 GUI 里挂载验证。**

## 验证

```sh
cd plugins/dsh-hide-empty-workspaces
node --check lib/client.js
node test/client.smoke.mjs
```

## 许可

MIT，见 [LICENSE](LICENSE)。
