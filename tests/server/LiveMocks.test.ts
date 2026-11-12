/**
 * Live mocks (F8, D-012, D-029, D-090), against the real migrations in PGlite.
 *
 * The server is the only grader, so these tests cover everything a ranking
 * depends on: who may start, what a student sees, the deadline, grading with
 * negative marking, the speed flag, ranking order and when answers appear.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';

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

let mockCounter = 0;
let userCounter = 0;

interface MockSpec {
  readonly opensIn?: string;
  readonly closesIn?: string;
  readonly poolSize?: number;
  readonly questionCount?: number;
  readonly durationSec?: number;
}

/** Creates a mock whose pool question `p<n>` has answer `n % 4`. */
async function createMock(spec: MockSpec = {}): Promise<string> {
  mockCounter += 1;
  const id = `mock-${mockCounter}`;
  await actAsOwner(db);
  await db.query(
    `insert into public.mock_tests (id, title_en, title_hi, opens_at, closes_at, duration_sec, question_count)
     values ($1, 'Weekend mock', 'साप्ताहिक मॉक', now() + $2::interval, now() + $3::interval, $4, $5)`,
    [
      id,
      spec.opensIn ?? '-1 hour',
      spec.closesIn ?? '2 days',
      spec.durationSec ?? 900,
      spec.questionCount ?? 4,
    ],
  );
  for (let n = 0; n < (spec.poolSize ?? 6); n += 1) {
    await db.query(
      `insert into public.mock_pool (mock_id, qid, en, hi, answer) values ($1, $2, $3, $4, $5)`,
      [
        id,
        `p${n}`,
        JSON.stringify({ q: `Question ${n}`, options: ['a', 'b', 'c', 'd'], explanation: `Because ${n}` }),
        JSON.stringify({ q: `प्रश्न ${n}`, options: ['क', 'ख', 'ग', 'घ'], explanation: `क्योंकि ${n}` }),
        n % 4,
      ],
    );
  }
  return id;
}

async function newUser(): Promise<string> {
  userCounter += 1;
  return createUser(db, `mocker-${userCounter}@example.test`);
}

type Json = Record<string, unknown>;

async function rpc(userId: string | null, sql: string, params: unknown[] = []): Promise<Json> {
  return asUser(db, userId, async () => {
    const { rows } = await db.query<{ result: Json }>(sql, params);
    return rows[0]!.result;
  });
}

const start = (userId: string, mockId: string): Promise<Json> =>
  rpc(userId, 'select public.start_mock($1) as result', [mockId]);

const submit = (userId: string, sessionId: string, answers: unknown): Promise<Json> =>
  rpc(userId, 'select public.submit_mock($1::uuid, $2::jsonb) as result', [
    sessionId,
    JSON.stringify(answers),
  ]);

const list = (userId: string): Promise<Json> => rpc(userId, 'select public.list_mocks() as result');

const board = (userId: string, mockId: string, limit = 20): Promise<Json> =>
  rpc(userId, 'select public.mock_leaderboard($1, $2) as result', [mockId, limit]);

const review = (userId: string, mockId: string): Promise<Json> =>
  rpc(userId, 'select public.mock_review($1) as result', [mockId]);

interface Question {
  qid: string;
  qv: number;
  en: { q: string; options: string[] };
  hi: { q: string; options: string[] } | null;
}

function questionsOf(started: Json): Question[] {
  return started['questions'] as Question[];
}

/** The right answer for a pool question, from its id. */
function keyOf(qid: string): number {
  return Number(qid.slice(1)) % 4;
}

/** Moves a session back in time so it was not suspiciously fast. */
async function age(sessionId: string, minutes: number): Promise<void> {
  await actAsOwner(db);
  await db.query(
    `update public.mock_sessions
     set started_at = started_at - make_interval(mins => $2), deadline_at = deadline_at - make_interval(mins => $2)
     where id = $1`,
    [sessionId, minutes],
  );
}

describe('start_mock', () => {
  let mockId: string;
  beforeEach(async () => {
    mockId = await createMock();
  });

  it('draws question_count distinct questions from the pool, without answers or explanations', async () => {
    const student = await newUser();
    const started = await start(student, mockId);

    expect(started['ok']).toBe(true);
    const questions = questionsOf(started);
    expect(questions).toHaveLength(4);
    expect(new Set(questions.map((q) => q.qid)).size).toBe(4);
    for (const q of questions) {
      expect(q.qid).toMatch(/^p[0-5]$/);
      expect(q.en.options).toHaveLength(4);
      expect(q.hi?.options).toHaveLength(4);
      expect(JSON.stringify(q)).not.toMatch(/answer|explanation|Because/);
    }
  });

  it('fixes the deadline on the server at start time plus the duration', async () => {
    const started = await start(await newUser(), mockId);

    expect((started['deadlineAt'] as number) - (started['startedAt'] as number)).toBe(900_000);
  });

  it('caps the deadline at the mock closing time', async () => {
    const closing = await createMock({ closesIn: '5 minutes' });
    const started = await start(await newUser(), closing);

    expect((started['deadlineAt'] as number) - (started['startedAt'] as number)).toBeLessThanOrEqual(300_000);
  });

  it('resumes the same session and the same questions', async () => {
    const student = await newUser();
    const first = await start(student, mockId);
    const again = await start(student, mockId);

    expect(again['sessionId']).toBe(first['sessionId']);
    expect(questionsOf(again).map((q) => q.qid)).toEqual(questionsOf(first).map((q) => q.qid));
    expect(again['deadlineAt']).toBe(first['deadlineAt']);
  });

  it.each([
    ['not_found', { id: 'no-such-mock' }],
    ['not_open', { spec: { opensIn: '1 hour' } }],
    ['closed', { spec: { opensIn: '-2 days', closesIn: '-1 hour' } }],
    ['unavailable', { spec: { poolSize: 2, questionCount: 4 } }],
  ])('answers %s', async (error, setup: { id?: string; spec?: MockSpec }) => {
    const id = setup.id ?? (await createMock(setup.spec));

    expect(await start(await newUser(), id)).toEqual({ ok: false, error });
  });

  it('refuses a second sitting after submitting', async () => {
    const student = await newUser();
    const started = await start(student, mockId);
    await submit(student, started['sessionId'] as string, []);

    expect(await start(student, mockId)).toEqual({ ok: false, error: 'already_submitted' });
  });

  it('reports an abandoned session as expired after the grace period', async () => {
    const student = await newUser();
    const started = await start(student, mockId);
    await age(started['sessionId'] as string, 30);

    expect(await start(student, mockId)).toEqual({ ok: false, error: 'expired' });
  });
});

describe('submit_mock', () => {
  let mockId: string;
  beforeEach(async () => {
    mockId = await createMock();
  });

  it('grades with +2 for correct, -0.5 for wrong and 0 for skipped', async () => {
    const student = await newUser();
    const started = await start(student, mockId);
    const [q1, q2, q3] = questionsOf(started);
    await age(started['sessionId'] as string, 5);

    const result = await submit(student, started['sessionId'] as string, [
      { qid: q1!.qid, chosen: keyOf(q1!.qid), ms: 20_000 },
      { qid: q2!.qid, chosen: (keyOf(q2!.qid) + 1) % 4, ms: 15_000 },
      { qid: q3!.qid, chosen: null, ms: 3_000 },
    ]);

    expect(result).toMatchObject({ ok: true, correct: 1, wrong: 1, skipped: 2, maxScore: 8 });
    expect(Number(result['score'])).toBe(1.5);
  });

  it('returns the stored result to a retried submit and grades only once', async () => {
    const student = await newUser();
    const started = await start(student, mockId);
    const [q1] = questionsOf(started);
    const answers = [{ qid: q1!.qid, chosen: keyOf(q1!.qid), ms: 9_000 }];

    const first = await submit(student, started['sessionId'] as string, answers);
    const retry = await submit(student, started['sessionId'] as string, [
      { qid: q1!.qid, chosen: (keyOf(q1!.qid) + 1) % 4, ms: 1 },
    ]);

    expect(retry).toEqual(first);
  });

  it('refuses a submission after the deadline and the grace period', async () => {
    const student = await newUser();
    const started = await start(student, mockId);
    await age(started['sessionId'] as string, 30);

    expect(await submit(student, started['sessionId'] as string, [])).toEqual({
      ok: false,
      error: 'too_late',
    });
  });

  it('accepts a submission inside the grace period', async () => {
    const student = await newUser();
    const started = await start(student, mockId);
    await age(started['sessionId'] as string, 20);

    expect((await submit(student, started['sessionId'] as string, []))['ok']).toBe(true);
  });

  it('does not let a student submit another student’s session', async () => {
    const owner = await newUser();
    const other = await newUser();
    const started = await start(owner, mockId);

    expect(await submit(other, started['sessionId'] as string, [])).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it.each([
    [
      'a question outside the session',
      (qs: Question[]) => [{ qid: 'p99', chosen: 0, ms: 1 }, ...qs.slice(0, 0)],
    ],
    [
      'the same question twice',
      (qs: Question[]) => [
        { qid: qs[0]!.qid, chosen: 0, ms: 1 },
        { qid: qs[0]!.qid, chosen: 1, ms: 1 },
      ],
    ],
    ['an option index of 4', (qs: Question[]) => [{ qid: qs[0]!.qid, chosen: 4, ms: 1 }]],
    ['a negative time', (qs: Question[]) => [{ qid: qs[0]!.qid, chosen: 1, ms: -5 }]],
  ])('rejects %s', async (_label, build) => {
    const student = await newUser();
    const started = await start(student, mockId);

    await expect(
      submit(student, started['sessionId'] as string, build(questionsOf(started))),
    ).rejects.toSatisfy((error: unknown) => sqlState(error) === '22023');
  });

  it('flags a submission faster than two seconds per answered question', async () => {
    const student = await newUser();
    const started = await start(student, mockId);
    const answers = questionsOf(started).map((q) => ({ qid: q.qid, chosen: keyOf(q.qid), ms: 100 }));

    await submit(student, started['sessionId'] as string, answers);

    await actAsOwner(db);
    const { rows } = await db.query<{ flagged: boolean }>(
      'select flagged from public.mock_sessions where id = $1',
      [started['sessionId']],
    );
    expect(rows[0]!.flagged).toBe(true);
  });
});

describe('list_mocks', () => {
  it('shows each mock with the caller’s own session status and score', async () => {
    const mockId = await createMock();
    const student = await newUser();

    const before = ((await list(student))['mocks'] as Json[]).find((m) => m['id'] === mockId)!;
    expect(before['session']).toBeNull();
    expect(before).toMatchObject({ titleEn: 'Weekend mock', questionCount: 4, durationSec: 900 });

    const started = await start(student, mockId);
    const during = ((await list(student))['mocks'] as Json[]).find((m) => m['id'] === mockId)!;
    expect(during['session']).toMatchObject({ id: started['sessionId'], status: 'active' });

    await age(started['sessionId'] as string, 5);
    await submit(student, started['sessionId'] as string, []);
    const after = ((await list(student))['mocks'] as Json[]).find((m) => m['id'] === mockId)!;
    expect(after['session']).toMatchObject({ status: 'submitted', correct: 0, wrong: 0, skipped: 4 });
  });

  it('hides mocks long past and far ahead', async () => {
    const old = await createMock({ opensIn: '-40 days', closesIn: '-30 days' });
    const future = await createMock({ opensIn: '30 days', closesIn: '32 days' });

    const ids = ((await list(await newUser()))['mocks'] as Json[]).map((m) => m['id']);
    expect(ids).not.toContain(old);
    expect(ids).not.toContain(future);
  });
});

describe('mock_leaderboard', () => {
  it('ranks by score, then time taken, and leaves flagged sessions out', async () => {
    const mockId = await createMock();
    const fast = await newUser();
    const slow = await newUser();
    const weak = await newUser();
    const cheat = await newUser();

    async function sit(student: string, correctCount: number, minutes: number): Promise<void> {
      const started = await start(student, mockId);
      const answers = questionsOf(started)
        .slice(0, correctCount)
        .map((q) => ({ qid: q.qid, chosen: keyOf(q.qid), ms: 10_000 }));
      if (minutes > 0) await age(started['sessionId'] as string, minutes);
      await submit(student, started['sessionId'] as string, answers);
    }

    await sit(fast, 3, 5);
    await sit(slow, 3, 9);
    await sit(weak, 1, 5);
    await sit(cheat, 4, 0);

    const result = await board(fast, mockId);
    const top = result['top'] as Json[];

    expect(result['total']).toBe(3);
    expect(top.map((row) => [row['rank'], Number(row['score'])])).toEqual([
      [1, 6],
      [2, 6],
      [3, 2],
    ]);
    expect(top[0]).toMatchObject({ isMe: true, name: 'Student' });
    expect(result['me']).toMatchObject({ rank: 1, isMe: true });
    expect(JSON.stringify(result)).not.toContain('@example.test');
  });

  it('returns the caller’s own rank when it is outside the top', async () => {
    const mockId = await createMock();
    const students = [await newUser(), await newUser(), await newUser()];
    for (const [index, student] of students.entries()) {
      const started = await start(student, mockId);
      const answers = questionsOf(started)
        .slice(0, 3 - index)
        .map((q) => ({ qid: q.qid, chosen: keyOf(q.qid), ms: 10_000 }));
      await age(started['sessionId'] as string, 5);
      await submit(student, started['sessionId'] as string, answers);
    }

    const result = await board(students[2]!, mockId, 1);

    expect(result['top'] as Json[]).toHaveLength(1);
    expect(result['me']).toMatchObject({ rank: 3 });
  });
});

describe('mock_review', () => {
  it('hides answers until the mock closes, then shows them with the student’s choices', async () => {
    const mockId = await createMock();
    const student = await newUser();
    const started = await start(student, mockId);
    const [q1] = questionsOf(started);
    await age(started['sessionId'] as string, 5);
    await submit(student, started['sessionId'] as string, [{ qid: q1!.qid, chosen: 3, ms: 8_000 }]);

    expect(await review(student, mockId)).toMatchObject({ ok: false, error: 'not_closed' });

    await actAsOwner(db);
    await db.query("update public.mock_tests set closes_at = now() - interval '1 minute' where id = $1", [
      mockId,
    ]);

    const items = (await review(student, mockId))['items'] as Json[];
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ qid: q1!.qid, answer: keyOf(q1!.qid), chosen: 3 });
    expect((items[0]!['en'] as Json)['explanation']).toMatch(/^Because/);
    expect(items[1]!['chosen']).toBeNull();
  });

  it('has nothing to show a student who never started', async () => {
    const mockId = await createMock({ opensIn: '-3 days', closesIn: '-1 hour' });

    expect(await review(await newUser(), mockId)).toEqual({ ok: false, error: 'no_session' });
  });
});

describe('access rules', () => {
  it('keeps the question pool and other students’ sessions out of reach', async () => {
    const mockId = await createMock();
    const owner = await newUser();
    const other = await newUser();
    await start(owner, mockId);

    await expect(asUser(db, other, () => db.query('select * from public.mock_pool'))).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === '42501',
    );

    const visible = await asUser(db, other, () => db.query('select id from public.mock_sessions'));
    expect(visible.rows).toHaveLength(0);

    await expect(
      asUser(db, other, () =>
        db.query(
          `insert into public.mock_sessions (user_id, mock_id, question_ids, deadline_at)
           values ($1, $2, '{p0}', now() + interval '1 hour')`,
          [other, mockId],
        ),
      ),
    ).rejects.toSatisfy((error: unknown) => sqlState(error) === '42501');
  });

  it.each(['list_mocks()', "start_mock('x')", "mock_leaderboard('x', 5)", "mock_review('x')"])(
    'refuses %s without a token',
    async (call) => {
      await expect(rpc(null, `select public.${call} as result`)).rejects.toSatisfy(
        (error: unknown) => sqlState(error) === '28000',
      );
    },
  );

  it('does not let the anon role start a mock', async () => {
    await expect(
      asUser(db, await newUser(), () => db.query("select public.start_mock('x')"), 'anon'),
    ).rejects.toSatisfy((error: unknown) => sqlState(error) === '42501');
  });
});
