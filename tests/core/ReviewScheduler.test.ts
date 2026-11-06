import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CardState } from '../../shared/contract';
import { ReviewScheduler } from '../../src/core/ReviewScheduler';

const T0 = Date.parse('2026-11-04T06:00:00.000Z');
const T1 = Date.parse('2026-11-10T06:00:00.000Z');
const DAY = 86_400_000;
const MINUTE = 60_000;

let scheduler: ReviewScheduler;

beforeAll(() => {
  scheduler = ReviewScheduler.create();
});

function freshCard(now = T0): CardState {
  return scheduler.newCard('q_hist_0001', now);
}

describe('ReviewScheduler.newCard', () => {
  it('creates a new card due immediately', () => {
    const card = freshCard();
    expect(card).toEqual({
      qid: 'q_hist_0001',
      due: T0,
      stability: 0,
      stabilityFast: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningStep: 0,
      reps: 0,
      lapses: 0,
      lastReview: null,
      phase: 'new',
    });
  });

  it('rejects an empty question id or a bad timestamp', () => {
    expect(() => scheduler.newCard('', T0)).toThrow(RangeError);
    expect(() => scheduler.newCard('q', -1)).toThrow(RangeError);
    expect(() => scheduler.newCard('q', Number.NaN)).toThrow(RangeError);
  });
});

describe('ReviewScheduler.review', () => {
  it('moves a correct new card into review and schedules it forward', () => {
    const next = scheduler.review(freshCard(), 'correct', T0);
    expect(next.phase).toBe('review');
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(0);
    expect(next.lastReview).toBe(T0);
    expect(next.due).toBeGreaterThan(T0);
    expect(next.stability).toBeGreaterThan(0);
  });

  it('keeps a wrong new card in learning for one minute', () => {
    const next = scheduler.review(freshCard(), 'wrong', T0);
    expect(next.phase).toBe('learning');
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(0);
    expect(next.due).toBe(T0 + MINUTE);
  });

  it('treats a wrong review card as a lapse and relearns in ten minutes', () => {
    const reviewCard = scheduler.review(freshCard(), 'correct', T0);
    const next = scheduler.review(reviewCard, 'wrong', T1);
    expect(next.phase).toBe('relearning');
    expect(next.reps).toBe(2);
    expect(next.lapses).toBe(1);
    expect(next.due).toBe(T1 + 10 * MINUTE);
  });

  it('returns the same object for a skip and changes nothing', () => {
    const card = scheduler.review(freshCard(), 'correct', T0);
    expect(scheduler.review(card, 'skip', T1)).toBe(card);
  });

  it('keeps the question id across reviews', () => {
    const card = scheduler.review(freshCard(), 'correct', T0);
    expect(card.qid).toBe('q_hist_0001');
    expect(scheduler.review(card, 'correct', T1).qid).toBe('q_hist_0001');
  });

  it('does not mutate its input', () => {
    const card = Object.freeze(scheduler.review(freshCard(), 'correct', T0));
    const snapshot = { ...card };
    const next = scheduler.review(card, 'wrong', T1);
    expect(card).toEqual(snapshot);
    expect(next).not.toBe(card);
  });

  it('is deterministic with fuzzing disabled', () => {
    const a = ReviewScheduler.create();
    const b = ReviewScheduler.create();
    const a1 = a.review(a.newCard('q', T0), 'correct', T0);
    const b1 = b.review(b.newCard('q', T0), 'correct', T0);
    expect(a1).toEqual(b1);
    expect(a.review(a1, 'correct', T1)).toEqual(b.review(b1, 'correct', T1));
  });

  it('rejects a bad timestamp', () => {
    const card = freshCard();
    expect(() => scheduler.review(card, 'correct', Number.NaN)).toThrow(RangeError);
    expect(() => scheduler.review(card, 'correct', T0, -1)).toThrow(RangeError);
  });
});

describe('exam deadline cap', () => {
  it('never schedules a revision after the exam', () => {
    const examDeadline = T0 + 2 * DAY;
    const next = scheduler.review(freshCard(), 'correct', T0, examDeadline);
    expect(next.due).toBe(examDeadline);
    expect(next.phase).toBe('review');
    expect(next.stability).toBeGreaterThan(0);
  });

  it('leaves an earlier due date untouched', () => {
    const examDeadline = T0 + 60 * DAY;
    const next = scheduler.review(freshCard(), 'wrong', T0, examDeadline);
    expect(next.due).toBe(T0 + MINUTE);
  });

  it('never schedules in the past when the exam deadline has passed', () => {
    const next = scheduler.review(freshCard(), 'correct', T0, T0 - DAY);
    expect(next.due).toBe(T0);
  });
});

interface Pin {
  readonly phase: CardState['phase'];
  readonly dueAt: string;
  readonly stability: number;
  readonly stabilityFast: number;
  readonly difficulty: number;
  readonly scheduledDays: number;
  readonly learningStep: number;
  readonly reps: number;
  readonly lapses: number;
}

const golden = JSON.parse(readFileSync(new URL('../fixtures/fsrs-golden.json', import.meta.url), 'utf8')) as {
  readonly t0: string;
  readonly t1: string;
  readonly freshCorrect: Pin;
  readonly thenCorrect: Pin;
  readonly thenWrong: Pin;
};

function expectPin(actual: CardState, pin: Pin): void {
  expect(actual.phase).toBe(pin.phase);
  expect(actual.due).toBe(Date.parse(pin.dueAt));
  expect(actual.stability).toBe(pin.stability);
  expect(actual.stabilityFast).toBe(pin.stabilityFast);
  expect(actual.difficulty).toBe(pin.difficulty);
  expect(actual.scheduledDays).toBe(pin.scheduledDays);
  expect(actual.learningStep).toBe(pin.learningStep);
  expect(actual.reps).toBe(pin.reps);
  expect(actual.lapses).toBe(pin.lapses);
}

/**
 * Pins the FSRS-7 preset, not the library internals. A failure here means the
 * model version, the weights or the preset configuration changed, which would
 * silently reschedule every existing card (D-037).
 */
describe('golden regression pins', () => {
  const t0 = Date.parse(golden.t0);
  const t1 = Date.parse(golden.t1);

  it('matches the first correct answer on a new card', () => {
    expectPin(scheduler.review(freshCard(t0), 'correct', t0), golden.freshCorrect);
  });

  it('matches a later correct answer', () => {
    const first = scheduler.review(freshCard(t0), 'correct', t0);
    expectPin(scheduler.review(first, 'correct', t1), golden.thenCorrect);
  });

  it('matches a later wrong answer', () => {
    const first = scheduler.review(freshCard(t0), 'correct', t0);
    expectPin(scheduler.review(first, 'wrong', t1), golden.thenWrong);
  });
});
