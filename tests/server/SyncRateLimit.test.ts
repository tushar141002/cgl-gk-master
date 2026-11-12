/**
 * Per-user rate limit on `apply_sync_batch` (D-088), against the real
 * migrations in PGlite. The limit must stop a flood without ever blocking the
 * replay of a batch the server already accepted (D-067).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';

import type { SyncBatch, SyncResponse } from '../../shared/contract';
import { actAsOwner, asUser, createTestDatabase, createUser, sqlState, type TestDatabase } from './harness';

let harness: TestDatabase;
let db: PGlite;
let limit: number;

beforeAll(async () => {
  harness = await createTestDatabase();
  db = harness.db;
  const { rows } = await db.query<{ n: number }>('select public.sync_rate_limit() as n');
  limit = rows[0]!.n;
});

afterAll(async () => {
  await harness.close();
});

const NOW = Date.UTC(2026, 10, 12, 6, 0, 0);
let users = 0;

async function newUser(): Promise<string> {
  users += 1;
  return createUser(db, `rate-${users}@example.test`);
}

function batch(batchId: string = randomUUID()): SyncBatch {
  return {
    batchId,
    deviceId: 'device-a',
    cursor: null,
    attempts: [
      {
        id: randomUUID(),
        qid: 'rate-q',
        qv: 1,
        chosen: 0,
        correct: true,
        ms: 900,
        mode: 'practice',
        at: NOW,
        deviceId: 'device-a',
      },
    ],
    reports: [],
  };
}

async function send(userId: string, payload: SyncBatch): Promise<SyncResponse> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ result: SyncResponse }>(
      'select public.apply_sync_batch($1::jsonb) as result',
      [JSON.stringify(payload)],
    );
    return rows[0]!.result;
  });
}

async function fillWindow(userId: string): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    const id = randomUUID();
    ids.push(id);
    expect((await send(userId, batch(id))).ok).toBe(true);
  }
  return ids;
}

async function batchCount(userId: string): Promise<number> {
  await actAsOwner(db);
  const { rows } = await db.query<{ n: number }>(
    'select count(*)::int as n from public.sync_batches where user_id = $1',
    [userId],
  );
  return rows[0]!.n;
}

describe('sync rate limit', () => {
  it('allows a sign-in burst but refuses new batches over the limit with a retry hint', async () => {
    const userId = await newUser();
    await fillWindow(userId);

    const refused = await send(userId, batch());

    expect(refused).toMatchObject({ ok: false, error: 'rate_limited' });
    const wait = (refused as { retryAfterMs: number }).retryAfterMs;
    expect(wait).toBeGreaterThanOrEqual(1000);
    expect(wait).toBeLessThanOrEqual(60_000);
    expect(await batchCount(userId)).toBe(limit);
  });

  it('still replays a batch the server already accepted', async () => {
    const userId = await newUser();
    const ids = await fillWindow(userId);

    const replay = await send(userId, batch(ids[0]));

    expect(replay.ok).toBe(true);
  });

  it('counts each student separately', async () => {
    const busy = await newUser();
    const quiet = await newUser();
    await fillWindow(busy);

    expect((await send(quiet, batch())).ok).toBe(true);
  });

  it('accepts again once the window has passed', async () => {
    const userId = await newUser();
    await fillWindow(userId);
    await actAsOwner(db);
    await db.query(
      "update public.sync_batches set received_at = received_at - interval '61 seconds' where user_id = $1",
      [userId],
    );

    expect((await send(userId, batch())).ok).toBe(true);
  });

  it('keeps the unthrottled function out of students’ reach', async () => {
    const userId = await newUser();

    await expect(
      asUser(db, userId, () =>
        db.query('select public.apply_sync_batch_unthrottled($1::jsonb)', [JSON.stringify(batch())]),
      ),
    ).rejects.toSatisfy((error: unknown) => sqlState(error) === '42501');
  });
});
