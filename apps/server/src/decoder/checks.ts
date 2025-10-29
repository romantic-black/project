export function checkLifeCnt(current: number, previous?: number): boolean {
  if (previous === undefined) return true;
  
  const expected = (previous + 1) % 16;
  return current === expected;
}

export function checkXorChecksum(data: Buffer, checksumByte: number): boolean {
  if (data.length < 8) return false;
  
  let xor = 0;
  for (let i = 0; i < 7; i++) {
    xor ^= data[i];
  }
  
  return xor === checksumByte;
}

