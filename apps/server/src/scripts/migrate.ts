import Database from 'better-sqlite3';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import config, { PROJECT_ROOT } from '../config.js';

const dbPath = config.DB_PATH.startsWith('/')
  ? config.DB_PATH
  : join(PROJECT_ROOT, config.DB_PATH);

async function main() {
  console.log('Creating database tables...');
  
  // Ensure database directory exists
  const dbDir = dirname(dbPath);
  try {
    await mkdir(dbDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
  }
  
  const sqlite = new Database(dbPath);
  
  sqlite.exec(`
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
      min_value REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_signals_agg_1s_timestamp ON signals_agg_1s(timestamp);
    CREATE INDEX IF NOT EXISTS idx_signals_agg_1s_signal_name ON signals_agg_1s(signal_name);

    CREATE TABLE IF NOT EXISTS signals_agg_10s (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      signal_name TEXT NOT NULL,
      last_value REAL NOT NULL,
      first_value REAL NOT NULL,
      avg_value REAL NOT NULL,
      max_value REAL NOT NULL,
      min_value REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_signals_agg_10s_timestamp ON signals_agg_10s(timestamp);
    CREATE INDEX IF NOT EXISTS idx_signals_agg_10s_signal_name ON signals_agg_10s(signal_name);

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

  console.log('Database tables created successfully');
  sqlite.close();
}

main();

