import type { CsvRow, CsvTable } from './csv';
import { ContentError, validateMaster } from './master';

/**
 * Applies a filled review sheet to the master (D-079).
 *
 * Only `approve` and `reject` change the master; `fix` and a blank decision
 * leave the row alone, so an incomplete review never publishes anything. The
 * sheet must still match the master on the fields a reviewer saw; otherwise the
 * command refuses and asks for a fresh export instead of guessing.
 */
export type Decision = 'approve' | 'reject' | 'fix';

const DECISIONS: readonly Decision[] = ['approve', 'reject', 'fix'];
const REQUIRED_COLUMNS = ['id', 'status', 'answer', 'source_url', 'en_q', 'decision', 'note'] as const;

export interface PromoteOptions {
  /** ISO timestamp written to `verified_at` on approval. */
  readonly at: string;
  /** Apply only this sub-topic, so promotion stays incremental. */
  readonly subtopic?: string;
}

export interface PromoteSummary {
  readonly table: CsvTable;
  readonly approved: number;
  readonly rejected: number;
  readonly fix: readonly { readonly id: string; readonly note: string }[];
  readonly pending: number;
  /** Decisions for another sub-topic when `--subtopic` is set. */
  readonly ignored: number;
  /** Rows whose status actually moved. */
  readonly changed: number;
  readonly perSubtopic: Readonly<
    Record<string, { approved: number; rejected: number; fix: number; pending: number }>
  >;
}

export function promote(table: CsvTable, sheet: CsvTable, options: PromoteOptions): PromoteSummary {
  if (Number.isNaN(Date.parse(options.at))) {
    throw new ContentError(`--at must be an ISO timestamp (got "${options.at}")`);
  }
  for (const column of REQUIRED_COLUMNS) {
    if (!sheet.header.includes(column)) {
      throw new ContentError(`the review sheet is missing the "${column}" column`);
    }
  }
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
  const decisions: {
    readonly master: CsvRow;
    readonly decision: Decision | null;
    readonly note: string;
  }[] = [];
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

    for (const column of ['status', 'answer', 'source_url', 'en_q'] as const) {
      if ((row.values[column] ?? '').trim() !== (master.values[column] ?? '').trim()) {
        errors.push(`${label} (${id}): "${column}" no longer matches the master; export a fresh sheet`);
      }
    }

    decisions.push({ master, decision, note });
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
      if (next.status !== 'verified') {
        next.status = 'verified';
        next.verified_at = options.at;
        changed += 1;
      }
    } else if (decision === 'reject') {
      rejected += 1;
      counts.rejected += 1;
      if (next.status !== 'rejected') {
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

function parseDecision(raw: string): Decision | null {
  return (DECISIONS as readonly string[]).includes(raw) ? (raw as Decision) : null;
}

function formatErrors(errors: readonly string[]): string {
  const shown = errors.slice(0, 20);
  const more = errors.length > shown.length ? `\n… ${errors.length - shown.length} more` : '';
  return `cannot apply the review sheet:\n${shown.join('\n')}${more}`;
}
