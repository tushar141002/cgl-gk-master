import type {
  LeaderboardResponse,
  MockAnswer,
  MockId,
  MockListResponse,
  StartMockResponse,
  SubmitMockResponse,
} from '../../shared/contract';

/**
 * How `MockService` reaches the live-mock RPCs (F8, D-090).
 *
 * Contract mirrors the sync transports: a method rejects only when no HTTP
 * response arrived. Every response becomes `{ ok: true, ... }` or
 * `{ ok: false, error }`; a 401 is `unauthenticated` and a body that is not the
 * RPC's shape is `mock_failed`, so the screen never shows a half-parsed result.
 */
export interface MockTransport {
  list(): Promise<MockListResponse>;
  start(mockId: MockId): Promise<StartMockResponse>;
  submit(sessionId: string, answers: readonly MockAnswer[]): Promise<SubmitMockResponse>;
  leaderboard(mockId: MockId, limit: number): Promise<LeaderboardResponse>;
}

export interface HttpMockTransportOptions {
  /** `https://<ref>.supabase.co`; each RPC is under `/rest/v1/rpc/<name>`. */
  readonly supabaseUrl: string;
  /** Public anon key; PostgREST requires it even with a bearer token. */
  readonly anonKey: string;
  readonly getAccessToken: () => Promise<string | null> | string | null;
  /** Injected in tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

type Body = Record<string, unknown>;

export class HttpMockTransport implements MockTransport {
  private readonly base: string;
  private readonly anonKey: string;
  private readonly getAccessToken: () => Promise<string | null> | string | null;
  private readonly http: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpMockTransportOptions) {
    if (options.supabaseUrl.length === 0) throw new RangeError('supabase url must not be empty');
    this.base = `${options.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc`;
    this.anonKey = options.anonKey;
    this.getAccessToken = options.getAccessToken;
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async list(): Promise<MockListResponse> {
    const body = await this.call('list_mocks', {});
    if (body['ok'] !== true) return failure(body);
    if (typeof body['serverTime'] !== 'number' || !Array.isArray(body['mocks'])) return MALFORMED;
    return body as unknown as MockListResponse;
  }

  async start(mockId: MockId): Promise<StartMockResponse> {
    const body = await this.call('start_mock', { p_mock_id: mockId });
    if (body['ok'] !== true) return failure(body);
    const ok =
      typeof body['sessionId'] === 'string' &&
      typeof body['deadlineAt'] === 'number' &&
      typeof body['serverTime'] === 'number' &&
      Array.isArray(body['questions']) &&
      (body['questions'] as unknown[]).every(isMockQuestion);
    return ok ? (body as unknown as StartMockResponse) : MALFORMED;
  }

  async submit(sessionId: string, answers: readonly MockAnswer[]): Promise<SubmitMockResponse> {
    const body = await this.call('submit_mock', { p_session_id: sessionId, p_answers: answers });
    if (body['ok'] !== true) return failure(body);
    const numbers = ['score', 'maxScore', 'correct', 'wrong', 'skipped', 'timeMs'];
    return numbers.every((key) => typeof body[key] === 'number')
      ? (body as unknown as SubmitMockResponse)
      : MALFORMED;
  }

  async leaderboard(mockId: MockId, limit: number): Promise<LeaderboardResponse> {
    const body = await this.call('mock_leaderboard', { p_mock_id: mockId, p_limit: limit });
    if (body['ok'] !== true) return failure(body);
    return typeof body['total'] === 'number' && Array.isArray(body['top'])
      ? (body as unknown as LeaderboardResponse)
      : MALFORMED;
  }

  /** POSTs one RPC; returns the parsed body or a synthetic failure body. */
  private async call(name: string, args: Body): Promise<Body> {
    const token = await this.getAccessToken();
    if (token === null || token === '') return { ok: false, error: 'unauthenticated' };

    const response = await this.http(`${this.base}/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        apikey: this.anonKey,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 401) return { ok: false, error: 'unauthenticated' };

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      return { ok: false, error: 'mock_failed' };
    }
    if (!response.ok || typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, error: 'mock_failed' };
    }
    return value as Body;
  }
}

const MALFORMED = { ok: false, error: 'mock_failed' } as const;

function failure(body: Body): { readonly ok: false; readonly error: string } {
  const error = body['error'];
  return body['ok'] === false && typeof error === 'string' && error.length > 0
    ? { ok: false, error }
    : MALFORMED;
}

function isMockQuestion(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Body;
  const en = record['en'] as Body | undefined;
  return (
    typeof record['qid'] === 'string' &&
    typeof record['qv'] === 'number' &&
    typeof en === 'object' &&
    en !== null &&
    typeof en['q'] === 'string' &&
    Array.isArray(en['options']) &&
    (en['options'] as unknown[]).length === 4
  );
}
