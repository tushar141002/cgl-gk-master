import { describe, expect, it } from 'vitest';
import type { Question as QuestionRecord } from '../../shared/contract';
import { Question, QuestionValidationError } from '../../src/core/Question';

function record(overrides: Partial<QuestionRecord> = {}): QuestionRecord {
  return {
    id: 'polity-fr-0001',
    v: 1,
    packId: 'polity-fundamental-rights',
    section: 'polity',
    subtopic: 'polity-fundamental-rights',
    source: { type: 'practice' },
    en: {
      q: 'Which Article abolishes untouchability?',
      options: ['Article 14', 'Article 15', 'Article 16', 'Article 17'],
      explanation: 'Article 17 abolishes untouchability.',
    },
    hi: {
      q: 'कौन-सा अनुच्छेद अस्पृश्यता का अंत करता है?',
      options: ['अनुच्छेद 14', 'अनुच्छेद 15', 'अनुच्छेद 16', 'अनुच्छेद 17'],
      explanation: 'अनुच्छेद 17 अस्पृश्यता का अंत करता है।',
    },
    answer: 3,
    eloSeed: 1100,
    verifiedAt: '2026-11-07T00:00:00.000Z',
    ...overrides,
  };
}

describe('Question.from', () => {
  it('wraps a valid record', () => {
    const question = Question.from(record());
    expect(question.id).toBe('polity-fr-0001');
    expect(question.record.answer).toBe(3);
    expect(question.toJSON()).toEqual(record());
  });

  it('throws with every issue attached', () => {
    let caught: unknown;
    try {
      Question.from(record({ id: 'Bad ID', answer: 9 as never }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(QuestionValidationError);
    const issues = (caught as QuestionValidationError).issues;
    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['id', 'answer']));
  });
});

describe('Question.issues', () => {
  it('reports nothing for a valid record', () => {
    expect(Question.issues(record())).toEqual([]);
  });

  it('accepts a null Hindi translation while drafting', () => {
    expect(Question.issues(record({ hi: null }))).toEqual([]);
  });

  it('rejects ids that are not lowercase slugs', () => {
    expect(Question.issues(record({ id: 'Polity FR 1' }))).toEqual([
      expect.objectContaining({ field: 'id' }),
    ]);
    expect(Question.issues(record({ id: '' }))).toEqual([expect.objectContaining({ field: 'id' })]);
  });

  it('rejects an unknown section', () => {
    const issues = Question.issues(record({ section: 'sports' as never }));
    expect(issues).toContainEqual(expect.objectContaining({ field: 'section' }));
  });

  it('requires exam and year for a PYQ', () => {
    const issues = Question.issues(record({ source: { type: 'PYQ' } }));
    expect(issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(['source.exam', 'source.year']),
    );
  });

  it('requires a month for current affairs', () => {
    const issues = Question.issues(record({ source: { type: 'CA' } }));
    expect(issues).toContainEqual(expect.objectContaining({ field: 'source.caMonth' }));
  });

  it('rejects impossible dates instead of rolling them over', () => {
    const issues = Question.issues(
      record({ source: { type: 'PYQ', exam: 'SSC CGL', year: 2023, date: '2026-02-30' } }),
    );
    expect(issues).toContainEqual(expect.objectContaining({ field: 'source.date' }));
  });

  it('requires four distinct non-empty options', () => {
    const duplicated = record();
    const issues = Question.issues({
      ...duplicated,
      en: { ...duplicated.en, options: ['A', 'A', 'B', ''] },
    });
    expect(issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining(['en.options[1]', 'en.options[3]']),
    );
  });

  it('rejects an option array of the wrong length', () => {
    const base = record();
    const issues = Question.issues({
      ...base,
      en: { ...base.en, options: ['A', 'B'] as never },
    });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'en.options' }));
  });

  it('rejects missing bilingual text in a present translation', () => {
    const base = record();
    const issues = Question.issues({ ...base, hi: { ...base.hi!, q: '  ' } });
    expect(issues).toContainEqual(expect.objectContaining({ field: 'hi.q' }));
  });

  it('keeps eloSeed inside the rating range', () => {
    expect(Question.issues(record({ eloSeed: 599 }))).toContainEqual(
      expect.objectContaining({ field: 'eloSeed' }),
    );
    expect(Question.issues(record({ eloSeed: 2201 }))).toContainEqual(
      expect.objectContaining({ field: 'eloSeed' }),
    );
    expect(Question.issues(record({ eloSeed: 600 }))).toEqual([]);
    expect(Question.issues(record({ eloSeed: 2200 }))).toEqual([]);
  });

  it('rejects a bad verification timestamp and an empty image name', () => {
    expect(Question.issues(record({ verifiedAt: 'yesterday' }))).toContainEqual(
      expect.objectContaining({ field: 'verifiedAt' }),
    );
    expect(Question.issues(record({ image: '   ' }))).toContainEqual(
      expect.objectContaining({ field: 'image' }),
    );
  });
});

describe('Question behaviour', () => {
  it('compares a tap against the canonical answer', () => {
    const question = Question.from(record({ answer: 2 }));
    expect(question.isCorrect(2)).toBe(true);
    expect(question.isCorrect(1)).toBe(false);
    expect(question.isCorrect(null)).toBe(false);
  });

  it('falls back to English when Hindi is missing', () => {
    const question = Question.from(record({ hi: null }));
    expect(question.localized('hi')).toBe(question.localized('en'));
    expect(question.localized('hi').q).toMatch(/Which Article/);
  });

  it('returns Hindi when it is present', () => {
    const question = Question.from(record());
    expect(question.localized('hi').q).toMatch(/अनुच्छेद/);
  });
});
