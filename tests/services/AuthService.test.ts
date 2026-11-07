import { describe, expect, it, vi } from 'vitest';
import type { GoTrueClient } from '../../src/auth/GoTrueClient';
import { AuthError } from '../../src/auth/GoTrueClient';
import type { OAuthBrowser } from '../../src/auth/OAuthBrowser';
import { MemoryPendingAuthStore } from '../../src/auth/PendingAuthStore';
import { MemoryTokenStore, type AuthSession } from '../../src/auth/TokenStore';
import type { AppConfig } from '../../src/config';
import type { SyncRepository } from '../../src/data/repositories/SyncRepository';
import { AccountMismatchError, AuthService, REFRESH_SKEW_MS } from '../../src/services/AuthService';

const NOW = 1_700_000_000_000;
const REDIRECT = 'com.cglgkmaster.app://auth-callback';

const CONFIG: AppConfig = {
  supabaseUrl: 'https://project.test',
  supabaseAnonKey: 'anon-key',
  authRedirectUrl: REDIRECT,
};

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: NOW + 3_600_000,
    userId: 'user-1',
    email: 'student@example.com',
    ...overrides,
  };
}

class FakeBrowser implements OAuthBrowser {
  url: string | null = null;
  closed = false;
  callback: string | null = null;
  private handler: ((url: string) => void) | null = null;

  async open(url: string): Promise<void> {
    this.url = url;
    const callback = this.callback;
    if (callback !== null) {
      this.callback = null;
      queueMicrotask(() => this.handler?.(callback));
    }
  }

  async subscribe(handler: (url: string) => void): Promise<() => void> {
    this.handler = handler;
    return () => {
      this.handler = null;
    };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

class FakeGoTrue {
  exchangeCode = vi.fn(async (_code: string, _verifier: string): Promise<AuthSession> => session());
  refresh = vi.fn(async (_token: string): Promise<AuthSession> => session());
  logout = vi.fn(async (_token: string): Promise<void> => undefined);
}

class FakeSync {
  claimAccount = vi.fn(async (_userId: string): Promise<'claimed' | 'ok' | 'mismatch'> => 'claimed');
}

interface Built {
  readonly auth: AuthService;
  readonly tokens: MemoryTokenStore;
  readonly pending: MemoryPendingAuthStore;
  readonly browser: FakeBrowser;
  readonly gotrue: FakeGoTrue;
  readonly sync: FakeSync;
  readonly timers: Array<() => void>;
}

async function build(
  overrides: { tokens?: MemoryTokenStore; pending?: MemoryPendingAuthStore } = {},
): Promise<Built> {
  const tokens = overrides.tokens ?? new MemoryTokenStore();
  const pending = overrides.pending ?? new MemoryPendingAuthStore();
  const browser = new FakeBrowser();
  const gotrue = new FakeGoTrue();
  const sync = new FakeSync();
  const timers: Array<() => void> = [];

  const auth = new AuthService({
    config: CONFIG,
    gotrue: gotrue as unknown as GoTrueClient,
    tokens,
    pending,
    browser,
    sync: sync as unknown as SyncRepository,
    now: () => NOW,
    pkce: async () => ({ verifier: 'verifier-1', challenge: 'challenge-1' }),
    newState: () => 'state-1',
    setTimer: (handler) => {
      timers.push(handler);
      return timers.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  });

  return { auth, tokens, pending, browser, gotrue, sync, timers };
}

function callbackUrl(params: string): string {
  return `${REDIRECT}?${params}`;
}

describe('AuthService (F7, D-073, D-075)', () => {
  it('starts as a guest and pushes that state to a subscriber immediately', async () => {
    const { auth } = await build();
    const states: string[] = [];

    auth.subscribe((state) => states.push(state.status));
    await auth.load();

    expect(states).toEqual(['guest', 'guest']);
    expect(auth.isSignedIn()).toBe(false);
  });

  it('restores a stored session on load', async () => {
    const tokens = new MemoryTokenStore();
    await tokens.write(session());
    const { auth } = await build({ tokens });

    const states: string[] = [];
    auth.subscribe((state) => states.push(state.status));
    await auth.load();

    expect(states).toEqual(['guest', 'signed-in']);
    expect(auth.getState()).toEqual({
      status: 'signed-in',
      userId: 'user-1',
      email: 'student@example.com',
    });
  });

  it('completes a PKCE sign-in and stores the session', async () => {
    const { auth, browser, gotrue, sync, tokens, pending } = await build();
    browser.callback = callbackUrl('code=code-1&state=state-1');

    const state = await auth.signIn();

    expect(state).toEqual({ status: 'signed-in', userId: 'user-1', email: 'student@example.com' });
    expect(gotrue.exchangeCode).toHaveBeenCalledWith('code-1', 'verifier-1');
    expect(sync.claimAccount).toHaveBeenCalledWith('user-1');
    expect(await tokens.read()).toEqual(session());
    expect(pending.read(NOW)).toBeNull();
    expect(browser.closed).toBe(true);
    expect(browser.url).toContain('/auth/v1/authorize?');
    expect(browser.url).toContain('code_challenge=challenge-1');
    expect(browser.url).toContain('state=state-1');
  });

  it('refuses a phone already linked to a different account', async () => {
    const { auth, browser, gotrue, sync, tokens } = await build();
    browser.callback = callbackUrl('code=code-1&state=state-1');
    sync.claimAccount.mockResolvedValue('mismatch');

    await expect(auth.signIn()).rejects.toBeInstanceOf(AccountMismatchError);

    expect(gotrue.logout).toHaveBeenCalledWith('access-1');
    expect(await tokens.read()).toBeNull();
    expect(auth.isSignedIn()).toBe(false);
  });

  it('rejects a callback whose state does not match', async () => {
    const { auth, browser } = await build();
    browser.callback = callbackUrl('code=code-1&state=other');

    await expect(auth.signIn()).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('reports a provider error with its description', async () => {
    const { auth, browser } = await build();
    browser.callback = callbackUrl('error=access_denied&error_description=Denied&state=state-1');

    await expect(auth.signIn()).rejects.toMatchObject({
      code: 'invalid_grant',
      message: 'Denied',
    });
  });

  it('resumes a web sign-in from the callback URL on load', async () => {
    const pending = new MemoryPendingAuthStore();
    pending.write({ verifier: 'verifier-1', state: 'state-1', createdAt: NOW });
    const { auth, gotrue, tokens } = await build({ pending });

    await auth.load(callbackUrl('code=code-1&state=state-1'));

    expect(gotrue.exchangeCode).toHaveBeenCalledWith('code-1', 'verifier-1');
    expect(await tokens.read()).toEqual(session());
    expect(auth.isSignedIn()).toBe(true);
  });

  it('ignores a callback URL when no sign-in is pending', async () => {
    const { auth, gotrue } = await build();

    await expect(auth.load(callbackUrl('code=code-1&state=state-1'))).resolves.toBeUndefined();
    expect(gotrue.exchangeCode).not.toHaveBeenCalled();
    expect(auth.isSignedIn()).toBe(false);
  });

  it('refreshes once for two concurrent token reads', async () => {
    const tokens = new MemoryTokenStore();
    await tokens.write(session({ expiresAt: NOW + REFRESH_SKEW_MS - 1 }));
    const { auth, gotrue } = await build({ tokens });
    await auth.load();

    let release: (value: AuthSession) => void = () => undefined;
    gotrue.refresh.mockImplementation(
      () =>
        new Promise<AuthSession>((resolve) => {
          release = resolve;
        }),
    );

    const first = auth.getAccessToken();
    const second = auth.getAccessToken();
    await Promise.resolve();
    expect(gotrue.refresh).toHaveBeenCalledTimes(1);

    release(session({ accessToken: 'access-2', expiresAt: NOW + 3_600_000 }));
    await expect(first).resolves.toBe('access-2');
    await expect(second).resolves.toBe('access-2');
    expect(await tokens.read()).toMatchObject({ accessToken: 'access-2' });
  });

  it('returns a still-valid token without refreshing', async () => {
    const tokens = new MemoryTokenStore();
    await tokens.write(session({ expiresAt: NOW + REFRESH_SKEW_MS + 1 }));
    const { auth, gotrue } = await build({ tokens });
    await auth.load();

    await expect(auth.getAccessToken()).resolves.toBe('access-1');
    expect(gotrue.refresh).not.toHaveBeenCalled();
  });

  it('becomes a guest when the refresh token is revoked', async () => {
    const tokens = new MemoryTokenStore();
    await tokens.write(session({ expiresAt: NOW - 1 }));
    const { auth, gotrue } = await build({ tokens });
    await auth.load();
    gotrue.refresh.mockRejectedValue(new AuthError('invalid_grant', 'revoked', 400));

    await expect(auth.getAccessToken()).resolves.toBeNull();

    expect(auth.isSignedIn()).toBe(false);
    expect(await tokens.read()).toBeNull();
  });

  it('keeps the stored session when refresh fails on the network', async () => {
    const tokens = new MemoryTokenStore();
    await tokens.write(session({ expiresAt: NOW - 1 }));
    const { auth, gotrue } = await build({ tokens });
    await auth.load();
    gotrue.refresh.mockRejectedValue(new AuthError('network', 'offline'));

    await expect(auth.getAccessToken()).resolves.toBeNull();

    expect(auth.isSignedIn()).toBe(true);
    expect(await tokens.read()).not.toBeNull();
  });

  it('returns no token for a guest', async () => {
    const { auth, gotrue } = await build();
    await auth.load();

    await expect(auth.getAccessToken()).resolves.toBeNull();
    expect(gotrue.refresh).not.toHaveBeenCalled();
  });

  it('clears the local session and revokes it on sign-out', async () => {
    const tokens = new MemoryTokenStore();
    await tokens.write(session());
    const { auth, gotrue } = await build({ tokens });
    await auth.load();

    await auth.signOut();

    expect(gotrue.logout).toHaveBeenCalledWith('access-1');
    expect(await tokens.read()).toBeNull();
    expect(auth.isSignedIn()).toBe(false);
  });

  it('stops notifying a listener after unsubscribe', async () => {
    const { auth } = await build();
    let calls = 0;
    const stop = auth.subscribe(() => {
      calls += 1;
    });

    stop();
    await auth.load();

    expect(calls).toBe(1);
  });

  it('times out a consent screen left open', async () => {
    const { auth, browser, timers } = await build();
    const run = auth.signIn();
    await vi.waitFor(() => expect(browser.url).not.toBeNull());

    timers[0]!();

    await expect(run).rejects.toMatchObject({ code: 'timeout' });
  });
});
