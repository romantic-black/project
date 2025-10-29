declare module 'node:test' {
  type TestFn = (name: string, fn: () => void | Promise<void>) => void;
  const test: TestFn;
  export default test;
}

declare module 'node:assert/strict' {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare const Buffer: {
  alloc(size: number): any;
};

declare module '@can-telemetry/common' {
  export interface MessageData {
    msgId: number;
    name: string;
    timestamp: number;
    values: Record<string, number>;
    raw: any;
    healthy: boolean;
  }
}
