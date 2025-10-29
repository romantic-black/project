import { SocketCanSource } from './SocketCanSource.js';
import type { CanFrame } from '@can-telemetry/common';
import type { ICanSource } from './ICanSource.js';
import config from '../config.js';

export class VcanSource extends SocketCanSource implements ICanSource {
  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (config.CAN_IFACE !== 'vcan0') {
      console.warn(`VcanSource expects vcan0 but got ${config.CAN_IFACE}`);
    }
    await super.start();
  }
}

