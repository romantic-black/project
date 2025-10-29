import express from 'express';
import { HistoryQuerySchema, SnapshotQuerySchema } from '@can-telemetry/common';
import { dbRepo } from '../db/repo.js';
import config from '../config.js';
import { createLogger } from '../utils/logger.js';
import { canDiagnostics } from '../dbc/diagnostics.js';
import { transportMonitor } from '../db/transport-monitor.js';
import { healthMonitor } from '../monitoring/health.js';
import { performanceManager } from '../performance/manager.js';

const logger = createLogger('rest-api');

export function setupRestApi(app: express.Application): void {
  app.use(express.json());

  app.get('/api/snapshot', (req, res) => {
    try {
      const query = SnapshotQuerySchema.parse(req.query);
      const snapshot = dbRepo.getSnapshot(query.signals);
      res.json(snapshot);
    } catch (error) {
      logger.error({ error, query: req.query }, 'Snapshot query error');
      res.status(400).json({ error: 'Invalid query parameters' });
    }
  });

  app.get('/api/history', (req, res) => {
    try {
      const query = HistoryQuerySchema.parse(req.query);
      const from = new Date(query.from);
      const to = new Date(query.to);
      
      const history = dbRepo.queryHistory(query.signals, from, to, query.step);
      res.json(history);
    } catch (error) {
      logger.error({ error, query: req.query }, 'History query error');
      res.status(400).json({ error: 'Invalid query parameters' });
    }
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/api/status', (_req, res) => {
    const canSource = (globalThis as any).canSource;
    const wss = (globalThis as any).wss;
    res.json({
      dataMode: config.DATA_MODE,
      canIface: config.CAN_IFACE,
      canSourceType: canSource?.constructor?.name || 'unknown',
      isRunning: canSource ? typeof canSource.start === 'function' : false,
      stats: canSource?.stats ? canSource.stats() : null,
      wsPort: config.WS_PORT,
      httpPort: config.HTTP_PORT,
      wsClients: wss?.getConnectedClientsCount ? wss.getConnectedClientsCount() : 0,
    });
  });

  // Diagnostic endpoints
  app.get('/api/diagnostics/can-errors', (_req, res) => {
    try {
      const stats = canDiagnostics.getErrorStats();
      const unknownIds = canDiagnostics.getUnknownIds();
      res.json({
        errors: stats,
        unknownIds,
      });
    } catch (error) {
      logger.error('Error fetching CAN diagnostics', { error });
      res.status(500).json({ error: 'Failed to fetch diagnostics' });
    }
  });

  app.get('/api/diagnostics/data-flow', (_req, res) => {
    try {
      const status = transportMonitor.getDataFlowStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error fetching data flow status', { error });
      res.status(500).json({ error: 'Failed to fetch data flow status' });
    }
  });

  app.get('/api/health/detailed', (_req, res) => {
    try {
      const canSource = (globalThis as any).canSource;
      const health = healthMonitor.getHealthStatus(canSource);
      const wss = (globalThis as any).wss;
      if (wss && health.components.websocket.stats) {
        health.components.websocket.stats.connectedClients = wss.getConnectedClientsCount ? wss.getConnectedClientsCount() : 0;
      }
      res.json(health);
    } catch (error) {
      logger.error('Error fetching health status', { error });
      res.status(500).json({ error: 'Failed to fetch health status' });
    }
  });

  app.get('/api/performance/metrics', (_req, res) => {
    try {
      const config = performanceManager.getConfig();
      const metrics = performanceManager.getRecentMetrics(100);
      const avgMetrics = performanceManager.getAverageMetrics(60000);
      res.json({
        mode: performanceManager.getMode(),
        config,
        recentMetrics: metrics,
        averageMetrics: avgMetrics,
      });
    } catch (error) {
      logger.error('Error fetching performance metrics', { error });
      res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
  });

  app.get('/api/monitoring/signals', (_req, res) => {
    try {
      const signals = healthMonitor.getAllSignalsStatus();
      res.json({ signals });
    } catch (error) {
      logger.error('Error fetching signal status', { error });
      res.status(500).json({ error: 'Failed to fetch signal status' });
    }
  });

  app.post('/api/can/send', async (req, res) => {
    try {
      const { id, data } = req.body;
      if (typeof id !== 'number' || !Array.isArray(data)) {
        return res.status(400).json({ error: 'Invalid frame data' });
      }
      
      const canSource = (globalThis as any).canSource;
      if (!canSource || typeof canSource.sendFrame !== 'function') {
        return res.status(503).json({ error: 'CAN source not available' });
      }

      const buffer = Buffer.from(data);
      await canSource.sendFrame(id, buffer);
      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, 'Send frame error');
      res.status(500).json({ error: 'Failed to send frame' });
    }
  });
}

