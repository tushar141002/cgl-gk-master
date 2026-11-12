import type {
  LeaderboardResponse,
  MockAnswer,
  MockId,
  MockResult,
  MockSummary,
  OptionIndex,
} from '../../shared/contract';
import type { AppDatabase, MockSessionRow } from '../data/database';
import type { MockTransport } from '../sync/MockTransport';

/** Matches the server's `mock_submit_grace()` (D-090). */
export const MOCK_SUBMIT_GRACE_MS = 10 * 60_000;

/** A finished session row is kept this long past its grace period, then purged. */
const LOCAL_TTL_AFTER_GRACE_MS = 60 * 60_000;

export type MockErrorCode =
  /** No response; nothing changed on the server. */
  | 'offline'
  | 'unauthenticated'
  | 'not_found'
  | 'not_open'
  | 'closed'
  | 'already_submitted'
  | 'expired'
  | 'unavailable'
  | 'too_late'
  | 'failed';

const KNOWN: ReadonlySet<string> = new Set([
  'unauthenticated',
  'not_found',
  'not_open',
  'closed',
  'already_submitted',
  'expired',
  'unavailable',
  'too_late',
]);

export class MockError extends Error {
  constructor(readonly code: MockErrorCode) {
    super(`live mock: ${code}`);
    this.name = 'MockError';
  }
}

export interface MockServiceOptions {
  readonly transport: MockTransport;
  /** Phone clock; injected in tests. */
  readonly now?: () => number;
}

export interface MockList {
  readonly mocks: readonly MockSummary[];
  /** Server time minus phone time, for showing "opens in" correctly. */
  readonly clockOffsetMs: number;
}

/**
 * Live mocks on the phone (F8, D-029, D-090).
 *
 * The server draws, times and grades; this service only keeps the session
 * alive across a dropped connection or a closed app. Choices are written to
 * Dexie on every tap, a resumed mock is served from Dexie without a network,
 * and the local row is deleted only after the server has the answers.
 */
export class MockService {
  private readonly db: AppDatabase;
  private readonly transport: MockTransport;
  private readonly now: () => number;

  constructor(db: AppDatabase, options: MockServiceOptions) {
    this.db = db;
    this.transport = options.transport;
    this.now = options.now ?? Date.now;
  }

  async list(): Promise<MockList> {
    const sentAt = this.now();
    const response = await this.request(() => this.transport.list());
    if (!response.ok) throw toError(response.error);
    return { mocks: response.mocks, clockOffsetMs: response.serverTime - midpoint(sentAt, this.now()) };
  }

  /** The session on this phone for `mockId`, if it is still usable. */
  async local(mockId: MockId): Promise<MockSessionRow | null> {
    const rows = await this.db.mockSessions.where('mockId').equals(mockId).toArray();
    const live = rows.find((row) => row.expiresAt > this.now());
    return live ?? null;
  }

  /**
   * Resumes the session on this phone, or asks the server to start (or
   * resume) one. A resume needs no network, so a test survives going offline.
   */
  async start(mockId: MockId): Promise<MockSessionRow> {
    const existing = await this.local(mockId);
    if (existing !== null) return existing;

    const sentAt = this.now();
    const response = await this.request(() => this.transport.start(mockId));
    if (!response.ok) throw toError(response.error);

    const offset = response.serverTime - midpoint(sentAt, this.now());
    const row: MockSessionRow = {
      sessionId: response.sessionId,
      mockId: response.mockId,
      questions: response.questions,
      startedAt: response.startedAt,
      deadlineAt: response.deadlineAt,
      clockOffsetMs: offset,
      answers: {},
      current: 0,
      expiresAt: response.deadlineAt - offset + MOCK_SUBMIT_GRACE_MS + LOCAL_TTL_AFTER_GRACE_MS,
    };
    await this.db.mockSessions.put(row);
    return row;
  }

  /** Milliseconds left on the server's clock; never negative. */
  remainingMs(session: MockSessionRow): number {
    return Math.max(0, session.deadlineAt - (this.now() + session.clockOffsetMs));
  }

  /**
   * Records a choice (or a cleared choice) and the time spent, on every tap.
   * Time on a question adds up across visits.
   */
  async record(
    sessionId: string,
    qid: string,
    chosen: OptionIndex | null,
    spentMs: number,
    current: number,
  ): Promise<MockSessionRow> {
    return this.db.transaction('rw', this.db.mockSessions, async () => {
      const row = await this.db.mockSessions.get(sessionId);
      if (row === undefined) throw new MockError('not_found');
      const previous = row.answers[qid];
      const next: MockSessionRow = {
        ...row,
        answers: { ...row.answers, [qid]: { chosen, ms: (previous?.ms ?? 0) + Math.max(0, spentMs) } },
        current,
      };
      await this.db.mockSessions.put(next);
      return next;
    });
  }

  /** Moves between questions without changing a choice. */
  async moveTo(sessionId: string, current: number, qid: string, spentMs: number): Promise<MockSessionRow> {
    const row = await this.db.mockSessions.get(sessionId);
    if (row === undefined) throw new MockError('not_found');
    return this.record(sessionId, qid, row.answers[qid]?.chosen ?? null, spentMs, current);
  }

  /**
   * Sends every answer. The local row is deleted only when the server has
   * graded it (or will never accept it), so an offline submit can be retried.
   */
  async submit(sessionId: string): Promise<MockResult> {
    const row = await this.db.mockSessions.get(sessionId);
    if (row === undefined) throw new MockError('not_found');

    const answers: MockAnswer[] = Object.entries(row.answers).map(([qid, answer]) => ({
      qid,
      chosen: answer.chosen,
      ms: Math.round(answer.ms),
    }));

    const response = await this.request(() => this.transport.submit(sessionId, answers));
    if (response.ok) {
      await this.db.mockSessions.delete(sessionId);
      return response;
    }
    if (response.error === 'too_late' || response.error === 'not_found') {
      await this.db.mockSessions.delete(sessionId);
    }
    throw toError(response.error);
  }

  async leaderboard(mockId: MockId, limit = 20): Promise<Extract<LeaderboardResponse, { ok: true }>> {
    const response = await this.request(() => this.transport.leaderboard(mockId, limit));
    if (!response.ok) throw toError(response.error);
    return response;
  }

  /** Deletes sessions that can no longer be submitted. */
  async purgeExpired(): Promise<number> {
    return this.db.mockSessions.where('expiresAt').belowOrEqual(this.now()).delete();
  }

  private async request<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      console.warn('live mock request did not reach the server', error);
      throw new MockError('offline');
    }
  }
}

function toError(code: string): MockError {
  return new MockError(KNOWN.has(code) ? (code as MockErrorCode) : 'failed');
}

/** The request's midpoint is the best guess for when the server read its clock. */
function midpoint(sentAt: number, receivedAt: number): number {
  return Math.round((sentAt + receivedAt) / 2);
}
