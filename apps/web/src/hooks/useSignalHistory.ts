import { useMemo } from 'react';
import { useTelemetryStore, type SignalHistoryEntry } from '../stores/telemetry';

export function useSignalHistory(signalName: string, limit?: number) {
  const history = useTelemetryStore((state) =>
    state.getSignalHistory(signalName, limit)
  );

  return useMemo<SignalHistoryEntry[]>(
    () => history.map((entry) => ({ ...entry })),
    [history]
  );
}
