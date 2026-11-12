import { describe, expect, it } from 'vitest';
import { HttpMockTransport } from '../../src/sync/MockTransport';

const BASE = 'https://project.test';

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(handler: (url: string) => Response): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchLike = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url));
  };
  return { fetch: fetchLike as unknown as typeof fetch, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function transport(fetchLike: typeof fetch, token: string | null = 'token-1'): HttpMockTransport {
  return new HttpMockTransport({
    supabaseUrl: `${BASE}/`,
    anonKey: 'anon',
    getAccessToken: () => token,
    fetch: fetchLike,
  });
}

const QUESTION = { qid: 'p1', qv: 1, en: { q: 'Q', options: ['a', 'b', 'c', 'd'] }, hi: null };

describe('HttpMockTransport', () => {
  it('calls each RPC with its named arguments and auth headers', async () => {
    const { fetch, calls } = fakeFetch(() => json({ ok: false, error: 'closed' }));
    const mocks = transport(fetch);

    await mocks.start('mock-1');
    await mocks.submit('s-1', [{ qid: 'p1', chosen: 2, ms: 900 }]);
    await mocks.leaderboard('mock-1', 10);

    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/rest/v1/rpc/start_mock`,
      `${BASE}/rest/v1/rpc/submit_mock`,
      `${BASE}/rest/v1/rpc/mock_leaderboard`,
    ]);
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({
      p_session_id: 's-1',
      p_answers: [{ qid: 'p1', chosen: 2, ms: 900 }],
    });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['apikey']).toBe('anon');
    expect(headers['authorization']).toBe('Bearer token-1');
  });

  it('passes a well-formed start through', async () => {
    const body = {
      ok: true,
      serverTime: 1,
      sessionId: 's-1',
      mockId: 'mock-1',
      startedAt: 1,
      deadlineAt: 900_001,
      questions: [QUESTION],
    };
    const { fetch } = fakeFetch(() => json(body));

    await expect(transport(fetch).start('mock-1')).resolves.toEqual(body);
  });

  it('passes a server refusal through with its code', async () => {
    const { fetch } = fakeFetch(() => json({ ok: false, error: 'already_submitted' }));

    await expect(transport(fetch).start('mock-1')).resolves.toEqual({
      ok: false,
      error: 'already_submitted',
    });
  });

  it.each([
    [
      'a question with three options',
      () =>
        json({
          ok: true,
          serverTime: 1,
          sessionId: 's',
          deadlineAt: 2,
          questions: [{ ...QUESTION, en: { q: 'Q', options: ['a', 'b', 'c'] } }],
        }),
    ],
    ['a PostgREST error body', () => json({ code: '22023', message: 'bad' }, 400)],
    ['a non-JSON body', () => new Response('<html>', { status: 502 })],
  ])('treats %s as mock_failed', async (_label, respond) => {
    const { fetch } = fakeFetch(respond);

    await expect(transport(fetch).start('mock-1')).resolves.toEqual({ ok: false, error: 'mock_failed' });
  });

  it('maps a 401 and a missing token to unauthenticated', async () => {
    const expired = fakeFetch(() => json({ message: 'JWT expired' }, 401));
    await expect(transport(expired.fetch).list()).resolves.toEqual({ ok: false, error: 'unauthenticated' });

    const guest = fakeFetch(() => json({ ok: true }));
    await expect(transport(guest.fetch, null).list()).resolves.toEqual({
      ok: false,
      error: 'unauthenticated',
    });
    expect(guest.calls).toHaveLength(0);
  });

  it('rejects a submit result that is missing a number', async () => {
    const { fetch } = fakeFetch(() =>
      json({ ok: true, score: 1, maxScore: 2, correct: 1, wrong: 0, skipped: 0 }),
    );

    await expect(transport(fetch).submit('s-1', [])).resolves.toEqual({ ok: false, error: 'mock_failed' });
  });
});
