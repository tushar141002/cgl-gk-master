import { describe, expect, it } from 'vitest';
import { AuthError, GoTrueClient } from '../../src/auth/GoTrueClient';

const NOW = 1_700_000_000_000;
const URL = 'https://project.test';
const KEY = 'anon-key';

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

function tokenBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_at: 1_700_003_600,
    user: { id: 'user-1', email: 'student@example.com' },
    ...overrides,
  };
}

function client(http: typeof fetch, now = () => NOW): GoTrueClient {
  return new GoTrueClient({
    supabaseUrl: URL,
    anonKey: KEY,
    fetch: http,
    now,
  });
}

describe('GoTrue client (D-073)', () => {
  it('exchanges a PKCE code and turns expires_at seconds into milliseconds', async () => {
    const { fetch, calls } = fakeFetch(async () => json(tokenBody()));

    const session = await client(fetch).exchangeCode('code-1', 'verifier-1');

    expect(session).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: 1_700_003_600_000,
      userId: 'user-1',
      email: 'student@example.com',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${URL}/auth/v1/token?grant_type=pkce`);
    expect(calls[0]!.init.method).toBe('POST');
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get('apikey')).toBe(KEY);
    expect(headers.get('content-type')).toContain('application/json');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      auth_code: 'code-1',
      code_verifier: 'verifier-1',
    });
  });

  it('refreshes with the refresh token and falls back to expires_in', async () => {
    const { fetch, calls } = fakeFetch(async () =>
      json(tokenBody({ expires_at: undefined, expires_in: 3_600 })),
    );

    const session = await client(fetch).refresh('refresh-old');

    expect(session.refreshToken).toBe('refresh-1');
    expect(session.expiresAt).toBe(NOW + 3_600_000);
    expect(calls[0]!.url).toBe(`${URL}/auth/v1/token?grant_type=refresh_token`);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ refresh_token: 'refresh-old' });
  });

  it('maps a rejected grant to invalid_grant', async () => {
    const { fetch } = fakeFetch(async () =>
      json({ error: 'invalid_grant', error_description: 'code expired' }, 400),
    );

    await expect(client(fetch).exchangeCode('code', 'verifier')).rejects.toMatchObject({
      name: 'AuthError',
      code: 'invalid_grant',
      status: 400,
      message: 'code expired',
    });
  });

  it('maps 429 and 5xx to a retryable server error', async () => {
    for (const status of [429, 500, 503]) {
      const { fetch } = fakeFetch(async () => json({ msg: 'busy' }, status));
      await expect(client(fetch).refresh('refresh')).rejects.toMatchObject({
        code: 'server',
        status,
      });
    }
  });

  it('maps a missing response to network', async () => {
    const { fetch } = fakeFetch(async () => {
      throw new Error('offline');
    });

    await expect(client(fetch).refresh('refresh')).rejects.toMatchObject({ code: 'network' });
  });

  it('rejects a body without tokens or a user', async () => {
    for (const body of [
      {},
      { access_token: 'a', refresh_token: 'r' },
      { access_token: 'a', refresh_token: 'r', user: {} },
      { refresh_token: 'r', user: { id: 'u' } },
    ]) {
      const { fetch } = fakeFetch(async () => json(body));
      await expect(client(fetch).refresh('refresh')).rejects.toMatchObject({
        code: 'invalid_response',
      });
    }
  });

  it('rejects a body without an expiry', async () => {
    const { fetch } = fakeFetch(async () =>
      json({ access_token: 'a', refresh_token: 'r', user: { id: 'u' } }),
    );

    await expect(client(fetch).refresh('refresh')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('signs out best-effort and never throws', async () => {
    const { fetch, calls } = fakeFetch(async () => {
      throw new Error('offline');
    });

    await expect(client(fetch).logout('access-1')).resolves.toBeUndefined();
    expect(calls[0]!.url).toBe(`${URL}/auth/v1/logout`);
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('Bearer access-1');
  });

  it('exposes the error code and status on AuthError', () => {
    const error = new AuthError('invalid_request', 'bad', 418);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AuthError');
    expect(error.code).toBe('invalid_request');
    expect(error.status).toBe(418);
  });
});
