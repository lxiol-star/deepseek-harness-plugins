# 上游与来源

- 上游仓库：[9livewolf/dsh-think-bounce-pet](https://github.com/9livewolf/dsh-think-bounce-pet)
- 许可证：MIT（见 `package.json` 的 `license` 字段；上游仓库未附带 LICENSE 文件，版权归上游作者）
- 收录基线：上游 `main` @ `3bfe9cb`（版本 0.1.0，2026-08-24）
- 本目录版本：`0.1.1`，在 0.1.0 基础上修复了 macOS 桌面端安装插件后窗口顶栏无法拖动的问题
  - 上游 PR：[9livewolf/dsh-think-bounce-pet#3](https://github.com/9livewolf/dsh-think-bounce-pet/pull/3)
  - 修复说明见插件 [README](README.md) 的「macOS 窗口拖拽」一节，回归测试见 [tests/drag-guard](tests/drag-guard/)
- 构建产物：上游仓库只提交构建后的 `lib/`（没有 `src/`），本仓库原样收录、不做二次构建；升级时以上游为准重新同步。
