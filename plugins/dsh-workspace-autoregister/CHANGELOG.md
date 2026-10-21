# Changelog

## 0.1.1

- A Workspace's `HANDOFF.md` (configurable) is sent as the first message of the auto-created Session, so the new chat starts with the scaffolding conversation's handoff.
- New config: `sendHandoff` (default true), `handoffFile` (default `HANDOFF.md`), `handoffMaxBytes` (default 32 KiB).
- Handoff failures are logged as warnings and never fail the registration.

## 0.1.0 — 2026-10-20

- 新增 Host-only 插件：监听已结束的工具调用，识别具备工作区特征的目录，并自动注册到 Workspace 列表；侧栏通过宿主现有实时 feed 更新，无需在侧栏手动点 **+**。
- 默认工作区特征：至少一个 `AGENTS.md` / `AGENTS.local.md`、`README.md`、`plans/` 与 `reports/`；可通过 `promptFiles`、`requiredFiles`、`requiredDirectories` 调整，`scanAncestors` 控制向上查找的父目录层数。
- 注册默认通过 `sessionController.create({ workspaceId })` 创建首个空白会话，使新工作区不为空；可用 `createSession: false` 关闭。
- 只处理成功结束的工具调用；注册幂等且串行执行，避免重复注册或重复建会话；失败只记录 `warn` 日志。
- 支持 `enabled`、`skipSessionDirectory` 等 7 个配置字段，通过 `cordis.patch.yml` 按行 id `workspace-autoregister` 覆写。
- 附带 Node 内置模块的测试：`node --test test/autoregister.test.mjs`（26 个用例）。
- 已在运行中的 desktop profile（DSH 0.2.1-rc.2）做 Host 侧端到端验证：真实会话里 scaffold 的工作区目录被自动注册并挂上首个空白会话；窗口内渲染未做 DOM 级核对。
- 加固：卸载/重载后不再产生新的注册或建会话副作用；`registry.create` 复用已有记录时只在工作区没有会话时才建首个会话；配置在校验失败或出现未知字段时激活报错；`skipSessionDirectory` 用规范化路径比较。
