import { describe, expect, it } from 'vitest';
import type { QuestionId } from '../../shared/contract';
import { QuestionPicker, type Candidate, type DueCard, type Pick } from '../../src/core/QuestionPicker';

const NO_RECENT: ReadonlySet<QuestionId> = new Set();

function card(qid: string, due: number): DueCard {
  return { qid, due };
}

function candidate(id: string): Candidate {
  return { id };
}

function fixed(value: number): () => number {
  return () => value;
}

function expected(qid: string, reason: 'review' | 'new'): Pick {
  return { qid, reason };
}

describe('QuestionPicker.pick — reviews', () => {
  it('serves a due card before any new question', () => {
    const due = [card('q1', 100)];
    const fresh = [candidate('q9')];

    expect(QuestionPicker.pick(due, fresh, NO_RECENT, fixed(0))).toEqual(expected('q1', 'review'));
  });

  it('serves the earliest due card regardless of input order', () => {
    const due = [card('q1', 300), card('q2', 100), card('q3', 200)];

    expect(QuestionPicker.pick(due, [], NO_RECENT)).toEqual(expected('q2', 'review'));
    expect(QuestionPicker.pick([...due].reverse(), [], NO_RECENT)).toEqual(expected('q2', 'review'));
  });

  it('breaks a due tie by question id', () => {
    const due = [card('q9', 100), card('q2', 100), card('q5', 100)];

    expect(QuestionPicker.pick(due, [], NO_RECENT)).toEqual(expected('q2', 'review'));
    expect(QuestionPicker.pick([...due].reverse(), [], NO_RECENT)).toEqual(expected('q2', 'review'));
  });

  it('ignores recentIds for reviews', () => {
    const due = [card('q1', 100)];
    const recent = new Set<QuestionId>(['q1']);

    expect(QuestionPicker.pick(due, [], recent)).toEqual(expected('q1', 'review'));
  });

  it('does not call the rng for a review', () => {
    let calls = 0;
    const rng = (): number => {
      calls += 1;
      return 0.5;
    };

    QuestionPicker.pick([card('q1', 100)], [], NO_RECENT, rng);

    expect(calls).toBe(0);
  });

  it('rejects an invalid due timestamp', () => {
    for (const due of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => QuestionPicker.pick([card('q1', due)], [], NO_RECENT)).toThrow(RangeError);
    }
  });
});

describe('QuestionPicker.pick — new questions', () => {
  it('returns null only when there is nothing at all', () => {
    expect(QuestionPicker.pick([], [], NO_RECENT)).toBeNull();
  });

  it('picks uniformly from the sorted candidate list', () => {
    const candidates = [candidate('c'), candidate('a'), candidate('b')];

    expect(QuestionPicker.pick([], candidates, NO_RECENT, fixed(0))).toEqual(expected('a', 'new'));
    expect(QuestionPicker.pick([], candidates, NO_RECENT, fixed(0.34))).toEqual(expected('b', 'new'));
    expect(QuestionPicker.pick([], candidates, NO_RECENT, fixed(0.999))).toEqual(expected('c', 'new'));
  });

  it('is independent of candidate order for the same roll', () => {
    const candidates = [candidate('c'), candidate('a'), candidate('b')];

    expect(QuestionPicker.pick([], [...candidates].reverse(), NO_RECENT, fixed(0.5))).toEqual(
      QuestionPicker.pick([], candidates, NO_RECENT, fixed(0.5)),
    );
  });

  it('filters recent questions out of the new pool', () => {
    const candidates = [candidate('a'), candidate('b'), candidate('c')];
    const recent = new Set<QuestionId>(['a', 'b']);

    expect(QuestionPicker.pick([], candidates, recent, fixed(0))).toEqual(expected('c', 'new'));
    expect(QuestionPicker.pick([], candidates, recent, fixed(0.999))).toEqual(expected('c', 'new'));
  });

  it('falls back to a recent question when every candidate is recent', () => {
    const candidates = [candidate('a'), candidate('b')];
    const recent = new Set<QuestionId>(['a', 'b']);

    expect(QuestionPicker.pick([], candidates, recent, fixed(0))).toEqual(expected('a', 'new'));
  });

  it('counts a duplicate candidate once', () => {
    const candidates = [candidate('a'), candidate('b'), candidate('a')];

    expect(QuestionPicker.pick([], candidates, NO_RECENT, fixed(0.5))).toEqual(expected('b', 'new'));
  });

  it('calls the rng exactly once', () => {
    let calls = 0;
    const rng = (): number => {
      calls += 1;
      return 0.5;
    };

    QuestionPicker.pick([], [candidate('a')], NO_RECENT, rng);

    expect(calls).toBe(1);
  });

  it('rejects an rng result outside [0, 1)', () => {
    for (const value of [-0.01, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => QuestionPicker.pick([], [candidate('a')], NO_RECENT, fixed(value))).toThrow(RangeError);
    }
  });

  it('does not mutate its inputs', () => {
    const due: readonly DueCard[] = Object.freeze([card('q2', 200), card('q1', 100)]);
    const candidates: readonly Candidate[] = Object.freeze([candidate('c'), candidate('a'), candidate('b')]);
    const recent = new Set<QuestionId>(['c']);

    QuestionPicker.pick(due, candidates, recent, fixed(0));

    expect(due.map((entry) => entry.qid)).toEqual(['q2', 'q1']);
    expect(candidates.map((entry) => entry.id)).toEqual(['c', 'a', 'b']);
    expect([...recent]).toEqual(['c']);
  });
});
