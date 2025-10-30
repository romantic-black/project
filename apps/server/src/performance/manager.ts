import { createLogger } from '../utils/logger.js';
import config from '../config.js';

const logger = createLogger('performance-manager');

export type PerformanceMode = 'normal' | 'low';

export interface PerformanceMetrics {
  cpuUsage?: number;
  memoryUsage: number;
  queueLength: number;
  processingTime?: number;
  throughput?: number;
  timestamp: number;
}

export interface PerformanceConfig {
  mode: PerformanceMode;
  dbFlushInterval: number; // milliseconds
  enable1sAggregation: boolean;
  wsBufferMaxSize: number;
  enableRawFrameLog: boolean;
}

export class PerformanceManager {
  private currentMode: PerformanceMode;
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 1000;
  private autoDegradeThreshold = {
    memoryUsageMB: 500, // 500MB
    cpuUsagePercent: 80,
  };

  constructor() {
    // Check environment variable or default to normal
    const perfMode = process.env.PERFORMANCE_MODE;
    this.currentMode = perfMode === 'low' ? 'low' : 'normal';
    logger.info('Performance manager initialized', { mode: this.currentMode });

    // Start performance monitoring
    this.startMonitoring();
  }

  getConfig(): PerformanceConfig {
    if (this.currentMode === 'low') {
      return {
        mode: 'low',
        dbFlushInterval: 15000, // 15 seconds instead of 5
        enable1sAggregation: false, // Only keep 10s aggregation
        wsBufferMaxSize: 100, // Smaller buffer
        enableRawFrameLog: false, // Disable raw frame logging
      };
    } else {
      return {
        mode: 'normal',
        dbFlushInterval: 5000, // 5 seconds
        enable1sAggregation: true,
        wsBufferMaxSize: 1000,
        enableRawFrameLog: process.env.ENABLE_RAW_FRAME_LOG !== 'false',
      };
    }
  }

  recordMetrics(metrics: Omit<PerformanceMetrics, 'timestamp'>): void {
    const fullMetrics: PerformanceMetrics = {
      ...metrics,
      timestamp: Date.now(),
    };

    if (this.metrics.length >= this.maxMetrics) {
      this.metrics.shift();
    }
    this.metrics.push(fullMetrics);

    logger.logPerformanceMetrics('record', metrics);
  }

  getRecentMetrics(limit: number = 100): PerformanceMetrics[] {
    return this.metrics.slice(-limit);
  }

  getAverageMetrics(windowMs: number = 60000): PerformanceMetrics | null {
    const cutoff = Date.now() - windowMs;
    const recent = this.metrics.filter((m) => m.timestamp >= cutoff);

    if (recent.length === 0) return null;

    const avg = recent.reduce(
      (acc, m) => {
        return {
          cpuUsage: (acc.cpuUsage || 0) + (m.cpuUsage || 0),
          memoryUsage: acc.memoryUsage + m.memoryUsage,
          queueLength: acc.queueLength + m.queueLength,
          processingTime: (acc.processingTime || 0) + (m.processingTime || 0),
          throughput: (acc.throughput || 0) + (m.throughput || 0),
          timestamp: acc.timestamp,
        };
      },
      {
        cpuUsage: 0,
        memoryUsage: 0,
        queueLength: 0,
        processingTime: 0,
        throughput: 0,
        timestamp: Date.now(),
      }
    );

    return {
      cpuUsage: (avg.cpuUsage ?? 0) / recent.length,
      memoryUsage: avg.memoryUsage / recent.length,
      queueLength: avg.queueLength / recent.length,
      processingTime: (avg.processingTime ?? 0) / recent.length,
      throughput: (avg.throughput ?? 0) / recent.length,
      timestamp: avg.timestamp,
    };
  }

  checkAutoDegrade(): boolean {
    if (this.currentMode === 'low') {
      return false; // Already in low mode
    }

    const avgMetrics = this.getAverageMetrics(30000); // Last 30 seconds
    if (!avgMetrics) return false;

    const memoryUsageMB = avgMetrics.memoryUsage / (1024 * 1024);
    const shouldDegrade =
      memoryUsageMB > this.autoDegradeThreshold.memoryUsageMB ||
      (avgMetrics.cpuUsage && avgMetrics.cpuUsage > this.autoDegradeThreshold.cpuUsagePercent);

    if (shouldDegrade) {
      logger.warn('Auto-degrading to low performance mode', {
        memoryUsageMB,
        cpuUsage: avgMetrics.cpuUsage,
      });
      this.setMode('low');
      return true;
    }

    return false;
  }

  setMode(mode: PerformanceMode): void {
    if (mode !== this.currentMode) {
      const oldMode = this.currentMode;
      this.currentMode = mode;
      logger.info('Performance mode changed', { oldMode, newMode: mode });
    }
  }

  getMode(): PerformanceMode {
    return this.currentMode;
  }

  private startMonitoring(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const metrics: Omit<PerformanceMetrics, 'timestamp'> = {
        memoryUsage: memUsage.heapUsed,
        queueLength: 0, // This should be set by the caller
      };

      // Try to get CPU usage (requires additional module in production)
      // For now, we'll monitor memory primarily

      this.recordMetrics(metrics);
      this.checkAutoDegrade();
    }, 5000); // Every 5 seconds
  }
}

export const performanceManager = new PerformanceManager();

