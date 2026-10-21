# 归档提炼模型设置（0.3.0）实现任务

## 目标

把“归档提炼用哪个模型/供应商”做成插件设置项，选项直接复用当前 DSH 客户端的模型列表；选择结果持久化，并用于后续的 Wiki 提炼。

## 仓库与分支

- 仓库：本地 checkout 的 `deepseek-harness-plugins`（路径因机器而异，不写入仓库）
- 插件：`plugins/dsh-session-board`（公开仓库，Apache-2.0）
- 版本：升到 `0.3.0`，更新 `CHANGELOG.md` / `README.md`
- **不要** `git tag`、不要 `gh release`、不要 push；实现与验证完成即可，由 Lead 发布。

## 现状

- 提炼走 `src/host/wiki-workflow.py synthesize`：调用 `wiki-synthesize.py --provider <id>`，provider 来自 `~/.wikibar/config.json`，模型由该 provider 的 `defaultModel` 决定。
- provider 目前可由 `~/.dsh-session-board.json` 覆盖，默认 `stepx-terra`。
- 设置页、模型列表、模型调用都还没有。

## 需求

1. **设置页**
   - 用 DSH 客户端设置页插槽注册一个「会话看板」设置页，新增「归档提炼」分组。
   - 模型选择器选项来自**当前客户端的模型列表**（用 DSH 已有的服务读取，不要自己写死列表，也不要读 wikibar 配置）。
   - 展示“供应商 / 模型 / 上下文窗口(若有)”等已有信息；提供“不指定（沿用 Wiki provider）”选项。
   - 修改即时保存并提示已保存；界面文案走 i18n 字典（中英）。

2. **持久化**
   - 新增 host 存储域（version 1，独立于现有 ack / turns 域），表 `prefs`，key `synthesis`，值形如 `{ model: string | null, provider: string | null }`。
   - 新增已认证路由 `POST /api/session-board/synthesis-model`（读当前值/写新值），复用现有 `connection.requestRejection` 校验。
   - 校验：model/provider 必须是当前 host 已知的模型路由，未知值拒绝；`null` 表示回退 Wiki provider。

3. **提炼执行**
   - 已选择模型时：由插件（host）通过 DSH 的模型服务完成调用；**不要再走** wikibar provider。
   - 模型输出交给 python helper 的写入流程：复用 `wiki-synthesize.py` 的 `parse_pages` / `process_page` / state 记录逻辑（可在 `wiki-workflow.py` 增加 `write` 操作，输入为模型输出文本 + 原始页相对路径），保证 SKIP、slug 唯一、sources、写入校验与脚本一致。
   - 未选择模型时：保持现有 `wiki-synthesize.py --provider` 路径不变（向后兼容）。
   - 失败（模型报错、解析失败、写入被拒绝）时：保留原文归档，结果里明确报错，不归档到 DSH 客户端。
   - 批量仍有 `wiki-index.py` 统一更新索引。

4. **测试**（全部合成数据，不碰用户真实会话/密钥）
   - 设置读写与未知模型拒绝。
   - 模型选择器数据映射（provider/model 去重、排序稳定）。
   - 模型调用失败 → 原文保留 + 结果标记失败。
   - helper `write` 操作：SKIP、合法建页、非法页拒绝、state 更新。
   - 现有 280 项测试必须继续通过。

5. **约束**
   - 不在仓库写入任何密钥、个人路径、真实会话内容。
   - 不修改用户 `~/.wikibar/config.json`、`~/.dsh*` 数据。
   - 插件运行时不能 import `@deepseek-ai/*`（profile 内不可解析），继续用结构化 interface + `ctx.get()`。
   - 构建产物 `lib/` 需要重新生成。

## 交付

报告：改动文件清单、模型列表与调用所用 DSH 服务及字段出处（相对 `docs/` 或源码路径）、测试与构建命令输出、遗留风险。不要发布版本。
