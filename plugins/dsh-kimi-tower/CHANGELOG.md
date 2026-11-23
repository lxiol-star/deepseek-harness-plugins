# Changelog

## 0.1.1 — 2026-11-20

从独立仓库收编进本仓库 `plugins/dsh-kimi-tower/`（来源 commit `4f3f07a`）；源码、提示词与构建产物保持不变，仅按本仓库约定调整包元数据。

- `package.json`：`version` 0.1.0 → 0.1.1；新增 `check` 脚本（`npm run typecheck && npm test`）；`files` 补 `CHANGELOG.md`；`dsh.manifestVersion` 设为 `1`。
- 新增 [UPSTREAM.md](UPSTREAM.md) 记录来源、迁入范围与差异；根 README 插件目录表与安装示例补上本插件。
- 验证：`npm run check` 通过（`tsc --noEmit` 零错误，`node --test` 21 个测试全部通过）；`npm pack --dry-run --ignore-scripts` 确认包内不含 `src/`、`test/`、`scripts/`、`tsconfig.json`、`package-lock.json`。

## 0.1.0

独立仓库初始版本，也是本仓库的收编基线；完整历史见来源仓库。
