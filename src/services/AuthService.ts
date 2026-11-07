import { AuthError, type GoTrueClient } from '../auth/GoTrueClient';
import type { OAuthBrowser } from '../auth/OAuthBrowser';
import type { PendingAuthStore } from '../auth/PendingAuthStore';
import {
  buildAuthorizeUrl,
  createPkce,
  createState,
  parseAuthCallback,
  type AuthCallback,
  type PkcePair,
} from '../auth/pkce';
import type { AuthSession, TokenStore } from '../auth/TokenStore';
import type { AppConfig } from '../config';
import type { SyncRepository } from '../data/repositories/SyncRepository';

/** Refresh this long before expiry so a request never travels with a dead token. */
export const REFRESH_SKEW_MS = 60_000;

/** A consent screen left open this long is abandoned (D-073). */
export const SIGN_IN_TIMEOUT_MS = 5 * 60_000;

export interface AuthState {
  readonly status: 'guest' | 'signed-in';
  readonly userId: string | null;
  readonly email: string | null;
}

/**
 * The device already belongs to a different account (D-075).
 *
 * Local attempts carry no account column, so signing a second Google account
 * into the same phone would upload the first student's history into it. The
 * remedy is to clear the app's data first; an in-app wipe arrives with account
 * deletion (F12).
 */
export class AccountMismatchError extends Error {
  constructor() {
    super('this phone is linked to another account');
    this.name = 'AccountMismatchError';
  }
}

export interface AuthServiceOptions {
  readonly config: AppConfig;
  readonly gotrue: GoTrueClient;
  readonly tokens: TokenStore;
  readonly pending: PendingAuthStore;
  readonly browser: OAuthBrowser;
  readonly sync: SyncRepository;
  readonly now?: () => number;
  readonly pkce?: () => Promise<PkcePair>;
  readonly newState?: () => string;
  readonly setTimer?: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

const GUEST: AuthState = { status: 'guest', userId: null, email: null };

/**
 * Sign-in, session refresh and sign-out (F7, D-073).
 *
 * One instance owns the session: transports ask it for an access token, the
 * shell subscribes for the account card, and the scheduler asks whether a
 * student is signed in. Refresh is single-flight, because the server rotates
 * refresh tokens and two parallel calls would revoke each other.
 */
export class AuthService {
  private readonly config: AppConfig;
  private readonly gotrue: GoTrueClient;
  private readonly tokens: TokenStore;
  private readonly pending: PendingAuthStore;
  private readonly browser: OAuthBrowser;
  private readonly sync: SyncRepository;
  private readonly now: () => number;
  private readonly makePkce: () => Promise<PkcePair>;
  private readonly newState: () => string;
  private readonly setTimer: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (handle: ReturnType<typeof setTimeout>) => void;

  private session: AuthSession | null = null;
  private current: AuthState = GUEST;
  private readonly listeners = new Set<(state: AuthState) => void>();
  private refreshing: Promise<AuthSession | null> | null = null;

  constructor(options: AuthServiceOptions) {
    this.config = options.config;
    this.gotrue = options.gotrue;
    this.tokens = options.tokens;
    this.pending = options.pending;
    this.browser = options.browser;
    this.sync = options.sync;
    this.now = options.now ?? Date.now;
    this.makePkce = options.pkce ?? (() => createPkce());
    this.newState = options.newState ?? (() => createState());
    this.setTimer = options.setTimer ?? ((handler, ms) => setTimeout(handler, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  getState(): AuthState {
    return this.current;
  }

  isSignedIn(): boolean {
    return this.current.status === 'signed-in';
  }

  /** Pushes the current state immediately, then every change. */
  subscribe(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Restores a stored session, then completes a web sign-in when the page
   * reloaded on the callback URL. Safe to call once at startup.
   */
  async load(callbackUrl?: string): Promise<void> {
    this.session = await this.tokens.read();
    this.current = this.session === null ? GUEST : signedIn(this.session);
    this.emit();

    if (callbackUrl !== undefined) {
      try {
        await this.resumeSignIn(callbackUrl);
      } catch (error) {
        console.warn('could not finish sign-in', error);
      }
    }
  }

  /**
   * Opens the consent screen and resolves once the account is claimed and the
   * session stored. Rejects with `AccountMismatchError` for a different account
   * already on this phone, and with `AuthError` for anything else.
   */
  async signIn(): Promise<AuthState> {
    const pkce = await this.makePkce();
    const state = this.newState();
    this.pending.write({ verifier: pkce.verifier, state, createdAt: this.now() });

    const url = buildAuthorizeUrl({
      supabaseUrl: this.config.supabaseUrl,
      redirectTo: this.config.authRedirectUrl,
      challenge: pkce.challenge,
      state,
    });

    let resolveRedirect: (url: string) => void = () => undefined;
    let rejectRedirect: (error: unknown) => void = () => undefined;
    const redirect = new Promise<string>((resolve, reject) => {
      resolveRedirect = resolve;
      rejectRedirect = reject;
    });

    const unsubscribe = await this.browser.subscribe((callbackUrl) => resolveRedirect(callbackUrl));
    const timer = this.setTimer(
      () => rejectRedirect(new AuthError('timeout', 'sign-in did not finish')),
      SIGN_IN_TIMEOUT_MS,
    );

    try {
      await this.browser.open(url);
      const callbackUrl = await redirect;
      return await this.finish(callbackUrl);
    } finally {
      this.clearTimer(timer);
      unsubscribe();
      await this.browser.close();
    }
  }

  /**
   * Web only: the page came back from the provider. Returns null when there is
   * no pending sign-in, so an unrelated URL is never treated as a callback.
   */
  async resumeSignIn(callbackUrl: string): Promise<AuthState | null> {
    const pending = this.pending.read(this.now());
    if (pending === null) return null;

    const callback = parseAuthCallback(callbackUrl, pending.state);
    if (callback.kind === 'ignored') return null;
    if (callback.kind === 'error') {
      this.pending.clear();
      throw new AuthError('invalid_grant', describe(callback));
    }

    return this.complete(callback.code, pending.verifier);
  }

  /** Best-effort server revocation, then a local sign-out that keeps the log. */
  async signOut(): Promise<void> {
    const session = this.session ?? (await this.tokens.read());
    this.session = null;
    this.current = GUEST;
    this.pending.clear();
    await this.tokens.clear();
    this.emit();

    if (session !== null) await this.gotrue.logout(session.accessToken);
  }

  /**
   * A token for the sync transports. Returns null when the student is a guest
   * or when a refresh could not produce a usable token; the transport then
   * answers `unauthenticated` without a request.
   */
  async getAccessToken(): Promise<string | null> {
    const session = this.session;
    if (session === null) return null;
    if (session.expiresAt - this.now() > REFRESH_SKEW_MS) return session.accessToken;

    const refreshed = await this.refresh();
    return refreshed === null ? null : refreshed.accessToken;
  }

  /** The signed-in user, for diagnostics and the account card. */
  get userId(): string | null {
    return this.current.userId;
  }

  private async finish(callbackUrl: string): Promise<AuthState> {
    const pending = this.pending.read(this.now());
    if (pending === null) {
      throw new AuthError('invalid_request', 'sign-in expired; try again');
    }

    const callback = parseAuthCallback(callbackUrl, pending.state);
    if (callback.kind === 'error') {
      this.pending.clear();
      throw new AuthError('invalid_grant', describe(callback));
    }
    if (callback.kind === 'ignored') {
      throw new AuthError('invalid_request', 'the sign-in link was incomplete');
    }

    return this.complete(callback.code, pending.verifier);
  }

  private async complete(code: string, verifier: string): Promise<AuthState> {
    const session = await this.gotrue.exchangeCode(code, verifier);

    const claim = await this.sync.claimAccount(session.userId);
    if (claim === 'mismatch') {
      this.pending.clear();
      await this.gotrue.logout(session.accessToken);
      throw new AccountMismatchError();
    }

    await this.tokens.write(session);
    this.session = session;
    this.pending.clear();
    this.current = signedIn(session);
    this.emit();
    return this.current;
  }

  private refresh(): Promise<AuthSession | null> {
    if (this.refreshing !== null) return this.refreshing;

    const session = this.session;
    if (session === null) return Promise.resolve(null);

    const run = (async (): Promise<AuthSession | null> => {
      try {
        const next = await this.gotrue.refresh(session.refreshToken);
        this.session = next;
        await this.tokens.write(next);
        this.current = signedIn(next);
        this.emit();
        return next;
      } catch (error) {
        // A revoked or reused refresh token is terminal: become a guest.
        // A network or server failure keeps the stored session for a retry.
        if (error instanceof AuthError && error.code === 'invalid_grant') {
          this.session = null;
          this.current = GUEST;
          await this.tokens.clear();
          this.emit();
        }
        return null;
      } finally {
        this.refreshing = null;
      }
    })();

    this.refreshing = run;
    return run;
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.current);
  }
}

function signedIn(session: AuthSession): AuthState {
  return { status: 'signed-in', userId: session.userId, email: session.email };
}

function describe(callback: Extract<AuthCallback, { kind: 'error' }>): string {
  return callback.description ?? callback.error;
}
