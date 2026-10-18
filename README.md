# DeepSeek Harness Plugins

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的社区插件集合，由 [lxiol-star](https://github.com/lxiol-star) 维护。

这是独立社区项目，与 DeepSeek 官方没有隶属关系。

## 插件目录

| 插件 | 功能 | 状态 |
| --- | --- | --- |
| [dsh-session-board](plugins/dsh-session-board/) | 会话卡片看板、工作区树、DSH 归档同步、搜索筛选、可选 Wiki 归档提炼 | 实验性，已在 macOS Harness Dev 环境验证 |
| [dsh-think-bounce-pet](plugins/dsh-think-bounce-pet/) | 思考弹球桌宠：常驻球/思考球、拍飞与拖拽投掷、鼠标碰撞、重力与物理参数实时可调 | 上游 0.1.1，修复 macOS 窗口顶栏拖拽；收录社区插件（MIT），已在本地验证 |

每个插件放在 `plugins/<包名>/`，独立声明版本、入口、依赖与使用说明。后续可以继续在本仓库添加插件。

## 安装

从 [Releases](https://github.com/lxiol-star/deepseek-harness-plugins/releases) 下载所需插件的 `.tgz` 文件，在 DSH 的 **设置 → 插件 → 添加插件** 中选择本地包或填入绝对路径。

已有同名链接版时，先移除旧插件，再安装发布包。安装或升级后请完全退出并重新打开 DSH，让服务端和客户端代码保持一致。

也可通过支持 GitHub 子目录的 DSH 插件管理器安装指定版本：

```text
# 会话看板
github:lxiol-star/deepseek-harness-plugins#dsh-session-board-v0.2.1&path:/plugins/dsh-session-board
# 思考弹球桌宠
github:lxiol-star/deepseek-harness-plugins#dsh-think-bounce-pet-v0.1.1&path:/plugins/dsh-think-bounce-pet
```

请先阅读各插件的兼容性和外部依赖说明。会话看板的 Wiki 集成依赖用户自行提供的本地 Wiki 脚本与模型配置；基础看板功能不需要模型密钥。

## 开发与验证

当前插件构建使用单独的 DSH 源码仓库提供类型和构建工具。安装 Node.js 22.19+ 或 24+，在 DSH 仓库完成依赖安装和构建后：

```sh
cd plugins/dsh-session-board
export DSH_REPO=/absolute/path/to/deepseek-harness
npm run check
npm run build
npm pack --ignore-scripts
```

Python/Wiki 集成测试依赖 `python3`、`zstd` 和兼容的 `wiki-archive.py`，详见插件说明。未配置这些外部条件时，相关测试会明确跳过。

`dsh-think-bounce-pet` 收录的是上游构建产物（上游没有 `src/`），没有构建步骤；它的 macOS 窗口拖拽回归测试只需 `python3` 和一个 Chromium 系浏览器：

```sh
bash plugins/dsh-think-bounce-pet/tests/drag-guard/run.sh
```

## 贡献

欢迎通过 Issue 提交问题，提供 DSH 版本、操作系统、插件版本和复现步骤。分享日志前请移除密钥、个人路径和会话正文中的敏感信息。

修改运行源码后请同步构建产物，并运行相关检查。请不要提交个人配置、会话记录、Wiki 原文、依赖目录或本机调试截图。

## License

[Apache-2.0](LICENSE)。第三方依赖保留各自许可证。

`dsh-think-bounce-pet` 收录自上游 [9livewolf/dsh-think-bounce-pet](https://github.com/9livewolf/dsh-think-bounce-pet)（MIT，版权归上游作者），来源与版本记录见其 [UPSTREAM.md](plugins/dsh-think-bounce-pet/UPSTREAM.md)。
