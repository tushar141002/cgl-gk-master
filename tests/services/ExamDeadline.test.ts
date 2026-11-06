import { describe, expect, it } from 'vitest';
import { examDeadlineFrom } from '../../src/services/examDeadline';

describe('examDeadlineFrom (D-037)', () => {
  it('leaves the due date uncapped without an exam date', () => {
    expect(examDeadlineFrom(null)).toBeUndefined();
  });

  it('caps at the start of the exam day in IST', () => {
    // 2027-05-01 00:00 IST is 2027-04-30 18:30 UTC.
    expect(examDeadlineFrom('2027-05-01')).toBe(Date.parse('2027-04-30T18:30:00.000Z'));
  });

  it('rejects a malformed or impossible date', () => {
    expect(() => examDeadlineFrom('01-05-2027')).toThrow(/YYYY-MM-DD/);
    expect(() => examDeadlineFrom('2027-02-30')).toThrow(/real date/);
  });
});
