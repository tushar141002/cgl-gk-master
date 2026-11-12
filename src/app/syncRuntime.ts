import type { DeviceId } from '../../shared/contract';
import { GoTrueClient } from '../auth/GoTrueClient';
import { createOAuthBrowser } from '../auth/OAuthBrowser';
import { MemoryPendingAuthStore, SessionStoragePendingAuthStore } from '../auth/PendingAuthStore';
import { LocalStorageTokenStore, MemoryTokenStore } from '../auth/TokenStore';
import type { AppConfigState } from '../config';
import { wipeLocalData, type AppDatabase } from '../data/database';
import { SyncRepository } from '../data/repositories/SyncRepository';
import { AccountService } from '../services/AccountService';
import { AuthService } from '../services/AuthService';
import { CheckpointService } from '../services/CheckpointService';
import { HistoryService } from '../services/HistoryService';
import { MockService } from '../services/MockService';
import { SyncScheduler } from '../services/SyncScheduler';
import { HttpAccountTransport } from '../sync/AccountTransport';
import { HttpCheckpointTransport } from '../sync/CheckpointTransport';
import { HttpMockTransport } from '../sync/MockTransport';
import { SyncManager } from '../sync/SyncManager';
import { HttpPullTransport, HttpSyncTransport } from '../sync/SyncTransport';

export interface SyncRuntime {
  readonly auth: AuthService;
  readonly sync: SyncManager;
  readonly history: HistoryService;
  readonly scheduler: SyncScheduler;
  readonly account: AccountService;
  readonly mocks: MockService;
}

export interface SyncRuntimeOptions {
  readonly db: AppDatabase;
  readonly deviceId: DeviceId;
  readonly config: AppConfigState;
  /** Passed to every rebuild so FSRS due dates stay capped (D-037). */
  readonly examDeadline?: number | undefined;
  /** True on Android; selects the custom-tab browser over a page redirect. */
  readonly native?: boolean;
  readonly now?: () => number;
}

/**
 * Wires auth, sync, history, the scheduler and account deletion for a
 * configured build (F1, F7, F12).
 *
 * Returns null for a guest-only build: practice works fully offline and the
 * Settings card hides sign-in instead of offering a button that cannot work.
 * Every dependency that touches the network or the clock is injectable, but
 * this root is the only place that knows the real Supabase URLs.
 */
export function createSyncRuntime(options: SyncRuntimeOptions): SyncRuntime | null {
  if (options.config.status !== 'configured') return null;
  const { config } = options.config;

  const db = options.db;
  const syncRepo = new SyncRepository(db);
  const now = options.now ?? Date.now;

  const gotrue = new GoTrueClient({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    now,
  });

  const local = storageOrNull('localStorage');
  const session = storageOrNull('sessionStorage');
  const tokens = local === null ? new MemoryTokenStore() : new LocalStorageTokenStore(local);
  const pending =
    session === null ? new MemoryPendingAuthStore() : new SessionStoragePendingAuthStore(session);

  let auth: AuthService | null = null;
  const getAccessToken = (): Promise<string | null> =>
    auth === null ? Promise.resolve(null) : auth.getAccessToken();

  auth = new AuthService({
    config,
    gotrue,
    tokens,
    pending,
    browser: createOAuthBrowser(options.native ?? false),
    sync: syncRepo,
    now,
  });

  const transport = new HttpSyncTransport({
    url: `${config.supabaseUrl}/functions/v1/sync`,
    getAccessToken,
  });
  const pullTransport = new HttpPullTransport({
    url: `${config.supabaseUrl}/rest/v1/rpc/sync_pull`,
    anonKey: config.supabaseAnonKey,
    getAccessToken,
  });

  const sync = new SyncManager(db, {
    deviceId: options.deviceId,
    transport,
    ...(options.examDeadline === undefined ? {} : { examDeadline: options.examDeadline }),
  });
  const checkpointTransport = new HttpCheckpointTransport({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    getAccessToken,
  });
  const history = new HistoryService(db, {
    transport: pullTransport,
    checkpoints: checkpointTransport,
    ...(options.examDeadline === undefined ? {} : { examDeadline: options.examDeadline }),
  });
  const checkpoints = new CheckpointService(db, {
    transport: checkpointTransport,
    now,
    examDeadline: options.examDeadline,
  });
  // After a sync that went through, offer the server a fresh checkpoint; the
  // service itself paces this to once a week (D-091).
  const scheduler = new SyncScheduler({
    sync,
    auth,
    subscribeWake,
    onResult: (result) => {
      if (result.status === 'ok') void checkpoints.maybeWrite().catch(() => undefined);
    },
  });
  const account = new AccountService({
    transport: new HttpAccountTransport({
      url: `${config.supabaseUrl}/rest/v1/rpc/delete_user`,
      anonKey: config.supabaseAnonKey,
      getAccessToken,
    }),
    auth,
    wipeLocal: () => wipeLocalData(db),
  });

  const mocks = new MockService(db, {
    transport: new HttpMockTransport({
      supabaseUrl: config.supabaseUrl,
      anonKey: config.supabaseAnonKey,
      getAccessToken,
    }),
    now,
  });

  return { auth, sync, history, scheduler, account, mocks };
}

/**
 * Wakes the scheduler on the two signals a WebView reliably reports: the
 * network returning and the app becoming visible again. Foregrounding Android
 * fires `visibilitychange` on the WebView, so no native plugin is needed here.
 */
function subscribeWake(handler: () => void): () => void {
  const onOnline = (): void => handler();
  const onVisibility = (): void => {
    if (globalThis.document.visibilityState === 'visible') handler();
  };

  globalThis.addEventListener('online', onOnline);
  globalThis.document.addEventListener('visibilitychange', onVisibility);

  return () => {
    globalThis.removeEventListener('online', onOnline);
    globalThis.document.removeEventListener('visibilitychange', onVisibility);
  };
}

function storageOrNull(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    // Access can throw when storage is disabled; an in-memory seam still works.
    return null;
  }
}
