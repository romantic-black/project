import type { CanFrame, SourceStats } from '@can-telemetry/common';
import type { ICanSource } from './ICanSource.js';
import dbcLoader from '../dbc/loader.js';
import { encodeBits, inverseScale, isBigEndian, clamp } from '../decoder/bitops.js';

export class MockSource implements ICanSource {
  private frameCallback?: (frame: CanFrame) => void;
  private intervals: NodeJS.Timeout[] = [];
  private statsState: SourceStats = { frames: 0, errors: 0 };
  private isRunning = false;
  private lifeCntCache = new Map<number, number>();

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.statsState = { frames: 0, errors: 0 };
    this.lifeCntCache.clear();

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

        const data = Buffer.alloc(msg.length || 8);
        data.fill(0); // Initialize with zeros

        // First pass: encode all signals except LifeCnt and CheckSum
        for (const signal of msg.signals || []) {
          // Skip LifeCnt and CheckSum in first pass
          if (signal.name.includes('LifeCnt') || signal.name.includes('CheckSum')) {
            continue;
          }

          try {
            // Generate a random physical value within min/max range
            const min = signal.min ?? 0;
            const max = signal.max ?? 255;
            const physicalValue = Math.random() * (max - min) + min;
            const clampedValue = clamp(physicalValue, min, max);

            // Convert physical value to raw value (inverse of scaling)
            const factor = signal.factor ?? 1;
            const offset = signal.offset ?? 0;
            const rawValue = inverseScale(clampedValue, factor, offset);

            // Encode raw value to buffer at correct bit position
            const startBit = signal.startBit ?? 0;
            const length = signal.length ?? 8;
            const bigEndian = isBigEndian(signal.endianness);

            if (length > 53) {
              console.warn(
                `Skipping signal ${signal.name} in message ${msg.name}: length ${length} exceeds 53-bit limit`
              );
              continue;
            }

            // Ensure raw value fits in the bit range
            const isSigned = signal.signed ?? (signal.min ?? 0) < 0;
            const maxRawValue = isSigned ? Math.pow(2, length - 1) - 1 : Math.pow(2, length) - 1;
            const minRawValue = isSigned ? -Math.pow(2, length - 1) : 0;
            const clampedRawValue = Math.max(minRawValue, Math.min(maxRawValue, rawValue));

            encodeBits(data, startBit, length, clampedRawValue, bigEndian);
          } catch (error) {
            console.warn(`Failed to encode signal ${signal.name} in message ${msg.name}:`, error);
          }
        }

        // Second pass: handle LifeCnt signals
        for (const signal of msg.signals || []) {
          if (!signal.name.includes('LifeCnt')) continue;

          try {
            const previous = this.lifeCntCache.get(msg.id) ?? 0;
            const newLifeCnt = (previous + 1) % 16;
            
            const factor = signal.factor ?? 1;
            const offset = signal.offset ?? 0;
            const rawValue = inverseScale(newLifeCnt, factor, offset);

            const startBit = signal.startBit ?? 0;
            const length = signal.length ?? 8;
            const bigEndian = isBigEndian(signal.endianness);

            if (length > 53) {
              console.warn(
                `Skipping signal ${signal.name} in message ${msg.name}: length ${length} exceeds 53-bit limit`
              );
              continue;
            }

            const isSigned = signal.signed ?? (signal.min ?? 0) < 0;
            const maxRawValue = isSigned ? Math.pow(2, length - 1) - 1 : Math.pow(2, length) - 1;
            const minRawValue = isSigned ? -Math.pow(2, length - 1) : 0;
            const clampedRawValue = Math.max(minRawValue, Math.min(maxRawValue, rawValue));

            encodeBits(data, startBit, length, clampedRawValue, bigEndian);
            
            // Update cache
            this.lifeCntCache.set(msg.id, newLifeCnt);
          } catch (error) {
            console.warn(`Failed to encode LifeCnt signal ${signal.name} in message ${msg.name}:`, error);
          }
        }

        // Third pass: calculate and encode CheckSum (XOR of first 7 bytes)
        for (const signal of msg.signals || []) {
          if (!signal.name.includes('CheckSum')) continue;

          try {
            // Calculate XOR of first 7 bytes
            let xor = 0;
            for (let i = 0; i < 7; i++) {
              xor ^= data[i];
            }

            const factor = signal.factor ?? 1;
            const offset = signal.offset ?? 0;
            const rawValue = inverseScale(xor, factor, offset);

            const startBit = signal.startBit ?? 0;
            const length = signal.length ?? 8;
            const bigEndian = isBigEndian(signal.endianness);

            if (length > 53) {
              console.warn(
                `Skipping signal ${signal.name} in message ${msg.name}: length ${length} exceeds 53-bit limit`
              );
              continue;
            }

            const isSigned = signal.signed ?? (signal.min ?? 0) < 0;
            const maxRawValue = isSigned ? Math.pow(2, length - 1) - 1 : Math.pow(2, length) - 1;
            const minRawValue = isSigned ? -Math.pow(2, length - 1) : 0;
            const clampedRawValue = Math.max(minRawValue, Math.min(maxRawValue, rawValue));

            encodeBits(data, startBit, length, clampedRawValue, bigEndian);
          } catch (error) {
            console.warn(`Failed to encode CheckSum signal ${signal.name} in message ${msg.name}:`, error);
          }
        }

        const frame: CanFrame = {
          id: msg.id,
          data,
          timestamp: Date.now(),
        };

        this.frameCallback(frame);
        this.statsState.frames++;
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
    // Mock source doesn't actually send frames
  }

  stats(): SourceStats {
    return { ...this.statsState };
  }
}

