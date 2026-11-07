import type { CsvTable } from './csv';
import { ContentError, type RowStatus } from './master';

/**
 * The review sheet the founder fills in (D-079).
 *
 * It is a read-only copy of the question plus two editable columns. Keeping the
 * content in the sheet means a reviewer never has to open the master, and the
 * `promote` command refuses a sheet whose content no longer matches the master,
 * so a stale copy cannot overwrite a row.
 */
export const REVIEW_COLUMNS = [
  'id',
  'section',
  'subtopic',
  'status',
  'answer',
  'source_url',
  'decision',
  'note',
  'en_q',
  'en_option_a',
  'en_option_b',
  'en_option_c',
  'en_option_d',
  'en_explanation',
  'hi_q',
  'hi_option_a',
  'hi_option_b',
  'hi_option_c',
  'hi_option_d',
  'hi_explanation',
] as const;

export type ReviewStatus = RowStatus | 'all';

export interface ReviewOptions {
  /** Which rows to export; default `draft`. */
  readonly status?: ReviewStatus;
  /** Only one sub-topic, so a review can be done in shippable slices. */
  readonly subtopic?: string;
}

export interface ReviewSheet {
  readonly header: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly counts: Readonly<Record<RowStatus, number>>;
}

const CONTENT_COLUMNS = REVIEW_COLUMNS.filter((column) => column !== 'decision' && column !== 'note');

const STATUSES: readonly ReviewStatus[] = ['draft', 'verified', 'rejected', 'all'];

export function buildReviewSheet(table: CsvTable, options: ReviewOptions = {}): ReviewSheet {
  const status = options.status ?? 'draft';
  if (!STATUSES.includes(status)) {
    throw new ContentError(`--status must be draft, verified, rejected or all (got "${status}")`);
  }

  const counts: Record<RowStatus, number> = { draft: 0, verified: 0, rejected: 0 };
  const rows: Record<string, string>[] = [];

  for (const row of table.rows) {
    const rowStatus = row.values.status?.trim().toLowerCase() ?? '';
    if (status !== 'all' && rowStatus !== status) continue;
    if (options.subtopic !== undefined && row.values.subtopic !== options.subtopic) continue;
    if (rowStatus === 'draft' || rowStatus === 'verified' || rowStatus === 'rejected') {
      counts[rowStatus] += 1;
    }

    const entry: Record<string, string> = {};
    for (const column of CONTENT_COLUMNS) entry[column] = row.values[column] ?? '';
    entry.decision = '';
    entry.note = '';
    rows.push(entry);
  }

  if (options.subtopic !== undefined && rows.length === 0) {
    throw new ContentError(
      `no ${status === 'all' ? '' : `${status} `}rows for subtopic "${options.subtopic}"`,
    );
  }

  return { header: [...REVIEW_COLUMNS], rows, counts };
}
