export const CAN_CONFIG = {
  BITRATE: 500000,
  INTERFACE_TYPE: 'can' as const,
  PROTOCOL: 'can20a' as const,
  ENDIANNESS: 'motorola' as const,
  REMOTE_CONTROLLER_PERIOD_MS: 50,
  VCU_PERIOD_MS: 100,
} as const;

