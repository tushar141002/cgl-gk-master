import {
  MAX_PULL_ATTEMPTS,
  type AttemptRecord,
  type Cursor,
  type OptionIndex,
  type PullResponse,
  type QuestionCorrection,
  type SyncBatch,
  type SyncResponse,
} from '../../shared/contract';

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

/**
 * How `HistoryService` downloads the log (F7, D-074).
 *
 * Separate from `SyncTransport` because the two endpoints have different bodies
 * and different failure handling: an upload is retried batch by batch, while a
 * pull pages until `hasMore` is false and only then advances the position.
 */
export interface PullTransport {
  pull(after: Cursor | null, limit: number): Promise<PullResponse>;
}

export interface HttpPullTransportOptions {
  /** Full RPC URL, e.g. `https://<ref>.supabase.co/rest/v1/rpc/sync_pull`. */
  readonly url: string;
  /** Public anon key; PostgREST requires it even with a bearer token. */
  readonly anonKey: string;
  readonly getAccessToken: () => Promise<string | null> | string | null;
  /** Injected in tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * The real pull: POST `{ p_after, p_limit }` to the `sync_pull` RPC.
 *
 * Contract mirrors `SyncTransport`: only a missing HTTP response throws. Every
 * response becomes a `PullResponse`, with a 401 mapped to `unauthenticated` and
 * a body that is not the RPC's shape mapped to `sync_failed`.
 */
export class HttpPullTransport implements PullTransport {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly getAccessToken: () => Promise<string | null> | string | null;
  private readonly http: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpPullTransportOptions) {
    if (options.url.length === 0) throw new RangeError('pull url must not be empty');
    this.url = options.url;
    this.anonKey = options.anonKey;
    this.getAccessToken = options.getAccessToken;
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async pull(after: Cursor | null, limit: number): Promise<PullResponse> {
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PULL_ATTEMPTS) {
      throw new RangeError(`limit must be between 1 and ${MAX_PULL_ATTEMPTS} (got ${String(limit)})`);
    }

    const token = await this.getAccessToken();
    if (token === null || token === '') {
      return { ok: false, error: 'unauthenticated' };
    }

    const response = await this.http(this.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        apikey: this.anonKey,
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ p_after: after, p_limit: limit }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const body = await readPullJson(response);
    if (body !== null) return body;

    if (response.status === 401) return { ok: false, error: 'unauthenticated' };
    return { ok: false, error: 'sync_failed' };
  }
}

async function readPullJson(response: Response): Promise<PullResponse | null> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return null;
  }
  return asPullResponse(value);
}

function asPullResponse(value: unknown): PullResponse | null {
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
  const attempts = record['attempts'];
  const nextCursor = record['nextCursor'];
  const hasMore = record['hasMore'];
  if (typeof serverTime !== 'number') return null;
  if (!Array.isArray(attempts)) return null;
  if (nextCursor !== null && typeof nextCursor !== 'string') return null;
  if (typeof hasMore !== 'boolean') return null;

  const records: AttemptRecord[] = [];
  for (const item of attempts) {
    const attempt = asAttemptRecord(item);
    if (attempt === null) return null;
    records.push(attempt);
  }

  return { ok: true, serverTime, attempts: records, nextCursor, hasMore };
}

function asAttemptRecord(value: unknown): AttemptRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const id = record['id'];
  const qid = record['qid'];
  const qv = record['qv'];
  const chosen = record['chosen'];
  const correct = record['correct'];
  const ms = record['ms'];
  const mode = record['mode'];
  const mockId = record['mockId'];
  const at = record['at'];
  const deviceId = record['deviceId'];

  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof qid !== 'string' || qid.length === 0) return null;
  if (typeof qv !== 'number' || !Number.isInteger(qv) || qv < 1) return null;
  if (chosen !== null && !isOptionIndex(chosen)) return null;
  if (typeof correct !== 'boolean') return null;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  if (typeof mode !== 'string') return null;
  if (mockId !== undefined && typeof mockId !== 'string') return null;
  if (typeof at !== 'number' || !Number.isFinite(at)) return null;
  if (typeof deviceId !== 'string' || deviceId.length === 0) return null;

  return {
    id,
    qid,
    qv,
    chosen: chosen as OptionIndex | null,
    correct,
    ms,
    mode: mode as AttemptRecord['mode'],
    ...(typeof mockId === 'string' ? { mockId } : {}),
    at,
    deviceId,
  };
}

function isOptionIndex(value: unknown): value is OptionIndex {
  return value === 0 || value === 1 || value === 2 || value === 3;
}
