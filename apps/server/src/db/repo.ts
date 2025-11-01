import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import type { DbSignalAgg } from '@can-telemetry/common';
import config, { PROJECT_ROOT } from '../config.js';
import * as schema from './schema.js';
import { createLogger } from '../utils/logger.js';
import { transportMonitor } from './transport-monitor.js';
import { performanceManager } from '../performance/manager.js';
import type { PerformanceConfig } from '../performance/manager.js';

const logger = createLogger('db-repo');

/**
 * 聚合桶数据结构 - 用于在内存中累积时间窗口内的统计数据
 * 
 * 设计目的：延迟批量写入，减少数据库操作次数，提高性能
 */
interface AggregateBucket {
  firstTimestamp: number; // 时间窗口内第一个样本的时间戳
  firstValue: number; // 时间窗口内第一个样本的值
  lastTimestamp: number; // 时间窗口内最后一个样本的时间戳
  lastValue: number; // 时间窗口内最后一个样本的值（用于实时显示）
  sum: number; // 所有样本值的累加和
  min: number; // 窗口内的最小值
  max: number; // 窗口内的最大值
  count: number; // 窗口内的样本数量
}

/**
 * 桶集合类型定义
 * 结构: Map<信号名, Map<时间桶时间戳, 聚合桶>>
 * 
 * 示例:
 * {
 *   "VCU_VehSpeed": {
 *     12000: { min: 45.0, max: 46.5, avg: 45.8, count: 10 },
 *     13000: { min: 46.0, max: 47.2, avg: 46.5, count: 10 }
 *   },
 *   "VCU_BatSOC": {
 *     12000: { min: 84.5, max: 85.2, avg: 85.0, count: 10 }
 *   }
 * }
 */
type BucketCollection = Map<string, Map<number, AggregateBucket>>;

/**
 * 桶条目 - 用于批量写入数据库时传递数据
 */
interface BucketEntry {
  signalName: string; // 信号名称
  bucketTimestamp: number; // 时间桶时间戳（对齐后的时间）
  bucket: AggregateBucket; // 聚合数据
}

/**
 * 数据库仓库类 - 负责数据存储、聚合和查询
 * 
 * 核心功能:
 * 1. 接收信号值并聚合到时间桶中
 * 2. 批量刷新聚合数据到数据库
 * 3. 提供历史数据查询和快照查询
 * 4. 自动清理过期数据
 * 5. 处理数据库损坏和恢复
 */
export class DbRepo {
  private db: Database.Database; // SQLite 数据库实例
  private dbPath: string; // 数据库文件路径
  private batchSize = 100; // 批量写入的样本数量阈值
  private pendingCount = 0; // 当前累积的待写入样本数
  private oneSecondBuckets: BucketCollection = new Map(); // 1秒时间桶集合
  private tenSecondBuckets: BucketCollection = new Map(); // 10秒时间桶集合
  private flushInterval?: NodeJS.Timeout; // 定时刷新定时器
  private flushIntervalMs = 5000; // 刷新间隔（毫秒）
  private cleanupInterval?: NodeJS.Timeout; // 定时清理定时器
  private isCorrupted = false; // 数据库是否已损坏
  private enable1sAggregation = true; // 是否启用1秒聚合（低性能模式下可禁用）
  
  // Cached prepared statements - 预编译的SQL语句，提高性能
  private insert1sStmt?: Database.Statement; // 插入1秒聚合数据的预编译语句
  private insert10sStmt?: Database.Statement; // 插入10秒聚合数据的预编译语句
  private cleanupFramesStmt?: Database.Statement; // 清理原始帧的预编译语句
  private cleanup1sStmt?: Database.Statement; // 清理1秒聚合数据的预编译语句
  private cleanup10sStmt?: Database.Statement; // 清理10秒聚合数据的预编译语句
  private cleanupAlarmStmt?: Database.Statement; // 清理告警事件的预编译语句

  constructor() {
    // 确定数据库文件路径（支持绝对路径和相对路径）
    this.dbPath = config.DB_PATH.startsWith('/')
      ? config.DB_PATH
      : join(PROJECT_ROOT, config.DB_PATH);
    
    // 确保数据库目录存在
    const dbDir = dirname(this.dbPath);
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
    
    this.db = this.openDatabase();
    this.verifyIntegrity(); // 启动时检查数据库完整性
    
    // Initialize database tables - 创建表和索引
    this.initializeTables();
    
    // Initialize prepared statements - 预编译SQL以提高性能
    this.initializeStatements();
    
    // Update performance settings - 根据性能模式配置参数
    this.updatePerformanceSettings();
    
    // Start periodic flush loop based on current performance profile
    // 启动定时刷新循环（默认5秒或按配置）
    this.startFlushTimer();
    
    // Start periodic cleanup (every hour)
    // 启动定时清理任务（每小时清理7天前的数据）
    this.cleanupInterval = setInterval(() => {
      this.cleanupTTL(7);
    }, 3600000);
  }

  /**
   * 打开数据库并配置性能参数
   * 
   * 关键配置说明:
   * - journal_mode = WAL: 使用Write-Ahead Logging模式，提高并发写入性能
   * - synchronous = NORMAL: 平衡数据安全性和性能（相比FULL模式更快）
   * - cache_size = -64000: 设置64MB内存缓存（负值单位是KB）
   */
  private openDatabase(): Database.Database {
    const db = new Database(this.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    return db;
  }

  /**
   * 验证数据库完整性
   * 
   * 在启动时检查数据库文件是否损坏
   * 如果损坏则自动触发恢复流程
   */
  private verifyIntegrity(): void {
    try {
      const result = this.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      if (result.integrity_check !== 'ok') {
        logger.warn('Database integrity check failed', { integrity: result.integrity_check });
        this.recoverDatabase();
      }
    } catch (error: any) {
      if (error?.code === 'SQLITE_CORRUPT') {
        logger.error('Database is corrupted, attempting recovery...');
        this.recoverDatabase();
      } else {
        throw error;
      }
    }
  }

  /**
   * 恢复损坏的数据库
   * 
   * 恢复策略：删除损坏文件并重建新数据库
   * - 优点：快速恢复，不影响服务可用性
   * - 缺点：历史数据丢失（但对实时监控系统可接受）
   * 
   * 步骤:
   * 1. 关闭现有连接
   * 2. 备份损坏文件（用于后续分析）
   * 3. 清理WAL/SHM文件
   * 4. 创建新数据库
   * 5. 重新初始化表和语句
   */
  private recoverDatabase(): void {
    logger.warn('Attempting to recover corrupted database...');
    
    try {
      // Close existing database connection
      if (this.db) {
        try {
          this.db.close();
        } catch (error) {
          // Ignore errors when closing corrupted database
        }
      }

      // Backup corrupted database - 备份损坏文件用于分析
      if (existsSync(this.dbPath)) {
        const backupPath = `${this.dbPath}.corrupted.${Date.now()}`;
        try {
          renameSync(this.dbPath, backupPath);
          logger.warn('Corrupted database backed up', { backupPath });
        } catch (error) {
          logger.error('Failed to backup corrupted database', { error });
        }
      }

      // Clean up WAL and SHM files if they exist
      // WAL = Write-Ahead Log, SHM = Shared Memory
      const walPath = `${this.dbPath}-wal`;
      const shmPath = `${this.dbPath}-shm`;
      try {
        if (existsSync(walPath)) unlinkSync(walPath);
        if (existsSync(shmPath)) unlinkSync(shmPath);
      } catch (error) {
        // Ignore errors when removing WAL/SHM files
      }

      // Open new database - 重建干净数据库
      this.db = this.openDatabase();
      this.initializeTables();
      this.initializeStatements();
      
      this.isCorrupted = false;
      logger.info('Database recovery completed successfully');
    } catch (error) {
      logger.error('Database recovery failed', { error });
      this.isCorrupted = true;
      throw error;
    }
  }

  private handleCorruption(error: any): void {
    if (error?.code === 'SQLITE_CORRUPT' && !this.isCorrupted) {
      logger.error('Database corruption detected during operation, attempting recovery...');
      this.isCorrupted = true;
      try {
        this.recoverDatabase();
        logger.info('Database recovered, operation can continue');
      } catch (recoveryError) {
        logger.error('Database recovery failed', { error: recoveryError });
        throw recoveryError;
      }
    } else {
      throw error;
    }
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS frames_raw (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        msg_id INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);

    this.ensureAggregateTable('signals_agg_1s');
    this.ensureAggregateTable('signals_agg_10s');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events_alarm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        signal_name TEXT NOT NULL,
        value REAL NOT NULL,
        level TEXT NOT NULL,
        message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_alarm_timestamp ON events_alarm(timestamp);
    `);
  }

  private ensureAggregateTable(table: 'signals_agg_1s' | 'signals_agg_10s'): void {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS ${table} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        signal_name TEXT NOT NULL,
        last_value REAL NOT NULL,
        first_value REAL NOT NULL,
        avg_value REAL NOT NULL,
        max_value REAL NOT NULL,
        min_value REAL NOT NULL
      );
    `;

    this.db.exec(createTableSql);

    const existingIndexes = this.db.prepare(`PRAGMA index_list(${table})`).all() as Array<{
      name: string;
      unique: number;
      origin: string;
    }>;

    const hasUniqueConstraint = existingIndexes.some((idx) => idx.origin === 'u');

    if (hasUniqueConstraint) {
      const rebuild = this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE ${table}_tmp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            signal_name TEXT NOT NULL,
            last_value REAL NOT NULL,
            first_value REAL NOT NULL,
            avg_value REAL NOT NULL,
            max_value REAL NOT NULL,
            min_value REAL NOT NULL
          );

          INSERT INTO ${table}_tmp (timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value)
          SELECT timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value FROM ${table};

          DROP TABLE ${table};
          ALTER TABLE ${table}_tmp RENAME TO ${table};
        `);
      });

      rebuild();
    }

    const prefix = table === 'signals_agg_1s' ? 'idx_signals_agg_1s' : 'idx_signals_agg_10s';
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS ${prefix}_timestamp ON ${table}(timestamp);
      CREATE INDEX IF NOT EXISTS ${prefix}_signal_name ON ${table}(signal_name);
      CREATE INDEX IF NOT EXISTS ${prefix}_composite ON ${table}(timestamp, signal_name);
    `);
  }

  private initializeStatements(): void {
    this.insert1sStmt = this.db.prepare(`
      INSERT INTO signals_agg_1s
      (timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.insert10sStmt = this.db.prepare(`
      INSERT INTO signals_agg_10s
      (timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    this.cleanupFramesStmt = this.db.prepare('DELETE FROM frames_raw WHERE timestamp < ?');
    this.cleanup1sStmt = this.db.prepare('DELETE FROM signals_agg_1s WHERE timestamp < ?');
    this.cleanup10sStmt = this.db.prepare('DELETE FROM signals_agg_10s WHERE timestamp < ?');
    this.cleanupAlarmStmt = this.db.prepare('DELETE FROM events_alarm WHERE timestamp < ?');
  }

  /**
   * 批量插入信号值 - 核心API方法
   * 
   * 功能: 接收解码后的信号值，聚合到内存时间桶中
   * 
   * 流程:
   * 1. 计算10秒时间桶时间戳 (对齐到10秒边界)
   * 2. 更新10秒桶的统计值 (min/max/avg/sum/count)
   * 3. 如果启用，同时更新1秒桶
   * 4. 递增待写入计数器
   * 5. 达到批量阈值时触发刷新
   * 
   * @param timestamp 信号时间戳（毫秒）
   * @param signalName 信号名称
   * @param value 信号值
   */
  batchInsertSignalValue(timestamp: number, signalName: string, value: number): void {
    // 计算10秒对齐的时间戳: 12345ms -> 10000ms, 123456ms -> 120000ms
    const tenSecondBucketTs = Math.floor(timestamp / 10000) * 10000;
    this.updateBucket(this.tenSecondBuckets, signalName, tenSecondBucketTs, timestamp, value);
    
    // 如果启用1秒聚合，同时更新1秒桶
    if (this.enable1sAggregation) {
      const oneSecondBucketTs = Math.floor(timestamp / 1000) * 1000;
      this.updateBucket(this.oneSecondBuckets, signalName, oneSecondBucketTs, timestamp, value);
    }

    this.pendingCount += 1;

    // 达到批量阈值时立即触发刷新
    if (this.pendingCount >= this.batchSize) {
      this.flush();
    }
  }

  private hasPendingBuckets(): boolean {
    return this.pendingCount > 0;
  }

  private startFlushTimer(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    this.flushInterval = setInterval(() => {
      if (this.hasPendingBuckets()) {
        this.flush();
      }
      // Refresh performance profile periodically to pick up mode changes
      this.updatePerformanceSettings();
    }, this.flushIntervalMs);
  }

  private updatePerformanceSettings(): void {
    const perfConfig = performanceManager.getConfig();
    this.applyPerformanceConfig(perfConfig);
  }

  private applyPerformanceConfig(perfConfig: PerformanceConfig): void {
    const nextBatchSize = Math.max(1, perfConfig.dbBatchSize);
    if (nextBatchSize !== this.batchSize) {
      this.batchSize = nextBatchSize;
    }

    const previousEnable1s = this.enable1sAggregation;
    this.enable1sAggregation = perfConfig.enable1sAggregation;
    if (!this.enable1sAggregation && previousEnable1s) {
      this.oneSecondBuckets.clear();
    }

    const nextFlushInterval = Math.max(100, perfConfig.dbFlushInterval);
    if (nextFlushInterval !== this.flushIntervalMs) {
      this.flushIntervalMs = nextFlushInterval;
      this.startFlushTimer();
    }

    if (this.pendingCount >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * 刷新数据到数据库 - 核心写入逻辑
   * 
   * 功能: 将内存中聚合好的时间桶批量写入数据库
   * 
   * 刷新条件:
   * 1. force=true: 强制刷新所有桶（如关闭时）
   * 2. 时间窗口已过期: 桶的时间戳 + 窗口大小 <= 当前时间
   * 3. 达到批量阈值: pendingCount >= batchSize
   * 
   * 写入策略:
   * - 使用事务确保原子性
   * - 使用PreparedStatement提高性能
   * - 计算avg = sum / count
   * - 批量插入后再清理内存桶
   * 
   * @param force 是否强制刷新所有桶（默认false，只刷新已过期的桶）
   */
  private flush(force: boolean = false): void {
    // 无待写入数据则跳过（除非强制）
    if (!force && !this.hasPendingBuckets()) return;
    if (this.isCorrupted) {
      logger.warn('Skipping flush due to database corruption');
      return;
    }

    const flushStartTime = Date.now();
    const now = flushStartTime;
    const bufferSize = this.pendingCount;

    // 收集可以写入的桶（时间窗口已过期或强制刷新）
    const readyTenSecondBuckets = this.collectReadyBuckets(this.tenSecondBuckets, 10000, now, force);
    const readyOneSecondBuckets =
      this.enable1sAggregation && this.oneSecondBuckets.size > 0
        ? this.collectReadyBuckets(this.oneSecondBuckets, 1000, now, force)
        : [];

    // 没有ready的桶则跳过（除非强制）
    if (!force && readyTenSecondBuckets.length === 0 && readyOneSecondBuckets.length === 0) {
      return;
    }

    // 统计样本数量用于监控
    let successCount = readyTenSecondBuckets.reduce((acc, entry) => acc + entry.bucket.count, 0);
    let errorCount = 0;

    try {
      const transaction = this.db.transaction(() => {
        if (this.enable1sAggregation && readyOneSecondBuckets.length > 0) {
          for (const entry of readyOneSecondBuckets) {
            const avg = entry.bucket.sum / entry.bucket.count;
            this.insert1sStmt!.run(
              entry.bucketTimestamp,
              entry.signalName,
              entry.bucket.lastValue,
              entry.bucket.firstValue,
              avg,
              entry.bucket.max,
              entry.bucket.min
            );
          }
        }

        for (const entry of readyTenSecondBuckets) {
          const avg = entry.bucket.sum / entry.bucket.count;
          this.insert10sStmt!.run(
            entry.bucketTimestamp,
            entry.signalName,
            entry.bucket.lastValue,
            entry.bucket.firstValue,
            avg,
            entry.bucket.max,
            entry.bucket.min
          );
        }
      });

      transaction();
      const duration = Date.now() - flushStartTime;

      const removedFromTenSecond = this.removeBuckets(this.tenSecondBuckets, readyTenSecondBuckets, true);
      if (removedFromTenSecond > 0) {
        this.pendingCount = Math.max(0, this.pendingCount - removedFromTenSecond);
      }
      if (this.enable1sAggregation && readyOneSecondBuckets.length > 0) {
        this.removeBuckets(this.oneSecondBuckets, readyOneSecondBuckets);
      }

      transportMonitor.recordDbFlush(bufferSize, successCount, errorCount, duration);
      if (this.enable1sAggregation) {
        transportMonitor.recordDbOperation(
          'insert',
          'signals_agg_1s',
          true,
          readyOneSecondBuckets.length,
          duration
        );
      }
      transportMonitor.recordDbOperation(
        'insert',
        'signals_agg_10s',
        true,
        readyTenSecondBuckets.length,
        duration
      );

      logger.logDbFlush(bufferSize, successCount, errorCount, duration);
    } catch (error: any) {
      errorCount = successCount;
      const duration = Date.now() - flushStartTime;

      transportMonitor.recordDbFlush(bufferSize, 0, errorCount, duration);
      if (this.enable1sAggregation && readyOneSecondBuckets.length > 0) {
        transportMonitor.recordDbOperation(
          'insert',
          'signals_agg_1s',
          false,
          readyOneSecondBuckets.length,
          duration,
          error
        );
      }
      transportMonitor.recordDbOperation(
        'insert',
        'signals_agg_10s',
        false,
        readyTenSecondBuckets.length,
        duration,
        error
      );

      this.handleCorruption(error);
    }
  }

  private collectReadyBuckets(
    collection: BucketCollection,
    windowSizeMs: number,
    now: number,
    force: boolean
  ): BucketEntry[] {
    const ready: BucketEntry[] = [];
    for (const [signalName, buckets] of collection.entries()) {
      for (const [bucketTimestamp, bucket] of buckets.entries()) {
        if (force || bucketTimestamp + windowSizeMs <= now) {
          ready.push({ signalName, bucketTimestamp, bucket });
        }
      }
    }
    return ready;
  }

  private removeBuckets(
    collection: BucketCollection,
    entries: BucketEntry[],
    trackSamples: boolean = false
  ): number {
    let removedSamples = 0;
    for (const entry of entries) {
      const signalBuckets = collection.get(entry.signalName);
      if (!signalBuckets) continue;

      signalBuckets.delete(entry.bucketTimestamp);
      if (signalBuckets.size === 0) {
        collection.delete(entry.signalName);
      }

      if (trackSamples) {
        removedSamples += entry.bucket.count;
      }
    }
    return removedSamples;
  }

  /**
   * 更新时间桶的统计数据
   * 
   * 功能: 将新的信号值聚合到指定的时间桶中
   * 
   * 聚合逻辑:
   * - 如果桶不存在: 创建新桶，初始化为当前值
   * - 如果桶存在: 更新统计值
   *   - min: 取最小值
   *   - max: 取最大值
   *   - sum: 累加所有值（用于计算avg）
   *   - count: 递增计数
   *   - first/last: 记录时间窗口的首尾值和时间戳
   * 
   * @param collection 桶集合（1秒或10秒）
   * @param signalName 信号名称
   * @param bucketTimestamp 时间桶时间戳（对齐后的）
   * @param timestamp 原始时间戳
   * @param value 信号值
   */
  private updateBucket(
    collection: BucketCollection,
    signalName: string,
    bucketTimestamp: number,
    timestamp: number,
    value: number
  ): void {
    // 获取该信号的所有时间桶
    let signalBuckets = collection.get(signalName);
    if (!signalBuckets) {
      signalBuckets = new Map();
      collection.set(signalName, signalBuckets);
    }

    // 获取指定的时间桶
    const bucket = signalBuckets.get(bucketTimestamp);
    if (!bucket) {
      // 新桶：初始化为当前值
      signalBuckets.set(bucketTimestamp, {
        firstTimestamp: timestamp,
        firstValue: value,
        lastTimestamp: timestamp,
        lastValue: value,
        sum: value,
        min: value,
        max: value,
        count: 1,
      });
      return;
    }

    // 已存在桶：更新统计值
    
    // 更新首尾值和时间戳
    if (timestamp < bucket.firstTimestamp) {
      bucket.firstTimestamp = timestamp;
      bucket.firstValue = value;
    }
    if (timestamp >= bucket.lastTimestamp) {
      bucket.lastTimestamp = timestamp;
      bucket.lastValue = value;
    }
    
    // 更新聚合统计
    bucket.sum += value;
    bucket.count += 1;
    if (value > bucket.max) {
      bucket.max = value;
    }
    if (value < bucket.min) {
      bucket.min = value;
    }
  }

  /**
   * 查询历史数据
   * 
   * 功能: 根据时间范围和精度查询聚合后的历史信号值
   * 
   * 查询策略:
   * - 根据step选择1秒表或10秒表
   * - 使用索引优化 (timestamp, signal_name)
   * - 返回聚合统计值而非原始值
   * 
   * 使用场景:
   * - 1s: 近期历史，细粒度分析（如过去1小时）
   * - 10s: 长期历史，趋势分析（如过去1天）
   * 
   * @param signals 信号名称列表
   * @param from 起始时间
   * @param to 结束时间
   * @param step 时间精度 ('1s' | '10s')
   * @returns 聚合数据列表
   */
  queryHistory(signals: string[], from: Date, to: Date, step: '1s' | '10s' = '1s'): DbSignalAgg[] {
    if (this.isCorrupted) {
      logger.warn('Database is corrupted, returning empty history');
      return [];
    }

    try {
      const fromTs = from.getTime();
      const toTs = to.getTime();
      const placeholders = signals.map(() => '?').join(',');

      // 动态SQL（因为信号数量可变）
      // 注意：可以通过缓存常用数量的statement进一步优化
      const stmt = this.db.prepare(`
        SELECT timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value
        FROM ${step === '1s' ? 'signals_agg_1s' : 'signals_agg_10s'}
        WHERE timestamp >= ? AND timestamp <= ? AND signal_name IN (${placeholders})
        ORDER BY timestamp ASC, signal_name ASC
      `);

      const rows = stmt.all(fromTs, toTs, ...signals) as any[];
      
      return rows.map((row) => ({
        timestamp: row.timestamp,
        signal_name: row.signal_name,
        last_value: row.last_value,
        first_value: row.first_value,
        avg_value: row.avg_value,
        max_value: row.max_value,
        min_value: row.min_value,
      }));
    } catch (error: any) {
      this.handleCorruption(error);
      return [];
    }
  }

  /**
   * 按TTL清理过期数据
   * 
   * 功能: 删除指定天数前的数据，控制数据库大小
   * 
   * 清理策略:
   * - 默认清理7天前的数据
   * - 批量删除所有表的过期数据
   * - 10%概率执行VACUUM（碎片整理，较耗时）
   * 
   * 执行时机:
   * - 每小时自动执行一次
   * 
   * @param days 保留天数（默认7天）
   */
  cleanupTTL(days: number = 7): void {
    if (this.isCorrupted) {
      logger.warn('Skipping cleanup due to database corruption');
      return;
    }

    try {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      
      // 使用预编译语句批量删除
      this.cleanupFramesStmt!.run(cutoff);
      this.cleanup1sStmt!.run(cutoff);
      this.cleanup10sStmt!.run(cutoff);
      this.cleanupAlarmStmt!.run(cutoff);
      
      // Run VACUUM periodically to reclaim space (but not too often)
      // VACUUM会整理数据库碎片并回收空间，但较耗时
      // 使用10%概率避免频繁执行
      if (Math.random() < 0.1) { // 10% chance each cleanup
        this.db.exec('VACUUM');
      }
    } catch (error: any) {
      this.handleCorruption(error);
    }
  }

  /**
   * 获取信号快照（最新值）
   * 
   * 功能: 查询每个信号的最新值，用于实时显示
   * 
   * 查询策略:
   * - 使用子查询获取每个信号的最大时间戳
   * - 仅返回last_value（最新值）
   * - 从1秒表中查询（更精确）
   * 
   * 使用场景:
   * - 实时仪表盘
   * - 状态监控
   * - API快照接口
   * 
   * @param signals 信号名称列表
   * @returns 信号名到最新值的映射
   */
  getSnapshot(signals: string[]): Record<string, number> {
    if (signals.length === 0) return {};
    if (this.isCorrupted) {
      logger.warn('Database is corrupted, returning empty snapshot');
      return {};
    }

    try {
      const placeholders = signals.map(() => '?').join(',');
      // 使用子查询获取每个信号的最新值
      const stmt = this.db.prepare(`
        SELECT signal_name, last_value
        FROM signals_agg_1s s1
        WHERE signal_name IN (${placeholders})
          AND timestamp = (
            SELECT MAX(timestamp)
            FROM signals_agg_1s s2
            WHERE s2.signal_name = s1.signal_name
          )
      `);

      const rows = stmt.all(...signals) as any[];
      const snapshot: Record<string, number> = {};

      for (const row of rows) {
        snapshot[row.signal_name] = row.last_value;
      }

      return snapshot;
    } catch (error: any) {
      this.handleCorruption(error);
      return {};
    }
  }

  close(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (!this.isCorrupted) {
      try {
        this.flush(true);
      } catch (error) {
        logger.error('Error during final flush', { error });
      }
    }
    try {
      this.db.close();
    } catch (error) {
      logger.error('Error closing database', { error });
    }
  }
}

export const dbRepo = new DbRepo();

