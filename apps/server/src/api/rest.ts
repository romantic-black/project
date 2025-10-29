import express from 'express';
import { HistoryQuerySchema, SnapshotQuerySchema } from '@can-telemetry/common';
import { dbRepo } from '../db/repo.js';
import pino from 'pino';
import config from '../config.js';

const logger = pino({ level: config.LOG_LEVEL });

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
    res.json({
      dataMode: config.DATA_MODE,
      canIface: config.CAN_IFACE,
      canSourceType: canSource?.constructor?.name || 'unknown',
      isRunning: canSource ? typeof canSource.start === 'function' : false,
      stats: canSource?.stats ? canSource.stats() : null,
      wsPort: config.WS_PORT,
      httpPort: config.HTTP_PORT,
    });
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

