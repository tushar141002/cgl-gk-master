import { describe, expect, it } from 'vitest';
import {
  asSession,
  LocalStorageTokenStore,
  MemoryTokenStore,
  SESSION_STORAGE_KEY,
  type AuthSession,
} from '../../src/auth/TokenStore';
import {
  MemoryPendingAuthStore,
  PENDING_AUTH_TTL_MS,
  SessionStoragePendingAuthStore,
} from '../../src/auth/PendingAuthStore';

class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const SESSION: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 1_700_000_000_000,
  userId: 'user-1',
  email: 'student@example.com',
};

describe('session persistence (D-073)', () => {
  it('round-trips a session through local storage', async () => {
    const storage = new FakeStorage();
    const store = new LocalStorageTokenStore(storage);

    await store.write(SESSION);
    expect(storage.getItem(SESSION_STORAGE_KEY)).toContain('access-1');
    expect(await store.read()).toEqual(SESSION);

    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it('round-trips a session in memory', async () => {
    const store = new MemoryTokenStore();
    await store.write(SESSION);
    expect(await store.read()).toEqual(SESSION);
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it('ignores corrupt or incomplete stored values', async () => {
    const storage = new FakeStorage();
    storage.setItem(SESSION_STORAGE_KEY, '{not json');
    expect(await new LocalStorageTokenStore(storage).read()).toBeNull();

    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'a' }));
    expect(await new LocalStorageTokenStore(storage).read()).toBeNull();
  });

  it('accepts a missing email but not a malformed one', () => {
    expect(asSession(JSON.stringify({ ...SESSION, email: null }))).toMatchObject({ email: null });
    expect(asSession(JSON.stringify({ ...SESSION, email: 7 }))).toBeNull();
  });

  it('survives storage that throws', async () => {
    const broken: Storage = {
      get length() {
        return 0;
      },
      clear: () => undefined,
      getItem: () => {
        throw new Error('blocked');
      },
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('full');
      },
    };

    const store = new LocalStorageTokenStore(broken);
    await expect(store.write(SESSION)).resolves.toBeUndefined();
    expect(await store.read()).toBeNull();
    await expect(store.clear()).resolves.toBeUndefined();
  });
});

describe('pending sign-in persistence (D-073)', () => {
  it('round-trips the verifier and state', () => {
    const store = new SessionStoragePendingAuthStore(new FakeStorage());
    const pending = { verifier: 'v1', state: 's1', createdAt: 1_000 };

    store.write(pending);
    expect(store.read(2_000)).toEqual(pending);

    store.clear();
    expect(store.read(2_000)).toBeNull();
  });

  it('drops an abandoned sign-in after the TTL', () => {
    const store = new SessionStoragePendingAuthStore(new FakeStorage());
    store.write({ verifier: 'v1', state: 's1', createdAt: 1_000 });

    expect(store.read(1_000 + PENDING_AUTH_TTL_MS)).not.toBeNull();
    expect(store.read(1_000 + PENDING_AUTH_TTL_MS + 1)).toBeNull();
  });

  it('applies the same TTL in memory', () => {
    const store = new MemoryPendingAuthStore();
    store.write({ verifier: 'v1', state: 's1', createdAt: 1_000 });

    expect(store.read(1_000 + PENDING_AUTH_TTL_MS)).not.toBeNull();
    expect(store.read(1_000 + PENDING_AUTH_TTL_MS + 1)).toBeNull();
  });

  it('ignores a corrupt pending value', () => {
    const storage = new FakeStorage();
    storage.setItem('cgl.auth.pending', '{"state":"s1"}');
    expect(new SessionStoragePendingAuthStore(storage).read()).toBeNull();
  });
});
