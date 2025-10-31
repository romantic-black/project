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

interface AggregateBucket {
  firstTimestamp: number;
  firstValue: number;
  lastTimestamp: number;
  lastValue: number;
  sum: number;
  min: number;
  max: number;
  count: number;
}

type BucketCollection = Map<string, Map<number, AggregateBucket>>;

interface BucketEntry {
  signalName: string;
  bucketTimestamp: number;
  bucket: AggregateBucket;
}

export class DbRepo {
  private db: Database.Database;
  private dbPath: string;
  private batchSize = 100;
  private pendingCount = 0;
  private oneSecondBuckets: BucketCollection = new Map();
  private tenSecondBuckets: BucketCollection = new Map();
  private flushInterval?: NodeJS.Timeout;
  private flushIntervalMs = 5000;
  private cleanupInterval?: NodeJS.Timeout;
  private isCorrupted = false;
  private enable1sAggregation = true;
  
  // Cached prepared statements
  private insert1sStmt?: Database.Statement;
  private insert10sStmt?: Database.Statement;
  private cleanupFramesStmt?: Database.Statement;
  private cleanup1sStmt?: Database.Statement;
  private cleanup10sStmt?: Database.Statement;
  private cleanupAlarmStmt?: Database.Statement;

  constructor() {
    this.dbPath = config.DB_PATH.startsWith('/')
      ? config.DB_PATH
      : join(PROJECT_ROOT, config.DB_PATH);
    
    // Ensure database directory exists
    const dbDir = dirname(this.dbPath);
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
    
    this.db = this.openDatabase();
    this.verifyIntegrity();
    
    // Initialize database tables
    this.initializeTables();
    
    // Initialize prepared statements
    this.initializeStatements();
    
    // Update performance settings
    this.updatePerformanceSettings();
    
    // Start periodic flush loop based on current performance profile
    this.startFlushTimer();
    
    // Start periodic cleanup (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanupTTL(7);
    }, 3600000);
  }

  private openDatabase(): Database.Database {
    const db = new Database(this.dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    return db;
  }

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

      // Backup corrupted database
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
      const walPath = `${this.dbPath}-wal`;
      const shmPath = `${this.dbPath}-shm`;
      try {
        if (existsSync(walPath)) unlinkSync(walPath);
        if (existsSync(shmPath)) unlinkSync(shmPath);
      } catch (error) {
        // Ignore errors when removing WAL/SHM files
      }

      // Open new database
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

  batchInsertSignalValue(timestamp: number, signalName: string, value: number): void {
    const tenSecondBucketTs = Math.floor(timestamp / 10000) * 10000;
    this.updateBucket(this.tenSecondBuckets, signalName, tenSecondBucketTs, timestamp, value);
    if (this.enable1sAggregation) {
      const oneSecondBucketTs = Math.floor(timestamp / 1000) * 1000;
      this.updateBucket(this.oneSecondBuckets, signalName, oneSecondBucketTs, timestamp, value);
    }

    this.pendingCount += 1;

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

  private flush(force: boolean = false): void {
    if (!force && !this.hasPendingBuckets()) return;
    if (this.isCorrupted) {
      logger.warn('Skipping flush due to database corruption');
      return;
    }

    const flushStartTime = Date.now();
    const now = flushStartTime;
    const bufferSize = this.pendingCount;

    const readyTenSecondBuckets = this.collectReadyBuckets(this.tenSecondBuckets, 10000, now, force);
    const readyOneSecondBuckets =
      this.enable1sAggregation && this.oneSecondBuckets.size > 0
        ? this.collectReadyBuckets(this.oneSecondBuckets, 1000, now, force)
        : [];

    if (!force && readyTenSecondBuckets.length === 0 && readyOneSecondBuckets.length === 0) {
      return;
    }

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

  private updateBucket(
    collection: BucketCollection,
    signalName: string,
    bucketTimestamp: number,
    timestamp: number,
    value: number
  ): void {
    let signalBuckets = collection.get(signalName);
    if (!signalBuckets) {
      signalBuckets = new Map();
      collection.set(signalName, signalBuckets);
    }

    const bucket = signalBuckets.get(bucketTimestamp);
    if (!bucket) {
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

    if (timestamp < bucket.firstTimestamp) {
      bucket.firstTimestamp = timestamp;
      bucket.firstValue = value;
    }
    if (timestamp >= bucket.lastTimestamp) {
      bucket.lastTimestamp = timestamp;
      bucket.lastValue = value;
    }
    bucket.sum += value;
    bucket.count += 1;
    if (value > bucket.max) {
      bucket.max = value;
    }
    if (value < bucket.min) {
      bucket.min = value;
    }
  }

  queryHistory(signals: string[], from: Date, to: Date, step: '1s' | '10s' = '1s'): DbSignalAgg[] {
    if (this.isCorrupted) {
      logger.warn('Database is corrupted, returning empty history');
      return [];
    }

    try {
      const fromTs = from.getTime();
      const toTs = to.getTime();
      const placeholders = signals.map(() => '?').join(',');

      // Use cached statement if available, otherwise create new one
      // Note: We need dynamic statements because signals array can vary in length
      // But we can optimize by preparing a statement for common signal counts
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

  cleanupTTL(days: number = 7): void {
    if (this.isCorrupted) {
      logger.warn('Skipping cleanup due to database corruption');
      return;
    }

    try {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      
      this.cleanupFramesStmt!.run(cutoff);
      this.cleanup1sStmt!.run(cutoff);
      this.cleanup10sStmt!.run(cutoff);
      this.cleanupAlarmStmt!.run(cutoff);
      
      // Run VACUUM periodically to reclaim space (but not too often)
      if (Math.random() < 0.1) { // 10% chance each cleanup
        this.db.exec('VACUUM');
      }
    } catch (error: any) {
      this.handleCorruption(error);
    }
  }

  getSnapshot(signals: string[]): Record<string, number> {
    if (signals.length === 0) return {};
    if (this.isCorrupted) {
      logger.warn('Database is corrupted, returning empty snapshot');
      return {};
    }

    try {
      const placeholders = signals.map(() => '?').join(',');
      // Get the latest value for each signal using a subquery
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

