export interface CanFrame {
  id: number;
  data: Buffer;
  timestamp: number;
  extended?: boolean;
}

export interface SignalValue {
  name: string;
  value: number;
  unit?: string;
  raw: number;
}

export interface MessageData {
  msgId: number;
  name: string;
  timestamp: number;
  values: Record<string, number>;
  raw: Buffer;
  healthy: boolean;
}

export interface SourceStats {
  frames: number;
  errors: number;
  lastFrameTime?: number;
}

export interface DbSignalAgg {
  timestamp: number;
  signal_name: string;
  last_value: number;
  first_value: number;
  avg_value: number;
  max_value: number;
  min_value: number;
}

export interface ReplayFrame {
  timestamp: number;
  id: number;
  data: number[];
}

