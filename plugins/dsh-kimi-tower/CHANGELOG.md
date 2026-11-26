# Changelog

## 0.1.2 — 2026-11-27

让工作区的主 agent 可以自己进入 tower 模式，而不是只能等人敲 `/tower on`。

- **新增配置 `agentCanEnable`**（默认 `false`）。为 `true` 时注册工具 **`tower_activate`**：只有「本工作区的主 agent」能用，只在 tower 尚未激活时可见（激活后自动隐藏），激活成功即进入协议，可继续 `tower_init`/`tower_plan`/`tower_spawn`。
- **本仓库的 bundle patch 默认打开它**（`cordis.patch.yml` 里 `config.agentCanEnable: true`）。不想要就把那一行删掉，tower 回到"只能由人开启"。
- 默认 `false` 的理由：tower 会拉起 agent、开工作树、往基线分支合并，让人来按下开关更稳妥；在一次性工作区里跑 agent 的宿主（dsh-superagent）才应打开。
- 测试：`node --test` 22 项通过，新增用例覆盖「flag 关闭时不可见」「子 agent 不可见」「激活后隐藏」「二次调用幂等」。

## 0.1.1 — 2026-11-23

从独立仓库收编进本仓库 `plugins/dsh-kimi-tower/`（来源 commit `4f3f07a`）；源码、提示词与构建产物保持不变，仅按本仓库约定调整包元数据。

- `package.json`：`version` 0.1.0 → 0.1.1；新增 `check` 脚本（`npm run typecheck && npm test`）；`files` 补 `CHANGELOG.md`；`dsh.manifestVersion` 设为 `1`。
- 新增 [UPSTREAM.md](UPSTREAM.md) 记录来源、迁入范围与差异；根 README 插件目录表与安装示例补上本插件。
- 验证：`npm run check` 通过（`tsc --noEmit` 零错误，`node --test` 21 个测试全部通过）；`npm pack --dry-run --ignore-scripts` 确认包内不含 `src/`、`test/`、`scripts/`、`tsconfig.json`、`package-lock.json`。

## 0.1.0

独立仓库初始版本，也是本仓库的收编基线；完整历史见来源仓库。
