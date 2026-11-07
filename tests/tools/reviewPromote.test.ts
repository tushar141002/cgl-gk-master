import { describe, expect, it } from 'vitest';
import { parseCsv, writeCsv } from '../../tools/content/csv';
import type { CsvRow, CsvTable } from '../../tools/content/csv';
import { buildReviewSheet, REVIEW_COLUMNS } from '../../tools/content/review';
import { promote } from '../../tools/content/promote';
import { validateMaster } from '../../tools/content/master';
import { masterTable, statusRow } from './fixtures';

const AT = '2026-11-07T12:00:00.000Z';

function bank(): CsvTable {
  return masterTable([
    statusRow('verified', { id: 'polity-fr-0001' }, 2),
    statusRow('draft', { id: 'polity-const-0001', subtopic: 'polity-constitution-basics' }, 3),
    statusRow('draft', { id: 'polity-const-0002', subtopic: 'polity-constitution-basics' }, 4),
  ]);
}

function sheetFor(
  table: CsvTable,
  decisions: Readonly<Record<string, string>> = {},
  notes: Readonly<Record<string, string>> = {},
): CsvTable {
  const sheet = buildReviewSheet(table, { status: 'all' });
  const rows: CsvRow[] = sheet.rows.map((values, index) => ({
    line: index + 2,
    values: {
      ...values,
      decision: decisions[values.id ?? ''] ?? '',
      note: notes[values.id ?? ''] ?? '',
    },
  }));
  return { header: sheet.header, rows };
}

describe('buildReviewSheet', () => {
  it('exports only drafts by default with empty decisions', () => {
    const sheet = buildReviewSheet(bank());

    expect(sheet.header).toEqual([...REVIEW_COLUMNS]);
    expect(sheet.rows.map((row) => row.id)).toEqual(['polity-const-0001', 'polity-const-0002']);
    expect(sheet.rows.every((row) => row.decision === '' && row.note === '')).toBe(true);
    expect(sheet.counts).toEqual({ verified: 0, draft: 2, rejected: 0 });
    expect(sheet.rows[0]?.hi_q).toContain('अस्पृश्यता');
  });

  it('can export verified rows for a spot-check', () => {
    const sheet = buildReviewSheet(bank(), { status: 'verified' });
    expect(sheet.rows.map((row) => row.id)).toEqual(['polity-fr-0001']);
    expect(sheet.counts).toEqual({ verified: 1, draft: 0, rejected: 0 });
  });

  it('filters by subtopic and rejects an unknown one', () => {
    const sheet = buildReviewSheet(bank(), {
      status: 'draft',
      subtopic: 'polity-constitution-basics',
    });
    expect(sheet.rows).toHaveLength(2);

    expect(() => buildReviewSheet(bank(), { status: 'draft', subtopic: 'geography-rivers-lakes' })).toThrow(
      /no draft rows for subtopic/,
    );
  });

  it('round-trips questions and Hindi through the CSV writer', () => {
    const sheet = buildReviewSheet(bank(), { status: 'draft' });
    const text = writeCsv(sheet.header, sheet.rows, { bom: true });
    const parsed = parseCsv(text);

    expect(parsed.header).toEqual([...REVIEW_COLUMNS]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.values.hi_q).toBe(sheet.rows[0]?.hi_q);
    expect(parsed.rows[0]?.values.en_q).toBe(sheet.rows[0]?.en_q);
  });
});

describe('promote', () => {
  it('approves a draft and stamps verified_at', () => {
    const table = bank();
    const summary = promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), { at: AT });

    const row = summary.table.rows.find((entry) => entry.values.id === 'polity-const-0001')!;
    expect(row.values.status).toBe('verified');
    expect(row.values.verified_at).toBe(AT);
    expect(summary).toMatchObject({ approved: 1, rejected: 0, pending: 2, changed: 1 });
    expect(summary.table.rows[0]?.values.status).toBe('verified');
  });

  it('rejects a verified row and clears verified_at', () => {
    const table = bank();
    const summary = promote(
      table,
      sheetFor(table, { 'polity-fr-0001': 'reject' }, { 'polity-fr-0001': 'wrong Article' }),
      { at: AT },
    );

    const row = summary.table.rows.find((entry) => entry.values.id === 'polity-fr-0001')!;
    expect(row.values.status).toBe('rejected');
    expect(row.values.verified_at).toBe('');
    expect(summary.changed).toBe(1);
  });

  it('leaves blank decisions and fix rows untouched', () => {
    const table = bank();
    const summary = promote(
      table,
      sheetFor(
        table,
        { 'polity-const-0001': 'fix' },
        { 'polity-const-0001': 'option B should say Article 18' },
      ),
      { at: AT },
    );

    expect(summary.pending).toBe(2);
    expect(summary.fix).toEqual([{ id: 'polity-const-0001', note: 'option B should say Article 18' }]);
    expect(summary.changed).toBe(0);
    expect(summary.table.rows.map((row) => row.values.status)).toEqual(['verified', 'draft', 'draft']);
  });

  it('requires a note for reject and fix', () => {
    const table = bank();
    expect(() => promote(table, sheetFor(table, { 'polity-const-0001': 'reject' }), { at: AT })).toThrow(
      /reject needs a note/,
    );
    expect(() => promote(table, sheetFor(table, { 'polity-const-0001': 'fix' }), { at: AT })).toThrow(
      /fix needs a note/,
    );
  });

  it('rejects an unknown decision and a note without a decision', () => {
    const table = bank();
    expect(() => promote(table, sheetFor(table, { 'polity-const-0001': 'maybe' }), { at: AT })).toThrow(
      /decision must be approve, reject or fix/,
    );
    expect(() => promote(table, sheetFor(table, {}, { 'polity-const-0001': 'typo' }), { at: AT })).toThrow(
      /a note needs/,
    );
  });

  it('refuses a stale sheet instead of overwriting the master', () => {
    const table = bank();
    const sheet = sheetFor(table, { 'polity-const-0001': 'approve' });
    const stale: CsvTable = {
      header: sheet.header,
      rows: sheet.rows.map((row) =>
        row.values.id === 'polity-const-0001'
          ? { line: row.line, values: { ...row.values, en_q: 'A different question entirely?' } }
          : row,
      ),
    };

    expect(() => promote(table, stale, { at: AT })).toThrow(/no longer matches the master/);
  });

  it('refuses an id that is not in the master and a duplicate sheet row', () => {
    const table = bank();
    const missing: CsvTable = {
      header: [...REVIEW_COLUMNS],
      rows: [
        {
          line: 2,
          values: { ...buildReviewSheet(table).rows[0]!, id: 'polity-const-9999', decision: 'approve' },
        },
      ],
    };
    expect(() => promote(table, missing, { at: AT })).toThrow(/not in the master/);

    const sheet = sheetFor(table, { 'polity-const-0001': 'approve' });
    const duplicated: CsvTable = {
      header: sheet.header,
      rows: [sheet.rows[0]!, { ...sheet.rows[0]!, line: 3 }],
    };
    expect(() => promote(table, duplicated, { at: AT })).toThrow(/appears more than once/);
  });

  it('applies only the requested subtopic', () => {
    const table = bank();
    const summary = promote(
      table,
      sheetFor(
        table,
        {
          'polity-const-0001': 'approve',
          'polity-fr-0001': 'reject',
        },
        { 'polity-fr-0001': 'wrong Article' },
      ),
      { at: AT, subtopic: 'polity-constitution-basics' },
    );

    expect(summary.approved).toBe(1);
    expect(summary.rejected).toBe(0);
    expect(summary.ignored).toBe(1);
    expect(summary.table.rows[0]?.values.status).toBe('verified');
  });

  it('refuses to approve a row that is not publishable', () => {
    const table = masterTable([statusRow('draft', { id: 'polity-const-0001', source_url: '' }, 2)]);
    expect(() => promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), { at: AT })).toThrow(
      /promotion would create an invalid master/,
    );
  });

  it('keeps the master valid after a real promotion', () => {
    const table = bank();
    const summary = promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), { at: AT });
    const parsed = parseCsv(
      writeCsv(
        summary.table.header,
        summary.table.rows.map((row) => row.values),
      ),
    );

    expect(parsed.rows).toHaveLength(3);
    expect(validateMaster(parsed).errors).toEqual([]);
    expect(validateMaster(parsed).counts).toEqual({ verified: 2, draft: 1, rejected: 0 });
  });
});
