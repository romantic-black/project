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

## Orin (Ubuntu 20.04, ARM64) 交叉构建

**需求**：在 x86_64 开发机上构建可在 Orin 车载终端（Ubuntu 20.04, ARM64）运行的 AppImage。

1. 确保开发机已安装 Docker，并拉取 `electronuserland/builder:20`（Node 20 基础镜像，避免 Node 22 与 `socketcan` 的兼容性问题）：
   ```bash
   docker pull electronuserland/builder:20
   ```

2. 在仓库根目录执行以下命令完成交叉构建（直接安装 pnpm@10.20.0，避免 `corepack` 旧版本的签名校验错误）：
   ```bash
   docker run --rm -t \
     -v "$PWD":/project \
     -w /project \
     electronuserland/builder:20 \
     bash -lc "
      npm install -g pnpm@10.20.0 && \
       pnpm install --filter desktop... --filter web... --filter @can-telemetry/common... && \
       pnpm --filter desktop dist:orin
     "
   ```
   - 仅安装桌面端相关依赖，避免 `socketcan` 在 x86_64 上编译失败导致流程中断。
   - `dist:orin` 会输出 `ARM64` AppImage 至 `apps/desktop/release/` 目录。

3. 典型产物名称：`apps/desktop/release/CAN Telemetry-<version>-arm64.AppImage`。

4. 将 AppImage 拷贝到 Orin 设备后：
   ```bash
   sudo apt update
   sudo apt install -y libfuse2  # AppImage 运行所需
   chmod +x CAN\ Telemetry-*-arm64.AppImage
   ./CAN\ Telemetry-*-arm64.AppImage
   ```

> **提示**：如果需要持久化安装，可将 AppImage 复制到 `/usr/local/bin/` 或创建桌面条目。

## 常见说明
- `apps/desktop/scripts/prepare-renderer.cjs` 会自动先执行 `pnpm --dir apps/web build`，确保渲染进程使用最新构建结果。
- Electron 入口文件位于 `apps/desktop/main.js`，生产环境会加载 `apps/desktop/renderer/index.html`；开发环境通过 `VITE_DEV_SERVER_URL` 连接 Vite 调试服务器。
- 如需自定义窗口尺寸或系统托盘等原生功能，可在 `main.js` 中扩展 Electron 主进程逻辑。
