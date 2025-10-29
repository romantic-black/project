import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { DbcMessage, DbcSignal } from '../dbc/loader.js';
import dbcLoader from '../dbc/loader.js';
import { applyScale, encodeBits, extractBits, isBigEndian } from '../decoder/bitops.js';
import { normalizeFrame } from './normalize.js';

interface SignalContext {
  message: DbcMessage;
  signal: DbcSignal & { startBit: number; length: number };
}

async function getSignalContext(signalName: string): Promise<SignalContext> {
  const dbc = await dbcLoader.load();
  for (const message of dbc.messages) {
    const signal = message.signals.find((s) => s.name === signalName);
    if (signal && signal.startBit !== undefined && signal.length !== undefined) {
      return { message, signal: { ...signal, startBit: signal.startBit, length: signal.length } };
    }
  }

  throw new Error(`Signal ${signalName} not found in DBC`);
}

function buildFrame(context: SignalContext, rawValue: number): Buffer {
  const { message, signal } = context;
  const data = Buffer.alloc(message.length ?? 8, 0);
  const bigEndian = isBigEndian(signal.endianness);
  encodeBits(data, signal.startBit, signal.length, rawValue, bigEndian);
  return data;
}

test('VCU_VehSpeed decodes raw values representing >120 km/h', async () => {
  const context = await getSignalContext('VCU_VehSpeed');
  const rawValue = 3000; // 3000 * 0.05 = 150 km/h
  const frame = {
    id: context.message.id,
    data: buildFrame(context, rawValue),
    timestamp: Date.now(),
  } as const;

  const result = normalizeFrame(frame);
  assert.ok(result, 'Frame should normalize to a message');

  const physicalValue = applyScale(rawValue, context.signal.factor ?? 1, context.signal.offset ?? 0);
  assert.ok(physicalValue > 120, 'Raw value should correspond to >120 km/h');
  assert.equal(result.values['VCU_VehSpeed'], physicalValue);
});

test('IPC_Land_TargetSpd retains high unsigned values without sign extension', async () => {
  const context = await getSignalContext('IPC_Land_TargetSpd');
  const rawValue = 2600; // 2600 * 0.05 = 130 km/h
  const frame = {
    id: context.message.id,
    data: buildFrame(context, rawValue),
    timestamp: Date.now(),
  } as const;

  const extracted = extractBits(
    frame.data,
    context.signal.startBit,
    context.signal.length,
    isBigEndian(context.signal.endianness),
    context.signal.signed ?? false
  );
  assert.equal(extracted, rawValue, 'Raw extraction should not sign-extend high-bit values');

  const physicalValue = applyScale(rawValue, context.signal.factor ?? 1, context.signal.offset ?? 0);
  assert.ok(physicalValue > 120, 'Raw value should correspond to >120 km/h');

  const result = normalizeFrame(frame);
  assert.ok(result, 'Frame should normalize to a message');
  const clamped = Math.min(
    Math.max(physicalValue, context.signal.min ?? physicalValue),
    context.signal.max ?? physicalValue
  );
  assert.equal(result.values['IPC_Land_TargetSpd'], clamped);
  assert.ok(result.values['IPC_Land_TargetSpd'] >= 0, 'Decoded value should not be negative');
});

