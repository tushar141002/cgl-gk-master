import { GUESSING_FLOOR } from '../../shared/contract';
import type { Skill, SubtopicId } from '../../shared/contract';

/** Every student and every question starts here. */
export const DEFAULT_RATING = 1200;

export type Outcome = 'correct' | 'wrong' | 'skip';

interface KSchedule {
  /** K at zero attempts. */
  readonly start: number;
  /** K approached asymptotically. */
  readonly floor: number;
  /** Attempts at which K is halfway between `start` and `floor`. */
  readonly halfLife: number;
}

export interface EloConfig {
  /** 400 means a 400-point gap is 10:1 odds before the guessing correction. */
  readonly scale: number;
  /** 0.25 for four options (D-005). */
  readonly guessingFloor: number;
  readonly studentK: KSchedule;
  readonly questionK: KSchedule;
  readonly minRating: number;
  readonly maxRating: number;
}

/**
 * Chosen so that early answers move a rating a lot and a settled one barely
 * moves: a student is at K=40 for their first answer and K≈14 after 400.
 * Questions settle faster because a question's difficulty needs fewer answers
 * to be stable than a student's ability does.
 */
export const DEFAULT_ELO: EloConfig = Object.freeze({
  scale: 400,
  guessingFloor: GUESSING_FLOOR,
  studentK: { start: 40, floor: 8, halfLife: 50 },
  questionK: { start: 24, floor: 6, halfLife: 30 },
  minRating: 600,
  maxRating: 2200,
});

/**
 * Probability that this student answers this question correctly, including the
 * chance of guessing a four-option question right (D-005).
 */
export function expectedScore(student: number, question: number, cfg: EloConfig = DEFAULT_ELO): number {
  const logistic = 1 / (1 + 10 ** ((question - student) / cfg.scale));
  return cfg.guessingFloor + (1 - cfg.guessingFloor) * logistic;
}

/** K shrinks with experience: `floor + (start - floor) * halfLife / (halfLife + n)`. */
export function kFactor(schedule: KSchedule, attempts: number): number {
  const n = Math.max(0, attempts);
  return schedule.floor + ((schedule.start - schedule.floor) * schedule.halfLife) / (schedule.halfLife + n);
}

/**
 * Apply one graded answer to a student's sub-topic rating.
 *
 * Skips are ignored entirely (D-034): they do not move the rating and do not
 * count as an attempt, otherwise tapping skip would be a way to slow the K
 * decay. The input is never mutated.
 */
export function updateSkill(
  skill: Skill,
  questionRating: number,
  outcome: Outcome,
  cfg: EloConfig = DEFAULT_ELO,
): Skill {
  if (outcome === 'skip') return skill;

  const expected = expectedScore(skill.elo, questionRating, cfg);
  const score = outcome === 'correct' ? 1 : 0;
  const k = kFactor(cfg.studentK, skill.attemptCount);
  const next = clampRating(skill.elo + k * (score - expected), cfg);

  return { ...skill, elo: round2(next), attemptCount: skill.attemptCount + 1 };
}

/**
 * Apply one answer to a question's difficulty rating. The direction is
 * inverted: a correct answer from a weak student means the question was easier
 * than estimated, so its rating goes down. Used by the nightly calibration job.
 */
export function updateQuestionRating(
  currentRating: number,
  studentRating: number,
  outcome: Outcome,
  attempts: number,
  cfg: EloConfig = DEFAULT_ELO,
): number {
  if (outcome === 'skip') return currentRating;

  const expected = expectedScore(studentRating, currentRating, cfg);
  const score = outcome === 'correct' ? 1 : 0;
  const k = kFactor(cfg.questionK, attempts);
  return round2(clampRating(currentRating - k * (score - expected), cfg));
}

/** A fresh sub-topic rating. */
export function newSkill(subtopicId: SubtopicId, rating: number = DEFAULT_RATING): Skill {
  return { subtopicId, elo: rating, attemptCount: 0 };
}

function clampRating(value: number, cfg: EloConfig): number {
  return Math.min(cfg.maxRating, Math.max(cfg.minRating, value));
}

/**
 * Ratings are rounded to two decimals at the boundary. This keeps stored values
 * stable and makes golden tests independent of `Math.pow` differences between
 * JavaScript engines, which are not required to agree on the last bit.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
