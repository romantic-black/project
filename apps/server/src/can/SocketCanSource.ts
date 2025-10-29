import type { CanFrame } from '@can-telemetry/common';
import type { ICanSource, SourceStats } from './ICanSource.js';
import config from '../config.js';
import { CAN_CONFIG } from './config.js';

let socketcan: any;
try {
  socketcan = require('socketcan');
} catch (error) {
  console.warn('socketcan library not available, SocketCanSource will not work');
}

export class SocketCanSource implements ICanSource {
  private channel?: any;
  private frameCallback?: (frame: CanFrame) => void;
  private statsState: SourceStats = { frames: 0, errors: 0 };
  private isRunning = false;

  constructor() {
    if (!socketcan) {
      console.warn('TODO: socketcan library not installed. Install with: npm install socketcan');
      console.warn('For now, SocketCanSource will not work. Please use vcan or mock mode.');
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    if (!socketcan) {
      throw new Error('socketcan library not available');
    }

    try {
      this.channel = socketcan.createRawChannel(config.CAN_IFACE, false);
      
      this.channel.addListener('onMessage', (msg: any) => {
        if (this.frameCallback) {
          const frame: CanFrame = {
            id: msg.id,
            data: Buffer.from(msg.data),
            timestamp: Date.now(),
            extended: msg.ext,
          };
          this.frameCallback(frame);
          this.statsState.frames++;
        }
      });

      this.channel.start();
      this.isRunning = true;
      this.statsState = { frames: 0, errors: 0 };
    } catch (error) {
      this.statsState.errors++;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.channel) {
      try {
        this.channel.stop();
      } catch (error) {
        this.statsState.errors++;
      }
      this.channel = undefined;
    }
  }

  onFrame(callback: (frame: CanFrame) => void): void {
    this.frameCallback = callback;
  }

  async sendFrame(id: number, data: Buffer): Promise<void> {
    if (!socketcan || !this.channel) {
      throw new Error('socketcan not available or channel not started');
    }

    try {
      const msg = {
        id,
        data: Array.from(data),
        ext: false,
      };
      this.channel.send(msg);
    } catch (error) {
      this.statsState.errors++;
      throw error;
    }
  }

  stats(): SourceStats {
    return { ...this.statsState };
  }
}

