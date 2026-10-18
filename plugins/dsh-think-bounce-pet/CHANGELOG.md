# Changelog

## 0.1.1 — 2026-10-19

- 修复 macOS 桌面端安装插件后窗口顶栏（标题栏）无法拖动的问题：
  - 漂浮层改用 `display: contents`，不再生成 body 级全窗口盒子，不参与
    `-webkit-app-region` 合成；
  - 球改用 `position: fixed`，视口坐标与原来的全屏层一致；
  - 球只在压住 `[data-window-drag]` 拖拽行时临时声明 `no-drag`，离开即撤销；
  - 标记变化或标记中的球移动时脉冲 `body[data-window-drag-recall]`，让 Electron
    重新收集拖拽矩形（electron#32341）。
- 新增 `tests/drag-guard/` 无头浏览器回归测试，复刻 DSH darwin 的 app-region
  合成规则，验证「顶栏其余位置始终可拖、球自身仍可点击」。
- README 增加「macOS 窗口拖拽」说明；版本 0.1.0 → 0.1.1。

## 0.1.0 — 2026-08-24

- 初始版本：常驻球与思考球、点击拍飞与拖拽投掷、鼠标碰撞、重力、
  初速度/碰撞损耗/摩擦力/球体大小等实时设置。
