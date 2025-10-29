# 车载 Orin 设备部署指南

本指南适用于在 **Ubuntu 20.04 + JetPack 5.1.2** 的 NVIDIA Jetson Orin 设备上部署 CAN 总线实时显示系统。

## 系统要求

- **操作系统**: Ubuntu 20.04
- **硬件平台**: NVIDIA Jetson Orin
- **JetPack 版本**: 5.1.2
- **架构**: ARM64 (aarch64)
- **CAN 接口**: can0（已配置 500Kbps）

## 前置准备

### 1. 检查系统信息

```bash
# 检查系统架构
uname -m  # 应该输出 aarch64

# 检查 Ubuntu 版本
lsb_release -a

# 检查 CUDA/JetPack 版本
cat /etc/nv_tegra_release
```

### 2. 更新系统包

```bash
sudo apt update
sudo apt upgrade -y
```

## Node.js 安装

### 方案一：使用 NodeSource 官方仓库（推荐）

```bash
# 安装 Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应该 >= v20.0.0
npm --version
```

### 方案二：使用 nvm（便于版本管理）

```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载 shell
source ~/.bashrc

# 安装 Node.js 20
nvm install 20
nvm use 20
nvm alias default 20

# 验证
node --version
```

**⚠️ 常见问题**：
- **问题**: `npm` 命令找不到
- **解决**: 确保 Node.js 安装包含 npm，或使用 `sudo apt-get install npm`

## pnpm 安装

```bash
# 使用 npm 安装 pnpm（全局安装）
sudo npm install -g pnpm

# 或者使用官方安装脚本
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc

# 验证安装
pnpm --version
```

**⚠️ 常见问题**：

1. **问题**: `pnpm: command not found`
   - **解决**: 
     ```bash
     export PATH="$HOME/.local/share/pnpm:$PATH"
     # 或添加到 ~/.bashrc
     echo 'export PATH="$HOME/.local/share/pnpm:$PATH"' >> ~/.bashrc
     source ~/.bashrc
     ```

2. **问题**: 权限错误
   - **解决**: 使用 `sudo` 或配置 npm 全局目录权限：
     ```bash
     mkdir ~/.npm-global
     npm config set prefix '~/.npm-global'
     echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
     source ~/.bashrc
     ```

## Python 和依赖

### 安装 Python 3

```bash
# Ubuntu 20.04 默认已安装 Python 3.8，验证：
python3 --version

# 如果需要更新版本（可选）
sudo apt install python3.9 python3.9-venv python3-pip -y
```

### 安装 cantools（DBC 转换工具）

```bash
pip3 install cantools
# 或使用用户安装（推荐）
pip3 install --user cantools

# 验证
python3 -c "import cantools; print(cantools.__version__)"
```

**⚠️ 常见问题**：
- **问题**: `pip: command not found`
  - **解决**: `sudo apt install python3-pip`
- **问题**: 权限错误
  - **解决**: 使用 `--user` 标志或 `sudo`

## 系统依赖（编译原生模块需要）

安装编译工具和系统库，这些是编译 `better-sqlite3` 等原生模块所必需的：

```bash
sudo apt install -y \
  build-essential \
  python3-dev \
  git \
  curl \
  wget

# 对于 better-sqlite3 需要 SQLite 开发库
sudo apt install -y \
  libsqlite3-dev
```

**⚠️ 常见问题**：
- **问题**: 编译 `better-sqlite3` 失败，提示找不到 sqlite3.h
  - **解决**: 安装 `libsqlite3-dev`
- **问题**: 编译失败，提示缺少编译器
  - **解决**: 安装 `build-essential` 和 `python3-dev`

## CAN 工具安装

```bash
# 安装 can-utils（用于测试和调试）
sudo apt install -y can-utils

# 验证
which cansend
which candump
```

## 项目部署

### 1. 获取项目代码

```bash
# 如果在 Git 仓库中
git clone <repository-url>
cd project

# 或直接复制项目文件到目标目录
# 例如: /opt/can-telemetry
sudo mkdir -p /opt/can-telemetry
sudo chown $USER:$USER /opt/can-telemetry
# 复制项目文件...
cd /opt/can-telemetry
```

### 2. 转换 DBC 文件

```bash
# 确保 DBC 文件存在
ls AutoCtrl_V10_28.dbc

# 转换 DBC 文件
python3 scripts/dbc-to-json/dbc-to-json.py AutoCtrl_V10_28.dbc dbc/vehicle.json

# 验证输出
cat dbc/vehicle.json | head -20
```

### 3. 安装项目依赖

```bash
# 安装所有依赖（包括工作区依赖）
pnpm install

# ⚠️ 如果 better-sqlite3 编译失败，尝试：
# 1. 检查 SQLite 开发库
ls /usr/include/sqlite3.h

# 2. 如果不存在，重新安装
sudo apt reinstall libsqlite3-dev

# 3. 清理并重新安装
pnpm clean
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

**⚠️ 常见问题**：

1. **问题**: `better-sqlite3` 编译失败，架构不匹配错误
   - **原因**: better-sqlite3 需要为 ARM64 架构重新编译
   - **解决**: 
     ```bash
     # 方法1：强制重建
     cd apps/server
     pnpm rebuild better-sqlite3
     
     # 方法2：清理 node_modules 重新安装
     rm -rf node_modules
     pnpm install --force
     
     # 方法3：检查是否有预编译二进制文件可用
     pnpm info better-sqlite3
     ```

2. **问题**: `socketcan` 模块安装失败
   - **解决**: 
     ```bash
     # socketcan 是可选依赖，如果安装失败可以忽略
     # 系统会在运行时检测，如果不可用会自动降级
     # 但为了完整功能，尝试：
     npm install socketcan --build-from-source
     ```

3. **问题**: 内存不足导致编译失败
   - **解决**: 
     ```bash
     # Orin 设备可能有内存限制，尝试增加 swap
     sudo fallocate -l 4G /swapfile
     sudo chmod 600 /swapfile
     sudo mkswap /swapfile
     sudo swapon /swapfile
     # 添加到 /etc/fstab 使其永久生效
     echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
     ```

### 4. 构建项目

```bash
# 构建公共包
cd packages/common
pnpm build

# 构建后端（可选，开发模式不需要）
cd ../../apps/server
pnpm build

# 构建前端（可选，开发模式不需要）
cd ../web
pnpm build
```

### 5. 配置环境变量

```bash
# 复制配置模板
cp env.example .env

# 编辑配置文件
nano .env
```

配置内容：

```env
# 生产环境配置
DATA_MODE=socketcan
CAN_IFACE=can0
WS_PORT=8080
HTTP_PORT=3000
DB_PATH=./data/telemetry.db
REPLAY_FILE=./samples/replay.json
DBC_JSON=./dbc/vehicle.json
LOG_LEVEL=info
```

### 6. 配置 CAN 接口

```bash
# 停止现有 CAN 接口（如果运行中）
sudo ip link set can0 down

# 配置 CAN 接口：500Kbps，标准帧（CAN 2.0A）
sudo ip link set can0 type can bitrate 500000

# 启动 CAN 接口
sudo ip link set can0 up

# 验证配置
ip -details link show can0
# 应该显示: bitrate 500000

# 测试接收（在另一个终端）
candump can0
```

**⚠️ 常见问题**：

1. **问题**: `RTNETLINK answers: Operation not permitted`
   - **解决**: 需要 root 权限，使用 `sudo`

2. **问题**: `Cannot find device "can0"`
   - **解决**: 
     ```bash
     # 检查 CAN 设备是否存在
     ip link show
     # 如果不存在，检查硬件连接和驱动
     lsmod | grep can
     # 加载 CAN 模块（如果需要）
     sudo modprobe can
     sudo modprobe can_raw
     ```

3. **问题**: 无法接收 CAN 数据
   - **解决**:
     ```bash
     # 检查 CAN 接口状态
     ip -s link show can0
     # 检查是否有数据包
     # 确认终端电阻已正确安装（120Ω）
     ```

### 7. 初始化数据库

```bash
# 确保 data 目录存在
mkdir -p data

# 初始化数据库表
pnpm db:push

# 验证数据库创建
ls -lh data/telemetry.db
```

**⚠️ 常见问题**：

1. **问题**: 数据库文件创建失败，权限错误
   - **解决**: 
     ```bash
     sudo chown -R $USER:$USER data
     chmod 755 data
     ```

## 系统服务化

### 方案一：使用 systemd（推荐）

创建系统服务文件：

```bash
sudo nano /etc/systemd/system/can-telemetry.service
```

内容：

```ini
[Unit]
Description=CAN Telemetry Service
Documentation=https://github.com/your-repo
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_USERNAME
Group=YOUR_USERNAME
WorkingDirectory=/opt/can-telemetry
Environment="NODE_ENV=production"
EnvironmentFile=/opt/can-telemetry/.env

# 允许访问 CAN 接口（需要 CAP_NET_RAW）
# 或者使用 sudo 配置（见下方）
ExecStart=/usr/bin/node /opt/can-telemetry/apps/server/dist/index.js
ExecReload=/bin/kill -HUP $MAINPID

# 自动重启
Restart=always
RestartSec=10

# 资源限制（可选，根据设备调整）
LimitNOFILE=65536

# 日志
StandardOutput=journal
StandardError=journal
SyslogIdentifier=can-telemetry

[Install]
WantedBy=multi-user.target
```

**配置 sudo 以允许无密码访问 CAN（更安全的方式）**：

```bash
# 创建 sudoers 规则
sudo visudo -f /etc/sudoers.d/can-telemetry
```

添加：

```
YOUR_USERNAME ALL=(ALL) NOPASSWD: /sbin/ip link set can0 up
YOUR_USERNAME ALL=(ALL) NOPASSWD: /sbin/ip link set can0 down
YOUR_USERNAME ALL=(ALL) NOPASSWD: /sbin/ip link set can0 type can bitrate *
```

修改服务文件，在启动前配置 CAN：

```ini
ExecStartPre=/usr/bin/sudo /sbin/ip link set can0 type can bitrate 500000
ExecStartPre=/usr/bin/sudo /sbin/ip link set can0 up
ExecStart=/usr/bin/node /opt/can-telemetry/apps/server/dist/index.js
ExecStopPost=/usr/bin/sudo /sbin/ip link set can0 down
```

启动服务：

```bash
# 重新加载 systemd 配置
sudo systemctl daemon-reload

# 启用服务（开机自启）
sudo systemctl enable can-telemetry.service

# 启动服务
sudo systemctl start can-telemetry.service

# 查看状态
sudo systemctl status can-telemetry.service

# 查看日志
sudo journalctl -u can-telemetry.service -f
```

### 方案二：使用 PM2（适合开发和生产）

```bash
# 全局安装 PM2
sudo npm install -g pm2

# 创建 PM2 配置文件
nano ecosystem.config.js
```

内容：

```javascript
module.exports = {
  apps: [{
    name: 'can-telemetry',
    script: 'apps/server/dist/index.js',
    cwd: '/opt/can-telemetry',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      DATA_MODE: 'socketcan',
      CAN_IFACE: 'can0',
      WS_PORT: 8080,
      HTTP_PORT: 3000,
    },
    env_file: '.env',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G',
  }]
};
```

启动和管理：

```bash
# 创建日志目录
mkdir -p logs

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs can-telemetry

# 保存 PM2 配置（开机自启）
pm2 save
pm2 startup

# 停止应用
pm2 stop can-telemetry

# 重启应用
pm2 restart can-telemetry
```

### 方案三：使用 Supervisor

```bash
# 安装 supervisor
sudo apt install -y supervisor

# 创建配置文件
sudo nano /etc/supervisor/conf.d/can-telemetry.conf
```

内容：

```ini
[program:can-telemetry]
command=/usr/bin/node /opt/can-telemetry/apps/server/dist/index.js
directory=/opt/can-telemetry
user=YOUR_USERNAME
autostart=true
autorestart=true
stderr_logfile=/var/log/can-telemetry.err.log
stdout_logfile=/var/log/can-telemetry.out.log
environment=DATA_MODE="socketcan",CAN_IFACE="can0"
```

启动：

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start can-telemetry
```

## 前端部署（可选）

如果需要在前端设备访问，可以：

### 开发模式

```bash
# 在项目目录运行
cd apps/web
pnpm dev
```

### 生产模式

```bash
# 构建前端
cd apps/web
pnpm build

# 使用 nginx 或 apache 服务静态文件
sudo apt install nginx
sudo cp -r apps/web/dist/* /var/www/html/
```

或使用 PM2 运行前端服务（如果后端集成了静态文件服务）。

## 验证部署

### 1. 检查服务状态

```bash
# systemd
sudo systemctl status can-telemetry

# PM2
pm2 status

# Supervisor
sudo supervisorctl status can-telemetry
```

### 2. 检查端口监听

```bash
sudo netstat -tlnp | grep -E ':(3000|8080)'
# 或
sudo ss -tlnp | grep -E ':(3000|8080)'
```

### 3. 测试 API

```bash
# 健康检查
curl http://localhost:3000/api/health

# 状态查询
curl http://localhost:3000/api/status

# WebSocket 连接测试
wscat -c ws://localhost:8080
```

### 4. 检查日志

```bash
# systemd
sudo journalctl -u can-telemetry.service -n 100 --no-pager

# PM2
pm2 logs can-telemetry --lines 100

# 直接查看日志文件（如果配置了文件日志）
tail -f /var/log/can-telemetry.log
```

### 5. 检查 CAN 数据接收

```bash
# 查看服务日志，应该能看到 CAN 帧接收信息
# 使用 candump 验证 CAN 数据
sudo candump can0
```

## 故障排查

### 常见问题汇总

#### 1. 服务启动失败

**症状**: 服务无法启动，日志显示错误

**排查步骤**:
```bash
# 检查 Node.js 版本
node --version

# 检查依赖安装
cd /opt/can-telemetry/apps/server
pnpm list

# 检查配置文件
cat .env

# 手动运行测试
NODE_ENV=production node dist/index.js
```

#### 2. CAN 数据无法接收

**症状**: 服务运行但收不到 CAN 数据

**排查步骤**:
```bash
# 检查 CAN 接口状态
ip -details -statistics link show can0

# 测试接收
sudo candump can0

# 检查服务是否有权限访问 CAN
sudo -u YOUR_USERNAME candump can0

# 检查 socketcan 库
node -e "console.log(require('socketcan'))"
```

#### 3. 数据库错误

**症状**: 数据库操作失败

**排查步骤**:
```bash
# 检查数据库文件权限
ls -l data/telemetry.db

# 检查磁盘空间
df -h

# 测试数据库连接
sqlite3 data/telemetry.db "SELECT name FROM sqlite_master WHERE type='table';"
```

#### 4. WebSocket 连接失败

**症状**: 前端无法连接到后端

**排查步骤**:
```bash
# 检查端口是否监听
sudo ss -tlnp | grep 8080

# 检查防火墙
sudo ufw status
sudo iptables -L -n | grep 8080

# 测试 WebSocket
wscat -c ws://localhost:8080
```

#### 5. 内存不足

**症状**: 服务频繁重启，日志显示 OOM

**解决**:
```bash
# 检查内存使用
free -h

# 增加 swap（见上文）
# 或在 PM2/systemd 配置中限制内存使用
```

## 性能优化

### 1. 系统级优化

```bash
# 设置文件描述符限制
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# 优化网络参数
sudo sysctl -w net.core.somaxconn=65535
sudo sysctl -w net.ipv4.tcp_max_syn_backlog=65535
```

### 2. 应用级优化

- 调整数据库批处理大小（`apps/server/src/db/repo.ts` 中的 `batchSize`）
- 启用数据库 WAL 模式（已默认启用）
- 配置日志级别为 `warn` 或 `error`（生产环境）

### 3. 资源监控

```bash
# 安装监控工具
sudo apt install htop iotop

# 监控资源使用
htop
iotop
```

## 安全建议

1. **用户权限**: 不要以 root 用户运行服务
2. **防火墙**: 配置防火墙规则，限制访问来源
3. **HTTPS**: 在生产环境使用 HTTPS（需要 nginx 反向代理）
4. **日志轮转**: 配置日志轮转，避免日志文件过大
5. **定期备份**: 定期备份数据库文件

## 更新部署

```bash
# 停止服务
sudo systemctl stop can-telemetry
# 或
pm2 stop can-telemetry

# 更新代码
git pull
# 或复制新文件

# 更新依赖
pnpm install

# 重新构建（如果需要）
pnpm build

# 重新转换 DBC（如果 DBC 文件更新）
python3 scripts/dbc-to-json/dbc-to-json.py AutoCtrl_V10_28.dbc dbc/vehicle.json

# 启动服务
sudo systemctl start can-telemetry
# 或
pm2 restart can-telemetry
```

## 联系支持

如果遇到本文档未涵盖的问题，请：

1. 查看项目 README.md
2. 检查日志文件
3. 验证系统配置
4. 联系技术支持团队

---

**最后更新**: 2024年

