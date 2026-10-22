# 第三方来源与许可（Third-Party Notices）

`dsh-whale-effort` 的合并、移植与打包代码由本仓库以 **Apache-2.0** 发布（见 [LICENSE](LICENSE)）。本文件列出随包分发或用于设计的第三方成果、各自许可、用在哪里，以及必须随包保留的 MIT 许可全文。完整的上游版本与改动记录见 [UPSTREAM.md](UPSTREAM.md)。

## 一览

| 来源 | 许可证 / 版权 | 用在哪里 | 是否随包分发 |
| --- | --- | --- | --- |
| [HanaAyane/dsh-reasoning-effort](https://github.com/HanaAyane/dsh-reasoning-effort) v0.9.0 | MIT © 2026 HanaAyane | 原生模型选择器接入、档位选择与提交逻辑、鲸鱼娘跑者精灵图 `assets/chibi-runner-strip.png`、中英文案、配置指引与知识库、视觉基线 | **是**（改编后并入本插件源码与构建产物） |
| [yuhub233/dsh-effort-slider](https://github.com/yuhub233/dsh-effort-slider) v1.1.0 | MIT © 2026 yuhub233 | 能量皮肤 CSS、流体粒子引擎、Ultra 档与严格性策略、闪电编排策略、子代理 tok/s 计量、策略 chip、会话偏好状态模型 | **是**（改编后并入本插件源码与构建产物） |
| [Feather Icons](https://github.com/feathericons/feather) 的 `zap` 轮廓（SVG 路径 `M13 2 L3 14 h9 l-1 8 10-12 h-9 l1-8 z`） | MIT © 2013-2023 Cole Bemis | 闪电开关按钮的 SVG 路径（描边/渐变/电流效果都在该路径上实现） | 只有这一行路径字符串，不含 Feather 源码或字体 |
| [obra/superpowers](https://github.com/obra/superpowers) | MIT © 2025 Jesse Vincent / Prime Radiant | Ultra 与闪电策略正文的**设计参考**（派活纪律、验收与根因纪律）；未复制其 skill 文件 | **否**（仅参考，不分发源码） |
| [React](https://github.com/facebook/react) | MIT © Meta Platforms, Inc. and affiliates | 客户端半边的 UI 渲染，通过宿主的模块加载器以 peer 形式获取 | **否**（peer dependency，不打包） |
| [How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)（Anthropic，2025） | 文章（无代码许可） | 闪电策略中委派契约、规模阶梯与「多智能体约 15× token」的事实参考 | **否**（仅设计参考，正文自包含） |

## 上游 A：HanaAyane/dsh-reasoning-effort

```text
MIT License

Copyright (c) 2026 HanaAyane

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 上游 B：yuhub233/dsh-effort-slider

```text
MIT License

Copyright (c) 2026 yuhub233

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Feather Icons 的 `zap` 路径

```text
MIT License

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## obra/superpowers（仅设计参考，未分发）

Ultra 与闪电的策略条款参考了 [obra/superpowers](https://github.com/obra/superpowers)（MIT，Copyright (c) 2025 Jesse Vincent / Prime Radiant）的四个 skill：`dispatching-parallel-agents`、`subagent-driven-development`、`verification-before-completion`、`systematic-debugging`。本仓库**没有**复制其文件；策略正文是重新撰写并自包含的。上游 B 曾把这四个 skill 原样打包在其 `skills/` 目录中，本合并插件不包含该目录。若需要完整的 playbook，请从上游仓库自行获取，并遵守其 MIT 许可。

## React

React（MIT，Copyright (c) Meta Platforms, Inc. and affiliates）是宿主提供的 peer dependency：客户端半边通过 DSH 的模块加载器 `require('react')` 取得，不随本插件打包。

## 声明与致谢边界

- 本插件**不发起任何外部网络请求**，不含遥测，也不含上述任何项目的运行时依赖。
- 本插件的策略正文与视觉实现虽基于上述公开成果，但均为重新撰写/移植后的版本；如你认为某处署名不准确或希望移除引用，请在 [Issues](https://github.com/lxiol-star/deepseek-harness-plugins/issues) 提出。

## English summary

The merge, port and packaging code in this package is Apache-2.0. Two MIT upstreams are adapted and redistributed inside it: **HanaAyane/dsh-reasoning-effort v0.9.0** (native selector integration, effort-selection logic, chibi runner sprite, bilingual copy, guidance) and **yuhub233/dsh-effort-slider v1.1.0** (energy skins, fluid engine, Ultra tier and rigor policy, lightning orchestration policy, subagent tok/s, policy chip). The bolt path is Feather Icons `zap` (MIT © Cole Bemis). The policy design references **obra/superpowers** (MIT © Jesse Vincent), which is **not redistributed** here. React is a host-provided peer dependency and is not bundled. Full MIT texts for the redistributed portions appear above; versions, commits and the exact change inventory are in [UPSTREAM.md](UPSTREAM.md).
