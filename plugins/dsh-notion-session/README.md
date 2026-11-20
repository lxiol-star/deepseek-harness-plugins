# dsh-notion-session

把 Notion 变成 agent 会话的「可续接归档层」：在 DSH、Claude Code、Codex、Kimi Code 等宿主中主动保存当前会话，DSH 插件自动或手动拉取记录，再在真正的新 DSH 会话中继续任务。

## 能做什么

- **主动保存**：`/notion-current-session` 或输入区 **Notion → 保存当前**。
- **保存并收起**：`/notion-current-session 保存并归档`，或 **保存并归档**。
- **状态管理**：active / archived / hidden / 全部四种筛选；可恢复、归档、隐藏，不删除 Notion 页面。
- **自动 + 手动拉取**：Host 默认每 5 分钟刷新最近 20 条；面板可立即拉取。
- **有界预览**：列表只有摘要；展开时最多读取 20,000 字符，续接正文默认最多 24,000 bytes，保留开头与末尾。
- **真实新会话续接**：调用 `sessionController.create()` + `prompt()`，客户端刷新目录后 `uiWorkspace.openSession()`；不是伪造 transcript，也不是无损恢复原 session。
- **其他 agent**：自包含 Python CLI + 三个 skill，使用同一份状态格式、secret 门控和 Notion 幂等逻辑。

## 前置条件

1. DSH `0.2.2-rc.3`（本包对齐的当前安装版本）。
2. Python 3（默认 `/usr/bin/python3`，可配置）。
3. 安装并登录 [`ntn`](https://ntn.dev)：

```bash
curl -fsSL https://ntn.dev | bash
~/.local/bin/ntn login
```

插件不会自动登录、不会读取浏览器 cookie，也不会把 token 写入配置。`ntn auth token` 的凭据只在 Host/CLI 进程内存中使用。

## 安装

从 GitHub 安装（DSH 插件管理器支持子目录）：

```text
github:lxiol-star/deepseek-harness-plugins#dsh-notion-session-v0.1.1&path:/plugins/dsh-notion-session
```

或在本仓库中把 `plugins/dsh-notion-session` 目录作为本地包安装（**Plugins → Add plugin**）。安装后刷新 Web GUI；纯客户端文件变更不会由 HMR 自动更新。

对应 skill（插件随包注册，也可单独装给其他 agent）：

| Skill | 用途 |
|---|---|
| `/notion-current-session` | 保存当前会话到 Notion |
| `/notion-session-archive` | 归档 / 隐藏 / 恢复记录状态 |
| `/notion-session-resume` | 查询、预览并说明如何续接 |

其他 agent 的安装命令：`python3 scripts/install_skills.py --target ~/.agents/skills`（只想新增管理能力可加 `--only notion-session-archive --only notion-session-resume`，避免覆盖已有归档流程）。

默认使用现有 `wiki-sessions`：

- database：`faa56226-d71c-4b2c-bb4a-859bf8381f4e`
- data source：`a5af25e2-3146-49e4-9bc2-c2ae31513b36`

使用自己的数据库时，在 bundle row 中覆盖：

```yaml
- insert:
    - id: dsh-notion-session
      name: dsh-notion-session
      config:
        databaseId: your-database-id
        dataSourceId: your-data-source-id
        python: /usr/bin/python3
        ntnPath: /Users/you/.local/bin/ntn
        autoSync: true
        syncIntervalSeconds: 300
        listLimit: 20
```

目标 data source 需要 `标题`(title)、`slug`(rich_text)、`host`(rich_text)、`tool`(rich_text)、`project`(rich_text)、`archived`(date)。`check` 会验证这些字段；本版**不会自动修改 Notion schema**，也不会写入线上不存在的 `updated` 属性。

## 日常使用

### 从任意 agent 提交

```text
/notion-current-session
/notion-current-session 保存并归档
/notion-current-session 保存并隐藏
```

同一来源会话固定使用 `dsh/<session-id>`，重复保存是原地更新，不新增重复页面。子会话只有能从未会话元数据或明确工具结果确认归属时才纳入；不能按时间或关键词猜。

### 在 DSH 管理和续接

1. 在会话输入区点 **Notion**。
2. 用状态页签和搜索找到记录；后台拉取失败时仍可查看缓存，并会明确标记 stale。
3. 点 **预览** 读取有界正文，或点 **Notion 原文** 查看完整页面。
4. 点 **续接到新会话**。若原目录不可用，回退到发起续接的当前目录，并显示警告。已有 `resumedSessionId` 的记录会打开已关联会话，不重复创建或投递。
5. 归档/隐藏只改变插件记录的可见性。恢复 active 不会启动源进程，也不会取消源 DSH 会话的原生归档。

## Agent 工具

每个 DSH agent 获得 `notion_session`：

| action | 作用 |
|---|---|
| `archive` | 从 `sessionQuery.readSession()` 的 committed log 渲染并保存当前会话 |
| `list` | 按状态/查询词返回有界摘要，默认 active |
| `show` | 读取一条记录，模型输出最多 12,000 字符 |
| `set_state` | active / archived / hidden |

创建续接会话是**用户 GUI 主动操作**，不向模型开放 `resume` 工具，避免低信任归档正文间接驱动新 agent。续接提示把归档正文标为不可信历史数据。它不能覆盖当前系统/用户指令，也不能作为外发凭据、提权或删除数据的新授权。

## 其他 agent 安装 skill

```bash
python3 scripts/install_skills.py --target ~/.agents/skills
```

安装 `notion-current-session`、`notion-session-archive`、`notion-session-resume`，并为每个 skill 放置独立 CLI 副本。已有同名目录先原子改名为带时间戳的备份；失败时尽可能回滚。已有自己的归档 skill、只想新增管理能力时，使用 `--only notion-session-archive --only notion-session-resume`，不会覆盖 `notion-current-session`。其他 agent 只支持读取/保存/生成 handoff 时，不会谎称已打开 DSH 窗口。

也可直接调用 CLI：

```bash
python3 scripts/notion_session.py check
python3 scripts/notion_session.py list --status all --limit 20
python3 scripts/notion_session.py show --slug dsh/<session-id>
python3 scripts/notion_session.py state --slug dsh/<session-id> --state archived
```

成功时 stdout 只有 JSON；诊断写 stderr。`exit 3` 为认证问题，`exit 4` 为 secret 门控命中。

## 已验证（2026-11-17，DSH 0.2.2-rc.3）

- 46 项离线测试通过：17 项 JavaScript（渲染/配置/续接幂等/缓存竞争/路由注册）+ 29 项 Python（Notion 协议/状态/secret/截断/schema）。
- 真实 Notion 只读：`check` 校验六个必要属性的名称与类型；`list` 读取现有 30 条历史记录。
- 真实端到端（两个隔离 `DSH_HOME` web 实例 + 一个共享凭据实例）：
  - 从真实会话创建归档页 `dsh/session-19561421-…`，标题“Notion 插件端到端测试”。
  - 对同一会话再次“保存当前”返回**已更新**，验证原地 PATCH（`replace_content.new_str`）。
  - 设备 B 无该本地会话，仍能拉取、预览并续接；新会话首条消息含 `Source Notion:` 与 `ARCHIVED SESSION DATA BEGIN/END`。
  - 续接后 Notion 回写 `resumedSessionId`；隐藏后从“可续接”消失，在“已隐藏”出现；恢复 active 成功。
  - 测试记录最终保持 **hidden**，不进入 active 列表。
- 真实 GUI：输入区 Notion 入口、状态筛选、预览（`role=region` 有界正文）、部分成功提示与重试按钮均在浏览器中操作验证。
- 未验证：桌面 App 内嵌窗口的视觉检查（认证隔离，无法复用浏览器 cookie）；客户端 bundle 与桌面版同源，但桌面窗口本身未做截图级验收。

## 已知性能与限制

- 默认一次拉取 20 条；每条状态存放在正文元数据中，必须逐页读取正文，首次拉取约 20–30 秒。界面会显示同步时间，拉取期间不会叠加轮询。
- 历史页面的 slug 含中文/空格（如 `raw/sessions/…/dsh（DeepSeek/无/…`），已按 Unicode 安全段支持；仍拒绝 `..`、空段、控制字符与超长。
- 旧页面没有该插件的摘要与状态元数据时按 active 显示，并提示“旧记录没有续接摘要”。
- 创建续接仅限认证 GUI 用户操作，模型工具没有 `resume`，避免归档正文间接驱动新 agent。

## 安全与限制

- secret 正则是强制最低门槛，不保证识别所有秘密。命中后不得绕过或换通道外发。
- Notion 中旧页面没有插件元数据时按 `active` 可见性显示；这不表示源 DSH 会话正在运行。
- slug 幂等依赖 query → patch/create，Notion 没有唯一约束；重复 slug 被视为冲突。多设备同时首次创建仍需要单写者协调。
- `archived` 既有 Notion 属性保留原归档语义；插件可见性放在带版本的正文 JSON 块中。筛选需读取正文元数据，因此后台列表上限默认 30。
- 续接是有损、带 provenance 的上下文交接，不是 event-log replay。新会话必须重新核验文件、命令结果和工作区状态。
- 自动同步只拉取，不自动打开窗口，也不自动上传所有 DSH 会话。

开发细节和状态机见 [DESIGN.md](DESIGN.md)。
