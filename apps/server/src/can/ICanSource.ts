import type { CanFrame, SourceStats } from '@can-telemetry/common';
export type { SourceStats } from '@can-telemetry/common';

export interface ICanSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  onFrame(callback: (frame: CanFrame) => void): void;
  sendFrame(id: number, data: Buffer): Promise<void>;
  stats(): SourceStats;
}

