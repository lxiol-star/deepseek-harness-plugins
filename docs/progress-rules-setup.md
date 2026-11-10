# dsh-progress-rules 配置说明（社区插件，非本仓库维护）

[`dsh-progress-rules`](https://github.com/Adamaik/dsh-progress-rules) 是第三方 MIT 插件（作者 Adamaik），
用来让 agent 在长任务里持续汇报进度。本文只记录它在 DSH 上的安装、配置项与本仓库的验证结论，
插件本体不 vendored 到本仓库。

## 安装

本仓库收录了上游 0.2.1 的未修改发布包（[plugins/dsh-progress-rules/](../plugins/dsh-progress-rules/)，来源见其 [UPSTREAM.md](../plugins/dsh-progress-rules/UPSTREAM.md)），并发布了带 tarball 的 tag：

```bash
dsh plugin --profile desktop add \
  https://github.com/lxiol-star/deepseek-harness-plugins/releases/download/dsh-progress-rules-v0.2.1/dsh-progress-rules-0.2.1.tgz
```

也可以直接用 npm 上的同名包：`dsh plugin --profile desktop add dsh-progress-rules@0.2.1`。

安装器会写入依赖，并把 `dsh-progress-rules` 追加到 profile 的 `dsh.profile.bundles`。
装完重启该 profile 生效。

## 两层机制

| 层 | 做什么 | 依赖 |
| --- | --- | --- |
| L1 | 往 system prompt 注入一段过程纪律（独立 section，`order` 10150，压缩删不掉、preset persona 遮不住） | 模型配合 |
| L2 | 每个 `agent/pre-step` 检查上一步有没有正文；连续 `everySteps` 个「只有工具调用」的步骤后，由 harness 注入一条提醒 | 不依赖模型记性 |

## 配置项

在 profile 的 `cordis.patch.yml` 里按 row id 覆盖（patch 语义是**整行覆盖**，要保留的键需一并写上）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `text` | 自带中文《过程纪律》 | L1 段落正文；置空即关闭该段 |
| `everySteps` | `5` | 连续多少个沉默步后注入一次提醒；`1` = 每步 |
| `reminder` | 自带一句 | L2 注入文本；置空即关闭兜底 |
| `enforce` | `true` | `false` = 只保留提示词，不做每步检查 |
| `name` | `user:progress-rules` | section 名 |
| `order` | `10150` | 段落在系统提示中的位置（Web Surface 10100 / persona 10200） |

## 示例配置

```yaml
- id: progress-rules
  name: dsh-progress-rules
  config:
    everySteps: 3
    enforce: true
    text: |
      ## 开口纪律（优先于其他风格偏好）

      约束的是什么时候开口，不改变任务做法。

      1. 需要查证或动手的请求，先用一句话说打算怎么做，再调工具。
      2. 查到关键线索就说一句（例如「找到了 XXX」），没线索就接着做，不必每个工具都报。
      3. 换方案之前先交代：原路走不通时，先说一句发现了什么、接下来改试什么。
      4. 从查证转到动手（改文件、执行命令）之前，说一句要做什么。
      5. 卡住时开口：需要我做决定，或同一件事试了两次仍不成立，就说出来，别自己硬扛。
      6. 结尾给结论：做了什么、结论是什么、下一步。不复述工具调用过程。
      7. 只为让用户知道进展说话，不为了凑次数说话。
    reminder: |
      （过程纪律）上一步只有工具调用、没有正文。请用一句话补齐：刚跑完 X，结论是 Y，下面去 Z。不要写成进度条复读。
```

## 验证记录（2026-11-10，Harness Dev3，DSH 0.2.2-alpha.3）

- L1 实测：多步任务（建目录 → 写 8 个文件 → 统计 → 删除，约 6–8 步）产出 4 段正文，
  形态为「动手前一句 → 阶段完成一句 → 下一步一句 → 结尾结构化结论」，未出现 3 步以上沉默。
- 卡住场景实测：提权被拒绝后，模型停止执行、说明原因、给出两个可选路径并询问，未尝试绕过。
- L2 实测：上述任务里未触发（模型持续说话，计数被清零）；用安装包做离线单测确认：
  连续第 3 个沉默步注入提醒，中间任一步有正文即清零。
- 版本注意：作者测试基线为 DSH `0.2.1-rc.2`；本仓库在 `0.2.2-alpha.3` 上加载正常，
  但 `everySteps`/提醒行为随宿主升级需回归。
- 与 `dsh-better-display` 互补：前者保证「有话说」，后者降低阅读成本（折叠过程、正文常显）。
- 与 `dsh-reasoning-only-guard` 冲突：后者会给静默轮补占位文本，使 L2 永远判定「说过话」，不要同装。
