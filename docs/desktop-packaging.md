# Electron 桌面应用打包指南

## 开发预览
- 安装依赖：在仓库根目录执行 `pnpm install`，首次安装后运行 `pnpm approve-builds electron` 允许 Electron 安装脚本。
- 启动前端调试服务器：`pnpm --filter web dev`（默认监听 `http://localhost:5173`）。
- 在新的终端窗口运行桌面端：`pnpm --filter desktop dev`，Electron 会自动打开并加载上述地址。

## 生产打包
- 生成渲染进程静态文件并复制到桌面项目：`pnpm --filter desktop bundle`。
- 打包不同平台安装包：
  - 仅生成未签名应用目录：`pnpm --filter desktop pack`。
  - 生成完整安装包（macOS dmg、Windows NSIS、Linux AppImage）：`pnpm --filter desktop dist`。
- 打包产物默认输出在 `apps/desktop/release`。

## 常见说明
- `apps/desktop/scripts/prepare-renderer.cjs` 会自动先执行 `pnpm --dir apps/web build`，确保渲染进程使用最新构建结果。
- Electron 入口文件位于 `apps/desktop/main.js`，生产环境会加载 `apps/desktop/renderer/index.html`；开发环境通过 `VITE_DEV_SERVER_URL` 连接 Vite 调试服务器。
- 如需自定义窗口尺寸或系统托盘等原生功能，可在 `main.js` 中扩展 Electron 主进程逻辑。
