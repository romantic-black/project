import type { CanFrame } from '@can-telemetry/common';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('can-diagnostics');

export interface CanDecodeError {
  timestamp: number;
  frameId: number;
  messageName?: string;
  signalName?: string;
  errorCode: string;
  errorType: string;
  errorMessage: string;
  failureReason?: string;
  expectedValue?: any;
  actualValue?: any;
  rawData?: string;
}

export interface UnknownCanId {
  canId: number;
  firstSeen: number;
  lastSeen: number;
  count: number;
  sampleData: string;
}

export class CanDiagnostics {
  private decodeErrors: CanDecodeError[] = [];
  private unknownIds: Map<number, UnknownCanId> = new Map();
  private maxErrors = 1000;
  private maxUnknownIds = 100;

  recordDecodeError(
    frameId: number,
    messageName: string | undefined,
    signalName: string | undefined,
    error: Error,
    context: {
      errorCode?: string;
      errorType?: string;
      failureReason?: string;
      expectedValue?: any;
      actualValue?: any;
      rawData?: Buffer | string;
    }
  ): void {
    const errorRecord: CanDecodeError = {
      timestamp: Date.now(),
      frameId,
      messageName,
      signalName,
      errorCode: context.errorCode || 'DECODE_ERROR',
      errorType: context.errorType || error.name,
      errorMessage: error.message,
      failureReason: context.failureReason,
      expectedValue: context.expectedValue,
      actualValue: context.actualValue,
      rawData: context.rawData instanceof Buffer
        ? context.rawData.toString('hex')
        : context.rawData,
    };

    // Log to logger
    logger.logDecodeError(frameId, messageName || 'unknown', signalName || 'unknown', error, {
      errorCode: errorRecord.errorCode,
      errorType: errorRecord.errorType,
      failureReason: errorRecord.failureReason,
      expectedValue: errorRecord.expectedValue,
      actualValue: errorRecord.actualValue,
      rawData: errorRecord.rawData,
    });

    // Store error (keep only recent ones)
    if (this.decodeErrors.length >= this.maxErrors) {
      this.decodeErrors.shift();
    }
    this.decodeErrors.push(errorRecord);
  }

  recordUnknownCanId(frame: CanFrame): void {
    const canId = frame.id;
    const dataStr = frame.data.toString('hex');
    const now = Date.now();

    const existing = this.unknownIds.get(canId);
    if (existing) {
      existing.lastSeen = now;
      existing.count++;
    } else {
      if (this.unknownIds.size >= this.maxUnknownIds) {
        // Remove oldest
        const oldestId = Array.from(this.unknownIds.entries())
          .sort((a, b) => a[1].firstSeen - b[1].firstSeen)[0][0];
        this.unknownIds.delete(oldestId);
      }

      logger.logUnknownCanId(canId, frame.data);
      this.unknownIds.set(canId, {
        canId,
        firstSeen: now,
        lastSeen: now,
        count: 1,
        sampleData: dataStr,
      });
    }
  }

  getRecentErrors(limit: number = 100): CanDecodeError[] {
    return this.decodeErrors.slice(-limit);
  }

  getErrorStats(): {
    totalErrors: number;
    errorsByCode: Record<string, number>;
    errorsByType: Record<string, number>;
    recentErrors: CanDecodeError[];
  } {
    const errorsByCode: Record<string, number> = {};
    const errorsByType: Record<string, number> = {};

    for (const error of this.decodeErrors) {
      errorsByCode[error.errorCode] = (errorsByCode[error.errorCode] || 0) + 1;
      errorsByType[error.errorType] = (errorsByType[error.errorType] || 0) + 1;
    }

    return {
      totalErrors: this.decodeErrors.length,
      errorsByCode,
      errorsByType,
      recentErrors: this.getRecentErrors(50),
    };
  }

  getUnknownIds(): UnknownCanId[] {
    return Array.from(this.unknownIds.values());
  }

  clearErrors(): void {
    this.decodeErrors = [];
  }

  clearUnknownIds(): void {
    this.unknownIds.clear();
  }
}

export const canDiagnostics = new CanDiagnostics();


