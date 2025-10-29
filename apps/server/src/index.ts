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
import pino from 'pino';

const logger = pino({ level: config.LOG_LEVEL });

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
  logger.info({ config }, 'Starting server');

  canSource = createCanSource();
  (globalThis as any).canSource = canSource;

  const wss = new WSServer(config.WS_PORT);
  const app = express();
  setupRestApi(app);

  canSource.onFrame((frame) => {
    const msg = normalizeFrame(frame);
    if (!msg) return;

    for (const [signalName, value] of Object.entries(msg.values)) {
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
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});

