# 车载 CAN 总线实时显示系统

基于 DBC 文件的车载信息实时显示系统，支持 SocketCAN、虚拟 CAN、回放和模拟多种数据源。

## 技术栈

- **后端**: Node.js 20+、TypeScript、ESM、WebSocket、SQLite、Drizzle ORM
- **前端**: React 18、TypeScript、Vite、ECharts、Zustand、Tailwind CSS
- **数据库**: SQLite (better-sqlite3)
- **架构**: Monorepo (pnpm workspace)

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 转换 DBC 文件

首先需要将 DBC 文件转换为 JSON 格式：

```bash
# 安装 Python 依赖
pip install cantools

# 转换 DBC 文件
python3 scripts/dbc-to-json/dbc-to-json.py AutoCtrl_V10_28.dbc dbc/vehicle.json
```

### 初始化数据库

```bash
pnpm db:push
```

### 启动开发服务器

```bash
pnpm dev
```

这将同时启动：
- 后端服务: http://localhost:3000
- 前端应用: http://localhost:5173
- WebSocket 服务: ws://localhost:8080

## 配置

复制 `env.example` 为 `.env` 并修改配置：

```env
DATA_MODE=mock          # socketcan|vcan|replay|mock
CAN_IFACE=can0          # can0|vcan0
WS_PORT=8080             # WebSocket 端口
HTTP_PORT=3000          # HTTP API 端口
DB_PATH=./data/telemetry.db
REPLAY_FILE=./samples/replay.json
DBC_JSON=./dbc/vehicle.json
LOG_LEVEL=info
```

## WSL vcan 测试

> **⚠️ WSL2 限制**: 在 WSL2 中，Linux 内核是精简版本，通常不包含 `vcan` 内核模块。如果遇到 `modprobe: FATAL: Module vcan not found` 错误，请使用以下替代方案：
> 
> - **推荐**: 使用 `mock` 模式进行开发测试（见下方）
> - 或者: 使用 `replay` 模式回放历史数据
> - 或者: 在物理 Linux 系统或完整版 Linux 虚拟机中进行 vcan 测试

### 1. 安装 can-utils

```bash
sudo apt update
sudo apt install can-utils
```

### 2. 创建虚拟 CAN 接口（仅在支持 vcan 模块的系统中）

```bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
```

如果 `modprobe vcan` 失败（如 WSL2），请跳过此步骤，改用 mock 或 replay 模式。

### 3. 配置并运行

设置 `.env`:
```env
DATA_MODE=vcan
CAN_IFACE=vcan0
```

运行 `pnpm dev`，然后在另一个终端测试发送数据：

```bash
# 发送测试消息
cansend vcan0 320#1234567890ABCDEF

# 接收消息
candump vcan0
```

## Mock 模式测试（适用于 WSL2 开发）

Mock 模式会根据 DBC 文件自动生成模拟的 CAN 数据，非常适合在无法使用 vcan 的环境中（如 WSL2）进行开发和测试。

### 配置

设置 `.env`:
```env
DATA_MODE=mock
DBC_JSON=./dbc/vehicle.json
```

Mock 模式会：
- 自动读取 DBC 文件中定义的所有消息
- 按照每个消息的周期时间（`GenMsgCycleTime`）定期发送模拟数据
- 信号值在定义的 `min` 和 `max` 范围内随机生成
- 完全不需要 CAN 接口，可在任何环境中运行

运行 `pnpm dev` 即可开始接收模拟数据。

## 回放测试

将 `DATA_MODE=replay`，确保 `REPLAY_FILE` 指向有效的 JSON 回放文件。回放文件格式：

```json
[
  {"timestamp": 0, "id": 320, "data": [0x00, 0x01, ...]},
  {"timestamp": 100, "id": 321, "data": [...]}
]
```

## 实车部署 (Orin Ubuntu 20.04)

### CAN 配置要求

- **协议**: CAN 2.0A (标准帧)
- **模式**: Motorola (大端模式，低地址代表高字节)
- **周期**: 遥控器 50ms，VCU 100ms
- **速率**: 500Kbps
- **接口**: can0

### 1. 配置 CAN 接口

```bash
sudo ip link set can0 down
sudo ip link set can0 type can bitrate 500000
sudo ip link set can0 up
```

### 2. 配置文件

设置 `.env`:
```env
DATA_MODE=socketcan
CAN_IFACE=can0
```

### 3. 系统服务化

#### 使用 systemd

创建 `/etc/systemd/system/can-telemetry.service`:

```ini
[Unit]
Description=CAN Telemetry Service
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/project
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl enable can-telemetry
sudo systemctl start can-telemetry
```

#### 使用 PM2

```bash
npm install -g pm2
cd apps/server
pm2 start dist/index.js --name can-telemetry
pm2 save
pm2 startup
```

## API 文档

### REST API

#### GET /api/snapshot
获取当前信号快照

```
GET /api/snapshot?signals=VCU_VehSpeed,VCU_BatSOC
```

#### GET /api/history
获取历史数据

```
GET /api/history?signals=VCU_VehSpeed&from=2024-01-01T00:00:00Z&to=2024-01-01T01:00:00Z&step=1s
```

#### POST /api/can/send
发送 CAN 帧

```json
{
  "id": 262,
  "data": [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]
}
```

### WebSocket

连接到 `ws://localhost:8080`，发送订阅消息：

```json
{
  "type": "subscribe",
  "topics": ["realtime/*"]
}
```

接收数据格式：
```json
{
  "topic": "realtime/VCU_Info1",
  "data": {
    "msgId": 320,
    "name": "VCU_Info1",
    "timestamp": 1234567890,
    "values": {
      "VCU_VehSpeed": 45.5,
      "VCU_BatSOC": 85.0
    },
    "raw": "...",
    "healthy": true
  }
}
```

## 功能特性

### 后端
- ✅ 多数据源支持 (SocketCAN/vcan/replay/mock)
- ✅ DBC 文件解析与信号解码
- ✅ LifeCnt 溢出检测
- ✅ XOR Checksum 校验
- ✅ SQLite 数据存储与聚合
- ✅ WebSocket 实时推送
- ✅ REST API 历史查询
- ✅ CAN 帧发送支持

### 前端
- ✅ 实时仪表盘（车速、转速、SOC、燃料）
- ✅ 发动机信息页面
- ✅ VCU 信息页面
- ✅ ISG 信息页面
- ✅ 液压系统页面
- ✅ 告警状态页面
- ✅ 信号浏览器
- ✅ 控制面板（接管、速度/油门控制、模式切换）

## 故障排查

### SocketCAN 库不可用

如果 `socketcan` 库安装失败，系统会自动降级使用 TODO 标记，但保持接口稳定。可以：
1. 使用 vcan 模式测试
2. 使用 mock 模式开发
3. 使用 replay 模式回放数据

### 数据库初始化失败

确保 `data/` 目录存在且有写权限：
```bash
mkdir -p data
chmod 755 data
```

### WebSocket 连接失败

检查防火墙和端口占用：
```bash
sudo netstat -tlnp | grep 8080
```

### DBC 文件解析错误

确保已正确转换 DBC 文件，检查 JSON 格式是否正确。

## 开发

### 项目结构

```
.
├── apps/
│   ├── server/          # 后端服务
│   │   └── src/
│   │       ├── can/     # CAN 数据源
│   │       ├── dbc/     # DBC 解析
│   │       ├── decoder/ # 解码器
│   │       ├── pipeline/# 数据流水线
│   │       ├── db/      # 数据库
│   │       └── api/     # API 层
│   └── web/             # 前端应用
│       └── src/
│           ├── pages/   # 页面组件
│           ├── components/ # UI 组件
│           └── stores/  # 状态管理
├── packages/
│   └── common/          # 共享代码
└── scripts/
    └── dbc-to-json/     # DBC 转换脚本
```

### 添加新信号

1. 更新 DBC JSON 文件（或重新转换 DBC）
2. 前端会自动显示新信号（通过信号浏览器）
3. 如需在特定页面显示，编辑对应的页面组件

## 许可证

MIT

