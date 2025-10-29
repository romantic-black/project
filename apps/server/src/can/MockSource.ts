import type { CanFrame } from '@can-telemetry/common';
import type { ICanSource, SourceStats } from './ICanSource.js';
import dbcLoader from '../dbc/loader.js';

export class MockSource implements ICanSource {
  private frameCallback?: (frame: CanFrame) => void;
  private intervals: NodeJS.Timeout[] = [];
  private stats: SourceStats = { frames: 0, errors: 0 };
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.stats = { frames: 0, errors: 0 };

    let messages: any[] = [];
    try {
      const dbc = await dbcLoader.load();
      messages = dbc.messages || [];
    } catch (error) {
      console.warn('Failed to load DBC, using default mock messages');
      messages = [
        { id: 320, name: 'VCU_Info1', cycleTime: 100, signals: [] },
        { id: 321, name: 'VCU_Info2', cycleTime: 100, signals: [] },
        { id: 340, name: 'J1939_EEC1', cycleTime: 10, signals: [] },
      ];
    }

    for (const msg of messages) {
      const cycleTime = msg.cycleTime || 100;
      const interval = setInterval(() => {
        if (!this.frameCallback) return;

        const data = Buffer.alloc(8);
        let offset = 0;

        for (const signal of msg.signals || []) {
          const min = signal.min ?? 0;
          const max = signal.max ?? 255;
          const rawValue = Math.floor(Math.random() * (max - min + 1)) + min;

          const bitLength = signal.length ?? 8;

          if (bitLength <= 8 && offset < 8) {
            data[offset] = rawValue;
            offset++;
          } else if (bitLength <= 16 && offset < 7) {
            data.writeUInt16BE(rawValue, offset);
            offset += 2;
          } else if (offset < 5) {
            data.writeUInt32BE(rawValue, offset);
            offset += 4;
          }
        }

        const frame: CanFrame = {
          id: msg.id,
          data,
          timestamp: Date.now(),
        };

        this.frameCallback(frame);
        this.stats.frames++;
      }, cycleTime);

      this.intervals.push(interval);
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
  }

  onFrame(callback: (frame: CanFrame) => void): void {
    this.frameCallback = callback;
  }

  async sendFrame(id: number, data: Buffer): Promise<void> {
    console.log(`MockSource: send frame ${id.toString(16)}`, data.toString('hex'));
  }

  stats(): SourceStats {
    return { ...this.stats };
  }
}

