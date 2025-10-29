import type { MessageData } from '@can-telemetry/common';
import type { CanFrame } from '@can-telemetry/common';
import dbcLoader from '../dbc/loader.js';
import { extractBits, applyScale, clamp, isBigEndian } from '../decoder/bitops.js';
import { checkLifeCnt, checkXorChecksum } from '../decoder/checks.js';

const lifeCntCache = new Map<number, number>();

export function normalizeFrame(frame: CanFrame): MessageData | null {
  const msg = dbcLoader.getMessage(frame.id);
  if (!msg) {
    return null;
  }

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

      if (signal.name.includes('LifeCnt')) {
        const previous = lifeCntCache.get(frame.id);
        if (!checkLifeCnt(clampedValue, previous)) {
          healthy = false;
        }
        lifeCntCache.set(frame.id, clampedValue);
      }

      if (signal.name.includes('CheckSum')) {
        if (!checkXorChecksum(frame.data, clampedValue)) {
          healthy = false;
        }
      }
    } catch (error) {
      console.warn(`Failed to decode signal ${signal.name}:`, error);
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

