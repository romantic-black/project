# ROS Bag Parser

用于解析 ROS bag 文件并提取消息数据的工具脚本。

## 功能

- 查看 bag 文件信息（topics、消息数量、时长等）
- 提取指定 topic 的消息
- 提取所有 topics 的消息
- 提取 GPS 数据（从 NavSatFix 消息）

## 使用方法

### 查看 bag 文件信息

```bash
python3 scripts/rosbag-parser/rosbag_parser.py <bag_file> --info
```

### 提取指定 topic

```bash
python3 scripts/rosbag-parser/rosbag_parser.py <bag_file> --topic <topic_name> --output <output_file>
```

例如：
```bash
python3 scripts/rosbag-parser/rosbag_parser.py data/zhineng/shiwai_2025-11-03-11-12-36.bag --topic /chcnav_fix_demo/imu --output imu.json
```

### 提取所有 topics

```bash
python3 scripts/rosbag-parser/rosbag_parser.py <bag_file> --all-topics --output <output_directory>
```

### 提取 GPS 数据

```bash
python3 scripts/rosbag-parser/rosbag_parser.py <bag_file> --gps --output <output_file>
```

## 输出格式

### GPS 数据格式

```json
[
  {
    "timestamp": 1762139556516,
    "latitude": 39.123456,
    "longitude": 116.123456,
    "altitude": 50.0,
    "status": {
      "status": 0,
      "service": 1
    }
  }
]
```

### Topic 消息格式

```json
[
  {
    "timestamp": 1762139556516,
    "topic": "/chcnav_fix_demo/imu",
    "message": {
      "header": {
        "seq": 0,
        "stamp": {...},
        "frame_id": "imu"
      },
      "orientation": {...},
      "angular_velocity": {...},
      "linear_acceleration": {...}
    }
  }
]
```

## 注意事项

- 二进制数据（bytes）会被转换为 base64 编码的字符串
- 大文件处理可能需要较长时间
- 确保已安装 ROS Noetic 或相应的 rosbag Python 库


