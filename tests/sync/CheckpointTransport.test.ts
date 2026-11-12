import { describe, expect, it } from 'vitest';
import { HttpCheckpointTransport } from '../../src/sync/CheckpointTransport';

function fakeFetch(respond: () => Response): { fetch: typeof fetch; urls: string[]; bodies: unknown[] } {
  const urls: string[] = [];
  const bodies: unknown[] = [];
  const fetchLike = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    urls.push(String(url));
    bodies.push(JSON.parse(String(init?.body ?? '{}')));
    return respond();
  };
  return { fetch: fetchLike as unknown as typeof fetch, urls, bodies };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function transport(fetchLike: typeof fetch, token: string | null = 't'): HttpCheckpointTransport {
  return new HttpCheckpointTransport({
    supabaseUrl: 'https://p.test',
    anonKey: 'anon',
    getAccessToken: () => token,
    fetch: fetchLike,
  });
}

const CHECKPOINT = { cursor: '100:a', cardStates: [], skills: [], istDailyTotals: [] };

describe('HttpCheckpointTransport', () => {
  it('uploads to put_checkpoint and passes a refusal code through', async () => {
    const accepted = fakeFetch(() => json({ ok: true, cursor: '100:a' }));
    await expect(transport(accepted.fetch).put(CHECKPOINT)).resolves.toEqual({ ok: true });
    expect(accepted.urls).toEqual(['https://p.test/rest/v1/rpc/put_checkpoint']);
    expect(accepted.bodies[0]).toEqual({ p_checkpoint: CHECKPOINT });

    const stale = fakeFetch(() => json({ ok: false, error: 'stale' }));
    await expect(transport(stale.fetch).put(CHECKPOINT)).resolves.toEqual({ ok: false, error: 'stale' });
  });

  it('returns the latest checkpoint, null, or a failure for a bad shape', async () => {
    const full = { ...CHECKPOINT, createdAt: '2026-11-14T00:00:00.000Z' };
    await expect(
      transport(fakeFetch(() => json({ ok: true, checkpoint: full })).fetch).latest(),
    ).resolves.toEqual({
      ok: true,
      checkpoint: full,
    });
    await expect(
      transport(fakeFetch(() => json({ ok: true, checkpoint: null })).fetch).latest(),
    ).resolves.toEqual({
      ok: true,
      checkpoint: null,
    });
    await expect(
      transport(fakeFetch(() => json({ ok: true, checkpoint: { cursor: 'bad' } })).fetch).latest(),
    ).resolves.toEqual({ ok: false, error: 'checkpoint_failed' });
  });

  it('sends nothing without a token and maps a 401', async () => {
    const guest = fakeFetch(() => json({ ok: true }));
    await expect(transport(guest.fetch, null).latest()).resolves.toEqual({
      ok: false,
      error: 'unauthenticated',
    });
    expect(guest.urls).toHaveLength(0);

    const expired = fakeFetch(() => json({ message: 'JWT expired' }, 401));
    await expect(transport(expired.fetch).put(CHECKPOINT)).resolves.toEqual({
      ok: false,
      error: 'unauthenticated',
    });
  });
});
