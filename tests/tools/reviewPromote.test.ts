import { describe, expect, it } from 'vitest';
import { parseCsv, writeCsv } from '../../tools/content/csv';
import type { CsvRow, CsvTable } from '../../tools/content/csv';
import { buildHindiSheet, buildReviewSheet, HINDI_COLUMNS, REVIEW_COLUMNS } from '../../tools/content/review';
import { promote } from '../../tools/content/promote';
import { validateMaster } from '../../tools/content/master';
import { masterTable, statusRow } from './fixtures';

const AT = '2026-11-07T12:00:00.000Z';
const LATER = '2026-11-08T12:00:00.000Z';

const NO_HI = {
  hi_q: '',
  hi_option_a: '',
  hi_option_b: '',
  hi_option_c: '',
  hi_option_d: '',
  hi_explanation: '',
} as const;

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

function hindiFor(
  table: CsvTable,
  checks: Readonly<Record<string, string>> = {},
  notes: Readonly<Record<string, string>> = {},
): CsvTable {
  const sheet = buildHindiSheet(table, { status: 'all' });
  const rows: CsvRow[] = sheet.rows.map((values, index) => ({
    line: index + 2,
    values: {
      ...values,
      hi_check: checks[values.id ?? ''] ?? '',
      hi_note: notes[values.id ?? ''] ?? '',
    },
  }));
  return { header: sheet.header, rows };
}

function hindiOk(table: CsvTable): CsvTable {
  const sheet = buildHindiSheet(table, { status: 'all' });
  const checks: Record<string, string> = {};
  for (const row of sheet.rows) checks[row.id ?? ''] = 'ok';
  return hindiFor(table, checks);
}

function replaceRow(table: CsvTable, id: string, values: Partial<Record<string, string>>): CsvTable {
  return {
    header: table.header,
    rows: table.rows.map((row) => {
      if (row.values.id !== id) return row;
      const merged: Record<string, string> = { ...row.values };
      for (const [key, value] of Object.entries(values)) {
        if (value !== undefined) merged[key] = value;
      }
      return { line: row.line, values: merged };
    }),
  };
}

describe('buildReviewSheet', () => {
  it('exports only drafts by default with empty decisions and a content hash', () => {
    const sheet = buildReviewSheet(bank());

    expect(sheet.header).toEqual([...REVIEW_COLUMNS]);
    expect(sheet.rows.map((row) => row.id)).toEqual(['polity-const-0001', 'polity-const-0002']);
    expect(sheet.rows.every((row) => row.decision === '' && row.note === '')).toBe(true);
    expect(sheet.rows.every((row) => (row.content_hash ?? '').length === 64)).toBe(true);
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

  it('round-trips questions, sources and Hindi through the CSV writer', () => {
    const sheet = buildReviewSheet(bank(), { status: 'draft' });
    const text = writeCsv(sheet.header, sheet.rows, { bom: true });
    const parsed = parseCsv(text);

    expect(parsed.header).toEqual([...REVIEW_COLUMNS]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.values.hi_q).toBe(sheet.rows[0]?.hi_q);
    expect(parsed.rows[0]?.values.en_q).toBe(sheet.rows[0]?.en_q);
    expect(parsed.rows[0]?.values.source_ref).toBe('Article 17');
    expect(parsed.rows[0]?.values.content_hash).toBe(sheet.rows[0]?.content_hash);
  });

  it('carries a decision only while the content hash is unchanged', () => {
    const table = bank();
    const old = sheetFor(
      table,
      { 'polity-const-0001': 'approve', 'polity-const-0002': 'reject' },
      { 'polity-const-0002': 'wrong Article 17' },
    );
    const changed = replaceRow(table, 'polity-const-0001', { en_option_a: 'Article 99' });
    const next = buildReviewSheet(changed, { status: 'all', carry: old });

    expect(next.carried).toBe(1);
    expect(next.dropped).toBe(1);
    expect(next.changed).toBe(1);
    expect(next.rows.find((row) => row.id === 'polity-const-0001')?.decision).toBe('');
    expect(next.rows.find((row) => row.id === 'polity-const-0002')?.decision).toBe('reject');
    expect(next.rows.find((row) => row.id === 'polity-const-0002')?.note).toBe('wrong Article 17');
  });
});

describe('buildHindiSheet', () => {
  it('exports all statuses by default with blank checks and a translation hash', () => {
    const sheet = buildHindiSheet(bank());

    expect(sheet.header).toEqual([...HINDI_COLUMNS]);
    expect(sheet.rows.map((row) => row.id)).toEqual([
      'polity-fr-0001',
      'polity-const-0001',
      'polity-const-0002',
    ]);
    expect(sheet.rows.every((row) => row.hi_check === '' && row.hi_note === '')).toBe(true);
    expect(sheet.rows.every((row) => (row.content_hash ?? '').length === 64)).toBe(true);
    expect(sheet.counts).toEqual({ verified: 1, draft: 2, rejected: 0 });
  });

  it('carries a Hindi check only while the translation content is unchanged', () => {
    const table = bank();
    const old = hindiFor(
      table,
      { 'polity-const-0001': 'ok', 'polity-const-0002': 'fix' },
      { 'polity-const-0002': 'अनुच्छेद 17 की जगह 18 लिखा है' },
    );
    const changed = replaceRow(table, 'polity-const-0002', { hi_q: 'बदला हुआ प्रश्न?' });
    const next = buildHindiSheet(changed, { status: 'all', carry: old });

    expect(next.carried).toBe(1);
    expect(next.dropped).toBe(1);
    expect(next.changed).toBe(1);
    expect(next.rows.find((row) => row.id === 'polity-const-0001')?.hi_check).toBe('ok');
    expect(next.rows.find((row) => row.id === 'polity-const-0002')?.hi_check).toBe('');
  });
});

describe('promote', () => {
  it('approves a draft with English, Hindi and source gates and stamps verified_at', () => {
    const table = bank();
    const summary = promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), {
      at: AT,
      hindi: hindiOk(table),
    });

    const row = summary.table.rows.find((entry) => entry.values.id === 'polity-const-0001')!;
    expect(row.values.status).toBe('verified');
    expect(row.values.verified_at).toBe(AT);
    expect(summary).toMatchObject({ approved: 1, rejected: 0, pending: 2, changed: 1 });
    expect(summary.table.rows[0]?.values.status).toBe('verified');
  });

  it('rejects a verified row and clears verified_at without needing Hindi', () => {
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

  it('lets a reject work without Hindi or a source, because it ships nothing', () => {
    const table = masterTable([
      statusRow('draft', { id: 'polity-const-0001', source_url: '', source_ref: '' }, 2),
    ]);
    const summary = promote(
      table,
      sheetFor(table, { 'polity-const-0001': 'reject' }, { 'polity-const-0001': 'duplicate' }),
      { at: AT },
    );

    expect(summary.rejected).toBe(1);
    expect(summary.table.rows[0]?.values.status).toBe('rejected');
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

  it('refuses a sheet whose question was edited without a fresh hash', () => {
    const table = bank();
    const sheet = sheetFor(table, { 'polity-const-0001': 'approve' });
    const stale = replaceRow(sheet, 'polity-const-0001', { en_q: 'A different question entirely?' });

    expect(() => promote(table, stale, { at: AT, hindi: hindiOk(table) })).toThrow(
      /content_hash does not match the sheet content/,
    );
  });

  it('refuses a sheet whose option or explanation changed, not just en_q', () => {
    const table = bank();
    const sheet = sheetFor(table, { 'polity-const-0001': 'approve' });
    const stale = replaceRow(sheet, 'polity-const-0001', { en_option_c: 'A changed option' });

    expect(() => promote(table, stale, { at: AT, hindi: hindiOk(table) })).toThrow(
      /content_hash does not match the sheet content/,
    );
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
    expect(() => promote(table, missing, { at: AT, hindi: hindiOk(table) })).toThrow(/not in the master/);

    const sheet = sheetFor(table, { 'polity-const-0001': 'approve' });
    const duplicated: CsvTable = {
      header: sheet.header,
      rows: [sheet.rows[0]!, { ...sheet.rows[0]!, line: 3 }],
    };
    expect(() => promote(table, duplicated, { at: AT, hindi: hindiOk(table) })).toThrow(
      /appears more than once/,
    );
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
      { at: AT, subtopic: 'polity-constitution-basics', hindi: hindiOk(table) },
    );

    expect(summary.approved).toBe(1);
    expect(summary.rejected).toBe(0);
    expect(summary.ignored).toBe(1);
    expect(summary.table.rows[0]?.values.status).toBe('verified');
  });

  it('requires a Hindi sheet before approving anything', () => {
    const table = bank();
    expect(() => promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), { at: AT })).toThrow(
      /requires --hindi/,
    );
  });

  it('refuses an approval whose Hindi row is blank or marked fix', () => {
    const table = bank();
    expect(() =>
      promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), {
        at: AT,
        hindi: hindiFor(table),
      }),
    ).toThrow(/hi_check must be ok/);

    expect(() =>
      promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), {
        at: AT,
        hindi: hindiFor(table, { 'polity-const-0001': 'fix' }, { 'polity-const-0001': 'गलत अनुवाद' }),
      }),
    ).toThrow(/hi_check must be ok/);
  });

  it('refuses a Hindi sheet whose translation was edited without a fresh hash', () => {
    const table = bank();
    const hindi = replaceRow(hindiOk(table), 'polity-const-0001', { hi_q: 'बदला हुआ प्रश्न?' });

    expect(() =>
      promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), { at: AT, hindi }),
    ).toThrow(/content_hash does not match the Hindi sheet content/);
  });

  it('refuses a Hindi sheet that no longer matches the master', () => {
    const table = bank();
    const hindi = hindiOk(table);
    const changed = replaceRow(table, 'polity-const-0001', { en_q: 'A newer question?' });
    const sheet = sheetFor(changed, { 'polity-const-0001': 'approve' });

    expect(() => promote(changed, sheet, { at: AT, hindi })).toThrow(
      /Hindi sheet no longer matches the master/,
    );
  });

  it('requires a source_ref before approval', () => {
    const table = masterTable([statusRow('draft', { id: 'polity-const-0001', source_ref: '' }, 2)]);
    expect(() =>
      promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), {
        at: AT,
        hindi: hindiOk(table),
      }),
    ).toThrow(/source_ref is required/);
  });

  it('refuses a front-page source_url before approval', () => {
    const table = masterTable([
      statusRow('draft', { id: 'polity-const-0001', source_url: 'https://www.ssc.gov.in/' }, 2),
    ]);
    expect(() =>
      promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), {
        at: AT,
        hindi: hindiOk(table),
      }),
    ).toThrow(/source_url is a front page/);
  });

  it('re-stamps a verified row when it is approved again after a fresh check', () => {
    const table = masterTable([statusRow('verified', { id: 'polity-fr-0001' }, 2)]);
    const summary = promote(table, sheetFor(table, { 'polity-fr-0001': 'approve' }), {
      at: LATER,
      hindi: hindiOk(table),
    });

    expect(summary.changed).toBe(1);
    expect(summary.table.rows[0]?.values.verified_at).toBe(LATER);
  });

  it('still validates the candidate master after a real promotion', () => {
    const table = bank();
    const summary = promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), {
      at: AT,
      hindi: hindiOk(table),
    });
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

  it('refuses to approve a row whose Hindi translation is missing', () => {
    const table = masterTable([statusRow('draft', { id: 'polity-const-0001', ...NO_HI }, 2)]);
    expect(() =>
      promote(table, sheetFor(table, { 'polity-const-0001': 'approve' }), {
        at: AT,
        hindi: hindiOk(table),
      }),
    ).toThrow(/promotion would create an invalid master/);
  });
});
