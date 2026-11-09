# 源码说明 · Source

这是「微港 · Port Aurora」的可运行源码，与仓库中的 `../../dist/aurora-harbour-standalone.html` 同源。

直接双击 `index.html` 即可（离线；Three.js 与字体已随 `vendor/` 本地化）。
或者构建单文件版：

```bash
node build-standalone.mjs
# 输出 aurora-harbour-standalone.html
```

更完整的项目说明、截图、提示词与验收报告见上一层目录的 `README.md` 与 `prompts/`。
开发/QA 工具在 `tools/`（headless Chrome 截图、QA 矩阵、接触表生成），使用方法见 `../qa/README.md`。
