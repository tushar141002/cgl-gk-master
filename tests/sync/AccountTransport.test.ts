import { describe, expect, it } from 'vitest';
import { HttpAccountTransport } from '../../src/sync/AccountTransport';

const URL = 'https://project.test/rest/v1/rpc/delete_user';
const KEY = 'anon-key';

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(handler: () => Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchLike = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler();
  };
  return { fetch: fetchLike as unknown as typeof fetch, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function transport(fetchLike: typeof fetch, token: string | null = 'token-1'): HttpAccountTransport {
  return new HttpAccountTransport({ url: URL, anonKey: KEY, getAccessToken: () => token, fetch: fetchLike });
}

describe('HttpAccountTransport', () => {
  it('posts to the RPC with the anon key and bearer token', async () => {
    const { fetch, calls } = fakeFetch(async () => json({ ok: true }));

    await expect(transport(fetch).deleteAccount()).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL);
    expect(calls[0]!.init.method).toBe('POST');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['apikey']).toBe(KEY);
    expect(headers['authorization']).toBe('Bearer token-1');
  });

  it('does not send a request without a token', async () => {
    const { fetch, calls } = fakeFetch(async () => json({ ok: true }));

    await expect(transport(fetch, null).deleteAccount()).resolves.toEqual({
      ok: false,
      error: 'unauthenticated',
    });
    expect(calls).toHaveLength(0);
  });

  it('maps a 401 to unauthenticated', async () => {
    const { fetch } = fakeFetch(async () => json({ message: 'JWT expired' }, 401));

    await expect(transport(fetch).deleteAccount()).resolves.toEqual({ ok: false, error: 'unauthenticated' });
  });

  it.each([
    ['a server error', () => json({ code: 'P0001', message: 'boom' }, 500)],
    ['a body without ok', () => json({ deleted: true })],
    ['a non-JSON body', () => new Response('<html>', { status: 502 })],
    ['ok: true on an error status', () => json({ ok: true }, 500)],
  ])('treats %s as a failure, never as confirmation', async (_label, respond) => {
    const { fetch } = fakeFetch(async () => respond());

    await expect(transport(fetch).deleteAccount()).resolves.toEqual({ ok: false, error: 'delete_failed' });
  });

  it('rejects when no response arrives', async () => {
    const { fetch } = fakeFetch(async () => {
      throw new TypeError('network down');
    });

    await expect(transport(fetch).deleteAccount()).rejects.toThrow('network down');
  });
});
