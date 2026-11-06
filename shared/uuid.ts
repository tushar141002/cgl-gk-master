/**
 * UUID v7 for attempt ids (D-011).
 *
 * The 48-bit millisecond timestamp comes first, so ids sort in the same order
 * as the attempts they identify. The cursor still compares `(at, id)` as a
 * tuple (D-040); v7 ordering is a convenience, not the contract.
 *
 * Pure except for the default random source, which is injected in tests.
 */

export type RandomBytes = (size: number) => Uint8Array;

const MAX_TIMESTAMP = 0xffffffffffff;

/** A UUID v7 string for a moment in time. */
export function uuidV7(at: number = Date.now(), random: RandomBytes = secureRandomBytes): string {
  if (!Number.isFinite(at) || at < 0 || at > MAX_TIMESTAMP) {
    throw new RangeError(`uuid v7 timestamp must be between 0 and ${MAX_TIMESTAMP}`);
  }

  const bytes = random(16);
  if (bytes.length !== 16) {
    throw new RangeError('uuid v7 needs exactly 16 random bytes');
  }

  let timestamp = Math.floor(at);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }

  // Version 7 in the high nibble; RFC 4122 variant in the top two bits of byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function secureRandomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
