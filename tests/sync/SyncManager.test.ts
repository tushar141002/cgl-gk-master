import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  encodeCursor,
  type AttemptRecord,
  type OptionIndex,
  type Question,
  type QuestionCorrection,
  type QuestionReport,
  type ReportReason,
  type SyncBatch,
  type SyncResponse,
} from '../../shared/contract';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { AttemptRepository } from '../../src/data/repositories/AttemptRepository';
import { CorrectionRepository } from '../../src/data/repositories/CorrectionRepository';
import { QuestionRepository } from '../../src/data/repositories/QuestionRepository';
import { ReportRepository } from '../../src/data/repositories/ReportRepository';
import { SyncRepository } from '../../src/data/repositories/SyncRepository';
import { SyncManager } from '../../src/sync/SyncManager';
import type { SyncTransport } from '../../src/sync/SyncTransport';

const AT = Date.UTC(2026, 10, 7, 6, 0, 0);

let db: AppDatabase;
let clock: number;

beforeEach(async () => {
  db = await openDatabase(`cgl-sync-${crypto.randomUUID()}`);
  clock = AT;
  await new SyncRepository(db).ensureDeviceId(() => 'device-test');
});

afterEach(async () => {
  await db.delete();
});

/** One scripted answer per `send`, then a default success. */
class FakeTransport implements SyncTransport {
  readonly calls: SyncBatch[] = [];
  private readonly script: Array<SyncResponse | Error> = [];

  scriptWith(...responses: Array<SyncResponse | Error>): void {
    this.script.push(...responses);
  }

  async send(batch: SyncBatch): Promise<SyncResponse> {
    this.calls.push(batch);
    const next = this.script.shift();
    if (next === undefined) return okResponse(batch);
    if (next instanceof Error) throw next;
    return next;
  }
}

function okResponse(batch: SyncBatch): SyncResponse {
  const last = batch.attempts.at(-1);
  return {
    ok: true,
    serverTime: clock,
    newCursor: last === undefined ? null : encodeCursor(last.at, last.id),
    corrections: [],
  };
}

function manager(transport: SyncTransport, sequence = { value: 0 }): SyncManager {
  return new SyncManager(db, {
    deviceId: 'device-test',
    transport,
    now: () => clock,
    newBatchId: () => `batch-${(sequence.value += 1)}`,
  });
}

function attempt(overrides: {
  id: string;
  qid?: string;
  at: number;
  chosen?: OptionIndex | null;
  correct?: boolean;
  ms?: number;
}): AttemptRecord {
  const chosen = overrides.chosen === undefined ? 1 : overrides.chosen;
  return {
    id: overrides.id,
    qid: overrides.qid ?? 'q-1',
    qv: 1,
    chosen,
    correct: overrides.correct ?? chosen !== null,
    ms: overrides.ms ?? 1_000,
    mode: 'practice',
    at: overrides.at,
    deviceId: 'device-test',
  };
}

function report(qid: string, at: number, reason: ReportReason = 'wrong-key'): QuestionReport {
  return { qid, qv: 1, reason, at };
}

function question(id: string, answer: OptionIndex = 0): Question {
  return {
    id,
    v: 1,
    packId: 'pack-1',
    section: 'polity',
    subtopic: 'polity-fundamental-rights',
    source: { type: 'practice' },
    en: { q: `Question ${id}`, options: ['A', 'B', 'C', 'D'], explanation: 'Because.' },
    hi: { q: `प्रश्न ${id}`, options: ['अ', 'ब', 'स', 'द'], explanation: 'क्योंकि।' },
    answer,
    eloSeed: 1200,
    verifiedAt: '2026-11-07T00:00:00.000Z',
  };
}

function correction(overrides: Partial<QuestionCorrection> = {}): QuestionCorrection {
  return {
    id: 'corr-1',
    qid: 'q-1',
    fromVersion: 1,
    toVersion: 2,
    oldAnswer: 0,
    newAnswer: 2,
    reason: 'wrong key',
    correctedAt: '2026-11-07T05:00:00.000Z',
    ...overrides,
  };
}

async function seedAttempts(...records: AttemptRecord[]): Promise<void> {
  const repo = new AttemptRepository(db);
  for (const record of records) await repo.append(record);
}

async function unsyncedIds(): Promise<string[]> {
  return (await new AttemptRepository(db).unsynced(1_000)).map((row) => row.id);
}

describe('SyncManager.runOnce (F4)', () => {
  it('sends unsynced attempts oldest first, marks them and records the cursor', async () => {
    await seedAttempts(attempt({ id: 'a2', at: AT + 2_000 }), attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();

    const result = await manager(transport).runOnce();

    expect(result.status).toBe('ok');
    expect(transport.calls).toHaveLength(1);
    const batch = transport.calls[0]!;
    expect(batch.deviceId).toBe('device-test');
    expect(batch.batchId).toBe('batch-1');
    expect(batch.attempts.map((item) => item.id)).toEqual(['a1', 'a2']);
    expect(batch.attempts[0]).not.toHaveProperty('synced');

    if (result.status !== 'ok') return;
    expect(result.attempts).toBe(2);
    expect(result.cursor).toBe(encodeCursor(AT + 2_000, 'a2'));

    expect(await unsyncedIds()).toEqual([]);
    expect(await new SyncRepository(db).getMeta()).toMatchObject({
      cursor: encodeCursor(AT + 2_000, 'a2'),
      lastSyncAt: AT,
      pendingBatch: null,
    });
  });

  it('sends nothing when there is nothing to say and no empty batch was asked for', async () => {
    const transport = new FakeTransport();

    const result = await manager(transport).runOnce();

    expect(result).toEqual({ status: 'idle' });
    expect(transport.calls).toHaveLength(0);
  });

  it('sends an empty batch on request and keeps a null cursor', async () => {
    const transport = new FakeTransport();

    const result = await manager(transport).runOnce({ allowEmpty: true });

    expect(result.status).toBe('ok');
    expect(transport.calls[0]!.attempts).toEqual([]);
    expect(await new SyncRepository(db).getMeta()).toMatchObject({
      cursor: null,
      lastSyncAt: AT,
    });
  });

  it('splits a large log into 200-attempt batches across uploadAll', async () => {
    const many = Array.from({ length: 205 }, (_, index) => attempt({ id: `bulk-${index}`, at: AT + index }));
    await seedAttempts(...many);
    const transport = new FakeTransport();

    const summary = await manager(transport).uploadAll();

    expect(summary.batches).toBe(2);
    expect(summary.attempts).toBe(205);
    expect(transport.calls.map((batch) => batch.attempts.length)).toEqual([200, 5]);
    expect(await unsyncedIds()).toEqual([]);
  });

  it('carries at most 20 reports and marks only those sent', async () => {
    const repo = new ReportRepository(db);
    for (let index = 0; index < 25; index += 1) {
      await repo.queue(report(`q-${index}`, AT + index));
    }
    const transport = new FakeTransport();

    const first = await manager(transport).runOnce();
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    expect(first.reports).toBe(20);
    expect(transport.calls[0]!.reports.map((item) => item.qid)).toEqual(
      Array.from({ length: 20 }, (_, index) => `q-${index}`),
    );

    const second = await manager(transport).runOnce();
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    expect(second.reports).toBe(5);

    const third = await manager(transport).runOnce();
    expect(third).toEqual({ status: 'idle' });
  });

  it('collapses a repeated report tap into one queued row', async () => {
    const repo = new ReportRepository(db);
    await Promise.all([repo.queue(report('q-1', AT)), repo.queue(report('q-1', AT + 1_000))]);

    expect(await repo.count()).toBe(1);
    const pending = await repo.pending(10);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ qid: 'q-1', reason: 'wrong-key', sent: 0 });
  });
});

describe('SyncManager retries (D-067, D-070)', () => {
  it('retries the same batch id and contents after a network failure', async () => {
    await seedAttempts(attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();
    transport.scriptWith(new Error('offline'));

    const first = await manager(transport, { value: 0 }).runOnce();
    expect(first.status).toBe('retry');

    // A new attempt arrives while the batch is still in flight. It must wait
    // for the next batch, because the server already knows `batch-1`.
    await seedAttempts(attempt({ id: 'a2', at: AT + 1_000 }));

    const second = await manager(transport, { value: 100 }).runOnce();
    expect(second.status).toBe('ok');
    expect(transport.calls[1]!.batchId).toBe(transport.calls[0]!.batchId);
    expect(transport.calls[1]!.attempts.map((item) => item.id)).toEqual(['a1']);

    const third = await manager(transport, { value: 200 }).runOnce();
    expect(third.status).toBe('ok');
    expect(transport.calls[2]!.batchId).not.toBe(transport.calls[0]!.batchId);
    expect(transport.calls[2]!.attempts.map((item) => item.id)).toEqual(['a2']);
  });

  it('keeps the pinned batch across a restart', async () => {
    await seedAttempts(attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();
    transport.scriptWith(new Error('offline'));

    await manager(transport).runOnce();
    const pinned = await new SyncRepository(db).getMeta();
    expect(pinned?.pendingBatch?.batchId).toBe('batch-1');
    expect(pinned?.pendingBatch?.attemptIds).toEqual(['a1']);

    const afterRestart = await manager(transport, { value: 500 }).runOnce();
    expect(afterRestart.status).toBe('ok');
    expect(transport.calls[1]!.batchId).toBe('batch-1');
  });

  it('keeps attempts unsynced after a terminal authentication failure', async () => {
    await seedAttempts(attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();
    transport.scriptWith({ ok: false, error: 'unauthenticated' });

    const result = await manager(transport).runOnce();

    expect(result).toEqual({ status: 'failed', error: 'unauthenticated' });
    expect(await unsyncedIds()).toEqual(['a1']);
    expect((await new SyncRepository(db).getMeta())?.pendingBatch).not.toBeNull();
  });

  it('drops a rejected batch so it cannot wedge every later sync', async () => {
    await seedAttempts(attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();
    transport.scriptWith({ ok: false, error: 'invalid_batch' });

    await manager(transport, { value: 0 }).runOnce();

    expect((await new SyncRepository(db).getMeta())?.pendingBatch ?? null).toBeNull();
    expect(await unsyncedIds()).toEqual(['a1']);

    await manager(transport, { value: 100 }).runOnce();
    expect(transport.calls[1]!.batchId).toBe('batch-101');
  });

  it('backs off further after each failure and resets after a success', async () => {
    await seedAttempts(attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();
    transport.scriptWith(new Error('offline'), new Error('offline'));

    const sync = manager(transport);

    const first = await sync.runOnce();
    expect(first.status).toBe('retry');
    if (first.status !== 'retry') return;
    expect(first.retryInMs).toBeGreaterThanOrEqual(800);
    expect(first.retryInMs).toBeLessThanOrEqual(1_200);

    const second = await sync.runOnce();
    expect(second.status).toBe('retry');
    if (second.status !== 'retry') return;
    expect(second.retryInMs).toBeGreaterThanOrEqual(1_600);
    expect(second.retryInMs).toBeLessThanOrEqual(2_400);

    const third = await sync.runOnce();
    expect(third.status).toBe('ok');

    transport.scriptWith(new Error('offline'));
    await seedAttempts(attempt({ id: 'a2', at: AT + 1_000 }));
    const fourth = await sync.runOnce();
    expect(fourth.status).toBe('retry');
    if (fourth.status !== 'retry') return;
    expect(fourth.retryInMs).toBeGreaterThanOrEqual(800);
    expect(fourth.retryInMs).toBeLessThanOrEqual(1_200);
  });

  it('honours retryAfterMs from the server', async () => {
    await seedAttempts(attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();
    transport.scriptWith({ ok: false, error: 'timeout', retryAfterMs: 30_000 });

    const result = await manager(transport).runOnce();

    expect(result).toEqual({ status: 'retry', error: 'timeout', retryInMs: 30_000 });
  });

  it('retries a rate-limited batch and keeps it pinned (D-088)', async () => {
    await seedAttempts(attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();
    transport.scriptWith({ ok: false, error: 'rate_limited', retryAfterMs: 45_000 });
    const sync = manager(transport);

    const limited = await sync.runOnce();
    expect(limited).toEqual({ status: 'retry', error: 'rate_limited', retryInMs: 45_000 });

    await sync.runOnce();
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[1]!.batchId).toBe(transport.calls[0]!.batchId);
  });

  it('shares one run between concurrent callers', async () => {
    await seedAttempts(attempt({ id: 'a1', at: AT }));
    const transport = new FakeTransport();
    const sync = manager(transport);

    const first = sync.runOnce();
    const second = sync.runOnce();

    expect(first).toBe(second);
    await first;
    expect(transport.calls).toHaveLength(1);
  });
});

describe('SyncManager corrections (F6)', () => {
  it('stores corrections, rebuilds derived state and marks them seen', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    // The student picked answer 0, which the pack says is right.
    await seedAttempts(attempt({ id: 'a1', qid: 'q-1', at: AT, chosen: 0, correct: true, ms: 1_000 }));
    const transport = new FakeTransport();
    transport.scriptWith({
      ok: true,
      serverTime: AT,
      newCursor: encodeCursor(AT, 'a1'),
      corrections: [correction()],
    });

    const result = await manager(transport).runOnce();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.corrections).toBe(1);
    expect(result.changed).toBe(1);

    const stored = await new CorrectionRepository(db).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 'corr-1', seen: 1 });
  });

  it('does not re-apply a correction the server sends twice', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await seedAttempts(attempt({ id: 'a1', qid: 'q-1', at: AT, chosen: 0 }));

    const transport = new FakeTransport();
    transport.scriptWith({
      ok: true,
      serverTime: AT,
      newCursor: encodeCursor(AT, 'a1'),
      corrections: [correction()],
    });

    await manager(transport).runOnce();
    await seedAttempts(attempt({ id: 'a2', qid: 'q-1', at: AT + 1_000, chosen: 2 }));

    const repeat = new FakeTransport();
    repeat.scriptWith({
      ok: true,
      serverTime: AT + 2_000,
      newCursor: encodeCursor(AT + 1_000, 'a2'),
      corrections: [correction()],
    });
    const result = await manager(repeat).runOnce();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.corrections).toBe(0);
    expect(result.changed).toBe(0);
  });

  it('applies corrections when a retried batch finally gets its reply', async () => {
    await new QuestionRepository(db).putMany([question('q-1', 0)]);
    await seedAttempts(attempt({ id: 'a1', qid: 'q-1', at: AT, chosen: 0, correct: true }));

    const transport = new FakeTransport();
    transport.scriptWith(new Error('response lost'));
    transport.scriptWith({
      ok: true,
      serverTime: AT,
      newCursor: encodeCursor(AT, 'a1'),
      corrections: [correction()],
    });

    const sync = manager(transport);
    expect((await sync.runOnce()).status).toBe('retry');

    const retried = await sync.runOnce();

    expect(retried.status).toBe('ok');
    if (retried.status !== 'ok') return;
    expect(retried.corrections).toBe(1);
    expect(retried.changed).toBe(1);
    // The retry carried the same id and contents, so the server replayed the
    // reply and the correction survived (D-067, D-070).
    expect(transport.calls[1]!.batchId).toBe(transport.calls[0]!.batchId);
    expect(await new CorrectionRepository(db).answerFor('q-1', 1)).toBe(2);
  });
});
