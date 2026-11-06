import { describe, expect, it } from 'vitest';
import { COLUMNS, ContentError, ELO_SEEDS, validateMaster } from '../../tools/content/master';
import { masterRow, masterTable, statusRow } from './fixtures';

const NO_HI = {
  hi_q: '',
  hi_option_a: '',
  hi_option_b: '',
  hi_option_c: '',
  hi_option_d: '',
  hi_explanation: '',
} as const;

describe('validateMaster', () => {
  it('accepts a complete verified row and packs it', () => {
    const report = validateMaster(masterTable([masterRow()]));

    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.counts).toEqual({ verified: 1, draft: 0, rejected: 0 });
    expect(report.questions).toHaveLength(1);
    expect(report.questions[0]?.id).toBe('polity-fr-0001');
  });

  it('lets a draft stay incomplete, as warnings', () => {
    const report = validateMaster(
      masterTable([
        statusRow('draft', {
          ...NO_HI,
          difficulty: '',
          source_url: '',
          verified_at: '',
        }),
      ]),
    );

    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('difficulty is required before publishing'),
        expect.stringContaining('source_url is required before publishing'),
        expect.stringContaining('hi: translation required before publishing'),
      ]),
    );
    expect(report.questions).toEqual([]);
    expect(report.counts.draft).toBe(1);
  });

  it('lets a rejected row stay incomplete too', () => {
    const report = validateMaster(masterTable([statusRow('rejected', { en_q: '', answer: 'Z' })]));
    expect(report.errors).toEqual([]);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('holds a verified row to every publish rule', () => {
    const report = validateMaster(
      masterTable([
        masterRow({
          ...NO_HI,
          difficulty: '',
          source_url: '',
          verified_at: '',
          answer: 'Z',
        }),
      ]),
    );

    const fields = report.errors.join('\n');
    expect(report.errors.length).toBeGreaterThanOrEqual(5);
    expect(fields).toContain('hi: translation required before publishing');
    expect(fields).toContain('difficulty is required before publishing');
    expect(fields).toContain('source_url is required before publishing');
    expect(fields).toContain('answer must be A, B, C or D');
    expect(fields).toContain('verifiedAt');
    expect(report.questions).toEqual([]);
  });

  it('treats a blank id as an error even on a draft', () => {
    const report = validateMaster(masterTable([statusRow('draft', { id: '' })]));
    expect(report.errors).toContainEqual(expect.stringContaining('id must not be empty'));
    expect(report.questions).toEqual([]);
  });

  it('treats an unknown status as an error', () => {
    const report = validateMaster(masterTable([masterRow({ status: 'published' })]));
    expect(report.errors).toContainEqual(
      expect.stringContaining('status must be draft, verified or rejected'),
    );
    expect(report.counts.draft).toBe(1);
  });

  it('accepts status and difficulty case-insensitively', () => {
    const report = validateMaster(masterTable([masterRow({ status: 'Verified', difficulty: 'HARD' })]));
    expect(report.errors).toEqual([]);
    expect(report.questions[0]?.record.eloSeed).toBe(ELO_SEEDS.hard);
  });

  it('rejects duplicate ids on every row that uses them (D-048)', () => {
    const report = validateMaster(
      masterTable([
        masterRow({}, 2),
        statusRow('draft', { en_q: 'Another question?' }, 3),
        statusRow('draft', { en_q: 'A third question?' }, 4),
      ]),
    );

    expect(report.errors).toHaveLength(3);
    expect(report.errors[0]).toContain('is used on lines 2, 3, 4');
    expect(report.questions).toEqual([]);
  });

  it('maps easy, medium and hard to 1100, 1200 and 1300 (D-049)', () => {
    const report = validateMaster(
      masterTable([
        masterRow({ id: 'polity-fr-0001', difficulty: 'easy' }, 2),
        masterRow({ id: 'polity-fr-0002', difficulty: 'medium' }, 3),
        masterRow({ id: 'polity-fr-0003', difficulty: 'hard' }, 4),
      ]),
    );
    expect(report.questions.map((question) => question.record.eloSeed)).toEqual([1100, 1200, 1300]);
  });

  it('maps A, B, C and D to option indexes 0-3', () => {
    const report = validateMaster(
      masterTable([
        masterRow({ id: 'polity-fr-0001', answer: 'A' }, 2),
        masterRow({ id: 'polity-fr-0002', answer: 'b' }, 3),
        masterRow({ id: 'polity-fr-0003', answer: 'C' }, 4),
        masterRow({ id: 'polity-fr-0004', answer: 'd' }, 5),
      ]),
    );
    expect(report.errors).toEqual([]);
    expect(report.questions.map((question) => question.record.answer)).toEqual([0, 1, 2, 3]);
  });

  it('defaults v to 1 when blank', () => {
    const report = validateMaster(masterTable([masterRow({ v: '' })]));
    expect(report.errors).toEqual([]);
    expect(report.questions[0]?.record.v).toBe(1);
  });

  it('rejects a non-positive or non-numeric v', () => {
    expect(validateMaster(masterTable([masterRow({ v: '0' })])).errors).toContainEqual(
      expect.stringContaining('v must be a positive integer'),
    );
    expect(validateMaster(masterTable([masterRow({ v: 'two' })])).errors).toContainEqual(
      expect.stringContaining('v must be a positive integer'),
    );
  });

  it('validates PYQ source details', () => {
    const missing = validateMaster(
      masterTable([masterRow({ source_type: 'PYQ', source_exam: '', source_year: '' })]),
    );
    expect(missing.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('source.exam'),
        expect.stringContaining('source.year'),
      ]),
    );

    const good = validateMaster(
      masterTable([
        masterRow({
          source_type: 'PYQ',
          source_exam: 'SSC CGL',
          source_year: '2023',
          source_shift: 'Shift 1',
          source_date: '2023-09-15',
        }),
      ]),
    );
    expect(good.errors).toEqual([]);
    expect(good.questions[0]?.record.source).toEqual({
      type: 'PYQ',
      exam: 'SSC CGL',
      year: 2023,
      shift: 'Shift 1',
      date: '2023-09-15',
    });
  });

  it('requires a month for current-affairs questions', () => {
    const report = validateMaster(masterTable([masterRow({ source_type: 'CA' })]));
    expect(report.errors).toContainEqual(expect.stringContaining('source.caMonth'));
  });

  it('rejects an unknown section and a non-https source URL', () => {
    const report = validateMaster(
      masterTable([masterRow({ section: 'sports', source_url: 'http://example.com' })]),
    );
    expect(report.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('section'),
        expect.stringContaining('source_url must start with https://'),
      ]),
    );
  });

  it('passes an image name through to the record', () => {
    const report = validateMaster(masterTable([masterRow({ image: 'maps/india.png' })]));
    expect(report.questions[0]?.record.image).toBe('maps/india.png');
  });

  it('throws when the master is missing required columns', () => {
    const header = COLUMNS.filter((column) => column !== 'answer');
    expect(() => validateMaster({ header: [...header], rows: [] })).toThrow(ContentError);
    expect(() => validateMaster({ header: [...header], rows: [] })).toThrow(/answer/);
  });

  it('reports an empty master as valid and empty', () => {
    const report = validateMaster(masterTable([]));
    expect(report.errors).toEqual([]);
    expect(report.questions).toEqual([]);
    expect(report.counts).toEqual({ verified: 0, draft: 0, rejected: 0 });
  });
});
