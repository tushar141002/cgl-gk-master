/**
 * The PKCE verifier and `state` for one in-flight sign-in (F7, D-073).
 *
 * On Android the app returns through a deep link without reloading, so an
 * in-memory value would be enough. The web build navigates away and comes back,
 * so the pending value is written to `sessionStorage`: same-tab, cleared when
 * the tab closes, and never uploaded.
 */

export interface PendingAuth {
  readonly verifier: string;
  readonly state: string;
  /** Epoch milliseconds, UTC. */
  readonly createdAt: number;
}

export interface PendingAuthStore {
  /** Returns null for a missing, corrupt or stale entry. */
  read(now?: number): PendingAuth | null;
  write(pending: PendingAuth): void;
  clear(): void;
}

/** A sign-in that takes longer than this is abandoned and retried from scratch. */
export const PENDING_AUTH_TTL_MS = 10 * 60_000;

export const PENDING_AUTH_KEY = 'cgl.auth.pending';

export class SessionStoragePendingAuthStore implements PendingAuthStore {
  constructor(
    private readonly storage: Storage,
    private readonly key: string = PENDING_AUTH_KEY,
  ) {}

  read(now: number = Date.now()): PendingAuth | null {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return null;
    }

    const pending = asPending(raw);
    if (pending === null) return null;
    if (now - pending.createdAt > PENDING_AUTH_TTL_MS) {
      this.clear();
      return null;
    }
    return pending;
  }

  write(pending: PendingAuth): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(pending));
    } catch {
      // A missing store only costs the web round trip; the native flow keeps
      // the value in this instance.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // Nothing to clear.
    }
  }
}

export class MemoryPendingAuthStore implements PendingAuthStore {
  private pending: PendingAuth | null = null;

  read(now: number = Date.now()): PendingAuth | null {
    if (this.pending === null) return null;
    if (now - this.pending.createdAt > PENDING_AUTH_TTL_MS) {
      this.pending = null;
      return null;
    }
    return this.pending;
  }

  write(pending: PendingAuth): void {
    this.pending = pending;
  }

  clear(): void {
    this.pending = null;
  }
}

function asPending(raw: string | null): PendingAuth | null {
  if (raw === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;

  const record = value as Record<string, unknown>;
  const verifier = record['verifier'];
  const state = record['state'];
  const createdAt = record['createdAt'];

  if (typeof verifier !== 'string' || verifier.length === 0) return null;
  if (typeof state !== 'string' || state.length === 0) return null;
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;

  return { verifier, state, createdAt };
}
