import type { AuthSession } from './TokenStore';

/**
 * The three GoTrue calls the app needs (F7, D-073).
 *
 * Deliberately small: provider authorize is a URL built in `pkce.ts`, and this
 * client only exchanges the code, refreshes the session and revokes it. Every
 * call takes its `fetch` and clock from options, so the exact request shape and
 * the expiry maths are unit-tested without a network.
 */

export type AuthErrorCode =
  'network' | 'timeout' | 'invalid_grant' | 'invalid_request' | 'invalid_response' | 'server';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface GoTrueOptions {
  /** Project URL, no trailing slash. */
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Injected in tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * One token endpoint response. Supabase sends both `expires_in` and
 * `expires_at`; `expires_at` is preferred because it is immune to a slow
 * response arriving after the device set its clock.
 */
interface TokenResponse {
  readonly access_token?: unknown;
  readonly refresh_token?: unknown;
  readonly expires_in?: unknown;
  readonly expires_at?: unknown;
  readonly user?: unknown;
}

export class GoTrueClient {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly http: typeof fetch;
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(options: GoTrueOptions) {
    this.url = options.supabaseUrl;
    this.anonKey = options.anonKey;
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Completes PKCE: the auth code plus the verifier becomes a session. */
  exchangeCode(code: string, verifier: string): Promise<AuthSession> {
    return this.token('pkce', { auth_code: code, code_verifier: verifier });
  }

  /** Rotating refresh: the response carries a new refresh token. */
  refresh(refreshToken: string): Promise<AuthSession> {
    return this.token('refresh_token', { refresh_token: refreshToken });
  }

  /**
   * Best-effort sign-out. Revocation failure must not trap a student in a
   * session they asked to leave, so errors are swallowed; the local session is
   * cleared by the caller either way.
   */
  async logout(accessToken: string): Promise<void> {
    try {
      await this.http(`${this.url}/auth/v1/logout`, {
        method: 'POST',
        headers: this.headers(accessToken),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      // Offline sign-out still clears the local session.
    }
  }

  private async token(grant: 'pkce' | 'refresh_token', body: Record<string, string>): Promise<AuthSession> {
    const url = `${this.url}/auth/v1/token?grant_type=${grant}`;
    let response: Response;
    try {
      response = await this.http(url, {
        method: 'POST',
        headers: this.headers(null),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AuthError('network', 'could not reach the sign-in service');
    }

    const payload = await readJson(response);
    if (!response.ok) {
      const description = messageFrom(payload);
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new AuthError('invalid_grant', description ?? 'sign-in was rejected', response.status);
      }
      if (response.status === 429 || response.status >= 500) {
        throw new AuthError('server', description ?? 'sign-in service is unavailable', response.status);
      }
      throw new AuthError('invalid_request', description ?? 'unexpected sign-in response', response.status);
    }

    return this.asSession(payload);
  }

  private asSession(payload: TokenResponse | null): AuthSession {
    if (payload === null) throw new AuthError('invalid_response', 'sign-in response was not JSON');

    const accessToken = payload.access_token;
    const refreshToken = payload.refresh_token;
    const user = payload.user;

    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new AuthError('invalid_response', 'sign-in response had no access token');
    }
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new AuthError('invalid_response', 'sign-in response had no refresh token');
    }
    if (typeof user !== 'object' || user === null) {
      throw new AuthError('invalid_response', 'sign-in response had no user');
    }

    const record = user as Record<string, unknown>;
    const userId = record['id'];
    const email = record['email'];
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new AuthError('invalid_response', 'sign-in response had no user id');
    }
    if (email !== undefined && email !== null && typeof email !== 'string') {
      throw new AuthError('invalid_response', 'sign-in response had a malformed email');
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: this.expiresAt(payload),
      userId,
      email: typeof email === 'string' ? email : null,
    };
  }

  private expiresAt(payload: TokenResponse): number {
    const expiresAt = payload.expires_at;
    if (typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > 0) {
      return Math.round(expiresAt * 1_000);
    }
    const expiresIn = payload.expires_in;
    if (typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0) {
      return this.now() + Math.round(expiresIn * 1_000);
    }
    throw new AuthError('invalid_response', 'sign-in response had no expiry');
  }

  private headers(accessToken: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      apikey: this.anonKey,
      'content-type': 'application/json; charset=utf-8',
    };
    if (accessToken !== null) headers['authorization'] = `Bearer ${accessToken}`;
    return headers;
  }
}

async function readJson(response: Response): Promise<TokenResponse | null> {
  try {
    const value: unknown = await response.json();
    if (typeof value !== 'object' || value === null) return null;
    return value as TokenResponse;
  } catch {
    return null;
  }
}

function messageFrom(payload: TokenResponse | null): string | null {
  if (payload === null) return null;
  const record = payload as Record<string, unknown>;
  const candidates = [record['error_description'], record['msg'], record['error']];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}
