import { create } from 'zustand';
import type { MessageData } from '@can-telemetry/common';

interface TelemetryState {
  messages: Map<string, MessageData>;
  lastUpdate: number;
  connected: boolean;
  setMessage: (msg: MessageData) => void;
  setConnected: (connected: boolean) => void;
  getSignal: (signalName: string) => number | undefined;
  clear: () => void;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  messages: new Map(),
  lastUpdate: 0,
  connected: false,
  setMessage: (msg) => {
    set((state) => {
      const newMessages = new Map(state.messages);
      newMessages.set(msg.name, msg);
      return {
        messages: newMessages,
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
  clear: () => set({ messages: new Map(), lastUpdate: 0 }),
}));

