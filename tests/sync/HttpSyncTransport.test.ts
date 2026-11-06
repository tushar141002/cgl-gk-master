import { describe, expect, it } from 'vitest';
import type { SyncBatch, SyncResponse } from '../../shared/contract';
import { HttpSyncTransport } from '../../src/sync/SyncTransport';

const URL = 'https://project.test/functions/v1/sync';

const BATCH: SyncBatch = {
  batchId: 'batch-1',
  deviceId: 'device-1',
  cursor: null,
  attempts: [],
  reports: [],
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

describe('HttpSyncTransport (F4, D-069)', () => {
  it('posts the batch with a bearer token and returns the parsed response', async () => {
    const body: SyncResponse = { ok: true, serverTime: 1_700_000_000_000, newCursor: null, corrections: [] };
    const { fetch, calls } = fakeFetch(async () => json(body));

    const transport = new HttpSyncTransport({
      url: URL,
      getAccessToken: () => 'token-1',
      fetch,
    });

    expect(await transport.send(BATCH)).toEqual(body);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(URL);
    expect(calls[0]!.init.method).toBe('POST');
    expect(new Headers(calls[0]!.init.headers).get('authorization')).toBe('Bearer token-1');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(BATCH);
  });

  it('does not send a batch without a token', async () => {
    const { fetch, calls } = fakeFetch(async () => json({}));

    for (const token of [null, '']) {
      const transport = new HttpSyncTransport({ url: URL, getAccessToken: () => token, fetch });
      expect(await transport.send(BATCH)).toEqual({ ok: false, error: 'unauthenticated' });
    }

    expect(calls).toHaveLength(0);
  });

  it('passes a server error body through, including retryAfterMs', async () => {
    const { fetch } = fakeFetch(async () => json({ ok: false, error: 'timeout', retryAfterMs: 2_000 }, 503));

    const transport = new HttpSyncTransport({ url: URL, getAccessToken: () => 'token', fetch });

    expect(await transport.send(BATCH)).toEqual({
      ok: false,
      error: 'timeout',
      retryAfterMs: 2_000,
    });
  });

  it('maps a non-JSON failure to sync_failed', async () => {
    const { fetch } = fakeFetch(async () => new Response('<html>bad gateway</html>', { status: 502 }));

    const transport = new HttpSyncTransport({ url: URL, getAccessToken: () => 'token', fetch });

    expect(await transport.send(BATCH)).toEqual({ ok: false, error: 'sync_failed' });
  });

  it('maps a bare 401 to unauthenticated', async () => {
    const { fetch } = fakeFetch(async () => new Response('', { status: 401 }));

    const transport = new HttpSyncTransport({ url: URL, getAccessToken: () => 'token', fetch });

    expect(await transport.send(BATCH)).toEqual({ ok: false, error: 'unauthenticated' });
  });

  it('rejects a body with the wrong shape', async () => {
    const { fetch } = fakeFetch(async () => json({ ok: true, newCursor: null }));

    const transport = new HttpSyncTransport({ url: URL, getAccessToken: () => 'token', fetch });

    expect(await transport.send(BATCH)).toEqual({ ok: false, error: 'sync_failed' });
  });

  it('requires a url', () => {
    expect(() => new HttpSyncTransport({ url: '', getAccessToken: () => null })).toThrow(RangeError);
  });
});
