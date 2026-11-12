import type { Checkpoint } from '../../shared/contract';

/**
 * How the phone uploads and fetches checkpoints (D-026, D-091).
 *
 * Contract mirrors the other transports: a method rejects only when no HTTP
 * response arrived. A refusal is `{ ok: false, error }`; `ahead_of_server`
 * and `stale` are expected and simply mean "not now".
 */
export type CheckpointUpload = Omit<Checkpoint, 'createdAt'>;

export type PutCheckpointResponse = { readonly ok: true } | { readonly ok: false; readonly error: string };

export type LatestCheckpointResponse =
  | { readonly ok: true; readonly checkpoint: Checkpoint | null }
  | { readonly ok: false; readonly error: string };

export interface CheckpointTransport {
  put(checkpoint: CheckpointUpload): Promise<PutCheckpointResponse>;
  latest(): Promise<LatestCheckpointResponse>;
}

export interface HttpCheckpointTransportOptions {
  /** `https://<ref>.supabase.co`; RPCs are under `/rest/v1/rpc/<name>`. */
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly getAccessToken: () => Promise<string | null> | string | null;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpCheckpointTransport implements CheckpointTransport {
  private readonly base: string;
  private readonly anonKey: string;
  private readonly getAccessToken: () => Promise<string | null> | string | null;
  private readonly http: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: HttpCheckpointTransportOptions) {
    if (options.supabaseUrl.length === 0) throw new RangeError('supabase url must not be empty');
    this.base = `${options.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc`;
    this.anonKey = options.anonKey;
    this.getAccessToken = options.getAccessToken;
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async put(checkpoint: CheckpointUpload): Promise<PutCheckpointResponse> {
    const body = await this.call('put_checkpoint', { p_checkpoint: checkpoint });
    if (body['ok'] === true) return { ok: true };
    return failure(body);
  }

  async latest(): Promise<LatestCheckpointResponse> {
    const body = await this.call('latest_checkpoint', {});
    if (body['ok'] !== true) return failure(body);
    const checkpoint = body['checkpoint'];
    if (checkpoint === null) return { ok: true, checkpoint: null };
    return isCheckpoint(checkpoint) ? { ok: true, checkpoint } : { ok: false, error: 'checkpoint_failed' };
  }

  private async call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
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
      return { ok: false, error: 'checkpoint_failed' };
    }
    if (!response.ok || typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, error: 'checkpoint_failed' };
    }
    return value as Record<string, unknown>;
  }
}

function failure(body: Record<string, unknown>): { readonly ok: false; readonly error: string } {
  const error = body['error'];
  return { ok: false, error: typeof error === 'string' && error.length > 0 ? error : 'checkpoint_failed' };
}

function isCheckpoint(value: unknown): value is Checkpoint {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['cursor'] === 'string' &&
    /^[0-9]+:[^:]+$/.test(record['cursor']) &&
    Array.isArray(record['cardStates']) &&
    Array.isArray(record['skills']) &&
    Array.isArray(record['istDailyTotals']) &&
    typeof record['createdAt'] === 'string'
  );
}
