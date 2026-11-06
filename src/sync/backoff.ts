/**
 * Backoff for a failed sync batch (F4).
 *
 * The delay doubles from one second and stops at five minutes, so a phone that
 * comes back to 4G recovers within one timer tick while a server outage does
 * not turn into a request storm. A server-supplied `retryAfterMs` wins over the
 * curve, and the jitter keeps a fleet of devices from retrying in lockstep.
 *
 * Pure: the clock and the random source are the caller's.
 */

export const RETRY_BASE_MS = 1_000;
export const RETRY_MAX_MS = 5 * 60_000;
export const RETRY_JITTER = 0.2;

export interface BackoffOptions {
  /** From `SyncResponse.retryAfterMs`; clamped to the maximum. */
  readonly retryAfterMs?: number;
  /** Injected in tests so the delay is deterministic. */
  readonly rng?: () => number;
}

/** Delay before retry number `attempt` (1-based) of the same batch. */
export function retryDelay(attempt: number, options: BackoffOptions = {}): number {
  if (
    options.retryAfterMs !== undefined &&
    Number.isFinite(options.retryAfterMs) &&
    options.retryAfterMs >= 0
  ) {
    return Math.min(Math.round(options.retryAfterMs), RETRY_MAX_MS);
  }

  const exponent = Math.min(Math.max(Math.floor(attempt), 1) - 1, 30);
  const base = Math.min(RETRY_BASE_MS * 2 ** exponent, RETRY_MAX_MS);
  const rng = options.rng ?? Math.random;
  const jitter = 1 + (rng() * 2 - 1) * RETRY_JITTER;

  return Math.max(1, Math.min(RETRY_MAX_MS, Math.round(base * jitter)));
}
