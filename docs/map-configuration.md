# 地图服务切换指南

本文档说明如何将 Web 前端切换到自有地图瓦片服务，并介绍相关环境变量。

## 前置条件

- 自有地图服务需要提供与 Leaflet 兼容的瓦片接口，例如 `http://ip:port/maptiles/{z}/{x}/{y}.png`。
- 前端构建使用 Vite，环境变量统一通过 `VITE_*` 前缀传入。例如开发模式在项目根目录创建 `.env.local`，生产部署使用系统环境变量或容器注入。

## 快速切换步骤

1. 编辑前端环境变量文件（如 `.env.local`）或启动命令注入：

   ```bash
   VITE_MAP_TILE_SERVICE_URL="http://192.168.1.200:8080/maptiles/"
   VITE_MAP_DEFAULT_TILE_SOURCE="provider-tiles"
   pnpm --filter web dev
   ```

   - `VITE_MAP_TILE_SERVICE_URL`：指向综合导航地图服务基地址，前端会自动补全 `{z}/{x}/{y}.png`。
   - `VITE_MAP_DEFAULT_TILE_SOURCE`：指定默认底图 ID，`provider-tiles` 对应自有服务（若未提供则使用列表中第一个源）。

2. 重新启动或刷新前端，左上角状态面板若显示 “底图：综合导航瓦片 / 状态：正常” 即表示切换成功。

## 环境变量说明

| 变量名 | 说明 |
| --- | --- |
| `VITE_MAP_TILE_SERVICE_URL` | （可选）自有瓦片服务的基础 URL。若为空，则默认首选 OpenStreetMap |
| `VITE_MAP_TILE_SOURCES` | （可选）JSON 字符串，定义额外的瓦片源列表，用于扩展或设定备用源 |
| `VITE_MAP_DEFAULT_TILE_SOURCE` | （可选）指定首选瓦片源 ID，应匹配默认列表或自定义列表中的 `id` |
| `VITE_MAP_METERS_PER_UNIT` | （可选）地图坐标与米的换算比例，默认 1.0，针对非米制坐标系可自行调整 |

### `VITE_MAP_TILE_SOURCES` 格式

该变量为 JSON 数组字符串，每个元素表示一个瓦片源：

```json
[
  {
    "id": "provider-tiles",
    "name": "综合导航瓦片",
    "url": "http://192.168.1.200:8080/maptiles/{z}/{x}/{y}.png",
    "attribution": "© Provider",
    "minZoom": 5,
    "maxZoom": 18
  },
  {
    "id": "osm",
    "name": "OpenStreetMap",
    "url": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    "subdomains": "abc",
    "isFallback": true
  }
]
```

> 注意：由于环境变量以字符串形式存储，在线路部署时请确保 JSON 中的双引号已正确转义或使用单引号包裹整体字符串。

## 验证自有服务

1. 在浏览器直接访问单张瓦片，例如 `http://192.168.1.200:8080/maptiles/10/1024/512.png`，确认能获得图片响应。
2. 启动前端后关注左上角状态面板：
   - “状态：加载中…” 表示正在尝试拉取瓦片。
   - “状态：加载失败，已尝试切换” 表示当前源不可用，系统会自动切换到备用源。

## 配合 ROS 桥接服务

若地图服务与 ROS 服务器位于同一设备，建议同步更新下列环境变量：

```bash
VITE_ROS_BRIDGE_URL=ws://192.168.1.200:9090
VITE_MAP_TILE_SERVICE_URL=http://192.168.1.200:8080/maptiles/
```

确保浏览器能够访问这两个端口，地图和车辆状态即可在控制面板正常展示。


