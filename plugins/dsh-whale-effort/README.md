<div align="center">

<!--
  截图：下列图片取自 Harness Dev2（DSH 0.2.1-rc.2）实测界面，已提交到 assets/readme/。
  assets/ 不随 npm 包发布（package.json 的 files 只含 lib/ 与文档）。
  hero.png      —— README 顶部主图：原生模型入口 + 推理等级滑条 + 鲸鱼娘滑块
  panes-dark.png / panes-light.png —— 深色 / 浅色主题下的推理等级面板
  skins.png     —— holo / chrome / fluid 三种能量皮肤
-->
<img src="assets/readme/hero.png" alt="DSH 原生模型入口中的推理等级滑条与鲸鱼娘滑块" width="100%">

# dsh-whale-effort

**沿用 DeepSeek Harness 原生模型选择器，在「推理等级」里拖动调节思考强度；鲸鱼娘滑块、科幻能量皮肤、Ultra 档、闪电模式与子代理 tok/s 读数。**

[English](README.en.md) · [上游与来源](UPSTREAM.md) · [第三方许可](THIRD-PARTY.md) · [更新日志](CHANGELOG.md) · [问题反馈](https://github.com/lxiol-star/deepseek-harness-plugins/issues)

</div>

> 本插件是社区插件 [`HanaAyane/dsh-reasoning-effort`](https://github.com/HanaAyane/dsh-reasoning-effort) v0.9.0 与 [`yuhub233/dsh-effort-slider`](https://github.com/yuhub233/dsh-effort-slider) v1.1.0（均为 MIT）的合并版本，按本仓库的包结构重新打包与验证。两边的功能、改动与许可记录见 [UPSTREAM.md](UPSTREAM.md) 和 [THIRD-PARTY.md](THIRD-PARTY.md)。

## 这是什么

DSH 的推理强度默认是一个下拉选择。本插件沿用 DSH 原生模型选择器（模型列表、搜索、分组、徽标都不变），只接管「推理等级」入口，把它换成一条可点、可拖、可用方向键调节的能量滑条，并在其上叠加能量皮肤、Ultra 档、闪电模式与子代理 tok/s 读数。

- **档位跟随模型**：档数、名称和顺序来自当前模型目录公开的 `reasoning.efforts`，不写死三档；模型公开不足两档时显示提示并保持原有选择方式。
- **鲸鱼娘滑块**：八帧跑步动画替换滑块按钮（默认开启，上游称「大肥鱼」），拖动时加速；系统启用「减少动态效果」时停在稳定帧。
- **科幻能量皮肤**：`holo`（全息能量）、`chrome`（液态金属）、`fluid`（流体，默认，带粒子流体引擎与最高档星痕）；支持深色与浅色主题。设置里选项名为「特效皮肤」。
- **Ultra 档**：模型公开至少两个真实档位时，滑条末尾追加一格 `Ultra`；选中时向模型目录提交的仍是**最高真实档（MAX）**的 id，`Ultra` 从不出现在模型目录里。
- **闪电模式**：滑条下方、与子代理 tok/s 读数同一行的闪电开关（默认关闭），给当前会话注入「父 agent 只做编排、按边界切分、在同一条消息里并发派发子代理」的编排策略。
- **子代理 tok/s**：实时显示被跟踪会话的子代理合计 token 产出速率，完整整数、不做 k/M 缩写；没有数据时整块隐藏。
- **「注入策略」读数**：只读 chip 展示当前会话实际解析出的策略正文，默认折叠、点击展开；仅当 Host 解析出非空策略（Ultra 或闪电生效）时显示。
- **自定义模型档位指引**：目录读不到档位的自定义模型，面板优先给出图形界面设置路径；「高级配置」里提供按当前配置文件缩进生成的 YAML、文件路径与条目位置，以及可复制给 Agent 的提示词。已有有效档位或明确关闭推理的模型不再提示。
- **中英双语、深浅主题、键盘与减少动态效果**：文案跟随 DSH 语言即时切换。

## 截图

以下截图取自 Harness Dev2（DSH `0.2.1-rc.2`）的实测界面：深色与浅色主题、三套能量皮肤都是真实渲染，未加标注。

| 深色主题 | 浅色主题 |
| --- | --- |
| ![深色主题下的推理等级面板](assets/readme/panes-dark.png) | ![浅色主题下的推理等级面板](assets/readme/panes-light.png) |

| 能量皮肤 | |
| --- | --- |
| ![holo、chrome、fluid 三种能量皮肤](assets/readme/skins.png) | 皮肤顺序为 `holo` / `chrome` / `fluid`（默认 `fluid`）；`fluid` 带流体粒子引擎，Ultra 时提速并出现星痕。 |

## 安装

需要 **DSH `0.2.1-rc.2`**（Web 或 Desktop profile）。

> 如果你之前装过上游的 `dsh-reasoning-effort` 或 `dsh-effort-slider`，请先卸载它们，再安装本插件：同一入口装两个插件会重复接管模型菜单与策略注入。

### 方式一：Release 安装包（推荐）

1. 从 [Releases](https://github.com/lxiol-star/deepseek-harness-plugins/releases/tag/dsh-whale-effort-v0.1.2) 下载 `dsh-whale-effort-0.1.2.tgz`。
2. 在 DSH **设置 → 插件 → 添加插件** 中选择该 `.tgz`；或在终端执行：

   ```sh
   dsh plugin --profile desktop add /absolute/path/to/dsh-whale-effort-0.1.2.tgz
   ```

3. **完全退出并重新打开 DSH**：Host 与 Client 两半分别加载，只刷新页面不会加载新的 Host 代码。

### 方式二：GitHub 子目录安装

在插件管理器的「包名或地址」中填入指定版本：

```text
github:lxiol-star/deepseek-harness-plugins#dsh-whale-effort-v0.1.2&path:/plugins/dsh-whale-effort
```

仓库里的 `plugins/dsh-whale-effort/` 就是完整插件目录；`lib/` 已构建，装上即可用，无需自行构建。

## 使用

### 调节推理强度

打开会话，点击输入框旁的模型入口，选择 **推理等级**：滑条按当前模型的档位画出刻度，当前档位高亮并显示名称。点轨道或拖动滑块，松手后吸附到最近的档位；调整后面板保持打开，按 Esc 返回、点击外部关闭。键盘可用方向键调节。

### Ultra 档

当模型公开至少两个真实档位时，滑条末尾多出一格 **`Ultra`**：

- 选中 Ultra 时，写入模型的仍是**真实最高档（MAX）**的 id —— Ultra 只是显示层的一格，不会出现在模型目录或请求参数里。
- 同时给当前会话注入一段「严格性契约」：先写验收标准、证据先于断言、对抗式复查、根因优先、显式停止条件、不允许改测试迁就实现。
- 不变量：只要界面停在 Ultra，实际提交的推理等级就一定是 MAX（拖动、点刻度、刷新后从宿主恢复三条入口都走同一个写入路径）。
- 档位名是 `Ultra`，不是全大写 `ULTRA`。

### 闪电模式

滑条下方、与子代理 tok/s 读数同一行的闪电开关**默认关闭**。打开后给当前会话注入编排策略：父 agent 只做规划、拆分、派发、复核与整合，把活按边界切给子代理、在同一条消息里并发派发，子代理自包含并只回传产物指针；关闭时会补一条 OFF 提示，避免历史里的策略继续生效。

策略正文与上游一致为英文（注入模型的指令），界面标签跟随 DSH 语言。

> ⚠️ 这不是「给模型加算力」。Ultra 与闪电本质上都是**提示词层**的控制：Ultra 改变「怎么验收」，闪电改变「谁干活」。真正变慢变贵的是闪电——多智能体大约会花掉单 agent **15 倍**的 token，这也是它默认关闭的原因。

### 子代理 tok/s 与策略读数

滑条下方是闪电开关与子代理 tok/s 读数（同一行）；两者下方是「注入策略」chip。

- **tok/s 读数**：统计被跟踪会话的后代（子代理）的 token 产出速率，按 1.5 秒窗口折算成完整整数（`12,840` 而不是 `12.8k`）；没有数据时整块隐藏，不显示估计值。
- **「注入策略」chip**：只读展示当前会话实际解析出的策略正文，默认折叠、点击展开；仅在 Host 解析出非空策略（Ultra 或闪电生效）时出现。策略由开关状态决定，插件不会替你修改会话历史。

### 自定义模型缺少档位

如果当前模型是你自己在 `llm-pi-ai` 里声明、目录读不到档位的自定义模型，推理等级面板会给出配置指引：

1. 优先按面板顶部的图形界面路径配置：**设置 → 模型 → 编辑提供商 → 自定义设置 → 模型选项（›）→ 推理等级**；
2. 需要手工编辑时，展开「高级配置」查看按当前配置文件缩进生成的 YAML、文件路径与条目位置，按端点文档填写；
3. 也可以点「复制给 Agent」，把包含当前路由、模型 ID、配置路径、条目位置的提示词交给 coding agent 处理。

插件**完全只读、绝不修改** DSH 配置或内置目录；知识库条目只是参考，实际支持的取值以端点文档为准。

## 设置

**设置 → 通用设置** 下有三个与本插件相关的开关/选项：

| 选项 | 说明 | 默认 |
| --- | --- | --- |
| 推理强度滑块（开关状态显示「启用 / 停用」） | 总开关。关闭后立即恢复 DSH 原生模型选择器，无需卸载；重新打开即恢复增强滑条。 | 启用 |
| 鲸鱼娘滑块 | 是否用鲸鱼娘（上游称「大肥鱼」）替换滑块按钮（只替换外观，不改变档位吸附、键盘控制与模型选择）。 | 启用 |
| 特效皮肤 | `holo`（全息能量）/ `chrome`（液态金属）/ `fluid`（流体）。切换后立即生效并持久化，重启 DSH 后保持。 | `fluid`（流体） |

前两个开关只保存在当前浏览器；特效皮肤保存在全局偏好中，Ultra 与闪电状态按会话保存在本机（见下方「数据与隐私」）。

## 插件配置（cordis.patch.yml）

插件行的 `config` 支持两个**可选**字段，都可以省略，且不影响滑条本身；修改后需重启 DSH 生效。

### entries（可选）

自定义模型的知识库条目数组，用于给「目录读不到档位」的自定义模型生成配置指引。合法条目与内置知识库一起参与匹配：更具体的 `provider` / `model` 优先，同等具体程度时用户条目优先；**格式不合法的条目会被逐条忽略**，不会让插件加载失败。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 条目标识，字符串。 |
| `provider` | 是 | provider 路由名，字符串；`*` 匹配任意路由。 |
| `model` | 是 | 模型 id，字符串；`*` 匹配任意字符串。 |
| `note` | 是 | 原样展示在指引里的说明文字，字符串。 |
| `efforts` | 是 | 档位 → 端点取值的映射。键是 DSH 档位（`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`），值是端点接受的字符串；值写 `null` 时生成只有键、不带取值的声明（例如 `off`）。 |
| `compat` | 否 | 只识别 `thinkingFormat`（字符串）与 `supportsReasoningEffort`（布尔），会原样写进生成的 YAML；其它键当前被忽略。 |

> `compat` 只对 `openai-completions` 路由有意义；不要给可能匹配其它协议的路由写 `compat`，否则生成的片段可能让那条路由解析失败。

示例（Profile 中对应插件行的 `config`）：

```yaml
- insert:
    - id: dsh-whale-effort
      name: dsh-whale-effort
      config:
        entries:
          - id: my-model
            provider: "my-provider"
            model: "my-model-id"
            note: 端点文档给出的档位映射
            efforts:
              low: "low"
              high: "high"
            compat:
              thinkingFormat: "openai"
              supportsReasoningEffort: true
        statePath: "/absolute/path/to/dsh-home"
```

### statePath（可选）

状态 JSON 的路径覆盖，字符串。以 `.json` 结尾时按**文件路径**使用；其它值按 **DSH home 目录**使用，实际文件为 `<目录>/storages/dsh-whale-effort.json`。支持 `~` 展开；省略时按 `$DSH_HOME` → `~/.dsh` 解析（见「数据与隐私」）。

例如 `statePath: "/absolute/path/to/dsh-home"` 会在 `/absolute/path/to/dsh-home/storages/dsh-whale-effort.json` 读写状态。

## 兼容性

| 项目 | 说明 |
| --- | --- |
| DSH | 目标版本 `0.2.1-rc.2`；`package.json` 声明 `engines.dsh: ">=0.2.1-rc.2 <0.3.0"`。Web 与 Desktop profile 都使用同一套 Web 客户端。 |
| Node.js | `^22.19.0 || >=24.0.0`（仅开发构建需要；插件运行时不安装依赖）。 |
| 模型 | 滑块需要模型目录公开至少 2 个推理档位；Ultra 需要模型存在真实 MAX 档。 |
| 宿主接口 | 依赖 DSH 客户端服务（slots / locale / sessions / 模型目录）与 Host 的 `connection` / `webServer`；纯终端 profile 不加载客户端半。 |
| 实测 | 已在 macOS Harness Dev2（DSH `0.2.1-rc.2`，2026-10-23）实测：滑条 / Ultra / 闪电 / 皮肤 / 设置页 / 原生菜单回归。 |
| 平台 | 主要在 macOS 验证；Windows / Linux 与独立 Web 部署未系统验证。 |
| 共存 | 不要与上游 `dsh-reasoning-effort` / `dsh-effort-slider` 同时安装。 |

DSH 的客户端插件 API 属于 RC 阶段，宿主升级后需重新验证；本插件以 RC 版本（而非 alpha）为适配目标，不保证跨 RC 自动兼容。

## 数据与隐私

- **不发起任何外部网络请求**，没有遥测、统计上报或远程配置。
- 唯一持久化文件：`$DSH_HOME/storages/dsh-whale-effort.json`（`$DSH_HOME` 解析顺序：显式配置 → 环境变量 `DSH_HOME` → `~/.dsh`；可用插件配置的 `statePath` 覆盖路径，见「插件配置」）。内容为版本号、当前皮肤，以及最多 40 个最近活跃会话的 `{ lightning, ultra }`；采用临时文件 + rename 原子替换，损坏的记录按缺省值归一化，不会让插件加载失败。
- 策略文本只追加到**被跟踪会话**（按会话 id 精确过滤）的下一步模型请求，文本不变时不重复注入；tok/s 只在本机内存中从会话事件流统计，不落盘、不上报。
- Host 与 Client 只通过一条本机回环路由 `POST /dsh-whale-effort/<endpoint>` 通信；该路由自己调用 DSH 连接的 `requestRejection` 做 Host/Origin 与浏览器会话校验，不注册未鉴权路由。

## 卸载

在 **设置 → 插件** 中卸载，或执行：

```sh
dsh plugin --profile desktop remove dsh-whale-effort
```

随后**完全退出并重新打开 DSH**；原生模型选择器会自动恢复。需要时再删除 `$DSH_HOME/storages/dsh-whale-effort.json`。

## 开发与构建

插件不安装运行时依赖，`check` / `build` 通过 `DSH_REPO` 指向的 DSH 源码检出提供 `tsc` / `vitest` / `esbuild`：

```sh
cd plugins/dsh-whale-effort
export DSH_REPO=/absolute/path/to/deepseek-harness
npm run check    # 严格 tsc + vitest（全部离线）
npm run build    # 生成 lib/index.js、lib/client.js、lib/types/
npm pack --ignore-scripts
```

- `lib/` 是构建产物（提交进仓库，发布包只带它），不要手改；改了 `src/` 必须重新 `npm run build`。
- 包结构、Host/Client 分工、发布流程与硬规则见仓库的 [插件开发交接文档](../../docs/plugin-development-handoff.md)。
- Host RPC 端点：`diagnose`、`store`、`session/state`、`session/update`、`session/policy`。

## 来源与许可

本插件合并自两个 MIT 上游：

- **原生选择器集成、鲸鱼娘跑者、档位选择逻辑、配置指引与国际化**：源自 [`HanaAyane/dsh-reasoning-effort`](https://github.com/HanaAyane/dsh-reasoning-effort) v0.9.0（MIT © HanaAyane）；
- **能量皮肤、流体粒子引擎、Ultra 档、闪电编排模式、子代理 tok/s 与策略正文**：源自 [`yuhub233/dsh-effort-slider`](https://github.com/yuhub233/dsh-effort-slider) v1.1.0（MIT © yuhub233）；
- 合并、移植与仓库打包代码：本仓库，Apache-2.0（© lxiol-star 及贡献者）。

闪电开关的 SVG 路径来自 [Feather Icons](https://github.com/feathericons/feather) 的 `zap`（MIT © Cole Bemis）；Ultra / 闪电策略的设计参考了 [obra/superpowers](https://github.com/obra/superpowers)（MIT，**未随本仓库分发**）。上游版本、改动明细与完整许可文本见 [UPSTREAM.md](UPSTREAM.md) 与 [THIRD-PARTY.md](THIRD-PARTY.md)。

## 已知限制

- Ultra 与闪电是提示词层控制，不增加算力、不改变模型能力；闪电模式的多智能体开销约为单 agent 的 15 倍。
- **Ultra 只是显示层的一格**：选中 Ultra 时写入会话的仍是模型真实最高档（MAX）的 id，原生触发器（输入框旁的「推理等级」行）继续显示真实档位名（例如 Max），会话目录里不会出现 `ultra` id；Ultra 只体现在插件面板与注入的严格性策略上。
- 子代理 tok/s 只统计当前进程中仍被跟踪的会话后代；归档、重启或已脱离跟踪的子代理不计入。读数需要真实的子代理产出，没有数据时整块隐藏（不显示估计值），单 agent 会话通常看不到读数。
- 策略注入在开关变化后的下一步生效，并不改写已发送的请求；按会话 id 过滤、文本去重。实机验证只覆盖 `session/policy` 返回的策略正文与面板联动，真正写入模型请求的注入与两步去重由离线测试覆盖，尚未在实机会合中消耗模型额度验证。
- 滑块依赖模型目录的 `reasoning.efforts`；目录没有档位或只有一档时按原生行为处理，插件不伪造档位。
- **未设置推理强度时滑条从第一档开始**：会话的 effort 未设置（继承 provider 默认）时，滑条显示第一个真实档位（显示为 `Off`）并给出「未指定推理强度，点击或拖动滑条设置」提示，而原生根行仍显示「推理等级 Default」。这是继承自上游 A 的行为，不是错误。
- 安装或升级后必须完全退出并重开 DSH，否则可能出现「新 Client 配旧 Host」。
- DSH 客户端插件 API 处于 RC 阶段：宿主升级、官方模型选择器改版都可能影响注入点，升级后请重新验证。
