# Changelog

## 0.1.0 — 2026-10-22

首个版本：把两个 MIT 社区插件合并成一个 DSH 插件（本仓库 Apache-2.0），并接入本仓库的包结构、构建与发布流程。

### 合并后的完整能力

- 在 DSH 原生模型选择器的「推理等级」入口里提供能量滑条：档位刻度、当前档位名称、拖动吸附、键盘调节；模型列表、搜索、分组与徽标保持原生。
- 鲸鱼娘跑者滑块按钮（八帧动画，拖动加速，减少动态效果时冻结）。
- 三套科幻能量皮肤 `holo` / `chrome` / `fluid`（默认 `fluid`），`fluid` 带粒子流体引擎与最高档星痕；跟随深色/浅色主题。
- Ultra 显示档：在模型真实档位之后追加一格，选中时写入模型真实最高档（MAX）并注入严格性策略；界面停在 Ultra 时实际档位必为 MAX。
- 闪电模式：面板内开关，默认关闭；注入编排策略，关闭时补 OFF 提示。
- 被跟踪会话的子代理 tok/s 实时读数（完整整数、无数据隐藏），以及只读策略 chip（默认折叠，仅在 Host 解析出非空策略时显示）；闪电开关与 tok/s 读数同一行位于滑条下方。
- 中英双语、键盘可操作、减少动态效果支持；设置 → 通用设置提供「推理强度滑块」「鲸鱼娘滑块」「特效皮肤」三项。
- 自定义模型档位指引：图形界面路径优先，高级配置提供按当前文件缩进生成的 YAML、路径/条目位置与可复制给 Agent 的提示词。
- 无网络请求、无遥测；唯一持久化文件 `$DSH_HOME/storages/dsh-whale-effort.json`。

### 继承自上游 A（HanaAyane/dsh-reasoning-effort v0.9.0，MIT）

- 原生模型选择器接入方式与推理等级面板（模型菜单、搜索、徽标、触发按钮排版保持原生）。
- 档位选择与提交逻辑（`effort-selection`）：档位来自模型目录、提交失败回滚、等待宿主确认。
- 鲸鱼娘滑块（八帧精灵图 `assets/chibi-runner-strip.png`）、动画与减少动态效果行为。
- 中英文案、深浅主题、设置页两个开关（推理强度滑块 / 鲸鱼娘滑块）。
- 自定义模型档位指引：诊断、知识库、图形界面优先、YAML 生成、「复制给 Agent」教程，以及 `design/visual-spec.md` 视觉基线。

### 继承自上游 B（yuhub233/dsh-effort-slider v1.1.0，MIT）

- 三套能量皮肤的 CSS（`we-*` 作用域）与 `fluid` 粒子流体引擎（DPR 上限、尺寸监听、减少动态效果冻结）。
- Ultra 档语义：真实 MAX 写入 + 严格性策略正文；「界面在 Ultra ⇒ 实际档位为 MAX」不变量。
- 闪电模式：默认关闭、编排策略、关闭时的 OFF 提示、子代理防递归守则。
- 子代理 tok/s 计量（`agent/assistant-stream` 逐帧累计、1.5s 窗口、完整整数）。
- 策略正文与只读策略 chip 的交互，以及会话级 `{ lightning, ultra }` 偏好的存储模型。

### 本仓库的合并工作

- 合并成一个包 `dsh-whale-effort`：一个原生入口同时提供滑条、能量皮肤、Ultra、闪电与 tok/s，不再需要安装两个插件。
- Host 半边重写为单一鉴权回环通道：`POST /dsh-whale-effort/<endpoint>`（`diagnose` / `store` / `session/state` / `session/update` / `session/policy`），通过 DSH 连接的 `requestRejection` 做 Host/Origin 与浏览器会话校验；只用结构化 interface 描述宿主服务，运行时不 import `@deepseek-ai/*`。
- 统一持久化：`$DSH_HOME/storages/dsh-whale-effort.json`（version 1、最多 40 个最近会话、临时文件 + rename 原子替换、损坏数据归一化不抛错）。
- 策略注入按会话 id 精确过滤、文本去重、先 `next()` 再追加、永不抛错。
- 构建/检查接入本仓库约定：`npm run check`（严格 tsc + 离线 vitest）、`npm run build`（esbuild 生成 `lib/index.js` / `lib/client.js` / `lib/types/`，内联精灵图与 Markdown），`lib/` 提交进仓库。
- 新增中文/英文 README、`UPSTREAM.md`、`THIRD-PARTY.md`、插件 `LICENSE`（Apache-2.0 正文 + MIT 部分说明）。

### 未包含

- 上游 A 的 npm 发布配置与其自有构建脚本。
- 上游 B 的 `skills/`（obra/superpowers 的四个 skill，MIT）不随本插件分发；策略正文自包含，设计参考在 `THIRD-PARTY.md` 中署名。
- 上游 B 的预览生成器与冒烟脚本；本插件按本仓库约定提供离线测试。
