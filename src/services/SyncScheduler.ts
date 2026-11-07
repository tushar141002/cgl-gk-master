import type { SyncRunResult } from '../sync/SyncManager';

/** Every five minutes while the app is in use (D-009, D-076). */
export const DEFAULT_SYNC_INTERVAL_MS = 5 * 60_000;

export type SchedulerReason = 'start' | 'interval' | 'wake' | 'manual';

export interface SyncSchedulerOptions {
  /** Usually `SyncManager`; the narrow shape keeps the scheduler testable. */
  readonly sync: {
    runOnce(options?: { readonly allowEmpty?: boolean }): Promise<SyncRunResult>;
  };
  /** Usually `AuthService`; a guest never syncs (D-064). */
  readonly auth: {
    isSignedIn(): boolean;
  };
  readonly intervalMs?: number;
  readonly isOnline?: () => boolean;
  /** Subscribes to online/visibility/foreground signals; returns an unsubscribe. */
  readonly subscribeWake?: (handler: () => void) => () => void;
  readonly setTimer?: (handler: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
  readonly onResult?: (result: SyncRunResult, reason: SchedulerReason) => void;
}

/**
 * Owns when sync runs (F4, D-009, D-076).
 *
 * One run at a time: a wake signal during an in-flight run joins it instead of
 * sending the same batch twice. A retryable failure schedules the server's
 * `retryInMs` (or the backoff curve's), anything else waits for the regular
 * interval. Guests and offline devices skip the request but keep the timer, so
 * coming back online or signing in does not need a second code path.
 *
 * `App.svelte` only calls `start`, `stop` and (after sign-in) `runNow`.
 */
export class SyncScheduler {
  private readonly sync: SyncSchedulerOptions['sync'];
  private readonly auth: SyncSchedulerOptions['auth'];
  private readonly intervalMs: number;
  private readonly isOnline: () => boolean;
  private readonly subscribeWake: (handler: () => void) => () => void;
  private readonly setTimer: (handler: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly onResult: ((result: SyncRunResult, reason: SchedulerReason) => void) | undefined;

  private started = false;
  private timer: unknown = null;
  private inFlight: Promise<SyncRunResult | null> | null = null;
  private stopWake: (() => void) | null = null;

  constructor(options: SyncSchedulerOptions) {
    const intervalMs = options.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new RangeError(`intervalMs must be a positive number (got ${String(intervalMs)})`);
    }

    this.sync = options.sync;
    this.auth = options.auth;
    this.intervalMs = intervalMs;
    this.isOnline = options.isOnline ?? (() => globalThis.navigator?.onLine ?? true);
    this.subscribeWake = options.subscribeWake ?? (() => () => undefined);
    this.setTimer = options.setTimer ?? ((handler, ms) => setTimeout(handler, ms));
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.onResult = options.onResult;
  }

  /** Starts the first run and the wake subscriptions. Safe to call twice. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopWake = this.subscribeWake(() => {
      void this.runNow('wake');
    });
    void this.runNow('start');
  }

  /** Stops future runs. A run already in flight is allowed to finish. */
  stop(): void {
    this.started = false;
    this.cancelTimer();
    if (this.stopWake !== null) {
      this.stopWake();
      this.stopWake = null;
    }
  }

  /**
   * Runs now unless stopped; concurrent calls share the run in flight.
   *
   * `start`, `wake` and `manual` send an empty batch when there is nothing to
   * upload, because that is how corrections and the server cursor arrive
   * without a new answer. The five-minute tick skips the request when idle.
   */
  runNow(reason: SchedulerReason = 'manual'): Promise<SyncRunResult | null> {
    if (!this.started) return Promise.resolve(null);
    if (this.inFlight !== null) return this.inFlight;

    const run = this.execute(reason).finally(() => {
      this.inFlight = null;
    });
    this.inFlight = run;
    return run;
  }

  private async execute(reason: SchedulerReason): Promise<SyncRunResult | null> {
    this.cancelTimer();

    if (!this.auth.isSignedIn() || !this.isOnline()) {
      this.schedule(this.intervalMs);
      return null;
    }

    let result: SyncRunResult;
    try {
      result = await this.sync.runOnce({ allowEmpty: reason !== 'interval' });
    } catch {
      // `runOnce` maps its own failures; this is belt and braces for a bug.
      result = { status: 'retry', error: 'network', retryInMs: this.intervalMs };
    }

    this.onResult?.(result, reason);
    const delay = result.status === 'retry' ? Math.max(0, result.retryInMs) : this.intervalMs;
    this.schedule(delay);
    return result;
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    if (!this.started) return;

    this.timer = this.setTimer(
      () => {
        this.timer = null;
        void this.runNow('interval');
      },
      Math.max(0, ms),
    );
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }
}
