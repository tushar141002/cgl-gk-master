import { describe, expect, it } from 'vitest';
import { uuidV7 } from '../../shared/uuid';

const fixedRandom = (size: number): Uint8Array => Uint8Array.from({ length: size }, (_value, index) => index);

describe('uuidV7 (D-011)', () => {
  it('encodes the timestamp, version 7 and the RFC 4122 variant', () => {
    const id = uuidV7(0x0123456789ab, fixedRandom);
    expect(id).toBe('01234567-89ab-7607-8809-0a0b0c0d0e0f');
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });

  it('sorts lexicographically by time for the same random source', () => {
    const earlier = uuidV7(1_000, fixedRandom);
    const later = uuidV7(2_000, fixedRandom);
    expect(earlier < later).toBe(true);
  });

  it('rejects timestamps outside the 48-bit range', () => {
    expect(() => uuidV7(-1, fixedRandom)).toThrow(RangeError);
    expect(() => uuidV7(Number.NaN, fixedRandom)).toThrow(RangeError);
    expect(() => uuidV7(0x1_0000_0000_0000, fixedRandom)).toThrow(RangeError);
  });

  it('rejects a random source that does not return 16 bytes', () => {
    expect(() => uuidV7(1, () => new Uint8Array(8))).toThrow(RangeError);
  });
});
