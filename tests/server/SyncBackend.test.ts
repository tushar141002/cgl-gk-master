/**
 * The sync backend, run against the real migrations in PGlite.
 *
 * These tests are the only place the SQL executes before it reaches Supabase.
 * They cover acceptance, idempotency, validation, IST day derivation, cursor
 * monotonicity, corrections, pull paging, row-level security and compaction.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';

import {
  encodeCursor,
  istDayKey,
  type AttemptMode,
  type AttemptRecord,
  type OptionIndex,
  type PullResponse,
  type QuestionReport,
  type SyncBatch,
  type SyncResponse,
} from '../../shared/contract';
import { createTestDatabase, createUser, actAsOwner, asUser, sqlState, type TestDatabase } from './harness';

let harness: TestDatabase;
let db: PGlite;

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

let qidCounter = 0;

/** A qid no other test shares, so the global question_stats stay independent. */
function nextQid(): string {
  qidCounter += 1;
  return `test-q-${qidCounter}`;
}

let userCounter = 0;

async function newUser(): Promise<string> {
  userCounter += 1;
  return createUser(db, `student-${userCounter}@example.test`);
}

function makeAttempt(overrides: {
  qid: string;
  at: number;
  id?: string;
  chosen?: OptionIndex | null;
  correct?: boolean;
  ms?: number;
  mode?: AttemptMode;
  mockId?: string;
  deviceId?: string;
  qv?: number;
}): AttemptRecord {
  const chosen = overrides.chosen === undefined ? 1 : overrides.chosen;
  return {
    id: overrides.id ?? randomUUID(),
    qid: overrides.qid,
    qv: overrides.qv ?? 1,
    chosen,
    correct: overrides.correct ?? chosen !== null,
    ms: overrides.ms ?? 1000,
    mode: overrides.mode ?? 'practice',
    ...(overrides.mockId === undefined ? {} : { mockId: overrides.mockId }),
    at: overrides.at,
    deviceId: overrides.deviceId ?? 'device-a',
  };
}

function makeReport(overrides: Partial<QuestionReport> & { qid: string; at: number }): QuestionReport {
  return {
    qid: overrides.qid,
    qv: overrides.qv ?? 1,
    reason: overrides.reason ?? 'wrong-key',
    at: overrides.at,
  };
}

function makeBatch(
  batchId: string,
  attempts: readonly AttemptRecord[],
  reports: readonly QuestionReport[] = [],
): SyncBatch {
  return { batchId, deviceId: 'device-a', cursor: null, attempts, reports };
}

async function sync(userId: string, payload: SyncBatch): Promise<SyncResponse> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ result: SyncResponse }>(
      'select public.apply_sync_batch($1::jsonb) as result',
      [JSON.stringify(payload)],
    );
    return rows[0]!.result;
  });
}

async function syncRaw(userId: string, payload: unknown): Promise<SyncResponse> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ result: SyncResponse }>(
      'select public.apply_sync_batch($1::jsonb) as result',
      [JSON.stringify(payload)],
    );
    return rows[0]!.result;
  });
}

async function pull(userId: string, after: string | null = null, limit = 200): Promise<PullResponse> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ result: PullResponse }>(
      'select public.sync_pull($1::text, $2::int) as result',
      [after, limit],
    );
    return rows[0]!.result;
  });
}

async function ownerQuery<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  await actAsOwner(db);
  const { rows } = await db.query<T>(sql, [...params]);
  return rows;
}

interface DailyRow {
  date: string;
  attempted: number;
  correct: number;
  ms: number;
}

async function dailyRows(userId: string): Promise<DailyRow[]> {
  return ownerQuery<DailyRow>(
    'select date::text as date, attempted, correct, ms from public.daily_stats where user_id = $1 order by date',
    [userId],
  );
}

interface StatsRow {
  qid: string;
  attempts: number;
  correct: number;
  total_ms: number;
  avg_ms: number | null;
}

async function statsRow(qid: string): Promise<StatsRow | undefined> {
  const rows = await ownerQuery<StatsRow>(
    'select qid, attempts, correct, total_ms, avg_ms from public.question_stats where qid = $1',
    [qid],
  );
  return rows[0];
}

async function attemptCount(userId: string): Promise<number> {
  const rows = await ownerQuery<{ n: number }>(
    'select count(*)::int as n from public.attempt_inbox where user_id = $1',
    [userId],
  );
  return rows[0]!.n;
}

async function insertCorrection(id: string, qid: string, correctedAt: string): Promise<void> {
  await actAsOwner(db);
  await db.query(
    `insert into public.question_corrections
       (id, qid, from_version, to_version, old_answer, new_answer, reason, corrected_at)
     values ($1, $2, 1, 2, 0, 2, 'wrong key', $3::timestamptz)`,
    [id, qid, correctedAt],
  );
}

beforeAll(async () => {
  harness = await createTestDatabase();
  db = harness.db;
});

afterAll(async () => {
  await harness.close();
});

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

describe('profiles', () => {
  it('creates one profile per auth user through the trigger', async () => {
    const userId = await newUser();
    const rows = await ownerQuery<{ user_id: string; language: string }>(
      'select user_id, language from public.profiles where user_id = $1',
      [userId],
    );
    expect(rows).toEqual([{ user_id: userId, language: 'en' }]);
  });

  it('does not create a second profile on a re-run of the trigger', async () => {
    const userId = await newUser();
    await actAsOwner(db);
    await db.query('update public.profiles set name = $2 where user_id = $1', [userId, 'Tushar']);
    await db.query('update public.profiles set name = $2 where user_id = $1', [userId, 'Tushar P']);
    const rows = await ownerQuery<{ name: string }>('select name from public.profiles where user_id = $1', [
      userId,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Tushar P');
  });
});

// ---------------------------------------------------------------------------
// Authentication and authorisation of the RPCs
// ---------------------------------------------------------------------------

describe('authentication', () => {
  it('refuses a call with no JWT claim', async () => {
    const payload = makeBatch('batch-anon-claim', []);
    const error = await asUser(db, null, () =>
      db.query('select public.apply_sync_batch($1::jsonb)', [JSON.stringify(payload)]),
    ).catch((reason: unknown) => reason);

    expect(sqlState(error)).toBe('28000');
  });

  it('refuses the anon role entirely', async () => {
    const payload = makeBatch('batch-anon-role', []);
    const error = await asUser(
      db,
      null,
      () => db.query('select public.apply_sync_batch($1::jsonb)', [JSON.stringify(payload)]),
      'anon',
    ).catch((reason: unknown) => reason);

    expect(sqlState(error)).toBe('42501');
  });

  it('does not let a student execute the compaction job', async () => {
    const userId = await newUser();
    const error = await asUser(db, userId, () => db.query('select public.compact_sync_inbox()')).catch(
      (reason: unknown) => reason,
    );

    expect(sqlState(error)).toBe('42501');
  });
});

// ---------------------------------------------------------------------------
// Acceptance and derived aggregates
// ---------------------------------------------------------------------------

describe('apply_sync_batch', () => {
  it('accepts a batch and derives daily and question stats from it', async () => {
    const userId = await newUser();
    const qid = nextQid();

    const base = Date.now() - 2 * DAY;
    const first = makeAttempt({ qid, at: base, chosen: 1, correct: true, ms: 1000 });
    const second = makeAttempt({ qid, at: base + 1000, chosen: 2, correct: false, ms: 2000 });
    const skipped = makeAttempt({ qid, at: base + 2000, chosen: null, correct: false, ms: 5000 });

    const response = await sync(userId, makeBatch('batch-accept', [first, second, skipped]));

    expect(response.ok).toBe(true);
    if (!response.ok) return;

    expect(response.corrections).toEqual([]);
    expect(response.newCursor).toBe(encodeCursor(skipped.at, skipped.id));

    // Graded answers only: the skip contributes no attempt, no correct and no ms.
    expect(await dailyRows(userId)).toEqual([{ date: istDayKey(base), attempted: 2, correct: 1, ms: 3000 }]);

    expect(await statsRow(qid)).toMatchObject({
      qid,
      attempts: 2,
      correct: 1,
      total_ms: 3000,
      avg_ms: 1500,
    });

    expect(await attemptCount(userId)).toBe(3);
  });

  it('writes a zero row for a skip-only day', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const at = Date.now() - 2 * DAY;

    await sync(
      userId,
      makeBatch('batch-skip-only', [makeAttempt({ qid, at, chosen: null, correct: false })]),
    );

    expect(await dailyRows(userId)).toEqual([{ date: istDayKey(at), attempted: 0, correct: 0, ms: 0 }]);
  });

  it('keeps a question out of the user stats when only skipped', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const at = Date.now() - 2 * DAY;

    await sync(
      userId,
      makeBatch('batch-skip-stats', [makeAttempt({ qid, at, chosen: null, correct: false })]),
    );

    expect(await statsRow(qid)).toMatchObject({ attempts: 0, correct: 0, total_ms: 0, avg_ms: null });
  });

  it('derives the IST day, not the UTC day, from the attempt timestamp', async () => {
    const userId = await newUser();
    const qid = nextQid();

    // 18:30 UTC is 00:00 IST of the next calendar day.
    const boundary = new Date();
    boundary.setUTCDate(boundary.getUTCDate() - 2);
    boundary.setUTCHours(18, 30, 0, 0);
    const at = boundary.getTime();

    await sync(userId, makeBatch('batch-ist', [makeAttempt({ qid, at, ms: 700 })]));

    const rows = await dailyRows(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toBe(istDayKey(at));
    expect(rows[0]!.date).not.toBe(new Date(at).toISOString().slice(0, 10));
  });

  it('falls back to the received day when the attempt clock is implausible', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const before = Date.now();

    const future = makeAttempt({ qid, at: Date.now() + 3 * DAY });
    const ancient = makeAttempt({ qid, at: Date.now() - 40 * DAY });

    await sync(userId, makeBatch('batch-skew', [future, ancient]));

    const after = Date.now();
    const allowed = new Set([istDayKey(before), istDayKey(after)]);
    const rows = await dailyRows(userId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(allowed.has(row.date)).toBe(true);
    expect(rows.reduce((sum, row) => sum + row.attempted, 0)).toBe(2);
  });

  it('accepts an empty batch and keeps newCursor null', async () => {
    const userId = await newUser();
    const response = await sync(userId, makeBatch('batch-empty', []));

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.newCursor).toBeNull();
    expect(await attemptCount(userId)).toBe(0);
    expect(await dailyRows(userId)).toEqual([]);
  });

  it('stores reports and collapses exact duplicates', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const report = makeReport({ qid, at: Date.now() - DAY });

    await sync(userId, makeBatch('batch-reports-1', [], [report, report]));
    await sync(userId, makeBatch('batch-reports-2', [], [report]));

    const rows = await ownerQuery<{ reason: string; status: string }>(
      'select reason, status from public.question_reports where user_id = $1',
      [userId],
    );
    expect(rows).toEqual([{ reason: 'wrong-key', status: 'open' }]);
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  it('returns the stored response for a repeated batchId and writes nothing again', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const at = Date.now() - 2 * DAY;
    const payload = makeBatch('batch-retry', [
      makeAttempt({ qid, at, chosen: 1, correct: true, ms: 1200 }),
      makeAttempt({ qid, at: at + 1000, chosen: 0, correct: false, ms: 800 }),
    ]);

    const first = await sync(userId, payload);
    const statsAfterFirst = await statsRow(qid);
    const dailyAfterFirst = await dailyRows(userId);

    // A correction appears after the first call. A retry must still return the
    // original response, not a fresh one that silently drops it.
    await insertCorrection('corr-retry', qid, new Date().toISOString());

    const second = await sync(userId, payload);

    expect(second).toEqual(first);
    expect(await statsRow(qid)).toEqual(statsAfterFirst);
    expect(await dailyRows(userId)).toEqual(dailyAfterFirst);
    expect(await attemptCount(userId)).toBe(2);

    const batches = await ownerQuery<{ n: number }>(
      'select count(*)::int as n from public.sync_batches where user_id = $1',
      [userId],
    );
    expect(batches[0]!.n).toBe(1);
  });

  it('does not double count attempts resent under a new batchId', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const at = Date.now() - 2 * DAY;
    const one = makeAttempt({ qid, at, chosen: 1, correct: true, ms: 1000 });
    const two = makeAttempt({ qid, at: at + 1000, chosen: 3, correct: false, ms: 3000 });
    const three = makeAttempt({ qid, at: at + 2000, chosen: 2, correct: true, ms: 2000 });

    await sync(userId, makeBatch('batch-resend-1', [one, two]));
    await sync(userId, makeBatch('batch-resend-2', [one, two, three]));

    expect(await attemptCount(userId)).toBe(3);
    expect(await dailyRows(userId)).toEqual([{ date: istDayKey(at), attempted: 3, correct: 2, ms: 6000 }]);
    expect(await statsRow(qid)).toMatchObject({
      attempts: 3,
      correct: 2,
      total_ms: 6000,
      avg_ms: 2000,
    });
  });
});

// ---------------------------------------------------------------------------
// Validation: one bad row rejects the whole batch
// ---------------------------------------------------------------------------

describe('validation', () => {
  const good = () => makeAttempt({ qid: 'validation-q', at: Date.now() - 2 * DAY });

  async function expectRejected(payload: unknown): Promise<void> {
    const userId = await newUser();
    const error = await syncRaw(userId, payload).catch((reason: unknown) => reason);

    expect(sqlState(error)).toBeDefined();
    expect(await attemptCount(userId)).toBe(0);

    const batches = await ownerQuery<{ n: number }>(
      'select count(*)::int as n from public.sync_batches where user_id = $1',
      [userId],
    );
    expect(batches[0]!.n).toBe(0);
  }

  it('rejects a missing or empty batchId', async () => {
    await expectRejected({ deviceId: 'device-a', cursor: null, attempts: [], reports: [] });
    await expectRejected({ batchId: '', deviceId: 'device-a', cursor: null, attempts: [], reports: [] });
  });

  it('rejects a malformed cursor', async () => {
    await expectRejected({
      batchId: 'batch-bad-cursor',
      deviceId: 'device-a',
      cursor: 'yesterday',
      attempts: [],
      reports: [],
    });
  });

  it('rejects non-array attempts or reports', async () => {
    await expectRejected({ batchId: 'b1', deviceId: 'd', cursor: null, attempts: {}, reports: [] });
    await expectRejected({ batchId: 'b2', deviceId: 'd', cursor: null, attempts: [], reports: {} });
    await expectRejected({ batchId: 'b3', deviceId: 'd', cursor: null, attempts: [], reports: null });
  });

  it('rejects more than 200 attempts', async () => {
    const attempts = Array.from({ length: 201 }, (_, index) => ({
      ...good(),
      id: `too-many-${index}`,
    }));
    await expectRejected({
      batchId: 'batch-too-many',
      deviceId: 'device-a',
      cursor: null,
      attempts,
      reports: [],
    });
  });

  it('rejects more than 20 reports', async () => {
    const reports = Array.from({ length: 21 }, (_, index) => ({
      ...makeReport({ qid: `report-${index}`, at: Date.now() - DAY }),
    }));
    await expectRejected({
      batchId: 'batch-too-many-reports',
      deviceId: 'device-a',
      cursor: null,
      attempts: [],
      reports,
    });
  });

  it('rejects an unknown mode', async () => {
    await expectRejected({
      batchId: 'batch-bad-mode',
      deviceId: 'device-a',
      cursor: null,
      attempts: [{ ...good(), mode: 'exam' }],
      reports: [],
    });
  });

  it('rejects a skip marked correct', async () => {
    await expectRejected({
      batchId: 'batch-skip-correct',
      deviceId: 'device-a',
      cursor: null,
      attempts: [{ ...good(), chosen: null, correct: true }],
      reports: [],
    });
  });

  it('rejects an option index outside 0..3 and a negative duration', async () => {
    await expectRejected({
      batchId: 'batch-bad-option',
      deviceId: 'device-a',
      cursor: null,
      attempts: [{ ...good(), chosen: 4 }],
      reports: [],
    });
    await expectRejected({
      batchId: 'batch-bad-ms',
      deviceId: 'device-a',
      cursor: null,
      attempts: [{ ...good(), ms: -1 }],
      reports: [],
    });
  });

  it('rejects a non-object attempt', async () => {
    await expectRejected({
      batchId: 'batch-non-object',
      deviceId: 'device-a',
      cursor: null,
      attempts: [42],
      reports: [],
    });
  });
});

// ---------------------------------------------------------------------------
// Cursor behaviour
// ---------------------------------------------------------------------------

describe('newCursor', () => {
  it('never moves backwards when an older device syncs later', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const base = Date.now() - 2 * DAY;

    const late = makeAttempt({ qid, at: base + 5000, id: 'late-attempt' });
    const early = makeAttempt({ qid, at: base, id: 'early-attempt' });

    const first = await sync(userId, makeBatch('batch-cursor-1', [late]));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.newCursor).toBe(encodeCursor(late.at, late.id));

    const second = await sync(userId, makeBatch('batch-cursor-2', [early]));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.newCursor).toBe(encodeCursor(late.at, late.id));
    expect(await attemptCount(userId)).toBe(2);
  });

  it('breaks a timestamp tie by attempt id', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const at = Date.now() - 2 * DAY;

    const a = makeAttempt({ qid, at, id: 'aaa' });
    const z = makeAttempt({ qid, at, id: 'zzz' });

    const response = await sync(userId, makeBatch('batch-tie', [z, a]));
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.newCursor).toBe(encodeCursor(at, 'zzz'));
  });
});

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

describe('corrections', () => {
  it('delivers corrections once per watermark, with an overlap window', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const correctionId = 'corr-watermark';

    await insertCorrection(correctionId, qid, new Date(Date.now() - 3 * HOUR).toISOString());

    const first = await sync(userId, makeBatch('batch-corr-1', []));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Corrections are global content, so other tests have inserted rows too.
    // Assert on this test's correction only.
    const firstMine = first.corrections.filter((item) => item.qid === qid);
    expect(firstMine).toEqual([
      {
        id: correctionId,
        qid,
        fromVersion: 1,
        toVersion: 2,
        oldAnswer: 0,
        newAnswer: 2,
        reason: 'wrong key',
        correctedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      },
    ]);

    // Put the watermark past the correction: it must disappear.
    await actAsOwner(db);
    await db.query(
      "update public.sync_state set last_corrections_at = now() - interval '1 hour' where user_id = $1",
      [userId],
    );

    const second = await sync(userId, makeBatch('batch-corr-2', []));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.corrections.filter((item) => item.qid === qid)).toEqual([]);

    // A new correction arrives again.
    const newerQid = nextQid();
    const newer = 'corr-watermark-newer';
    await insertCorrection(newer, newerQid, new Date().toISOString());

    const third = await sync(userId, makeBatch('batch-corr-3', []));
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    const ids = third.corrections.map((item) => item.id);
    expect(ids).toContain(newer);
    expect(ids).not.toContain(correctionId);
  });

  it("does not advance another student's watermark", async () => {
    const misers = await newUser();
    const other = await newUser();
    const qid = nextQid();

    await insertCorrection('corr-scope', qid, new Date().toISOString());

    const mine = await sync(misers, makeBatch('batch-corr-scope-1', []));
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    expect(mine.corrections.map((item) => item.id)).toContain('corr-scope');

    const theirs = await sync(other, makeBatch('batch-corr-scope-2', []));
    expect(theirs.ok).toBe(true);
    if (!theirs.ok) return;
    expect(theirs.corrections.map((item) => item.id)).toContain('corr-scope');
  });
});

// ---------------------------------------------------------------------------
// sync_pull
// ---------------------------------------------------------------------------

describe('sync_pull', () => {
  it('pages the log in replay order and reports hasMore', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const base = Date.now() - 2 * DAY;
    const attempts = Array.from({ length: 5 }, (_, index) =>
      makeAttempt({
        qid,
        at: base + index * 1000,
        id: `pull-${index}`,
        chosen: index === 0 ? null : ((index % 4) as OptionIndex),
        correct: index !== 0 && index % 3 === 0,
        ms: 100 * index,
        mode: index === 4 ? 'mock' : 'practice',
        ...(index === 4 ? { mockId: 'mock-1' } : {}),
      }),
    );

    await sync(userId, makeBatch('batch-pull', attempts));

    const first = await pull(userId, null, 2);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.attempts.map((item) => item.id)).toEqual(['pull-0', 'pull-1']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBe(encodeCursor(attempts[1]!.at, attempts[1]!.id));

    const second = await pull(userId, first.nextCursor, 2);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.attempts.map((item) => item.id)).toEqual(['pull-2', 'pull-3']);
    expect(second.hasMore).toBe(true);

    const third = await pull(userId, second.nextCursor, 2);
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.attempts.map((item) => item.id)).toEqual(['pull-4']);
    expect(third.hasMore).toBe(false);
    expect(third.nextCursor).toBe(encodeCursor(attempts[4]!.at, attempts[4]!.id));

    const done = await pull(userId, third.nextCursor, 2);
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.attempts).toEqual([]);
    expect(done.hasMore).toBe(false);
    expect(done.nextCursor).toBe(third.nextCursor);
  });

  it('returns the full attempt shape including mockId and a skip', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const at = Date.now() - 2 * DAY;

    const skipped = makeAttempt({ qid, at, chosen: null, correct: false, ms: 42 });
    const mocked = makeAttempt({
      qid,
      at: at + 1000,
      chosen: 3,
      correct: true,
      ms: 900,
      mode: 'mock',
      mockId: 'mock-42',
      qv: 3,
    });

    await sync(userId, makeBatch('batch-pull-shape', [skipped, mocked]));

    const page = await pull(userId, null, 10);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.attempts).toEqual([
      {
        id: skipped.id,
        qid,
        qv: 1,
        chosen: null,
        correct: false,
        ms: 42,
        mode: 'practice',
        at,
        deviceId: 'device-a',
      },
      {
        id: mocked.id,
        qid,
        qv: 3,
        chosen: 3,
        correct: true,
        ms: 900,
        mode: 'mock',
        mockId: 'mock-42',
        at: at + 1000,
        deviceId: 'device-a',
      },
    ]);
  });

  it('never returns another student rows', async () => {
    const owner = await newUser();
    const other = await newUser();
    const qid = nextQid();

    await sync(owner, makeBatch('batch-pull-owner', [makeAttempt({ qid, at: Date.now() - 2 * DAY })]));

    const page = await pull(other, null, 50);
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.attempts).toEqual([]);
  });

  it('rejects an invalid limit and cursor', async () => {
    const userId = await newUser();

    const badLimit = await pull(userId, null, 0).catch((reason: unknown) => reason);
    expect(sqlState(badLimit)).toBe('22023');

    const badCursor = await pull(userId, 'not-a-cursor', 10).catch((reason: unknown) => reason);
    expect(sqlState(badCursor)).toBe('22023');
  });
});

// ---------------------------------------------------------------------------
// Row-level security
// ---------------------------------------------------------------------------

describe('row-level security', () => {
  it('shows a student only their own rows', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const qid = nextQid();
    const at = Date.now() - 2 * DAY;

    await sync(alice, makeBatch('batch-rls-alice', [makeAttempt({ qid, at })]));
    await sync(bob, makeBatch('batch-rls-bob', [makeAttempt({ qid, at: at + 1000 })]));
    await insertCorrection('corr-rls', qid, new Date().toISOString());

    const visible = await asUser(db, alice, async () => {
      const inbox = await db.query<{ n: number }>('select count(*)::int as n from public.attempt_inbox');
      const daily = await db.query<{ n: number }>('select count(*)::int as n from public.daily_stats');
      const profiles = await db.query<{ user_id: string }>('select user_id from public.profiles');
      const corrections = await db.query<{ id: string }>(
        'select id from public.question_corrections where id = $1',
        ['corr-rls'],
      );
      return {
        inbox: inbox.rows[0]!.n,
        daily: daily.rows[0]!.n,
        profiles: profiles.rows.map((row) => row.user_id),
        corrections: corrections.rows.map((row) => row.id),
      };
    });

    expect(visible.inbox).toBe(1);
    expect(visible.daily).toBe(1);
    expect(visible.profiles).toEqual([alice]);
    expect(visible.corrections).toEqual(['corr-rls']);
  });

  it('denies direct writes to the attempt log', async () => {
    const userId = await newUser();
    const at = Date.now() - 2 * DAY;

    const error = await asUser(db, userId, () =>
      db.query(
        `insert into public.attempt_inbox
           (user_id, attempt_id, batch_id, qid, qv, chosen, correct, ms, mode, at_ms, device_id, day)
         values ($1, 'direct', 'direct-batch', 'q', 1, 1, true, 10, 'practice', $2, 'd', current_date)`,
        [userId, at],
      ),
    ).catch((reason: unknown) => reason);

    expect(sqlState(error)).toBe('42501');
  });

  it('allows a profile update but not a change of owner or identity columns', async () => {
    const alice = await newUser();
    const bob = await newUser();

    await asUser(db, alice, () => db.query('update public.profiles set name = $1', ['Alice']));

    const rows = await ownerQuery<{ user_id: string; name: string | null }>(
      'select user_id, name from public.profiles where user_id = any($1::uuid[]) order by name',
      [[alice, bob]],
    );
    expect(rows).toEqual([
      { user_id: alice, name: 'Alice' },
      { user_id: bob, name: null },
    ]);

    const reassign = await asUser(db, alice, () =>
      db.query('update public.profiles set user_id = $1', [bob]),
    ).catch((reason: unknown) => reason);
    expect(sqlState(reassign)).toBe('42501');
  });

  it('shows a student only their own reports', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const at = Date.now() - DAY;

    await sync(alice, makeBatch('batch-report-rls-a', [], [makeReport({ qid: nextQid(), at })]));
    await sync(bob, makeBatch('batch-report-rls-b', [], [makeReport({ qid: nextQid(), at })]));

    const rows = await asUser(db, alice, () =>
      db.query<{ n: number }>('select count(*)::int as n from public.question_reports'),
    );
    expect(rows.rows[0]!.n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

describe('compact_sync_inbox', () => {
  async function compact(retention?: string): Promise<Record<string, number>> {
    await actAsOwner(db);
    const { rows } = await db.query<{ result: Record<string, number> }>(
      retention === undefined
        ? 'select public.compact_sync_inbox() as result'
        : 'select public.compact_sync_inbox($1::interval) as result',
      retention === undefined ? [] : [retention],
    );
    return rows[0]!.result;
  }

  it('keeps every attempt until a checkpoint covers it', async () => {
    const userId = await newUser();
    const qid = nextQid();
    const base = Date.now() - 2 * DAY;
    const one = makeAttempt({ qid, at: base, id: 'compact-1' });
    const two = makeAttempt({ qid, at: base + 1000, id: 'compact-2' });

    await sync(userId, makeBatch('batch-compact', [one, two]));

    expect((await compact()).attemptsPruned).toBe(0);
    expect(await attemptCount(userId)).toBe(2);

    await actAsOwner(db);
    await db.query(
      `insert into public.checkpoints (user_id, cursor, card_states, skills, ist_daily_totals)
       values ($1, $2, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
      [userId, encodeCursor(one.at, one.id)],
    );

    expect((await compact()).attemptsPruned).toBe(1);
    expect(await attemptCount(userId)).toBe(1);

    await actAsOwner(db);
    await db.query(
      `insert into public.checkpoints (user_id, cursor, card_states, skills, ist_daily_totals)
       values ($1, $2, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)`,
      [userId, encodeCursor(two.at, two.id)],
    );

    expect((await compact()).attemptsPruned).toBe(1);
    expect(await attemptCount(userId)).toBe(0);
  });

  it('forgets only old batch keys that have no attempts left', async () => {
    const userId = await newUser();
    const qid = nextQid();
    await sync(userId, makeBatch('batch-old-key', [makeAttempt({ qid, at: Date.now() - 2 * DAY })]));

    await actAsOwner(db);
    await db.query(
      "update public.sync_batches set received_at = now() - interval '200 days' where user_id = $1",
      [userId],
    );

    // The batch still owns an attempt, so its key must survive the cascade.
    expect((await compact()).batchesPruned).toBe(0);
    expect(await attemptCount(userId)).toBe(1);

    await actAsOwner(db);
    await db.query('delete from public.attempt_inbox where user_id = $1', [userId]);

    expect((await compact()).batchesPruned).toBe(1);
  });

  it('rejects a retention shorter than a day', async () => {
    const error = await compact('12 hours').catch((reason: unknown) => reason);
    expect(sqlState(error)).toBe('22023');
  });
});
