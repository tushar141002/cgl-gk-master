/**
 * Session persistence (F7, D-073).
 *
 * The session lives in the WebView's `localStorage`, which Capacitor keeps
 * across app restarts. That is readable by script running in the app origin;
 * the app loads no third-party script and ships a strict CSP, and this seam is
 * where a native encrypted store can replace it later without touching
 * `AuthService`.
 */

export interface AuthSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Epoch milliseconds, UTC. */
  readonly expiresAt: number;
  readonly userId: string;
  readonly email: string | null;
}

export interface TokenStore {
  read(): Promise<AuthSession | null>;
  write(session: AuthSession): Promise<void>;
  clear(): Promise<void>;
}

export const SESSION_STORAGE_KEY = 'cgl.auth.session';

export class LocalStorageTokenStore implements TokenStore {
  constructor(
    private readonly storage: Storage,
    private readonly key: string = SESSION_STORAGE_KEY,
  ) {}

  async read(): Promise<AuthSession | null> {
    try {
      return asSession(this.storage.getItem(this.key));
    } catch {
      return null;
    }
  }

  async write(session: AuthSession): Promise<void> {
    try {
      this.storage.setItem(this.key, JSON.stringify(session));
    } catch {
      // Storage can be full or disabled; the session still works in memory.
    }
  }

  async clear(): Promise<void> {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // Nothing to clear if storage is unavailable.
    }
  }
}

export class MemoryTokenStore implements TokenStore {
  private session: AuthSession | null = null;

  async read(): Promise<AuthSession | null> {
    return this.session;
  }

  async write(session: AuthSession): Promise<void> {
    this.session = session;
  }

  async clear(): Promise<void> {
    this.session = null;
  }
}

/** Parses a stored value only when it has the `AuthSession` shape. */
export function asSession(raw: string | null): AuthSession | null {
  if (raw === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const accessToken = record['accessToken'];
  const refreshToken = record['refreshToken'];
  const expiresAt = record['expiresAt'];
  const userId = record['userId'];
  const email = record['email'];

  if (typeof accessToken !== 'string' || accessToken.length === 0) return null;
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  if (typeof userId !== 'string' || userId.length === 0) return null;
  if (email !== null && typeof email !== 'string') return null;

  return { accessToken, refreshToken, expiresAt, userId, email };
}
