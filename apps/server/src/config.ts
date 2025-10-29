import dotenv from 'dotenv';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root directory (two levels up from apps/server/src)
export const PROJECT_ROOT = join(__dirname, '../../..');

// Load .env from project root
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

const configSchema = z.object({
  DATA_MODE: z.enum(['socketcan', 'vcan', 'replay', 'mock']).default('mock'),
  CAN_IFACE: z.string().default('can0'),
  WS_PORT: z.coerce.number().default(8080),
  HTTP_PORT: z.coerce.number().default(3000),
  DB_PATH: z.string().default('./data/telemetry.db'),
  REPLAY_FILE: z.string().default('./samples/replay.json'),
  DBC_JSON: z.string().default('./dbc/vehicle.json'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PERFORMANCE_MODE: z.enum(['normal', 'low']).default('normal').optional(),
  ENABLE_RAW_FRAME_LOG: z.coerce.boolean().default(false).optional(),
  DIAGNOSTICS_ENABLED: z.coerce.boolean().default(true).optional(),
  HEALTH_CHECK_INTERVAL: z.coerce.number().default(30).optional(),
});

export type Config = z.infer<typeof configSchema>;

let config: Config;

try {
  config = configSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Configuration error:', error.errors);
    process.exit(1);
  }
  throw error;
}

export default config;

