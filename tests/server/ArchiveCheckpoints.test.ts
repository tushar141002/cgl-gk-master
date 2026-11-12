/**
 * 7A-2 against the real migrations in PGlite (D-026, D-027, D-066, D-091).
 *
 * The invariant under test: an attempt leaves the inbox only when it is in an
 * archive file, behind the newest checkpoint and older than the retention.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';

import { encodeCursor, type AttemptRecord, type SyncBatch } from '../../shared/contract';
import { actAsOwner, asUser, createTestDatabase, createUser, sqlState, type TestDatabase } from './harness';

let harness: TestDatabase;
let db: PGlite;

beforeAll(async () => {
  harness = await createTestDatabase();
  db = harness.db;
});

afterAll(async () => {
  await harness.close();
});

const DAY = 24 * 60 * 60_000;
let users = 0;

async function newUser(): Promise<string> {
  users += 1;
  return createUser(db, `archive-${users}@example.test`);
}

function attempt(at: number, overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    id: randomUUID(),
    qid: 'arch-q',
    qv: 1,
    chosen: 1,
    correct: true,
    ms: 1500,
    mode: 'practice',
    at,
    deviceId: 'device-a',
    ...overrides,
  };
}

async function sync(userId: string, attempts: AttemptRecord[]): Promise<void> {
  const batch: SyncBatch = {
    batchId: randomUUID(),
    deviceId: 'device-a',
    cursor: null,
    attempts,
    reports: [],
  };
  await asUser(db, userId, () =>
    db.query('select public.apply_sync_batch($1::jsonb)', [JSON.stringify(batch)]),
  );
}

type Json = Record<string, unknown>;

async function owner<T = Json>(sql: string, params: unknown[] = []): Promise<T> {
  await actAsOwner(db);
  const { rows } = await db.query<{ result: T }>(sql, params);
  return rows[0]!.result;
}

async function as<T = Json>(userId: string, sql: string, params: unknown[] = []): Promise<T> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ result: T }>(sql, params);
    return rows[0]!.result;
  });
}

interface Pending {
  userId: string;
  day: string;
  nextPart: number;
}

async function pendingFor(userId: string): Promise<Pending[]> {
  const all = await owner<Pending[]>('select public.archive_pending() as result');
  return all.filter((group) => group.userId === userId);
}

async function archiveAll(userId: string): Promise<void> {
  for (const group of await pendingFor(userId)) {
    const attempts = await owner<AttemptRecord[]>('select public.archive_attempts($1, $2::date) as result', [
      userId,
      group.day,
    ]);
    await owner('select public.record_archive($1, $2::date, $3, $4, $5, 100, $6) as result', [
      userId,
      group.day,
      group.nextPart,
      `users/${userId}/${group.day}-${group.nextPart}-${randomUUID().slice(0, 8)}.cga.gz`,
      attempts.map((a) => a.id),
      'b'.repeat(64),
    ]);
  }
}

async function inboxCount(userId: string): Promise<number> {
  return owner<number>('select count(*)::int as result from public.attempt_inbox where user_id = $1', [
    userId,
  ]);
}

async function ageInbox(userId: string, days: number): Promise<void> {
  await actAsOwner(db);
  await db.query(
    'update public.attempt_inbox set received_at = received_at - make_interval(days => $2) where user_id = $1',
    [userId, days],
  );
}

const put = (userId: string, checkpoint: unknown): Promise<Json> =>
  as(userId, 'select public.put_checkpoint($1::jsonb) as result', [JSON.stringify(checkpoint)]);

function checkpointAt(a: AttemptRecord): Json {
  return {
    cursor: encodeCursor(a.at, a.id),
    cardStates: [{ qid: a.qid }],
    skills: [],
    istDailyTotals: [{ date: '2026-11-01', attempted: 1, correct: 1, ms: 1500 }],
  };
}

const compact = (): Promise<Json> => owner('select public.compact_sync_inbox() as result');

describe('archive manifest', () => {
  it('lists finished IST days with unarchived attempts, then nothing once archived', async () => {
    const userId = await newUser();
    await sync(userId, [attempt(Date.now() - 3 * DAY), attempt(Date.now() - 2 * DAY), attempt(Date.now())]);

    const pending = await pendingFor(userId);
    expect(pending).toHaveLength(2);
    expect(pending.every((group) => group.nextPart === 1)).toBe(true);

    await archiveAll(userId);
    expect(await pendingFor(userId)).toEqual([]);
  });

  it('returns attempts in replay order as AttemptRecord JSON, skips included', async () => {
    const userId = await newUser();
    const at = Date.now() - 2 * DAY;
    const skip = attempt(at + 5, { chosen: null, correct: false, mode: 'revise' });
    const answer = attempt(at, { mode: 'mock', mockId: 'mock-1' });
    await sync(userId, [skip, answer]);

    const [day] = await pendingFor(userId);
    const rows = await owner<AttemptRecord[]>('select public.archive_attempts($1, $2::date) as result', [
      userId,
      day!.day,
    ]);

    expect(rows).toEqual([answer, skip]);
  });

  it('puts a late attempt for an archived day into the next part', async () => {
    const userId = await newUser();
    const at = Date.now() - 2 * DAY;
    await sync(userId, [attempt(at)]);
    await archiveAll(userId);

    await sync(userId, [attempt(at + 60_000)]);
    const pending = await pendingFor(userId);

    expect(pending).toHaveLength(1);
    expect(pending[0]!.nextPart).toBe(2);
  });

  it('is idempotent by path and rolls back on a count mismatch', async () => {
    const userId = await newUser();
    const one = attempt(Date.now() - 2 * DAY);
    await sync(userId, [one]);
    const [group] = await pendingFor(userId);
    const path = `users/${userId}/${group!.day}-1-fixed.cga.gz`;
    const record = (ids: string[]): Promise<Json> =>
      owner('select public.record_archive($1, $2::date, 1, $3, $4, 50, $5) as result', [
        userId,
        group!.day,
        path,
        ids,
        'c'.repeat(64),
      ]);

    await expect(record([one.id, 'not-in-inbox'])).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === '22023',
    );
    expect(await pendingFor(userId)).toHaveLength(1);

    expect(await record([one.id])).toMatchObject({ ok: true, already: false, marked: 1 });
    expect(await record([one.id])).toMatchObject({ ok: true, already: true });
  });

  it('names the deleted accounts whose files must be removed', async () => {
    const kept = await newUser();
    const gone = randomUUID();

    expect(
      await owner<string[]>('select public.archive_orphans($1::uuid[]) as result', [[kept, gone]]),
    ).toEqual([gone]);
  });

  it('keeps the service functions away from students', async () => {
    const userId = await newUser();

    for (const call of ['archive_pending()', "archive_orphans('{}'::uuid[])", 'compact_sync_inbox()']) {
      await expect(as(userId, `select public.${call} as result`)).rejects.toSatisfy(
        (error: unknown) => sqlState(error) === '42501',
      );
    }
  });
});

describe('put_checkpoint and latest_checkpoint', () => {
  it('stores a checkpoint for attempts the server holds and returns it', async () => {
    const userId = await newUser();
    const one = attempt(Date.now() - 40 * DAY);
    await sync(userId, [one, attempt(Date.now())]);

    expect(await put(userId, checkpointAt(one))).toEqual({ ok: true, cursor: encodeCursor(one.at, one.id) });

    const latest = await as<Json>(userId, 'select public.latest_checkpoint() as result');
    expect(latest['checkpoint']).toMatchObject({
      cursor: encodeCursor(one.at, one.id),
      cardStates: [{ qid: one.qid }],
      istDailyTotals: [{ date: '2026-11-01', attempted: 1 }],
    });
    expect(String((latest['checkpoint'] as Json)['createdAt'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refuses a checkpoint ahead of what the server holds', async () => {
    const userId = await newUser();
    const synced = attempt(Date.now() - 40 * DAY);
    await sync(userId, [synced]);

    expect(await put(userId, checkpointAt(attempt(Date.now())))).toEqual({
      ok: false,
      error: 'ahead_of_server',
    });
    expect(await put(await newUser(), checkpointAt(synced))).toEqual({ ok: false, error: 'ahead_of_server' });
  });

  it('only moves forward and keeps the newest two', async () => {
    const userId = await newUser();
    const [a, b, c] = [
      attempt(Date.now() - 50 * DAY),
      attempt(Date.now() - 45 * DAY),
      attempt(Date.now() - 40 * DAY),
    ];
    await sync(userId, [a!, b!, c!]);

    await put(userId, checkpointAt(b!));
    expect(await put(userId, checkpointAt(a!))).toEqual({ ok: false, error: 'stale' });
    expect(await put(userId, checkpointAt(b!))).toEqual({ ok: false, error: 'stale' });
    await put(userId, checkpointAt(c!));
    await sync(userId, [attempt(Date.now() - 30 * DAY)]);

    const count = await owner<number>(
      'select count(*)::int as result from public.checkpoints where user_id = $1',
      [userId],
    );
    expect(count).toBe(2);
    const latest = await as<Json>(userId, 'select public.latest_checkpoint() as result');
    expect((latest['checkpoint'] as Json)['cursor']).toBe(encodeCursor(c!.at, c!.id));
  });

  it.each([
    ['a bad cursor', { cursor: 'nope', cardStates: [], skills: [], istDailyTotals: [] }],
    ['a missing array', { cursor: '1:a', cardStates: [], skills: [] }],
    [
      'an oversized body',
      { cursor: '1:a', cardStates: ['x'.repeat(2_100_000)], skills: [], istDailyTotals: [] },
    ],
  ])('rejects %s', async (_label, body) => {
    await expect(put(await newUser(), body)).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === '22023',
    );
  });

  it('has nothing for a student without a checkpoint', async () => {
    expect(await as(await newUser(), 'select public.latest_checkpoint() as result')).toEqual({
      ok: true,
      checkpoint: null,
    });
  });
});

describe('compact_sync_inbox with archive and checkpoint (D-091)', () => {
  it('needs all three: archived, behind the checkpoint and older than the retention', async () => {
    const userId = await newUser();
    // Within 30 days, so each is filed under its own IST day, not today (D-028).
    const old = attempt(Date.now() - 25 * DAY);
    const recent = attempt(Date.now() - 20 * DAY);
    await sync(userId, [old, recent]);

    await ageInbox(userId, 40);
    await compact();
    expect(await inboxCount(userId)).toBe(2);

    await put(userId, checkpointAt(old));
    await compact();
    expect(await inboxCount(userId)).toBe(2);

    await archiveAll(userId);
    await compact();
    expect(await inboxCount(userId)).toBe(1);

    const remaining = await owner<string>(
      'select attempt_id as result from public.attempt_inbox where user_id = $1',
      [userId],
    );
    expect(remaining).toBe(recent.id);
  });

  it('keeps archived, checkpointed attempts that arrived recently', async () => {
    const userId = await newUser();
    const one = attempt(Date.now() - 25 * DAY);
    await sync(userId, [one]);
    await put(userId, checkpointAt(one));
    await archiveAll(userId);
    expect(await pendingFor(userId)).toEqual([]);

    await compact();
    expect(await inboxCount(userId)).toBe(1);
  });
});
