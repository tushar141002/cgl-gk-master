import { SECTION_IDS, istDayKey, type SectionId, type SubtopicId } from '../../shared/contract';
import { DEFAULT_RATING } from '../core/EloRating';
import { StreakTracker } from '../core/StreakTracker';
import type { AppDatabase } from '../data/database';
import { CardRepository } from '../data/repositories/CardRepository';
import { DailyRepository } from '../data/repositories/DailyRepository';
import { QuestionRepository } from '../data/repositories/QuestionRepository';
import { SkillRepository } from '../data/repositories/SkillRepository';

export interface Overview {
  readonly attemptedToday: number;
  readonly correctToday: number;
  /** Consecutive IST days with at least one graded answer. */
  readonly streak: number;
  readonly doneToday: boolean;
  /** Mean of the sub-topic ratings, or 1200 before any answer. */
  readonly averageElo: number;
  readonly dueCount: number;
  readonly questionCount: number;
}

export interface TopicSummary {
  readonly subtopic: SubtopicId;
  readonly section: SectionId;
  readonly count: number;
  readonly elo: number;
}

/**
 * Read-only numbers for Home and the practice chooser.
 *
 * Everything here is derived and can be rebuilt by replay (D-016); nothing is
 * cached, so leaving and re-entering a route always shows the latest answer.
 */
export class ProgressService {
  private readonly daily: DailyRepository;
  private readonly questions: QuestionRepository;
  private readonly skills: SkillRepository;
  private readonly cards: CardRepository;

  constructor(
    db: AppDatabase,
    private readonly now: () => number = Date.now,
  ) {
    this.daily = new DailyRepository(db);
    this.questions = new QuestionRepository(db);
    this.skills = new SkillRepository(db);
    this.cards = new CardRepository(db);
  }

  async overview(): Promise<Overview> {
    const at = this.now();
    const todayKey = istDayKey(at);
    const summaries = await this.daily.all();
    const today = summaries.find((summary) => summary.date === todayKey) ?? null;
    const streak = StreakTracker.evaluate(summaries, todayKey);
    const skills = await this.skills.all();

    const averageElo =
      skills.length === 0
        ? DEFAULT_RATING
        : Math.round(skills.reduce((sum, skill) => sum + skill.elo, 0) / skills.length);

    return {
      attemptedToday: today?.attempted ?? 0,
      correctToday: today?.correct ?? 0,
      streak: streak.current,
      doneToday: streak.doneToday,
      averageElo,
      dueCount: (await this.cards.dueCards(at)).length,
      questionCount: await this.questions.count(),
    };
  }

  /** One row per installed sub-topic, ordered by section then id. */
  async topics(): Promise<TopicSummary[]> {
    const [questions, skills] = await Promise.all([this.questions.all(), this.skills.all()]);
    const ratings = new Map(skills.map((skill) => [skill.subtopicId, skill.elo]));
    const grouped = new Map<SubtopicId, { section: SectionId; count: number }>();

    for (const question of questions) {
      const existing = grouped.get(question.subtopic);
      if (existing === undefined) {
        grouped.set(question.subtopic, { section: question.section, count: 1 });
      } else {
        existing.count += 1;
      }
    }

    return [...grouped.entries()]
      .map(([subtopic, value]) => ({
        subtopic,
        section: value.section,
        count: value.count,
        elo: ratings.get(subtopic) ?? DEFAULT_RATING,
      }))
      .sort(
        (a, b) =>
          SECTION_IDS.indexOf(a.section) - SECTION_IDS.indexOf(b.section) ||
          compareText(a.subtopic, b.subtopic),
      );
  }
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
