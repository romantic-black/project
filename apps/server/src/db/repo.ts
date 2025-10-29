import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import type { DbSignalAgg } from '@can-telemetry/common';
import config, { PROJECT_ROOT } from '../config.js';
import * as schema from './schema.js';

export class DbRepo {
  private db: Database.Database;
  private batchSize = 100;
  private buffer: Array<{
    timestamp: number;
    signalName: string;
    value: number;
  }> = [];
  private flushInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  
  // Cached prepared statements
  private insert1sStmt?: Database.Statement;
  private insert10sStmt?: Database.Statement;
  private cleanupFramesStmt?: Database.Statement;
  private cleanup1sStmt?: Database.Statement;
  private cleanup10sStmt?: Database.Statement;
  private cleanupAlarmStmt?: Database.Statement;

  constructor() {
    const dbPath = config.DB_PATH.startsWith('/')
      ? config.DB_PATH
      : join(PROJECT_ROOT, config.DB_PATH);
    
    // Ensure database directory exists
    const dbDir = dirname(dbPath);
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000'); // 64MB cache
    
    // Initialize database tables
    this.initializeTables();
    
    // Initialize prepared statements
    this.initializeStatements();
    
    // Start periodic flush (every 5 seconds)
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, 5000);
    
    // Start periodic cleanup (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cleanupTTL(7);
    }, 3600000);
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS frames_raw (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        msg_id INTEGER NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS signals_agg_1s (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        signal_name TEXT NOT NULL,
        last_value REAL NOT NULL,
        first_value REAL NOT NULL,
        avg_value REAL NOT NULL,
        max_value REAL NOT NULL,
        min_value REAL NOT NULL,
        UNIQUE(timestamp, signal_name)
      );

      CREATE INDEX IF NOT EXISTS idx_signals_agg_1s_timestamp ON signals_agg_1s(timestamp);
      CREATE INDEX IF NOT EXISTS idx_signals_agg_1s_signal_name ON signals_agg_1s(signal_name);
      CREATE INDEX IF NOT EXISTS idx_signals_agg_1s_composite ON signals_agg_1s(timestamp, signal_name);

      CREATE TABLE IF NOT EXISTS signals_agg_10s (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        signal_name TEXT NOT NULL,
        last_value REAL NOT NULL,
        first_value REAL NOT NULL,
        avg_value REAL NOT NULL,
        max_value REAL NOT NULL,
        min_value REAL NOT NULL,
        UNIQUE(timestamp, signal_name)
      );

      CREATE INDEX IF NOT EXISTS idx_signals_agg_10s_timestamp ON signals_agg_10s(timestamp);
      CREATE INDEX IF NOT EXISTS idx_signals_agg_10s_signal_name ON signals_agg_10s(signal_name);
      CREATE INDEX IF NOT EXISTS idx_signals_agg_10s_composite ON signals_agg_10s(timestamp, signal_name);

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

  private initializeStatements(): void {
    // Use INSERT OR REPLACE to handle duplicate (timestamp, signal_name) pairs
    this.insert1sStmt = this.db.prepare(`
      INSERT OR REPLACE INTO signals_agg_1s 
      (timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    this.insert10sStmt = this.db.prepare(`
      INSERT OR REPLACE INTO signals_agg_10s 
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

  private flush(): void {
    if (this.buffer.length === 0) return;

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

    const transaction = this.db.transaction(() => {
      // Process 1s aggregates
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
      }

      // Process 10s aggregates
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
      }
    });

    transaction();
    this.buffer = [];
  }

  queryHistory(signals: string[], from: Date, to: Date, step: '1s' | '10s' = '1s'): DbSignalAgg[] {
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
  }

  cleanupTTL(days: number = 7): void {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    
    this.cleanupFramesStmt!.run(cutoff);
    this.cleanup1sStmt!.run(cutoff);
    this.cleanup10sStmt!.run(cutoff);
    this.cleanupAlarmStmt!.run(cutoff);
    
    // Run VACUUM periodically to reclaim space (but not too often)
    if (Math.random() < 0.1) { // 10% chance each cleanup
      this.db.exec('VACUUM');
    }
  }

  getSnapshot(signals: string[]): Record<string, number> {
    if (signals.length === 0) return {};
    
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
  }

  close(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.flush();
    this.db.close();
  }
}

export const dbRepo = new DbRepo();

