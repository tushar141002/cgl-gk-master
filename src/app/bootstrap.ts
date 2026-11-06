import type { Settings } from '../../shared/contract';
import { uuidV7 } from '../../shared/uuid';
import { openDatabase, type AppDatabase } from '../data/database';
import { SettingsRepository } from '../data/repositories/SettingsRepository';
import { SyncRepository } from '../data/repositories/SyncRepository';

export interface BootResult {
  readonly db: AppDatabase;
  readonly settings: Settings;
  /** True on a fresh install, so the shell may resolve the system theme once. */
  readonly settingsCreated: boolean;
  readonly deviceId: string;
}

export interface BootOptions {
  readonly dbName?: string;
  readonly now?: number;
  readonly newDeviceId?: () => string;
}

/**
 * F1: open storage, load preferences, establish the device id.
 *
 * Nothing here touches the network. If the database cannot open, the promise
 * rejects with the original error and the entry point shows the storage screen.
 */
export async function bootstrap(options: BootOptions = {}): Promise<BootResult> {
  const db = await openDatabase(options.dbName);

  try {
    const now = options.now ?? Date.now();
    const { settings, created } = await new SettingsRepository(db).ensure(now);
    const deviceId = await new SyncRepository(db).ensureDeviceId(options.newDeviceId ?? (() => uuidV7(now)));
    return { db, settings, settingsCreated: created, deviceId };
  } catch (error) {
    db.close();
    throw error;
  }
}
