export function extractBits(
  data: Buffer,
  startBit: number,
  length: number,
  isBigEndian: boolean = true,
  isSigned: boolean = false
): number {
  if (startBit < 0 || length <= 0 || length > 64) {
    throw new Error(`Invalid bit range: start=${startBit}, length=${length}`);
  }

  let value = 0;
  const endBit = startBit + length - 1;

  if (isBigEndian) {
    // Motorola / big-endian format: bits count down within a byte (MSB→LSB)
    // and advance to the next higher byte once the byte boundary is crossed.
    let byteIndex = Math.floor(startBit / 8);
    let bitIndex = startBit % 8;

    for (let offset = 0; offset < length; offset++) {
      const bitValue =
        byteIndex < data.length ? (data[byteIndex] >> bitIndex) & 1 : 0;
      value = value * 2 + bitValue;

      if (bitIndex === 0) {
        byteIndex += 1;
        bitIndex = 7;
      } else {
        bitIndex -= 1;
      }
    }
  } else {
    for (let bit = startBit; bit <= endBit; bit++) {
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = bit % 8;
      if (byteIndex < data.length) {
        const bitValue = (data[byteIndex] >> bitIndex) & 1;
        value += bitValue * Math.pow(2, bit - startBit);
      }
    }
  }

  if (isSigned) {
    if (length < 32) {
      const signBit = 1 << (length - 1);
      if (value & signBit) {
        value |= ~((1 << length) - 1);
      }
    } else if (length === 32) {
      value = value | 0;
    } else if (length < 53) {
      const signBit = Math.pow(2, length - 1);
      if (value >= signBit) {
        value -= Math.pow(2, length);
      }
    }
  }

  return value;
}

export function applyScale(rawValue: number, factor: number = 1, offset: number = 0): number {
  return rawValue * factor + offset;
}

export function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

export function isBigEndian(endianness?: string): boolean {
  return endianness === 'big' || endianness === 'motorola' || endianness === undefined;
}

/**
 * Encode a value into a buffer at the specified bit position
 * This is the inverse of extractBits - must perfectly match the extraction logic
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

  if (length > 53) {
    throw new Error('encodeBits only supports signal lengths up to 53 bits');
  }

  const maxUnsignedValue = Math.pow(2, length);
  const mask = maxUnsignedValue - 1;

  // Handle signed values - convert to unsigned representation
  let unsignedValue = Math.trunc(value);
  if (value < 0) {
    const normalized = (maxUnsignedValue + (value % maxUnsignedValue)) % maxUnsignedValue;
    unsignedValue = Math.trunc(normalized);
  }

  if (unsignedValue < 0 || unsignedValue > mask) {
    unsignedValue = Math.max(0, Math.min(mask, unsignedValue));
  }

  const endBit = startBit + length - 1;

  if (isBigEndian) {
    // Big-endian (Motorola): bits are encoded MSB first following the same ordering as extraction
    let byteIndex = Math.floor(startBit / 8);
    let bitIndex = startBit % 8;

    for (let offset = 0; offset < length; offset++) {
      if (byteIndex < data.length) {
        const valueBitIndex = length - 1 - offset;
        const bitValue =
          Math.floor(unsignedValue / Math.pow(2, valueBitIndex)) & 1;

        if (bitValue) {
          data[byteIndex] |= 1 << bitIndex;
        } else {
          data[byteIndex] &= ~(1 << bitIndex);
        }
      }

      if (bitIndex === 0) {
        byteIndex += 1;
        bitIndex = 7;
      } else {
        bitIndex -= 1;
      }
    }
  } else {
    // Little-endian (Intel): bits are read LSB first
    // In extractBits: for bit from startBit to endBit, read bitIndex = bit % 8
    // and build value by OR-ing with shifted bitValue
    for (let bit = startBit; bit <= endBit; bit++) {
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = bit % 8; // Same calculation as extractBits
      
      if (byteIndex < data.length) {
        // Calculate which bit of the value corresponds to this position
        const valueBitIndex = bit - startBit;
        const bitValue = Math.floor(unsignedValue / Math.pow(2, valueBitIndex)) & 1;
        
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
 * Inverse of applyScale: convert physical value to raw value
 */
export function inverseScale(physicalValue: number, factor: number = 1, offset: number = 0): number {
  return Math.round((physicalValue - offset) / factor);
}

