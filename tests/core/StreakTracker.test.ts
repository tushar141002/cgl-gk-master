import { describe, expect, it } from 'vitest';
import type { AttemptRecord, DailySummary, OptionIndex } from '../../shared/contract';
import { StreakTracker } from '../../src/core/StreakTracker';

const T0 = Date.parse('2026-11-04T06:00:00.000Z');

let sequence = 0;

function rec(at: number, chosen: OptionIndex | null, ms = 1000, correct = chosen === 0): AttemptRecord {
  sequence += 1;
  return {
    id: `attempt-${String(sequence).padStart(4, '0')}`,
    qid: 'q1',
    qv: 1,
    chosen,
    correct,
    ms,
    mode: 'practice',
    at,
    deviceId: 'device-1',
  };
}

function day(date: string, attempted: number, correct = attempted, ms = attempted * 1000): DailySummary {
  return { date, attempted, correct, ms };
}

describe('StreakTracker.apply', () => {
  it('starts a new day from the first answer', () => {
    expect(StreakTracker.apply(rec(T0, 0, 1500), null)).toEqual({
      date: '2026-11-04',
      attempted: 1,
      correct: 1,
      ms: 1500,
    });
  });

  it('accumulates answers within the day', () => {
    const first = StreakTracker.apply(rec(T0, 0, 1200), null);
    const second = StreakTracker.apply(rec(T0 + 60_000, 1, 800), first);
    const third = StreakTracker.apply(rec(T0 + 120_000, 0, 1000), second);

    expect(third).toEqual({ date: '2026-11-04', attempted: 3, correct: 2, ms: 3000 });
  });

  it('does not mutate the summary it is given', () => {
    const summary = Object.freeze(day('2026-11-04', 4, 3, 5000));
    const next = StreakTracker.apply(rec(T0, 0, 900), summary);

    expect(summary).toEqual(day('2026-11-04', 4, 3, 5000));
    expect(next).not.toBe(summary);
    expect(next).toEqual(day('2026-11-04', 5, 4, 5900));
  });

  it('counts nothing for a skip, but still creates the day row', () => {
    const skipped = rec(T0, null, 4000);

    expect(StreakTracker.apply(skipped, null)).toEqual(day('2026-11-04', 0, 0, 0));

    const existing = day('2026-11-04', 2, 2, 2500);
    expect(StreakTracker.apply(skipped, existing)).toBe(existing);
  });

  it('uses the IST day, not UTC', () => {
    const lastMinute = Date.parse('2026-11-04T18:29:59.999Z');
    const midnight = Date.parse('2026-11-04T18:30:00.000Z');

    expect(StreakTracker.apply(rec(lastMinute, 0), null).date).toBe('2026-11-04');
    expect(StreakTracker.apply(rec(midnight, 0), null).date).toBe('2026-11-05');
  });

  it('refuses a summary from another day', () => {
    expect(() => StreakTracker.apply(rec(T0, 0), day('2026-11-03', 1))).toThrow(RangeError);
  });

  it('refuses a negative duration', () => {
    expect(() => StreakTracker.apply(rec(T0, 0, -1), null)).toThrow(RangeError);
  });
});

describe('StreakTracker.evaluate', () => {
  it('returns zero for an empty log', () => {
    expect(StreakTracker.evaluate([], '2026-11-04')).toEqual({ current: 0, doneToday: false });
  });

  it('counts consecutive days ending today', () => {
    const summaries = [day('2026-11-02', 5), day('2026-11-03', 3), day('2026-11-04', 1)];

    expect(StreakTracker.evaluate(summaries, '2026-11-04')).toEqual({
      current: 3,
      doneToday: true,
    });
  });

  it('keeps the streak alive until midnight when today is not done', () => {
    const summaries = [day('2026-11-02', 5), day('2026-11-03', 3)];

    expect(StreakTracker.evaluate(summaries, '2026-11-04')).toEqual({
      current: 2,
      doneToday: false,
    });
  });

  it('counts only today when yesterday is missing', () => {
    expect(StreakTracker.evaluate([day('2026-11-04', 1)], '2026-11-04')).toEqual({
      current: 1,
      doneToday: true,
    });
  });

  it('breaks the streak at a missing day', () => {
    const summaries = [day('2026-11-01', 4), day('2026-11-03', 4), day('2026-11-04', 4)];

    expect(StreakTracker.evaluate(summaries, '2026-11-04')).toEqual({
      current: 2,
      doneToday: true,
    });
  });

  it('breaks the streak at a day with only skips', () => {
    const summaries = [day('2026-11-03', 0, 0, 0), day('2026-11-04', 2)];

    expect(StreakTracker.evaluate(summaries, '2026-11-04')).toEqual({
      current: 1,
      doneToday: true,
    });
  });

  it('does not depend on the order of the rows', () => {
    const summaries = [day('2026-11-02', 1), day('2026-11-03', 1), day('2026-11-04', 1)];

    expect(StreakTracker.evaluate([...summaries].reverse(), '2026-11-04')).toEqual(
      StreakTracker.evaluate(summaries, '2026-11-04'),
    );
  });

  it('crosses month, year and leap-day boundaries', () => {
    expect(StreakTracker.evaluate([day('2026-10-31', 1), day('2026-11-01', 1)], '2026-11-01')).toEqual({
      current: 2,
      doneToday: true,
    });

    expect(StreakTracker.evaluate([day('2026-12-31', 1), day('2027-01-01', 1)], '2027-01-01')).toEqual({
      current: 2,
      doneToday: true,
    });

    expect(StreakTracker.evaluate([day('2028-02-28', 1), day('2028-02-29', 1)], '2028-02-29')).toEqual({
      current: 2,
      doneToday: true,
    });
  });

  it('rejects duplicate days', () => {
    expect(() => StreakTracker.evaluate([day('2026-11-04', 1), day('2026-11-04', 2)], '2026-11-04')).toThrow(
      RangeError,
    );
  });

  it('rejects a malformed or impossible today key', () => {
    expect(() => StreakTracker.evaluate([], '2026-1-1')).toThrow(RangeError);
    expect(() => StreakTracker.evaluate([], '2026-13-01')).toThrow(RangeError);
    expect(() => StreakTracker.evaluate([], '2026-02-30')).toThrow(RangeError);
  });
});

describe('StreakTracker.goalMet', () => {
  it('compares the day total with the goal', () => {
    expect(StreakTracker.goalMet(null, 10)).toBe(false);
    expect(StreakTracker.goalMet(day('2026-11-04', 9), 10)).toBe(false);
    expect(StreakTracker.goalMet(day('2026-11-04', 10), 10)).toBe(true);
    expect(StreakTracker.goalMet(day('2026-11-04', 12), 10)).toBe(true);
    expect(StreakTracker.goalMet(day('2026-11-04', 1), 1)).toBe(true);
  });

  it('rejects a goal that is not a positive integer', () => {
    expect(() => StreakTracker.goalMet(null, 0)).toThrow(RangeError);
    expect(() => StreakTracker.goalMet(null, -5)).toThrow(RangeError);
    expect(() => StreakTracker.goalMet(null, 2.5)).toThrow(RangeError);
  });
});
