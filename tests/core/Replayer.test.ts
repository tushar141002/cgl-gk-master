import { describe, expect, it } from 'vitest';
import {
  encodeCursor,
  type AttemptRecord,
  type Checkpoint,
  type OptionIndex,
  type QuestionId,
} from '../../shared/contract';
import { DEFAULT_RATING, newSkill, updateSkill } from '../../src/core/EloRating';
import { Replayer, type ReplayIndex, type ReplayQuestion } from '../../src/core/Replayer';
import { ReviewScheduler } from '../../src/core/ReviewScheduler';

const T0 = Date.parse('2026-11-04T06:00:00.000Z');
const DAY = 86_400_000;
const MINUTE = 60_000;

let sequence = 0;

function rec(
  qid: string,
  at: number,
  chosen: OptionIndex | null,
  overrides: Partial<AttemptRecord> = {},
): AttemptRecord {
  sequence += 1;
  return {
    id: `attempt-${String(sequence).padStart(4, '0')}`,
    qid,
    qv: 1,
    chosen,
    correct: chosen === 0,
    ms: 1200,
    mode: 'practice',
    at,
    deviceId: 'device-1',
    ...overrides,
  };
}

interface QuestionSpec {
  readonly subtopic?: string;
  readonly rating?: number;
  readonly answers?: ReadonlyArray<readonly [number, OptionIndex]>;
}

function indexOf(entries: Record<string, QuestionSpec>): ReplayIndex {
  const index = new Map<QuestionId, ReplayQuestion>();
  for (const [qid, spec] of Object.entries(entries)) {
    index.set(qid, {
      subtopicId: spec.subtopic ?? 'polity',
      rating: spec.rating ?? DEFAULT_RATING,
      answersByVersion: spec.answers ? new Map(spec.answers) : new Map<number, OptionIndex>([[1, 0]]),
    });
  }
  return index;
}

function checkpointOf(
  attempts: readonly AttemptRecord[],
  last: AttemptRecord,
  index: ReplayIndex,
): Checkpoint {
  const prefix = Replayer.rebuild(attempts, null, index);
  return {
    cursor: encodeCursor(last.at, last.id),
    cardStates: prefix.cards,
    skills: prefix.skills,
    istDailyTotals: [],
    createdAt: new Date(last.at).toISOString(),
  };
}

describe('Replayer.rebuild', () => {
  it('returns nothing for an empty log', () => {
    expect(Replayer.rebuild([], null, indexOf({}))).toEqual({ cards: [], skills: [] });
  });

  it('matches live play attempt by attempt', () => {
    const first = rec('q1', T0, 0);
    const second = rec('q1', T0 + DAY, 1);
    const result = Replayer.rebuild([first, second], null, indexOf({ q1: {} }));

    const scheduler = ReviewScheduler.instance;
    const liveFirst = scheduler.review(scheduler.newCard('q1', T0), 'correct', T0);
    const liveCard = scheduler.review(liveFirst, 'wrong', T0 + DAY);

    let liveSkill = updateSkill(newSkill('polity'), DEFAULT_RATING, 'correct');
    liveSkill = updateSkill(liveSkill, DEFAULT_RATING, 'wrong');

    expect(result.cards).toEqual([liveCard]);
    expect(result.cards[0]?.phase).toBe('relearning');
    expect(result.cards[0]?.due).toBe(T0 + DAY + 10 * MINUTE);
    expect(result.skills).toEqual([liveSkill]);
  });

  it('folds sub-topics in global time order, not per question', () => {
    const attempts = [rec('q1', T0, 0), rec('q2', T0 + 1, 1), rec('q1', T0 + 2, 1)];
    const result = Replayer.rebuild(attempts, null, indexOf({ q1: {}, q2: {} }));

    let live = updateSkill(newSkill('polity'), DEFAULT_RATING, 'correct');
    live = updateSkill(live, DEFAULT_RATING, 'wrong');
    live = updateSkill(live, DEFAULT_RATING, 'wrong');

    expect(result.skills).toEqual([live]);
    expect(result.cards.map((card) => card.qid)).toEqual(['q1', 'q2']);
  });

  it('is independent of where the checkpoint was taken', () => {
    const attempts = [rec('q1', T0, 0), rec('q1', T0 + DAY, 0), rec('q1', T0 + 3 * DAY, 1)];
    const index = indexOf({ q1: {} });

    const full = Replayer.rebuild(attempts, null, index);
    const checkpoint = checkpointOf(attempts.slice(0, 2), attempts[1]!, index);
    const resumed = Replayer.rebuild(attempts, checkpoint, index);

    expect(resumed).toEqual(full);
    expect(resumed.cards[0]?.reps).toBe(3);
  });

  it('keeps the checkpoint state when nothing follows the cursor', () => {
    const attempts = [rec('q1', T0, 0), rec('q2', T0 + 1, 0)];
    const index = indexOf({ q1: {}, q2: {} });
    const checkpoint = checkpointOf(attempts, attempts[1]!, index);

    expect(Replayer.rebuild(attempts, checkpoint, index)).toEqual(Replayer.rebuild(attempts, null, index));
    expect(Replayer.rebuild([], checkpoint, index).cards).toHaveLength(2);
  });

  it('includes attempts strictly after the cursor and breaks ties by id', () => {
    const before = rec('before', T0, 0, { id: 'a' });
    const atCursor = rec('at-cursor', T0, 0, { id: 'b' });
    const after = rec('after', T0, 0, { id: 'c' });
    const later = rec('later', T0 + 1, 0, { id: 'd' });
    const index = indexOf({ before: {}, 'at-cursor': {}, after: {}, later: {} });

    const prefix = Replayer.rebuild([before, atCursor], null, index);
    const checkpoint: Checkpoint = {
      cursor: encodeCursor(atCursor.at, atCursor.id),
      cardStates: prefix.cards,
      skills: prefix.skills,
      istDailyTotals: [],
      createdAt: new Date(atCursor.at).toISOString(),
    };

    const rest = Replayer.rebuild([before, atCursor, after, later], checkpoint, index);
    const full = Replayer.rebuild([before, atCursor, after, later], null, index);

    expect(rest).toEqual(full);
    expect(rest.cards.find((card) => card.qid === 'at-cursor')?.reps).toBe(1);
    expect(rest.cards.find((card) => card.qid === 'after')?.reps).toBe(1);
    expect(rest.cards.find((card) => card.qid === 'later')?.reps).toBe(1);
  });

  it('de-duplicates by attempt id', () => {
    const attempt = rec('q1', T0, 0);
    const index = indexOf({ q1: {} });

    const once = Replayer.rebuild([attempt], null, index);
    const twice = Replayer.rebuild([attempt, attempt, attempt], null, index);

    expect(twice).toEqual(once);
    expect(twice.cards[0]?.reps).toBe(1);
  });

  it('is independent of input order', () => {
    const attempts = [rec('q1', T0, 0), rec('q2', T0 + 1, 1), rec('q1', T0 + 2, 0), rec('q2', T0 + 3, 0)];
    const index = indexOf({ q1: {}, q2: {} });

    expect(Replayer.rebuild([...attempts].reverse(), null, index)).toEqual(
      Replayer.rebuild(attempts, null, index),
    );
  });

  it('treats a skip as a no-op for an existing card and skill', () => {
    const answered = rec('q1', T0, 0);
    const skipped = rec('q1', T0 + DAY, null, { correct: false });
    const index = indexOf({ q1: {} });

    expect(Replayer.rebuild([answered, skipped], null, index)).toEqual(
      Replayer.rebuild([answered], null, index),
    );
  });

  it('creates a new card but no skill when the only attempt is a skip', () => {
    const result = Replayer.rebuild([rec('q1', T0, null, { correct: false })], null, indexOf({ q1: {} }));

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.phase).toBe('new');
    expect(result.cards[0]?.due).toBe(T0);
    expect(result.skills).toEqual([]);
  });

  it('re-grades through the versioned answer key (D-039)', () => {
    const attempt = rec('q1', T0, 1, { correct: true });
    const before = Replayer.rebuild([attempt], null, indexOf({ q1: { answers: [[1, 1]] } }));
    const after = Replayer.rebuild([attempt], null, indexOf({ q1: { answers: [[1, 2]] } }));

    expect(before.cards[0]?.phase).toBe('review');
    expect(before.skills[0]?.elo).toBeGreaterThan(DEFAULT_RATING);

    expect(after.cards[0]?.phase).toBe('learning');
    expect(after.skills[0]?.elo).toBeLessThan(DEFAULT_RATING);
  });

  it('falls back to the stored verdict when the version has no key', () => {
    const attempt = rec('q1', T0, 1, { correct: true });

    expect(Replayer.rebuild([attempt], null, indexOf({ q1: { answers: [] } }))).toEqual(
      Replayer.rebuild([attempt], null, indexOf({ q1: { answers: [[1, 1]] } })),
    );
  });

  it('rebuilds a card for a question missing from the index but skips Elo', () => {
    const result = Replayer.rebuild([rec('retired', T0, 0)], null, indexOf({}));

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.qid).toBe('retired');
    expect(result.skills).toEqual([]);
  });

  it('applies the exam deadline exactly like live play', () => {
    const examDeadline = T0 + DAY;
    const result = Replayer.rebuild([rec('q1', T0, 0)], null, indexOf({ q1: {} }), {
      examDeadline,
    });

    expect(result.cards[0]?.due).toBe(examDeadline);
  });

  it('rejects a malformed cursor even when no attempt follows it', () => {
    const checkpoint: Checkpoint = {
      cursor: 'not-a-cursor',
      cardStates: [],
      skills: [],
      istDailyTotals: [],
      createdAt: new Date(T0).toISOString(),
    };

    expect(() => Replayer.rebuild([], checkpoint, indexOf({}))).toThrow(RangeError);
  });

  it('rejects a checkpoint with duplicate cards or skills', () => {
    const card = Replayer.rebuild([rec('q1', T0, 0)], null, indexOf({ q1: {} })).cards[0]!;
    const skill = newSkill('polity');
    const base = {
      cursor: encodeCursor(T0, 'a'),
      istDailyTotals: [],
      createdAt: new Date(T0).toISOString(),
    } as const;

    expect(() =>
      Replayer.rebuild([], { ...base, cardStates: [card, card], skills: [] }, indexOf({})),
    ).toThrow(RangeError);
    expect(() =>
      Replayer.rebuild([], { ...base, cardStates: [], skills: [skill, skill] }, indexOf({})),
    ).toThrow(RangeError);
  });

  it('rejects a negative exam deadline', () => {
    expect(() => Replayer.rebuild([], null, indexOf({}), { examDeadline: -1 })).toThrow(RangeError);
  });
});

describe('Replayer.regrade', () => {
  it('flips the verdict, leaves skips alone and counts the changes', () => {
    const attempts = [rec('q1', T0, 0), rec('q1', T0 + 1, 1), rec('q1', T0 + 2, null, { correct: false })];

    const result = Replayer.regrade(attempts, 1);

    expect(result.changed).toBe(2);
    expect(result.attempts.map((attempt) => attempt.correct)).toEqual([false, true, false]);
    expect(result.attempts[2]).toBe(attempts[2]);
    expect(attempts[0]?.correct).toBe(true);
    expect(result.attempts[0]?.id).toBe(attempts[0]?.id);
    expect(result.attempts[0]?.qv).toBe(1);
  });

  it('returns an empty result for an empty log', () => {
    expect(Replayer.regrade([], 0)).toEqual({ attempts: [], changed: 0 });
  });

  it('rejects attempts from different questions', () => {
    expect(() => Replayer.regrade([rec('q1', T0, 0), rec('q2', T0 + 1, 0)], 0)).toThrow(RangeError);
  });

  it('rejects an option index outside 0-3', () => {
    expect(() => Replayer.regrade([], 5 as OptionIndex)).toThrow(RangeError);
  });
});
