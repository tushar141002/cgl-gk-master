import type { OptionIndex, QuestionCorrection, QuestionId, SubtopicId } from '../../shared/contract';
import { Replayer, type ReplayIndex, type ReplayQuestion } from '../core/Replayer';
import type { AppDatabase, CorrectionRow, QuestionRow } from '../data/database';

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
      this.db.corrections,
      this.db.questions,
      this.db.attempts,
      this.db.cardState,
      this.db.skills,
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
        const index = buildIndex(questions, allCorrections);

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

        const rebuilt = Replayer.rebuild(
          attempts,
          null,
          index,
          this.options.examDeadline === undefined ? {} : { examDeadline: this.options.examDeadline },
        );

        // Derived stores are replaced, not merged: replay is the single source
        // of truth for them (D-016).
        await this.db.cardState.clear();
        await this.db.skills.clear();
        await this.db.cardState.bulkPut([...rebuilt.cards]);
        await this.db.skills.bulkPut([...rebuilt.skills]);

        await this.db.corrections.bulkPut(fresh.map((item) => ({ ...item, seen: 1 as const })));

        return { applied: fresh.length, changed, rebuilt: true };
      },
    );
  }
}

/** A mutable index entry while corrections are folded in. */
interface DraftQuestion {
  readonly subtopicId: SubtopicId;
  readonly rating: number;
  readonly answers: Map<number, OptionIndex>;
}

/**
 * Builds the replay index from the installed bank and every stored correction.
 *
 * A correction from version 1 to 2 maps both version 1 and version 2 to the new
 * answer, so an attempt recorded against the old pack and one recorded after
 * the fix grade the same way. A question that is not installed yet is skipped;
 * its correction still applies to grading through `answerFor`.
 */
function buildIndex(questions: readonly QuestionRow[], corrections: readonly CorrectionRow[]): ReplayIndex {
  const drafts = new Map<QuestionId, DraftQuestion>();
  for (const question of questions) {
    drafts.set(question.id, {
      subtopicId: question.subtopic,
      rating: question.eloSeed,
      answers: new Map([[question.v, question.answer]]),
    });
  }

  for (const correction of [...corrections].sort(byCorrectedAt)) {
    const draft = drafts.get(correction.qid);
    if (draft === undefined) continue;
    for (let version = correction.fromVersion; version <= correction.toVersion; version += 1) {
      draft.answers.set(version, correction.newAnswer);
    }
  }

  const index = new Map<QuestionId, ReplayQuestion>();
  for (const [qid, draft] of drafts) {
    index.set(qid, {
      subtopicId: draft.subtopicId,
      rating: draft.rating,
      answersByVersion: draft.answers,
    });
  }
  return index;
}

function byCorrectedAt(a: QuestionCorrection, b: QuestionCorrection): number {
  if (a.correctedAt !== b.correctedAt) return a.correctedAt < b.correctedAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
