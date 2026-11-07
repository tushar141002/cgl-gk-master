import { describe, expect, it } from 'vitest';
import { MAX_PULL_ATTEMPTS, type AttemptRecord, type PullResponse } from '../../shared/contract';
import { HttpPullTransport } from '../../src/sync/SyncTransport';

const URL = 'https://project.test/rest/v1/rpc/sync_pull';
const KEY = 'anon-key';

const ATTEMPT: AttemptRecord = {
  id: 'a-1',
  qid: 'q-1',
  qv: 1,
  chosen: 2,
  correct: false,
  ms: 4_200,
  mode: 'practice',
  at: 1_700_000_000_000,
  deviceId: 'device-1',
};

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(handler: (url: string, init: RequestInit) => Promise<Response>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchLike = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return handler(call.url, call.init);
  };
  return { fetch: fetchLike as unknown as typeof fetch, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function page(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    serverTime: 1_700_000_100_000,
    attempts: [ATTEMPT],
    nextCursor: '1700000000000:a-1',
    hasMore: false,
    ...overrides,
  };
}

describe('HttpPullTransport (F7, D-074)', () => {
  it('posts the page request with both keys and returns the parsed page', async () => {
    const body = page();
    const { fetch, calls } = fakeFetch(async () => json(body));

    const transport = new HttpPullTransport({
      url: URL,
      anonKey: KEY,
      getAccessToken: () => 'token-1',
      fetch,
    });

    expect(await transport.pull(null, 200)).toEqual(body);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL);
    expect(calls[0]!.init.method).toBe('POST');

    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('apikey')).toBe(KEY);
    expect(headers.get('authorization')).toBe('Bearer token-1');
    expect(headers.get('content-type')).toContain('application/json');

    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ p_after: null, p_limit: 200 });
  });

  it('passes the stored cursor as p_after', async () => {
    const { fetch, calls } = fakeFetch(async () => json(page()));
    const transport = new HttpPullTransport({
      url: URL,
      anonKey: KEY,
      getAccessToken: async () => 'token-1',
      fetch,
    });

    await transport.pull('1700000000000:a-1', 50);

    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      p_after: '1700000000000:a-1',
      p_limit: 50,
    });
  });

  it('does not send a page without a token', async () => {
    const { fetch, calls } = fakeFetch(async () => json(page()));

    for (const token of [null, '']) {
      const transport = new HttpPullTransport({
        url: URL,
        anonKey: KEY,
        getAccessToken: () => token,
        fetch,
      });
      expect(await transport.pull(null, 200)).toEqual({ ok: false, error: 'unauthenticated' });
    }

    expect(calls).toHaveLength(0);
  });

  it('passes a server error body through, including retryAfterMs', async () => {
    const { fetch } = fakeFetch(async () => json({ ok: false, error: 'timeout', retryAfterMs: 2_000 }, 503));
    const transport = new HttpPullTransport({
      url: URL,
      anonKey: KEY,
      getAccessToken: () => 'token',
      fetch,
    });

    expect(await transport.pull(null, 200)).toEqual({
      ok: false,
      error: 'timeout',
      retryAfterMs: 2_000,
    });
  });

  it('maps a bare 401 to unauthenticated', async () => {
    const { fetch } = fakeFetch(async () => new Response('', { status: 401 }));
    const transport = new HttpPullTransport({
      url: URL,
      anonKey: KEY,
      getAccessToken: () => 'token',
      fetch,
    });

    expect(await transport.pull(null, 200)).toEqual({ ok: false, error: 'unauthenticated' });
  });

  it('maps a non-JSON response to sync_failed', async () => {
    const { fetch } = fakeFetch(async () => new Response('<html>bad gateway</html>', { status: 502 }));
    const transport = new HttpPullTransport({
      url: URL,
      anonKey: KEY,
      getAccessToken: () => 'token',
      fetch,
    });

    expect(await transport.pull(null, 200)).toEqual({ ok: false, error: 'sync_failed' });
  });

  it('rejects a page with the wrong shape', async () => {
    const bodies: unknown[] = [
      {},
      { ok: true, attempts: [] },
      { ok: true, serverTime: 1, attempts: [], nextCursor: null },
      page({ nextCursor: 7 }),
      page({ hasMore: 'no' }),
      page({ attempts: {} }),
    ];

    for (const body of bodies) {
      const { fetch } = fakeFetch(async () => json(body));
      const transport = new HttpPullTransport({
        url: URL,
        anonKey: KEY,
        getAccessToken: () => 'token',
        fetch,
      });
      expect(await transport.pull(null, 200)).toEqual({ ok: false, error: 'sync_failed' });
    }
  });

  it('rejects a page containing a malformed attempt', async () => {
    const broken = [
      { ...ATTEMPT, id: '' },
      { ...ATTEMPT, qid: '' },
      { ...ATTEMPT, qv: 0 },
      { ...ATTEMPT, chosen: 4 },
      { ...ATTEMPT, correct: 'yes' },
      { ...ATTEMPT, ms: -1 },
      { ...ATTEMPT, at: 'now' },
      { ...ATTEMPT, deviceId: '' },
      { ...ATTEMPT, mockId: 7 },
    ];

    for (const attempt of broken) {
      const { fetch } = fakeFetch(async () => json(page({ attempts: [attempt] })));
      const transport = new HttpPullTransport({
        url: URL,
        anonKey: KEY,
        getAccessToken: () => 'token',
        fetch,
      });
      expect(await transport.pull(null, 200)).toEqual({ ok: false, error: 'sync_failed' });
    }
  });

  it('keeps a skip and a mock attempt intact', async () => {
    const skip: AttemptRecord = { ...ATTEMPT, id: 'a-skip', chosen: null, correct: false };
    const mock: AttemptRecord = { ...ATTEMPT, id: 'a-mock', mode: 'mock', mockId: 'mock-1' };
    const body: PullResponse = {
      ok: true,
      serverTime: 1_700_000_100_000,
      attempts: [skip, mock],
      nextCursor: 'c2',
      hasMore: true,
    };
    const { fetch } = fakeFetch(async () => json(body));
    const transport = new HttpPullTransport({
      url: URL,
      anonKey: KEY,
      getAccessToken: () => 'token',
      fetch,
    });

    expect(await transport.pull(null, 2)).toEqual(body);
  });

  it('rejects a limit outside 1..MAX_PULL_ATTEMPTS', async () => {
    const { fetch, calls } = fakeFetch(async () => json(page()));
    const transport = new HttpPullTransport({
      url: URL,
      anonKey: KEY,
      getAccessToken: () => 'token',
      fetch,
    });

    for (const limit of [0, -1, MAX_PULL_ATTEMPTS + 1, 1.5]) {
      await expect(transport.pull(null, limit)).rejects.toThrow(RangeError);
    }
    expect(calls).toHaveLength(0);
  });

  it('requires a url', () => {
    expect(() => new HttpPullTransport({ url: '', anonKey: KEY, getAccessToken: () => null })).toThrow(
      RangeError,
    );
  });
});
