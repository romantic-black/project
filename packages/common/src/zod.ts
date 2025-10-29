import { z } from 'zod';

export const CanFrameSchema = z.object({
  id: z.number().int().min(0).max(0x7FF),
  data: z.instanceof(Buffer),
  timestamp: z.number(),
  extended: z.boolean().optional(),
});

export const MessageDataSchema = z.object({
  msgId: z.number(),
  name: z.string(),
  timestamp: z.number(),
  values: z.record(z.string(), z.number()),
  raw: z.instanceof(Buffer),
  healthy: z.boolean(),
});

export const HistoryQuerySchema = z.object({
  signals: z.string().transform((s) => s.split(',').map((x) => x.trim())),
  from: z.string().datetime(),
  to: z.string().datetime(),
  step: z.enum(['1s', '10s']).default('1s'),
});

export const SnapshotQuerySchema = z.object({
  signals: z.string().transform((s) => s.split(',').map((x) => x.trim())),
});

