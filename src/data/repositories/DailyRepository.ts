import type { DailySummary } from '../../../shared/contract';
import type { AppDatabase, DailySummaryRow } from '../database';

/**
 * One immutable row per IST day (D-027, D-041..D-043). A day is written after
 * every graded answer; a skip-only day writes a zero row.
 */
export class DailyRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(date: string): Promise<DailySummaryRow | undefined> {
    return this.db.dailySummary.get(date);
  }

  async put(summary: DailySummary): Promise<void> {
    await this.db.dailySummary.put(summary);
  }

  /** Oldest first; streak evaluation walks the tail (D-042). */
  async all(): Promise<DailySummaryRow[]> {
    return this.db.dailySummary.orderBy('date').toArray();
  }
}
