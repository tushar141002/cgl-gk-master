import type {
  AttemptRecord,
  DailySummary,
  OptionIndex,
  QuestionCorrection,
  QuestionId,
  SubtopicId,
} from '../../shared/contract';
import { istDayKey } from '../../shared/contract';
import { Replayer, type ReplayIndex, type ReplayQuestion, type ReplayResult } from '../core/Replayer';
import { StreakTracker } from '../core/StreakTracker';
import type { AppDatabase, CorrectionRow, QuestionRow } from '../data/database';

export interface ReplaceDerivedOptions {
  /** Caps rebuilt FSRS due dates the same way live play does (D-037). */
  readonly examDeadline?: number;
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
 *
 * Shared by `CorrectionApplier` and the history pull (F6, F7): both re-derive
 * the whole state after the attempt log changes.
 */
export function buildReplayIndex(
  questions: readonly QuestionRow[],
  corrections: readonly CorrectionRow[],
): ReplayIndex {
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

/**
 * Folds the log into one `dailySummary` row per IST day (D-027, D-041..D-043).
 *
 * A skip-only day writes a zero row, which is what breaks a streak (D-043).
 * Duplicate attempt ids are ignored so a pull that overlaps an upload cannot
 * count an answer twice.
 */
export function foldDailySummaries(attempts: readonly AttemptRecord[]): DailySummary[] {
  const seen = new Set<string>();
  const ordered = [...attempts]
    .filter((attempt) => {
      if (seen.has(attempt.id)) return false;
      seen.add(attempt.id);
      return true;
    })
    .sort((a, b) => a.at - b.at || compareText(a.id, b.id));

  const byDate = new Map<string, DailySummary>();
  for (const attempt of ordered) {
    const date = istDayKey(attempt.at);
    byDate.set(date, StreakTracker.apply(attempt, byDate.get(date) ?? null));
  }

  return [...byDate.values()].sort((a, b) => compareText(a.date, b.date));
}

/**
 * Replaces every derived store from the attempt log (D-016, D-026).
 *
 * Must run inside a Dexie write transaction that includes `attempts`,
 * `cardState`, `skills` and `dailySummary`; the caller owns the transaction so
 * a correction batch, a pull merge or a settings change can share one commit.
 * Rows are replaced, not merged: replay is the single source of truth.
 */
export async function replaceDerived(
  db: AppDatabase,
  attempts: readonly AttemptRecord[],
  index: ReplayIndex,
  options: ReplaceDerivedOptions = {},
): Promise<ReplayResult> {
  const rebuilt = Replayer.rebuild(
    attempts,
    null,
    index,
    options.examDeadline === undefined ? {} : { examDeadline: options.examDeadline },
  );
  const daily = foldDailySummaries(attempts);

  await db.cardState.clear();
  await db.skills.clear();
  await db.dailySummary.clear();
  await db.cardState.bulkPut([...rebuilt.cards]);
  await db.skills.bulkPut([...rebuilt.skills]);
  await db.dailySummary.bulkPut(daily);

  return rebuilt;
}

function byCorrectedAt(a: QuestionCorrection, b: QuestionCorrection): number {
  if (a.correctedAt !== b.correctedAt) return a.correctedAt < b.correctedAt ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Locale-independent ordering, so device language never changes a rebuild. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
