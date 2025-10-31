# WebSocket 连接故障排查指南（Orin Ubuntu 20.04）

本文汇总了在 Orin 设备（ARM64、Ubuntu 20.04）上排查 WebSocket 无法连接的完整流程，覆盖前后端都在 `localhost` 场景以及通过局域网访问的情况。按章节执行即可定位绝大多数问题。

---

## 1. 基础环境检查

1. **Node 版本**：`node -v` 应 ≥ 20；若低于要求请升级。
2. **依赖完整性**：在项目根目录执行 `pnpm install`，确认 `apps/server` 与 `apps/web` 所需依赖均安装。
3. **.env 配置**（默认开发模式）：
   ```env
   DATA_MODE=mock
   WS_PORT=8080
   HTTP_PORT=3000
   LOG_LEVEL=debug          # 排查阶段建议切换为 debug，完成后改回 info
   ```
4. **端口未被占用**：`sudo ss -tlnp | grep -E '3000|8080'`，若已有其他进程占用需先停止或更换端口。

---

## 2. 启动顺序与日志定位

1. **启动服务**：
   ```bash
   pnpm --filter server dev
   pnpm --filter web dev -- --host 0.0.0.0
   ```
   两个进程建议在不同终端运行。

2. **服务器日志**：后端采用 Pino，日志会同时输出到终端与 `logs/server.log`。`LOG_LEVEL=debug` 时可看到：
   - `WebSocketServer created`：服务端监听成功
   - `WS client connected`：握手成功（新增日志包含 `origin`/`path`/`userAgent`）
   - `WS subscribe handled`：前端订阅主题确认

3. **前端浏览器控制台**：
   - `Attempting to connect WebSocket`：发起连接
   - `WebSocket connected`：连接成功
   - 若报错，记录完整错误信息（代码、reason、地址）。

---

## 3. 单机 `localhost` 自检流程

> 目标：确认在同一台 Orin 设备上运行前后端时 WebSocket 可以成功握手。

1. 启动后端 `pnpm --filter server dev`，看到 `WebSocket heartbeat started` 即可。
2. 运行诊断脚本（新增）：
   ```bash
   pnpm --filter server ws:diagnose             # 默认连 ws://localhost:8080/
   pnpm --filter server ws:diagnose ws://127.0.0.1:8080 realtime/* realtime/overview
   ```
   预期输出：
   - `[ws-diagnose] Connection established.`：连接成功
   - `Message #`：收到实时数据（mock 模式会快速返回）
3. 启动前端 `pnpm --filter web dev -- --host 0.0.0.0`，在设备本地浏览器访问 `http://localhost:5173/`。
4. 浏览器控制台应看到 `WebSocket connected`，后端日志同步出现 `WS client connected`。
5. 如果诊断脚本成功而浏览器失败，重点检查浏览器代理或扩展；如脚本也失败，继续第 5 节网络排查。

---

## 4. 跨设备访问常见坑位

当在开发机浏览器访问 `http://<orin-ip>:5173` 时，需注意以下配置：

1. **明确 WebSocket 目标地址**：浏览器的 `localhost` 指向开发机而非 Orin，需要在前端设置 `VITE_WS_URL`。
   ```bash
   # apps/web/.env.development 或执行前设置
   export VITE_WS_URL=ws://<orin-ip>:8080/
   pnpm --filter web dev -- --host 0.0.0.0
   ```
   查看浏览器控制台确认打印 `Using VITE_WS_URL: ws://<orin-ip>:8080/`。

2. **端口转发 / 防火墙**：
   - 确保 Orin 的 8080 端口对局域网开放：`sudo ufw allow 8080/tcp`
   - 如果通过 VPN/4G 模块，请确认运营商未拦截 8080 端口，必要时改用 80/443 并增加反向代理。

3. **代理或反向代理**（如 Nginx）：
   - 需要显式开启 `proxy_set_header Upgrade $http_upgrade;` 与 `Connection "Upgrade";`
   - `proxy_http_version 1.1;` 以支持 WebSocket 升级。

4. **多网卡环境**：`hostname -I` 查看实际出口 IP，确认前端连接到正确子网地址。

---

## 5. 网络层连通性检查

按顺序执行，任何一步失败都要先解决再继续：

1. **基本连通**：
   ```bash
   ping <orin-ip>         # 在外部电脑执行
   ping <client-ip>       # 在 Orin 上执行
   ```

2. **端口可达性**：
   ```bash
   # 外部电脑测
   nc -vz <orin-ip> 8080
   nc -vz <orin-ip> 3000
   ```

3. **抓包观察握手**（高级排查）：
   ```bash
   sudo tcpdump -ni any port 8080
   ```
   观察是否有握手包到达及回应。

4. **系统时间同步**：若握手后立即断开，可检查两端时间差异（JWT/签名场景），执行 `timedatectl status`。

---

## 6. 常见问题与解决建议

- **报错 `ECONNREFUSED` / `ERR_CONNECTION_REFUSED`**  
  检查服务是否启动、端口是否开放、诊断脚本是否能连通。如端口被占用，调整 `.env` 中 `WS_PORT` 并重启服务。

- **浏览器报 `WebSocket closed: code 1006`**  
  通常是握手被中间层（代理/防火墙）终止。使用 `tcpdump` 确认是否有 RST 包，必要时抓包定位。

- **只在车载端失败，PC 正常**  
  可能是车载系统的 `NetworkManager`/防火墙策略或 DNS 解析导致。建议在车载端直接浏览器访问 `http://localhost:5173` 验证，逐步排除网络差异。

- **后端未打印 `WS client connected`**  
  说明握手未进入业务层，重点关注端口监听、Vite 代理配置以及 `VITE_WS_URL` 设置。

- **心跳超时**  
  查看 `WS heartbeat started` 的间隔日志，心跳默认 10s；若客户端 30s 内未回 `pong` 会被断开。排查客户端是否阻塞或页面休眠。

---

## 7. 生产/服务化场景建议

1. **使用 systemd 管理服务**：在 `ExecStart` 前设置 `Environment=WS_PORT=8080 HTTP_PORT=3000`.
2. **日志收集**：`journalctl -u can-telemetry.service -f` 结合 `logs/server.log` 双线排查。
3. **健康检查**：可通过 `curl http://localhost:3000/api/health`（如已实现）判断 HTTP 服务状态，配合 `pnpm --filter server ws:diagnose ws://localhost:8080` 定期自检。
4. **静态前端部署**：`pnpm --filter web build` 后使用 Nginx/Express 静态服务时，务必把 `/ws` 路径代理到 `ws://localhost:8080` 并保留升级头。

---

执行完以上步骤仍无法解决时，请收集以下信息反馈：

1. 前端控制台完整报错（含 code、reason、URL）
2. 后端 `logs/server.log` 中从启动到失败的日志
3. `pnpm --filter server ws:diagnose <url>` 的输出
4. `sudo ss -tlnp` 和 `sudo ufw status` 结果

这些信息可以快速定位问题根因并制定进一步的修复方案。
