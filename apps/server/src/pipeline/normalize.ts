import type { MessageData } from '@can-telemetry/common';
import type { CanFrame } from '@can-telemetry/common';
import dbcLoader from '../dbc/loader.js';
import { extractBits, applyScale, clamp, isBigEndian } from '../decoder/bitops.js';
import { checkLifeCnt, checkXorChecksum } from '../decoder/checks.js';
import { createLogger } from '../utils/logger.js';
import { canDiagnostics } from '../dbc/diagnostics.js';
import { healthMonitor } from '../monitoring/health.js';

const logger = createLogger('normalize');
const lifeCntCache = new Map<number, number>();

export function normalizeFrame(frame: CanFrame): MessageData | null {
  const msg = dbcLoader.getMessage(frame.id);
  if (!msg) {
    // Record unknown CAN ID if diagnostics enabled (default: enabled)
    if (process.env.DIAGNOSTICS_ENABLED !== 'false') {
      canDiagnostics.recordUnknownCanId(frame);
    }
    return null;
  }

  // Log decode start if in debug mode
  logger.logCanFrameDecodeStart(frame.id, msg.name, frame.data);

  const values: Record<string, number> = {};
  let healthy = true;

  for (const signal of msg.signals) {
    const startBit = signal.startBit ?? 0;
    const length = signal.length ?? 8;
    const bigEndian = isBigEndian(signal.endianness);

    try {
      const rawValue = extractBits(frame.data, startBit, length, bigEndian, signal.signed ?? false);
      const scaledValue = applyScale(rawValue, signal.factor ?? 1, signal.offset ?? 0);
      const clampedValue = clamp(scaledValue, signal.min, signal.max);

      values[signal.name] = clampedValue;

      // Update signal status for health monitoring
      const cycleTime = msg.cycleTime || 100;
      healthMonitor.updateSignal(signal.name, clampedValue, cycleTime);

      // Log signal decode in debug mode
      logger.logSignalDecode(frame.id, signal.name, rawValue, scaledValue, clampedValue);

      // LifeCnt check
      if (signal.name.includes('LifeCnt')) {
        const previous = lifeCntCache.get(frame.id);
        const isValid = checkLifeCnt(clampedValue, previous);
        
        logger.logLifeCntCheck(frame.id, signal.name, clampedValue, previous, isValid);

        if (!isValid) {
          healthy = false;
          if (process.env.DIAGNOSTICS_ENABLED !== 'false') {
            canDiagnostics.recordDecodeError(
              frame.id,
              msg.name,
              signal.name,
              new Error('LifeCnt check failed'),
              {
                errorCode: 'LIFECNT_CHECK_FAILED',
                errorType: 'ValidationError',
                failureReason: `Expected ${((previous || 0) + 1) % 16}, got ${clampedValue}`,
                expectedValue: ((previous || 0) + 1) % 16,
                actualValue: clampedValue,
              }
            );
          }
        }
        lifeCntCache.set(frame.id, clampedValue);
      }

      // Checksum check
      if (signal.name.includes('CheckSum')) {
        const calculatedXor = frame.data.reduce((xor, byte, idx) => (idx < 7 ? xor ^ byte : xor), 0);
        const isValid = checkXorChecksum(frame.data, clampedValue);
        
        logger.logChecksumCheck(frame.id, signal.name, calculatedXor, clampedValue, isValid);

        if (!isValid) {
          healthy = false;
          if (process.env.DIAGNOSTICS_ENABLED !== 'false') {
            canDiagnostics.recordDecodeError(
              frame.id,
              msg.name,
              signal.name,
              new Error('Checksum validation failed'),
              {
                errorCode: 'CHECKSUM_CHECK_FAILED',
                errorType: 'ValidationError',
                failureReason: `Calculated XOR=${calculatedXor}, received=${clampedValue}`,
                expectedValue: calculatedXor,
                actualValue: clampedValue,
                rawData: frame.data.toString('hex'),
              }
            );
          }
        }
      }
    } catch (error) {
      const err = error as Error;
      
      // Determine error type and code
      let errorCode = 'DECODE_ERROR';
      let errorType = err.name || 'Error';
      let failureReason = err.message;

      if (err.message.includes('Invalid bit range')) {
        errorCode = 'INVALID_BIT_RANGE';
        errorType = 'BitRangeError';
        failureReason = `startBit=${startBit}, length=${length}`;
      } else if (err.message.includes('bit')) {
        errorCode = 'BIT_EXTRACTION_ERROR';
        errorType = 'BitExtractionError';
      }

      logger.logDecodeError(frame.id, msg.name, signal.name, err, {
        errorCode,
        errorType,
        failureReason,
        rawData: frame.data.toString('hex'),
      });

      if (process.env.DIAGNOSTICS_ENABLED !== 'false') {
        canDiagnostics.recordDecodeError(frame.id, msg.name, signal.name, err, {
          errorCode,
          errorType,
          failureReason,
          rawData: frame.data.toString('hex'),
        });
      }

      healthy = false;
    }
  }

  return {
    msgId: frame.id,
    name: msg.name,
    timestamp: frame.timestamp,
    values,
    raw: frame.data,
    healthy,
  };
}

