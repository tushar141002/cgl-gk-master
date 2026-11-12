/**
 * Account deletion (F12, D-086), run against the real migrations in PGlite.
 *
 * The promise is completeness: after `delete_user()` no table keeps a row for
 * the student. The table list is read from the catalogue, so a new table with a
 * `user_id` column is checked here without anyone remembering to add it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';

import type { AttemptRecord, SyncBatch } from '../../shared/contract';
import { actAsOwner, asUser, createTestDatabase, createUser, sqlState, type TestDatabase } from './harness';

let harness: TestDatabase;
let db: PGlite;

beforeAll(async () => {
  harness = await createTestDatabase();
  db = harness.db;

  // One open live mock with a one-question pool, so a student can sit it.
  await db.query(
    `insert into public.mock_tests (id, title_en, title_hi, opens_at, closes_at, question_count)
     values ('delete-mock', 'Mock', 'मॉक', now() - interval '1 hour', now() + interval '1 day', 1)`,
  );
  await db.query(
    `insert into public.mock_pool (mock_id, qid, en, answer)
     values ('delete-mock', 'mock-q-1', '{"q":"Q","options":["a","b","c","d"],"explanation":"E"}', 0)`,
  );
});

afterAll(async () => {
  await harness.close();
});

const NOW = Date.UTC(2026, 10, 12, 6, 0, 0);

function attempt(qid: string, at: number): AttemptRecord {
  return {
    id: randomUUID(),
    qid,
    qv: 1,
    chosen: 1,
    correct: true,
    ms: 1200,
    mode: 'practice',
    at,
    deviceId: 'device-a',
  };
}

/** Gives a student a row in every table a sync, a report, a checkpoint and a live mock touch. */
async function seedStudent(email: string): Promise<string> {
  const userId = await createUser(db, email);
  const batch: SyncBatch = {
    batchId: randomUUID(),
    deviceId: 'device-a',
    cursor: null,
    attempts: [attempt('delete-q-1', NOW), attempt('delete-q-2', NOW + 1000)],
    reports: [{ qid: 'delete-q-1', qv: 1, reason: 'typo', at: NOW }],
  };
  await asUser(db, userId, () =>
    db.query('select public.apply_sync_batch($1::jsonb)', [JSON.stringify(batch)]),
  );

  await actAsOwner(db);
  await db.query(
    `insert into public.checkpoints (user_id, cursor, card_states, skills, ist_daily_totals)
     values ($1, '1:a', '[]', '[]', '[]')`,
    [userId],
  );

  await actAsOwner(db);
  const { rows: waiting } = await db.query<{ attempt_id: string; day: string }>(
    'select attempt_id, day::text as day from public.attempt_inbox where user_id = $1 order by attempt_id limit 1',
    [userId],
  );
  await db.query('select public.record_archive($1, $2::date, 1, $3, $4, 10, $5)', [
    userId,
    waiting[0]!.day,
    `users/${userId}/${waiting[0]!.day}-1-test.cga.gz`,
    [waiting[0]!.attempt_id],
    'a'.repeat(64),
  ]);

  await asUser(db, userId, async () => {
    const { rows } = await db.query<{ result: { sessionId: string } }>(
      "select public.start_mock('delete-mock') as result",
    );
    await db.query('select public.submit_mock($1::uuid, $2::jsonb)', [
      rows[0]!.result.sessionId,
      JSON.stringify([{ qid: 'mock-q-1', chosen: 0, ms: 5000 }]),
    ]);
  });
  return userId;
}

async function mockAnswerCount(userId: string): Promise<number> {
  await actAsOwner(db);
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.mock_answers a
     join public.mock_sessions s on s.id = a.session_id where s.user_id = $1`,
    [userId],
  );
  return rows[0]!.n;
}

async function deleteAs(userId: string | null): Promise<unknown> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ result: unknown }>('select public.delete_user() as result');
    return rows[0]!.result;
  });
}

/** Every public table with a `user_id` column, from the catalogue. */
async function userTables(): Promise<string[]> {
  await actAsOwner(db);
  const { rows } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'user_id'
     order by table_name`,
  );
  return rows.map((row) => row.table_name);
}

async function rowCounts(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of await userTables()) {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from public.${table} where user_id = $1`,
      [userId],
    );
    counts[table] = rows[0]!.n;
  }
  return counts;
}

async function authUserExists(userId: string): Promise<boolean> {
  await actAsOwner(db);
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from auth.users where id = $1', [
    userId,
  ]);
  return rows[0]!.n === 1;
}

describe('delete_user', () => {
  it('seeds a row in every user table, so the completeness check is meaningful', async () => {
    const userId = await seedStudent('seed-check@example.test');
    const counts = await rowCounts(userId);

    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(8);
    for (const [table, n] of Object.entries(counts)) {
      expect(n, `expected seeded rows in ${table}`).toBeGreaterThan(0);
    }
    expect(await mockAnswerCount(userId)).toBe(1);
  });

  it('removes every row the student owns and the auth user', async () => {
    const userId = await seedStudent('leaving@example.test');
    const before = await mockAnswerCount(userId);

    expect(await deleteAs(userId)).toEqual({ ok: true });

    await actAsOwner(db);
    const counts = await rowCounts(userId);
    for (const [table, n] of Object.entries(counts)) {
      expect(n, `rows left in ${table}`).toBe(0);
    }
    expect(await authUserExists(userId)).toBe(false);
    expect(before).toBe(1);
    await actAsOwner(db);
    const { rows: orphans } = await db.query<{ n: number }>(
      'select count(*)::int as n from public.mock_answers a left join public.mock_sessions s on s.id = a.session_id where s.id is null',
    );
    expect(orphans[0]!.n).toBe(0);
  });

  it('leaves other students and anonymous question stats untouched', async () => {
    const staying = await seedStudent('staying@example.test');
    const leaving = await seedStudent('leaving-2@example.test');
    const before = await rowCounts(staying);

    await actAsOwner(db);
    const { rows: statsBefore } = await db.query<{ attempts: number }>(
      "select attempts from public.question_stats where qid = 'delete-q-1'",
    );

    await deleteAs(leaving);

    expect(await rowCounts(staying)).toEqual(before);
    expect(await authUserExists(staying)).toBe(true);

    await actAsOwner(db);
    const { rows: statsAfter } = await db.query<{ attempts: number }>(
      "select attempts from public.question_stats where qid = 'delete-q-1'",
    );
    expect(statsAfter).toEqual(statsBefore);
  });

  it('is safe to retry after a lost response', async () => {
    const userId = await seedStudent('retry@example.test');

    expect(await deleteAs(userId)).toEqual({ ok: true });
    expect(await deleteAs(userId)).toEqual({ ok: true });
    expect(await authUserExists(userId)).toBe(false);
  });

  it('refuses a caller without a token', async () => {
    await expect(deleteAs(null)).rejects.toSatisfy((error: unknown) => sqlState(error) === '28000');
  });

  it('cannot be called by the anon role', async () => {
    const userId = await seedStudent('anon-check@example.test');

    await expect(asUser(db, userId, () => db.query('select public.delete_user()'), 'anon')).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === '42501',
    );
    expect(await authUserExists(userId)).toBe(true);
  });
});
