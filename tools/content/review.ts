import type { CsvTable } from './csv';
import { contentHash } from './hash';
import { ContentError, type RowStatus } from './master';

/**
 * The review sheets the founder fills in (D-079, D-080, D-081).
 *
 * The English sheet is a read-only copy of the question plus `decision`/`note`.
 * The Hindi sheet is a second copy focused on translation, with
 * `hi_check`/`hi_note`. Both carry a `content_hash`, so `promote` can refuse a
 * sheet whose content no longer matches the master — including an edit to an
 * option or explanation, which the old four-field check could not see.
 */
export const REVIEW_CONTENT_COLUMNS = [
  'id',
  'section',
  'subtopic',
  'status',
  'answer',
  'source_url',
  'source_ref',
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

export const REVIEW_COLUMNS = [
  'id',
  'section',
  'subtopic',
  'status',
  'answer',
  'source_url',
  'source_ref',
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
  'content_hash',
] as const;

/**
 * The Hindi hash deliberately omits `status` and the source fields. A source
 * backfill or a promotion must not invalidate a Hindi check that is still
 * correct; a change to the English, Hindi or answer must.
 */
export const HINDI_CONTENT_COLUMNS = [
  'id',
  'answer',
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

export const HINDI_COLUMNS = [
  'id',
  'section',
  'subtopic',
  'status',
  'answer',
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
  'hi_check',
  'hi_note',
  'content_hash',
] as const;

export type ReviewStatus = RowStatus | 'all';

export interface ReviewOptions {
  /** Which rows to export; English defaults to `draft`, Hindi to `all`. */
  readonly status?: ReviewStatus;
  /** Only one sub-topic, so a review can be done in shippable slices. */
  readonly subtopic?: string;
  /** Preserve decisions from the previous export for rows whose content is unchanged. */
  readonly carry?: CsvTable;
}

export interface CarrySummary {
  /** Decisions copied because the content hash still matches. */
  readonly carried: number;
  /** Decisions not copied because the content changed. */
  readonly dropped: number;
  /** Rows present in the old sheet whose content changed. */
  readonly changed: number;
  /** Rows not present in the old sheet. */
  readonly added: number;
}

export interface ReviewSheet extends CarrySummary {
  readonly header: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly counts: Readonly<Record<RowStatus, number>>;
}

export interface HindiSheet extends CarrySummary {
  readonly header: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly counts: Readonly<Record<RowStatus, number>>;
}

const STATUSES: readonly ReviewStatus[] = ['draft', 'verified', 'rejected', 'all'];

const EMPTY_CARRY: CarrySummary = { carried: 0, dropped: 0, changed: 0, added: 0 };

export function buildReviewSheet(table: CsvTable, options: ReviewOptions = {}): ReviewSheet {
  const status = options.status ?? 'draft';
  assertStatus(status);

  const counts: Record<RowStatus, number> = { draft: 0, verified: 0, rejected: 0 };
  const rows: Record<string, string>[] = [];

  for (const row of table.rows) {
    const rowStatus = row.values.status?.trim().toLowerCase() ?? '';
    if (status !== 'all' && rowStatus !== status) continue;
    if (options.subtopic !== undefined && row.values.subtopic !== options.subtopic) continue;
    if (isStatus(rowStatus)) counts[rowStatus] += 1;

    const entry: Record<string, string> = {};
    for (const column of REVIEW_CONTENT_COLUMNS) entry[column] = row.values[column] ?? '';
    entry.decision = '';
    entry.note = '';
    entry.content_hash = contentHash(entry, REVIEW_CONTENT_COLUMNS);
    rows.push(entry);
  }

  assertNotEmpty(rows, status, options.subtopic);
  const carry =
    options.carry === undefined
      ? EMPTY_CARRY
      : carryDecisions(rows, options.carry, {
          decisionColumn: 'decision',
          noteColumn: 'note',
          contentColumns: REVIEW_CONTENT_COLUMNS,
          validDecisions: ['approve', 'reject', 'fix'],
          noteRequired: ['reject', 'fix'],
        });

  return { header: [...REVIEW_COLUMNS], rows, counts, ...carry };
}

export function buildHindiSheet(table: CsvTable, options: ReviewOptions = {}): HindiSheet {
  const status = options.status ?? 'all';
  assertStatus(status);

  const counts: Record<RowStatus, number> = { draft: 0, verified: 0, rejected: 0 };
  const rows: Record<string, string>[] = [];

  for (const row of table.rows) {
    const rowStatus = row.values.status?.trim().toLowerCase() ?? '';
    if (status !== 'all' && rowStatus !== status) continue;
    if (options.subtopic !== undefined && row.values.subtopic !== options.subtopic) continue;
    if (isStatus(rowStatus)) counts[rowStatus] += 1;

    const entry: Record<string, string> = {};
    for (const column of HINDI_COLUMNS) {
      if (column === 'hi_check' || column === 'hi_note' || column === 'content_hash') continue;
      entry[column] = row.values[column] ?? '';
    }
    entry.hi_check = '';
    entry.hi_note = '';
    entry.content_hash = contentHash(entry, HINDI_CONTENT_COLUMNS);
    rows.push(entry);
  }

  assertNotEmpty(rows, status, options.subtopic);
  const carry =
    options.carry === undefined
      ? EMPTY_CARRY
      : carryDecisions(rows, options.carry, {
          decisionColumn: 'hi_check',
          noteColumn: 'hi_note',
          contentColumns: HINDI_CONTENT_COLUMNS,
          validDecisions: ['ok', 'fix'],
          noteRequired: ['fix'],
        });

  return { header: [...HINDI_COLUMNS], rows, counts, ...carry };
}

interface CarryConfig {
  readonly decisionColumn: string;
  readonly noteColumn: string;
  readonly contentColumns: readonly string[];
  readonly validDecisions: readonly string[];
  readonly noteRequired: readonly string[];
}

/**
 * Copies a previous sheet's decisions onto a fresh export, row by row.
 *
 * The decision travels only when the content hash is identical. A row whose
 * question, options, explanation, answer or source changed is left blank and
 * counted, so a reviewer sees exactly what needs another look. A stale stored
 * hash is an error rather than a silent mismatch: the old sheet was edited by
 * hand and its decisions cannot be trusted.
 */
function carryDecisions(rows: Record<string, string>[], old: CsvTable, config: CarryConfig): CarrySummary {
  const byId = new Map<string, Readonly<Record<string, string>>>();
  for (const row of old.rows) {
    const id = (row.values.id ?? '').trim();
    if (id === '') {
      throw new ContentError(`carry sheet line ${row.line}: id must not be empty`);
    }
    if (byId.has(id)) {
      throw new ContentError(`carry sheet line ${row.line}: id "${id}" appears more than once`);
    }
    byId.set(id, row.values);
  }

  let carried = 0;
  let dropped = 0;
  let changed = 0;
  let added = 0;

  for (const row of rows) {
    const id = row.id ?? '';
    const previous = byId.get(id);
    if (previous === undefined) {
      added += 1;
      continue;
    }

    const computed = contentHash(previous, config.contentColumns);
    const stored = (previous.content_hash ?? '').trim();
    if (stored !== '' && stored !== computed) {
      throw new ContentError(
        `carry sheet (${id}): content_hash does not match its content; export a fresh sheet`,
      );
    }

    const decision = (previous[config.decisionColumn] ?? '').trim().toLowerCase();
    const note = (previous[config.noteColumn] ?? '').trim();
    if (decision !== '' && !config.validDecisions.includes(decision)) {
      throw new ContentError(
        `carry sheet (${id}): ${config.decisionColumn} must be ` +
          `${config.validDecisions.join(', ')} or blank (got "${decision}")`,
      );
    }
    if (decision === '' && note !== '') {
      throw new ContentError(`carry sheet (${id}): ${config.noteColumn} needs a ${config.decisionColumn}`);
    }
    if (config.noteRequired.includes(decision) && note === '') {
      throw new ContentError(`carry sheet (${id}): ${decision} needs a ${config.noteColumn}`);
    }

    if (computed === (row.content_hash ?? '')) {
      if (decision !== '') {
        row[config.decisionColumn] = decision;
        row[config.noteColumn] = note;
        carried += 1;
      }
    } else {
      changed += 1;
      if (decision !== '') dropped += 1;
    }
  }

  return { carried, dropped, changed, added };
}

function assertStatus(status: string): asserts status is ReviewStatus {
  if (!STATUSES.includes(status as ReviewStatus)) {
    throw new ContentError(`--status must be draft, verified, rejected or all (got "${status}")`);
  }
}

function isStatus(value: string): value is RowStatus {
  return value === 'draft' || value === 'verified' || value === 'rejected';
}

function assertNotEmpty(
  rows: readonly Record<string, string>[],
  status: ReviewStatus,
  subtopic: string | undefined,
): void {
  if (subtopic !== undefined && rows.length === 0) {
    throw new ContentError(`no ${status === 'all' ? '' : `${status} `}rows for subtopic "${subtopic}"`);
  }
}
