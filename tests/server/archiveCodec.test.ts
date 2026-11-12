import { describe, expect, it } from 'vitest';
import type { AttemptRecord } from '../../shared/contract';
import { uuidV7 } from '../../shared/uuid';
import {
  decodeArchive,
  encodeArchive,
  gunzip,
  gzip,
  sha256Hex,
  type ArchivedAttempt,
} from '../../supabase/functions/_shared/archiveCodec';

const START = Date.UTC(2026, 10, 10, 4, 0, 0);

function day(count: number): ArchivedAttempt[] {
  const out: ArchivedAttempt[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = START + i * 37_000 + (i % 3);
    out.push({
      id: uuidV7(at),
      qid: `polity-const-${String(i % 25).padStart(4, '0')}`,
      qv: 1 + (i % 2),
      chosen: i % 5 === 0 ? null : ((i % 4) as 0 | 1 | 2 | 3),
      correct: i % 5 !== 0 && i % 3 === 0,
      ms: 4_000 + i * 13,
      mode: (['practice', 'revise', 'daily'] as const)[i % 3]!,
      at,
      deviceId: i % 7 === 0 ? 'device-b' : 'device-a',
    });
  }
  return out;
}

describe('archive codec', () => {
  it('round-trips a day of attempts exactly', () => {
    const attempts = day(120);

    expect(decodeArchive(encodeArchive(attempts))).toEqual(attempts);
  });

  it('sorts by time then id, so the same day always encodes the same bytes', () => {
    const attempts = day(40);
    const shuffled = [...attempts].reverse();

    expect(encodeArchive(shuffled)).toEqual(encodeArchive(attempts));
  });

  it('keeps mock ids, skips, non-UUID ids and out-of-order clocks', () => {
    const odd: ArchivedAttempt[] = [
      {
        id: 'legacy-id-1',
        qid: 'q',
        qv: 3,
        chosen: null,
        correct: false,
        ms: 0,
        mode: 'mock',
        mockId: 'mock-2026-11-14',
        at: START,
        deviceId: 'd',
      },
      {
        id: 'legacy-id-2',
        qid: 'q',
        qv: 3,
        chosen: 3,
        correct: true,
        ms: 1,
        mode: 'pyq',
        at: START + 1,
        deviceId: 'd',
      },
    ];

    expect(decodeArchive(encodeArchive(odd))).toEqual(odd);
  });

  it('rounds ms to whole milliseconds and changes nothing else', () => {
    const [one] = day(1);
    const fractional = { ...one!, ms: 1234.6 };

    expect(decodeArchive(encodeArchive([fractional]))).toEqual([{ ...fractional, ms: 1235 }]);
  });

  it('is clearly smaller than gzipped JSON', async () => {
    // Measured about 1.6x: the random half of each UUIDv7 does not compress in
    // either format, so the gain comes from the string table, the bitfield and
    // time deltas (D-091 records the real ratio).
    const attempts = day(300);
    const json = await gzip(new TextEncoder().encode(JSON.stringify(attempts)));
    const compact = await gzip(encodeArchive(attempts));

    expect(compact.length).toBeLessThan(json.length * 0.7);
  });

  it('survives gzip and gives a stable SHA-256', async () => {
    const attempts = day(10);
    const data = await gzip(encodeArchive(attempts));

    expect(decodeArchive(await gunzip(data))).toEqual(attempts);
    expect(await sha256Hex(data)).toMatch(/^[0-9a-f]{64}$/);
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('rejects a file that is not an archive or is cut short', () => {
    const data = encodeArchive(day(5));

    expect(() => decodeArchive(new TextEncoder().encode('JSON'))).toThrow('not an archive');
    expect(() => decodeArchive(data.subarray(0, data.length - 3))).toThrow('ended early');
  });

  it('accepts the app’s AttemptRecord as is', () => {
    const record: AttemptRecord = day(1)[0]!;
    const archived: ArchivedAttempt = record;

    expect(archived).toBe(record);
  });
});
