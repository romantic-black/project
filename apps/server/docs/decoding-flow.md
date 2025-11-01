# CAN 信号解码流程详解

本文档详细解释 CAN 总线信号从原始字节到物理值的完整解码流程。

## 📋 目录

1. [整体架构](#整体架构)
2. [核心函数](#核心函数)
3. [详细流程](#详细流程)
4. [示例分析](#示例分析)
5. [故障排查](#故障排查)

---

## 整体架构

```
CAN Bus (CAN Frame)
    ↓
[Data Source: SocketCAN/Mock/Replay/Vcan]
    ↓
Raw Buffer: [0x12, 0x34, 0x56, ...] (8 bytes)
    ↓
[normalizeFrame()] ← 根据 DBC 文件定义
    ↓
├─ extractBits()      → 位提取: 原始整数值
├─ applyScale()       → 缩放转换: 物理单位值
├─ clamp()            → 限幅: 有效范围值
├─ checkLifeCnt()     → 生命周期检测
└─ checkXorChecksum() → 校验和验证
    ↓
MessageData { values: { VCU_VehSpeed: 100 }, healthy: true }
    ↓
[数据库批量存储] + [WebSocket 实时推送]
```

---

## 核心函数

### 1. `checkLifeCnt()` - 生命周期检测

**作用**: 验证 CAN 帧的生命周期计数器，检测帧丢失或重复

**原理**: 
- LifeCnt 是 4 位计数器 (0-15)
- 每发送一帧自动递增 1
- 到达 15 后重置为 0: `0→1→2→...→14→15→0→1→...`

**检测逻辑**:
- 正常: 当前值 = (上一个值 + 1) % 16
- 帧丢失: 计数器跳跃 (如 2→5，跳过了 3、4)
- 帧重复: 计数器不变 (如同一个帧收到两次)

**应用场景**: 
- 检测 CAN 总线通信质量
- 发现硬件故障导致的丢包
- 监控周期性消息的完整性

**示例**:
```javascript
// 第一次收到: 无历史记录，总是返回 true
checkLifeCnt(5, undefined)  // → true

// 正常序列
checkLifeCnt(3, 2)   // → true  (3 = (2+1))
checkLifeCnt(15, 14) // → true  (15 = (14+1))
checkLifeCnt(0, 15)  // → true  (0 = (15+1) % 16, 循环)

// 帧丢失: 从 2 跳到 5，丢失了帧 3 和 4
checkLifeCnt(5, 2)   // → false (5 ≠ (2+1) = 3)

// 帧重复: 同一个帧收到两次
checkLifeCnt(5, 5)   // → false (5 ≠ (5+1) = 6)
```

---

### 2. `checkXorChecksum()` - XOR 校验和验证

**作用**: 验证 CAN 帧数据完整性，检测传输错误

**原理**:
- 计算前 7 个字节 (byte 0-6) 的 XOR 异或值
- 与第 8 字节 (byte 7) 的校验和对比
- 不匹配则说明数据在传输过程中被破坏

**公式**: 
```
checksum = data[0] XOR data[1] XOR ... XOR data[6]
valid = (checksum === data[7])
```

**检测逻辑**:
- 正常: 计算的 XOR 值与帧中的校验和字节匹配
- 错误: 任何字节损坏都会导致 XOR 值变化，检测出异常

**应用场景**:
- 检测电磁干扰导致的数据位翻转
- 发现硬件故障 (如接触不良)
- 验证数据在总线传输中的完整性

**示例**:
```javascript
// 有效校验和
const frame = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x00]);
// XOR: 0x01^0x02^0x03^0x04^0x05^0x06^0x07 = 0x00
checkXorChecksum(frame, 0x00)  // → true

// 数据损坏: 第 1 字节从 0x02 变成 0x03
const corrupted = Buffer.from([0x01, 0x03, 0x03, 0x04, 0x05, 0x06, 0x07, 0x00]);
checkXorChecksum(corrupted, 0x00)  // → false
```

---

### 3. `extractBits()` - 位提取

**作用**: 从 CAN 帧的字节缓冲区中提取指定范围的比特位

**参数**:
- `data`: CAN 帧原始数据 (Buffer)
- `startBit`: 起始位位置 (0-63)
- `length`: 提取的比特长度 (1-64)
- `isBigEndian`: 字节序 (true=Motorola, false=Intel)
- `isSigned`: 是否有符号整数

**返回值**: 原始整数值 (未缩放)

**字节序区别**:

#### Big-Endian (Motorola) - 最常见
```
Byte 0:  7 6 5 4 3 2 1 0
Byte 1:  7 6 5 4 3 2 1 0
Byte 2:  7 6 5 4 3 2 1 0

读取顺序: 从高位到低位 (7→0)，跨字节时移到下一个高位字节
```

#### Little-Endian (Intel) - 较少见
```
Byte 0:  0 1 2 3 4 5 6 7
Byte 1:  0 1 2 3 4 5 6 7
Byte 2:  0 1 2 3 4 5 6 7

读取顺序: 从低位到高位 (0→7)
```

**符号位处理**:
- 无符号: 直接返回位值
- 有符号: 检查 MSB，如果是 1 则进行符号扩展 (two's complement)

---

### 2. `applyScale()` - 缩放转换

**作用**: 将原始整数值转换为物理单位值

**公式**: `physicalValue = rawValue × factor + offset`

**参数**:
- `rawValue`: 原始整数值
- `factor`: 缩放因子
- `offset`: 偏移量

**示例**:
```javascript
// 车速: raw=2000, factor=0.05, offset=0
applyScale(2000, 0.05, 0)  // → 100 km/h

// 温度: raw=50, factor=1, offset=-40
applyScale(50, 1, -40)     // → 10°C
```

---

### 3. `clamp()` - 限幅

**作用**: 将物理值限制在 DBC 定义的合法范围内

**参数**:
- `value`: 物理值
- `min`: 最小值 (undefined = 无下限)
- `max`: 最大值 (undefined = 无上限)

**示例**:
```javascript
// 车速超限
clamp(150, 0, 120)  // → 120 km/h

// 正常范围内
clamp(60, 0, 120)   // → 60 km/h
```

---

## 详细流程

### 完整解码链路

```javascript
// 在 normalizeFrame() 中执行
export function normalizeFrame(frame: CanFrame): MessageData | null {
  // Step 1: 根据 CAN ID 查找 DBC 消息定义
  const msg = dbcLoader.getMessage(frame.id);
  if (!msg) return null;  // 未知 CAN ID

  // Step 2: 遍历消息中的所有信号
  for (const signal of msg.signals) {
    // Step 3: 位提取 - 从原始字节中提取信号值
    const rawValue = extractBits(
      frame.data,              // 8 字节 CAN 数据
      signal.startBit,         // 起始位 (如 0)
      signal.length,           // 比特长度 (如 16)
      isBigEndian(signal.endianness),  // 字节序判断
      signal.signed ?? false   // 是否有符号
    );

    // Step 4: 缩放转换 - 转换为物理单位
    const scaledValue = applyScale(
      rawValue,
      signal.factor ?? 1,      // 缩放因子
      signal.offset ?? 0       // 偏移量
    );

    // Step 5: 限幅 - 确保值在有效范围内
    const clampedValue = clamp(
      scaledValue,
      signal.min,              // 最小值
      signal.max               // 最大值
    );

    // Step 6: 特殊验证
    values[signal.name] = clampedValue;

    // LifeCnt 生命周期检测
    if (signal.name.includes('LifeCnt')) {
      const isValid = checkLifeCnt(clampedValue, previous);
      if (!isValid) healthy = false;
    }

    // CheckSum 校验和验证
    if (signal.name.includes('CheckSum')) {
      const isValid = checkXorChecksum(frame.data, clampedValue);
      if (!isValid) healthy = false;
    }
  }

  return {
    msgId: frame.id,
    name: msg.name,
    timestamp: frame.timestamp,
    values,
    raw: frame.data,
    healthy
  };
}
```

---

## 示例分析

### 示例 1: VCU_VehSpeed (车速信号)

**DBC 定义**:
```
Message: VCU_Info1 (ID: 320)
Signal: VCU_VehSpeed
  - startBit: 0
  - length: 16
  - factor: 0.05
  - offset: 0
  - min: 0
  - max: 120
  - endianness: big (Motorola)
  - signed: false
```

**原始 CAN 帧**:
```
ID: 0x140 (320)
Data: [0x13, 0x88, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
```

**解码过程**:

1. **extractBits()**:
   ```
   Data:     0x13     0x88
   Bits:     7...0    7...0
   Binary:   00010011 10001000
             |←──── 16 bits ──→|
   
   Big-Endian 读取: bit 15→bit 0
   Result: 5000 (raw integer)
   ```

2. **applyScale()**:
   ```
   5000 × 0.05 + 0 = 250.0 km/h
   ```

3. **clamp()**:
   ```
   250.0 > 120 → 120.0 km/h (限幅)
   ```

**最终结果**:
```javascript
{
  signalName: "VCU_VehSpeed",
  rawValue: 5000,
  scaledValue: 250.0,
  finalValue: 120.0,  // 限幅后
  healthy: true
}
```

---

### 示例 2: 跨字节信号 (startBit=5, length=10)

**DBC 定义**:
```
Signal: TestSignal
  - startBit: 5
  - length: 10
  - endianness: big
```

**原始数据**:
```
Data: [0x12, 0x34, 0x56, ...]
Binary:
Byte 0: 0001 0010 (0x12)
Byte 1: 0011 0100 (0x34)

Bit layout (Big-Endian):
      7  6  5  4  3  2  1  0  7  6  5  4  3  2  1  0
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Byte 0: 0  0  0  1  0  0  1  0
Byte 1: 0  0  1  1  0  1  0  0
              │←─ 10 bits ──→│
```

**extractBits() 过程**:
```
Byte 0:
  bit 7: 0
  bit 6: 0
  bit 5: 0  ← Start
  bit 4: 1
  bit 3: 0
  bit 2: 0
  bit 1: 1
  bit 0: 0

Byte 1:
  bit 7: 0  ← End (9th bit)
  bit 6: 0
  bit 5: 1
  bit 4: 1
  ...
  
Value = 0×2^0 + 0×2^1 + 1×2^2 + 0×2^3 + 0×2^4 + 1×2^5 + 1×2^6 + 0×2^7 + 1×2^8 + 0×2^9
      = 332 (decimal)
```

---

### 示例 3: LifeCnt 生命周期检测

**场景**: VCU_Info1 消息包含 LifeCnt 信号，用于检测帧丢失

**接收序列**:
```
Frame 1: LifeCnt = 5  (第一次收到，无历史，healthy = true)
Frame 2: LifeCnt = 6  (正常递增，healthy = true)
Frame 3: LifeCnt = 7  (正常递增，healthy = true)
Frame 4: LifeCnt = 9  (跳跃！丢帧检测，healthy = false)
Frame 5: LifeCnt = 10 (正常递增，healthy = true)
```

**检测结果**:
```javascript
// Frame 1: 首次接收
checkLifeCnt(5, undefined)  // → true

// Frame 2-3: 正常递增
checkLifeCnt(6, 5)  // → true  (6 = (5+1))
checkLifeCnt(7, 6)  // → true  (7 = (6+1))

// Frame 4: 检测到丢帧 (跳过了 8)
checkLifeCnt(9, 7)  // → false (9 ≠ (7+1) = 8)
// 日志: "LIFECNT_CHECK_FAILED: Expected 8, got 9"

// Frame 5: 恢复正常
checkLifeCnt(10, 9) // → true  (10 = (9+1))
```

---

### 示例 4: CheckSum XOR 校验和

**场景**: 验证 CAN 帧数据完整性

**有效帧**:
```
CAN Frame ID: 0x140
Data: [0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0x00]

CheckSum 信号值: 0 (从 byte 7 解码得到)

计算 XOR:
  0x12 ^ 0x34 ^ 0x56 ^ 0x78 ^ 0x9A ^ 0xBC ^ 0xDE
  = 0x00

验证: 0x00 === 0 → healthy = true
```

**损坏帧**:
```
CAN Frame ID: 0x140
Data: [0x13, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0x00]
                                      ↑ 变化！

CheckSum 信号值: 0 (帧中仍是 0)

计算 XOR:
  0x13 ^ 0x34 ^ 0x56 ^ 0x78 ^ 0x9A ^ 0xBC ^ 0xDE
  = 0x01  (与原来不同！)

验证: 0x01 !== 0 → healthy = false
// 日志: "CHECKSUM_CHECK_FAILED: Calculated XOR=0x01, received=0x00"
```

---

## 故障排查

### 问题 1: 解出的值总是 0

**可能原因**:
- `startBit` 或 `length` 配置错误
- 字节序 (`endianness`) 设置错误
- 原始数据为空或全 0

**检查方法**:
```javascript
// 在 bitops.ts 中添加日志
console.log('extractBits:', {
  startBit,
  length,
  isBigEndian,
  data: Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0'))
});
```

---

### 问题 2: 值异常大或负数

**可能原因**:
- `factor` 或 `offset` 配置错误
- `signed` 标志设置错误 (应该是 unsigned，却设成了 signed)
- 未正确进行 `clamp()` 限幅

**检查方法**:
```javascript
// 检查三步转换
const raw = extractBits(...);       // 应该是合理的整数
const scaled = applyScale(raw, ...); // 检查 factor 和 offset
const clamped = clamp(scaled, ...);  // 检查 min/max
```

---

### 问题 3: LifeCnt 检查失败

**现象**: `healthy: false`, 日志显示 `LIFECNT_CHECK_FAILED`

**可能原因**:
1. **CAN 帧丢失**: 发送端跳过了几个周期，导致计数器跳跃
2. **总线负载过高**: CAN 总线仲裁失败，周期性消息被延迟
3. **发送频率不稳定**: DBC 中的 `cycleTime` 与实际不符
4. **重启初始化**: 设备重启后计数器从 0 开始，导致跳变

**检测流程**:
```
预期序列: 10 → 11 → 12 → 13 → 14
实际序列: 10 → 11 → 13 → 14  ← 12 丢失了
结果: checkLifeCnt(13, 11) = false
```

**排查步骤**:
1. 检查日志中的 `expectedValue` vs `actualValue`
2. 统计 LifeCnt 失败频率 (`/api/diagnostics/can-errors`)
3. 监控总线负载 (`/api/diagnostics/data-flow`)
4. 验证发送端的周期时间设置

**解决方案**:
- 如果是偶发丢帧 (< 1%)：正常，CAN 总线本身可能有丢包
- 如果是频繁失败：检查硬件连接、终端电阻配置
- 如果是启动时跳变：预期行为，可忽略第一次

---

### 问题 4: CheckSum 验证失败

**现象**: `healthy: false`, 日志显示 `CHECKSUM_CHECK_FAILED`

**可能原因**:
1. **电磁干扰**: 数据位在传输中被翻转 (bit flip)
2. **硬件故障**: 收发器损坏、接触不良、电源不稳
3. **计算错误**: DBC 中的 CheckSum 算法与实际不符
4. **解析错误**: CheckSum 信号的位定义、缩放因子错误

**检测流程**:
```
有效帧:
  计算: 0x12^0x34^0x56^0x78^0x9A^0xBC^0xDE = 0x00
  帧中: CheckSum = 0x00
  验证: 0x00 === 0x00 → healthy = true

损坏帧:
  计算: 0x13^0x34^0x56^0x78^0x9A^0xBC^0xDE = 0x01  ← 变化了！
  帧中: CheckSum = 0x00
  验证: 0x01 !== 0x00 → healthy = false
```

**排查步骤**:
1. 检查日志中的 `calculatedXor` vs `received` 值
2. 查看 `rawData` 十六进制，手动计算 XOR 验证
3. 检查 CheckSum 信号的 DBC 定义是否正确
4. 使用示波器或 CAN 分析仪监控总线信号质量

**解决方案**:
- 如果是偶发失败 (< 0.1%)：可能是电磁干扰，正常
- 如果是频繁失败：更换硬件、检查屏蔽、接地
- 如果计算不匹配：与 ECU 供应商确认 CheckSum 算法
- 如果所有帧都失败：检查 DBC CheckSum 信号定义

---

## 调试技巧

### 1. 启用详细日志

```bash
# .env 文件
LOG_LEVEL=debug
ENABLE_RAW_FRAME_LOG=true
```

### 2. 使用测试数据验证

```javascript
// normalize.test.ts 中的测试用例
const frame = buildFrame(context, rawValue);
const result = normalizeFrame(frame);
console.log(result);
```

### 3. 对比 CAN-Tool 工具

使用专业的 CAN 分析工具 (如 CANoe, Vehicle Spy) 验证解码结果是否一致

---

## 相关文件

- `src/decoder/bitops.ts` - 位操作核心算法
- `src/decoder/checks.ts` - 健康检查 (LifeCnt/CheckSum)
- `src/pipeline/normalize.ts` - 数据归一化主流程
- `src/dbc/loader.ts` - DBC 文件加载
- `dbc/vehicle.json` - DBC 定义文件

---

## 总结

CAN 信号解码流程包含三个核心步骤：

1. **位提取** (`extractBits`): 从原始字节中提取比特位 → 原始整数值
2. **缩放转换** (`applyScale`): 应用因子和偏移量 → 物理单位值
3. **限幅** (`clamp`): 限制在有效范围内 → 最终有效值

此外还有生命周期检测、校验和验证等可选的安全检查。

整个过程由 `normalizeFrame()` 函数统一管理，确保解码的健壮性和可追溯性。

