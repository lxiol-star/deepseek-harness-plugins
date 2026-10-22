# 上游来源与改动记录

本插件 `dsh-whale-effort` 0.1.0 合并自两个 MIT 许可的社区插件，并加入本仓库的合并代码。本文件记录「用了哪个上游、哪个版本、拿了什么、改了什么」，供后续同步与审计使用；第三方许可全文见 [THIRD-PARTY.md](THIRD-PARTY.md)。

## 上游一览

| 别名 | 上游仓库 | 基线版本 / 标签 | 本地合并基线（HEAD） | 许可证 | 合并角色 |
| --- | --- | --- | --- | --- | --- |
| **A** | https://github.com/HanaAyane/dsh-reasoning-effort | v0.9.0（2026-10-19 发布） | `40dc249bebe0c2223376c6f8cd1842d9259748b8`（浅克隆单提交，树内容对应 v0.9.0） | MIT © HanaAyane | 主体：原生模型选择器接入、滑条与档位逻辑、鲸鱼娘跑者、双语、配置指引 |
| **B** | https://github.com/yuhub233/dsh-effort-slider | v1.1.0 | `6f08315d16d4dd542b27c2f380a91c9e74295a59`（= `v1.1.0`） | MIT © yuhub233 | 视觉与增强功能：能量皮肤、流体引擎、Ultra、闪电、子代理 tok/s、策略正文 |

合并时的本地工作副本（临时目录，仅用于记录基线，不属于构建步骤）：

```
A: /tmp/dshmerge/dsh-reasoning-effort   HEAD 40dc249bebe0c2223376c6f8cd1842d9259748b8
B: /tmp/dshmerge/dsh-effort-slider      HEAD 6f08315d16d4dd542b27c2f380a91c9e74295a59
```

## A — HanaAyane/dsh-reasoning-effort v0.9.0（MIT）

官方说明：沿用 DSH 原生模型选择器，在「推理等级」里用滑块调节思考强度，档位由模型目录决定；默认开启动画跑者滑块；对目录读不到档位的自定义模型提供图形界面优先的配置指引。

**取用的部分**

- 原生选择器接入与推理等级面板：保留原生模型列表、搜索、分组、徽标与触发按钮，只替换「推理等级」内容；面板保持打开、Esc 返回、外部点击关闭。
- 档位选择逻辑（`src/client/effort-selection.ts`）：档位/名称/顺序来自模型目录，提交失败回滚，等待宿主确认。
- 鲸鱼娘跑者滑块：八帧精灵图 `assets/chibi-runner-strip.png`、拖动加速、减少动态效果冻结；README 与视觉基线中的角色意象。
- 中英文案与深浅主题适配，设置页的「推理强度滑块」「大肥鱼滑块」开关。
- 自定义模型档位指引：`src/host/knowledge.ts`（知识库）、诊断逻辑、图形界面优先提示、按当前配置文件缩进生成的 YAML、文件路径/条目位置、「复制给 Agent」教程（`src/client/agent-tutorial.{zh,en}.md`）。
- `design/visual-spec.md` 视觉基线（保留为参考）。

**改动**

- 包名、插件 id、locale 命名空间与安装方式改为本仓库的 `dsh-whale-effort`。
- Host 半边重组：A 的 `src/index.ts` 中的诊断逻辑移入 `src/host/guidance.ts`；与 B 的状态/策略/计量合并为单一 Host 入口，并只暴露一条带鉴权的回环 RPC 通道。
- 去掉 A 的 `@deepseek-ai/schemastery` 运行时依赖：知识库条目改为插件 `Config` + 结构化校验，发布包不 import `@deepseek-ai/*`。
- 构建方式改为本仓库约定（esbuild 单文件 `lib/index.js` / `lib/client.js`、内联资源、`lib/types/`），不再使用 A 的多 tsconfig 构建与 npm 发布配置。
- 测试改为本仓库的离线 vitest 套件。

**未取用**

- A 的 npm 包名与 `publishConfig`、`pnpm` 工作区/lockfile、GitHub Actions。
- A 的 README/CHANGELOG 原文（本仓库重写，功能描述以合并后的行为为准）。

## B — yuhub233/dsh-effort-slider v1.1.0（MIT）

官方说明：科幻风推理等级滑条，能量核心点开为悬浮能量条；在最高档之上追加 Ultra 档，另有默认关闭的闪电编排模式与子代理 tok/s 读数。

**取用的部分**

- 三套能量皮肤的视觉系统与 CSS（`holo` / `chrome` / `fluid`，默认 `fluid`）。
- `fluid` 粒子流体引擎：粒子/列覆盖/颜色语义，DPR 上限 2、尺寸监听、减少动态效果冻结、深浅主题。
- Ultra 档语义：展示层追加一格、提交真实 MAX 档位 id、注入严格性策略正文，以及「界面在 Ultra ⇒ 实际档位为 MAX」的不变量。
- 闪电编排模式：默认关闭、编排策略正文、关闭时的 OFF 提示、子代理防递归守则。
- 子代理 tok/s 计量（`metrics`）：按 `agent/assistant-stream` 帧累计、1.5s 窗口、完整整数、无数据隐藏。
- 会话级 `{ lightning, ultra }` 偏好与皮肤偏好的状态模型（最多 40 个会话、normalize-not-throw）。
- 只读策略 chip 的交互与策略正文（`policy.mjs` → `src/host/policy.ts`）。

**改动**

- 从零依赖的 `.mjs` + 手写 `client.js` 移植为 TypeScript：Host 逻辑在 `src/host/{policy,metrics,state,inject,turbo,rpc}.ts`，视觉与组件在 `src/client/effects/**`。
- 入口位置从输入框工具行的独立浮层改为 DSH 原生模型选择器的「推理等级」面板内部（A 的 UX 为合并基准）。
- 端点改为合并后的单一前缀通道 `POST /dsh-whale-effort/<endpoint>`（`session/state` / `session/update` / `session/policy` 等），不再使用 `/plugins/dsh-effort-slider/...`。
- 持久化文件改为 `$DSH_HOME/storages/dsh-whale-effort.json`，与 A 的偏好统一到同一文档。
- 视觉 CSS 重新限定到新的 `we-*` 类名 / `[data-we-skin]` 属性，避免覆盖 A 的 `re-*` 布局。
- 计量与策略注入按 DSH `0.2.1-rc.2` 的事件/决策结构重新核对。

**未取用**

- B 随仓库分发的 `skills/`（obra/superpowers 的四个 skill，MIT）：本插件不复制这些文件，策略正文自包含；设计参考在 `THIRD-PARTY.md` 中署名。
- B 的 `preview/`、`make-preview.mjs`、`smoke-test.mjs`、`TURBO-CONTRACT.md` 原文件与安装到插件目录的旧方式；接口契约改由本插件的 `design/merge-contract.md` 与本仓库交接文档承载。

## 合并代码

除上述两个上游之外，以下部分为本仓库新写（Apache-2.0）：

- 合并后的 Host 入口与 RPC 通道、会话状态合流、鉴权栅栏；
- 合并后的客户端集成（Ultra 显示档与真实 MAX 写入的单一入口、皮肤设置行、策略 chip/tok-s 接线、中英文案合并）；
- 本仓库的包结构、构建脚本、类型检查、离线测试与发布流程；
- 中文/英文 README、CHANGELOG、本文件、THIRD-PARTY.md。

## 后续同步上游的建议

1. 在临时目录检出上游新版本标签，记录 tag 与 commit（写入本文件的上游一览表）。
2. 对比 `git diff <旧基线> <新基线>`，逐项判断是否与合并后的结构冲突；只搬运行为，不要整文件覆盖合并结果。
3. 更新 `CHANGELOG.md`、必要时更新 `THIRD-PARTY.md` 的版本号与版权年份。
4. 走一遍本仓库的检查与发布流程（`npm run check`、`npm run build`、实机验证、递增版本号）。

## English summary

This plugin merges two MIT upstreams: **HanaAyane/dsh-reasoning-effort v0.9.0** (native model-selector integration, effort slider and selection logic, chibi whale-girl runner sprite, bilingual copy, guidance for custom models) and **yuhub233/dsh-effort-slider v1.1.0** (energy skins, fluid particle engine, Ultra tier, lightning orchestration mode, subagent tok/s, policy texts). The merge, the host/client restructuring, the single authenticated RPC channel, the unified state file, the build/check plumbing and all packaging code are new Apache-2.0 work from this repository. Upstream tags and merge-base commits are listed above; full MIT texts are in [THIRD-PARTY.md](THIRD-PARTY.md).
