import type { QuestionCorrection, SyncBatch, SyncResponse } from '../../shared/contract';

/**
 * How `SyncManager` reaches the server (F4, D-069).
 *
 * The interface is the seam that keeps the retry logic testable: a fake
 * implementation can throw, return a stored response or answer with a retry
 * hint without a network, and Step 7C supplies the token.
 *
 * Contract: `send` rejects only when no HTTP response arrived at all. Any
 * response — including a 4xx — is returned as a `SyncResponse`, because the
 * Edge Function answers with the same body shape for failures.
 */
export interface SyncTransport {
  send(batch: SyncBatch): Promise<SyncResponse>;
}

export interface HttpSyncTransportOptions {
  /** Full URL of the `sync` function, e.g. `https://<ref>.supabase.co/functions/v1/sync`. */
  readonly url: string;
  /**
   * The student's access token. Null or empty means the request is not made;
   * the transport answers `unauthenticated` instead of sending an anonymous
   * batch (there is no anonymous sync, D-064).
   */
  readonly getAccessToken: () => Promise<string | null> | string | null;
  /** Injected in tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  /** Aborts a request that hangs on a dead 4G link. */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** The real transport: POST JSON with a bearer token, parse the body. */
export class HttpSyncTransport implements SyncTransport {
  private readonly url: string;
  private readonly getAccessToken: () => Promise<string | null> | string | null;
  private readonly http: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpSyncTransportOptions) {
    if (options.url.length === 0) throw new RangeError('sync url must not be empty');
    this.url = options.url;
    this.getAccessToken = options.getAccessToken;
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async send(batch: SyncBatch): Promise<SyncResponse> {
    const token = await this.getAccessToken();
    if (token === null || token === '') {
      return { ok: false, error: 'unauthenticated' };
    }

    const response = await this.http(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const body = await readJson(response);
    if (body !== null) return body;

    if (!response.ok && response.status === 401) {
      return { ok: false, error: 'unauthenticated' };
    }
    return { ok: false, error: 'sync_failed' };
  }
}

/** Parses a body only when it has the `SyncResponse` shape; otherwise null. */
async function readJson(response: Response): Promise<SyncResponse | null> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return null;
  }
  return asSyncResponse(value);
}

function asSyncResponse(value: unknown): SyncResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  if (record['ok'] === false) {
    const error = record['error'];
    if (typeof error !== 'string' || error.length === 0) return null;
    const retryAfterMs = record['retryAfterMs'];
    return typeof retryAfterMs === 'number' ? { ok: false, error, retryAfterMs } : { ok: false, error };
  }

  if (record['ok'] !== true) return null;

  const serverTime = record['serverTime'];
  const newCursor = record['newCursor'];
  const corrections = record['corrections'];
  if (typeof serverTime !== 'number') return null;
  if (newCursor !== null && typeof newCursor !== 'string') return null;
  if (!Array.isArray(corrections)) return null;

  return {
    ok: true,
    serverTime,
    newCursor,
    // Only the array shape is checked here; the server is ours and the fields
    // are covered by the backend tests.
    corrections: corrections as readonly QuestionCorrection[],
  };
}
