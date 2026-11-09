# 04 · 追改与协调消息（提示词迭代记录）

Agent Teams 的质量并不只来自第一次 spawn prompt，更来自**集成阶段的追改消息**。下面是这次会话中最有代表性的 prompt/steering 记录（时间均为 2026-11-08 夜 ~ 11-09 凌晨，CST；本机绝对路径已泛化）。

## 1. 跨模块挂点协调：bunting 与旗杆

**effects → Lead**
> 1) BUNTING OVERLAP: my brief says bunting across the old-town street and town's task also says "animated flags/bunting/fountain". To avoid double bunting, I'll only build street bunting if town does NOT register anchor endpoints. If town builds bunting itself, please have it register `K.anchor('buntingA', ...)` / `buntingB`; if not, I'll place mine at fallback coords.
> 2) Anchors I read for effects (all optional, graceful fallbacks): shipFunnel, tugFunnel, locoStack, bakeryChimney, lighthouseLamp, peninsulaBeacon, flagpoleQuay ... plus refined shipMast, buoyGreen/Red, craneTips, buntingA/B.

**Lead → effects**
> Plan approved. Build bunting only if both anchors are absent at build time; all other anchors optional with fallbacks. Keep the night beam/smoke subtle enough that the hero view stays readable; register no labels.

**Lead → town**
> If YOUR town build includes street bunting, register both endpoints as `K.anchor('buntingA', {pos})` and `buntingB`, and keep building the bunting yourself. Effects will skip its fallback bunting when those anchors exist.

结果：town 注册了 buntingA/B，effects 跳过 fallback；旗杆由 effects 补一根 slim dynamic mast。

## 2. 第一轮 QA 基线（verifier → Lead）

> 34 pass / 3 warn / 2 fail … Failures are transient: town.js was saved mid-run. …
> P1 mobile portrait framing crops the model badly — 430×900 with default dist 51 + vfov 30 shows only ~13 units width vs 31-unit world. Suggest portrait camera fit.
> P2 Fraunces is loaded but unused; `?labels=1` parsed but never applied; docs/LAYOUT default camera stale.

**Lead 修复（main.js / ui.js / style.css / docs）：**
- 增加 `fitDistance(fov, aspect)` 与 `adaptCamera()`：portrait 用 40° FOV + 0.8 仰角 + 自动 fit；`maxDist` 随 fit 扩展；landscape 保持 30°。
- `ui.init` 中消费 `P.config.labels`，让 `?labels=1` 真正生效。
- 把 `.brand .en` 切到 Fraunces（Latin display），使其不再空载。
- 更新 LAYOUT 的默认相机参数。
- 后续又把 fog near/far 推到轨道距离之外，避免手机端远距离被雾洗白；移动端关闭移轴模糊、降低 bloom。

## 3. 「黑色四边形 / 洋红」排查（一次错误归因与纠正）

**town → Lead**
> effects.js `Points` render as LARGE OPAQUE BLACK SQUARES ... raycast returns Points + ShaderMaterial ...

**Lead 初判**
> 用 headed Chrome 复测后，现象消失；可能 headless SwiftShader 问题，暂缓修 effects 的 Points。

**terminal-yard → Lead**
> both were mine, now fixed：黑色四边形 = 动画吊机/场桥 cable rig 手工 BufferGeometry 没有 normal、却用了 MeshStandardMaterial；洋红 = 用 K.mix() 在 packed hex 上做数值混色导致 channel carry。已改 MeshBasicMaterial + K.mixHex。

**Lead 纠正（verifier）**
> 纠正我的上一条：artifacts 确实是 terminal 的真实代码 bug（missing normals + numeric mix），headless 和 headed 在修复后都干净。继续保留 artifact checks。

**教训**：在没有隔离模块之前，不要过快把跨模块视觉 bug 归因于渲染器/环境。

## 4. 地形浮块与越界

**Lead → terrain-civils**
> 两个 `batch:matte` 点簇在 plinth 外：(20.1,0.66,15.0) 和 (-21.1,0.61,8.7)，看起来是未缩放/未旋转的 scatter 或 double-translate。

**verifier** 进一步扫描：
> 0 stray verts >18.5 is now the gate; two clusters at r=22–25; also ~2797 verts at r≈17 near the back row.

**terrain-civils 修复**
> 根因是 2 个 `K.prism` 传入了世界坐标点又叠加了位置 → double translate；修复为 local points，扫描 batch 顶点 r>15.45 为 0。另外把所有 ground geometry（rail/back road/pad joints/apron/crane rails）按 `pointInLand` 裁掉，因此 NE 角 rail 以 buffer stop 收尾，east road/level crossing 被跳过。
> 还发现 town 标注的广场/长椅/花坛在 island polygon 外，已删除/搬迁。

## 5. 灯塔光束：昼夜门控与「暗楔」

**Lead → effects**
> 灯塔光束在白天可见（day-east 有半透明白色锥体）。请用 P.env.mix 平滑门控，白天严格 0。

**Lead → effects（夜间暗楔）**
> 夜间 hero 中出现大的灰/橄榄色暗楔，从灯塔延伸到 plinth rim/gallery floor；additive haze 在亮木底座上会被感知为变暗。建议 beam 长度 16 → 8–9，尾部 30–40% 淡出，opacity ↓，并裁剪到水体/港池内，不允许越过木底座。

**effects 最终实现**
> additive shader cone、长度 9、径向水体 clip r≈13.3–15.3、白天严格 0、near/camera fade；夜间 QA 的 `night-beam-darkening` 通过。

## 6. 海鸥尺度

**Lead → effects**
> 海鸥太大，hero 里像 15–20 m 的纸飞机。1:1000 真实翼展应极小；压到 0.06–0.08 units 总翼展（最多 2 只 charm bird 0.2）。

**effects 最终实现**
> 8 flying + 4 perched，wingspan ≈0.11–0.16，hero 距离下读作小点，近景才像鸟。

## 7. 船队与浮桥冲突

**fleet → Lead**
> 若 heading π/2，渔船会与 pontoon footprint 重叠；boat 3 (layout z=2.25) 在 pontoon 内。

**Lead → fleet/terrain** 协调后：
- boat 3 移到 (-7.64, 1.95)，贴着 pontoon 外侧。
- terrain 重新裁剪 pontoon 与 gangway；town 把鱼市改成窄棚，避开 gangway。
- fleet 从 `PORT.anchors.quayBollards` 读取真实系缆柱位置。

## 8. fleet / terminal / terrain / town 完成后的 gate

**Lead → verifier**
> All modules are final. Run formal final QA now: full matrix headless + headed gallery; save `shots/final/`; confirm no page errors, buildErrors [], floating scan, labels, mobile framing, postcard layout, day beam invisible, night no dark wedge; perf ≥55 fps @1600×1000 dpr1.5.

**verifier 最终**
> 66 pass · 3 warn · 0 fail · 0 skip；60 fps day/night；325 calls；489,466 tris；14,263 parts；ANGLE Metal M4 Pro。
> Warnings: draw calls 325 vs 220 target ×2；mobile post contrast 0.71×（bloom veil）。
> Recommendation: SHIP.

## 9. 三个非阻塞 warning 的处理决定

- 绘制调用 325：在 60 fps 下达标；进一步合批会动到 world 模块，收益低、回归风险高，**不修**。
- 移动端后期对比度：已关闭移动端移轴并降低 bloom；QA 的 0.749 指标仍低于 0.85 阈值，但视觉可接受，记录在案。
- 所有 warning 都写入 `docs/CRITIQUE.md` 的后续建议，不阻塞交付。

## 可复用经验

1. **先契约后 spawn**：没有共享坐标/合批 API，多智能体必然各写各的。
2. **截图是团队共同语言**：所有 builder 用同一 `tools/shot.mjs`，每个结论都有图。
3. **模块隔离**：先 `--skip` 其它模块复现，再定位 owner；避免在群里互相猜。
4. **Lead 只做集成与审美**：世界细节交给 owner；Lead 集中调水体/镜头/后期/UI/验收。
5. **跨模块用 anchor 解耦**：烟囱、灯、旗、bunting 都通过 `PORT.anchors` 挂接。
6. **QA 工具要机器可读**：最终 report.json + 截图矩阵比人工目测可靠。
