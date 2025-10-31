import express from 'express';
import config from './config.js';
import { MockSource } from './can/MockSource.js';
import { ReplaySource } from './can/ReplaySource.js';
import { SocketCanSource, isSocketCanAvailable } from './can/SocketCanSource.js';
import { VcanSource } from './can/VcanSource.js';
import type { ICanSource } from './can/ICanSource.js';
import { normalizeFrame } from './pipeline/normalize.js';
import dbcLoader from './dbc/loader.js';
import { dbRepo } from './db/repo.js';
import { WSServer } from './api/ws.js';
import { setupRestApi } from './api/rest.js';
import { createLogger } from './utils/logger.js';
import { validateConfig } from './utils/config-validator.js';
import { performanceManager } from './performance/manager.js';

const logger = createLogger('main');

let canSource: ICanSource;
let activeDataMode = config.DATA_MODE;

function createCanSource(): ICanSource {
  switch (config.DATA_MODE) {
    case 'socketcan':
      if (!isSocketCanAvailable()) {
        logger.warn(
          'SocketCAN mode requested but socketcan library is not installed. Falling back to mock mode.'
        );
        activeDataMode = 'mock';
        return new MockSource();
      }
      activeDataMode = 'socketcan';
      return new SocketCanSource();
    case 'vcan':
      activeDataMode = 'vcan';
      return new VcanSource();
    case 'replay':
      activeDataMode = 'replay';
      return new ReplaySource();
    case 'mock':
    default:
      activeDataMode = 'mock';
      return new MockSource();
  }
}

async function main() {
  // Validate configuration
  const validation = validateConfig();
  if (!validation.valid) {
    logger.error('Configuration validation failed', { errors: validation.errors });
    // Avoid forcing process exit to allow logger streams to flush gracefully
    process.exitCode = 1;
    return;
  }
  if (validation.warnings.length > 0) {
    logger.warn('Configuration validation warnings', { warnings: validation.warnings });
  }

  try {
    const dbc = await dbcLoader.load();
    logger.info('DBC loaded', {
      messageCount: dbc.messages.length,
      valTableCount: Object.keys(dbc.valTables || {}).length,
      path: config.DBC_JSON,
    });
  } catch (error) {
    logger.error('Failed to load DBC definition', {
      error: error instanceof Error ? error.message : String(error),
      path: config.DBC_JSON,
    });
    process.exitCode = 1;
    return;
  }

  canSource = createCanSource();
  (globalThis as any).canSource = canSource;

  logger.info('Starting server', {
    dataMode: activeDataMode,
    performanceMode: performanceManager.getMode(),
    wsPort: config.WS_PORT,
    httpPort: config.HTTP_PORT,
  });

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
  logger.info(`CAN source started in ${activeDataMode} mode`);

  app.listen(config.HTTP_PORT, () => {
    logger.info(`HTTP server listening on port ${config.HTTP_PORT}`);
    logger.info(`WebSocket server listening on port ${config.WS_PORT}`);
  });

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await canSource.stop();
    dbRepo.close();
    wss.close();
    // Let the event loop drain for graceful shutdown; do not force exit
    process.exitCode = 0;
  });
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  // Set exit code; avoid immediate exit to prevent sonic-boom readiness errors
  process.exitCode = 1;
});
