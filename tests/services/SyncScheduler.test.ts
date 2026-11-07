import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SYNC_INTERVAL_MS, SyncScheduler } from '../../src/services/SyncScheduler';
import type { SyncRunResult } from '../../src/sync/SyncManager';

interface RunOptions {
  readonly allowEmpty?: boolean;
}

class FakeSync {
  readonly calls: Array<RunOptions | undefined> = [];
  readonly script: SyncRunResult[] = [];
  impl: ((options?: RunOptions) => Promise<SyncRunResult>) | null = null;

  async runOnce(options?: RunOptions): Promise<SyncRunResult> {
    this.calls.push(options);
    if (this.impl !== null) return this.impl(options);
    return this.script.shift() ?? { status: 'idle' };
  }
}

interface Timer {
  readonly id: number;
  readonly handler: () => void;
  readonly ms: number;
  cleared: boolean;
}

function harness(options: { signedIn?: boolean; online?: boolean; intervalMs?: number } = {}): {
  readonly scheduler: SyncScheduler;
  readonly sync: FakeSync;
  readonly timers: Timer[];
  pending(): Timer[];
  wake(): void;
  setSignedIn(value: boolean): void;
  setOnline(value: boolean): void;
  readonly results: Array<{ result: SyncRunResult; reason: string }>;
} {
  let signedIn = options.signedIn ?? true;
  let online = options.online ?? true;
  let wakeHandler: (() => void) | null = null;
  let nextId = 1;

  const sync = new FakeSync();
  const timers: Timer[] = [];
  const results: Array<{ result: SyncRunResult; reason: string }> = [];

  const scheduler = new SyncScheduler({
    sync,
    auth: { isSignedIn: () => signedIn },
    isOnline: () => online,
    ...(options.intervalMs === undefined ? {} : { intervalMs: options.intervalMs }),
    subscribeWake: (handler) => {
      wakeHandler = handler;
      return () => {
        wakeHandler = null;
      };
    },
    setTimer: (handler, ms) => {
      const timer: Timer = {
        id: nextId,
        handler: () => {
          // A real timeout disappears once it fires; the harness has to model
          // that or a fired timer would still look pending.
          timer.cleared = true;
          handler();
        },
        ms,
        cleared: false,
      };
      nextId += 1;
      timers.push(timer);
      return timer.id;
    },
    clearTimer: (handle) => {
      const timer = timers.find((item) => item.id === handle);
      if (timer !== undefined) timer.cleared = true;
    },
    onResult: (result, reason) => {
      results.push({ result, reason });
    },
  });

  return {
    scheduler,
    sync,
    timers,
    pending: () => timers.filter((timer) => !timer.cleared),
    wake: () => wakeHandler?.(),
    setSignedIn: (value) => {
      signedIn = value;
    },
    setOnline: (value) => {
      online = value;
    },
    results,
  };
}

async function startAndSettle(h: ReturnType<typeof harness>): Promise<SyncRunResult | null> {
  h.scheduler.start();
  return h.scheduler.runNow('manual');
}

describe('SyncScheduler (D-009, D-076)', () => {
  it('syncs on start with an empty batch and schedules the next tick', async () => {
    const h = harness();
    await startAndSettle(h);

    expect(h.sync.calls).toEqual([{ allowEmpty: true }]);
    expect(h.pending()).toHaveLength(1);
    expect(h.pending()[0]!.ms).toBe(DEFAULT_SYNC_INTERVAL_MS);
    expect(h.results).toEqual([{ result: { status: 'idle' }, reason: 'start' }]);
  });

  it('uses the configured interval', async () => {
    const h = harness({ intervalMs: 90_000 });
    await startAndSettle(h);
    expect(h.pending()[0]!.ms).toBe(90_000);
  });

  it('skips a guest but keeps the timer alive', async () => {
    const h = harness({ signedIn: false });
    await startAndSettle(h);

    expect(h.sync.calls).toHaveLength(0);
    expect(h.pending()[0]!.ms).toBe(DEFAULT_SYNC_INTERVAL_MS);
  });

  it('skips while offline but keeps the timer alive', async () => {
    const h = harness({ online: false });
    await startAndSettle(h);

    expect(h.sync.calls).toHaveLength(0);
    expect(h.pending()).toHaveLength(1);
  });

  it('runs the five-minute tick without an empty batch', async () => {
    const h = harness();
    await startAndSettle(h);

    const tick = h.pending()[0]!;
    tick.handler();
    await h.scheduler.runNow('manual');

    expect(h.sync.calls).toEqual([{ allowEmpty: true }, { allowEmpty: false }]);
  });

  it('schedules the server retry delay after a retryable failure', async () => {
    const h = harness();
    h.sync.script.push({ status: 'retry', error: 'timeout', retryInMs: 1_234 });
    await startAndSettle(h);

    expect(h.pending()[0]!.ms).toBe(1_234);

    h.pending()[0]!.handler();
    await h.scheduler.runNow('manual');
    expect(h.pending()[0]!.ms).toBe(DEFAULT_SYNC_INTERVAL_MS);
  });

  it('falls back to the interval after a terminal failure', async () => {
    const h = harness();
    h.sync.script.push({ status: 'failed', error: 'invalid_batch' });
    await startAndSettle(h);

    expect(h.pending()[0]!.ms).toBe(DEFAULT_SYNC_INTERVAL_MS);
  });

  it('coalesces concurrent runs into one request', async () => {
    const h = harness();
    let resolve: (value: SyncRunResult) => void = () => undefined;
    h.sync.impl = () =>
      new Promise<SyncRunResult>((done) => {
        resolve = done;
      });

    h.scheduler.start();
    const first = h.scheduler.runNow('manual');
    const second = h.scheduler.runNow('wake');

    expect(first).toBe(second);
    await Promise.resolve();
    expect(h.sync.calls).toHaveLength(1);

    resolve({ status: 'idle' });
    await first;
  });

  it('wakes on an online or visible signal', async () => {
    const h = harness();
    await startAndSettle(h);

    h.wake();
    await h.scheduler.runNow('manual');

    expect(h.sync.calls).toHaveLength(2);
  });

  it('retries without an empty batch when a wake finds nothing new', async () => {
    const h = harness();
    await startAndSettle(h);

    h.wake();
    await h.scheduler.runNow('manual');

    expect(h.sync.calls[1]).toEqual({ allowEmpty: true });
  });

  it('stops the timer and the wake subscription', async () => {
    const h = harness();
    await startAndSettle(h);
    const timer = h.pending()[0]!;

    h.scheduler.stop();

    expect(timer.cleared).toBe(true);
    expect(h.pending()).toHaveLength(0);
    await expect(h.scheduler.runNow('manual')).resolves.toBeNull();
  });

  it('starts only once', async () => {
    const h = harness();
    await startAndSettle(h);
    h.scheduler.start();
    await Promise.resolve();

    expect(h.sync.calls).toHaveLength(1);
    expect(h.pending()).toHaveLength(1);
  });

  it('does nothing before start', async () => {
    const h = harness();
    await expect(h.scheduler.runNow('manual')).resolves.toBeNull();
    expect(h.sync.calls).toHaveLength(0);
  });

  it('rejects a non-positive interval', () => {
    expect(() => harness({ intervalMs: 0 })).toThrow(RangeError);
    expect(() => harness({ intervalMs: -1 })).toThrow(RangeError);
  });

  it('treats a thrown run as a retry', async () => {
    const h = harness();
    h.sync.impl = async () => {
      throw new Error('bug');
    };

    await startAndSettle(h);

    expect(h.results[0]!.result).toEqual({
      status: 'retry',
      error: 'network',
      retryInMs: DEFAULT_SYNC_INTERVAL_MS,
    });
  });

  it('does not run a scheduled tick after stop', async () => {
    const h = harness();
    await startAndSettle(h);
    const timer = h.pending()[0]!;

    h.scheduler.stop();
    timer.handler();
    await Promise.resolve();

    expect(h.sync.calls).toHaveLength(1);
  });

  it('calls onResult with the reason', async () => {
    const h = harness();
    h.sync.script.push({ status: 'ok', attempts: 0, reports: 0, corrections: 0, changed: 0, cursor: null });
    await startAndSettle(h);

    expect(h.results[0]!.reason).toBe('start');
    expect(h.results[0]!.result.status).toBe('ok');
    expect(vi.isMockFunction(h.scheduler.stop)).toBe(false);
  });
});
