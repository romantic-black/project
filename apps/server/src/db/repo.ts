import Database from 'better-sqlite3';
import { join } from 'path';
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

  constructor() {
    const dbPath = config.DB_PATH.startsWith('/')
      ? config.DB_PATH
      : join(PROJECT_ROOT, config.DB_PATH);
    
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
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

    const transaction = this.db.transaction(() => {
      for (const [signalName, values] of grouped.entries()) {
        if (values.length === 0) continue;

        const latest = values[values.length - 1];
        const first = values[0];
        const sum = values.reduce((acc, v) => acc + v.value, 0);
        const avg = sum / values.length;
        const max = Math.max(...values.map((v) => v.value));
        const min = Math.min(...values.map((v) => v.value));

        const oneSecondWindow = values.filter((v) => v.timestamp >= oneSecondAgo);
        if (oneSecondWindow.length > 0) {
          const agg1s = this.db
            .prepare(
              'INSERT INTO signals_agg_1s (timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .run(
              Math.floor(oneSecondAgo / 1000) * 1000,
              signalName,
              latest.value,
              first.value,
              avg,
              max,
              min
            );
        }

        const tenSecondWindow = values.filter((v) => v.timestamp >= tenSecondsAgo);
        if (tenSecondWindow.length > 0) {
          const agg10s = this.db
            .prepare(
              'INSERT INTO signals_agg_10s (timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value) VALUES (?, ?, ?, ?, ?, ?, ?)'
            )
            .run(
              Math.floor(tenSecondsAgo / 10000) * 10000,
              signalName,
              latest.value,
              first.value,
              avg,
              max,
              min
            );
        }
      }
    });

    transaction();
    this.buffer = [];
  }

  queryHistory(signals: string[], from: Date, to: Date, step: '1s' | '10s' = '1s'): DbSignalAgg[] {
    const table = step === '1s' ? 'signals_agg_1s' : 'signals_agg_10s';
    const fromTs = from.getTime();
    const toTs = to.getTime();
    const placeholders = signals.map(() => '?').join(',');

    const stmt = this.db.prepare(`
      SELECT timestamp, signal_name, last_value, first_value, avg_value, max_value, min_value
      FROM ${table}
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
    
    this.db.prepare('DELETE FROM frames_raw WHERE timestamp < ?').run(cutoff);
    this.db.prepare('DELETE FROM signals_agg_1s WHERE timestamp < ?').run(cutoff);
    this.db.prepare('DELETE FROM signals_agg_10s WHERE timestamp < ?').run(cutoff);
    this.db.prepare('DELETE FROM events_alarm WHERE timestamp < ?').run(cutoff);
  }

  getSnapshot(signals: string[]): Record<string, number> {
    const placeholders = signals.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT signal_name, last_value
      FROM signals_agg_1s
      WHERE signal_name IN (${placeholders})
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(...signals, signals.length) as any[];
    const snapshot: Record<string, number> = {};

    for (const row of rows) {
      snapshot[row.signal_name] = row.last_value;
    }

    return snapshot;
  }

  close(): void {
    this.flush();
    this.db.close();
  }
}

export const dbRepo = new DbRepo();

