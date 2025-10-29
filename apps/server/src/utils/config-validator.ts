import { existsSync } from 'fs';
import { join } from 'path';
import config, { PROJECT_ROOT } from '../config.js';
import { createLogger } from './logger.js';

const logger = createLogger('config-validator');

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateConfig(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate DBC JSON file
  const dbcPath = config.DBC_JSON.startsWith('/')
    ? config.DBC_JSON
    : join(PROJECT_ROOT, config.DBC_JSON);

  if (!existsSync(dbcPath)) {
    errors.push(`DBC JSON file not found: ${dbcPath}`);
  } else {
    logger.info('DBC file validated', { path: dbcPath });
  }

  // Validate database directory
  const dbPath = config.DB_PATH.startsWith('/')
    ? config.DB_PATH
    : join(PROJECT_ROOT, config.DB_PATH);

  const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
  if (dbDir && !existsSync(dbDir)) {
    warnings.push(`Database directory does not exist (will be created): ${dbDir}`);
  }

  // Validate CAN interface (for socketcan mode)
  if (config.DATA_MODE === 'socketcan') {
    // Note: We can't easily check if CAN interface exists without root,
    // so we just log a warning
    warnings.push(
      `CAN interface validation skipped: ${config.CAN_IFACE}. Ensure it exists and is configured correctly.`
    );
  }

  // Validate replay file (for replay mode)
  if (config.DATA_MODE === 'replay') {
    const replayPath = config.REPLAY_FILE.startsWith('/')
      ? config.REPLAY_FILE
      : join(PROJECT_ROOT, config.REPLAY_FILE);

    if (!existsSync(replayPath)) {
      errors.push(`Replay file not found: ${replayPath}`);
    }
  }

  // Validate ports
  if (config.WS_PORT < 1024 || config.WS_PORT > 65535) {
    errors.push(`Invalid WebSocket port: ${config.WS_PORT} (must be 1024-65535)`);
  }

  if (config.HTTP_PORT < 1024 || config.HTTP_PORT > 65535) {
    errors.push(`Invalid HTTP port: ${config.HTTP_PORT} (must be 1024-65535)`);
  }

  if (config.WS_PORT === config.HTTP_PORT) {
    errors.push(`WebSocket port and HTTP port cannot be the same: ${config.WS_PORT}`);
  }

  // Validate log level
  const validLogLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
  if (!validLogLevels.includes(config.LOG_LEVEL)) {
    warnings.push(
      `Invalid log level: ${config.LOG_LEVEL}. Using 'info' as default.`
    );
  }

  const result: ValidationResult = {
    valid: errors.length === 0,
    errors,
    warnings,
  };

  if (result.valid) {
    logger.info('Configuration validation passed', { warnings });
  } else {
    logger.error('Configuration validation failed', { errors, warnings });
  }

  if (warnings.length > 0) {
    logger.warn('Configuration validation warnings', { warnings });
  }

  return result;
}

