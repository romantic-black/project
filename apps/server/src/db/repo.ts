import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import type { DbSignalAgg } from '@can-telemetry/common';
import config, { PROJECT_ROOT } from '../config.js';
import * as schema from './schema.js';
import { createLogger } from '../utils/logger.js';
import { transportMonitor } from './transport-monitor.js';
import { performanceManager } from '../performance/manager.js';

const logger = createLogger('db-repo');

export class DbRepo {
  private db: Database.Database;
  private dbPath: string;
  private batchSize = 100;
  private buffer: Array<{
    timestamp: number;
    signalName: string;
    value: number;
  }> = [];
  private flushInterval?: NodeJS.Timeout;
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
    
    // Start periodic flush (interval based on performance mode)
    const flushIntervalMs = performanceManager.getConfig().dbFlushInterval;
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
      // Update settings periodically in case mode changed
      this.updatePerformanceSettings();
    }, flushIntervalMs);
    
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
    this.buffer.push({ timestamp, signalName, value });

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  private updatePerformanceSettings(): void {
    const perfConfig = performanceManager.getConfig();
    this.enable1sAggregation = perfConfig.enable1sAggregation;
    
    // Update flush interval would require recreating interval, which is handled
    // by checking in the interval callback
  }

  private flush(): void {
    if (this.buffer.length === 0) return;
    if (this.isCorrupted) {
      logger.warn('Skipping flush due to database corruption');
      this.buffer = [];
      return;
    }

    const flushStartTime = Date.now();
    const bufferSize = this.buffer.length;
    let successCount = 0;
    let errorCount = 0;

    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const tenSecondsAgo = now - 10000;

    const grouped = new Map<string, Array<{ timestamp: number; value: number }>>();

    for (const item of this.buffer) {
      if (!grouped.has(item.signalName)) {
        grouped.set(item.signalName, []);
      }
      grouped.get(item.signalName)!.push({ timestamp: item.timestamp, value: item.value });
    }

    // Group by time windows to avoid duplicate inserts
    const oneSecondBuckets = new Map<string, Array<{ timestamp: number; value: number }>>();
    const tenSecondBuckets = new Map<string, Array<{ timestamp: number; value: number }>>();

    for (const [signalName, values] of grouped.entries()) {
      if (values.length === 0) continue;

      const oneSecondWindow = values.filter((v) => v.timestamp >= oneSecondAgo);
      if (oneSecondWindow.length > 0) {
        const bucketKey = `${Math.floor(oneSecondAgo / 1000) * 1000}_${signalName}`;
        if (!oneSecondBuckets.has(bucketKey)) {
          oneSecondBuckets.set(bucketKey, []);
        }
        oneSecondBuckets.get(bucketKey)!.push(...oneSecondWindow);
      }

      const tenSecondWindow = values.filter((v) => v.timestamp >= tenSecondsAgo);
      if (tenSecondWindow.length > 0) {
        const bucketKey = `${Math.floor(tenSecondsAgo / 10000) * 10000}_${signalName}`;
        if (!tenSecondBuckets.has(bucketKey)) {
          tenSecondBuckets.set(bucketKey, []);
        }
        tenSecondBuckets.get(bucketKey)!.push(...tenSecondWindow);
      }
    }

    try {
      const transaction = this.db.transaction(() => {
        // Process 1s aggregates (only if enabled)
        if (this.enable1sAggregation) {
          for (const [bucketKey, windowValues] of oneSecondBuckets.entries()) {
            if (windowValues.length === 0) continue;
            
            const [timestampStr, signalName] = bucketKey.split('_');
            const timestamp = parseInt(timestampStr, 10);
            
            // Sort by timestamp to get correct first/last
            windowValues.sort((a, b) => a.timestamp - b.timestamp);
            
            const last1s = windowValues[windowValues.length - 1];
            const first1s = windowValues[0];
            const sum1s = windowValues.reduce((acc, v) => acc + v.value, 0);
            const avg1s = sum1s / windowValues.length;
            const max1s = Math.max(...windowValues.map((v) => v.value));
            const min1s = Math.min(...windowValues.map((v) => v.value));

            this.insert1sStmt!.run(
              timestamp,
              signalName,
              last1s.value,
              first1s.value,
              avg1s,
              max1s,
              min1s
            );
            successCount += windowValues.length;
          }
        }

        // Process 10s aggregates (always enabled)
        for (const [bucketKey, windowValues] of tenSecondBuckets.entries()) {
          if (windowValues.length === 0) continue;
          
          const [timestampStr, signalName] = bucketKey.split('_');
          const timestamp = parseInt(timestampStr, 10);
          
          // Sort by timestamp to get correct first/last
          windowValues.sort((a, b) => a.timestamp - b.timestamp);
          
          const last10s = windowValues[windowValues.length - 1];
          const first10s = windowValues[0];
          const sum10s = windowValues.reduce((acc, v) => acc + v.value, 0);
          const avg10s = sum10s / windowValues.length;
          const max10s = Math.max(...windowValues.map((v) => v.value));
          const min10s = Math.min(...windowValues.map((v) => v.value));

          this.insert10sStmt!.run(
            timestamp,
            signalName,
            last10s.value,
            first10s.value,
            avg10s,
            max10s,
            min10s
          );
          successCount += windowValues.length;
        }
      });

      transaction();
      const duration = Date.now() - flushStartTime;
      
      // Record successful operation
      transportMonitor.recordDbFlush(bufferSize, successCount, errorCount, duration);
      if (this.enable1sAggregation) {
        transportMonitor.recordDbOperation('insert', 'signals_agg_1s', true, oneSecondBuckets.size, duration);
      }
      transportMonitor.recordDbOperation('insert', 'signals_agg_10s', true, tenSecondBuckets.size, duration);
      
      logger.logDbFlush(bufferSize, successCount, errorCount, duration);
      this.buffer = [];
    } catch (error: any) {
      errorCount = bufferSize;
      const duration = Date.now() - flushStartTime;
      
      // Record failed operation
      transportMonitor.recordDbFlush(bufferSize, 0, errorCount, duration);
      if (this.enable1sAggregation) {
        transportMonitor.recordDbOperation('insert', 'signals_agg_1s', false, 0, duration, error);
      }
      transportMonitor.recordDbOperation('insert', 'signals_agg_10s', false, 0, duration, error);
      
      this.handleCorruption(error);
      // Retry flush after recovery (but only once to avoid infinite loop)
      if (!this.isCorrupted && this.buffer.length > 0) {
        try {
          const retryStartTime = Date.now();
          const transaction = this.db.transaction(() => {
            // Process 1s aggregates (only if enabled)
            if (this.enable1sAggregation) {
              for (const [bucketKey, windowValues] of oneSecondBuckets.entries()) {
                if (windowValues.length === 0) continue;
                
                const [timestampStr, signalName] = bucketKey.split('_');
                const timestamp = parseInt(timestampStr, 10);
                
                windowValues.sort((a, b) => a.timestamp - b.timestamp);
                
                const last1s = windowValues[windowValues.length - 1];
                const first1s = windowValues[0];
                const sum1s = windowValues.reduce((acc, v) => acc + v.value, 0);
                const avg1s = sum1s / windowValues.length;
                const max1s = Math.max(...windowValues.map((v) => v.value));
                const min1s = Math.min(...windowValues.map((v) => v.value));

                this.insert1sStmt!.run(
                  timestamp,
                  signalName,
                  last1s.value,
                  first1s.value,
                  avg1s,
                  max1s,
                  min1s
                );
              }
            }

            // Process 10s aggregates
            for (const [bucketKey, windowValues] of tenSecondBuckets.entries()) {
              if (windowValues.length === 0) continue;
              
              const [timestampStr, signalName] = bucketKey.split('_');
              const timestamp = parseInt(timestampStr, 10);
              
              windowValues.sort((a, b) => a.timestamp - b.timestamp);
              
              const last10s = windowValues[windowValues.length - 1];
              const first10s = windowValues[0];
              const sum10s = windowValues.reduce((acc, v) => acc + v.value, 0);
              const avg10s = sum10s / windowValues.length;
              const max10s = Math.max(...windowValues.map((v) => v.value));
              const min10s = Math.min(...windowValues.map((v) => v.value));

              this.insert10sStmt!.run(
                timestamp,
                signalName,
                last10s.value,
                first10s.value,
                avg10s,
                max10s,
                min10s
              );
            }
          });

          transaction();
          const retryDuration = Date.now() - retryStartTime;
          transportMonitor.recordDbFlush(bufferSize, bufferSize, 0, retryDuration);
          this.buffer = [];
        } catch (retryError) {
          logger.logDbError('flush_retry', 'signals_agg', retryError as Error, {
            errorCode: 'DB_FLUSH_RETRY_FAILED',
          });
          this.buffer = [];
        }
      } else {
        this.buffer = [];
      }
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
        this.flush();
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

