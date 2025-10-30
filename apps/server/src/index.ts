import express from 'express';
import config from './config.js';
import { MockSource } from './can/MockSource.js';
import { ReplaySource } from './can/ReplaySource.js';
import { SocketCanSource } from './can/SocketCanSource.js';
import { VcanSource } from './can/VcanSource.js';
import type { ICanSource } from './can/ICanSource.js';
import { normalizeFrame } from './pipeline/normalize.js';
import { dbRepo } from './db/repo.js';
import { WSServer } from './api/ws.js';
import { setupRestApi } from './api/rest.js';
import { createLogger } from './utils/logger.js';
import { validateConfig } from './utils/config-validator.js';
import { performanceManager } from './performance/manager.js';

const logger = createLogger('main');

let canSource: ICanSource;

function createCanSource(): ICanSource {
  switch (config.DATA_MODE) {
    case 'socketcan':
      return new SocketCanSource();
    case 'vcan':
      return new VcanSource();
    case 'replay':
      return new ReplaySource();
    case 'mock':
    default:
      return new MockSource();
  }
}

async function main() {
  // Validate configuration
  const validation = validateConfig();
  if (!validation.valid) {
    logger.error('Configuration validation failed', { errors: validation.errors });
    process.exit(1);
  }
  if (validation.warnings.length > 0) {
    logger.warn('Configuration validation warnings', { warnings: validation.warnings });
  }

  logger.info('Starting server', { 
    dataMode: config.DATA_MODE,
    performanceMode: performanceManager.getMode(),
    wsPort: config.WS_PORT,
    httpPort: config.HTTP_PORT,
  });

  canSource = createCanSource();
  (globalThis as any).canSource = canSource;

  const wss = new WSServer(config.WS_PORT);
  (globalThis as any).wss = wss; // Make accessible to REST API
  const app = express();
  setupRestApi(app);

  canSource.onFrame((frame) => {
    const msg = normalizeFrame(frame);
    if (!msg) return;

    for (const signalName of Object.keys(msg.values)) {
      const value = msg.values[signalName];
      if (typeof value !== 'number') continue;
      dbRepo.batchInsertSignalValue(msg.timestamp, signalName, value);
    }

    wss.broadcastMessage(msg);
  });

  await canSource.start();
  logger.info(`CAN source started in ${config.DATA_MODE} mode`);

  app.listen(config.HTTP_PORT, () => {
    logger.info(`HTTP server listening on port ${config.HTTP_PORT}`);
    logger.info(`WebSocket server listening on port ${config.WS_PORT}`);
  });

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await canSource.stop();
    dbRepo.close();
    wss.close();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});

