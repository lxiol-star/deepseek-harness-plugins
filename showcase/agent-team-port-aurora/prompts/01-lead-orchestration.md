# 01 · Lead 编排方案

> 这次会话没有给 Lead 单独发一条 spawn prompt；Lead 直接在主会话里完成侦察、脚手架、分工、集成与验收。下面是当时实际执行的编排方案（事后整理），可作为复现同一类「Agent Team 复杂视觉产物」任务的模板。

## 目标

在 `<workspace>/miniature-port` 交付一个**可自由旋转、超高精度、符合审美**的微型港口互动网页；离线可双击打开；必须通过真实浏览器截图验收；使用 Agent Teams 协作。

## 关键侦察结论

1. 候选 skill `anatomy` 的主路径是等距 SVG 装置图，其 3D 模式是「图中部件转动」而非自由相机环绕，不适合「可自由旋转的整座港口」。因此**借鉴其工艺标准**（模型感、部件词汇、色调层级、克制动效），但实现选用 Three.js WebGL。
2. 本机有可用的 Three.js r160 UMD 构建与 Fraunces / DM Mono 字体（来自已有 `3d-web/pelican-ride`），可直接 vendor，保证离线。
3. 无 npm / 构建步骤：**原生 classic script + 全局命名空间**，避免 file:// 下 ES module CORS 问题。
4. 验收必须是截图驱动：headless Chrome + CDP（Node 26 自带 WebSocket），无 Playwright/Puppeteer 依赖。

## 架构决策

- **尺度**：1 world unit = 10 m；底座半径 15.6；水面 y=0；码头甲板 y=1.1。
- **数据契约**：`js/layout.js` 是唯一坐标真源（海岸线多边形、码头、防波堤、道路、铁路、山丘、`heightAt`、分区、放置点、航线）。
- **静态合批**：所有静态小部件按 6 个材质桶合并为顶点色网格；集装箱/树/岩石等重复件使用 InstancedMesh。
- **动态对象**：`THREE.Group` + `PORT.addTick`；每个模块独立动画，不共享可变全局状态。
- **视觉系统**：`js/studio.js` 木底座 + 展厅 + 环境光 + 昼夜 practicals；`js/water.js` 自定义水体 + 半分辨率平面反射；`js/post.js` HDR → bloom → 移轴 → ACES → 分离色调 → 暗角/颗粒。
- **UI**：纸质/黄铜/墨水编辑设计；左侧 model dossier，右侧控件，图解 SVG 引线 + HTML 卡片。
- **质量门槛**：桌面 1600×1000 dpr1.5 下 ≥55 fps；零 console/page error；零 floated geometry；移动端完整构图。

## 阶段

### Phase 0 · 侦察（约 40 分钟）
- 读图片、确认任务；检查 anatomy skill（不采用其 SVG 主路径）。
- 检查本机 Three.js r160、字体、Chrome CDP 可用性。
- 搭最小 WebGL 冒烟测试；确定离线、无依赖方案。

### Phase 1 · 脚手架与契约（Lead 独占，~70 分钟）
- 建目录、vendor、`layout.js`（海岸线/高度场/分区）、`kit.js`（调色板、合批、图元、实例化、标签/统计 API）。
- 写 `docs/LAYOUT.md`（给所有 builder 的坐标地图）与 `docs/CONTRACT.md`（生命周期/写入边界/QA 命令）。
- 搭 `studio.js`（底座/展厅/灯光/昼夜）、`water.js`（水面+反射）、`post.js`、`ui.js`、`main.js`、`tools/shot.mjs`。
- 用占位世界 + 无头截图验证渲染链路（水面/反射/后期/加载）。

### Phase 2 · 并行建造（约 3 小时）
- 创建 6 个 team task（各自独立写文件 + 明确 QA 要求）。
- 同时 spawn 5 个 builder + 1 个 verifier：
  - `terrain-civils` → `js/world/terrain.js`
  - `terminal-yard` → `js/world/terminal.js`
  - `fleet` → `js/world/fleet.js`
  - `town` → `js/world/town.js`
  - `effects` → `js/effects.js`
  - `verifier` → `tools/`、`shots/`、`docs/QA.md`、`docs/CRITIQUE.md`
- 每个 builder 在独立文件里工作；Lead 继续打磨水体/灯光/UI/构图。共享文档与截图工具是唯一同步面。

### Phase 3 · 集成与追改（约 1 小时）
- 按 terrain → terminal → fleet → town → effects 顺序接线；`batch.finish` 后统一烘焙。
- 用多角度截图轮询；处理跨模块问题：
  - 终端电缆缺法线导致黑色四边形；`K.mix` 数值混色导致洋红（terminal 自修）。
  - 地形 `K.prism` 世界坐标重复平移导致底座外浮块；地形自修。
  - effects 灯塔光束夜间出现暗楔；改为短长度 + 径向水体裁剪 + 严格 night gating。
  - 海鸥尺寸过大；按 1:1000 缩到模型尺度。
  - 移动端横向 fit 距离过远 + 雾把模型洗白；提高 portrait 相机仰角、把雾推远、移动端关闭移轴模糊。
  - 重启服务器/刷新后标签不生效；把 `?labels=1` 接进 UI init。
  - 默认英雄构图、夜景 practicals、明信片版式反复调参。

### Phase 4 · 验收与打磨（约 1 小时）
- verifier 运行 `node tools/qa.mjs`：day/night/labels/mobile/interactions/postcard/offline/fonts/artifacts。
- 修复所有 P0/P1；3 个非阻塞 warning 记录在 `docs/CRITIQUE.md`。
- 最终：66 pass · 3 warn · 0 fail；60 fps day/night（1400×900 dpr1.25 与 1600×1000 dpr1.5）；325 draw calls；489k tris；14,263 parts。
- 产出 `shots/final/` 画廊、`postcard.png`、`aurora-harbour-standalone.html`。

### Phase 5 · 归档（本次请求）
- 在插件仓库 `lxiol-star/deepseek-harness-plugins` 新建 `showcase/agent-team-port-aurora/`。
- 保存可运行源码、单文件 dist、压缩画廊、完整 QA、以及本提示词档案。
- commit + push。

## Team 协作规则（写进 CONTRACT）

- **写作用域隔离**：每个 teammate 只改自己的一个 JS 文件；Lead 独占 `index.html/style.css/js/*.js (非 world)/tools 根`；verifier 只写 `tools/`、`shots/`、QA 文档。
- **共享坐标真源**：所有 builder 读同一个 `layout.js` 和 `heightAt`；不许私改布局。
- **所有静态件先入 batch**：builder 返回后统一 `finish`；动态对象用 tick。
- **每个模块自测**：无头截图 + 控制台检查 + `PORT.getPerf()`；至少 3 轮自审。
- **通过 Lead 转发 QA 问题**：verifier 只报告；Lead 分派给 owner；避免互相覆盖文件。
- **收集 anchor**：跨模块挂点（船烟囱、吊机顶、灯塔灯、bunting 端点）通过 `PORT.anchors` 暴露。

## 给复现者的建议

- 先写「坐标契约 + 合批 API」，再 spawn；否则 6 个智能体会各写一套坐标和材质。
- 先做**可截图的渲染壳**（底座/光照/水/后期），再让世界出现；每一轮都能截图评审。
- 把「水面反射/DOF/雾/移动 fit」当作相机系统的一部分统一调，不要让每个模块各自适配。
- 让 QA 变成可持续运行的工具（截图矩阵 + 机器可读 report），而不是人工目测。
- 保留每个 agent 的失败/返工信息；追改日志比一次性大 prompt 更有价值。
