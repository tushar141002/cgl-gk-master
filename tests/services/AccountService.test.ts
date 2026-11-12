import { describe, expect, it, vi } from 'vitest';
import { AccountDeletionError, AccountService } from '../../src/services/AccountService';
import type { AccountTransport, DeleteAccountResult } from '../../src/sync/AccountTransport';

function setup(options: {
  signedIn?: boolean;
  reply?: () => Promise<DeleteAccountResult>;
  wipe?: () => Promise<void>;
}) {
  const steps: string[] = [];
  const transport: AccountTransport = {
    deleteAccount: vi.fn(async () => {
      steps.push('server');
      return (options.reply ?? (async () => ({ ok: true }) as const))();
    }),
  };
  const auth = {
    isSignedIn: () => options.signedIn ?? true,
    signOut: vi.fn(async () => {
      steps.push('sign-out');
    }),
  };
  const wipeLocal = vi.fn(async () => {
    steps.push('wipe');
    await options.wipe?.();
  });
  const service = new AccountService({ transport, auth, wipeLocal });
  return { service, transport, auth, wipeLocal, steps };
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof AccountDeletionError) return error.code;
    throw error;
  }
}

describe('AccountService.deleteAccount', () => {
  it('deletes on the server first, then wipes the phone, then signs out', async () => {
    const { service, steps } = setup({});

    await service.deleteAccount();

    expect(steps).toEqual(['server', 'wipe', 'sign-out']);
  });

  it('refuses a guest without calling the server', async () => {
    const { service, transport, wipeLocal } = setup({ signedIn: false });

    expect(await codeOf(service.deleteAccount())).toBe('not-signed-in');
    expect(transport.deleteAccount).not.toHaveBeenCalled();
    expect(wipeLocal).not.toHaveBeenCalled();
  });

  it('keeps everything when the request never reaches the server', async () => {
    const { service, wipeLocal, auth } = setup({
      reply: async () => {
        throw new TypeError('offline');
      },
    });

    expect(await codeOf(service.deleteAccount())).toBe('offline');
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it.each([
    ['unauthenticated', 'unauthenticated'],
    ['delete_failed', 'failed'],
    ['something_else', 'failed'],
  ])('keeps everything when the server answers %s', async (error, code) => {
    const { service, wipeLocal, auth } = setup({ reply: async () => ({ ok: false, error }) });

    expect(await codeOf(service.deleteAccount())).toBe(code);
    expect(wipeLocal).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('still signs out when the server deleted the account but the wipe failed', async () => {
    const { service, auth } = setup({
      wipe: async () => {
        throw new Error('quota');
      },
    });

    expect(await codeOf(service.deleteAccount())).toBe('local-wipe-failed');
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});
