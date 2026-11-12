import { describe, expect, it } from 'vitest';
import type { MockSummary } from '../../shared/contract';
import { formatClock, formatMarks, formatWhen, mockPhase } from '../../src/ui/mockFormat';

const BASE: MockSummary = {
  id: 'mock-1',
  titleEn: 'Weekend mock',
  titleHi: 'साप्ताहिक मॉक',
  opensAt: 1_000,
  closesAt: 2_000,
  durationSec: 900,
  questionCount: 25,
  markCorrect: 2,
  markWrong: 0.5,
  session: null,
};

function withSession(status: 'active' | 'submitted' | 'expired'): MockSummary {
  return {
    ...BASE,
    session: { id: 's', status, deadlineAt: 1_500, score: null, correct: null, wrong: null, skipped: null },
  };
}

describe('mockPhase', () => {
  it('follows the window when the student has not started', () => {
    expect(mockPhase(BASE, 999)).toBe('soon');
    expect(mockPhase(BASE, 1_000)).toBe('open');
    expect(mockPhase(BASE, 2_000)).toBe('closed');
  });

  it('follows the student’s own session once there is one', () => {
    expect(mockPhase(withSession('active'), 1_500)).toBe('active');
    expect(mockPhase(withSession('submitted'), 5_000)).toBe('done');
    expect(mockPhase(withSession('expired'), 1_500)).toBe('expired');
  });
});

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [-500, '0:00'],
    [999, '0:01'],
    [65_000, '1:05'],
    [900_000, '15:00'],
    [3_729_000, '1:02:09'],
  ])('formats %d ms as %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});

describe('formatMarks', () => {
  it.each([
    [6, '6'],
    [5.5, '5.5'],
    [-1.5, '−1.5'],
    [1 / 3, '0.33'],
  ])('formats %d as %s', (value, text) => {
    expect(formatMarks(value)).toBe(text);
  });
});

describe('formatWhen', () => {
  it('uses India time whatever the phone’s zone', () => {
    // 2026-11-14 12:30 UTC is 6:00 pm IST.
    const text = formatWhen(Date.UTC(2026, 10, 14, 12, 30), 'en');

    expect(text).toMatch(/14 Nov/);
    expect(text).toMatch(/6:00\s?pm/i);
  });
});
