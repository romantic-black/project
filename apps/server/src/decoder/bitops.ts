export function extractBits(data: Buffer, startBit: number, length: number, isBigEndian: boolean = true): number {
  if (startBit < 0 || length <= 0 || length > 64) {
    throw new Error(`Invalid bit range: start=${startBit}, length=${length}`);
  }

  let value = 0;
  const endBit = startBit + length - 1;

  if (isBigEndian) {
    for (let bit = startBit; bit <= endBit; bit++) {
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = 7 - (bit % 8);
      if (byteIndex < data.length) {
        const bitValue = (data[byteIndex] >> bitIndex) & 1;
        value = (value << 1) | bitValue;
      }
    }
  } else {
    for (let bit = startBit; bit <= endBit; bit++) {
      const byteIndex = Math.floor(bit / 8);
      const bitIndex = bit % 8;
      if (byteIndex < data.length) {
        const bitValue = (data[byteIndex] >> bitIndex) & 1;
        value |= bitValue << (bit - startBit);
      }
    }
  }

  if (length < 32) {
    const signBit = 1 << (length - 1);
    if (value & signBit) {
      value = value | (~((1 << length) - 1));
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

