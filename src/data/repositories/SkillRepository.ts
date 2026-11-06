import type { Skill, SubtopicId } from '../../../shared/contract';
import type { AppDatabase, SkillRow } from '../database';

/** Derived Elo rating per sub-topic (D-033). */
export class SkillRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(subtopicId: SubtopicId): Promise<SkillRow | undefined> {
    return this.db.skills.get(subtopicId);
  }

  async put(skill: Skill): Promise<void> {
    await this.db.skills.put(skill);
  }

  async putMany(skills: readonly Skill[]): Promise<void> {
    await this.db.skills.bulkPut([...skills]);
  }

  async all(): Promise<SkillRow[]> {
    return this.db.skills.toArray();
  }
}
