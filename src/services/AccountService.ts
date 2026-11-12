import type { AccountTransport } from '../sync/AccountTransport';

export type AccountDeletionCode =
  /** Only a signed-in student has a server account to delete. */
  | 'not-signed-in'
  /** No response arrived; nothing was deleted anywhere. */
  | 'offline'
  /** The session expired; sign in again and retry. */
  | 'unauthenticated'
  /** The server refused or answered unclearly; nothing local was touched. */
  | 'failed'
  /** The server deleted the account but this phone could not be erased. */
  | 'local-wipe-failed';

export class AccountDeletionError extends Error {
  constructor(readonly code: AccountDeletionCode) {
    super(`account deletion failed: ${code}`);
    this.name = 'AccountDeletionError';
  }
}

export interface AccountServiceOptions {
  readonly transport: AccountTransport;
  readonly auth: {
    isSignedIn(): boolean;
    signOut(): Promise<void>;
  };
  /** Erases the student's data on this phone (`wipeLocalData`). */
  readonly wipeLocal: () => Promise<void>;
}

/**
 * Deletes the student's account (F12, D-086).
 *
 * The order is the whole point: the server is asked first, and the phone is
 * wiped only after it confirms. Wiping first would leave the account's data on
 * the server with no way left to reach it from the app.
 */
export class AccountService {
  private readonly transport: AccountTransport;
  private readonly auth: AccountServiceOptions['auth'];
  private readonly wipeLocal: () => Promise<void>;

  constructor(options: AccountServiceOptions) {
    this.transport = options.transport;
    this.auth = options.auth;
    this.wipeLocal = options.wipeLocal;
  }

  /** Resolves once both the server account and this phone's data are gone. */
  async deleteAccount(): Promise<void> {
    if (!this.auth.isSignedIn()) throw new AccountDeletionError('not-signed-in');

    let result;
    try {
      result = await this.transport.deleteAccount();
    } catch (error) {
      console.warn('account deletion request did not reach the server', error);
      throw new AccountDeletionError('offline');
    }

    if (!result.ok) {
      throw new AccountDeletionError(result.error === 'unauthenticated' ? 'unauthenticated' : 'failed');
    }

    let wiped = true;
    try {
      await this.wipeLocal();
    } catch (error) {
      console.error('account deleted on the server, but this phone could not be erased', error);
      wiped = false;
    }

    // The server account is gone either way, so the session must not survive.
    await this.auth.signOut();
    if (!wiped) throw new AccountDeletionError('local-wipe-failed');
  }
}
