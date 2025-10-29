import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const framesRaw = sqliteTable('frames_raw', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  msgId: integer('msg_id').notNull(),
  data: text('data').notNull(),
});

export const signalsAgg1s = sqliteTable('signals_agg_1s', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().index(),
  signalName: text('signal_name').notNull().index(),
  lastValue: real('last_value').notNull(),
  firstValue: real('first_value').notNull(),
  avgValue: real('avg_value').notNull(),
  maxValue: real('max_value').notNull(),
  minValue: real('min_value').notNull(),
});

export const signalsAgg10s = sqliteTable('signals_agg_10s', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().index(),
  signalName: text('signal_name').notNull().index(),
  lastValue: real('last_value').notNull(),
  firstValue: real('first_value').notNull(),
  avgValue: real('avg_value').notNull(),
  maxValue: real('max_value').notNull(),
  minValue: real('min_value').notNull(),
});

export const eventsAlarm = sqliteTable('events_alarm', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull().index(),
  signalName: text('signal_name').notNull(),
  value: real('value').notNull(),
  level: text('level').notNull(),
  message: text('message'),
});

