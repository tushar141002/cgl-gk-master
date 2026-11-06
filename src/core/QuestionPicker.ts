import type { QuestionId } from '../../shared/contract';

/** The part of a card the picker needs: its question and when it is due. */
export interface DueCard {
  readonly qid: QuestionId;
  readonly due: number;
}

/** A question that is eligible to be served for the first time. */
export interface Candidate {
  readonly id: QuestionId;
}

export type PickReason = 'review' | 'new';

export interface Pick {
  readonly qid: QuestionId;
  readonly reason: PickReason;
}

/**
 * Chooses the next question (D-045, D-046).
 *
 * Due reviews come first, earliest `due` first, with a tie broken by question
 * id so a rebuild is deterministic. Only when nothing is due does it serve a
 * new question, uniformly at random from the eligible candidates. `recentIds`
 * filters new questions only: applying it to reviews would block the
 * 10-minute relearning card the student just answered.
 *
 * Pure: the caller supplies the due cards and candidates it read and writes the
 * selection itself. `rng` is injectable so tests are deterministic.
 */
export class QuestionPicker {
  private constructor() {}

  static pick(
    dueCards: readonly DueCard[],
    candidates: readonly Candidate[],
    recentIds: ReadonlySet<QuestionId>,
    rng: () => number = Math.random,
  ): Pick | null {
    if (dueCards.length > 0) {
      const next = earliestDue(dueCards);
      return { qid: next.qid, reason: 'review' };
    }
    if (candidates.length === 0) return null;

    const unique = dedupe(candidates);
    const fresh = unique.filter((candidate) => !recentIds.has(candidate.id));

    // If every remaining question is recent, serve one anyway: a tiny sub-topic
    // must not dead-end, and "finished" means the list is truly empty (D-046).
    const pool = fresh.length > 0 ? fresh : unique;
    pool.sort((a, b) => compareText(a.id, b.id));

    const roll = randomInUnitInterval(rng);
    return { qid: pool[Math.floor(roll * pool.length)]!.id, reason: 'new' };
  }
}

function earliestDue(cards: readonly DueCard[]): DueCard {
  let best: DueCard | undefined;
  for (const card of cards) {
    assertDue(card);
    if (
      best === undefined ||
      card.due < best.due ||
      (card.due === best.due && compareText(card.qid, best.qid) < 0)
    ) {
      best = card;
    }
  }
  return best!;
}

/** One entry per question id, keeping the first occurrence. */
function dedupe(candidates: readonly Candidate[]): Candidate[] {
  const seen = new Set<QuestionId>();
  const unique: Candidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    unique.push(candidate);
  }
  return unique;
}

function randomInUnitInterval(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`rng must return a number in [0, 1) (got ${String(value)})`);
  }
  return value;
}

function assertDue(card: DueCard): void {
  if (!Number.isFinite(card.due) || card.due < 0) {
    throw new RangeError(
      `due must be a finite, non-negative epoch-millisecond timestamp (got ${String(card.due)} for "${card.qid}")`,
    );
  }
}

/** Locale-independent ordering, so device language never changes the pick. */
function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
