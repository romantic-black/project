# DbRepo 详细实现说明

## 核心架构

### 数据结构层次

```
DbRepo 类
├── 数据库层
│   ├── db: SQLite 实例 (better-sqlite3)
│   ├── PreparedStatement 缓存 (提升性能)
│   └── 表: signals_agg_1s, signals_agg_10s, events_alarm
│
├── 内存缓存层
│   ├── oneSecondBuckets: Map<信号名, Map<时间桶, 聚合桶>>
│   ├── tenSecondBuckets: Map<信号名, Map<时间桶, 聚合桶>>
│   ├── batchSize: 批量写入阈值
│   └── pendingCount: 待写入计数
│
└── 定时任务层
    ├── flushInterval: 定时刷新 (5秒)
    └── cleanupInterval: 定时清理 (1小时)
```

## 核心流程详解

### 1. 初始化流程

```typescript
constructor()
├── 1. 确定数据库路径（绝对/相对）
├── 2. 创建数据库目录
├── 3. openDatabase()
│   ├── 连接 SQLite
│   ├── 配置 WAL 模式（Write-Ahead Logging）
│   ├── 配置 synchronous = NORMAL
│   └── 设置 cache_size = 64MB
├── 4. verifyIntegrity()
│   ├── PRAGMA integrity_check
│   └── 如损坏则 recoverDatabase()
├── 5. initializeTables()
│   ├── 创建 signals_agg_1s 表
│   ├── 创建 signals_agg_10s 表
│   ├── 创建索引（timestamp, signal_name, composite）
│   └── 处理旧版本兼容性
├── 6. initializeStatements()
│   ├── 预编译 INSERT 语句
│   └── 预编译 DELETE 语句
├── 7. updatePerformanceSettings()
│   ├── 从 performanceManager 获取配置
│   └── 应用 batchSize、flushInterval
├── 8. startFlushTimer()
│   └── 每 5 秒检查并刷新
└── 9. cleanupInterval()
    └── 每小时清理 7 天前数据
```

### 2. 数据写入流程

```
外部调用: dbRepo.batchInsertSignalValue(timestamp, signalName, value)
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ batchInsertSignalValue()                                      │
├──────────────────────────────────────────────────────────────┤
│ 步骤1: 计算时间桶时间戳                                        │
│   - 10秒桶: Math.floor(timestamp / 10000) * 10000            │
│   - 1秒桶: Math.floor(timestamp / 1000) * 1000               │
│   例如: 12345ms -> 12000ms (12秒对齐)                        │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ 步骤2: 更新10秒桶                                             │
│   updateBucket(tenSecondBuckets, signalName, bucketTs, ...)  │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼ (如果 enable1sAggregation)
┌──────────────────────────────────────────────────────────────┐
│ 步骤3: 更新1秒桶                                               │
│   updateBucket(oneSecondBuckets, signalName, bucketTs, ...)  │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ 步骤4: 递增计数器                                              │
│   pendingCount++                                              │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │ pendingCount >=  │
         │   batchSize?     │
         └─────┬───────┬────┘
               │       │
              YES      NO
               │       │
               ▼       │ (等待下次调用或定时器)
         ┌────────────────────────────────────────────┐
         │ flush() - 批量刷新到数据库                    │
         │   1. collectReadyBuckets()                  │
         │   2. 事务批量插入                            │
         │   3. 清理内存桶                              │
         │   4. 更新监控统计                            │
         └────────────────────────────────────────────┘
```

### 3. 时间桶更新逻辑详解

```typescript
updateBucket(collection, signalName, bucketTimestamp, timestamp, value)
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ 获取该信号的所有时间桶                                         │
│   signalBuckets = collection.get(signalName)                 │
│   if (!signalBuckets) {                                      │
│     创建新的 Map()                                            │
│   }                                                           │
└──────────────────┬───────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ 获取指定的时间桶                                               │
│   bucket = signalBuckets.get(bucketTimestamp)                │
└──────────────────┬───────────────────────────────────────────┘
                   │
         ┌─────────┴─────────┐
         │                   │
      不存在                 存在
         │                   │
         ▼                   ▼
┌─────────────────┐   ┌────────────────────────────────────────┐
│ 创建新桶         │   │ 更新现有桶                              │
│ {                │   │                                        │
│   firstTs: 值    │   │ - first/last: 判断时间戳              │
│   lastTs: 值     │   │ - min/max: 比较更新                   │
│   sum: 值        │   │ - sum: 累加                           │
│   min: 值        │   │ - count: 递增                         │
│   max: 值        │   │                                        │
│   count: 1       │   │ 注意: 平均值的计算公式: avg = sum/count │
│ }                │   │                                        │
└─────────────────┘   └────────────────────────────────────────┘
```

### 4. 批量刷新流程

```
flush(force = false)
    │
    ├── 前置检查
    │   ├── 无待写入数据则返回（除非 force）
    │   └── 数据库已损坏则跳过
    │
    ├── 收集待写入桶
    │   ├── ready10sBuckets = collectReadyBuckets(tenSecondBuckets, 10000, now, force)
    │   └── ready1sBuckets = collectReadyBuckets(oneSecondBuckets, 1000, now, force)
    │
    ├── 刷新条件判断
    │   └── 窗口已过期: bucketTimestamp + windowSize <= now
    │
    ├── 执行事务
    │   ├── 开启事务
    │   ├── 批量插入1秒数据
    │   │   └── insert1sStmt.run(timestamp, signal, ...)
    │   ├── 批量插入10秒数据
    │   │   └── insert10sStmt.run(timestamp, signal, ...)
    │   └── 提交事务
    │
    ├── 清理内存
    │   ├── removeBuckets(tenSecondBuckets, ready10sBuckets)
    │   ├── removeBuckets(oneSecondBuckets, ready1sBuckets)
    │   └── pendingCount -= removedSamples
    │
    └── 更新监控
        ├── transportMonitor.recordDbFlush(...)
        ├── transportMonitor.recordDbOperation(...)
        └── logger.logDbFlush(...)
```

**关键点：**
- 只刷新过期的桶，不刷新当前正在写入的桶
- 使用事务确保原子性
- 计算 `avg = sum / count`
- 批量插入后立即清理内存

### 5. 定时刷新机制

```
startFlushTimer() - 每 5 秒执行一次
    │
    ├── 检查 pendingCount > 0
    │   └── 如有，调用 flush(false)
    │
    └── 刷新性能配置
        └── updatePerformanceSettings()
            ├── 同步 batchSize
            ├── 同步 flushInterval
            └── 如果配置变化，重启定时器
```

### 6. 查询流程

#### 6.1 快照查询（最新值）

```
getSnapshot(signals)
    │
    ├── 构建子查询获取每个信号的最新时间戳
    │   SELECT signal_name, last_value
    │   FROM signals_agg_1s s1
    │   WHERE signal_name IN (?, ?, ...)
    │     AND timestamp = (
    │       SELECT MAX(timestamp)
    │       FROM signals_agg_1s s2
    │       WHERE s2.signal_name = s1.signal_name
    │     )
    │
    ├── 执行查询
    │
    └── 构建结果映射
        { signal1: value1, signal2: value2, ... }
```

#### 6.2 历史查询

```
queryHistory(signals, from, to, step)
    │
    ├── 选择表
    │   ├── step === '1s' -> signals_agg_1s
    │   └── step === '10s' -> signals_agg_10s
    │
    ├── 构建查询
    │   SELECT timestamp, signal_name, last_value, 
    │          first_value, avg_value, max_value, min_value
    │   FROM <table>
    │   WHERE timestamp >= ? AND timestamp <= ?
    │     AND signal_name IN (?, ?, ...)
    │   ORDER BY timestamp ASC, signal_name ASC
    │
    └── 返回聚合数据
```

### 7. 故障恢复流程

```
detectCorruption
    │
    ├── 检测点1: verifyIntegrity() - 启动时
    │   └── PRAGMA integrity_check
    │
    ├── 检测点2: handleCorruption() - 运行时
    │   └── SQLITE_CORRUPT 错误
    │
    └── 执行恢复
        │
        ├── 1. 关闭数据库连接
        ├── 2. 备份损坏文件
        │   └── 文件名: .corrupted.<timestamp>
        ├── 3. 清理 WAL/SHM 文件
        ├── 4. 重建数据库
        │   ├── openDatabase()
        │   ├── initializeTables()
        │   └── initializeStatements()
        └── 5. 标记 isCorrupted = false
```

**注意：** 恢复会丢失历史数据，但服务不中断

### 8. 数据清理流程

```
cleanupTTL(days = 7) - 每小时执行
    │
    ├── 计算截止时间
    │   cutoff = now - (days × 24 × 60 × 60 × 1000)
    │
    ├── 批量删除
    │   ├── DELETE FROM frames_raw WHERE timestamp < ?
    │   ├── DELETE FROM signals_agg_1s WHERE timestamp < ?
    │   ├── DELETE FROM signals_agg_10s WHERE timestamp < ?
    │   └── DELETE FROM events_alarm WHERE timestamp < ?
    │
    └── 10% 概率执行 VACUUM
        └── 碎片整理并回收空间
```

## 性能优化点

### 1. 预编译语句（PreparedStatement）

```typescript
// 编译一次，执行多次
const stmt = db.prepare('INSERT INTO signals_agg_1s VALUES (?, ?, ?, ?, ?, ?, ?)');
for (const entry of buckets) {
  stmt.run(...); // 快速执行
}
```

**好处：**
- SQL 编译后缓存
- 防止 SQL 注入
- 性能提升 10-20%

### 2. 时间桶聚合

**数据压缩示例：**

```
原始数据: 100ms 周期，10条信号
- 数据量: 10条 × 10次/秒 × 3600秒 = 36万行/小时

1秒聚合后:
- 数据量: 10条 × 1次/秒 × 3600秒 = 3.6万行/小时
- 压缩率: 90%

10秒聚合后:
- 数据量: 10条 × 0.1次/秒 × 3600秒 = 3600行/小时
- 压缩率: 99%
```

### 3. 批量写入

**对比：**

```
逐条写入:
- 每次 INSERT: ~1ms
- 1000 条数据: ~1000ms

批量写入:
- 事务 + PreparedStatement: ~5ms/100条
- 1000 条数据: ~50ms
- 性能提升: 20倍
```

### 4. 索引优化

```sql
-- 复合索引覆盖最常用查询
CREATE INDEX idx_composite ON signals_agg_1s(timestamp, signal_name);

-- 查询性能:
-- 无索引: O(n) 全表扫描
-- 有索引: O(log n) B-tree 查找
```

### 5. 数据库配置

```typescript
db.pragma('journal_mode = WAL');   // 写前日志，支持并发读写
db.pragma('synchronous = NORMAL');  // 平衡安全性和性能
db.pragma('cache_size = -64000');   // 64MB 缓存
```

## 内存管理

### 时间桶数据结构

```typescript
// 1秒桶示例
oneSecondBuckets = {
  "VCU_VehSpeed": {
    12000: { min: 45.0, max: 46.5, avg: 45.8, count: 10, ... },
    13000: { min: 46.0, max: 47.2, avg: 46.5, count: 10, ... }
  },
  "VCU_BatSOC": {
    12000: { min: 84.5, max: 85.2, avg: 85.0, count: 10, ... }
  }
}
```

### 内存预估

假设 10 条信号，每个桶保存 10 个样本：
- 1个桶大小: ~100 bytes
- 1秒内10个桶: 1KB
- 1秒聚合后: 1KB → 写入数据库
- 最大内存占用: ~10KB/秒

**峰值情况：**
- 100条信号，保持30秒桶未刷新
- 内存: 100 × 30 × 100 bytes = 300KB

**结论：** 内存占用极小，可忽略不计

## 关键设计决策

### 1. 为什么用时间桶而不是逐条记录？

**问题：** 数据量太大（36万行/小时）

**方案：**
- ✅ 使用时间桶聚合
- ❌ 逐条记录（存储压力大）
- ❌ 异步队列（复杂度高）

**结果：** 90-99% 数据压缩

### 2. 为什么双时间窗口？

**场景：**
- 实时查询：需要细粒度（1秒）
- 长期分析：需要粗粒度（10秒）

**方案：**
- ✅ 双表设计
- ❌ 单表（查询慢或存储大）

### 3. 为什么不用消息队列？

**考虑：**
- 实时监控系统，不需要持久化
- 增加复杂度（Kafka/RabbitMQ）
- SQLite 足够快

**结果：** 内存缓冲 + 定时刷新

### 4. 为什么删除损坏文件而不是修复？

**权衡：**
- 修复：慢、复杂、不一定成功
- 重建：快、简单、服务不中断

**选择：** 重建（因为实时监控可接受历史数据丢失）

## 最佳实践

### 1. 批量插入

```typescript
// ✅ 好：批量插入
for (const msg of messages) {
  for (const [signal, value] of Object.entries(msg.values)) {
    dbRepo.batchInsertSignalValue(msg.timestamp, signal, value);
  }
}

// ❌ 差：直接写数据库
db.exec('INSERT INTO ...');
```

### 2. 查询策略

```typescript
// 近期查询：用1秒表
const recent = dbRepo.queryHistory(signals, from1h, to, '1s');

// 长期查询：用10秒表
const longTerm = dbRepo.queryHistory(signals, from24h, to, '10s');
```

### 3. 错误处理

```typescript
// DbRepo 内部已处理数据库损坏
// 外部调用无需特殊处理

try {
  const snapshot = dbRepo.getSnapshot(signals);
  // 即使数据库损坏也会返回空对象，不会抛异常
} catch (error) {
  // 极少数情况下可能抛出，需要捕获
}
```

## 监控指标

通过 `transportMonitor` 记录：

```typescript
// 写入监控
recordDbFlush(bufferSize, successCount, errorCount, duration);

// 操作监控
recordDbOperation(operation, table, success, count, duration, error?);
```

**关键指标：**
- flush 耗时
- 插入成功率
- 缓冲区大小
- 平均延迟

## 总结

DbRepo 通过以下设计实现了高性能和高可靠性：

✅ **时间桶聚合** - 大幅减少数据量  
✅ **批量写入** - 提高写入性能  
✅ **PreparedStatement** - 查询优化  
✅ **复合索引** - 加速范围查询  
✅ **WAL 模式** - 并发性能优化  
✅ **自动恢复** - 损坏自动重建  
✅ **TTL 清理** - 控制存储大小  
✅ **双时间窗口** - 灵活应对查询需求

**核心思想：** 用内存换性能，用聚合换存储，用简单换可靠

