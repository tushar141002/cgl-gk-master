import type { CsvRow, CsvTable } from './csv';
import { contentHash } from './hash';
import { ContentError, validateMaster } from './master';
import { HINDI_CONTENT_COLUMNS, REVIEW_CONTENT_COLUMNS } from './review';
import { isFrontPageUrl } from './sources';

/**
 * Applies a filled review sheet to the master (D-079, D-080, D-081, D-082).
 *
 * Only `approve` and `reject` change the master; `fix` and a blank decision
 * leave the row alone. An approval needs three independent proofs:
 *
 * 1. the English sheet's content hash matches both the sheet and the master;
 * 2. the Hindi sheet says `hi_check=ok` and its translation hash matches;
 * 3. the row has a `source_ref` and a source URL that is not a front page.
 *
 * The whole sheet is checked before anything is written, and the candidate
 * master is validated again before the atomic write.
 */
export type Decision = 'approve' | 'reject' | 'fix';

const DECISIONS: readonly Decision[] = ['approve', 'reject', 'fix'];
const REQUIRED_COLUMNS = [...REVIEW_CONTENT_COLUMNS, 'content_hash', 'decision', 'note'] as const;
const HINDI_REQUIRED_COLUMNS = [...HINDI_CONTENT_COLUMNS, 'content_hash', 'hi_check', 'hi_note'] as const;
const HINDI_DECISIONS = ['ok', 'fix'] as const;

export interface PromoteOptions {
  /** ISO timestamp written to `verified_at` on approval. */
  readonly at: string;
  /** Apply only this sub-topic, so promotion stays incremental. */
  readonly subtopic?: string;
  /** Required when the sheet contains an approval (D-081). */
  readonly hindi?: CsvTable;
}

export interface PromoteSummary {
  readonly table: CsvTable;
  readonly approved: number;
  readonly rejected: number;
  readonly fix: readonly { readonly id: string; readonly note: string }[];
  readonly pending: number;
  /** Decisions for another sub-topic when `--subtopic` is set. */
  readonly ignored: number;
  /** Rows whose status or verification stamp actually moved. */
  readonly changed: number;
  readonly perSubtopic: Readonly<
    Record<string, { approved: number; rejected: number; fix: number; pending: number }>
  >;
}

interface PendingDecision {
  readonly master: CsvRow;
  readonly label: string;
  readonly decision: Decision | null;
  readonly note: string;
}

export function promote(table: CsvTable, sheet: CsvTable, options: PromoteOptions): PromoteSummary {
  if (Number.isNaN(Date.parse(options.at))) {
    throw new ContentError(`--at must be an ISO timestamp (got "${options.at}")`);
  }
  requireColumns(sheet, REQUIRED_COLUMNS, 'review sheet');
  if (options.subtopic !== undefined) {
    const known = table.rows.some((row) => row.values.subtopic === options.subtopic);
    if (!known) throw new ContentError(`no rows for subtopic "${options.subtopic}"`);
  }

  const errors: string[] = [];
  const byId = new Map<string, CsvRow>();
  for (const row of table.rows) {
    const id = (row.values.id ?? '').trim();
    if (id !== '') byId.set(id, row);
  }

  const seen = new Set<string>();
  const decisions: PendingDecision[] = [];
  let ignored = 0;

  for (const row of sheet.rows) {
    const label = `review line ${row.line}`;
    const id = (row.values.id ?? '').trim();
    if (id === '') {
      errors.push(`${label}: id must not be empty`);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${label}: id "${id}" appears more than once`);
      continue;
    }
    seen.add(id);

    const rawDecision = (row.values.decision ?? '').trim().toLowerCase();
    const decision = parseDecision(rawDecision);
    if (rawDecision !== '' && decision === null) {
      errors.push(`${label} (${id}): decision must be approve, reject or fix (got "${rawDecision}")`);
      continue;
    }
    const note = (row.values.note ?? '').trim();
    if (decision === null && note !== '') {
      errors.push(`${label} (${id}): a note needs an approve, reject or fix decision`);
      continue;
    }
    if ((decision === 'reject' || decision === 'fix') && note === '') {
      errors.push(`${label} (${id}): ${decision} needs a note explaining why`);
      continue;
    }

    const master = byId.get(id);
    if (master === undefined) {
      errors.push(`${label}: id "${id}" is not in the master`);
      continue;
    }
    if (options.subtopic !== undefined && master.values.subtopic !== options.subtopic) {
      ignored += 1;
      continue;
    }

    checkSheetHash(row, master, label, id, errors);
    if (decision === 'approve') checkSource(master, label, id, errors);

    decisions.push({ master, label, decision, note });
  }

  const approvals = decisions.filter((entry) => entry.decision === 'approve');
  const hindiById = validateHindi(options.hindi, approvals.length > 0, errors);
  if (hindiById !== undefined) {
    for (const approval of approvals) {
      checkHindi(approval, hindiById, errors);
    }
  }

  if (errors.length > 0) throw new ContentError(formatErrors(errors));

  const updated = new Map<CsvRow, Record<string, string>>();
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  let changed = 0;
  const fix: { id: string; note: string }[] = [];
  const perSubtopic: Record<string, { approved: number; rejected: number; fix: number; pending: number }> =
    {};

  for (const { master, decision, note } of decisions) {
    const subtopic = master.values.subtopic ?? '';
    const counts = (perSubtopic[subtopic] ??= { approved: 0, rejected: 0, fix: 0, pending: 0 });
    const next = { ...master.values };

    if (decision === null) {
      pending += 1;
      counts.pending += 1;
    } else if (decision === 'approve') {
      approved += 1;
      counts.approved += 1;
      if (next.status !== 'verified' || next.verified_at !== options.at) {
        next.status = 'verified';
        next.verified_at = options.at;
        changed += 1;
      }
    } else if (decision === 'reject') {
      rejected += 1;
      counts.rejected += 1;
      if (next.status !== 'rejected' || next.verified_at !== '') {
        next.status = 'rejected';
        next.verified_at = '';
        changed += 1;
      }
    } else {
      counts.fix += 1;
      fix.push({ id: master.values.id ?? '', note });
    }

    updated.set(master, next);
  }

  const rows: CsvRow[] = table.rows.map((row) => {
    const values = updated.get(row);
    return values === undefined ? row : { line: row.line, values };
  });
  const candidate: CsvTable = { header: [...table.header], rows };
  const report = validateMaster(candidate);
  if (report.errors.length > 0) {
    throw new ContentError(
      `promotion would create an invalid master:\n${report.errors.slice(0, 20).join('\n')}`,
    );
  }

  return { table: candidate, approved, rejected, fix, pending, ignored, changed, perSubtopic };
}

function checkSheetHash(row: CsvRow, master: CsvRow, label: string, id: string, errors: string[]): void {
  const stored = (row.values.content_hash ?? '').trim();
  if (stored === '') {
    errors.push(`${label} (${id}): content_hash is missing; export a fresh sheet`);
    return;
  }

  const computed = contentHash(row.values, REVIEW_CONTENT_COLUMNS);
  if (stored !== computed) {
    errors.push(`${label} (${id}): content_hash does not match the sheet content; export a fresh sheet`);
    return;
  }

  const masterHash = contentHash(master.values, REVIEW_CONTENT_COLUMNS);
  if (stored !== masterHash) {
    errors.push(`${label} (${id}): the sheet no longer matches the master; export a fresh sheet`);
  }
}

function checkSource(master: CsvRow, label: string, id: string, errors: string[]): void {
  const sourceRef = (master.values.source_ref ?? '').trim();
  const sourceUrl = (master.values.source_url ?? '').trim();

  if (sourceRef === '') {
    errors.push(
      `${label} (${id}): source_ref is required before approval; add an Article, section, chapter or page`,
    );
  }
  if (sourceUrl === '') {
    errors.push(`${label} (${id}): source_url is required before approval`);
  } else if (!/^https:\/\/\S+$/.test(sourceUrl)) {
    errors.push(`${label} (${id}): source_url must start with https:// (got "${sourceUrl}")`);
  } else if (isFrontPageUrl(sourceUrl)) {
    errors.push(`${label} (${id}): source_url is a front page; link the exact page or PDF`);
  }
}

function validateHindi(
  hindi: CsvTable | undefined,
  approvalsExist: boolean,
  errors: string[],
): Map<string, CsvRow> | undefined {
  if (hindi === undefined) {
    if (approvalsExist) {
      errors.push('approving rows requires --hindi <sheet.csv>; export one with `content:review --lang hi`');
    }
    return undefined;
  }

  requireColumns(hindi, HINDI_REQUIRED_COLUMNS, 'Hindi sheet');
  const byId = new Map<string, CsvRow>();
  for (const row of hindi.rows) {
    const label = `Hindi line ${row.line}`;
    const id = (row.values.id ?? '').trim();
    if (id === '') {
      errors.push(`${label}: id must not be empty`);
      continue;
    }
    if (byId.has(id)) {
      errors.push(`${label}: id "${id}" appears more than once`);
      continue;
    }
    byId.set(id, row);

    const check = (row.values.hi_check ?? '').trim().toLowerCase();
    const note = (row.values.hi_note ?? '').trim();
    if (check !== '' && !(HINDI_DECISIONS as readonly string[]).includes(check)) {
      errors.push(`${label} (${id}): hi_check must be ok, fix or blank (got "${check}")`);
    }
    if (check === '' && note !== '') {
      errors.push(`${label} (${id}): hi_note needs an ok or fix hi_check`);
    }
    if (check === 'fix' && note === '') {
      errors.push(`${label} (${id}): fix needs a hi_note explaining what is wrong`);
    }

    const stored = (row.values.content_hash ?? '').trim();
    if (stored === '') {
      errors.push(`${label} (${id}): content_hash is missing; export a fresh Hindi sheet`);
    } else if (stored !== contentHash(row.values, HINDI_CONTENT_COLUMNS)) {
      errors.push(
        `${label} (${id}): content_hash does not match the Hindi sheet content; export a fresh sheet`,
      );
    }
  }

  return byId;
}

function checkHindi(
  approval: PendingDecision,
  hindiById: ReadonlyMap<string, CsvRow>,
  errors: string[],
): void {
  const id = (approval.master.values.id ?? '').trim();
  const hindiRow = hindiById.get(id);
  if (hindiRow === undefined) {
    errors.push(`${approval.label} (${id}): no row in the Hindi sheet; export a fresh Hindi sheet`);
    return;
  }

  const stored = (hindiRow.values.content_hash ?? '').trim();
  const masterHash = contentHash(approval.master.values, HINDI_CONTENT_COLUMNS);
  if (stored !== '' && stored !== masterHash) {
    errors.push(
      `Hindi line ${hindiRow.line} (${id}): Hindi sheet no longer matches the master; export a fresh sheet`,
    );
  }

  const check = (hindiRow.values.hi_check ?? '').trim().toLowerCase();
  if (check !== 'ok') {
    errors.push(
      `Hindi line ${hindiRow.line} (${id}): hi_check must be ok before approval ` +
        `(got "${check === '' ? 'blank' : check}")`,
    );
  }
}

function requireColumns(table: CsvTable, columns: readonly string[], label: string): void {
  for (const column of columns) {
    if (!table.header.includes(column)) {
      throw new ContentError(`the ${label} is missing the "${column}" column`);
    }
  }
}

function parseDecision(raw: string): Decision | null {
  return (DECISIONS as readonly string[]).includes(raw) ? (raw as Decision) : null;
}

function formatErrors(errors: readonly string[]): string {
  const shown = errors.slice(0, 20);
  const more = errors.length > shown.length ? `\n… ${errors.length - shown.length} more` : '';
  return `cannot apply the review sheet:\n${shown.join('\n')}${more}`;
}
