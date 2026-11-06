import type { Cursor, DeviceId } from '../../../shared/contract';
import type { AppDatabase, SyncMetaRow } from '../database';

const ROW_ID = 'device';

/**
 * Device identity and sync position. `ensureDeviceId` is called once at
 * startup; the id is stable for the lifetime of the install (D-011).
 */
export class SyncRepository {
  constructor(private readonly db: AppDatabase) {}

  async getMeta(): Promise<SyncMetaRow | undefined> {
    return this.db.syncMeta.get(ROW_ID);
  }

  async ensureDeviceId(create: () => DeviceId): Promise<DeviceId> {
    return this.db.transaction('rw', this.db.syncMeta, async () => {
      const existing = await this.db.syncMeta.get(ROW_ID);
      if (existing !== undefined) return existing.deviceId;

      const deviceId = create();
      const row: SyncMetaRow = { id: ROW_ID, deviceId, cursor: null, lastSyncAt: null };
      await this.db.syncMeta.add(row);
      return deviceId;
    });
  }

  /** Records the server cursor after a successful batch (F4). */
  async setCursor(cursor: Cursor, lastSyncAt: number): Promise<void> {
    const existing = await this.db.syncMeta.get(ROW_ID);
    if (existing === undefined) {
      throw new Error('cannot record a cursor before ensureDeviceId');
    }
    await this.db.syncMeta.put({ ...existing, cursor, lastSyncAt });
  }
}
