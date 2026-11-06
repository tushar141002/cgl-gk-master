import { COLUMNS, type Column, type RowStatus } from '../../tools/content/master';
import type { CsvRow, CsvTable } from '../../tools/content/csv';

/** A complete, publishable row; override one column to test one rule. */
export function masterRow(overrides: Partial<Record<Column, string>> = {}, line = 2): CsvRow {
  const values: Record<Column, string> = {
    id: 'polity-fr-0001',
    v: '1',
    section: 'polity',
    subtopic: 'polity-fundamental-rights',
    source_type: 'practice',
    source_exam: '',
    source_year: '',
    source_shift: '',
    source_date: '',
    source_ca_month: '',
    source_url: 'https://www.ssc.gov.in/',
    en_q: 'Which Article abolishes untouchability?',
    en_option_a: 'Article 14',
    en_option_b: 'Article 15',
    en_option_c: 'Article 16',
    en_option_d: 'Article 17',
    en_explanation: 'Article 17 abolishes untouchability.',
    hi_q: 'कौन-सा अनुच्छेद अस्पृश्यता का अंत करता है?',
    hi_option_a: 'अनुच्छेद 14',
    hi_option_b: 'अनुच्छेद 15',
    hi_option_c: 'अनुच्छेद 16',
    hi_option_d: 'अनुच्छेद 17',
    hi_explanation: 'अनुच्छेद 17 अस्पृश्यता का अंत करता है।',
    answer: 'D',
    difficulty: 'easy',
    image: '',
    status: 'verified',
    verified_at: '2026-11-07T00:00:00.000Z',
  };

  return { line, values: { ...values, ...overrides } };
}

export function masterTable(rows: readonly CsvRow[]): CsvTable {
  return { header: [...COLUMNS], rows: [...rows] };
}

export function statusRow(
  status: RowStatus,
  overrides: Partial<Record<Column, string>> = {},
  line = 2,
): CsvRow {
  return masterRow({ status, ...overrides }, line);
}
