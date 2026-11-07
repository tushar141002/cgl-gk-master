import {
  type OptionIndex,
  type Question as QuestionRecord,
  type QuestionSource,
  type SectionId,
} from '../../shared/contract';
import { Question } from '../../src/core/Question';
import type { CsvRow, CsvTable } from './csv';

/**
 * The master CSV schema (D-047).
 *
 * One row is one question. `source_url`, `status`, `difficulty` and
 * `verified_at` are workflow columns: the first is kept for verification and
 * never packed, the other three decide whether and how the question ships.
 */
export const COLUMNS = [
  'id',
  'v',
  'section',
  'subtopic',
  'source_type',
  'source_exam',
  'source_year',
  'source_shift',
  'source_date',
  'source_ca_month',
  'source_url',
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
  'answer',
  'difficulty',
  'image',
  'status',
  'verified_at',
] as const;

export type Column = (typeof COLUMNS)[number];
export type RowStatus = 'draft' | 'verified' | 'rejected';
export type Difficulty = 'easy' | 'medium' | 'hard';

/**
 * The three-level author estimate (D-049). The 200-point spread keeps all
 * three levels inside the default ±100 band around a new student at 1200.
 */
export const ELO_SEEDS: Readonly<Record<Difficulty, number>> = Object.freeze({
  easy: 1100,
  medium: 1200,
  hard: 1300,
});

/** Placeholder used so a draft's missing verifiedAt does not become an error. */
const DRAFT_STAMP = '1970-01-01T00:00:00.000Z';

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

export interface SubtopicProgress {
  readonly section: string;
  readonly verified: number;
  readonly draft: number;
  readonly rejected: number;
}

export interface CheckedRow {
  readonly line: number;
  readonly id: string;
  readonly section: string;
  readonly subtopic: string;
  readonly status: RowStatus;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  /** Only present for a verified row with no errors. */
  readonly question: Question | null;
}

export interface MasterReport {
  readonly rows: readonly CheckedRow[];
  readonly counts: Readonly<Record<RowStatus, number>>;
  /** Per-subtopic status counts, keyed by the pack slug. */
  readonly subtopics: Readonly<Record<string, SubtopicProgress>>;
  /** Flattened, line-prefixed; empty means the master can be built. */
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  /** Verified and valid, in file order. */
  readonly questions: readonly Question[];
}

interface RowDraft {
  line: number;
  id: string;
  section: string;
  subtopic: string;
  normalizedQuestion: string;
  status: RowStatus;
  errors: string[];
  warnings: string[];
  question: Question | null;
}

/**
 * Validate every row (D-047, D-048, D-049).
 *
 * A verified row is held to the full publish contract: English and Hindi,
 * four distinct options, a source URL, a difficulty and a verification time.
 * A draft or rejected row may be incomplete; its issues are warnings, so the
 * founder can keep work in progress in the same file. A blank id, an unknown
 * status or a duplicate id is always an error: none of them can be repaired by
 * marking the row verified.
 */
export function validateMaster(table: CsvTable): MasterReport {
  assertColumns(table.header);

  const drafts = table.rows.map((row) => inspectRow(row));
  markDuplicateIds(drafts);
  markDuplicateQuestions(drafts);

  const rows: CheckedRow[] = drafts.map((draft) => ({
    line: draft.line,
    id: draft.id,
    section: draft.section,
    subtopic: draft.subtopic,
    status: draft.status,
    errors: draft.errors,
    warnings: draft.warnings,
    question: draft.question,
  }));

  const counts: Record<RowStatus, number> = { verified: 0, draft: 0, rejected: 0 };
  const subtopics: Record<string, { section: string; verified: number; draft: number; rejected: number }> =
    {};
  for (const row of rows) {
    counts[row.status] += 1;
    if (row.subtopic === '') continue;
    const entry = (subtopics[row.subtopic] ??= {
      section: row.section,
      verified: 0,
      draft: 0,
      rejected: 0,
    });
    entry[row.status] += 1;
  }

  const errors = rows.flatMap((row) =>
    row.errors.map((message) => `line ${row.line}${row.id === '' ? '' : ` (${row.id})`}: ${message}`),
  );
  const warnings = rows.flatMap((row) =>
    row.warnings.map((message) => `line ${row.line}${row.id === '' ? '' : ` (${row.id})`}: ${message}`),
  );

  const questions = rows
    .filter((row) => row.status === 'verified' && row.question !== null)
    .map((row) => row.question!);

  return { rows, counts, subtopics, errors, warnings, questions };
}

function inspectRow(row: CsvRow): RowDraft {
  const id = value(row, 'id').trim();
  const rawStatus = value(row, 'status').trim().toLowerCase();
  const status = parseStatus(rawStatus);
  const errors: string[] = [];
  const warnings: string[] = [];

  const add = (message: string, forceError = false): void => {
    if (status === 'verified' || forceError) errors.push(message);
    else warnings.push(message);
  };

  if (id === '') errors.push('id must not be empty');
  if (status === null) {
    errors.push(`status must be draft, verified or rejected (got "${rawStatus}")`);
  }

  const resolvedStatus: RowStatus = status ?? 'draft';

  const rawV = value(row, 'v').trim();
  const v = rawV === '' ? 1 : parsePositiveInteger(rawV);
  if (v === null) add(`v must be a positive integer (got "${rawV}")`);

  const section = value(row, 'section').trim();
  const subtopic = value(row, 'subtopic').trim();

  const sourceType = value(row, 'source_type').trim();
  const exam = emptyToUndefined(value(row, 'source_exam'));
  const rawYear = value(row, 'source_year').trim();
  const year = rawYear === '' ? undefined : parseInteger(rawYear);
  if (year === null) add(`source_year must be an integer (got "${rawYear}")`);
  const shift = emptyToUndefined(value(row, 'source_shift'));
  const date = emptyToUndefined(value(row, 'source_date'));
  const caMonth = emptyToUndefined(value(row, 'source_ca_month'));

  const source: QuestionSource = {
    type: sourceType as QuestionSource['type'],
    ...(exam === undefined ? {} : { exam }),
    ...(year === null || year === undefined ? {} : { year }),
    ...(shift === undefined ? {} : { shift }),
    ...(date === undefined ? {} : { date }),
    ...(caMonth === undefined ? {} : { caMonth }),
  };

  const en = localized(row, 'en');
  const hiRaw = [
    'hi_q',
    'hi_option_a',
    'hi_option_b',
    'hi_option_c',
    'hi_option_d',
    'hi_explanation',
  ] as const;
  const hiEmpty = hiRaw.every((column) => value(row, column).trim() === '');
  const hi = hiEmpty ? null : localized(row, 'hi');

  const rawAnswer = value(row, 'answer').trim().toUpperCase();
  const answer = parseAnswer(rawAnswer);
  if (answer === null) add(`answer must be A, B, C or D (got "${rawAnswer}")`);

  const rawDifficulty = value(row, 'difficulty').trim().toLowerCase();
  const difficulty = parseDifficulty(rawDifficulty);
  if (rawDifficulty !== '' && difficulty === null) {
    add(`difficulty must be easy, medium or hard (got "${rawDifficulty}")`);
  }
  if (rawDifficulty === '') {
    add('difficulty is required before publishing');
  }

  const sourceUrl = value(row, 'source_url').trim();
  if (sourceUrl !== '' && !/^https:\/\/\S+$/.test(sourceUrl)) {
    add(`source_url must start with https:// (got "${sourceUrl}")`);
  }
  if (sourceUrl === '') {
    add('source_url is required before publishing');
  }

  const rawVerifiedAt = value(row, 'verified_at').trim();
  const verifiedAt = rawVerifiedAt === '' && resolvedStatus !== 'verified' ? DRAFT_STAMP : rawVerifiedAt;

  const image = emptyToUndefined(value(row, 'image'));

  const record: QuestionRecord = {
    id,
    v: v ?? 0,
    packId: subtopic,
    section: section as SectionId,
    subtopic,
    source,
    en,
    hi,
    answer: (answer ?? -1) as OptionIndex,
    eloSeed: difficulty === null ? ELO_SEEDS.medium : ELO_SEEDS[difficulty],
    ...(image === undefined ? {} : { image }),
    verifiedAt,
  };

  for (const issue of Question.issues(record)) {
    add(`${issue.field}: ${issue.message}`);
  }
  if (hi === null) {
    add('hi: translation required before publishing');
  }

  const question = resolvedStatus === 'verified' && errors.length === 0 ? Question.from(record) : null;

  return {
    line: row.line,
    id,
    section,
    subtopic,
    normalizedQuestion: normalizeQuestion(en.q),
    status: resolvedStatus,
    errors,
    warnings,
    question,
  };
}

function markDuplicateIds(drafts: RowDraft[]): void {
  const byId = new Map<string, RowDraft[]>();
  for (const draft of drafts) {
    if (draft.id === '') continue;
    const group = byId.get(draft.id);
    if (group === undefined) byId.set(draft.id, [draft]);
    else group.push(draft);
  }

  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    const lines = group.map((draft) => draft.line).join(', ');
    for (const draft of group) {
      draft.errors.push(`id "${id}" is used on lines ${lines}; ids are never reused`);
      draft.question = null;
    }
  }
}

/**
 * Two ids for the same English question waste a student's time and skew the
 * Elo estimate. Compare a lightly normalised question text: case, punctuation
 * and spacing must not hide a copy. A draft only warns so work in progress can
 * still validate; a verified duplicate is an error.
 */
function markDuplicateQuestions(drafts: RowDraft[]): void {
  const byQuestion = new Map<string, RowDraft[]>();
  for (const draft of drafts) {
    if (draft.normalizedQuestion === '') continue;
    const group = byQuestion.get(draft.normalizedQuestion);
    if (group === undefined) byQuestion.set(draft.normalizedQuestion, [draft]);
    else group.push(draft);
  }

  for (const group of byQuestion.values()) {
    if (group.length < 2) continue;
    const lines = group.map((draft) => draft.line).join(', ');
    const message = `the English question duplicates lines ${lines}; ask a distinct question or merge them`;
    for (const draft of group) {
      if (draft.status === 'verified') {
        draft.errors.push(message);
        draft.question = null;
      } else {
        draft.warnings.push(message);
      }
    }
  }
}

function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assertColumns(header: readonly string[]): void {
  const present = new Set(header);
  const missing = COLUMNS.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new ContentError(`the master is missing these columns: ${missing.join(', ')}`);
  }
}

function parseStatus(raw: string): RowStatus | null {
  if (raw === 'draft' || raw === 'verified' || raw === 'rejected') return raw;
  return null;
}

function parseDifficulty(raw: string): Difficulty | null {
  if (raw === 'easy' || raw === 'medium' || raw === 'hard') return raw;
  return null;
}

function parseAnswer(raw: string): OptionIndex | null {
  switch (raw) {
    case 'A':
      return 0;
    case 'B':
      return 1;
    case 'C':
      return 2;
    case 'D':
      return 3;
    default:
      return null;
  }
}

function parsePositiveInteger(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function parseInteger(raw: string): number | null {
  if (!/^-?\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function localized(row: CsvRow, prefix: 'en' | 'hi'): QuestionRecord['en'] {
  const text = (column: string): string => value(row, `${prefix}_${column}`).trim();
  return {
    q: text('q'),
    options: [text('option_a'), text('option_b'), text('option_c'), text('option_d')],
    explanation: text('explanation'),
  };
}

function value(row: CsvRow, column: string): string {
  return row.values[column] ?? '';
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
