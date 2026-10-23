# Changelog

## 0.3.8

- 设置页「刷新页面」改为**「重新加载客户端插件」**：通过 `/plugins/events` 读取 Host 最新的 client-module graph，再用 `modules.entries.sync()` 原地 reconcile 客户端插件；**不刷新页面、不重启应用、不中断会话**。插件更新后不必再 Cmd+Q。
- 桌面端不再调用 `location.reload()`（旧行为会拿到缓存的 boot 清单，插件文件更新后刷新直接触发 Web Boot 失败并弹“应用无法启动或已意外停止”）；失败时显示原因，并提示必要时完全退出重开。网页端在 soft reload 不可用时仍可回退到页面刷新。
- 版本对比提示改为“点重新加载客户端插件即可原地加载，不丢会话”；README/测试同步。

## 0.3.7

- 设置页“刷新页面”在桌面端（`dsh-app://`）改为**重启提示**：插件文件更新后刷新页面会拿到过期的 client-module 清单，导致 Web Boot 失败并弹“应用无法启动或已意外停止”；桌面端现在显示“完全退出并重开 DSH（⌘Q）”，不再触发 reload。网页端保留刷新按钮。
- “客户端 bundle 已过期”提示同步区分桌面端/网页端。

## 0.3.6

- The archive lists every archived Session; the 200-row cap and its "only the latest 200" hint are gone. Row count is now whatever the Workspace registry archives.

## 0.3.5

- Archive groups start collapsed and expand on a click on the Workspace header (chevron + count; the expanded set survives panel rebuilds).
- A Session row in an expanded group is clickable: it unarchives the Session and opens it, so archived content is one click away. The row's 取消归档 button still restores a Session without opening it.
- Rows stay inert (and unarchive stays disabled) when the host exposes no Workspace service.
- Carries 0.3.4's blank-session grace period: a freshly created blank Session keeps its Workspace visible for 10 minutes (configurable, `0` restores immediate hiding), and a blank Session without a usable `updatedAt` stays visible.

## 0.3.4

- Blank Sessions keep their Workspace visible for a grace period (default 10 minutes), so a freshly scaffolded or auto-registered Workspace is usable before anyone types.
- Add the `dsh.hideEmptyWorkspaces.blankGraceMinutes` setting and a Settings number input; `0` restores the immediate-hide rule.
- A blank Session without a usable `updatedAt` stays visible instead of being hidden on missing data.

## 0.3.3

- The archived view groups archived Sessions by Workspace: one group header per Workspace (with its archived count), Sessions inside a group newest first, Workspaces lead by their most recently archived Session, and archived Sessions outside every Workspace fall under 未分组.
- The per-row Workspace suffix moved into the group header, so rows carry title and time.

## 0.3.2

- The archive panel is rebuilt only when the archived set, titles or Workspace names change. Rebuilding it on every DOM mutation fed the plugin's own observer and kept a repaint loop alive in the archived view.
- The archive view injects nothing in the collapsed rail.

## 0.3.1

- The middle view is the **archive**, not "finished running Sessions": `已归档` now lists archived Sessions (newest first, capped) with their Workspace and an inline `取消归档` action, because the native browser never renders archived rows and the plugin must not mutate the native archived filter.
- Views are now `进行中` (active: native list minus archived, empty Workspaces hidden), `已归档` (the archive list) and `工作空间` (every Workspace, Session rows folded).
- `includeArchived` is retired: the archive has its own view. The stored 0.3.0 view values (`running` / `done`) fold into `active`.
- 0.3.0's running/no-running split is gone; the archive list is the history surface instead.

## 0.3.0

- Add a segmented sidebar view switch above the native Workspace browser: `进行中` (running Sessions), `已完成` (finished Sessions) and `工作空间` (every Workspace, including those with no visible Sessions).
- The `工作空间` view keeps Workspace rows and hides Session rows, so a historical Workspace's native hover actions (New Session / menu) start a new Session there without hunting through the tree.
- `进行中` / `已完成` filter Session rows and hide Workspaces left without a matching row; the list area shows a view-specific empty hint instead of a blank column.
- The view choice is persisted (`dsh.hideEmptyWorkspaces.mode`) and exposed in the Settings tab, which also gains a Default view selector.
- Empty Workspaces stay hidden in the two session views; the `工作空间` view is the way to reach them again. Version 0.2.2's visibility rule (archived unless opted in, blank unless opted in, never subagent) is unchanged.

## 0.2.2

- A Workspace whose only remaining Sessions are subagent children now counts as empty and is hidden. Subagent Sessions never render as Workspace rows (their rows live in the parent header's catalog), but they were counted as visible, so a Workspace left with only teammate/child Sessions kept showing with zero rows.
- The visible-Session rule now mirrors the native Workspace browser: archived (unless opted in), blank (unless opted in), and subagent Sessions do not count.

## 0.2.1

- A Workspace whose only Sessions are blank (created and never used) now counts as empty and is hidden.
- Add the `dsh.hideEmptyWorkspaces.includeBlank=1` opt-out and a matching Settings tab toggle.
- Unknown Session summaries stay visible, so a loading Session list never hides working Workspaces.

## 0.2.0

- Add a Settings -> Plugins tab: status, hidden count, both toggles, re-apply, reload page, diagnostics.
- Compare three versions: loaded client bundle, loaded host code, and the manifest on disk; warn which restart level is needed.
- Add a read-only host route `/hide-empty-workspaces/status` for the version comparison.

## 0.1.1

- Hide Workspaces whose sessions are all archived, not only Workspaces with zero sessions.
- Publish diagnostics at `window.__dshHideEmptyWorkspaces` (version, state, hidden ids, error).
- Add `dsh.hideEmptyWorkspaces.includeArchived=1` to count archived sessions as visible.

## 0.1.0

- Hide Workspaces with no sessions from the native sidebar.
- Emptiness comes from the Workspace Controller snapshot (`sessionIds`), not rendered rows.
- Re-applies after React re-renders; removes marks and the injected stylesheet on dispose.
- `localStorage['dsh.hideEmptyWorkspaces'] = '0'` opts out without uninstalling.
