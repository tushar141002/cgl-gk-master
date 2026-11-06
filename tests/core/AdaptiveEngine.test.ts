import { describe, expect, it } from 'vitest';
import type { Skill } from '../../shared/contract';
import { AdaptiveEngine, BAND_STEPS, MAX_RANGE_STEP, type RatingRange } from '../../src/core/AdaptiveEngine';

function skill(elo: number, attemptCount = 5): Skill {
  return { subtopicId: 'polity', elo, attemptCount };
}

function range(min: number, max: number): RatingRange {
  return { min, max };
}

describe('AdaptiveEngine.targetRange', () => {
  it('is ±100 by default', () => {
    expect(AdaptiveEngine.targetRange(skill(1200))).toEqual(range(1100, 1300));
  });

  it('widens in fixed steps', () => {
    expect(AdaptiveEngine.targetRange(skill(1200), 0)).toEqual(range(1100, 1300));
    expect(AdaptiveEngine.targetRange(skill(1200), 1)).toEqual(range(1000, 1400));
    expect(AdaptiveEngine.targetRange(skill(1200), 2)).toEqual(range(800, 1600));
  });

  it('returns the whole rating range at the last step', () => {
    expect(MAX_RANGE_STEP).toBe(BAND_STEPS.length);

    for (const elo of [600, 1200, 2200]) {
      expect(AdaptiveEngine.targetRange(skill(elo), MAX_RANGE_STEP)).toEqual(range(600, 2200));
    }
  });

  it('publishes the band steps in widening order', () => {
    expect(BAND_STEPS).toEqual([100, 200, 400]);
  });

  it('tracks a rating that is not the default', () => {
    expect(AdaptiveEngine.targetRange(skill(1500))).toEqual(range(1400, 1600));
    expect(AdaptiveEngine.targetRange(skill(900), 1)).toEqual(range(700, 1100));
  });

  it('clamps to the bottom of the rating scale', () => {
    expect(AdaptiveEngine.targetRange(skill(600), 0)).toEqual(range(600, 700));
    expect(AdaptiveEngine.targetRange(skill(650), 0)).toEqual(range(600, 750));
    expect(AdaptiveEngine.targetRange(skill(650), 1)).toEqual(range(600, 850));
  });

  it('clamps to the top of the rating scale', () => {
    expect(AdaptiveEngine.targetRange(skill(2200), 0)).toEqual(range(2100, 2200));
    expect(AdaptiveEngine.targetRange(skill(2150), 0)).toEqual(range(2050, 2200));
    expect(AdaptiveEngine.targetRange(skill(2150), 1)).toEqual(range(1950, 2200));
  });

  it('never returns a range wider than the scale', () => {
    for (const elo of [0, 550, 600, 1200, 2200, 2300, 5000]) {
      for (let step = 0; step <= MAX_RANGE_STEP; step += 1) {
        const band = AdaptiveEngine.targetRange(skill(elo), step);
        expect(band.min).toBeGreaterThanOrEqual(600);
        expect(band.max).toBeLessThanOrEqual(2200);
        expect(band.min).toBeLessThanOrEqual(band.max);
      }
    }
  });

  it('treats an out-of-range rating as the nearest edge', () => {
    expect(AdaptiveEngine.targetRange(skill(0), 0)).toEqual(range(600, 700));
    expect(AdaptiveEngine.targetRange(skill(5000), 0)).toEqual(range(2100, 2200));
  });

  it('rounds to two decimals', () => {
    expect(AdaptiveEngine.targetRange(skill(1234.567))).toEqual(range(1134.57, 1334.57));
  });

  it('does not mutate the skill it is given', () => {
    const input = Object.freeze(skill(1337.25, 42));

    AdaptiveEngine.targetRange(input, 1);

    expect(input).toEqual({ subtopicId: 'polity', elo: 1337.25, attemptCount: 42 });
  });

  it('rejects an invalid step', () => {
    for (const step of [-1, 4, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => AdaptiveEngine.targetRange(skill(1200), step)).toThrow(RangeError);
    }
  });

  it('rejects a non-finite rating', () => {
    expect(() => AdaptiveEngine.targetRange(skill(Number.NaN))).toThrow(RangeError);
    expect(() => AdaptiveEngine.targetRange(skill(Number.POSITIVE_INFINITY))).toThrow(RangeError);
  });
});
