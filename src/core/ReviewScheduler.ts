import { Rating, State, dateChrono, defineScheduler } from 'ts-fsrs';
import {
  DEFAULT_MAXIMUM_INTERVAL,
  defaultLearningSteps,
  defaultRelearningSteps,
  schedulerDesiredRetentionMiddleware,
  schedulerFuzzingMiddleware,
  schedulerLearningStepsMiddleware,
  schedulerMaximumIntervalMiddleware,
  schedulerMonotonicIntervalMiddleware,
  schedulerScheduledDaysMiddleware,
  schedulerStatsMiddleware,
} from 'ts-fsrs/middlewares';
import { FSRS7Model, migrateFSRS7Parameters } from 'ts-fsrs/models/fsrs-7';
import type { CardPhase, CardState, QuestionId } from '../../shared/contract';
import type { Outcome } from './EloRating';

/**
 * The exact preset that `DefaultScheduler()` builds, composed synchronously.
 *
 * `DefaultScheduler()` is async only because it dynamically imports the model
 * file, and it probes the version with `Object.hasOwn` (Chrome 93+). A hot path
 * that runs inside a Dexie transaction must be synchronous, and the target
 * device class can have an older WebView, so this module composes the same
 * middlewares and the same FSRS-7 defaults eagerly. The output is identical to
 * `await DefaultScheduler({ enableFuzz: false })`; `tests/core/ReviewScheduler.test.ts`
 * pins that output (D-037).
 */
function createFsrs() {
  const definition = defineScheduler({ model: FSRS7Model, chrono: dateChrono }).use(
    schedulerDesiredRetentionMiddleware,
    schedulerFuzzingMiddleware,
    schedulerStatsMiddleware,
    schedulerScheduledDaysMiddleware,
    schedulerLearningStepsMiddleware,
    schedulerMaximumIntervalMiddleware,
    schedulerMonotonicIntervalMiddleware,
  );

  return definition.create({
    config: {
      fractionalDays: true,
      weights: migrateFSRS7Parameters(),
      enableShortTerm: true,
      desiredRetention: 0.9,
      learningSteps: Array.from(defaultLearningSteps),
      relearningSteps: Array.from(defaultRelearningSteps),
      enableFuzz: false,
      maximumInterval: DEFAULT_MAXIMUM_INTERVAL,
      allowModelOverride: true,
    },
  });
}

type FsrsScheduler = ReturnType<typeof createFsrs>;
type FsrsCard = ReturnType<FsrsScheduler['newCard']>;

const STATE_BY_PHASE: Readonly<Record<CardPhase, State>> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

/** The library only has three statuses; relearning is scheduled like learning. */
const STATUS_BY_PHASE = {
  new: 'new',
  learning: 'learning',
  review: 'review',
  relearning: 'learning',
} as const;

function phaseFromState(state: FsrsCard['state']): CardPhase {
  switch (state) {
    case State.New:
      return 'new';
    case State.Learning:
      return 'learning';
    case State.Review:
      return 'review';
    case State.Relearning:
      return 'relearning';
    default:
      throw new RangeError(`unknown FSRS state ${String(state)}`);
  }
}

/**
 * FSRS-7 scheduling for one question, wrapped so the rest of the app only sees
 * `CardState` (D-037).
 *
 * The class holds a stateless scheduler instance; `review()` returns a new
 * card and never mutates its input. No I/O, so it is testable with fixed
 * timestamps and no database (D-030).
 */
export class ReviewScheduler {
  private static shared: ReviewScheduler | undefined;

  private constructor(private readonly fsrs: FsrsScheduler) {}

  /** Build an independent scheduler. Tests use this; the app uses `.instance`. */
  static create(): ReviewScheduler {
    return new ReviewScheduler(createFsrs());
  }

  /** Process-wide instance. The scheduler is stateless, so sharing is safe. */
  static get instance(): ReviewScheduler {
    ReviewScheduler.shared ??= ReviewScheduler.create();
    return ReviewScheduler.shared;
  }

  /** A fresh card for a question never answered before. */
  newCard(qid: QuestionId, now: number): CardState {
    assertTime(now, 'now');
    if (qid.length === 0) throw new RangeError('qid must not be empty');
    const created = this.fsrs.newCard({ now: new Date(now) });
    return fromFsrsCard(qid, { ...created, cardId: qid });
  }

  /**
   * Apply one answer. A skip is a no-op (D-034), so the same object comes back.
   *
   * `examDeadline` caps the next due date, so FSRS never schedules a revision
   * after the exam. The due date is still kept at or after `now`, because a
   * deadline in the past must not create an instantly overdue card.
   */
  review(card: CardState, outcome: Outcome, now: number, examDeadline?: number): CardState {
    assertTime(now, 'now');
    if (examDeadline !== undefined) assertTime(examDeadline, 'examDeadline');
    if (outcome === 'skip') return card;

    const grade = outcome === 'correct' ? Rating.Good : Rating.Again;
    const { card: next } = this.fsrs.review({ card: toFsrsCard(card), grade, now: new Date(now) });
    const mapped = fromFsrsCard(card.qid, next);
    return { ...mapped, due: capDue(mapped.due, now, examDeadline) };
  }
}

function toFsrsCard(card: CardState): FsrsCard {
  return {
    cardId: card.qid,
    state: STATE_BY_PHASE[card.phase],
    scheduleStatus: STATUS_BY_PHASE[card.phase],
    dueAt: new Date(card.due),
    lastReviewAt: card.lastReview === null ? null : new Date(card.lastReview),
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    reps: card.reps,
    lapses: card.lapses,
  };
}

function fromFsrsCard(qid: QuestionId, card: FsrsCard): CardState {
  return {
    qid,
    due: toMs(card.dueAt, 'dueAt'),
    stability: card.stability,
    stabilityFast: card.stabilityFast,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.lastReviewAt === null ? null : toMs(card.lastReviewAt, 'lastReviewAt'),
    phase: phaseFromState(card.state),
  };
}

function capDue(due: number, now: number, examDeadline: number | undefined): number {
  if (examDeadline === undefined) return due;
  return Math.max(now, Math.min(due, examDeadline));
}

function toMs(value: Date, field: string): number {
  const ms = value.getTime();
  if (!Number.isFinite(ms)) throw new RangeError(`${field} is not a valid date`);
  return ms;
}

function assertTime(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a finite, non-negative epoch-millisecond timestamp`);
  }
}
