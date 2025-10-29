import { create } from 'zustand';
import type { MessageData } from '@can-telemetry/common';

export interface SignalHistoryEntry {
  timestamp: number;
  value: number;
}
export const DEFAULT_HISTORY_LIMIT = 120;

interface TelemetryState {
  messages: Map<string, MessageData>;
  history: Map<string, SignalHistoryEntry[]>;
  lastUpdate: number;
  connected: boolean;
  setMessage: (msg: MessageData) => void;
  setConnected: (connected: boolean) => void;
  getSignal: (signalName: string) => number | undefined;
  getSignalHistory: (signalName: string, limit?: number) => SignalHistoryEntry[];
  clear: () => void;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  messages: new Map(),
  history: new Map(),
  lastUpdate: 0,
  connected: false,
  setMessage: (msg) => {
    set((state) => {
      const newMessages = new Map(state.messages);
      newMessages.set(msg.name, msg);

      const newHistory = new Map(state.history);
      for (const [signalName, value] of Object.entries(msg.values)) {
        const existingHistory = newHistory.get(signalName) ?? [];
        const updatedHistory = [
          ...existingHistory,
          {
            timestamp: msg.timestamp,
            value,
          },
        ];

        if (updatedHistory.length > DEFAULT_HISTORY_LIMIT) {
          newHistory.set(
            signalName,
            updatedHistory.slice(updatedHistory.length - DEFAULT_HISTORY_LIMIT)
          );
        } else {
          newHistory.set(signalName, updatedHistory);
        }
      }
      return {
        messages: newMessages,
        history: newHistory,
        lastUpdate: Date.now(),
      };
    });
  },
  setConnected: (connected) => set({ connected }),
  getSignal: (signalName) => {
    const state = get();
    for (const msg of state.messages.values()) {
      if (signalName in msg.values) {
        return msg.values[signalName];
      }
    }
    return undefined;
  },
  getSignalHistory: (signalName, limit) => {
    const history = get().history.get(signalName) ?? [];
    if (!limit || limit >= history.length) {
      return history.slice();
    }
    return history.slice(history.length - limit);
  },
  clear: () => set({ messages: new Map(), history: new Map(), lastUpdate: 0 }),
}));

