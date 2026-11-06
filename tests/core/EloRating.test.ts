import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Skill } from '../../shared/contract';
import {
  DEFAULT_ELO,
  DEFAULT_RATING,
  expectedScore,
  kFactor,
  newSkill,
  updateQuestionRating,
  updateSkill,
  type Outcome,
} from '../../src/core/EloRating';

const student = (elo: number, attemptCount = 0): Skill => ({ subtopicId: 'ancient', elo, attemptCount });

describe('expectedScore', () => {
  it('is 0.625 between equal ratings on a four-option question', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.625, 12);
  });

  it('is above 0.625 when the student is stronger than the question', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(0.25 + 0.75 * (1 / 1.1), 12);
  });

  it('is below 0.625 when the question is harder than the student', () => {
    expect(expectedScore(1200, 1600)).toBeCloseTo(0.25 + 0.75 * (1 / 11), 12);
  });

  it('rises monotonically with student rating and falls with question rating', () => {
    let previous = -1;
    for (const rating of [600, 900, 1200, 1500, 1800, 2100]) {
      const value = expectedScore(rating, 1200);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }

    let previousQuestion = 2;
    for (const rating of [600, 900, 1200, 1500, 1800, 2100]) {
      const value = expectedScore(1200, rating);
      expect(value).toBeLessThan(previousQuestion);
      previousQuestion = value;
    }
  });

  it('stays inside [guessing floor, 1]', () => {
    for (const s of [0, 600, 1200, 1800, 2400]) {
      for (const q of [0, 600, 1200, 1800, 2400]) {
        const value = expectedScore(s, q);
        expect(value).toBeGreaterThanOrEqual(DEFAULT_ELO.guessingFloor);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('kFactor', () => {
  it('starts at the configured value', () => {
    expect(kFactor(DEFAULT_ELO.studentK, 0)).toBe(40);
    expect(kFactor(DEFAULT_ELO.questionK, 0)).toBe(24);
  });

  it('is halfway to the floor at the half-life', () => {
    expect(kFactor(DEFAULT_ELO.studentK, 50)).toBe(24);
    expect(kFactor(DEFAULT_ELO.questionK, 30)).toBe(15);
  });

  it('decays towards the floor and never goes below it', () => {
    expect(kFactor(DEFAULT_ELO.studentK, 400)).toBeCloseTo(8 + (32 * 50) / 450, 12);
    expect(kFactor(DEFAULT_ELO.studentK, 100_000)).toBeGreaterThan(8);
    expect(kFactor(DEFAULT_ELO.studentK, 100_000)).toBeLessThan(8.05);
  });

  it('treats negative attempt counts as zero', () => {
    expect(kFactor(DEFAULT_ELO.studentK, -10)).toBe(40);
  });
});

describe('updateSkill', () => {
  it('raises the rating after a correct answer', () => {
    const next = updateSkill(student(1200), 1200, 'correct');
    expect(next.elo).toBeGreaterThan(1200);
    expect(next.attemptCount).toBe(1);
  });

  it('lowers the rating after a wrong answer', () => {
    const next = updateSkill(student(1200), 1200, 'wrong');
    expect(next.elo).toBeLessThan(1200);
    expect(next.attemptCount).toBe(1);
  });

  it('moves a rating less as the student gains experience', () => {
    const noviceMove = Math.abs(updateSkill(student(1200, 0), 1200, 'wrong').elo - 1200);
    const veteranMove = Math.abs(updateSkill(student(1200, 100), 1200, 'wrong').elo - 1200);
    expect(veteranMove).toBeLessThan(noviceMove);
  });

  it('returns the same instance for a skip and does not count it', () => {
    const before = student(1200, 10);
    expect(updateSkill(before, 1200, 'skip')).toBe(before);
  });

  it('never mutates its input', () => {
    const before = Object.freeze(student(1200, 7));
    const next = updateSkill(before, 1400, 'correct');
    expect(before).toEqual({ subtopicId: 'ancient', elo: 1200, attemptCount: 7 });
    expect(next).not.toBe(before);
  });

  it('keeps the subtopic id', () => {
    expect(updateSkill(student(1200), 1200, 'correct').subtopicId).toBe('ancient');
  });

  it('never leaves the allowed range for a graded answer', () => {
    for (const elo of [0, 100, 600, 1200, 1800, 2200, 3000]) {
      for (const q of [0, 600, 1200, 2200, 4000]) {
        for (const outcome of ['correct', 'wrong'] as Outcome[]) {
          const value = updateSkill(student(elo), q, outcome).elo;
          expect(value).toBeGreaterThanOrEqual(DEFAULT_ELO.minRating);
          expect(value).toBeLessThanOrEqual(DEFAULT_ELO.maxRating);
        }
      }
    }
  });
});

describe('updateQuestionRating', () => {
  it('lowers a question rating when a student answers it correctly', () => {
    expect(updateQuestionRating(1200, 1200, 'correct', 0)).toBeLessThan(1200);
  });

  it('raises a question rating when a student answers it wrong', () => {
    expect(updateQuestionRating(1200, 1200, 'wrong', 0)).toBeGreaterThan(1200);
  });

  it('does not change on a skip', () => {
    expect(updateQuestionRating(1200, 1200, 'skip', 0)).toBe(1200);
  });

  it('keeps the rating in range', () => {
    for (const current of [0, 600, 1200, 2200, 3000]) {
      const value = updateQuestionRating(current, 1200, 'wrong', 0);
      expect(value).toBeGreaterThanOrEqual(DEFAULT_ELO.minRating);
      expect(value).toBeLessThanOrEqual(DEFAULT_ELO.maxRating);
    }
  });
});

describe('newSkill', () => {
  it('starts at the default rating with no attempts', () => {
    expect(newSkill('polity')).toEqual({ subtopicId: 'polity', elo: DEFAULT_RATING, attemptCount: 0 });
  });

  it('accepts a seed rating', () => {
    expect(newSkill('polity', 1500).elo).toBe(1500);
  });
});

interface SkillCase {
  readonly student: number;
  readonly question: number;
  readonly outcome: Outcome;
  readonly attempts: number;
  readonly elo: number;
  readonly attemptCount: number;
}

interface QuestionCase {
  readonly current: number;
  readonly student: number;
  readonly outcome: Outcome;
  readonly attempts: number;
  readonly elo: number;
}

const golden = JSON.parse(readFileSync(new URL('../fixtures/elo-golden.json', import.meta.url), 'utf8')) as {
  readonly skill: readonly SkillCase[];
  readonly question: readonly QuestionCase[];
};

/**
 * Pins the arithmetic, not the algorithm: these values were derived from the
 * documented formula and checked by hand, so a failure here means the formula
 * changed or a constant moved (D-033).
 */
describe('golden regression pins', () => {
  it('has fixtures to check', () => {
    expect(golden.skill.length).toBeGreaterThan(0);
    expect(golden.question.length).toBeGreaterThan(0);
  });

  for (const c of golden.skill) {
    it(`skill ${c.student} vs ${c.question}, ${c.outcome} at n=${c.attempts}`, () => {
      const next = updateSkill(student(c.student, c.attempts), c.question, c.outcome);
      expect(next.elo).toBe(c.elo);
      expect(next.attemptCount).toBe(c.attemptCount);
    });
  }

  for (const c of golden.question) {
    it(`question ${c.current} vs student ${c.student}, ${c.outcome} at n=${c.attempts}`, () => {
      expect(updateQuestionRating(c.current, c.student, c.outcome, c.attempts)).toBe(c.elo);
    });
  }
});
