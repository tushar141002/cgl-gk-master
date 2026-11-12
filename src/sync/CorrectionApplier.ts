import type { QuestionCorrection, QuestionId } from '../../shared/contract';
import type { AppDatabase } from '../data/database';
import { buildReplayIndex, replaceDerived } from './derived';

export interface CorrectionApplierOptions {
  /** Caps rebuilt FSRS due dates the same way live play does (D-037). */
  readonly examDeadline?: number;
}

export interface CorrectionResult {
  /** Corrections that were not stored before. */
  readonly applied: number;
  /** Questions whose verdict changed. Drives the banner (F6). */
  readonly changed: number;
  /** True when derived state was recomputed. */
  readonly rebuilt: boolean;
}

const NOTHING: CorrectionResult = { applied: 0, changed: 0, rebuilt: false };

/**
 * Applies published answer-key corrections (F6, D-022, D-072).
 *
 * One transaction stores the new corrections, re-derives every card and skill
 * with the corrected answer key, and marks the corrections seen. The attempt
 * log itself is never edited: `changed` is counted from the corrected index, and
 * `Replayer.rebuild` recomputes the derived stores. Doing one rebuild for the
 * whole batch — instead of one per correction as F6 sketches — keeps a phone
 * with several corrections from replaying its log several times.
 *
 * The corrected answer is used for grading immediately, because
 * `PracticeService` reads `CorrectionRepository.answerFor` inside its own
 * transaction. This class only makes the existing derived state agree.
 */
export class CorrectionApplier {
  constructor(
    private readonly db: AppDatabase,
    private readonly options: CorrectionApplierOptions = {},
  ) {}

  async apply(corrections: readonly QuestionCorrection[]): Promise<CorrectionResult> {
    if (corrections.length === 0) return NOTHING;

    return this.db.transaction(
      'rw',
      [
        this.db.corrections,
        this.db.questions,
        this.db.attempts,
        this.db.cardState,
        this.db.skills,
        this.db.dailySummary,
        this.db.syncMeta,
      ],
      async (): Promise<CorrectionResult> => {
        const stored = await this.db.corrections.bulkGet(corrections.map((item) => item.id));
        const fresh = corrections.filter((_, index) => stored[index] === undefined);
        if (fresh.length === 0) return NOTHING;

        // Store first: from this commit on, grading uses the corrected key even
        // if the pack that carries the fixed question has not arrived (F6).
        await this.db.corrections.bulkPut(fresh.map((item) => ({ ...item, seen: 0 as const })));

        const attempts = await this.db.attempts.toArray();
        const questions = await this.db.questions.toArray();
        const allCorrections = await this.db.corrections.toArray();
        const index = buildReplayIndex(questions, allCorrections);

        // One count per question: the banner says "a key you answered changed",
        // not how many rows moved. A chained correction (1 → 2 → 3) therefore
        // counts once, and each attempt is judged against the answer that
        // covers its own version rather than the newest answer overall.
        const affected = new Set<QuestionId>(fresh.map((correction) => correction.qid));
        let changed = 0;
        for (const qid of affected) {
          const question = index.get(qid);
          if (question === undefined) continue;

          const flipped = attempts.some((attempt) => {
            if (attempt.qid !== qid || attempt.chosen === null) return false;
            const answer = question.answersByVersion.get(attempt.qv);
            if (answer === undefined) return false;
            return (attempt.chosen === answer) !== attempt.correct;
          });
          if (flipped) changed += 1;
        }

        // Derived stores are replaced, not merged: replay is the single source
        // of truth for them (D-016).
        await replaceDerived(
          this.db,
          attempts,
          index,
          this.options.examDeadline === undefined ? {} : { examDeadline: this.options.examDeadline },
        );

        await this.db.corrections.bulkPut(fresh.map((item) => ({ ...item, seen: 1 as const })));

        return { applied: fresh.length, changed, rebuilt: true };
      },
    );
  }
}
