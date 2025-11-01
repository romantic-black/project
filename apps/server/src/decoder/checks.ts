/**
 * Check LifeCnt (Life Counter) signal for frame loss detection
 * 
 * LifeCnt is a 4-bit counter (0-15) that increments with each CAN frame transmission.
 * It cycles: 0→1→2→...→14→15→0→1→...
 * 
 * Purpose: Detect CAN frame loss or duplication
 * - If LifeCnt jumps unexpectedly (e.g., 3→5), frames were lost
 * - If LifeCnt doesn't change, frames are duplicated
 * - Normal: each frame's LifeCnt = (previous + 1) % 16
 * 
 * Used by: normalizeFrame() to validate data integrity
 * 
 * @param current - Current LifeCnt value from CAN frame (0-15)
 * @param previous - Previous LifeCnt value (undefined for first frame)
 * @returns true if LifeCnt is valid (first frame or increments by 1)
 * 
 * @example
 * // First frame: no previous value
 * checkLifeCnt(5, undefined)  // → true (always valid)
 * 
 * @example
 * // Normal: expected increment
 * checkLifeCnt(3, 2)   // → true (3 = (2+1) % 16)
 * checkLifeCnt(15, 14) // → true (15 = (14+1) % 16)
 * checkLifeCnt(0, 15)  // → true (0 = (15+1) % 16, wrapped around)
 * 
 * @example
 * // Error: frame loss (jumped from 2 to 5)
 * checkLifeCnt(5, 2)   // → false (5 ≠ (2+1) % 16 = 3)
 * 
 * @example
 * // Error: duplicate frame (didn't increment)
 * checkLifeCnt(5, 5)   // → false (5 ≠ (5+1) % 16 = 6)
 */
export function checkLifeCnt(current: number, previous?: number): boolean {
  // First frame: no validation possible, assume valid
  if (previous === undefined) return true;
  
  // Expected: previous value incremented by 1, wrapped at 16
  const expected = (previous + 1) % 16;
  return current === expected;
}

/**
 * Check XOR checksum for CAN frame integrity
 * 
 * XOR checksum is a simple error detection mechanism:
 * - Calculate XOR of first 7 bytes (byte 0-6)
 * - Compare with checksum byte (usually byte 7)
 * - If mismatch: data corruption detected
 * 
 * Formula: checksum = data[0] XOR data[1] XOR ... XOR data[6]
 * 
 * Note: Checksum is usually stored in the 8th byte (index 7)
 * 
 * Used by: normalizeFrame() to detect transmission errors
 * 
 * @param data - CAN frame data (8 bytes Buffer)
 * @param checksumByte - Checksum value from the frame (decoded signal value)
 * @returns true if XOR checksum matches
 * 
 * @example
 * // Valid checksum
 * const data = Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xXX]);
 * // XOR of first 7 bytes = 0xXX
 * checkXorChecksum(data, 0xXX)  // → true
 * 
 * @example
 * // Invalid checksum (data corruption)
 * const corrupted = Buffer.from([0x13, 0x34, 0x56, ...]); // 1st byte changed
 * checkXorChecksum(corrupted, 0xXX)  // → false
 * 
 * @example
 * // Edge case: short buffer
 * checkXorChecksum(Buffer.from([1, 2]), 0xFF)  // → false (need 8 bytes)
 */
export function checkXorChecksum(data: Buffer, checksumByte: number): boolean {
  // CAN frame must have at least 8 bytes
  if (data.length < 8) return false;
  
  // Calculate XOR of first 7 bytes (byte 0-6)
  let xor = 0;
  for (let i = 0; i < 7; i++) {
    xor ^= data[i];
  }
  
  // Compare with checksum byte
  return xor === checksumByte;
}

