import { describe, expect, it } from 'vitest';
import type { AttemptRecord, OptionIndex, Question } from '../../shared/contract';
import { Attempt, type AttemptContext } from '../../src/core/Attempt';

const QUESTION: Question = {
  id: 'q_hist_0001',
  v: 3,
  packId: 'pack_history_01',
  section: 'history',
  subtopic: 'ancient',
  source: { type: 'PYQ', exam: 'SSC CGL', year: 2023, shift: 'Shift 2', date: '2023-06-14' },
  en: {
    q: 'Who founded the Maurya Empire?',
    options: ['Ashoka', 'Chandragupta Maurya', 'Bindusara', 'Harshavardhana'],
    explanation: 'Chandragupta Maurya founded the Maurya Empire around 322 BCE.',
  },
  hi: {
    q: 'मौर्य साम्राज्य की स्थापना किसने की?',
    options: ['अशोक', 'चंद्रगुप्त मौर्य', 'बिंदुसार', 'हर्षवर्धन'],
    explanation: 'चंद्रगुप्त मौर्य ने लगभग 322 ईसा पूर्व मौर्य साम्राज्य की स्थापना की।',
  },
  answer: 1,
  eloSeed: 1180,
  verifiedAt: '2026-10-20',
};

const CTX: AttemptContext = {
  id: '0192f0aa-0000-7000-8000-000000000001',
  deviceId: 'dev_abc123',
  mode: 'practice',
  at: 1_795_000_000_000,
};

/** `OptionIndex` is 0-3, so bad values need an explicit cast in tests. */
const bad = (n: number): OptionIndex => n as unknown as OptionIndex;

describe('Attempt.create', () => {
  it('marks a correct answer against the canonical option order', () => {
    const a = Attempt.create(QUESTION, 1, 4200, CTX);
    expect(a.record.correct).toBe(true);
    expect(a.record.chosen).toBe(1);
    expect(a.isSkip).toBe(false);
  });

  it('marks a wrong answer', () => {
    const a = Attempt.create(QUESTION, 2, 4200, CTX);
    expect(a.record.correct).toBe(false);
    expect(a.record.chosen).toBe(2);
  });

  it('records a skip as chosen null and never correct', () => {
    const a = Attempt.create(QUESTION, null, 4200, CTX);
    expect(a.record.chosen).toBeNull();
    expect(a.record.correct).toBe(false);
    expect(a.isSkip).toBe(true);
  });

  it('captures the question id and the version it was graded against', () => {
    const a = Attempt.create(QUESTION, 1, 1000, CTX);
    expect(a.record.qid).toBe('q_hist_0001');
    expect(a.record.qv).toBe(3);
  });

  it('copies the attempt context verbatim', () => {
    const a = Attempt.create(QUESTION, 1, 1000, CTX);
    expect(a.record.id).toBe(CTX.id);
    expect(a.record.deviceId).toBe(CTX.deviceId);
    expect(a.record.mode).toBe('practice');
    expect(a.record.at).toBe(CTX.at);
  });

  it('omits mockId when the context has none', () => {
    const a = Attempt.create(QUESTION, 1, 1000, CTX);
    expect('mockId' in a.record).toBe(false);
  });

  it('stores mockId for a mock attempt', () => {
    const a = Attempt.create(QUESTION, 1, 1000, { ...CTX, mode: 'mock', mockId: 'mock_2026_w44' });
    expect(a.record.mockId).toBe('mock_2026_w44');
    expect(a.record.mode).toBe('mock');
  });

  it('accepts zero milliseconds', () => {
    expect(Attempt.create(QUESTION, 1, 0, CTX).record.ms).toBe(0);
  });

  it('rejects a negative, NaN or infinite duration', () => {
    expect(() => Attempt.create(QUESTION, 1, -1, CTX)).toThrow(RangeError);
    expect(() => Attempt.create(QUESTION, 1, Number.NaN, CTX)).toThrow(RangeError);
    expect(() => Attempt.create(QUESTION, 1, Number.POSITIVE_INFINITY, CTX)).toThrow(RangeError);
  });

  it('rejects an option index outside 0-3', () => {
    expect(() => Attempt.create(QUESTION, bad(4), 1000, CTX)).toThrow(RangeError);
    expect(() => Attempt.create(QUESTION, bad(-1), 1000, CTX)).toThrow(RangeError);
  });

  it('rejects an empty attempt id or device id', () => {
    expect(() => Attempt.create(QUESTION, 1, 1000, { ...CTX, id: '' })).toThrow(RangeError);
    expect(() => Attempt.create(QUESTION, 1, 1000, { ...CTX, deviceId: '' })).toThrow(RangeError);
  });

  it('rejects an unknown mode', () => {
    const ctx = { ...CTX, mode: 'guess' as unknown as AttemptContext['mode'] };
    expect(() => Attempt.create(QUESTION, 1, 1000, ctx)).toThrow(RangeError);
  });

  it('rejects a bad timestamp', () => {
    expect(() => Attempt.create(QUESTION, 1, 1000, { ...CTX, at: -5 })).toThrow(RangeError);
    expect(() => Attempt.create(QUESTION, 1, 1000, { ...CTX, at: Number.NaN })).toThrow(RangeError);
  });
});

describe('Attempt.regrade', () => {
  it('flips correctness but keeps id, time and question version', () => {
    const before = Attempt.create(QUESTION, 2, 4200, CTX);
    const after = before.regrade(2);

    expect(after.record.correct).toBe(true);
    expect(after.record.id).toBe(before.record.id);
    expect(after.record.at).toBe(before.record.at);
    expect(after.record.qv).toBe(before.record.qv);
    expect(after.record.chosen).toBe(2);
  });

  it('does not mutate the original attempt', () => {
    const before = Attempt.create(QUESTION, 2, 4200, CTX);
    before.regrade(1);
    expect(before.record.correct).toBe(false);
  });

  it('can turn a previously correct attempt wrong', () => {
    const before = Attempt.create(QUESTION, 1, 4200, CTX);
    expect(before.regrade(0).record.correct).toBe(false);
  });

  it('leaves a skipped attempt skipped, returning the same instance', () => {
    const skip = Attempt.create(QUESTION, null, 4200, CTX);
    const regraded = skip.regrade(1);
    expect(regraded).toBe(skip);
    expect(regraded.isSkip).toBe(true);
    expect(regraded.record.correct).toBe(false);
  });

  it('rejects an invalid new answer', () => {
    const a = Attempt.create(QUESTION, 1, 4200, CTX);
    expect(() => a.regrade(bad(9))).toThrow(RangeError);
  });
});

describe('Attempt.from', () => {
  const valid: AttemptRecord = {
    id: '0192f0aa-0000-7000-8000-000000000002',
    qid: 'q_hist_0001',
    qv: 3,
    chosen: 1,
    correct: true,
    ms: 4200,
    mode: 'practice',
    at: 1_795_000_000_000,
    deviceId: 'dev_abc123',
  };

  it('rehydrates a valid record', () => {
    const a = Attempt.from(valid);
    expect(a.record).toEqual(valid);
  });

  it('round-trips through toJSON', () => {
    expect(Attempt.from(valid).toJSON()).toEqual(valid);
  });

  it('accepts a skip record', () => {
    expect(Attempt.from({ ...valid, chosen: null, correct: false }).isSkip).toBe(true);
  });

  it('rejects a non-positive question version', () => {
    expect(() => Attempt.from({ ...valid, qv: 0 })).toThrow(RangeError);
    expect(() => Attempt.from({ ...valid, qv: 1.5 })).toThrow(RangeError);
  });

  it('rejects a bad option index, duration or timestamp', () => {
    expect(() => Attempt.from({ ...valid, chosen: bad(4) })).toThrow(RangeError);
    expect(() => Attempt.from({ ...valid, ms: -1 })).toThrow(RangeError);
    expect(() => Attempt.from({ ...valid, at: Number.NaN })).toThrow(RangeError);
  });

  it('rejects an unknown mode or empty ids', () => {
    expect(() => Attempt.from({ ...valid, mode: 'guess' as AttemptRecord['mode'] })).toThrow(RangeError);
    expect(() => Attempt.from({ ...valid, id: '' })).toThrow(RangeError);
    expect(() => Attempt.from({ ...valid, deviceId: '' })).toThrow(RangeError);
  });
});
