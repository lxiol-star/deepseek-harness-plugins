# dsh-session-board

DeepSeek Harness 的会话看板插件。提供贴边栏和全屏看板，集中查看需要处理、运行中和已完成的会话。

## 功能

- 按状态、工作区或工作区路径树分组，支持展开与折叠。
- 按标题、预览、工作区和状态搜索筛选。
- 默认简洁卡片，展开后查看指令、Token、缓存、后台任务和长预览。
- 直接读取 DSH 工作区快照的 `archivedSessionIds`：在客户端归档的会话，插件也显示“DSH 中已归档”，默认隐藏；客户端恢复后随快照更新。
- 支持“隐藏已归档 / 查看已归档 / 全部会话”。Wiki 完成标记与 DSH 原生归档是两种不同来源，分别显示。
- 归档成功的 Wiki 标记记录当时观察到的内容版本；会话重新运行或出现新内容后重新显示。
- 中英双语、键盘操作、独立滚动、触控板滚动传递和减少动态效果支持。

## 安装与兼容性

从本仓库 Releases 下载 `dsh-session-board-0.2.1.tgz`，在 **DSH 设置 → 插件 → 添加插件** 中安装。

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-session-board-0.2.1.tgz
```

升级后请**完全退出并重开 DSH**，单纯刷新页面可能出现新客户端搭配旧服务端的情况。插件会检查 Wiki 后台协议，版本不一致时要求重启。

本插件处于实验阶段：开发验证环境为 macOS arm64、Harness Dev `0.2.1-alpha.1`。早期实现参考 `0.2.0-rc.2`；当前发布没有覆盖所有正式版、Windows、Linux 或独立 Web 部署。贴边栏依赖版本敏感的宿主布局适配，未知布局会拒绝挂载；全屏看板使用 DSH 插槽。安装前请确认版本兼容并备份重要会话数据。

原生归档状态来自 DSH，不会因新消息自行改变。Wiki 标记、分组和筛选偏好保存在当前客户端本地存储，重启保留但不跨设备同步，也不会自动补标历史 Wiki 归档。插件的 Wiki 操作不隐藏、停止或删除原 DSH 会话。

## 可选：归档并提炼到 Wiki

基础看板不要求 Wiki 环境。使用“归档并提炼”需要自己提供：

- `~/wiki/SCHEMA.md`
- `~/wiki/scripts/wiki-archive.py`
- `~/wiki/scripts/wiki-synthesize.py`
- `~/wiki/scripts/wiki-index.py`
- WikiBar 中名为 `stepx-terra` 的提炼 provider 配置。
- `/usr/bin/python3`，以及 Python `zstandard` 或 `zstd` 可执行程序。

这些脚本和配置属于外部集成，**没有包含在本仓库中**；插件不会下载它们或生成密钥。该工作流根据本地 `wiki-current-session` 技能约定实现，属于需要既有兼容 Wiki 环境的高级功能。

操作流程：

1. 勾选会话，点击“预览归档与提炼”。
2. 预览核对精确会话 ID、源路径、明确的 `parentSession` 父子归属，以及缺失子会话和进行中快照。仅扫描当前实际 `DSH_HOME`，总范围最多 50 个。
3. “确认归档并提炼”授权原文归档及向已配置的 `stepx-terra` 模型服务发送脱敏后的归档文本。取消不写原文、不调用模型。
4. 每条会话单独执行 `wiki-archive.py --exact-session <完整ID> --full --json`，要求精确命中一个来源。
5. 对成功归档的完整原文页路径逐条执行 `wiki-synthesize.py --provider stepx-terra --session <raw/.../完整页.md> --limit 1`。提炼前再次检查可识别凭证，API/解析错误重试一次，SKIP 视为正常结论。
6. 批次结束统一更新索引，面板显示原文路径、知识页路径、SKIP、失败和索引状态。提炼失败保留原文，不伪报成功。

脱敏采用启发式，无法保证识别任意秘密。归档会保留敏感的本地原文内容，不应直接公开。确认框会明确说明模型外发，不依赖模型自行隐去密钥。

## 开发

DSH 源码仓库提供构建工具和已构建的类型声明：

```sh
export DSH_REPO=/absolute/path/to/deepseek-harness
npm run check
npm run build
npm pack --ignore-scripts
```

公开构建验证使用 DSH commit `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。仓库中的 `lib/` 是从源码生成的可安装产物；修改 `src/` 后应重新构建。插件运行时不会复制 DSH 的核心包，也不会修改官方源码。

大部分测试使用合成数据。可选 Python 集成测试可通过 `WIKI_ARCHIVE_SCRIPT` 指定归档脚本；压缩工具通过 `ZSTD_BIN` 指定。未安装对应依赖时明确跳过，而不是触碰用户真实会话或密钥。

## 限制

- Wiki 标记属于客户端状态，不等于 DSH 原生归档；客户端归档状态优先读取宿主集合。
- 子会话只按明确父子元数据纳入，不凭相似标题或时间猜测。
- 进行中会话仅归档执行时已落盘内容，不承诺未来内容。
- 中断的多会话归档可能留下已完成的原文页，重试需重新预览。
- 目前未提供脱离本地 Wiki 脚本体系的通用知识库后端。

## License

[Apache-2.0](LICENSE)。
