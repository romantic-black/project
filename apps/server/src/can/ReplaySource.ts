import { readFileSync } from 'fs';
import { join } from 'path';
import type { CanFrame, ReplayFrame } from '@can-telemetry/common';
import type { ICanSource, SourceStats } from './ICanSource.js';
import config, { PROJECT_ROOT } from '../config.js';

export class ReplaySource implements ICanSource {
  private frameCallback?: (frame: CanFrame) => void;
  private frames: ReplayFrame[] = [];
  private currentIndex = 0;
  private timeout?: NodeJS.Timeout;
  private startTime?: number;
  private stats: SourceStats = { frames: 0, errors: 0 };
  private isRunning = false;

  constructor() {
    try {
      const filePath = config.REPLAY_FILE.startsWith('/')
        ? config.REPLAY_FILE
        : join(PROJECT_ROOT, config.REPLAY_FILE);
      const content = readFileSync(filePath, 'utf-8');
      this.frames = JSON.parse(content);
      this.frames.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      console.warn(`Replay file not found: ${config.REPLAY_FILE}, using empty replay`);
      this.frames = [];
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    if (this.frames.length === 0) {
      console.warn('No frames to replay');
      return;
    }

    this.isRunning = true;
    this.stats = { frames: 0, errors: 0 };
    this.currentIndex = 0;
    this.startTime = Date.now();
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (!this.isRunning || this.currentIndex >= this.frames.length) {
      this.isRunning = false;
      console.log('Replay completed, restarting from beginning');
      this.currentIndex = 0;
      this.startTime = Date.now();
      this.scheduleNext();
      return;
    }

    const frame = this.frames[this.currentIndex];
    const replayTime = frame.timestamp;
    const nextFrame = this.currentIndex + 1 < this.frames.length 
      ? this.frames[this.currentIndex + 1]
      : null;

    const delay = nextFrame 
      ? nextFrame.timestamp - replayTime
      : 1000;

    this.timeout = setTimeout(() => {
      if (this.frameCallback) {
        const canFrame: CanFrame = {
          id: frame.id,
          data: Buffer.from(frame.data),
          timestamp: Date.now(),
        };
        this.frameCallback(canFrame);
        this.stats.frames++;
      }
      this.currentIndex++;
      this.scheduleNext();
    }, delay);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  onFrame(callback: (frame: CanFrame) => void): void {
    this.frameCallback = callback;
  }

  async sendFrame(id: number, data: Buffer): Promise<void> {
    console.log(`ReplaySource: send frame ${id.toString(16)}`, data.toString('hex'));
  }

  stats(): SourceStats {
    return { ...this.stats, lastFrameTime: this.startTime };
  }
}

