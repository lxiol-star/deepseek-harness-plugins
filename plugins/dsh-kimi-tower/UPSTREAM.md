# 上游与来源

- 来源本地仓库：`~/project/code/github/dsh-kimi-tower`（本机独立仓库，无 remote；已原地保留为冻结快照，不再改写）
- 来源 commit：`4f3f07ade34c7898dfaa198550d58d8cf52e78ce`（`4f3f07a`，2026-11-20）
- 迁入时间：2026-11-23
- 迁入版本：`0.1.1`（来源仓库 `package.json` 为 `0.1.0`）
- 许可证：MIT；协议层移植自 Kimi Code（MIT），版权与来源详见 [NOTICE](NOTICE) 与 [LICENSE](LICENSE)

## 迁入范围

`git archive 4f3f07a` 导出的受跟踪树共 59 个文件；按收编约定排除 `.gitignore` 与
`package-lock.json`，实际复制 57 个文件，覆盖顶层条目：`LICENSE`、`NOTICE`、
`README.md`、`README.zh.md`、`cordis.patch.yml`、`docs/`、`icon.svg`、`lib/`、
`locale/`、`package.json`、`prompts/`、`scripts/`、`src/`、`test/`、`tsconfig.json`。

未复制来源仓库中未跟踪的 `node_modules/`、`.worktrees/`、`.DS_Store`，以及本仓库根
`.gitignore` 已覆盖的依赖目录与 `*.tgz`。`lib/` 是来源仓库跟踪的构建产物，安装包入口
依赖它，故原样收录。

## 与独立仓库的差异

除下列项外，源码、提示词、构建产物与来源 commit 一致：

1. `package.json` 的 `version` 从 `0.1.0` 改为 `0.1.1`（本仓库版本必须递增）；
2. `package.json` 新增 `scripts.check`：`npm run typecheck && npm test`；
3. `package.json` 的 `files` 数组补 `CHANGELOG.md`，随发布包分发；
4. `package.json` 的 `dsh` 对象补 `"manifestVersion": 1`；
5. 新增本目录 `CHANGELOG.md`（0.1.1 条目）；
6. 新增本文件 `UPSTREAM.md`；
7. 根 `README.md` 插件目录表新增 `dsh-kimi-tower` 行，安装代码块新增 github 子目录安装示例。

来源仓库的 `.gitignore` 与 `package-lock.json` 未随迁（根 `.gitignore` 已覆盖
`node_modules/` 与 `*.tgz`）。

上游协议层来源仍以 [`plugins/dsh-kimi-tower/NOTICE`](NOTICE) 为准（Kimi Code，MIT）。
