import type { QuestionReport, ReportReason } from '../../../shared/contract';
import type { AppDatabase, ReportRow } from '../database';

/** The primary key of a queued report; the server uses the same tuple (F11). */
export type ReportKey = [qid: string, qv: number, reason: ReportReason];

/**
 * The device's report queue. Reports are written while offline and drained by
 * the next sync batch (F4, F11). A repeated tap for the same question version
 * and reason is collapsed rather than queued twice, which mirrors the server's
 * unique constraint.
 */
export class ReportRepository {
  constructor(private readonly db: AppDatabase) {}

  async queue(report: QuestionReport): Promise<void> {
    const key: ReportKey = [report.qid, report.qv, report.reason];
    // One transaction so a fast double tap cannot insert the same key twice;
    // Dexie serialises write transactions on the table.
    await this.db.transaction('rw', this.db.reports, async () => {
      if ((await this.db.reports.get(key)) !== undefined) return;
      await this.db.reports.add({ ...report, sent: 0 });
    });
  }

  /** Oldest first, so a batch sends reports in the order they were made. */
  async pending(limit: number): Promise<ReportRow[]> {
    const rows = await this.db.reports.where('sent').equals(0).toArray();
    return rows.sort((a, b) => a.at - b.at).slice(0, limit);
  }

  async markSent(reports: readonly QuestionReport[]): Promise<void> {
    if (reports.length === 0) return;

    const keys = reports.map(toKey);
    const rows = await this.db.reports.bulkGet(keys);
    const sent = rows
      .filter((row): row is ReportRow => row !== undefined)
      .map((row): ReportRow => ({ ...row, sent: 1 }));

    if (sent.length > 0) await this.db.reports.bulkPut(sent);
  }

  async count(): Promise<number> {
    return this.db.reports.count();
  }
}

function toKey(report: QuestionReport): ReportKey {
  return [report.qid, report.qv, report.reason];
}
