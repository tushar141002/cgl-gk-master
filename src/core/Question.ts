import {
  OPTION_COUNT,
  SECTION_IDS,
  type LocalizedText,
  type OptionIndex,
  type Question as QuestionRecord,
  type QuestionId,
  type QuestionSource,
} from '../../shared/contract';
import { DEFAULT_ELO } from './EloRating';

export type Language = 'en' | 'hi';

export interface QuestionIssue {
  readonly field: string;
  readonly message: string;
}

/** Thrown by `Question.from`; carries every problem, not just the first. */
export class QuestionValidationError extends Error {
  readonly issues: readonly QuestionIssue[];

  constructor(issues: readonly QuestionIssue[]) {
    super(`invalid question: ${issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ')}`);
    this.name = 'QuestionValidationError';
    this.issues = issues;
  }
}

/**
 * An immutable value object over a published `Question` record.
 *
 * The record shape lives once, in `shared/contract.ts`; this class adds the
 * runtime checks a signed pack needs (the type system does not validate JSON
 * from a CDN), answer checking and the bilingual fallback. It performs no I/O,
 * so the content pipeline and the app run the same rules (D-030).
 *
 * `hi` may be null while drafting. Whether a published pack is allowed to
 * contain a null translation is a pipeline rule, enforced by the build (D-019).
 */
export class Question {
  private constructor(private readonly data: QuestionRecord) {}

  /** Validate and wrap a record. Throws `QuestionValidationError` on any issue. */
  static from(record: QuestionRecord): Question {
    const issues = Question.issues(record);
    if (issues.length > 0) throw new QuestionValidationError(issues);
    return new Question(record);
  }

  /** Every problem in the record, so an import can report them all at once. */
  static issues(record: QuestionRecord): readonly QuestionIssue[] {
    const issues: QuestionIssue[] = [];

    assertSlug(record.id, 'id', issues);
    if (!Number.isInteger(record.v) || record.v < 1) {
      add(issues, 'v', `must be a positive integer (got ${String(record.v)})`);
    }
    assertSlug(record.packId, 'packId', issues);
    if (!SECTION_IDS.includes(record.section)) {
      add(issues, 'section', `unknown section "${String(record.section)}"`);
    }
    assertSlug(record.subtopic, 'subtopic', issues);

    validateSource(record.source, issues);
    validateText(record.en, 'en', issues);
    if (record.hi !== null) validateText(record.hi, 'hi', issues);

    if (record.answer !== 0 && record.answer !== 1 && record.answer !== 2 && record.answer !== 3) {
      add(issues, 'answer', `must be 0-3 (got ${String(record.answer)})`);
    }

    if (!Number.isFinite(record.eloSeed)) {
      add(issues, 'eloSeed', `must be finite (got ${String(record.eloSeed)})`);
    } else if (record.eloSeed < DEFAULT_ELO.minRating || record.eloSeed > DEFAULT_ELO.maxRating) {
      add(
        issues,
        'eloSeed',
        `must be ${DEFAULT_ELO.minRating}-${DEFAULT_ELO.maxRating} (got ${String(record.eloSeed)})`,
      );
    }

    if (record.image !== undefined) {
      if (typeof record.image !== 'string' || record.image.trim().length === 0) {
        add(issues, 'image', 'must be a non-empty string when present');
      }
    }

    assertTimestamp(record.verifiedAt, 'verifiedAt', issues);

    return issues;
  }

  get record(): QuestionRecord {
    return this.data;
  }

  get id(): QuestionId {
    return this.data.id;
  }

  /** Canonical option order, so a tap index is directly comparable (D-032). */
  isCorrect(chosen: OptionIndex | null): boolean {
    return chosen !== null && chosen === this.data.answer;
  }

  /** The requested language, falling back to English while Hindi is missing. */
  localized(language: Language): LocalizedText {
    return language === 'hi' ? (this.data.hi ?? this.data.en) : this.data.en;
  }

  toJSON(): QuestionRecord {
    return this.data;
  }
}

function validateSource(source: QuestionSource, issues: QuestionIssue[]): void {
  if (source === null || typeof source !== 'object') {
    add(issues, 'source', 'must be an object');
    return;
  }

  if (source.type !== 'PYQ' && source.type !== 'CA' && source.type !== 'practice') {
    add(issues, 'source.type', `must be PYQ, CA or practice (got ${String(source.type)})`);
    return;
  }

  if (source.type === 'PYQ') {
    if (!isNonEmpty(source.exam)) add(issues, 'source.exam', 'is required for a PYQ');
    if (source.year === undefined) add(issues, 'source.year', 'is required for a PYQ');
  }
  if (source.type === 'CA' && source.caMonth === undefined) {
    add(issues, 'source.caMonth', 'is required for a current-affairs question');
  }

  if (source.exam !== undefined && !isNonEmpty(source.exam)) {
    add(issues, 'source.exam', 'must be a non-empty string');
  }
  if (source.shift !== undefined && !isNonEmpty(source.shift)) {
    add(issues, 'source.shift', 'must be a non-empty string');
  }
  if (source.year !== undefined) {
    if (!Number.isInteger(source.year) || source.year < 1950 || source.year > 2100) {
      add(issues, 'source.year', `must be an integer 1950-2100 (got ${String(source.year)})`);
    }
  }
  if (source.date !== undefined && !isDayKey(source.date)) {
    add(issues, 'source.date', `must be a real YYYY-MM-DD date (got "${String(source.date)}")`);
  }
  if (source.caMonth !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(source.caMonth)) {
    add(issues, 'source.caMonth', `must be YYYY-MM (got "${String(source.caMonth)}")`);
  }
}

function validateText(text: LocalizedText, prefix: string, issues: QuestionIssue[]): void {
  if (text === null || typeof text !== 'object') {
    add(issues, prefix, 'must be an object');
    return;
  }

  if (!isNonEmpty(text.q)) add(issues, `${prefix}.q`, 'must be a non-empty string');

  if (!Array.isArray(text.options) || text.options.length !== OPTION_COUNT) {
    add(issues, `${prefix}.options`, `must have exactly ${OPTION_COUNT} entries`);
  } else {
    const seen = new Set<string>();
    text.options.forEach((option, index) => {
      const field = `${prefix}.options[${index}]`;
      if (!isNonEmpty(option)) {
        add(issues, field, 'must be a non-empty string');
        return;
      }
      const key = option.trim();
      if (seen.has(key)) add(issues, field, 'duplicates another option');
      seen.add(key);
    });
  }

  if (!isNonEmpty(text.explanation)) {
    add(issues, `${prefix}.explanation`, 'must be a non-empty string');
  }
}

function assertSlug(value: string, field: string, issues: QuestionIssue[]): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 80) {
    add(issues, field, 'must be a non-empty slug of at most 80 characters');
    return;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    add(issues, field, `must be a lowercase slug such as "polity-fr-0007" (got "${value}")`);
  }
}

function assertTimestamp(value: string, field: string, issues: QuestionIssue[]): void {
  if (!isNonEmpty(value) || Number.isNaN(Date.parse(value))) {
    add(issues, field, `must be an ISO timestamp (got "${String(value)}")`);
  }
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Reject impossible dates such as `2026-02-30`, which `Date.parse` rolls over. */
function isDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const midnight = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(midnight) && new Date(midnight).toISOString().slice(0, 10) === value;
}

function add(issues: QuestionIssue[], field: string, message: string): void {
  issues.push({ field, message });
}
