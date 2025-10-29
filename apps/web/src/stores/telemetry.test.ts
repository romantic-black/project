import test from 'node:test';
import assert from 'node:assert/strict';
import { useTelemetryStore, DEFAULT_HISTORY_LIMIT } from './telemetry.js';
import type { MessageData } from '@can-telemetry/common';

function createMessage(
  name: string,
  values: Record<string, number>,
  timestamp: number
): MessageData {
  return {
    msgId: 0,
    name,
    timestamp,
    values,
    raw: Buffer.alloc(0),
    healthy: true,
  };
}

test('stores bounded history per signal', () => {
  useTelemetryStore.getState().clear();
  const limit = DEFAULT_HISTORY_LIMIT;

  for (let i = 0; i < limit + 5; i += 1) {
    useTelemetryStore.getState().setMessage(
      createMessage('TestMessage', { signalA: i }, i)
    );
  }

  const history = useTelemetryStore.getState().getSignalHistory('signalA');

  assert.equal(history.length, limit);
  assert.deepEqual(history[0], { timestamp: 5, value: 5 });
  assert.deepEqual(history.at(-1), { timestamp: 124, value: 124 });
});

test('returns limited slices of history when requested', () => {
  useTelemetryStore.getState().clear();

  for (let i = 0; i < 20; i += 1) {
    useTelemetryStore.getState().setMessage(
      createMessage('AnotherMessage', { signalB: i, signalC: i * 2 }, i)
    );
  }

  const limited = useTelemetryStore
    .getState()
    .getSignalHistory('signalB', 5);

  assert.equal(limited.length, 5);
  assert.deepEqual(limited[0], { timestamp: 15, value: 15 });
  assert.deepEqual(limited[4], { timestamp: 19, value: 19 });

  const secondary = useTelemetryStore
    .getState()
    .getSignalHistory('signalC');

  assert.deepEqual(secondary[0], { timestamp: 0, value: 0 });
  assert.deepEqual(secondary.at(-1), { timestamp: 19, value: 38 });
});
