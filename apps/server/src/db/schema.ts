import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/**
 * 原始CAN帧表 - 存储未解码的原始CAN帧数据
 * 注意：当前系统中此表已定义但未实际使用，主要使用聚合表
 */
export const framesRaw = sqliteTable('frames_raw', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(), // 帧接收时间戳（毫秒）
  msgId: integer('msg_id').notNull(), // CAN消息ID
  data: text('data').notNull(), // 原始数据（十六进制字符串）
});

/**
 * 1秒聚合表 - 存储信号值的1秒时间窗口聚合统计
 * 用途：实时数据查询、历史数据展示（细粒度）
 * 
 * 聚合字段说明：
 * - lastValue: 时间窗口内最后一个值（用于实时显示）
 * - firstValue: 时间窗口内第一个值
 * - avgValue: 平均值（sum/count）
 * - maxValue: 最大值
 * - minValue: 最小值
 * 
 * 索引优化：
 * - timestamp: 按时间范围查询
 * - signalName: 按信号名查询
 * - composite: 联合查询（时间+信号名，最常用）
 */
export const signalsAgg1s = sqliteTable(
  'signals_agg_1s',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(), // 时间窗口起始时间（秒对齐）
    signalName: text('signal_name').notNull(), // 信号名称
    lastValue: real('last_value').notNull(), // 窗口内最后一个值
    firstValue: real('first_value').notNull(), // 窗口内第一个值
    avgValue: real('avg_value').notNull(), // 平均值
    maxValue: real('max_value').notNull(), // 最大值
    minValue: real('min_value').notNull(), // 最小值
  },
  (table) => ({
    timestampIdx: index('idx_signals_agg_1s_timestamp').on(table.timestamp),
    signalNameIdx: index('idx_signals_agg_1s_signal_name').on(table.signalName),
    compositeIdx: index('idx_signals_agg_1s_composite').on(table.timestamp, table.signalName),
  })
);

/**
 * 10秒聚合表 - 存储信号值的10秒时间窗口聚合统计
 * 用途：长期历史数据查询、数据归档（粗粒度）
 * 
 * 与1秒聚合表的区别：
 * - 时间窗口更大（10秒 vs 1秒），数据压缩率更高
 * - 适用于长期趋势分析
 * - 节省存储空间
 * 
 * 注意：1秒聚合在某些情况下可能被禁用（性能优化）
 */
export const signalsAgg10s = sqliteTable(
  'signals_agg_10s',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(), // 时间窗口起始时间（10秒对齐）
    signalName: text('signal_name').notNull(),
    lastValue: real('last_value').notNull(),
    firstValue: real('first_value').notNull(),
    avgValue: real('avg_value').notNull(),
    maxValue: real('max_value').notNull(),
    minValue: real('min_value').notNull(),
  },
  (table) => ({
    timestampIdx: index('idx_signals_agg_10s_timestamp').on(table.timestamp),
    signalNameIdx: index('idx_signals_agg_10s_signal_name').on(table.signalName),
    compositeIdx: index('idx_signals_agg_10s_composite').on(table.timestamp, table.signalName),
  })
);

/**
 * 告警事件表 - 存储信号异常或告警信息
 * 用途：故障诊断、告警历史查询
 */
export const eventsAlarm = sqliteTable(
  'events_alarm',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(), // 告警发生时间
    signalName: text('signal_name').notNull(), // 触发告警的信号名
    value: real('value').notNull(), // 告警时的信号值
    level: text('level').notNull(), // 告警级别（如：error, warning, info）
    message: text('message'), // 可选的详细消息
  },
  (table) => ({
    timestampIdx: index('idx_events_alarm_timestamp').on(table.timestamp),
  })
);

