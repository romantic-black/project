import type { ICanSource } from '../can/ICanSource.js';
import { dbRepo } from '../db/repo.js';
import { canDiagnostics } from '../dbc/diagnostics.js';
import { transportMonitor } from '../db/transport-monitor.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('health-monitor');

export interface SignalStatus {
  signalName: string;
  lastUpdate: number;
  lastValue: number;
  updateInterval: number; // expected interval in ms
  isStale: boolean;
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    can: {
      status: 'connected' | 'disconnected' | 'error';
      stats?: {
        framesReceived: number;
        framesError: number;
        lastFrameTime?: number;
        unknownIds: number;
      };
    };
    database: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      stats?: {
        totalOperations: number;
        errorCount: number;
        lastOperation?: number;
      };
    };
    websocket: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      stats?: {
        connectedClients: number;
        messagesSent: number;
        messagesFailed: number;
        successRate: number;
      };
    };
  };
  signals: SignalStatus[];
  timestamp: number;
}

export class HealthMonitor {
  private signalLastUpdate: Map<string, { timestamp: number; value: number }> = new Map();
  private signalExpectedInterval: Map<string, number> = new Map();
  private staleThreshold = 5000; // 5 seconds

  updateSignal(signalName: string, value: number, expectedInterval?: number): void {
    const now = Date.now();
    this.signalLastUpdate.set(signalName, { timestamp: now, value });

    if (expectedInterval !== undefined) {
      this.signalExpectedInterval.set(signalName, expectedInterval);
    }
  }

  getSignalStatus(signalName: string): SignalStatus | null {
    const update = this.signalLastUpdate.get(signalName);
    if (!update) return null;

    const expectedInterval = this.signalExpectedInterval.get(signalName) || 1000;
    const age = Date.now() - update.timestamp;
    const isStale = age > Math.max(expectedInterval * 2, this.staleThreshold);

    return {
      signalName,
      lastUpdate: update.timestamp,
      lastValue: update.value,
      updateInterval: expectedInterval,
      isStale,
    };
  }

  getAllSignalsStatus(): SignalStatus[] {
    const statuses: SignalStatus[] = [];
    for (const signalName of this.signalLastUpdate.keys()) {
      const status = this.getSignalStatus(signalName);
      if (status) {
        statuses.push(status);
      }
    }
    return statuses;
  }

  getHealthStatus(canSource?: ICanSource): HealthStatus {
    // CAN status
    let canStatus: HealthStatus['components']['can'] = {
      status: 'disconnected',
    };

    if (canSource) {
      const stats = canSource.stats?.();
      const unknownIds = canDiagnostics.getUnknownIds();

      if (stats) {
        const lastFrameTime = stats.lastFrameTime;
        const isConnected = lastFrameTime && Date.now() - lastFrameTime < 10000; // 10 seconds

        canStatus = {
          status: isConnected ? 'connected' : 'disconnected',
          stats: {
            framesReceived: stats.frames || 0,
            framesError: stats.errors || 0,
            lastFrameTime,
            unknownIds: unknownIds.length,
          },
        };

        if (stats.errors > 0 && stats.frames > 0) {
          const errorRate = stats.errors / (stats.frames + stats.errors);
          if (errorRate > 0.1) {
            canStatus.status = 'error';
          }
        }
      }
    }

    // Database status
    const dataFlow = transportMonitor.getDataFlowStatus();
    const dbComponent: HealthStatus['components']['database'] = {
      status: 'healthy',
      stats: {
        totalOperations: dataFlow.db.totalOperations,
        errorCount: dataFlow.db.totalErrors,
        lastOperation: Date.now(),
      },
    };

    if (dataFlow.db.totalErrors > 0) {
      const errorRate = dataFlow.db.totalErrors / dataFlow.db.totalOperations;
      if (errorRate > 0.05) {
        dbComponent.status = 'unhealthy';
      } else if (errorRate > 0.01) {
        dbComponent.status = 'degraded';
      }
    }

    // WebSocket status
    const wsStats = dataFlow.ws;
    const wsComponent: HealthStatus['components']['websocket'] = {
      status: 'healthy',
      stats: {
        connectedClients: 0, // This needs to be updated from WSServer
        messagesSent: wsStats.messagesSent,
        messagesFailed: wsStats.messagesFailed,
        successRate: wsStats.successRate,
      },
    };

    if (wsStats.successRate < 0.9) {
      wsComponent.status = 'unhealthy';
    } else if (wsStats.successRate < 0.95) {
      wsComponent.status = 'degraded';
    }

    // Overall status
    let overall: HealthStatus['overall'] = 'healthy';
    if (
      canStatus.status === 'error' ||
      dbComponent.status === 'unhealthy' ||
      wsComponent.status === 'unhealthy'
    ) {
      overall = 'unhealthy';
    } else if (
      canStatus.status === 'disconnected' ||
      dbComponent.status === 'degraded' ||
      wsComponent.status === 'degraded'
    ) {
      overall = 'degraded';
    }

    return {
      overall,
      components: {
        can: canStatus,
        database: dbComponent,
        websocket: wsComponent,
      },
      signals: this.getAllSignalsStatus(),
      timestamp: Date.now(),
    };
  }
}

export const healthMonitor = new HealthMonitor();

