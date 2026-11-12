/**
 * How `AccountService` asks the server to delete the account (F12, D-086).
 *
 * Contract mirrors the sync transports: `deleteAccount` rejects only when no
 * HTTP response arrived at all. Every response becomes a result, with a 401
 * mapped to `unauthenticated` and anything that is not `{ ok: true }` mapped to
 * `delete_failed`, so the caller never wipes the phone on an unclear answer.
 */
export type DeleteAccountResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

export interface AccountTransport {
  deleteAccount(): Promise<DeleteAccountResult>;
}

export interface HttpAccountTransportOptions {
  /** Full RPC URL, e.g. `https://<ref>.supabase.co/rest/v1/rpc/delete_user`. */
  readonly url: string;
  /** Public anon key; PostgREST requires it even with a bearer token. */
  readonly anonKey: string;
  readonly getAccessToken: () => Promise<string | null> | string | null;
  /** Injected in tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** The real transport: POST an empty body to the `delete_user` RPC. */
export class HttpAccountTransport implements AccountTransport {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly getAccessToken: () => Promise<string | null> | string | null;
  private readonly http: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpAccountTransportOptions) {
    if (options.url.length === 0) throw new RangeError('account url must not be empty');
    this.url = options.url;
    this.anonKey = options.anonKey;
    this.getAccessToken = options.getAccessToken;
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async deleteAccount(): Promise<DeleteAccountResult> {
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
      body: '{}',
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (response.status === 401) return { ok: false, error: 'unauthenticated' };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, error: 'delete_failed' };
    }

    const confirmed =
      response.ok &&
      typeof body === 'object' &&
      body !== null &&
      (body as Record<string, unknown>)['ok'] === true;
    return confirmed ? { ok: true } : { ok: false, error: 'delete_failed' };
  }
}
