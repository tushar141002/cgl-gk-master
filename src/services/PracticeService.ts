import type {
  AttemptId,
  AttemptRecord,
  DeviceId,
  OptionIndex,
  Question as QuestionRecord,
  QuestionId,
  SubtopicId,
} from '../../shared/contract';
import { istDayKey } from '../../shared/contract';
import { uuidV7 } from '../../shared/uuid';
import { AdaptiveEngine, MAX_RANGE_STEP } from '../core/AdaptiveEngine';
import { Attempt } from '../core/Attempt';
import { newSkill, updateSkill, type Outcome } from '../core/EloRating';
import { QuestionPicker, type PickReason } from '../core/QuestionPicker';
import { ReviewScheduler } from '../core/ReviewScheduler';
import { StreakTracker } from '../core/StreakTracker';
import type { AppDatabase } from '../data/database';
import { AttemptRepository } from '../data/repositories/AttemptRepository';
import { CardRepository } from '../data/repositories/CardRepository';
import { DailyRepository } from '../data/repositories/DailyRepository';
import { QuestionRepository } from '../data/repositories/QuestionRepository';
import { SkillRepository } from '../data/repositories/SkillRepository';

/** D-046: the last 30 answered questions are hidden from new-question picks. */
export const RECENT_WINDOW = 30;

export interface PracticeQuestion {
  readonly question: QuestionRecord;
  readonly reason: PickReason;
}

export interface PracticeFeedback {
  readonly attempt: AttemptRecord;
  readonly question: QuestionRecord;
  readonly skipped: boolean;
  readonly correct: boolean;
  /** Time the student spent on the question, in milliseconds. */
  readonly ms: number;
}

export interface PracticeServiceOptions {
  readonly deviceId: DeviceId;
  readonly now?: () => number;
  readonly rng?: () => number;
  readonly newId?: (at: number) => AttemptId;
  readonly scheduler?: ReviewScheduler;
}

/**
 * One practice answer, start to finish (F2, F3).
 *
 * The screen asks for a question, then submits the tap with the time it took.
 * Everything that follows — the attempt row, FSRS card, Elo skill and IST daily
 * counter — is written in one transaction, so a crash cannot leave the derived
 * state disagreeing with the log. The UI never sees Dexie.
 */
export class PracticeService {
  private readonly attempts: AttemptRepository;
  private readonly cards: CardRepository;
  private readonly skills: SkillRepository;
  private readonly daily: DailyRepository;
  private readonly questions: QuestionRepository;
  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly newId: (at: number) => AttemptId;
  private readonly scheduler: ReviewScheduler;

  constructor(
    private readonly db: AppDatabase,
    private readonly options: PracticeServiceOptions,
  ) {
    this.attempts = new AttemptRepository(db);
    this.cards = new CardRepository(db);
    this.skills = new SkillRepository(db);
    this.daily = new DailyRepository(db);
    this.questions = new QuestionRepository(db);
    this.now = options.now ?? Date.now;
    this.rng = options.rng ?? Math.random;
    this.newId = options.newId ?? ((at) => uuidV7(at));
    this.scheduler = options.scheduler ?? ReviewScheduler.instance;
  }

  /**
   * The next question for one sub-topic: a due review first, otherwise a new
   * question from the student's Elo band, widening when the band is empty.
   */
  async next(subtopic: SubtopicId): Promise<PracticeQuestion | null> {
    const rows = await this.questions.bySubtopic(subtopic);
    if (rows.length === 0) return null;

    const section = rows[0]!.section;
    const available = new Set(rows.map((row) => row.id));
    const now = this.now();
    const cards = await this.cards.all();
    const scheduled = new Set(cards.map((card) => card.qid));

    const due = cards
      .filter((card) => available.has(card.qid) && card.due <= now)
      .sort((a, b) => a.due - b.due || a.qid.localeCompare(b.qid));
    for (const card of due) {
      const question = await this.questions.get(card.qid);
      if (question !== undefined) return { question, reason: 'review' };
    }

    const skill = (await this.skills.get(subtopic)) ?? newSkill(subtopic);
    const recent = new Set<QuestionId>(await this.attempts.recentQids(RECENT_WINDOW));

    for (let step = 0; step <= MAX_RANGE_STEP; step += 1) {
      const range = AdaptiveEngine.targetRange(skill, step);
      const candidates = await this.questions.candidates({
        section,
        subtopic,
        minElo: range.min,
        maxElo: range.max,
        limit: 200,
      });
      // A card that is scheduled but not due is still "known"; serving it as a
      // new question would skip its revision interval.
      const fresh = candidates.filter((candidate) => !scheduled.has(candidate.id));
      if (fresh.length === 0) continue;

      const pick = QuestionPicker.pick(
        [],
        fresh.map((candidate) => ({ id: candidate.id })),
        recent,
        this.rng,
      );
      if (pick === null) continue;

      const question = await this.questions.get(pick.qid);
      if (question !== undefined) return { question, reason: pick.reason };
    }

    return null;
  }

  /**
   * Grade one tap and persist everything atomically.
   *
   * `chosen === null` is a skip: the attempt is logged, the day gets a zero row
   * if it had none, and Elo/FSRS are untouched (D-034, D-043).
   */
  async answer(
    question: QuestionRecord,
    chosen: OptionIndex | null,
    ms: number,
    examDeadline?: number,
  ): Promise<PracticeFeedback> {
    const at = this.now();
    const attemptValue = Attempt.create(question, chosen, ms, {
      id: this.newId(at),
      deviceId: this.options.deviceId,
      mode: 'practice',
      at,
    });
    const attempt = attemptValue.record;
    const skipped = attemptValue.isSkip;
    const outcome: Outcome = skipped ? 'skip' : attempt.correct ? 'correct' : 'wrong';

    // Reads and writes share one transaction, so a second answer cannot slip
    // between reading the derived state and replacing it (D-060). Everything
    // awaited below is a Dexie operation; FSRS and Elo stay pure.
    await this.db.transaction(
      'rw',
      this.db.attempts,
      this.db.cardState,
      this.db.skills,
      this.db.dailySummary,
      async () => {
        await this.attempts.append(attempt);

        if (!skipped) {
          const card = (await this.cards.get(question.id)) ?? this.scheduler.newCard(question.id, at);
          await this.cards.put(this.scheduler.review(card, outcome, at, examDeadline));

          const skill = (await this.skills.get(question.subtopic)) ?? newSkill(question.subtopic);
          await this.skills.put(updateSkill(skill, question.eloSeed, outcome));
        }

        const today = (await this.daily.get(istDayKey(at))) ?? null;
        await this.daily.put(StreakTracker.apply(attempt, today));
      },
    );

    return { attempt, question, skipped, correct: attempt.correct, ms };
  }
}
