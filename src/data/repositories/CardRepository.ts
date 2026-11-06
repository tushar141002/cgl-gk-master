import type { CardState, QuestionId } from '../../../shared/contract';
import type { AppDatabase, CardStateRow } from '../database';

/** Derived FSRS-7 state (D-037). Rebuilt by replay, written after each review. */
export class CardRepository {
  constructor(private readonly db: AppDatabase) {}

  async get(qid: QuestionId): Promise<CardStateRow | undefined> {
    return this.db.cardState.get(qid);
  }

  async put(card: CardState): Promise<void> {
    await this.db.cardState.put(card);
  }

  async putMany(cards: readonly CardState[]): Promise<void> {
    await this.db.cardState.bulkPut([...cards]);
  }

  /** Earliest due first; equal due dates break by qid so order is stable (D-045). */
  async dueCards(now: number): Promise<CardStateRow[]> {
    const cards = await this.db.cardState.where('due').belowOrEqual(now).toArray();
    return cards.sort((a, b) => a.due - b.due || a.qid.localeCompare(b.qid));
  }

  async count(): Promise<number> {
    return this.db.cardState.count();
  }

  /** Every scheduled card, for filters that must not re-serve a non-due card. */
  async all(): Promise<CardStateRow[]> {
    return this.db.cardState.toArray();
  }
}
