import {
  compareCursor,
  encodeCursor,
  type AttemptId,
  type AttemptRecord,
  type CardState,
  type Checkpoint,
  type OptionIndex,
  type QuestionId,
  type Skill,
  type SubtopicId,
} from '../../shared/contract';
import { Attempt } from './Attempt';
import { newSkill, updateSkill, type Outcome } from './EloRating';
import { ReviewScheduler } from './ReviewScheduler';

/**
 * What replay needs to know about one question.
 *
 * `rating` is fixed for the whole replay: the app uses `Question.eloSeed`, so
 * two devices with the same pack produce the same skills. `answersByVersion`
 * maps an attempt's `qv` to the answer to grade it against; a correction
 * overwrites the entry for the old version, so the same attempt is re-graded
 * without being edited (D-022, D-039).
 */
export interface ReplayQuestion {
  readonly subtopicId: SubtopicId;
  readonly rating: number;
  readonly answersByVersion: ReadonlyMap<number, OptionIndex>;
}

/** Everything replay needs about the question bank, indexed by question id. */
export type ReplayIndex = ReadonlyMap<QuestionId, ReplayQuestion>;

export interface ReplayOptions {
  /** Caps FSRS due dates the same way live play does (D-037). */
  readonly examDeadline?: number;
}

export interface ReplayResult {
  /** Sorted by question id, so rebuilds are comparable byte for byte. */
  readonly cards: readonly CardState[];
  /** Sorted by sub-topic id. */
  readonly skills: readonly Skill[];
}

export interface RegradeResult {
  /** The same attempts with `correct` re-derived; skips are untouched. */
  readonly attempts: readonly AttemptRecord[];
  /** How many attempts changed verdict. Drives the correction banner. */
  readonly changed: number;
}

/**
 * Rebuilds derived state from the attempt log (D-016, D-026).
 *
 * Pure: it takes plain data in and returns plain data out, so a new device, the
 * nightly job and the tests all run the same code (D-030). The caller merges and
 * de-duplicates the logs, supplies the newest checkpoint and an index built from
 * the question store; writes belong to a repository.
 *
 * Replay is a fold over attempts in `(at, id)` order. FSRS and Elo are both
 * Markovian, so starting from a checkpoint gives exactly the same state as
 * starting from the first attempt — `tests/core/Replayer.test.ts` pins that
 * property.
 */
export class Replayer {
  private constructor() {}

  static rebuild(
    attempts: readonly AttemptRecord[],
    checkpoint: Checkpoint | null,
    index: ReplayIndex,
    options: ReplayOptions = {},
  ): ReplayResult {
    const { examDeadline } = options;
    if (examDeadline !== undefined) assertTime(examDeadline, 'examDeadline');

    const cards = seedCards(checkpoint);
    const skills = seedSkills(checkpoint);
    const scheduled = ReviewScheduler.instance;

    for (const attempt of order(attempts, checkpoint)) {
      const question = index.get(attempt.qid);
      const outcome = outcomeOf(attempt, question);

      const current = cards.get(attempt.qid) ?? scheduled.newCard(attempt.qid, attempt.at);
      cards.set(attempt.qid, scheduled.review(current, outcome, attempt.at, examDeadline));

      if (question === undefined || outcome === 'skip') continue;
      const skill = skills.get(question.subtopicId) ?? newSkill(question.subtopicId);
      skills.set(question.subtopicId, updateSkill(skill, question.rating, outcome));
    }

    return {
      cards: [...cards.values()].sort((a, b) => compareText(a.qid, b.qid)),
      skills: [...skills.values()].sort((a, b) => compareText(a.subtopicId, b.subtopicId)),
    };
  }

  /**
   * Apply one published correction to every attempt on a question (F6, D-022).
   *
   * The log is append-only, so this returns a corrected view; it does not and
   * cannot rewrite the stored attempts. `rebuild` with the corrected index is
   * what actually moves cards and skills.
   */
  static regrade(attempts: readonly AttemptRecord[], newAnswer: OptionIndex): RegradeResult {
    if (newAnswer !== 0 && newAnswer !== 1 && newAnswer !== 2 && newAnswer !== 3) {
      throw new RangeError(`newAnswer must be 0-3 (got ${String(newAnswer)})`);
    }

    const corrected: AttemptRecord[] = [];
    let questionId: QuestionId | undefined;
    let changed = 0;

    for (const record of attempts) {
      const attempt = Attempt.from(record);
      questionId ??= attempt.record.qid;
      if (attempt.record.qid !== questionId) {
        throw new RangeError('regrade expects attempts for a single question');
      }
      const next = attempt.regrade(newAnswer).record;
      if (next.correct !== attempt.record.correct) changed += 1;
      corrected.push(next);
    }

    return { attempts: corrected, changed };
  }
}

/**
 * De-duplicates by attempt id, sorts by `(at, id)` and keeps only what comes
 * strictly after the checkpoint cursor (D-040).
 */
function order(attempts: readonly AttemptRecord[], checkpoint: Checkpoint | null): AttemptRecord[] {
  if (checkpoint !== null) {
    // Validate the cursor even when no attempt follows it.
    compareCursor(checkpoint.cursor, checkpoint.cursor);
  }

  const seen = new Set<AttemptId>();
  const unique: AttemptRecord[] = [];
  for (const record of attempts) {
    const attempt = Attempt.from(record).record;
    if (seen.has(attempt.id)) continue;
    seen.add(attempt.id);
    unique.push(attempt);
  }

  unique.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    return compareText(a.id, b.id);
  });

  if (checkpoint === null) return unique;
  const cursor = checkpoint.cursor;
  return unique.filter((attempt) => compareCursor(encodeCursor(attempt.at, attempt.id), cursor) > 0);
}

function outcomeOf(attempt: AttemptRecord, question: ReplayQuestion | undefined): Outcome {
  if (attempt.chosen === null) return 'skip';
  const key = question?.answersByVersion.get(attempt.qv);
  const correct = key === undefined ? attempt.correct : attempt.chosen === key;
  return correct ? 'correct' : 'wrong';
}

function seedCards(checkpoint: Checkpoint | null): Map<QuestionId, CardState> {
  const cards = new Map<QuestionId, CardState>();
  for (const card of checkpoint?.cardStates ?? []) {
    if (cards.has(card.qid)) {
      throw new RangeError(`duplicate card for "${card.qid}" in checkpoint`);
    }
    cards.set(card.qid, card);
  }
  return cards;
}

function seedSkills(checkpoint: Checkpoint | null): Map<SubtopicId, Skill> {
  const skills = new Map<SubtopicId, Skill>();
  for (const skill of checkpoint?.skills ?? []) {
    if (skills.has(skill.subtopicId)) {
      throw new RangeError(`duplicate skill for "${skill.subtopicId}" in checkpoint`);
    }
    skills.set(skill.subtopicId, skill);
  }
  return skills;
}

/** Locale-independent ordering, so device language never changes a rebuild. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function assertTime(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite, non-negative epoch-millisecond timestamp`);
  }
}
