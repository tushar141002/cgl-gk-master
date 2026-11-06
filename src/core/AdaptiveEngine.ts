import type { Skill } from '../../shared/contract';
import { DEFAULT_ELO } from './EloRating';

export interface RatingRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Half-widths in Elo points, tried in order when a sub-topic has no question at
 * the student's level (D-044). ±100 is a real but not punishing step: at 1200,
 * the expected score against the band edges is roughly 73% and 52%.
 */
export const BAND_STEPS = [100, 200, 400] as const;

/** Step that returns the whole rating range, so the caller has a finite loop. */
export const MAX_RANGE_STEP = BAND_STEPS.length;

/**
 * Turns a sub-topic rating into the question rating range to fetch (D-044).
 *
 * Pure: the caller runs the widening loop, asks the question store for each
 * range, and stops at the first range that has a candidate.
 */
export class AdaptiveEngine {
  private constructor() {}

  static targetRange(skill: Skill, step = 0): RatingRange {
    if (!Number.isInteger(step) || step < 0 || step > MAX_RANGE_STEP) {
      throw new RangeError(`step must be an integer 0-${MAX_RANGE_STEP} (got ${String(step)})`);
    }
    if (!Number.isFinite(skill.elo)) {
      throw new RangeError(`skill.elo must be finite (got ${String(skill.elo)})`);
    }

    if (step === MAX_RANGE_STEP) {
      return { min: DEFAULT_ELO.minRating, max: DEFAULT_ELO.maxRating };
    }

    // Ratings are clamped to 600-2200 on every update; clamping here keeps the
    // band sane even if a checkpoint or a hand-written fixture slipped through.
    const elo = Math.min(DEFAULT_ELO.maxRating, Math.max(DEFAULT_ELO.minRating, skill.elo));
    const half = BAND_STEPS[step]!;
    return {
      min: Math.max(DEFAULT_ELO.minRating, round2(elo - half)),
      max: Math.min(DEFAULT_ELO.maxRating, round2(elo + half)),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
