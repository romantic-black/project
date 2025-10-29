import { createLogger } from '../utils/logger.js';

const logger = createLogger('transport-monitor');

export interface DbOperationStats {
  operation: string;
  successCount: number;
  errorCount: number;
  totalRecords: number;
  lastSuccess?: number;
  lastError?: number;
  errors: Array<{
    timestamp: number;
    operation: string;
    error: string;
    recordCount?: number;
  }>;
}

export interface WsOperationStats {
  messagesSent: number;
  messagesFailed: number;
  bytesSent: number;
  clientsConnected: number;
  clientsDisconnected: number;
  lastSent?: number;
  lastError?: number;
  errors: Array<{
    timestamp: number;
    operation: string;
    error: string;
    topic?: string;
  }>;
}

export class TransportMonitor {
  private dbStats: Map<string, DbOperationStats> = new Map();
  private wsStats: WsOperationStats = {
    messagesSent: 0,
    messagesFailed: 0,
    bytesSent: 0,
    clientsConnected: 0,
    clientsDisconnected: 0,
    errors: [],
  };
  private maxErrors = 100;

  recordDbOperation(
    operation: string,
    tableName: string,
    success: boolean,
    recordCount: number,
    duration: number,
    error?: Error
  ): void {
    const key = `${operation}_${tableName}`;
    let stats = this.dbStats.get(key);
    if (!stats) {
      stats = {
        operation,
        successCount: 0,
        errorCount: 0,
        totalRecords: 0,
        errors: [],
      };
      this.dbStats.set(key, stats);
    }

    if (success) {
      stats.successCount++;
      stats.lastSuccess = Date.now();
      stats.totalRecords += recordCount;

      logger.logDbOperation(operation, tableName, recordCount, duration);
    } else {
      stats.errorCount++;
      stats.lastError = Date.now();

      const errorRecord = {
        timestamp: Date.now(),
        operation,
        error: error?.message || 'Unknown error',
        recordCount,
      };

      if (stats.errors.length >= this.maxErrors) {
        stats.errors.shift();
      }
      stats.errors.push(errorRecord);

      logger.logDbError(operation, tableName, error || new Error('Unknown error'), {
        errorCode: 'DB_OPERATION_FAILED',
        errorType: error?.name || 'UnknownError',
      });
    }
  }

  recordDbFlush(
    bufferSize: number,
    successCount: number,
    errorCount: number,
    duration: number
  ): void {
    logger.logDbFlush(bufferSize, successCount, errorCount, duration);
  }

  recordWsSend(
    topic: string,
    messageSize: number,
    clientCount: number,
    duration: number,
    success: boolean,
    error?: Error
  ): void {
    if (success) {
      this.wsStats.messagesSent += clientCount;
      this.wsStats.bytesSent += messageSize * clientCount;
      this.wsStats.lastSent = Date.now();

      logger.logWsSend(topic, messageSize, clientCount, duration);
    } else {
      this.wsStats.messagesFailed += clientCount;
      this.wsStats.lastError = Date.now();

      const errorRecord = {
        timestamp: Date.now(),
        operation: 'send',
        error: error?.message || 'Unknown error',
        topic,
      };

      if (this.wsStats.errors.length >= this.maxErrors) {
        this.wsStats.errors.shift();
      }
      this.wsStats.errors.push(errorRecord);

      logger.logWsError('send', error || new Error('Unknown error'), {
        errorCode: 'WS_SEND_FAILED',
        errorType: error?.name || 'UnknownError',
      });
    }
  }

  recordWsClientConnect(clientId: string, ip: string): void {
    this.wsStats.clientsConnected++;
    logger.logWsClientConnect(clientId, ip);
  }

  recordWsClientDisconnect(clientId: string, reason: string): void {
    this.wsStats.clientsDisconnected++;
    logger.logWsClientDisconnect(clientId, reason);
  }

  getDbStats(): Record<string, DbOperationStats> {
    const result: Record<string, DbOperationStats> = {};
    for (const [key, stats] of this.dbStats.entries()) {
      result[key] = { ...stats };
    }
    return result;
  }

  getWsStats(): WsOperationStats {
    return { ...this.wsStats };
  }

  getDataFlowStatus(): {
    db: {
      operations: Record<string, DbOperationStats>;
      totalOperations: number;
      totalErrors: number;
      overallSuccess: boolean;
    };
    ws: WsOperationStats & {
      successRate: number;
      avgMessageSize: number;
    };
  } {
    const dbOperations = this.getDbStats();
    let totalOps = 0;
    let totalErrors = 0;

    for (const stats of Object.values(dbOperations)) {
      totalOps += stats.successCount + stats.errorCount;
      totalErrors += stats.errorCount;
    }

    const wsSuccessRate =
      this.wsStats.messagesSent + this.wsStats.messagesFailed > 0
        ? this.wsStats.messagesSent / (this.wsStats.messagesSent + this.wsStats.messagesFailed)
        : 1;

    const avgMessageSize =
      this.wsStats.messagesSent > 0
        ? this.wsStats.bytesSent / this.wsStats.messagesSent
        : 0;

    return {
      db: {
        operations: dbOperations,
        totalOperations: totalOps,
        totalErrors,
        overallSuccess: totalErrors === 0 && totalOps > 0,
      },
      ws: {
        ...this.wsStats,
        successRate: wsSuccessRate,
        avgMessageSize,
      },
    };
  }

  clearStats(): void {
    this.dbStats.clear();
    this.wsStats = {
      messagesSent: 0,
      messagesFailed: 0,
      bytesSent: 0,
      clientsConnected: 0,
      clientsDisconnected: 0,
      errors: [],
    };
  }
}

export const transportMonitor = new TransportMonitor();

