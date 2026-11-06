import type { AttemptId, AttemptRecord, QuestionId } from '../../../shared/contract';
import type { AppDatabase, AttemptRow } from '../database';

/**
 * The append-only attempt log (F2). Nothing here updates an attempt; only
 * `markSynced` touches local bookkeeping.
 */
export class AttemptRepository {
  constructor(private readonly db: AppDatabase) {}

  async append(attempt: AttemptRecord): Promise<void> {
    await this.db.attempts.add({ ...attempt, synced: 0 });
  }

  async get(id: AttemptId): Promise<AttemptRow | undefined> {
    return this.db.attempts.get(id);
  }

  async count(): Promise<number> {
    return this.db.attempts.count();
  }

  /** Newest attempts first, one qid each, for the picker's recent filter. */
  async recentQids(limit: number): Promise<QuestionId[]> {
    const rows = await this.db.attempts.orderBy('at').reverse().toArray();
    const seen = new Set<QuestionId>();
    const qids: QuestionId[] = [];

    for (const row of rows) {
      if (seen.has(row.qid)) continue;
      seen.add(row.qid);
      qids.push(row.qid);
      if (qids.length >= limit) break;
    }

    return qids;
  }

  /** Oldest first, so a sync batch keeps replay order. */
  async unsynced(limit: number): Promise<AttemptRow[]> {
    const rows = await this.db.attempts.where('synced').equals(0).toArray();
    return rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(0, limit);
  }

  /** The whole log in replay order, for a correction rebuild (F6). */
  async all(): Promise<AttemptRow[]> {
    const rows = await this.db.attempts.toArray();
    return rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }

  /** Loads specific attempts in the order asked, skipping ids no longer stored. */
  async byIds(ids: readonly AttemptId[]): Promise<AttemptRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.attempts.bulkGet([...ids]);
    return rows.filter((row): row is AttemptRow => row !== undefined);
  }

  async markSynced(ids: readonly AttemptId[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db.attempts
      .where('id')
      .anyOf([...ids])
      .modify({ synced: 1 });
  }
}
