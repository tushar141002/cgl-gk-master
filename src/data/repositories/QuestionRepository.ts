import type { Question, QuestionId, SectionId, SubtopicId } from '../../../shared/contract';
import type { AppDatabase, QuestionRow } from '../database';

/** What `AdaptiveEngine.targetRange` hands to the picker (D-044..D-046). */
export interface CandidateQuery {
  readonly section: SectionId;
  readonly subtopic?: SubtopicId;
  readonly minElo: number;
  readonly maxElo: number;
  readonly limit: number;
  /** Recent qids the caller does not want to see again yet (D-046). */
  readonly excludeIds?: readonly QuestionId[];
}

/** Read-only access to the installed question bank. */
export class QuestionRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(id: QuestionId): Promise<Question | undefined> {
    return this.db.questions.get(id);
  }

  async count(): Promise<number> {
    return this.db.questions.count();
  }

  /** Installs or replaces questions from one pack (idempotent by id). */
  async putMany(questions: readonly Question[]): Promise<void> {
    await this.db.questions.bulkPut([...questions]);
  }

  /** Replaces every question in a pack, inside the caller's transaction. */
  async replacePack(packId: string, questions: readonly Question[]): Promise<void> {
    await this.db.questions.where('packId').equals(packId).delete();
    if (questions.length > 0) await this.db.questions.bulkPut([...questions]);
  }

  /** All questions in one sub-topic, regardless of Elo band. */
  async bySubtopic(subtopic: SubtopicId): Promise<QuestionRow[]> {
    return this.db.questions.where('subtopic').equals(subtopic).toArray();
  }

  async all(): Promise<QuestionRow[]> {
    return this.db.questions.toArray();
  }

  /**
   * Questions in one section and Elo band, in key order. The caller filters by
   * `excludeIds`; the query limit is intentionally left to the loop so a band
   * that is mostly recent questions still returns what exists.
   */
  async candidates(query: CandidateQuery): Promise<QuestionRow[]> {
    const excluded = new Set(query.excludeIds ?? []);
    const found: QuestionRow[] = [];

    const visit = (row: QuestionRow): void => {
      if (found.length >= query.limit) return;
      if (excluded.has(row.id)) return;
      found.push(row);
    };

    if (query.subtopic === undefined) {
      await this.db.questions
        .where('[section+eloSeed]')
        .between([query.section, query.minElo], [query.section, query.maxElo], true, true)
        .each(visit);
    } else {
      await this.db.questions
        .where('[section+subtopic+eloSeed]')
        .between(
          [query.section, query.subtopic, query.minElo],
          [query.section, query.subtopic, query.maxElo],
          true,
          true,
        )
        .each(visit);
    }

    return found;
  }
}
