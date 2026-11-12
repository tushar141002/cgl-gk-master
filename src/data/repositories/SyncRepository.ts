import type { Checkpoint, Cursor, DeviceId } from '../../../shared/contract';
import type { AppDatabase, PendingBatch, SyncMetaRow } from '../database';

const ROW_ID = 'device';

/**
 * Device identity and sync position. `ensureDeviceId` is called once at
 * startup; the id is stable for the lifetime of the install (D-011).
 *
 * `pendingBatch` is the batch that may already be on the server (D-070). It is
 * written before the request and cleared only after a reply, so a crash or a
 * lost response can be retried with the same batch id and the same contents.
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
      const row: SyncMetaRow = {
        id: ROW_ID,
        deviceId,
        cursor: null,
        lastSyncAt: null,
        pendingBatch: null,
      };
      await this.db.syncMeta.add(row);
      return deviceId;
    });
  }

  /**
   * Records the server cursor after a successful batch (F4). A null cursor —
   * the server has no attempts yet — keeps the stored one and only refreshes
   * `lastSyncAt`.
   */
  async setCursor(cursor: Cursor | null, lastSyncAt: number): Promise<void> {
    const existing = await this.db.syncMeta.get(ROW_ID);
    if (existing === undefined) {
      throw new Error('cannot record a cursor before ensureDeviceId');
    }
    await this.db.syncMeta.put({
      ...existing,
      cursor: cursor ?? existing.cursor,
      lastSyncAt,
    });
  }

  /** Pins or clears the in-flight batch (D-070). */
  async setPending(batch: PendingBatch | null): Promise<void> {
    const existing = await this.db.syncMeta.get(ROW_ID);
    if (existing === undefined) {
      throw new Error('cannot record a batch before ensureDeviceId');
    }
    await this.db.syncMeta.put({ ...existing, pendingBatch: batch });
  }

  /**
   * Binds this device to an account (D-075). The first sign-in adopts the
   * device; after that a different account is refused so one student's log
   * cannot be uploaded into another account.
   */
  async claimAccount(userId: string): Promise<'claimed' | 'ok' | 'mismatch'> {
    return this.db.transaction('rw', this.db.syncMeta, async () => {
      const existing = await this.db.syncMeta.get(ROW_ID);
      if (existing === undefined) {
        throw new Error('cannot claim an account before ensureDeviceId');
      }

      const owner = existing.accountId ?? null;
      if (owner === null) {
        await this.db.syncMeta.put({ ...existing, accountId: userId });
        return 'claimed';
      }
      return owner === userId ? 'ok' : 'mismatch';
    });
  }

  /** Stores a server checkpoint adopted on a full pull (D-091). */
  async setCheckpoint(checkpoint: Checkpoint | null): Promise<void> {
    const existing = await this.db.syncMeta.get(ROW_ID);
    if (existing === undefined) {
      throw new Error('cannot record a checkpoint before ensureDeviceId');
    }
    await this.db.syncMeta.put({ ...existing, checkpoint });
  }

  /** Records when this phone last tried to upload a checkpoint. */
  async setCheckpointTriedAt(at: number): Promise<void> {
    const existing = await this.db.syncMeta.get(ROW_ID);
    if (existing === undefined) {
      throw new Error('cannot record a checkpoint time before ensureDeviceId');
    }
    await this.db.syncMeta.put({ ...existing, checkpointTriedAt: at });
  }

  /** Advances the pull position only after a complete history download (F7). */
  async setHistoryCursor(cursor: Cursor | null): Promise<void> {
    const existing = await this.db.syncMeta.get(ROW_ID);
    if (existing === undefined) {
      throw new Error('cannot record a history cursor before ensureDeviceId');
    }
    await this.db.syncMeta.put({ ...existing, historyCursor: cursor });
  }
}
