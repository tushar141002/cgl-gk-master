import { describe, expect, it } from 'vitest';
import { RETRY_BASE_MS, RETRY_JITTER, RETRY_MAX_MS, retryDelay } from '../../src/sync/backoff';

/** A deterministic random source pinned to one point in the jitter range. */
const mid = (): number => 0.5;
const low = (): number => 0;
const high = (): number => 1;

describe('retryDelay (F4)', () => {
  it('starts at the base delay with no jitter', () => {
    expect(retryDelay(1, { rng: mid })).toBe(RETRY_BASE_MS);
  });

  it('treats attempt 0 and negative attempts as the first retry', () => {
    expect(retryDelay(0, { rng: mid })).toBe(RETRY_BASE_MS);
    expect(retryDelay(-4, { rng: mid })).toBe(RETRY_BASE_MS);
  });

  it('doubles the delay for each consecutive failure', () => {
    expect(retryDelay(1, { rng: mid })).toBe(1_000);
    expect(retryDelay(2, { rng: mid })).toBe(2_000);
    expect(retryDelay(3, { rng: mid })).toBe(4_000);
    expect(retryDelay(4, { rng: mid })).toBe(8_000);
  });

  it('caps the curve at five minutes', () => {
    expect(retryDelay(30, { rng: mid })).toBe(RETRY_MAX_MS);
    expect(retryDelay(10_000, { rng: mid })).toBe(RETRY_MAX_MS);
  });

  it('keeps the jitter inside plus or minus twenty percent', () => {
    const fast = retryDelay(2, { rng: low });
    const slow = retryDelay(2, { rng: high });

    expect(fast).toBe(Math.round(2_000 * (1 - RETRY_JITTER)));
    expect(slow).toBe(Math.round(2_000 * (1 + RETRY_JITTER)));
  });

  it('never exceeds the maximum after jitter is applied', () => {
    expect(retryDelay(40, { rng: high })).toBe(RETRY_MAX_MS);
  });

  it('lets a server retry hint win over the curve', () => {
    expect(retryDelay(1, { retryAfterMs: 30_000, rng: mid })).toBe(30_000);
    expect(retryDelay(5, { retryAfterMs: 0, rng: mid })).toBe(0);
  });

  it('clamps a server retry hint to the maximum', () => {
    expect(retryDelay(1, { retryAfterMs: 24 * 60 * 60_000, rng: mid })).toBe(RETRY_MAX_MS);
  });

  it('ignores a retry hint that is not a usable number', () => {
    expect(retryDelay(1, { retryAfterMs: Number.NaN, rng: mid })).toBe(RETRY_BASE_MS);
    expect(retryDelay(1, { retryAfterMs: -5, rng: mid })).toBe(RETRY_BASE_MS);
    expect(retryDelay(1, { retryAfterMs: Number.POSITIVE_INFINITY, rng: mid })).toBe(RETRY_BASE_MS);
  });

  it('always returns a whole number of milliseconds', () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const delay = retryDelay(attempt, { rng: () => 0.37 });
      expect(Number.isInteger(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(1);
    }
  });
});
