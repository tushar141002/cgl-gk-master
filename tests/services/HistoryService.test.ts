import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttemptRecord, Cursor, OptionIndex, PullResponse, Question } from '../../shared/contract';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { AttemptRepository } from '../../src/data/repositories/AttemptRepository';
import { CardRepository } from '../../src/data/repositories/CardRepository';
import { DailyRepository } from '../../src/data/repositories/DailyRepository';
import { QuestionRepository } from '../../src/data/repositories/QuestionRepository';
import { SkillRepository } from '../../src/data/repositories/SkillRepository';
import { SyncRepository } from '../../src/data/repositories/SyncRepository';
import { HistoryError, HistoryService } from '../../src/services/HistoryService';
import type { PullTransport } from '../../src/sync/SyncTransport';

const AT = Date.UTC(2026, 10, 7, 6, 0, 0);
const SUBTOPIC = 'polity-fundamental-rights';

let db: AppDatabase;

beforeEach(async () => {
  db = await openDatabase(`cgl-history-${crypto.randomUUID()}`);
  await new SyncRepository(db).ensureDeviceId(() => 'device-test');
});

afterEach(async () => {
  await db.delete();
});

class FakePull implements PullTransport {
  readonly calls: Array<{ readonly after: Cursor | null; readonly limit: number }> = [];
  private readonly script: Array<PullResponse | Error> = [];

  scriptWith(...responses: Array<PullResponse | Error>): void {
    this.script.push(...responses);
  }

  async pull(after: Cursor | null, limit: number): Promise<PullResponse> {
    this.calls.push({ after, limit });
    const next = this.script.shift();
    if (next === undefined) return page([], after, false);
    if (next instanceof Error) throw next;
    return next;
  }
}

function page(attempts: readonly AttemptRecord[], nextCursor: Cursor | null, hasMore: boolean): PullResponse {
  return { ok: true, serverTime: AT + 10_000, attempts, nextCursor, hasMore };
}

function question(id: string): Question {
  return {
    id,
    v: 1,
    packId: 'pack-1',
    section: 'polity',
    subtopic: SUBTOPIC,
    source: { type: 'practice' },
    en: { q: `Question ${id}`, options: ['A', 'B', 'C', 'D'], explanation: 'Because.' },
    hi: { q: `प्रश्न ${id}`, options: ['अ', 'ब', 'स', 'द'], explanation: 'क्योंकि।' },
    answer: 0,
    eloSeed: 1200,
    verifiedAt: '2026-11-07T00:00:00.000Z',
  };
}

function attempt(
  id: string,
  at: number,
  overrides: { qid?: string; chosen?: OptionIndex | null; correct?: boolean } = {},
): AttemptRecord {
  const chosen = overrides.chosen === undefined ? 0 : overrides.chosen;
  return {
    id,
    qid: overrides.qid ?? 'q-1',
    qv: 1,
    chosen,
    correct: overrides.correct ?? chosen === 0,
    ms: 1_000,
    mode: 'practice',
    at,
    deviceId: 'device-other',
  };
}

function service(transport: PullTransport, pageSize?: number): HistoryService {
  return new HistoryService(db, {
    transport,
    ...(pageSize === undefined ? {} : { pageSize }),
  });
}

describe('HistoryService (F7, D-074)', () => {
  it('handles an empty history and records the empty cursor', async () => {
    const transport = new FakePull();
    const summary = await service(transport).pull();

    expect(summary).toEqual({
      pages: 1,
      received: 0,
      inserted: 0,
      rebuilt: false,
      cursor: null,
    });
    expect((await new SyncRepository(db).getMeta())?.historyCursor).toBeNull();
  });

  it('merges a page, marks pulled attempts synced and rebuilds once', async () => {
    await new QuestionRepository(db).putMany([question('q-1'), question('q-2')]);
    const transport = new FakePull();
    transport.scriptWith(
      page([attempt('a-1', AT), attempt('a-2', AT + 1_000, { qid: 'q-2', chosen: 1 })], 'x', false),
    );

    const summary = await service(transport).pull();

    expect(summary).toMatchObject({ pages: 1, received: 2, inserted: 2, rebuilt: true });

    const rows = await new AttemptRepository(db).all();
    expect(rows.map((row) => [row.id, row.synced])).toEqual([
      ['a-1', 1],
      ['a-2', 1],
    ]);
    expect(await new CardRepository(db).count()).toBe(2);

    const daily = await new DailyRepository(db).all();
    expect(daily).toHaveLength(1);
    expect(daily[0]).toMatchObject({ attempted: 2, correct: 1 });

    const skills = await new SkillRepository(db).all();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ subtopicId: SUBTOPIC, attemptCount: 2 });
  });

  it('pages until hasMore is false and advances to the last cursor', async () => {
    await new QuestionRepository(db).putMany([question('q-1')]);
    const transport = new FakePull();
    transport.scriptWith(
      page([attempt('a-1', AT)], 'c1', true),
      page([attempt('a-2', AT + 1_000), attempt('a-3', AT + 2_000)], 'c2', false),
    );

    const summary = await service(transport, 2).pull();

    expect(summary).toMatchObject({ pages: 2, received: 3, inserted: 3, cursor: 'c2' });
    expect(transport.calls).toEqual([
      { after: null, limit: 2 },
      { after: 'c1', limit: 2 },
    ]);
    expect((await new SyncRepository(db).getMeta())?.historyCursor).toBe('c2');
  });

  it('resumes from the stored history cursor', async () => {
    await new SyncRepository(db).setHistoryCursor('old-cursor');
    const transport = new FakePull();
    transport.scriptWith(page([], 'new-cursor', false));

    await service(transport).pull();

    expect(transport.calls[0]!.after).toBe('old-cursor');
    expect((await new SyncRepository(db).getMeta())?.historyCursor).toBe('new-cursor');
  });

  it('de-duplicates an attempt returned by two pages', async () => {
    await new QuestionRepository(db).putMany([question('q-1')]);
    const transport = new FakePull();
    transport.scriptWith(page([attempt('a-1', AT)], 'c1', true), page([attempt('a-1', AT)], 'c1', false));

    const summary = await service(transport).pull();

    expect(summary.inserted).toBe(1);
    expect(await new AttemptRepository(db).count()).toBe(1);
    expect((await new DailyRepository(db).all())[0]).toMatchObject({ attempted: 1 });
  });

  it('keeps a local unsynced row instead of overwriting it', async () => {
    await new QuestionRepository(db).putMany([question('q-1')]);
    await new AttemptRepository(db).append(attempt('a-1', AT));

    const transport = new FakePull();
    transport.scriptWith(page([attempt('a-1', AT)], 'c1', false));

    const summary = await service(transport).pull();

    expect(summary.inserted).toBe(0);
    expect((await new AttemptRepository(db).get('a-1'))?.synced).toBe(0);
    expect((await new SyncRepository(db).getMeta())?.historyCursor).toBe('c1');
  });

  it('folds in the pages received before a server failure but keeps the cursor', async () => {
    await new QuestionRepository(db).putMany([question('q-1')]);
    const transport = new FakePull();
    transport.scriptWith(page([attempt('a-1', AT)], 'c1', true), {
      ok: false,
      error: 'timeout',
      retryAfterMs: 2_000,
    });

    await expect(service(transport).pull()).rejects.toMatchObject({
      name: 'HistoryError',
      code: 'sync_failed',
    });

    expect(await new AttemptRepository(db).count()).toBe(1);
    expect((await new DailyRepository(db).all())[0]).toMatchObject({ attempted: 1 });
    expect((await new SyncRepository(db).getMeta())?.historyCursor ?? null).toBeNull();

    // The retry starts from the beginning and re-uses the stored row.
    const retry = new FakePull();
    retry.scriptWith(page([attempt('a-1', AT)], 'c1', true), page([attempt('a-2', AT + 1_000)], 'c2', false));
    const summary = await service(retry).pull();

    expect(summary.inserted).toBe(1);
    expect(await new AttemptRepository(db).count()).toBe(2);
    expect((await new SyncRepository(db).getMeta())?.historyCursor).toBe('c2');
  });

  it('treats a thrown transport error as a network failure and keeps arrived pages', async () => {
    await new QuestionRepository(db).putMany([question('q-1')]);
    const transport = new FakePull();
    transport.scriptWith(page([attempt('a-1', AT)], 'c1', true), new Error('offline'));

    await expect(service(transport).pull()).rejects.toMatchObject({ code: 'network' });
    expect(await new AttemptRepository(db).count()).toBe(1);
    expect((await new SyncRepository(db).getMeta())?.historyCursor ?? null).toBeNull();
  });

  it('maps an unauthenticated pull', async () => {
    const transport = new FakePull();
    transport.scriptWith({ ok: false, error: 'unauthenticated' });

    await expect(service(transport).pull()).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('wraps HistoryError so the scheduler can inspect the code', () => {
    const error = new HistoryError('sync_failed', 'broken');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('HistoryError');
    expect(error.code).toBe('sync_failed');
  });

  it('refuses a response that claims more pages without advancing', async () => {
    const transport = new FakePull();
    transport.scriptWith(page([attempt('a-1', AT)], null, true));

    await expect(service(transport).pull()).rejects.toMatchObject({
      code: 'sync_failed',
      message: /advance/,
    });
    expect((await new SyncRepository(db).getMeta())?.historyCursor ?? null).toBeNull();
  });

  it('rejects an out-of-range page size', () => {
    const transport = new FakePull();
    expect(() => service(transport, 0)).toThrow(RangeError);
    expect(() => service(transport, 501)).toThrow(RangeError);
    expect(() => service(transport, 1.5)).toThrow(RangeError);
  });
});
