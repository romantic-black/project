/**
 * Extract bits from a CAN frame buffer to decode signal values
 * 
 * This is the CORE decoding function that converts raw CAN bytes to numeric values
 * according to DBC file signal definitions (startBit, length, endianness, signed)
 * 
 * @param data - Raw CAN frame data (Buffer of 8 bytes typically)
 * @param startBit - Starting bit position (0-63, counting from byte 0)
 * @param length - Number of bits to extract (1-64)
 * @param isBigEndian - true=Motorola/big-endian, false=Intel/little-endian
 * @param isSigned - Whether to interpret as signed integer
 * @returns Decoded raw value (before scaling/offset from DBC)
 * 
 * @example
 * // Extract VCU_VehSpeed: startBit=0, length=16, big-endian, unsigned
 * const speed = extractBits(frame.data, 0, 16, true, false);
 * 
 * Flow in normalizeFrame():
 * 1. extractBits() → rawValue (integer)
 * 2. applyScale() → scaledValue (physical units)
 * 3. clamp() → finalValue (enforce min/max)
 */
export function extractBits(
  data: Buffer,
  startBit: number,
  length: number,
  isBigEndian: boolean = true,
  isSigned: boolean = false
): number {
  // Validate bit range: startBit >= 0, 1 <= length <= 64
  if (startBit < 0 || length <= 0 || length > 64) {
    throw new Error(`Invalid bit range: start=${startBit}, length=${length}`);
  }

  let value = 0;
  const endBit = startBit + length - 1;

  // ============================================================================
  // BIG-ENDIAN (Motorola) Format
  // ============================================================================
  // CAN bus typically uses Motorola byte order:
  // - Bits are numbered MSB-first within each byte (bit 7 → bit 0)
  // - When crossing byte boundary, move to next HIGHER byte
  // - Example: Byte 0[7..0] Byte 1[7..0] Byte 2[7..0] ...
  //
  // Visual Example (startBit=5, length=10):
  // Byte 0:  7 6 5 4 3 2 1 0
  //          x x|S S S S S S|  ← bits 5-7 from byte 0
  // Byte 1:  7 6 5 4 3 2 1 0
  //          |E E E E x x x x|  ← bits 0-3 from byte 1
  //          S=Start, E=End
  //
  // Algorithm: Start from startBit, read bits counting DOWN (bitIndex--)
  // ============================================================================
  if (isBigEndian) {
    let byteIndex = Math.floor(startBit / 8);  // Which byte (0-7)
    let bitIndex = startBit % 8;               // Which bit within byte (0-7)

    // Read each bit from MSB to LSB order
    for (let offset = 0; offset < length; offset++) {
      // Extract bit value: shift right, mask with 1
      const bitValue =
        byteIndex < data.length ? (data[byteIndex] >> bitIndex) & 1 : 0;
      
      // Build value bit-by-bit: multiply by 2, add next bit
      value = value * 2 + bitValue;

      // Move to previous bit (or next byte if crossed boundary)
      if (bitIndex === 0) {
        byteIndex += 1;  // Move to next HIGHER byte
        bitIndex = 7;    // Reset to MSB of new byte
      } else {
        bitIndex -= 1;   // Move to next LOWER bit
      }
    }
  } 
  // ============================================================================
  // LITTLE-ENDIAN (Intel) Format
  // ============================================================================
  // Intel byte order (less common in CAN):
  // - Bits are numbered LSB-first within each byte (bit 0 → bit 7)
  // - When crossing byte boundary, move to next HIGHER byte
  // - Example: Byte 0[0..7] Byte 1[0..7] Byte 2[0..7] ...
  //
  // Visual Example (startBit=5, length=10):
  // Byte 0:  0 1 2 3 4 5 6 7
  //          x x x x x|S S|  ← bits 5-7 from byte 0
  // Byte 1:  0 1 2 3 4 5 6 7
  //          |E E E E E x x x|  ← bits 0-4 from byte 1
  //
  // Algorithm: Read bits in increasing order
  // ============================================================================
  else {
    for (let bit = startBit; bit <= endBit; bit++) {
      const byteIndex = Math.floor(bit / 8);  // Which byte (0-7)
      const bitIndex = bit % 8;               // Which bit within byte (0-7)
      
      if (byteIndex < data.length) {
        // Extract bit value
        const bitValue = (data[byteIndex] >> bitIndex) & 1;
        // Build value by accumulating with bit position weight
        value += bitValue * Math.pow(2, bit - startBit);
      }
    }
  }

  // ============================================================================
  // SIGNED VALUE HANDLING
  // ============================================================================
  // Convert unsigned bit pattern to signed integer using two's complement
  // Common for signals like temperature, current (can be negative)
  //
  // Example: 16-bit signed
  // - 0x7FFF = 32767 (max positive)
  // - 0x8000 = -32768 (min negative)
  // - Algorithm: Check sign bit, extend sign if negative
  // ============================================================================
  if (isSigned) {
    if (length < 32) {
      // Small values: use bitwise operations for speed
      const signBit = 1 << (length - 1);  // MSB is sign bit
      if (value & signBit) {
        // Negative: extend sign bits using bitwise OR with mask of 1s
        value |= ~((1 << length) - 1);  // ~((1<<16)-1) = 0xFFFF0000
      }
    } else if (length === 32) {
      // 32-bit: use JavaScript's native signed conversion
      value = value | 0;  // Force 32-bit signed integer
    } else if (length < 53) {
      // Large values (33-52 bits): use subtraction for sign extension
      // JavaScript numbers are IEEE754, safe up to 2^53
      const signBit = Math.pow(2, length - 1);
      if (value >= signBit) {
        // Negative: subtract 2^length to get signed representation
        value -= Math.pow(2, length);
      }
    }
  }

  return value;
}

/**
 * Apply DBC scaling factor and offset to convert raw value to physical units
 * 
 * Formula: physicalValue = rawValue * factor + offset
 * 
 * @param rawValue - Raw integer from extractBits()
 * @param factor - Scaling multiplier from DBC (e.g. 0.05 for speed)
 * @param offset - Offset value from DBC (e.g. -40 for temperature)
 * @returns Physical value in real-world units
 * 
 * @example
 * // VCU_VehSpeed: raw=2000, factor=0.05, offset=0 → 100 km/h
 * const speed = applyScale(2000, 0.05, 0);
 * 
 * @example
 * // Temperature: raw=50, factor=1, offset=-40 → 10°C
 * const temp = applyScale(50, 1, -40);
 */
export function applyScale(rawValue: number, factor: number = 1, offset: number = 0): number {
  return rawValue * factor + offset;
}

/**
 * Clamp value to DBC-defined min/max bounds
 * 
 * Prevents invalid physical values (e.g. negative speed, overflow)
 * 
 * @param value - Scaled physical value
 * @param min - Minimum allowed value (undefined = no limit)
 * @param max - Maximum allowed value (undefined = no limit)
 * @returns Clamped value within bounds
 * 
 * @example
 * // Speed: 150 km/h → clamp to [0, 120] → 120 km/h
 * const safeSpeed = clamp(150, 0, 120);
 */
export function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

/**
 * Determine if signal uses big-endian (Motorola) byte order
 * 
 * CAN bus typically uses Motorola byte order by default
 * 
 * @param endianness - String from DBC: 'big', 'motorola', 'little', 'intel'
 * @returns true if big-endian, false if little-endian
 */
export function isBigEndian(endianness?: string): boolean {
  return endianness === 'big' || endianness === 'motorola' || endianness === undefined;
}

/**
 * Encode a value into a buffer at the specified bit position
 * 
 * This is the INVERSE of extractBits() - used for encoding mock/test data
 * Must perfectly match the extraction logic for round-trip consistency
 * 
 * Used by MockSource to generate valid CAN frames based on DBC definitions
 * 
 * @param data - Buffer to write into (typically 8 bytes for CAN frame)
 * @param startBit - Starting bit position (0-63)
 * @param length - Number of bits to encode (1-53)
 * @param value - Value to encode (can be signed or unsigned)
 * @param isBigEndian - true=Motorola/big-endian, false=Intel/little-endian
 * 
 * @example
 * // Mock VCU_VehSpeed: encode 100 km/h (raw=2000)
 * const frame = Buffer.alloc(8);
 * encodeBits(frame, 0, 16, 2000, true);
 */
export function encodeBits(
  data: Buffer,
  startBit: number,
  length: number,
  value: number,
  isBigEndian: boolean = true
): void {
  if (startBit < 0 || length <= 0 || length > 64) {
    throw new Error(`Invalid bit range: start=${startBit}, length=${length}`);
  }

  // JavaScript's safe integer limit: 2^53
  if (length > 53) {
    throw new Error('encodeBits only supports signal lengths up to 53 bits');
  }

  const maxUnsignedValue = Math.pow(2, length);
  const mask = maxUnsignedValue - 1;

  // Handle signed values - convert to unsigned representation using two's complement
  let unsignedValue = Math.trunc(value);
  if (value < 0) {
    // Convert negative to unsigned: e.g. -10 → (2^16 + (-10 % 2^16)) % 2^16
    const normalized = (maxUnsignedValue + (value % maxUnsignedValue)) % maxUnsignedValue;
    unsignedValue = Math.trunc(normalized);
  }

  // Clamp value to valid range for bit length
  if (unsignedValue < 0 || unsignedValue > mask) {
    unsignedValue = Math.max(0, Math.min(mask, unsignedValue));
  }

  const endBit = startBit + length - 1;

  if (isBigEndian) {
    // Big-endian (Motorola): encode MSB first, same ordering as extraction
    let byteIndex = Math.floor(startBit / 8);
    let bitIndex = startBit % 8;

    for (let offset = 0; offset < length; offset++) {
      if (byteIndex < data.length) {
        // Extract bit from value: start from MSB, work down
        const valueBitIndex = length - 1 - offset;
        const bitValue =
          Math.floor(unsignedValue / Math.pow(2, valueBitIndex)) & 1;

        // Write bit to buffer
        if (bitValue) {
          data[byteIndex] |= 1 << bitIndex;
        } else {
          data[byteIndex] &= ~(1 << bitIndex);
        }
      }

      // Move to previous bit (or next byte if crossed boundary)
      if (bitIndex === 0) {
        byteIndex += 1;
        bitIndex = 7;
      } else {
        bitIndex -= 1;
      }
    }
  } else {
    // Little-endian (Intel): encode bits in increasing order
    // Mirror of extractBits little-endian logic
    for (let bit = startBit; bit <= endBit; bit++) {
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = bit % 8; // Same calculation as extractBits
      
      if (byteIndex < data.length) {
        // Calculate which bit of the value corresponds to this position
        const valueBitIndex = bit - startBit;
        const bitValue = Math.floor(unsignedValue / Math.pow(2, valueBitIndex)) & 1;
        
        // Write bit to buffer
        if (bitValue) {
          data[byteIndex] |= (1 << bitIndex);
        } else {
          data[byteIndex] &= ~(1 << bitIndex);
        }
      }
    }
  }
}

/**
 * Inverse of applyScale: convert physical value to raw integer value
 * 
 * Used by MockSource to generate test data from physical units
 * 
 * Formula: rawValue = round((physicalValue - offset) / factor)
 * 
 * @param physicalValue - Physical value in real-world units
 * @param factor - Scaling multiplier from DBC
 * @param offset - Offset value from DBC
 * @returns Raw integer value ready for encodeBits()
 * 
 * @example
 * // Speed: 100 km/h → raw=2000 (100/0.05)
 * const raw = inverseScale(100, 0.05, 0);
 * 
 * @example
 * // Temperature: 10°C → raw=50 (10-(-40)/1)
 * const raw = inverseScale(10, 1, -40);
 */
export function inverseScale(physicalValue: number, factor: number = 1, offset: number = 0): number {
  return Math.round((physicalValue - offset) / factor);
}

