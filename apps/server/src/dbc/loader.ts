import { readFileSync } from 'fs';
import { join } from 'path';
import config, { PROJECT_ROOT } from '../config.js';

export interface DbcSignal {
  name: string;
  startBit?: number;
  length?: number;
  factor?: number;
  offset?: number;
  min?: number;
  max?: number;
  unit?: string;
  endianness?: 'little' | 'big';
  valTable?: Record<number, string>;
  comment?: string;
}

export interface DbcMessage {
  id: number;
  name: string;
  length: number;
  sender?: string;
  cycleTime?: number;
  signals: DbcSignal[];
}

export interface DbcData {
  messages: DbcMessage[];
  valTables: Record<string, Record<number, string>>;
}

class DbcLoader {
  private dbcData?: DbcData;

  async load(): Promise<DbcData> {
    if (this.dbcData) {
      return this.dbcData;
    }

    try {
      const filePath = config.DBC_JSON.startsWith('/')
        ? config.DBC_JSON
        : join(PROJECT_ROOT, config.DBC_JSON);
      const content = readFileSync(filePath, 'utf-8');
      this.dbcData = JSON.parse(content) as DbcData;
      return this.dbcData;
    } catch (error) {
      console.error(`Failed to load DBC file: ${config.DBC_JSON}`, error);
      throw error;
    }
  }

  getMessage(id: number): DbcMessage | undefined {
    if (!this.dbcData) return undefined;
    return this.dbcData.messages.find((msg) => msg.id === id);
  }

  getSignal(msgId: number, signalName: string): DbcSignal | undefined {
    const msg = this.getMessage(msgId);
    if (!msg) return undefined;
    return msg.signals.find((sig) => sig.name === signalName);
  }

  getValTable(name: string): Record<number, string> | undefined {
    if (!this.dbcData) return undefined;
    return this.dbcData.valTables[name];
  }
}

export default new DbcLoader();

