# QA · 验收记录

- `report.json` — 最终自动验收（headless Chrome / ANGLE Metal），66 pass / 3 warn / 0 fail。
- `../source/tools/` — 本次使用的截图与 QA 工具（与原项目 tools/ 相同）：
  - `shot.mjs` — 单张无头截图 + 控制台错误 + 性能
  - `qa.mjs` — 多场景矩阵（day/night/labels/mobile/interaction/postcard）
  - `qa-sheet.py` — 接触表生成
  - `lib/cdp.mjs` — CDP 封装

这些工具需要 Node 26+ 和本机 Chrome；路径为相对当前项目根目录使用。
完整 QA 文档在 `../docs/QA.md` 与 `../docs/CRITIQUE.md`。

运行方式（在 `source/` 下）：

```bash
node tools/shot.mjs --out shots/hero.png --w 1600 --h 1000 --dpr 1.5
node tools/qa.mjs
```
