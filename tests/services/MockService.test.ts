import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  LeaderboardResponse,
  MockAnswer,
  MockListResponse,
  MockQuestion,
  StartMockResponse,
  SubmitMockResponse,
} from '../../shared/contract';
import { openDatabase, type AppDatabase } from '../../src/data/database';
import { MOCK_SUBMIT_GRACE_MS, MockError, MockService } from '../../src/services/MockService';
import type { MockTransport } from '../../src/sync/MockTransport';

let db: AppDatabase;
let clock: number;

beforeEach(async () => {
  db = await openDatabase(`cgl-test-${crypto.randomUUID()}`);
  clock = 1_800_000_000_000;
});

afterEach(async () => {
  await db.delete();
});

const QUESTIONS: MockQuestion[] = [0, 1, 2].map((n) => ({
  qid: `p${n}`,
  qv: 1,
  en: { q: `Q${n}`, options: ['a', 'b', 'c', 'd'] },
  hi: null,
}));

/** The phone clock runs 5 s behind the server in these tests. */
const SKEW = 5_000;

class FakeTransport implements MockTransport {
  startCalls = 0;
  submitted: MockAnswer[][] = [];
  startReply: () => StartMockResponse = () => ({
    ok: true,
    serverTime: clock + SKEW,
    sessionId: 'session-1',
    mockId: 'mock-1',
    startedAt: clock + SKEW,
    deadlineAt: clock + SKEW + 900_000,
    questions: QUESTIONS,
  });
  submitReply: () => SubmitMockResponse = () => ({
    ok: true,
    sessionId: 'session-1',
    mockId: 'mock-1',
    score: 3.5,
    maxScore: 6,
    correct: 2,
    wrong: 1,
    skipped: 0,
    timeMs: 600_000,
  });

  async list(): Promise<MockListResponse> {
    return { ok: true, serverTime: clock + SKEW, mocks: [] };
  }
  async start(): Promise<StartMockResponse> {
    this.startCalls += 1;
    return this.startReply();
  }
  async submit(_sessionId: string, answers: readonly MockAnswer[]): Promise<SubmitMockResponse> {
    this.submitted.push([...answers]);
    return this.submitReply();
  }
  async leaderboard(): Promise<LeaderboardResponse> {
    return { ok: true, total: 0, top: [], me: null };
  }
}

function service(transport: MockTransport): MockService {
  return new MockService(db, { transport, now: () => clock });
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof MockError) return error.code;
    throw error;
  }
}

describe('MockService', () => {
  it('starts a session, stores it and runs the timer on server time', async () => {
    const transport = new FakeTransport();
    const mocks = service(transport);

    const session = await mocks.start('mock-1');

    expect(session.questions).toHaveLength(3);
    expect(session.clockOffsetMs).toBe(SKEW);
    expect(mocks.remainingMs(session)).toBe(900_000);
    clock += 60_000;
    expect(mocks.remainingMs(session)).toBe(840_000);
    expect(await db.mockSessions.count()).toBe(1);
  });

  it('resumes from the phone without asking the server again', async () => {
    const transport = new FakeTransport();
    const mocks = service(transport);
    await mocks.start('mock-1');
    await mocks.record('session-1', 'p0', 2, 4_000, 1);

    const resumed = await mocks.start('mock-1');

    expect(transport.startCalls).toBe(1);
    expect(resumed.answers['p0']).toEqual({ chosen: 2, ms: 4_000 });
    expect(resumed.current).toBe(1);
  });

  it('adds up time across visits and lets a choice be changed or cleared', async () => {
    const mocks = service(new FakeTransport());
    await mocks.start('mock-1');

    await mocks.record('session-1', 'p0', 1, 3_000, 0);
    await mocks.moveTo('session-1', 1, 'p0', 2_000);
    const cleared = await mocks.record('session-1', 'p0', null, 1_000, 0);

    expect(cleared.answers['p0']).toEqual({ chosen: null, ms: 6_000 });
  });

  it('submits every recorded answer and deletes the local session on success', async () => {
    const transport = new FakeTransport();
    const mocks = service(transport);
    await mocks.start('mock-1');
    await mocks.record('session-1', 'p0', 0, 1_234.6, 0);
    await mocks.record('session-1', 'p1', 3, 2_000, 1);

    const result = await mocks.submit('session-1');

    expect(result.score).toBe(3.5);
    expect(transport.submitted[0]).toEqual([
      { qid: 'p0', chosen: 0, ms: 1_235 },
      { qid: 'p1', chosen: 3, ms: 2_000 },
    ]);
    expect(await db.mockSessions.count()).toBe(0);
  });

  it('keeps the answers when the submit does not reach the server', async () => {
    const transport = new FakeTransport();
    transport.submitReply = () => {
      throw new TypeError('network down');
    };
    const mocks = service(transport);
    await mocks.start('mock-1');
    await mocks.record('session-1', 'p0', 0, 1_000, 0);

    expect(await codeOf(mocks.submit('session-1'))).toBe('offline');
    expect((await db.mockSessions.get('session-1'))?.answers['p0']).toEqual({ chosen: 0, ms: 1_000 });
  });

  it('drops the local session when the server says it is too late', async () => {
    const transport = new FakeTransport();
    transport.submitReply = () => ({ ok: false, error: 'too_late' });
    const mocks = service(transport);
    await mocks.start('mock-1');

    expect(await codeOf(mocks.submit('session-1'))).toBe('too_late');
    expect(await db.mockSessions.count()).toBe(0);
  });

  it.each([
    ['closed', 'closed'],
    ['already_submitted', 'already_submitted'],
    ['unauthenticated', 'unauthenticated'],
    ['something_new', 'failed'],
  ])('maps a start refusal of %s to %s and stores nothing', async (error, code) => {
    const transport = new FakeTransport();
    transport.startReply = () => ({ ok: false, error });

    expect(await codeOf(service(transport).start('mock-1'))).toBe(code);
    expect(await db.mockSessions.count()).toBe(0);
  });

  it('purges sessions that can no longer be submitted', async () => {
    const mocks = service(new FakeTransport());
    await mocks.start('mock-1');

    clock += 900_000 + MOCK_SUBMIT_GRACE_MS;
    expect(await mocks.local('mock-1')).not.toBeNull();

    clock += 2 * 60 * 60_000;
    expect(await mocks.local('mock-1')).toBeNull();
    expect(await mocks.purgeExpired()).toBe(1);
  });

  it('reports the server clock offset with the mock list', async () => {
    const list = await service(new FakeTransport()).list();

    expect(list.clockOffsetMs).toBe(SKEW);
  });
});
