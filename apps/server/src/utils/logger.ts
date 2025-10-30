import pino from 'pino';
import config from '../config.js';

// Enhanced logger with structured logging for AI analysis
const baseLogger = pino({
  level: config.LOG_LEVEL,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export interface LogContext {
  [key: string]: any;
}

export interface ErrorLogContext extends LogContext {
  errorCode?: string;
  errorType?: string;
  expectedValue?: any;
  actualValue?: any;
  failureReason?: string;
  rawData?: string | Buffer;
  stack?: string;
}

export class EnhancedLogger {
  private logger: pino.Logger;

  constructor(moduleName: string) {
    this.logger = baseLogger.child({ module: moduleName });
  }

  // CAN frame operations
  logCanFrameReceived(
    frameId: number,
    dataLength: number,
    timestamp: number,
    context?: LogContext
  ): void {
    this.logger.info({
      operation: 'can_frame_received',
      frameId,
      dataLength,
      timestamp,
      ...context,
    }, `CAN frame received: ID=0x${frameId.toString(16)}`);
  }

  logCanFrameDecodeStart(
    frameId: number,
    messageName: string,
    rawData: Buffer | string,
    context?: LogContext
  ): void {
    const dataStr = rawData instanceof Buffer ? rawData.toString('hex') : rawData;
    this.logger.debug({
      operation: 'can_decode_start',
      frameId,
      messageName,
      rawData: dataStr,
      ...context,
    }, `Starting decode: ${messageName} (ID=0x${frameId.toString(16)})`);
  }

  logSignalDecode(
    frameId: number,
    signalName: string,
    rawValue: number,
    scaledValue: number,
    finalValue: number,
    context?: LogContext
  ): void {
    this.logger.debug({
      operation: 'signal_decode',
      frameId,
      signalName,
      rawValue,
      scaledValue,
      finalValue,
      ...context,
    }, `Signal decoded: ${signalName}=${finalValue}`);
  }

  logDecodeError(
    frameId: number,
    messageName: string,
    signalName: string,
    error: Error,
    context?: ErrorLogContext
  ): void {
    this.logger.error({
      operation: 'decode_error',
      frameId,
      messageName,
      signalName,
      errorCode: context?.errorCode || 'DECODE_ERROR',
      errorType: context?.errorType || error.name,
      errorMessage: error.message,
      failureReason: context?.failureReason,
      expectedValue: context?.expectedValue,
      actualValue: context?.actualValue,
      rawData: context?.rawData,
      stack: error.stack,
      ...context,
    }, `Decode error: ${signalName} in ${messageName}`);
  }

  logUnknownCanId(canId: number, rawData: Buffer | string, context?: LogContext): void {
    const dataStr = rawData instanceof Buffer ? rawData.toString('hex') : rawData;
    this.logger.warn({
      operation: 'unknown_can_id',
      canId,
      rawData: dataStr,
      ...context,
    }, `Unknown CAN ID: 0x${canId.toString(16)}`);
  }

  logLifeCntCheck(
    frameId: number,
    signalName: string,
    current: number,
    previous: number | undefined,
    isValid: boolean,
    context?: LogContext
  ): void {
    this.logger.debug({
      operation: 'lifecnt_check',
      frameId,
      signalName,
      current,
      previous,
      isValid,
      ...context,
    }, `LifeCnt check: ${signalName} current=${current}, previous=${previous}, valid=${isValid}`);
  }

  logChecksumCheck(
    frameId: number,
    signalName: string,
    calculated: number,
    received: number,
    isValid: boolean,
    context?: LogContext
  ): void {
    this.logger.debug({
      operation: 'checksum_check',
      frameId,
      signalName,
      calculated,
      received,
      isValid,
      ...context,
    }, `Checksum check: ${signalName} calculated=${calculated}, received=${received}, valid=${isValid}`);
  }

  // Database operations
  logDbOperation(
    operation: string,
    tableName: string,
    recordCount: number,
    duration: number,
    context?: LogContext
  ): void {
    this.logger.info({
      operation: 'db_operation',
      dbOperation: operation,
      tableName,
      recordCount,
      durationMs: duration,
      ...context,
    }, `DB ${operation}: ${recordCount} records to ${tableName} in ${duration}ms`);
  }

  logDbError(
    operation: string,
    tableName: string,
    error: Error,
    context?: ErrorLogContext
  ): void {
    this.logger.error({
      operation: 'db_error',
      dbOperation: operation,
      tableName,
      errorCode: context?.errorCode || 'DB_ERROR',
      errorType: context?.errorType || error.name,
      errorMessage: error.message,
      stack: error.stack,
      ...context,
    }, `DB error: ${operation} on ${tableName}`);
  }

  logDbFlush(
    bufferSize: number,
    successCount: number,
    errorCount: number,
    duration: number,
    context?: LogContext
  ): void {
    this.logger.info({
      operation: 'db_flush',
      bufferSize,
      successCount,
      errorCount,
      durationMs: duration,
      ...context,
    }, `DB flush: ${successCount} success, ${errorCount} errors from ${bufferSize} items in ${duration}ms`);
  }

  // WebSocket operations
  logWsSend(
    topic: string,
    messageSize: number,
    clientCount: number,
    duration: number,
    context?: LogContext
  ): void {
    this.logger.debug({
      operation: 'ws_send',
      topic,
      messageSize,
      clientCount,
      durationMs: duration,
      ...context,
    }, `WS send: ${topic} to ${clientCount} clients, ${messageSize} bytes`);
  }

  logWsError(
    operation: string,
    error: Error,
    context?: ErrorLogContext
  ): void {
    this.logger.error({
      operation: 'ws_error',
      wsOperation: operation,
      errorCode: context?.errorCode || 'WS_ERROR',
      errorType: context?.errorType || error.name,
      errorMessage: error.message,
      stack: error.stack,
      ...context,
    }, `WS error: ${operation}`);
  }

  logWsClientConnect(clientId: string, ip: string, context?: LogContext): void {
    this.logger.info({
      operation: 'ws_client_connect',
      clientId,
      ip,
      ...context,
    }, `WS client connected: ${clientId}`);
  }

  logWsClientDisconnect(clientId: string, reason: string, context?: LogContext): void {
    this.logger.info({
      operation: 'ws_client_disconnect',
      clientId,
      reason,
      ...context,
    }, `WS client disconnected: ${clientId}, reason: ${reason}`);
  }

  // Performance monitoring
  logPerformanceMetrics(
    operation: string,
    metrics: {
      cpuUsage?: number;
      memoryUsage?: number;
      queueLength?: number;
      processingTime?: number;
      throughput?: number;
    },
    context?: LogContext
  ): void {
    this.logger.info({
      operation: 'performance_metrics',
      perfOperation: operation,
      ...metrics,
      ...context,
    }, `Performance: ${operation}`);
  }

  // Generic logging methods
  info(message: string, context?: LogContext): void {
    this.logger.info({ ...context }, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn({ ...context }, message);
  }

  error(message: string, context?: ErrorLogContext): void {
    this.logger.error({ ...context }, message);
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug({ ...context }, message);
  }
}

// Factory function
export function createLogger(moduleName: string): EnhancedLogger {
  return new EnhancedLogger(moduleName);
}

// Default logger instance
export const logger = createLogger('app');


