import type { OptionIndex, QuestionCorrection, QuestionId } from '../../../shared/contract';
import type { AppDatabase, CorrectionRow } from '../database';

/**
 * Corrections the server has published (D-022, F6).
 *
 * `seen` is local bookkeeping: a correction is written unseen, folded into the
 * derived state by `CorrectionApplier`, then marked seen. Grading never waits
 * for `seen` — `answerFor` reads every stored row, which is what makes the F6
 * ordering rule work: the answer key is corrected the moment the row lands.
 */
export class CorrectionRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Stores the corrections that are new; returns how many were inserted. */
  async putMany(corrections: readonly QuestionCorrection[]): Promise<number> {
    if (corrections.length === 0) return 0;

    const existing = await this.db.corrections.bulkGet(corrections.map((item) => item.id));
    const fresh: CorrectionRow[] = corrections
      .filter((_, index) => existing[index] === undefined)
      .map((correction) => ({ ...correction, seen: 0 }));

    if (fresh.length > 0) await this.db.corrections.bulkPut(fresh);
    return fresh.length;
  }

  /** Unfolded corrections, oldest first. */
  async unseen(): Promise<CorrectionRow[]> {
    const rows = await this.db.corrections.where('seen').equals(0).toArray();
    return rows.sort(byCorrectedAt);
  }

  async all(): Promise<CorrectionRow[]> {
    const rows = await this.db.corrections.toArray();
    return rows.sort(byCorrectedAt);
  }

  async markSeen(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;

    const rows = await this.db.corrections.bulkGet([...ids]);
    const seen = rows
      .filter((row): row is CorrectionRow => row !== undefined)
      .map((row): CorrectionRow => ({ ...row, seen: 1 }));

    if (seen.length > 0) await this.db.corrections.bulkPut(seen);
  }

  /**
   * The answer to grade against for one question version, or null when no
   * correction covers it. Later corrections win, so a chained correction
   * (1 → 2 → 3) grades version 1 against the newest key.
   */
  async answerFor(qid: QuestionId, qv: number): Promise<OptionIndex | null> {
    const rows = await this.db.corrections.where('qid').equals(qid).toArray();
    let answer: OptionIndex | null = null;

    for (const correction of rows.sort(byCorrectedAt)) {
      if (correction.fromVersion <= qv && qv <= correction.toVersion) {
        answer = correction.newAnswer;
      }
    }

    return answer;
  }
}

/** Locale-independent order, so the same rows fold the same way everywhere. */
function byCorrectedAt(a: CorrectionRow, b: CorrectionRow): number {
  if (a.correctedAt !== b.correctedAt) return a.correctedAt < b.correctedAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
